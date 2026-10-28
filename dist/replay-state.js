import {euler,rotate,qnormalize,support,nozzleWrench} from './flight3d.js?v=4.4';

/** Presentation interpolation only. The solver and exported integration samples stay untouched. */
export function replaySample(result,t){
 const ss=result.samples;
 let lo=0,hi=ss.length-1;
 // Rightmost sample at release selects flight, after the equal-time ramp endpoint.
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(ss[mid].t<=t)lo=mid;else hi=mid-1;}
 const a=ss[lo],b=ss[Math.min(lo+1,ss.length-1)],f=b.t>a.t?Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t))):0;
 const s={...a},sign=a.q.reduce((v,x,i)=>v+x*b.q[i],0)<0?-1:1;
 s.q=qnormalize(a.q.map((v,i)=>v+(sign*b.q[i]-v)*f));
 s.forces=a.forces.map((v,i)=>v+(b.forces[i]-v)*f);
 s.w=a.w.map((v,i)=>v+(b.w[i]-v)*f);
 for(const key of ['t','x','y','vx','vy','gas','lateral','vLateral','drivingForce','fanSuction','normalForce','fanElectricalPower','driveElectricalPower','batteryPower','seatLoad']){
  if(Number.isFinite(a[key])&&Number.isFinite(b[key]))s[key]=a[key]+(b[key]-a[key])*f;
 }
 const ea=euler(s.q);Object.assign(s,ea);
 s.theta=ea.pitch;s.omega=Math.hypot(...s.w);
 s.thrust=s.forces.reduce((sum,v)=>sum+v,0);
 s.front=s.forces[2]+s.forces[3];s.rear=s.forces[0]+s.forces[1];
 s.netThrust=Math.hypot(...nozzleWrench(s.forces,result.p).force);
 s.load=s.netThrust/((result.p.mass-result.p.gas+s.gas)*9.80665);
 s.tilt=Math.acos(Math.max(-1,Math.min(1,rotate(s.q,[0,0,1])[2])));
 s.clearance=Math.max(0,s.y-support(s.q,result.p));
 // Phase, feed flags and hydraulic pressures retain the recorded sample value.
 // Inactive manifold pressure remains null, never an interpolated zero pressure.
 return s;
}

/** Live indicators stop at contact. Recorded contact/impulse data stay pre-impact. */
export function replayDisplaySample(result,t){
 const s=replaySample(result,t);
 if(!result.landed||t<result.final.t-1e-6)return s;
 return {...s,replayComplete:true,forces:s.forces.map(()=>0),thrust:0,netThrust:0,
  front:0,rear:0,load:0,burning:false,manifoldPressure:null,feedBinding:false,
  feedDemand:0,feedCapacity:0,feedResidual:0};
}
