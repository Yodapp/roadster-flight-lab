import {rotate, NOZZLES, SHAPE} from './flight3d.js?v=4.4';

/* Presentation only. All positions, attitudes and nozzle forces come from the
 * simulation. The faceted sports-car skin is an illustrative mesh inside the
 * solver's 4.6 × 1.95 × 1.2 m contact envelope, not measured Roadster CAD.
 * Perspective and painter ordering run in Canvas2D so the portable app needs
 * neither a graphics library nor a remote model/texture download. */
const TAU=Math.PI*2, RAD=Math.PI/180;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,k)=>a.map(x=>x*k);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const cache=new WeakMap();
const LIGHT=unit([-.4,-.65,1]);
const rgb=(a,k=1)=>a.map(x=>Math.round(clamp(x*k,0,255)));
const color=(a,alpha=1)=>`rgba(${a.join(',')},${alpha})`;
const finite=x=>Number.isFinite(x)?x:0;
const point=s=>[finite(s.x),finite(s.lateral),finite(s.y)];
const face=(points,base,extra={})=>({points,base,...extra});

function cuboid(a,b,base,extra={}){
 const [x,y,z]=a,[X,Y,Z]=b;
 return [
  [[x,y,z],[x,Y,z],[X,Y,z],[X,y,z]],
  [[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]],
  [[x,y,z],[X,y,z],[X,y,Z],[x,y,Z]],
  [[X,y,z],[X,Y,z],[X,Y,Z],[X,y,Z]],
  [[X,Y,z],[x,Y,z],[x,Y,Z],[X,Y,Z]],
  [[x,Y,z],[x,y,z],[x,y,Z],[x,Y,Z]],
 ].map(p=>face(p,base,extra));
}

function buildCar(){
 const out=[],silver=[171,190,199],edge=[121,145,158],black=[13,23,30],glass=[34,76,93];
 // Cross-sections define a tapered nose, muscular shoulders and rear deck.
 const sections=[[-2.23,.73,-.18,.19],[-1.85,.89,-.26,.29],[-1.15,.90,-.27,.31],[.65,.87,-.26,.26],[1.6,.85,-.23,.19],[2.26,.68,-.13,.08]];
 for(let i=0;i<sections.length-1;i++){
  const [x,w,b,t]=sections[i],[X,W,B,T]=sections[i+1];
  out.push(face([[x,-w,t],[X,-W,T],[X,W,T],[x,w,t]],silver));
  for(const sign of [-1,1]){
   out.push(face([[x,sign*w,b],[X,sign*W,B],[X,sign*W,T],[x,sign*w,t]],sign<0?[133,158,170]:edge));
   out.push(face([[x,sign*w,b],[X,sign*W,B],[X,sign*(W-.12),-.34],[x,sign*(w-.12),-.34]],black));
  }
 }
 const rear=sections[0],nose=sections.at(-1);
 for(const [x,w,b,t] of [rear,nose])out.push(face([[x,-w,b],[x,w,b],[x,w,t],[x,-w,t]],edge));
 out.push(face([[-2.15,-.7,-.34],[2.15,-.58,-.34],[2.15,.58,-.34],[-2.15,.7,-.34]],[16,29,36]));
 // Sloped glazing; all roof corners remain below +0.6 m.
 const cab=[[-1.12,-.72,.31],[.9,-.67,.25],[.9,.67,.25],[-1.12,.72,.31]],roof=[[-.65,-.56,.57],[.31,-.53,.57],[.31,.53,.57],[-.65,.56,.57]];
 for(let i=0;i<4;i++)out.push(face([cab[i],cab[(i+1)%4],roof[(i+1)%4],roof[i]],glass,{glass:true}));
 out.push(face(roof,[53,87,103],{glass:true}));
 // Thin roof pillars, belt line and door creases provide legible body detail.
 for(const side of [-1,1]){
  out.push(face([[-.73,side*.575,.56],[-.63,side*.558,.574],[-1.04,side*.718,.315],[-1.13,side*.724,.315]],silver));
  out.push(face([[.26,side*.537,.575],[.33,side*.535,.575],[.95,side*.677,.255],[.86,side*.677,.255]],silver));
  out.push(face([[-1.08,side*.733,.297],[.9,side*.689,.244],[.91,side*.693,.214],[-1.08,side*.736,.267]],[205,223,229]));
  out.push(face([[-.65,side*.901,.11],[-.25,side*.899,.11],[-.25,side*.9,.14],[-.65,side*.902,.14]],[36,55,65]));
 }
 // Head/tail light strips are luminous material, not extra physical forces.
 for(const side of [-1,1]){
  out.push(face([[2.27,side*.61,-.025],[2.27,side*.22,-.025],[2.27,side*.22,.025],[2.27,side*.61,.025]],[198,246,255],{emissive:true}));
  out.push(face([[-2.24,side*.68,.085],[-2.24,side*.10,.085],[-2.24,side*.10,.13],[-2.24,side*.68,.13]],[255,74,74],{emissive:true}));
 }
 out.push(...cuboid([1.94,-.63,-.21],[2.22,.63,-.16],black));
 out.push(...cuboid([-2.25,-.62,-.27],[-2.12,.62,-.23],black));
 // Tires and inset rims use actual 3D circular cross-sections.
 for(const x of [-1.5,1.5])for(const side of [-1,1]){
  const y=side*.85,z=-.25,N=16;
  for(let k=0;k<N;k++){
   const a=k/N*TAU,b=(k+1)/N*TAU;
   const ring=(r,yy,t)=>[x+Math.cos(t)*r,yy,z+Math.sin(t)*r];
   const inner=y-side*.10,outer=y+side*.115;
   out.push(face([ring(.35,inner,a),ring(.35,inner,b),ring(.35,outer,b),ring(.35,outer,a)],[16,23,28]));
   out.push(face([ring(.35,outer,a),ring(.35,outer,b),ring(.235,outer+.001*side,b),ring(.235,outer+.001*side,a)],[21,30,37]));
   out.push(face([ring(.235,outer+.003*side,a),ring(.235,outer+.003*side,b),[x,outer+.003*side,z]],[58,74,86]));
  }
  for(let k=0;k<5;k++){
   const a=k/5*TAU,tip=t=>[x+Math.cos(t)*.22,y+side*.121,z+Math.sin(t)*.22];
   out.push(face([[x,y+side*.122,z],tip(a-.08),tip(a+.08)],[192,210,219]));
  }
 }
 return out;
}
const CAR=buildCar();

