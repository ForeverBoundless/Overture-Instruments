/* Oberheim OB-Xa model: selectable 4 / 6 / 8 voices, two independent four-voice
 * control groups, dual VCOs, selectable 2 / 4 pole low-pass response, two ADSRs
 * and a VCA per voice. Procedural approximation, not component-exact circuitry. */
/* global sampleRate, currentFrame, registerProcessor, AudioWorkletProcessor */
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),hz=n=>440*Math.pow(2,(n-69)/12);
const BLEP=(t,d)=>{if(t<d){t/=d;return t+t-t*t-1;}if(t>1-d){t=(t-1)/d;return t*t+t+t+1;}return 0;};
const saw=(p,d)=>2*p-1-BLEP(p,d),pulse=(p,w,d)=>{const q=clamp(w,.05,.95);return (p<q?1:-1)+BLEP(p,d)-BLEP((p+1-q)%1,d);};
const wave=(shape,p,w,d)=>shape==='pulse'?pulse(p,w,d):saw(p,d);
const DEFAULT={mode:'full',voiceCount:8,splitPoint:60,unison:false,unisonDetune:.12,bendRange:12,bendNarrow:false,bendOsc2Only:false,master:.7,masterTune:0,hold:false,layerBalance:.5,chordMode:false,portamentoMode:'linear',portamentoOffset:true,transposeDown:false,transposeUp:false,modLowerEnabled:true,modUpperEnabled:true,osc1Wave:'saw',osc2Wave:'saw',osc1Range:0,osc1Level:.82,osc2Level:.56,osc2Tune:0,pulseWidth:.5,sync:false,fEnvOsc2:false,osc1Route:true,osc2Route:true,osc2Half:false,noiseRoute:false,cutoff:.53,resonance:.13,filterMode:'24',filterTrack:true,filterEnv:.42,filterAttack:.08,filterDecay:.32,filterSustain:.12,filterRelease:.32,ampAttack:.015,ampDecay:.3,ampSustain:.76,ampRelease:.32,lfoRate:.16,lfoAmount:0,lfoWave:'sine',lfoTarget:'both',lfoOsc1:true,lfoOsc2:true,lfoFilter:false,pulseWidthAmount:0,lfoPulse1:false,lfoPulse2:false,transpose:0,portamento:0};
const GLOBAL_KEYS=new Set(['mode','voiceCount','splitPoint','unison','unisonDetune','bendRange','bendNarrow','bendOsc2Only','master','masterTune','hold','layerBalance','chordMode','portamentoMode','portamentoOffset','transposeDown','transposeUp','modLowerEnabled','modUpperEnabled']);
class XaVoice{
 constructor(i){this.i=i;this.note=-1;this.inputNote=-1;this.pitch=60;this.targetPitch=60;this.glideAccumulator=0;this.hasPlayed=false;this.layer=0;this.active=false;this.gate=false;this.order=0;this.phase1=Math.random();this.phase2=Math.random();this.amp=0;this.filterEnv=0;this.ampStage='idle';this.filterStage='idle';this.ic1a=0;this.ic2a=0;this.ic1b=0;this.ic2b=0;this.pan=0;this.vel=.8;this.rand=(Math.random()-.5)*.0005;this.tune1=(Math.random()-.5)*.055;this.tune2=(Math.random()-.5)*.085;this.filterTrim=(Math.random()-.5)*.018;this.ampTrim=.975+Math.random()*.05;this.driftPhase=Math.random()*Math.PI*2;this.driftRate=.035+Math.random()*.045;this.noiseSeed=((i+1)*17117)|0;this.pink=[0,0,0,0,0,0,0];this.glide=0;}
}
class OBXaProcessor extends AudioWorkletProcessor{
 constructor(){super();this.p={...DEFAULT};this.pB={...DEFAULT};this.voices=Array.from({length:8},(_,i)=>new XaVoice(i));this.order=0;this.bend=0;this.mod=0;this.sustain=false;this.hold=false;this.heldNotes=new Map();this.scheduled=[];this.lfos=[{phase:0,hold:0},{phase:0,hold:0}];this.chordMemory=[[],[]];this.port.onmessage=e=>this.message(e.data);}
 message(m){if((m.t==='noteOn'||m.t==='noteOff')&&Number.isFinite(m.frame)&&m.frame>currentFrame){this.scheduled.push(m);this.scheduled.sort((a,b)=>a.frame-b.frame);return;}this.dispatch(m);}
 dispatch(m){
  if(m.t==='patch'){const wasHold=this.hold;this.p={...DEFAULT,...m.patch};this.pB={...DEFAULT,...(m.patch.layerB||m.patch)};this.hold=!!this.p.hold;if(wasHold&&!this.hold)this.releaseUnheld();}
  else if(m.t==='clearChord'){this.chordMemory=[[],[]];}
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
 startVoice(v,note,vel,layer,unisonIndex=0,unisonSize=1,inputNote=note){
  const p=layer?this.pB:this.p,previous=v.pitch,target=note+(p.transpose||0);v.layer=layer;v.note=note;v.inputNote=inputNote;v.targetPitch=target;v.pitch=v.hasPlayed&&p.portamento>.001?previous:target;v.hasPlayed=true;v.glideAccumulator=0;v.glide=p.portamento;
  v.active=true;v.gate=true;v.order=++this.order;v.vel=vel;v.amp=0;v.filterEnv=0;v.ampStage='attack';v.filterStage='attack';v.phase1=Math.random();v.phase2=Math.random();
  v.pan=unisonSize>1?(unisonIndex-(unisonSize-1)/2)/Math.max(2,unisonSize):((v.i%this.halfCount())-(this.halfCount()-1)/2)/Math.max(2,this.halfCount());
  v.rand=(Math.random()-.5)*.0006;v.ic1a=v.ic2a=v.ic1b=v.ic2b=0;
 }
 lowestHeld(layer){const matches=[...this.heldNotes.entries()].filter(([note])=>this.p.mode==='double'||this.p.mode!=='split'||this.layerFor(note)===layer);matches.sort((a,b)=>a[0]-b[0]);return matches[0]||null;}
 transposeNote(note){return note+(this.p.transposeUp?12:this.p.transposeDown?-12:0);}
 triggerUnison(layer,note,vel){const bank=this.bank(layer),soundingNote=this.transposeNote(note);if(bank.some(v=>v.active&&v.gate&&v.inputNote===note&&v.layer===layer))return;bank.forEach((v,i)=>this.startVoice(v,soundingNote,vel,layer,i,bank.length,note));}
 noteOn(note,vel){
  this.heldNotes.set(note,vel);
  const soundingNote=this.transposeNote(note),layers=this.p.mode==='double'?[0,1]:[this.layerFor(note)];
  if(this.hold&&!this.p.chordMode)layers.forEach(layer=>{const chord=this.chordMemory[layer];if(!chord.includes(soundingNote))chord.push(soundingNote);chord.sort((a,b)=>a-b);});
  if(this.p.unison){layers.forEach(layer=>{const low=this.lowestHeld(layer);if(low)this.triggerUnison(layer,low[0],low[1]);});return;}
  if(this.p.chordMode){layers.forEach(layer=>{const memory=this.chordMemory[layer],base=memory.length?memory[0]:soundingNote,notes=memory.length?memory:[soundingNote];notes.forEach(stored=>{let played=soundingNote+(stored-base);while(played>96)played-=12;while(played<36)played+=12;this.startVoice(this.allocate(played,layer),played,vel,layer,0,1,note);});});return;}
  layers.forEach(layer=>this.startVoice(this.allocate(soundingNote,layer),soundingNote,vel,layer,0,1,note));
 }
 noteOff(note){
  this.heldNotes.delete(note);
  if(this.p.unison){const layers=this.p.mode==='double'?[0,1]:[this.layerFor(note)];layers.forEach(layer=>{const low=this.lowestHeld(layer);if(low)this.triggerUnison(layer,low[0],low[1]);else if(!this.hold&&!this.sustain)this.bank(layer).forEach(v=>{v.gate=false;this.release(v);});});return;}
  this.voices.forEach(v=>{if(v.inputNote===note&&v.gate){v.gate=false;if(!this.sustain&&!this.hold)this.release(v);}});
 }
 releaseUnheld(){
  this.voices.forEach(v=>{if(v.active&&!v.gate&&!this.sustain&&!this.hold&&!this.heldNotes.has(v.inputNote))this.release(v);});
  if(this.hold)return;
  this.voices.forEach(v=>{if(v.active&&v.gate&&!this.heldNotes.has(v.inputNote)){v.gate=false;if(!this.sustain)this.release(v);}});
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
   const p0=this.p,p1=(this.p.mode==='split'||this.p.mode==='double')?this.pB:this.p,lfo0=this.lfoValue(0,p0,dt),lfo1=this.lfoValue(1,p1,dt);
   let leftA=0,rightA=0,leftB=0,rightB=0;
   for(const v of this.voices){
    if(!v.active||v.i>=count)continue;const p=v.layer===1?this.pB:this.p;
    this.env(v,p,'amp',dt);this.env(v,p,'filter',dt);
    if(v.glide>.001&&Math.abs(v.targetPitch-v.pitch)>.001){
     const direction=Math.sign(v.targetPitch-v.pitch),offset=this.p.portamentoOffset?(1+((v.i%4)-1.5)*.045):1,speed=1/(.008+v.glide*v.glide*.32)/offset;
     if(this.p.portamentoMode==='quantized'){v.glideAccumulator+=dt*speed;while(v.glideAccumulator>=1){v.pitch+=direction;v.glideAccumulator-=1;}if((direction>0&&v.pitch>v.targetPitch)||(direction<0&&v.pitch<v.targetPitch))v.pitch=v.targetPitch;}
     else v.pitch+=direction*speed*dt;if(Math.abs(v.targetPitch-v.pitch)<.001)v.pitch=v.targetPitch;
    }else v.pitch=v.targetPitch;
    const group=this.p.mode==='full'?0:(v.i<half?0:1),lfo=group===0?lfo0:lfo1;
    const enabled=this.p.mode==='full'||(group===0?this.p.modLowerEnabled:this.p.modUpperEnabled),depth=enabled?clamp(p.lfoAmount+this.mod*.22,0,1):0;
    const pitch1=p.lfoOsc1?lfo*depth*4:0,pitch2=p.lfoOsc2?lfo*depth*4:0,filterMod=p.lfoFilter?lfo*depth*.24:0;
    const pwDepth=enabled?clamp(p.pulseWidthAmount+this.mod*.22,0,1):0,pw1=p.lfoPulse1?lfo*pwDepth*.42:0,pw2=p.lfoPulse2?lfo*pwDepth*.42:0;
    const unison=this.p.unison?(v.i-(count-1)/2)*this.p.unisonDetune*.11:0;
    const bend1=enabled?(this.p.bendOsc2Only?0:this.bend*this.p.bendRange):0,bend2=enabled?this.bend*this.p.bendRange:0;
    v.driftPhase+=v.driftRate*dt;if(v.driftPhase>Math.PI*2)v.driftPhase-=Math.PI*2;
    const drift=Math.sin(v.driftPhase)*.012,tune=this.p.masterTune;
    const f1=hz(v.pitch+bend1+pitch1+unison+tune+v.tune1+drift+p.osc1Range*12);
    const f2=hz(v.pitch+bend2+pitch2+unison+tune+v.tune2-drift+p.osc2Tune*30+(p.fEnvOsc2?v.filterEnv*p.filterEnv*12:0)+v.rand*12);
    const d1=f1/sr,d2=f2/sr;v.phase1+=d1;const wrap=v.phase1>=1;if(wrap)v.phase1-=Math.floor(v.phase1);
    if(p.sync&&wrap)v.phase2=0;else{v.phase2+=d2;if(v.phase2>=1||v.phase2<0)v.phase2=(v.phase2%1+1)%1;}
    const width=clamp(.5-p.pulseWidth*.45,.05,.5);
    const osc1=p.osc1Route?wave(p.osc1Wave,v.phase1,width+pw1,d1)*p.osc1Level:0;
    const osc2=p.osc2Route?wave(p.osc2Wave,v.phase2,width+pw2,d2)*p.osc2Level*(p.osc2Half?.562:1):0;
    const noise=p.noiseRoute?this.pinkNoise(v)*.34:0,raw=Math.tanh((osc1+osc2+noise)*.52);
    const track=p.filterTrack?(v.pitch+tune-60)/48*.35:0,env=v.filterEnv*p.filterEnv*.34;
    const normalized=clamp(p.cutoff+filterMod+track+env+v.filterTrim,0,1),cutoff=Math.min(sr*.38,30*Math.pow(2,normalized*9.2));
    // Two topology-preserving stages approximate the OB-Xa's selectable CEM3320 12/24 dB LP paths.
    const g=Math.tan(Math.PI*cutoff/sr),k=2-clamp(p.resonance,0,.94)*1.9;
    const a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2;
    let x=raw-v.ic2a,y=a1*v.ic1a+a2*x,z=v.ic2a+a2*v.ic1a+a3*x;
    v.ic1a=2*y-v.ic1a;v.ic2a=2*z-v.ic2a;const twoPole=z;
    x=twoPole-v.ic2b;y=a1*v.ic1b+a2*x;z=v.ic2b+a2*v.ic1b+a3*x;
    v.ic1b=2*y-v.ic1b;v.ic2b=2*z-v.ic2b;
    const filtered=p.filterMode==='12'?twoPole:z;
    const sample=Math.tanh(filtered*1.35)*v.amp*v.vel*.245*v.ampTrim,pan=clamp(v.pan,-1,1);
    if(v.layer===1){rightB+=sample*(1+pan)*.5;leftB+=sample*(1-pan)*.5;}else{rightA+=sample*(1+pan)*.5;leftA+=sample*(1-pan)*.5;}
   }
   const balance=this.p.mode==='full'?.5:clamp(this.p.layerBalance,0,1);
   const gainA=this.p.mode==='full'?1:Math.cos(balance*Math.PI*.5),gainB=this.p.mode==='full'?0:Math.sin(balance*Math.PI*.5);
   const master=Math.tanh(this.p.master*1.55);
   L[i]=Math.tanh((leftA*gainA+leftB*gainB)*master*1.18);
   R[i]=Math.tanh((rightA*gainA+rightB*gainB)*master*1.18);
  }return true;
 }
}
registerProcessor('obxa-processor',OBXaProcessor);