/* Drag the top-row boxes by their header to reorder them. The order is saved to your account. */
(function () {
  const KEY = 'top_row_order', LOCAL = 'rev_top_row_order';
  const row = () => document.querySelector('.right-top');

  function apply(order) {
    const r = row(); if (!r || !Array.isArray(order)) return;
    const cards = [...r.querySelectorAll(':scope > [data-card]')];
    const byId = Object.fromEntries(cards.map(c => [c.dataset.card, c]));
    order.forEach(id => { if (byId[id]) r.appendChild(byId[id]); });
    cards.filter(c => !order.includes(c.dataset.card)).forEach(c => r.appendChild(c)); /* new boxes go at the end */
  }
  const current = () => [...row().querySelectorAll(':scope > [data-card]')].map(c => c.dataset.card);

  async function save() {
    const order = current();
    try { localStorage.setItem(LOCAL, JSON.stringify(order)); } catch (e) {}
    const { data } = await sb.auth.getSession(); if (!data.session) return;
    await sb.from('settings').upsert({ key: KEY, value: order, updated_at: new Date().toISOString() });
  }

  function init() {
    const r = row(); if (!r) return;
    try { const o = JSON.parse(localStorage.getItem(LOCAL) || 'null'); if (o) apply(o); } catch (e) {}
    if (window.Sortable) Sortable.create(r, {
      draggable: '[data-card]', handle: '.card-label', filter: 'button, a, input, select', preventOnFilter: false,
      animation: 180, ghostClass: 'card-ghost', chosenClass: 'card-chosen', forceFallback: true, fallbackTolerance: 4, onEnd: save
    });
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: s } = await sb.from('settings').select('value').eq('key', KEY).maybeSingle();
      if (s && s.value) { apply(s.value); try { localStorage.setItem(LOCAL, JSON.stringify(s.value)); } catch (e) {} }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
