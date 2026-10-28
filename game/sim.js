// Grok-versionen · Roadster game physics. Pure (no DOM, no three.js) so it can be unit-tested in node.
// Built on the same numbers as the analysis page: real-air blowdown tables (grok/physics.js),
// 250 kg air, ≈ 90 kN·s usable impulse (sonic nozzles, 20 °C), 80 kN rear thrust, fan suction ≈ 2 g.
// Simplifications for play: thrust held constant while usable impulse remains; rigid-body flight with a
// rate-command attitude controller ("fly-by-wire"); bicycle-model driving. These are our estimates, not Tesla data.
import {G, budget, gasForImpulse, blowdown} from '../grok/physics.js';

export const CAR = Object.freeze({mass: 2200, cg: 0.62, wheelbase: 2.8, half: [2.15, 0.6, 0.97], mu: 1.15, powerW: 1100e3, driveEff: 0.9, cdA: 0.55});
export const JETS = Object.freeze({
  rearN: 80e3,          // Tesla claim: 80 kN from the rear ports (Electrek)
  liftN: 60e3,          // our assumption for the four underbody nozzles (TWR ≈ 2.8)
  rollNm: 12e3, pitchNm: 22e3, yawNm: 20e3,      // attitude jets (smaller, ≈ 10 kN class)
  rollLever: 1.0, pitchLever: 2.0, yawLever: 2.0,  // impulse cost = torque / lever arm
  rateMax: [4.2, 2.2, 3.4],                      // max commanded body rates roll/yaw/pitch (rad/s), see rate()
});
export const SUCTION_N = 2 * CAR.mass * G;   // "2 g of suction" (CarBuzz) ≈ 43 kN
export const FAN_SPOOL_S = 0.5;
export const MPH60 = 60 * 0.44704;
export const RAMP = Object.freeze((() => {
  const releaseHeight = 20, endAngle = 172 * Math.PI / 180, R = releaseHeight / (1 - Math.cos(170 * Math.PI / 180));
  return {R, endAngle, length: R * endAngle, width: 3.4, releaseMin: 120 * Math.PI / 180, x0: 0, z0: 0};
})());
export const AIR = (() => {
  const b = budget('sonic', 20), d = blowdown(20);
  return Object.freeze({totalKg: 250, usableNs: b.impulseKNs * 1000, usableKg: b.usableGasKg, p0Bar: d.p0Bar, table: d});
})();
export const INERTIA = Object.freeze((() => {
  const m = CAR.mass, L = 4.3, W = 1.95, H = 1.2;
  return [m * (W * W + H * H) / 12, m * (L * L + W * W) / 12, m * (L * L + H * H) / 12]; // about body x (roll), y (yaw), z (pitch)
})());

// ---------- small vector / quaternion helpers (arrays) ----------
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
export function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
export const qaxis = (axis, ang) => { const s = Math.sin(ang / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)]; };
export const qnorm = q => { const n = Math.hypot(...q) || 1; return q.map(x => x / n); };
export function qrot(q, v) { // rotate v by unit quaternion q
  const u = [q[0], q[1], q[2]], s = q[3], uv = cross(u, v), uuv = cross(u, uv);
  return [v[0] + 2 * (s * uv[0] + uuv[0]), v[1] + 2 * (s * uv[1] + uuv[1]), v[2] + 2 * (s * uv[2] + uuv[2])];
}
const qinvrot = (q, v) => qrot([-q[0], -q[1], -q[2], q[3]], v);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sgn = x => x > 0 ? 1 : x < 0 ? -1 : 0;

/** Body axes in world space: x forward, y up, z right. */
export const axes = q => ({fwd: qrot(q, [1, 0, 0]), up: qrot(q, [0, 1, 0]), right: qrot(q, [0, 0, 1])});
const headingQ = psi => qaxis([0, 1, 0], psi);   // ψ > 0 turns left
const flatFwd = psi => [Math.cos(psi), 0, -Math.sin(psi)];

