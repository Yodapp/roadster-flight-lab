import {simulate} from './physics.js?v=4.4';
import {sizeLiftThroat} from './hardware.js?v=4.4';
/** Deterministic, one-at-a-time engineering scenarios, not a probability model. */
export function sensitivityCases(p){const lower={...p,regulatorBar:60};const sized=sizeLiftThroat(lower);return [
 ['Current settings',{}],
 ['Feed effective diameter 100 mm',{feedDiameter:100}],
 ['Feed effective diameter 120 mm',{feedDiameter:120}],
 ['Feed effective diameter −10%',{feedDiameter:p.feedDiameter*.9}],
 [p.feedModel==='optimistic'?'Consistent feed pressure solve':'Optimistic independent feed bound',{feedModel:p.feedModel==='optimistic'?'consistent':'optimistic'}],
 ['Wet mass +10%',{mass:p.mass*1.1}],
 ['Underside thrust rating −10%',{thrust:p.thrust*.9}],
 ['Gas −10%, same dry vehicle',{gas:p.gas*.9,mass:p.mass-p.gas*.1}],
 ['Release clearance −10%',{height:p.height*.9}],
 ['Valve response twice as slow',{valveLag:Math.max(1,p.valveLag*2)}],
 ['Crosswind +8 m/s',{windY:p.windY+8}],
 p.rampDrive?['Wheel drive force −25%',{driveForce:p.driveForce*.75}]:['Extra body pitch rate +10°/s',{pitchRate:p.pitchRate+10}],
 ['CG shifted 10 cm left',{cgY:p.cgY+.1}],
 ['Moment of inertia +25%',{inertiaScale:p.inertiaScale*1.25}],
 ['Under 1 stuck closed · no dedicated recovery policy',{failedNozzle:0}],
 ['Average seal gap doubled',{fanGap:p.fanGap*2}],
 ['Initial / ambient temperature +15°C',{ambientTemperature:p.ambientTemperature+15}],
 ['Control command delay +25 ms',{controlDelay:p.controlDelay+25}],
 ['Control command delay +50 ms',{controlDelay:p.controlDelay+50}],
 ['Control command delay +100 ms',{controlDelay:p.controlDelay+100}],
 ['Regulator 60 bar · fixed throat',{regulatorBar:60}],
 ['Regulator 60 bar · throat sized for initial rating',{regulatorBar:60,throat:Math.max(p.throat,sized.diameterMM??p.throat)}],
 ['Delivery pressure loss +8 percentage points',{deliveryLossPercent:Math.min(40,p.deliveryLossPercent+8)}],
 [p.flipMode==='continue'?'Shortest-path flip':'Continue inherited rotation',{flipMode:p.flipMode==='continue'?'shortest':'continue'}],
 [p.headingMode==='release'?'Target world heading zero':'Hold release-track heading',{headingMode:p.headingMode==='release'?'world':'release'}],
 ['All-wheel load available · assumed',{drivenLoad:1}],
 ['Combined: +5% mass, −5% feed diameter, slower valves, +6 m/s wind',{mass:p.mass*1.05,feedDiameter:p.feedDiameter*.95,valveLag:Math.max(1,p.valveLag*1.5),windY:p.windY+6}],
 ].map(([label,delta])=>({label,params:{...p,...delta}}));}
export function runSensitivity(p,progress=()=>{}){return sensitivityCases(p).map((item,i,all)=>{const r=simulate(item.params);progress(i+1,all.length);return {label:item.label,inputs:item.params,candidate:r.candidate,soft:r.soft,rampReleased:r.ramp?.released??null,rampTime:r.ramp?.time??null,rampEnergyKWh:r.ramp?r.ramp.batteryEnergyJ/3.6e6:null,rampPeakPowerKW:r.ramp?r.ramp.peakPowerW/1000:null,rampExitSpeed:r.ramp?.exitSpeed??null,reason:r.reason,hardwareIssues:r.hardwareIssues,contactVerticalSpeed:r.contactVerticalSpeed,lateralSpeed:r.lateralSpeed,longitudinalSpeed:r.longitudinalSpeed,gasUsed:r.gasUsed,minimumTemperature:r.minimumTemperature,minimumFeedTemperature:r.minimumFeedTemperature,peakSeatLoad:r.peakSeatLoad,feedModel:r.p.feedModel,feedBindingTime:r.feedBindingTime,minimumManifoldPressure:r.minimumManifoldPressure,maximumFeedDeficit:r.maximumFeedDeficit};});}
