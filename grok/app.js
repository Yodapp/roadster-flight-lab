// Grok fork: landing page controller. Numbers render immediately; 3D loads lazily.
import {t, setLang, getLang, num} from './i18n.js';
import {TESLA, DEFAULT_CAR, budget, thrustTime, storage, G} from './physics.js';
import {TIMELINES} from './timeline.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const state = {stunt: 'ramp', mode: 'sonic', T0C: 20, mass: DEFAULT_CAR.mass,
  ramp: {releaseHeight: 20, flipTime: 1.2, liftKN: 60}, kickflip: {speedKmh: 50, rowHeight: 4.0, liftKN: 60},
  hop: {height: 4, liftKN: 60, spins: 1}, launch: {time: 0.81, mu: 1.5, powerKW: 1100}};

// Slider definitions per stunt: [key, min, max, step, unit, decimals]
const CONTROLS = {
  ramp: [['releaseHeight', 8, 30, 1, 'm', 0], ['flipTime', .6, 2.5, .1, 's', 1], ['liftKN', 30, 100, 5, 'kN', 0]],
  kickflip: [['speedKmh', 20, 90, 5, 'km/h', 0], ['rowHeight', 1.5, 5, .1, 'm', 1], ['liftKN', 30, 100, 5, 'kN', 0]],
  hop: [['height', 1, 8, .5, 'm', 1], ['liftKN', 30, 100, 5, 'kN', 0], ['spins', 0, 2, .5, '', 1]],
  launch: [['time', .6, 2, .01, 's', 2], ['mu', .8, 2.5, .1, '', 1], ['powerKW', 300, 1500, 50, 'kW', 0]],
};
const IDS = ['ramp', 'kickflip', 'hop', 'launch'];

function car() { return {...DEFAULT_CAR, mass: state.mass}; }
function opts() { return {car: car(), mode: state.mode, T0C: state.T0C, ramp: state.ramp, kickflip: state.kickflip, hop: state.hop, launch: state.launch}; }
function timelineFor(id) { return TIMELINES[id](opts()); }

// ---------- hero key numbers ----------
function renderHero() {
  const b = budget('sonic', 20), st = storage(20), claim = thrustTime(80, 5.5, 'sonic', 20), lo = thrustTime(80, 5.5, 'bell', 20);
  $('#k-p').textContent = `${num(st.realBar)} bar`;
  $('#k-i').textContent = `≈ ${num(b.impulseKNs)} kN·s`;
  $('#k-t').textContent = `≈ ${num(b.fullThrust80s, 1)} s`;
  $("#k-m").textContent = `${num(Math.round(lo.airNeededKg / 10) * 10)}–${num(Math.round(claim.airNeededKg / 10) * 10)} kg`;
}

// ---------- stunt panel ----------
let theatre = null, current = null;
function renderControls() {
  const box = $('#stunt-controls'); box.innerHTML = '';
  for (const [key, min, max, step, unit, d] of CONTROLS[state.stunt]) {
    const wrap = document.createElement('label'); wrap.className = key === 'cushion' ? 'ctl check' : 'ctl';
    if (key === 'cushion') {
      wrap.innerHTML = `<input type="checkbox" ${state.kickflip.cushion ? 'checked' : ''}> <span>${t('p.cushion')}</span>`;
      wrap.querySelector('input').addEventListener('change', e => { state.kickflip.cushion = e.target.checked; update(); });
    } else {
      const v = state[state.stunt][key];
      wrap.innerHTML = `<span class="lbl">${t('p.' + key)} <b>${num(v, d)} ${unit}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}">`;
      wrap.querySelector('input').addEventListener('input', e => { state[state.stunt][key] = +e.target.value; wrap.querySelector('b').textContent = `${num(+e.target.value, d)} ${unit}`; update(); });
    }
    box.append(wrap);
  }
}

function bar(kg, budgetKg = TESLA.gasKg) {
  const pct = Math.min(100, kg / budgetKg * 100), over = kg > budgetKg;
  return `<div class="gasbar ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div>`;
}

