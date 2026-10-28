import test from 'node:test';
import assert from 'node:assert/strict';
import {AIR, atmosphere, fanSystem, gasState, hardware, nitrogenPR, nozzleSupply, orificeFlux} from '../dist/hardware.js';
import {DEFAULTS} from '../dist/physics.js';

const near=(a,b,tolerance)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);

test('inverted hold uses commanded suction, not unused installed fan capacity',()=>{
  const f=fanSystem({...DEFAULTS,suction:.5});
  assert.equal(f.canEverHold,true);
  assert.equal(f.canHold,false);
  near(f.actualSuction,.5*DEFAULTS.mass*9.80665,1e-7);
});

test('atmosphere changes storage temperature and fan density without stale EOS cache',()=>{
  const p={...DEFAULTS,ambientTemperature:40,ambientPressure:80};
  const air=atmosphere(p),hot=gasState(p,250),normal=gasState(DEFAULTS,250);
  near(air.rho,80000/(AIR.R*313.15),1e-12);
  near(hot.temperature,313.15,1e-8);
  near(normal.temperature,293.15,1e-8);
  assert.ok(hot.pressure>normal.pressure);
  assert.ok(fanSystem(p).headLimit<fanSystem(DEFAULTS).headLimit);
});

test('zero gas and a density beyond the reference domain do not propagate NaN or thrust',()=>{
  const empty=gasState({...DEFAULTS,gas:0},0);
  assert.equal(empty.exhaust,0);
  assert.equal(empty.pressure,0);
  const p={...DEFAULTS,gas:500,tankVolume:200},state=gasState(p,500),supply=nozzleSupply(p,state);
  assert.equal(state.invalidState,true);
  assert.equal(supply.feedMdot,0);
  assert.ok(supply.caps.every(f=>f===0));
  assert.equal(hardware(p).pressureFits,false);
});

test('ideal air has no nitrogen-specific phase cutoff',()=>{
  const p={...DEFAULTS,realGas:false};
  const s=gasState(p,10);
  assert.ok(s.temperature<126.192);
  assert.equal(s.phaseLimited,false);
});

test('PR isothermal heat comparison obeys the rigid-tank first law',()=>{
  const ideal=gasState({...DEFAULTS,blowdown:false,realGas:false},250);
  near(ideal.heatPerKg,AIR.R*293.15,1e-7);
  const p={...DEFAULTS,blowdown:false,gasModel:'pr'},state=gasState(p,250),vol=.6,T=293.15,dm=.01;
  function storedEnergy(m){const rho=m/vol,s=nitrogenPR(T,rho);return m*(s.enthalpy-s.pressure/rho);}
  const dUdm=(storedEnergy(250+dm)-storedEnergy(250-dm))/(2*dm);
  const outletEnthalpy=nitrogenPR(T,250/vol).enthalpy;
  near(state.heatPerKg,outletEnthalpy-dUdm,.01);
  assert.ok(state.heatPerKg>ideal.heatPerKg*1.5);
  assert.equal(gasState(DEFAULTS,250).heatPerKg,0);
});

test('PR regulator comparison retains upstream specific enthalpy',()=>{
  const s=gasState({...DEFAULTS,gasModel:'pr'},250),source=nitrogenPR(s.temperature,250/.6);
  // Independent monotonic density bracket in the supercritical regulator state.
  let lo=.01,hi=800;
  for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(nitrogenPR(s.feedTemperature,mid).pressure<s.feedPressure)lo=mid;else hi=mid;}
  near(nitrogenPR(s.feedTemperature,(lo+hi)/2).enthalpy,source.enthalpy,.1);
});

test('short ramps only screen their actual arc and zero-angle ramps need no gravity power',()=>{
  const p={...DEFAULTS,pitch:0,suction:0},h=hardware(p);
  assert.equal(h.gripMargin,Infinity);
  assert.equal(h.rampGravityPower,0);
  const short=hardware({...DEFAULTS,pitch:30});
  near(short.rampGravityPower,short.actualMass*9.80665*DEFAULTS.speed*.5,1e-7);
});

test('ramp surface height includes inverted body depth and yields consistent release rate radius',()=>{
  const p={...DEFAULTS,pitch:180,roll:0},h=hardware(p);
  near(h.releaseSurfaceHeight,p.height+1.2,1e-8);
  near(h.rampRadius,(p.height+1.2)/2,1e-8);
  near(h.rampCGRadius,h.rampRadius-.6,1e-8);
});

test('installation clearance and explicit ancillary allowance feed packaging and mass screens',()=>{
  const base=hardware(DEFAULTS),room=hardware({...DEFAULTS,installationClearance:25}),heavy=hardware({...DEFAULTS,ancillariesMass:170});
  assert.equal(base.tankFits,true);
  assert.equal(room.tankFits,false);
  near(heavy.minimumWetMass-base.minimumWetMass,100,1e-9);
  assert.equal(base.installationVerified,false);
});

test('compressible flow matches the independent NASA sonic-flow formula',()=>{
  const P=2e5,T=300,R=287.05,gamma=1.4;
  const reference=P/Math.sqrt(T)*Math.sqrt(gamma/R)*(2/(gamma+1))**((gamma+1)/(2*(gamma-1)));
  near(orificeFlux(P,1e4,T,R,gamma),reference,1e-9);
});


test('fan and traction electrical demands share the selected battery power limit',()=>{
  const base=hardware(DEFAULTS),limited=hardware({...DEFAULTS,batteryPower:50});
  near(base.peakRampElectricalPower,base.fan.power+base.rampGravityPower/.9,1e-7);
  assert.equal(base.rampPowerFits,true);
  assert.equal(limited.rampPowerFits,false);
});
