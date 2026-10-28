import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate3D,contactState,aerodynamicForce,nozzleWrench,rotate,fromEuler,support,SHAPE} from '../dist/flight3d.js';
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} differs from ${b}`);
const still={q:[1,0,0,0],w:[0,0,0],y:.6,vx:0,vy:0,vLateral:0};

test('release velocity follows uphill body heading and release curvature supplies angular rate',()=>{
 const r=simulate3D({pitch:90,roll:0,yaw:35,speed:4},{maxTime:.003});
 const s=r.samples[0],forward=rotate(s.q,[4,0,0]);
 [s.vx,s.vLateral,s.vy].forEach((x,i)=>close(x,forward[i]));
 const worldOmega=rotate(s.q,s.w),rate=4/r.hardware.rampCGRadius;
 close(worldOmega[0],rate*Math.sin(35*Math.PI/180));
 close(worldOmega[1],-rate*Math.cos(35*Math.PI/180));
 close(worldOmega[2],0);
 const stopped=simulate3D({releaseRateFromRamp:false,rollRate:20,pitchRate:-10,yawRate:5},{maxTime:.003});
 [20,-10,5].forEach((x,i)=>close(stopped.samples[0].w[i],x*Math.PI/180));
});

test('contact uses omega cross r, including the fastest of simultaneous corners',()=>{
 const c=contactState({...still,vy:-1,w:[0,1,0]});
 close(c.verticalSpeed,1+SHAPE.length/2);
 close(c.velocity[2],-3.3);
 assert.equal(c.contacts,4);
 const yaw=contactState({...still,w:[0,0,1]});
 close(yaw.lateralSpeed,SHAPE.length/2);
 const offset=contactState({...still,y:.8},{cgZ:.2});
 close(offset.clearance,0);
 close(support([1,0,0,0],{cgZ:.2}),.8);
});

test('opposed jets consume scalar thrust but cancel net force and CG shifts real torque',()=>{
 const opposing=nozzleWrench([0,0,0,0,0,0,0,0,1000,1000]);
 opposing.force.forEach(x=>close(x,0));
 const centered=nozzleWrench([1000,1000,1000,1000,0,0,0,0,0,0]);
 centered.torque.forEach(x=>close(x,0));
 const offset=nozzleWrench([1000,1000,1000,1000,0,0,0,0,0,0],{cgX:.2});
 close(offset.torque[1],800);
});

test('wind-relative drag opposes airflow and broadside area increases drag',()=>{
 const p={drag:true},front=aerodynamicForce({...still,vx:20},p),broad=aerodynamicForce({...still,vx:20,q:fromEuler(0,Math.PI/2,0)},p);
 assert.ok(front[0]<0);assert.ok(Math.abs(broad[0])>10*Math.abs(front[0]));
 const wind=aerodynamicForce(still,{drag:true,windY:10});assert.ok(wind[1]>0);close(wind[0],0);
 const matched=aerodynamicForce({...still,vx:3,vLateral:7},{drag:true,windX:3,windY:7});assert.deepEqual(matched,[0,0,0]);
 assert.deepEqual(aerodynamicForce({...still,vx:20},{drag:false}),[0,0,0]);
});

test('failed actuator is never fired and changes the simulated trajectory',()=>{
 const p={feedDiameter:120,throat:50};
 const ok=simulate3D(p),failed=simulate3D({...p,failedNozzle:0});
 assert.ok(failed.samples.every(s=>s.forces[0]===0));
 assert.ok(Math.abs(failed.verticalSpeed-ok.verticalSpeed)>.2||Math.abs(failed.pitchError-ok.pitchError)>1);
});

test('former larger-feed pass fails lateral-contact and material-temperature screens',()=>{
 const r=simulate3D({feedDiameter:120,throat:50});
 assert.ok(r.contactVerticalSpeed<1.5);
 assert.ok(r.lateralSpeed>1);
 assert.equal(r.soft,false);assert.equal(r.candidate,false);assert.equal(r.thermalFits,false);
 assert.ok(r.hardwareIssues.some(x=>x.includes('temperature')));
 assert.ok(r.peakSeatLoad>0);
 assert.ok(r.samples.every(s=>s.contactVelocity.length===3&&Number.isFinite(s.seatLoad)));
});

test('cold-material threshold and lateral limit change screens, not the trajectory',()=>{
 const p={feedDiameter:120,throat:50,longitudinalSpeedLimit:20},a=simulate3D(p),b=simulate3D({...p,sideSpeedLimit:4,minimumGasTemperature:-130});
 close(a.gasUsed,b.gasUsed);close(a.final.t,b.final.t);close(a.contactVerticalSpeed,b.contactVerticalSpeed);
 assert.equal(b.soft,true);assert.equal(b.thermalFits,true);
});

test('isothermal assumption accounts for large heat transfer instead of free energy',()=>{
 const a=simulate3D({blowdown:false}),b=simulate3D({blowdown:true});
 assert.ok(a.maxHeatPower>1e6);assert.ok(a.heatRequired>1e6);assert.equal(a.heatFits,false);
 assert.equal(b.maxHeatPower,0);assert.equal(b.heatRequired,0);
 const permitted=simulate3D({blowdown:false,heatTransferPower:1e6});assert.equal(permitted.heatFits,true);
});

test('first ground contact has zero geometric clearance and converges with timestep',()=>{
 const p={feedDiameter:120,throat:50},a=simulate3D(p),b=simulate3D(p,{dt:.0015});
 close(a.final.y-support(a.final.q,a.p),0,1e-10);
 assert.ok(Math.abs(a.contactVerticalSpeed-b.contactVerticalSpeed)<.3);
 assert.ok(Math.abs(a.gasUsed-b.gasUsed)<2);
 const zero=simulate3D({height:0,pitch:0,roll:0,yaw:0,speed:0,allThrustersOff:true,drag:false});
 assert.equal(zero.landed,true);assert.ok(zero.final.t<1e-8);assert.ok(zero.verticalSpeed<1e-6);
});

test('time limit does not fabricate a ground-contact event; invalid integration fails explicitly',()=>{
 const r=simulate3D({height:100,allThrustersOff:true},{maxTime:.03});
 assert.equal(r.landed,false);assert.equal(r.events.at(-1).label,'Simulation time limit');
 assert.throws(()=>simulate3D({}, {dt:0}),/Time step/);
 assert.throws(()=>simulate3D({mass:NaN}),/finite/);
 assert.throws(()=>simulate3D({failedNozzle:10}),/Failed nozzle/);
 assert.throws(()=>simulate3D({gas:0}),/physical/);
});

test('torque-free midpoint angular integration conserves rotational energy and momentum',()=>{
 const r=simulate3D({height:100,releaseRateFromRamp:false,rollRate:30,pitchRate:50,yawRate:90,allThrustersOff:true,drag:false},{maxTime:3});
 const I=[(SHAPE.width**2+SHAPE.height**2)/12,(SHAPE.length**2+SHAPE.height**2)/12,(SHAPE.length**2+SHAPE.width**2)/12];
 const energy=s=>s.w.reduce((sum,w,i)=>sum+I[i]*w*w,0);
 const momentum=s=>Math.hypot(...s.w.map((w,i)=>w*I[i]));
 assert.ok(Math.abs(energy(r.final)/energy(r.samples[0])-1)<1e-6);
 assert.ok(Math.abs(momentum(r.final)/momentum(r.samples[0])-1)<1e-6);
});

test('ideal isothermal tank heating equals expelled mass times R times temperature',()=>{
 const r=simulate3D({realGas:false,blowdown:false});
 close(r.heatRequired,r.gasUsed*287.05*293.15,1e-5);
});

test('upright five-metre control drop passes the chosen screens without hiding thermal demand',()=>{
 const r=simulate3D({feedDiameter:120,throat:50,height:5,pitch:0,roll:0,yaw:0,speed:0});
 assert.equal(r.candidate,true,r.reason);assert.ok(r.contactVerticalSpeed<1);assert.ok(r.lateralSpeed<.01);assert.equal(r.heatRequired,0);assert.ok(r.minimumFeedTemperature>193.15);
});
