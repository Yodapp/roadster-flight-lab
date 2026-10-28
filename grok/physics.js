// Grok fork: compact, testable physics for the landing page. Pure functions, no DOM.
// Gas budget comes from real-air CoolProp blowdown tables (air-tables.js, ~19 kB).
import {AIR_TABLES} from './air-tables.js';

export const G = 9.80665;
export const MPH = 0.44704;
export const MODES = ['reg100', 'sonic', 'bell'];
export const TESLA = Object.freeze({gasKg: 250, tankL: 600, rearThrustKN: 80, boostSeconds: [5, 6], zeroToSixty: 0.81, hp: 1500});
export const DEFAULT_CAR = Object.freeze({mass: 2200, length: 4.6, width: 1.95, height: 1.2});

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Interpolated blowdown row for fill temperature T0 (°C), clamped to the table range. */
export function blowdown(T0C = 20) {
  const rows = AIR_TABLES.temps, t = clamp(T0C, rows[0].T0C, rows.at(-1).T0C);
  let i = 0; while (i < rows.length - 2 && rows[i + 1].T0C < t) i++;
  const a = rows[i], b = rows[i + 1], q = (t - a.T0C) / (b.T0C - a.T0C);
  const I = {};
  for (const mode of MODES) {
    const n = Math.min(a.I[mode].length, b.I[mode].length);
    I[mode] = Array.from({length: n}, (_, k) => lerp(a.I[mode][k], b.I[mode][k], q));
  }
  const n = Math.min(a.used.length, b.used.length);
  return {T0C: t, p0Bar: lerp(a.p0_bar, b.p0_bar, q), step: AIR_TABLES.meta.step_kg,
    used: a.used.slice(0, n), pBar: a.p_bar.map((v, k) => lerp(v, b.p_bar[k] ?? v, q)).slice(0, n - 1),
    TC: a.T_C.map((v, k) => lerp(v, b.T_C[k] ?? v, q)).slice(0, n - 1), I};
}

/** Total usable impulse (kN·s), usable gas (kg) and mean effective exhaust velocity (m/s). */
export function budget(mode = 'sonic', T0C = 20) {
  const d = blowdown(T0C), I = d.I[mode]; if (!I) throw new RangeError('Unknown mode ' + mode);
  const gas = (I.length - 1) * d.step, impulse = I.at(-1);
  return {mode, impulseKNs: impulse, usableGasKg: gas, meanVe: impulse * 1000 / gas, p0Bar: d.p0Bar,
    fullThrust80s: impulse / TESLA.rearThrustKN};
}

/** Gas (kg) drawn from a full tank to deliver an impulse (kN·s). Beyond the budget, extrapolate at mean ve. */
export function gasForImpulse(impulseKNs, mode = 'sonic', T0C = 20) {
  const d = blowdown(T0C), I = d.I[mode], b = budget(mode, T0C);
  if (!(impulseKNs > 0)) return {gasKg: 0, fits: true, fraction: 0};
  if (impulseKNs > I.at(-1)) {
    const gasKg = impulseKNs * 1000 / b.meanVe;
    return {gasKg, fits: false, fraction: impulseKNs / I.at(-1), shortfallKNs: impulseKNs - I.at(-1)};
  }
  let k = 1; while (I[k] < impulseKNs) k++;
  const gasKg = (k - 1 + (impulseKNs - I[k - 1]) / (I[k] - I[k - 1])) * d.step;
  return {gasKg, fits: true, fraction: impulseKNs / I.at(-1)};
}

/** Thrust × seconds against the 250 kg budget (the headline gauge). */
export function thrustTime(thrustKN, seconds, mode = 'sonic', T0C = 20) {
  const impulseKNs = thrustKN * seconds, b = budget(mode, T0C), g = gasForImpulse(impulseKNs, mode, T0C);
  return {impulseKNs, ...g, budgetKNs: b.impulseKNs, meanVe: b.meanVe,
    airNeededKg: impulseKNs * 1000 / b.meanVe, timesTank: impulseKNs * 1000 / b.meanVe / TESLA.gasKg,
    maxSecondsAtThrust: b.impulseKNs / Math.max(1e-9, thrustKN), massFlowKgS: thrustKN * 1000 / b.meanVe};
}

