// Grok fork: illustrative stunt kinematics. Pure, DOM-free and testable.
// Vertical motion and burns are integrated numerically; rotations follow bang-bang profiles.
// Coordinates: x forward/along track, y up, z sideways. Angles in radians.
import {G, MPH, DEFAULT_CAR, gasForImpulse, rampFlip, kickflip, verticalHop, launch} from './physics.js';

export const CG_HEIGHT = 0.62;       // CG above ground when standing on wheels (assumed)
const DT = 1 / 240;
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
// Bang-bang rotation profile (constant ±alpha) normalised to 0..1.
const bang = x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);

function finish(samples, stunt, opts, extra = {}) {
  // Convert cumulative impulse to gas actually drawn from the tank (real-air blowdown table).
  const total = samples.at(-1).impulse;
  const scale = total > 0 ? stunt.impulseKNs * 1000 / total : 0;
  for (const s of samples) {
    s.gasUsed = gasForImpulse(s.impulse * scale / 1000, opts.mode, opts.T0C).gasKg;
  }
  const duration = samples.at(-1).t;
  function sample(t) {
    if (t <= 0) return samples[0];
    if (t >= duration) return samples.at(-1);
    const i = Math.min(samples.length - 2, Math.floor(t / DT)), a = samples[i], b = samples[i + 1], q = (t - a.t) / (b.t - a.t);
    const out = {};
    for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * q : a[k];
    out.thrust = {}; for (const k of Object.keys(a.thrust)) out.thrust[k] = a.thrust[k] + (b.thrust[k] - a.thrust[k]) * q;
    out.phase = a.phase;
    return out;
  }
  return {id: stunt.id, stunt, duration, samples, sample, ...extra};
}
const zeroThrust = () => ({rear: 0, under: 0, sideL: 0, sideR: 0});

/** Vertical flight with automatic landing burn. Returns updated state; mutates nothing outside. */
function verticalStep(st, {mass, liftN, touchdown, groundY}) {
  const a = liftN / mass - G;
  const h = st.y - groundY;
  if (!st.burning && st.vy < 0 && a > 0) {
    // Start the landing burn when the remaining height equals the stopping distance.
    const need = (st.vy * st.vy - touchdown * touchdown) / (2 * a);
    if (h <= need + 0.02) st.burning = true;
  }
  const acc = st.burning ? a : -G;
  if (st.burning && st.vy >= -touchdown) { st.vy = -touchdown; st.y += st.vy * DT; }
  else { st.vy += acc * DT; st.y += st.vy * DT; }
  return st;
}

export function rampTimeline(opts = {}) {
  const car = opts.car ?? DEFAULT_CAR, p = {releaseHeight: 20, flipTime: 1.2, liftKN: 60, touchdown: 1.5, ...opts.ramp};
  const stunt = rampFlip({car, ...p});
  const phiR = 170 * Math.PI / 180, R = p.releaseHeight / (1 - Math.cos(phiR)), L = R * phiR;
  const vRelease = 4, cruise = 5, samples = [];
  let t = 0, s = 0, v = 0, impulse = 0;
  // 1) Drive up the curved ramp; fans hold the car on (no gas used).
  while (s < L) {
    const target = s > L - 6 ? vRelease + (cruise - vRelease) * (L - s) / 6 : cruise;
    v = Math.min(target, v + 2.0 * DT); v = Math.max(v, Math.min(target, v));
    s = Math.min(L, s + v * DT);
    const phi = s / R, off = CG_HEIGHT;
    samples.push({t, x: R * Math.sin(phi) - Math.sin(phi) * off, y: R * (1 - Math.cos(phi)) + Math.cos(phi) * off, z: 0,
      roll: 0, pitch: phi, yaw: 0, speed: v, impulse, thrust: zeroThrust(), phase: 'ramp', suction: 1});
    t += DT;
  }
  const last = samples.at(-1), release = t;
  let st = {y: last.y, vy: v * Math.sin(phiR), burning: false};
  const vx = v * Math.cos(phiR), rollF = stunt.roll.forceKN * 1000, liftN = p.liftKN * 1000;
  let x = last.x, landed = null;
  // 2) Release, roll 180° with side jets, then automatic landing burn.
  while (true) {
    const tf = t - release, rollFrac = bang(tf / p.flipTime), rolling = tf < p.flipTime;
    st = verticalStep(st, {mass: car.mass, liftN, touchdown: p.touchdown, groundY: CG_HEIGHT});
    x += vx * DT;
    const thrust = zeroThrust();
    if (rolling) { const push = tf < p.flipTime / 2 ? 1 : -1; thrust.sideL = push > 0 ? 1 : 0; thrust.sideR = push > 0 ? 0 : 1; impulse += rollF * DT; }
    if (st.burning) { thrust.under = 1; impulse += liftN * DT; }
    const groundY = CG_HEIGHT;
    samples.push({t, x, y: Math.max(groundY, st.y), z: 0, roll: Math.PI * rollFrac, pitch: phiR + (Math.PI - phiR) * smooth(tf / p.flipTime), yaw: 0,
      speed: Math.hypot(vx, st.vy), vy: st.vy, impulse, thrust, phase: rolling ? 'flip' : st.burning ? 'burn' : 'fall', suction: 0});
    t += DT;
    if (st.y <= groundY) { landed = {t, vy: st.vy}; break; }
    if (t > 60) break;
  }
  // 3) Roll out and stop.
  let vxr = vx; const stopT = t + 2;
  while (t < stopT) { vxr = Math.min(0, vxr + 4 * DT); x += vxr * DT; samples.push({...samples.at(-1), t, x, y: CG_HEIGHT, speed: Math.abs(vxr), vy: 0, thrust: zeroThrust(), phase: 'landed'}); t += DT; }
  return finish(samples, stunt, opts, {geometry: {radius: R, releaseAngle: phiR, length: L}, landing: landed});
}

