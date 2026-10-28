import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate2D as simulate,DEFAULTS as ACTUAL_DEFAULTS,PRESETS as ACTUAL_PRESETS,analytic,idealTankState as tankState,G} from '../dist/physics.js';
const DEFAULTS={...ACTUAL_DEFAULTS,mass:2000};
const PRESETS=Object.fromEntries(Object.entries(ACTUAL_PRESETS).map(([k,p])=>[k,{...p,mass:2000}]));
test('unpowered upright drop agrees with analytical free fall',()=>{
 const r=simulate({...DEFAULTS,thrust:0,pitch:0,speed:0,drag:false});
 assert.ok(Math.abs(r.final.t-Math.sqrt(2*DEFAULTS.height/G))<0.00001);
 assert.ok(Math.abs(r.verticalSpeed-Math.sqrt(2*G*DEFAULTS.height))<0.001);
 assert.equal(r.gasUsed,0);assert.equal(r.soft,false);
});
test('gas and impulse conservation with constant-temperature exhaust',()=>{
 const r=simulate({...DEFAULTS,blowdown:false});
 assert.ok(Math.abs(r.impulse-r.gasUsed*DEFAULTS.exhaust)<0.000001);
 assert.ok(r.samples.every(s=>s.gas>=0 && Number.isFinite(s.y)));
});
test('insufficient thrust and no thrust cannot land softly',()=>{
 for(const name of ['ballistic','weak','late'])assert.equal(simulate(PRESETS[name]).soft,false,name);
});
test('adiabatic tank pressure and exhaust speed drop with inventory',()=>{
 const full=tankState(DEFAULTS,250),half=tankState(DEFAULTS,125);
 assert.ok(Math.abs(half.pressure/full.pressure-2**-1.4)<1e-12);
 assert.ok(half.temperature<full.temperature);assert.ok(half.exhaust<full.exhaust);
});
test('default landing and timestep convergence',()=>{
 const a=simulate(DEFAULTS),b=simulate(DEFAULTS, {dt:0.001});
 assert.equal(a.soft,true,a.reason);
 assert.ok(Math.abs(a.final.t-b.final.t)<0.04);
 assert.ok(Math.abs(a.gasUsed-b.gasUsed)<1);
 assert.ok(Math.abs(a.verticalSpeed-b.verticalSpeed)<0.12);
});
test('nozzle allocations are nonnegative and respect per-group limits',()=>{
 const r=simulate(DEFAULTS);
 for(const s of r.samples){assert.ok(s.front>=-1e-8&&s.rear>=-1e-8);assert.ok(s.front<=30000.00001&&s.rear<=30000.00001);}
});
test('independent analytical upright calculation closes energy and impulse',()=>{
 const a=analytic(DEFAULTS),m=DEFAULTS.mass,F=DEFAULTS.thrust*1000;
 assert.ok(Math.abs(a.burnHeight-DEFAULTS.height*a.weight/F)<1e-9);
 assert.ok(Math.abs(a.idealGas*DEFAULTS.exhaust-a.impulse)<1e-9);
 assert.ok(Math.abs(a.weight-19613.3)<0.01);
});
