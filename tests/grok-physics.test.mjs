// Grok fork: tests for the landing-page physics (grok/) and the air reference EOS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {budget, gasForImpulse, thrustTime, storage, rotationImpulse, brakeFromHeight, rampFlip, kickflip, verticalHop, launch, allStunts, blowdown, MODES, G} from '../grok/physics.js';
import {TIMELINES, CG_HEIGHT} from '../grok/timeline.js';
import {AIR_TABLES} from '../grok/air-tables.js';
import {referenceAtTRho} from '../dist/reference-eos.js';
import {simulate, PRESETS} from '../dist/physics.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('air reference EOS: 250 kg in 600 L at 20 °C is ≈ 437 bar (nitrogen ≈ 493 bar)', () => {
  const air = referenceAtTRho(293.15, 250 / 0.6, 'air'), n2 = referenceAtTRho(293.15, 250 / 0.6);
  near(air.pressure / 1e5, 437, 2, 'air');
  near(n2.pressure / 1e5, 492.6, 3, 'nitrogen');
  assert.ok(air.Z > 1.2 && air.Z < 1.3);
});

test('compact air tables match the reference EOS start pressure', () => {
  const row = AIR_TABLES.temps.find(r => r.T0C === 20);
  near(row.p0_bar, referenceAtTRho(293.15, 250 / 0.6, 'air').pressure / 1e5, 1);
  for (const r of AIR_TABLES.temps) for (const m of MODES) {
    const I = r.I[m]; assert.equal(I[0], 0);
    for (let i = 1; i < I.length; i++) assert.ok(I[i] > I[i - 1], `${m} impulse must increase`);
  }
});

test('storage: real gas pressure exceeds ideal gas, exergy ≈ 128 MJ', () => {
  const s = storage(20);
  near(s.idealBar, 351, 1); near(s.realBar, 437, 1); near(s.exergyMJ, 128, 3);
});

test('budget: usable impulse ordering reg100 < sonic < bell, effective ve in 430–560 m/s', () => {
  const r = budget('reg100'), s = budget('sonic'), b = budget('bell');
  assert.ok(r.impulseKNs < s.impulseKNs && s.impulseKNs < b.impulseKNs);
  near(s.impulseKNs, 90, 4); near(b.impulseKNs, 110, 4); near(r.impulseKNs, 53, 3);
  for (const x of [r, s, b]) assert.ok(x.meanVe > 430 && x.meanVe < 560, `${x.mode} ve ${x.meanVe}`);
  assert.ok(s.usableGasKg <= 250 && s.usableGasKg > 190);
});

test('budget rises with fill temperature', () => {
  for (const m of MODES) assert.ok(budget(m, 40).impulseKNs > budget(m, -10).impulseKNs);
  near(blowdown(25).p0Bar, (blowdown(20).p0Bar + blowdown(30).p0Bar) / 2, 0.01);
});

test('full thrust lasts about one second: 80 kN for 0.6–1.4 s', () => {
  for (const m of MODES) { const x = budget(m).fullThrust80s; assert.ok(x > 0.6 && x < 1.45, `${m}: ${x}`); }
});

test('Tesla claim 80 kN × 5.5 s needs ≈ 800–1000 kg of air, ~4× the tank', () => {
  for (const m of MODES) {
    const r = thrustTime(80, 5.5, m);
    assert.equal(r.impulseKNs, 440); assert.equal(r.fits, false);
    assert.ok(r.airNeededKg > 800 && r.airNeededKg < 1000, `${m}: ${r.airNeededKg}`);
    assert.ok(r.timesTank > 3.2 && r.timesTank < 4);
  }
  // Five seconds only works at ≈ 18 kN average thrust.
  assert.equal(thrustTime(18, 5, 'sonic').fits, true);
  assert.equal(thrustTime(20, 5, 'sonic').fits, false);
});

test('gasForImpulse is monotonic and inverts the table', () => {
  let prev = 0;
  for (let I = 5; I <= 90; I += 5) { const g = gasForImpulse(I, 'sonic').gasKg; assert.ok(g > prev); prev = g; }
  const d = blowdown(20); near(gasForImpulse(d.I.sonic[40], 'sonic').gasKg, 40 * d.step, 1e-9);
  assert.equal(gasForImpulse(0).gasKg, 0);
});