export function kickflipTimeline(opts = {}) {
  const car = opts.car ?? DEFAULT_CAR, p = {speedKmh: 50, rowHeight: 4.0, liftKN: 60, touchdown: 1.5, ...opts.kickflip};
  const stunt = kickflip({car, ...p});
  const v0 = p.speedKmh / 3.6, samples = []; let t = 0, x = -40, impulse = 0;
  if (!stunt.possible) { samples.push({t, x, y: CG_HEIGHT, z: 0, roll: 0, pitch: 0, yaw: 0, speed: v0, impulse, thrust: zeroThrust(), phase: 'nolift'}, {t: 1, x, y: CG_HEIGHT, z: 0, roll: 0, pitch: 0, yaw: 0, speed: v0, impulse, thrust: zeroThrust(), phase: 'nolift'}); return finish(samples, stunt, opts, {impossible: true, geometry: {liftoffX: 0, rowStart: 4, rowEnd: 18}}); }
  // Lift-off point chosen so the apex is over the middle of the vehicle row.
  const h = stunt.hop, tApex = h.upBurn + h.coastUp, rowMid = 11, liftoffX = rowMid - v0 * tApex;
  x = Math.min(-30, liftoffX - 40);
  // 1) Rolling start on the ground (no gas).
  while (x < liftoffX) { samples.push({t, x, y: CG_HEIGHT, z: 0, roll: 0, pitch: 0, yaw: 0, speed: v0, vy: 0, impulse, thrust: zeroThrust(), phase: 'approach'}); x += v0 * DT; t += DT; }
  // 2) Lift burn, coast, 360° roll with side jets, landing burn.
  const start = t, liftN = p.liftKN * 1000, rollT = Math.max(.4, h.flight * .75), r0 = h.flight * .1, rollF = stunt.roll.forceKN * 1000;
  let st = {y: CG_HEIGHT, vy: 0, burning: false}, up = true;
  while (true) {
    const tf = t - start;
    if (up) { st.vy += (liftN / car.mass - G) * DT; st.y += st.vy * DT; if (tf >= h.upBurn) up = false; }
    else st = verticalStep(st, {mass: car.mass, liftN, touchdown: p.touchdown, groundY: CG_HEIGHT});
    x += v0 * DT;
    const rf = (tf - r0) / rollT, rolling = rf > 0 && rf < 1, thrust = zeroThrust();
    if (up || st.burning) { thrust.under = 1; impulse += liftN * DT; }
    if (rolling) { thrust.sideL = rf < .5 ? 1 : 0; thrust.sideR = rf < .5 ? 0 : 1; impulse += rollF * DT; }
    samples.push({t, x, y: Math.max(CG_HEIGHT, st.y), z: 0, roll: 2 * Math.PI * bang(rf), pitch: 0, yaw: 0, speed: Math.hypot(v0, st.vy), vy: st.vy, impulse, thrust,
      phase: up ? 'boost' : rolling ? 'flip' : st.burning ? 'burn' : 'air'});
    t += DT;
    if (!up && st.y <= CG_HEIGHT && st.vy <= 0) break;
    if (t > 60) break;
  }
  const landing = {t, vy: st.vy, x};
  let v = v0; const end = t + 2.2;
  while (t < end) { v = Math.max(0, v - 6 * DT); x += v * DT; samples.push({...samples.at(-1), t, x, y: CG_HEIGHT, roll: 2 * Math.PI, speed: v, vy: 0, thrust: zeroThrust(), phase: 'landed'}); t += DT; }
  return finish(samples, stunt, opts, {geometry: {liftoffX, rowMid}, landing});
}

