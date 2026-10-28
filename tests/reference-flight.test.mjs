import test from 'node:test';
import assert from 'node:assert/strict';
import {gasState,nozzleSupply} from '../dist/hardware.js';
import {simulate3D} from '../dist/flight3d.js';
import {DEFAULTS,PRESETS,simulate} from '../dist/physics.js';
import {sensitivityCases} from '../dist/sensitivity.js';

const near=(a,b,tolerance)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);

test('default flight uses reference nitrogen for storage, discharge and regulator cooling',()=>{
 const r=simulate(PRESETS.fullRun);
 assert.equal(DEFAULTS.gasModel,'reference');assert.equal(r.p.gasModel,'reference');
 // Direct CoolProp 8.0.0 fixed-state checks recorded in reference-eos-check.json.
 // Tolerances allow the independently validated lookup interpolation error.
 near(r.hardware.initial.pressure/1e5,492.475,.5);
 const depleted=gasState(r.p,117);
 near(depleted.temperature,273.15-92.496,.5);
 assert.ok(depleted.feedTemperature<depleted.temperature);
 assert.equal(r.eosInvalidState,false);assert.equal(r.phaseLimited,false);
 const isothermal=gasState({...r.p,blowdown:false},250);
 near(isothermal.heatPerKg/1000,187.451,.2);
});

test('reference EOS changes the coupled flight, rather than applying a temperature offset afterward',()=>{
 const reference=simulate(PRESETS.fullRun),pr=simulate({...PRESETS.fullRun,gasModel:'pr'});
 assert.equal(pr.p.gasModel,'pr');assert.deepEqual(reference.ramp.samples,pr.ramp.samples);
 assert.ok(reference.hardware.initial.pressure>pr.hardware.initial.pressure*1.1);
 assert.ok(reference.minimumTemperature<pr.minimumTemperature-5);
 assert.ok(Math.abs(reference.gasUsed-pr.gasUsed)>.1);
 assert.ok(Math.abs(reference.contactVerticalSpeed-pr.contactVerticalSpeed)>.05);
 assert.notDeepEqual(reference.final.forces,pr.final.forces);
});

test('+15 C sensitivity recomputes reference thermodynamics and flight but still fails the cold screen',()=>{
 const base=simulate(PRESETS.fullRun);
 const scenario=sensitivityCases(PRESETS.fullRun).find(c=>c.label.includes('temperature +15'));
 assert.ok(scenario);assert.equal(scenario.params.ambientTemperature,35);
 assert.equal(scenario.params.gasModel,'reference');
 const warm=simulate(scenario.params);
 assert.equal(warm.eosInvalidState,false);assert.equal(warm.phaseLimited,false);
 near(warm.hardware.initial.temperature-base.hardware.initial.temperature,15,1e-8);
 assert.ok(warm.hardware.initial.pressure>base.hardware.initial.pressure);
 assert.ok(warm.minimumTemperature>base.minimumTemperature);
 assert.ok(Math.abs(warm.gasUsed-base.gasUsed)>.1);
 assert.ok(warm.minimumTemperature<273.15+warm.p.minimumGasTemperature);
 assert.equal(warm.thermalFits,false);assert.equal(warm.candidate,false);
});

test('outside-table input gives zero jets and an explicit failed EOS screen without NaNs',()=>{
 const p={...PRESETS.upright,tankVolume:10};
 const r=simulate3D(p);
 assert.equal(r.eosInvalidState,true);assert.equal(r.thermalFits,false);assert.equal(r.candidate,false);
 assert.ok(r.hardwareIssues.some(message=>/equation-of-state domain/.test(message)));
 assert.equal(r.gasUsed,0);assert.equal(r.impulse,0);
 assert.ok(r.samples.every(s=>s.forces.every(f=>f===0)));
 assert.ok(r.samples.every(s=>[s.t,s.y,s.vy,s.gas].every(Number.isFinite)));
 const stall=simulate({...PRESETS.rampStall,tankVolume:10});
 assert.equal(stall.hasFlight,false);assert.equal(stall.eosInvalidState,true);assert.equal(stall.thermalFits,false);
});

test('reference saturation cells stop flow, but subcritical single-phase gas does not',()=>{
 const gas=gasState(DEFAULTS,50),saturated=gasState(DEFAULTS,30);
 assert.ok(gas.temperature<126.192);assert.equal(gas.phaseLimited,false);assert.ok(gas.exhaust>0);
 assert.equal(saturated.phaseLimited,true);assert.equal(saturated.invalidState,false);assert.equal(saturated.exhaust,0);
 const supply=nozzleSupply(DEFAULTS,saturated);
 assert.equal(supply.feedMdot,0);assert.ok(supply.caps.every(f=>f===0));
 // This intentionally tall solver stress case exhausts the available single-
 // phase gas during flight; the standard stunt never reaches saturation.
 const r=simulate3D({...PRESETS.upright,height:150,throat:60,minimumGasTemperature:-160});
 assert.equal(r.phaseLimited,true);assert.equal(r.eosInvalidState,false);assert.equal(r.final.thrust,0);
 assert.ok(r.gasUsed>0);assert.equal(r.candidate,false);
 assert.ok(r.hardwareIssues.some(message=>/phase region/.test(message)));
});
