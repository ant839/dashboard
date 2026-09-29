/* Shared PT logic: loading clients and sessions, working out where each client is up to, and ticking sessions. */
(function () {
  const PLAN_LABEL = { weekly: 'Weekly', period: 'Time period', pack: 'Session pack' };
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

  const store = { clients: [], sessions: [] };

  async function load(sinceDays = 400) {
    const since = addDays(iso(today()), -sinceDays);
    const [c, s] = await Promise.all([
      sb.from('pt_clients').select('*'),
      sb.from('pt_sessions').select('id,client_id,day,created_at').gte('day', since)
    ]);
    if (c.error || s.error) throw (c.error || s.error);
    store.clients = c.data || []; store.sessions = s.data || [];
    return store;
  }

  const sessionsOf = (id) => store.sessions.filter(x => x.client_id === id);
  const hasSession = (id, day) => store.sessions.some(x => x.client_id === id && x.day === day);

  /* Where a client is up to. level: ok | warn | bad */
  function status(c, onDay) {
    const ref = onDay || iso(today());
    const mine = sessionsOf(c.id);
    if (c.plan === 'weekly') {
      const ws = weekStart(ref), we = addDays(ws, 6);
      const n = mine.filter(x => x.day >= ws && x.day <= we).length;
      const target = c.sessions_per_week || 0;
      return { level: 'ok', line: target ? `${n}/${target} this week` : `${n} this week`, used: n, total: target, pct: target ? Math.min(100, Math.round(n / target * 100)) : 0 };
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
    const size = c.pack_size || 0, rem = size - used;
    let level = 'ok';
    if (rem <= 0 || (left !== null && left < 0)) level = 'bad'; else if (rem <= 2 || (left !== null && left <= 7)) level = 'warn';
    return { level, line: `${used}/${size} used · ${rem <= 0 ? 'pack finished' : rem + ' left'}${c.period_end ? ' · ' + endTxt : ''}`, used, total: size, remaining: rem, pct: size ? Math.min(100, Math.round(used / size * 100)) : 0, daysLeft: left };
  }

  function scheduledOn(day) {
    const wd = weekday(day);
    return store.clients.filter(c => c.active && (c.days || []).includes(wd));
  }
  function trainedOn(day) {
    const ids = new Set(store.sessions.filter(x => x.day === day).map(x => x.client_id));
    return store.clients.filter(c => ids.has(c.id));
  }
  function needsAttention() {
    return store.clients.filter(c => c.active && c.plan !== 'weekly').map(c => ({ c, s: status(c) })).filter(x => x.s.level !== 'ok')
      .sort((a, b) => (a.s.level === 'bad' ? 0 : 1) - (b.s.level === 'bad' ? 0 : 1) || a.c.name.localeCompare(b.c.name));
  }

  async function tick(clientId, day) {
    const { data, error } = await sb.from('pt_sessions').insert({ client_id: clientId, day }).select('id,client_id,day,created_at').single();
    if (error) throw error;
    store.sessions.push(data); return data;
  }
  async function untick(clientId, day) {
    const s = store.sessions.filter(x => x.client_id === clientId && x.day === day).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
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
      .subscribe();
  }

  window.PT = { PLAN_LABEL, DAY_SHORT, store, load, status, sessionsOf, hasSession, scheduledOn, trainedOn, needsAttention, tick, untick, removeSession, subscribe,
    iso, parseD, today, addDays, addMonths, daysBetween, weekday, weekStart, fmt, esc };
})();
