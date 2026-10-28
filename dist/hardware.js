import {referenceAtTRho,referenceAtSRho,referenceAtHP} from './reference-eos.js?v=4.4';
/** Engineering screening, not a certified component or CAD model. SI internally. */
export const HW_DEFAULTS=Object.freeze({tankVolume:600,tankRating:700,tankIndex:120,tankDiameter:0.64,fanGap:2,fanPower:80,sealedArea:4,sealPerimeter:10,fanEfficiency:0.55,fanDiameter:0.27,fanRPM:18000,sealedLength:2.8,rideHeight:30,skirtTravel:150,tyreGrip:1.2,drivenLoad:.55,throat:45,feedDiameter:85,regulatorBar:100,deliveryLossPercent:8,valveLag:15,batteryEnergy:115,packDensity:200,packVolumeDensity:300,baseStructure:875,realGas:true,gasModel:'reference',feedModel:'consistent',enforceHardware:true,roll:15,yaw:10,ambientTemperature:20,ambientPressure:101.325,minimumGasTemperature:-80,heatTransferPower:0,installationClearance:0,ancillariesMass:70,batteryPower:500});
export const AIR={R:287.05,gamma:1.4,cp:1004.675,T:293.15,p:101325};
export const N2={R:296.803,M:0.02801348,Ru:8.314462618,Tc:126.192,Pc:3395800,omega:0.0372,cv:20.786};
/** Ambient pressure is absolute kPa; temperature is degrees Celsius. */
export function atmosphere(p={}) {
  const T=(p.ambientTemperature??20)+273.15, pressure=(p.ambientPressure??101.325)*1000;
  return {T,p:pressure,rho:pressure/(AIR.R*T)};
}
/** Regulator setting is absolute bar. Loss derates downstream delivery pressure;
 * it is independent of the aggregate feed-capacity bound, not its driving head. */