/** Compressed-air storage: ideal vs real (table) pressure at the fill temperature. */
export function storage(T0C = 20) {
  const rho = TESLA.gasKg / (TESLA.tankL / 1000), T = T0C + 273.15;
  return {densityKgM3: rho, idealBar: rho * 287.05 * T / 1e5, realBar: blowdown(T0C).p0Bar,
    exergyMJ: TESLA.gasKg * 287.05 * T * Math.log(blowdown(T0C).p0Bar * 1e5 / 101325) / 1e6};
}

/** Roll/yaw manoeuvre with bang-bang torque: angle θ (rad) in time t (s), jets at lever arm L (m). */
export function rotationImpulse({inertia, angle, time, lever = 0.9}) {
  const alpha = 4 * angle / (time * time), torque = inertia * alpha, force = torque / lever;
  return {alpha, torqueKNm: torque / 1000, forceKN: force / 1000, impulseKNs: force * time / 1000};
}
export const rollInertia = ({mass, width, height}) => mass * (width ** 2 + height ** 2) / 12;
export const yawInertia = ({mass, length, width}) => mass * (length ** 2 + width ** 2) / 12;

/** Free fall from h (m) arrested by constant lift thrust F (N) to touchdown speed vt (m/s). */
export function brakeFromHeight({mass, height, thrustN, touchdown = 1}) {
  const a = thrustN / mass - G;
  if (a <= 0) return {possible: false, impulseKNs: Infinity};
  const vt = Math.min(touchdown, Math.sqrt(2 * G * Math.max(0, height)));
  const hb = Math.max(0, (2 * G * height - vt * vt) * mass / (2 * thrustN));
  const vb = Math.sqrt(Math.max(0, 2 * G * (height - hb)));
  const tb = (vb - vt) / a;
  return {possible: true, burnHeight: hb, burnStartSpeed: vb, burnTime: tb, impulseKNs: thrustN * tb / 1000,
    freeFallImpact: Math.sqrt(2 * G * height)};
}

/** Stunt 1: ramp → inverted release → roll 180° → powered landing. */
export function rampFlip({car = DEFAULT_CAR, releaseHeight = 20, flipTime = 1.2, liftKN = 60, touchdown = 1.5, margin = 1.15} = {}) {
  const roll = rotationImpulse({inertia: rollInertia(car), angle: Math.PI, time: flipTime});
  const brake = brakeFromHeight({mass: car.mass, height: releaseHeight, thrustN: liftKN * 1000, touchdown});
  const impulseKNs = (roll.impulseKNs + brake.impulseKNs) * margin;
  return {id: 'ramp', impulseKNs, parts: {rollKNs: roll.impulseKNs, brakeKNs: brake.impulseKNs, marginPct: (margin - 1) * 100},
    roll, brake, freeFallImpact: brake.freeFallImpact, airtime: Math.sqrt(2 * G * releaseHeight)};
}

/** Stunt 2: "kickflip" – from a rolling start, thrusters lift the car (no ramp, per Car and Driver) over a row of
 * vehicles whose tallest is the Semi, a 360° barrel roll on the way, and a powered landing. */
export function kickflip({car = DEFAULT_CAR, speedKmh = 50, rowHeight = 4.0, clearance = 0.6, liftKN = 60, touchdown = 1.5, margin = 1.15} = {}) {
  const v0 = speedKmh / 3.6, rise = rowHeight + clearance + car.height / 2 - 0.62 + 0.5; // CG rise so the roof clears the Semi mid-roll
  const hop = verticalHop({car, height: rise, liftKN, touchdown, spins: 0, margin: 1});
  if (!hop.possible) return {id: 'kickflip', possible: false, impulseKNs: Infinity, launchSpeed: v0};
  const roll = rotationImpulse({inertia: rollInertia(car), angle: 2 * Math.PI, time: Math.max(.4, hop.flight * .75)});
  const impulseKNs = (hop.parts.upKNs + hop.parts.brakeKNs + roll.impulseKNs) * margin;
  return {id: 'kickflip', possible: true, impulseKNs, rise, apex: rise + 0.62, rowHeight, launchSpeed: v0, launchKmh: speedKmh,
    airtime: hop.flight, distance: v0 * hop.flight, twr: hop.twr,
    parts: {upKNs: hop.parts.upKNs, rollKNs: roll.impulseKNs, brakeKNs: hop.parts.brakeKNs, marginPct: (margin - 1) * 100}, roll, hop};
}

