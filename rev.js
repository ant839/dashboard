/* Rev dashboard shared setup: database connection, login and the tab bar.
   The publishable key below is meant to be public. Access to data is locked
   in the database itself to Ant's login, so this key alone reads nothing. */
(function () {
  const SUPABASE_URL = 'https://awlsihvkilojotibqljs.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_dlR5d1x59oqrsdcm9uxOBA_rnGlU8kb';
  const OWNER_EMAIL = 'ant@revbbc.com.au';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.sb = sb;

  const TABS = [
    { href: 'dashboard.html', label: 'Today' },
    { href: 'athletes.html', label: 'Athletes' },
    { href: 'pt.html', label: 'PT' }
  ];

  const css = `
  [hidden]{display:none!important}
  .rev-nav{display:flex;align-items:center;gap:4px;margin:0 0 18px;border-bottom:1px solid var(--border,rgba(255,255,255,.07));overflow-x:auto}
  .rev-nav a{padding:9px 14px;font-size:13px;font-weight:500;color:var(--muted,#888884);text-decoration:none;border-bottom:2px solid transparent;white-space:nowrap}
  .rev-nav a:hover{color:var(--text,#f0efe8)}
  .rev-nav a.on{color:var(--text,#f0efe8);border-bottom-color:var(--accent,#c8f06a)}
  .rev-nav .rev-out{margin-left:auto;background:none;border:0;color:var(--dim,#4a4a48);font-size:12px;cursor:pointer;padding:9px 6px;white-space:nowrap}
  .rev-nav .rev-out:hover{color:var(--red,#ff5a5a)}
  .rev-login{position:fixed;inset:0;display:grid;place-items:center;padding:20px;background:var(--bg,#0e0e0f);z-index:100}
  .rev-login form{width:min(360px,100%);background:var(--surface,#161618);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:12px;padding:24px;display:grid;gap:14px}
  .rev-login h1{font-size:22px;font-weight:300;letter-spacing:-.01em;margin:0}
  .rev-login p{font-size:13px;color:var(--muted,#888884);line-height:1.5;margin:0}
  .rev-login input{width:100%;padding:10px 12px;font-size:15px}
  .rev-login button{background:var(--accent,#c8f06a);color:#000;border:0;border-radius:6px;padding:10px;font-weight:600;font-size:14px;cursor:pointer}
  .rev-login button:disabled{opacity:.5;cursor:default}
  .rev-login .msg{font-size:13px;color:var(--accent,#c8f06a)}
  .rev-login .err{color:var(--red,#ff5a5a)}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  function renderNav(target) {
    const here = location.pathname.split('/').pop() || 'dashboard.html';
    const nav = document.createElement('nav');
    nav.className = 'rev-nav';
    nav.innerHTML = TABS.map(t => `<a href="${t.href}"${t.href === here ? ' class="on" aria-current="page"' : ''}>${t.label}</a>`).join('')
      + `<button class="rev-out" type="button" hidden>Sign out</button>`;
    (target || document.body).prepend(nav);
    const out = nav.querySelector('.rev-out');
    sb.auth.getSession().then(({ data }) => { out.hidden = !data.session; });
    out.addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    return nav;
  }

  function showLogin() {
    const wrap = document.createElement('div');
    wrap.className = 'rev-login';
    wrap.innerHTML = `<form>
      <h1>Rev dashboard</h1>
      <p>Enter your email and we'll send you a sign-in link. Open it on this device and you'll stay signed in.</p>
      <input type="email" id="rev-email" required autocomplete="email" value="${OWNER_EMAIL}" aria-label="Email">
      <button type="submit">Email me a sign-in link</button>
      <div class="msg" role="status"></div>
    </form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form'), msg = wrap.querySelector('.msg'), btn = wrap.querySelector('button');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending...';
      const email = wrap.querySelector('#rev-email').value.trim();
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0].split('?')[0] } });
      btn.disabled = false;
      if (error) { msg.className = 'msg err'; msg.textContent = error.message.includes('rate') ? 'Too many links sent. Wait a few minutes and try again.' : 'Could not send the link: ' + error.message; }
      else msg.textContent = 'Check your email and tap the link. You can close this tab.';
    });
  }

  /* Call with the page's start function. It runs once a login exists. */
  window.revRequireLogin = async function (start) {
    const { data } = await sb.auth.getSession();
    if (data.session) { start(data.session); return; }
    showLogin();
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (session) { sub.subscription.unsubscribe(); document.querySelector('.rev-login')?.remove(); start(session); }
    });
  };
  window.revRenderNav = renderNav;
})();
