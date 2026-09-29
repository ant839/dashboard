/* PT Business view: money received, sessions, attendance by client, payments log and CSV export. */
(function () {
  const $ = s => document.querySelector(s);
  let range = 'month';
  try { range = localStorage.getItem('pt-biz-range') || 'month'; } catch (e) {}

  const css = `
  .biz-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}
  .rangesw{display:flex;flex-wrap:wrap;gap:4px}
  .rangesw button{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:5px 12px;font-size:12px;color:var(--muted)}
  .rangesw button.on{background:var(--surface2);border-color:var(--accent);color:var(--text)}
  .biz-acts{display:flex;gap:6px;flex-wrap:wrap}
  .chart{position:relative}
  .chart svg{display:block;width:100%;height:auto;overflow:visible}
  .chart .gl{stroke:rgba(255,255,255,.06);stroke-width:1}
  .chart .base{stroke:rgba(255,255,255,.18);stroke-width:1}
  .chart text{fill:var(--muted);font-size:10px;font-family:'DM Sans',system-ui,sans-serif}
  .chart .lbl{fill:var(--text);font-size:10px;font-weight:600}
  .chart .bar{fill:var(--accent)} .chart .bar.dim{fill:var(--accent);opacity:.45}
  .chart .hit{fill:transparent;cursor:default}
  .chart path,.chart text,.chart line{pointer-events:none}
  .chart .hit:hover+.bar,.chart .bar.hl{opacity:1;filter:brightness(1.15)}
  .ctip{position:absolute;pointer-events:none;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:6px 9px;font-size:12px;white-space:nowrap;transform:translate(-50%,-100%);margin-top:-6px;z-index:5}
  .ctip b{display:block;font-weight:600} .ctip span{color:var(--muted);font-size:11px}
  .ctable{margin-top:8px;font-size:12px;color:var(--muted)} .ctable summary{cursor:pointer;font-size:11px;color:var(--dim)}
  .ctable table{width:100%;border-collapse:collapse;margin-top:6px} .ctable td,.ctable th{padding:3px 0;text-align:left;font-weight:400;border-bottom:1px solid var(--border)} .ctable td:last-child,.ctable th:last-child{text-align:right;font-family:'DM Mono',monospace}
  .att-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer}
  .att-row:last-child{border-bottom:0} .att-row:hover .cname{color:var(--accent)}
  .att-pct{font-family:'DM Mono',monospace;font-size:12px;min-width:40px;text-align:right}
  .att-pct.warn{color:var(--amber)} .att-pct.bad{color:var(--red)}
  .pay-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
  .pay-row:last-child{border-bottom:0}
  .pay-row .del{background:none;border:0;color:var(--dim);font-size:14px;padding:2px 4px}
  .pay-row .del:hover,.pay-row .del.armed{color:var(--red);font-size:11px}
  .biz-note{font-size:11px;color:var(--dim);margin-top:10px;line-height:1.5}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const COVERS = { week: 'Week', fortnight: 'Fortnight', pack: 'Pack', period: 'Period', other: 'Other' };
  const monthKey = d => d.slice(0, 7);
  const monthStart = (y, m) => PT.iso(new Date(y, m, 1));

  function rangeDates() {
    const t = PT.today(), y = t.getFullYear(), m = t.getMonth(), today = PT.iso(t);
    if (range === 'last') return { from: monthStart(y, m - 1), to: PT.addDays(monthStart(y, m), -1), label: 'last month' };
    if (range === '3m') return { from: monthStart(y, m - 2), to: today, label: 'the last 3 months' };
    if (range === '12m') return { from: monthStart(y, m - 11), to: today, label: 'the last 12 months' };
    if (range === 'all') return { from: '2000-01-01', to: today, label: 'all time' };
    return { from: monthStart(y, m), to: today, label: 'this month' };
  }

  /* Scheduled sessions for a client between two dates: their usual days, from when they were added.
     Today only counts once it has been ticked, skipped or moved. */
  function scheduledIn(c, from, to) {
    if (!c.active || !(c.days || []).length) return 0;
    const today = PT.iso(PT.today()), added = (c.created_at || '').slice(0, 10);
    let d = from < added ? added : from; if (d < PT.PAY_FROM) d = PT.PAY_FROM;
    const end = to > today ? today : to; let n = 0;
    for (; d <= end; d = PT.addDays(d, 1)) {
      if (!c.days.includes(PT.weekday(d))) continue;
      if (d === today && !PT.store.sessions.some(x => x.client_id === c.id && x.day === d)) continue;
      n++;
    }
    return n;
  }

  function barChart(el, months, key, fmtVal, emptyMsg) {
    const vals = months.map(m => m[key]), max = Math.max(...vals, 0);
    if (!max) { el.innerHTML = `<div class="empty">${emptyMsg}</div>`; return; }
    const W = Math.max(280, Math.round(el.clientWidth || 560)), H = W < 420 ? 170 : 190, padL = 44, padB = 22, padT = 16, cw = (W - padL) / months.length, bw = Math.min(28, cw * 0.55);
    const step = niceStep(max), top = Math.ceil(max / step) * step, y = v => padT + (H - padT - padB) * (1 - v / top);
    let g = '';
    for (let v = 0; v <= top + 1e-9; v += step) g += `<line class="${v ? 'gl' : 'base'}" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${fmtVal(v, true)}</text>`;
    const cur = months.length - 1;
    months.forEach((m, i) => {
      const x = padL + cw * i + (cw - bw) / 2, v = m[key], h = Math.max(0, y(0) - y(v)), r = Math.min(4, bw / 2, h);
      const path = h ? `M${x},${y(0)}V${y(v) + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}Z` : '';
      g += `<rect class="hit" data-i="${i}" x="${padL + cw * i}" y="${padT}" width="${cw}" height="${H - padT - padB}"/>`;
      if (path) g += `<path class="bar${i === cur ? '' : ' dim'}" d="${path}"/>`;
      g += `<text x="${padL + cw * i + cw / 2}" y="${H - 6}" text-anchor="middle">${m.short}</text>`;
      if (i === cur && v) g += `<text class="lbl" x="${padL + cw * i + cw / 2}" y="${y(v) - 5}" text-anchor="middle">${fmtVal(v)}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart by month">${g}</svg><div class="ctip" hidden></div>
      <details class="ctable"><summary>Show as a table</summary><table>${months.map(m => `<tr><td>${m.long}</td><td>${fmtVal(m[key])}</td></tr>`).join('')}</table></details>`;
    const tip = el.querySelector('.ctip'), svg = el.querySelector('svg');
    svg.addEventListener('pointermove', e => {
      const h = e.target.closest('.hit'); if (!h) { tip.hidden = true; return; }
      const m = months[+h.dataset.i], box = svg.getBoundingClientRect(), sx = box.width / W;
      tip.innerHTML = `<b>${fmtVal(m[key])}</b><span>${m.long}</span>`;
      tip.style.left = (padL + cw * +h.dataset.i + cw / 2) * sx + 'px'; tip.style.top = y(m[key]) * sx + 'px'; tip.hidden = false;
    });
    svg.addEventListener('pointerleave', () => tip.hidden = true);
  }
  function niceStep(max) { const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  const kfmt = (v, axis) => axis && v >= 1000 ? '$' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : PT.money(v);

  function monthsSeries() {
    const { store } = PT, t = PT.today();
    const firstData = [PT.PAY_FROM, ...store.payments.map(p => p.paid_on), ...store.sessions.map(s => s.day)].sort()[0];
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1), k = PT.iso(d).slice(0, 7);
      if (k < monthKey(firstData) && i > 5) continue;
      out.push({ k, short: d.toLocaleDateString('en-AU', { month: 'short' }), long: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }), rev: 0, sess: 0 });
    }
    const byK = Object.fromEntries(out.map(m => [m.k, m]));
    store.payments.forEach(p => { const m = byK[monthKey(p.paid_on)]; if (m) m.rev += Number(p.amount || 0); });
    store.sessions.filter(PT.isDone).forEach(s => { const m = byK[monthKey(s.day)]; if (m) m.sess++; });
    return out;
  }

  function render() {
    const root = $('#vBiz'); if (!root) return;
    const { store, esc, fmt, money } = PT, R = rangeDates();
    const pays = store.payments.filter(p => p.paid_on >= R.from && p.paid_on <= R.to).sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at));
    const sess = store.sessions.filter(s => s.day >= R.from && s.day <= R.to);
    const done = sess.filter(PT.isDone), valued = done.filter(s => s.value != null);
    const received = pays.reduce((a, p) => a + Number(p.amount || 0), 0);
    const avg = valued.length ? valued.reduce((a, s) => a + Number(s.value), 0) / valued.length : null;
    const rows = store.clients.map(c => {
      const mine = sess.filter(s => s.client_id === c.id);
      const r = { c, done: mine.filter(PT.isDone).length, skipped: mine.filter(s => s.status === 'skipped').length, moved: mine.filter(s => s.status === 'moved').length,
        sched: scheduledIn(c, R.from, R.to), paid: pays.filter(p => p.client_id === c.id).reduce((a, p) => a + Number(p.amount || 0), 0) };
      r.pct = r.sched ? Math.min(100, Math.round(r.done / r.sched * 100)) : null;
      return r;
    }).filter(r => r.c.active || r.done || r.paid).sort((a, b) => b.paid - a.paid || b.done - a.done || a.c.name.localeCompare(b.c.name));
    const schedTot = rows.reduce((a, r) => a + r.sched, 0), doneSched = rows.reduce((a, r) => a + Math.min(r.done, r.sched), 0);
    const owed = PT.outstanding();

    root.innerHTML = `
      <div class="biz-top"><div class="rangesw" role="group" aria-label="Date range">${[['month', 'This month'], ['last', 'Last month'], ['3m', '3 months'], ['12m', '12 months'], ['all', 'All time']].map(([k, l]) => `<button type="button" data-range="${k}" class="${k === range ? 'on' : ''}" aria-pressed="${k === range}">${l}</button>`).join('')}</div>
        <div class="biz-acts"><button type="button" class="btn" data-bizadd>+ Add payment</button><button type="button" class="btn" data-csv="pay">Export payments</button><button type="button" class="btn" data-csv="sess">Export sessions</button></div></div>
      <section class="metrics" aria-label="Business summary">
        <div class="metric m1"><span class="l">Received</span><span class="v">${money(received)}</span><span class="ms">${pays.length} payment${pays.length === 1 ? '' : 's'} · ${R.label}</span></div>
        <div class="metric m2"><span class="l">Sessions done</span><span class="v">${done.length}</span><span class="ms">${sess.filter(s => s.status === 'skipped').length} skipped · ${sess.filter(s => s.status === 'moved').length} moved</span></div>
        <div class="metric m5"><span class="l">Average per session</span><span class="v">${avg == null ? '–' : money(avg)}</span><span class="ms">${valued.length ? `${money(valued.reduce((a, s) => a + Number(s.value), 0))} of sessions delivered` : 'Set prices to see this'}</span></div>
        <div class="metric m3"><span class="l">Attendance</span><span class="v">${schedTot ? Math.round(doneSched / schedTot * 100) + '%' : '–'}</span><span class="ms">${schedTot ? `${doneSched} of ${schedTot} usual sessions` : 'No usual sessions yet'}</span></div>
        <div class="metric m4"><span class="l">Owed now</span><span class="v">${owed ? money(owed) : '$0'}</span><span class="ms">Weekly and fortnightly, unpaid</span></div>
      </section>
      <div class="cols"><div>
        <section class="card"><div class="card-label">Received per month</div><div class="chart" id="chRev"></div></section>
        <section class="card attn"><div class="card-label">Sessions per month</div><div class="chart" id="chSess"></div></section>
        <section class="card attn"><div class="card-label">Payments · ${esc(R.label)} <span style="text-transform:none;letter-spacing:0;font-weight:500;color:var(--text)">${money(received)}</span></div>
          <div id="payLog">${pays.length ? pays.slice(0, 60).map(p => { const c = store.clients.find(x => x.id === p.client_id); return `<div class="pay-row"><div class="cbody"><div class="cname">${esc(c ? c.name : 'Removed client')}</div><div class="cline">${fmt(p.paid_on, { weekday: 'short', day: 'numeric', month: 'short' })} · ${COVERS[p.covers]}${p.covers === 'pack' && p.sessions ? ` of ${p.sessions}` : ''}${p.note ? ' · ' + esc(p.note) : ''}</div></div><span class="due-amt">${money(p.amount)}</span><button type="button" class="del" data-delpay="${p.id}" aria-label="Remove payment">×</button></div>`; }).join('') : `<div class="empty">No payments logged ${esc(R.label)}. Tap Paid on the Clients view when someone pays, or use + Add payment.</div>`}</div></section>
      </div><div>
        <section class="card"><div class="card-label">By client · ${esc(R.label)}</div>
          <div>${rows.length ? rows.map(r => `<div class="att-row" data-edit="${r.c.id}" role="button" tabindex="0"><div class="cbody"><div class="cname">${esc(r.c.name)} <span class="plan p-${r.c.plan}">${PT.PLAN_LABEL[r.c.plan]}</span></div>
            <div class="cline">${r.sched ? `${r.done} of ${r.sched} usual sessions` : `${r.done} session${r.done === 1 ? '' : 's'}`}${r.skipped ? ` · ${r.skipped} skipped` : ''}${r.moved ? ` · ${r.moved} moved` : ''}</div></div>
            <span class="att-pct ${r.pct == null ? '' : r.pct < 60 ? 'bad' : r.pct < 85 ? 'warn' : ''}">${r.pct == null ? '' : r.pct + '%'}</span><span class="cprice strong" style="min-width:64px;text-align:right">${r.paid ? money(r.paid) : '–'}</span></div>`).join('') : '<div class="empty">No clients yet.</div>'}</div>
          <p class="biz-note">Percent is sessions done against their usual training days. Tap a client for their full payment and session history. Tracking started ${fmt(PT.PAY_FROM, { day: 'numeric', month: 'short', year: 'numeric' })}.</p></section>
      </div></div>`;
    const months = monthsSeries();
    barChart($('#chRev'), months, 'rev', kfmt, 'Nothing received yet. Payments you mark as Paid show up here.');
    barChart($('#chSess'), months, 'sess', (v, axis) => axis ? String(Math.round(v)) : `${v} session${v === 1 ? '' : 's'}`, 'No sessions ticked yet.');
  }

  /* ---- add payment ---- */
  function openAdd() {
    const { store, esc } = PT, t = PT.iso(PT.today());
    const el = document.createElement('div'); el.className = 'modal';
    el.innerHTML = `<form autocomplete="off"><h4>Add a payment</h4><p>For anything the Paid buttons don't cover: a different amount, cash, a one-off.</p>
      <label class="f full">Client<select id="ap-c" required><option value="">Choose…</option>${store.clients.slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name)).map(c => `<option value="${c.id}">${esc(c.name)}${c.active ? '' : ' (inactive)'}</option>`).join('')}</select></label>
      <label class="f">Amount ($)<input id="ap-a" type="number" min="0" step="0.01" inputmode="decimal" required></label>
      <label class="f">Paid on<input id="ap-d" type="date" value="${t}" required></label>
      <label class="f full">For<select id="ap-k">${Object.entries(COVERS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><span class="hint">Week or Fortnight clears that client's Paid reminder for the week it falls in.</span></label>
      <label class="f full">Note<input id="ap-n" maxlength="120" placeholder="Optional"></label>
      <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="submit">Add</button></div></form>`;
    document.body.appendChild(el);
    const c = () => store.clients.find(x => x.id === el.querySelector('#ap-c').value);
    el.querySelector('#ap-c').addEventListener('change', () => { const cl = c(); if (!cl) return;
      el.querySelector('#ap-k').value = cl.plan === 'weekly' ? 'week' : cl.plan === 'fortnightly' ? 'fortnight' : cl.plan;
      const a = cl.plan === 'weekly' ? PT.weekAmount(cl) : cl.price_package; if (a != null && !el.querySelector('#ap-a').value) el.querySelector('#ap-a').value = a; });
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) el.remove(); });
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const cl = c(); if (!cl) return;
      const paid_on = el.querySelector('#ap-d').value, covers = el.querySelector('#ap-k').value;
      let period_from = null, period_to = null;
      if (covers === 'week') { period_from = PT.weekStart(paid_on); period_to = PT.addDays(period_from, 6); }
      if (covers === 'fortnight') { period_from = PT.fortnightPayIn(cl, PT.addDays(paid_on, -7), PT.addDays(paid_on, 7)) || paid_on; period_to = PT.addDays(period_from, 13); }
      try { await PT.addPayment({ client_id: cl.id, amount: Number(el.querySelector('#ap-a').value), paid_on, covers, period_from, period_to, note: el.querySelector('#ap-n').value.trim() || null });
        el.remove(); PTPage.render(); PTPage.toast(`Added ${PT.money(el.querySelector('#ap-a').value)} from ${cl.name}`); } catch (err) { PTPage.fail(err); }
    });
    setTimeout(() => el.querySelector('#ap-c').focus(), 30);
  }

  /* ---- CSV ---- */
  function csv(kind) {
    const { store } = PT, R = rangeDates(), name = id => (store.clients.find(c => c.id === id) || {}).name || '';
    const plan = id => PT.PLAN_LABEL[(store.clients.find(c => c.id === id) || {}).plan] || '';
    const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    let rows;
    if (kind === 'pay') rows = [['Date paid', 'Client', 'Plan', 'For', 'Period from', 'Period to', 'Sessions', 'Amount', 'Note'],
      ...store.payments.filter(p => p.paid_on >= R.from && p.paid_on <= R.to).sort((a, b) => a.paid_on.localeCompare(b.paid_on))
        .map(p => [p.paid_on, name(p.client_id), plan(p.client_id), COVERS[p.covers], p.period_from, p.period_to, p.sessions, Number(p.amount).toFixed(2), p.note])];
    else rows = [['Date', 'Client', 'Plan', 'Status', 'Moved to', 'Session value'],
      ...store.sessions.filter(s => s.day >= R.from && s.day <= R.to).sort((a, b) => a.day.localeCompare(b.day))
        .map(s => [s.day, name(s.client_id), plan(s.client_id), s.status === 'moved' ? 'Moved' : s.status === 'skipped' ? 'Skipped' : 'Done', s.moved_to, s.value != null ? Number(s.value).toFixed(2) : ''])];
    const blob = new Blob([rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `rev-pt-${kind === 'pay' ? 'payments' : 'sessions'}-${R.from === '2000-01-01' ? 'all' : R.from}-to-${R.to}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  document.addEventListener('click', async e => {
    if (!e.target.closest('#vBiz')) return;
    const r = e.target.closest('[data-range]'); if (r) { range = r.dataset.range; try { localStorage.setItem('pt-biz-range', range); } catch (x) {} render(); return; }
    if (e.target.closest('[data-bizadd]')) return openAdd();
    const c = e.target.closest('[data-csv]'); if (c) return csv(c.dataset.csv);
    const d = e.target.closest('[data-delpay]');
    if (d) { e.stopPropagation(); if (!d.dataset.armed) { d.dataset.armed = '1'; d.textContent = 'Remove?'; d.classList.add('armed'); return; }
      try { await PT.removePayment(d.dataset.delpay); PTPage.render(); } catch (err) { PTPage.fail(err); } }
  }, true);

  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const v = $('#vBiz'); if (v && !v.hidden) render(); }, 250); });
  window.PTBiz = { render };
})();
