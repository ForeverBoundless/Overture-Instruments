/* Hohner Clavinet D6 physical-model approximation.
 * One waveguide string per key; velocity-shaped tangent excitation; fractional
 * pickup combs; string loss/dispersion; yarn-damper release; four-register tone stack.
 * The stompboxes form a separate serial effects chain.
 */
/* global sampleRate, currentFrame, registerProcessor, AudioWorkletProcessor */
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const midiHz=n=>440*Math.pow(2,(n-69)/12);
const DEFAULT={toneFilters:[true,false,false,false],pickup:'bothIn',volume:.82,damping:0,pedalboardEnabled:true};
class ClavString{
 constructor(){
  this.note=-1;this.active=false;this.gate=false;this.order=0;this.buffer=new Float32Array(2048);
  this.length=2048;this.position=0;this.velocity=.7;this.release=1;this.releasePitch=0;
  this.loss=0;this.lossAlpha=.2;this.dispersion=.04;this.dispIn=0;this.dispOut=0;this.rippleDelay=1;this.ripple=-.001;
  this.tone=new Float32Array(5);this.mute=0;this.pan=0;this.seed=1;
  this.pickupIntegral=0;this.pickupPrevious=0;this.beatPhase=0;this.beatRate=1;this.beatDepth=0;
  this.knock=0;this.knockState=0;this.loopGain=.999;
 }
}
function seedPreviewMessages(processor, messages, dispatch) {
  if (!Array.isArray(messages)) return;
  messages.forEach((message) => {
    if (message?.t === 'noteOn' || message?.t === 'noteOff') {
      processor.scheduled.push({ ...message });
    } else {
      dispatch.call(processor, message);
    }
  });
  processor.scheduled.sort((a, b) => a.frame - b.frame);
}

