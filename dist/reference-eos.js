/** Nitrogen HEOS lookup, generated with pinned CoolProp. No runtime property server.
 * Bilinear in (s, log rho) and (h, log p); never extrapolates. Any contributing
 * two-phase/liquid/invalid vertex rejects the cell rather than bridging saturation.
 */
import tables from './reference-eos-tables.json' with {type:'json'};

export const referenceEOSMetadata=Object.freeze(tables.metadata);
const R=tables.metadata.gasConstant;
function bracket(axis,x){
 if(!Number.isFinite(x)||x<axis[0]||x>axis.at(-1))return null;
 let lo=0,hi=axis.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(axis[mid]<=x)lo=mid;else hi=mid;}
 return [lo,(x-axis[lo])/(axis[lo+1]-axis[lo])];
}
function invalid(reason){return {temperature:NaN,pressure:NaN,enthalpy:NaN,entropy:NaN,Z:NaN,heatPerKg:NaN,phaseLimited:false,invalidState:true,reason};}
function interpolate(grid,x,y,{inspectPhase=true}={}){
 const bx=bracket(grid.x,x),by=bracket(grid.y,y);
 if(!bx||!by)return invalid('State outside the shipped reference-table domain.');
 const [i,u]=bx,[j,v]=by,n=grid.y.length;
 const ids=[i*n+j,(i+1)*n+j,i*n+j+1,(i+1)*n+j+1];
 const weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
 const used=ids.filter((_,k)=>weights[k]>1e-14);
 if(used.some(k=>grid.phase[k]===2))return invalid('Reference table contains an invalid or out-of-range vertex at this state.');
 const out={phaseLimited:inspectPhase&&used.some(k=>grid.phase[k]!==0),invalidState:false};
 for(const [key,values] of Object.entries(grid.fields))out[key]=ids.reduce((sum,k,a)=>sum+(weights[a]>1e-14?weights[a]*values[k]:0),0);
 if(out.phaseLimited)out.reason='Reference cell touches saturation or liquid: single-phase gas thrust is stopped.';
 return out;
}
/** Entropy J/(kg K), density kg/m³. */
export function referenceAtSRho(entropy,density){
 if(!(density>0))return invalid('Density must be finite and positive.');
 const out=interpolate(tables.srho,entropy,Math.log(density));
 return {...out,entropy,density,Z:out.pressure/(density*R*out.temperature)};
}
/** Initial state and isothermal path. Invert the same bilinear T(s,log rho)
 * surface in s, so initial T is exact and blowdown never changes entropy grids.
 * The entropy scan runs while constructing cached gas curves: once at the fill
 * state, and at each isothermal curve row. It is not a flight-timestep scan.
 */
export function referenceAtTRho(temperature,density){
 if(!Number.isFinite(temperature)||!(temperature>0)||!(density>0)||!Number.isFinite(density))return invalid('Temperature and density must be finite and positive.');
 const y=Math.log(density),grid=tables.srho;
 if(!bracket(grid.y,y))return invalid('Density outside the shipped reference-table domain.');
 let previous=null;
 for(const s of grid.x){
  const state=interpolate(grid,s,y,{inspectPhase:false});
  if(!state.invalidState&&Number.isFinite(state.temperature)){
   if(previous&&previous.temperature<=temperature&&state.temperature>=temperature){
    const entropy=previous.s+(s-previous.s)*(temperature-previous.temperature)/(state.temperature-previous.temperature);
    const result=referenceAtSRho(entropy,density);
    return {...result,temperature};
   }
   if(state.temperature===temperature)return referenceAtSRho(s,density);
   previous={s,temperature:state.temperature};
  }else previous=null;
 }
 return invalid('Temperature/density state outside the shipped entropy-table domain.');
}
/** Enthalpy J/kg, absolute pressure Pa. */
export function referenceAtHP(enthalpy,pressure){
 if(!(pressure>0))return invalid('Pressure must be finite and positive.');
 return {...interpolate(tables.hp,enthalpy,Math.log(pressure)),enthalpy,pressure};
}