/** Stunt 3: vertical launch from standstill to height h, 360° corkscrew (yaw), powered landing. */
export function verticalHop({car = DEFAULT_CAR, height = 4, liftKN = 60, touchdown = 1.5, spins = 1, margin = 1.15} = {}) {
  const F = liftKN * 1000, a = F / car.mass - G;
  if (a <= 0) return {id: 'hop', possible: false, impulseKNs: Infinity, reason: 'lift ≤ weight'};
  const tb = Math.sqrt(height / (0.5 * a + a * a / (2 * G))), vb = a * tb, hb = 0.5 * a * tb * tb;
  const coastUp = vb / G, brake = brakeFromHeight({mass: car.mass, height, thrustN: F, touchdown});
  const flight = tb + coastUp + Math.sqrt(2 * (height - brake.burnHeight) / G) + brake.burnTime;
  const yaw = rotationImpulse({inertia: yawInertia(car), angle: 2 * Math.PI * spins, time: Math.max(0.4, flight * 0.9), lever: 2.0});
  const upKNs = F * tb / 1000, impulseKNs = (upKNs + brake.impulseKNs + yaw.impulseKNs) * margin;
  return {id: 'hop', possible: true, impulseKNs, height, coastUp, upBurn: tb, burnoutHeight: hb, burnoutSpeed: vb, flight,
    parts: {upKNs, brakeKNs: brake.impulseKNs, yawKNs: yaw.impulseKNs, marginPct: (margin - 1) * 100}, brake, yaw, twr: F / (car.mass * G)};
}

/** Stunt 4: 0–60 mph in t seconds. Tyres give min(μ m g, P/v); thrusters supply the rest of a constant acceleration. */
export function launch({car = DEFAULT_CAR, time = 0.81, mu = 1.5, powerKW = 1100, driveEff = 0.9, dt = 0.001} = {}) {
  const vTarget = 60 * MPH, a = vTarget / time;
  let v = 0, I = 0, tyreWork = 0, peakThrust = 0;
  for (let t = 0; t < time; t += dt) {
    const vm = v + a * dt / 2;
    const tyre = Math.min(mu * car.mass * G, powerKW * 1000 * driveEff / Math.max(vm, 0.1), car.mass * a);
    const thrust = Math.max(0, car.mass * a - tyre);
    I += thrust * dt; peakThrust = Math.max(peakThrust, thrust); tyreWork += tyre * vm * dt; v += a * dt;
  }
  const kineticMJ = 0.5 * car.mass * vTarget ** 2 / 1e6;
  return {id: 'launch', impulseKNs: I / 1000, accelG: a / G, forceKN: car.mass * a / 1000, peakThrustKN: peakThrust / 1000,
    avgPowerKW: kineticMJ * 1e3 / time, tyreShare: tyreWork / (kineticMJ * 1e6), distance: 0.5 * a * time * time};
}

/** Evaluate all four stunts against the gas budget. */
export function allStunts(opts = {}) {
  const {mode = 'sonic', T0C = 20, car = DEFAULT_CAR} = opts;
  const list = [rampFlip({car, ...opts.ramp}), kickflip({car, ...opts.kickflip}), verticalHop({car, ...opts.hop}), launch({car, ...opts.launch})];
  const b = budget(mode, T0C);
  return list.map(s => ({...s, ...gasForImpulse(s.impulseKNs, mode, T0C), budgetKNs: b.impulseKNs}));
}