function environment(result){
 if(cache.has(result))return cache.get(result);
 const p=result.p,ss=result.samples;
 let minX=-8,maxX=10,minY=-8,maxY=8,maxZ=5;
 for(const s of ss){minX=Math.min(minX,s.x-4);maxX=Math.max(maxX,s.x+4);minY=Math.min(minY,s.lateral-4);maxY=Math.max(maxY,s.lateral+4);maxZ=Math.max(maxZ,s.y+2);}
 const faces=[],lines=[],heading=(p.yaw??0)*RAD,co=Math.cos(heading),si=Math.sin(heading),rr=result.hardware?.rampRadius;
 const stop=(p.pitch??0)*RAD,cx=result.ramp?0:-rr*Math.sin(stop);
 const RP=(a,y,thick=0)=>{const r=rr+thick,x=cx+r*Math.sin(a);return [x*co-y*si,x*si+y*co,rr-r*Math.cos(a)];};
 if(stop>.01&&Number.isFinite(rr)&&rr>.6){
  const count=72;
  for(let k=0;k<count;k++){
   const a=stop*k/count,b=stop*(k+1)/count;
   faces.push(face([RP(a,-1.3),RP(b,-1.3),RP(b,1.3),RP(a,1.3)],k%2?[50,67,73]:[45,61,68]));
   faces.push(face([RP(a,-1.3,.20),RP(b,-1.3,.20),RP(b,-1.3),RP(a,-1.3)],[65,92,103]));
   faces.push(face([RP(a,1.3),RP(b,1.3),RP(b,1.3,.20),RP(a,1.3,.20)],[37,56,64]));
   for(const y of [-1.31,1.31])lines.push({a:RP(a,y),b:RP(b,y),color:y<0?'rgba(159,227,235,.8)':'rgba(113,166,184,.55)',width:1.5});
   if(k%4===0)lines.push({a:RP(a,-1.26),b:RP(a,1.26),color:'rgba(151,187,195,.18)',width:.65});
   if(k%8===0){
    for(const y of [-1.32,1.32]){
     const v=RP(a,y,.20),base=[v[0],v[1],0];
     if(v[2]>.5){lines.push({a:v,b:base,color:'rgba(74,110,124,.55)',width:3});lines.push({a:v,b:[base[0]-2*co,base[1]-2*si,0],color:'rgba(74,110,124,.3)',width:1.4});}
    }
   }
  }
  const pts=[RP(0,0),RP(stop/2,0),RP(stop,0)];
  for(const v of pts){minX=Math.min(minX,v[0]-3);maxX=Math.max(maxX,v[0]+3);minY=Math.min(minY,v[1]-3);maxY=Math.max(maxY,v[1]+3);maxZ=Math.max(maxZ,v[2]+2);}
 }
 const obj={faces,lines,minX,maxX,minY,maxY,maxZ,center:[(minX+maxX)/2,(minY+maxY)/2,maxZ*.43],track:ss.filter((_,i)=>i%Math.max(1,Math.floor(ss.length/360))===0)};
 cache.set(result,obj);return obj;
}

