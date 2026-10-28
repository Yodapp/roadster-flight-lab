// Grok-versionen · "Sätt dig vid ratten" – game loop, cameras, input, HUD.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import * as S from './sim.js';
import * as LV from './levels.js';
import {makeRoadster, drawScreen, DRIVER} from './car.js';
import {buildWorld, envMap} from './world.js';
import {createFX, createSpeedLines} from './fx.js';
import {createAudio, buzz} from './audio.js';
import {t, setLang, getLang, fmt, STR} from './strings.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const portrait = () => innerHeight > innerWidth;

// ---------- renderer / quality ----------
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance', stencil: false});
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, .05, 1500);
scene.environment = envMap(renderer); scene.environmentIntensity = .9;
const world = buildWorld(scene);
const car = makeRoadster(); scene.add(car);
const fx = createFX(scene, car, {cap: coarse ? 1600 : 2800});
const speedLines = createSpeedLines($('#lines'));
const audio = createAudio();
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .55, .45, 1.0); composer.addPass(bloom);
composer.addPass(new OutputPass());

const QUAL = [{pr: .75, bloom: false, shadow: 0, fx: .45}, {pr: 1.25, bloom: true, shadow: 1024, fx: .8}, {pr: 2, bloom: true, shadow: 2048, fx: 1}];
const forced = qs.has('q') ? Math.max(0, Math.min(2, +qs.get('q'))) : null;
let tier = forced ?? (coarse ? 1 : 2), qualityMode = forced != null ? 'fixed' : (localStorage.getItem('grok-game-q') || 'auto');
if (qualityMode !== 'auto' && qualityMode !== 'fixed') tier = +qualityMode;
let prScale = 1;
function applyQuality() {
  const q = QUAL[tier], pr = Math.min(devicePixelRatio || 1, q.pr) * prScale;
  renderer.setPixelRatio(pr); renderer.shadowMap.enabled = q.shadow > 0;
  world.moon.castShadow = q.shadow > 0; if (q.shadow) world.setShadowRes(q.shadow);
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  fx.setBudget(q.fx); resize();
  $('#q-label').textContent = qualityMode === 'auto' ? t('auto') + ` (${tier + 1})` : String(tier + 1);
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio()); bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h; camera.updateProjectionMatrix(); fx.setScale(h * renderer.getPixelRatio() * .9);
}
addEventListener('resize', resize);

// ---------- state ----------
let L = null, st = S.createCar({x: -20, z: 6, heading: -.6}), mode = 'menu', camMode = localStorage.getItem('grok-game-cam') || 'cockpit';
let timeScale = 1, slowUntil = 0, slowTarget = 1, shake = 0, simAcc = 0, clock = 0, resultTimer = null, lastResult = null;
const once = new Set();
const fanBtn = $('#b-fan');
let fanOn = false, liftLatch = false, assist = localStorage.getItem('grok-game-assist') !== '0';

// ---------- input ----------
const keys = {}, btn = {}, stick = {x: 0, y: 0, id: null};
addEventListener('keydown', e => {
  if (e.repeat && keys[e.code]) return; keys[e.code] = true; document.body.classList.add('kb');
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && mode === 'play') e.preventDefault();
  if (e.code === 'KeyF' && (mode === 'play' || mode === 'tut')) toggleFan();
  if (e.code === 'KeyC') toggleCam();
  if ((e.code === 'KeyP' || e.code === 'Escape') && (mode === 'play' || mode === 'paused')) togglePause();
  if (e.code === 'KeyR' && mode === 'play' && L?.id === 'sandbox') { S.refill(st); toast('⛽ 250 kg', 'good'); }
  if (e.code === 'Enter' && mode === 'tut') go();
  audio.init();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in btn) btn[k] = false; });
document.querySelectorAll('#controls [data-k]').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); btn[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch {} audio.init(); if (k === 'boost' || k === 'lift') buzz(8); };
  const off = () => { btn[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  b.addEventListener('contextmenu', e => e.preventDefault());
});
{ const pad = $('#stick'), knob = $('#knob');
  const move = e => { const r = pad.getBoundingClientRect(), R = r.width / 2; let dx = (e.clientX - r.left - R) / (R * .75), dy = (e.clientY - r.top - R) / (R * .75); const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } stick.x = dx; stick.y = dy; knob.style.transform = `translate(${dx * R * .55}px,${dy * R * .55}px)`; };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); stick.id = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch {} move(e); audio.init(); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === stick.id) move(e); });
  const end = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end); }