export function hopTimeline(opts = {}) {
  const car = opts.car ?? DEFAULT_CAR, p = {height: 4, liftKN: 60, touchdown: 1.5, spins: 1, ...opts.hop};
  const stunt = verticalHop({car, ...p});
  const samples = []; let t = 0, impulse = 0;
  const pre = 0.6; // standing still
  while (t < pre) { samples.push({t, x: 0, y: CG_HEIGHT, z: 0, roll: 0, pitch: 0, yaw: 0, speed: 0, vy: 0, impulse, thrust: zeroThrust(), phase: 'ready'}); t += DT; }
  if (!stunt.possible) { samples.push({...samples.at(-1), t: t + 1, phase: 'nolift'}); return finish(samples, stunt, opts, {impossible: true}); }
  const liftN = p.liftKN * 1000, start = t, yawF = stunt.yaw.forceKN * 1000, yawT = Math.max(.4, stunt.flight * .9);
  let st = {y: CG_HEIGHT, vy: 0, burning: false}, up = true;
  while (true) {
    const tf = t - start;
    if (up) { st.vy += (liftN / car.mass - G) * DT; st.y += st.vy * DT; if (tf >= stunt.upBurn) up = false; }
    else st = verticalStep(st, {mass: car.mass, liftN, touchdown: p.touchdown, groundY: CG_HEIGHT});
    const yf = tf / yawT, yawing = yf > 0 && yf < 1, thrust = zeroThrust();
    if (up || st.burning) { thrust.under = 1; impulse += liftN * DT; }
    if (yawing) { thrust.sideL = yf < .5 ? 1 : 0; thrust.sideR = yf < .5 ? 0 : 1; impulse += yawF * DT; }
    samples.push({t, x: 0, y: Math.max(CG_HEIGHT, st.y), z: 0, roll: 0, pitch: 0, yaw: 2 * Math.PI * p.spins * bang(yf), speed: Math.abs(st.vy), vy: st.vy, impulse, thrust,
      phase: up ? 'boost' : st.burning ? 'burn' : st.vy > 0 ? 'climb' : 'fall'});
    t += DT;
    if (!up && st.y <= CG_HEIGHT && st.vy <= 0) break;
    if (t > 60) break;
  }
  const landing = {t, vy: st.vy}, end = t + 1.2;
  while (t < end) { samples.push({...samples.at(-1), t, y: CG_HEIGHT, speed: 0, vy: 0, thrust: zeroThrust(), phase: 'landed'}); t += DT; }
  return finish(samples, stunt, opts, {landing});
}

export function launchTimeline(opts = {}) {
  const car = opts.car ?? DEFAULT_CAR, p = {time: 0.81, mu: 1.5, powerKW: 1100, ...opts.launch};
  const stunt = launch({car, ...p});
  const vT = 60 * MPH, a = vT / p.time, samples = []; let t = 0, x = 0, v = 0, impulse = 0;
  const pre = 0.8;
  while (t < pre) { samples.push({t, x: 0, y: CG_HEIGHT, z: 0, roll: 0, pitch: 0, yaw: 0, speed: 0, impulse, thrust: zeroThrust(), phase: 'ready', clock: 0}); t += DT; }
  const start = t;
  while (t - start < p.time) {
    const vm = v + a * DT / 2, tyre = Math.min(p.mu * car.mass * G, p.powerKW * 1000 * .9 / Math.max(vm, .1), car.mass * a);
    const thrustN = Math.max(0, car.mass * a - tyre); impulse += thrustN * DT;
    v += a * DT; x += vm * DT;
    const th = zeroThrust(); th.rear = Math.min(1, thrustN / 80000 * 1.6);
    samples.push({t, x, y: CG_HEIGHT, z: 0, roll: 0, pitch: -0.02, yaw: 0, speed: v, impulse, thrust: th, phase: 'launch', clock: t - start});
    t += DT;
  }
  const clock = t - start, end = t + 2.0;
  while (t < end) { v = Math.max(0, v - 9 * DT); x += v * DT; samples.push({...samples.at(-1), t, x, pitch: 0.01, speed: v, thrust: zeroThrust(), phase: 'done', clock}); t += DT; }
  return finish(samples, stunt, opts, {finalClock: clock});
}

export const TIMELINES = {ramp: rampTimeline, kickflip: kickflipTimeline, hop: hopTimeline, launch: launchTimeline};
