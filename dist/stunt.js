import {HW_DEFAULTS,gasState,validateFeedModel} from './hardware.js?v=4.4';
import {FLIGHT_DEFAULTS,simulate3D,euler,rotate,support,contactState,norm,validateControllerPolicy} from './flight3d.js?v=4.4';
import {RAMP_DEFAULTS,simulateRamp} from './ramp.js?v=4.4';

const FLIGHT_BASE={mass:2200,gas:250,height:20,thrust:60,exhaust:550,speed:4,pitch:170,brakeHeight:9,auto:true,blowdown:true,suction:2,drag:true};
const RELEASE_KEYS=['q','w','x','y','lateral','vx','vy','vLateral'];

/** Bring road-constrained telemetry into the same schema as airborne samples. */
function rampSample(s,p){
 const q=[...s.q],w=[...s.w],ea=euler(q),up=rotate(q,[0,0,1]),contact=contactState(s,p);
 return {...s,q,w,forces:Array(10).fill(0),phase:'ramp',theta:ea.pitch,roll:ea.roll,pitch:ea.pitch,yaw:ea.yaw,
  omega:norm(w),tilt:Math.acos(Math.max(-1,Math.min(1,up[2]))),clearance:Math.max(0,s.y-support(q,p)),
  gas:p.gas,thrust:0,netThrust:0,front:0,rear:0,load:0,burning:false,seatLoad:s.seatLoad??0,
  manifoldPressure:null,feedPressureCeiling:null,feedBinding:false,feedDemand:0,feedCapacity:0,feedResidual:0,feedStateGas:p.gas,
  contactPoint:contact.point,contactVelocity:contact.velocity,contactVerticalSpeed:contact.verticalSpeed,lateralSpeed:contact.lateralSpeed};
}
function offsetEvents(ramp,flight=[]){
 const seen=new Set();return [...ramp.events,...flight.map(e=>({...e,t:e.t+ramp.time}))]
  .filter(e=>{const key=e.t.toFixed(9)+'/'+e.label;if(seen.has(key))return false;seen.add(key);return true;});
}
function stoppedResult(p,ramp,samples){
 const final=samples.at(-1),hw=ramp.hardware,initial=gasState(p,p.gas),temperature=initial.temperature;
 const eosInvalidState=!!initial.invalidState,thermalFits=!eosInvalidState&&temperature>=(p.minimumGasTemperature+273.15);
 // No airborne solver is called. There is no touchdown or flowing regulator state.
 return {p:{...p,mass:hw.actualMass},hardware:hw,ramp,samples,events:offsetEvents(ramp),final,
  hasFlight:false,rampScreenMode:'driven',airborneStart:null,flightDuration:0,fullDuration:ramp.time,landed:false,soft:false,stable:false,candidate:false,
  reason:ramp.reason,hardwareIssues:eosInvalidState?['Gas state leaves the validated equation-of-state domain']:[],rampIssues:[ramp.reason],peakLoad:0,peakSeatLoad:ramp.peakSeatLoad??0,
  impulse:0,burnStart:null,gasUsed:0,pitchError:null,angularSpeed:null,verticalSpeed:null,contactVerticalSpeed:null,
  lateralSpeed:null,longitudinalSpeed:null,longitudinalFits:null,continuedInitialRotation:false,continuationActivations:0,targetHeading:p.headingMode==='outbound'?null:p.headingMode==='release'?p.yaw:0,impulseBudget:{world:[0,0,0],upward:0,downward:0,beforeBurn:{scalar:0,world:[0,0,0],upward:0,downward:0}},contactVelocity:null,contact:null,landingEnergy:null,rotationalEnergy:null,totalKineticEnergy:null,
  minimumTemperature:temperature,minimumFeedTemperature:temperature,maxFlow:0,maxNozzleUse:0,phaseLimited:false,eosInvalidState,
  thermalFits,heatFits:true,maxHeatPower:0,heatRequired:0,initialAngularRate:[...samples[0].w],hasGasFlow:false,feedBindingTime:0,feedBindingOccurred:false,minimumManifoldPressure:null,minimumBindingManifoldPressure:null,maximumFeedDeficit:0};
}

/** Run the driven ramp from rest, then carry its actual release state into 3D flight. */
export function simulateStunt(input={},options={}){
 const p={...FLIGHT_BASE,...HW_DEFAULTS,...FLIGHT_DEFAULTS,...RAMP_DEFAULTS,...input};validateControllerPolicy(p);validateFeedModel(p);
 const ramp=simulateRamp(p,{...options,dt:options.rampDt??options.dt??.003,maxTime:options.rampMaxTime??40}),rampParams={...p,mass:ramp.hardware.actualMass};
 const roadSamples=ramp.samples.map(s=>rampSample(s,rampParams));
 if(!ramp.released)return stoppedResult(p,ramp,roadSamples);
 const initialState=Object.fromEntries(RELEASE_KEYS.map(key=>[key,Array.isArray(ramp.releaseState[key])?[...ramp.releaseState[key]]:ramp.releaseState[key]]));
 // The nominal speed is only a drive target. Preserve the actual traversal
 // verdict rather than retesting its entire arc at one final-speed snapshot.
 const drivenRampAssessment={released:true,minimumNormal:ramp.minimumNormal,peakPowerW:ramp.peakPowerW};
 const flight=simulate3D({...p,speed:ramp.exitSpeed},{...options,initialState,drivenRampAssessment});
 const flightSamples=flight.samples.map(s=>({...s,t:s.t+ramp.time,phase:'flight'}));
 const final={...flight.final,t:flight.final.t+ramp.time,phase:'flight'};
 return {...flight,ramp,samples:[...roadSamples,...flightSamples],events:offsetEvents(ramp,flight.events),final,
  hasFlight:true,airborneStart:ramp.time,flightDuration:flight.final.t,fullDuration:final.t,
  burnStart:flight.burnStart===null?null:flight.burnStart+ramp.time,
  peakSeatLoad:Math.max(flight.peakSeatLoad,ramp.peakSeatLoad??0),candidate:ramp.released&&flight.candidate,rampIssues:[]};
}