export function regulatorSettings(p={}) {
  const regulatorBar=p.regulatorBar??100,deliveryLossPercent=p.deliveryLossPercent??8,ambient=atmosphere(p);
  if(!Number.isFinite(ambient.p)||ambient.p<=0||!Number.isFinite(regulatorBar)||regulatorBar*1e5<=ambient.p||!Number.isFinite(deliveryLossPercent)||deliveryLossPercent<0||deliveryLossPercent>=100)
    throw new RangeError('Regulator pressure must exceed ambient; delivery loss must be finite and between 0% and 100% (exclusive).');
  return {regulatorBar,deliveryLossPercent,setpointPressure:regulatorBar*1e5,deliveryFraction:1-deliveryLossPercent/100};
}
/** Hydraulic feed comparison; the optimistic mode preserves the v4.2 upper bound. */
/** Grok fork: 'air' selects CoolProp reference air tables (reported Tesla gas); 'reference' keeps the original nitrogen tables. */
export const AIR_REFERENCE_R=287.0491267875601;
export function referenceFluid(p={}){return p.gasModel==='air'?'air':'nitrogen';}
export function gasConstant(p={}){return p.realGas?(p.gasModel==='air'?AIR_REFERENCE_R:N2.R):AIR.R;}
export function validateFeedModel(p={}) {
 const mode=p.feedModel===undefined?'consistent':p.feedModel;
 if(!['consistent','optimistic'].includes(mode))throw new RangeError('Feed model must be consistent or optimistic');
 return mode;
}
const kappa=.37464+1.54226*N2.omega-.26992*N2.omega**2;
const a0=.45724*N2.Ru**2*N2.Tc**2/N2.Pc,b=.07780*N2.Ru*N2.Tc/N2.Pc,rt2=Math.SQRT2;
export const bound=(v,a,z)=>Math.max(a,Math.min(z,v));
function attraction(T){const A=1+kappa;return {a:a0*(A-kappa*Math.sqrt(T/N2.Tc))**2,da:a0*(-A*kappa/Math.sqrt(N2.Tc*T)+kappa*kappa/N2.Tc),d2a:a0*A*kappa/(2*Math.sqrt(N2.Tc)*T**1.5)};}
export function nitrogenPR(T,rho){const v=N2.M/Math.max(rho,1e-9),{a,da,d2a}=attraction(T);if(v<=b)return {pressure:Infinity,Z:Infinity,entropy:NaN,enthalpy:NaN,cv:NaN};const log=Math.log((v+(1+rt2)*b)/(v+(1-rt2)*b));const pressure=N2.Ru*T/(v-b)-a/(v*v+2*b*v-b*b);const entropy=N2.cv*Math.log(T)+N2.Ru*Math.log(v-b)+da*log/(2*rt2*b);const u=N2.cv*T+(T*da-a)*log/(2*rt2*b);return {pressure,Z:pressure*v/(N2.Ru*T),entropy,enthalpy:(u+pressure*v)/N2.M,cv:(N2.cv+T*d2a*log/(2*rt2*b))/N2.M};}
function densityAtPT(P,T){let lo=b*1.00001,hi=Math.max(N2.Ru*T/P*5,b*20);for(let i=0;i<30;i++){const v=(lo+hi)/2;if(nitrogenPR(T,N2.M/v).pressure>P)lo=v;else hi=v;}return N2.M/((lo+hi)/2);}
function regulatedTemperature(T,rho,pressure,feedPressure){if(pressure<=feedPressure*1.001)return T;const enthalpy=nitrogenPR(T,rho).enthalpy;let lo=126.3,hi=Math.max(T+120,350);for(let i=0;i<24;i++){const t=(lo+hi)/2,h=nitrogenPR(t,densityAtPT(feedPressure,t)).enthalpy;if(h>enthalpy)hi=t;else lo=t;}return (lo+hi)/2;}
const curves=new Map();
function curve(p){
  const vol=(p.tankVolume??600)/1000, ambient=atmosphere(p),regulator=regulatorSettings(p);
  const reference=p.realGas&&p.gasModel!=='pr',fluid=referenceFluid(p);
  if(p.realGas&&!['reference','pr','air'].includes(p.gasModel??'reference'))throw new RangeError('Gas model must be reference (nitrogen), air or pr.');
  const key=[p.gas,vol,!!p.realGas,p.gasModel??'reference',!!p.blowdown,ambient.T,ambient.p,regulator.regulatorBar,regulator.deliveryLossPercent].join('/');
  if(curves.has(key))return curves.get(key);
  const start=reference?referenceAtTRho(ambient.T,p.gas/vol,fluid):p.realGas?nitrogenPR(ambient.T,p.gas/vol):null,rows=[];
  for(let i=0;i<=256;i++){
    const f=.01+.99*i/256,gas=p.gas*f,rho=gas/vol;
    let T=ambient.T*(p.blowdown?f**.4:1);
    if(p.realGas&&!reference&&p.blowdown){
      for(let j=0;j<8;j++){
        const state=nitrogenPR(Math.max(64,T),rho),error=state.entropy-start.entropy;
        T=bound(T-error/(state.cv*N2.M/Math.max(64,T)),64,600);
      }
    }
    const state=reference?(start.invalidState?start:p.blowdown?referenceAtSRho(start.entropy,rho,fluid):referenceAtTRho(ambient.T,rho,fluid)):p.realGas?nitrogenPR(T,rho):{pressure:rho*AIR.R*T,Z:1};
    if(reference)T=state.temperature;
    const pressure=Math.max(0,state.pressure),feedPressure=Math.max(ambient.p,Math.min(regulator.setpointPressure,pressure)*regulator.deliveryFraction);
    const outlet=reference&&!state.invalidState&&!state.phaseLimited?referenceAtHP(state.enthalpy,feedPressure,fluid):null;
    const invalidState=!!state.invalidState||!!outlet?.invalidState;
    const feedT=reference?(outlet?.temperature??T):p.realGas?regulatedTemperature(T,rho,pressure,feedPressure):T;
    // A rigid tank held isothermal needs Qdot = mdot * (T/rho) (dp/dT)_rho.
    // Reference tables carry the HEOS derivative; PR remains an explicit comparison.
    const v=N2.M/rho, {da}=attraction(Number.isFinite(T)?T:ambient.T);
    const heatPerKg=p.blowdown?0:reference?state.heatPerKg:p.realGas?T/rho*(N2.Ru/(v-b)-da/(v*v+2*b*v-b*b)):AIR.R*T;
    // Invalid cells are never extrapolated or silently replaced with PR. Finite
    // display placeholders cannot pass: invalidState cuts supply and flags flight.
    rows.push({gas,temperature:Number.isFinite(T)?T:ambient.T,pressure:invalidState?0:pressure,Z:invalidState?1:state.Z,
      feedTemperature:Number.isFinite(feedT)?feedT:ambient.T,feedPressure:invalidState?ambient.p:feedPressure,
      heatPerKg:Number.isFinite(heatPerKg)?heatPerKg:0,invalidState,
      phaseLimited:reference?(!!state.phaseLimited||!!outlet?.phaseLimited):p.realGas&&(T<N2.Tc+1||feedT<N2.Tc+1)});
  }
  if(curves.size>8)curves.delete(curves.keys().next().value);
  curves.set(key,rows);return rows;
}
export function gasState(p,gas){
  const ambient=atmosphere(p),regulator=regulatorSettings(p),diagnostics={regulatorSetpointPressure:regulator.setpointPressure,deliveryLossPercent:regulator.deliveryLossPercent};
  if(p.realGas && p.gasModel==='pr' && p.gas/((p.tankVolume??600)/1000)>=N2.M/b){
    // The PR covolume is an EOS domain boundary, not a usable tank density.
    return {temperature:ambient.T,pressure:Infinity,Z:Infinity,feedTemperature:ambient.T,
      feedPressure:ambient.p,phaseLimited:false,invalidState:true,initialPressure:Infinity,
      R:gasConstant(p),exhaust:0,capacity:0,heatPerKg:0,...diagnostics,belowRegulatorSetpoint:false};
  }
  if(!(p.gas>0)||!(gas>0))return {temperature:ambient.T,pressure:0,Z:1,feedTemperature:ambient.T,
    feedPressure:ambient.p,phaseLimited:false,initialPressure:0,R:gasConstant(p),exhaust:0,capacity:0,heatPerKg:0,...diagnostics,belowRegulatorSetpoint:true};
  const rows=curve(p),f=bound((gas/p.gas-.01)/.99*256,0,256),i=Math.min(255,Math.floor(f)),a=rows[i],z=rows[i+1],q=f-i,state={};
  for(const k of ['temperature','pressure','Z','feedTemperature','feedPressure','heatPerKg'])state[k]=a[k]+(z[k]-a[k])*q;
  state.phaseLimited=(q<1-1e-12&&a.phaseLimited)||(q>1e-12&&z.phaseLimited);
  state.invalidState=rows[256].invalidState||(q<1-1e-12&&a.invalidState)||(q>1e-12&&z.invalidState);
  state.initialPressure=rows[256].invalidState?Infinity:rows[256].pressure;state.R=gasConstant(p);
  state.exhaust=Math.min(p.exhaust*Math.sqrt(state.feedTemperature/AIR.T),.95*Math.sqrt(Math.max(0,2*(state.R*3.5)*state.feedTemperature*(1-(ambient.p/Math.max(ambient.p,state.feedPressure))**(2/7)))));
  if(gas<=p.gas*.01||state.phaseLimited||state.invalidState||state.pressure<=ambient.p){state.exhaust=0;state.feedPressure=ambient.p;}
  // Legacy 2D benchmark scaling only; 3D uses explicit throat and feed restrictions.
  state.capacity=bound((state.pressure-ambient.p)/(regulator.setpointPressure-ambient.p),0,1);
  Object.assign(state,diagnostics,{belowRegulatorSetpoint:state.pressure<regulator.setpointPressure});
  return state;
}
/** Mass flux of ideal compressible gas through an effective orifice, kg/(m² s). */
export function orificeFlux(upstream,downstream,T,R=AIR.R,gamma=1.4){if(upstream<=downstream||T<=0)return 0;const ratio=Math.max(downstream/upstream,(2/(gamma+1))**(gamma/(gamma-1)));return upstream/Math.sqrt(R*T)*Math.sqrt(2*gamma/(gamma-1)*(ratio**(2/gamma)-ratio**((gamma+1)/gamma)));}
export function fanAtPressure(delta,p){
  const ambient=atmosphere(p),drop=bound(delta,0,ambient.p*.90),low=ambient.p-drop;
  const leakArea=(p.sealPerimeter??10)*(p.fanGap??2)/1000+0.0004;
  const mdot=.65*leakArea*orificeFlux(ambient.p,low,ambient.T),inletQ=mdot*AIR.R*ambient.T/low;
  const idealPower=mdot*AIR.cp*ambient.T*((ambient.p/low)**(2/7)-1);
  return {delta:drop,leakArea,mdot,ambientQ:mdot/ambient.rho,inletQ,power:idealPower/(p.fanEfficiency??.55)/.94};
}
export function fanSystem(p){
  const ambient=atmosphere(p),target=p.mass*9.80665*p.suction/(p.sealedArea??4),wanted=fanAtPressure(target,p);
  const area=4*Math.PI*(p.fanDiameter??.27)**2/4,tip=Math.PI*(p.fanDiameter??.27)*(p.fanRPM??18000)/60;
  const headLimit=.5*ambient.rho*tip*tip;
  let lo=0,hi=Math.min(ambient.p*.9,headLimit);
  for(let i=0;i<40;i++){
    const mid=(lo+hi)/2,r=fanAtPressure(mid,p);
    if(r.power>(p.fanPower??80)*1000||r.inletQ/area>45)hi=mid;else lo=mid;
  }
  const max=fanAtPressure(lo,p),selected=fanAtPressure(Math.min(target,lo),p),actualSuction=selected.delta*(p.sealedArea??4);
  return {...selected,target,wanted,maxDelta:lo,maxSuction:lo*(p.sealedArea??4),actualSuction,
    canReachTarget:target<=lo*1.001,canHold:actualSuction>p.mass*9.80665,
    canEverHold:lo*(p.sealedArea??4)>p.mass*9.80665,fanArea:area,faceSpeed:wanted.inletQ/area,tipSpeed:tip,headLimit,
    targetOutsideModel:target>ambient.p*.9};
}
export function capsule(volume,diameter,ratingBar,allowable=800e6){const r=diameter/2,cylinder=Math.max(0,(volume-4*Math.PI*r**3/3)/(Math.PI*r*r));const length=cylinder+2*r;const pressure=ratingBar*1e5;const thickness=pressure*r/allowable;const liner=.003;const outerDiameter=diameter+2*(thickness+liner);const outerLength=length+2*(thickness+liner)+.20;const envelope=outerLength*outerDiameter**2;return {volume,diameter,length,outerDiameter,outerLength,thickness,envelope,shapeValid:volume>=4*Math.PI*r**3/3};}
/** Necessary geometric bounds: a real seal shape still needs a drawing. */
export function sealGeometry(p){
 const area=p.sealedArea??4,length=p.sealedLength??2.8,perimeter=p.sealPerimeter??10,width=1.95;
 const boundingArea=length*width,perimeterArea=perimeter*perimeter/(4*Math.PI);
 const valid=Number.isFinite(area)&&Number.isFinite(length)&&Number.isFinite(perimeter)&&area>0&&length>0&&length<=4.6&&perimeter>0;
 return {fits:valid&&area<=boundingArea+1e-9&&area<=perimeterArea+1e-9,boundingArea,perimeterArea,width,area,length,perimeter};
}
export function hardware(p){
  validateFeedModel(p);
  const seal=sealGeometry(p);
  const vol=(p.tankVolume??600)/1000,rating=p.tankRating??700;
  const large=capsule(vol*2/3,p.tankDiameter??.64,rating,800e6*(p.tankIndex??120)/120);
  const small=capsule(vol/3,(p.tankDiameter??.64)*.8125,rating,800e6*(p.tankIndex??120)/120);
  const tankMass=rating*1e5*vol/((p.tankIndex??120)*1000); // Assumed PV / empty-mass index, not supplier qualification.
  const batteryMass=(p.batteryEnergy??115)*1000/(p.packDensity??200);
  const batteryVolume=(p.batteryEnergy??115)*1000/(p.packVolumeDensity??300)/1000;
  const structure=p.baseStructure??875,fanMass=(p.fanPower??80)/2,ancillaries=p.ancillariesMass??70;
  const minimumWetMass=structure+batteryMass+tankMass+fanMass+ancillaries+p.gas;
  const frontBay={length:1.75,width:.82,height:.80},rearBay={length:1.45,width:1.10,height:.65};
  const installationClearance=Math.max(0,p.installationClearance??0)/1000;
  // Additional free space on every side; end fittings are already in capsule.outerLength.
  const fits=(tank,bay)=>tank.shapeValid&&tank.outerLength+2*installationClearance<=bay.length&&tank.outerDiameter+2*installationClearance<=Math.min(bay.width,bay.height);
  const packFits=batteryVolume<=2.3*1.5*.16,tankFits=fits(large,frontBay)&&fits(small,rearBay),driverSeats=1;
  const angle=bound(p.pitch??170,0,180)*Math.PI/180,roll=(p.roll??15)*Math.PI/180;
  // Input height is the lowest point of the body, not the ramp surface. Approximate
  // the wheel contact plane at body z=-0.6 m (4.6 x 1.95 x 1.2 m box).
  const releaseSupport=Math.abs(Math.sin(angle))*2.3+Math.abs(Math.cos(angle)*Math.sin(roll))*.975+Math.abs(Math.cos(angle)*Math.cos(roll))*.6;
  const releaseSurfaceHeight=(p.height??20)+releaseSupport-.6*Math.cos(angle)*Math.cos(roll);
  const rampRadius=angle>1e-6?releaseSurfaceHeight/(1-Math.cos(angle)):Infinity;
  const rampCGRadius=Number.isFinite(rampRadius)?Math.max(.1,rampRadius-.6):Infinity;
  const sealedLength=p.sealedLength??2.8;
  const curvatureSag=Number.isFinite(rampRadius)&&rampRadius>sealedLength/2?rampRadius-Math.sqrt(rampRadius*rampRadius-(sealedLength/2)**2):Number.isFinite(rampRadius)?Infinity:0;
  const requiredSkirtTravel=(p.rideHeight??30)/1000+curvatureSag,sealFits=requiredSkirtTravel<=(p.skirtTravel??150)/1000;
  const fanPackFits=4*(p.fanDiameter??.27)<=1.5&&(p.fanDiameter??.27)<=.30,initial=gasState(p,p.gas);
  const pressureFits=!initial.invalidState&&initial.pressure<=rating*1e5,massFits=p.mass>=minimumWetMass-.01,requestedMass=p.mass;
  const actualMass=p.enforceHardware?Math.max(p.mass,minimumWetMass):p.mass,fan=fanSystem({...p,mass:actualMass});
  let gripMargin=Infinity,minimumNormal=Infinity;
  for(let i=0;i<=Math.max(1,Math.ceil(angle/.01));i++){
    const phi=angle*i/Math.max(1,Math.ceil(angle/.01));
    const normal=fan.actualSuction+actualMass*9.80665*Math.cos(phi)+(Number.isFinite(rampCGRadius)?actualMass*p.speed*p.speed/rampCGRadius:0);
    const demand=actualMass*9.80665*Math.abs(Math.sin(phi));
    minimumNormal=Math.min(minimumNormal,normal);
    if(demand>1e-6)gripMargin=Math.min(gripMargin,(p.tyreGrip??1.2)*(p.drivenLoad??.55)*Math.max(0,normal)/demand);
  }
  const rampGravityPower=actualMass*9.80665*Math.abs(p.speed)*Math.sin(Math.min(angle,Math.PI/2));
  const peakRampElectricalPower=fan.power+rampGravityPower/.90; // Assumed drivetrain efficiency; fixed-speed climb.
  const rampPowerFits=peakRampElectricalPower<=(p.batteryPower??500)*1000;
  return {seal,sealGeometryFits:seal.fits,peakRampElectricalPower,rampPowerFits,rampRadius,rampCGRadius,releaseSurfaceHeight,releaseSupport,curvatureSag,requiredSkirtTravel,sealFits,gripMargin,minimumNormal,rampGravityPower,
    vol,large,small,tankMass,batteryMass,batteryVolume,structure,fanMass,ancillaries,minimumWetMass,frontBay,rearBay,installationClearance,
    packFits,tankFits,fanPackFits,pressureFits,massFits,driverSeats,initial,fan,actualMass,requestedMass,packageFits:tankFits&&packFits&&fanPackFits,
    installationVerified:false};
}
/** Nozzle-only force ceilings at a specified inlet pressure. The temperature and
 * effective exhaust are deliberately held at state.feedTemperature/state.exhaust.
 * The consistent hydraulic solve shares this exact law with the allocator ceiling.
 */