function toggleFan() { fanOn = !fanOn; fanBtn.setAttribute('aria-pressed', String(fanOn)); audio.blip(fanOn ? 520 : 300, .1, 'square', .12); buzz(10); }
fanBtn.addEventListener('pointerdown', e => { e.preventDefault(); audio.init(); toggleFan(); });
$('#b-refill').addEventListener('pointerdown', e => { e.preventDefault(); S.refill(st); toast('⛽ 250 kg', 'good'); });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function readInput() {
  const k = c => keys[c] ? 1 : 0, air = st.mode === 'air';
  const inp = S.emptyInput();
  inp.throttle = Math.max(k('KeyW') || k('ArrowUp'), btn.gas ? 1 : 0, !air && !coarse ? 0 : 0);
  inp.brake = Math.max(k('KeyS') || k('ArrowDown'), btn.brake ? 1 : 0);
  inp.steer = clamp(k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + stick.x, -1, 1);
  inp.roll = inp.steer;
  inp.pitch = clamp(k('KeyS') + k('ArrowDown') - k('KeyW') - k('ArrowUp') + stick.y, -1, 1);
  inp.yaw = clamp(k('KeyE') - k('KeyQ') + (btn.yawR ? 1 : 0) - (btn.yawL ? 1 : 0), -1, 1);
  const liftHeld = !!(keys.Space || btn.lift);
  if (!liftHeld) liftLatch = false;
  if (st.mode === 'ramp' && liftHeld && !liftLatch) { inp.release = true; liftLatch = true; }
  inp.lift = liftHeld && !liftLatch && st.mode !== 'ramp';
  inp.boost = !!(keys.ShiftLeft || keys.ShiftRight || btn.boost);
  inp.fan = fanOn;
  // stability assist: with the stick centred and the car within ~60° of upright, the attitude jets level it out
  if (air && !st.outOfAir && assist) {
    const ax = S.axes(st.q);
    if (ax.up[1] > .5) {
      if (Math.abs(inp.roll) < .1) inp.roll = clamp(-Math.asin(clamp(-ax.right[1], -1, 1)) * 1.6, -.6, .6);
      if (Math.abs(inp.pitch) < .1) inp.pitch = clamp(-Math.asin(clamp(ax.fwd[1], -1, 1)) * 1.6, -.6, .6);
    }
  }
  return inp;
}