function cameraFor(w,h,s,env,p,options){
 const mode=options.camera??'follow',zoom=clamp(options.zoom??1,.45,3),heading=(p.yaw??0)*RAD;
 const compact=w<650;
 // Preserve the visual metres-to-pixels scale when the stage gets shorter in
 // theater mode. Mobile uses a slightly wider framing to leave the HUD legible.
 const focal=Math.min(w*1.15,h*1.1);
 let target=point(s),az=heading-.95,el=.28,distance=Math.max(6,focal/(compact?38:51));
 if(mode==='overview'){
  target=[...env.center];az=heading-1.08;el=.33;
  distance=Math.max(env.maxX-env.minX,env.maxZ*1.45,env.maxY-env.minY)*1.75;
 }else if(mode==='side'){
  target=[...env.center];az=heading-Math.PI/2;el=.08;
  distance=Math.max(env.maxX-env.minX,env.maxZ*1.5)*1.65;
 }else if(mode==='top'){
  target=[s.x,s.lateral,Math.max(0,s.y*.35)];az=heading-Math.PI/2;el=1.38;distance=Math.max(20,s.y+12);
 }else target[2]+=.35;
 az+=finite(options.yaw);el=clamp(el+finite(options.elevation),.06,1.48);distance/=zoom;
 const offset=[Math.cos(az)*Math.cos(el)*distance,Math.sin(az)*Math.cos(el)*distance,Math.sin(el)*distance];
 const eye=add(target,offset),forward=unit(sub(target,eye)),right=unit(cross(forward,[0,0,1])),up=unit(cross(right,forward));
 const cx=w*(compact?.5:.53),cy=h*(h>=600&&!compact?.42:.54);
 const V=v=>{const q=sub(v,eye);return [dot(q,right),dot(q,up),dot(q,forward)];};
 const P=v=>[cx+v[0]/v[2]*focal,cy-v[1]/v[2]*focal,v[2]];
 return {V,P,eye,focal,cx,cy,near:.3,distance,compact};
}
function clip(poly,near){
 const out=[];for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],inside=a[2]>=near,next=b[2]>=near;
  if(inside)out.push(a);
  if(inside!==next){const f=(near-a[2])/(b[2]-a[2]);out.push(a.map((x,k)=>x+(b[k]-x)*f));}
 }return out;
}
function worldLine(ctx,cam,a,b,stroke,width=1,dash=[]){
 let A=cam.V(a),B=cam.V(b);if(A[2]<cam.near&&B[2]<cam.near)return;
 if(A[2]<cam.near||B[2]<cam.near){const f=(cam.near-A[2])/(B[2]-A[2]),v=A.map((x,i)=>x+(B[i]-x)*f);if(A[2]<cam.near)A=v;else B=v;}
 A=cam.P(A);B=cam.P(B);ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);
}
function drawFace(ctx,cam,item){
 const projected=clip(item.points.map(cam.V),cam.near);if(projected.length<3)return;
 const pts=projected.map(cam.P);
 ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();
 const normal=unit(cross(sub(item.points[1],item.points[0]),sub(item.points[2],item.points[0])));
 const lighting=item.emissive?1:clamp(.58+Math.abs(dot(normal,LIGHT))*.46,.48,1.05);
 const depth=projected.reduce((v,p)=>v+p[2],0)/projected.length;
 const fog=clamp((depth-25)/125,0,.65),base=rgb(item.base,lighting).map((x,i)=>Math.round(x*(1-fog)+[11,24,33][i]*fog));
 if(item.glass){const ys=pts.map(v=>v[1]),gradient=ctx.createLinearGradient(0,Math.min(...ys),0,Math.max(...ys)+.01);gradient.addColorStop(0,color(rgb(base,1.45)));gradient.addColorStop(.4,color(rgb(base,.92)));gradient.addColorStop(1,color(rgb(base,.55)));ctx.fillStyle=gradient;}
 else ctx.fillStyle=color(base,item.alpha??1);
 ctx.fill();
 if(item.stroke){ctx.strokeStyle=item.stroke;ctx.lineWidth=.65;ctx.stroke();}
}
function path(ctx,cam,samples,stroke,width,dash=[],end=Infinity){
 ctx.setLineDash(dash);ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.beginPath();let active=false;
 for(const s of samples){if(s.t>end)break;const v=cam.V(point(s));if(v[2]<cam.near){active=false;continue;}const p=cam.P(v);if(active)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);active=true;}
 ctx.stroke();ctx.setLineDash([]);
}
function ground(ctx,cam,env,s,w,h){
 const range=80;
 // Ground is a real z=0 plane; the radial wash only lights the backdrop.
 drawFace(ctx,cam,face([[-range,-range,0],[range,-range,0],[range,range,0],[-range,range,0]],[17,31,39]));
 const step=cam.compact?5:4;
 for(let x=-range;x<=range;x+=step)worldLine(ctx,cam,[x,-range,.005],[x,range,.005],x===0?'rgba(137,181,190,.35)':'rgba(97,145,159,.13)',x===0?1.1:.6);
 for(let y=-range;y<=range;y+=step)worldLine(ctx,cam,[-range,y,.005],[range,y,.005],y===0?'rgba(137,181,190,.35)':'rgba(97,145,159,.13)',y===0?1.1:.6);
 // Landing zone and runway fiducials add scale without changing contact geometry.
 const last=env.track.at(-1),cx=last?.x??0,cy=last?.lateral??0;
 for(const r of [2,5]){
  let prev=[cx+r,cy,.025];for(let k=1;k<=64;k++){const a=k/64*TAU,next=[cx+Math.cos(a)*r,cy+Math.sin(a)*r,.025];worldLine(ctx,cam,prev,next,r===2?'rgba(168,213,177,.35)':'rgba(94,161,170,.28)',1,k%8<5?[]:[1,3]);prev=next;}
 }
 for(let x=-36;x<=36;x+=4){
  for(const y of [-4.2,4.2])worldLine(ctx,cam,[x,y,.03],[x+1.15,y,.03],'rgba(160,199,201,.4)',2);
 }
 const low=clamp(1-(s.clearance??s.y)/32,.06,.42),shadow=[];
 for(let k=0;k<48;k++){const a=k/48*TAU;shadow.push([s.x+Math.cos(a)*2.5,s.lateral+Math.sin(a)*1.2,.04]);}
 drawFace(ctx,cam,face(shadow,[0,0,0],{alpha:low}));
 // A soft vignette leaves space around the canvas for the instrument HUD.
 const glow=ctx.createRadialGradient(w*.5,h*.4,0,w*.5,h*.5,w*.65);glow.addColorStop(0,'rgba(44,95,109,.08)');glow.addColorStop(1,'rgba(2,7,14,.13)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
}

function plume(ctx,cam,start,end,force,index,time){
 const av=cam.V(start),bv=cam.V(end);if(av[2]<cam.near||bv[2]<cam.near)return;
 const a=cam.P(av),b=cam.P(bv),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<.3)return;
 const nx=-dy/length,ny=dx/length,base=clamp(cam.focal/av[2]*.09,1,10),spread=base*(1.1+Math.sqrt(force/14000)*1.3);
 const grad=ctx.createLinearGradient(a[0],a[1],b[0],b[1]);grad.addColorStop(0,'rgba(224,255,255,.92)');grad.addColorStop(.16,'rgba(139,238,255,.7)');grad.addColorStop(.62,'rgba(96,210,241,.16)');grad.addColorStop(1,'rgba(107,215,255,0)');
 ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(a[0]+nx*base,a[1]+ny*base);ctx.lineTo(b[0]+nx*spread,b[1]+ny*spread);ctx.lineTo(b[0]-nx*spread,b[1]-ny*spread);ctx.lineTo(a[0]-nx*base,a[1]-ny*base);ctx.closePath();ctx.fill();
 ctx.strokeStyle=grad;ctx.lineWidth=base*.6;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
 // Deterministic shimmer follows replay time, so scrubbing reproduces the frame.
 for(let k=0;k<3;k++){const f=((time*1.8+k/3+index*.131)%1),alpha=(1-f)*.28;ctx.fillStyle=`rgba(178,245,255,${alpha})`;ctx.beginPath();ctx.ellipse(a[0]+dx*f,a[1]+dy*f,Math.max(.5,base*(.3+f)),Math.max(.4,base*.28),Math.atan2(dy,dx),0,TAU);ctx.fill();}
 ctx.restore();
}
function arrow(ctx,cam,a,b,stroke,title,settings={}){
 const A=cam.V(a),B=cam.V(b);if(A[2]<cam.near||B[2]<cam.near)return;
 const p=cam.P(A),q=cam.P(B),dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);
 if(length<.01)return;
 // A small screen-space floor keeps low-force direction markers visible. Thus
 // lengths are illustrative, not a second calibrated force measurement.
 if(length<(settings.minPixels??0)){const scale=settings.minPixels/length;q[0]=p[0]+dx*scale;q[1]=p[1]+dy*scale;}
 const angle=Math.atan2(dy,dx),width=settings.width??1.5,head=settings.head??8;
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.strokeStyle='rgba(3,11,18,.94)';ctx.lineWidth=width+3;ctx.stroke();ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();
 ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(q[0]-head*Math.cos(angle-.43),q[1]-head*Math.sin(angle-.43));ctx.lineTo(q[0]-head*Math.cos(angle+.43),q[1]-head*Math.sin(angle+.43));ctx.closePath();ctx.strokeStyle='rgba(3,11,18,.94)';ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle=stroke;ctx.fill();
 if(settings.labels)settings.labels.push({x:q[0],y:q[1],dx,dy,title,color:stroke,priority:settings.priority??0,strong:settings.strong??false});
 else {ctx.font='11px "IBM Plex Mono",monospace';ctx.fillText(title,q[0]+7,q[1]+3);}
 ctx.restore();
}