export function nozzleCapsAtPressure(p,state,pressure){
 const ambient=atmosphere(p),R=state.R;
 const usable=!state.invalidState&&!state.phaseLimited&&state.exhaust>0&&state.pressure>ambient.p;
 const flux=usable?.90*orificeFlux(pressure,ambient.p,state.feedTemperature,R):0;
 const downArea=Math.PI*((p.throat??45)/1000)**2/4;
 const rearArea=Math.PI*(.052)**2/4,sideArea=Math.PI*(.025)**2/4;
 const downCap=usable?Math.min(p.thrust*1000/4,flux*downArea*state.exhaust):0;
 const rearCap=usable?Math.min(20000,flux*rearArea*state.exhaust):0;
 const sideCap=usable?Math.min(6000,flux*sideArea*state.exhaust):0;
 return {caps:[downCap,downCap,downCap,downCap,rearCap,rearCap,rearCap,rearCap,sideCap,sideCap],downCap,rearCap,sideCap,flux};
}
/** Feed capacity at the supplied downstream pressure, using the existing Cd/Z law.
 * A regulator may throttle below this capacity when the pressure cap is active.
 */
export function feedCapacityAtPressure(p,state,pressure){
 const ambient=atmosphere(p);
 if(state.invalidState||state.phaseLimited||!(state.exhaust>0)||state.pressure<=ambient.p)return 0;
 const feedArea=Math.PI*((p.feedDiameter??85)/1000)**2/4;
 return .8*feedArea*orificeFlux(state.pressure,pressure,state.temperature,state.R)/Math.sqrt(Math.max(.3,state.Z));
}
/** Pre-allocation capacity ceilings. Keep these unchanged for the control trigger:
 * the flight applies solveManifold AFTER commanded forces have passed valve lag.
 * feedMdot here is the tank-to-ambient upper bound, not joint attainable delivery.
 */