function renderResult(tl) {
  const s = tl.stunt, gas = s.gasKg ?? tl.samples.at(-1).gasUsed, b = budget(state.mode, state.T0C);
  const fits = s.impulseKNs <= b.impulseKNs;
  const parts = Object.entries(s.parts || {}).filter(([k]) => k !== 'marginPct').map(([k, v]) => `${t('part.' + k)} ${num(v)} kN·s`).join(' · ');
  let extra = '';
  if (s.id === 'kickflip' && s.possible) extra = `<li>${getLang() === 'sv' ? 'Topphöjd (tyngdpunkt)' : 'Apex (CG)'} <b>${num(s.apex, 1)} m</b> · ${getLang() === 'sv' ? 'luftfärd' : 'airtime'} ${num(s.airtime, 1)} s · ${getLang() === 'sv' ? 'hopplängd' : 'jump length'} <b>${num(s.distance)} m</b> · ${getLang() === 'sv' ? 'dragkraft/vikt' : 'thrust/weight'} ${num(s.twr, 2)}</li>`;
  if (s.id === 'kickflip' && !s.possible) extra = `<li class="bad">${t('ph.nolift')}</li>`;
  if (s.id === 'launch') extra = `<li>${num(s.accelG, 2)} g · ${getLang() === 'sv' ? 'jets topp' : 'jets peak'} <b>${num(s.peakThrustKN)} kN</b> · ${getLang() === 'sv' ? 'snitteffekt' : 'avg power'} <b>${num(s.avgPowerKW / 1000, 2)} MW</b> · ${getLang() === 'sv' ? 'däckandel' : 'tyre share'} ${num(s.tyreShare * 100)} %</li>`;
  if (s.id === 'hop' && s.possible) extra = `<li>${getLang() === 'sv' ? 'Dragkraft/vikt' : 'Thrust/weight'} <b>${num(s.twr, 2)}</b> · ${getLang() === 'sv' ? 'lyftbränning' : 'lift burn'} ${num(s.upBurn, 2)} s · ${getLang() === 'sv' ? 'luftfärd' : 'airtime'} ${num(s.flight, 1)} s</li>`;
  if (s.id === 'hop' && !s.possible) extra = `<li class="bad">${t('ph.nolift')}</li>`;
  if (s.id === 'ramp') extra = `<li>${getLang() === 'sv' ? 'Fritt fall utan jets' : 'Free-fall impact without jets'}: <b>${num(s.freeFallImpact * 3.6)} km/h</b></li>`;
  $('#stunt-result').innerHTML = `
    <div class="big ${fits ? 'ok' : 'bad'}"><span>${num(gas)} kg</span><small>${t('r.ofBudget')} · ${num(gas / TESLA.gasKg * 100)} %</small></div>
    ${bar(gas)}
    <p class="${fits ? 'ok' : 'bad'}">${fits ? t('r.fits') : t('r.nofit')}</p>
    <ul class="facts"><li>${t('r.impulse')}: <b>${num(s.impulseKNs, 1)} kN·s</b> ${parts ? `(${parts}, +15 %)` : ''}</li>${extra}</ul>`;
}

function renderAll() {
  const rows = IDS.map(id => { const tl = TIMELINES[id](opts()); return {id, gas: tl.stunt.gasKg ?? tl.samples.at(-1).gasUsed, I: tl.stunt.impulseKNs}; });
  const b = budget(state.mode, state.T0C);
  $('#all-stunts').innerHTML = rows.map(r => `<div class="row"><span>${t('s.' + r.id)}</span>${bar(r.gas)}<b>${num(r.gas)} kg</b></div>`).join('') +
    `<div class="row total"><span>Σ</span>${bar(rows.reduce((a, r) => a + r.gas, 0))}<b>${num(rows.reduce((a, r) => a + r.gas, 0))} kg</b></div>
     <p class="note">${t('all.note')} ${getLang() === 'sv' ? 'Användbart ur en laddning' : 'Usable from one charge'}: ≈ ${num(b.usableGasKg)} kg / ${num(b.impulseKNs)} kN·s.</p>`;
}

function update({restart = true} = {}) {
  current = timelineFor(state.stunt);
  renderResult(current); renderAll();
  $('#stunt-title').textContent = t(`s.${state.stunt}.title`);
  $('#stunt-desc').textContent = t(`s.${state.stunt}.desc`);
  if (theatre) { theatre.setTimeline(current, {keepCamera: !restart}); if (restart) theatre.restart(); }
  else hud({...current.sample(0), t: 0, duration: current.duration, height: 0});
}

