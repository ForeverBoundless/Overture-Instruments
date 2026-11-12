/* UDO Audio Super 8: Overture stereo AudioWorklet.
   Dual DDS voice model, seven-oscillator Super mode, stereo binaural voice paths,
   two independently voiced layers, analogue-style filters, modulation,
   independent layer sequencing/arp, and per-layer chorus/delay.

   Engineering notes
   - Modulation, envelopes, LFOs, mod matrix and filter coefficients run at control rate
     (CTL samples); oscillators, filter and VCA run at audio rate.
   - No allocation happens inside the audio loop.
   - Alternative waveforms are band-limited mip-mapped wavetables built lazily.
   - The low-pass is a zero-delay-feedback (TPT) four-pole ladder. */
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,Number(x)||0));
const lerp=(a,b,t)=>a+(b-a)*t;
const midiHz=n=>440*Math.pow(2,(n-69)/12);
const CTL=16;
const TWO_PI=Math.PI*2;
const VOICE_GAIN=.62;
const MASTER_GAIN=1.0;

const LAYER_DEFAULT={
 dds1Wave:'saw',dds1Range:8,altA:0,altB:1,waveMod:0,waveModSource:'Manual',superMode:'off',detune:.16,pwDrift:.1,lfo1PitchAmount:0,env1PitchAmount:0,oscPitchDestination:'1+2',
 dds2Wave:'saw',dds2Range:8,dds2Tune:0,dds2Mode:'normal',crossMod:0,subMode:'sine',dds2WaveMod:.5,dds2LfoMode:false,
 mix:.5,pan:.5,hpf:.04,cutoff:.72,resonance:.16,drive:'off',keyTrack:'on',filterMod:'env1',filterLfoAmount:0,filterOscAmount:0,
 env1Attack:.08,env1AttackHold:0,env1DecayHold:0,env1Decay:.25,env1Sustain:.6,env1Release:.35,env1Loop:false,env1KeyTrack:0,
 env2Attack:.02,env2DecayHold:0,env2Decay:.32,env2Sustain:.78,env2Release:.3,
 lfo1Rate:.15,lfo1Delay:0,lfo1Wave:'sine',lfo1Mode:'free',lfo1HighFreq:false,lfo1KeyTrack:false,lrPhase:0,
 lfo2Rate:.15,lfo2Delay:0,lfo2Wave:'sine',lfo2Mode:'trig',lfo2RateAmount:1,lfo2Dds:0,lfo2Vcf:0,lfo2Vca:0,
 benderDds:.5,benderVcf:0,benderOsc:'1+2',
 chorus:'off',chorusMix:.25,delayTime:.28,delayFeedback:.25,delayMod:.1,delayMix:.25,delaySync:false,delayFreeze:false,
 voiceMode:'poly1',unison:'off',modMatrix:Array.from({length:64},()=>0),
 seqEnabled:false,seqLength:16,seqPage:0,seqMode:'step',seqSteps:Array(64).fill(null),seqSlides:Array(64).fill(false),seqAccents:Array(64).fill(false),seqGates:Array(64).fill(.75),seqSwing:0,seqBpm:120,
 arpEnabled:false,arpMode:'up',arpDivision:4,arpRange:1,arpSwing:0,arpHold:false,
 portamento:0,transpose:0,bendRange:2,velocity:'off',aftertouch:0
};
const clone=o=>JSON.parse(JSON.stringify(o));

/* ---------- fast math ---------- */
let rngState=0x2545F491;
const rnd=()=>{let x=rngState;x^=x<<13;x^=x>>>17;x^=x<<5;rngState=x;return (x>>>0)/2147483648-1;};
const fastTanh=x=>x<-3?-1:x>3?1:x*(27+x*x)/(27+9*x*x);
const SIN=new Float32Array(1025);for(let i=0;i<=1024;i++)SIN[i]=Math.sin(TWO_PI*i/1024);
const sinTab=p=>{const q=p*1024,i=q|0,f=q-i;return SIN[i]+(SIN[i+1]-SIN[i])*f;};
function polyBlep(t,dt){
 if(t<dt){const x=t/dt;return x+x-x*x-1;}
 if(t>1-dt){const x=(t-1)/dt;return x*x+x+x+1;}
 return 0;
}
/* kinds: 0 saw, 1 sine, 2 square, 3 triangle, 4 pulse, 5 noise */
function wv(kind,p,pw,dt){
 if(dt>.49)dt=.49;
 switch(kind){
  case 1:return sinTab(p);
  case 2:return (p<.5?1:-1)+polyBlep(p,dt)-polyBlep(p<.5?p+.5:p-.5,dt);
  case 3:return 1-4*Math.abs(p-.5);
  case 4:{const q=p-pw;return (p<pw?1:-1)+polyBlep(p,dt)-polyBlep(q<0?q+1:q,dt);}
  case 5:return rnd();
  default:return 2*p-1-polyBlep(p,dt);
 }
}
const KINDS={saw:0,sine:1,square:2,triangle:3,pulse:4,noise:5,whiteNoise:5,altA:6,altB:6};
const kindOf=name=>KINDS[name]??0;

/* ---------- band-limited alternative waveforms ---------- */
const ALT_CAPS=[64,32,16,8,4,2,1];
const altCache=new Array(64);
function buildAlt(index){
 const N=1024,shape=index%8,partials=Math.min(24,2+(index%23)),w=new Float64Array(N);
 for(let h=1;h<=partials;h++){
  const amp=(1/h)*(shape===0?1:shape===1?Math.exp(-h*.17):shape===2?(h%2?1:0):shape===3?Math.cos(h*.37):shape===4?Math.sin(h*.13):shape===5?((h%3)?1:.15):shape===6?Math.pow(.78,h):Math.cos(h*h*.015));
  if(!amp)continue;
  for(let n=0;n<N;n++)w[n]+=amp*SIN[(h*n)&1023];
 }
 for(let n=0;n<N;n++)w[n]=Math.tanh(w[n]*1.15);
 const a=new Float64Array(65),b=new Float64Array(65);
 for(let h=1;h<=64;h++){let sa=0,sb=0;for(let n=0;n<N;n++){const idx=(h*n)&1023;sa+=w[n]*SIN[idx];sb+=w[n]*SIN[(idx+256)&1023];}a[h]=sa*2/N;b[h]=sb*2/N;}
 const levels=[];
 for(const cap of ALT_CAPS){
  const t=new Float32Array(1025);
  for(let h=1;h<=cap;h++){const ah=a[h],bh=b[h];if(Math.abs(ah)+Math.abs(bh)<1e-5)continue;for(let n=0;n<N;n++){const idx=(h*n)&1023;t[n]+=ah*SIN[idx]+bh*SIN[(idx+256)&1023];}}
  t[N]=t[0];levels.push(t);
 }
 return levels;
}
function altSamp(index,phase,dt,user){
 if(user){const len=user.length,pos=phase*len,i=pos|0,f=pos-i;return user[i%len]+(user[(i+1)%len]-user[i%len])*f;}
 index=(index|0)&63;
 const t=altCache[index]||(altCache[index]=buildAlt(index));
 const allowed=(.46/(dt>1e-6?dt:1e-6))|0;
 const tab=t[allowed>=64?0:allowed>=32?1:allowed>=16?2:allowed>=8?3:allowed>=4?4:allowed>=2?5:6];
 const pos=phase*1024,i=pos|0,f=pos-i;
 return tab[i]+(tab[i+1]-tab[i])*f;
}