// ---------- HUD helpers ----------
let toastTimer = 0;
function toast(text, cls = '', ms = 1300) { const el = $('#toast'); el.textContent = text; el.className = 'on ' + cls; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, ms); }
function cue(text, cls = 'white') { const el = $('#cue'); if (!text) { el.className = ''; return; } if (el.textContent !== text) el.textContent = text; el.className = 'on ' + cls; }
function flash(o = .5) { const f = $('#flash'); f.style.transition = 'none'; f.style.opacity = o; requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; }); }
function slowmo(scale, seconds) { slowTarget = scale; slowUntil = performance.now() + seconds * 1000; }
const airArc = $('#h-airarc'), reserve = $('#h-reserve'), CIRC = 2 * Math.PI * 42;
reserve.style.strokeDasharray = `${CIRC * (1 - S.AIR.usableKg / 250)} ${CIRC}`; reserve.style.strokeDashoffset = `${-CIRC * S.AIR.usableKg / 250}`;
const adi = $('#adi').getContext('2d');
function drawADI(ax) {
  const W = 132, c = W / 2, g = adi; const pitch = Math.asin(clamp(ax.fwd[1], -1, 1)), roll = Math.atan2(-ax.right[1], ax.up[1]);
  g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.clip();
  g.translate(c, c); g.rotate(-roll); const off = pitch * 80 * (ax.up[1] < 0 ? -1 : 1);
  g.fillStyle = '#2f6fae'; g.fillRect(-W, -W * 2 + off, W * 2, W * 2); g.fillStyle = '#5a3d22'; g.fillRect(-W, off, W * 2, W * 2);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-W, off); g.lineTo(W, off); g.stroke();
  g.restore(); g.strokeStyle = '#ffd23f'; g.lineWidth = 4; g.beginPath(); g.moveTo(c - 34, c); g.lineTo(c - 12, c); g.lineTo(c, c + 9); g.lineTo(c + 12, c); g.lineTo(c + 34, c); g.stroke();
}
let screenT = 0;
function updateHUD(dt) {
  const a = st.air, kmh = Math.abs(st.mode === 'air' ? Math.hypot(st.vel[0], st.vel[2]) : st.speed) * 3.6, ax = S.axes(st.q);
  $('#h-kg').textContent = Math.round(a.leftKg); $('#h-bar').textContent = Math.round(a.pressureBar) + ' bar';
  airArc.style.strokeDasharray = `${CIRC * (a.leftKg / 250)} ${CIRC}`;
  $('.g-air').classList.toggle('low', a.usableLeftKg < 40);
  $('#h-suck').style.width = (st.fanSpin * 100).toFixed(0) + '%';
  const onRamp = st.mode === 'ramp'; $('#m-grip').hidden = !onRamp;
  if (onRamp) { const gr = clamp(st.normalN / (S.CAR.mass * 9.81) / 2.5, 0, 1); const gi = $('#h-grip'); gi.style.width = (gr * 100) + '%'; gi.classList.toggle('bad', gr < .12); }
  $('#h-speed').textContent = Math.round(kmh);
  const alt = Math.max(0, st.pos[1] - S.CAR.cg); $('#h-alt').textContent = fmt(alt, 1); const vsEl = $('#h-vs'); vsEl.textContent = fmt(st.vel[1], 1);
  vsEl.classList.toggle('bad', st.mode === 'air' && st.vel[1] < -3);
  drawADI(ax);
  if (L?.id === 'launch') $('#h-clock').textContent = L.stage === 'go' ? fmt(L.info.clock || 0, 2) + ' s' : '';
  else $('#h-clock').textContent = L ? fmt(L.t, 1) + ' s' : '';
  // lift button doubles as release on the ramp
  const lbl = $('#lift-label'); const want = onRamp ? 'release' : 'lift'; if (lbl.dataset.t !== want) { lbl.dataset.t = want; lbl.textContent = t(want); }
  $('#yaw').style.visibility = (st.mode === 'air' || L?.id === 'hop' || L?.id === 'sandbox') ? 'visible' : 'hidden';
  $('#stick-hint').textContent = st.mode === 'air' ? '◄ rull ►' .replace('rull', getLang() === 'sv' ? 'rulla' : 'roll') : '◄ ►';
  // cues
  let c = null, cls = 'white';
  if (st.outOfAir && st.mode === 'air') { c = t('outOfAir'); cls = 'red'; }
  else if (st.mode === 'air') {
    const stop = S.stopDistance(st.vel[1], ax.up[1]);
    if (ax.up[1] < .5 && st.vel[1] < 0 && alt < 25) { c = t('rollUp'); cls = 'yellow'; }
    else if (st.vel[1] < -2 && alt < stop * 1.3 + 1.2) { c = t('brakeNow'); cls = 'red'; }
  } else if (onRamp && st.s / S.RAMP.R > 2.6) { c = t('releaseNow'); cls = 'yellow'; }
  else if (L?.id === 'ramp' && st.mode === 'ground' && !fanOn && st.pos[0] > -40 && !st.flags.released) { c = t('fansOff'); cls = 'yellow'; }
  else if (L?.id === 'kickflip' && st.mode === 'ground' && st.pos[0] > LV.SITE.kick.marker - 6 && st.pos[0] < LV.SITE.kick.marker + 1) { c = t('tooFast'); cls = 'yellow'; }
  else if (L?.id === 'launch' && L.stage === 'stage') { c = null; }
  cue(c, cls);
  // in-car screen
  screenT -= dt; if (screenT <= 0) { screenT = .12; drawScreen(car, {kmh, kg: a.leftKg, bar: a.pressureBar, air: a.fraction}); }
}
function updateTree() {
  const tr = $('#tree'); if (L?.id !== 'launch' || mode !== 'play' && mode !== 'result') { tr.hidden = true; return; }
  tr.hidden = false; const dt = L.t - L.greenAt, bulbs = tr.children, b3 = world.tree.bulbs;
  const state = i => L.status === 'lost' && L.result?.reason === 'jump' ? (i === 4 ? 'red' : '') : i < 3 ? (dt >= -1.5 + i * .5 ? 'amber' : '') : i === 3 ? (dt >= 0 ? 'green' : '') : '';
  const col = {amber: [4, 2.4, .2], green: [.4, 4, 1], red: [4, .2, .2], '': [.08, .08, .08]};
  for (let i = 0; i < 5; i++) { const s = state(i); bulbs[i].className = s; b3[i].material.color.setRGB(...col[s]); }
  for (let i = 0; i < 4; i++) { const k = 'tree' + i, s = state(i); if (s && !once.has(k)) { once.add(k); audio.blip(i === 3 ? 1320 : 660, i === 3 ? .4 : .14, 'square', .16); if (i === 3) { buzz(30); cue(t('go'), 'white'); } } }
}

