import {hardware,HW_DEFAULTS,fanSystem,fanAtPressure,atmosphere,bound} from './hardware.js?v=4.4';
import {SHAPE,fromEuler,rotate,norm} from './flight3d.js?v=4.4';
const G=9.80665,RAD=Math.PI/180;
export const RAMP_DEFAULTS=Object.freeze({rampDrive:false,driveAcceleration:2,driveForce:18,drivePower:200,fanSpinup:.4,rollingResistance:.015});
/**
 * Planar circular-path model, from rest at the ramp foot. It assumes constrained
 * pitch/no slip; bank, suspension, wheel spin and an approach transition are not
 * resolved. Drive force is an equivalent wheel force at the surface radius.
 */
export function simulateRamp(input={},options={}){
 const p={mass:2200,gas:250,height:20,thrust:60,exhaust:550,speed:4,pitch:170,suction:2,drag:true,blowdown:true,cgX:0,cgY:0,cgZ:0,inertiaScale:1,...HW_DEFAULTS,...RAMP_DEFAULTS,...input};
 const dt=options.dt??.005,maxTime=options.maxTime??40;
 for(const key of ['mass','gas','height','speed','pitch','roll','yaw','cgX','cgY','cgZ','inertiaScale','driveAcceleration','driveForce','drivePower','fanSpinup','rollingResistance','batteryPower'])if(!Number.isFinite(p[key]))throw new RangeError(key+' must be finite');
 if(!(dt>0&&dt<=.02&&Number.isFinite(dt)&&maxTime>0&&maxTime<=300&&Number.isFinite(maxTime)))throw new RangeError('Ramp time step/window is outside the supported range');
 if(!(p.mass>p.gas&&p.gas>0&&p.height>=0&&p.speed>=0&&p.pitch>=0&&p.pitch<=180&&p.driveAcceleration>=0&&p.driveForce>=0&&p.drivePower>=0&&p.fanSpinup>=0&&p.rollingResistance>=0&&p.inertiaScale>0))throw new RangeError('Ramp mass, angle, speed and drive parameters must be physical');
 const hw=hardware(p);if(p.enforceHardware)p.mass=hw.actualMass;
 const m=p.mass,angle=p.pitch*RAD,heading=p.yaw*RAD,center=[p.cgX,p.cgY,p.cgZ];
 const surfaceRadius=options.rampRadius??hw.rampRadius;
 // A zero arc is handled separately; choose a finite radius for its foot state.
 const R=Number.isFinite(surfaceRadius)?surfaceRadius:Math.max(1,p.height),r0=R-.6,r=r0-p.cgZ,x=p.cgX;
 if(!(R>.6&&r>0))throw new RangeError('Ramp radius must exceed the body/CG offset');
 const Iy=m*(SHAPE.length**2+SHAPE.height**2)/12*p.inertiaScale,J=m*(r*r+x*x)+Iy;
 const fan=fanSystem({...p,fanPower:Math.min(p.fanPower,p.batteryPower)}),rho=atmosphere(p).rho;
 const fanAt=t=>{const fraction=p.fanSpinup>0?1-Math.exp(-Math.max(0,t)/p.fanSpinup):1;const suction=fan.actualSuction*fraction;return {suction,power:fanAtPressure(suction/p.sealedArea,p).power};};
 let maximumPower=0,minimumNormal=Infinity,peakSeatLoad=0,work=0,batteryEnergy=0,fanEnergy=0,driveWork=0,rollingLoss=0,dragLoss=0,tractionLimited=false,powerLimited=false;
 const evaluate=(phi,omega,t)=>{
  const f=fanAt(t),sin=Math.sin(phi),cos=Math.cos(phi),v=r0*omega;
  const drag=p.drag?.5*rho*.65*v*Math.abs(v):0;
  const availableMotorPower=Math.max(0,.9*Math.min(p.drivePower*1000,p.batteryPower*1000-f.power));
  const motorCap=availableMotorPower>0?Math.min(p.driveForce*1000,omega>1e-9?availableMotorPower/(R*omega):p.driveForce*1000):0;
  const gravity= m*G*(r*sin+x*cos);
  const commandAlpha=bound(2*(p.speed-v),-p.driveAcceleration,p.driveAcceleration)/r0;
  let alpha=0,N=f.suction+m*G*cos+m*r*omega*omega,force=0,rolling=0,request=0,gripCap=0;
  // N includes the CG's tangential-offset acceleration. Solve its small implicit
  // coupling to traction and rolling resistance rather than dropping that term.
  for(let i=0;i<24;i++){
   N=f.suction+m*G*cos+m*(r*omega*omega+x*alpha);
   const rollingLimit=p.rollingResistance*Math.max(0,N);
   rolling=rollingLimit;
   request=Math.max(0,(J*commandAlpha+gravity+rolling*R+drag*r0)/R);
   gripCap=p.tyreGrip*p.drivenLoad*Math.max(0,N);
   force=Math.min(request,gripCap,motorCap);
   const withoutRolling=R*force-gravity-drag*r0;
   // At rest, resistance can hold equilibrium but cannot accelerate the car
   // backwards on its own. A gravity surplus beyond that limit is rollback.
   if(omega<1e-9)rolling=bound(withoutRolling/R,-rollingLimit,rollingLimit);
   const next=(withoutRolling-R*rolling)/J;
   if(Math.abs(next-alpha)<1e-10){alpha=next;break;}
   alpha=.5*(alpha+next);
  }
  N=f.suction+m*G*cos+m*(r*omega*omega+x*alpha);
  const mechPower=force*R*omega,batteryPower=f.power+mechPower/.9;
  return {phi,omega,alpha,N,force,suction:f.suction,fanPower:f.power,mechPower,batteryPower,netPower:(R*(force-rolling)-drag*r0)*omega,rollingPower:rolling*R*omega,dragPower:drag*r0*omega,request,gripCap,motorCap,tractionLimited:request>gripCap+1,powerLimited:request>motorCap+1};
 };
 const potential=phi=>m*G*(R-r*Math.cos(phi)+x*Math.sin(phi));
 const makeSample=(t,phi,omega,d)=>{
  const q=fromEuler(0,-phi,heading),base=[r0*Math.sin(phi),0,R-r0*Math.cos(phi)],offset=rotate(fromEuler(0,-phi,0),center);
  const localPosition=base.map((v,i)=>v+offset[i]);
  const pos=[localPosition[0]*Math.cos(heading)-localPosition[1]*Math.sin(heading),localPosition[0]*Math.sin(heading)+localPosition[1]*Math.cos(heading),localPosition[2]];
  const vx0=(r*Math.cos(phi)-x*Math.sin(phi))*omega,vz=(r*Math.sin(phi)+x*Math.cos(phi))*omega;
  const seatR=r0-.1,seatX=-.2;
  const seatA=[(seatR*Math.cos(phi)-seatX*Math.sin(phi))*d.alpha+(-seatR*Math.sin(phi)-seatX*Math.cos(phi))*omega*omega,0,(seatR*Math.sin(phi)+seatX*Math.cos(phi))*d.alpha+(seatR*Math.cos(phi)-seatX*Math.sin(phi))*omega*omega+G];
  const seatLoad=norm(seatA)/G;
  return {t,x:pos[0],y:pos[2],lateral:pos[1],vx:vx0*Math.cos(heading),vy:vz,vLateral:vx0*Math.sin(heading),q,w:[0,-omega,0],gas:p.gas,forces:Array(10).fill(0),thrust:0,netThrust:0,front:0,rear:0,load:0,burning:false,seatLoad,rampPhase:true,phi,omega,theta:-phi,roll:0,pitch:-phi,yaw:heading,tilt:phi,clearance:Math.max(0,pos[2]-(Math.abs(Math.sin(phi))*SHAPE.length/2+Math.abs(Math.cos(phi))*SHAPE.height/2+rotate(q,center)[2])),drivingForce:d.force,fanSuction:d.suction,normalForce:d.N,batteryPower:d.batteryPower,fanElectricalPower:d.fanPower,driveElectricalPower:d.mechPower/.9,geometricSpeed:r0*omega};
 };
 let t=0,phi=0,omega=0,first=evaluate(0,0,0),samples=[makeSample(0,0,0,first)],events=[{t:0,label:'Driven ramp: start from rest'}],released=false,reason='',nextSample=1/60;
 minimumNormal=first.N;peakSeatLoad=samples[0].seatLoad;
 const finish=()=>{const final=samples.at(-1),energyChange=.5*J*omega*omega+potential(phi)-potential(0);return {p,hardware:hw,samples,events,released,reason,releaseState:released?{...final,q:[...final.q],w:[...final.w],forces:[...final.forces]}:null,final,exitSpeed:r0*omega,exitCGSpeed:Math.hypot(final.vx,final.vy,final.vLateral),time:t,energyJ:work,batteryEnergyJ:batteryEnergy,fanEnergyJ:fanEnergy,driveWorkJ:driveWork,rollingLossJ:rollingLoss,dragLossJ:dragLoss,mechanicalEnergyChangeJ:energyChange,energyResidualJ:work-energyChange,peakPowerW:maximumPower,minimumNormal,peakSeatLoad,tractionLimited,powerLimited,surfaceRadius:R,geometricRadius:r0,cgRadius:r,generalizedInertia:J,unsupported:Math.abs(p.roll)>1e-9};};
 if(Math.abs(p.roll)>1e-9){reason='Driven ramp model requires zero bank/roll; a banked ramp is not modeled.';return finish();}
 if(angle<=1e-12&&p.height>1e-9){reason='A zero-angle ramp cannot reach a positive release height; use free-release mode for an elevated upright drop.';events.push({t:0,label:'Invalid ramp geometry'});return finish();}
 if(!hw.sealFits){reason='Seal travel is insufficient for the selected ramp curvature.';return finish();}
 if(hw.sealGeometryFits===false){reason='Selected seal area, length and perimeter do not fit the body.';return finish();}
 if(angle<=1e-12){released=true;reason='Zero ramp arc; release at the foot.';minimumNormal=first.N;peakSeatLoad=samples[0].seatLoad;events.push({t:0,label:'Ramp release'});return finish();}
 while(t<maxTime-1e-12){
  let h=Math.min(dt,maxTime-t),d0=evaluate(phi,omega,t);
  if(omega<=1e-10&&d0.alpha< -1e-8){reason='The car stalls and would roll back; backward traversal is not simulated.';events.push({t,label:'Ramp stalled'});break;}
  const midOmega=Math.max(0,omega+d0.alpha*h/2),midPhi=phi+omega*h/2;
  let d=evaluate(midPhi,midOmega,t+h/2),nextPhi=phi+omega*h+d.alpha*h*h/2,nextOmega=omega+d.alpha*h;
  if(nextOmega<0){nextOmega=0;nextPhi=Math.max(phi,phi+omega*h/2);}
  if(nextPhi>=angle){let lo=0,hi=h;for(let i=0;i<35;i++){const z=(lo+hi)/2;if(phi+omega*z+d.alpha*z*z/2<angle)lo=z;else hi=z;}h=(lo+hi)/2;nextPhi=angle;nextOmega=Math.max(0,omega+d.alpha*h);d=evaluate(phi+omega*h/2,Math.max(0,omega+d.alpha*h/2),t+h/2);}
  const end=evaluate(nextPhi,nextOmega,t+h);
  minimumNormal=Math.min(minimumNormal,d0.N,d.N,end.N);maximumPower=Math.max(maximumPower,d0.batteryPower,d.batteryPower,end.batteryPower);
  tractionLimited ||=d.tractionLimited;powerLimited ||=d.powerLimited;
  work+=d.netPower*h;batteryEnergy+=d.batteryPower*h;fanEnergy+=d.fanPower*h;driveWork+=d.mechPower*h;rollingLoss+=d.rollingPower*h;dragLoss+=d.dragPower*h;
  t+=h;phi=nextPhi;omega=nextOmega;
  const sample=makeSample(t,phi,omega,end);peakSeatLoad=Math.max(peakSeatLoad,sample.seatLoad);
  if(t>=nextSample||phi>=angle||end.N<0||t>=maxTime-1e-12){samples.push(sample);nextSample=t+1/60;}
  if(Math.min(d0.N,d.N,end.N)<0){reason='Normal force became negative: the car loses ramp contact before the intended release.';events.push({t,label:'Ramp contact lost'});if(samples.at(-1).t<t)samples.push(sample);break;}
  if(phi>=angle-1e-10){released=true;reason='Driven ramp reaches the intended release angle.';events.push({t,label:'Ramp release'});break;}
  if(t>1&&omega*r0<.01&&end.alpha<=0){reason='Wheel force, grip or power cannot sustain the climb; the car stalls.';events.push({t,label:'Ramp stalled'});if(samples.at(-1).t<t)samples.push(sample);break;}
  if(batteryEnergy>p.batteryEnergy*3.6e6){reason='Selected battery energy is exhausted during the ramp climb.';events.push({t,label:'Ramp energy exhausted'});if(samples.at(-1).t<t)samples.push(sample);break;}
 }
 if(!reason){reason='Ramp traversal exceeds the simulation time window.';events.push({t,label:'Ramp time limit'});}
 return finish();
}
