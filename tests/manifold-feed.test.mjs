import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,simulate} from '../dist/physics.js';
import {atmosphere,gasState,nozzleCapsAtPressure,feedCapacityAtPressure,solveManifold,sizeLiftThroat} from '../dist/hardware.js';
const close=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const lift=force=>[force,force,force,force,0,0,0,0,0,0];

test('binding manifold pressure closes demand and feed capacity at the same pressure',()=>{
 const p={...PRESETS.fullRun,feedModel:'consistent'},state=gasState(p,117),requested=lift(15000);
 const solved=solveManifold(p,state,requested);
 assert.equal(solved.feedBinding,true);
 assert.ok(solved.manifoldPressure>atmosphere(p).p);
 assert.ok(solved.manifoldPressure<state.feedPressure);
 close(solved.feedDemand,solved.forces.reduce((a,b)=>a+b,0)/state.exhaust);
 close(solved.feedDemand,solved.feedCapacity,1e-9);
 assert.ok(solved.feedResidual<=0&&solved.feedResidual>-1e-9);
 const higher=solved.manifoldPressure*1.000001,caps=nozzleCapsAtPressure(p,state,higher).caps;
 const demand=requested.reduce((sum,force,i)=>sum+Math.min(force,caps[i]),0)/state.exhaust;
 assert.ok(demand>feedCapacityAtPressure(p,state,higher),'A larger pressure must violate the binding hydraulic balance');
 assert.deepEqual(requested,lift(15000),'The solver must not mutate the lagged command');
});

test('a feasible pressure cap retains the original forces without a needless pressure reduction',()=>{
 const p=PRESETS.fullRun,state=gasState(p,p.gas),requested=lift(1000);
 const solved=solveManifold(p,state,requested);
 assert.equal(solved.feedBinding,false);assert.deepEqual(solved.forces,requested);
 close(solved.manifoldPressure,state.feedPressure);
 assert.ok(solved.feedResidual<0);
 close(solved.feedCapacity,feedCapacityAtPressure(p,state,state.feedPressure));
});

test('gas-off, invalid states and failed jets cannot acquire force through the pressure solve',()=>{
 const p=PRESETS.fullRun,state=gasState(p,117),requested=Array(10).fill(20000);
 for(const [input,tank] of [[{...p,allThrustersOff:true},state],[p,{...state,invalidState:true}],[p,{...state,phaseLimited:true}],[p,gasState(p,0)]]){
  const solved=solveManifold(input,tank,requested);
  assert.ok(solved.forces.every(force=>force===0));assert.equal(solved.feedDemand,0);
  assert.equal(solved.feedBinding,false);assert.equal(solved.manifoldPressure,null);
 }
 const failed=solveManifold({...p,failedNozzle:0},state,requested);
 assert.equal(failed.forces[0],0);assert.ok(failed.forces.some(force=>force>0));
 assert.ok(failed.feedResidual<=1e-9);
});

test('85/100/120 mm reproduce the independently reviewed hydraulic comparison',()=>{
 const rows=[
  [85,1.6587752043558688,true,false],
  [100,1.1368972790157066,true,true],
  [120,.9266250473496617,false,true]
 ];
 for(const [feedDiameter,speed,binding,soft] of rows){
  const result=simulate({...PRESETS.fullRun,feedDiameter});
  assert.equal(result.p.feedModel,'consistent');close(result.contactVerticalSpeed,speed,2e-7);
  assert.equal(result.feedBindingOccurred,binding);assert.equal(result.soft,soft);
  assert.ok(result.maximumFeedDeficit<1e-8);
  assert.equal(result.feedBindingTime>0,binding);
  assert.equal(result.minimumBindingManifoldPressure!==null,binding);
 }
 const optimistic=simulate({...PRESETS.fullRun,feedModel:'optimistic'});
 close(optimistic.contactVerticalSpeed,.9895336214922492,1e-9);
 assert.equal(optimistic.feedBindingOccurred,false);
 assert.ok(optimistic.maximumFeedDeficit>50,'The retained optimistic trajectory must expose its unavailable feed demand');
});

test('stored flow diagnostics refer to the applied interval state and obey hydraulic balance',()=>{
 const result=simulate(PRESETS.fullRun);let bindingSamples=0;
 for(const sample of result.samples){
  if(!(sample.feedDemand>1e-8))continue;
  const state=gasState(result.p,sample.feedStateGas);
  assert.ok(sample.feedStateGas>=sample.gas);
  close(sample.feedPressureCeiling,state.feedPressure,.001);
  assert.ok(sample.manifoldPressure<=sample.feedPressureCeiling+.001);
  close(sample.feedDemand,sample.forces.reduce((a,b)=>a+b,0)/state.exhaust,1e-9);
  close(sample.feedCapacity,feedCapacityAtPressure(result.p,state,sample.manifoldPressure),1e-9);
  close(sample.feedResidual,sample.feedDemand-sample.feedCapacity,1e-9);
  assert.ok(sample.feedResidual<=1e-8);
  if(sample.feedBinding){bindingSamples++;assert.ok(Math.abs(sample.feedResidual)<1e-8);}
 }
 assert.ok(bindingSamples>5);
 close(result.minimumManifoldPressure/1e5,53.54116462457584,1e-7);
});

test('binding duration uses the actual partial timeout and touchdown intervals',()=>{
 const p={...PRESETS.upright,feedDiameter:10,auto:false,brakeHeight:100,valveLag:0};
 const timed=simulate(p,{dt:.003,maxTime:.0105});
 assert.equal(timed.landed,false);close(timed.feedBindingTime,.0105,1e-12);
 const landed=simulate({...p,height:.001},{dt:.003,initialState:{vy:-1}});
 assert.equal(landed.landed,true);assert.ok(landed.final.t>0&&landed.final.t<.003);
 close(landed.feedBindingTime,landed.final.t,1e-12);
});

test('stalled and unpowered runs have no invented flowing manifold diagnostics',()=>{
 for(const result of [simulate(PRESETS.rampStall),simulate({...PRESETS.fullRun,allThrustersOff:true})]){
  assert.equal(result.feedBindingTime,0);assert.equal(result.feedBindingOccurred,false);
  assert.equal(result.minimumManifoldPressure,null);assert.equal(result.minimumBindingManifoldPressure,null);
  assert.equal(result.maximumFeedDeficit,0);
  for(const sample of result.samples){assert.equal(sample.manifoldPressure,null);assert.equal(sample.feedDemand,0);assert.equal(sample.feedBinding,false);}
 }
});

test('feed mode validation includes stalled ramps and initial throat sizing',()=>{
 for(const feedModel of ['legacy','',null,1]){
  // null is an invalid explicit mode; omission alone takes the default.
  assert.throws(()=>simulate({...PRESETS.fullRun,feedModel}),/Feed model/);
  assert.throws(()=>simulate({...PRESETS.rampStall,feedModel}),/Feed model/);
  assert.throws(()=>sizeLiftThroat({...PRESETS.fullRun,feedModel}),/Feed model/);
 }
 const p=PRESETS.fullRun,state=gasState(p,p.gas),sized=sizeLiftThroat(p);
 assert.equal(sized.feedModel,'consistent');close(sized.feedMassFlow,feedCapacityAtPressure(p,state,state.feedPressure));
 assert.throws(()=>solveManifold(p,state,[1]),/ten finite/);
 assert.throws(()=>solveManifold(p,state,Array(10).fill(-1)),/ten finite/);
});
