// Game physics (game/sim.js + game/levels.js): the "Sätt dig vid ratten" mobile game must stay
// grounded in the same air budget as the analysis page, and every level must be beatable.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../game/sim.js';
import * as LV from '../game/levels.js';
import {budget, gasForImpulse} from '../grok/physics.js';

const W0 = {ramp: true, obstacles: []};
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);

test('air budget matches the analysis page (250 kg, ~90 kN·s usable, sonic 20 °C)', () => {
  const b = budget('sonic', 20);
  assert.equal(S.AIR.totalKg, 250);
  near(S.AIR.usableNs, b.impulseKNs * 1000, 1e-6);
  near(S.AIR.usableNs / 1000, 90.4, 1.5, 'usable kN·s');
  near(S.AIR.usableKg, b.usableGasKg, 1e-9);
  assert.ok(S.AIR.p0Bar > 400 && S.AIR.p0Bar < 480);
  assert.equal(S.JETS.rearN, 80e3);
  near(S.SUCTION_N, 2 * 2200 * 9.81, 50, 'suction ≈ 2 g');
});

test('airState uses gasForImpulse and pressure falls monotonically', () => {
  let lastP = Infinity;
  for (const kNs of [0, 10, 30, 60, 90]) {
    const a = S.airState(kNs * 1000);
    near(a.usedKg, gasForImpulse(Math.min(kNs, S.AIR.usableNs / 1000)).gasKg, 1e-9);
    near(a.leftKg, 250 - a.usedKg, 1e-9);
    assert.ok(a.pressureBar <= lastP); lastP = a.pressureBar;
  }
  assert.equal(S.airState(0).empty, false);
  assert.equal(S.airState(S.AIR.usableNs).empty, true);
});

test('full rear thrust empties the tank in about a second and then thrust stops', () => {
  const st = S.createCar({x: -200, z: 200});
  const inp = {...S.emptyInput(), boost: true};
  S.advance(st, inp, 0.5, {});
  assert.ok(!st.outOfAir); const half = st.air.usedKg;
  S.advance(st, inp, 1.5, {});
  assert.ok(st.outOfAir, 'out of air'); assert.ok(st.events.some(e => e.type === 'outOfAir') || st.outOfAir);
  near(st.air.usedKg, S.AIR.usableKg, 0.5, 'all usable gas used');
  assert.ok(half > 30 && half < 120, `0.5 s at 80 kN used ${half} kg`);
  // impulse delivered can never exceed the usable impulse
  assert.ok(st.impulse <= S.AIR.usableNs + 1);
  const v = st.speed; S.advance(st, inp, 0.5, {}); assert.ok(st.speed <= v + 0.5, 'no thrust after empty');
});

test('the 900 kg fact: 80 kN for 5 s is ~4× the usable impulse', () => {
  const need = 80 * 5; // kN·s
  assert.ok(need / (S.AIR.usableNs / 1000) > 4);
  assert.equal(LV.FACT.kg, 900);
});

test('judgeLanding grades', () => {
  assert.equal(S.judgeLanding({vy: -1.2, tiltDeg: 4, sideSpeed: 0.5}).grade, 'perfect');
  assert.equal(S.judgeLanding({vy: -2.6, tiltDeg: 15, sideSpeed: 1}).grade, 'good');
  assert.equal(S.judgeLanding({vy: -4.5, tiltDeg: 25, sideSpeed: 1}).grade, 'hard');
  assert.equal(S.judgeLanding({vy: -7, tiltDeg: 0}).grade, 'crash');
  assert.equal(S.judgeLanding({vy: -1, tiltDeg: 60}).grade, 'crash');
  assert.equal(S.judgeLanding({vy: -1, tiltDeg: 0, sideSpeed: 7}).grade, 'crash');
  assert.ok(S.stopDistance(-5) > 0 && S.stopDistance(-5, 1) < S.stopDistance(-5, 0.8));
  assert.equal(S.stopDistance(-5, 0.3), Infinity, 'lift jets cannot hold the car when tilted 72°');
});