export function nozzleSupply(p,state){
 const ambient=atmosphere(p);
 return {...nozzleCapsAtPressure(p,state,state.feedPressure),feedMdot:feedCapacityAtPressure(p,state,ambient.p),
  feedModel:'independent-capacity-bound',feedSinkPressure:ambient.p};
}
/** One scalar hydraulic balance, matching review Appendix A.
 * Find pn <= the capped, derated delivery pressure where requested nozzle outflow
 * (after force clipping at pn) fits tank-to-pn feed capacity. If the cap already
 * supplies demand, retain it; otherwise bisect the unique limiting pressure.
 * IMPORTANT residual approximation: gas temperature and effective exhaust remain
 * at the PRE-SOLVE pressure cap; T(h,pn), nozzle expansion and manifold storage are
 * not recomputed. This is a consistent hydraulic screen, not a full thermo network.
 * feedResidual = demand - capacity, kg/s. Negative means regulator capacity spare;
 * optimistic mode leaves positive deficits visible instead of hiding them.
 */
export function solveManifold(p,state,requestedForces){
 const mode=validateFeedModel(p),ambient=atmosphere(p);
 if(!Array.isArray(requestedForces)||requestedForces.length!==10||!requestedForces.every(x=>Number.isFinite(x)&&x>=0))throw new RangeError('Manifold forces must contain ten finite nonnegative values');
 const capsAt=pressure=>nozzleCapsAtPressure(p,state,pressure).caps.map((cap,i)=>p.allThrustersOff||i===p.failedNozzle?0:cap);
 const clippedAt=pressure=>{const caps=capsAt(pressure);return requestedForces.map((force,i)=>Math.min(force,caps[i]));};
 const flowOf=forces=>state.exhaust>0?forces.reduce((a,b)=>a+b,0)/state.exhaust:0;
 const feedPressureCeiling=state.feedPressure;
 let pressure=feedPressureCeiling,forces=clippedAt(pressure),demand=flowOf(forces),feedBinding=false;
 if(!(demand>0))return {forces,manifoldPressure:null,feedPressureCeiling,feedBinding:false,feedDemand:0,feedCapacity:0,feedResidual:0,feedModel:mode};
 if(mode==='consistent'&&demand>feedCapacityAtPressure(p,state,pressure)){
  let lo=ambient.p,hi=pressure;
  for(let i=0;i<50;i++){
   const mid=(lo+hi)/2;
   if(flowOf(clippedAt(mid))>feedCapacityAtPressure(p,state,mid))hi=mid;else lo=mid;
  }
  pressure=lo;forces=clippedAt(pressure);demand=flowOf(forces);feedBinding=true;
 }
 const capacity=feedCapacityAtPressure(p,state,pressure);
 return {forces,manifoldPressure:pressure,feedPressureCeiling,feedBinding,feedDemand:demand,feedCapacity:capacity,
  feedResidual:demand-capacity,feedModel:mode};
}

