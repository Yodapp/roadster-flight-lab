import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceAtSRho,referenceAtTRho,referenceAtHP,referenceEOSMetadata} from '../dist/reference-eos.js';

const close=(value,expected,tolerance)=>assert.ok(Math.abs(value-expected)<=tolerance,`${value} differs from ${expected} by more than ${tolerance}`);
test('reference fill states agree with independent HEOS at 20 C and +15 C',()=>{
 for(const [T,pressure,entropy,enthalpy] of [[293.15,49247475.8985036,4796.113643407358,263277.9402757034],[308.15,53230542.08039906,4836.794451916562,285065.36266878963]]){
  const state=referenceAtTRho(T,250/.6);
  assert.equal(state.invalidState,false);assert.equal(state.phaseLimited,false);
  close(state.temperature,T,1e-10);close(state.pressure/pressure,1,.002);close(state.entropy,entropy,.15);close(state.enthalpy,enthalpy,100);
  assert.ok(state.heatPerKg>180000);
 }
 assert.equal(referenceEOSMetadata.CoolPropVersion,'8.0.0');
});
test('blowdown and throttling recover independent reference temperatures',()=>{
 const state=referenceAtSRho(4796.113643407358,117/.6);
 assert.equal(state.invalidState,false);assert.equal(state.phaseLimited,false);
 close(state.temperature,180.65358557820127,.15);
 close(state.enthalpy,134981.51634198174,100);
 const regulated=referenceAtHP(state.enthalpy,79.3e5);
 assert.equal(regulated.invalidState,false);assert.equal(regulated.phaseLimited,false);
 close(regulated.temperature,179.91164534231336,.2);
});
test('subcritical gas remains usable while saturation and liquid cells are rejected',()=>{
 const gas=referenceAtSRho(5806.0910646327,3);
 close(gas.temperature,110,.3);assert.equal(gas.phaseLimited,false);assert.equal(gas.invalidState,false);
 const saturated=referenceAtSRho(4000,30);
 assert.equal(saturated.invalidState,false);assert.equal(saturated.phaseLimited,true);
 const liquid=referenceAtHP(-100000,1e6);
 assert.ok(liquid.phaseLimited||liquid.invalidState);
});
test('the reference lookup never extrapolates or silently accepts invalid inputs',()=>{
 for(const state of [referenceAtSRho(3700,100),referenceAtSRho(6400,100),referenceAtSRho(4800,.01),referenceAtSRho(4800,1001),referenceAtSRho(NaN,100),referenceAtSRho(4800,Infinity),referenceAtTRho(300,0),referenceAtTRho(300,Infinity),referenceAtTRho(Infinity,100),referenceAtTRho(5000,400),referenceAtHP(800000,1e6),referenceAtHP(200000,1000),referenceAtHP(200000,Infinity)])assert.equal(state.invalidState,true);
});
test('temperature inversion and entropy lookup use one consistent surface across the UI domain',()=>{
 for(const T of [253.15,293.15,308.15,323.15])for(const rho of [20,37,100,250/.6,875]){
  const initial=referenceAtTRho(T,rho);
  assert.equal(initial.invalidState,false);assert.equal(initial.phaseLimited,false);
  const recovered=referenceAtSRho(initial.entropy,rho);
  close(recovered.temperature,T,1e-8);close(recovered.pressure,initial.pressure,1e-5);
  assert.ok(initial.heatPerKg>0);
 }
});
