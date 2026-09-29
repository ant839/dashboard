/* PT today box on the dashboard: today's scheduled PT clients with a tick each, plus renewal alerts. */
(function () {
  const $ = id => document.getElementById(id);
  let signedIn = false;

  function render() {
    const body = $('ptb-body'); if (!body) return;
    if (!signedIn) { body.innerHTML = '<div class="rt-empty">Sign in to see PT sessions.</div>'; $('ptb-count').textContent = ''; $('ptb-pay').innerHTML = ''; return; }
    const { esc, iso, today, status, scheduledOn, trainedOn, hasSession, needsAttention, PLAN_LABEL } = PT;
    const day = iso(today());
    const sched = scheduledOn(day), trained = trainedOn(day);
    const list = PT.sortForDay([...sched, ...trained.filter(c => !sched.includes(c))], day);
    const done = list.filter(c => hasSession(c.id, day)).length, skipped = list.filter(c => PT.isSkipped(c.id, day) || PT.movedTo(c.id, day)).length;
    $('ptb-count').textContent = list.length ? `${done}/${list.length - skipped}` : '';
    const wi = PT.weeklyIncome();
    let html = wi.priced ? `<div class="ptb-income"><span class="ptb-inc-l">Weekly income</span><span class="ptb-inc-v">${PT.money(wi.earned)}</span><span class="ptb-inc-s">of ${PT.money(wi.expected)} this week</span><div class="ptb-inc-bar"><div style="width:${wi.expected ? Math.min(100, Math.round(wi.earned / wi.expected * 100)) : 0}%"></div></div></div>` : '';
    if (!PT.store.clients.length) html = '<div class="rt-empty">No PT clients yet. Add them on the PT tab.</div>';
    else if (!list.length) html = '<div class="rt-empty">No PT sessions scheduled today.</div>';
    else html = list.map(c => {
      const on = hasSession(c.id, day), sk = PT.isSkipped(c.id, day), mvTo = PT.movedTo(c.id, day), mvFrom = PT.movedFrom(c.id, day), s = status(c);
      const wk = d => PT.fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
      const line = sk ? 'Skipped today' : mvTo ? 'Moved to ' + wk(mvTo) : (mvFrom ? 'Moved from ' + wk(mvFrom) + ' · ' : '') + s.line;
      return `<div class="rt-item ptb-item${sk || mvTo ? ' ptb-skipped' : ''}" data-cid="${c.id}"><span class="ptb-grip" title="Drag to reorder" aria-label="Drag to reorder"><svg width="10" height="14" viewBox="0 0 10 14"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="7" r="1.3"/><circle cx="8" cy="7" r="1.3"/><circle cx="2" cy="12" r="1.3"/><circle cx="8" cy="12" r="1.3"/></svg></span>
        <button type="button" class="task-check${on ? ' done' : ''}" data-pttick="${c.id}" aria-pressed="${on}" aria-label="${on ? 'Untick' : 'Tick off'} ${esc(c.name)}"></button>
        <div class="ptb-text"><span class="task-text${on ? ' done' : ''}">${esc(c.name)}</span><span class="ptb-line ${sk || mvTo ? '' : s.level}">${esc(line)}</span></div>
        ${on ? '' : sk ? `<button type="button" class="ptb-skip" data-ptskip="${c.id}">Undo</button>` : mvTo ? `<button type="button" class="ptb-skip" data-ptunmove="${c.id}">Undo</button>`
          : `<span class="ptb-btns"><button type="button" class="ptb-skip" data-ptmove="${c.id}">Move</button><button type="button" class="ptb-skip" data-ptskip="${c.id}">Skip</button></span>`}</div>`;
    }).join('');
    const attn = needsAttention().filter(x => x.s.level === 'bad');
    if (attn.length) html += `<div class="rt-sec">Needs attention</div>` + attn.slice(0, 3).map(({ c, s }) =>
      `<div class="ptb-attn ${s.level}"><a href="pt.html">${esc(c.name)}</a><span>${esc(s.line)}</span></div>`).join('');
    body.innerHTML = html;
    const pays = PT.upcomingPayments().slice(0, 4);
    $('ptb-pay').innerHTML = pays.length ? `<div class="rt-sec">Next package payments</div>` + pays.map(({ c, n }) =>
      `<div class="ptb-pay-row"><a href="pt.html" title="${esc(n.why)}">${esc(c.name)}</a><span class="ptb-pay-d">${n.date <= iso(today()) ? 'Due now' : (n.estimate ? '~' : '') + PT.fmt(n.date, { day: 'numeric', month: 'short' })}</span><span class="ptb-pay-a">${n.amount != null ? PT.money(n.amount) : '–'}</span></div>`).join('') : '';
  }

  async function refresh() { try { await PT.load(); render(); } catch (e) { $('ptb-body').innerHTML = '<div class="rt-empty">Could not load PT. Refresh to try again.</div>'; } }

  function init() {
    if (!$('ptb-card') || !window.PT) return;
    $('ptb-body').addEventListener('click', async e => {
      const k = e.target.closest('[data-ptskip]');
      if (k) { const id = k.dataset.ptskip, day = PT.iso(PT.today()); try { PT.isSkipped(id, day) ? await PT.unskip(id, day) : await PT.skip(id, day); render(); } catch (err) { refresh(); } return; }
      const mv = e.target.closest('[data-ptmove]');
      if (mv) { const id = mv.dataset.ptmove, day = PT.iso(PT.today()), c = PT.store.clients.find(x => x.id === id); const to = await PT.pickMoveDay(c, day); if (!to) return; try { await PT.move(id, day, to); render(); } catch (err) { refresh(); } return; }
      const um = e.target.closest('[data-ptunmove]');
      if (um) { try { await PT.unmove(um.dataset.ptunmove, PT.iso(PT.today())); render(); } catch (err) { refresh(); } return; }
      const b = e.target.closest('[data-pttick]'); if (!b) return;
      const id = b.dataset.pttick, day = PT.iso(PT.today());
      try { PT.hasSession(id, day) ? await PT.untick(id, day) : await PT.tick(id, day); render(); } catch (err) { refresh(); }
    });
    if (window.Sortable) Sortable.create($('ptb-body'), { handle: '.ptb-grip', draggable: '.ptb-item', animation: 150, ghostClass: 'pt-ghost', forceFallback: true, fallbackTolerance: 3,
      onEnd: async ev => { if (ev.oldIndex === ev.newIndex) return; const ids = [...$('ptb-body').querySelectorAll('.ptb-item')].map(r => r.dataset.cid);
        try { await PT.saveDayOrder(PT.iso(PT.today()), ids); } catch (err) { refresh(); } } });
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
