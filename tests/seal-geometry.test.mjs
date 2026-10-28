import test from 'node:test';
import assert from 'node:assert/strict';
import {sealGeometry,hardware} from '../dist/hardware.js';
import {DEFAULTS,simulate} from '../dist/physics.js';
test('seal area cannot exceed its floor envelope or isoperimetric bound',()=>{
 assert.equal(sealGeometry(DEFAULTS).fits,true);
 const impossible={...DEFAULTS,sealedArea:6,sealPerimeter:6};
 assert.equal(sealGeometry(impossible).fits,false);
 assert.equal(sealGeometry({...DEFAULTS,sealedLength:1}).fits,false);
 assert.equal(hardware(impossible).sealGeometryFits,false);
 assert.ok(simulate(impossible).hardwareIssues.some(x=>x.includes('Seal area')));
});