class HohnerD6Processor extends AudioWorkletProcessor{
 constructor(options = {}){
  super();this.p={...DEFAULT};this.voices=Array.from({length:60},()=>new ClavString());
  this.order=0;this.bend=0;this.sustain=false;this.scheduled=[];
  this.pedals={
   overdrive:{enabled:false,drive:.25,tone:.65,level:.78},
   compressor:{enabled:false,sustain:.45,level:.75},
   wah:{enabled:false,position:.5,resonance:.65,mix:.75},
   phaser:{enabled:false,rate:.22,depth:.5,feedback:.15,mix:.5},
   chorus:{enabled:false,rate:.2,depth:.5,mix:.38},
   spring:{enabled:false,mix:.25,decay:.35}
  };
  const size=8192;
  this.fx={
   comp:0,driveL:0,driveR:0,phaserPhase:0,chorusPhase:0,chorusIndex:0,springIndex:0,
   wahL1:0,wahL2:0,wahR1:0,wahR2:0,
   phaserXL:new Float32Array(6),phaserYL:new Float32Array(6),phaserXR:new Float32Array(6),phaserYR:new Float32Array(6),
   chorusL:new Float32Array(size),chorusR:new Float32Array(size),
   springL:Array.from({length:4},()=>new Float32Array(size)),springR:Array.from({length:4},()=>new Float32Array(size)),
   springLP_L:new Float32Array(4),springLP_R:new Float32Array(4)
  };
  this.port.onmessage=e=>this.message(e.data);
    seedPreviewMessages(this, options?.processorOptions?.messages, this.message);
 }
 message(m){
    if (m?.t === '__preview_flush') { this.port.postMessage({ t: '__preview_flush_ack', id: m.id }); return; }

  if((m.t==='noteOn'||m.t==='noteOff')&&Number.isFinite(m.frame)&&m.frame>currentFrame){this.scheduled.push(m);this.scheduled.sort((a,b)=>a.frame-b.frame);return;}
  this.dispatch(m);
 }
 dispatch(m){
  if(m.t==='patch'){this.p={...DEFAULT,...m.patch};if(m.patch?.pedals)this.pedals=this.mergePedals(m.patch.pedals);}
  else if(m.t==='param'&&m.key in DEFAULT)this.p[m.key]=Array.isArray(m.value)?m.value.slice():m.value;
  else if(m.t==='pedals')this.pedals=this.mergePedals(m.pedals||{});
  else if(m.t==='pedal'&&this.pedals[m.name])this.pedals[m.name]={...this.pedals[m.name],...m.values};
  else if(m.t==='noteOn')this.noteOn(m.note|0,clamp(m.vel,.01,1));
  else if(m.t==='noteOff')this.noteOff(m.note|0);
  else if(m.t==='bend')this.bend=clamp(m.value,-1,1);
  else if(m.t==='sustain'){this.sustain=!!m.down;if(!this.sustain)this.voices.forEach(v=>{if(!v.gate&&v.note>=0)this.releaseVoice(v);});}
  else if(m.t==='volume')this.p.volume=clamp(m.value,0,1);
  else if(m.t==='allOff'||m.t==='allSoundOff'){this.scheduled.length=0;this.voices.forEach(v=>{v.gate=false;v.release=0;v.active=false;v.note=-1;});}
 }
 mergePedals(incoming){const next={...this.pedals};Object.keys(next).forEach(name=>{if(incoming[name])next[name]={...next[name],...incoming[name]};});return next;}
 random(v){let x=v.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;v.seed=x|0;return (x>>>0)/4294967296*2-1;}
 noteOn(note,velocity){
  if(note<29||note>88)return;
  let v=this.voices.find(x=>x.active&&x.note===note);
  if(!v)v=this.voices.find(x=>!x.active)||this.voices.slice().sort((a,b)=>a.order-b.order)[0];
  const length=sampleRate/midiHz(note);
  v.buffer=new Float32Array(Math.ceil(length)+1);v.length=length;v.position=0;
  v.seed=((note*7919+(this.order+17)*104729)|0)||1;
  const pulseLength=Math.max(8,Math.min(Math.round(length*.12),Math.round(sampleRate*(.0004+(1-velocity)*.0013))));
  for(let i=0;i<pulseLength;i++){
   const x=(i+.5)/pulseLength,tri=x<.5?2*x:2*(1-x),shape=tri*tri*(3-2*tri);
   v.buffer[i]=shape*velocity*.78+this.random(v)*.003*velocity;
  }
  const wound=note<=51,period=length/sampleRate,t60=wound?17.5:9.5-clamp((note-52)/36,0,1)*5.2;
  v.loopGain=Math.pow(10,-3*period/t60);v.dispersion=wound?.14:.035;
  v.lossAlpha=1-Math.exp(-2*Math.PI*(4300+Math.max(0,note-52)*18)/sampleRate);
  v.rippleDelay=Math.max(1,Math.round(length*(.33+(this.random(v)+1)*.085)));v.ripple=-.001+(this.random(v)+1)*.0015;
  v.note=note;v.velocity=velocity;v.active=true;v.gate=true;v.order=++this.order;
  v.release=1;v.releasePitch=0;v.loss=0;v.dispIn=0;v.dispOut=0;v.tone.fill(0);v.mute=0;
  v.pickupIntegral=0;v.pickupPrevious=0;v.pan=((note%5)-2)*.018;
  v.beatPhase=0;v.beatRate=.5+(this.random(v)+1)*.75;v.beatDepth=note<=64&&this.random(v)>.35?.72:0;
  v.knock=note>=72?(this.random(v)+1)*(.006+velocity*.012)*.5:0;v.knockState=0;
 }
 releaseVoice(v){if(!v.active)return;v.gate=false;v.releasePitch=3;}
 noteOff(note){this.voices.forEach(v=>{if(v.note===note&&v.gate){v.gate=false;if(!this.sustain)this.releaseVoice(v);}});}
 pickupTap(v,delay){
  let pos=(v.position-delay)%v.length;if(pos<0)pos+=v.length;
  const i=Math.floor(pos),f=pos-i,j=(i+1)%v.buffer.length;return v.buffer[i]*(1-f)+v.buffer[j]*f;
 }
 pickup(v,position){return this.pickupTap(v,0)-this.pickupTap(v,v.length*position);}
 applyEffects(inputL,inputR,sr){
  const fx=this.fx,p=this.pedals;let l=inputL,r=inputR;
  if(this.p.pedalboardEnabled){
   const c=p.compressor;
   if(c.enabled){
    const level=Math.max(Math.abs(l),Math.abs(r)),atk=1-Math.exp(-1/(sr*.008)),rel=1-Math.exp(-1/(sr*.19));
    fx.comp+=(level-fx.comp)*(level>fx.comp?atk:rel);
    const threshold=.035+(1-clamp(c.sustain,0,1))*.025,ratio=2.2+clamp(c.sustain,0,1)*6.8;
    const reduction=fx.comp>threshold?Math.pow(threshold/Math.max(fx.comp,1e-8),1-1/ratio):1;
    const makeup=.9+clamp(c.level,0,1)*.8;l*=reduction*makeup;r*=reduction*makeup;
   }
   const d=p.overdrive;
   if(d.enabled){
    const amount=1+clamp(d.drive,0,1)*20,cutoff=650+clamp(d.tone,0,1)*7800,a=1-Math.exp(-2*Math.PI*cutoff/sr);
    fx.driveL+=a*(l-fx.driveL);fx.driveR+=a*(r-fx.driveR);
    const wetL=Math.tanh(fx.driveL*amount)*(1.1+d.level*.35),wetR=Math.tanh(fx.driveR*amount)*(1.1+d.level*.35),mix=.32+clamp(d.drive,0,1)*.62;
    l=l*(1-mix)+wetL*mix;r=r*(1-mix)+wetR*mix;
   }
   const w=p.wah;
   if(w.enabled){
    const center=260*Math.pow(8.5,clamp(w.position,0,1)),g=Math.tan(Math.PI*center/sr),k=1/(1.1+clamp(w.resonance,0,1)*8);
    const a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2;
    const xL=l-fx.wahL2,yL=a1*fx.wahL1+a2*xL,zL=fx.wahL2+a2*fx.wahL1+a3*xL;
    fx.wahL1=2*yL-fx.wahL1;fx.wahL2=2*zL-fx.wahL2;
    const xR=r-fx.wahR2,yR=a1*fx.wahR1+a2*xR,zR=fx.wahR2+a2*fx.wahR1+a3*xR;
    fx.wahR1=2*yR-fx.wahR1;fx.wahR2=2*zR-fx.wahR2;
    const mix=clamp(w.mix,0,1);l=l*(1-mix)+yL*mix*4.4;r=r*(1-mix)+yR*mix*4.4;
   }
   const ph=p.phaser;
   if(ph.enabled){
    fx.phaserPhase+=(.08+clamp(ph.rate,0,1)*1.85)/sr;if(fx.phaserPhase>=1)fx.phaserPhase-=1;
    const sweep=.5+.5*Math.sin(fx.phaserPhase*Math.PI*2),center=180+sweep*clamp(ph.depth,0,1)*1600;
    const tangent=Math.tan(Math.PI*center/sr),coef=(1-tangent)/(1+tangent);
    let wl=l+fx.phaserYL[5]*clamp(ph.feedback,0,1)*.7,wr=r+fx.phaserYR[5]*clamp(ph.feedback,0,1)*.7;
    for(let j=0;j<6;j++){
     const nl=coef*wl+fx.phaserXL[j]-coef*fx.phaserYL[j];fx.phaserXL[j]=wl;fx.phaserYL[j]=nl;wl=nl;
     const nr=coef*wr+fx.phaserXR[j]-coef*fx.phaserYR[j];fx.phaserXR[j]=wr;fx.phaserYR[j]=nr;wr=nr;
    }
    const mix=clamp(ph.mix,0,1);l=l*(1-mix)+wl*mix;r=r*(1-mix)+wr*mix;
   }
   const ch=p.chorus;
   if(ch.enabled){
    fx.chorusPhase+=(.08+clamp(ch.rate,0,1)*1.35)/sr;if(fx.chorusPhase>=1)fx.chorusPhase-=1;
    const phase=fx.chorusPhase*Math.PI*2,depth=clamp(ch.depth,0,1),len=fx.chorusL.length;
    const dl=sr*(.017+Math.sin(phase)*.0048*depth),dr=sr*(.019+Math.sin(phase+1.23)*.0048*depth);
    const pl=(fx.chorusIndex-dl+len)%len,pr=(fx.chorusIndex-dr+len)%len,il=Math.floor(pl),ir=Math.floor(pr);
    const wetL=fx.chorusL[il]*(1-(pl-il))+fx.chorusL[(il+1)%len]*(pl-il);
    const wetR=fx.chorusR[ir]*(1-(pr-ir))+fx.chorusR[(ir+1)%len]*(pr-ir);
    fx.chorusL[fx.chorusIndex]=l+wetL*.08;fx.chorusR[fx.chorusIndex]=r+wetR*.08;fx.chorusIndex=(fx.chorusIndex+1)%len;
    const mix=clamp(ch.mix,0,1)*.78;l=l*(1-mix)+wetL*mix;r=r*(1-mix)+wetR*mix;
   }
   const s=p.spring;
   if(s.enabled){
    const idx=fx.springIndex,len=fx.springL[0].length,delays=[29.7,34.1,39.7,44.9],feedback=.48+clamp(s.decay,0,1)*.43;
    let wetL=0,wetR=0;
    for(let j=0;j<4;j++){
     const delay=Math.min(len-1,Math.round(sr*delays[j]/1000)),read=(idx-delay+len)%len,dl=fx.springL[j][read],dr=fx.springR[j][read];
     fx.springLP_L[j]+=.19*(dl-fx.springLP_L[j]);fx.springLP_R[j]+=.19*(dr-fx.springLP_R[j]);
     const gain=.27-j*.016;wetL+=dl*gain;wetR+=dr*gain;
     fx.springL[j][idx]=l+fx.springLP_L[j]*feedback+fx.springLP_R[j]*.065;
     fx.springR[j][idx]=r+fx.springLP_R[j]*feedback+fx.springLP_L[j]*.065;
    }
    fx.springIndex=(idx+1)%len;const mix=clamp(s.mix,0,1);
    l=l*(1-mix)+wetL*mix*2.25;r=r*(1-mix)+wetR*mix*2.25;
   }
  }
  return [l,r];
 }
 process(_inputs,outputs){
  const out=outputs[0],L=out[0],R=out[1]||out[0],sr=sampleRate;
  const alpha=[130,450,950,1800,4200].map(fc=>1-Math.exp(-2*Math.PI*fc/sr));
  const damping=clamp(this.p.damping,0,1),tone=Array.isArray(this.p.toneFilters)?this.p.toneFilters:DEFAULT.toneFilters;
  const cutoff=12000-damping*9500,muteAlpha=1-Math.exp(-2*Math.PI*cutoff/sr);
  for(let i=0;i<L.length;i++){
   while(this.scheduled.length&&this.scheduled[0].frame<=currentFrame+i)this.dispatch(this.scheduled.shift());
   let left=0,right=0;
   for(const v of this.voices){
    if(!v.active)continue;
    const index=Math.floor(v.position),frac=v.position-index,next=(index+1)%v.buffer.length,read=v.buffer[index]*(1-frac)+v.buffer[next]*frac;
    v.loss+=v.lossAlpha*(read-v.loss);
    const dispersed=v.dispersion*v.loss+v.dispIn-v.dispersion*v.dispOut;v.dispIn=v.loss;v.dispOut=dispersed;
    const rippleIndex=(index-v.rippleDelay+v.buffer.length)%v.buffer.length,ripple=v.buffer[rippleIndex]*v.ripple;
    v.buffer[index]=(dispersed+ripple)*v.loopGain*(1-damping*.0017)*(v.gate?1:.982);
    if(!v.gate&&!this.sustain){v.release*=Math.exp(-1/(sr*.018));v.releasePitch*=Math.exp(-1/(sr*.018));}
    v.position+=Math.pow(2,(this.bend*2-v.releasePitch)/12);if(v.position>=v.length)v.position-=v.length;
    const a=this.pickup(v,.20),b=this.pickup(v,.24);
    let sample=this.p.pickup==='bridge'?a:this.p.pickup==='neck'?b:this.p.pickup==='bothOut'?(a-b)*.68:(a+b)*.5;
    v.pickupIntegral+=.08*(sample-v.pickupIntegral);
    const magnetic=Math.tanh(v.pickupIntegral*2.8);sample=(magnetic-v.pickupPrevious)*3.2;v.pickupPrevious=magnetic;
    v.mute+=muteAlpha*(sample-v.mute);sample=sample*(1-damping*.82)+v.mute*damping*.82;
    const st=v.tone;for(let j=0;j<5;j++)st[j]+=alpha[j]*(sample-st[j]);
    const low130=st[0],low450=st[1],low1800=st[3],low4200=st[4];
    if(tone[3])sample=low1800;
    if(tone[2])sample=sample*.55+(low1800-low450)*.7;
    if(tone[1])sample+=(sample-low1800)*.28;
    if(tone[0])sample+=(sample-low4200)*.42;
    sample-=low130*.12;sample+=(sample-low4200)*.16;
    if(!tone.some(Boolean))sample=0;
    v.beatPhase+=v.beatRate/sr;if(v.beatPhase>=1)v.beatPhase-=1;
    const beat=1-v.beatDepth*(1-Math.cos(v.beatPhase*Math.PI*2))*.5;
    if(v.knock>0){v.knockState=v.knockState*.91+this.random(v)*v.knock*.08;sample+=v.knockState;}
    const output=sample*beat*v.release*v.velocity*2.3;left+=output*(1-v.pan)*.5;right+=output*(1+v.pan)*.5;
    if(v.release<.0008){v.active=false;v.note=-1;}
   }
   const [l,r]=this.applyEffects(left*this.p.volume,right*this.p.volume,sr);
   L[i]=Math.tanh(l*1.1);R[i]=Math.tanh(r*1.1);
  }
  return true;
 }
}
registerProcessor('hohner-d6-processor',HohnerD6Processor);
