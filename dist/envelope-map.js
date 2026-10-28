import {simulate} from './physics.js?v=4.4';
import {hardware} from './hardware.js?v=4.4';
// Separate trajectory quality from hardware viability. Null means not simulated.
export function classifyEnvelope(result){
 const hardwarePass=result.hardwareIssues.length===0&&(!result.ramp||result.ramp.released);
 return (result.soft?2:0)+(hardwarePass?1:0);
}
export function buildEnvelopeMap(p,progress=()=>{},axes={}){
 const masses=axes.masses??Array.from({length:11},(_,i)=>1000+i*250);
 const forces=axes.forces??Array.from({length:11},(_,i)=>20+i*10);
 const minimumMass=hardware(p).minimumWetMass;
 const stats={tested:0,excluded:0,landing:0,hardware:0,both:0};
 const cells=forces.map((thrust,j)=>{
  const row=masses.map(mass=>{
   if(mass<minimumMass){stats.excluded++;return null;}
   const code=classifyEnvelope(simulate({...p,mass,thrust}));
   stats.tested++;if(code&2)stats.landing++;if(code&1)stats.hardware++;if(code===3)stats.both++;
   return code;
  });progress((j+1)*masses.length,forces.length*masses.length);return row;
 });return {masses,forces,cells,stats,minimumMass};
}