// ---------- air budget ----------
export function airState(impulseNs) {
  const used = gasForImpulse(Math.min(impulseNs, AIR.usableNs) / 1000).gasKg, d = AIR.table;
  const k = clamp(used / d.step, 0, d.pBar.length - 1), i = Math.floor(k), f = k - i;
  const p = d.pBar[i] + ((d.pBar[i + 1] ?? d.pBar[i]) - d.pBar[i]) * f;
  return {usedKg: used, leftKg: AIR.totalKg - used, usableLeftKg: Math.max(0, AIR.usableKg - used), pressureBar: p,
    fraction: clamp(1 - impulseNs / AIR.usableNs, 0, 1), empty: impulseNs >= AIR.usableNs - 1e-6};
}

/** Stopping distance (m) for a vertical speed vy (m/s, negative = falling) with lift jets fully on and car upright. */
export function stopDistance(vy, upY = 1, mass = CAR.mass) {
  const a = JETS.liftN * upY / mass - G; if (vy >= 0) return 0; if (a <= 0) return Infinity;
  return vy * vy / (2 * a);
}

/** Touchdown grade. Limits follow the Grok "realistic" lab limits (3 m/s vertical, 2–4 m/s sideways). */
export function judgeLanding({vy, tiltDeg, sideSpeed = 0}) {
  const v = Math.abs(Math.min(0, vy));
  if (tiltDeg > 35) return {grade: 'crash', reason: 'notUpright'};
  if (v > 5.5) return {grade: 'crash', reason: 'tooHard'};
  if (sideSpeed > 5) return {grade: 'crash', reason: 'sideways'};
  if (v <= 1.6 && tiltDeg <= 10 && sideSpeed <= 2) return {grade: 'perfect'};
  if (v <= 3 && tiltDeg <= 20 && sideSpeed <= 3) return {grade: 'good'};
  return {grade: 'hard'};
}

export const emptyInput = () => ({throttle: 0, brake: 0, steer: 0, roll: 0, pitch: 0, yaw: 0, lift: false, boost: false, fan: false, release: false});

export function createCar({x = 0, z = 0, heading = 0, speed = 0, fan = false} = {}) {
  return {mode: 'ground', t: 0, pos: [x, CAR.cg, z], vel: add([0, 0, 0], flatFwd(heading), speed), q: headingQ(heading), w: [0, 0, 0],
    psi: heading, speed, steerAngle: 0, s: 0, rampZ: 0, fanSpin: fan ? 1 : 0, impulse: 0,
    thrust: {rear: 0, lift: 0, roll: 0, pitch: 0, yaw: 0}, suction: 0, normalN: CAR.mass * G, slip: false,
    air: airState(0), outOfAir: false, landing: null, crash: null, airTime: 0, rollAccum: 0, yawAccum: 0, maxAlt: 0, events: [], flags: {}};
}

export function refill(st) { st.impulse = 0; st.outOfAir = false; st.air = airState(0); }

// Obstacles: axis-aligned boxes {min:[x,y,z], max:[x,y,z], name}
function corners(st) {
  const [hx, hy, hz] = CAR.half, out = [];
  for (const x of [-hx, hx]) for (const y of [-CAR.cg, hy]) for (const z of [-hz, hz]) out.push(add(st.pos, qrot(st.q, [x, y, z])));
  return out;
}
function hitObstacle(st, obstacles) {
  if (!obstacles?.length) return null;
  const pts = corners(st); pts.push(st.pos);
  for (const o of obstacles) for (const p of pts)
    if (p[0] > o.min[0] && p[0] < o.max[0] && p[1] > o.min[1] && p[1] < o.max[1] && p[2] > o.min[2] && p[2] < o.max[2]) return o;
  return null;
}

function spendImpulse(st, newtons, dt) {
  if (newtons <= 0) return 1;
  if (st.outOfAir) return 0;
  const room = AIR.usableNs - st.impulse, want = newtons * dt;
  if (want >= room) { st.impulse = AIR.usableNs; st.outOfAir = true; st.events.push({type: 'outOfAir'}); return room / want; }
  st.impulse += want; return 1;
}