/* Super mode layout: centre + six detuned oscillators */
const SUP_UNITS=[0,-1,1,-.667,.667,-.333,.333];
const SUP_LVL=[1,.7,.7,.7,.7,.7,.7];
const SUP_NORM=1/Math.sqrt(1+6*.49);
const SUP_POS=[0,-.9,.9,-.5,.5,-.25,.25];
const SUP_GL=SUP_POS.map(x=>Math.cos((x+1)*Math.PI/4)*Math.SQRT2);
const SUP_GR=SUP_POS.map(x=>Math.sin((x+1)*Math.PI/4)*Math.SQRT2);

const SOURCE_NAMES=['DDS 2','LFO 2','ENV 1','VELOCITY','AFTERTOUCH','EXPRESSION','BENDER','NOTE'];
const DEST_NAMES=['LFO 1 RATE','CROSS MOD','WAVE MOD','OSC MIX','HPF CUTOFF','LPF RESONANCE','ENV 1 DECAY','DELAY TIME'];

class Voice{
 constructor(i){this.i=i;this.reset();}
 reset(){
  this.active=false;this.gate=false;this.note=60;this.inputNote=60;this.channel=1;this.layer=0;this.order=0;this.velocity=.8;this.aftertouch=0;this.pitch=60;this.targetPitch=60;
  this.age=0;this.seqVoice=false;this.arpVoice=false;this.source='ui';
  this.ph1L=new Float64Array(7);this.ph1R=new Float64Array(7);this.ph2L=0;this.ph2R=0;this.held2L=0;this.held2R=0;this.subPhaseL=0;this.subPhaseR=0;
  this.env1=0;this.env2=0;this.e1Stage='idle';this.e2Stage='idle';this.e1Time=0;this.e2Time=0;
  this.lfo1L=0;this.lfo1R=0;this.lfo1Done=false;this.lfo1Held=0;this.lfo2=0;this.lfo2Held=0;this.lfo2Gate=false;this.lfo2Pressure=1;this.lf1L=0;this.lf1R=0;
  this.stL=new Float64Array(4);this.stR=new Float64Array(4);this.hpL=0;this.hpR=0;
  this.pan=(rnd())*.15;this.noise=rnd()*10;this.dds2Lfo=0;
  this.drift=0;this.driftTarget=0;this.driftT=0;this.cutOff=rnd()*.01;this.pwPh=Math.abs(rnd())*6;this.pwRate=.2+Math.abs(rnd())*.4;
  this.gPrev=-1;this.aPrev=0;
 }
}

