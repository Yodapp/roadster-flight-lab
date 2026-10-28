import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,PRESETS,DEFAULTS} from '../dist/physics.js';
import {simulate3D,rotate} from '../dist/flight3d.js';

const close=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);
const radians=x=>x*Math.PI/180;
const angularDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const demo=simulate(PRESETS.demoOrientation);

test('demo orientation changes only the heading policy and lands nose away from the ramp',()=>{
 assert.equal(PRESETS.demoOrientation.headingMode,'outbound');
 assert.deepEqual({...PRESETS.demoOrientation,headingMode:PRESETS.fullRun.headingMode},PRESETS.fullRun);
 assert.equal(DEFAULTS.headingMode,'world');
 assert.equal(demo.ramp.released,true);
 const release=demo.ramp.releaseState;
 assert.ok(release.vx<0);
 close(angularDifference(radians(demo.targetHeading),Math.atan2(release.vLateral,release.vx)),0);
 close(Math.abs(demo.targetHeading),180);
 const nose=rotate(demo.final.q,[1,0,0]);
 assert.ok(nose[0]<-.99,'nose must point away from the ramp, down the outgoing track');
 const away=[demo.final.x,demo.final.lateral],distance=Math.hypot(...away);
 assert.ok((nose[0]*away[0]+nose[1]*away[1])/distance>.9);
 // Orientation resemblance must not erase failed contact criteria.
 assert.equal(demo.soft,false);assert.equal(demo.candidate,false);
 assert.ok(demo.lateralSpeed>demo.p.sideSpeedLimit);
 assert.ok(Math.abs(demo.longitudinalSpeed)>demo.p.longitudinalSpeedLimit);
 assert.equal(demo.continuationActivations,0);
});

test('outbound resolves measured initial velocity instead of the selected ramp azimuth',()=>{
 const vx=2,vLateral=-3;
 const r=simulate3D({...PRESETS.upright,headingMode:'outbound',yaw:35},{initialState:{vx,vLateral},maxTime:.015});
 close(radians(r.targetHeading),Math.atan2(vLateral,vx));
 assert.notEqual(r.targetHeading,35);
});

test('outbound heading and complete trajectory rotate with the ramp azimuth',()=>{
 const rotation=27,angle=radians(rotation),turned=simulate({...PRESETS.demoOrientation,yaw:rotation});
 close(angularDifference(radians(turned.targetHeading),radians(demo.targetHeading)+angle),0);
 close(turned.contactVerticalSpeed,demo.contactVerticalSpeed,1e-7);
 close(turned.lateralSpeed,demo.lateralSpeed,1e-7);
 close(turned.longitudinalSpeed,demo.longitudinalSpeed,1e-7);
 close(turned.gasUsed,demo.gasUsed,1e-7);
 close(turned.final.x,demo.final.x*Math.cos(angle)-demo.final.lateral*Math.sin(angle),1e-7);
 close(turned.final.lateral,demo.final.x*Math.sin(angle)+demo.final.lateral*Math.cos(angle),1e-7);
});

test('outbound falls back at zero velocity and remains unresolved without ramp release',()=>{
 const p={...PRESETS.upright,headingMode:'outbound',yaw:37};
 for(const [vx,vLateral] of [[0,0],[-0,-0],[1e-9,-2e-9]]){
  const r=simulate3D(p,{initialState:{vx,vLateral},maxTime:.015});
  close(r.targetHeading,37);
 }
 const stalled=simulate({...PRESETS.demoOrientation,driveForce:8});
 assert.equal(stalled.hasFlight,false);assert.equal(stalled.targetHeading,null);
});

test('reviewed driven default retains its accepted 4.3 trajectory and continuation',()=>{
 const reviewed=simulate(PRESETS.fullRun);
 assert.equal(reviewed.p.headingMode,'release');
 close(reviewed.targetHeading,0);
 close(reviewed.contactVerticalSpeed,1.6587752043558688,1e-10);
 close(reviewed.gasUsed,142.97625838201895,1e-9);
 assert.equal(reviewed.continuationActivations,1);
 assert.equal(reviewed.soft,false);
});