function crash(st, reason, extra = {}) {
  st.mode = 'crashed'; st.crash = {reason, t: st.t, ...extra}; st.events.push({type: 'crash', reason});
  st.vel = [0, 0, 0]; st.w = [0, 0, 0]; st.speed = 0;
  st.thrust = {rear: 0, lift: 0, roll: 0, pitch: 0, yaw: 0};
}

function driveForce(st, inp, normalN) {
  const v = st.speed, grip = CAR.mu * Math.max(0, normalN);
  let F = 0; st.slip = false;
  if (inp.throttle > 0) {
    const want = CAR.powerW * CAR.driveEff / Math.max(Math.abs(v), 1.5);
    F += inp.throttle * Math.min(grip, want); st.slip = inp.throttle * want > grip * 1.02;
  }
  if (inp.brake > 0) {
    if (v > 0.3) F -= inp.brake * grip * 0.95;
    else if (v > -6 && !(inp.throttle > 0)) F -= inp.brake * Math.min(grip, 6000);   // creep in reverse
  }
  const resist = (0.5 * 1.2 * CAR.cdA * v * v + 0.012 * normalN) * sgn(v);
  return {F: F - resist, grip};
}

function fanUpdate(st, inp, dt) {
  st.fanSpin += ((inp.fan ? 1 : 0) - st.fanSpin) * Math.min(1, dt / (FAN_SPOOL_S / 3));
  st.suction = (st.mode === 'ground' || st.mode === 'ramp') ? st.fanSpin * SUCTION_N : 0;
}

function enterAir(st, vel, w = [0, 0, 0]) {
  st.mode = 'air'; st.vel = vel; st.w = w; st.airTime = 0; st.rollAccum = 0; st.yawAccum = 0; st.landing = null;
  st.events.push({type: 'takeoff'});
}

function groundStep(st, inp, dt, world) {
  const m = CAR.mass;
  fanUpdate(st, inp, dt);
  const N = m * G + st.suction;
  const {F, grip} = driveForce(st, inp, N);
  const k = inp.boost ? spendImpulse(st, JETS.rearN, dt) : 0;
  st.thrust = {rear: inp.boost ? k : 0, lift: 0, roll: 0, pitch: 0, yaw: 0};
  const v0 = st.speed;
  st.speed += (F + JETS.rearN * st.thrust.rear) / m * dt;
  if (!(inp.throttle > 0) && !st.thrust.rear && sgn(st.speed) !== sgn(v0) && v0 !== 0 && !(inp.brake > 0 && v0 <= 0.3)) st.speed = 0;
  // Steering (bicycle model), lateral acceleration limited by grip.
  const delta = clamp(inp.steer, -1, 1) * 0.6 / (1 + Math.abs(st.speed) / 9);
  st.steerAngle += (delta - st.steerAngle) * Math.min(1, dt * 10);
  let yawRate = -st.speed * Math.tan(st.steerAngle) / CAR.wheelbase;
  const latMax = grip / m; if (Math.abs(st.speed * yawRate) > latMax) yawRate = sgn(yawRate) * latMax / Math.max(0.1, Math.abs(st.speed));
  st.psi += yawRate * dt;
  const f = flatFwd(st.psi);
  st.pos = add(st.pos, f, st.speed * dt); st.pos[1] = CAR.cg;
  st.vel = [f[0] * st.speed, 0, f[2] * st.speed]; st.q = headingQ(st.psi); st.w = [0, yawRate, 0];
  // Ramp entry: front of the loop at x = RAMP.x0, z within the deck, heading straight at it.
  if (world?.ramp && st.speed > 0) {
    const dz = st.pos[2] - RAMP.z0, nose = st.pos[0] + CAR.half[0];
    if (nose >= RAMP.x0 && nose - st.speed * dt < RAMP.x0 + 0.01 && Math.abs(dz) < 3) {
      if (Math.abs(dz) < RAMP.width / 2 - 0.4 && Math.abs(Math.atan2(Math.sin(st.psi), Math.cos(st.psi))) < 0.3) {
        st.mode = 'ramp'; st.s = 0; st.rampZ = dz; st.flags.rampEntered = true; st.events.push({type: 'rampEnter'}); return;
      }
      return crash(st, 'rampMiss');
    }
  }
  // Lift-off with the underbody jets.
  if (inp.lift) {
    const kl = spendImpulse(st, JETS.liftN, dt); st.thrust.lift = kl;
    if (JETS.liftN * kl > m * G + st.suction) enterAir(st, [st.vel[0], 0.3, st.vel[2]]);
  }
  const hit = hitObstacle(st, world?.obstacles); if (hit) return crash(st, 'obstacle', {name: hit.name});
}

