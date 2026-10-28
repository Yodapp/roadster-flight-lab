// Grok-versionen · level rules, scoring and stars. Pure and testable.
import {createCar, MPH60, CAR, RAMP, AIR} from './sim.js';

export const SITE = Object.freeze({
  drag: {z: -42, x0: 0, finish: 120},
  ramp: {z: 0},
  kick: {z: 44, rowMid: 11, marker: -10},
  hop: {z: 88, x: 0, padR: 4.5},
});
// Five stylised vehicles parked side by side across the kickflip lane (no logos). [name, width along x, height, length]
export const ROW = [['Cybercab', 1.95, 1.45, 4.2], ['Cybertruck', 2.2, 1.79, 5.7], ['Semi', 2.55, 4.0, 7.0], ['Model Y', 1.92, 1.62, 4.8], ['Model 3', 1.85, 1.44, 4.7]];
export function rowBoxes(z = SITE.kick.z, mid = SITE.kick.rowMid) {
  const total = ROW.reduce((a, r) => a + r[1], 0) + 0.8 * (ROW.length - 1); let x = mid - total / 2; const out = [];
  for (const [name, w, h, l] of ROW) { out.push({name, min: [x, 0, z - l / 2], max: [x + w, h, z + l / 2]}); x += w + 0.8; }
  return out;
}
export const WORLD = Object.freeze({ramp: true, obstacles: rowBoxes()});

export const LEVEL_IDS = ['launch', 'ramp', 'kickflip', 'hop'];
const STAR_TXT = {launch: ['≤ 2,6 s', '≤ 0,81 s', '≤ 0,81 s & ≤ 35 kg'], ramp: ['land', 'good', 'perfect'], kickflip: ['clear', '360', 'good'], hop: ['4m', '360', 'perfect']};
export const starRules = id => STAR_TXT[id];

const GRADE_RANK = {hard: 1, good: 2, perfect: 3};

/** Create level runtime. opts.greenAt fixes the launch light (tests). */
export function createLevel(id, opts = {}) {
  const L = {id, status: 'ready', t: 0, result: null, info: {}, stage: ''};
  if (id === 'launch') {
    L.car = createCar({x: SITE.drag.x0, z: SITE.drag.z});
    L.greenAt = opts.greenAt ?? 2.4 + Math.random() * 1.2; L.moveAt = null; L.stage = 'stage';
  } else if (id === 'ramp') {
    L.car = createCar({x: -46, z: SITE.ramp.z}); L.stage = 'approach';
  } else if (id === 'kickflip') {
    L.car = createCar({x: -70, z: SITE.kick.z, speed: 50 / 3.6}); L.stage = 'approach';
    L.rowEnd = Math.max(...WORLD.obstacles.map(o => o.max[0]));
  } else if (id === 'hop') {
    L.car = createCar({x: SITE.hop.x, z: SITE.hop.z}); L.stage = 'pad';
  } else if (id === 'sandbox') {
    L.car = createCar({x: -30, z: 20}); L.stage = 'free';
  } else throw new RangeError('Unknown level ' + id);
  return L;
}

function finish(L, success, data) {
  L.status = success ? 'won' : 'lost';
  L.result = {success, stars: 0, score: 0, ...data, gasKg: L.car.air.usedKg, outOfAir: L.car.outOfAir};
  return L.result;
}

/** Filter inputs (e.g. the launch handbrake) – call before sim.step. Returns possibly modified input. */
export function gateInput(L, inp) {
  if (L.id === 'launch' && L.stage === 'stage') {
    if (L.t >= L.greenAt) { L.stage = 'go'; }
    else if (inp.throttle > 0.05 || inp.boost) { finish(L, false, {reason: 'jump'}); return {...inp, throttle: 0, boost: false}; }
    else return {...inp, throttle: 0, boost: false, lift: false};
  }
  if (L.id === 'launch') return {...inp, lift: false, steer: inp.steer * 0.25};
  return inp;
}

