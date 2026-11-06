/* Oberheim OB-Xa model: selectable 4 / 6 / 8 voices, two independent four-voice
 * control groups, dual VCOs, selectable 2 / 4 pole low-pass response, two ADSRs
 * and a VCA per voice. Procedural approximation, not component-exact circuitry. */
/* global sampleRate, currentFrame, registerProcessor, AudioWorkletProcessor */
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),hz=n=>440*Math.pow(2,(n-69)/12);
const BLEP=(t,d)=>{if(t<d){t/=d;return t+t-t*t-1;}if(t>1-d){t=(t-1)/d;return t*t+t+t+1;}return 0;};
const saw=(p,d)=>2*p-1-BLEP(p,d),pulse=(p,w,d)=>{const q=clamp(w,.05,.95);return (p<q?1:-1)+BLEP(p,d)-BLEP((p+1-q)%1,d);};
const wave=(shape,p,w,d)=>shape==='pulse'?pulse(p,w,d):saw(p,d);
const DEFAULT={mode:'full',voiceCount:8,splitPoint:60,unison:false,unisonDetune:.12,bendRange:2,bendOsc2Only:false,master:.7,masterTune:0,hold:false,osc1Wave:'saw',osc2Wave:'saw',osc1Range:0,osc1Level:.82,osc2Level:.56,osc2Tune:0,pulseWidth:.5,sync:false,fEnvOsc2:false,osc1Route:true,osc2Route:true,osc2Half:false,noiseRoute:false,cutoff:.53,resonance:.13,filterMode:'24',filterTrack:true,filterEnv:.42,filterAttack:.08,filterDecay:.32,filterSustain:.12,filterRelease:.32,ampAttack:.015,ampDecay:.3,ampSustain:.76,ampRelease:.32,lfoRate:.16,lfoAmount:0,lfoWave:'sine',lfoTarget:'both',pulseWidthAmount:0,lfoPulse1:false,lfoPulse2:false,transpose:0,portamento:0};
const GLOBAL_KEYS=new Set(['mode','voiceCount','splitPoint','unison','unisonDetune','bendRange','bendOsc2Only','master','masterTune','hold']);
class XaVoice{
 constructor(i){this.i=i;this.note=-1;this.pitch=60;this.targetPitch=60;this.layer=0;this.active=false;this.gate=false;this.order=0;this.phase1=Math.random();this.phase2=Math.random();this.amp=0;this.filterEnv=0;this.ampStage='idle';this.filterStage='idle';this.lp1=0;this.bp1=0;this.lp2=0;this.bp2=0;this.pan=0;this.vel=.8;this.rand=(Math.random()-.5)*.0005;this.noiseSeed=((i+1)*17117)|0;this.pink=[0,0,0,0,0,0,0];this.glide=0;}
}
class OBXaProcessor extends AudioWorkletProcessor{
 constructor(){super();this.p={...DEFAULT};this.pB={...DEFAULT};this.voices=Array.from({length:8},(_,i)=>new XaVoice(i));this.order=0;this.bend=0;this.mod=0;this.sustain=false;this.hold=false;this.heldNotes=new Map();this.scheduled=[];this.lfos=[{phase:0,hold:0},{phase:0,hold:0}];this.port.onmessage=e=>this.message(e.data);}
 message(m){if((m.t==='noteOn'||m.t==='noteOff')&&Number.isFinite(m.frame)&&m.frame>currentFrame){this.scheduled.push(m);this.scheduled.sort((a,b)=>a.frame-b.frame);return;}this.dispatch(m);}
 dispatch(m){
  if(m.t==='patch'){const wasHold=this.hold;this.p={...DEFAULT,...m.patch};this.pB={...DEFAULT,...(m.patch.layerB||m.patch)};this.hold=!!this.p.hold;if(wasHold&&!this.hold)this.releaseUnheld();}
  else if(m.t==='param'&&m.key in DEFAULT){const target=m.layer===1&&!GLOBAL_KEYS.has(m.key)?this.pB:this.p;target[m.key]=m.value;}
  else if(m.t==='hold'){this.hold=!!m.value;this.p.hold=this.hold;if(!this.hold)this.releaseUnheld();}
  else if(m.t==='noteOn')this.noteOn(m.note|0,clamp(m.vel,.01,1));
  else if(m.t==='noteOff')this.noteOff(m.note|0);
  else if(m.t==='bend')this.bend=clamp(m.value,-1,1);
  else if(m.t==='mod')this.mod=clamp(m.value,0,1);
  else if(m.t==='sustain'){this.sustain=!!m.down;if(!this.sustain)this.releaseUnheld();}
  else if(m.t==='volume')this.p.master=clamp(m.value,0,1);
  else if(m.t==='allOff'||m.t==='allSoundOff'){this.scheduled.length=0;this.heldNotes.clear();this.voices.forEach(v=>{v.gate=false;this.release(v);});}
 }
 noise(v){let x=v.noiseSeed|0;x^=x<<13;x^=x>>>17;x^=x<<5;v.noiseSeed=x|0;return (x>>>0)/2147483648-1;}
 pinkNoise(v){const w=this.noise(v),b=v.pink;b[0]=.99886*b[0]+w*.0555179;b[1]=.99332*b[1]+w*.0750759;b[2]=.969*b[2]+w*.153852;b[3]=.8665*b[3]+w*.3104856;b[4]=.55*b[4]+w*.5329522;b[5]=-.7616*b[5]-w*.016898;const out=(b[0]+b[1]+b[2]+b[3]+b[4]+b[5]+b[6]+w*.5362)*.11;b[6]=w*.115926;return out;}
 voiceCount(){return [4,6,8].includes(Number(this.p.voiceCount))?Number(this.p.voiceCount):8;}
 halfCount(){return this.voiceCount()/2;}
 bank(layer=0){const count=this.voiceCount(),half=this.halfCount();if(this.p.mode==='split'||this.p.mode==='double')return this.voices.slice(layer?half:0,layer?count:half);return this.voices.slice(0,count);}
 layerFor(note){return this.p.mode==='split'&&note>=this.p.splitPoint?1:0;}
 allocate(note,layer){const bank=this.bank(layer);return bank.find(v=>v.active&&v.note===note&&v.layer===layer)||bank.find(v=>!v.active)||bank.filter(v=>!v.gate).sort((a,b)=>a.order-b.order)[0]||bank.slice().sort((a,b)=>a.order-b.order)[0];}
 startVoice(v,note,vel,layer,unisonIndex=0,unisonSize=1){
  const p=layer?this.pB:this.p,wasActive=v.active,previous=v.pitch,target=note+(p.transpose||0);v.layer=layer;v.note=note;v.targetPitch=target;v.pitch=wasActive&&p.portamento>.001?previous:target;v.glide=p.portamento;
  v.active=true;v.gate=true;v.order=++this.order;v.vel=vel;v.amp=0;v.filterEnv=0;v.ampStage='attack';v.filterStage='attack';v.phase1=Math.random();v.phase2=Math.random();
  v.pan=unisonSize>1?(unisonIndex-(unisonSize-1)/2)/Math.max(2,unisonSize):((v.i%this.halfCount())-(this.halfCount()-1)/2)/Math.max(2,this.halfCount());
  v.rand=(Math.random()-.5)*.0006;v.lp1=v.bp1=v.lp2=v.bp2=0;
 }
 lowestHeld(layer){const matches=[...this.heldNotes.entries()].filter(([note])=>this.p.mode==='double'||this.p.mode!=='split'||this.layerFor(note)===layer);matches.sort((a,b)=>a[0]-b[0]);return matches[0]||null;}
 triggerUnison(layer,note,vel){const bank=this.bank(layer);if(bank.some(v=>v.active&&v.gate&&v.note===note&&v.layer===layer))return;bank.forEach((v,i)=>this.startVoice(v,note,vel,layer,i,bank.length));}
 noteOn(note,vel){
  this.heldNotes.set(note,vel);
  if(this.p.unison){const layers=this.p.mode==='double'?[0,1]:[this.layerFor(note)];layers.forEach(layer=>{const low=this.lowestHeld(layer);if(low)this.triggerUnison(layer,low[0],low[1]);});return;}
  if(this.p.mode==='double'){[0,1].forEach(layer=>this.startVoice(this.allocate(note,layer),note,vel,layer));return;}
  const layer=this.layerFor(note);this.startVoice(this.allocate(note,layer),note,vel,layer);
 }
 noteOff(note){
  this.heldNotes.delete(note);
  if(this.p.unison){const layers=this.p.mode==='double'?[0,1]:[this.layerFor(note)];layers.forEach(layer=>{const low=this.lowestHeld(layer);if(low)this.triggerUnison(layer,low[0],low[1]);else if(!this.hold&&!this.sustain)this.bank(layer).forEach(v=>{v.gate=false;this.release(v);});});return;}
  this.voices.forEach(v=>{if(v.note===note&&v.gate){v.gate=false;if(!this.sustain&&!this.hold)this.release(v);}});
 }
 releaseUnheld(){
  this.voices.forEach(v=>{if(v.active&&!v.gate&&!this.sustain&&!this.hold&&!this.heldNotes.has(v.note))this.release(v);});
  if(this.hold)return;
  this.voices.forEach(v=>{if(v.active&&v.gate&&!this.heldNotes.has(v.note)){v.gate=false;if(!this.sustain)this.release(v);}});
 }
 release(v){v.ampStage='release';v.filterStage='release';}
 env(v,p,which,dt){
  const amp=which==='amp',x=amp?v.amp:v.filterEnv,stage=amp?v.ampStage:v.filterStage,atk=amp?p.ampAttack:p.filterAttack,dec=amp?p.ampDecay:p.filterDecay,sus=amp?p.ampSustain:p.filterSustain,rel=amp?p.ampRelease:p.filterRelease;let next=x,nextStage=stage;
  if(stage==='attack'){next+=(1-next)*(1-Math.exp(-dt/(.002+atk*atk*1.4)));if(next>.999)nextStage='decay';}
  else if(stage==='decay')next+=(sus-next)*(1-Math.exp(-dt/(.004+dec*dec*3.2)));
  else if(stage==='release'){next*=Math.exp(-dt/(.008+rel*rel*4.5));if(next<.0001){next=0;nextStage='idle';if(amp){v.active=false;v.note=-1;}}}
  if(amp){v.amp=next;v.ampStage=nextStage;}else{v.filterEnv=next;v.filterStage=nextStage;}
 }
 lfoValue(index,p,dt){const l=this.lfos[index],rate=.1*Math.pow(200,clamp(p.lfoRate,0,1));l.phase+=rate*dt;let wrapped=false;if(l.phase>=1){l.phase-=1;wrapped=true;}if(p.lfoWave==='s&h'&&wrapped)l.hold=this.noise(this.voices[index===0?0:4]);if(p.lfoWave==='square')return l.phase<.5?1:-1;if(p.lfoWave==='s&h')return l.hold;return Math.sin(l.phase*Math.PI*2);}
 process(_inputs,outputs){
  const out=outputs[0],L=out[0],R=out[1]||out[0],sr=sampleRate,dt=1/sr,count=this.voiceCount(),half=this.halfCount();
  for(let i=0;i<L.length;i++){
   while(this.scheduled.length&&this.scheduled[0].frame<=currentFrame+i)this.dispatch(this.scheduled.shift());
   const p0=this.p,p1=(this.p.mode==='split'||this.p.mode==='double')?this.pB:this.p,lfo0=this.lfoValue(0,p0,dt),lfo1=this.lfoValue(1,p1,dt);let left=0,right=0;
   for(const v of this.voices){
    if(!v.active||v.i>=count)continue;const p=v.layer===1?this.pB:this.p;this.env(v,p,'amp',dt);this.env(v,p,'filter',dt);
    if(v.glide>.001){const time=.004+v.glide*v.glide*1.15,alpha=1-Math.exp(-dt/time);v.pitch+=(v.targetPitch-v.pitch)*alpha;if(Math.abs(v.targetPitch-v.pitch)<.001)v.pitch=v.targetPitch;}else v.pitch=v.targetPitch;
    const group=v.i<half?0:1,lfo=group===0?lfo0:lfo1,lfoDepth=p.lfoAmount*this.mod;
    const pitchMod1=(p.lfoTarget==='osc1'||p.lfoTarget==='both')?lfo*lfoDepth*4:0,pitchMod2=(p.lfoTarget==='osc2'||p.lfoTarget==='both')?lfo*lfoDepth*4:0,filterMod=p.lfoTarget==='filter'?lfo*lfoDepth*.32:0;
    const pwMod1=p.lfoPulse1?lfo*p.pulseWidthAmount*.42*this.mod:0,pwMod2=p.lfoPulse2?lfo*p.pulseWidthAmount*.42*this.mod:0,unisonOffset=this.p.unison?(v.i-(count-1)/2)*this.p.unisonDetune*.11:0;
    const bend1=this.p.bendOsc2Only?0:this.bend*this.p.bendRange,bend2=this.bend*this.p.bendRange,commonTune=this.p.masterTune*.5;
    const note1=v.pitch+bend1+pitchMod1+unisonOffset+commonTune,note2=v.pitch+bend2+pitchMod2+unisonOffset+commonTune;
    const f1=hz(note1+p.osc1Range*12),osc2Env=p.fEnvOsc2?v.filterEnv*p.filterEnv*12:0,f2=hz(note2+p.osc2Tune*30+osc2Env+v.rand*12),d1=f1/sr,d2=f2/sr;
    v.phase1+=d1;const masterWrap=v.phase1>=1;if(masterWrap)v.phase1-=Math.floor(v.phase1);
    if(p.sync&&masterWrap)v.phase2=0;else{v.phase2+=d2;if(v.phase2>=1||v.phase2<0)v.phase2=(v.phase2%1+1)%1;}
    const width=clamp(.5+(p.pulseWidth-.5)*.88,.05,.95),p1s=wave(p.osc1Wave,v.phase1,width+pwMod1,d1),p2s=wave(p.osc2Wave,v.phase2,width+pwMod2,d2);
    const osc1=p.osc1Route?p1s*p.osc1Level:0,osc2=p.osc2Route?p2s*p.osc2Level*(p.osc2Half?.562:1):0,noise=p.noiseRoute?this.pinkNoise(v)*.34:0,raw=(osc1+osc2+noise)*.38;
    const noteTrack=p.filterTrack?(v.pitch-60)/48*.35:0,envAmount=(v.filterEnv-.2)*p.filterEnv,normalized=clamp(p.cutoff+filterMod+noteTrack+envAmount,0,1),cutoff=Math.min(sr*.38,35*Math.pow(2,normalized*9.2));
    const g=Math.min(.48,2*Math.sin(Math.PI*cutoff/sr)),resonance=clamp(p.resonance,0,.94),damp=1.95-resonance*1.78;
    v.lp1+=g*v.bp1;const hp1=raw-v.lp1-damp*v.bp1;v.bp1+=g*hp1;v.lp2+=g*v.bp2;const hp2=v.lp1-v.lp2-damp*v.bp2;v.bp2+=g*hp2;
    const filtered=p.filterMode==='12'?v.lp1:v.lp2,sample=filtered*v.amp*v.vel*.145,pan=clamp(v.pan,-1,1);left+=sample*(1-pan)*.5;right+=sample*(1+pan)*.5;
   }
   const master=Math.tanh(this.p.master*1.55);L[i]=Math.tanh(left*master);R[i]=Math.tanh(right*master);
  }return true;
 }
}
registerProcessor('obxa-processor',OBXaProcessor);