// ---------- level flow ----------
function startLevel(id) {
  L = LV.createLevel(id, {greenAt: qs.has('green') ? +qs.get('green') : undefined}); st = L.car; once.clear();
  fanOn = false; fanBtn.setAttribute('aria-pressed', 'false');
  liftLatch = false; simAcc = 0; timeScale = 1; slowTarget = 1; shake = 0; fx.clear(); lastResult = null; clearTimeout(resultTimer);
  $('#h-level').textContent = t('lv_' + id); $('#bigtime').hidden = true;
  $('#b-refill').hidden = id !== 'sandbox';
  chase.init = false;
  showOverlay('tut');
  $('#tut-kick').textContent = (LV.LEVEL_IDS.indexOf(id) + 1 ? `${getLang() === 'sv' ? 'NIVÅ' : 'LEVEL'} ${LV.LEVEL_IDS.indexOf(id) + 1}/4` : '');
  $('#tut-title').textContent = t('lv_' + id); $('#tut-text').innerHTML = t('tut_' + id);
  $('#tut-stars').innerHTML = (STR[getLang()]['st_' + id] || []).map(s => `<li>${s}</li>`).join('');
  mode = 'tut'; syncChrome();
}
function go() { audio.init(); showOverlay(null); mode = 'play'; syncChrome(); if (L?.id === 'launch') cue(t('stage'), 'white'); }
function syncChrome() {
  const playing = mode === 'play' || mode === 'paused' || mode === 'result' || mode === 'tut';
  $('#hud').hidden = !playing; $('#controls').hidden = !(playing && (coarse || qs.has('touch')));
  $('#menu').hidden = mode !== 'menu';
}
function showOverlay(id) { for (const o of ['tut', 'result', 'pause']) $('#' + o).hidden = o !== id; }
function togglePause() { if (mode === 'play') { mode = 'paused'; showOverlay('pause'); } else if (mode === 'paused') { mode = 'play'; showOverlay(null); } }
function toMenu() { mode = 'menu'; L = null; showOverlay(null); syncChrome(); renderMenu(); st = S.createCar({x: -20, z: 6, heading: -.6}); fx.clear(); }
function showResult(r) {
  mode = 'result'; showOverlay('result'); const ok = r.success;
  $('#res-kick').textContent = t('lv_' + L.id); $('#res-title').textContent = ok ? t('won') : (r.outOfAir ? t('outOfAir') : t('lost'));
  const stars = $('#res-stars').children; for (let i = 0; i < 3; i++) { stars[i].className = ''; if (ok && i < r.stars) setTimeout(() => { stars[i].className = 'y'; audio.blip(880 + i * 220, .18, 'triangle', .2); }, 350 + i * 300); }
  const reason = ok ? (r.stars ? '' : t('stars0')) : t('r_' + r.reason).replace('{name}', r.landing?.name || L.car.crash?.name || '');
  $('#res-reason').textContent = reason;
  const m = [];
  if (r.t60 != null) { m.push([t('m_t60'), fmt(r.t60, 3) + ' s']); m.push([t('m_reaction'), fmt(r.reaction, 3) + ' s']); m.push(['Tesla', '0,81 s'.replace(',', getLang() === 'sv' ? ',' : '.')]); }
  if (r.landing) { m.push([t('m_vy'), fmt(Math.abs(r.landing.vy), 2) + ' m/s']); m.push([t('m_tilt'), fmt(r.landing.tiltDeg, 0) + '°']); }
  if (r.releaseAngle) m.push([t('m_release'), fmt(r.releaseAngle, 0) + '°']);
  if (r.flipDeg != null) m.push([t('m_flip'), fmt(r.flipDeg, 0) + '°']);
  if (r.spinDeg != null) m.push([t('m_spin'), fmt(r.spinDeg, 0) + '°']);
  if (r.maxAlt != null) m.push([t('m_alt'), fmt(r.maxAlt, 1) + ' m']);
  m.push([t('m_gas'), fmt(r.gasKg, 0) + ' / 250 kg']);
  if (ok) m.push([t('m_score'), fmt(r.score, 0)]);
  $('#res-metrics').innerHTML = m.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  const bestEl = $('#res-best');
  if (ok && L.id !== 'sandbox') { const {best, newBest} = LV.saveResult(L.id, r); bestEl.textContent = newBest ? t('newBest') : `${t('best')}: ${fmt(best.score, 0)}`; bestEl.className = 'best' + (newBest ? ' new' : ''); } else bestEl.textContent = '';
  const fact = $('#res-fact'); fact.hidden = ok && !r.outOfAir; fact.textContent = t('fact');
  const idx = LV.LEVEL_IDS.indexOf(L.id); $('#b-next').hidden = idx < 0 || idx >= LV.LEVEL_IDS.length - 1;
  audio.chime(ok);
}
function renderMenu() {
  const best = LV.loadBest();
  $('#levels').innerHTML = LV.LEVEL_IDS.map((id, i) => { const s = best[id]?.stars || 0;
    return `<button class="lv" data-level="${id}"><span class="n">${i + 1}</span><b>${t('lv_' + id)}</b><p>${t('ds_' + id)}</p><span class="st">${[0, 1, 2].map(k => `<span class="${k < s ? 'y' : ''}">★</span>`).join('')}</span></button>`; }).join('');
  $('#levels').querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => { audio.init(); startLevel(b.dataset.level); }));
  $('#b-assist').setAttribute('aria-pressed', String(assist)); $('#assist-label').textContent = t(assist ? 'on' : 'off');
  $('#b-sound').setAttribute('aria-pressed', String(audio.enabled)); $('#b-sound').firstChild.textContent = audio.enabled ? '🔊 ' : '🔇 ';
}
$('#b-go').addEventListener('click', go);
$('#b-assist').addEventListener('click', () => { assist = !assist; localStorage.setItem('grok-game-assist', assist ? '1' : '0'); renderMenu(); });
$('#b-sandbox').addEventListener('click', () => startLevel('sandbox'));
$('#b-retry').addEventListener('click', () => startLevel(L.id));
$('#b-restart').addEventListener('click', () => startLevel(L.id));
$('#b-resume').addEventListener('click', togglePause);
$('#b-next').addEventListener('click', () => { const i = LV.LEVEL_IDS.indexOf(L.id); startLevel(LV.LEVEL_IDS[Math.min(i + 1, 3)]); });
$('#b-pause').addEventListener('click', togglePause);
document.querySelectorAll('[data-act=menu]').forEach(b => b.addEventListener('click', toMenu));
$('#b-cam').addEventListener('click', toggleCam);
$('#b-sound').addEventListener('click', () => { audio.init(); audio.setEnabled(!audio.enabled); renderMenu(); });
$('#b-quality').addEventListener('click', () => { const order = ['auto', '0', '1', '2']; qualityMode = order[(order.indexOf(qualityMode) + 1) % 4]; localStorage.setItem('grok-game-q', qualityMode); if (qualityMode !== 'auto') tier = +qualityMode; prScale = 1; applyQuality(); });
document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { setLang(b.dataset.lang); renderMenu(); applyQuality(); }));
function toggleCam() { camMode = camMode === 'cockpit' ? 'chase' : 'cockpit'; localStorage.setItem('grok-game-cam', camMode); chase.init = false; toast(t(camMode), '', 700); }

