/* Life goals: a five-year slider from day 1 (5 Oct 2026) to 3 Jan 2032, over an illustration of the
   Chittering block that builds itself up as time moves forward. Milestones and the land fund live in
   the settings table under 'life_goals'. */
(function () {
  const START = '2026-10-05', END = '2032-01-03', KEY = 'life_goals';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const days = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
  const today = () => iso(new Date());
  const TOTAL = days(START, END);
  const PCOL = { mindset: 'var(--p-mindset)', physical: 'var(--p-physical)', financial: 'var(--p-financial)', philosophical: 'var(--p-philosophical)' };
  const PNAME = { mindset: 'Mindset', physical: 'Physical', financial: 'Financial', philosophical: 'Philosophical' };
  const money = n => '$' + Math.round(n).toLocaleString('en-AU');

  let data = { fund: { target: null, saved: null }, milestones: [] }, pos = Math.max(0, Math.min(TOTAL, days(START, today()))), loaded = false;

  const css = `
  .viewsw{display:inline-flex;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:3px;gap:2px;margin-bottom:18px}
  .viewsw button{background:none;border:0;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:500;color:var(--muted)}
  .viewsw button.on{background:var(--surface2);color:var(--text);box-shadow:inset 0 0 0 1px var(--gold-line)}
  .lg-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:16px}
  .lg-hero h1{font-weight:300;font-size:clamp(34px,5vw,58px);line-height:1.02;letter-spacing:-.03em;margin-top:8px}
  .lg-hero h1 em{font-style:normal;color:var(--gold);font-weight:400}
  .lg-hero .sub{color:var(--muted);font-size:13px;margin-top:8px}
  .fund{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;min-width:260px;cursor:pointer}
  .fund:hover{border-color:var(--gold-line)}
  .fund .k{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
  .fund .v{font-size:26px;font-weight:300;letter-spacing:-.02em;margin-top:4px}
  .fund .v small{font-size:13px;color:var(--muted);letter-spacing:0}
  .fund .bar{height:6px;background:rgba(255,255,255,.07);border-radius:3px;margin-top:8px;overflow:hidden}
  .fund .bar i{display:block;height:100%;background:var(--gold);border-radius:3px;transition:width .5s}
  .stage{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--border2);aspect-ratio:1000/330;min-height:220px;background:#0e1424;box-shadow:0 20px 50px rgba(0,0,0,.45)}
  .stage svg{position:absolute;inset:0;width:100%;height:100%;display:block}
  .stage .u{transition:opacity .7s ease,transform .7s ease;transform-box:fill-box;transform-origin:50% 100%}
  .stage .u.off{opacity:0;transform:translateY(6px) scale(.96)}
  .stage .sky,.stage .sun{transition:all .6s ease}
  .stage .hud{position:absolute;left:18px;top:16px;right:18px;display:flex;justify-content:space-between;gap:12px;pointer-events:none;text-shadow:0 1px 10px rgba(0,0,0,.55)}
  .hud .when{font-size:28px;font-weight:300;letter-spacing:-.02em;line-height:1}
  .hud .yr{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-top:6px}
  .hud .card{background:rgba(8,10,18,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px;max-width:340px;text-align:right}
  .hud .card .k{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.7)}
  .hud .card .t{font-size:15px;font-weight:500;margin-top:3px;line-height:1.3}
  .hud .card .m{font-size:11px;color:rgba(255,255,255,.7);margin-top:3px}
  .stage .home-badge{position:absolute;left:50%;top:18px;transform:translateX(-50%);background:rgba(214,178,94,.95);color:#120f05;font-weight:600;font-size:13px;letter-spacing:.06em;padding:7px 14px;border-radius:20px;opacity:0;transition:opacity .6s;pointer-events:none;white-space:nowrap}
  .stage.home .home-badge{opacity:1}
  .slider{position:relative;margin:22px 4px 8px;padding-top:30px}
  .slider .track{position:relative;height:10px;border-radius:5px;background:rgba(255,255,255,.07)}
  .slider .fill{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:linear-gradient(90deg,rgba(214,178,94,.35),var(--gold))}
  .slider .done{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:repeating-linear-gradient(45deg,rgba(255,255,255,.12) 0 4px,transparent 4px 8px)}
  .slider input[type=range]{position:absolute;left:-4px;right:-4px;top:22px;width:calc(100% + 8px);height:26px;margin:0;background:none;-webkit-appearance:none;appearance:none;cursor:grab;z-index:3}
  .slider input[type=range]:active{cursor:grabbing}
  .slider input[type=range]::-webkit-slider-runnable-track{height:26px;background:transparent}
  .slider input[type=range]::-moz-range-track{height:26px;background:transparent}
  .slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;border-radius:50%;background:var(--gold);border:4px solid var(--bg);box-shadow:0 0 0 2px var(--gold),0 6px 18px rgba(214,178,94,.45);margin-top:-2px}
  .slider input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--gold);border:4px solid var(--bg);box-shadow:0 0 0 2px var(--gold)}
  .slider input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 2px var(--gold),0 0 0 6px rgba(214,178,94,.35)}
  .slider .mk{position:absolute;top:30px;width:14px;height:14px;margin-left:-7px;margin-top:-2px;border-radius:50%;background:var(--bg);border:2px solid var(--muted);z-index:2;cursor:pointer;padding:0}
  .slider .mk.done{background:var(--gold);border-color:var(--gold)}
  .slider .mk.final{width:22px;height:22px;margin-left:-11px;margin-top:-6px;border-color:var(--gold);background:var(--bg);box-shadow:0 0 0 4px rgba(214,178,94,.18)}
  .slider .mk.final::after{content:'⌂';position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:var(--gold);line-height:1}
  .slider .now{position:absolute;top:0;transform:translateX(-50%);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text);white-space:nowrap}
  .slider .now::after{content:'';position:absolute;left:50%;top:16px;width:1px;height:14px;background:var(--text);opacity:.6}
  .years{position:relative;height:30px;margin:8px 4px 0}
  .years span{position:absolute;transform:translateX(-50%);font-size:11px;color:var(--muted);top:0;white-space:nowrap}
  .years span::before{content:'';position:absolute;left:50%;top:-14px;width:1px;height:8px;background:var(--dim)}
  .slider-acts{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:var(--muted)}
  .slider-acts .btns{display:flex;gap:6px}
  .lg-years{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-top:26px}
  .lg-col{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;min-height:150px}
  .lg-col.cur{border-color:var(--gold-line);box-shadow:inset 0 0 0 1px var(--gold-line)}
  .lg-col h4{font-weight:300;font-size:22px;letter-spacing:-.02em}
  .lg-col .yl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
  .ms{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--border);cursor:pointer}
  .ms:first-of-type{border-top:0}
  .ms .ck{width:18px;height:18px;border-radius:50%;border:1.6px solid var(--dim);flex-shrink:0;margin-top:1px;position:relative;background:none;padding:0}
  .ms.done .ck{background:var(--gold);border-color:var(--gold)}
  .ms.done .ck::after{content:'';position:absolute;left:5px;top:2px;width:4px;height:8px;border:2px solid #120f05;border-top:0;border-left:0;transform:rotate(45deg)}
  .ms .mt{font-size:13px;line-height:1.35}
  .ms.done .mt{color:var(--muted);text-decoration:line-through;text-decoration-color:rgba(255,255,255,.25)}
  .ms .md{font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-top:3px}
  .ms.final .mt{color:var(--gold);font-weight:500}
  .ms.sel{background:rgba(214,178,94,.06);border-radius:8px;margin:0 -6px;padding:8px 6px}
  .lg-add{margin-top:10px}
  .lg-modal{position:fixed;inset:0;z-index:25;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.6)}
  .lg-modal form{background:var(--surface);border:1px solid var(--border2);border-radius:14px;width:min(420px,100%);padding:20px;display:grid;gap:12px}
  .lg-modal h3{font-weight:300;font-size:22px}
  .lg-modal .acts{display:flex;justify-content:space-between;gap:8px;margin-top:4px}
  .lg-modal .acts div{display:flex;gap:8px}
  @media (max-width:1050px){.lg-years{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media (max-width:700px){.stage .home-badge{display:none}.lg-years{grid-template-columns:1fr 1fr}.stage{aspect-ratio:auto;height:250px}.hud .when{font-size:22px}.hud .card{max-width:190px;padding:8px 10px}.hud .card .t{font-size:13px}.years span{font-size:10px}.lg-hero{align-items:stretch}.fund{min-width:0;flex:1}}
  @media (prefers-reduced-motion:reduce){.stage .u,.stage .sky,.stage .sun{transition:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- the Chittering block ---------- */
  const gum = (x, base, h, k) => `<g class="u" data-at="${k}"><path d="M${x},${base} C${x - 2},${base - h * .4} ${x + 3},${base - h * .6} ${x - 1},${base - h * .78} M${x},${base - h * .55} L${x + h * .18},${base - h * .78} M${x - 1},${base - h * .65} L${x - h * .2},${base - h * .86}" stroke="#e6dccb" stroke-width="${Math.max(2, h * .06)}" stroke-linecap="round" fill="none"/>
    ${[[0, -.95, .28], [-.22, -.86, .22], [.22, -.84, .22], [.1, -1.02, .18], [-.12, -1.0, .17]].map(([dx, dy, r]) => `<ellipse cx="${x + dx * h}" cy="${base + dy * h}" rx="${r * h * 1.25}" ry="${r * h * .78}" fill="#5f7a4a" opacity=".95"/>`).join('')}
    ${[[-.06, -1.0, .14], [.16, -.9, .12]].map(([dx, dy, r]) => `<ellipse cx="${x + dx * h}" cy="${base + dy * h}" rx="${r * h * 1.2}" ry="${r * h * .7}" fill="#7d9660" opacity=".8"/>`).join('')}</g>`;
  function scene() {
    const posts = Array.from({ length: 26 }, (_, i) => `<rect x="${i * 40 + 6}" y="262" width="4" height="26" rx="1" fill="#6b5236"/>`).join('');
    return `<svg viewBox="0 0 1000 330" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Our block in Chittering, building up over five years">
      <defs>
        <linearGradient id="lgsky" x1="0" y1="0" x2="0" y2="1"><stop class="sky" id="s0" offset="0" stop-color="#1b2347"/><stop class="sky" id="s1" offset=".6" stop-color="#7a5a7a"/><stop class="sky" id="s2" offset="1" stop-color="#f3a06b"/></linearGradient>
        <radialGradient id="lgsun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2c4"/><stop offset=".35" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
        <linearGradient id="lgpad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2a96a"/><stop offset="1" stop-color="#8a7446"/></linearGradient>
        <linearGradient id="lgdam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb2d6"/><stop offset="1" stop-color="#3f6f94"/></linearGradient>
        <radialGradient id="lgwin" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".7"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1000" height="330" fill="url(#lgsky)"/>
      <circle class="sun" id="lgSun" cx="760" cy="210" r="70" fill="url(#lgsun)"/>
      <g id="lgStars" opacity="0">${Array.from({ length: 40 }, (_, i) => { const r = n => { const x = Math.sin((i + n) * 977) * 1e4; return x - Math.floor(x); }; return `<circle cx="${(r(1) * 1000).toFixed(0)}" cy="${(r(2) * 120).toFixed(0)}" r="${(r(3) * 1.2 + .4).toFixed(1)}" fill="#fff"/>`; }).join('')}</g>
      <path d="M0,170 C120,140 220,150 320,135 C430,118 520,150 640,138 C760,126 860,150 1000,132 L1000,330 L0,330 Z" fill="#5a6a4f" opacity=".75"/>
      <path d="M0,205 C150,180 260,196 380,182 C500,168 620,200 760,186 C860,176 930,190 1000,182 L1000,330 L0,330 Z" fill="#7a7f52"/>
      <path d="M0,232 C180,218 340,228 520,220 C700,212 840,228 1000,220 L1000,330 L0,330 Z" fill="url(#lgpad)"/>
      ${Array.from({ length: 60 }, (_, i) => { const x = (i * 53) % 1000, y = 240 + (i * 17) % 70; return `<path d="M${x},${y} l2,-6 l2,6" stroke="#9c8650" stroke-width="1" fill="none" opacity=".6"/>`; }).join('')}
      ${gum(90, 238, 92, .2)}${gum(930, 232, 104, .26)}${gum(860, 230, 64, .32)}${gum(330, 224, 58, .38)}
      <g class="u" data-at=".42"><ellipse cx="730" cy="270" rx="96" ry="18" fill="url(#lgdam)"/><ellipse cx="730" cy="268" rx="70" ry="9" fill="#a6cde6" opacity=".35"/><path d="M640,272 q90,16 180,0" stroke="#6b5236" stroke-width="3" fill="none" opacity=".35"/></g>
      <g class="u" data-at=".52"><rect x="150" y="190" width="110" height="52" fill="#6f7d6a"/><path d="M144,192 L205,166 L266,192 Z" fill="#8a9a8f"/><rect x="186" y="210" width="38" height="32" fill="#3f4a40"/>
        ${[0, 1, 2].map(i => `<line x1="${186 + i * 13}" y1="210" x2="${186 + i * 13}" y2="242" stroke="#566458" stroke-width="1"/>`).join('')}</g>
      <g class="u" data-at=".6"><path d="M150,191 L205,168 L240,183 L185,206 Z" fill="#1d2f52"/>${[0, 1, 2, 3].map(i => `<line x1="${161 + i * 14}" y1="${186 - i * 5.6}" x2="${196 + i * 14}" y2="${201 - i * 5.6}" stroke="#4a6ea8" stroke-width="1"/>`).join('')}</g>
      <g class="u" data-at=".66"><rect x="282" y="198" width="34" height="44" rx="4" fill="#9fb0b0"/><ellipse cx="299" cy="198" rx="17" ry="4" fill="#b8c8c8"/>${[0, 1, 2, 3].map(i => `<line x1="282" y1="${206 + i * 9}" x2="316" y2="${206 + i * 9}" stroke="#869797" stroke-width="1"/>`).join('')}</g>
      <g class="u" data-at=".72">${[0, 1, 2, 3].map(i => `<rect x="${340 + i * 22}" y="${262 + (i % 2) * 2}" width="16" height="30" rx="3" fill="#6b4c2a"/><path d="M${342 + i * 22},${266 + (i % 2) * 2} q6,-8 12,0 m-12,8 q6,-8 12,0 m-12,8 q6,-8 12,0" stroke="#7fae4f" stroke-width="2.2" fill="none"/>`).join('')}</g>
      <g class="u" data-at=".78"><rect x="440" y="276" width="34" height="20" fill="#a0522d"/><path d="M436,278 L457,264 L478,278 Z" fill="#7a3d22"/><rect x="452" y="284" width="8" height="12" fill="#3a1d10"/>
        <circle cx="486" cy="294" r="4" fill="#f2efe6"/><circle cx="494" cy="296" r="3.5" fill="#c8833a"/><circle cx="480" cy="298" r="3.5" fill="#f2efe6"/></g>
      <g class="u" data-at=".86">
        <rect x="520" y="178" width="200" height="66" fill="#e9e2d3"/><path d="M506,182 L620,138 L734,182 Z" fill="#8a9a9f"/><path d="M500,190 L740,190 L740,196 L500,196 Z" fill="#7b8a8f"/>
        ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${508 + i * 45}" y="196" width="4" height="48" fill="#cbbfa8"/>`).join('')}
        <rect x="604" y="208" width="30" height="36" fill="#6b4c2a"/>
        <rect id="lgWin1" x="540" y="206" width="40" height="22" fill="#2a3346"/><rect id="lgWin2" x="660" y="206" width="40" height="22" fill="#2a3346"/>
        <rect x="676" y="148" width="12" height="26" fill="#9a8c7a"/>
        <g id="lgLight" opacity="0"><circle cx="560" cy="217" r="40" fill="url(#lgwin)"/><circle cx="680" cy="217" r="40" fill="url(#lgwin)"/></g>
      </g>
      <g class="u" data-at=".95"><path d="M770,252 L770,240 Q771,236 776,235 L792,234 L800,224 Q802,222 806,222 L818,222 L818,252 Z" fill="#e8e6df"/><rect x="818" y="226" width="58" height="26" rx="2" fill="#d9d6cc"/>
        <rect x="824" y="230" width="22" height="8" rx="1" fill="#2a3346"/><rect x="850" y="230" width="22" height="8" rx="1" fill="#2a3346"/><line x1="820" y1="222" x2="874" y2="222" stroke="#6b6f7a" stroke-width="2"/>
        <rect x="766" y="248" width="114" height="6" rx="2" fill="#4a4f5a"/><circle cx="790" cy="256" r="9" fill="#1b1d22"/><circle cx="790" cy="256" r="3.5" fill="#8a8f9e"/><circle cx="858" cy="256" r="9" fill="#1b1d22"/><circle cx="858" cy="256" r="3.5" fill="#8a8f9e"/></g>
      <g class="u" data-at="1" id="lgSmoke">${[0, 1, 2].map(i => `<circle cx="${682 + i * 5}" cy="${140 - i * 12}" r="${5 + i * 2}" fill="#d9d6cc" opacity="${.35 - i * .1}"/>`).join('')}</g>
      <g class="u" data-at=".12">${posts}<line x1="0" y1="268" x2="1000" y2="268" stroke="#8a7a5a" stroke-width="1"/><line x1="0" y1="279" x2="1000" y2="279" stroke="#8a7a5a" stroke-width="1"/></g>
      <g class="u" data-at=".08"><rect x="928" y="236" width="5" height="52" fill="#6b5236"/><rect x="872" y="232" width="118" height="24" rx="3" fill="#3b2c1c"/><text x="931" y="248" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="10" font-weight="600" letter-spacing=".5" fill="#e9dcc0">CHITTERING · 10 HA</text></g>
    </svg>`;
  }
  const mix = (a, b, t) => { const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const A = h(a), B = h(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  function paint() {
    const stage = $('#lgStage'); if (!stage) return;
    const p = pos / TOTAL;
    stage.querySelectorAll('.u').forEach(g => g.classList.toggle('off', p < Number(g.dataset.at)));
    /* sky: pre-dawn at the start, bright day through the middle, golden dusk with lights on at the end */
    const sky = p < .5 ? [mix('#1b2347', '#4f86c6', p * 2), mix('#7a5a7a', '#9cc4e4', p * 2), mix('#f3a06b', '#e9eef0', p * 2)]
      : [mix('#4f86c6', '#2a2550', (p - .5) * 2), mix('#9cc4e4', '#c96a5a', (p - .5) * 2), mix('#e9eef0', '#f7b46a', (p - .5) * 2)];
    ['#s0', '#s1', '#s2'].forEach((id, i) => stage.querySelector(id).setAttribute('stop-color', sky[i]));
    const sun = stage.querySelector('#lgSun'); sun.setAttribute('cy', String(p < .5 ? 210 - p * 2 * 150 : 60 + (p - .5) * 2 * 140)); sun.setAttribute('cx', String(820 - p * 240));
    stage.querySelector('#lgStars').setAttribute('opacity', p > .92 ? String((p - .92) / .08 * .8) : '0');
    const lit = p >= .97; stage.querySelector('#lgLight').setAttribute('opacity', lit ? '1' : '0');
    ['#lgWin1', '#lgWin2'].forEach(id => stage.querySelector(id).setAttribute('fill', lit ? '#ffd27a' : '#2a3346'));
    stage.classList.toggle('home', pos >= TOTAL);
    /* heads-up: where you are on the road, and the next milestone from there */
    const d = addDays(START, pos), dt = parseD(d), yearN = Math.min(5, Math.floor(pos / (TOTAL / 5)) + 1);
    $('#lgWhen').textContent = pos >= TOTAL ? '3 January 2032' : dt.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
    $('#lgYr').textContent = pos >= TOTAL ? `Day ${(TOTAL + 1).toLocaleString('en-AU')} · Home` : `Year ${yearN} of 5 · day ${(pos + 1).toLocaleString('en-AU')} of ${(TOTAL + 1).toLocaleString('en-AU')}`;
    const ms = sorted(), next = ms.find(m => m.date >= d) || ms[ms.length - 1];
    if (next) { const away = days(d, next.date);
      $('#lgCard').innerHTML = `<div class="k">${away <= 0 ? 'Milestone' : 'Next milestone'}</div><div class="t">${esc(next.title)}</div><div class="m">${parseD(next.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}${away > 0 ? ` · ${away > 60 ? Math.round(away / 30.4) + ' months' : away + ' days'} away` : ''}${next.done ? ' · done ✓' : ''}</div>`; }
    $('#lgFill').style.width = (p * 100) + '%';
    document.querySelectorAll('.ms').forEach(el => el.classList.toggle('sel', next && el.dataset.ms === next.id));
  }

  /* ---------- page ---------- */
  const sorted = () => data.milestones.slice().sort((a, b) => a.date.localeCompare(b.date));
  const pct = d => Math.max(0, Math.min(100, days(START, d) / TOTAL * 100));
  function render() {
    const root = $('#viewGoals'); if (!root) return;
    const f = data.fund || {}, fp = f.target ? Math.min(100, (f.saved || 0) / f.target * 100) : 0, t = today(), tp = pct(t);
    const ms = sorted(), doneN = ms.filter(m => m.done).length;
    root.innerHTML = `
      <div class="lg-hero"><div><div class="eyebrow">The five-year build</div><h1>Our block in Chittering.<br><em>10 hectares. Home.</em></h1>
        <div class="sub">5 Oct 2026 to 3 Jan 2032 · ${doneN} of ${ms.length} milestones done · drag the slider to walk the road</div></div>
        <button type="button" class="fund" id="lgFund"><div class="k">Land fund</div><div class="v">${f.target ? `${money(f.saved || 0)} <small>of ${money(f.target)}</small>` : '<small>Tap to set your target</small>'}</div><div class="bar"><i style="width:${fp}%"></i></div></button></div>
      <div class="stage" id="lgStage">${scene()}<div class="hud"><div><div class="when" id="lgWhen"></div><div class="yr" id="lgYr"></div></div><div class="card" id="lgCard"></div></div><div class="home-badge">Welcome home</div></div>
      <div class="slider"><div class="now" style="left:${tp}%;${tp < 6 ? "transform:translateX(-6px)" : tp > 94 ? "transform:translateX(-100%)" : ""}">Today</div>
        <div class="track"><div class="done" style="width:${tp}%"></div><div class="fill" id="lgFill"></div></div>
        ${ms.map(m => `<button type="button" class="mk${m.done ? ' done' : ''}${m.final ? ' final' : ''}" style="left:${pct(m.date)}%" data-jump="${m.date}" title="${esc(m.title)} · ${parseD(m.date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}" aria-label="Jump to ${esc(m.title)}"></button>`).join('')}
        <input type="range" id="lgRange" min="0" max="${TOTAL}" step="1" value="${pos}" aria-label="Move through the five years"></div>
      <div class="years">${['2027', '2028', '2029', '2030', '2031', '2032'].map(y => `<span style="left:${pct(y + '-01-01')}%">${y}</span>`).join('')}</div>
      <div class="slider-acts"><span>Drag, or use the arrow keys. Tap a dot to jump to a milestone.</span><span class="btns"><button type="button" class="btn sm" data-jump="${t}">Today</button><button type="button" class="btn sm gold" data-jump="${END}">Show me home</button></span></div>
      <div class="lg-years">${yearCols(ms)}</div>`;
    paint();
  }
  function yearCols(ms) {
    const cols = [['Year 1', '2026-10-05', '2027-10-04'], ['Year 2', '2027-10-05', '2028-10-04'], ['Year 3', '2028-10-05', '2029-10-04'], ['Year 4', '2029-10-05', '2030-10-04'], ['Year 5', '2030-10-05', '2031-12-31'], ['Home', '2032-01-01', '2099-12-31']];
    const t = today();
    return cols.map(([n, a, b]) => { const list = ms.filter(m => m.date >= a && m.date <= b), cur = t >= a && t <= b;
      return `<div class="lg-col${cur ? ' cur' : ''}"><h4>${n}</h4><div class="yl">${n === 'Home' ? '3 Jan 2032' : parseD(a).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) + ' to ' + parseD(b).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}${cur ? ' · now' : ''}</div>
        ${list.map(m => `<div class="ms${m.done ? ' done' : ''}${m.final ? ' final' : ''}" data-ms="${m.id}"><button type="button" class="ck" data-done="${m.id}" aria-label="${m.done ? 'Mark not done' : 'Mark done'}: ${esc(m.title)}"></button><div><div class="mt">${esc(m.title)}</div><div class="md" style="color:${PCOL[m.pillar] || 'var(--muted)'}">${PNAME[m.pillar] || ''} · ${parseD(m.date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</div></div></div>`).join('') || `<div class="hint" style="padding:6px 0">Nothing here yet.</div>`}
        <button type="button" class="btn sm ghost lg-add" data-addms="${n === 'Home' ? END : (b > END ? END : addDays(a, 182))}">+ Add</button></div>`; }).join('');
  }

  /* ---------- saving + editing ---------- */
  async function save() { const { error } = await sb.from('settings').upsert({ key: KEY, value: data, updated_at: new Date().toISOString() }); if (error) { console.error(error); toast && toast("Couldn't save that."); } }
  const toast = window.lgToast;
  function editMilestone(id, presetDate) {
    const m = id ? data.milestones.find(x => x.id === id) : { id: 'm' + Date.now().toString(36), date: presetDate || today(), title: '', pillar: 'financial', done: false };
    const el = document.createElement('div'); el.className = 'lg-modal';
    el.innerHTML = `<form autocomplete="off"><h3>${id ? 'Edit milestone' : 'New milestone'}</h3>
      <label class="f">What<input id="lm-t" required maxlength="90" value="${esc(m.title)}" placeholder="e.g. Deposit saved"></label>
      <label class="f">By when<input id="lm-d" type="date" required min="${START}" max="${END}" value="${m.date}"></label>
      <label class="f">Pillar<select id="lm-p">${Object.entries(PNAME).map(([k, v]) => `<option value="${k}"${m.pillar === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="acts"><div>${id && !m.final ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}</div><div><button type="button" class="btn" data-x>Cancel</button><button type="submit" class="btn gold">Save</button></div></div></form>`;
    document.body.appendChild(el); setTimeout(() => el.querySelector('#lm-t').focus(), 30);
    el.addEventListener('click', async e => {
      if (e.target === el || e.target.closest('[data-x]')) return el.remove();
      const del = e.target.closest('[data-del]'); if (del) { if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = 'Tap again'; return; } data.milestones = data.milestones.filter(x => x.id !== id); el.remove(); render(); await save(); }
    });
    el.querySelector('form').addEventListener('submit', async e => { e.preventDefault();
      m.title = el.querySelector('#lm-t').value.trim(); m.date = el.querySelector('#lm-d').value; m.pillar = el.querySelector('#lm-p').value; if (!m.title || !m.date) return;
      if (!id) data.milestones.push(m); el.remove(); pos = days(START, m.date); render(); await save(); });
  }
  function editFund() {
    const f = data.fund || {}, el = document.createElement('div'); el.className = 'lg-modal';
    el.innerHTML = `<form autocomplete="off"><h3>Land fund</h3><p class="hint" style="font-size:12px">What you're putting away for the block. Update it whenever you check the account.</p>
      <label class="f">Target ($)<input id="lf-t" type="number" min="0" step="100" inputmode="decimal" value="${f.target ?? ''}" placeholder="e.g. deposit + costs"></label>
      <label class="f">Saved so far ($)<input id="lf-s" type="number" min="0" step="100" inputmode="decimal" value="${f.saved ?? ''}"></label>
      <div class="acts"><div></div><div><button type="button" class="btn" data-x>Cancel</button><button type="submit" class="btn gold">Save</button></div></div></form>`;
    document.body.appendChild(el); setTimeout(() => el.querySelector('#lf-t').focus(), 30);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) el.remove(); });
    el.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); const n = v => v === '' ? null : Number(v);
      data.fund = { target: n(el.querySelector('#lf-t').value), saved: n(el.querySelector('#lf-s').value) }; el.remove(); render(); await save(); });
  }

  document.addEventListener('input', e => { if (e.target.id === 'lgRange') { pos = +e.target.value; paint(); } });
  document.addEventListener('click', async e => {
    if (!e.target.closest('#viewGoals')) return;
    const j = e.target.closest('[data-jump]'); if (j) { pos = Math.max(0, Math.min(TOTAL, days(START, j.dataset.jump))); $('#lgRange').value = pos; paint(); return; }
    const dn = e.target.closest('[data-done]'); if (dn) { e.stopPropagation(); const m = data.milestones.find(x => x.id === dn.dataset.done); m.done = !m.done; render(); await save(); return; }
    const ms = e.target.closest('[data-ms]'); if (ms) return editMilestone(ms.dataset.ms);
    const ad = e.target.closest('[data-addms]'); if (ad) return editMilestone(null, ad.dataset.addms);
    if (e.target.closest('#lgFund')) return editFund();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = document.querySelector('.lg-modal'); if (m) m.remove(); } });

  async function load() {
    const { data: r } = await sb.from('settings').select('value').eq('key', KEY).maybeSingle();
    if (r && r.value) data = { fund: { target: null, saved: null }, milestones: [], ...r.value };
    loaded = true; render();
  }
  window.LifeGoals = { show() { if (!loaded) load(); else render(); } };
})();