let lastHud = 0;
function hud(s) {
  const now = performance.now(); if (now - lastHud < 60 && s.t < s.duration) return; lastHud = now;
  const left = Math.max(0, TESLA.gasKg - (s.gasUsed || 0));
  $('#hud-time').textContent = `${num(s.t, 1)} s`;
  $('#hud-height').textContent = `${num(Math.max(0, s.height), 1)} m`;
  $('#hud-speed').textContent = state.stunt === 'launch' ? `${num(s.speed / 0.44704)} mph` : `${num(s.speed * 3.6)} km/h`;
  $('#hud-gas').textContent = `${num(left)} kg`;
  $('#hud-gasbar').style.width = `${left / TESLA.gasKg * 100}%`;
  $('#hud-phase').textContent = t('ph.' + s.phase);
  if (state.stunt === 'launch' && s.clock != null) $('#hud-time').textContent = `${num(s.clock, 2)} s`;
  const p = $('#scrub'); if (p && document.activeElement !== p) p.value = s.t / s.duration * 1000;
  $('#play').textContent = theatre?.playing ? t('btn.pause') : t('btn.play');
}

async function load3D() {
  const canvas = $('#theatre');
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('no webgl');
    const {createTheatre} = await import('./scene.js');
    theatre = createTheatre(canvas, {onFrame: hud});
    window.grok = {get theatre() { return theatre; }, get timeline() { return current; }};
    theatre.onEnd(() => hud({...current.sample(current.duration), t: current.duration, duration: current.duration, height: 0}));
    theatre.setTimeline(current); theatre.play();
    $('#stage').classList.add('ready');
  } catch (err) {
    console.warn('3D unavailable:', err);
    $('#stage').classList.add('fallback'); $('#stage-msg').innerHTML = t('webgl.fail');
  }
}

