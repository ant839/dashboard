/* Projects card on the Today tab. Saved in Supabase so it matches on every device. */
(function () {
  const COLORS = [
    ['lime', '#c8f06a'], ['blue', '#5ab4ff'], ['teal', '#3dd6b5'], ['purple', '#b08fff'],
    ['amber', '#f5a623'], ['red', '#ff5a5a'], ['pink', '#ff7ac6'], ['grey', '#9a9a95']
  ];
  const STATUSES = ['Planning', 'In progress', 'On hold', 'Done'];
  const ORDER = { 'In progress': 0, 'Planning': 1, 'On hold': 2, 'Done': 3 };
  const hex = c => (COLORS.find(x => x[0] === c) || COLORS[0])[1];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  let projects = [], showDone = false, signedIn = false, editing = null;

  function parseD(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function dueLabel(s) {
    const d = parseD(s); if (!d) return '';
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const n = Math.round((d - t) / 86400000);
    const txt = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    if (n < 0) return `<span class="proj-due late">Overdue · ${txt}</span>`;
    if (n === 0) return `<span class="proj-due soon">Due today</span>`;
    if (n <= 7) return `<span class="proj-due soon">Due ${txt}</span>`;
    return `<span class="proj-due">Due ${txt}</span>`;
  }

  function render() {
    const strip = $('proj-strip'); if (!strip) return;
    $('proj-add').hidden = !signedIn;
    $('proj-show-done').hidden = !signedIn || !projects.some(p => p.status === 'Done');
    $('proj-show-done').textContent = showDone ? 'Hide done' : 'Show done';
    if (!signedIn) {
      strip.innerHTML = `<div class="proj-empty">Sign in to see your projects.<button class="proj-signin" type="button" id="proj-signin">Sign in</button></div>`;
      $('proj-signin').onclick = () => { location.href = 'athletes.html'; };
      return;
    }
    const list = projects.filter(p => showDone || p.status !== 'Done')
      .sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (a.due || '9999').localeCompare(b.due || '9999') || a.created_at.localeCompare(b.created_at));
    const done = projects.filter(p => p.status === 'Done').length;
    $('proj-count').textContent = projects.length ? `${projects.length - done} active` : '';
    if (!list.length) {
      strip.innerHTML = `<div class="proj-empty">${projects.length ? 'All projects are done.' : 'No projects yet. Add your first upcoming project.'}</div>`;
      return;
    }
    strip.innerHTML = list.map(p => {
      const cls = 'st-' + p.status.toLowerCase().replace(/\s+/g, '');
      return `<button class="proj${p.status === 'Done' ? ' is-done' : ''}" type="button" data-proj="${p.id}" style="--pc:${hex(p.color)}">
        <div class="proj-top"><span class="proj-status ${cls}">${esc(p.status)}</span>${dueLabel(p.due)}</div>
        <div class="proj-title">${esc(p.title)}</div>
        ${p.notes ? `<div class="proj-notes">${esc(p.notes)}</div>` : ''}
        <div class="proj-foot"><div class="proj-bar"><div style="width:${p.progress}%"></div></div><span class="proj-pct">${p.progress}%</span></div>
      </button>`;
    }).join('');
  }

  /* ---- editor ---- */
  function buildEditor() {
    const m = document.createElement('div');
    m.className = 'proj-modal'; m.id = 'proj-modal'; m.hidden = true;
    m.innerHTML = `<form class="proj-box" id="proj-form" autocomplete="off">
      <div class="proj-mhead"><h3 id="proj-mtitle">New project</h3><button type="button" class="proj-x" id="proj-close" aria-label="Close">×</button></div>
      <label class="pf">Project<input id="pf-title" required maxlength="80" placeholder="e.g. Technogym workshop"></label>
      <div class="pf"><span>Colour</span><div class="proj-swatches" id="pf-colors">
        ${COLORS.map(([n, h]) => `<label class="sw" title="${n}"><input type="radio" name="pcolor" value="${n}"><span style="background:${h}"></span></label>`).join('')}
      </div></div>
      <div class="pf"><span>Status</span><div class="proj-seg" id="pf-status">
        ${STATUSES.map(s => `<label><input type="radio" name="pstatus" value="${s}"><span>${s}</span></label>`).join('')}
      </div></div>
      <div class="pf"><span>Completion <b id="pf-pct">0%</b></span>
        <input type="range" id="pf-progress" min="0" max="100" step="5" value="0">
        <div class="proj-quick">${[0, 25, 50, 75, 100].map(v => `<button type="button" data-pq="${v}">${v}%</button>`).join('')}</div>
      </div>
      <label class="pf">Due date<input type="date" id="pf-due"></label>
      <label class="pf">Notes<textarea id="pf-notes" rows="3" placeholder="What's involved, next step..."></textarea></label>
      <div class="proj-mfoot">
        <button type="button" class="btn proj-del" id="pf-delete">Delete</button>
        <div><button type="button" class="btn" id="pf-cancel">Cancel</button><button type="submit" class="btn proj-save">Save</button></div>
      </div>
    </form>`;
    document.body.appendChild(m);
    const pct = $('pf-pct'), rng = $('pf-progress');
    rng.addEventListener('input', () => { pct.textContent = rng.value + '%'; });
    m.querySelector('.proj-quick').addEventListener('click', e => { const b = e.target.closest('[data-pq]'); if (b) { rng.value = b.dataset.pq; pct.textContent = rng.value + '%'; } });
    m.querySelector('#pf-status').addEventListener('change', e => { if (e.target.value === 'Done') { rng.value = 100; pct.textContent = '100%'; } });
    ['proj-close', 'pf-cancel'].forEach(id => $(id).addEventListener('click', close));
    m.addEventListener('click', e => { if (e.target === m) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden) close(); });
    $('proj-form').addEventListener('submit', save);
    $('pf-delete').addEventListener('click', del);
  }
  function open(p) {
    editing = p || null;
    const v = p || { title: '', color: 'lime', status: 'Planning', progress: 0, due: '', notes: '' };
    $('proj-mtitle').textContent = p ? 'Edit project' : 'New project';
    $('pf-title').value = v.title;
    document.querySelectorAll('input[name=pcolor]').forEach(r => r.checked = r.value === v.color);
    document.querySelectorAll('input[name=pstatus]').forEach(r => r.checked = r.value === v.status);
    $('pf-progress').value = v.progress; $('pf-pct').textContent = v.progress + '%';
    $('pf-due').value = v.due || ''; $('pf-notes').value = v.notes || '';
    const d = $('pf-delete'); d.hidden = !p; d.textContent = 'Delete'; d.dataset.armed = '';
    $('proj-modal').hidden = false; setTimeout(() => $('pf-title').focus(), 30);
  }
  function close() { $('proj-modal').hidden = true; editing = null; }
  async function save(e) {
    e.preventDefault();
    const row = {
      title: $('pf-title').value.trim(),
      color: (document.querySelector('input[name=pcolor]:checked') || {}).value || 'lime',
      status: (document.querySelector('input[name=pstatus]:checked') || {}).value || 'Planning',
      progress: parseInt($('pf-progress').value, 10) || 0,
      due: $('pf-due').value || null,
      notes: $('pf-notes').value.trim()
    };
    if (!row.title) { $('pf-title').focus(); return; }
    const q = editing ? sb.from('projects').update(row).eq('id', editing.id).select().single() : sb.from('projects').insert(row).select().single();
    const { data, error } = await q;
    if (error) { alertLine('Could not save the project. Check your connection and try again.'); return; }
    merge(data); close(); render();
  }
  async function del() {
    const b = $('pf-delete');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; return; }
    const { error } = await sb.from('projects').delete().eq('id', editing.id);
    if (error) { alertLine('Could not delete the project. Try again.'); return; }
    projects = projects.filter(p => p.id !== editing.id); close(); render();
  }
  function alertLine(msg) { const s = $('proj-strip'); const n = document.createElement('div'); n.className = 'proj-err'; n.textContent = msg; s.parentNode.insertBefore(n, s); setTimeout(() => n.remove(), 5000); }
  function merge(row) { const i = projects.findIndex(p => p.id === row.id); if (i >= 0) projects[i] = row; else projects.push(row); }

  async function load() {
    const { data, error } = await sb.from('projects').select('*');
    if (!error) { projects = data || []; render(); }
  }

  function init() {
    buildEditor();
    $('proj-add').addEventListener('click', () => open(null));
    $('proj-show-done').addEventListener('click', () => { showDone = !showDone; render(); });
    $('proj-strip').addEventListener('click', e => { const c = e.target.closest('[data-proj]'); if (c) open(projects.find(p => p.id === c.dataset.proj)); });
    render();
    sb.auth.getSession().then(({ data }) => {
      signedIn = !!data.session; render();
      if (!signedIn) return;
      load();
      sb.channel('projects-live').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, p => {
        if (p.eventType === 'DELETE') projects = projects.filter(x => x.id !== p.old.id); else merge(p.new);
        render();
      }).subscribe();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