class Super8Processor extends AudioWorkletProcessor{
 constructor(){
  super();this.layers=[clone(LAYER_DEFAULT),clone(LAYER_DEFAULT)];this.global={mode:'single',activeLayer:0,splitPoint:60,binaural:true,volume:.72,distortion:0,benderX:0,benderY:0,expression:1,sustain:false,masterTune:0};
  this.voices=Array.from({length:16},(_,i)=>new Voice(i));this.order=0;this.held=[new Map(),new Map()];this.arpLatched=[new Set(),new Set()];this.sustain=false;this.pitchBend=[0,0];this.mpeBend=new Map();this.modWheel=0;this.expression=1;this.channelExpression=new Map();this.aftertouch=[0,0];this.channelPressure=new Map();this.polyPressure=new Map();this.mpeSlide=new Map();this.currentMods=[{delayTime:0},{delayTime:0}];this.scheduled=[];
  const sr=sampleRate,pow2=n=>{let p=1;while(p<n)p<<=1;return p;};
  const cSize=pow2(Math.ceil(sr*.06)),dSize=pow2(Math.ceil(sr*2));
  this.fx=[0,1].map(()=>({
   cbufL:new Float32Array(cSize),cbufR:new Float32Array(cSize),cmask:cSize-1,cw:0,phA:0,phB:0,
   dbufL:new Float32Array(dSize),dbufR:new Float32Array(dSize),dmask:dSize-1,dw:0,dT:.28,dLfo:0,lpL:0,lpR:0,hpL:0,hpR:0,
   cMode:0,cMix:0,rateA:0,rateB:0,depA:0,depB:0,baseA:0,baseB:0,offB:0,lrOff:0,dMix:.25,dFb:.25,dFreeze:false,dTarget:.28,dMod:.1,dLpA:.3,dHpA:.01,dFbSm:.25
  }));
  this.sm=[0,1].map(()=>({mix:.5,pan:.5,cut:.72,res:.16,hpf:.04}));
  this.seq=[{step:0,phase:0,note:-1},{step:0,phase:0,note:-1}];this.arp=[{phase:0,index:0,note:-1},{phase:0,index:0,note:-1}];this.clockPulse=0;
  this.mods=new Float64Array(8);this.supR=new Float64Array(7).fill(1);
  this.lbL=new Float64Array(CTL);this.lbR=new Float64Array(CTL);
  this.volS=this.global.volume;this.dcLx=0;this.dcLy=0;this.dcRx=0;this.dcRy=0;
  // filter coefficient scratch
  this.fG=0;this.fG2=0;this.fG3=0;this.fG4=0;this.fK=0;this.fInv=1;
  // block constants for oscillators
  this.b1kind=0;this.bPW=.5;this.bTP=0;this.bAltA=0;this.bAltB=1;this.bUserA=null;this.bUserB=null;
  this.b2kind=0;this.b2inc=0;this.b2pw=.5;this.b2mode=0;this.b2cross=0;this.b2sub=0;this.b2subInc=0;this.b2lfo=false;this.b2subSquare=false;
  this.sumM=0;this.sumL=0;this.sumR=0;this.wrapU=-1;this.lfoRateMul=1;
  this.port.onmessage=e=>this.message(e.data);
 }
 snapSmooth(){
  this.layers.forEach((p,i)=>{const s=this.sm[i];s.mix=clamp(p.mix);s.pan=clamp(p.pan);s.cut=clamp(p.cutoff);s.res=clamp(p.resonance);s.hpf=clamp(p.hpf);});
 }
 message(m){
  if(m.t==='patch'){this.global={...this.global,...m.patch};this.layers=[clone(LAYER_DEFAULT),clone(LAYER_DEFAULT)].map((d,i)=>({...d,...(m.patch.layers?.[i]||{})}));this.snapSmooth();return;}
  if(m.t==='param'){
   if(m.layer===0||m.layer===1){
    const old=this.layers[m.layer][m.key];this.layers[m.layer][m.key]=m.value;
    if(m.key==='arpHold'&&old&&!m.value){this.arpLatched[m.layer].forEach(note=>this.held[m.layer].delete(note));this.arpLatched[m.layer].clear();}
   }else this.global[m.key]=m.value;
   return;
  }
  if(m.t==='noteOn')this.noteOn(m.note|0,clamp(m.vel,.01,1),Number(m.channel)||1,m.source||'ui');
  else if(m.t==='noteOff')this.noteOff(m.note|0,Number(m.channel)||1,m.source||'ui');
  else if(m.t==='bend'){const channel=Number(m.channel)||1;if(this.global.mpe&&channel>1)this.mpeBend.set(channel,clamp(m.value,-1,1));else this.pitchBend=[clamp(m.value,-1,1),clamp(m.value,-1,1)];}
  else if(m.t==='bendAxis'){this.global.benderX=clamp(m.x,-1,1);this.global.benderY=clamp(m.y,-1,1);}
  else if(m.t==='mod')this.modWheel=clamp(m.value);
  else if(m.t==='at'){const channel=Number(m.channel)||1;if(this.global.mpe&&channel>1)this.channelPressure.set(channel,clamp(m.value));else this.aftertouch=[clamp(m.value),clamp(m.value)];}
  else if(m.t==='polyAt'){this.polyPressure.set((Number(m.channel)||1)+':'+m.note,clamp(m.value));}
  else if(m.t==='expression'){const channel=Number(m.channel)||1;if(this.global.mpe&&channel>1)this.channelExpression.set(channel,clamp(m.value));else this.expression=clamp(m.value);}
  else if(m.t==='mpeSlide'){const channel=Number(m.channel)||1;if(this.global.mpe&&channel>1)this.mpeSlide.set(channel,clamp(m.value));}
  else if(m.t==='sustain'){this.sustain=!!m.down;if(!this.sustain)this.releaseUnheld();}
  else if(m.t==='allOff'){this.held.forEach(h=>h.clear());this.voices.forEach(v=>{v.gate=false;});}
  else if(m.t==='freeze'){this.layers[m.layer||0].delayFreeze=!!m.value;}
  else if(m.t==='transport'){const layer=m.layer??this.global.activeLayer;this.layers[layer].seqEnabled=!!m.play;this.seq[layer].step=0;this.seq[layer].phase=0;if(!m.play){this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.seqVoice){v.gate=false;v.seqVoice=false;}});this.seq[layer].note=-1;}}
  else if(m.t==='waves'){const l=this.layers[m.layer??this.global.activeLayer];if(Array.isArray(m.waves))l.userWaves=m.waves.map(a=>Float32Array.from(a));}
  else if(m.t==='clock'){this.clockPulse++;if(this.clockPulse%24===0){this.seq.forEach(x=>x.phase=1);this.arp.forEach(x=>x.phase=1);}}
 }
 layerFor(note){if(this.global.mode==='split')return note>=this.global.splitPoint?1:0;return this.global.activeLayer|0;}
 layerRanges(layer){
  const binaural=!!this.global.binaural,mode=this.global.mode;
  if(mode==='single')return this.voices.slice(0,binaural?8:16);
  return this.voices.slice(layer*8,layer*8+8).slice(0,binaural?4:8);
 }
 rangeStart(layer){return this.global.mode==='single'?0:layer*8;}
 rangeCount(){const b=!!this.global.binaural;return this.global.mode==='single'?(b?8:16):(b?4:8);}
 noteOn(note,vel,channel,source='ui'){
  const mode=this.global.mode;let layers=mode==='dual'?(source==='midi'?[channel===2?1:0]:[0,1]):[this.layerFor(note)];
  if(mode==='single')layers=[this.global.activeLayer|0];
  if(source==='midi'&&mode==='dual'&&channel>2&&this.global.mpe)layers=[this.global.activeLayer|0];
  layers.forEach(layer=>{
   const p=this.layers[layer],held=this.held[layer];held.set(note,vel);this.arpLatched[layer].delete(note);
   if(p.arpEnabled)return;
   this.allocateNote(note,vel,layer,channel,source);
  });
 }
 allocateNote(note,vel,layer,channel=1,source='ui'){
  const p=this.layers[layer],bank=this.layerRanges(layer),mono=['solo','legato'].includes(p.voiceMode);
  if(mono){
   const v=bank.find(x=>x.active)||bank[0];
   const legato=p.voiceMode==='legato'&&v.gate;
   this.startVoice(v,note,vel,layer,legato,0,1,false,channel,source);return;
  }
  const activeNotes=Math.max(1,this.held[layer].size);
  const unison=p.unison||'off';
  let stackSize=1,interval='unison';
  if(unison==='half'){stackSize=Math.max(2,Math.floor(bank.length/2));}
  else if(unison==='all'){stackSize=bank.length;}
  else if(unison==='octave'){stackSize=bank.length;interval='octave';}
  else if(unison==='fifth'){stackSize=bank.length;interval='fifth';}
  if(unison!=='off')stackSize=Math.max(1,Math.min(stackSize,Math.floor(bank.length/activeNotes)||1));
  const free=bank.filter(v=>!v.active);
  const chosen=[];
  for(let i=0;i<stackSize;i++){
   const candidate=free.shift()||bank.filter(v=>!chosen.includes(v)).sort((a,b)=>{
    if(p.voiceMode==='poly2'){
     const ar=!a.gate?0:1,br=!b.gate?0:1;if(ar!==br)return ar-br;
    }
    // prefer stealing voices that are already releasing, then the oldest
    const ag=a.gate?1:0,bg=b.gate?1:0;if(ag!==bg)return ag-bg;
    return (a.order||0)-(b.order||0);
   })[0];
   if(!candidate)break;
   chosen.push(candidate);
  }
  chosen.forEach((v,i)=>{
   let offset=0;
   if(interval==='octave'&&i>0)offset=i%2===1?12:24;
   else if(interval==='fifth'&&i>0)offset=i%2===1?12:(i%4===2?7:19);
   this.startVoice(v,note+offset,vel,layer,false,i,chosen.length,false,channel,source);
  });
 }
 startVoice(v,note,vel,layer,legato=false,index=0,size=1,sequence=false,channel=1,source='ui'){
  const p=this.layers[layer],last=v.pitch,wasActive=v.active;
  v.layer=layer;v.note=note;v.inputNote=note;v.channel=channel;v.source=source;v.seqVoice=!!sequence;v.arpVoice=false;v.age=0;v.targetPitch=note+(p.transpose||0);v.pitch=legato?last:v.targetPitch;v.active=true;v.gate=true;v.order=++this.order;v.velocity=vel;v.aftertouch=0;
  if(!legato){
   v.e1Stage='attack';v.e2Stage='attack';v.e1Time=v.e2Time=0;
   // A stolen voice keeps its current level and oscillator phases, so retriggering never clicks.
   if(!wasActive){v.env1=v.env2=0;v.gPrev=-1;v.aPrev=0;v.stL.fill(0);v.stR.fill(0);v.hpL=v.hpR=0;v.held2L=v.held2R=0;v.drift=0;v.driftT=0;}
   if(p.lfo1Mode==='reset'||p.lfo1Mode==='once'){v.lfo1L=0;v.lfo1R=0;v.lfo1Done=false;}v.lfo2Gate=false;
  }
  v.noise=rnd()*10;v.pan=size>1?(index-(size-1)/2)/Math.max(1,size):v.pan;
  if(!wasActive||p.superMode==='half'){
   if(p.superMode==='half'||p.superMode==='off'){v.ph1L.fill(0);v.ph1R.fill(0);}
   else{for(let k=0;k<7;k++){v.ph1L[k]=k?Math.abs(rnd()):0;v.ph1R[k]=k?Math.abs(rnd()):0;}}
   v.ph2L=0;v.ph2R=0;
  }
 }
 noteOff(note,channel,source='ui'){
  const matches=this.voices.filter(v=>v.active&&v.inputNote===note&&!v.seqVoice&&!v.arpVoice&&(source==='midi'?v.channel===channel:true));
  let layers;
  if(source==='midi')layers=[this.global.mode==='dual'&&this.global.mpe&&channel===2?1:this.global.activeLayer|0];
  else if(this.global.mode==='dual')layers=[0,1];
  else layers=[this.layerFor(note)];
  layers.forEach(layer=>{
   const p=this.layers[layer];
   if(p.arpEnabled&&p.arpHold){this.arpLatched[layer].add(note);return;}
   this.held[layer].delete(note);this.arpLatched[layer].delete(note);
  });
  matches.forEach(v=>{
   const p=this.layers[v.layer];
   if(p.arpEnabled&&p.arpHold)return;
   if(!this.sustain){v.gate=false;if(p.voiceMode==='poly2')v.e2Stage='release';}
  });
 }
 releaseUnheld(){this.voices.forEach(v=>{if(v.active&&!this.held[v.layer].has(v.inputNote))v.gate=false;});}

 /* ---------- envelopes ---------- */
 stepEnv(gate,stage,level,time,dt,attack,attackHold,decayHold,decay,sustain,release){
  if(!gate&&stage!=='idle'&&stage!=='release')stage='release';
  if(stage==='attack'){
   // Aim above 1 so the attack finishes in finite time with an analogue-style curve.
   level+=(1.3-level)*(1-Math.exp(-dt/((.001+attack*attack*3)*1.6)));
   if(level>=1){level=1;stage=attackHold>0?'attackHold':decayHold>0?'decayHold':'decay';time=0;}
  }else if(stage==='attackHold'){time+=dt;if(time>=attackHold*2){stage=decayHold>0?'decayHold':'decay';time=0;}}
  else if(stage==='decayHold'){time+=dt;if(time>=decayHold*2){stage='decay';time=0;}}
  else if(stage==='decay'){level+=(sustain-level)*(1-Math.exp(-dt/(.002+decay*decay*5)));if(Math.abs(level-sustain)<.001){level=sustain;stage='sustain';}}
  else if(stage==='sustain')level=sustain;
  else if(stage==='release'){level*=Math.exp(-dt/(.005+release*release*4));if(level<.0001){level=0;stage='idle';time=0;}}
  this.eS=stage;this.eL=level;this.eT=time;
 }
 envTick(v,p,dt,decay1){
  this.stepEnv(v.gate,v.e1Stage,v.env1,v.e1Time,dt,p.env1Attack,p.env1AttackHold,p.env1DecayHold,decay1,p.env1Sustain,p.env1Release);
  v.e1Stage=this.eS;v.env1=this.eL;v.e1Time=this.eT;
  this.stepEnv(v.gate,v.e2Stage,v.env2,v.e2Time,dt,p.env2Attack,0,p.env2DecayHold,p.env2Decay,p.env2Sustain,p.env2Release);
  v.e2Stage=this.eS;v.env2=this.eL;v.e2Time=this.eT;
  if(p.env1Loop&&v.gate&&v.e1Stage==='sustain'){v.e1Stage='attack';v.env1=0;v.e1Time=0;}
 }

 /* ---------- LFOs ---------- */
 lfo(v,p,dt,which,side){
  const phaseKey=which===1?(side==='L'?'lfo1L':'lfo1R'):'lfo2';
  if(which===1&&p.lfo1Mode==='once'&&v.lfo1Done)return 0;
  let rate;
  if(which===1){
   rate=p.lfo1HighFreq?20+clamp(p.lfo1Rate)*19980:.03+clamp(p.lfo1Rate)*49.97;
   if(p.lfo1KeyTrack)rate*=Math.pow(2,(v.note-60)/12);
   rate*=this.lfoRateMul;
  }else{
   const pressure=clamp(v.lfo2Pressure||0);
   rate=(.05+clamp(p.lfo2Rate)*49.95)*(1+pressure*clamp(p.lfo2RateAmount)*3);
  }
  const next=v[phaseKey]+rate*dt*TWO_PI,wrapped=next>=TWO_PI;
  v[phaseKey]=next%TWO_PI;
  const phase=v[phaseKey]/TWO_PI,shape=which===1?p.lfo1Wave:p.lfo2Wave;
  if(shape==='square')return phase<.5?1:-1;
  if(shape==='saw')return 2*phase-1;
  if(shape==='reverseSaw')return 1-2*phase;
  if(shape==='triangle')return 1-4*Math.abs(phase-.5);
  if(shape==='noise')return rnd();
  if(shape==='sampleHold'||shape==='random'){
   const k=which===1?'lfo1Held':'lfo2Held';
   if(wrapped)v[k]=rnd();
   return v[k]||0;
  }
  if(which===1&&p.lfo1Mode==='once'&&wrapped)v.lfo1Done=true;
  const offset=side==='R'&&which===1?(p.lrPhase||0)*TWO_PI:0;
  return Math.sin(v[phaseKey]+offset);
 }

 /* ---------- modulation matrix ---------- */
 source(index,v,p,lf1,lf2){
  switch(index){
   case 0:return v.dds2Lfo||0;
   case 1:return lf2||0;
   case 2:return v.env1||0;
   case 3:return (v.velocity||0)*2-1;
   case 4:return v.aftertouch||0;
   case 5:return this.expression||0;
   case 6:return this.global.benderY||0;
   case 7:return (v.note||0)/127*2-1;
  }
  return 0;
 }
 computeMods(p,v,lf2){
  const out=this.mods;out.fill(0);const mat=p.modMatrix;if(!mat)return;
  for(let s=0;s<8;s++){
   let src,have=false;
   for(let d=0;d<8;d++){
    const amt=+mat[s*8+d]||0;if(!amt)continue;
    if(!have){src=this.source(s,v,p,0,lf2);have=true;}
    out[d]+=src*amt;
   }
  }
 }

 /* ---------- oscillators ---------- */
 w1(kind,phase,dt){
  if(kind===6){
   const a=altSamp(this.bAltA,phase,dt,this.bUserA),b=altSamp(this.bAltB,phase,dt,this.bUserB);
   return a+(b-a)*this.bTP;
  }
  const x=wv(kind,phase,this.bPW,dt);
  if(this.bTP>.001&&kind!==1&&kind!==5){const a=altSamp(this.bAltA,phase,dt,this.bUserA);return x+(a-x)*this.bTP;}
  return x;
 }
 dds1Run(ph,inc,shift,fmMul,n,kind){
  let sm=0,sl=0,sr=0;this.wrapU=-1;const R=this.supR;
  for(let k=0;k<n;k++){
   const ik=inc*(k?R[k]:1)*fmMul;let nx=ph[k]+ik;
   if(nx>=1){nx-=1;if(k===0)this.wrapU=ik>0?nx/ik:0;}
   ph[k]=nx;
   let pp=nx+shift;if(pp>=1)pp-=1;
   const o=this.w1(kind,pp,ik)*SUP_LVL[k];
   sm+=o;sl+=o*SUP_GL[k];sr+=o*SUP_GR[k];
  }
  if(n>1){sm*=SUP_NORM;sl*=SUP_NORM;sr*=SUP_NORM;}
  this.sumM=sm;this.sumL=sl;this.sumR=sr;
 }
 /* DDS 2 with sample-accurate hard-sync reset and polyBLEP-style discontinuity correction */
 d2(v,isR,o1,wrapU){
  const mode=this.b2mode,inc=this.b2inc,kind=this.b2kind,pw=this.b2pw;
  let ph=isR?v.ph2R:v.ph2L,corrNow=0,corrPrev=0,nx=ph+inc;
  if(mode===1&&wrapU>=0){
   let oldPh=ph+inc*(1-wrapU);if(oldPh>=1)oldPh-=1;
   const delta=wv(kind,0,pw,inc)-wv(kind,oldPh,pw,inc);
   nx=wrapU*inc;
   corrNow=delta*(wrapU-wrapU*wrapU*.5-.5);corrPrev=delta*wrapU*wrapU*.5;
  }else if(nx>=1)nx-=1;
  if(isR)v.ph2R=nx;else v.ph2L=nx;
  let out;
  if(mode===3){
   let sp=(isR?v.subPhaseR:v.subPhaseL)+this.b2subInc;if(sp>=1)sp-=1;
   if(isR)v.subPhaseR=sp;else v.subPhaseL=sp;
   return this.b2subSquare?wv(2,sp,.5,this.b2subInc):sinTab(sp);
  }
  if(this.b2lfo){
   if(!isR)v.dds2Lfo=kind===5?rnd():sinTab(nx);
   return 0;
  }
  let pp=nx+o1*this.b2cross;pp-=Math.floor(pp);
  let x=wv(kind,pp,pw,inc);
  if(mode===2)x*=o1;
  if(mode===1){
   if(isR){out=v.held2R+corrPrev;v.held2R=x+corrNow;}else{out=v.held2L+corrPrev;v.held2L=x+corrNow;}
   return out;
  }
  return x;
 }

 /* ---------- ladder filter (zero-delay feedback, four pole) ---------- */
 ladder(st,x){
  const G=this.fG,om=1-G,s1=st[0],s2=st[1],s3=st[2],s4=st[3];
  const sigma=om*(this.fG3*s1+this.fG2*s2+G*s3+s4);
  let u=(x-this.fK*sigma)*this.fInv;
  u=fastTanh(u*.8)*1.25;
  const v1=(u-s1)*G,y1=v1+s1;st[0]=y1+v1;
  const v2=(y1-s2)*G,y2=v2+s2;st[1]=y2+v2;
  const v3=(y2-s3)*G,y3=v3+s3;st[2]=y3+v3;
  const v4=(y3-s4)*G,y4=v4+s4;st[3]=y4+v4;
  return y4;
 }

 /* ---------- one voice for one control block ---------- */
 voiceBlock(v,p,layer,len,dtc){
  const sr=sampleRate,gl=this.global,sm=this.sm[layer],mods=this.mods;
  const glide=clamp(p.portamento);
  v.pitch+=(v.targetPitch-v.pitch)*(glide>0?1-Math.exp(-dtc/(.005+glide*2)):1);
  v.age+=dtc;
  if(this.polyPressure.size||this.channelPressure.size)v.aftertouch=this.polyPressure.get(v.channel+':'+v.inputNote)??this.channelPressure.get(v.channel)??this.aftertouch[layer]??0;
  else v.aftertouch=this.aftertouch[layer]||0;
  // LFO 2 (needs pressure first)
  const trigPressure=p.lfo2Mode==='trig'?1:Math.max(gl.benderY,v.aftertouch);
  const lfo2Active=p.lfo2Mode==='trig'||trigPressure>.015;
  if(lfo2Active&&!v.lfo2Gate)v.lfo2=0;
  v.lfo2Gate=lfo2Active;v.lfo2Pressure=trigPressure;
  let lf2=this.lfo(v,p,dtc,2,'L');if(v.age<(p.lfo2Delay||0)*5)lf2=0;
  const lfo2Signal=lfo2Active?lf2*trigPressure:0;
  this.computeMods(p,v,lf2);
  this.currentMods[layer].delayTime=mods[7];
  this.envTick(v,p,dtc,clamp(p.env1Decay+mods[6]*.5));
  if(v.e2Stage==='idle'&&v.env2<=0&&!v.gate){v.active=false;return;}
  // LFO 1
  const hf=!!p.lfo1HighFreq;let lf1L,lf1R;
  if(!hf){
   this.lfoRateMul=Math.pow(2,mods[0]*3);
   lf1L=this.lfo(v,p,dtc,1,'L');lf1R=this.lfo(v,p,dtc,1,'R');
   if(v.age<(p.lfo1Delay||0)*10){lf1L=0;lf1R=0;}
  }else{lf1L=v.lf1L;lf1R=v.lf1R;this.lfoRateMul=Math.pow(2,mods[0]*3);}
  // pitch
  const benderX=clamp(gl.benderX,-1,1),benderSemis=benderX*clamp(p.benderDds)*12,tgt=p.oscPitchDestination||'1+2';
  const both=tgt==='1+2',to1=tgt==='DDS 1'||both,to2=tgt==='DDS 2'||both;
  const lfo1Pitch=(lf1L*clamp(p.lfo1PitchAmount)+v.env1*clamp(p.env1PitchAmount))*12,lfo2Pitch=lfo2Signal*clamp(p.lfo2Dds)*12;
  const pitch1=(to1?benderSemis:0)+(tgt==='DDS 2'?0:lfo2Pitch)+(to1?lfo1Pitch:0);
  const pitch2=(to2?benderSemis:0)+(tgt==='DDS 1'?0:lfo2Pitch)+(to2?lfo1Pitch:0);
  const channelBend=gl.mpe&&v.channel>1?(this.mpeBend.get(v.channel)||0):(this.pitchBend[layer]||0);
  const midiBend=channelBend*p.bendRange;
  // slow analogue drift (cents)
  v.driftT-=dtc;if(v.driftT<=0){v.driftT=.4+Math.abs(rnd())*1.2;v.driftTarget=rnd()*2.6;}
  v.drift+=(v.driftTarget-v.drift)*(1-Math.exp(-dtc/.6));
  const common=v.pitch+midiBend+(gl.masterTune||0)+v.drift*.01;
  const dds1Foot=Math.log2(8/Math.max(2,Number(p.dds1Range)||8))*12,dds2Foot=Math.log2(8/Math.max(2,Number(p.dds2Range)||8))*12;
  const base=midiHz(common+dds1Foot+pitch1),inc1=base/sr;
  // wave morph depth and shapes
  const wsrc=p.waveModSource==='LFO 1'?(lf1L+1)*.5:p.waveModSource==='ENV 1'?v.env1:p.waveMod;
  this.bTP=clamp(wsrc+this.modWheel*.12+mods[2]+lfo2Signal*clamp(p.lfo2Dds));
  this.b1kind=kindOf(p.dds1Wave);this.bAltA=p.altA|0;this.bAltB=p.altB|0;
  this.bUserA=p.userWaves?.[this.bAltA]||null;this.bUserB=p.userWaves?.[this.bAltB]||null;
  v.pwPh+=dtc*(.3+v.pwRate);
  this.bPW=.5+(.04+clamp(p.pwDrift)*.4)*Math.sin(v.pwPh*TWO_PI+v.noise);
  const superMode=p.superMode==='on'?1:p.superMode==='half'?.5:0,n=superMode?7:1;
  const spread=clamp(p.detune)*30*superMode;
  for(let k=1;k<7;k++)this.supR[k]=superMode?Math.pow(2,SUP_UNITS[k]*spread/1200):1;
  const binaural=!!gl.binaural,stereo=binaural||superMode>0;
  // DDS 2
  const lfoMode=p.dds2Range==='LFO'&&p.dds2Mode!=='sub';
  const f2=lfoMode?(.1+clamp(p.dds2Tune/14+.5)*99.9):midiHz(common+dds2Foot+(p.dds2Tune||0)+pitch2);
  let k2=kindOf(p.dds2Wave);if(k2===6)k2=0;
  this.b2kind=k2;this.b2inc=f2/sr;this.b2pw=clamp(.02+.96*clamp(p.dds2WaveMod??.5),.02,.98);
  this.b2mode=p.dds2Mode==='sync'?1:p.dds2Mode==='ring'?2:p.dds2Mode==='sub'?3:0;
  this.b2cross=clamp(p.crossMod+mods[1]*.5)*.3;this.b2lfo=lfoMode;
  this.b2subInc=base*.5/sr;this.b2subSquare=p.subMode==='square';
  // mix, pan, filter
  const sCoef=1-Math.exp(-dtc/.02);
  sm.mix+=(clamp(p.mix)-sm.mix)*sCoef;sm.pan+=(clamp(p.pan)-sm.pan)*sCoef;sm.cut+=(clamp(p.cutoff)-sm.cut)*sCoef;sm.res+=(clamp(p.resonance)-sm.res)*sCoef;sm.hpf+=(clamp(p.hpf)-sm.hpf)*sCoef;
  const mixv=clamp(sm.mix+mods[3]*.5);
  const envMod=p.filterMod==='env2'?v.env2:p.filterMod==='both'?clamp(v.env1+v.env2):v.env1;
  const track=p.keyTrack==='on'?((v.note-60)/48)*.2:p.keyTrack==='half'?((v.note-60)/48)*.1:0;
  const lfoVcf=lfo2Signal*clamp(p.lfo2Vcf)*.5,benderVcf=benderX*clamp(p.benderVcf)*.5,lfo1Mod=lf1L*clamp(p.filterLfoAmount)*.5,oscMod=(v.dds2Lfo||0)*clamp(p.filterOscAmount)*.5;
  const slide=gl.mpe&&v.channel>1?(this.mpeSlide.get(v.channel)||0):0;
  const cutoff=clamp(sm.cut+lfo1Mod+lfoVcf+benderVcf+oscMod+envMod*.35+track+slide*.22+v.cutOff);
  const hpf=clamp(sm.hpf+mods[4]*.5),res=clamp(sm.res+mods[5]*.5);
  const fc=Math.min(30*Math.pow(2,cutoff*9),sr*.45),gg=Math.tan(Math.PI*fc/sr),Gt=gg/(1+gg);
  if(v.gPrev<0)v.gPrev=Gt;
  const hg=1-Math.exp(-TWO_PI*20*Math.pow(2,hpf*9)/sr);
  const k=res*4.3,comp=1+k*.4;this.fK=k;
  const dm=p.drive==='2'?2:p.drive==='1'?1:0,inGain=dm===2?2.6:dm===1?1.6:1;
  // amp
  const velMode=p.velocity||'off',velDepth=velMode==='on'?v.velocity:velMode==='half'?(1+v.velocity)*.5:1;
  const chExpr=gl.mpe&&v.channel>1?(this.channelExpression.get(v.channel)??this.expression):this.expression;
  const aT=v.env2*velDepth*(.35+chExpr*.65)*(1+lfo2Signal*clamp(p.lfo2Vca))*VOICE_GAIN;
  const pan=clamp(.5+v.pan*.35+(sm.pan-.5)*.8,0,1),gL=Math.cos(pan*Math.PI*.5)*Math.SQRT2,gR=Math.sin(pan*Math.PI*.5)*Math.SQRT2;
  const lbL=this.lbL,lbR=this.lbR,stL=v.stL,stR=v.stR,dts=1/sr;
  const lrShift=binaural?(p.lrPhase||0)*.5:0,fmDepth=hf?.01:.0002;
  const gP=v.gPrev,aP=v.aPrev;
  let curHpL=v.hpL,curHpR=v.hpR;
  for(let i=0;i<len;i++){
   const f=(i+1)/len,G=gP+(Gt-gP)*f,amp=aP+(aT-aP)*f;
   const G2=G*G;this.fG=G;this.fG2=G2;this.fG3=G2*G;this.fG4=G2*G2;this.fInv=1/(1+k*this.fG4);
   if(hf){lf1L=this.lfo(v,p,dts,1,'L');lf1R=this.lfo(v,p,dts,1,'R');v.lf1L=lf1L;v.lf1R=lf1R;}
   // DDS 1
   this.dds1Run(v.ph1L,inc1,0,1-lf1L*fmDepth,n,this.b1kind);
   let o1L=stereo&&!binaural?this.sumL:this.sumM,o1R=o1L;const wrapL=this.wrapU;
   let wrapR=-1;
   if(binaural){this.dds1Run(v.ph1R,inc1,lrShift,1+lf1R*fmDepth,n,this.b1kind);o1R=this.sumM;wrapR=this.wrapU;}
   else if(stereo)o1R=this.sumR;
   // DDS 2
   const o2L=this.d2(v,false,o1L,wrapL);
   let o2R=o2L;if(binaural)o2R=this.d2(v,true,o1R,wrapR);
   let xL=o1L+(o2L-o1L)*mixv;
   curHpL+=hg*(xL-curHpL);xL=(xL-curHpL)*inGain;
   let yL=this.ladder(stL,xL)*comp;
   if(dm>0)yL=fastTanh(yL*1.4)*.8;
   let yR=yL;
   if(stereo){
    let xR=o1R+(o2R-o1R)*mixv;
    curHpR+=hg*(xR-curHpR);xR=(xR-curHpR)*inGain;
    yR=this.ladder(stR,xR)*comp;
    if(dm>0)yR=fastTanh(yR*1.4)*.8;
   }
   lbL[i]+=yL*amp*gL;lbR[i]+=yR*amp*gR;
  }
  v.hpL=curHpL;v.hpR=curHpR;v.gPrev=Gt;v.aPrev=aT;
  v.dds2Lfo=v.dds2Lfo||0;
  if(!(stL[3]===stL[3])||!(stR[3]===stR[3])||Math.abs(stL[3])>1e6||Math.abs(stR[3])>1e6){stL.fill(0);stR.fill(0);v.hpL=v.hpR=0;}
 }

 /* ---------- effects ---------- */
 fxPrep(layer,p){
  const d=this.fx[layer],sr=sampleRate;
  const mode=p.chorus||'off';
  d.cMode=mode==='off'?0:mode==='I'?1:mode==='II'?2:3;d.cMix=clamp(p.chorusMix);
  if(d.cMode===1||d.cMode===2){
   const II=d.cMode===2;
   d.rateA=II?.83:.5;d.depA=II?.0028:.002;d.baseA=II?.0072:.0052;
   d.rateB=d.rateA;d.depB=d.depA;d.baseB=d.baseA+.0012;d.offB=.5;
  }else if(d.cMode===3){
   d.rateA=.5;d.depA=.002;d.baseA=.0052;d.rateB=.83;d.depB=.0028;d.baseB=.0072;d.offB=.25;
  }
  d.lrOff=(p.lrPhase||0)*.5;
  d.dMix=clamp(p.delayMix??.25);d.dFreeze=!!p.delayFreeze;d.dFb=clamp(p.delayFeedback,0,.96);d.dMod=clamp(p.delayMod);
  const divisions=[4,2,1,.5,.25,.125],division=divisions[Math.round(clamp(p.delayTime)*5)];
  const secs=p.delaySync?(60/Math.max(30,Number(p.seqBpm)||120))*division:clamp(p.delayTime,.001,1);
  d.dTarget=clamp(secs+(this.currentMods[layer].delayTime||0)*.1,.001,1.8);
  d.dLpA=1-Math.exp(-TWO_PI*3200/sr);d.dHpA=1-Math.exp(-TWO_PI*140/sr);
 }
 /* processes the sample (inL,inR) of layer and leaves it in this.eL/this.eR */
 fxSample(layer,inL,inR){
  const d=this.fx[layer],sr=sampleRate,dts=1/sr;
  let L=inL,R=inR;
  if(d.cMode){
   const cm=d.cmask,w=d.cw;d.cbufL[w]=inL;d.cbufR[w]=inR;
   d.phA+=d.rateA*dts;if(d.phA>=1)d.phA-=1;d.phB+=d.rateB*dts;if(d.phB>=1)d.phB-=1;
   const sA=Math.sin(d.phA*TWO_PI),sB=Math.sin((d.phB+d.offB)*TWO_PI),sAr=Math.sin((d.phA+.5+d.lrOff)*TWO_PI),sBr=Math.sin((d.phB+d.offB+.5+d.lrOff)*TWO_PI);
   const dAL=(d.baseA+d.depA*sA)*sr,dBL=(d.baseB+d.depB*sB)*sr,dAR=(d.baseA+d.depA*sAr)*sr,dBR=(d.baseB+d.depB*sBr)*sr;
   let pos=w-dAL,i0=Math.floor(pos),f=pos-i0,bufL=d.cbufL,a=bufL[i0&cm],b=bufL[(i0+1)&cm];let wl=(a+(b-a)*f);
   pos=w-dBL;i0=Math.floor(pos);f=pos-i0;a=bufL[i0&cm];b=bufL[(i0+1)&cm];wl=(wl+(a+(b-a)*f))*.5;
   const bufR=d.cbufR;
   pos=w-dAR;i0=Math.floor(pos);f=pos-i0;a=bufR[i0&cm];b=bufR[(i0+1)&cm];let wr=(a+(b-a)*f);
   pos=w-dBR;i0=Math.floor(pos);f=pos-i0;a=bufR[i0&cm];b=bufR[(i0+1)&cm];wr=(wr+(a+(b-a)*f))*.5;
   d.cw=(w+1)&cm;
   L=inL+(wl-inL)*d.cMix;R=inR+(wr-inR)*d.cMix;
  }
  // stereo ping-pong delay
  d.dT+=(d.dTarget-d.dT)*.0006;
  d.dLfo+=dts*(.17+d.dMod*2.8);if(d.dLfo>=1)d.dLfo-=1;
  const t=Math.max(2,Math.min(d.dmask-2,(d.dT+Math.sin(d.dLfo*TWO_PI)*.004*d.dMod)*sr));
  const dm=d.dmask,dw=d.dw,pos=dw-t,i0=Math.floor(pos),f=pos-i0;
  let a=d.dbufL[i0&dm],b=d.dbufL[(i0+1)&dm];const wl=a+(b-a)*f;
  a=d.dbufR[i0&dm];b=d.dbufR[(i0+1)&dm];const wr=a+(b-a)*f;
  if(d.dFreeze){d.dbufL[dw]=wl;d.dbufR[dw]=wr;}
  else{
   d.lpL+=d.dLpA*(wr-d.lpL);d.lpR+=d.dLpA*(wl-d.lpR);
   d.hpL+=d.dHpA*(d.lpL-d.hpL);d.hpR+=d.dHpA*(d.lpR-d.hpR);
   const fb=d.dFb;
   d.dbufL[dw]=(L+R)*.5+(d.lpL-d.hpL)*fb;
   d.dbufR[dw]=(d.lpR-d.hpR)*fb;
  }
  d.dw=(dw+1)&dm;
  const mix=d.dFreeze?.85:d.dMix;
  this.eL=L+wl*mix;this.eR=R+wr*mix;
 }

 tickSequencers(dt,layer){
  const p=this.layers[layer],s=this.seq[layer],a=this.arp[layer];
  if(p.seqEnabled){
   const length=clamp(p.seqLength,1,64),nextStep=s.step%length;
   const swing=clamp(p.seqSwing)*.42;
   s.phase+=(p.seqBpm/60)*dt*((s.step%2)?1-swing:1+swing);
   if(s.note>=0&&s.phase>=clamp(s.gate??.75,.05,1)&&!p.seqSlides[nextStep]){
    this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.seqVoice){v.gate=false;v.seqVoice=false;}});
    s.note=-1;
   }
   if(s.phase>=1){
    s.phase-=1;
    const step=s.step%length,n=p.seqSteps[step],slide=!!p.seqSlides[step]&&n!==null&&n!==undefined;
    const accent=!!p.seqAccents[step],gate=clamp(p.seqGates?.[step]??.75,.05,1);
    const tied=this.voices.filter(v=>v.active&&v.layer===layer&&v.seqVoice&&v.gate);
    if(s.note>=0&&slide&&tied.length){
     tied.forEach(v=>{v.note=n;v.inputNote=n;v.targetPitch=n+(p.transpose||0);v.velocity=accent?1:.82;v.gate=true;});
     s.note=n;s.gate=gate;
    }else{
     if(s.note>=0){
      this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.seqVoice){v.gate=false;v.seqVoice=false;}});
      s.note=-1;
     }
     if(n!==null&&n!==undefined){
      const velocity=accent?1:.82;
      this.allocateNote(n,velocity,layer,1,'sequence');
      this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.inputNote===n&&v.order===this.order)v.seqVoice=true;});
      s.note=n;s.gate=gate;
     }
    }
    s.step=(s.step+1)%length;
   }
  }
  if(p.arpEnabled){
   const held=[...this.held[layer].entries()];
   if(held.length){
    const arpSwing=clamp(p.arpSwing)*.42;
    a.phase+=(p.seqBpm/60)*dt*(4/Math.max(1,p.arpDivision))*((a.index%2)?1-arpSwing:1+arpSwing);
    if(a.phase>=1){
     a.phase-=1;
     const ordered=p.arpMode==='assign'?held:held.slice().sort((x,y)=>x[0]-y[0]);
     const total=ordered.length*Math.max(1,Math.min(4,Math.round(p.arpRange||1)));
     const step=a.index++%total,octave=Math.floor(step/ordered.length);
     let index=step%ordered.length;
     if(p.arpMode==='down')index=ordered.length-1-index;
     else if(p.arpMode==='random')index=Math.floor(Math.abs(rnd())*ordered.length)%ordered.length;
     else if(p.arpMode==='upDown'){const span=Math.max(1,total*2-2),z=a.index%span,absolute=z<total?z:span-z;index=absolute%ordered.length;}
     const n=ordered[index][0]+12*octave;
     this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.arpVoice){v.gate=false;v.arpVoice=false;}});
     this.allocateNote(n,ordered[index][1],layer,1,'arp');
     this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.inputNote===n&&v.order===this.order)v.arpVoice=true;});
    }
   }else{
    this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.arpVoice){v.gate=false;v.arpVoice=false;}});
   }
  }
 }

 process(_inputs,outputs){
  const out=outputs[0],L=out[0],R=out[1]||out[0],n=L.length,sr=sampleRate;
  const single=this.global.mode==='single',active=this.global.activeLayer|0;
  const gl=this.global,drive=1+Math.pow(clamp(gl.distortion||0),1.6)*19,volTarget=clamp(gl.volume,0,1.5);
  const volCoef=1-Math.exp(-1/(sr*.015));
  for(let start=0;start<n;start+=CTL){
   const len=Math.min(CTL,n-start),dtc=len/sr;
   // voices of a layer that is not being rendered are silenced
   if(single)for(let i=0;i<16;i++){const v=this.voices[i];if(v.active&&v.layer!==active){v.active=false;v.gate=false;}}
   const lStart=single?active:0,lEnd=single?active:1;
   const mixL=this._mL||(this._mL=new Float64Array(CTL)),mixR=this._mR||(this._mR=new Float64Array(CTL));
   mixL.fill(0);mixR.fill(0);
   for(let layer=lStart;layer<=lEnd;layer++){
    const p=this.layers[layer];this.tickSequencers(dtc,layer);
    this.lbL.fill(0);this.lbR.fill(0);
    const rs=this.rangeStart(layer),rc=this.rangeCount();
    for(let i=rs;i<rs+rc;i++){const v=this.voices[i];if(v.active&&v.layer===layer)this.voiceBlock(v,p,layer,len,dtc);}
    this.fxPrep(layer,p);
    for(let i=0;i<len;i++){this.fxSample(layer,this.lbL[i],this.lbR[i]);mixL[i]+=this.eL;mixR[i]+=this.eR;}
   }
   for(let i=0;i<len;i++){
    this.volS+=(volTarget-this.volS)*volCoef;
    let yl=fastTanh(mixL[i]*drive*MASTER_GAIN)*this.volS,yr=fastTanh(mixR[i]*drive*MASTER_GAIN)*this.volS;
    // DC blocker
    const ol=yl-this.dcLx+.9995*this.dcLy;this.dcLx=yl;this.dcLy=ol;
    const or=yr-this.dcRx+.9995*this.dcRy;this.dcRx=yr;this.dcRy=or;
    L[start+i]=ol;if(R!==L)R[start+i]=or;
   }
  }
  return true;
 }
}
registerProcessor('super8-processor',Super8Processor);
