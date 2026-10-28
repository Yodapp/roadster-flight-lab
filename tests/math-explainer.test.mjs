import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,PRESETS} from '../dist/physics.js';
import {renderMathExplanation} from '../dist/math-explainer.js';

const allCards=html=>[...html.matchAll(/<article class="calculation-card" id="calc-([^"]+)"/g)].map(m=>m[1]);
function card(html,id){return html.split(`id="calc-${id}"`)[1].split('</article>')[0];}

test('worked math shows enforced wet mass, units, and actual driven power instead of the old static screen',()=>{
 const r=simulate({...PRESETS.rampHighFlow,mass:2000,drivePower:20,batteryPower:70});
 const html=renderMathExplanation(r);
 assert.equal(r.p.mass,2160);assert.deepEqual(allCards(html),['mass','fan','ramp','storage','regulator','thrust','motion','contact','cooling']);
 assert.match(card(html,'mass'),/Requested: 2,000 kg/);
 assert.match(card(html,'mass'),/starts at <strong>2,160 kg/);
 assert.match(card(html,'mass'),/875 \+ 575 \+ 350 \+ 40 \+ 70 \+ 250/);
 const peak=(r.ramp.peakPowerW/1000).toFixed(1);
 assert.ok(card(html,'ramp').includes(`<strong>${peak} kW</strong>`));
 assert.ok(!card(html,'ramp').includes((r.hardware.peakRampElectricalPower/1000).toFixed(1)+' kW'));
 assert.match(card(html,'ramp'),/E<sub>ramp<\/sub> = ∫ P<sub>battery<\/sub> dt/);
 assert.equal([...html.matchAll(/id="math-[a-z]+-details"/g)].length,9);
});

test('storage workings separate nitrogen EOS correction from ideal-air comparisons and pressure rating',()=>{
 const html=renderMathExplanation(simulate(PRESETS.fullRun));
 const storage=card(html,'storage');
 assert.match(storage,/R<sub>gas<\/sub>T/);
 assert.match(storage,/296\.803/); // Specific nitrogen constant, not the ideal-air R.
 assert.match(storage,/reference nitrogen EOS/);
 assert.match(storage,/Z=1\.35[0-9]/);
 assert.match(storage,/700 × 100,000/);
 assert.match(storage,/350 kg/);
 assert.match(storage,/absolute/);
 const ideal=card(renderMathExplanation(simulate({...PRESETS.upright,realGas:false})),'storage');
 assert.match(ideal,/287\.050/);assert.match(ideal,/Ideal-air mode assumes Z=1/);
});

test('fan explanation uses achieved compressible inlet flow and labels the small-drop approximation',()=>{
 const r=simulate({...PRESETS.fullRun,fanGap:15});
 const html=renderMathExplanation(r),fan=card(html,'fan');
 assert.match(fan,/target exceeds/);
 assert.match(fan,/fan inlet/);
 assert.match(fan,/Ambient-volume flow/);
 assert.match(fan,/use compressible flow and compression work/);
 assert.match(fan,/0\.0004 m²/);
 assert.match(fan,/0\.528/);
 assert.doesNotMatch(html,/NaN|undefined|Infinity/);
});

test('stalled and rejected ramp cases have no invented flight, landing or flowing regulator temperature',()=>{
 for(const p of [PRESETS.rampStall,{...PRESETS.fullRun,roll:15},{...PRESETS.fullRun,pitch:0}]){
  const r=simulate(p),html=renderMathExplanation(r);
  assert.equal(r.hasFlight,false);
  assert.match(card(html,'motion'),/no airborne state was integrated/);
  assert.match(card(html,'contact'),/contact results are not applicable/);
  assert.match(card(html,'cooling'),/Regulator inactive/);
  assert.doesNotMatch(card(html,'cooling'),/Coldest flowing regulator gas/);
  assert.doesNotMatch(html,/NaN|undefined|Infinity/);
 }
});

test('airborne and timed-out cases show the correct mode without presenting final state as a touchdown',()=>{
 const upright=renderMathExplanation(simulate(PRESETS.upright));
 assert.match(card(upright,'ramp'),/no driven climb is simulated/);
 assert.match(card(upright,'ramp'),/zero-angle release/);
 assert.doesNotMatch(upright,/NaN|undefined|Infinity/);
 const timeout=renderMathExplanation(simulate(PRESETS.highFlow,{maxTime:.01}));
 assert.match(card(timeout,'contact'),/not touchdown measurements/);
 assert.match(card(timeout,'contact'),/No touchdown comparison is reported/);
});

