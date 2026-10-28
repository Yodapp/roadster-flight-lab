import {writeFileSync} from 'node:fs';
import {DEFAULTS,PRESETS,simulate} from '../dist/physics.js';
import {hardware,gasState,gasInventoryAtRegulator} from '../dist/hardware.js';
import {runSensitivity} from '../dist/sensitivity.js';
const summarize=r=>({inputs:r.p,candidate:r.candidate,soft:r.soft,longitudinalFits:r.longitudinalFits,eosInvalidState:r.eosInvalidState,phaseLimited:r.phaseLimited,thermalFits:r.thermalFits,reason:r.reason,hardwareIssues:r.hardwareIssues,
 contactVerticalSpeed:r.contactVerticalSpeed,lateralSpeed:r.lateralSpeed,longitudinalSpeed:r.longitudinalSpeed,
 gasUsed:r.gasUsed,time:r.final.t,tankC:r.minimumTemperature-273.15,regulatorC:r.hasGasFlow?r.minimumFeedTemperature-273.15:null,
 peakNetThrustG:r.peakLoad,peakSeatSpecificG:r.peakSeatLoad,isothermalPeakMW:r.maxHeatPower/1e6,isothermalHeatKWh:r.heatRequired/3.6e6,
 controller:{targetHeading:r.targetHeading,flipMode:r.p.flipMode,headingMode:r.p.headingMode,lateralVelocityTarget:r.p.lateralVelocityTarget,continuedInitialRotation:r.continuedInitialRotation,continuationActivations:r.continuationActivations},impulseBudget:r.impulseBudget,feed:{model:r.p.feedModel,bindingTime:r.feedBindingTime,bindingOccurred:r.feedBindingOccurred,minimumManifoldBar:r.minimumManifoldPressure===null?null:r.minimumManifoldPressure/1e5,minimumBindingManifoldBar:r.minimumBindingManifoldPressure===null?null:r.minimumBindingManifoldPressure/1e5,maximumFeedDeficit:r.maximumFeedDeficit,thermalApproximation:'Temperature and exhaust remain evaluated at the delivery-pressure ceiling, as in Appendix A.'},regulator:gasInventoryAtRegulator(r.p),
 ramp:r.ramp?{released:r.ramp.released,reason:r.ramp.reason,time:r.ramp.time,exitSpeed:r.ramp.exitSpeed,
  peakElectricalKW:r.ramp.peakPowerW/1000,batteryKWh:r.ramp.batteryEnergyJ/3.6e6,
  energyResidualJ:r.ramp.energyResidualJ,minimumNormalKN:r.ramp.minimumNormal/1000,flightDuration:r.flightDuration}:null});
const inputs={demoOrientation:PRESETS.demoOrientation,optimisticFullRun:{...PRESETS.fullRun,feedModel:'optimistic'},feed100:{...PRESETS.fullRun,feedDiameter:100},feed120:{...PRESETS.fullRun,feedDiameter:120},regulator60FixedThroat:{...PRESETS.fullRun,regulatorBar:60},prOptimisticFeed:{...PRESETS.fullRun,gasModel:'pr',feedModel:'optimistic'},fullRunWarmer:{...PRESETS.fullRun,ambientTemperature:PRESETS.fullRun.ambientTemperature+15},fullRunExtraLoss:{...PRESETS.fullRun,deliveryLossPercent:PRESETS.fullRun.deliveryLossPercent+8},prConsistentFeed:{...PRESETS.fullRun,gasModel:'pr'},originalFullRun:PRESETS.reviewOriginal,fullRun:PRESETS.fullRun,regulator60:PRESETS.regulator60,rampLargerFeed:PRESETS.rampHighFlow,rampStall:PRESETS.rampStall,
 limitedRampPower:{...PRESETS.rampHighFlow,drivePower:20,batteryPower:70},
 airborneBaseline:DEFAULTS,airborneLargerFeed:PRESETS.highFlow,
 airborneIsothermal:{...PRESETS.highFlow,blowdown:false},uprightControl:PRESETS.upright};