function forceLabels(ctx,labels,w,h,compact){
 // Keep labels out of each other's way, adding short leaders back to arrow tips.
 // Restrict desktop callouts to the open center between the two HUD columns.
 const left=compact?10:Math.min(235,w*.2),right=compact?w-10:w-Math.min(200,w*.17);
 const top=compact?130:90,bottom=Math.max(top+55,h-(compact?115:100)),placed=[];
 const font=compact?10:11;
 ctx.save();
 for(const item of labels.sort((a,b)=>b.priority-a.priority)){
  const size=item.strong?font+1:font,boxW=Math.min(right-left,item.title.length*size*.61+14),boxH=size+10;
  const preferred=item.dx<0?item.x-boxW-12:item.x+12;
  let chosen;
  const offsets=[0,-22,22,-44,44,-66,66,-88,88,-110,110,-132,132,-154,154];
  for(const delta of offsets){
   for(const x0 of [preferred,item.dx<0?item.x+12:item.x-boxW-12]){
    const box={x:clamp(x0,left,right-boxW),y:clamp(item.y-boxH/2+delta,top,bottom-boxH),w:boxW,h:boxH};
    if(!placed.some(b=>box.x<b.x+b.w+5&&box.x+box.w+5>b.x&&box.y<b.y+b.h+4&&box.y+box.h+4>b.y)){chosen=box;break;}
   }
   if(chosen)break;
  }
  // If an extreme camera/framing leaves no room, arrows still communicate each
  // force; skip only the obstructed small callout rather than stack unreadable text.
  if(!chosen)continue;
  placed.push(chosen);
  const tx=clamp(item.x,chosen.x,chosen.x+chosen.w),ty=clamp(item.y,chosen.y,chosen.y+chosen.h);
  ctx.globalAlpha=.65;ctx.strokeStyle=item.color;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(item.x,item.y);ctx.lineTo(tx,ty);ctx.stroke();ctx.globalAlpha=1;
  ctx.fillStyle='rgba(5,16,25,.9)';ctx.fillRect(chosen.x,chosen.y,chosen.w,chosen.h);
  ctx.strokeStyle=item.color;ctx.globalAlpha=item.strong?.75:.4;ctx.lineWidth=1;ctx.strokeRect(chosen.x,chosen.y,chosen.w,chosen.h);ctx.globalAlpha=1;
  ctx.fillStyle=item.color;ctx.font=`${item.strong?'600 ':''}${size}px "IBM Plex Mono",monospace`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(item.title,chosen.x+7,chosen.y+chosen.h/2+.5);
 }
 ctx.restore();
}

