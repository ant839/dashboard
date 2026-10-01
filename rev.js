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
    { href: 'dashboard.html', label: 'Home' },
    { href: 'braindump.html', label: 'Brain Dump' },
    { href: 'athletes.html', label: 'Programming' },
    { href: 'plan.html', label: 'Periodisation' },
    { href: 'leads.html', label: 'Leads' },
    { href: 'members.html', label: 'Members' },
    { href: 'social.html', label: 'Social' },
    { href: 'cashflow.html', label: 'Cash Flow' },
    { href: 'pt.html', label: 'PT Clients' }
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
  .rev-login .err{color:var(--red,#ff5a5a)}
  .rev-login .alt{background:none;color:var(--muted,#888884);font-weight:500;font-size:13px;padding:4px;text-decoration:underline}
  .rev-login .x{position:absolute;top:14px;right:16px;background:none;color:var(--muted,#888884);font-size:22px;padding:0;width:auto}
  .rev-login form{position:relative}
  .rev-nav .rev-pw{background:none;border:0;color:var(--dim,#4a4a48);font-size:12px;cursor:pointer;padding:9px 6px;white-space:nowrap}
  .rev-nav .rev-pw:hover{color:var(--text,#f0efe8)}
  .rev-nav .rev-pw{margin-left:auto;color:var(--muted,#888884)}
  .rev-pwrap{position:relative}
  .rev-pwrap input{padding-right:64px}
  .rev-login .rev-show{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;color:var(--muted,#888884);font-size:12px;font-weight:600;padding:6px 8px;width:auto}
  @media (max-width:900px){.rev-nav .rev-pw{position:sticky;right:0;background:var(--bg,#0e0e0f);padding-left:12px}}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  function renderNav(target) {
    const here = location.pathname.split('/').pop() || 'dashboard.html';
    const nav = document.createElement('nav');
    nav.className = 'rev-nav';
    nav.innerHTML = TABS.map(t => `<a href="${t.href}"${t.href === here ? ' class="on" aria-current="page"' : ''}>${t.label}</a>`).join('')
      + `<button class="rev-pw" type="button" hidden>Account</button>`;
    (target || document.body).prepend(nav);
    const pw = nav.querySelector('.rev-pw');
    sb.auth.getSession().then(({ data }) => { pw.hidden = !data.session; });
    pw.addEventListener('click', showSetPassword);
    return nav;
  }

  /* Sign in. Password works everywhere, including the home-screen app on iPhone,
     which keeps its own login separate from Safari. The emailed link is the fallback. */
  function showLogin(opts) {
    if (document.querySelector('.rev-login')) return;
    const closable = opts && opts.closable;
    const wrap = document.createElement('div');
    wrap.className = 'rev-login';
    wrap.innerHTML = `<form autocomplete="on">
      ${closable ? '<button type="button" class="x" aria-label="Close">×</button>' : ''}
      <h1>Rev dashboard</h1>
      <p id="rev-hint">Sign in with your email and password.</p>
      <input type="email" id="rev-email" name="email" required autocomplete="username" value="${OWNER_EMAIL}" aria-label="Email">
      <div class="rev-pwrap" id="rev-passwrap"><input type="password" id="rev-pass" name="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Password" aria-label="Password"><button type="button" class="rev-show" data-show="rev-pass">Show</button></div>
      <button type="submit" id="rev-go">Sign in</button>
      <button type="button" class="alt" id="rev-mode">Email me a sign-in link instead</button>
      <div class="msg" role="status"></div>
    </form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form'), msg = wrap.querySelector('.msg'), go = wrap.querySelector('#rev-go'), pass = wrap.querySelector('#rev-pass'), mode = wrap.querySelector('#rev-mode');
    let useLink = false;
    const setMode = () => {
      wrap.querySelector('#rev-passwrap').hidden = useLink; pass.required = !useLink;
      go.textContent = useLink ? 'Email me a sign-in link' : 'Sign in';
      mode.textContent = useLink ? 'Use my password instead' : 'Email me a sign-in link instead';
      wrap.querySelector('#rev-hint').textContent = useLink ? "We'll email you a link. It opens in Safari, so on iPhone use your password for the home-screen app." : 'Sign in with your email and password.';
      msg.textContent = '';
    };
    setMode();
    wireShow(wrap);
    mode.addEventListener('click', () => { useLink = !useLink; setMode(); });
    wrap.querySelector('.x')?.addEventListener('click', () => wrap.remove());
    form.addEventListener('submit', async e => {
      e.preventDefault();
      go.disabled = true; msg.className = 'msg'; msg.textContent = useLink ? 'Sending...' : 'Signing in...';
      const email = wrap.querySelector('#rev-email').value.trim();
      let error;
      if (useLink) ({ error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0].split('?')[0] } }));
      else ({ error } = await sb.auth.signInWithPassword({ email, password: pass.value }));
      go.disabled = false;
      if (error) {
        msg.className = 'msg err';
        msg.textContent = error.message.includes('rate') ? 'Too many attempts. Wait a few minutes and try again.'
          : !useLink && /invalid/i.test(error.message) ? "That password didn't match. Tap Show to check it. Forgotten it? Use the email link below to sign in on Safari, then tap Account at the top right to set a new one."
          : 'Could not sign in: ' + error.message;
      } else if (useLink) msg.textContent = 'Check your email and tap the link.';
    });
  }

  function showSetPassword() {
    if (document.querySelector('.rev-login')) return;
    const wrap = document.createElement('div');
    wrap.className = 'rev-login';
    wrap.innerHTML = `<form autocomplete="on">
      <button type="button" class="x" aria-label="Close">×</button>
      <h1>Account</h1>
      <p>Signed in as ${OWNER_EMAIL}. Set a new password here, one you'll type yourself, then use it to sign in on the home-screen app.</p>
      <input type="email" name="email" autocomplete="username" value="${OWNER_EMAIL}" hidden>
      <div class="rev-pwrap"><input type="password" id="rev-new" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" minlength="6" required placeholder="New password (6+ characters)" aria-label="New password"><button type="button" class="rev-show" data-show="rev-new">Show</button></div>
      <div class="rev-pwrap"><input type="password" id="rev-new2" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" minlength="6" required placeholder="Type it again" aria-label="Confirm password"><button type="button" class="rev-show" data-show="rev-new2">Show</button></div>
      <button type="submit">Save password</button>
      <div class="msg" role="status"></div>
      <button type="button" class="alt" id="rev-signout">Sign out</button>
    </form>`;
    document.body.appendChild(wrap);
    wireShow(wrap);
    const form = wrap.querySelector('form'), msg = wrap.querySelector('.msg');
    wrap.querySelector('.x').addEventListener('click', () => wrap.remove());
    wrap.querySelector('#rev-signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const a = wrap.querySelector('#rev-new').value, b = wrap.querySelector('#rev-new2').value;
      if (a !== b) { msg.className = 'msg err'; msg.textContent = "Those don't match. Tap Show to check them."; return; }
      msg.className = 'msg'; msg.textContent = 'Saving...';
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) { msg.className = 'msg err'; msg.textContent = /same|different/i.test(error.message) ? "That's already your password, so you're set. Use it in the home-screen app." : 'Could not save it: ' + error.message; }
      else msg.textContent = 'Saved. Open the home-screen app, tap Sign in, and use this password.';
    });
  }

  function wireShow(root) {
    root.querySelectorAll('[data-show]').forEach(btn => btn.addEventListener('click', () => {
      const inp = root.querySelector('#' + btn.dataset.show);
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
    }));
  }
  window.revShowLogin = () => {
    showLogin({ closable: true });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => { if (session) { sub.subscription.unsubscribe(); location.reload(); } });
  };

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
