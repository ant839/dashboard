/* Weekly to-dos: a recurring routine by weekday. Ticks are saved per date, so each week starts fresh. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const DAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  let tasks = [], checks = new Set(), signedIn = false, editing = false, selDay = todayIdx();

  function todayIdx() { return (new Date().getDay() + 6) % 7; } /* 0 = Monday */
  function weekDates() {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const mon = new Date(now); mon.setDate(now.getDate() - todayIdx());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  }
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const key = (id, date) => id + '|' + date;

  function tasksFor(dayIdx) {
    const dn = dayIdx + 1;
    const on = tasks.filter(t => t.days.includes(dn)).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
    const tops = on.filter(t => !t.parent_id);
    const kids = id => on.filter(t => t.parent_id === id);
    return { daily: tops.filter(t => t.kind === 'daily'), specific: tops.filter(t => t.kind === 'specific'), kids };
  }
  function isDone(t, date, kids) {
    const ch = kids(t.id);
    return ch.length ? ch.every(c => checks.has(key(c.id, date))) : checks.has(key(t.id, date));
  }
  function countFor(dayIdx, date) {
    const { daily, specific, kids } = tasksFor(dayIdx);
    let total = 0, done = 0;
    [...daily, ...specific].forEach(t => { const ch = kids(t.id); const items = ch.length ? ch : [t]; items.forEach(i => { total++; if (checks.has(key(i.id, date))) done++; }); });
    return { total, done };
  }

  function render() {
    const body = $('rt-body'); if (!body) return;
    $('rt-edit').hidden = !signedIn;
    $('rt-edit').textContent = editing ? 'Done' : 'Edit';
    if (!signedIn) { body.innerHTML = '<div class="rt-empty">Sign in to see your weekly to-dos.</div>'; $('rt-days').innerHTML = ''; $('rt-count').textContent = ''; return; }
    const dates = weekDates(), tIdx = todayIdx();
    $('rt-days').innerHTML = dates.map((d, i) => {
      const c = countFor(i, iso(d));
      const state = c.total && c.done === c.total ? ' all' : c.done ? ' some' : '';
      return `<button type="button" class="rt-day${i === selDay ? ' on' : ''}${i === tIdx ? ' today' : ''}${state}" data-day="${i}" aria-pressed="${i === selDay}" aria-label="${DAY_NAME[i]} ${d.getDate()}">
        <span class="rt-dl">${DAY_LETTER[i]}</span><span class="rt-dn">${d.getDate()}</span><span class="rt-dot"></span></button>`;
    }).join('');
    const date = iso(dates[selDay]);
    const { daily, specific, kids } = tasksFor(selDay);
    const c = countFor(selDay, date);
    $('rt-count').textContent = c.total ? `${c.done}/${c.total}` : '';
    $('rt-prog').style.width = c.total ? Math.round(c.done / c.total * 100) + '%' : '0%';

    const item = (t, sub) => {
      const ch = kids(t.id), done = isDone(t, date, kids);
      const del = editing ? `<button type="button" class="rt-del" data-del="${t.id}" aria-label="Remove ${esc(t.title)}">×</button>` : '';
      const row = `<div class="rt-item${sub ? ' sub' : ''}">
        <button type="button" class="task-check${done ? ' done' : ''}" data-tick="${t.id}" aria-label="${done ? 'Untick' : 'Tick'} ${esc(t.title)}" aria-pressed="${done}"></button>
        <span class="task-text${done ? ' done' : ''}">${esc(t.title)}</span>${del}</div>`;
      return row + ch.map(k => item(k, true)).join('');
    };
    let html = '';
    if (!daily.length && !specific.length) {
      html = selDay === 6 && !editing ? '<div class="rt-empty rt-rest">Rest day. Nothing scheduled.</div>' : '<div class="rt-empty">Nothing scheduled for this day.</div>';
    } else {
      if (daily.length) html += `<div class="rt-sec">Every day</div>` + daily.map(t => item(t)).join('');
      if (specific.length) html += `<div class="rt-sec">${DAY_NAME[selDay]} focus</div>` + specific.map(t => item(t)).join('');
    }
    if (editing) {
      html += `<form class="rt-add" id="rt-add" autocomplete="off">
        <input id="rt-new" placeholder="New to-do..." maxlength="80" aria-label="New to-do">
        <select id="rt-when" aria-label="Repeat">
          <option value="day">Every ${DAY_NAME[selDay]}</option>
          <option value="daily">Every day (Mon to Sat)</option>
        </select>
        <button class="btn btn-icon" type="submit" aria-label="Add">+</button>
      </form>`;
    }
    body.innerHTML = html;
    const f = $('rt-add'); if (f) f.addEventListener('submit', add);
  }

  async function tick(id) {
    const date = iso(weekDates()[selDay]);
    const t = tasks.find(x => x.id === id); if (!t) return;
    const ch = tasks.filter(x => x.parent_id === id && x.days.includes(selDay + 1));
    const targets = ch.length ? ch : [t];
    const allDone = targets.every(x => checks.has(key(x.id, date)));
    targets.forEach(x => allDone ? checks.delete(key(x.id, date)) : checks.add(key(x.id, date)));
    render();
    const res = allDone
      ? await sb.from('routine_checks').delete().eq('day', date).in('task_id', targets.map(x => x.id))
      : await sb.from('routine_checks').upsert(targets.map(x => ({ task_id: x.id, day: date })), { onConflict: 'task_id,day', ignoreDuplicates: true });
    if (res.error) { flash('Could not save that tick. Check your connection.'); load(); }
  }
  async function add(e) {
    e.preventDefault();
    const title = $('rt-new').value.trim(); if (!title) return;
    const daily = $('rt-when').value === 'daily';
    const row = { title, kind: daily ? 'daily' : 'specific', days: daily ? [1, 2, 3, 4, 5, 6] : [selDay + 1], sort: 100 + tasks.length };
    const { data, error } = await sb.from('routine_tasks').insert(row).select().single();
    if (error) { flash('Could not add that to-do. Try again.'); return; }
    tasks.push(data); render(); setTimeout(() => $('rt-new')?.focus(), 20);
  }
  async function del(btn) {
    const id = btn.dataset.del, t = tasks.find(x => x.id === id); if (!t) return;
    if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Remove?'; btn.classList.add('armed'); setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = '×'; btn.classList.remove('armed'); } }, 3000); return; }
    let res;
    if (t.kind === 'daily') res = await sb.from('routine_tasks').delete().eq('id', id);
    else if (t.days.length > 1) res = await sb.from('routine_tasks').update({ days: t.days.filter(d => d !== selDay + 1) }).eq('id', id);
    else res = await sb.from('routine_tasks').delete().eq('id', id);
    if (res.error) { flash('Could not remove that to-do. Try again.'); return; }
    load();
  }
  function flash(msg) { const b = $('rt-body'); const n = document.createElement('div'); n.className = 'proj-err'; n.textContent = msg; b.prepend(n); setTimeout(() => n.remove(), 5000); }

  async function load() {
    const dates = weekDates();
    const [t, c] = await Promise.all([
      sb.from('routine_tasks').select('*'),
      sb.from('routine_checks').select('task_id,day').gte('day', iso(dates[0])).lte('day', iso(dates[6]))
    ]);
    if (t.error || c.error) { flash('Could not load your to-dos. Refresh to try again.'); return; }
    tasks = t.data || []; checks = new Set((c.data || []).map(r => key(r.task_id, r.day))); render();
  }

  function init() {
    const card = $('rt-card'); if (!card) return;
    $('rt-edit').addEventListener('click', () => { editing = !editing; render(); });
    $('rt-days').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) { selDay = +b.dataset.day; render(); } });
    $('rt-body').addEventListener('click', e => {
      const t = e.target.closest('[data-tick]'); if (t) return tick(t.dataset.tick);
      const d = e.target.closest('[data-del]'); if (d) return del(d);
    });
    render();
    sb.auth.getSession().then(({ data }) => {
      signedIn = !!data.session; render(); if (!signedIn) return;
      load();
      sb.channel('routine-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_checks' }, load)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_tasks' }, load)
        .subscribe();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { selDay = todayIdx(); load(); } });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