function launchRun(boostSec, fan = true) {
  const L = LV.createLevel('launch', {greenAt: 1});
  let r = null;
  while (!r && L.t < 20) {
    let inp = {...S.emptyInput(), fan, throttle: L.t >= 1 ? 1 : 0, boost: L.t >= 1 && L.t < 1 + boostSec};
    inp = LV.gateInput(L, inp); S.step(L.car, inp, S.STEP, LV.WORLD); r = LV.update(L, S.STEP);
  }
  return r;
}
test('launch: fans matter, three stars are reachable with a short boost', () => {
  const noFan = launchRun(0, false), fanOnly = launchRun(0), boost = launchRun(0.2);
  assert.ok(noFan.success && fanOnly.success && boost.success);
  assert.ok(noFan.t60 > 2 && noFan.t60 < 2.6, `no fan ${noFan.t60}`);
  assert.ok(fanOnly.t60 < noFan.t60 * 0.6, `fan ${fanOnly.t60}`);
  assert.ok(boost.t60 <= 0.81 && boost.gasKg <= 35, `boost ${boost.t60} s ${boost.gasKg} kg`);
  assert.equal(boost.stars, 3);
});

test('launch: throttle before green is a jump start', () => {
  const L = LV.createLevel('launch', {greenAt: 2});
  let r = null;
  for (let i = 0; i < 240 && !r; i++) { const inp = LV.gateInput(L, {...S.emptyInput(), throttle: L.t > 0.5 ? 1 : 0}); S.step(L.car, inp, S.STEP, LV.WORLD); r = LV.update(L, S.STEP) || L.result; }
  assert.equal(r.success, false); assert.equal(r.reason, 'jump');
});

function rampRun({fan = true, targetV = 5, relDeg = 165} = {}) {
  const L = LV.createLevel('ramp'); const st = L.car; let r = null;
  for (let i = 0; i < 240 * 40 && !r; i++) {
    const inp = S.emptyInput(); inp.fan = fan; const ax = S.axes(st.q);
    if (st.mode === 'ground' && !st.flags.released) inp.throttle = st.speed < targetV ? 1 : 0;
    if (st.mode === 'ramp') { inp.throttle = st.speed < targetV ? 1 : 0; inp.release = st.s / S.RAMP.R * 180 / Math.PI >= relDeg; }
    if (st.mode === 'air') {
      const upY = ax.up[1];
      if (upY < 0.97) inp.roll = ax.right[1] > 0 ? 1 : -1;
      if (upY < 0.97 && Math.abs(ax.right[1]) < 0.05 && upY < 0) inp.roll = 1;
      inp.pitch = Math.max(-1, Math.min(1, ax.fwd[1] * -3)) * (upY > 0 ? 1 : -1);
      inp.lift = upY > 0.9 && st.vel[1] < -1.2 && st.pos[1] - S.CAR.cg <= S.stopDistance(st.vel[1], upY) + 0.3;
    }
    if (st.mode === 'ground' && st.flags.released) inp.brake = 1;
    S.step(st, inp, S.STEP, LV.WORLD); r = LV.update(L, S.STEP);
  }
  return {r, st};
}
test('ramp loop: with fans the car can release inverted, roll upright and land', () => {
  const {r, st} = rampRun();
  assert.ok(r?.success, JSON.stringify(r)); assert.ok(r.stars >= 2, `stars ${r.stars}`);
  assert.ok(st.flags.releaseAngle >= 150);
  assert.ok(r.gasKg < S.AIR.usableKg);
});
test('ramp loop: without fan suction the car falls off the loop', () => {
  const {r, st} = rampRun({fan: false, targetV: 8});
  const withFan = rampRun({fan: true, targetV: 8});
  assert.ok(!withFan.st.flags.detached, 'with suction the same speed holds on');
  assert.ok(st.flags.detached || r?.success === false, 'should detach without suction');
  assert.notEqual(r?.success, true);
});