test('rotation and braking helpers follow textbook kinematics', () => {
  const r = rotationImpulse({inertia: 1000, angle: Math.PI, time: 2, lever: 1});
  near(r.alpha, Math.PI, 1e-12); near(r.forceKN, Math.PI, 1e-12); near(r.impulseKNs, 2 * Math.PI, 1e-12);
  const b = brakeFromHeight({mass: 2000, height: 10, thrustN: 60000, touchdown: 1});
  const a = 60000 / 2000 - G;
  near(b.burnStartSpeed ** 2 - 1, 2 * a * b.burnHeight, 1e-6);
  near(b.freeFallImpact, Math.sqrt(2 * G * 10), 1e-9);
  assert.equal(brakeFromHeight({mass: 2000, height: 10, thrustN: 15000}).possible, false);
});

test('ramp flip agrees with Anders’ simulator (air, Grok limits) within ~15 %', () => {
  const mine = rampFlip();
  const his = simulate({...PRESETS.fullRun, gasModel: 'air', contactSpeedLimit: 3, sideSpeedLimit: 2, longitudinalSpeedLimit: 6, minimumGasTemperature: -150});
  assert.equal(his.summary?.soft ?? his.soft, true);
  near(gasForImpulse(mine.impulseKNs).gasKg, his.summary?.gasUsed ?? his.gasUsed, 25);
});

test('all four stunts fit in one 250 kg charge, but not all together', () => {
  const list = allStunts();
  assert.deepEqual(list.map(s => s.id), ['ramp', 'kickflip', 'hop', 'launch']);
  for (const s of list) { assert.ok(s.fits, s.id); assert.ok(s.gasKg > 30 && s.gasKg < 250, `${s.id} ${s.gasKg}`); }
  assert.ok(list.reduce((a, s) => a + s.gasKg, 0) > 250);
});

test('kickflip clears a 4 m Semi and costs more with a taller row', () => {
  const k = kickflip();
  assert.ok(k.possible); assert.ok(k.apex - 0.6 > 4.0);
  assert.ok(kickflip({rowHeight: 2}).impulseKNs < k.impulseKNs);
  assert.equal(kickflip({liftKN: 20}).possible, false);
});

test('vertical hop is impossible with lift below weight', () => {
  assert.equal(verticalHop({liftKN: 20}).possible, false);
  const h = verticalHop(); assert.ok(h.possible); near(h.twr, 60000 / (2200 * G), 1e-9);
});

test('0–60 mph in 0.81 s: 3.38 g, ~1 MW average, tyres alone are not enough', () => {
  const l = launch();
  near(l.accelG, 3.38, 0.01); near(l.avgPowerKW, 975, 15);
  assert.ok(l.peakThrustKN > 30 && l.peakThrustKN < 80);
  assert.ok(launch({mu: 2}).impulseKNs < l.impulseKNs);
  assert.ok(launch({time: 2.5, mu: 1.5}).impulseKNs < 1e-6, 'a 2.5 s run needs no thrusters');
});

test('timelines: monotonic gas, end on the ground, totals match the stunt gas', () => {
  for (const [id, f] of Object.entries(TIMELINES)) {
    const tl = f({mode: 'sonic', T0C: 20}), s = tl.samples;
    for (let i = 1; i < s.length; i++) assert.ok(s[i].gasUsed >= s[i - 1].gasUsed - 1e-9, `${id} gas monotonic`);
    near(s.at(-1).y, CG_HEIGHT, 1e-6, `${id} ends on ground`);
    near(s.at(-1).gasUsed, gasForImpulse(tl.stunt.impulseKNs).gasKg, 0.5, `${id} total gas`);
    if (tl.landing) assert.ok(Math.abs(tl.landing.vy) < 2.5, `${id} soft landing ${tl.landing.vy}`);
    const mid = tl.sample(tl.duration / 2); assert.ok(Number.isFinite(mid.x) && Number.isFinite(mid.y));
  }
  const k = TIMELINES.kickflip({}); near(k.samples.at(-1).roll, 2 * Math.PI, 1e-9);
  const r = TIMELINES.ramp({}); near(r.samples.at(-1).roll, Math.PI, 1e-9);
});
