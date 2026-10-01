// Google Calendar for the Rev dashboard.
// Keeps a Google refresh token server-side so the dashboard never has to log in to Google again.
// Actions (POST, signed-in owner only): status, setup, start, events, disconnect.
// GET ?code=&state= is Google's redirect back after you approve access.
import postgres from "npm:postgres@3.4.4";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const OWNER = "ant@revbbc.com.au";
const CLIENT_ID = "129633223960-8ebr601nsaapd8ojbloivi83k1tbitl6.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly openid email";
const APP = "https://ant839.github.io/dashboard/dashboard.html";
const SELF = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gcal`;

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const back = (q: string) => new Response(null, { status: 302, headers: { Location: `${APP}?gcal=${q}` } });

async function row() {
  const r = await sql`select * from private.gcal where id = 1`;
  return r[0] ?? null;
}
const secret = async () => Deno.env.get("GOOGLE_CLIENT_SECRET") || (await row())?.client_secret || null;

async function owner(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data } = await sb.auth.getUser(auth.slice(7));
  return data.user?.email?.toLowerCase() === OWNER;
}

async function accessToken(): Promise<string | null> {
  const r = await row();
  if (!r?.refresh_token) return null;
  if (r.access_token && r.access_expires && new Date(r.access_expires).getTime() > Date.now() + 60_000) return r.access_token;
  const cs = await secret();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: cs ?? "", refresh_token: r.refresh_token, grant_type: "refresh_token" }),
  });
  const t = await res.json();
  if (!res.ok) {
    if (t.error === "invalid_grant") await sql`update private.gcal set refresh_token = null, access_token = null, access_expires = null where id = 1`;
    throw new Error("refresh_failed:" + (t.error || res.status));
  }
  const exp = new Date(Date.now() + (t.expires_in ?? 3600) * 1000);
  await sql`update private.gcal set access_token = ${t.access_token}, access_expires = ${exp}, updated_at = now() where id = 1`;
  return t.access_token;
}

async function callback(url: URL) {
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("cancelled");
  if (!code || !state) return back("error");
  const ok = await sql`delete from private.gcal_state where state = ${state} and created_at > now() - interval '20 minutes' returning state`;
  if (!ok.length) return back("expired");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: (await secret()) ?? "", redirect_uri: SELF, grant_type: "authorization_code" }),
  });
  const t = await res.json();
  if (!res.ok || !t.refresh_token) { console.error("token exchange", t); return back(t.refresh_token ? "error" : "norefresh"); }
  let email: string | null = null;
  try { email = JSON.parse(atob(t.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? null; } catch { /* optional */ }
  const exp = new Date(Date.now() + (t.expires_in ?? 3600) * 1000);
  await sql`insert into private.gcal (id, refresh_token, access_token, access_expires, google_email, updated_at)
            values (1, ${t.refresh_token}, ${t.access_token}, ${exp}, ${email}, now())
            on conflict (id) do update set refresh_token = excluded.refresh_token, access_token = excluded.access_token,
              access_expires = excluded.access_expires, google_email = excluded.google_email, updated_at = now()`;
  return back("connected");
}

async function events(timeMin: string, timeMax: string) {
  const tok = await accessToken();
  if (!tok) return json({ connected: false, events: [] });
  const h = { Authorization: `Bearer ${tok}` };
  const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers: h });
  if (!listRes.ok) return json({ connected: true, error: "calendar_list_" + listRes.status, events: [] }, 502);
  const list = await listRes.json();
  const cals = (list.items ?? []).filter((c: any) => c.selected !== false);
  const all = await Promise.all(cals.map(async (cal: any) => {
    const u = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?` +
      new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    try {
      const r = await fetch(u, { headers: h });
      const d = await r.json();
      return (d.items ?? []).map((ev: any) => ({
        id: ev.id, summary: ev.summary, start: ev.start, end: ev.end, location: ev.location,
        status: ev.status, htmlLink: ev.htmlLink, colorId: ev.colorId, _calColor: cal.backgroundColor, _cal: cal.summary,
      }));
    } catch { return []; }
  }));
  return json({ connected: true, events: all.flat() });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET") return await callback(url);
    if (!(await owner(req))) return json({ error: "not_allowed" }, 401);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "status": {
        const r = await row();
        return json({ connected: !!r?.refresh_token, hasSecret: !!(await secret()), email: r?.google_email ?? null });
      }
      case "setup": {
        const s = String(body.client_secret ?? "").trim();
        if (s.length < 10) return json({ error: "That doesn't look like a client secret." }, 400);
        await sql`insert into private.gcal (id, client_secret) values (1, ${s}) on conflict (id) do update set client_secret = excluded.client_secret, updated_at = now()`;
        return json({ ok: true });
      }
      case "start": {
        if (!(await secret())) return json({ error: "no_secret" }, 400);
        const state = crypto.randomUUID();
        await sql`delete from private.gcal_state where created_at < now() - interval '1 hour'`;
        await sql`insert into private.gcal_state (state) values (${state})`;
        const auth = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
          client_id: CLIENT_ID, redirect_uri: SELF, response_type: "code", scope: SCOPE,
          access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, login_hint: body.login_hint ?? "",
        });
        return json({ url: auth });
      }
      case "events":
        return await events(String(body.timeMin), String(body.timeMax));
      case "disconnect": {
        const r = await row();
        if (r?.refresh_token) await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(r.refresh_token), { method: "POST" }).catch(() => {});
        await sql`update private.gcal set refresh_token = null, access_token = null, access_expires = null, google_email = null where id = 1`;
        return json({ ok: true });
      }
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error(e);
    const msg = String((e as Error).message || e);
    return json({ error: msg.startsWith("refresh_failed") ? "reconnect" : "server_error", detail: msg }, 500);
  }
});
