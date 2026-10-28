import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,simulate} from '../dist/physics.js';
import {atmosphere,gasState,nozzleSupply,orificeFlux} from '../dist/hardware.js';

// Causal contract: at an identical reservoir state, adding downstream pressure
// loss cannot create feed capacity or increase the envelope of nozzle forces.
// This does not assert that every closed-loop trajectory is globally monotonic.
test('delivery loss cannot manufacture feed capacity above or below the setpoint',()=>{
 for(const regulatorBar of [40,60,100,160])for(const gas of [250,200,150,125,117,100]){
  let previous=null;
  for(const deliveryLossPercent of [0,8,16,24,40]){
   const p={...PRESETS.fullRun,regulatorBar,deliveryLossPercent};
   const state=gasState(p,gas),supply=nozzleSupply(p,state);
   if(previous){
    assert.ok(state.feedPressure<=previous.state.feedPressure+1e-6);
    assert.ok(Math.abs(supply.feedMdot-previous.supply.feedMdot)<1e-9);
    for(let i=0;i<supply.caps.length;i++)assert.ok(supply.caps[i]<=previous.supply.caps[i]+1e-7,
     `Loss increased nozzle ${i} capacity at ${gas} kg / ${regulatorBar} bar`);
   }
   previous={state,supply};
  }
 }
});

test('feed capacity uses the tank-to-ambient bound, independently of delivery pressure',()=>{
 const p=PRESETS.fullRun,state=gasState(p,117),ambient=atmosphere(p),supply=nozzleSupply(p,state);
 const area=Math.PI*(p.feedDiameter/1000)**2/4;
 const expected=.8*area*orificeFlux(state.pressure,ambient.p,state.temperature,state.R)/Math.sqrt(Math.max(.3,state.Z));
 assert.ok(Math.abs(expected-supply.feedMdot)<1e-9);
 assert.equal(supply.feedModel,'independent-capacity-bound');
 assert.equal(supply.feedSinkPressure,ambient.p);
 const narrow=nozzleSupply({...p,feedDiameter:p.feedDiameter/2},state);
 assert.ok(Math.abs(narrow.feedMdot-supply.feedMdot/4)<1e-9);
});

test('the audited +8 percentage-point delivery loss lands harder than the driven default',()=>{
 const baseline=simulate(PRESETS.fullRun),loss=simulate({...PRESETS.fullRun,deliveryLossPercent:PRESETS.fullRun.deliveryLossPercent+8});
 assert.ok(baseline.landed&&loss.landed);
 assert.ok(loss.contactVerticalSpeed>baseline.contactVerticalSpeed+.01,
  `Expected the named sensitivity case to worsen: ${baseline.contactVerticalSpeed} → ${loss.contactVerticalSpeed} m/s`);
});

test('invalid or phase-limited states cannot produce feed flow or nozzle force',()=>{
 const p=PRESETS.fullRun,valid=gasState(p,p.gas);
 for(const override of [{invalidState:true},{phaseLimited:true},{exhaust:0}]){
  const supply=nozzleSupply(p,{...valid,...override});
  assert.equal(supply.feedMdot,0);assert.ok(supply.caps.every(value=>value===0));
 }
});