/** Call after each sim step. Returns L.result once finished. */
export function update(L, dt) {
  if (L.status !== 'ready' && L.status !== 'play') return L.result;
  L.status = 'play'; L.t += dt;
  const c = L.car;
  if (c.mode === 'crashed') return finish(L, false, {reason: c.crash.reason, landing: c.landing});
  if (L.id === 'launch') {
    if (L.stage !== 'go') return null;
    if (L.moveAt == null && c.speed > 0.05) L.moveAt = L.t - dt;
    L.info.clock = L.moveAt == null ? 0 : L.t - L.moveAt;
    if (c.speed >= MPH60 && L.moveAt != null) {
      const t60 = L.t - L.moveAt, reaction = L.moveAt - L.greenAt, gas = c.air.usedKg;
      const stars = t60 <= 0.81 && gas <= 35 ? 3 : t60 <= 0.81 ? 2 : t60 <= 2.6 ? 1 : 0;
      return finish(L, true, {t60, reaction, stars, metric: t60, score: Math.round(10000 / t60 - gas * 10)});
    }
    if (L.t - L.greenAt > 8) return finish(L, false, {reason: 'slow'});
    return null;
  }
  if (L.id === 'ramp') {
    if (c.mode === 'ramp') L.stage = 'ramp';
    if (c.mode === 'air') L.stage = 'air';
    if (c.flags.released && c.mode === 'ground' && c.landing) {
      L.stage = 'landed';
      const g = c.landing.grade, stars = g === 'perfect' ? 3 : g === 'good' ? 2 : 1;
      return finish(L, true, {stars, landing: c.landing, metric: Math.abs(c.landing.vy), releaseAngle: c.flags.releaseAngle,
        score: Math.round(1000 + GRADE_RANK[g] * 500 + c.air.usableLeftKg * 5)});
    }
    if (c.flags.detached && c.mode === 'ground' && c.landing) return finish(L, false, {reason: 'detached'});
    if (L.t > 120) return finish(L, false, {reason: 'time'});
    return null;
  }
  if (L.id === 'kickflip') {
    if (c.mode === 'air') L.stage = 'air';
    if (c.mode === 'ground' && c.pos[0] > L.rowEnd + 0.5) {
      if (!c.landing) return finish(L, false, {reason: 'around'});
      const g = c.landing.grade, flip = Math.abs(c.rollAccum) >= 330 * Math.PI / 180;
      const stars = 1 + (flip ? 1 : 0) + (flip && GRADE_RANK[g] >= 2 ? 1 : 0);
      return finish(L, true, {stars, landing: c.landing, flipDeg: Math.abs(c.rollAccum) * 180 / Math.PI, metric: Math.abs(c.landing.vy),
        score: Math.round(1000 + (flip ? 1500 : 0) + GRADE_RANK[g] * 400 + c.air.usableLeftKg * 5)});
    }
    if (c.mode === 'ground' && c.speed < 0.2 && c.landing && c.pos[0] <= L.rowEnd) return finish(L, false, {reason: 'short'});
    if (c.pos[0] > 400 || L.t > 90) return finish(L, false, {reason: 'time'});
    return null;
  }
  if (L.id === 'hop') {
    if (c.mode === 'air') L.stage = 'air';
    if (c.mode === 'ground' && c.landing && c.landing.t > 0) {
      const d = Math.hypot(c.pos[0] - SITE.hop.x, c.pos[2] - SITE.hop.z), high = c.maxAlt >= 4;
      if (!high) { if (c.maxAlt > 0.3) return finish(L, false, {reason: 'low', maxAlt: c.maxAlt}); return null; }
      if (d > SITE.hop.padR) return finish(L, false, {reason: 'offpad'});
      const spin = Math.abs(c.yawAccum) >= 330 * Math.PI / 180, g = c.landing.grade;
      const stars = 1 + (spin ? 1 : 0) + (spin && g === 'perfect' ? 1 : 0);
      return finish(L, true, {stars, landing: c.landing, maxAlt: c.maxAlt, spinDeg: Math.abs(c.yawAccum) * 180 / Math.PI, metric: c.maxAlt,
        score: Math.round(1000 + c.maxAlt * 100 + (spin ? 1500 : 0) + GRADE_RANK[g] * 400 + c.air.usableLeftKg * 5)});
    }
    if (L.t > 90) return finish(L, false, {reason: 'time'});
    return null;
  }
  return null; // sandbox never ends
}

// ---------- best scores (storage injected so it is testable) ----------
export const BEST_KEY = 'grok-roadster-best-v1';
export function loadBest(store = globalThis.localStorage) { try { return JSON.parse(store?.getItem(BEST_KEY) || '{}'); } catch { return {}; } }
export function saveResult(id, result, store = globalThis.localStorage) {
  const best = loadBest(store), prev = best[id] || {stars: 0, score: 0};
  const better = !prev.score || result.score > prev.score;
  best[id] = {stars: Math.max(prev.stars || 0, result.stars || 0), score: better ? result.score : prev.score,
    metric: better ? result.metric : prev.metric, plays: (prev.plays || 0) + 1};
  try { store?.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* private mode */ }
  return {best: best[id], newBest: better};
}

export const FACT = {kg: 900, text: '80 kN × 5 s'};
export {AIR, RAMP, CAR};
