import {gasState,nozzleSupply,hardware,HW_DEFAULTS,bound,atmosphere,validateFeedModel,solveManifold} from './hardware.js?v=4.4';
const G=9.80665,rad=x=>x*Math.PI/180,deg=x=>x*180/Math.PI;
export const SHAPE={length:4.6,width:1.95,height:1.2};
export const FLIGHT_DEFAULTS=Object.freeze({windX:0,windY:0,rollRate:0,pitchRate:0,yawRate:0,releaseRateFromRamp:true,failedNozzle:-1,cgX:0,cgY:0,cgZ:0,inertiaScale:1,sideSpeedLimit:1,contactSpeedLimit:1.5,longitudinalSpeedLimit:1.5,controlDelay:0,flipMode:'shortest',headingMode:'world',lateralVelocityTarget:0});
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>Math.hypot(...a);
export const qmul=(a,b)=>[a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
export const qnormalize=q=>{const n=norm(q);if(!(n>0&&Number.isFinite(n)))throw new RangeError('Attitude quaternion must be finite and nonzero');return q.map(x=>x/n);};
export const qconj=q=>[q[0],-q[1],-q[2],-q[3]];
export function rotate(q,v){const t=cross(q.slice(1),v).map(x=>2*x),u=cross(q.slice(1),t);return v.map((x,i)=>x+q[0]*t[i]+u[i]);}
export function fromEuler(roll,pitch,yaw){const cr=Math.cos(roll/2),sr=Math.sin(roll/2),cp=Math.cos(pitch/2),sp=Math.sin(pitch/2),cy=Math.cos(yaw/2),sy=Math.sin(yaw/2);return [cr*cp*cy+sr*sp*sy,sr*cp*cy-cr*sp*sy,cr*sp*cy+sr*cp*sy,cr*cp*sy-sr*sp*cy];}
export function euler(q){const [w,x,y,z]=q;return {roll:Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)),pitch:Math.asin(bound(2*(w*y-z*x),-1,1)),yaw:Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))};}
const cg=p=>[p?.cgX??0,p?.cgY??0,p?.cgZ??0];
const corners=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push([x*SHAPE.length/2,y*SHAPE.width/2,z*SHAPE.height/2]);
/** CG height above first rigid-box contact. This is not a tyre/suspension model. */
export function support(q,p={}){const x=rotate(q,[1,0,0]),y=rotate(q,[0,1,0]),z=rotate(q,[0,0,1]);return Math.abs(x[2])*SHAPE.length/2+Math.abs(y[2])*SHAPE.width/2+Math.abs(z[2])*SHAPE.height/2+rotate(q,cg(p))[2];}
/** Exact rigid-body velocity at the lowest corner(s), including rotation. */
export function contactState(s,p={}){
 const center=cg(p),v=[s.vx,s.vLateral,s.vy];
 const points=corners.map(point=>{const r=point.map((x,i)=>x-center[i]),world=rotate(s.q,r),rotation=rotate(s.q,cross(s.w,r));return {point,world,velocity:v.map((x,i)=>x+rotation[i]),height:s.y+world[2]};});
 const lowest=Math.min(...points.map(x=>x.height));
 const contacts=points.filter(x=>x.height<=lowest+1e-7);
 // If a whole face lands simultaneously, report its fastest descending corner.
 const hit=contacts.reduce((a,b)=>b.velocity[2]<a.velocity[2]?b:a);
 const forward=rotate(s.q,[1,0,0]),heading=Math.atan2(forward[1],forward[0]);
 const lateral=Math.max(...contacts.map(x=>Math.abs(-Math.sin(heading)*x.velocity[0]+Math.cos(heading)*x.velocity[1])));
 return {...hit,clearance:lowest,verticalSpeed:Math.max(0,-hit.velocity[2]),lateralSpeed:lateral,longitudinalSpeed:Math.cos(heading)*hit.velocity[0]+Math.sin(heading)*hit.velocity[1],contacts:contacts.length};
}
// All reaction forces are unilateral and fixed in the rotating body frame.
export const NOZZLES=[
 ...[[-1.55,-.72],[-1.55,.72],[1.55,-.72],[1.55,.72]].map(([x,y],i)=>({name:'Under '+(i+1),group:'underside',r:[x,y,-.45],d:[0,0,1]})),
 ...[[-.65,-.25],[-.65,.25],[.65,-.25],[.65,.25]].map(([y,z],i)=>({name:'Rear '+(i+1),group:'rear',r:[-2.05,y,z],d:[1,0,0]})),
 {name:'Nose left',group:'side',r:[1.8,-.75,0],d:[0,1,0]},
 {name:'Nose right',group:'side',r:[1.8,.75,0],d:[0,-1,0]},
].map(n=>({...n,torque:cross(n.r,n.d)}));
export function nozzleWrench(forces,p={}){const c=cg(p),force=[0,0,0],torque=[0,0,0];for(let i=0;i<NOZZLES.length;i++){const n=NOZZLES[i],t=cross(n.r.map((x,k)=>x-c[k]),n.d);for(let k=0;k<3;k++){force[k]+=n.d[k]*forces[i];torque[k]+=t[k]*forces[i];}}return {force,torque};}
function allocate(target,caps,prior,weights,sweeps,columns){const f=prior.map((x,i)=>bound(x,0,caps[i])),res=target.map(x=>-x);for(let i=0;i<10;i++)for(let k=0;k<6;k++)res[k]+=columns[i][k]*f[i];for(let s=0;s<sweeps;s++)for(let i=0;i<10;i++){let num=100,den=.00005;for(let k=0;k<6;k++){num+=weights[k]*columns[i][k]*res[k];den+=weights[k]*columns[i][k]**2;}const value=bound(f[i]-num/den,0,caps[i]),delta=value-f[i];for(let k=0;k<6;k++)res[k]+=columns[i][k]*delta;f[i]=value;}return f;}
/** Direction-dependent drag screen; coefficients are assumptions, not measured CFD. */
export function aerodynamicForce(s,p={}){
 if(!p.drag)return [0,0,0];
 const relative=[s.vx-(p.windX??0),s.vLateral-(p.windY??0),s.vy],speed=norm(relative);if(speed<1e-12)return [0,0,0];
 const body=rotate(qconj(s.q),relative).map(x=>x/speed);
 // Frontal CdA 0.65 m²; side and broadside Cd=1.1 times geometric face area.
 const cdA=.65*Math.abs(body[0])+1.1*SHAPE.length*SHAPE.height*Math.abs(body[1])+1.1*SHAPE.length*SHAPE.width*Math.abs(body[2]);
 const rho=atmosphere(p).rho;
 return relative.map(x=>-.5*rho*cdA*speed*x);
}
function inertia(m,p){return [m*(SHAPE.width**2+SHAPE.height**2)/12,m*(SHAPE.length**2+SHAPE.height**2)/12,m*(SHAPE.length**2+SHAPE.width**2)/12].map(x=>x*p.inertiaScale);}
function snapshot(s,p){const ea=euler(s.q),up=rotate(s.q,[0,0,1]),wrench=nozzleWrench(s.forces,p),mass=p.mass-p.gas+s.gas,contact=contactState(s,p);return {...s,contactPoint:contact.point,contactVelocity:contact.velocity,contactVerticalSpeed:contact.verticalSpeed,lateralSpeed:contact.lateralSpeed,q:[...s.q],w:[...s.w],forces:[...s.forces],theta:ea.pitch,omega:norm(s.w),roll:ea.roll,pitch:ea.pitch,yaw:ea.yaw,tilt:Math.acos(bound(up[2],-1,1)),clearance:Math.max(0,s.y-support(s.q,p)),thrust:s.forces.reduce((a,b)=>a+b,0),netThrust:norm(wrench.force),front:s.forces[2]+s.forces[3],rear:s.forces[0]+s.forces[1],load:norm(wrench.force)/(mass*G)};}
export function validateControllerPolicy(p){
 if(!['shortest','continue'].includes(p.flipMode))throw new RangeError('Flip mode must be shortest or continue');
 if(!['world','release','outbound'].includes(p.headingMode))throw new RangeError('Heading mode must be world, release or outbound');
 if(!Number.isFinite(p.lateralVelocityTarget))throw new RangeError('Lateral velocity target must be finite');
 if(!Number.isFinite(p.longitudinalSpeedLimit)||p.longitudinalSpeedLimit<0)throw new RangeError('Longitudinal speed limit must be finite and nonnegative');
}
function validate(p,options){
 validateControllerPolicy(p);validateFeedModel(p);
 for(const key of ['mass','gas','height','thrust','exhaust','speed','pitch','roll','yaw',...Object.keys(FLIGHT_DEFAULTS).filter(k=>typeof FLIGHT_DEFAULTS[k]==='number')])if(!Number.isFinite(p[key]))throw new RangeError(key+' must be finite');
 if(!(p.mass>p.gas&&p.gas>0&&p.exhaust>0&&p.height>=0&&p.thrust>=0&&p.speed>=0&&p.inertiaScale>0&&p.sideSpeedLimit>=0&&p.contactSpeedLimit>=0&&p.longitudinalSpeedLimit>=0))throw new RangeError('Mass, gas, exhaust, inertia and limits must be physical');
 if(!(p.controlDelay>=0&&p.controlDelay<=1000))throw new RangeError('Control delay must be between 0 and 1000 ms');
 if(!Number.isInteger(p.failedNozzle)||p.failedNozzle< -1||p.failedNozzle>9)throw new RangeError('Failed nozzle must be -1 or an index from 0 to 9');
 if(Math.abs(p.cgX)>=SHAPE.length/2||Math.abs(p.cgY)>=SHAPE.width/2||Math.abs(p.cgZ)>=SHAPE.height/2)throw new RangeError('CG must be inside the body envelope');
 const dt=options.dt??.003,maxTime=options.maxTime??10,sweeps=options.sweeps??14;
 if(!(Number.isFinite(dt)&&dt>0&&dt<=.02))throw new RangeError('Time step must be >0 and <=0.02 s');
 if(!(Number.isFinite(maxTime)&&maxTime>0&&maxTime<=30))throw new RangeError('Time window must be >0 and <=30 s');
 if(!(Number.isInteger(sweeps)&&sweeps>0&&sweeps<=100))throw new RangeError('Allocator sweeps must be an integer from 1 to 100');
}
export function simulate3D(input={},options={}){
 const p={mass:2200,gas:250,height:20,thrust:60,exhaust:550,speed:4,pitch:170,brakeHeight:9,auto:true,blowdown:true,suction:2,drag:true,...HW_DEFAULTS,...FLIGHT_DEFAULTS,...input};validate(p,options);
 // A successful driven traversal supersedes only the older constant-speed
 // normal/grip/power screens. All independent hardware screens remain active.
 const drivenRamp=options.drivenRampAssessment;
 if(drivenRamp!==undefined&&(!drivenRamp||drivenRamp.released!==true||!Number.isFinite(drivenRamp.minimumNormal)||drivenRamp.minimumNormal<0||!Number.isFinite(drivenRamp.peakPowerW)||drivenRamp.peakPowerW<0||drivenRamp.peakPowerW>p.batteryPower*1000+1e-6))throw new RangeError('Driven-ramp assessment must report a released traversal within normal-force and electrical limits');
 const rampScreenMode=drivenRamp?'driven':'quasi-static';
 const hw=hardware(p);if(p.enforceHardware)p.mass=hw.actualMass;
 const nominalDt=options.dt??.003,maxTime=options.maxTime??10,center=cg(p);
 const columns=NOZZLES.map(n=>[...n.d,...cross(n.r.map((x,i)=>x-center[i]),n.d)]);
 // User pitch is uphill ramp angle; standard right-handed Euler pitch has the opposite sign.
 const q=fromEuler(rad(p.roll),-rad(p.pitch),rad(p.yaw)),heading=rad(p.yaw);
 const rampRadius=hw.rampCGRadius??hw.rampRadius;
 const rampRate=p.releaseRateFromRamp&&Number.isFinite(rampRadius)&&rampRadius>0?p.speed/rampRadius:0;
 const rampOmega=rotate(qconj(q),[rampRate*Math.sin(heading),-rampRate*Math.cos(heading),0]);
 const w0=[p.rollRate,p.pitchRate,p.yawRate].map((x,i)=>rad(x)+rampOmega[i]);
 let s={t:0,x:0,y:p.height+support(q,p),lateral:0,vx:p.speed*Math.cos(rad(p.pitch))*Math.cos(heading),vy:p.speed*Math.sin(rad(p.pitch)),vLateral:p.speed*Math.cos(rad(p.pitch))*Math.sin(heading),q,w:w0,gas:p.gas,forces:Array(10).fill(0),burning:false,seatLoad:0,manifoldPressure:null,feedPressureCeiling:null,feedBinding:false,feedDemand:0,feedCapacity:0,feedResidual:0,feedStateGas:p.gas};
 // Optional measured/ramp-release state; gas inventory and forces remain owned by this flight.
 if(options.initialState!==undefined){
  const initial=options.initialState;
  if(!initial||typeof initial!=='object')throw new RangeError('Initial state must be an object');
  for(const key of Object.keys(initial))if(!['q','w','x','y','lateral','vx','vy','vLateral'].includes(key))throw new RangeError('Unsupported initial-state field: '+key);
  for(const key of ['x','y','lateral','vx','vy','vLateral'])if(key in initial){if(!Number.isFinite(initial[key]))throw new RangeError('Initial '+key+' must be finite');s[key]=initial[key];}
  if('q' in initial){if(!Array.isArray(initial.q)||initial.q.length!==4||!initial.q.every(Number.isFinite))throw new RangeError('Initial quaternion must contain four finite numbers');s.q=qnormalize(initial.q);}
  if('w' in initial){if(!Array.isArray(initial.w)||initial.w.length!==3||!initial.w.every(Number.isFinite))throw new RangeError('Initial angular velocity must contain three finite numbers');s.w=[...initial.w];}
 }
 if(s.y<support(s.q,p)-1e-9)throw new RangeError('Initial state penetrates the ground');
 // Release-heading holds the selected track azimuth, not Euler yaw of an
 // inverted nose (which has a pi ambiguity). Outbound instead resolves the
 // actual initial horizontal velocity after any driven/measured state handoff.
 // A near-zero horizontal velocity has no useful azimuth; use the selected
 // track heading below 1 micrometre/s. The target is fixed for the whole flight.
 // Lateral control is perpendicular to that target; world retains the old law.
 const outboundHeading=Math.hypot(s.vx,s.vLateral)>1e-6?Math.atan2(s.vLateral,s.vx):heading;
 const targetHeading=p.headingMode==='outbound'?outboundHeading:p.headingMode==='release'?heading:0,targetQ=fromEuler(0,0,targetHeading);
 let initialError=qmul(qconj(s.q),targetQ);if(initialError[0]<0)initialError=initialError.map(x=>-x);
 const initialErrorNorm=norm(initialError.slice(1)),initialErrorAngle=2*Math.atan2(initialErrorNorm,initialError[0]);
 const initialAxis=initialErrorNorm>1e-8?initialError.slice(1).map(x=>x/initialErrorNorm):[0,0,0];
 // Select the longer branch once, only for a substantially inverted release
 // whose inherited rotation opposes the short correction. After crossing the
 // 180-degree remaining-angle boundary, normal short-path stabilization resumes.
 const continuedInitialRotation=p.flipMode==='continue'&&initialErrorAngle>2.5&&initialAxis.reduce((a,x,i)=>a+x*s.w[i],0)<-1e-8;
 let continuingBranch=continuedInitialRotation,continuationWasActive=false,continuationActivations=0;
 const initialTargetSign=initialError[0]===0?1:Math.sign(qmul(qconj(s.q),targetQ)[0]);
 const windingTarget=targetQ.map(x=>x*(continuedInitialRotation?-initialTargetSign:initialTargetSign));
 const impulseBudget={world:[0,0,0],upward:0,downward:0,beforeBurn:{scalar:0,world:[0,0,0],upward:0,downward:0}};
 const initialAngularRate=[...s.w],commandQueue=[];let nextControl=0,activeCommand=Array(10).fill(0);
 let feedBindingTime=0,feedBindingOccurred=false,minimumManifoldPressure=Infinity,minimumBindingManifoldPressure=Infinity,maximumFeedDeficit=0;
 let prior=Array(10).fill(0),samples=[snapshot(s,p)],events=[{t:0,label:'Ramp release'}],nextSample=.016,impulse=0,peakLoad=0,peakSeatLoad=0,burnStart=null,landed=s.y<=support(s.q,p)+1e-10,phaseLimited=false,eosInvalidState=!!hw.initial.invalidState,minimumTemperature=Infinity,minimumFeedTemperature=Infinity,maxFlow=0,maxNozzleUse=0,maxHeatPower=0,heatRequired=0;
 while(!landed&&s.t<maxTime-1e-12){
  const controlTick=s.t>=nextControl-1e-12;
  const m=p.mass-p.gas+s.gas,I=inertia(m,p),tank=gasState(p,s.gas),supply=nozzleSupply(p,tank);phaseLimited ||=tank.phaseLimited;eosInvalidState ||=!!tank.invalidState;minimumTemperature=Math.min(minimumTemperature,tank.temperature);
  const caps=p.allThrustersOff?Array(10).fill(0):supply.caps.map((cap,i)=>i===p.failedNozzle?0:cap);
  const up=rotate(s.q,[0,0,1]),gap=s.y-support(s.q,p);
  // A feed restriction applies to all jets; nozzle nameplate sums overstate available lift.
  const maxLift=Math.min(caps.slice(0,4).reduce((a,b)=>a+b,0),supply.feedMdot*tank.exhaust);
  const aMax=maxLift*Math.max(0,up[2])/m-G,stopDistance=aMax>0?s.vy*s.vy/(2*aMax):Infinity;
  const trigger=p.auto?(s.vy<0&&up[2]>.90&&gap<stopDistance*1.12+.5):gap<=p.brakeHeight;
  const burning=s.burning||(controlTick&&trigger);if(burning&&!s.burning){burnStart=s.t;events.push({t:s.t,label:p.controlDelay>0?'Landing burn command':'Landing burn'});}
  const az=s.vy<-.6?(s.vy*s.vy-.36)/(2*Math.max(.003,gap)):4*(-.6-s.vy);
  const lateralVelocity=-Math.sin(targetHeading)*s.vx+Math.cos(targetHeading)*s.vLateral;
  const lateralForce=-m*.8*(lateralVelocity-p.lateralVelocityTarget);
  const worldForce=[-Math.sin(targetHeading)*lateralForce,Math.cos(targetHeading)*lateralForce,burning?m*Math.max(0,G+az):0],bodyForce=rotate(qconj(s.q),worldForce);
  let err=qmul(qconj(s.q),continuingBranch?windingTarget:targetQ);
  if(continuingBranch&&err[0]>=0)continuingBranch=false;
  // Count entry into an actually evaluated long branch, not its integration
  // steps. A selected branch at an already-grounded release is never activated.
  if(continuingBranch&&!continuationWasActive)continuationActivations++;
  continuationWasActive=continuingBranch;
  if(!continuingBranch&&err[0]<0)err=err.map(x=>-x);
  const errNorm=norm(err.slice(1)),rotationError=errNorm>1e-8?err.slice(1).map(x=>2*Math.atan2(errNorm,err[0])*x/errNorm):[0,0,0];
  const desiredAlpha=rotationError.map((x,i)=>bound(20*x-8*s.w[i],i===2?-2:-8,i===2?2:8)),gyroscopic=cross(s.w,s.w.map((x,i)=>I[i]*x));
  const torque=desiredAlpha.map((x,i)=>I[i]*x+gyroscopic[i]),target=[...bodyForce,...torque];
  const weights=[.7,.4,burning?.65:.08,3.5,2.5,2];
  if(controlTick){
   prior=allocate(target,caps,prior,weights,options.sweeps??14,columns);
   commandQueue.push({time:s.t+p.controlDelay/1000,forces:[...prior]});
   nextControl+=nominalDt;
  }
  // Commands are zero-order held, applied only at their scheduled arrival time.
  // Split integration at arrivals so a fractional-step delay cannot act early.
  while(commandQueue.length&&commandQueue[0].time<=s.t+1e-12)activeCommand=commandQueue.shift().forces;
  const nextArrival=commandQueue.length?commandQueue[0].time:Infinity;
  const dt=Math.min(nominalDt,maxTime-s.t,nextControl-s.t,nextArrival-s.t);
  const lag=(p.valveLag??15)/1000;let forces=s.forces.map((x,i)=>Math.min(caps[i],x+(activeCommand[i]-x)*(lag>0?1-Math.exp(-dt/lag):1)));
  let sum=forces.reduce((a,b)=>a+b,0),flow=tank.exhaust>0?sum/tank.exhaust:0;
  // Apply the hydraulic pressure/flow solve only after valve lag. The allocator,
  // burn trigger and their pre-solve ceilings remain identical in both modes.
  const hydraulic=solveManifold(p,tank,forces);forces=hydraulic.forces;
  sum=forces.reduce((a,b)=>a+b,0);flow=tank.exhaust>0?sum/tank.exhaust:0;
  const flowScale=Math.min(1,supply.feedMdot/Math.max(1e-12,flow),s.gas/Math.max(1e-12,flow*dt));forces=forces.map(x=>x*flowScale);sum=forces.reduce((a,b)=>a+b,0);flow=tank.exhaust>0?sum/tank.exhaust:0;
  const feedDiagnostics={manifoldPressure:flow>0?hydraulic.manifoldPressure:null,
   feedPressureCeiling:hydraulic.feedPressureCeiling,feedBinding:flow>0&&hydraulic.feedBinding,
   feedDemand:flow,feedCapacity:flow>0?hydraulic.feedCapacity:0,
   feedResidual:flow>0?flow-hydraulic.feedCapacity:0,feedStateGas:s.gas};
  // Diagnostics describe the applied force interval beginning at feedStateGas,
  // not a fresh solve at the sample's smaller end-of-interval gas inventory.
  const recordFeed=duration=>{
   if(!(flow>1e-8)||!(duration>0))return;
   minimumManifoldPressure=Math.min(minimumManifoldPressure,hydraulic.manifoldPressure);
   maximumFeedDeficit=Math.max(maximumFeedDeficit,feedDiagnostics.feedResidual);
   if(hydraulic.feedBinding){feedBindingOccurred=true;feedBindingTime+=duration;
    minimumBindingManifoldPressure=Math.min(minimumBindingManifoldPressure,hydraulic.manifoldPressure);}
  };
  if(flow>1e-8)minimumFeedTemperature=Math.min(minimumFeedTemperature,tank.feedTemperature);
  maxFlow=Math.max(maxFlow,flow);maxNozzleUse=Math.max(maxNozzleUse,...forces.map((f,i)=>caps[i]>0?f/caps[i]:0));
  const {force:bf,torque:bt}=nozzleWrench(forces,p),world=rotate(s.q,bf),aero=aerodynamicForce(s,p),bodyAero=rotate(qconj(s.q),aero);
  // Drag acts at the assumed geometric center; an offset CG therefore creates a moment.
  const aeroTorque=cross(center.map(x=>-x),bodyAero);
  const specific=world.map((x,i)=>(x+aero[i])/m),a=[specific[0],specific[1],specific[2]-G];
  const angularAcceleration=w=>{const gyro=cross(w,w.map((v,i)=>I[i]*v));return bt.map((v,i)=>(v+aeroTorque[i]-gyro[i])/I[i]);};
  const initialDw=angularAcceleration(s.w),wmid=s.w.map((v,i)=>v+initialDw[i]*dt/2),dw=angularAcceleration(wmid);
  const seat=[-.2,.45,.1].map((x,i)=>x-center[i]);
  const rotationalSeat=cross(dw,seat).map((x,i)=>x+cross(s.w,cross(s.w,seat))[i]);
  const seatSpecific=rotate(qconj(s.q),specific).map((x,i)=>x+rotationalSeat[i]);
  const seatLoad=norm(seatSpecific)/G;peakSeatLoad=Math.max(peakSeatLoad,seatLoad);
  const dq=qmul(s.q,[0,...wmid]);
  const nq=qnormalize(s.q.map((v,i)=>v+dq[i]*dt/2));
  const ns={t:s.t+dt,x:s.x+s.vx*dt+a[0]*dt*dt/2,lateral:s.lateral+s.vLateral*dt+a[1]*dt*dt/2,y:s.y+s.vy*dt+a[2]*dt*dt/2,vx:s.vx+a[0]*dt,vLateral:s.vLateral+a[1]*dt,vy:s.vy+a[2]*dt,q:nq,w:s.w.map((v,i)=>v+dw[i]*dt),gas:Math.max(0,s.gas-flow*dt),forces,burning,seatLoad,...feedDiagnostics};
  const heatPower=flow*(tank.heatPerKg??0);maxHeatPower=Math.max(maxHeatPower,heatPower);heatRequired+=heatPower*dt;
  const recordImpulse=h=>{for(let i=0;i<3;i++)impulseBudget.world[i]+=world[i]*h;impulseBudget.upward+=Math.max(0,world[2])*h;impulseBudget.downward+=Math.max(0,-world[2])*h;
   if(!burning){const before=impulseBudget.beforeBurn;before.scalar+=sum*h;for(let i=0;i<3;i++)before.world[i]+=world[i]*h;before.upward+=Math.max(0,world[2])*h;before.downward+=Math.max(0,-world[2])*h;}};
  recordImpulse(dt);impulse+=sum*dt;peakLoad=Math.max(peakLoad,norm(world)/(m*G));
  // Near ground, bracket the first crossing even if rotation makes clearance recover by step end.
  const at=f=>{const qq=qnormalize(s.q.map((v,i)=>v+(nq[i]-v)*f));return {q:qq,y:s.y+s.vy*dt*f+a[2]*(dt*f)**2/2};};
  let contactBracket=null;
  const rotationBound=(norm(s.w)+norm(dw)*dt)*Math.hypot(SHAPE.length/2+Math.abs(p.cgX),SHAPE.width/2+Math.abs(p.cgY),SHAPE.height/2+Math.abs(p.cgZ));
  if(gap<=dt*(Math.abs(s.vy)+Math.abs(a[2])*dt+rotationBound)+1e-6){
   for(let j=1;j<=16;j++){const f=j/16,c=at(f);if(c.y<=support(c.q,p)){contactBracket=[(j-1)/16,f];break;}}
  }
  if(contactBracket){
   // Root solve CG trajectory and rotating support, rather than linearly approximating clearance.
   let [lo,hi]=contactBracket;for(let j=0;j<30;j++){const f=(lo+hi)/2,c=at(f);if(c.y>support(c.q,p))lo=f;else hi=f;}
   const f=(lo+hi)/2,h=dt*f;ns.t=s.t+h;
   for(const [pos,vel,index] of [['x','vx',0],['lateral','vLateral',1],['y','vy',2]]){ns[pos]=s[pos]+s[vel]*h+a[index]*h*h/2;ns[vel]=s[vel]+a[index]*h;}
   ns.gas=s.gas-flow*h;ns.q=at(f).q;ns.w=s.w.map((v,i)=>v+dw[i]*h);ns.y=support(ns.q,p);
   recordImpulse(-dt*(1-f));impulse-=sum*dt*(1-f);heatRequired-=heatPower*dt*(1-f);recordFeed(h);s=ns;landed=true;samples.push(snapshot(s,p));break;
  }
  recordFeed(dt);s=ns;if(s.t>=nextSample){samples.push(snapshot(s,p));nextSample=s.t+1/60;}
 }
 const lastGas=gasState(p,s.gas);minimumTemperature=Math.min(minimumTemperature,lastGas.temperature);phaseLimited ||=lastGas.phaseLimited;eosInvalidState ||=!!lastGas.invalidState;
 const hasGasFlow=maxFlow>1e-8;
 if(!hasGasFlow)minimumFeedTemperature=hw.initial.temperature;
 else if(s.forces.some(x=>x>1e-8))minimumFeedTemperature=Math.min(minimumFeedTemperature,lastGas.feedTemperature);
 if(!landed&&samples.at(-1).t<s.t)samples.push(snapshot(s,p));
 const final=snapshot(s,p),contact=contactState(s,p);final.contactPoint=contact.point;final.contactVelocity=contact.velocity;
 const pitchError=deg(final.tilt),angularSpeed=deg(norm(s.w)),verticalSpeed=Math.max(0,-s.vy),contactVerticalSpeed=contact.verticalSpeed,lateralSpeed=contact.lateralSpeed;
 const longitudinalSpeed=contact.longitudinalSpeed,longitudinalFits=Math.abs(longitudinalSpeed)<=p.longitudinalSpeedLimit;
 const stable=pitchError<=8&&angularSpeed<=12,soft=landed&&stable&&contactVerticalSpeed<=p.contactSpeedLimit&&lateralSpeed<=p.sideSpeedLimit&&longitudinalFits;
 const hardwareIssues=[];
 if(!hw.packageFits)hardwareIssues.push('Components exceed the assumed packaging bays');
 if(!hw.pressureFits&&!hw.initial.invalidState)hardwareIssues.push('Tank pressure exceeds the selected rating');
 if(!hw.massFits)hardwareIssues.push('Specified mass is below the component mass budget');
 if(!drivenRamp&&hw.minimumNormal<0)hardwareIssues.push('Normal-force budget cannot maintain contact with the ramp');
 if(!drivenRamp&&hw.rampPowerFits===false)hardwareIssues.push('Fan and ramp traction demand exceed selected battery power');
 if(!hw.sealGeometryFits)hardwareIssues.push('Seal area, length and perimeter cannot fit the assumed floor geometry');
 if(!hw.sealFits)hardwareIssues.push('Skirt travel is too short for the assumed ramp curvature');
 if(!drivenRamp&&hw.gripMargin<1)hardwareIssues.push('Driven-wheel grip is insufficient on part of the ramp');
 if(phaseLimited)hardwareIssues.push('Gas reaches an unresolved low-temperature phase region');
 if(eosInvalidState)hardwareIssues.push('Gas state leaves the validated equation-of-state domain');
 const thermalLimit=(p.minimumGasTemperature??-80)+273.15,thermalFits=!eosInvalidState&&Math.min(minimumTemperature,minimumFeedTemperature)>=thermalLimit;
 if(!thermalFits&&!eosInvalidState)hardwareIssues.push('Gas temperature falls below the selected component temperature screen');
 const heatFits=maxHeatPower<=(p.heatTransferPower??0)*1000+1e-6;
 if(!heatFits)hardwareIssues.push('Isothermal gas assumption requires more heat transfer than the selected capacity');
 let reason=soft?'Soft contact within the selected speed/attitude screens.':!landed?'No touchdown within the simulation window.':!stable?'Roll/pitch or angular rate remains outside the landing envelope.':contactVerticalSpeed>p.contactSpeedLimit?'Contact-point descent is not arrested before ground contact.':lateralSpeed>p.sideSpeedLimit?'Sideways contact speed exceeds the selected tyre screen.':(longitudinalSpeed<0?'Backward':'Forward')+' contact speed exceeds the selected longitudinal screen.';
 if(hardwareIssues.length)reason+=' '+hardwareIssues[0]+'.';events.push({t:s.t,label:landed?'Ground contact':'Simulation time limit'});
 const finalMass=p.mass-p.gas+s.gas,Ifinal=inertia(finalMass,p),rotationalEnergy=.5*s.w.reduce((sum,x,i)=>sum+Ifinal[i]*x*x,0);
 return {p,hardware:hw,samples,events,final,landed,soft,stable,hardwareIssues,candidate:soft&&hardwareIssues.length===0,reason,peakLoad,peakSeatLoad,impulse,burnStart,gasUsed:p.gas-s.gas,pitchError,angularSpeed,verticalSpeed,contactVerticalSpeed,lateralSpeed,longitudinalSpeed,longitudinalFits,contactVelocity:[...contact.velocity],contact,landingEnergy:.5*finalMass*s.vy**2,rotationalEnergy,totalKineticEnergy:.5*finalMass*(s.vx*s.vx+s.vLateral*s.vLateral+s.vy*s.vy)+rotationalEnergy,minimumTemperature,minimumFeedTemperature,maxFlow,maxNozzleUse,phaseLimited,eosInvalidState,thermalFits,heatFits,maxHeatPower,heatRequired,initialAngularRate,hasGasFlow,rampScreenMode,continuedInitialRotation,continuationActivations,targetHeading:deg(targetHeading),impulseBudget,feedBindingTime,feedBindingOccurred,minimumManifoldPressure:Number.isFinite(minimumManifoldPressure)?minimumManifoldPressure:null,minimumBindingManifoldPressure:Number.isFinite(minimumBindingManifoldPressure)?minimumBindingManifoldPressure:null,maximumFeedDeficit};
}
