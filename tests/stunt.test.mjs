import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateStunt} from '../dist/stunt.js';
import {simulate3D,norm} from '../dist/flight3d.js';
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} differs from ${b}`);
const driven={roll:0,driveForce:30,feedDiameter:120,throat:50};

test('driven stunt starts at rest and carries every release-state component continuously into flight',()=>{
 const r=simulateStunt({...driven,yaw:23}),air=r.samples.find(s=>s.phase==='flight'),road=r.samples.filter(s=>s.phase==='ramp').at(-1);
 assert.equal(r.ramp.released,true);assert.equal(r.hasFlight,true);assert.equal(r.samples[0].phase,'ramp');
 assert.equal(r.samples[0].t,0);close(r.samples[0].vx,0);close(r.samples[0].vy,0);close(norm(r.samples[0].w),0);
 for(const key of ['t','x','y','lateral','vx','vy','vLateral','gas'])close(road[key],air[key]);
 for(const key of ['q','w'])road[key].forEach((v,i)=>close(v,air[key][i]));
 close(air.t,r.airborneStart);close(r.final.t,r.airborneStart+r.flightDuration);close(r.fullDuration,r.final.t);
 assert.ok(r.samples.every((s,i)=>i===0||s.t>=r.samples[i-1].t));
 assert.ok(r.samples.filter(s=>s.phase==='ramp').every(s=>s.gas===r.p.gas&&s.forces.every(f=>f===0)));
 close(r.peakSeatLoad,Math.max(r.ramp.peakSeatLoad,...r.samples.filter(s=>s.phase==='flight').map(s=>s.seatLoad)),.05);
});

test('power-limited exit speed is propagated rather than reset to the requested drive target',()=>{
 const r=simulateStunt({...driven,drivePower:30}),air=r.samples.find(s=>s.phase==='flight');
 assert.equal(r.ramp.released,true);assert.ok(r.ramp.exitSpeed<3.8);assert.ok(r.ramp.exitSpeed>0);
 close(Math.hypot(air.vx,air.vy,air.vLateral),r.ramp.exitCGSpeed);
 close(r.p.speed,r.ramp.exitSpeed);assert.ok(Math.abs(Math.hypot(air.vx,air.vy,air.vLateral)-4)>.1);
});

test('stalled ramp has no simulated flight or invented touchdown measurements',()=>{
 const r=simulateStunt({...driven,driveForce:10});
 assert.equal(r.ramp.released,false);assert.equal(r.hasFlight,false);assert.equal(r.landed,false);assert.equal(r.candidate,false);
 assert.ok(r.samples.every(s=>s.phase==='ramp'));assert.equal(r.airborneStart,null);assert.equal(r.flightDuration,0);assert.equal(r.gasUsed,0);
 for(const key of ['verticalSpeed','contactVerticalSpeed','lateralSpeed','longitudinalSpeed','pitchError','angularSpeed','landingEnergy'])assert.equal(r[key],null,key);
 assert.equal(r.reason,r.ramp.reason);close(r.final.t,r.ramp.time);assert.equal(r.events.at(-1).label,'Ramp stalled');
});

test('ballistic reference still drives exactly the same ramp before disabling airborne jets',()=>{
 const powered=simulateStunt(driven),ballistic=simulateStunt({...driven,thrust:0,allThrustersOff:true});
 assert.deepEqual(powered.ramp.samples,ballistic.ramp.samples);close(powered.airborneStart,ballistic.airborneStart);
 assert.equal(ballistic.gasUsed,0);assert.ok(powered.gasUsed>0);assert.ok(ballistic.contactVerticalSpeed>powered.contactVerticalSpeed);
});

test('ramp time window is separate from airborne horizon and a stopped ramp never calls airborne control',()=>{
 const shortAir=simulateStunt(driven,{maxTime:.01});
 assert.equal(shortAir.ramp.released,true);assert.equal(shortAir.landed,false);close(shortAir.flightDuration,.01,1e-12);
 assert.equal(shortAir.events.at(-1).label,'Simulation time limit');
 const shortRamp=simulateStunt(driven,{rampMaxTime:.01,maxTime:.5});
 assert.equal(shortRamp.hasFlight,false);close(shortRamp.final.t,.01,1e-12);assert.equal(shortRamp.final.thrust,0);
});

test('banked-ramp rejection returns complete finite playback telemetry without inventing a release',()=>{
 const r=simulateStunt({...driven,roll:15});
 assert.equal(r.hasFlight,false);assert.equal(r.final.t,0);assert.match(r.reason,/bank|roll/);
 for(const key of ['theta','omega','roll','pitch','yaw','tilt','clearance','gas','load','netThrust','seatLoad'])assert.ok(Number.isFinite(r.final[key]),key);
 assert.equal(r.final.contactVelocity.length,3);assert.equal(r.final.forces.length,10);assert.equal(r.hasGasFlow,false);
});

test('successful variable-speed ramp replaces the false constant-exit-speed power verdict',()=>{
 // Isolate the electrical screen while retaining this historical controller trajectory.
 const p={roll:0,yaw:0,driveForce:30,drivePower:20,batteryPower:70,feedDiameter:120,throat:50,longitudinalSpeedLimit:10};
 const r=simulateStunt(p),keys=['q','w','x','y','lateral','vx','vy','vLateral'];
 const initialState=Object.fromEntries(keys.map(k=>[k,r.ramp.releaseState[k]]));
 const oldScreen=simulate3D({...p,speed:r.ramp.exitSpeed},{initialState});
 assert.equal(r.ramp.released,true);assert.equal(r.rampScreenMode,'driven');
 assert.ok(r.ramp.peakPowerW<70000);assert.ok(r.hardware.peakRampElectricalPower>100000);
 assert.ok(oldScreen.hardwareIssues.some(x=>x.includes('battery power')));
 assert.ok(!r.hardwareIssues.some(x=>x.includes('battery power')));
 close(r.contactVerticalSpeed,oldScreen.contactVerticalSpeed);close(r.gasUsed,oldScreen.gasUsed);
 assert.equal(r.soft,true);assert.equal(r.candidate,false);assert.equal(r.thermalFits,false);
 const qualified=simulateStunt({...p,minimumGasTemperature:-130});
 assert.equal(qualified.candidate,true);assert.deepEqual(qualified.hardwareIssues,[]);
});

test('driven-ramp context retains mass, vessel pressure, packaging, seal and heat checks',()=>{
 const p={roll:0,yaw:0,driveForce:30,drivePower:20,batteryPower:70,feedDiameter:120,throat:50,minimumGasTemperature:-130};
 for(const [delta,issue] of [[{mass:2000},'mass budget'],[{tankRating:350},'pressure'],[{installationClearance:25},'packaging'],[{blowdown:false},'heat transfer']]){
  const r=simulateStunt({...p,...delta});assert.equal(r.ramp.released,true);assert.equal(r.candidate,false);
  assert.ok(r.hardwareIssues.some(x=>x.includes(issue)),r.hardwareIssues.join('; '));
 }
 const seal=simulateStunt({...p,skirtTravel:10});assert.equal(seal.hasFlight,false);assert.equal(seal.candidate,false);assert.match(seal.reason,/Seal travel/);
 assert.throws(()=>simulate3D(p,{drivenRampAssessment:{released:true,minimumNormal:-1,peakPowerW:100}}),/Driven-ramp assessment/);
 assert.throws(()=>simulate3D(p,{drivenRampAssessment:{released:true,minimumNormal:1,peakPowerW:80000}}),/Driven-ramp assessment/);
});
