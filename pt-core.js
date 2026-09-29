/* Shared PT logic: loading clients and sessions, working out where each client is up to, and ticking sessions. */
(function () {
  const PLAN_LABEL = { weekly: 'Weekly', fortnightly: 'Fortnightly', period: 'Time period', pack: 'Session pack' };
  const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseD = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (s, n) => { const d = parseD(s) || today(); d.setDate(d.getDate() + n); return iso(d); };
  const addMonths = (s, n) => { const d = parseD(s) || today(); const day = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day) d.setDate(0); else d.setDate(d.getDate() - 1); return iso(d); };
  const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
  const weekday = s => ((parseD(s).getDay() + 6) % 7) + 1; /* 1 = Monday */
  const weekStart = s => { const d = parseD(s); d.setDate(d.getDate() - (weekday(s) - 1)); return iso(d); };
  const fmt = (s, opts) => parseD(s).toLocaleDateString('en-AU', opts || { day: 'numeric', month: 'short' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = { clients: [], sessions: [], orders: [] };

  async function load(sinceDays = 400) {
    const since = addDays(iso(today()), -sinceDays);
    const [c, s, o] = await Promise.all([
      sb.from('pt_clients').select('*'),
      sb.from('pt_sessions').select('id,client_id,day,created_at,status,moved_to').gte('day', since),
      sb.from('pt_day_order').select('day,ids').gte('day', addDays(iso(today()), -120))
    ]);
    if (c.error || s.error) throw (c.error || s.error);
    store.clients = c.data || []; store.sessions = s.data || []; store.orders = (o && !o.error && o.data) || [];
    return store;
  }

  const isDone = x => x.status !== 'skipped' && x.status !== 'moved';
  const sessionsOf = (id) => store.sessions.filter(x => x.client_id === id && isDone(x));
  const hasSession = (id, day) => store.sessions.some(x => x.client_id === id && x.day === day && isDone(x));
  const isSkipped = (id, day) => store.sessions.some(x => x.client_id === id && x.day === day && x.status === 'skipped');
  /* Moved sessions: a 'moved' row sits on the original day and points at the new day. */
  const movedRow = (id, day) => store.sessions.find(x => x.client_id === id && x.day === day && x.status === 'moved');
  const movedTo = (id, day) => (movedRow(id, day) || {}).moved_to || null;
  const movedFrom = (id, day) => (store.sessions.find(x => x.client_id === id && x.status === 'moved' && x.moved_to === day) || {}).day || null;
  const skipsIn = (id, from, to) => store.sessions.filter(x => x.client_id === id && x.status === 'skipped' && x.day >= from && x.day <= to).length;

  /* Fortnightly: period_start is any one payment date; they pay every 14 days from it. */
  /* The fortnight anchor, moved onto their pay day within the same week if one is set. */
  const anchorFor = c => !c.period_start ? null : c.pay_day ? addDays(weekStart(c.period_start), c.pay_day - 1) : c.period_start;
  const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const payDayName = c => c.pay_day ? DAY_SHORT[c.pay_day - 1] : '';
  function fortnightPayIn(c, from, to) {
    const a = anchorFor(c); if (!a) return null;
    const k = Math.ceil(daysBetween(a, from) / 14);
    const d = addDays(a, k * 14);
    return d <= to ? d : null;
  }
  const nextFortnightPay = (c, onDay) => fortnightPayIn(c, onDay || iso(today()), '9999-12-31');

  /* Where a client is up to. level: ok | warn | bad */
  function status(c, onDay) {
    const ref = onDay || iso(today());
    const mine = sessionsOf(c.id);
    if (c.plan === 'weekly') {
      const ws = weekStart(ref), we = addDays(ws, 6);
      const n = mine.filter(x => x.day >= ws && x.day <= we).length;
      const target = c.sessions_per_week || 0;
      return { level: 'ok', line: (target ? `${n}/${target} this week` : `${n} this week`) + (c.pay_day ? ` · pays ${DAY_LONG[c.pay_day - 1]}s` : ''), used: n, total: target, pct: target ? Math.min(100, Math.round(n / target * 100)) : 0 };
    }
    if (c.plan === 'fortnightly') {
      const ws = weekStart(ref), we = addDays(ws, 6);
      const n = mine.filter(x => x.day >= ws && x.day <= we).length;
      const nx = nextFortnightPay(c, ref);
      return { level: c.period_start ? 'ok' : 'warn', line: `${n} this week · ${nx ? (nx === ref ? 'pays today' : 'pays ' + fmt(nx)) : 'payment date not set'}`, used: n, total: c.sessions_per_week || 0, pct: 0 };
    }
    const start = c.period_start || '0000-01-01';
    const used = mine.filter(x => x.day >= start).length + (c.prior_sessions || 0);
    const left = c.period_end ? daysBetween(ref, c.period_end) : null;
    const endTxt = c.period_end ? (left < 0 ? `ended ${fmt(c.period_end)}` : left === 0 ? 'ends today' : `ends ${fmt(c.period_end)}`) : 'no end date';
    if (c.plan === 'period') {
      const level = left === null ? 'ok' : left < 0 ? 'bad' : left <= 7 ? 'warn' : 'ok';
      const span = c.period_start && c.period_end ? daysBetween(c.period_start, c.period_end) || 1 : 0;
      const pct = span ? Math.max(0, Math.min(100, Math.round(daysBetween(c.period_start, ref) / span * 100))) : 0;
      return { level, line: `${used} session${used === 1 ? '' : 's'} · ${endTxt}${left > 0 && left <= 14 ? ` (${left} days)` : ''}`, used, total: 0, pct, daysLeft: left };
    }
    if (!c.pack_size) return { level: 'warn', line: `${used} used · pack size not set`, used, total: 0, remaining: null, pct: 0, daysLeft: left };
    const size = c.pack_size, rem = size - used;
    let level = 'ok';
    if (rem <= 0 || (left !== null && left < 0)) level = 'bad'; else if (rem <= 2 || (left !== null && left <= 7)) level = 'warn';
    return { level, line: `${used}/${size} used · ${rem <= 0 ? 'pack finished' : rem + ' left'}${c.period_end ? ' · ' + endTxt : ''}`, used, total: size, remaining: rem, pct: size ? Math.min(100, Math.round(used / size * 100)) : 0, daysLeft: left };
  }

  function scheduledOn(day) {
    const wd = weekday(day);
    const inIds = new Set(store.sessions.filter(x => x.status === 'moved' && x.moved_to === day).map(x => x.client_id));
    return store.clients.filter(c => (c.active && (c.days || []).includes(wd)) || inIds.has(c.id));
  }
  function trainedOn(day) {
    const ids = new Set(store.sessions.filter(x => x.day === day && isDone(x)).map(x => x.client_id));
    return store.clients.filter(c => ids.has(c.id));
  }
  function needsAttention() {
    return store.clients.filter(c => c.active && (c.plan === 'period' || c.plan === 'pack')).map(c => ({ c, s: status(c) })).filter(x => x.s.level !== 'ok')
      .sort((a, b) => (a.s.level === 'bad' ? 0 : 1) - (b.s.level === 'bad' ? 0 : 1) || a.c.name.localeCompare(b.c.name));
  }


  /* Weekly clients: their weekly total (set directly, or sessions x price for older entries) and the share per session. */
  const weekAmount = c => c.price_week != null ? Number(c.price_week) : (c.sessions_per_week || (c.days || []).length || 0) * Number(c.price_session || 0);
  const perSession = c => { const n = c.sessions_per_week || (c.days || []).length || 1; return weekAmount(c) / n; };
  const money = n => '$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  /* Weekly clients this week: earned from ticked sessions, and expected from their usual sessions per week. */
  function weeklyIncome(onDay) {
    const ref = onDay || iso(today()), ws = weekStart(ref), we = addDays(ws, 6);
    let earned = 0, expected = 0, priced = 0;
    store.clients.filter(c => c.active && c.plan === 'weekly').forEach(c => {
      const wk = weekAmount(c); if (!wk) return; priced++;
      const amt = Math.max(0, wk - skipsIn(c.id, ws, we) * perSession(c));
      expected += amt;
      if (c.pay_day) { if (addDays(ws, c.pay_day - 1) <= ref) earned += amt; }
      else earned += Math.min(amt, store.sessions.filter(x => x.client_id === c.id && isDone(x) && x.day >= ws && x.day <= we).length * perSession(c));
    });
    store.clients.filter(c => c.active && c.plan === 'fortnightly').forEach(c => {
      const amt = Number(c.price_package || 0), d = fortnightPayIn(c, ws, we); if (!amt) return; priced++;
      if (d) { expected += amt; if (d <= ref) earned += amt; }
    });
    return { earned, expected, priced };
  }

  /* Roughly when a package client pays next: the day after their period or pack ends,
     or sooner if a pack will run out of sessions first at their usual pace. */
  function nextPayment(c) {
    if (!c.active || c.plan === 'weekly' || c.plan === 'fortnightly') return null;
    const t = iso(today());
    let date = c.period_end ? addDays(c.period_end, 1) : null, why = c.period_end ? `${c.plan === 'pack' ? 'pack' : 'period'} ends ${fmt(c.period_end)}` : '', estimate = false;
    if (c.plan === 'pack') {
      const s = status(c), rate = c.sessions_per_week || (c.days || []).length;
      if (s.remaining === null) { /* size unknown: fall back to end date only */ }
      else if (s.remaining <= 0) { date = t; why = 'pack finished'; }
      else if (rate) {
        const proj = addDays(t, Math.ceil(s.remaining / rate * 7));
        if (!date || proj < date) { date = proj; why = `${s.remaining} left at ${rate} a week`; estimate = true; }
      }
    }
    if (!date) return null;
    if (date < t) { why = 'overdue · ' + why; }
    return { date, amount: c.price_package != null ? Number(c.price_package) : null, why, estimate };
  }
  function upcomingPayments() {
    return store.clients.map(c => ({ c, n: nextPayment(c) })).filter(x => x.n).sort((a, b) => a.n.date.localeCompare(b.n.date));
  }

  /* Everything expected to come in during the Mon-Sun week containing `anyDay`. */
  function weekForecast(anyDay) {
    const ws = weekStart(anyDay), we = addDays(ws, 6), items = [];
    store.clients.filter(c => c.active).forEach(c => {
      if (c.plan === 'weekly') {
        const wk = weekAmount(c), sk = skipsIn(c.id, ws, we), amt = Math.max(0, wk - sk * perSession(c));
        const pd = c.pay_day ? addDays(ws, c.pay_day - 1) : null;
        items.push({ c, kind: 'Weekly', amount: amt, note: (wk ? `${money(wk)}/wk` : 'no amount set') + (sk ? ` · ${sk} skipped` : '') + (pd ? ` · pays ${fmt(pd, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''), date: pd });
      } else if (c.plan === 'fortnightly') {
        const d = fortnightPayIn(c, ws, we);
        if (d) items.push({ c, kind: 'Fortnightly', amount: Number(c.price_package || 0), note: 'pays ' + fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }), date: d });
      } else {
        const n = nextPayment(c);
        if (n && ((n.date >= ws && n.date <= we) || (ws <= iso(today()) && n.date < ws))) items.push({ c, kind: c.plan === 'pack' ? 'Pack renewal' : 'Period renewal', amount: n.amount || 0, note: (n.estimate ? 'about ' : '') + fmt(n.date, { weekday: 'short', day: 'numeric', month: 'short' }) + (n.amount == null ? ' · no price set' : ''), date: n.date });
      }
    });
    /* weekly clients first, biggest earners at the top; then everything else by payment date */
    items.sort((a, b) => ((a.kind === 'Weekly') === (b.kind === 'Weekly') ? 0 : a.kind === 'Weekly' ? -1 : 1)
      || (a.kind === 'Weekly' ? b.amount - a.amount : (a.date || '9999').localeCompare(b.date || '9999'))
      || a.c.name.localeCompare(b.c.name));
    return { ws, we, items, total: items.reduce((s, x) => s + x.amount, 0) };
  }

  /* Running order for a day: the order saved for that date, else the latest saved order for the
     same weekday before it, else alphabetical. Anyone not in the saved order goes after, A to Z. */
  function orderFor(day) {
    const exact = store.orders.find(o => o.day === day);
    if (exact) return exact.ids;
    const wd = weekday(day);
    const prev = store.orders.filter(o => o.day < day && weekday(o.day) === wd).sort((a, b) => b.day.localeCompare(a.day))[0];
    return prev ? prev.ids : [];
  }
  function sortForDay(list, day) {
    const ids = orderFor(day), pos = id => { const i = ids.indexOf(id); return i < 0 ? 1e6 : i; };
    return [...list].sort((a, b) => pos(a.id) - pos(b.id) || a.name.localeCompare(b.name));
  }
  async function saveDayOrder(day, ids) {
    const row = { day, ids, updated_at: new Date().toISOString() };
    const i = store.orders.findIndex(o => o.day === day);
    if (i < 0) store.orders.push(row); else store.orders[i] = row;
    const { error } = await sb.from('pt_day_order').upsert(row);
    if (error) throw error;
  }

  async function clearSkip(clientId, day) {
    const ids = store.sessions.filter(x => x.client_id === clientId && x.day === day && x.status === 'skipped').map(x => x.id);
    if (!ids.length) return;
    const { error } = await sb.from('pt_sessions').delete().in('id', ids);
    if (error) throw error;
    store.sessions = store.sessions.filter(x => !ids.includes(x.id));
  }
  async function clearMove(clientId, day) {
    const ids = store.sessions.filter(x => x.client_id === clientId && x.day === day && x.status === 'moved').map(x => x.id);
    if (!ids.length) return;
    const { error } = await sb.from('pt_sessions').delete().in('id', ids);
    if (error) throw error;
    store.sessions = store.sessions.filter(x => !ids.includes(x.id));
  }
  async function move(clientId, from, to) {
    const done = store.sessions.filter(x => x.client_id === clientId && x.day === from && isDone(x)).map(x => x.id);
    if (done.length) { const r = await sb.from('pt_sessions').delete().in('id', done); if (r.error) throw r.error; store.sessions = store.sessions.filter(x => !done.includes(x.id)); }
    await clearSkip(clientId, from); await clearMove(clientId, from);
    if (to === from) return;
    const { data, error } = await sb.from('pt_sessions').insert({ client_id: clientId, day: from, status: 'moved', moved_to: to }).select('id,client_id,day,created_at,status,moved_to').single();
    if (error) throw error;
    store.sessions.push(data);
  }
  const unmove = clearMove;

  /* A small sheet to pick the new day: quick chips for the week around, or any date. Resolves to a date or null. */
  function pickMoveDay(c, from) {
    return new Promise(resolve => {
      if (!document.getElementById('ptmv-css')) {
        const st = document.createElement('style'); st.id = 'ptmv-css';
        st.textContent = `.ptmv{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.55);display:grid;place-items:end center;padding:16px}
@media(min-width:600px){.ptmv{place-items:center}}
.ptmv-card{width:min(380px,100%);background:var(--surface,#161618);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:14px;padding:18px;display:grid;gap:12px;margin-bottom:env(safe-area-inset-bottom,0px)}
.ptmv h3{margin:0;font-size:16px;font-weight:500}.ptmv p{margin:0;font-size:12px;color:var(--muted,#888884)}
.ptmv-days{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.ptmv-days button{background:var(--bg,#0e0e0f);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:8px;color:var(--text,#f0efe8);padding:8px 4px;font-size:12px;line-height:1.3;cursor:pointer}
.ptmv-days button:hover{border-color:var(--accent,#c8f06a)}.ptmv-days button small{display:block;color:var(--muted,#888884);font-size:10px}
.ptmv-days button.usual{border-color:rgba(200,240,106,.35)}
.ptmv-row{display:flex;gap:8px;align-items:center}.ptmv-row input{flex:1;padding:8px 10px;background:var(--bg,#0e0e0f);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:8px;color:var(--text,#f0efe8);font-size:14px;color-scheme:dark}
.ptmv-row button,.ptmv-x{background:var(--accent,#c8f06a);color:#000;border:0;border-radius:8px;padding:9px 14px;font-weight:600;font-size:13px;cursor:pointer}
.ptmv-x{background:none;color:var(--muted,#888884);font-weight:500}`;
        document.head.appendChild(st);
      }
      const opts = [];
      for (let i = -2; i <= 7; i++) { if (i === 0) continue; const d = addDays(from, i); if (d >= iso(today()) || i > 0) opts.push(d); }
      const el = document.createElement('div'); el.className = 'ptmv';
      el.innerHTML = `<div class="ptmv-card" role="dialog" aria-label="Move session">
        <h3>Move ${esc(c.name)}'s session</h3><p>From ${fmt(from, { weekday: 'long', day: 'numeric', month: 'short' })}. Pick the new day.</p>
        <div class="ptmv-days">${opts.slice(0, 8).map(d => `<button type="button" data-d="${d}"${(c.days || []).includes(weekday(d)) ? ' class="usual" title="Already one of their days"' : ''}>${fmt(d, { weekday: 'short' })}<small>${fmt(d)}</small></button>`).join('')}</div>
        <div class="ptmv-row"><input type="date" value="${addDays(from, 1)}" aria-label="Other date"><button type="button" data-pick>Move</button></div>
        <button type="button" class="ptmv-x">Cancel</button></div>`;
      document.body.appendChild(el);
      const done = v => { el.remove(); resolve(v); };
      el.addEventListener('click', e => {
        if (e.target === el || e.target.closest('.ptmv-x')) return done(null);
        const b = e.target.closest('[data-d]'); if (b) return done(b.dataset.d);
        if (e.target.closest('[data-pick]')) { const v = el.querySelector('input').value; if (v && v !== from) done(v); }
      });
    });
  }

  async function tick(clientId, day) {
    await clearSkip(clientId, day); await clearMove(clientId, day);
    const { data, error } = await sb.from('pt_sessions').insert({ client_id: clientId, day }).select('id,client_id,day,created_at,status').single();
    if (error) throw error;
    store.sessions.push(data); return data;
  }
  async function skip(clientId, day) {
    await clearMove(clientId, day);
    const done = store.sessions.filter(x => x.client_id === clientId && x.day === day && isDone(x)).map(x => x.id);
    if (done.length) { const r = await sb.from('pt_sessions').delete().in('id', done); if (r.error) throw r.error; store.sessions = store.sessions.filter(x => !done.includes(x.id)); }
    if (isSkipped(clientId, day)) return;
    const { data, error } = await sb.from('pt_sessions').insert({ client_id: clientId, day, status: 'skipped' }).select('id,client_id,day,created_at,status').single();
    if (error) throw error;
    store.sessions.push(data);
  }
  const unskip = clearSkip;
  async function untick(clientId, day) {
    const s = store.sessions.filter(x => x.client_id === clientId && x.day === day && isDone(x)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!s) return;
    const { error } = await sb.from('pt_sessions').delete().eq('id', s.id);
    if (error) throw error;
    store.sessions = store.sessions.filter(x => x.id !== s.id);
  }
  async function removeSession(id) {
    const { error } = await sb.from('pt_sessions').delete().eq('id', id);
    if (error) throw error;
    store.sessions = store.sessions.filter(x => x.id !== id);
  }
  function subscribe(onChange) {
    return sb.channel('pt-live-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pt_clients' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pt_sessions' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pt_day_order' }, onChange)
      .subscribe();
  }

  window.PT = { sortForDay, saveDayOrder, move, unmove, movedTo, movedFrom, pickMoveDay, weekAmount, perSession, DAY_LONG, payDayName, anchorFor, isSkipped, skip, unskip, skipsIn, weekForecast, nextFortnightPay, fortnightPayIn, money, weeklyIncome, nextPayment, upcomingPayments, PLAN_LABEL, DAY_SHORT, store, load, status, sessionsOf, hasSession, scheduledOn, trainedOn, needsAttention, tick, untick, removeSession, subscribe,
    iso, parseD, today, addDays, addMonths, daysBetween, weekday, weekStart, fmt, esc };
})();