function rampPose(st) {
  const R = RAMP.R, phi = st.s / R;
  st.pos = [RAMP.x0 + R * Math.sin(phi) - Math.sin(phi) * CAR.cg, R * (1 - Math.cos(phi)) + Math.cos(phi) * CAR.cg, RAMP.z0 + st.rampZ];
  st.q = qaxis([0, 0, 1], phi);
  const tan = [Math.cos(phi), Math.sin(phi), 0];
  st.vel = tan.map(c => c * st.speed); st.w = [0, 0, st.speed / R];
  return phi;
}

function rampStep(st, inp, dt) {
  const m = CAR.mass, R = RAMP.R;
  fanUpdate(st, inp, dt);
  let phi = st.s / R;
  const N = m * st.speed * st.speed / R + m * G * Math.cos(phi) + st.suction;
  st.normalN = N;
  if (N <= 0) { rampPose(st); st.events.push({type: 'detach'}); st.flags.detached = true; enterAir(st, st.vel, st.w); return; }
  const {F} = driveForce(st, inp, N);
  const k = inp.boost ? spendImpulse(st, JETS.rearN, dt) : 0;
  st.thrust = {rear: k, lift: 0, roll: 0, pitch: 0, yaw: 0};
  st.speed += (F + JETS.rearN * k - m * G * Math.sin(phi)) / m * dt;
  st.s += st.speed * dt;
  if (st.s <= 0) { // rolled back off the ramp
    st.mode = 'ground'; st.psi = 0; st.pos = [RAMP.x0 - CAR.half[0] - 0.05, CAR.cg, RAMP.z0 + st.rampZ]; st.q = headingQ(0); return;
  }
  phi = rampPose(st);
  if ((inp.release && phi >= RAMP.releaseMin) || st.s >= RAMP.length) {
    st.flags.released = true; st.flags.releaseAngle = phi * 180 / Math.PI;
    st.events.push({type: 'release', angle: st.flags.releaseAngle, auto: st.s >= RAMP.length});
    enterAir(st, st.vel, st.w);
  }
}

/** Rate-command attitude control: thrusters push body rates toward input × max rate (zero = hold attitude). */
function attitudeTorque(st, inp) {
  const w = st.w, I = INERTIA;
  // body axes: x roll (+ = right side down), y yaw (+ = left), z pitch (+ = nose up)
  const target = [clamp(inp.roll, -1, 1) * JETS.rateMax[0], -clamp(inp.yaw, -1, 1) * JETS.rateMax[2], clamp(inp.pitch, -1, 1) * JETS.rateMax[1]];
  const maxT = [JETS.rollNm, JETS.yawNm, JETS.pitchNm];
  const tau = [0, 1, 2].map(i => {
    const err = target[i] - w[i]; if (Math.abs(err) < 0.02 && !target[i]) return 0;
    return clamp(I[i] * err / 0.12, -maxT[i], maxT[i]);
  });
  return tau;
}

