/* UDO Audio Super 8: Overture stereo AudioWorklet.
   Dual DDS voice model, seven-oscillator Super mode, stereo binaural voice paths,
   two independently voiced layers, analogue-style filters, modulation,
   independent layer sequencing/arp, and per-layer chorus/delay. */
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,Number(x)||0));
const lerp=(a,b,t)=>a+(b-a)*t;
const midiHz=n=>440*Math.pow(2,(n-69)/12);
const LAYER_DEFAULT={
 dds1Wave:'saw',altA:0,altB:1,waveMod:.0,waveModSource:'Manual',superMode:'off',detune:.16,pwDrift:.1,
 dds2Wave:'saw',dds2Octave:0,dds2Tune:0,dds2Mode:'normal',crossMod:0,subMode:'off',subLevel:.18,
 mix:.5,pan:.5,hpf:.04,cutoff:.72,resonance:.16,drive:'off',keyTrack:'on',filterMod:'env1',
 env1Attack:.08,env1AttackHold:0,env1DecayHold:0,env1Decay:.25,env1Sustain:.6,env1Release:.35,env1Loop:false,env1KeyTrack:0,
 env2Attack:.02,env2DecayHold:0,env2Decay:.32,env2Sustain:.78,env2Release:.3,
 lfo1Rate:.15,lfo1Delay:0,lfo1Wave:'sine',lfo1Mode:'reset',lfo1HighFreq:false,lrPhase:0,
 lfo2Rate:.15,lfo2Delay:0,lfo2Wave:'triangle',lfo2Destination:'filter',lfo2Amount:0,
 lfo2Bender:false,lfo2Aftertouch:false,
 chorus:'off',chorusMix:.25,delayTime:.28,delayFeedback:.25,delayMod:.1,delaySync:false,delayFreeze:false,
 voiceMode:'poly1',unison:'off',modMatrix:Array.from({length:64},()=>0),
 seqEnabled:false,seqLength:16,seqPage:0,seqMode:'step',seqSteps:Array(64).fill(null),seqSwing:0,seqBpm:120,
 arpEnabled:false,arpMode:'up',arpDivision:4,arpRange:1,arpSwing:0,arpHold:false,
 portamento:0,transpose:0,bendRange:2,volume:.85,velocity:1,aftertouch:0
};
const clone=o=>JSON.parse(JSON.stringify(o));
function polyBlep(t,dt){
 if(dt<=0)return 0;
 if(t<dt){const x=t/dt;return x+x-x*x-1;}
 if(t>1-dt){const x=(t-1)/dt;return x*x+x+x+1;}
 return 0;
}
function wav(kind,p,pw,dt=0){
 p=((p%1)+1)%1;const d=Math.min(.49,Math.max(0,dt)),duty=clamp(pw,.02,.98);
 if(kind==='sine')return Math.sin(p*2*Math.PI);
 if(kind==='triangle')return 1-4*Math.abs(p-.5);
 if(kind==='square')return (p<.5?1:-1)+polyBlep(p,d)-polyBlep((p-.5+1)%1,d);
 if(kind==='pulse')return (p<duty?1:-1)+polyBlep(p,d)-polyBlep((p-duty+1)%1,d);
 if(kind==='noise')return Math.random()*2-1;
 if(kind==='alt')return 0;
 return 2*p-1-polyBlep(p,d);
}
function altWave(index,phase){
 const p=((phase%1)+1)%1,shape=index%8,partials=2+(index%23);let v=0;
 for(let h=1;h<=partials;h++){
  const amp=(1/h)*(shape===0?1:shape===1?Math.exp(-h*.17):shape===2?(h%2?1:0):shape===3?Math.cos(h*.37):shape===4?Math.sin(h*.13):shape===5?((h%3)?1:.15):shape===6?Math.pow(.78,h):Math.cos(h*h*.015));
  v+=amp*Math.sin(2*Math.PI*h*p);
 }
 return Math.tanh(v*1.15);
}
const SOURCE_NAMES=['DDS 2','LFO 2','ENV 1','VELOCITY','AFTERTOUCH','EXPRESSION','BENDER','NOTE'];
const DEST_NAMES=['LFO 1 RATE','CROSS MOD','WAVE MOD','OSC MIX','HPF CUTOFF','LPF RESONANCE','ENV 1 DECAY','DELAY TIME'];
class Voice{
 constructor(i){this.i=i;this.reset();}
 reset(){this.active=false;this.gate=false;this.note=60;this.inputNote=60;this.layer=0;this.order=0;this.velocity=.8;this.aftertouch=0;this.pitch=60;this.targetPitch=60;this.ph1L=Array(7).fill(0);this.ph1R=Array(7).fill(0);this.ph2L=0;this.ph2R=0;this.env1=0;this.env2=0;this.e1Stage='idle';this.e2Stage='idle';this.e1Time=0;this.e2Time=0;this.lfo1L=0;this.lfo1R=0;this.lfo2=0;this.lpL=Array(4).fill(0);this.lpR=Array(4).fill(0);this.hpL=0;this.hpR=0;this.delayL=0;this.delayR=0;this.pan=(Math.random()-.5)*.3;this.noise=Math.random()*1000;}
}
class Super8Processor extends AudioWorkletProcessor{
 constructor(){
  super();this.layers=[clone(LAYER_DEFAULT),clone(LAYER_DEFAULT)];this.global={mode:'single',activeLayer:0,splitPoint:60,binaural:true,volume:.72,benderX:0,benderY:0,expression:1,sustain:false,masterTune:0};
  this.voices=Array.from({length:16},(_,i)=>new Voice(i));this.order=0;this.held=[new Map(),new Map()];this.sustain=false;this.pitchBend=[0,0];this.mpeBend=new Map();this.modWheel=0;this.expression=1;this.channelExpression=new Map();this.aftertouch=[0,0];this.channelPressure=new Map();this.polyPressure=new Map();this.mpeSlide=new Map();this.currentMods=[{},{}];this.scheduled=[];
  this.chorus=[{phase:0,bufL:new Float32Array(sampleRate),bufR:new Float32Array(sampleRate),write:0},{phase:0,bufL:new Float32Array(sampleRate),bufR:new Float32Array(sampleRate),write:0}];
  this.delay=[{bufL:new Float32Array(sampleRate*2),bufR:new Float32Array(sampleRate*2),write:0},{bufL:new Float32Array(sampleRate*2),bufR:new Float32Array(sampleRate*2),write:0}];
  this.seq=[{step:0,phase:0,note:-1},{step:0,phase:0,note:-1}];this.arp=[{phase:0,index:0,note:-1},{phase:0,index:0,note:-1}];this.clockPulse=0;this.port.onmessage=e=>this.message(e.data);
 }
 message(m){
  if(m.t==='patch'){this.global={...this.global,...m.patch};this.layers=[clone(LAYER_DEFAULT),clone(LAYER_DEFAULT)].map((d,i)=>({...d,...(m.patch.layers?.[i]||{})}));return;}
  if(m.t==='param'){if(m.layer===0||m.layer===1)this.layers[m.layer][m.key]=m.value;else this.global[m.key]=m.value;return;}
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
  else if(m.t==='transport'){const layer=m.layer??this.global.activeLayer;this.layers[layer].seqEnabled=!!m.play;this.seq[layer].step=0;this.seq[layer].phase=0;}
  else if(m.t==='waves'){const l=this.layers[m.layer??this.global.activeLayer];if(Array.isArray(m.waves))l.userWaves=m.waves.map(a=>Float32Array.from(a));}
  else if(m.t==='clock'){this.clockPulse++;if(this.clockPulse%24===0){this.seq.forEach(x=>x.phase=1);this.arp.forEach(x=>x.phase=1);}}
 }
 layerFor(note){if(this.global.mode==='split')return note>=this.global.splitPoint?1:0;return this.global.activeLayer|0;}
 layerRanges(layer){
  const binaural=!!this.global.binaural,mode=this.global.mode;
  if(mode==='single')return this.voices.slice(0,binaural?8:16);
  return this.voices.slice(layer*8,layer*8+8).slice(0,binaural?4:8);
 }
 noteOn(note,vel,channel,source='ui'){
  const mode=this.global.mode;let layers=mode==='dual'?(source==='midi'?[channel===2?1:0]:[0,1]):[this.layerFor(note)];
  if(mode==='single')layers=[this.global.activeLayer|0];
  if(source==='midi'&&mode==='dual'&&channel>2&&this.global.mpe)layers=[this.global.activeLayer|0];
  layers.forEach(layer=>{
   const p=this.layers[layer],held=this.held[layer];held.set(note,vel);
   if(p.arpEnabled)return;
   this.allocateNote(note,vel,layer,channel,source);
  });
 }
 allocateNote(note,vel,layer,channel=1,source='ui'){
  const p=this.layers[layer],bank=this.layerRanges(layer),mono=['solo','legato'].includes(p.voiceMode);
  if(mono){const v=bank.find(x=>x.active)||bank[0];const legato=p.voiceMode==='legato'&&v.gate;this.startVoice(v,note,vel,layer,legato,0,1,false,channel,source);return;}
  const unison=p.unison||'off';
  let size=1;
  if(unison==='half')size=Math.max(2,Math.floor(bank.length/2));
  else if(unison==='all')size=bank.length;
  else if(unison==='octave'||unison==='fifth')size=Math.min(3,bank.length);
  const chosen=bank.slice(0,size);
  chosen.forEach((v,i)=>this.startVoice(v,note+(unison==='octave'&&i>0?12*i:unison==='fifth'&&i>0?(i===1?7:12):0),vel,layer,false,i,size,false,channel,source));
 }
 startVoice(v,note,vel,layer,legato=false,index=0,size=1,sequence=false,channel=1,source='ui'){
  const p=this.layers[layer],last=v.pitch;v.layer=layer;v.note=note;v.inputNote=note;v.channel=channel;v.source=source;v.seqVoice=!!sequence;v.arpVoice=false;v.age=0;v.targetPitch=note+(p.transpose||0);v.pitch=legato?last:v.targetPitch;v.active=true;v.gate=true;v.order=++this.order;v.velocity=vel;v.aftertouch=0;
  if(!legato){v.e1Stage='attack';v.e2Stage='attack';v.e1Time=v.e2Time=0;v.env1=v.env2=0;if(p.lfo1Mode==='reset'){v.lfo1L=0;v.lfo1R=0;}}
  v.noise=Math.random()*999;v.pan=size>1?(index-(size-1)/2)/Math.max(1,size):v.pan;
  v.ph1L.fill(Math.random());v.ph1R.fill(Math.random());v.ph2L=Math.random();v.ph2R=Math.random();
 }
 noteOff(note,channel,source='ui'){
  const matches=this.voices.filter(v=>v.active&&v.inputNote===note&&!v.seqVoice&&!v.arpVoice&&(source==='midi'?v.channel===channel:true));
  matches.forEach(v=>{this.held[v.layer].delete(note);if(!this.sustain){v.gate=false;if(this.layers[v.layer].voiceMode==='poly2')v.e2Stage='release';}});
 }
 releaseUnheld(){this.voices.forEach(v=>{if(v.active&&!this.held[v.layer].has(v.inputNote))v.gate=false;});}
 envTick(v,p,dt){
  const tick=(which,stage,level,time,attack,attackHold,decayHold,decay,sustain,release)=>{
   if(!v.gate&&stage!=='idle'&&stage!=='release')stage='release';
   if(stage==='attack'){level+=(1-level)*(1-Math.exp(-dt/(.001+attack*attack*3)));if(level>.999){level=1;stage=attackHold>0?'attackHold':decayHold>0?'decayHold':'decay';time=0;}}
   else if(stage==='attackHold'){time+=dt;if(time>=attackHold*2){stage=decayHold>0?'decayHold':'decay';time=0;}}
   else if(stage==='decayHold'){time+=dt;if(time>=decayHold*2){stage='decay';time=0;}}
   else if(stage==='decay'){level+=(sustain-level)*(1-Math.exp(-dt/(.002+decay*decay*5)));if(Math.abs(level-sustain)<.001){level=sustain;stage='sustain';}}
   else if(stage==='sustain')level=sustain;
   else if(stage==='release'){level*=Math.exp(-dt/(.005+release*release*4));if(level<.0001){level=0;stage='idle';time=0;}}
   return {stage,level,time};
  };
  const a=tick(1,v.e1Stage,v.env1,v.e1Time,p.env1Attack,p.env1AttackHold,p.env1DecayHold,p.env1Decay,p.env1Sustain,p.env1Release);
  v.e1Stage=a.stage;v.env1=a.level;v.e1Time=a.time;
  const b=tick(2,v.e2Stage,v.env2,v.e2Time,p.env2Attack,0,p.env2DecayHold,p.env2Decay,p.env2Sustain,p.env2Release);
  v.e2Stage=b.stage;v.env2=b.level;v.e2Time=b.time;
  if(p.env1Loop&&v.gate&&v.e1Stage==='sustain'){v.e1Stage='attack';v.env1=0;v.e1Time=0;}
 }
 lfo(v,p,dt,which,side){
  const rate=which===1?(p.lfo1HighFreq?20+clamp(p.lfo1Rate)*9980:.03+clamp(p.lfo1Rate)*40):.05+clamp(p.lfo2Rate)*50;
  const phaseKey=which===1?(side==='L'?'lfo1L':'lfo1R'):'lfo2';
  v[phaseKey]=(v[phaseKey]+rate*dt)%(Math.PI*2);const phase=v[phaseKey]/(Math.PI*2),shape=which===1?p.lfo1Wave:p.lfo2Wave;
  if(shape==='square')return phase<.5?1:-1;if(shape==='saw')return 2*phase-1;if(shape==='reverseSaw')return 1-2*phase;if(shape==='triangle')return 1-4*Math.abs(phase-.5);
  const offset=side==='R'&&which===1?(p.lrPhase||0)*Math.PI*2:0;return Math.sin(v[phaseKey]+offset);
 }
 source(index,v,p,lf1,lf2){return [v.note/127*2-1,lf2,v.env1,v.velocity*2-1,v.aftertouch,this.expression,this.global.benderX,v.note/127*2-1][index]||0;}
 mod(p,v,lf1,lf2){
  let out={};const mat=p.modMatrix||[];
  for(let s=0;s<8;s++)for(let d=0;d<8;d++){const amt=Number(mat[s*8+d])||0;if(!amt)continue;const src=this.source(s,v,p,lf1,lf2);const key=['lfo1Rate','crossMod','waveMod','mix','hpf','resonance','env1Decay','delayTime'][d];out[key]=(out[key]||0)+src*amt;}
  return out;
 }
 osc1(p,v,phase,superIndex,tablePos,pw,lr,dt){
  const sampleAlt=index=>{const user=p.userWaves?.[index];if(user?.length){const pos=phase*user.length,i=pos|0,f=pos-i;return lerp(user[i%user.length],user[(i+1)%user.length],f);}return altWave(index,phase);};
  if(p.dds1Wave==='altA'||p.dds1Wave==='altB'){return lerp(sampleAlt(p.altA|0),sampleAlt(p.altB|0),clamp(tablePos));}
  const waveName=p.dds1Wave==='whiteNoise'?'noise':p.dds1Wave;
  if(waveName==='noise')return wav('noise',phase,pw,dt);
  let x=wav(waveName,phase,pw,dt);
  if(p.waveMod>0&&waveName!=='sine'){const alt=altWave(p.altA||0,phase);x=lerp(x,alt,clamp(tablePos));}
  return x;
 }
 filter(x,v,p,channel,cutoff,res,hpf=p.hpf){
  const sr=sampleRate,fc=30*Math.pow(2,clamp(cutoff)*9),g=1-Math.exp(-2*Math.PI*fc/sr);
  const hpfc=20*Math.pow(2,clamp(hpf)*9),hg=1-Math.exp(-2*Math.PI*hpfc/sr);
  const lp=channel==='L'?v.lpL:v.lpR;const lowIn=Math.tanh(x+lp[3]*res*3);
  let y=lowIn;for(let i=0;i<4;i++){lp[i]+=g*(y-lp[i]);y=lp[i];}
  const hstate=channel==='L'?'hpL':'hpR';v[hstate]+=hg*(y-v[hstate]);let out=y-v[hstate];
  const drive=p.drive==='2'?2.4:p.drive==='1'?1.35:1;return Math.tanh(out*drive);
 }
 effects(L,R,p,layer,dt){
  const c=this.chorus[layer],d=this.delay[layer],mode=p.chorus||'off';let wetL=L,wetR=R;
  if(mode!=='off'){
   const rate=mode==='both'?.32:mode==='II'?.24:.16;c.phase+=dt*rate*2*Math.PI;
   const depth=mode==='both'?.018:mode==='II'?.013:.008;
   const dl=Math.floor((.017+Math.sin(c.phase)*depth)*sampleRate),dr=Math.floor((.017+Math.sin(c.phase+Math.PI*(p.lrPhase||0))*depth)*sampleRate);
   const rl=(c.write-dl+c.bufL.length)%c.bufL.length,rr=(c.write-dr+c.bufR.length)%c.bufR.length;
   wetL=c.bufL[rl];wetR=c.bufR[rr];c.bufL[c.write]=L; c.bufR[c.write]=R;c.write=(c.write+1)%c.bufL.length;
   const mix=clamp(p.chorusMix);L=lerp(L,wetL,mix);R=lerp(R,wetR,mix);
  }
  const time=clamp(p.delayTime+(this.currentMods?.[layer]?.delayTime||0)*.1,.001,1),length=Math.max(1,Math.floor(time*sampleRate)),read=(d.write-length+d.bufL.length)%d.bufL.length;
  const dl=d.bufL[read],dr=d.bufR[read],fb=clamp(p.delayFeedback,0,.96);
  if(!p.delayFreeze){d.bufL[d.write]=L+dl*fb;d.bufR[d.write]=R+dr*fb;}else{d.bufL[d.write]=dl;d.bufR[d.write]=dr;}
  d.write=(d.write+1)%d.bufL.length;
  const mix=p.delayFreeze?1:.3;return [L*(1-mix)+dl*mix,R*(1-mix)+dr*mix];
 }
 tickSequencers(dt,layer){
  const p=this.layers[layer],s=this.seq[layer],a=this.arp[layer],held=[...this.held[layer].entries()].sort((x,y)=>x[0]-y[0]);
  if(p.seqEnabled){s.phase+=(p.seqBpm/60)*dt;if(s.phase>=1){s.phase-=1;const n=p.seqSteps[s.step%p.seqLength];if(s.note>=0){this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.seqVoice){v.gate=false;v.seqVoice=false;}});s.note=-1;}if(n!==null&&n!==undefined){s.note=n;this.allocateNote(n,.85,layer,1,'sequence');this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.inputNote===n&&v.order===this.order)v.seqVoice=true;});}s.step=(s.step+1)%clamp(p.seqLength,1,64);}}
  if(p.arpEnabled&&held.length){a.phase+=(p.seqBpm/60)*dt*(4/Math.max(1,p.arpDivision));if(a.phase>=1){a.phase-=1;let index=a.index++%held.length;if(p.arpMode==='down')index=held.length-1-index;else if(p.arpMode==='random')index=Math.floor(Math.random()*held.length);else if(p.arpMode==='upDown'){const span=Math.max(1,held.length*2-2),z=a.index%span;index=z<held.length?z:span-z;}const n=held[index][0];this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.arpVoice){v.gate=false;v.arpVoice=false;}});this.allocateNote(n,held[index][1],layer,1,'arp');this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.inputNote===n&&v.order===this.order)v.arpVoice=true;});}else if(p.arpEnabled&&!held.length){this.voices.forEach(v=>{if(v.active&&v.layer===layer&&v.arpVoice){v.gate=false;v.arpVoice=false;}});}}
 }
 process(_inputs,outputs){
  const out=outputs[0],L=out[0],R=out[1]||out[0],dt=1/sampleRate;
  for(let i=0;i<L.length;i++){
   let lMix=0,rMix=0;
   const layersToRender=this.global.mode==='single'?[this.global.activeLayer|0]:[0,1];
   for(const layer of layersToRender){
    const p=this.layers[layer];this.tickSequencers(dt,layer);
    let l=0,r=0;const bank=this.layerRanges(layer),cap=bank.length,voices=bank.filter(v=>v.active);
    for(const v of voices){
     const glide=clamp(p.portamento);v.pitch+=(v.targetPitch-v.pitch)*(glide>0?1-Math.exp(-dt/(.005+glide*2)):1);
     this.envTick(v,p,dt);v.age=(v.age||0)+dt;
     if(v.e2Stage==='idle'&&v.env2===0&&!v.gate){v.active=false;continue;}
     v.aftertouch=this.polyPressure.get(v.channel+':'+v.inputNote)??this.channelPressure.get(v.channel)??this.aftertouch[layer]??0;
     let lf1L=this.lfo(v,p,dt,1,'L'),lf1R=this.lfo(v,p,dt,1,'R'),lf2=this.lfo(v,p,dt,2,'L');
     if(v.age<(p.lfo1Delay||0)*3){lf1L=0;lf1R=0;}if(v.age<(p.lfo2Delay||0)*3)lf2=0;
     const mods=this.mod(p,v,lf1L,lf2);this.currentMods[layer]=mods;
     const channelBend=this.global.mpe&&v.channel>1?(this.mpeBend.get(v.channel)||0):(this.pitchBend[layer]||0);const pitchBend=channelBend*p.bendRange+this.global.benderX*3;
     const lfoPitch=(p.lfo2Amount||0)*lf2*7, dest=p.lfo2Destination||'filter';const pitch1=(dest==='DDS 1 pitch'||dest==='Both pitch')?lfoPitch:0;const pitch2=(dest==='DDS 2 pitch'||dest==='Both pitch')?lfoPitch:0;const base=midiHz(v.pitch+pitchBend+(this.global.masterTune||0)+(p.transpose||0)+pitch1),pw=.5+.42*Math.sin(v.noise+i*.0002*p.pwDrift*300);
     const waveSource=p.waveModSource==='LFO 1'?(lf1L+1)*.5:p.waveModSource==='ENV 1'?v.env1:p.waveMod;const waveDepth=clamp(waveSource+this.modWheel*.12+(mods.waveMod||0)+(p.lfo2Amount||0)*lf2);
     const superMode=p.superMode==='on'?1:p.superMode==='half'?.5:0;
     const dds1=(side)=>{
      const lr=side==='L'?-1:1,phase=side==='L'?v.ph1L:v.ph1R;let signal=0,masterWrap=false;
      const n=superMode?7:1;
      for(let k=0;k<n;k++){
       const offset=k===0?0:(k-3)*clamp(p.detune)*.004*superMode;
       const freq=base*(1+offset),phaseShift=side==='R'?((p.lrPhase||0)*.5):0;
       const next=phase[k]+freq/sampleRate*(1+(side==='L'?lf1L:lf1R)*.0002*lr);
       if(k===0&&next>=1)masterWrap=true;
       phase[k]=next%1;
       const stereoPhase=(phase[k]+phaseShift)%1;
       signal+=this.osc1(p,v,stereoPhase,k,waveDepth,pw,lr,freq/sampleRate);
      }
      if(side==='L')v.syncResetL=masterWrap;else v.syncResetR=masterWrap;
      return signal/n;
     };
     const o1L=dds1('L'),o1R=this.global.binaural?dds1('R'):o1L;
     const f2=base*Math.pow(2,((p.dds2Octave||0)*12+(p.dds2Tune||0)+pitch2)/12);
     if(p.dds2Mode==='sync'&&v.syncResetL)v.ph2L=0;
     if(p.dds2Mode==='sync'&&v.syncResetR)v.ph2R=0;
     v.ph2L=(v.ph2L+f2/sampleRate)%1;v.ph2R=(v.ph2R+f2/sampleRate)%1;
     let o2L=wav(p.dds2Wave,v.ph2L,pw,f2/sampleRate),o2R=this.global.binaural?wav(p.dds2Wave,v.ph2R,pw,f2/sampleRate):o2L;
     if(p.dds2Mode==='sync'){o2L=wav(p.dds2Wave,v.ph2L,pw,f2/sampleRate);o2R=wav(p.dds2Wave,v.ph2R,pw,f2/sampleRate);}
     else if(p.dds2Mode==='ring'){o2L*=o1L;o2R*=o1R;}
     if(p.dds2Mode==='sync'){o2L*=1+clamp(p.crossMod)*o1L*2;o2R*=1+clamp(p.crossMod)*o1R*2;}
     const sub=p.subMode==='sine'?Math.sin(v.ph2L*Math.PI*2):p.subMode==='square'?wav('square',v.ph2L,.5):0;
     let sampleL=lerp(o1L+sub*clamp(p.subLevel),o2L,clamp(p.mix)),sampleR=lerp(o1R+sub*clamp(p.subLevel),o2R,clamp(p.mix));
     const envMod=p.filterMod==='env2'?v.env2:p.filterMod==='both'?Math.max(v.env1,v.env2):v.env1;
     const track=p.keyTrack==='on'?((v.note-60)/48)*.2:p.keyTrack==='half'?((v.note-60)/48)*.1:0;
     const channelSlide=this.global.mpe&&v.channel>1?(this.mpeSlide.get(v.channel)||0):0;const cutoff=clamp(p.cutoff+(lf1L*p.lfo1Rate*.05)+(dest==='Filter'?lf2*(p.lfo2Amount||0)*.18:0)+envMod*.35+track+channelSlide*.22),hpf=clamp(p.hpf+(mods.hpf||0)*.5),res=clamp(p.resonance+(mods.resonance||0)*.5);
     sampleL=this.filter(sampleL,v,p,'L',cutoff,res,hpf);sampleR=this.global.binaural?this.filter(sampleR,v,p,'R',cutoff,res,hpf):sampleL;
     const vel=clamp(v.velocity*p.velocity,0,1.5),channelExpression=this.global.mpe&&v.channel>1?(this.channelExpression.get(v.channel)??this.expression):this.expression,amp=v.env2*vel*(.35+channelExpression*.65)*(dest==='Amp'?1+lf2*(p.lfo2Amount||0):1)*(1+(this.global.benderY||0)*.1);
     sampleL=Math.tanh(sampleL*amp*.25);sampleR=Math.tanh(sampleR*amp*.25);
     const pan=clamp(.5+v.pan*.35+(p.pan-.5)*.8,0,1);l+=sampleL*Math.cos(pan*Math.PI*.5);r+=sampleR*Math.sin(pan*Math.PI*.5);
    }
    [l,r]=this.effects(l,r,p,layer,dt);
    lMix+=l;rMix+=r;
   }
   L[i]=Math.tanh(lMix)*this.global.volume;R[i]=Math.tanh(rMix)*this.global.volume;
  }
  return true;
 }
}
registerProcessor('super8-processor',Super8Processor);