test('isothermal heat comparison discloses supplied heat and nozzle impulse as a scalar sum',()=>{
 const r=simulate({...PRESETS.highFlow,blowdown:false}),html=renderMathExplanation(r);
 assert.match(card(html,'cooling'),/Isothermal comparison is selected/);
 assert.ok(card(html,'cooling').includes((r.maxHeatPower/1e6).toFixed(2)+' MW'));
 assert.match(card(html,'thrust'),/scalar impulse is not upward or net vehicle impulse/);
 assert.match(card(html,'thrust'),/nominal exhaust speed/);
});


test('regulator workings expose selected pressure, loss, inventory boundary and initial-only throat sizing',()=>{
 const r=simulate({...PRESETS.fullRun,regulatorBar:60,deliveryLossPercent:12,throat:58});
 const html=renderMathExplanation(r),reg=card(html,'regulator');
 assert.match(reg,/Setpoint: <strong>60 bar/);assert.match(reg,/52\.8 bar/);
 assert.match(reg,/12\.0% loss/);assert.match(reg,/not guaranteed full-thrust inventory/);
 assert.match(reg,/minimum calculated diameter/);assert.match(reg,/only sizes the initial state/);
 assert.match(card(html,'cooling'),/targets 60 bar before an assumed 12\.0% pressure loss/);
 assert.doesNotMatch(card(html,'cooling'),/targets 100 bar/);
});

test('controller and contact explanations disclose choices, signed speed and EOS comparison scope',()=>{
 const r=simulate({...PRESETS.fullRun,flipMode:'continue',headingMode:'release',lateralVelocityTarget:.25,longitudinalSpeedLimit:2.5});
 const html=renderMathExplanation(r);
 assert.match(card(html,'motion'),/continue inherited rotation/);assert.match(card(html,'motion'),/release\/ramp heading/);
 assert.match(card(html,'motion'),/0\.25 m\/s/);assert.match(card(html,'contact'),/2\.50 m\/s, applying equally forward and backward/);
 assert.match(card(html,'contact'),/relative to the nose/);
 assert.match(card(html,'storage'),/CoolProp reference nitrogen tables/);
 assert.match(card(html,'cooling'),/coupled into this flight/);
 assert.match(card(html,'contact'),/tyre spin-up/);
 const pr=renderMathExplanation(simulate({...PRESETS.fullRun,gasModel:'pr'}));
 assert.match(card(pr,'storage'),/440\.6 bar.*492\.5 bar/);
 assert.match(card(pr,'cooling'),/PR thermal pass remains provisional/);
});


test('out-of-domain thermodynamics do not present placeholder temperatures as a cold prediction',()=>{
 const r=simulate({...PRESETS.upright,tankVolume:10});
 assert.equal(r.eosInvalidState,true);
 assert.ok(!r.hardwareIssues.includes('Tank pressure exceeds the selected rating'));
 const html=renderMathExplanation(r);
 assert.match(card(html,'cooling'),/Temperature minimum unavailable/);
 assert.doesNotMatch(card(html,'cooling'),/Coldest tank gas:|gas temperatures fall below/);
 assert.doesNotMatch(html,/NaN|undefined|Infinity/);
});


test('feed workings distinguish a consistent failure from an optimistic contact pass',()=>{
 const consistent=simulate({...PRESETS.fullRun,feedModel:'consistent'});
 const optimistic=simulate({...PRESETS.fullRun,feedModel:'optimistic'});
 assert.equal(consistent.soft,false);assert.equal(optimistic.soft,true);
 const actual=renderMathExplanation(consistent),bound=renderMathExplanation(optimistic);
 const feed=card(actual,'regulator');
 assert.match(feed,/Consistent pressure\/flow solve/);
 assert.match(feed,/bisect between ambient and the ceiling/);
 assert.match(feed,/same pressure/);
 assert.ok(feed.includes((consistent.minimumManifoldPressure/1e5).toFixed(1)+' bar'));
 assert.ok(feed.includes(consistent.feedBindingTime.toFixed(3)+' s'));
 assert.match(feed,/Hydraulic consistency only/);
 assert.match(feed,/exhaust speed are held at the pre-solve pressure ceiling/);
 assert.match(card(bound,'regulator'),/Optimistic independent bound/);
 assert.match(card(bound,'regulator'),/mutually unattainable/);
 assert.match(card(bound,'contact'),/pass under the optimistic feed bound/);
 assert.doesNotMatch(actual+bound,/NaN|undefined|Infinity/);
});