test('kickflip: a well-timed lift clears the 4 m Semi and allows a full roll', () => {
  const L = LV.createLevel('kickflip'); const st = L.car; let r = null, lifted = 0;
  for (let i = 0; i < 240 * 40 && !r; i++) {
    const inp = S.emptyInput(); const ax = S.axes(st.q);
    if (st.mode === 'ground' && st.pos[0] < -12) inp.throttle = st.speed < 50 / 3.6 ? 0.3 : 0;
    if (st.pos[0] >= -12 && lifted < 0.55) { inp.lift = true; lifted += S.STEP; }
    else if (st.mode === 'air') {
      if (Math.abs(st.rollAccum) < 2 * Math.PI - 0.15) inp.roll = 1;
      else inp.roll = Math.max(-1, Math.min(1, -Math.asin(-ax.right[1]) * 2));
      inp.pitch = Math.max(-1, Math.min(1, -ax.fwd[1] * 3));
      inp.lift = ax.up[1] > 0.9 && st.vel[1] < -1.2 && st.pos[1] - S.CAR.cg <= S.stopDistance(st.vel[1], ax.up[1]) + 0.3;
    }
    S.step(st, inp, S.STEP, LV.WORLD); r = LV.update(L, S.STEP);
  }
  assert.ok(st.maxAlt > 4.2, `max alt ${st.maxAlt}`);
  assert.ok(Math.abs(st.rollAccum) * 180 / Math.PI >= 330, `roll ${st.rollAccum}`);
  assert.ok(r, 'level finished');
});

test('kickflip: driving into the row without lifting crashes', () => {
  const L = LV.createLevel('kickflip'); let r = null;
  for (let i = 0; i < 240 * 30 && !r; i++) { S.step(L.car, S.emptyInput(), S.STEP, LV.WORLD); r = LV.update(L, S.STEP); }
  assert.equal(r.success, false); assert.equal(r.reason, 'obstacle');
});

test('hop: lift above 4 m, spin, and land softly on the pad', () => {
  const L = LV.createLevel('hop'); const st = L.car; let r = null, phase = 'up';
  for (let i = 0; i < 240 * 30 && !r; i++) {
    const inp = S.emptyInput(); const ax = S.axes(st.q), alt = st.pos[1] - S.CAR.cg;
    if (phase === 'up') { inp.lift = true; if (alt > 1.6) phase = 'coast'; }
    else if (st.mode === 'air') {
      inp.yaw = Math.abs(st.yawAccum) < 2 * Math.PI - 0.4 ? 1 : 0;
      inp.roll = Math.max(-1, Math.min(1, -Math.asin(-ax.right[1]) * 2)); inp.pitch = Math.max(-1, Math.min(1, -ax.fwd[1] * 2));
      inp.lift = st.vel[1] < -1.2 && alt <= S.stopDistance(st.vel[1], ax.up[1]) + 0.3;
    }
    S.step(st, inp, S.STEP, LV.WORLD); r = LV.update(L, S.STEP);
  }
  assert.ok(r?.success, JSON.stringify(r)); assert.ok(r.maxAlt >= 4); assert.ok(r.stars >= 2, `stars ${r.stars} spin ${r.spinDeg}`);
});

test('best scores: saveResult keeps the best score and max stars (injected store)', () => {
  const mem = new Map(), store = {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v)};
  let o = LV.saveResult('ramp', {stars: 2, score: 2000, metric: 2.5}, store); assert.equal(o.newBest, true);
  o = LV.saveResult('ramp', {stars: 3, score: 1500, metric: 1}, store); assert.equal(o.newBest, false);
  const b = LV.loadBest(store).ramp; assert.equal(b.stars, 3); assert.equal(b.score, 2000); assert.equal(b.plays, 2);
  assert.deepEqual(LV.loadBest({getItem: () => '{bad json'}), {});
});

test('level obstacles: the stylized row has five vehicles including a 4 m Semi', () => {
  assert.equal(LV.ROW.length, 5);
  assert.deepEqual(LV.ROW.map(r => r[0]), ['Cybercab', 'Cybertruck', 'Semi', 'Model Y', 'Model 3']);
  assert.equal(Math.max(...LV.WORLD.obstacles.map(o => o.max[1])), 4);
  assert.throws(() => LV.createLevel('nope'), RangeError);
});