export function renderReplay(ctx,w,h,{result,unpowered,sample:s,time=0,options={}}){
 if(!result||!s||w<=0||h<=0)return;
 const p=result.p,env=environment(result),cam=cameraFor(w,h,s,env,p,options),center=point(s),cg=[p.cgX??0,p.cgY??0,p.cgZ??0];
 const W=v=>add(rotate(s.q,sub(v,cg)),center);
 ctx.save();ctx.clearRect(0,0,w,h);
 const backdrop=ctx.createLinearGradient(0,0,0,h);backdrop.addColorStop(0,'#07121e');backdrop.addColorStop(.55,'#122b38');backdrop.addColorStop(1,'#071119');ctx.fillStyle=backdrop;ctx.fillRect(0,0,w,h);
 const wash=ctx.createRadialGradient(w*.5,h*.35,10,w*.5,h*.35,w*.6);wash.addColorStop(0,'rgba(66,120,141,.19)');wash.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=wash;ctx.fillRect(0,0,w,h);
 ground(ctx,cam,env,s,w,h);
 // Clip the illustrative gas plume at the ground. The cyan pool is only a
 // visual cue for impingement; it adds no force or ground-effect calculation.
 const jets=NOZZLES.map((n,i)=>{
  const force=s.forces?.[i]??0,start=W(n.r),length=.3+clamp(force/6000,0,3.5);
  let end=W(sub(n.r,mul(n.d,length))),groundHit=false;
  if(end[2]<.025&&start[2]>.025){
   const f=(start[2]-.025)/(start[2]-end[2]);end=start.map((x,k)=>x+(end[k]-x)*f);groundHit=true;
  }
  return {force,start,end,groundHit};
 });
 ctx.save();ctx.globalCompositeOperation='screen';
 for(const jet of jets)if(jet.force>100&&jet.groundHit){
  const radius=.25+.65*Math.sqrt(clamp(jet.force/18000,0,1));
  for(let ring=6;ring>=1;ring--){
   const r=radius*ring/6,points=Array.from({length:28},(_,k)=>[jet.end[0]+Math.cos(k/28*TAU)*r,jet.end[1]+Math.sin(k/28*TAU)*r,.026]);
   drawFace(ctx,cam,face(points,[96,221,246],{alpha:.024,emissive:true}));
  }
 }
 ctx.restore();
 if(options.trails!==false){
  if(unpowered?.samples)path(ctx,cam,unpowered.samples,'rgba(146,177,191,.32)',1,[4,6]);
  path(ctx,cam,env.track,'rgba(186,224,174,.16)',1.1);
  path(ctx,cam,env.track,'rgba(207,243,168,.86)',1.8,[],time);
 }
 const mesh=[...env.faces,...CAR.map(f=>({...f,points:f.points.map(W),stroke:f.glass?'rgba(156,205,217,.32)':undefined}))].map(f=>({...f,depth:f.points.reduce((z,v)=>z+cam.V(v)[2],0)/f.points.length}));
 // Compute depth once per face rather than re-projecting inside the comparator.
 // Painter order is camera-depth based, so orbit works on every axis.
 mesh.sort((a,b)=>b.depth-a.depth);
 for(const f of mesh)drawFace(ctx,cam,f);
 for(const l of env.lines)worldLine(ctx,cam,l.a,l.b,l.color,l.width);
 const landed=time>=result.final.t-.00001&&result.landed;
 for(let i=0;i<NOZZLES.length;i++){
  const {force:f,start,end}=jets[i],v=cam.V(start);
  if(f>100&&start[2]>.025)plume(ctx,cam,start,end,f,i,time);
  if(v[2]>cam.near){const xy=cam.P(v),radius=clamp(cam.focal/v[2]*.055,.8,4);ctx.beginPath();ctx.arc(xy[0],xy[1],radius,0,TAU);ctx.fillStyle=f>100?'#c5fbff':'#1d535f';ctx.fill();}
 }
 if(options.vectors){
  const box=[];for(const x of [-SHAPE.length/2,SHAPE.length/2])for(const y of [-SHAPE.width/2,SHAPE.width/2])for(const z of [-SHAPE.height/2,SHAPE.height/2])box.push([x,y,z]);
  for(let i=0;i<box.length;i++)for(let j=i+1;j<box.length;j++)if(box[i].filter((v,k)=>v!==box[j][k]).length===1)worldLine(ctx,cam,W(box[i]),W(box[j]),'rgba(178,226,236,.23)',.8,[3,5]);
  if(!landed){
   if(s.phase==='ramp'){
    // Selected ramp forces, with common 18 kN/m visual scale capped at 4.5 m.
    // Origins are separated for legibility, not resolved tire/fan force centers.
    const forceArrow=(origin,direction,magnitude,stroke,name)=>{
     if(!(magnitude>50))return;
     const length=Math.min(4.5,magnitude/18000);
     arrow(ctx,cam,origin,add(origin,mul(direction,length)),stroke,`${name} ${(magnitude/1000).toFixed(1)} kN`);
    };
    const up=rotate(s.q,[0,0,1]),forward=rotate(s.q,[1,0,0]);
    forceArrow(center,[0,0,-1],(p.mass-p.gas+s.gas)*9.80665,'#dfb18c','mg');
    forceArrow(W([-.6,-.75,0]),mul(up,-1),Math.max(0,s.fanSuction??0),'#d5a3ff','Suction');
    forceArrow(W([.6,-.75,0]),up,Math.max(0,s.normalForce??0),'#a5edba','Reaction');
    forceArrow(W([1.3,-.75,-.3]),forward,Math.max(0,s.drivingForce??0),'#f4d88b','Wheel');
   }else{
    const force=[0,0,0],labels=[],scale=1/18000,cap=4.5;
    const visualLength=magnitude=>Math.min(cap,magnitude*scale);
    for(let i=0;i<NOZZLES.length;i++){
     const n=NOZZLES[i],magnitude=Math.max(0,s.forces?.[i]??0),direction=rotate(s.q,n.d);
     for(let k=0;k<3;k++)force[k]+=direction[k]*magnitude;
     if(magnitude<=100)continue;
     const origin=W(n.r),name=i<4?'U'+(i+1):i<8?'R'+(i-3):'S'+(i-7);
     // Gold arrows point in the reaction-force direction, opposite cyan exhaust.
     arrow(ctx,cam,origin,add(origin,mul(direction,visualLength(magnitude))),'#f9d98c',`${name} ${(magnitude/1000).toFixed(1)} kN`,{width:2,minPixels:cam.compact?18:24,head:8,labels,priority:magnitude/1e6});
    }
    const weight=(p.mass-p.gas+s.gas)*9.80665;
    arrow(ctx,cam,center,add(center,[0,0,-visualLength(weight)]),'#d5b69c',`GRAVITY ${(weight/1000).toFixed(1)} kN`,{width:1.8,minPixels:20,labels,priority:2});
    const net=Math.hypot(...force);
    if(net>100)arrow(ctx,cam,center,add(center,mul(force,visualLength(net)/net)),'#a8f4ff',`NET THRUST ${(net/1000).toFixed(1)} kN`,{width:3,minPixels:cam.compact?34:44,head:11,labels,priority:3,strong:true});
    forceLabels(ctx,labels,w,h,cam.compact);
   }
  }
 }
 // Contact envelope projection and height tether help retain world-space scale.
 if(s.y>1.5)worldLine(ctx,cam,center,[s.x,s.lateral,.06],'rgba(149,218,228,.2)',.8,[2,5]);
 const focus=cam.V(center);
 if(focus[2]>cam.near&&w>600){
  const xy=cam.P(focus),r=clamp(cam.focal/focus[2]*2.75,35,180);
  ctx.strokeStyle='rgba(156,224,235,.2)';ctx.lineWidth=1;ctx.beginPath();
  for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const x=xy[0]+sx*r,y=xy[1]+sy*r*.46;ctx.moveTo(x-sx*10,y);ctx.lineTo(x,y);ctx.lineTo(x,y-sy*10);}ctx.stroke();
 }
 const vignette=ctx.createRadialGradient(w*.5,h*.5,Math.min(w,h)*.15,w*.5,h*.5,Math.max(w,h)*.7);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(1,7,14,.62)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
 ctx.restore();
}
