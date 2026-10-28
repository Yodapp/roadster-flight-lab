import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate3D,fromEuler,norm} from '../dist/flight3d.js';
import {simulateStunt} from '../dist/stunt.js';
import {PRESETS} from '../dist/physics.js';
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const driven={roll:0,yaw:0,driveForce:30,flipMode:'shortest',headingMode:'world'};

test('historical rotation policy screens backward touchdown without changing dynamics',()=>{
 const r=simulateStunt({...driven,feedDiameter:120,throat:50,minimumGasTemperature:-130});
 assert.ok(r.contactVerticalSpeed<r.p.contactSpeedLimit);assert.ok(r.longitudinalSpeed< -6);
 assert.equal(r.continuedInitialRotation,false);assert.equal(r.stable,true);assert.equal(r.thermalFits,true);
 assert.equal(r.longitudinalFits,false);assert.equal(r.soft,false);assert.equal(r.candidate,false);
 assert.match(r.reason,/Backward contact speed/);
 const permissive=simulateStunt({...r.ramp.p,longitudinalSpeedLimit:10});
 close(permissive.gasUsed,r.gasUsed);close(permissive.final.t,r.final.t);assert.deepEqual(permissive.samples,r.samples);
 assert.equal(permissive.soft,true);assert.equal(permissive.candidate,true);
});

test('continuing inherited ramp rotation reverses the harmful horizontal impulse without a free gas credit',()=>{
 const reverse=simulateStunt(driven),continued=simulateStunt({...driven,flipMode:'continue'});
 assert.ok(reverse.longitudinalSpeed< -6);assert.ok(continued.longitudinalSpeed>0&&continued.longitudinalSpeed<1);
 assert.equal(continued.continuedInitialRotation,true);assert.deepEqual(continued.ramp.samples,reverse.ramp.samples);
 assert.ok(reverse.impulseBudget.beforeBurn.world[0]<-11000);
 assert.ok(continued.impulseBudget.beforeBurn.world[0]>9000);
 assert.ok(continued.impulseBudget.beforeBurn.downward>9000);
 assert.ok(Math.abs(continued.impulseBudget.beforeBurn.scalar-reverse.impulseBudget.beforeBurn.scalar)<150);
 assert.ok(Math.abs(continued.gasUsed-reverse.gasUsed)<1);
 const larger=simulateStunt({...driven,flipMode:'continue',feedDiameter:120,throat:50});
 assert.equal(larger.soft,true);assert.equal(larger.thermalFits,false);assert.equal(larger.candidate,false);
});

test('release-heading lateral control is invariant to rotating the whole track azimuth',()=>{
 const inputs={feedDiameter:120,throat:50,headingMode:'release',flipMode:'continue',roll:15};
 const aligned=simulate3D({...inputs,yaw:0}),turned=simulate3D({...inputs,yaw:27});
 close(aligned.contactVerticalSpeed,turned.contactVerticalSpeed,1e-6);
 close(aligned.lateralSpeed,turned.lateralSpeed,1e-6);close(aligned.longitudinalSpeed,turned.longitudinalSpeed,1e-6);
 close(aligned.gasUsed,turned.gasUsed,1e-6);assert.equal(turned.targetHeading,27);
 const old=simulate3D({feedDiameter:120,throat:50,roll:0,yaw:10,headingMode:'world'});
 const held=simulate3D({feedDiameter:120,throat:50,roll:0,yaw:10,headingMode:'release'});
 assert.ok(old.lateralSpeed>.9);assert.ok(held.lateralSpeed<.001);
});

test('lateral velocity target is expressed across the selected heading, separate from a touchdown limit',()=>{
 const p={height:10,pitch:0,roll:0,speed:0,releaseRateFromRamp:false,headingMode:'release',lateralVelocityTarget:1};
 const a=simulate3D({...p,yaw:0},{maxTime:.5}),b=simulate3D({...p,yaw:40},{maxTime:.5});
 const alpha=40*Math.PI/180,project=s=>-Math.sin(alpha)*s.vx+Math.cos(alpha)*s.vLateral;
 assert.ok(a.final.vLateral>.01);close(project(b.final),a.final.vLateral,1e-7);
 close(a.gasUsed,b.gasUsed,1e-7);assert.equal(a.p.sideSpeedLimit,1);
});

