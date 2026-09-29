/* Programs due card: athletes whose next program is due within 7 days (or overdue), read live from the athlete tracker. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let rows = [], signedIn = false;

  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysTo = s => Math.round((parseD(s) - today()) / 86400000);

  function render() {
    const body = $('pd-body'); if (!body) return;
    if (!signedIn) { body.innerHTML = '<div class="rt-empty">Sign in to see programs due.</div>'; $('pd-count').textContent = ''; return; }
    const limit = new Date(today()); limit.setDate(limit.getDate() + 7);
    const list = rows.filter(a => a.due && parseD(a.due) <= limit).sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
    const over = list.filter(a => daysTo(a.due) < 0).length;
    $('pd-count').textContent = list.length ? (over ? `${list.length} · ${over} overdue` : `${list.length}`) : '';
    if (!list.length) { body.innerHTML = '<div class="rt-empty">Nothing due in the next 7 days.</div>'; return; }
    let lastDate = '';
    body.innerHTML = list.map(a => {
      const n = daysTo(a.due);
      const head = a.due !== lastDate ? `<div class="rt-sec">${n < 0 ? 'Overdue · ' : n === 0 ? 'Today · ' : ''}${parseD(a.due).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</div>` : '';
      lastDate = a.due;
      const cls = n < 0 ? 'd-over' : n <= 2 ? 'd-soon' : 'd-ok';
      return head + `<div class="pd-item">
        <a class="pd-name" href="athletes.html" title="Open the athlete tracker">${esc(a.name)}</a>
        <span class="pd-type">${esc(a.type || '')}</span>
        ${a.everfit ? `<a class="pd-ef" href="${esc(a.everfit)}" target="_blank" rel="noopener" title="Open in Everfit">EF</a>` : ''}
        <span class="pd-days ${cls}" title="Days until due">${n}</span>
      </div>`;
    }).join('');
  }

  async function load() {
    const limit = new Date(today()); limit.setDate(limit.getDate() + 7);
    const { data, error } = await sb.from('athletes').select('id,name,type,due,everfit').eq('archived', false).lte('due', iso(limit));
    if (error) { $('pd-body').innerHTML = '<div class="rt-empty">Could not load programs. Refresh to try again.</div>'; return; }
    rows = data || []; render();
  }

  function init() {
    if (!$('pd-card')) return;
    render();
    sb.auth.getSession().then(({ data }) => {
      signedIn = !!data.session; render(); if (!signedIn) return;
      load();
      sb.channel('programs-due-live').on('postgres_changes', { event: '*', schema: 'public', table: 'athletes' }, load).subscribe();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
      setInterval(render, 30 * 60 * 1000);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
