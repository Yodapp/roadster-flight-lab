import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRamp} from '../dist/ramp.js';
import {rotate} from '../dist/flight3d.js';
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);
const driven={roll:0,yaw:0,driveForce:30};

test('powered ramp starts at rest and releases with exact circular-path velocity and rotation',()=>{
 const r=simulateRamp({...driven,yaw:25});assert.equal(r.released,true,r.reason);assert.equal(r.samples[0].geometricSpeed,0);assert.equal(r.samples.at(-1).t,r.time);
 const s=r.releaseState,phi=170*Math.PI/180,w=s.omega,R=r.geometricRadius;
 close(s.vx,R*Math.cos(phi)*w*Math.cos(25*Math.PI/180));close(s.vLateral,R*Math.cos(phi)*w*Math.sin(25*Math.PI/180));close(s.vy,R*Math.sin(phi)*w);
 close(s.w[1],-r.exitSpeed/R);assert.ok(r.exitSpeed>3.99&&r.exitSpeed<=4.001);
 assert.ok(r.samples.every(x=>x.gas===250&&x.forces.every(f=>f===0)));
});

test('ramp mechanical work closes translational, pitch and gravitational energy',()=>{
 for(const p of [driven,{...driven,cgX:.2,cgZ:.15,inertiaScale:1.4}]){
  const r=simulateRamp(p);assert.equal(r.released,true,r.reason);
  assert.ok(Math.abs(r.energyResidualJ)<2);
  close(r.energyJ,r.driveWorkJ-r.rollingLossJ-r.dragLossJ,1e-6);
  close(r.batteryEnergyJ,r.fanEnergyJ+r.driveWorkJ/.9,1e-6);
  assert.ok(r.batteryEnergyJ>r.energyJ);
 }
});

test('CG offset appears in constrained release kinematics and normal-acceleration balance',()=>{
 const p={...driven,cgX:.2,cgZ:.3},r=simulateRamp(p),s=r.releaseState,phi=s.phi,omega=s.omega;
 close(s.vx,(r.cgRadius*Math.cos(phi)-p.cgX*Math.sin(phi))*omega);
 close(s.vy,(r.cgRadius*Math.sin(phi)+p.cgX*Math.cos(phi))*omega);
 const a=simulateRamp({...driven,cgX:.2},{maxTime:.005});
 // From rest at foot, a forward CG rises as pitch acceleration starts: +m*cgX*alpha.
 assert.ok(a.samples[0].normalForce>2200*9.80665);
});

test('inadequate wheel force stalls the climb instead of inventing an airborne start',()=>{
 const r=simulateRamp({roll:0,driveForce:18});assert.equal(r.released,false);assert.equal(r.releaseState,null);assert.match(r.reason,/stalls/);assert.ok(r.final.phi<170*Math.PI/180);
});

test('limited wheel power reduces achieved release speed and stays within battery budget',()=>{
 const p={...driven,drivePower:20,batteryPower:70},r=simulateRamp(p);
 assert.equal(r.released,true,r.reason);assert.ok(r.exitSpeed<3);assert.ok(r.powerLimited);assert.ok(r.peakPowerW<=70000+1);
 assert.ok(r.samples.every(s=>s.batteryPower<=70000+1));
 assert.ok(r.samples.every(s=>s.driveElectricalPower<=20000+1e-6));
});

test('no electrical power produces no drive force or free ramp motion',()=>{
 const r=simulateRamp({...driven,batteryPower:0});assert.equal(r.released,false);assert.equal(r.exitSpeed,0);assert.equal(r.energyJ,0);assert.equal(r.batteryEnergyJ,0);
 assert.ok(r.samples.every(s=>s.drivingForce===0&&s.fanSuction===0));
});

test('fan spin-up can remove the grip needed for the climb',()=>{
 const a=simulateRamp(driven),b=simulateRamp({...driven,fanSpinup:15});assert.equal(a.released,true);assert.equal(b.released,false);assert.ok(b.tractionLimited);
 assert.ok(a.samples[0].fanSuction===0);assert.ok(a.samples.some(s=>s.fanSuction>20000));
});

test('ramp integration converges and respects an exact time limit',()=>{
 const a=simulateRamp(driven),b=simulateRamp(driven,{dt:.0025});assert.ok(Math.abs(a.time-b.time)<.003);assert.ok(Math.abs(a.batteryEnergyJ-b.batteryEnergyJ)<30);
 const short=simulateRamp(driven,{dt:.005,maxTime:.012});close(short.time,.012,1e-12);assert.match(short.reason,/time window/);assert.equal(short.samples.at(-1).t,short.time);
});

test('unsupported bank, insufficient seal travel and invalid inputs are explicit',()=>{
 const bank=simulateRamp({...driven,roll:15});assert.equal(bank.released,false);assert.equal(bank.unsupported,true);assert.match(bank.reason,/bank/);
 const skirt=simulateRamp({...driven,skirtTravel:20});assert.equal(skirt.released,false);assert.match(skirt.reason,/Seal travel/);
 assert.throws(()=>simulateRamp({...driven,driveForce:-1}),/physical/);assert.throws(()=>simulateRamp(driven,{dt:0}),/time step/);
});


test('motor electrical budget includes drivetrain efficiency and initial rollback is explicit',()=>{
 const r=simulateRamp({...driven,drivePower:25,batteryPower:50});assert.ok(r.samples.every(s=>s.driveElectricalPower<=25000+1e-6));assert.ok(r.peakPowerW<=50000+1e-6);
 const rollback=simulateRamp({...driven,cgX:.4,driveForce:0,rollingResistance:0});assert.equal(rollback.released,false);assert.equal(rollback.time,0);assert.match(rollback.reason,/roll back/);
});


test('zero-angle ramp rejects an elevated release but permits a ground-level zero arc',()=>{
 const elevated=simulateRamp({...driven,pitch:0,height:20});
 assert.equal(elevated.released,false);assert.equal(elevated.releaseState,null);assert.equal(elevated.time,0);assert.match(elevated.reason,/zero-angle.*positive release height/);
 assert.equal(elevated.events.at(-1).label,'Invalid ramp geometry');
 const finiteNumbers=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')Object.values(value).forEach(finiteNumbers);};
 elevated.samples.forEach(finiteNumbers);[elevated.energyJ,elevated.batteryEnergyJ,elevated.peakPowerW,elevated.minimumNormal,elevated.peakSeatLoad].forEach(finiteNumbers);
 const ground=simulateRamp({...driven,pitch:0,height:0});assert.equal(ground.released,true);assert.equal(ground.time,0);close(ground.releaseState.y,.6);assert.equal(ground.exitSpeed,0);assert.equal(ground.batteryEnergyJ,0);ground.samples.forEach(finiteNumbers);
 assert.throws(()=>simulateRamp({...driven,height:-1}),/physical/);
});
