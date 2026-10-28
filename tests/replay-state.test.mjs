import test from 'node:test';
import assert from 'node:assert/strict';
import {replaySample,replayDisplaySample} from '../dist/replay-state.js';
import {fromEuler,rotate} from '../dist/flight3d.js';
const p={mass:2200,gas:250,cgX:0,cgY:0,cgZ:0};
const sample=(extra={})=>({t:0,x:0,y:10,lateral:0,vx:0,vy:0,vLateral:0,gas:250,q:[1,0,0,0],w:[0,0,0],forces:Array(10).fill(0),phase:'flight',manifoldPressure:null,feedBinding:false,...extra});
test('replay interpolates equivalent antipodal quaternions without a spurious spin',()=>{
 const q=fromEuler(.3,1.2,-.4),a=sample({q}),b=sample({t:1,q:q.map(x=>-x)});
 const r=replaySample({p,samples:[a,b]},.5);
 assert.ok(r.q.every(Number.isFinite));
 rotate(r.q,[1,0,0]).forEach((v,i)=>assert.ok(Math.abs(v-rotate(q,[1,0,0])[i])<1e-12));
 assert.deepEqual(a.q,q);assert.deepEqual(b.q,q.map(x=>-x));
});
test('replay selects flight at equal-time release and preserves null/discrete hydraulic states',()=>{
 const samples=[sample({phase:'ramp'}),sample({t:1,phase:'ramp'}),sample({t:1}),sample({t:2,manifoldPressure:8e6,feedBinding:true})];
 assert.equal(replaySample({p,samples},.9).phase,'ramp');
 assert.equal(replaySample({p,samples},1).phase,'flight');
 const between=replaySample({p,samples},1.5);assert.equal(between.manifoldPressure,null);assert.equal(between.feedBinding,false);
 const end=replaySample({p,samples},2);assert.equal(end.manifoldPressure,8e6);assert.equal(end.feedBinding,true);
});
test('HUD totals follow interpolated individual jets and angular velocity rather than interpolating norms',()=>{
 const a=sample({w:[1,0,0],forces:[1000,0,0,0,0,0,0,0,0,0],drivingForce:100,fanSuction:1000,normalForce:2000,fanElectricalPower:20000,driveElectricalPower:30000,batteryPower:50000});
 const b=sample({t:1,w:[-1,0,0],forces:[0,3000,0,0,0,0,0,0,0,0],drivingForce:300,fanSuction:3000,normalForce:4000,fanElectricalPower:40000,driveElectricalPower:50000,batteryPower:90000});
 const s=replaySample({p,samples:[a,b]},.5);
 assert.equal(s.omega,0);assert.equal(s.thrust,2000);assert.equal(s.rear,2000);assert.equal(s.drivingForce,200);assert.equal(s.fanSuction,2000);
 assert.equal(s.netThrust,2000);assert.equal(s.load,2000/(2200*9.80665));
 assert.equal(s.normalForce,3000);assert.equal(s.fanElectricalPower,30000);
 assert.equal(s.driveElectricalPower,40000);assert.equal(s.batteryPower,70000);
});
test('live jets turn off at contact without erasing recorded forces or inventing a post-impact velocity',()=>{
 const a=sample({forces:[5000,5000,5000,5000,0,0,0,0,0,0],vy:-.8,manifoldPressure:6e6,feedBinding:true,burning:true});
 const b=sample({...a,t:1}),result={p,samples:[a,b],final:b,landed:true};
 const original=structuredClone(result);
 assert.equal(replayDisplaySample(result,.99).thrust,20000);
 for(const t of [1,2]){
  const display=replayDisplaySample(result,t);
  assert.deepEqual(display.forces,Array(10).fill(0));assert.equal(display.thrust,0);assert.equal(display.netThrust,0);
  assert.equal(display.manifoldPressure,null);assert.equal(display.feedBinding,false);assert.equal(display.burning,false);
  assert.equal(display.replayComplete,true);assert.equal(display.vy,-.8);
 }
 assert.deepEqual(result,original);assert.equal(replaySample(result,1).thrust,20000);
 assert.equal(replayDisplaySample({...result,landed:false},1).thrust,20000);
});