// ---------- events from the sim ----------
function handleEvents() {
  for (const e of st.events.splice(0)) {
    if (e.type === 'takeoff') buzz(12);
    if (e.type === 'rampEnter') { audio.blip(220, .2, 'sine', .2, 2); shake = Math.max(shake, .15); }
    if (e.type === 'release') { slowmo(.3, 1.3); toast(fmt(e.angle, 0) + '°', 'good'); buzz(25); shake = .25; }
    if (e.type === 'detach') { toast(t('r_detached'), 'bad', 2000); }
    if (e.type === 'outOfAir') { toast(t('outOfAir'), 'bad', 2200); audio.blip(200, .5, 'sawtooth', .2, .4); buzz([60, 40, 60]); }
    if (e.type === 'land') {
      const g = e.grade; toast(t(g), g, 1600); shake = Math.min(1.4, .2 + Math.abs(e.vy) * .18);
      audio.thud(Math.min(1, .25 + Math.abs(e.vy) * .15)); buzz(Math.min(200, 20 + Math.abs(e.vy) * 25));
      fx.puff(st.pos, 40 + Math.abs(e.vy) * 20);
      if (g === 'perfect') { slowmo(.35, .6); flash(.18); }
    }
    if (e.type === 'crash') { fx.burst(st.pos); audio.crash(); buzz([90, 50, 140]); shake = 1.6; slowmo(.25, 1.2); flash(.35); car.userData.tailMat.color.setRGB(.3, 0, 0); }
  }
}
function moments() {
  if (st.mode !== 'air' || !L) return;
  if (L.id === 'kickflip' && Math.abs(st.rollAccum) > Math.PI && !once.has('flip')) { once.add('flip'); slowmo(.35, 1); flash(.12); }
  if (L.id === 'hop' && Math.abs(st.yawAccum) > Math.PI && !once.has('spin')) { once.add('spin'); slowmo(.4, .8); }
  if (L.id === 'hop' && st.maxAlt >= 4 && !once.has('h4')) { once.add('h4'); toast('4 m ✓', 'good', 900); audio.blip(1200, .15, 'triangle', .2); }
}

