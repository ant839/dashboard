/* PT today box on the dashboard: today's scheduled PT clients with a tick each, plus renewal alerts. */
(function () {
  const $ = id => document.getElementById(id);
  let signedIn = false;

  function render() {
    const body = $('ptb-body'); if (!body) return;
    if (!signedIn) { body.innerHTML = '<div class="rt-empty">Sign in to see PT sessions.</div>'; $('ptb-count').textContent = ''; return; }
    const { esc, iso, today, status, scheduledOn, trainedOn, hasSession, needsAttention, PLAN_LABEL } = PT;
    const day = iso(today());
    const sched = scheduledOn(day), trained = trainedOn(day);
    const list = [...sched, ...trained.filter(c => !sched.includes(c))].sort((a, b) => a.name.localeCompare(b.name));
    const done = list.filter(c => hasSession(c.id, day)).length;
    $('ptb-count').textContent = list.length ? `${done}/${list.length}` : '';
    let html = '';
    if (!PT.store.clients.length) html = '<div class="rt-empty">No PT clients yet. Add them on the PT tab.</div>';
    else if (!list.length) html = '<div class="rt-empty">No PT sessions scheduled today.</div>';
    else html = list.map(c => {
      const on = hasSession(c.id, day), s = status(c);
      return `<div class="rt-item ptb-item">
        <button type="button" class="task-check${on ? ' done' : ''}" data-pttick="${c.id}" aria-pressed="${on}" aria-label="${on ? 'Untick' : 'Tick off'} ${esc(c.name)}"></button>
        <div class="ptb-text"><span class="task-text${on ? ' done' : ''}">${esc(c.name)}</span><span class="ptb-line ${s.level}">${esc(s.line)}</span></div></div>`;
    }).join('');
    const attn = needsAttention();
    if (attn.length) html += `<div class="rt-sec">Needs attention</div>` + attn.slice(0, 5).map(({ c, s }) =>
      `<div class="ptb-attn ${s.level}"><a href="pt.html">${esc(c.name)}</a><span>${esc(s.line)}</span></div>`).join('') +
      (attn.length > 5 ? `<a class="ptb-more" href="pt.html">+${attn.length - 5} more</a>` : '');
    body.innerHTML = html;
  }

  async function refresh() { try { await PT.load(); render(); } catch (e) { $('ptb-body').innerHTML = '<div class="rt-empty">Could not load PT. Refresh to try again.</div>'; } }

  function init() {
    if (!$('ptb-card') || !window.PT) return;
    $('ptb-body').addEventListener('click', async e => {
      const b = e.target.closest('[data-pttick]'); if (!b) return;
      const id = b.dataset.pttick, day = PT.iso(PT.today());
      try { PT.hasSession(id, day) ? await PT.untick(id, day) : await PT.tick(id, day); render(); } catch (err) { refresh(); }
    });
    render();
    sb.auth.getSession().then(({ data }) => {
      signedIn = !!data.session; render(); if (!signedIn) return;
      refresh();
      PT.subscribe(() => { clearTimeout(refresh._t); refresh._t = setTimeout(refresh, 300); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
