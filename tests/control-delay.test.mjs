import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate3D,fromEuler,support} from '../dist/flight3d.js';
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} differs from ${b}`);

test('omitted and explicit zero command delay produce identical flight',()=>{
 const p={feedDiameter:120,throat:50},a=simulate3D(p),b=simulate3D({...p,controlDelay:0});
 assert.deepEqual(a.samples,b.samples);assert.equal(a.contactVerticalSpeed,b.contactVerticalSpeed);assert.equal(a.gasUsed,b.gasUsed);assert.equal(a.p.controlDelay,0);
});

test('pure control delay produces no early thrust or gas use, even with instantaneous valves',()=>{
 const p={controlDelay:4.5,valveLag:0};
 for(const maxTime of [.004,.0045]){
  const r=simulate3D(p,{maxTime}),free=simulate3D({...p,allThrustersOff:true},{maxTime});
  assert.equal(r.gasUsed,0);assert.equal(r.impulse,0);assert.equal(r.final.thrust,0);
  close(r.final.y,free.final.y);close(r.final.vy,free.final.vy);close(r.final.t,maxTime);
 }
});

test('fractional-step command arrival is resolved at its actual time, not rounded',()=>{
 const p={controlDelay:4.5,valveLag:0};
 const a=simulate3D(p,{dt:.003,maxTime:.0046}),b=simulate3D(p,{dt:.002,maxTime:.0046});
 const direct=simulate3D({...p,controlDelay:0},{maxTime:.0001});
 assert.ok(a.gasUsed>0);close(a.gasUsed,b.gasUsed);close(a.gasUsed,direct.gasUsed);
 close(a.impulse,direct.impulse,1e-7);close(a.final.t,.0046);
});

test('command delay is separate from valve response and can change the landing screen',()=>{
 const p={feedDiameter:120,throat:50};
 const immediate=simulate3D(p),delayed=simulate3D({...p,controlDelay:100});
 assert.equal(immediate.p.valveLag,delayed.p.valveLag);
 assert.ok(immediate.contactVerticalSpeed<1.5);assert.ok(delayed.contactVerticalSpeed>1.5);
 assert.ok(delayed.gasUsed>0);assert.ok(delayed.events.some(e=>e.label==='Landing burn command'));
 assert.throws(()=>simulate3D({controlDelay:-1}),/Control delay/);
 assert.throws(()=>simulate3D({controlDelay:NaN}),/finite/);
});

test('integration respects a non-integral time horizon exactly',()=>{
 const r=simulate3D({height:100,allThrustersOff:true},{dt:.003,maxTime:.01});
 close(r.final.t,.01,1e-14);assert.equal(r.landed,false);assert.equal(r.events.at(-1).label,'Simulation time limit');
 assert.ok(r.samples.every(s=>s.t<=.01));
});

test('initial contact stops at t=0 before valves, gas, heat or peak loads advance',()=>{
 const r=simulate3D({height:0,pitch:0,roll:0,yaw:0,speed:0,auto:false,brakeHeight:9,valveLag:0,blowdown:false});
 assert.equal(r.landed,true);assert.equal(r.final.t,0);assert.equal(r.gasUsed,0);assert.equal(r.impulse,0);assert.equal(r.heatRequired,0);assert.equal(r.maxHeatPower,0);assert.equal(r.peakLoad,0);assert.equal(r.samples.length,1);
});

test('explicit ramp-release state is copied and validated without injecting gas or forces',()=>{
 const q=fromEuler(.1,-2,.2),initial={q,w:[.1,-.3,.2],x:8,y:21,lateral:2,vx:-3,vy:.7,vLateral:.2};
 const r=simulate3D({allThrustersOff:true},{initialState:initial,maxTime:.001});
 for(const key of ['x','y','lateral','vx','vy','vLateral'])close(r.samples[0][key],initial[key]);
 assert.deepEqual(r.initialAngularRate,initial.w);assert.notEqual(r.samples[0].w,initial.w);assert.deepEqual(initial.w,[.1,-.3,.2]);
 assert.throws(()=>simulate3D({}, {initialState:{gas:400}}),/Unsupported initial-state/);
 assert.throws(()=>simulate3D({}, {initialState:{q:[1,0,0]}}),/four finite/);
 assert.throws(()=>simulate3D({}, {initialState:{vy:Infinity}}),/finite/);
 assert.throws(()=>simulate3D({}, {initialState:{y:-1}}),/penetrates/);
});

test('a nonflowing regulator does not create a fictitious cold-component violation',()=>{
 const r=simulate3D({height:5,pitch:0,roll:0,yaw:0,speed:0,allThrustersOff:true,minimumGasTemperature:0});
 assert.equal(r.hasGasFlow,false);assert.equal(r.gasUsed,0);close(r.minimumFeedTemperature,293.15);assert.equal(r.thermalFits,true);
 const flow=simulate3D({feedDiameter:120,throat:50});assert.equal(flow.hasGasFlow,true);assert.ok(flow.minimumFeedTemperature<200);
});