test('continuation branch is quaternion-sign invariant and does not invent a loop from zero rotation',()=>{
 const p={height:20,pitch:170,roll:0,yaw:0,flipMode:'continue',releaseRateFromRamp:false};
 const noRotation=simulate3D(p,{maxTime:.05});assert.equal(noRotation.continuedInitialRotation,false);assert.equal(noRotation.continuationActivations,0);
 const q=fromEuler(0,-170*Math.PI/180,0),w=[0,-.4,0];
 const a=simulate3D(p,{initialState:{q,w}}),b=simulate3D(p,{initialState:{q:q.map(x=>-x),w}});
 assert.equal(a.continuedInitialRotation,true);assert.equal(b.continuedInitialRotation,true);
 assert.equal(a.continuationActivations,1);assert.equal(b.continuationActivations,1);
 close(a.final.t,b.final.t,1e-8);close(a.gasUsed,b.gasUsed,1e-8);close(a.longitudinalSpeed,b.longitudinalSpeed,1e-8);
 assert.ok(a.samples.every(s=>Math.abs(norm(s.q)-1)<1e-12));
});

test('driven default activates continuation exactly once through the full landing sequence',()=>{
 const r=simulateStunt(PRESETS.fullRun);
 assert.equal(r.ramp.released,true);assert.equal(r.landed,true);
 assert.equal(r.continuedInitialRotation,true);assert.equal(r.continuationActivations,1);
 assert.ok(r.samples.filter(s=>s.phase==='flight').length>20);
 const short=simulateStunt({...PRESETS.fullRun,flipMode:'shortest'});
 assert.equal(short.continuationActivations,0);
});

test('continuation never activates in upright, stalled, zero-rate or 90-degree cases',()=>{
 const upright=simulate3D({...PRESETS.upright,flipMode:'continue'});
 const stall=simulateStunt(PRESETS.rampStall);
 const zeroRate=simulate3D({...PRESETS.fullRun,releaseRateFromRamp:false,rollRate:0,pitchRate:0,yawRate:0});
 // A nonzero inherited rate is intentional: the 90-degree attitude alone must
 // reject continuation even when that rate opposes the short correction.
 const quarterTurn=simulate3D({...PRESETS.fullRun,pitch:90});
 assert.equal(stall.hasFlight,false);assert.ok(norm(quarterTurn.initialAngularRate)>0);
 for(const [label,r] of Object.entries({upright,stall,zeroRate,quarterTurn})){
  assert.equal(r.continuedInitialRotation,false,label);
  assert.equal(r.continuationActivations,0,label);
 }
});

test('impulse diagnostics close the signed vertical budget through partial final steps',()=>{
 for(const p of [driven,{...driven,flipMode:'continue'},{...driven,allThrustersOff:true}]){
  const r=simulateStunt(p),b=r.impulseBudget;
  close(b.upward-b.downward,b.world[2],1e-7);
  close(b.beforeBurn.upward-b.beforeBurn.downward,b.beforeBurn.world[2],1e-7);
  assert.ok(norm(b.world)<=r.impulse+1e-7);assert.ok(b.beforeBurn.scalar<=r.impulse+1e-7);
  if(p.allThrustersOff)assert.deepEqual(b,{world:[0,0,0],upward:0,downward:0,beforeBurn:{scalar:0,world:[0,0,0],upward:0,downward:0}});
 }
 const stop=simulateStunt({...driven,driveForce:8});assert.equal(stop.longitudinalFits,null);assert.deepEqual(stop.impulseBudget.world,[0,0,0]);
});

test('invalid controller policy is rejected even before a ramp that would stall',()=>{
 for(const p of [{flipMode:'random'},{headingMode:'velocity'},{lateralVelocityTarget:NaN},{longitudinalSpeedLimit:-1}]){
  assert.throws(()=>simulate3D(p),RangeError);
  assert.throws(()=>simulateStunt({...driven,...p,driveForce:8}),RangeError);
 }
});


test('exported contactVelocity is the complete world vector, not a vertical-speed alias',()=>{
 const r=simulateStunt({...driven,flipMode:'continue'});
 assert.equal(r.contactVelocity.length,3);assert.ok(r.contactVelocity.every(Number.isFinite));
 assert.deepEqual(r.contactVelocity,r.final.contactVelocity);assert.deepEqual(r.contactVelocity,r.contact.velocity);
 close(r.contactVerticalSpeed,Math.max(0,-r.contactVelocity[2]));
 assert.equal(simulateStunt({...driven,driveForce:8}).contactVelocity,null);
});