// ---------- impulse gauge ----------
const gauge = {thrust: 80, seconds: 5.5, mode: 'sonic', T0C: 20};
function renderGauge() {
  const r = thrustTime(gauge.thrust, gauge.seconds, gauge.mode, gauge.T0C);
  $('#g-thrust-v').textContent = `${num(gauge.thrust)} kN`; $('#g-sec-v').textContent = `${num(gauge.seconds, 1)} s`;
  $('#g-thrust').value = gauge.thrust; $('#g-sec').value = gauge.seconds;
  const frac = r.impulseKNs / r.budgetKNs, maxFrac = 6, ang = Math.min(frac, maxFrac) / maxFrac;
  // Semi-circular dial: 0 → budget ×6. Green up to 1× budget.
  const arc = (a0, a1) => { const p = a => [100 - 80 * Math.cos(Math.PI * a), 100 - 80 * Math.sin(Math.PI * a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0},${y0} A80,80 0 0 1 ${x1},${y1}`; };
  $('#dial-ok').setAttribute('d', arc(0, 1 / maxFrac)); $('#dial-bad').setAttribute('d', arc(1 / maxFrac, 1));
  $('#dial-val').setAttribute('d', arc(0, Math.max(.002, ang)));
  $('#dial-val').setAttribute('class', frac <= 1 ? 'val ok' : 'val bad');
  const ta = Math.PI / maxFrac, c = Math.cos(ta), sn = Math.sin(ta), tick = $('#budget-tick line'), lab = $('#budget-label');
  tick.setAttribute('x1', 100 - 68 * c); tick.setAttribute('y1', 100 - 68 * sn); tick.setAttribute('x2', 100 - 94 * c); tick.setAttribute('y2', 100 - 94 * sn);
  lab.setAttribute('x', 100 - 60 * c + 6); lab.setAttribute('y', 100 - 60 * sn + 4); lab.textContent = getLang() === 'sv' ? '1 laddning' : '1 charge';
  $('#dial-text').textContent = `${num(r.impulseKNs)} kN·s`;
  $('#dial-sub').textContent = `${num(frac, 1)} × ${getLang() === 'sv' ? 'den användbara impulsen i en laddning' : 'the usable impulse of one charge'}`;
  $('#g-need').innerHTML = `${t('g.need')} <b>${num(r.airNeededKg)} kg</b> ${t('g.air')} · <b>${num(r.timesTank, 1)}</b> × 250 kg`;
  $('#g-status').innerHTML = r.fits ? `<span class="ok">${t('g.ok')}</span> (${num(r.gasKg)} kg)` : `<span class="bad">${t('g.no')} ${num(r.shortfallKNs)} kN·s</span>`;
  $('#g-flow').textContent = `${t('g.flow')}: ${num(r.massFlowKgS)} kg/s · ${t('g.max')}: ${num(r.maxSecondsAtThrust, 2)} s · vₑ ≈ ${num(r.meanVe)} m/s`;
}
function bindGauge() {
  $('#g-thrust').addEventListener('input', e => { gauge.thrust = +e.target.value; renderGauge(); });
  $('#g-sec').addEventListener('input', e => { gauge.seconds = +e.target.value; renderGauge(); });
  $('#g-mode').addEventListener('change', e => { gauge.mode = e.target.value; renderGauge(); });
  $('#g-temp').addEventListener('input', e => { gauge.T0C = +e.target.value; $('#g-temp-v').textContent = `${num(gauge.T0C)} °C`; renderGauge(); });
  for (const b of $$('[data-preset]')) b.addEventListener('click', () => {
    const p = b.dataset.preset, bud = budget(gauge.mode, gauge.T0C);
    if (p === 'claim') Object.assign(gauge, {thrust: 80, seconds: 5.5});
    if (p === 'max') Object.assign(gauge, {thrust: 80, seconds: Math.round(bud.impulseKNs / 80 * 10) / 10});
    if (p === 'hover') Object.assign(gauge, {thrust: Math.round(state.mass * G / 1000), seconds: 2});
    if (p === 'avg') Object.assign(gauge, {thrust: Math.round(bud.impulseKNs / 5), seconds: 5});
    renderGauge();
  });
}

// ---------- wiring ----------
function bindStunts() {
  for (const b of $$('[data-stunt]')) b.addEventListener('click', () => {
    state.stunt = b.dataset.stunt; $$('[data-stunt]').forEach(x => x.setAttribute('aria-selected', x === b)); renderControls(); update();
  });
  $('#mass').addEventListener('input', e => { state.mass = +e.target.value; $('#mass-v').textContent = `${num(state.mass)} kg`; update(); });
  $('#mode').addEventListener('change', e => { state.mode = e.target.value; update({restart: false}); });
  $('#temp').addEventListener('input', e => { state.T0C = +e.target.value; $('#temp-v').textContent = `${num(state.T0C)} °C`; update({restart: false}); });
  $('#play').addEventListener('click', () => { if (!theatre) return; theatre.playing ? theatre.pause() : theatre.play(); hud({...current.sample(theatre.time), t: theatre.time, duration: current.duration, height: current.sample(theatre.time).y - .62}); });
  $('#replay').addEventListener('click', () => theatre?.restart());
  $('#rate').addEventListener('change', e => theatre?.setRate(+e.target.value));
  for (const b of $$('[data-cam]')) b.addEventListener('click', () => { theatre?.setCamera(b.dataset.cam); $$('[data-cam]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#scrub').addEventListener('input', e => { if (!theatre) return; theatre.pause(); theatre.seek(e.target.value / 1000 * current.duration); });
}

function applyLang(l) {
  setLang(l);
  $$('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l));
  renderHero(); renderControls(); update({restart: false}); renderGauge();
  $('#temp-v').textContent = `${num(state.T0C)} °C`; $('#mass-v').textContent = `${num(state.mass)} kg`; $('#g-temp-v').textContent = `${num(gauge.T0C)} °C`;
}

$$('[data-lang]').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)));
bindStunts(); bindGauge(); applyLang(getLang());
// Defer 3D until the browser is idle or the theatre is near the viewport.
const start3D = () => { if (!start3D.done) { start3D.done = true; load3D(); } };
new IntersectionObserver(([e]) => { if (e.isIntersecting) start3D(); }, {rootMargin: '600px'}).observe($('#stage'));
if (window.requestIdleCallback) requestIdleCallback(start3D, {timeout: 2500}); else setTimeout(start3D, 1200);
