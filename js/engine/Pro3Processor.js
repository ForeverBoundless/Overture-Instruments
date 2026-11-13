/* Sequential Pro 3 - Overture AudioWorklet.
   Two analogue-style VCOs, a band-limited wavetable oscillator, shared paraphonic
   filter/envelopes, three zero-delay-feedback filter topologies, tuned feedback,
   modulation matrix, a stereo effects pair and sample-clocked sequencing.
   Modulation runs at control rate (16 samples); audio-rate code never allocates. */
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,Number(x)||0));
const midiHz=n=>440*Math.pow(2,(n-69)/12);
const lerp=(a,b,t)=>a+(b-a)*t;
const TWO_PI=Math.PI*2;
const CTL=16;
const fastTanh=x=>{if(x<-3)return -1;if(x>3)return 1;const x2=x*x;return x*(27+x2)/(27+9*x2);};
let rngState=0x9e3779b9;
const rnd=()=>{rngState^=rngState<<13;rngState^=rngState>>>17;rngState^=rngState<<5;return (rngState>>>0)/2147483648-1;};
const DEFAULT={
 mode:"mono",osc1Wave:"saw",osc1Octave:0,osc1Tune:0,osc1Shape:.5,osc1Level:.78,osc1Glide:.04,osc1Slop:.08,osc1Sync:false,
 osc2Wave:"pulse",osc2Octave:0,osc2Tune:0,osc2Shape:.5,osc2Level:.55,osc2Glide:.04,osc2Slop:.08,osc2Sync:false,
 osc3Wave:"wavetable",osc3Octave:0,osc3Tune:0,osc3Shape:.35,osc3ShapeMod:.25,osc3Level:.45,osc3Glide:.02,osc3Slop:.02,
 noiseLevel:0,externalLevel:0,filterType:"prophet6",filterCutoff:.68,resonance:.16,filterState:0,filterBp:false,filterKeyTrack:.35,filterEnvAmount:.38,filterDrive:.08,distortion:.08,
 filterDelay:0,filterAttack:.03,filterDecay:.28,filterSustain:.45,filterRelease:.25,filterLoop:false,
 ampDelay:0,ampAttack:.015,ampDecay:.24,ampSustain:.8,ampRelease:.22,ampLoop:false,
 aux1Delay:0,aux1Attack:.02,aux1Decay:.28,aux1Sustain:0,aux1Release:.2,aux1Loop:false,
 aux2Delay:0,aux2Attack:.02,aux2Decay:.28,aux2Sustain:0,aux2Release:.2,aux2Loop:false,
 lfo1Rate:.18,lfo1Amount:.35,lfo1Wave:"triangle",lfo1Phase:0,lfo1Slew:0,lfo1Sync:false,
 lfo2Rate:.08,lfo2Amount:0,lfo2Wave:"saw",lfo2Phase:0,lfo2Slew:0,lfo2Sync:false,
 lfo3Rate:.12,lfo3Amount:0,lfo3Wave:"sampleHold",lfo3Phase:0,lfo3Slew:0,lfo3Sync:false,
 bpm:120,glide:0,hold:false,mod:0,bend:0,bendRange:2,aftertouch:0,touch:0,volume:.72,
 fx1Type:"stereoDelay",fx1Mix:.18,fx1Time:.28,fx1Feedback:.28,fx1Tone:.55,
 fx2Type:"superPlate",fx2Mix:.16,fx2Time:.42,fx2Feedback:.25,fx2Tone:.6,
 feedbackAmount:0,feedbackTune:24,feedbackGrunge:false,
 arpEnabled:false,arpMode:"up",arpDivision:4,arpRange:1,arpSwing:0,arpLatch:false,
 seqEnabled:false,seqMode:"forward",seqLength:16,seqSwing:0,seqGate:.72,
 seqTracks:Array.from({length:16},()=>Array(64).fill(null)),
 seqDestinations:Array.from({length:16},(_,i)=>i===0?"note":i===1?"osc1Shape":i===2?"filterCutoff":"none"),
 seqPhrase:"A",seqLinked:false,seqTrack:0,seqRecord:false,
 modRoutes:[],morph:0
};
const SOURCES=['LFO 1','LFO 2','LFO 3','Filter Env','Amp Env','Aux Env 1','Aux Env 2','Mod Wheel','Aftertouch','Touch Slider','Velocity','Key Number','Sequencer'];
const DESTS=['osc1Pitch','osc2Pitch','osc3Pitch','osc1Shape','osc2Shape','osc3Shape','osc3ShapeMod','filterCutoff','resonance','filterState','ampLevel','fx1Mix','fx2Mix','feedbackAmount','lfo1Rate','lfo2Rate','lfo3Rate'];
const D={};DESTS.forEach((n,i)=>D[n]=i);
function makeEnv(){return {v:0,stage:"idle",time:0,gate:false};}
function blep(t,dt){
 if(dt<=0)return 0;
 if(t<dt){const x=t/dt;return x+x-x*x-1;}
 if(t>1-dt){const x=(t-1)/dt;return x*x+x+x+1;}
 return 0;
}
/* ---------- band-limited wavetables (32 banks x 16 frames, lazy mip-maps) ---------- */
const TS=512,CAPS=[32,16,8,4,2,1],LUT=4096;
const SIN=new Float32Array(LUT),COS=new Float32Array(LUT);
for(let i=0;i<LUT;i++){SIN[i]=Math.sin(TWO_PI*i/LUT);COS[i]=Math.cos(TWO_PI*i/LUT);}
function besselJ(n,x){
 const an=Math.abs(n);let sum=0,term=Math.pow(x/2,an);for(let k=2;k<=an;k++)term/=k;
 for(let m=0;m<12;m++){sum+=(m%2?-1:1)*term;term*=(x*x/4)/((m+1)*(m+1+an));}
 return (n<0&&an%2)?-sum:sum;
}
function frameSpec(bank,frame){
 const t=frame/15,type=bank>>3,v=bank&7,a=new Float64Array(33),ph=new Float64Array(33);
 for(let h=1;h<=32;h++){
  if(type===0){
   const c1=1.5+v*.6+t*5,c2=4+v*1.2+t*9;
   a[h]=Math.exp(-Math.pow((h-c1)/1.2,2))+.7*Math.exp(-Math.pow((h-c2)/1.8,2))+.25/h;
  }else if(type===1){
   const k=2+(v%4);a[h]=(h%k===0?1:.18)/Math.pow(h,.5+.1*v)*(.5+.5*Math.cos(h*t*Math.PI*.5));
  }else if(type===2){
   const w=clamp(.5-.46*t+v*.03,.03,.5);a[h]=Math.sin(Math.PI*h*w)/h;ph[h]=Math.PI/2-Math.PI*h*w;
  }
 }
 if(type===3){
  const r=1+(v%4),I=t*5+.1*v;
  for(let n=-8;n<=8;n++){const hh=1+n*r,j=besselJ(n,I);if(hh===0)continue;a[Math.min(32,Math.abs(hh))]+=(hh<0?-1:1)*j*(Math.abs(hh)>32?0:1);}
 }
 return {a,ph};
}
function buildFrame(bank,frame){
 const {a,ph}=frameSpec(bank,frame),levels=[];let peak=0;
 CAPS.forEach((cap,li)=>{
  const tbl=new Float32Array(TS);
  for(let h=1;h<=cap;h++){
   if(!a[h])continue;const cs=Math.cos(ph[h])*a[h],sn=Math.sin(ph[h])*a[h],step=h*(LUT/TS);
   for(let i=0;i<TS;i++){const idx=(i*step)&(LUT-1);tbl[i]+=cs*SIN[idx]+sn*COS[idx];}
  }
  if(li===0)for(let i=0;i<TS;i++)peak=Math.max(peak,Math.abs(tbl[i]));
  levels.push(tbl);
 });
 const g=peak>1e-6?.95/peak:1;levels.forEach(t=>{for(let i=0;i<TS;i++)t[i]*=g;});
 return levels;
}
class Pro3Processor extends AudioWorkletProcessor{
 constructor(){
  super();this.p={...DEFAULT};this.userTable=null;this.frames=new Map();
  this.voices=Array.from({length:3},()=>({note:60,gate:false,order:0,phase:0,drift:Math.random()*6.28,driftRate:.05+Math.random()*.05,slop:(rnd())*.2,ampEnv:makeEnv(),velocity:.8,glideHz:0,ampPrev:0,ampNow:0,ss:new Float64Array(7)}));
  this.currentNote=60;this.lastNote=60;this.order=0;this.held=new Map();this.arpLatched=new Set();this.sustain=false;this.bend=0;this.mod=0;this.at=0;this.touch=0;this.velocity=.8;
  this.envs={filter:makeEnv(),amp:makeEnv(),aux1:makeEnv(),aux2:makeEnv()};
  this.lfos=[{phase:0,hold:0,last:0,paramPhase:null},{phase:0,hold:0,last:0,paramPhase:null},{phase:0,hold:0,last:0,paramPhase:null}];
  this.lf=new Float64Array(3);this.mods=new Float64Array(DESTS.length);this.envv=new Float64Array(4);
  this.routeSrc=[];this.routeDst=[];this.routeAmt=[];
  // filter state
  this.s1=0;this.s2=0;this.s3=0;this.s4=0;this.v0=0;this.v1=0;
  this.G=.1;this.Gt=.1;this.k=0;this.kt=0;this.svfG=.1;this.svfK=2;
  // smoothed parameters
  this.sm={vol:.72,l1:.78,l2:.55,l3:.45,noise:0,res:.16,mix1:.18,mix2:.16,fbAmt:0};
  this.cutS=null;this.ampPrev=0;this.ampNow=0;this.volPrev=.72;this.volNow=.72;
  this.fb=new Float32Array(Math.max(4096,sampleRate));this.fbWrite=0;this.fbLp=0;
  this.dcInL=0;this.dcOutL=0;this.dcInR=0;this.dcOutR=0;
  const mk=()=>{const sr=sampleRate,sc=sr/44100,len=(n)=>Math.max(8,Math.round(n*sc));
   const cl=[1116,1188,1277,1356,1422,1491,1557,1617].map(len),al=[556,441,341,225].map(len);
   return {bufL:new Float32Array(sr*2),bufR:new Float32Array(sr*2),write:0,phase:0,lpL:0,lpR:0,hpL:0,hpR:0,fbL:0,fbR:0,
    apL:new Float64Array(4),apR:new Float64Array(4),pfbL:0,pfbR:0,speed:.8,
    cL:cl.map(n=>({b:new Float32Array(n),i:0,s:0})),cR:cl.map(n=>({b:new Float32Array(n+len(23)),i:0,s:0})),
    aL:al.map(n=>({b:new Float32Array(n),i:0})),aR:al.map(n=>({b:new Float32Array(n+len(23)),i:0}))};};
  this.fx=[mk(),mk()];this.outL=0;this.outR=0;
  this.seqStep=0;this.seqPhase=0;this.seqRunning=false;this.arpPhase=0;this.arpStep=0;this.arpNote=-1;this.seqNote=-1;this.externalClock=0;
  this.auto={};this.scheduled=[];this.port.onmessage=e=>this.message(e.data);
 }
 parseRoutes(){
  this.routeSrc=[];this.routeDst=[];this.routeAmt=[];
  for(const r of (this.p.modRoutes||[])){
   if(!r||!r.destination||r.destination==='none')continue;
   const s=SOURCES.indexOf(r.source),d=D[r.destination],a=Number(r.amount)||0;
   if(s<0||d===undefined||!a)continue;this.routeSrc.push(s);this.routeDst.push(d);this.routeAmt.push(a);
  }
 }
 message(m){
    if (m?.t === '__preview_flush') { this.port.postMessage({ t: '__preview_flush_ack', id: m.id }); return; }

  if((m.t==="noteOn"||m.t==="noteOff")&&Number.isFinite(m.frame)&&m.frame>currentFrame){this.scheduled.push(m);this.scheduled.sort((a,b)=>a.frame-b.frame);return;}
  if(m.t==="patch"){
   this.p={...DEFAULT,...m.patch};this.p.seqTracks=m.patch.seqTracks||DEFAULT.seqTracks;this.p.seqDestinations=m.patch.seqDestinations||DEFAULT.seqDestinations;this.p.modRoutes=m.patch.modRoutes||[];
   if(Number(this.p.feedbackTune)<=1)this.p.feedbackTune=Number(this.p.feedbackTune||0)*48;
   this.lfos.forEach(l=>{l.paramPhase=null;});this.parseRoutes();
   return;
  }
  if(m.t==="param"){
   const old=this.p[m.key];this.p[m.key]=m.value;
   if(m.key==="volume"||m.key==="distortion")this.p[m.key]=clamp(m.value);
   if(m.key==="feedbackAmount")this.p[m.key]=clamp(m.value,-1,1);
   if(m.key==="modRoutes")this.parseRoutes();
   if(m.key==="arpLatch"&&old&&!m.value){this.arpLatched.forEach(note=>this.held.delete(note));this.arpLatched.clear();}
   if(/^lfo[123]Phase$/.test(m.key)){const i=Number(m.key[3])-1;if(this.lfos[i])this.lfos[i].paramPhase=null;}
   return;
  }
  if(m.t==="noteOn")this.noteOn(m.note|0,clamp(m.vel,.01,1));
  else if(m.t==="noteOff")this.noteOff(m.note|0);
  else if(m.t==="bend")this.bend=clamp(m.value,-1,1);
  else if(m.t==="mod")this.mod=clamp(m.value);
  else if(m.t==="at")this.at=clamp(m.value);
  else if(m.t==="touch")this.touch=clamp(m.value);
  else if(m.t==="sustain"){this.sustain=!!m.down;if(!this.sustain)this.releaseUnheld();}
  else if(m.t==="allOff"){this.held.clear();this.voices.forEach(v=>{v.gate=false;v.ampEnv.gate=false;v.ampEnv.stage="release";});Object.values(this.envs).forEach(e=>{e.gate=false;e.stage="release";});}
  else if(m.t==="sequence"){this.p.seqTracks=m.tracks||this.p.seqTracks;this.p.seqDestinations=m.destinations||this.p.seqDestinations;this.p.seqLength=m.length||this.p.seqLength;}
  else if(m.t==="transport"){this.seqRunning=!!m.play;this.seqStep=0;this.seqPhase=0;this.arpPhase=0;this.arpStep=0;if(!this.seqRunning&&this.seqNote>=0){this.noteOffArp(this.seqNote);this.seqNote=-1;}}
  else if(m.t==="clock"){this.externalClock=(this.externalClock+1)%24;if(this.externalClock===0){this.seqPhase=1;this.arpPhase=1;}}
  else if(m.t==="wavetable"){if(m.data&&m.data.length>=64){const data=new Float32Array(m.data);let peak=0;for(const x of data)peak=Math.max(peak,Math.abs(x));if(peak>0)for(let i=0;i<data.length;i++)data[i]/=peak;this.userTable=data;}}
  else if(m.t==="feedbackClear"){this.fb.fill(0);this.fbLp=0;}
  else if(m.t==="panic"){this.held.clear();this.voices.forEach(v=>{v.gate=false;v.ampEnv.gate=false;});Object.values(this.envs).forEach(e=>{e.gate=false;e.stage="release";});}
 }
 noteOn(note,vel){
  this.held.set(note,vel);this.arpLatched.delete(note);this.velocity=vel;
  if(this.p.arpEnabled)return;
  this.trigger(note,vel);
 }
 trigger(note,vel){
  if(this.p.mode==="paraphonic"){
   const v=this.voices.find(x=>!x.gate)||this.voices.slice().sort((a,b)=>a.order-b.order)[0];
   v.note=note;v.gate=true;v.order=++this.order;v.velocity=vel;v.ampEnv.gate=true;
   if(v.ampEnv.stage==="idle"||v.ampEnv.stage==="release"){v.ampEnv.stage="delay";v.ampEnv.time=0;}
  }else{
   this.currentNote=note;this.lastNote=note;
   this.voices.forEach(v=>{v.note=note;v.gate=true;v.order=++this.order;v.velocity=vel;});
  }
  Object.values(this.envs).forEach(e=>{if(e.stage==="idle"||e.stage==="release"||!e.gate){e.stage="delay";e.time=0;}e.gate=true;});
 }
 noteOff(note){
  if(this.p.arpEnabled&&this.p.arpLatch){this.arpLatched.add(note);return;}
  this.held.delete(note);this.arpLatched.delete(note);
  if(this.sustain||this.p.hold||this.p.arpEnabled)return;
  if(this.p.mode==="paraphonic")this.voices.forEach(v=>{if(v.note===note&&v.gate){v.gate=false;v.ampEnv.gate=false;if(v.ampEnv.stage!=="idle")v.ampEnv.stage="release";}});
  else if(this.currentNote===note){const next=[...this.held.entries()].sort((a,b)=>b[0]-a[0])[0];if(next){this.currentNote=next[0];this.voices.forEach(v=>v.note=next[0]);}else this.voices.forEach(v=>v.gate=false);}
  this.updateSharedGate();
 }
 releaseUnheld(){if(this.held.size||this.p.hold)return;this.voices.forEach(v=>{v.gate=false;v.ampEnv.gate=false;if(v.ampEnv.stage!=="idle")v.ampEnv.stage="release";});this.updateSharedGate();}
 updateSharedGate(){const gate=this.voices.some(v=>v.gate);Object.values(this.envs).forEach(e=>{if(!gate){e.gate=false;if(e.stage!=="idle")e.stage="release";}});}
 envTickState(e,prefix,dt){
  const P=this.p,delay=clamp(P[prefix+"Delay"]||0)*2,attack=(.001+Math.pow(clamp(P[prefix+"Attack"]||0),2)*8)*.5,
        decay=.002+Math.pow(clamp(P[prefix+"Decay"]||0),2)*6,sustain=clamp(P[prefix+"Sustain"]||0),release=.005+Math.pow(clamp(P[prefix+"Release"]||0),2)*8;
  if(e.gate&&e.stage==="idle")e.stage="delay";
  if(!e.gate&&e.stage!=="idle"&&e.stage!=="release")e.stage="release";
  if(e.stage==="delay"){e.time+=dt;if(e.time>=delay){e.stage="attack";e.time=0;}}
  if(e.stage==="attack"){e.v+=(1.15-e.v)*(1-Math.exp(-dt/attack));if(e.v>=1){e.v=1;e.stage="decay";}}
  else if(e.stage==="decay"){e.v+=(sustain-e.v)*(1-Math.exp(-dt/decay));if(Math.abs(e.v-sustain)<.001){e.v=sustain;e.stage="sustain";}}
  else if(e.stage==="sustain"){e.v=sustain;}
  else if(e.stage==="release"){e.v*=Math.exp(-dt/release);if(e.v<.0001){e.v=0;e.stage="idle";}}
  if(P[prefix+"Loop"]&&e.gate&&e.stage==="sustain"){e.stage="attack";}
  return e.v;
 }
 lfoValue(index,dt){
  const key="lfo"+(index+1),l=this.lfos[index],P=this.p,raw=clamp(P[key+"Rate"]+this.mods[D["lfo"+(index+1)+"Rate"]]);
  const bpm=clamp(P.bpm||120,30,260);
  const hz=P[key+"Sync"]?(bpm/60)*Math.pow(2,raw*6-4):.022*Math.pow(10,raw*4.36);
  const phaseTarget=clamp(P[key+"Phase"]||0);
  if(l.paramPhase!==phaseTarget){l.phase=phaseTarget;l.paramPhase=phaseTarget;}
  l.phase+=hz*dt;let wrapped=false;if(l.phase>=1){l.phase-=Math.floor(l.phase);wrapped=true;}
  const shape=P[key+"Wave"];
  let v;
  if(shape==="square")v=l.phase<.5?1:-1;
  else if(shape==="saw")v=l.phase*2-1;
  else if(shape==="reverseSaw")v=1-l.phase*2;
  else if(shape==="triangle")v=1-4*Math.abs(l.phase-.5);
  else if(shape==="sampleHold"){if(wrapped)l.hold=rnd();v=l.hold;}
  else v=Math.sin(l.phase*TWO_PI);
  const slew=clamp(P[key+"Slew"]);l.last+=(v-l.last)*(1-slew*.995);
  return l.last*clamp(P[key+"Amount"]);
 }
 frameTables(bank,frame){
  const key=bank*16+frame;let t=this.frames.get(key);if(!t){t=buildFrame(bank,frame);this.frames.set(key,t);}return t;
 }
 /* ---------- filter ---------- */
 filterSample(x,type,state,bp,drive){
  if(type==="svf"){
   const g=this.G,k=this.svfK,a1=1/(1+g*(g+k)),xin=fastTanh(x*drive)/Math.max(1,drive*.6);
   const v1=a1*(this.v0+g*(xin-this.v1)),v2=this.v1+g*v1;
   this.v0=2*v1-this.v0;this.v1=2*v2-this.v1;
   const lp=v2,bpv=v1,hp=xin-k*v1-v2,notch=lp+hp;
   if(bp)return bpv*Math.max(.7,k*.6);
   if(state<.25)return lerp(lp,notch,state*4);
   if(state<.5)return lerp(notch,hp,(state-.25)*4);
   if(state<.75)return lerp(hp,bpv*Math.max(.7,k*.6),(state-.5)*4);
   return lerp(bpv*Math.max(.7,k*.6),lp,(state-.75)*4);
  }
  const G=this.G,k=this.k,oneG=1-G;
  const b1=oneG*this.s1,b2=oneG*this.s2,b3=oneG*this.s3,b4=oneG*this.s4;
  const sigma=G*G*G*b1+G*G*b2+G*b3+b4,G4=G*G*G*G;
  let u=(x*drive*(1+k*(type==="ladder"?.22:.32))-k*sigma)/(1+k*G4);
  u=fastTanh(u);
  let v=(u-this.s1)*G,y1=v+this.s1;this.s1=y1+v;
  if(type!=="ladder")y1=fastTanh(y1*1.15)/1.15;
  v=(y1-this.s2)*G;const y2=v+this.s2;this.s2=y2+v;
  v=(y2-this.s3)*G;const y3=v+this.s3;this.s3=y3+v;
  v=(y3-this.s4)*G;const y4=v+this.s4;this.s4=y4+v;
  return y4;
 }
 /* ---------- effects (write this.outL/outR) ---------- */
 fxRun(index,xL,xR){
  const f=this.fx[index],P=this.p,pre="fx"+(index+1),type=P[pre+"Type"];
  const mixT=type==="off"?0:clamp(P[pre+"Mix"]+this.mods[D[pre+"Mix"]]);
  f.mixS=(f.mixS===undefined?mixT:f.mixS)+(mixT-(f.mixS===undefined?mixT:f.mixS))*.002;
  const mix=f.mixS;
  if(mix<.0005){this.outL=xL;this.outR=xR;return;}
  const T=clamp(P[pre+"Time"]),tone=clamp(P[pre+"Tone"]),fb=clamp(P[pre+"Feedback"],0,.88),sr=sampleRate;
  const buf=f.bufL.length,w=f.write;let wl=xL,wr=xR;
  const rd=(b,d)=>{let pos=w-d;while(pos<0)pos+=buf;const i=pos|0,fr=pos-i,j=i+1>=buf?0:i+1;return b[i]*(1-fr)+b[j]*fr;};
  f.phase+=1/sr;
  if(type==="stereoDelay"||type==="bbdDelay"){
   const bbd=type==="bbdDelay",d=(bbd?.012+T*T*.4:.02+T*T*1.18)*sr+(bbd?Math.sin(f.phase*TWO_PI*.6)*.0002*sr:0);
   const dL=rd(f.bufL,d),dR=rd(f.bufR,d),a=.12+.85*tone;
   f.fbL+=a*(dR-f.fbL);f.fbR+=a*(dL-f.fbR);
   wl=xL+(bbd?fastTanh(f.fbL*1.3)/1.3:f.fbL)*fb;wr=xR+(bbd?fastTanh(f.fbR*1.3)/1.3:f.fbR)*fb;
   f.bufL[w]=wl;f.bufR[w]=wr;f.write=w+1>=buf?0:w+1;
   this.outL=xL*(1-mix*.5)+dL*mix;this.outR=xR*(1-mix*.5)+dR*mix;return;
  }
  if(type==="chorus"||type==="flanger"||type==="rotary"){
   let dl,dr,gl=1,gr=1;
   if(type==="chorus"){const r=.25+T*1.4;dl=(.014+.006*Math.sin(f.phase*TWO_PI*r))*sr;dr=(.014+.006*Math.sin(f.phase*TWO_PI*r+Math.PI))*sr;}
   else if(type==="flanger"){const r=.05+T*2.5;dl=(.0007+.0035*(.5+.5*Math.sin(f.phase*TWO_PI*r)))*sr;dr=(.0007+.0035*(.5+.5*Math.sin(f.phase*TWO_PI*r+1.4)))*sr;}
   else{const target=T>.5?6.5:.8;f.speed+=(target-f.speed)*.00004;f.rp=(f.rp||0)+f.speed/sr;const s=Math.sin(f.rp*TWO_PI);dl=(.004+.0025*s)*sr;dr=(.004-.0025*s)*sr;gl=.75+.25*s;gr=.75-.25*s;}
   const l=rd(f.bufL,dl),r2=rd(f.bufR,dr),fbk=type==="flanger"?fb*.8:0;
   f.bufL[w]=xL+l*fbk;f.bufR[w]=xR+r2*fbk;f.write=w+1>=buf?0:w+1;
   if(type==="rotary"){this.outL=xL*(1-mix)+l*gl*mix;this.outR=xR*(1-mix)+r2*gr*mix;}
   else{this.outL=xL+(l)*mix;this.outR=xR+(r2)*mix;if(type==="chorus"){this.outL=xL*(1-mix*.5)+l*mix;this.outR=xR*(1-mix*.5)+r2*mix;}}
   return;
  }
  if(type==="phaser"){
   const r=.08+T*3.5,c=.1+.8*(.5+.5*Math.sin(f.phase*TWO_PI*r));let l=xL+f.pfbL*fb*.7,rr=xR+f.pfbR*fb*.7;
   for(let i=0;i<4;i++){const nl=-c*l+f.apL[i];f.apL[i]=l+c*nl;l=nl;const nr=-c*rr+f.apR[i];f.apR[i]=rr+c*nr;rr=nr;}
   f.pfbL=l;f.pfbR=rr;this.outL=xL*(1-mix*.5)+l*mix*.7;this.outR=xR*(1-mix*.5)+rr*mix*.7;return;
  }
  if(type==="ringMod"){
   f.rp=(f.rp||0)+20*Math.pow(100,T)/sr;if(f.rp>1)f.rp-=1;
   const s=Math.sin(f.rp*TWO_PI);this.outL=xL*(1-mix)+xL*s*mix;this.outR=xR*(1-mix)+xR*Math.sin(f.rp*TWO_PI+.19)*mix;return;
  }
  if(type==="digitalDistortion"){
   const drive=1+tone*tone*30,comp=1/Math.sqrt(drive);
   const bits=Math.max(4,16-Math.floor(T*10)),q=Math.pow(2,bits-1);
   const cl=Math.round(xL*q)/q,cr=Math.round(xR*q)/q;
   this.outL=xL*(1-mix)+fastTanh(cl*drive)*comp*mix;this.outR=xR*(1-mix)+fastTanh(cr*drive)*comp*mix;return;
  }
  if(type==="highPass"){
   const a=1-Math.exp(-TWO_PI*35*Math.pow(2,tone*9)/sr);f.hpL+=a*(xL-f.hpL);f.hpR+=a*(xR-f.hpR);
   this.outL=xL*(1-mix)+(xL-f.hpL)*mix;this.outR=xR*(1-mix)+(xR-f.hpR)*mix;return;
  }
  // superPlate: Freeverb-style damped combs + series allpasses
  const feedback=.72+.26*T,damp=.08+(1-tone)*.55,inp=(xL+xR)*.015,ag=.5+fb*.15;
  let oL=0,oR=0;
  for(let i=0;i<8;i++){
   const cL=f.cL[i],cR=f.cR[i];
   let y=cL.b[cL.i];cL.s=y*(1-damp)+cL.s*damp;cL.b[cL.i]=inp+cL.s*feedback;if(++cL.i>=cL.b.length)cL.i=0;oL+=y;
   y=cR.b[cR.i];cR.s=y*(1-damp)+cR.s*damp;cR.b[cR.i]=inp+cR.s*feedback;if(++cR.i>=cR.b.length)cR.i=0;oR+=y;
  }
  for(let i=0;i<4;i++){
   const aL=f.aL[i],aR=f.aR[i];
   let bo=aL.b[aL.i];aL.b[aL.i]=oL+bo*ag;oL=bo-oL;if(++aL.i>=aL.b.length)aL.i=0;
   bo=aR.b[aR.i];aR.b[aR.i]=oR+bo*ag;oR=bo-oR;if(++aR.i>=aR.b.length)aR.i=0;
  }
  this.outL=xL*(1-mix*.4)+oL*mix*3;this.outR=xR*(1-mix*.4)+oR*mix*3;
 }
 /* ---------- sequencer / arp ---------- */
 advanceSequencer(dt){
  if(this.seqRunning){
   const swing=clamp(this.p.seqSwing)*.42;
   this.seqPhase+=(clamp(this.p.bpm,30,260)/60)*dt*((this.seqStep%2)?1-swing:1+swing);
   if(this.seqNote>=0&&this.seqPhase>=clamp(this.p.seqGate,.05,1)){this.noteOffArp(this.seqNote);this.seqNote=-1;}
   if(this.seqPhase>=1){this.seqPhase-=1;this.sequenceTick();}
  }
  if(this.p.arpEnabled&&!this.held.size&&this.arpNote>=0){this.noteOffArp(this.arpNote);this.arpNote=-1;}
  if(this.p.arpEnabled&&this.held.size){
   const arpSwing=clamp(this.p.arpSwing)*.42;
   this.arpPhase+=(clamp(this.p.bpm,30,260)/60)*dt*(4/Math.max(1,Number(this.p.arpDivision)||4))*((this.arpStep%2)?1-arpSwing:1+arpSwing);
   if(this.arpPhase>=1){
    this.arpPhase-=1;
    const notes=this.p.arpMode==="assign"?[...this.held.keys()]:[...this.held.keys()].sort((a,b)=>a-b),range=clamp(Math.round(this.p.arpRange||1),1,4),total=notes.length*range,step=this.arpStep++%total,octave=Math.floor(step/notes.length);
    let idx=step%notes.length;
    if(this.p.arpMode==="down")idx=notes.length-1-idx;else if(this.p.arpMode==="random")idx=Math.floor(Math.random()*notes.length);
    else if(this.p.arpMode==="upDown"){const span=Math.max(1,total*2-2),x=this.arpStep%span,absolute=x<total?x:span-x;idx=absolute%notes.length;}
    const n=notes[idx]+octave*12;if(this.arpNote>=0)this.noteOffArp(this.arpNote);this.trigger(n,this.held.get(n)||.8);this.arpNote=n;
   }
  }
 }
 noteOffArp(n){
  if(this.p.mode==="paraphonic")this.voices.forEach(v=>{if(v.note===n){v.gate=false;v.ampEnv.gate=false;if(v.ampEnv.stage!=="idle")v.ampEnv.stage="release";}});
  else if(this.currentNote===n)this.voices.forEach(v=>{v.gate=false;});
  this.updateSharedGate();
 }
 sequenceTick(){
  const len=clamp(Number(this.p.seqLength)||16,1,64),mode=this.p.seqMode;let step=this.seqStep;
  if(mode==="reverse")step=(len-1-this.seqStep)%len;else if(mode==="random")step=Math.floor(Math.random()*len);
  else if(mode==="forwardReverse"){const n=this.seqStep%(len*2-2||1);step=n<len?n:len*2-2-n;}
  this.seqStep=(this.seqStep+1)%len;
  const tracks=this.p.seqTracks||[];
  if(this.seqNote>=0){this.noteOffArp(this.seqNote);this.seqNote=-1;}
  const get=i=>tracks[i]&&tracks[i][step];
  const n=get(0);
  if(n!==null&&n!==undefined&&Number(n)>=0){const note=clamp(Number(n),24,108);this.trigger(note,.82);this.seqNote=note;}
  if(this.p.mode==="paraphonic"){for(let i=1;i<3;i++){const v=get(i);if(v!==null&&v!==undefined){const voice=this.voices[i];voice.note=clamp(Number(v),24,108);voice.gate=true;voice.ampEnv.gate=true;voice.ampEnv.stage="attack";voice.ampEnv.time=0;}}}
  this.auto={};for(let i=3;i<16;i++){const v=get(i);if(v!==null&&v!==undefined)this.auto[this.p.seqDestinations?.[i]||"none"]=clamp(v);}
 }
 /* ---------- control block ---------- */
 control(dt){
  const P=this.p,mods=this.mods,sr=sampleRate,E=this.envv;
  mods.fill(0);
  for(const key in this.auto){const d=D[key];if(d!==undefined)mods[d]+=this.auto[key]-.5;}
  this.advanceSequencer(dt);
  const lf=this.lf;lf[0]=this.lfoValue(0,dt);lf[1]=this.lfoValue(1,dt);lf[2]=this.lfoValue(2,dt);
  const para=P.mode==="paraphonic",sharedGate=this.voices.some(v=>v.gate)||P.hold;
  const envs=this.envs;envs.filter.gate=envs.amp.gate=envs.aux1.gate=envs.aux2.gate=sharedGate;
  E[0]=this.envTickState(envs.filter,"filter",dt);E[1]=this.envTickState(envs.amp,"amp",dt);E[2]=this.envTickState(envs.aux1,"aux1",dt);E[3]=this.envTickState(envs.aux2,"aux2",dt);
  const note=this.currentNote;
  for(let r=0;r<this.routeSrc.length;r++){
   const s=this.routeSrc[r];let val=0;
   if(s<3)val=lf[s];else if(s===3)val=E[0];else if(s===4)val=E[1];else if(s===5)val=E[2];else if(s===6)val=E[3];
   else if(s===7)val=this.mod;else if(s===8)val=this.at;else if(s===9)val=this.touch;else if(s===10)val=this.velocity;else if(s===11)val=(note-60)/48;else val=this.seqStep/63;
   mods[this.routeDst[r]]+=val*this.routeAmt[r];
  }
  // smoothed parameters
  const sm=this.sm,k=.25;
  sm.vol+=(clamp(P.volume)-sm.vol)*k;sm.l1+=(clamp(P.osc1Level)-sm.l1)*k;sm.l2+=(clamp(P.osc2Level)-sm.l2)*k;sm.l3+=(clamp(P.osc3Level)-sm.l3)*k;
  sm.noise+=(clamp(P.noiseLevel)-sm.noise)*k;
  const res=clamp(P.resonance+mods[D.resonance]);sm.res+=(res-sm.res)*k;
  // oscillators
  this.oscInc=this.oscInc||[0,0,0];this.oscLvl=this.oscLvl||[0,0,0];
  for(let oi=0;oi<3;oi++){
   const v=this.voices[oi],n=para?v.note:note,ok=oi+1,key="osc"+ok;
   const semi=(Number(P[key+"Octave"])||0)*12,tune=P[key+"Tune"]||0;
   const slide=clamp(P[key+"Glide"]||P.glide||0);
   const pitch=n+semi+tune+mods[D[key+"Pitch"]]*24+this.bend*(P.bendRange||2)+this.mod*lf[0]*.35+this.at*.012;
   const target=midiHz(pitch);
   if(!v.glideHz)v.glideHz=target;
   v.glideHz+=(target-v.glideHz)*(slide>0?1-Math.exp(-dt/(.004+slide*1.8)):1);
   v.drift+=dt*v.driftRate*TWO_PI;
   const slop=(Number(P[key+"Slop"])||0);
   const cents=(Math.sin(v.drift)*.8+Math.sin(v.drift*2.7)*.3+v.slop)*slop*14;
   this.oscInc[oi]=v.glideHz*Math.pow(2,cents/1200)/sr;
   if(para){v.ampPrev=v.ampNow;v.ampNow=this.envTickState(v.ampEnv,"amp",dt);}
  }
  // filter targets
  const fKey=(note-60)/48*clamp(P.filterKeyTrack)*.22;
  const cutN=clamp(P.filterCutoff+clamp(P.filterEnvAmount)*E[0]*.6+fKey+lf[0]*.05*clamp(this.mod+.0)+this.mod*.1+mods[D.filterCutoff]);
  const fc=Math.min(sr*.45,Math.max(20,20*Math.pow(2,cutN*10)));
  this.Gt=(()=>{const g=Math.tan(Math.PI*fc/sr);return g/(1+g);})();
  const type=P.filterType==="ladder"?"ladder":P.filterType==="stateVariable"?"svf":"prophet6";this.ftype=type;
  const q=clamp(sm.res,0,1);
  this.kt=type==="ladder"?q*3.95:q*3.85;this.svfKt=2-1.96*Math.min(q,.99);
  this.fstate=clamp(P.filterState+mods[D.filterState]);
  this.fdrive=1+clamp(P.filterDrive)*5+clamp(P.distortion)*6;
  this.ampT=(para?1:E[1])*this.velocity*(1+mods[D.ampLevel]);
  this.volT=sm.vol;
  this.morph=clamp((Number(P.osc3ShapeMod)||0)+lf[2]*.2+mods[D.osc3ShapeMod]+(this.auto.osc3ShapeMod||0)*0);
  this.bankPos=clamp((P.osc3Shape===undefined?.5:P.osc3Shape)+mods[D.osc3Shape]);
  this.fbAmt=clamp(P.feedbackAmount+mods[D.feedbackAmount],-1,.96);
  this.fbDelay=Math.max(2,sr/midiHz(12+clamp(P.feedbackTune,0,48)));
 }
 oscSample(oi,kind,shape,v,inc,wrap){
  const p=v.phase;
  if(kind==="sine")return Math.sin(p*TWO_PI);
  if(kind==="triangle"){const d=clamp(shape,.02,.98);return p<d?-1+2*p/d:1-2*(p-d)/(1-d);}
  if(kind==="pulse"||kind==="square"){const d=kind==="square"?.5:clamp(shape,.02,.98);return (p<d?1:-1)+blep(p,inc)-blep((p-d+1)%1,inc);}
  if(kind==="reverseSaw")return 1-2*p+blep(p,inc);
  if(kind==="superSaw"){
   let s=0;const spread=.0035*(.2+(this.morph));
   for(let j=0;j<7;j++){const off=(j-3)*spread,pp=v.ss[j];s+=(2*pp-1-blep(pp,inc*(1+off)))*(j===3?1.1:.8);}
   return s*.3;
  }
  const s=2*p-1-blep(p,inc),m=Math.abs(shape-.5)*2;
  if(m<.001)return s;
  const q=(p+.5+(shape-.5)*.9)%1,s2=2*q-1-blep(q,inc);
  return lerp(s,(s-s2)*.7,m);
 }
 process(_inputs,outputs){
  const out=outputs[0],L=out[0],R=out[1]||out[0],N=L.length,sr=sampleRate,P=this.p,para=P.mode==="paraphonic";
  for(let b=0;b<N;b+=CTL){
   while(this.scheduled.length&&this.scheduled[0].frame<=currentFrame+b){const message=this.scheduled.shift();delete message.frame;this.message(message);}
   const n=Math.min(CTL,N-b);this.control(n/sr);
   const ampA=this.ampPrev,ampB=this.ampT,volA=this.volPrev,volB=this.volT;
   const gA=this.G,gB=this.Gt,kA=this.k,kB=this.kt;
   const type=this.ftype,state=this.fstate,drive=this.fdrive,bpMode=!!P.filterBp;
   this.svfK=this.svfKt;
   const sm=this.sm,levels=this.sm,bankBase=Math.round(this.bankPos*31);
   const user=this.userTable&&bankBase===31?this.userTable:null;
   const frameF=this.morph*15,fi=Math.min(14,Math.floor(frameF)),ff=frameF-fi;
   const fbA=this.fbAmt,grunge=!!P.feedbackGrunge;
   // pre-resolve wavetable frames for this block
   let tA=null,tB=null;
   if(!user){tA=this.frameTables(bankBase,fi);tB=this.frameTables(bankBase,fi+1);}
   const wave1=P.osc1Wave,wave2=P.osc2Wave,wave3=P.osc3Wave;
   const shape1=clamp((P.osc1Shape===undefined?.5:P.osc1Shape)+this.mods[D.osc1Shape]),shape2=clamp((P.osc2Shape===undefined?.5:P.osc2Shape)+this.mods[D.osc2Shape]);
   const sync=P.osc2Sync||P.osc1Sync;
   const v0=this.voices[0],v1=this.voices[1],v2=this.voices[2];
   const inc0=this.oscInc[0],inc1=this.oscInc[1],inc2=this.oscInc[2];
   const act0=para?(v0.gate||v0.ampNow>.0001):true,act1=para?(v1.gate||v1.ampNow>.0001):true,act2=para?(v2.gate||v2.ampNow>.0001):true;
   const active=para?(act0||act1||act2):(this.voices.some(v=>v.gate)||this.envs.amp.v>.0001);
   const noiseLvl=sm.noise*.3,fxActive=true;
   for(let i=0;i<n;i++){
    const t=(i+1)/n;
    this.G=gA+(gB-gA)*t;this.k=kA+(kB-kA)*t;
    let raw=0;
    // osc 1
    let wrapFrac=-1;
    if(act0){
     let np=v0.phase+inc0;if(np>=1){np-=1;wrapFrac=np/inc0;}v0.phase=np;
     const g=para?(v0.ampPrev+(v0.ampNow-v0.ampPrev)*t):1;
     raw+=this.oscSample(0,wave1,shape1,v0,inc0)*levels.l1*g;
    }
    if(act1){
     let np=v1.phase+inc1;if(np>=1)np-=1;
     if(sync&&wrapFrac>=0){
      const before=v1.phase;
      np=wrapFrac*inc1;
      // polyBLEP-style step correction for the hard-sync discontinuity
      v1.phase=np;const after=this.oscSample(1,wave2,shape2,v1,inc1);v1.phase=before;const old=this.oscSample(1,wave2,shape2,v1,inc1);
      v1.syncCorr=(after-old)*.5*(wrapFrac*wrapFrac*0+ (2*wrapFrac-wrapFrac*wrapFrac-1));
     }
     v1.phase=np;
     const g=para?(v1.ampPrev+(v1.ampNow-v1.ampPrev)*t):1;
     let s=this.oscSample(1,wave2,shape2,v1,inc1);
     if(v1.syncCorr){s+=v1.syncCorr;v1.syncCorr*=.0;}
     raw+=s*levels.l2*g;
    }
    if(act2){
     let np=v2.phase+inc2;if(np>=1)np-=1;v2.phase=np;
     const g=para?(v2.ampPrev+(v2.ampNow-v2.ampPrev)*t):1;
     let s;
     if(wave3==="wavetable"){
      const lvl=Math.min(5,Math.max(0,Math.ceil(Math.log2(32/Math.max(1,Math.min(32,Math.floor(.46/inc2)))))));
      let a,bb;
      if(user){const pos=np*user.length,j=pos|0,fr=pos-j;a=user[j%user.length]*(1-fr)+user[(j+1)%user.length]*fr;bb=a;}
      else{const pos=np*TS,j=pos|0,fr=pos-j,j2=(j+1)&(TS-1),ta=tA[lvl],tb=tB[lvl];a=ta[j]*(1-fr)+ta[j2]*fr;bb=tb[j]*(1-fr)+tb[j2]*fr;}
      s=a+(bb-a)*ff;
     }else if(wave3==="superSaw"){
      for(let j=0;j<7;j++){let pj=v2.ss[j]+inc2*(1+(j-3)*.0035*(.2+this.morph));if(pj>=1)pj-=1;v2.ss[j]=pj;}
      s=this.oscSample(2,"superSaw",.5,v2,inc2);
     }else s=this.oscSample(2,wave3||"saw",clamp(P.osc3Shape>1?.5:.5),v2,inc2);
     raw+=s*levels.l3*g;
    }
    raw+=rnd()*noiseLvl;
    raw*=.3;
    // filter + drive
    let y=this.filterSample(raw,type,state,bpMode,drive);
    // tuned feedback loop
    let fbPos=this.fbWrite-this.fbDelay;if(fbPos<0)fbPos+=this.fb.length;const fi0=fbPos|0,ffr=fbPos-fi0,fbv=this.fb[fi0]*(1-ffr)+this.fb[fi0+1>=this.fb.length?0:fi0+1]*ffr;
    this.fbLp+=.6*(fbv-this.fbLp);
    const fbIn=grunge?fastTanh(y+this.fbLp*fbA*4):y+this.fbLp*fbA;
    this.fb[this.fbWrite]=Math.max(-3,Math.min(3,fastTanh(fbIn)));this.fbWrite=this.fbWrite+1>=this.fb.length?0:this.fbWrite+1;
    y=y+this.fbLp*fbA*.8;
    const amp=ampA+(ampB-ampA)*t;
    y=fastTanh(y*amp*2.2);
    // effects
    this.fxRun(0,y,y);const l1=this.outL,r1=this.outR;
    this.fxRun(1,l1,r1);let l=this.outL,r=this.outR;
    const vol=volA+(volB-volA)*t,pan=.04*Math.sin(this.touch*Math.PI);
    l*=vol*(1-pan);r*=vol*(1+pan);
    // DC blocker + soft limiter
    const ol=l-this.dcInL+.9975*this.dcOutL;this.dcInL=l;this.dcOutL=ol;
    const or=r-this.dcInR+.9975*this.dcOutR;this.dcInR=r;this.dcOutR=or;
    L[b+i]=fastTanh(ol*.9)*1.05;R[b+i]=fastTanh(or*.9)*1.05;
   }
   this.G=gB;this.k=kB;this.ampPrev=ampB;this.volPrev=volB;
   if(!active&&!this.p.arpEnabled&&false)this.s1=this.s2=this.s3=this.s4=0;
  }
  return true;
 }
}
registerProcessor("pro3-processor",Pro3Processor);
