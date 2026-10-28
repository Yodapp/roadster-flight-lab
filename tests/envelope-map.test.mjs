import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS} from '../dist/physics.js';
import {buildEnvelopeMap,classifyEnvelope} from '../dist/envelope-map.js';
test('envelope colors distinguish landing from hardware failures and exclude stopped ramps',()=>{
 assert.equal(classifyEnvelope({soft:true,hardwareIssues:[]}),3);
 assert.equal(classifyEnvelope({soft:true,hardwareIssues:['cold']}),2);
 assert.equal(classifyEnvelope({soft:false,hardwareIssues:[]}),1);
 assert.equal(classifyEnvelope({soft:false,hardwareIssues:['cold']}),0);
 assert.equal(classifyEnvelope({soft:false,hardwareIssues:[],ramp:{released:false}}),0);
});
test('mass-floor cells are excluded rather than integrating the same enforced mass repeatedly',()=>{
 const m=buildEnvelopeMap(PRESETS.upright,()=>{},{masses:[1000,2200],forces:[60]});
 assert.equal(m.cells[0][0],null);assert.equal(m.cells[0][1],3);
 assert.deepEqual(m.stats,{tested:1,excluded:1,landing:1,hardware:1,both:1});
});
