import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,simulate} from '../dist/physics.js';
import {gasState,nozzleSupply,regulatorSettings,sizeLiftThroat,gasInventoryAtRegulator} from '../dist/hardware.js';
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} ≠ ${b}`);
const driven={...DEFAULTS,rampDrive:true,roll:0,yaw:0,driveForce:30,flipMode:'shortest',headingMode:'world'};

test('explicit regulator defaults retain the specified delivery pressure and boundary',()=>{
 const state=gasState(DEFAULTS,DEFAULTS.gas);close(state.feedPressure,92e5);assert.equal(state.belowRegulatorSetpoint,false);
 const below=gasState(DEFAULTS,117);assert.equal(below.belowRegulatorSetpoint,true);close(below.feedPressure,below.pressure*.92,.1);
});

test('regulator setpoint and delivery loss are independent cached curve inputs',()=>{
 const base=gasState(DEFAULTS,250);
 const reduced=gasState({...DEFAULTS,regulatorBar:60},250);close(reduced.feedPressure,55.2e5);assert.notEqual(reduced.feedTemperature,base.feedTemperature);
 const loss=gasState({...DEFAULTS,deliveryLossPercent:20},250);close(loss.feedPressure,80e5);assert.notEqual(loss.feedTemperature,base.feedTemperature);
 close(gasState(DEFAULTS,250).feedPressure,base.feedPressure);close(gasState(DEFAULTS,250).feedTemperature,base.feedTemperature);
 // The tank's adiabatic path is independent of downstream regulation.
 close(reduced.pressure,base.pressure);close(loss.temperature,base.temperature);
 const legacy=gasState({...DEFAULTS,regulatorBar:60},117);assert.equal(legacy.capacity,1);assert.ok(gasState(DEFAULTS,117).capacity<1);
});

test('invalid regulator pressure and loss fail explicitly without NaN gas states',()=>{
 for(const regulatorBar of [NaN,Infinity,0,1])assert.throws(()=>gasState({...DEFAULTS,regulatorBar},250),/Regulator pressure/);
 for(const deliveryLossPercent of [NaN,Infinity,-1,100,101])assert.throws(()=>gasState({...DEFAULTS,deliveryLossPercent},250),/delivery loss/);
 close(regulatorSettings({deliveryLossPercent:0}).deliveryFraction,1);
 const empty=gasState({...DEFAULTS,gas:0,regulatorBar:60},0);assert.equal(empty.capacity,0);assert.equal(empty.belowRegulatorSetpoint,true);
});

test('lift-throat helper meets the initial rating without silently changing inputs',()=>{
 for(const regulatorBar of [100,80,60,40]){
  const p={...DEFAULTS,regulatorBar},original={...p},sized=sizeLiftThroat(p);
  assert.deepEqual(p,original);assert.ok(sized.diameterMM>0);assert.equal(sized.feedFits,true);
  const state=gasState(p,p.gas),supply=nozzleSupply({...p,throat:sized.diameterMM},state);
  close(supply.downCap,p.thrust*1000/4,1e-7);close(sized.requiredMassFlow,p.thrust*1000/state.exhaust);
  assert.ok(nozzleSupply({...p,throat:sized.diameterMM*.99},state).downCap<supply.downCap);
 }
 const blocked=sizeLiftThroat({...DEFAULTS,feedDiameter:10});assert.equal(blocked.feedFits,false);assert.equal(blocked.canReachRatedThrust,false);assert.ok(blocked.diameterMM>0);
 const empty=sizeLiftThroat({...DEFAULTS,gas:0});assert.equal(empty.diameterMM,null);assert.equal(empty.canReachRatedThrust,false);
 const disabled=sizeLiftThroat({...DEFAULTS,thrust:0});assert.equal(disabled.diameterMM,0);assert.equal(disabled.requiredMassFlow,0);
});

test('pressure-boundary inventory is separate from a rated-thrust or landing claim',()=>{
 const base=gasInventoryAtRegulator(DEFAULTS);assert.equal(base.available,true);assert.equal(base.initialAboveSetpoint,true);
 close(base.gasAtSetpoint+base.gasAboveSetpoint,DEFAULTS.gas);close(gasState(DEFAULTS,base.gasAtSetpoint).pressure,100e5,.001);
 assert.ok(base.gasAboveSetpoint>118&&base.gasAboveSetpoint<120); // HEOS reference boundary, not PR's123.4kg.
 const low=gasInventoryAtRegulator({...DEFAULTS,regulatorBar:60});assert.ok(low.gasAboveSetpoint>base.gasAboveSetpoint);
 const noHead=gasInventoryAtRegulator({...DEFAULTS,regulatorBar:900});assert.equal(noHead.gasAboveSetpoint,0);assert.equal(noHead.initialAboveSetpoint,false);
 assert.equal(gasInventoryAtRegulator({...DEFAULTS,gas:0}).gasAtSetpoint,0);
 assert.equal(gasInventoryAtRegulator({...DEFAULTS,gas:1000}).available,false);
 assert.throws(()=>gasInventoryAtRegulator({...DEFAULTS,gas:NaN}),/inventory/);
});

test('review lower-setpoint case remains a distinct hardware comparison',()=>{
 const original=simulate(driven),run=simulate({...driven,regulatorBar:60,throat:58});
 assert.ok(Number.isFinite(run.contactVerticalSpeed));assert.ok(Number.isFinite(run.gasUsed));
 assert.notEqual(run.contactVerticalSpeed,original.contactVerticalSpeed);
 assert.equal(run.p.regulatorBar,60);assert.equal(run.p.throat,58);
 assert.equal(run.thermalFits,false);
});
