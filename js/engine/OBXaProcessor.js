/* OB-Xa-inspired eight-voice analog polysynth.
 * The eight voice cards are separately allocated. A and B timbres are stored
 * independently so Split and Double modes can address two programs. Oscillators
 * use polyBLEP correction; the filter is a procedural cascade approximation
 * of the selectable 12 dB / 24 dB responses, not a circuit-level simulation.
 */
/* global sampleRate, currentFrame, registerProcessor, AudioWorkletProcessor */
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const hz=(n)=>440*Math.pow(2,(n-69)/12);
const BLEP=(t,d)=>{
 if(t<d){t/=d;return t+t-t*t-1;}
 if(t>1-d){t=(t-1)/d;return t*t+t+t+1;}
 return 0;
};
const saw=(p,d)=>2*p-1-BLEP(p,d);
const pulse=(p,w,d)=>{const duty=clamp(w,.05,.95);return (p<duty?1:-1)+BLEP(p,d)-BLEP((p+1-duty)%1,d);};
const triangle=(p)=>1-4*Math.abs(Math.round(p)-p);
const wave=(shape,p,w,d)=>shape==='pulse'?pulse(p,w,d):shape==='sawPulse'?(saw(p,d)+pulse(p,w,d))*.5:saw(p,d);
const DEFAULT={osc1Wave:'saw',osc2Wave:'saw',fEnvOsc2:false,osc1Level:.82,osc2Level:.56,osc2Tune:0,pulseWidth:.5,noise:0,sync:false,crossMod:0,cutoff:.53,resonance:.13,filterMode:'24',filterEnv:.42,filterKeyTrack:.35,filterAttack:.08,filterDecay:.32,filterSustain:.12,filterRelease:.32,ampAttack:.015,ampDecay:.3,ampSustain:.76,ampRelease:.32,lfoRate:.16,lfoAmount:0,lfoWave:'triangle',lfoTarget:'pitch',bendRange:2,master:.7,mode:'poly',splitPoint:60,unisonDetune:.12};
const GLOBAL_KEYS=new Set(['mode','splitPoint','unisonDetune','bendRange','master']);
class XaVoice{
 constructor(i){this.i=i;this.note=-1;this.layer=0;this.active=false;this.gate=false;this.order=0;this.phase1=Math.random();this.phase2=Math.random();this.lfo=Math.random();this.lfoHold=0;this.amp=0;this.filterEnv=0;this.ampStage='idle';this.filterStage='idle';this.lp1=0;this.bp1=0;this.lp2=0;this.bp2=0;this.pan=(i-3.5)/5;this.vel=.8;this.rand=(Math.random()-.5)*.0005;this.noiseSeed=((i+1)*17117)|0;}
}
class OBXaProcessor extends AudioWorkletProcessor{
 constructor(){super();this.p={...DEFAULT};this.pB={...DEFAULT};this.voices=Array.from({length:8},(_,i)=>new XaVoice(i));this.order=0;this.bend=0;this.mod=0;this.sustain=false;this.scheduled=[];this.port.onmessage=e=>this.message(e.data);}
 message(m){if((m.t==='noteOn'||m.t==='noteOff')&&Number.isFinite(m.frame)&&m.frame>currentFrame){this.scheduled.push(m);this.scheduled.sort((a,b)=>a.frame-b.frame);return;}this.dispatch(m);}
 dispatch(m){
  if(m.t==='patch'){this.p={...DEFAULT,...m.patch};this.pB={...DEFAULT,...(m.patch.layerB||m.patch)};}
  else if(m.t==='param'&&m.key in DEFAULT){const target=m.layer===1&&!GLOBAL_KEYS.has(m.key)?this.pB:this.p;target[m.key]=m.value;}
  else if(m.t==='noteOn')this.noteOn(m.note|0,clamp(m.vel,.01,1));
  else if(m.t==='noteOff')this.noteOff(m.note|0);
  else if(m.t==='bend')this.bend=clamp(m.value,-1,1);
  else if(m.t==='mod')this.mod=clamp(m.value,0,1);
  else if(m.t==='sustain'){this.sustain=!!m.down;if(!this.sustain)this.voices.forEach(v=>{if(!v.gate)this.release(v);});}
  else if(m.t==='volume')this.p.master=clamp(m.value,0,1);
  else if(m.t==='allOff'||m.t==='allSoundOff'){this.scheduled.length=0;this.voices.forEach(v=>{v.gate=false;this.release(v);});}
 }
 noise(v){let x=v.noiseSeed|0;x^=x<<13;x^=x>>>17;x^=x<<5;v.noiseSeed=x|0;return (x>>>0)/2147483648-1;}
 allocate(note,layer,exclude=[]){
  const available=this.voices.filter(v=>!exclude.includes(v));
  const bank=this.p.mode==='split'||this.p.mode==='double'
   ? available.filter(v=>v.i>=(layer?4:0)&&v.i<(layer?8:4)) : available;
  return bank.find(v=>v.active&&v.note===note&&v.layer===layer)
   ||bank.find(v=>!v.active)
   ||bank.filter(v=>!v.gate).sort((a,b)=>a.order-b.order)[0]
   ||bank.sort((a,b)=>a.order-b.order)[0];
 }
 noteOn(note,vel){
  const mode=this.p.mode;
  let assignments=[];
  if(mode==='unison')assignments=this.voices.map(v=>({voice:v,layer:0}));
  else if(mode==='double'){
   const a=this.allocate(note,0);
   const b=this.allocate(note,1,[a]);
   assignments=[{voice:a,layer:0},{voice:b,layer:1}];
  }else{
   const layer=mode==='split'&&note>=this.p.splitPoint?1:0;
   assignments=[{voice:this.allocate(note,layer),layer}];
  }
  assignments.forEach(({voice:v,layer})=>{
   v.layer=layer;v.note=note;v.active=true;v.gate=true;v.order=++this.order;v.vel=vel;
   v.amp=0;v.filterEnv=0;v.ampStage='attack';v.filterStage='attack';
   v.phase1=Math.random();v.phase2=Math.random();v.pan=mode==='unison'?(v.i-3.5)/4:(v.i-3.5)/8;
   v.rand=(Math.random()-.5)*.0006;v.lp1=v.bp1=v.lp2=v.bp2=0;
  });
 }
 release(v){v.ampStage='release';v.filterStage='release';}
 noteOff(note){this.voices.forEach(v=>{if(v.note===note&&v.gate){v.gate=false;if(!this.sustain)this.release(v);}});}
 env(v,p,which,dt){
  const amp=which==='amp',x=amp?v.amp:v.filterEnv,stage=amp?v.ampStage:v.filterStage;
  const atk=amp?p.ampAttack:p.filterAttack,dec=amp?p.ampDecay:p.filterDecay;
  const sus=amp?p.ampSustain:p.filterSustain,rel=amp?p.ampRelease:p.filterRelease;
  let next=x,nextStage=stage;
  if(stage==='attack'){next+=(1-next)*(1-Math.exp(-dt/(.002+atk*atk*1.4)));if(next>.999)nextStage='decay';}
  else if(stage==='decay')next+=(sus-next)*(1-Math.exp(-dt/(.004+dec*dec*3.2)));
  else if(stage==='release'){next*=Math.exp(-dt/(.008+rel*rel*4.5));if(next<.0001){next=0;nextStage='idle';if(amp){v.active=false;v.note=-1;}}}
  if(amp){v.amp=next;v.ampStage=nextStage;}else{v.filterEnv=next;v.filterStage=nextStage;}
 }
 process(_inputs,outputs){
  const out=outputs[0],L=out[0],R=out[1]||out[0],sr=sampleRate,dt=1/sr;
  for(let i=0;i<L.length;i++){
   while(this.scheduled.length&&this.scheduled[0].frame<=currentFrame+i)this.dispatch(this.scheduled.shift());
   let left=0,right=0;
   for(const v of this.voices){
    if(!v.active)continue;
    const p=v.layer===1?this.pB:this.p;
    this.env(v,p,'amp',dt);this.env(v,p,'filter',dt);
    v.lfo+=(.08*Math.pow(300,p.lfoRate))/sr;
    let lfoWrapped=false;if(v.lfo>=1){v.lfo-=1;lfoWrapped=true;}
    if(p.lfoWave==='s&h'&&lfoWrapped)v.lfoHold=this.noise(v);
    const lfo=p.lfoWave==='s&h'?v.lfoHold:p.lfoWave==='square'?(v.lfo<.5?1:-1):p.lfoWave==='saw'?2*v.lfo-1:Math.sin(v.lfo*2*Math.PI);
    const lfoDepth=p.lfoAmount+this.mod*.22;
    const pitchMod=p.lfoTarget==='pitch'?lfo*lfoDepth*1.8:0;
    const pwMod=p.lfoTarget==='pulse'?lfo*lfoDepth*.4:0;
    const unisonOffset=this.p.mode==='unison'?(v.i-3.5)*this.p.unisonDetune*.055:0;
    const note=v.note+this.bend*this.p.bendRange+pitchMod+unisonOffset;
    const f1=hz(note),osc2Env=p.fEnvOsc2?(v.filterEnv-.15)*p.filterEnv*18:0,f2=hz(note+p.osc2Tune*12+osc2Env+v.rand*12);
    const d1=f1/sr,d2=f2/sr;
    v.phase1+=d1;
    const masterWrap=v.phase1>=1;
    if(masterWrap)v.phase1-=Math.floor(v.phase1);
    const fm=p.crossMod*Math.sin(v.phase1*Math.PI*2)*f1*.45;
    if(p.sync&&masterWrap)v.phase2=0;
    else{v.phase2+=d2+fm/sr;if(v.phase2>=1||v.phase2<0)v.phase2=(v.phase2%1+1)%1;}
    const p1=wave(p.osc1Wave,v.phase1,p.pulseWidth+pwMod,d1);
    const p2=wave(p.osc2Wave,v.phase2,p.pulseWidth+pwMod,d2);
    const raw=(p1*p.osc1Level+p2*p.osc2Level+this.noise(v)*p.noise)*.38;
    const filterMod=p.lfoTarget==='filter'?lfo*lfoDepth*.32:0;
    const noteTrack=(v.note-60)/48*p.filterKeyTrack;
    const envAmount=(v.filterEnv-.2)*p.filterEnv;
    const normalized=clamp(p.cutoff+filterMod+noteTrack+envAmount,0,1);
    const cutoff=Math.min(sr*.38,35*Math.pow(2,normalized*9.2));
    const g=Math.min(.48,2*Math.sin(Math.PI*cutoff/sr));
    const resonance=clamp(p.resonance,0,.94),damp=1.95-resonance*1.78;
    v.lp1+=g*v.bp1;const hp1=raw-v.lp1-damp*v.bp1;v.bp1+=g*hp1;
    v.lp2+=g*v.bp2;const hp2=v.lp1-v.lp2-damp*v.bp2;v.bp2+=g*hp2;
    const filtered=p.filterMode==='12'?v.lp1:v.lp2;
    const sample=filtered*v.amp*v.vel*.145,pan=clamp(v.pan,-1,1);
    left+=sample*(1-pan)*.5;right+=sample*(1+pan)*.5;
   }
   const master=Math.tanh(this.p.master*1.55);
   L[i]=Math.tanh(left*master);R[i]=Math.tanh(right*master);
  }
  return true;
 }
}
registerProcessor('obxa-processor',OBXaProcessor);
