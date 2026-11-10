/* Sequential Pro 3 - Overture AudioWorklet.
   Procedural, instrument-specific model: two analogue-style VCOs, a wavetable
   DDS, shared paraphonic filter/envelopes, three filter topologies, tuned
   feedback, modulation, effects and sample-clocked sequencing. */
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,Number(x)||0));
const midiHz=n=>440*Math.pow(2,(n-69)/12);
const smooth=(a,b,t)=>a+(b-a)*t;
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
 bpm:120,glide:0,hold:false,mod:0,bend:0,aftertouch:0,touch:0,volume:.72,
 fx1Type:"stereoDelay",fx1Mix:.18,fx1Time:.28,fx1Feedback:.28,fx1Tone:.55,
 fx2Type:"superPlate",fx2Mix:.16,fx2Time:.42,fx2Feedback:.25,fx2Tone:.6,
 feedbackAmount:0,feedbackTune:24,feedbackGrunge:false,
 arpEnabled:false,arpMode:"up",arpDivision:4,arpSwing:0,arpLatch:false,
 seqEnabled:false,seqMode:"forward",seqLength:16,seqSwing:0,seqGate:.72,
 seqTracks:Array.from({length:16},()=>Array(64).fill(null)),
 seqDestinations:Array.from({length:16},(_,i)=>i===0?"note":i===1?"osc1Shape":i===2?"filterCutoff":"none"),
 seqPhrase:"A",seqLinked:false,seqTrack:0,seqRecord:false,
 modRoutes:[],morph:0
};
function makeEnv(){return {v:0,stage:"idle",time:0,gate:false};}
function polyBlep(t,dt){
 if(dt<=0)return 0;
 if(t<dt){const x=t/dt;return x+x-x*x-1;}
 if(t>1-dt){const x=(t-1)/dt;return x*x+x+x+1;}
 return 0;
}
function wave(kind,pw,phase,dt=0){
 const p=((phase%1)+1)%1,d=Math.min(.49,Math.max(0,dt)),duty=clamp(pw,.02,.98);
 if(kind==="sine")return Math.sin(p*Math.PI*2);
 if(kind==="triangle")return 1-4*Math.abs(p-.5);
 if(kind==="pulse")return (p<duty?1:-1)+polyBlep(p,d)-polyBlep((p-duty+1)%1,d);
 if(kind==="square")return (p<.5?1:-1)+polyBlep(p,d)-polyBlep((p-.5+1)%1,d);
 if(kind==="reverseSaw")return 1-2*p+polyBlep(p,d);
 return 2*p-1-polyBlep(p,d);
}
function makeTables(){
 const tableSize=256,lookupSize=4096;
 const sine=new Float32Array(lookupSize);
 for(let i=0;i<lookupSize;i++)sine[i]=Math.sin(2*Math.PI*i/lookupSize);
 const tables=[];
 for(let t=0;t<32;t++){
  const bank=[];
  for(let f=0;f<16;f++){
   const data=new Float32Array(tableSize);let peak=0;
   for(let h=1;h<=10;h++){
    const weight=(1/Math.pow(h,1+t*.013))*Math.cos((f+1)*h*.31+t*.09);
    const step=Math.round(h*lookupSize/tableSize);
    for(let i=0;i<tableSize;i++)data[i]+=weight*sine[(i*step)%lookupSize];
   }
   for(let i=0;i<tableSize;i++){peak=Math.max(peak,Math.abs(data[i]));}
   const norm=peak||1;for(let i=0;i<tableSize;i++)data[i]/=norm;
   bank.push(data);
  }
  tables.push(bank);
 }
 return tables;
}
class Pro3Processor extends AudioWorkletProcessor{
 constructor(){
  super();this.p={...DEFAULT};this.tables=makeTables();this.userTable=null;
  this.voices=Array.from({length:3},(_,i)=>({note:60,gate:false,order:0,phase:[0,0,0],drift:Math.random()*6.28,slop:(Math.random()-.5)*.012,ampEnv:makeEnv(),velocity:.8}));
  this.currentNote=60;this.lastNote=60;this.order=0;this.held=new Map();this.arpLatched=new Set();this.sustain=false;this.bend=0;this.mod=0;this.at=0;this.touch=0;this.velocity=.8;
  this.envs={filter:makeEnv(),amp:makeEnv(),aux1:makeEnv(),aux2:makeEnv()};
  this.lfos=[{phase:0,hold:0,last:0},{phase:0,hold:0,last:0},{phase:0,hold:0,last:0}];
  this.filterState=[0,0,0,0];this.filterStateL=[0,0,0,0];this.filterStateR=[0,0,0,0];
  this.svf=[0,0];this.svfL=[0,0];this.svfR=[0,0];
  this.fb=new Float32Array(Math.max(1024,sampleRate*2));this.fbWrite=0;
  const makeFx=()=>({bufL:new Float32Array(sampleRate*2),bufR:new Float32Array(sampleRate*2),write:0,phase:0,lp:0,lpL:0,lpR:0,hpL:0,hpR:0,
    apL:[0,0,0,0],apR:[0,0,0,0],plateL:0,plateR:0});
  this.fx=[makeFx(),makeFx()];
  this.seqStep=0;this.seqPhase=0;this.seqRunning=false;this.arpPhase=0;this.arpStep=0;this.arpNote=-1;this.seqNote=-1;this.externalClock=0;
  this.auto={};this.frame=0;this.port.onmessage=e=>this.message(e.data);
 }
 message(m){
  if(m.t==="patch"){
   this.p={...DEFAULT,...m.patch};this.p.seqTracks=m.patch.seqTracks||DEFAULT.seqTracks;this.p.seqDestinations=m.patch.seqDestinations||DEFAULT.seqDestinations;this.p.modRoutes=m.patch.modRoutes||[];if(Number(this.p.feedbackTune)<=1)this.p.feedbackTune=Number(this.p.feedbackTune||0)*48;
   this.lfos.forEach((l,i)=>{l.paramPhase=null;});
   return;
  }
  if(m.t==="param"){
   const old=this.p[m.key];this.p[m.key]=m.value;
   if(m.key==="volume"||m.key==="distortion")this.p[m.key]=clamp(m.value);
   if(m.key==="feedbackAmount")this.p[m.key]=clamp(m.value,-1,1);
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
  else if(m.t==="transport"){this.seqRunning=!!m.play;this.seqStep=0;this.seqPhase=0;this.arpPhase=0;this.arpStep=0;if(!this.seqRunning&&this.seqNote>=0){this.noteOff(this.seqNote);this.seqNote=-1;}}
  else if(m.t==="clock"){this.externalClock=(this.externalClock+1)%24;if(this.externalClock===0){this.seqPhase=1;this.arpPhase=1;}}
  else if(m.t==="wavetable"){if(m.data&&m.data.length>=64){const data=new Float32Array(m.data);let peak=0;for(const x of data)peak=Math.max(peak,Math.abs(x));if(peak>0)for(let i=0;i<data.length;i++)data[i]/=peak;this.userTable=data;}}
  else if(m.t==="feedbackClear")this.fb.fill(0);
  else if(m.t==="panic"){this.held.clear();this.voices.forEach(v=>{v.gate=false;});Object.values(this.envs).forEach(e=>{e.gate=false;e.stage="release";});}
 }
 noteOn(note,vel){
  this.held.set(note,vel);this.arpLatched.delete(note);this.velocity=vel;
  if(this.p.arpEnabled)return;
  this.trigger(note,vel);
 }
 trigger(note,vel){
  const startVoiceAmp=v=>{
   v.ampEnv.gate=true;v.velocity=vel;
   if(v.ampEnv.stage==="idle"||v.ampEnv.stage==="release"||!v.ampEnv.gate){v.ampEnv.stage="delay";v.ampEnv.time=0;v.ampEnv.v=0;}
  };
  if(this.p.mode==="paraphonic"){
   const v=this.voices.find(x=>!x.gate)||this.voices.slice().sort((a,b)=>a.order-b.order)[0];
   v.note=note;v.gate=true;v.order=++this.order;startVoiceAmp(v);
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
  if(this.p.mode==="paraphonic")this.voices.forEach(v=>{if(v.note===note){v.gate=false;v.ampEnv.gate=false;if(v.ampEnv.stage!=="idle")v.ampEnv.stage="release";}});
  else if(this.currentNote===note){const next=[...this.held.entries()].sort((a,b)=>b[0]-a[0])[0];if(next){this.currentNote=next[0];this.voices.forEach(v=>v.note=next[0]);}else this.voices.forEach(v=>v.gate=false);}
  this.updateSharedGate();
 }
 releaseUnheld(){if(this.held.size||this.p.hold)return;this.voices.forEach(v=>{v.gate=false;v.ampEnv.gate=false;if(v.ampEnv.stage!=="idle")v.ampEnv.stage="release";});this.updateSharedGate();}
 updateSharedGate(){const gate=this.voices.some(v=>v.gate);Object.values(this.envs).forEach(e=>{if(!gate){e.gate=false;if(e.stage!=="idle")e.stage="release";}});}
 envTickState(e,prefix,dt){
  const delay=clamp(this.p[prefix+"Delay"]||0)*2,attack=.001+Math.pow(clamp(this.p[prefix+"Attack"]||0),2)*8,
        decay=.002+Math.pow(clamp(this.p[prefix+"Decay"]||0),2)*6,sustain=clamp(this.p[prefix+"Sustain"]||0),release=.005+Math.pow(clamp(this.p[prefix+"Release"]||0),2)*8;
  if(e.gate&&e.stage==="idle")e.stage="delay";
  if(!e.gate&&e.stage!=="idle"&&e.stage!=="release")e.stage="release";
  if(e.stage==="delay"){e.time+=dt;if(e.time>=delay){e.stage="attack";e.time=0;}}
  else if(e.stage==="attack"){e.v+=(1-e.v)*(1-Math.exp(-dt/attack));if(e.v>.999){e.v=1;e.stage="decay";}}
  else if(e.stage==="decay"){e.v+=(sustain-e.v)*(1-Math.exp(-dt/decay));if(Math.abs(e.v-sustain)<.001)e.stage="sustain";}
  else if(e.stage==="sustain"){e.v=sustain;}
  else if(e.stage==="release"){e.v*=Math.exp(-dt/release);if(e.v<.0001){e.v=0;e.stage="idle";}}
  if(this.p[prefix+"Loop"]&&e.gate&&e.stage==="sustain"){e.stage="attack";e.v=0;}
  return e.v;
 }
 envTick(name,dt){
  const prefix=name==="filter"?"filter":name==="amp"?"amp":name;
  return this.envTickState(this.envs[name],prefix,dt);
 }
 lfoValue(index,dt){
  const names=["lfo1","lfo2","lfo3"],key=names[index],l=this.lfos[index],raw=clamp(this.p[key+"Rate"]);
  const bpm=clamp(this.p.bpm||120,30,260);
  const hz=this.p[key+"Sync"]?(bpm/60)*Math.pow(2,raw*6-4):.022*Math.pow(10,raw*4.36);
  const phaseTarget=clamp(this.p[key+"Phase"]||0);
  if(l.paramPhase!==phaseTarget){l.phase=phaseTarget;l.paramPhase=phaseTarget;}
  l.phase+=hz*dt;let wrapped=false;if(l.phase>=1){l.phase-=Math.floor(l.phase);wrapped=true;}
  const shape=this.p[key+"Wave"];
  let v=shape==="square"?(l.phase<.5?1:-1)
   :shape==="saw"?(l.phase*2-1)
   :shape==="reverseSaw"?(1-l.phase*2)
   :shape==="triangle"?(1-4*Math.abs(l.phase-.5))
   :shape==="sampleHold"?(wrapped?((Math.random()*2)-1):l.hold)
   :Math.sin(l.phase*2*Math.PI);
  if(shape==="sampleHold"&&wrapped)l.hold=v;
  const slew=clamp(this.p[key+"Slew"]);l.last+=(v-l.last)*(1-slew*.995);
  return l.last*clamp(this.p[key+"Amount"]);
 }
 sourceValue(source,lf,env,notes){
  if(source==="LFO 1")return lf[0];if(source==="LFO 2")return lf[1];if(source==="LFO 3")return lf[2];
  if(source==="Filter Env")return env.filter;if(source==="Amp Env")return env.amp;if(source==="Aux Env 1")return env.aux1;if(source==="Aux Env 2")return env.aux2;
  if(source==="Mod Wheel")return this.mod;if(source==="Aftertouch")return this.at;if(source==="Touch Slider")return this.touch;
  if(source==="Velocity")return this.velocity;if(source==="Key Number")return (notes-60)/48;
  if(source==="Sequencer")return this.seqStep/63;return 0;
 }
 wavetable(phase,table,frame){
  if(this.userTable&&table===31){const a=phase*this.userTable.length,i=Math.floor(a)%this.userTable.length,f=a-Math.floor(a);return smooth(this.userTable[i],this.userTable[(i+1)%this.userTable.length],f);}
  const bank=this.tables[clamp(Math.round(table),0,31)],pos=clamp(frame)*15,i=Math.floor(pos),f=pos-i;
  const sample=wave=>{const a=phase*wave.length,j=Math.floor(a)%wave.length,q=a-Math.floor(a);return smooth(wave[j],wave[(j+1)%wave.length],q);};
  return smooth(sample(bank[i]),sample(bank[Math.min(15,i+1)]),f);
 }
 filter(x,cutoff,res,type,state,sr,channel='L'){
  const fc=clamp(cutoff,25,sr*.43),q=clamp(res,0,.97);
  const g=Math.tan(Math.PI*fc/sr),k=2-1.96*q;
  const svf=channel==='R'?this.svfR:this.svfL;
  if(type==="svf"){
   const a1=1/(1+g*(g+k)),v1=a1*(svf[0]+g*(x-svf[1])),v2=svf[1]+g*v1;
   svf[0]=2*v1-svf[0];svf[1]=2*v2-svf[1];
   const lp=v2,bp=v1,hp=x-k*v1-v2,notch=lp+hp,n=clamp(state);
   if(n<.25)return smooth(lp,notch,n*4);
   if(n<.5)return smooth(notch,hp,(n-.25)*4);
   if(n<.75)return smooth(hp,bp,(n-.5)*4);
   return smooth(bp,lp,(n-.75)*4);
  }
  if(type==="ladder"){
   const stages=channel==='R'?this.filterStateR:this.filterStateL;
   const resonance=q*(0.92+q*.08),input=Math.tanh(x-stages[3]*resonance*3.7);
   let y=input;
   for(let i=0;i<4;i++){
    const z=Math.tanh(y);
    stages[i]+=g/(1+g)*(z-stages[i]);
    y=stages[i];
   }
   return Math.tanh(y*(1+q*1.4));
  }
  // Prophet-6 four-pole transistor/Curtis-style low-pass: a softer, brighter
  // cascade with a separate resonance compensation curve from the ladder.
  const stages=channel==='R'?this.filterStateR:this.filterStateL;
  const feedback=q*q*2.15;
  let y=Math.tanh(x-stages[3]*feedback);
  const gain=g/(1+g);
  for(let i=0;i<4;i++){
   const z=Math.tanh(y*(1+.18*q));
   stages[i]+=gain*(z-stages[i]);
   y=stages[i];
  }
  return Math.tanh(y*(1+q*.9));
 }
 fxProcess(xL,xR,index,p,dt){
  const f=this.fx[index],prefix="fx"+(index+1),type=p[prefix+"Type"],mix=clamp(p[prefix+"Mix"]);
  if(type==="off"||mix===0)return [xL,xR];
  const tone=clamp(p[prefix+"Tone"]),feedback=clamp(p[prefix+"Feedback"],0,.88),len=f.bufL.length;
  const baseTime=.008+clamp(p[prefix+"Time"])*.9,write=f.write;
  f.phase+=dt*(.12+clamp(p[prefix+"Time"])*3.8);
  const read=(delay)=>{const d=Math.max(2,Math.min(len-2,Math.floor(delay*sampleRate)));const at=(write-d+len)%len;return [f.bufL[at],f.bufR[at]];};
  const writeSample=(l,r)=>{f.bufL[write]=l;f.bufR[write]=r;f.write=(write+1)%len;};
  const output=(l,r)=>[xL*(1-mix)+l*mix,xR*(1-mix)+r*mix];
  if(type==="ringMod"){
   const frequency=20+clamp(p[prefix+"Time"])*1800;
   f.phase+=dt*frequency*2*Math.PI;
   const left=Math.sin(f.phase),right=Math.sin(f.phase+.19);
   writeSample(xL,xR);return output(xL*left,xR*right);
  }
  if(type==="digitalDistortion"){
   const drive=1+Math.pow(tone,2)*34,comp=1/Math.sqrt(drive);
   return output(Math.tanh(xL*drive)*comp,Math.tanh(xR*drive)*comp);
  }
  if(type==="highPass"){
   const cutoff=35*Math.pow(2,tone*9),a=Math.exp(-2*Math.PI*cutoff/sampleRate);
   f.hpL=xL+(f.hpL-xL)*a;f.hpR=xR+(f.hpR-xR)*a;
   return output(xL-f.hpL,xR-f.hpR);
  }
  if(type==="chorus"){
   const t=.016+Math.sin(f.phase*2*Math.PI)*.010;
   const [wl,wr]=read(t);
   writeSample(xL,xR);
   return output(wl,wr);
  }
  if(type==="flanger"){
   const t=.0012+Math.sin(f.phase*2*Math.PI)*.0038;
   const [wl,wr]=read(t);
   writeSample(xL+wl*feedback*.65,xR+wr*feedback*.65);
   return output(wl,wr);
  }
  if(type==="phaser"){
   const coefficient=.12+.78*(.5+.5*Math.sin(f.phase*2*Math.PI));
   let l=xL,r=xR;
   for(let i=0;i<4;i++){
    const oldL=f.apL[i],oldR=f.apR[i];
    const nextL=-coefficient*l+oldL,nextR=-coefficient*r+oldR;
    f.apL[i]=l+coefficient*nextL;f.apR[i]=r+coefficient*nextR;
    l=nextL;r=nextR;
   }
   return output(l,r);
  }
  if(type==="rotary"){
   const wow=Math.sin(f.phase*2*Math.PI),flutter=Math.sin(f.phase*2*Math.PI*5);
   const t=.009+clamp(p[prefix+"Time"])*.018+wow*.006+flutter*.0015;
   const [wl,wr]=read(t);
   const ampL=.72+.28*Math.sin(f.phase*2*Math.PI),ampR=.72+.28*Math.sin(f.phase*2*Math.PI+.75);
   writeSample(xL,xR);
   return output(wl*ampL,wr*ampR);
  }
  if(type==="superPlate"){
   const taps=[.029,.037,.043,.053],wetL=[],wetR=[];
   taps.forEach(t=>{const pair=read(t);wetL.push(pair[0]);wetR.push(pair[1]);});
   const l=(wetL[0]+wetL[2])*.5,r=(wetR[1]+wetR[3])*.5;
   f.plateL+=.16*(l-f.plateL);f.plateR+=.16*(r-f.plateR);
   const dampL=f.plateL*(.35+.65*tone),dampR=f.plateR*(.35+.65*tone);
   writeSample(xL+dampR*feedback*.72,xR+dampL*feedback*.72);
   return output(l,r);
  }
  const [wetL,wetR]=read(baseTime);
  if(type==="bbdDelay"){
   f.lpL+=(.08+.82*tone)*(wetL-f.lpL);f.lpR+=(.08+.82*tone)*(wetR-f.lpR);
   const steps=clamp(Math.round(4+tone*24),4,28);
   const quantL=Math.round(f.lpL*steps)/steps,quantR=Math.round(f.lpR*steps)/steps;
   writeSample(xL+quantL*feedback,xR+quantR*feedback);
   return output(quantL,quantR);
  }
  // Stereo delay uses cross-feedback; its two channels do not simply repeat the
  // same mono buffer and can build a wide ping-pong pattern.
  writeSample(xL+wetR*feedback,xR+wetL*feedback);
  return output(wetL,wetR);
 }
 advanceSequencer(dt){
  if(this.seqRunning){
   const swing=clamp(this.p.seqSwing)*.42;
   const stepRate=(clamp(this.p.bpm,30,260)/60)*dt*((this.seqStep%2)?1-swing:1+swing);
   this.seqPhase+=stepRate;
   if(this.seqNote>=0&&this.seqPhase>=clamp(this.p.seqGate,.05,1)){this.noteOffArp(this.seqNote);this.seqNote=-1;}
   if(this.seqPhase>=1){this.seqPhase-=1;this.sequenceTick();}
  }
  if(this.p.arpEnabled&&!this.held.size&&this.arpNote>=0){this.noteOffArp(this.arpNote);this.arpNote=-1;}
  if(this.p.arpEnabled&&this.held.size){
   const arpSwing=clamp(this.p.arpSwing)*.42;
   this.arpPhase+=(clamp(this.p.bpm,30,260)/60)*dt*(4/Math.max(1,Number(this.p.arpDivision)||4))*((this.arpStep%2)?1-arpSwing:1+arpSwing);
   if(this.arpPhase>=1){this.arpPhase-=1;const notes=this.p.arpMode==="assign"?[...this.held.keys()]:[...this.held.keys()].sort((a,b)=>a-b),range=clamp(Math.round(this.p.arpRange||1),1,4),total=notes.length*range,step=this.arpStep++%total,octave=Math.floor(step/notes.length);let idx=step%notes.length;if(this.p.arpMode==="down")idx=notes.length-1-idx;else if(this.p.arpMode==="random")idx=Math.floor(Math.random()*notes.length);else if(this.p.arpMode==="upDown"){const span=Math.max(1,total*2-2),x=this.arpStep%(span);const absolute=x<total?x:span-x;idx=absolute%notes.length;}
    const n=notes[idx]+octave*12;if(this.arpNote>=0)this.noteOffArp(this.arpNote);this.trigger(n,this.held.get(n)||.8);this.arpNote=n;
   }
  }
 }
 noteOffArp(n){if(this.p.mode==="paraphonic")this.voices.forEach(v=>{if(v.note===n){v.gate=false;v.ampEnv.gate=false;if(v.ampEnv.stage!=="idle")v.ampEnv.stage="release";}});else if(this.currentNote===n){this.voices.forEach(v=>{v.gate=false;});}this.updateSharedGate();}
 sequenceTick(){
  const len=clamp(Number(this.p.seqLength)||16,1,64),mode=this.p.seqMode;let step=this.seqStep;
  if(mode==="reverse")step=(len-1-this.seqStep)%len;else if(mode==="random")step=Math.floor(Math.random()*len);
  else if(mode==="forwardReverse"){const n=this.seqStep%(len*2-2||1);step=n<len?n:len*2-2-n;}
  this.seqStep=(this.seqStep+1)%len;
  const tracks=this.p.seqTracks||[];
  if(this.seqNote>=0){this.noteOffArp(this.seqNote);this.seqNote=-1;}
  const get=(i)=>tracks[i]&&tracks[i][step];
  const n=get(0);
  if(n!==null&&n!==undefined&&Number(n)>=0){const note=clamp(Number(n),24,108);this.trigger(note,.82);this.seqNote=note;}
  if(this.p.mode==="paraphonic"){for(let i=1;i<3;i++){const v=get(i);if(v!==null&&v!==undefined){const voice=this.voices[i];voice.note=clamp(Number(v),24,108);voice.gate=true;voice.ampEnv.gate=true;voice.ampEnv.stage="attack";voice.ampEnv.time=0;voice.ampEnv.v=0;}}}
  this.auto={};for(let i=3;i<16;i++){const v=get(i);if(v!==null&&v!==undefined)this.auto[this.p.seqDestinations?.[i]||"none"]=clamp(v);}
 }
 process(_inputs,outputs){
  const out=outputs[0],L=out[0],R=out[1]||out[0],sr=sampleRate,dt=1/sr;
  for(let i=0;i<L.length;i++){
   this.advanceSequencer(dt);
   const lf=[this.lfoValue(0,dt),this.lfoValue(1,dt),this.lfoValue(2,dt)];
   const sharedGate=this.voices.some(v=>v.gate)||this.p.hold;
   Object.values(this.envs).forEach(e=>{e.gate=sharedGate;});
   const env={filter:this.envTick("filter",dt),amp:this.envTick("amp",dt),aux1:this.envTick("aux1",dt),aux2:this.envTick("aux2",dt)};
   const mods={};
   for(const route of (this.p.modRoutes||[])){if(!route||!route.destination||route.destination==='none')continue;const src=this.sourceValue(route.source,lf,env,this.currentNote);mods[route.destination]=(mods[route.destination]||0)+src*(Number(route.amount)||0);}
   this.currentMods=mods;
   let raw=0;
   for(let oi=0;oi<3;oi++){
    const v=this.voices[oi],note=this.p.mode==="paraphonic"?v.note:this.currentNote;
    if(this.p.mode==="paraphonic"?!v.gate&&v.ampEnv.v<.0001:!v.gate&&env.amp<.0001)continue;
    const oscillatorAmp=this.p.mode==="paraphonic"?this.envTickState(v.ampEnv,"amp",dt):1;
    const pitchDest='osc'+(oi+1)+'Pitch',shapeDest='osc'+(oi+1)+'Shape';const pitchMod=(mods[pitchDest]||0)*24+(this.bend*(this.p.bendRange||2))+(this.mod*.01)+(this.at*.012);
    const semi=(oi===0?Number(this.p.osc1Octave)||0:oi===1?Number(this.p.osc2Octave)||0:Number(this.p.osc3Octave)||0)*12;
    const tune=(oi===0?this.p.osc1Tune:oi===1?this.p.osc2Tune:this.p.osc3Tune)||0;
    const slide=clamp((oi===0?this.p.osc1Glide:oi===1?this.p.osc2Glide:this.p.osc3Glide)||this.p.glide||0);
    const targetHz=midiHz(note+semi+tune+pitchMod+(v.slop*(oi===0?1:oi===1?1.1:.2)));
    v.glideHz=v.glideHz||targetHz;v.glideHz+=(targetHz-v.glideHz)*(slide>0?1-Math.exp(-dt/(.004+slide*1.8)):1);const f0=v.glideHz;
    v.drift+=dt*(.07+oi*.03);
    const hz=f0*Math.pow(2,Math.sin(v.drift)*((Number(oi===0?this.p.osc1Slop:oi===1?this.p.osc2Slop:this.p.osc3Slop)||0)*.008));
    const inc=hz/sr;const old=v.phase[oi];v.phase[oi]=(v.phase[oi]+inc)%1;
    const key="osc"+(oi+1),waveName=this.p[key+"Wave"],shape=clamp((this.p[key+"Shape"]||.5)+(mods[shapeDest]||0));
    let s;const rawShape=Number(this.p[key+"Shape"]);const oscShape=clamp(Number.isFinite(rawShape)?rawShape:.5);
    if(oi===2&&waveName==="wavetable")s=this.wavetable(v.phase[oi],Math.floor(shape*31),clamp((Number(this.p.osc3ShapeMod)||0)+lf[2]*.2+(mods.osc3ShapeMod||0)+(this.auto.osc3Shape||0)));
    else if(oi===2&&waveName==="superSaw"){
      s=0;for(let k=-3;k<=3;k++){const det=k*.0025*(this.p.osc3ShapeMod||.2);s+=wave("saw",.5,(v.phase[oi]+det+1)%1,inc)/7;}
    }else s=wave(waveName,clamp(shape,.02,.98),v.phase[oi],inc);
    if(oi===1&&(this.p.osc2Sync||this.p.osc1Sync)&&v.phase[0]<inc)v.phase[1]=0;
    const level=Number(this.p[key+"Level"])||0;
    raw+=s*level*oscillatorAmp;
   }
   raw+=(Math.random()*2-1)*clamp(this.p.noiseLevel)*.3;
   const seqCut=this.auto.filterCutoff??0;
   const keyTrack=((this.currentNote-60)/48)*clamp(this.p.filterKeyTrack)*.22;
   const cutoff=20*Math.pow(2,clamp((this.p.filterCutoff??.5)+(this.p.filterEnvAmount||0)*(env.filter-.3)+keyTrack+lf[0]*.05+(this.mod*.15)+(mods.filterCutoff||0)+(seqCut||0),0,1)*10);
   const filterType=this.p.filterType==="ladder"?"ladder":this.p.filterType==="stateVariable"?"svf":"prophet6";
   const filterMode=clamp(this.p.filterState||0);
   let sampleL=this.filter(raw,cutoff,clamp(this.p.resonance+(mods.resonance||0)),filterType,filterMode,sr,'L');
   let sampleR=this.filter(raw,cutoff,clamp(this.p.resonance+(mods.resonance||0)),filterType,filterMode,sr,'R');
   const drive=1+clamp(this.p.filterDrive)*7+clamp(this.p.distortion)*9;
   sampleL=Math.tanh(sampleL*drive);sampleR=Math.tanh(sampleR*drive);
   const feedbackHz=midiHz(12+clamp(this.p.feedbackTune,0,48));
   const delaySamples=Math.max(2,Math.floor(sr/feedbackHz));
   const fbRead=(this.fbWrite-delaySamples+this.fb.length)%this.fb.length,feedback=this.fb[fbRead];
   const fbAmount=clamp(this.p.feedbackAmount,-1,.96),feedbackInput=(sampleL+sampleR)*.5,fbIn=this.p.feedbackGrunge?Math.tanh(feedbackInput+feedback*fbAmount*4):feedbackInput+feedback*fbAmount;
   this.fb[this.fbWrite]=clamp(fbIn,-3,3);this.fbWrite=(this.fbWrite+1)%this.fb.length;
   const amp=(this.p.mode==="paraphonic"?1:env.amp)*this.velocity*.22*(1+(mods.ampLevel||0));
   sampleL=(sampleL+feedback*fbAmount*.8)*amp;sampleR=(sampleR+feedback*fbAmount*.78)*amp;
   let left=sampleL,right=sampleR;
   [left,right]=this.fxProcess(left,right,0,this.p,dt);[left,right]=this.fxProcess(left,right,1,this.p,dt);
   const pan=.05*Math.sin(this.touch*Math.PI);
   L[i]=Math.tanh(left)*(.75-pan)*this.p.volume;
   R[i]=Math.tanh(right)*(.75+pan)*this.p.volume;
  }
  return true;
 }
}
registerProcessor("pro3-processor",Pro3Processor);