// ---------- cameras ----------
const chase = {pos: new THREE.Vector3(), look: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), init: false};
const eye = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), camLocal = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'YXZ'));
const pitchDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -.1);
function updateCamera(dt, realDt) {
  const p = new THREE.Vector3(...st.pos), speed = Math.hypot(...st.vel);
  let fov;
  if (mode === 'menu') {
    const a = clock * .12; camera.position.set(-20 + Math.cos(a) * 9, 2.4 + Math.sin(clock * .3) * .5, 6 + Math.sin(a) * 9); camera.lookAt(-20, .8, 6);
    fov = portrait() ? 70 : 50; car.userData.canopy.material.opacity = .42;
  } else if (camMode === 'cockpit' && st.mode !== 'crashed') {
    eye.copy(DRIVER).applyMatrix4(car.matrixWorld);
    camera.position.copy(eye); camera.quaternion.copy(car.quaternion).multiply(camLocal).multiply(pitchDown);
    fov = (portrait() ? 78 : 64) + Math.min(10, speed * .25) + (st.thrust.rear > .1 ? 4 : 0);
    car.userData.canopy.material.opacity = .06;
  } else {
    car.userData.canopy.material.opacity = .42;
    const v = new THREE.Vector3(st.vel[0], 0, st.vel[2]);
    if (v.length() > 2) chase.dir.lerp(v.normalize(), 1 - Math.exp(-realDt * 2.5)).normalize();
    else if (st.mode === 'ground') chase.dir.lerp(new THREE.Vector3(Math.cos(st.psi), 0, -Math.sin(st.psi)), 1 - Math.exp(-realDt * 2)).normalize();
    let want, look = p.clone().add(new THREE.Vector3(0, .8, 0));
    if (L?.id === 'ramp' && (st.mode === 'ramp' || st.mode === 'air' || st.flags.rampEntered) || (st.mode === 'ramp')) {
      want = new THREE.Vector3(p.x * .4 - 6, Math.max(4, p.y * .6 + 3), S.RAMP.z0 - 19);
    } else if (L?.id === 'kickflip' && (st.mode === 'air' || p.x > LV.SITE.kick.marker - 4)) {
      want = new THREE.Vector3(p.x - 6, Math.max(3, p.y * .7 + 1.5), LV.SITE.kick.z - 17);
    } else if (L?.id === 'hop') {
      want = new THREE.Vector3(LV.SITE.hop.x - 7, 3 + p.y * .5, LV.SITE.hop.z - 13);
    } else {
      const back = 7.5 + Math.min(4, speed * .1);
      want = p.clone().addScaledVector(chase.dir, -back).add(new THREE.Vector3(0, 2.4 + Math.max(0, p.y - .62) * .3, 0));
      look.addScaledVector(chase.dir, 2.5);
    }
    want.y = Math.max(.6, want.y);
    if (!chase.init) { chase.pos.copy(want); chase.look.copy(look); chase.init = true; }
    chase.pos.lerp(want, 1 - Math.exp(-realDt * 4)); chase.look.lerp(look, 1 - Math.exp(-realDt * 8));
    camera.position.copy(chase.pos); camera.lookAt(chase.look);
    fov = (portrait() ? 72 : 56) + Math.min(8, speed * .2);
  }
  // shake
  const thrustShake = (st.thrust.rear + st.thrust.lift) * .05;
  const s = Math.max(shake, thrustShake); shake *= Math.exp(-realDt * 4);
  if (s > .002) { camera.position.x += (Math.random() - .5) * s * .25; camera.position.y += (Math.random() - .5) * s * .25; camera.rotateZ((Math.random() - .5) * s * .02); }
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-realDt * 6)); camera.updateProjectionMatrix();
  // interior visible only in cockpit
  const inCab = camMode === 'cockpit' && mode !== 'menu' && st.mode !== 'crashed';
  for (const o of car.userData.interior) o.visible = inCab || mode === 'menu';
  for (const o of car.userData.cockpitHide) o.visible = !inCab;
  car.userData.canopy.visible = !inCab;
}