/** Size each of four lift throats at the selected initial gas state; do not change inputs.
 * This holds the rating only at the design state. Falling pressure/temperature and
 * simultaneous attitude jets can still reduce delivered lift later in the run.
 */
export function sizeLiftThroat(input={}) {
  const p={...HW_DEFAULTS,gas:250,thrust:60,exhaust:550,blowdown:true,...input};
  if(!Number.isFinite(p.thrust)||p.thrust<0)throw new RangeError('Lift thrust rating must be finite and nonnegative.');
  const state=gasState(p,p.gas),supply=nozzleSupply(p,state),force=p.thrust*1000,perNozzleForce=force/4;
  const usable=!state.invalidState&&!state.phaseLimited&&state.exhaust>0&&supply.flux>0;
  const diameterMM=force===0?0:usable?1000*Math.sqrt(4*perNozzleForce/(Math.PI*supply.flux*state.exhaust)):null;
  const requiredMassFlow=force===0?0:usable?force/state.exhaust:null;
  const mode=validateFeedModel(p),feedAtTarget=mode==='consistent'?feedCapacityAtPressure(p,state,state.feedPressure):supply.feedMdot;
  const feedMassFlow=Number.isFinite(feedAtTarget)?feedAtTarget:0;
  const feedFits=requiredMassFlow!==null&&feedMassFlow>=requiredMassFlow-1e-9;
  return {diameterMM,requiredMassFlow,feedMassFlow,feedFits,canReachRatedThrust:diameterMM!==null&&feedFits,
    perNozzleForce,feedPressure:state.feedPressure,feedTemperature:state.feedTemperature,exhaust:state.exhaust,
    feedModel:mode,reason:diameterMM===null?'The selected gas state cannot supply lift thrust.':!feedFits?'Throat sizing alone cannot overcome the initial shared-feed limit.':mode==='consistent'?'Initial lift rating passes the feed-capacity check at the selected nozzle pressure, before competing attitude jets. Temperature and exhaust retain the pre-solve pressure assumption.':'Initial lift rating passes independent throat and feed capacity bounds; joint delivery pressure and flow remain unverified.'};
}

