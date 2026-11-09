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
 noiseLevel:0,externalLevel:0,filterType:"prophet6",filterCutoff:.68,resonance:.16,filterState:0,filterKeyTrack:.35,filterEnvAmount:.38,filterDrive:.08,distortion:.08,
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
 feedbackAmount:0,feedbackTune:.5,feedbackGrunge:false,
 arpEnabled:false,arpMode:"up",arpDivision:4,arpSwing:0,arpLatch:false,
 seqEnabled:false,seqMode:"forward",seqLength:16,seqSwing:0,seqGate:.72,
 seqTracks:Array.from({length:16},()=>Array(64).fill(null)),
 seqDestinations:Array.from({length:16},(_,i)=>i===0?"note":i===1?"osc1Shape":i===2?"filterCutoff":"none"),
 seqPhrase:"A",seqLinked:false,seqTrack:0,seqRecord:false,
 modRoutes:[],morph:0
};
function makeEnv(){return {v:0,stage:"idle",time:0,gate:false};}
function wave(kind,pw,phase){
 const p=((phase%1)+1)%1;
 if(kind==="sine")return Math.sin(p*Math.PI*2);
 if(kind==="triangle")return 1-4*Math.abs(p-.5);
 if(kind==="pulse")return p<pw?1:-1;
 if(kind==="square")return p<.5?1:-1;
 if(kind==="reverseSaw")return 1-2*p;
 return 2*p-1;
}
function makeTables(){
 const tables=[];
 for(let t=0;t<32;t++){
  const bank=[];
  for(let f=0;f<16;f++){
   const data=new Float32Array(1024);let peak=0;
   for(let i=0;i<data.length;i++){
    const p=i/data.length;let x=0;
    for(let h=1;h<=22;h++){
     const weight=(1/Math.pow(h,1+t*.013))*Math.cos((f+1)*h*.31+t*.09);
     x+=weight*Math.sin(2*Math.PI*h*p);
    }
    data[i]=x;peak=Math.max(peak,Math.abs(x));
   }
   for(let i=0;i<data.length;i++)data[i]/=peak||1;
   bank.push(data);
  }
  tables.push(bank);
 }
 return tables;
}
class Pro3Processor extends AudioWorkletProcessor{
 constructor(){
  super();this.p={...DEFAULT};this.tables=makeTables();this.userTable=null;
  this.voices=Array.from({length:3},(_,i)=>({note:60,gate:false,order:0,phase:[0,0,0],drift:Math.random()*6.28,slop:(Math.random()-.5)*.012}));
  this.currentNote=60;this.lastNote=60;this.order=0;this.held=new Map();this.sustain=false;this.bend=0;this.mod=0;this.at=0;this.touch=0;this.velocity=.8;
  this.envs={filter:makeEnv(),amp:makeEnv(),aux1:makeEnv(),aux2:makeEnv()};
  this.lfos=[{phase:0,hold:0,last:0},{phase:0,hold:0,last:0},{phase:0,hold:0,last:0}];
  this.filterState=[0,0,0,0];this.svf=[0,0];this.fb=new Float32Array(Math.max(1024,sampleRate*2));this.fbWrite=0;
  this.fx=[{bufL:new Float32Array(sampleRate*2),bufR:new Float32Array(sampleRate*2),write:0,phase:0,lp:0},
           {bufL:new Float32Array(sampleRate*2),bufR:new Float32Array(sampleRate*2),write:0,phase:0,lp:0}];
  this.seqStep=0;this.seqPhase=0;this.seqRunning=false;this.arpPhase=0;this.arpStep=0;this.arpNote=-1;this.seqNote=-1;this.externalClock=0;
  this.auto={};this.frame=0;this.port.onmessage=e=>this.message(e.data);
 }
 message(m){
  if(m.t==="patch"){this.p={...DEFAULT,...m.patch};this.p.seqTracks=m.patch.seqTracks||DEFAULT.seqTracks;this.p.modRoutes=m.patch.modRoutes||[];return;}
  if(m.t==="param"){this.p[m.key]=m.value;if(m.key==="volume")this.p.volume=clamp(m.value);return;}
  if(m.t==="noteOn")this.noteOn(m.note|0,clamp(m.vel,.01,1));
  else if(m.t==="noteOff")this.noteOff(m.note|0);
  else if(m.t==="bend")this.bend=clamp(m.value,-1,1);
  else if(m.t==="mod")this.mod=clamp(m.value);
  else if(m.t==="at")this.at=clamp(m.value);
  else if(m.t==="touch")this.touch=clamp(m.value);
  else if(m.t==="sustain"){this.sustain=!!m.down;if(!this.sustain)this.releaseUnheld();}
  else if(m.t==="allOff"){this.held.clear();this.voices.forEach(v=>v.gate=false);Object.values(this.envs).forEach(e=>{e.gate=false;e.stage="release";});}
  else if(m.t==="sequence"){this.p.seqTracks=m.tracks||this.p.seqTracks;this.p.seqDestinations=m.destinations||this.p.seqDestinations;this.p.seqLength=m.length||this.p.seqLength;}
  else if(m.t==="transport"){this.seqRunning=!!m.play;this.seqStep=0;this.seqPhase=0;this.arpPhase=0;this.arpStep=0;if(!this.seqRunning&&this.seqNote>=0){this.noteOff(this.seqNote);this.seqNote=-1;}}
  else if(m.t==="clock"){this.externalClock=(this.externalClock+1)%24;if(this.externalClock===0){this.seqPhase=1;this.arpPhase=1;}}
  else if(m.t==="wavetable"){if(m.data&&m.data.length>=64){const data=new Float32Array(m.data);let peak=0;for(const x of data)peak=Math.max(peak,Math.abs(x));if(peak>0)for(let i=0;i<data.length;i++)data[i]/=peak;this.userTable=data;}}
  else if(m.t==="feedbackClear")this.fb.fill(0);
  else if(m.t==="panic"){this.held.clear();this.voices.forEach(v=>{v.gate=false;});Object.values(this.envs).forEach(e=>{e.gate=false;e.stage="release";});}
 }
 noteOn(note,vel){
  this.held.set(note,vel);this.velocity=vel;
  if(this.p.arpEnabled)return;
  this.trigger(note,vel);
 }
 trigger(note,vel){
  if(this.p.mode==="paraphonic"){
   let v=this.voices.find(x=>!x.gate)||this.voices.slice().sort((a,b)=>a.order-b.order)[0];
   v.note=note;v.gate=true;v.order=++this.order;
  }else{
   this.currentNote=note;this.lastNote=note;
   this.voices.forEach(v=>{v.note=note;v.gate=true;v.order=++this.order;});
  }
  Object.values(this.envs).forEach(e=>{if(e.stage==="idle"||e.stage==="release"||!e.gate){e.stage="delay";e.time=0;}e.gate=true;});
 }
 noteOff(note){
  this.held.delete(note);
  if(this.sustain||this.p.hold||this.p.arpEnabled)return;
  if(this.p.mode==="paraphonic")this.voices.forEach(v=>{if(v.note===note)v.gate=false;});
  else if(this.currentNote===note){const next=[...this.held.entries()].sort((a,b)=>b[0]-a[0])[0];if(next){this.currentNote=next[0];this.voices.forEach(v=>v.note=next[0]);}else this.voices.forEach(v=>v.gate=false);}
  this.updateSharedGate();
 }
 releaseUnheld(){if(this.held.size||this.p.hold)return;this.voices.forEach(v=>v.gate=false);this.updateSharedGate();}
 updateSharedGate(){const gate=this.voices.some(v=>v.gate);Object.values(this.envs).forEach(e=>{if(!gate){e.gate=false;if(e.stage!=="idle")e.stage="release";}});}
 envTick(name,dt){
  const e=this.envs[name],prefix=name==="filter"?"filter":name==="amp"?"amp":name;
  const delay=clamp(this.p[prefix+"Delay"]||0)*2,attack=.001+Math.pow(clamp(this.p[prefix+"Attack"]||0),2)*8,
        decay=.002+Math.pow(clamp(this.p[prefix+"Decay"]||0),2)*6,sustain=clamp(this.p[prefix+"Sustain"]||0),release=.005+Math.pow(clamp(this.p[prefix+"Release"]||0),2)*8;
  if(e.gate&&e.stage==="idle")e.stage="delay";
  if(e.stage==="delay"){e.time+=dt;if(e.time>=delay){e.stage="attack";e.time=0;}}
  else if(e.stage==="attack"){e.v+=(1-e.v)*(1-Math.exp(-dt/attack));if(e.v>.999){e.v=1;e.stage="decay";}}
  else if(e.stage==="decay"){e.v+=(sustain-e.v)*(1-Math.exp(-dt/decay));if(Math.abs(e.v-sustain)<.001)e.stage="sustain";}
  else if(e.stage==="sustain"){e.v=sustain;}
  else if(e.stage==="release"){e.v*=Math.exp(-dt/release);if(e.v<.0001){e.v=0;e.stage="idle";}}
  if(this.p[prefix+"Loop"]&&e.gate&&e.stage==="sustain"){e.stage="attack";e.v=0;}
  return e.v;
 }
 lfoValue(index,dt){
  const names=["lfo1","lfo2","lfo3"],key=names[index],rate=.022*Math.pow(10,Math.pow(clamp(this.p[key+"Rate"]),1)*4.36),l=this.lfos[index];
  l.phase+=rate*dt;let wrapped=false;if(l.phase>=1){l.phase-=Math.floor(l.phase);wrapped=true;}
  const shape=this.p[key+"Wave"];let v=shape==="square"?(l.phase<.5?1:-1):shape==="saw"?(l.phase*2-1):shape==="reverseSaw"?(1-l.phase*2):shape==="sampleHold"?(wrapped?((Math.random()*2)-1):l.hold):Math.sin(l.phase*2*Math.PI);
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
 filter(x,cutoff,res,type,state,sr){
  const fc=clamp(cutoff,25,sr*.43),g=1-Math.exp(-2*Math.PI*fc/sr),q=clamp(res,0,.97);
  if(type==="svf"){
   const f=2*Math.sin(Math.PI*fc/sr),k=2-1.96*q;
   const hp=(x-k*this.svf[0]-this.svf[1])/(1+f*(f+k));
   const bp=this.svf[0]+f*hp;const lp=this.svf[1]+f*bp;
   this.svf[0]=2*bp-this.svf[0];this.svf[1]=2*lp-this.svf[1];
   const n=clamp(state,0,1);return n<.5?smooth(lp,(lp+hp)*.5,n*2):smooth((lp+hp)*.5,hp,(n-.5)*2);
  }
  let v=Math.tanh(x+(type==="ladder"?this.filterState[3]*q*3:0));
  for(let i=0;i<4;i++){this.filterState[i]+=g*(Math.tanh(v)-this.filterState[i]);v=this.filterState[i];}
  return Math.tanh(v*(1+q*2.6));
 }
 fxProcess(xL,xR,index,p,dt){
  const f=this.fx[index],type=p["fx"+(index+1)+"Type"],mix=clamp(p["fx"+(index+1)+"Mix"]),time=.015+clamp(p["fx"+(index+1)+"Time"])*1.2,fb=clamp(p["fx"+(index+1)+"Feedback"],0,.88);
  if(type==="off"||mix===0)return [xL,xR];
  const len=f.bufL.length,delay=Math.max(2,Math.min(len-2,Math.floor(time*sampleRate))),read=(f.write-delay+len)%len;
  const wetL=f.bufL[read],wetR=f.bufR[read];
  const modMix=clamp(mix+(this.currentMods?.['fx'+(index+1)+'Mix']||0));
  if(type==="ringMod"){f.phase+=dt*(20+clamp(p["fx"+(index+1)+"Time"])*1800)*2*Math.PI;const ring=Math.sin(f.phase);f.bufL[f.write]=xL;f.bufR[f.write]=xR;f.write=(f.write+1)%len;return [smooth(xL,xL*ring,modMix),smooth(xR,xR*ring,modMix)];}
  if(type==="digitalDistortion"){const drive=1+clamp(p["fx"+(index+1)+"Tone"])*24;return [Math.tanh(xL*drive)*(1-modMix)+xL*modMix,Math.tanh(xR*drive)*(1-modMix)+xR*modMix];}
  if(type==="highPass"){const cutoff=30*Math.pow(2,clamp(p["fx"+(index+1)+"Tone"])*10);const alpha=Math.exp(-2*Math.PI*cutoff/sampleRate);const hpL=xL-f.lp;f.lp=xL+(f.lp-xL)*alpha;return [xL-f.lp,xR-f.lp];}
  if(type==="chorus"||type==="flanger"||type==="phaser"||type==="rotary"){f.phase+=dt*(.12+clamp(p["fx"+(index+1)+"Time"])*4);const mod=Math.sin(f.phase*2*Math.PI)*.012*sampleRate;const d=Math.floor(Math.max(2,delay+mod)),r=(f.write-d+len)%len;const a=f.bufL[r],b=f.bufR[r];f.bufL[f.write]=xL+a*fb;f.bufR[f.write]=xR+b*fb;f.write=(f.write+1)%len;return [smooth(xL,a,modMix),smooth(xR,b,modMix)];}
  const tone=clamp(p["fx"+(index+1)+"Tone"]);f.lp+=(1-tone*.92)*(wetL-f.lp);
  f.bufL[f.write]=xL+f.lp*fb;f.bufR[f.write]=xR+wetR*fb;f.write=(f.write+1)%len;
  const wet=type==="superPlate"?f.lp*.8+wetR*.2:wetL;
  return [smooth(xL,wet,modMix),smooth(xR,wetR,modMix)];
 }
 advanceSequencer(dt){
  if(this.seqRunning){
   const rate=(clamp(this.p.bpm,30,260)/60)*dt;this.seqPhase+=rate;
   if(this.seqPhase>=1){this.seqPhase-=1;this.sequenceTick();}
  }
  if(this.p.arpEnabled&&!this.held.size&&this.arpNote>=0){this.noteOffArp(this.arpNote);this.arpNote=-1;}
  if(this.p.arpEnabled&&this.held.size){
   this.arpPhase+=(clamp(this.p.bpm,30,260)/60)*dt*(4/Math.max(1,Number(this.p.arpDivision)||4));
   if(this.arpPhase>=1){this.arpPhase-=1;const notes=[...this.held.keys()].sort((a,b)=>a-b);let idx=this.arpStep++%notes.length;if(this.p.arpMode==="down")idx=notes.length-1-idx;else if(this.p.arpMode==="random")idx=Math.floor(Math.random()*notes.length);else if(this.p.arpMode==="upDown"){const span=Math.max(1,notes.length*2-2),x=this.arpStep%span;idx=x<notes.length?x:span-x;}
    const n=notes[idx];if(this.arpNote>=0)this.noteOffArp(this.arpNote);this.trigger(n,this.held.get(n)||.8);this.arpNote=n;
   }
  }
 }
 noteOffArp(n){if(this.p.mode==="paraphonic")this.voices.forEach(v=>{if(v.note===n)v.gate=false;});else if(this.currentNote===n)this.voices.forEach(v=>v.gate=false);this.updateSharedGate();}
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
  if(this.p.mode==="paraphonic"){for(let i=1;i<3;i++){const v=get(i);if(v!==null&&v!==undefined){const voice=this.voices[i];voice.note=clamp(Number(v),24,108);voice.gate=true;}}}
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
    if(!v.gate&&env.amp<.0001)continue;
    const pitchDest='osc'+(oi+1)+'Pitch',shapeDest='osc'+(oi+1)+'Shape';const pitchMod=(mods[pitchDest]||0)*24+(this.bend*(this.p.bendRange||2))+(this.mod*.01)+(this.at*.012);
    const semi=(oi===0?Number(this.p.osc1Octave)||0:oi===1?Number(this.p.osc2Octave)||0:Number(this.p.osc3Octave)||0)*12;
    const tune=(oi===0?this.p.osc1Tune:oi===1?this.p.osc2Tune:this.p.osc3Tune)||0;
    const slide=(oi===0?this.p.osc1Glide:oi===1?this.p.osc2Glide:this.p.osc3Glide)||this.p.glide||0;
    const f0=midiHz(note+semi+tune+pitchMod+(v.slop*(oi===0?1:oi===1?1.1:.2)));
    v.drift+=dt*(.07+oi*.03);
    const hz=f0*Math.pow(2,Math.sin(v.drift)*((Number(oi===0?this.p.osc1Slop:oi===1?this.p.osc2Slop:this.p.osc3Slop)||0)*.008));
    const inc=hz/sr;const old=v.phase[oi];v.phase[oi]=(v.phase[oi]+inc)%1;
    const key="osc"+(oi+1),waveName=this.p[key+"Wave"],shape=clamp((this.p[key+"Shape"]||.5)+(mods[shapeDest]||0));
    let s;
    if(oi===2&&waveName==="wavetable")s=this.wavetable(v.phase[oi],Math.floor(shape*31),clamp((Number(this.p.osc3ShapeMod)||0)+lf[2]*.2+(mods.osc3ShapeMod||0)+(this.auto.osc3Shape||0)));
    else if(oi===2&&waveName==="superSaw"){
      s=0;for(let k=-3;k<=3;k++){const det=k*.0025*(this.p.osc3ShapeMod||.2);s+=wave("saw",.5,(v.phase[oi]+det+1)%1)/7;}
    }else s=wave(waveName,clamp(shape,.02,.98),v.phase[oi]);
    if(oi===1&&this.p.osc2Sync&&v.phase[0]<inc)v.phase[1]=0;
    if(oi===1&&this.p.osc1Sync&&v.phase[0]<inc)v.phase[1]=0;
    const level=Number(this.p[key+"Level"])||0;
    raw+=s*level;
   }
   raw+=(Math.random()*2-1)*clamp(this.p.noiseLevel)*.3;
   const seqCut=this.auto.filterCutoff??0;
   const cutoff=20*Math.pow(2,clamp((this.p.filterCutoff||.5)+(this.p.filterEnvAmount||0)*(env.filter-.3)+lf[0]*.05+(this.mod*.15)+(mods.filterCutoff||0)+(seqCut||0),0,1)*10);
   let sample=this.filter(raw,cutoff,clamp(this.p.resonance+(mods.resonance||0)),this.p.filterType==="ladder"?"ladder":this.p.filterType==="stateVariable"?"svf":"prophet6",this.p.filterState||0,sr);
   sample=Math.tanh(sample*(1+clamp(this.p.filterDrive)*7+clamp(this.p.distortion)*9));
   const delaySamples=Math.max(2,Math.floor(sr/(25+clamp(this.p.feedbackTune)*1500)));
   const fbRead=(this.fbWrite-delaySamples+this.fb.length)%this.fb.length,feedback=this.fb[fbRead];
   const fbAmount=clamp(this.p.feedbackAmount,0,.96),fbIn=this.p.feedbackGrunge?Math.tanh(sample+feedback*fbAmount*4):sample+feedback*fbAmount;
   this.fb[this.fbWrite]=clamp(fbIn,-3,3);this.fbWrite=(this.fbWrite+1)%this.fb.length;
   sample=(sample+feedback*fbAmount*.8)*env.amp*this.velocity*.22*(1+(mods.ampLevel||0));
   let left=sample,right=sample;
   [left,right]=this.fxProcess(left,right,0,this.p,dt);[left,right]=this.fxProcess(left,right,1,this.p,dt);
   const pan=.05*Math.sin(this.touch*Math.PI);L[i]=left*(.75-pan)*this.p.volume;R[i]=right*(.75+pan)*this.p.volume;
  }
  return true;
 }
}
registerProcessor("pro3-processor",Pro3Processor);