function airStep(st, inp, dt, world) {
  const m = CAR.mass;
  st.fanSpin += ((inp.fan ? 1 : 0) - st.fanSpin) * Math.min(1, dt / (FAN_SPOOL_S / 3)); st.suction = 0;
  let tau = st.outOfAir ? [0, 0, 0] : attitudeTorque(st, inp);
  const attN = Math.abs(tau[0]) / JETS.rollLever + Math.abs(tau[1]) / JETS.yawLever + Math.abs(tau[2]) / JETS.pitchLever;
  const wantN = attN + (inp.lift ? JETS.liftN : 0) + (inp.boost ? JETS.rearN : 0);
  const k = st.outOfAir ? 0 : spendImpulse(st, wantN, dt);
  tau = tau.map(x => x * k);
  const lift = inp.lift ? k : 0, rear = inp.boost ? k : 0;
  st.thrust = {rear, lift, roll: Math.abs(tau[0]) / JETS.rollNm, yaw: Math.abs(tau[1]) / JETS.yawNm, pitch: Math.abs(tau[2]) / JETS.pitchNm,
    rollSign: sgn(tau[0]), yawSign: sgn(tau[1]), pitchSign: sgn(tau[2])};
  const ax = axes(st.q);
  const F = add(add([0, -m * G, 0], ax.up, JETS.liftN * lift), ax.fwd, JETS.rearN * rear);
  const sp = len(st.vel), drag = 0.5 * 1.2 * 1.1 * sp; // bluff body in tumbling flight, CdA ≈ 1.1 m²
  const acc = add(F.map(c => c / m), st.vel, -drag / m);
  st.vel = add(st.vel, acc, dt); st.pos = add(st.pos, st.vel, dt);
  // Euler's equations, diagonal inertia
  const I = INERTIA, w = st.w, Iw = [I[0] * w[0], I[1] * w[1], I[2] * w[2]], gyro = cross(w, Iw);
  st.w = [0, 1, 2].map(i => w[i] + (tau[i] - gyro[i]) / I[i] * dt);
  const wl = len(st.w);
  if (wl > 1e-9) st.q = qnorm(qmul(st.q, qaxis(st.w.map(c => c / wl), wl * dt)));
  st.airTime += dt; st.rollAccum += st.w[0] * dt; st.yawAccum += qrot(st.q, st.w)[1] * dt;
  st.maxAlt = Math.max(st.maxAlt, st.pos[1] - CAR.cg);
  const hit = hitObstacle(st, world?.obstacles); if (hit) return crash(st, 'obstacle', {name: hit.name});
  // Ground contact
  const low = Math.min(...corners(st).map(p => p[1]));
  if (low <= 0) {
    const a2 = axes(st.q), tiltDeg = Math.acos(clamp(a2.up[1], -1, 1)) * 180 / Math.PI;
    const sideSpeed = Math.abs(dot(st.vel, a2.right));
    const res = judgeLanding({vy: st.vel[1], tiltDeg, sideSpeed});
    st.landing = {...res, vy: st.vel[1], tiltDeg, sideSpeed, x: st.pos[0], z: st.pos[2], t: st.t, outOfAir: st.outOfAir};
    st.events.push({type: 'land', ...st.landing});
    if (res.grade === 'crash') return crash(st, res.reason, st.landing);
    const fh = [a2.fwd[0], 0, a2.fwd[2]], fl = len(fh) || 1;
    st.psi = Math.atan2(-fh[2] / fl, fh[0] / fl);
    st.speed = dot(st.vel, [fh[0] / fl, 0, fh[2] / fl]);
    st.mode = 'ground'; st.pos[1] = CAR.cg; st.q = headingQ(st.psi); st.w = [0, 0, 0]; st.steerAngle = 0;
  }
}

/** Advance the car one fixed step. `world` = {ramp: bool, obstacles: [...]} */
export function step(st, inp, dt, world = {}) {
  if (st.mode === 'crashed') return st;
  st.t += dt;
  if (st.mode === 'ground') groundStep(st, inp, dt, world);
  else if (st.mode === 'ramp') rampStep(st, inp, dt, world);
  else if (st.mode === 'air') airStep(st, inp, dt, world);
  st.air = airState(st.impulse);
  return st;
}

/** Fixed-step runner (240 Hz) for tests and the game loop. */
export const STEP = 1 / 240;
export function advance(st, inp, seconds, world) {
  let n = Math.max(1, Math.round(seconds / STEP));
  while (n-- > 0 && st.mode !== 'crashed') step(st, inp, STEP, world);
  return st;
}