/** Gas inventory at the regulated-pressure boundary, not a full-thrust endurance promise. */
export function gasInventoryAtRegulator(input={}) {
  const p={...HW_DEFAULTS,gas:250,thrust:60,exhaust:550,blowdown:true,...input};
  if(!Number.isFinite(p.gas)||p.gas<0)throw new RangeError('Initial gas inventory must be finite and nonnegative.');
  const regulator=regulatorSettings(p),initial=gasState(p,p.gas);
  if(initial.invalidState||!Number.isFinite(initial.pressure))return {available:false,gasAtSetpoint:null,gasAboveSetpoint:null,initialAboveSetpoint:false,reason:'Initial state lies outside the selected equation of state.'};
  if(!(p.gas>0)||initial.pressure<=regulator.setpointPressure)return {available:true,gasAtSetpoint:Math.max(0,p.gas),gasAboveSetpoint:0,initialAboveSetpoint:false,reason:'Initial pressure is already at or below the regulator setpoint.'};
  // The blowdown table resolves down to 1% inventory. Do not extrapolate below it.
  let lo=.01*p.gas,hi=p.gas;
  if(gasState(p,lo).pressure>regulator.setpointPressure)return {available:false,gasAtSetpoint:null,gasAboveSetpoint:null,initialAboveSetpoint:true,reason:'Pressure boundary is below the model’s resolved inventory range.'};
  for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(gasState(p,mid).pressure>regulator.setpointPressure)hi=mid;else lo=mid;}
  const gasAtSetpoint=(lo+hi)/2;
  return {available:true,gasAtSetpoint,gasAboveSetpoint:p.gas-gasAtSetpoint,initialAboveSetpoint:true,
    reason:'Inventory above a pressure boundary only; rated lift also depends on throats, feed flow, temperature and competing jets.'};
}