const cases=Object.fromEntries(Object.entries(inputs).map(([name,p])=>[name,summarize(simulate(p))]));
const convergence=Object.fromEntries(['demoOrientation','fullRun','airborneLargerFeed'].map(name=>[name,[.006,.003,.0015,.00075].map(dt=>({dt,...summarize(simulate(inputs[name],{dt}))}))]));
const controlDelay=[0,15,25,50,100].map(controlDelay=>({delayMS:controlDelay,...summarize(simulate({...PRESETS.highFlow,controlDelay}))}));
const hw=hardware(DEFAULTS),margin=hardware({...DEFAULTS,installationClearance:25});
const report={model:'Roadster Flight Lab 4.4',date:'2026-10-28',
 note:'Generic screening assumptions, not reconstructed Tesla telemetry or design qualification. Driven mode starts from rest on a planar circle; airborne comparisons retain the earlier rolled release.',
 cases,convergence,controlDelay,
 regulatorSweep:[100,80,60,50,40].map((regulatorBar,i)=>({regulatorBar,throat:[45,50,58,64,71][i],...summarize(simulate({...PRESETS.reviewOriginal,regulatorBar,throat:[45,50,58,64,71][i]}))})),
 headingSweep:[['world',0,0],['world',10,0],['world',0,15],['world',10,15],['release',10,0],['release',10,15]].map(([headingMode,yaw,roll])=>({headingMode,yaw,roll,...summarize(simulate({...PRESETS.highFlow,headingMode,yaw,roll}))})),
 referenceEOS:{model:'CoolProp 8.0.0 HEOS nitrogen, tabulated and interpolated in flight',tables:'dist/reference-eos-tables.json',validation:'reference-eos-validation.json',note:'PR retained as an explicit comparison. Default feed pressure is solved consistently; regulator temperature/exhaust remain at the pre-solve pressure ceiling.'},
 feedDiameterSweep:[76.5,85,100,120].map(feedDiameter=>({feedDiameter,consistent:summarize(simulate({...PRESETS.fullRun,feedDiameter,feedModel:'consistent'})),optimistic:summarize(simulate({...PRESETS.fullRun,feedDiameter,feedModel:'optimistic'}))})),
 deliveryLossSweepNote:'The 24% result (1.656 m/s) is about 0.003 m/s softer than 8% (1.659 m/s): a closed-loop burn-timing and gas-state-history effect. The 8% and 16% runs are feed-limited below the delivery-pressure ceiling; the 24% run is not. Fixed-state capacity monotonicity does not imply monotonic touchdown speed in a controlled trajectory.',
 deliveryLossSweep:[0,8,16,24,40].map(deliveryLossPercent=>({deliveryLossPercent,...summarize(simulate({...PRESETS.fullRun,deliveryLossPercent}))})),
 hardware:{rampRadius:hw.rampRadius,rampCGRadius:hw.rampCGRadius,skirtTravelMM:hw.requiredSkirtTravel*1000,
 steadySpeedRampElectricalKW:hw.peakRampElectricalPower/1000,packageFitsAtZeroExtraClearance:hw.packageFits,packageFitsAt25MM:margin.packageFits},
 demoSensitivity:runSensitivity(PRESETS.demoOrientation),sensitivity:runSensitivity(PRESETS.fullRun)};
writeFileSync(new URL('../audit-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
const fixed=(n,d)=>Number.isFinite(n)?n.toFixed(d):'—';
console.table(Object.entries(cases).map(([name,c])=>({name,rampS:fixed(c.ramp?.time,2),exitMS:fixed(c.ramp?.exitSpeed,2),contactMS:fixed(c.contactVerticalSpeed,3),sideMS:fixed(c.lateralSpeed,3),longitudinalMS:fixed(c.longitudinalSpeed,3),gasKG:fixed(c.gasUsed,1),tankC:fixed(c.tankC,1),passes:c.candidate})));
console.log('Wrote audit-results.json');