// ---------- car visuals ----------
let wheelSpin = 0, yokeVis = 0;
function updateCar(dt, inp) {
  car.position.set(...st.pos); car.quaternion.set(...st.q);
  const sp = st.mode === 'air' ? 0 : st.speed; wheelSpin -= sp / .36 * dt;
  yokeVis += ((inp?.steer || 0) - yokeVis) * Math.min(1, dt * 12);
  car.userData.yoke.rotation.x = -yokeVis * 1.1;
  car.userData.wheels.forEach((w, i) => { const front = i < 2, left = i % 2 === 1; w.rotation.set(0, (left ? Math.PI : 0) + (front && st.mode === 'ground' ? -st.steerAngle : 0), left ? -wheelSpin : wheelSpin); });
  car.userData.tailMat.color.setRGB(st.mode === 'crashed' ? .3 : (inp?.brake ? 9 : 4), .1, .15);
  st.braking = !!inp?.brake && Math.abs(st.speed) > 6 && st.mode === 'ground';
}

// ---------- adaptive quality ----------
const perf = {acc: 0, n: 0, good: 0, ms: 16, fps: 60};
function adapt(realDt) {
  perf.acc += realDt; perf.n++;
  if (perf.acc < 1.5) return;
  const ms = perf.acc / perf.n * 1000; perf.ms = ms; perf.fps = 1000 / ms; perf.acc = 0; perf.n = 0;
  if (qualityMode !== 'auto' || document.hidden) return;
  if (ms > 24) { if (prScale > .7) prScale -= .15; else if (tier > 0) { tier--; prScale = 1; } else return; perf.good = 0; applyQuality(); }
  else if (ms < 14) { if (++perf.good >= 3 && (prScale < 1 || tier < (coarse ? 1 : 2))) { if (prScale < 1) prScale = Math.min(1, prScale + .15); else tier++; perf.good = 0; applyQuality(); } }
  else perf.good = 0;
}

