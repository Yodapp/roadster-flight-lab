import {RAMP_DEFAULTS} from './ramp.js?v=4.4';
import {simulateStunt} from './stunt.js?v=4.4';
import {HW_DEFAULTS,gasState,hardware} from './hardware.js?v=4.4';
import {simulate3D,FLIGHT_DEFAULTS} from './flight3d.js?v=4.4';
/** Active 3D model facade plus explicitly retained 2D analytic benchmarks. */
export const G = 9.80665;
export const DEFAULTS = Object.freeze({...HW_DEFAULTS,...FLIGHT_DEFAULTS,...RAMP_DEFAULTS,mass:2200, gas:250, height:20, thrust:60, exhaust:550, speed:4, pitch:170, brakeHeight:9, auto:true, blowdown:true, suction:2, drag:true});
const fullRunPreset={...DEFAULTS,rampDrive:true,roll:0,yaw:0,flipMode:'continue',headingMode:'release',driveForce:30};
export const PRESETS = {
  fullRun:fullRunPreset,
  demoOrientation:{...fullRunPreset,headingMode:'outbound'},
  rampStall:{...DEFAULTS,rampDrive:true,roll:0,yaw:0,flipMode:'continue',headingMode:'release',driveForce:8},
  rampHighFlow:{...DEFAULTS,rampDrive:true,roll:0,yaw:0,flipMode:'continue',headingMode:'release',driveForce:30,feedDiameter:120,throat:50},
  reviewOriginal:{...DEFAULTS,rampDrive:true,roll:0,yaw:0,driveForce:30,flipMode:'shortest',headingMode:'world'},
  regulator60:{...DEFAULTS,rampDrive:true,roll:0,yaw:0,driveForce:30,flipMode:'continue',headingMode:'release',regulatorBar:60,throat:58},
  baseline:{...DEFAULTS},
  ballistic:{...DEFAULTS,thrust:0,allThrustersOff:true},
  highFlow:{...DEFAULTS,feedDiameter:120,throat:50},
  upright:{...DEFAULTS,feedDiameter:120,throat:50,height:5,pitch:0,roll:0,yaw:0,speed:0},
  leaky:{...DEFAULTS,fanGap:15},
  oversize:{...DEFAULTS,tankVolume:1000},
  weak:{...DEFAULTS,thrust:16},
  littleAir:{...DEFAULTS,gas:40},
  late:{...DEFAULTS,auto:false,brakeHeight:2},
};
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const radians=x=>x*Math.PI/180;
export const degrees=x=>x*180/Math.PI;
export const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
export const BODY={length:4.6,height:1.2,arm:1.55,volume:0.6,temperature:293.15,regulator:100e5};
export function contactRadius(theta){return BODY.length/2*Math.abs(Math.sin(theta))+BODY.height/2*Math.abs(Math.cos(theta));}
export function idealTankState(p,gas){
  const fraction=Math.max(0,gas/p.gas);
  const initialPressure=p.gas*287.05*BODY.temperature/BODY.volume;
  const temperature=BODY.temperature*(p.blowdown?Math.pow(fraction,0.4):1);
  const pressure=initialPressure*Math.pow(fraction,p.blowdown?1.4:1);
  const capacity=clamp((pressure-101325)/(BODY.regulator-101325),0,1);
  const exhaust=p.exhaust*Math.sqrt(temperature/BODY.temperature);
  return {pressure,initialPressure,temperature,capacity,exhaust};
}
export function initialState(p){
  const theta=radians(p.pitch);
  return {t:0,x:0,y:p.height+contactRadius(theta),vx:p.speed*Math.cos(theta),vy:p.speed*Math.sin(theta),theta,omega:0,gas:p.gas,thrust:0,front:0,rear:0,load:0,burning:false};
}
export function simulate2D(input={},options={}){
  const p={...DEFAULTS,...input};
  if(p.mass<=p.gas || p.gas<=0 || p.height<=0 || p.thrust<0)throw new RangeError('Wet mass must exceed gas mass; height and gas must be positive.');
  const dt=options.dt??0.002;
  let s=initialState(p),nextSample=0,impulse=0,peakLoad=0,burnStart=null;
  const samples=[{...s}],events=[{t:0,label:'Ramp release'}];
  let landed=false;
  for(let step=0;step<Math.ceil(12/dt);step++){
    const mass=p.mass-p.gas+s.gas;
    const tank=idealTankState(p,s.gas);
    const maxForce=p.thrust*1000*tank.capacity;
    const inertia=mass*(BODY.length**2+BODY.height**2)/12;
    const err=angle(s.theta);
    // Two groups of underside nozzles, one front and one rear. No free torque:
    // a differential creates a moment AND body-normal acceleration, even inverted.
    const desiredTorque=inertia*(-24*err-9*s.omega);
    const diff=clamp(desiredTorque/BODY.arm,-maxForce/2,maxForce/2);
    const gap=s.y-contactRadius(s.theta);
    const projected=maxForce*Math.max(0,Math.cos(s.theta))/mass-G;
    const stopDistance=projected>0?s.vy**2/(2*projected):Infinity;
    const trigger=p.auto ? (s.vy<0 && Math.cos(s.theta)>0.5 && gap<=stopDistance*1.22+0.7) : gap<=p.brakeHeight;
    const burning=s.burning||trigger;
    if(burning && !s.burning){burnStart=s.t;events.push({t:s.t,label:'Landing burn'});}
    const desiredAcceleration=s.vy < -0.5 ? (s.vy*s.vy-0.25)/(2*Math.max(0.025,gap)) : 5*(-0.5-s.vy);
    const desiredLift=burning ? mass*Math.max(0,G+desiredAcceleration)/Math.max(0.15,Math.cos(s.theta)) : 0;
    const force=clamp(desiredLift,Math.abs(diff),maxForce-Math.abs(diff));
    const front=(force+diff)/2,rear=(force-diff)/2;
    const alpha=BODY.arm*(front-rear)/inertia;
    const requestedGas=tank.exhaust>0?force/tank.exhaust*dt:0;
    const used=Math.min(s.gas,requestedGas);
    const actualForce=requestedGas>0?force*used/requestedGas:0;
    const midTheta=s.theta+s.omega*dt/2+alpha*dt*dt/8;
    const midMass=mass-used/2;
    const velocity=Math.hypot(s.vx,s.vy);
    const dragFactor=p.drag?0.5*1.225*0.65*velocity:0;
    const ax=(-actualForce*Math.sin(midTheta)-dragFactor*s.vx)/midMass;
    const ay=(actualForce*Math.cos(midTheta)-dragFactor*s.vy)/midMass-G;
    const load=actualForce/midMass/G;
    let n={t:s.t+dt,x:s.x+s.vx*dt+ax*dt*dt/2,y:s.y+s.vy*dt+ay*dt*dt/2,vx:s.vx+ax*dt,vy:s.vy+ay*dt,theta:s.theta+s.omega*dt+alpha*dt*dt/2,omega:s.omega+alpha*dt,gas:Math.max(0,s.gas-used),thrust:actualForce,front,rear,load,burning};
    impulse+=actualForce*dt;peakLoad=Math.max(peakLoad,load);
    if(n.y<=contactRadius(n.theta)){
      // Interpolate the first body/ground contact instead of letting it penetrate.
      const newGap=n.y-contactRadius(n.theta),f=clamp(gap/(gap-newGap),0,1);
      for(const key of ['t','x','y','vx','vy','theta','omega','gas'])n[key]=s[key]+(n[key]-s[key])*f;
      n.y=contactRadius(n.theta);
      impulse-=actualForce*dt*(1-f);
      s=n;landed=true;samples.push({...s});break;
    }
    s=n;
    if(s.t>=nextSample){samples.push({...s});nextSample=s.t+1/60;}
  }
  const pitchError=Math.abs(degrees(angle(s.theta)));
  const angularSpeed=Math.abs(degrees(s.omega));
  const verticalSpeed=Math.abs(Math.min(0,s.vy));
  const stable=pitchError<=8 && angularSpeed<=12;
  const soft=landed && stable && verticalSpeed<=1.5;
  const contactVelocity=Math.abs(s.vy)+BODY.length/2*Math.abs(s.omega);
  const landingEnergy=0.5*(p.mass-p.gas+s.gas)*s.vy*s.vy;
  let reason=soft?'Soft touchdown in this model.':!landed?'No touchdown within the 12-second model window.':!stable?'Attitude not stabilized before ground contact.':verticalSpeed>1.5?'Descent was not arrested before ground contact.':'Landing envelope exceeded.';
  if(!soft&&s.gas<5)reason+=' Gas supply nearly exhausted.';
  events.push({t:s.t,label:landed?'Ground contact':'Model timeout'});
  return {p,samples,events,final:s,landed,soft,reason,peakLoad,impulse,burnStart,gasUsed:p.gas-s.gas,pitchError,angularSpeed,verticalSpeed,contactVelocity,landingEnergy,stable};
}
export function analytic(p){
  const wet=p.mass;
  const weight=wet*G;
  const v=Math.sqrt(2*G*p.height);
  const ratio=p.thrust*1000/weight;
  const acceleration=p.thrust*1000/wet-G;
  const brakeDistance=acceleration>0?v*v/(2*acceleration):Infinity;
  // Separate upright, constant-mass, constant-thrust example: fall from rest,
  // coast then brake to rest. It does not include the ramp flip or blowdown.
  const burnHeight=ratio>1?p.height/ratio:Infinity;
  const burnSpeed=ratio>1?Math.sqrt(2*G*(p.height-burnHeight)):NaN;
  const burnTime=ratio>1?burnSpeed/acceleration:Infinity;
  const impulse=p.thrust*1000*burnTime;
  const idealGas=impulse/p.exhaust;
  const radius=hardware(p).rampRadius;
  return {weight,v,freefallTime:Math.sqrt(2*p.height/G),ratio,brakeDistance,burnHeight,burnTime,impulse,idealGas,hoverTime:p.gas*p.exhaust/weight,pressure:weight/(p.sealedArea??4),loopRadius:radius,loopSpeed:Math.sqrt(G*radius),energy:wet*G*p.height,tankPressure:gasState(p,p.gas).pressure};
}

export const tankState=gasState;
export function simulate(input={},options={}){const p={...DEFAULTS,...input};return p.rampDrive?simulateStunt(p,options):simulate3D(p,options);}
