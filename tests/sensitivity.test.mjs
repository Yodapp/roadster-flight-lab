import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,PRESETS,analytic} from '../dist/physics.js';
import {sensitivityCases,runSensitivity} from '../dist/sensitivity.js';

test('sensitivity audit preserves dry mass when gas inventory is reduced, without mutating the chosen case',()=>{
 const p=Object.freeze({...DEFAULTS}),cases=sensitivityCases(p),reduced=cases.find(x=>x.label.includes('Gas −'));
 assert.equal(cases.length,27);assert.equal(reduced.params.mass-reduced.params.gas,p.mass-p.gas);
 assert.equal(p.gas,250);assert.equal(cases[0].params.windY,0);assert.equal(cases.find(x=>x.label.startsWith('Crosswind')).params.windY,8);
});
test('audit exports numerical results and rejects the former high-flow success under new screens',()=>{
 let completed=0;const rows=runSensitivity(PRESETS.highFlow,(n,total)=>{assert.equal(total,27);completed=n;});
 assert.equal(completed,27);assert.equal(rows[0].candidate,false);
 for(const r of rows){assert.ok(Number.isFinite(r.contactVerticalSpeed));assert.ok(Number.isFinite(r.gasUsed));assert.equal(r.candidate,r.soft&&r.hardwareIssues.length===0);}
});
test('analytical storage diagnostic respects the selected volume and gas model',()=>{
 const a=analytic(DEFAULTS),b=analytic({...DEFAULTS,tankVolume:800});assert.ok(b.tankPressure<a.tankPressure);
 assert.ok(a.tankPressure>4e7);
});


test('decisive feed comparisons lead the audit and change only the requested assumption',()=>{
 const p=Object.freeze({...PRESETS.fullRun}),cases=sensitivityCases(p);
 assert.deepEqual(cases.slice(1,4).map(c=>c.params.feedDiameter),[100,120,p.feedDiameter*.9]);
 for(const c of cases.slice(1,4)){const {feedDiameter,...rest}=c.params;const {feedDiameter:original,...baseline}=p;assert.deepEqual(rest,baseline);}
 assert.equal(cases[4].params.feedModel,'optimistic');
 const reverse=sensitivityCases({...p,feedModel:'optimistic'});assert.equal(reverse[4].params.feedModel,'consistent');
});