// ---------- main loop ----------
let last = performance.now(), lastInp = S.emptyInput();
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(.05, (now - last) / 1000); last = now; clock += realDt;
  if (now > slowUntil) slowTarget = 1;
  timeScale += (slowTarget - timeScale) * Math.min(1, realDt * 10);
  if (mode === 'play') {
    simAcc += realDt * timeScale;
    let n = 0;
    while (simAcc >= S.STEP && n++ < 60) {
      let inp = readInput(); inp = LV.gateInput(L, inp); lastInp = inp;
      S.step(st, inp, S.STEP, LV.WORLD); handleEvents(); moments();
      const r = LV.update(L, S.STEP);
      if (L.id === 'sandbox' && (Math.abs(st.pos[0]) > 300 || Math.abs(st.pos[2]) > 300)) { L.car = st = S.createCar({x: -30, z: 20}); }
      if (r && !lastResult) {
        lastResult = r;
        if (L.id === 'launch' && r.success) { const bt = $('#bigtime'); bt.hidden = false; bt.textContent = fmt(r.t60, 2) + ' s'; slowmo(.3, 1); flash(.2); }
        if (r.reason === 'jump') { toast(t('r_jump'), 'bad', 1600); audio.blip(160, .5, 'sawtooth', .25); }
        resultTimer = setTimeout(() => showResult(r), r.success ? 1600 : 1400);
      }
      if (L.id === 'sandbox' && st.mode === 'crashed' && !once.has('sbcrash')) { once.add('sbcrash'); setTimeout(() => { L.car = st = S.createCar({x: -30, z: 20}); once.delete('sbcrash'); }, 1800); }
      simAcc -= S.STEP;
    }
    if (st.mode === 'crashed' && L?.id !== 'sandbox' && !lastResult) LV.update(L, 0);
  } else if (mode === 'result') {
    // let the car coast to a stop for the outro
    simAcc += realDt * timeScale; while (simAcc >= S.STEP) { S.step(st, {...S.emptyInput(), brake: .6, fan: fanOn}, S.STEP, LV.WORLD); st.events.length = 0; simAcc -= S.STEP; }
  }
  updateCar(realDt * timeScale, mode === 'play' ? lastInp : null);
  car.updateMatrixWorld();
  updateCamera(realDt * timeScale, realDt);
  fx.update(realDt * timeScale, st, new THREE.Vector3(...st.vel), clock);
  world.update(clock);
  // shadow light follows the action
  world.moon.position.set(st.pos[0] - 20, 40, st.pos[2] + 15); world.moon.target.position.set(st.pos[0], 0, st.pos[2]); world.moon.target.updateMatrixWorld();
  if (mode !== 'menu') { updateHUD(realDt); updateTree(); }
  const sp = Math.hypot(...st.vel); speedLines(mode === 'play' ? clamp((sp - 12) / 20, 0, 1) * (camMode === 'cockpit' ? 1 : .6) + (st.thrust.rear > .1 ? .35 : 0) : 0, realDt);
  audio.update({speed: st.mode === 'air' ? sp : st.speed, throttle: lastInp.throttle, grounded: st.mode === 'ground' || st.mode === 'ramp', fan: st.fanSpin, rear: st.thrust.rear, lift: st.thrust.lift, att: (st.thrust.roll || 0) + (st.thrust.pitch || 0) + (st.thrust.yaw || 0)});
  if (QUAL[tier].bloom) composer.render(); else renderer.render(scene, camera);
  adapt(realDt);
}

// ---------- boot ----------
setLang(getLang()); applyQuality(); renderMenu(); syncChrome();
car.position.set(...st.pos); car.quaternion.set(...st.q);
requestAnimationFrame(t0 => { last = t0; frame(t0); $('#loading').classList.add('done'); });
if (qs.has('level')) startLevel(qs.get('level'));
if (qs.has('cam')) camMode = qs.get('cam');
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') togglePause(); });
// test / debug hook
window.game = {get mode() { return mode; }, get car() { return st; }, get level() { return L; }, get perf() { return {...perf, tier, prScale, pr: renderer.getPixelRatio()}; },
  start: startLevel, go, menu: toMenu, get camMode() { return camMode; }, setCam(m) { camMode = m; chase.init = false; }, slowmo, renderer};
