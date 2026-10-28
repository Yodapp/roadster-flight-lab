import {DEFAULTS} from './physics.js?v=4.4';
import {runSensitivity} from './sensitivity.js?v=4.4';
import {buildEnvelopeMap} from './envelope-map.js?v=4.4';
onmessage=event=>{
 const {id,kind,params}=event.data,p={...DEFAULTS,...params};
 if(kind==='audit'){
  const rows=runSensitivity(p,(progress,total)=>postMessage({id,progress,total}));
  postMessage({id,rows});return;
 }
 postMessage({id,...buildEnvelopeMap(p,(progress,total)=>postMessage({id,progress,total}))});
};
