import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el, section, knob, select, toggle, button, display, performance, power, presetBar, footer } from './shared/panel.js';
import { registerMidiTarget } from './shared/midiMap.js';

const NOTES=Array.from({length:37},(_,i)=>{const n=36+i;return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][n%12]+(Math.floor(n/12)-1);});
const clone=v=>JSON.parse(JSON.stringify(v));
const BASE={
 mode:'mono',osc1Wave:'saw',osc1Octave:0,osc1Tune:0,osc1Shape:.5,osc1Level:.78,osc1Glide:.04,osc1Slop:.08,osc1Sync:false,
 osc2Wave:'pulse',osc2Octave:0,osc2Tune:0,osc2Shape:.5,osc2Level:.55,osc2Glide:.04,osc2Slop:.08,osc2Sync:false,
 osc3Wave:'wavetable',osc3Octave:0,osc3Tune:0,osc3Shape:.35,osc3ShapeMod:.25,osc3Level:.45,osc3Glide:.02,osc3Slop:.02,
 noiseLevel:0,externalLevel:0,filterType:'prophet6',filterCutoff:.68,resonance:.16,filterState:0,filterKeyTrack:.35,filterEnvAmount:.38,filterDrive:.08,distortion:.08,
 filterDelay:0,filterAttack:.03,filterDecay:.28,filterSustain:.45,filterRelease:.25,filterLoop:false,
 ampDelay:0,ampAttack:.015,ampDecay:.24,ampSustain:.8,ampRelease:.22,ampLoop:false,
 aux1Delay:0,aux1Attack:.02,aux1Decay:.28,aux1Sustain:0,aux1Release:.2,aux1Loop:false,
 aux2Delay:0,aux2Attack:.02,aux2Decay:.28,aux2Sustain:0,aux2Release:.2,aux2Loop:false,
 lfo1Rate:.18,lfo1Amount:.35,lfo1Wave:'triangle',lfo1Phase:0,lfo1Slew:0,lfo1Sync:false,
 lfo2Rate:.08,lfo2Amount:0,lfo2Wave:'saw',lfo2Phase:0,lfo2Slew:0,lfo2Sync:false,
 lfo3Rate:.12,lfo3Amount:0,lfo3Wave:'sampleHold',lfo3Phase:0,lfo3Slew:0,lfo3Sync:false,
 bpm:120,glide:0,hold:false,mod:0,bend:0,aftertouch:0,touch:0,volume:.72,
 fx1Type:'stereoDelay',fx1Mix:.18,fx1Time:.28,fx1Feedback:.28,fx1Tone:.55,
 fx2Type:'superPlate',fx2Mix:.16,fx2Time:.42,fx2Feedback:.25,fx2Tone:.6,
 feedbackAmount:0,feedbackTune:.5,feedbackGrunge:false,
 arpEnabled:false,arpMode:'up',arpDivision:4,arpSwing:0,arpLatch:false,
 seqEnabled:false,seqMode:'forward',seqLength:16,seqSwing:0,seqGate:.72,
 seqTracks:Array.from({length:16},()=>Array(64).fill(null)),
 seqDestinations:Array.from({length:16},(_,i)=>i===0?'note':i===1?'osc1Shape':i===2?'filterCutoff':'none'),
 seqPhrase:'A',seqLinked:false,seqTrack:0,seqRecord:false,
 modRoutes:Array.from({length:32},()=>({source:'LFO 1',destination:'filterCutoff',amount:0})),morph:0
};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,Number(v)||0));
function clean(data){
 const p={...BASE,...data};
 p.seqTracks=Array.from({length:16},(_,i)=>Array.from({length:64},(_,j)=>data.seqTracks?.[i]?.[j]??null));
 p.seqDestinations=Array.from({length:16},(_,i)=>data.seqDestinations?.[i]||BASE.seqDestinations[i]);
 p.modRoutes=Array.from({length:32},(_,i)=>{const r=data.modRoutes?.[i]||BASE.modRoutes[i];return {source:r.source||'LFO 1',destination:r.destination||'filterCutoff',amount:clamp(r.amount,-1,1)};});
 return p;
}
const FACTORY=[
 {name:'Prologue Bass',data:{osc1Wave:'saw',osc1Level:.8,osc2Wave:'pulse',osc2Tune:.04,osc2Level:.42,filterType:'ladder',filterCutoff:.36,resonance:.22,filterEnvAmount:.62,filterAttack:.01,filterDecay:.2,filterSustain:.08,ampAttack:.01,ampDecay:.22,ampSustain:.8,distortion:.1}},
 {name:'Sync Engine',data:{osc1Wave:'saw',osc2Wave:'saw',osc2Tune:7,osc1Sync:true,osc1Level:.72,osc2Level:.65,filterCutoff:.65,filterEnvAmount:.42,filterType:'prophet6',filterAttack:.005,filterDecay:.25,filterSustain:.14,ampAttack:.005}},
 {name:'Glass Table',data:{osc3Wave:'wavetable',osc3Shape:.75,osc3ShapeMod:.56,osc3Level:.72,osc1Level:.16,filterCutoff:.8,filterType:'stateVariable',lfo3Amount:.14,lfo3Rate:.18,fx1Type:'chorus',fx1Mix:.26,fx2Type:'superPlate',fx2Mix:.3}},
 {name:'Feedback String',data:{noiseLevel:.18,osc1Level:.08,osc2Level:0,osc3Level:0,feedbackAmount:.83,feedbackTune:.24,feedbackGrunge:false,filterCutoff:.82,filterType:'ladder',ampAttack:.001,ampSustain:.8}},
 {name:'Paraphonic Brass',data:{mode:'paraphonic',osc1Wave:'saw',osc2Wave:'saw',osc3Wave:'saw',osc1Level:.62,osc2Level:.55,osc3Level:.4,filterCutoff:.42,filterEnvAmount:.55,filterAttack:.03,filterDecay:.28,filterSustain:.4,ampAttack:.06,ampSustain:.84,fx1Type:'chorus',fx1Mix:.19}},
 {name:'Acid Sequence',data:{osc1Wave:'saw',osc2Wave:'pulse',osc2Tune:.08,osc1Level:.75,osc2Level:.3,filterType:'ladder',filterCutoff:.24,resonance:.82,filterEnvAmount:.82,filterDecay:.19,filterSustain:.04,distortion:.35}},
 {name:'Deep Sub',data:{osc1Wave:'triangle',osc1Octave:-1,osc1Level:.8,osc2Wave:'sine',osc2Octave:-1,osc2Level:.3,filterCutoff:.42,filterType:'ladder',ampAttack:.015,ampSustain:.9}},
 {name:'Moving Machine',data:{osc3Wave:'wavetable',osc3Shape:.24,osc3ShapeMod:.6,osc3Level:.54,lfo3Wave:'triangle',lfo3Amount:.7,lfo3Rate:.3,filterCutoff:.56,fx1Type:'flanger',fx1Mix:.28,fx2Type:'stereoDelay',fx2Mix:.2}},
 {name:'Noise Percussion',data:{noiseLevel:.72,osc1Level:.08,osc2Level:.06,osc3Level:0,filterCutoff:.68,filterType:'stateVariable',filterState:.7,filterAttack:.001,filterDecay:.08,filterSustain:0,ampAttack:.001,ampDecay:.1,ampSustain:0}},
 {name:'Rotating Space',data:{osc1Wave:'triangle',osc2Wave:'saw',osc2Tune:.02,osc1Level:.34,osc2Level:.32,filterCutoff:.72,fx1Type:'rotary',fx1Mix:.42,fx1Time:.42,fx2Type:'superPlate',fx2Mix:.3}}
].map(x=>({name:x.name,data:clean(x.data)}));
const SOURCES=['LFO 1','LFO 2','LFO 3','Filter Env','Amp Env','Aux Env 1','Aux Env 2','Mod Wheel','Aftertouch','Touch Slider','Velocity','Key Number','Sequencer'];
const DESTS=['osc1Pitch','osc2Pitch','osc3Pitch','osc1Shape','osc2Shape','osc3Shape','osc3ShapeMod','filterCutoff','resonance','filterState','ampLevel','fx1Mix','fx2Mix','feedbackAmount','lfo1Rate','lfo2Rate','lfo3Rate','none'];
const KNOBS={
 osc1:[['osc1Level','LEVEL'],['osc1Tune','FINE',-7,7],['osc1Shape','SHAPE'],['osc1Glide','GLIDE'],['osc1Slop','SLOP']],
 osc2:[['osc2Level','LEVEL'],['osc2Tune','FINE',-7,7],['osc2Shape','SHAPE'],['osc2Glide','GLIDE'],['osc2Slop','SLOP']],
 osc3:[['osc3Level','LEVEL'],['osc3Shape','TABLE',0,31],['osc3ShapeMod','SHAPE MOD'],['osc3Tune','FINE',-7,7],['osc3Glide','GLIDE']],
 mixer:[['noiseLevel','NOISE'],['externalLevel','EXT INPUT'],['volume','MASTER']],
 filter:[['filterCutoff','CUTOFF'],['resonance','RESONANCE'],['filterState','STATE'],['filterKeyTrack','KEY TRACK'],['filterEnvAmount','ENV AMT'],['filterDrive','DRIVE'],['distortion','DISTORTION']],
};
class Pro3App{
 constructor(){
  this.engine=new WorkletEngine(new URL('./engine/Pro3Processor.js',import.meta.url).href,'pro3-processor');
  this.patch=clean(BASE);this.store=new PresetStore({key:'overture.sequential-pro-3.programs',version:1,validate:clean});
  this.ui={};this.build();this.buildPerformance();this.presets.load('f:0');
  power('pro3-power',()=>this.engine.start(),()=>{this.perf.flushPending();this.display.set('PRO 3 READY','OVERTURE PROGRAM · AUDIO ACTIVE');});
  this.engine.post({t:'patch',patch:this.patch});
 }
 set(k,v){this.patch[k]=v;this.engine.post({t:'param',key:k,value:v});if(k==='seqTrack')this.updateSequence();}
 postPatch(){this.engine.post({t:'patch',patch:this.patch});}
 makeKnobs(parent,defs){
  const row=el('div','pn-knobs',parent);
  defs.forEach(([key,label,min=0,max=1])=>{
   const item=knob(row,{label,min,max,value:this.patch[key],size:45,formatValue:v=>Number(v).toFixed(max>5?1:2),onChange:v=>this.set(key,v)});
   this.ui[key]=item;
  });
 }
 makeSelect(parent,key,label,options){
  const item=select(parent,label,options,this.patch[key],v=>this.set(key,typeof this.patch[key]==='number'?Number(v):v));
  this.ui[key]=item;return item;
 }
 makeToggle(parent,key,label){
  const item=toggle(parent,label,this.patch[key],v=>this.set(key,v));this.ui[key]=item;return item;
 }
 build(){
  this.page=el('div','pn-page pro3-page',document.getElementById('pro3-root'));
  this.shell=el('main','pn-shell pro3-shell',this.page);
  const head=el('header','pro3-header',this.shell);
  const brand=el('div','pro3-brand',head);el('div','pro3-wordmark',brand,'SEQUENTIAL');const model=el('div','pro3-model',brand);el('strong','',model,'PRO 3');el('span','',model,'HYBRID MULTI-FILTER MONOSYNTH');
  const right=el('div','pro3-header-right',head);this.display=display(right);this.midi=el('div','pn-midi',right,'MIDI: searching…');
  const rows=el('div','pn-rows',this.shell);
  const top=el('div','pn-row pro3-top',rows);
  const perf=section(top,'PERFORMANCE','37-KEY · MONO / 3-VOICE PARAPHONIC');
  this.makeSelect(perf.body,'mode','VOICE',['mono','paraphonic']);
  this.makeToggle(perf.body,'hold','HOLD');
  this.makeToggle(perf.body,'arpEnabled','ARPEGGIATOR');
  const touch=el('label','pro3-touch',perf.body);el('span','',touch,'TOUCH SLIDER');
  const range=el('input','',touch);range.type='range';range.min='0';range.max='1';range.step='.001';range.value='0';
  range.addEventListener('input',()=>{this.patch.touch=Number(range.value);this.engine.post({t:'touch',value:this.patch.touch});});
  registerMidiTarget(range,{id:'pro3:touch',label:'Touch Slider',group:'PERFORMANCE',get:()=>this.patch.touch,set:v=>{range.value=String(v);this.patch.touch=v;this.engine.post({t:'touch',value:v});}});
  const o1=section(top,'OSCILLATOR 1','ANALOG VCO');this.makeSelect(o1.body,'osc1Wave','WAVE',['triangle','saw','pulse']);this.makeSelect(o1.body,'osc1Octave','OCTAVE',[-2,-1,0,1,2].map(String));this.makeToggle(o1.body,'osc1Sync','HARD SYNC');this.makeKnobs(o1.body,KNOBS.osc1);
  const o2=section(top,'OSCILLATOR 2','ANALOG VCO');this.makeSelect(o2.body,'osc2Wave','WAVE',['triangle','saw','pulse']);this.makeSelect(o2.body,'osc2Octave','OCTAVE',[-2,-1,0,1,2].map(String));this.makeToggle(o2.body,'osc2Sync','SYNC');this.makeKnobs(o2.body,KNOBS.osc2);
  const o3=section(top,'OSCILLATOR 3','DIGITAL WAVETABLE / SUPERSAW');this.makeSelect(o3.body,'osc3Wave','WAVE',['sine','triangle','saw','pulse','superSaw','wavetable']);this.makeSelect(o3.body,'osc3Octave','OCTAVE',[-2,-1,0,1,2].map(String));this.makeKnobs(o3.body,KNOBS.osc3);
  const mid=el('div','pn-row pro3-middle',rows);
  const mx=section(mid,'MIXER','OSCILLATORS / NOISE / EXTERNAL');this.makeKnobs(mx.body,KNOBS.mixer);
  el('p','pro3-mini-label',mx.body,'EXTERNAL AUDIO INPUT IS NOT CONNECTED IN THIS BROWSER BUILD.');
  const fl=section(mid,'ANALOG FILTER','THREE SELECTABLE DESIGNS');
  this.makeSelect(fl.body,'filterType','FILTER',['prophet6','ladder','stateVariable']);
  this.makeKnobs(fl.body,KNOBS.filter);
  const env=section(mid,'AMPLIFIER / GLIDE','AMPLITUDE AND PERFORMANCE');this.makeKnobs(env.body,[['ampAttack','ATTACK'],['ampDecay','DECAY'],['ampSustain','SUSTAIN'],['ampRelease','RELEASE'],['glide','MASTER GLIDE']]);
  const lower=el('div','pn-row pro3-lower',rows);
  const lfo=section(lower,'LFO 1–3','INDEPENDENT MODULATORS');
  for(let i=1;i<=3;i++){const sub=el('div','pro3-lfo',lfo.body);el('h3','pro3-lfo__title',sub,'LFO '+i);this.makeSelect(sub,'lfo'+i+'Wave','SHAPE',['triangle','saw','reverseSaw','square','sampleHold']);this.makeKnobs(sub,[['lfo'+i+'Rate','RATE'],['lfo'+i+'Amount','AMOUNT'],['lfo'+i+'Phase','PHASE'],['lfo'+i+'Slew','SLEW']]);this.makeToggle(sub,'lfo'+i+'Sync','SYNC');}
  const fx=section(lower,'DUAL EFFECTS','TWO DIGITAL PROCESSORS');this.makeSelect(fx.body,'fx1Type','EFFECT 1',['off','stereoDelay','bbdDelay','chorus','flanger','phaser','ringMod','rotary','digitalDistortion','highPass','superPlate']);this.makeKnobs(fx.body,[['fx1Mix','MIX'],['fx1Time','TIME'],['fx1Feedback','FEEDBACK'],['fx1Tone','TONE']]);this.makeSelect(fx.body,'fx2Type','EFFECT 2',['off','stereoDelay','bbdDelay','chorus','flanger','phaser','ringMod','rotary','digitalDistortion','highPass','superPlate']);this.makeKnobs(fx.body,[['fx2Mix','MIX'],['fx2Time','TIME'],['fx2Feedback','FEEDBACK'],['fx2Tone','TONE']]);
  const fb=section(lower,'TUNED FEEDBACK','RESONANT DELAY PATH');this.makeKnobs(fb.body,[['feedbackAmount','AMOUNT'],['feedbackTune','TUNING']]);this.makeToggle(fb.body,'feedbackGrunge','GRUNGE');
  this.buildAdvanced(rows);
  const memory=section(rows,'PROGRAM MEMORY','ORIGINAL OVERTURE PROGRAMS · USER PRESETS');
  this.presets=presetBar(memory.body,{factory:FACTORY,store:this.store,display:this.display,filename:'sequential-pro-3-program',panic:()=>this.perf?.allOff(),apply:(data,name)=>{this.patch=clean(data);this.refresh();this.display.set(name.toUpperCase(),'OVERTURE PRO 3 PROGRAM');},capture:()=>clone(this.patch)});
  footer(this.page,'SEQUENTIAL PRO 3 · TWO ANALOG VCOs · DIGITAL WAVETABLE · THREE FILTERS · PARAPHONIC · OVERTURE SOFTWARE MODEL');
 }
 buildAdvanced(rows){
  const adv=el('div','pro3-advanced',rows);
  const envs=section(adv,'ENVELOPES','FOUR DELAY / ADSR GENERATORS · LOOPABLE');
  const grid=el('div','pn-envelope-grid',envs.body);
  [['FILTER','filter'],['AMPLIFIER','amp'],['AUXILIARY 1','aux1'],['AUXILIARY 2','aux2']].forEach(([label,prefix])=>{
   const box=el('div','pn-envelope',grid);el('h3','',box,label);
   this.makeKnobs(box,[[prefix+'Delay','DELAY'],[prefix+'Attack','ATTACK'],[prefix+'Decay','DECAY'],[prefix+'Sustain','SUSTAIN'],[prefix+'Release','RELEASE']]);
   this.makeToggle(box,prefix+'Loop','LOOP');
  });
  const mod=section(adv,'MODULATION MATRIX','32 ROUTES · POSITIVE OR NEGATIVE DEPTH');
  const matrix=el('div','pro3-matrix',mod.body);this.modRows=[];
  for(let i=0;i<32;i++){
   const r=el('div','pro3-route',matrix);el('span','pro3-route__index',r,String(i+1).padStart(2,'0'));
   const src=el('select','',r);SOURCES.forEach(x=>{const o=el('option','',src,x);o.value=x;});src.value=this.patch.modRoutes[i].source;
   const dst=el('select','',r);DESTS.forEach(x=>{const o=el('option','',dst,x);o.value=x;});dst.value=this.patch.modRoutes[i].destination;
   const amount=el('input','',r);amount.type='range';amount.min='-1';amount.max='1';amount.step='.01';amount.value=String(this.patch.modRoutes[i].amount);
   const update=()=>{this.patch.modRoutes[i]={source:src.value,destination:dst.value,amount:Number(amount.value)};this.postPatch();};
   src.addEventListener('change',update);dst.addEventListener('change',update);amount.addEventListener('input',update);
   this.modRows.push({src,dst,amount});
  }
  const seq=section(adv,'16-TRACK / 64-STEP SEQUENCER','FOUR LINKABLE 16-STEP PHRASES · NOTE AND PARAMETER TRACKS');
  const controls=el('div','pro3-sequencer__head',seq.body);
  const phrase=el('div','pn-buttons',controls);
  this.phraseButtons=[];
  ['A','B','C','D'].forEach((p,i)=>{const b=button(phrase,p,()=>{this.seqPage=i;this.updateSequence();this.phraseButtons.forEach((x,j)=>x.classList.toggle('lit',j===i));},i===0);this.phraseButtons.push(b);});
  this.makeSelect(controls,'seqMode','PLAY MODE',['forward','reverse','forwardReverse','random']);
  this.makeSelect(controls,'seqLength','LENGTH',Array.from({length:64},(_,i)=>String(i+1)));
  this.makeSelect(controls,'seqTrack','TRACK',Array.from({length:16},(_,i)=>String(i+1)));
  this.seqDestSelect=select(controls,'TRACK DESTINATION',['note','none','osc1Pitch','osc2Pitch','osc3Pitch','osc1Shape','osc2Shape','osc3ShapeMod','filterCutoff','resonance','fx1Mix','fx2Mix','feedbackAmount'],this.patch.seqDestinations[0],v=>{
   const track=Number(this.patch.seqTrack)||0;this.patch.seqDestinations[track]=v;
   this.engine.post({t:'sequence',tracks:this.patch.seqTracks,destinations:this.patch.seqDestinations,length:Number(this.patch.seqLength)||16});
  });
  const buttons=el('div','pn-buttons',seq.body);button(buttons,'PLAY',()=>{this.patch.seqEnabled=true;this.engine.post({t:'transport',play:true});});button(buttons,'STOP',()=>{this.patch.seqEnabled=false;this.engine.post({t:'transport',play:false});});
  this.makeKnobs(seq.body,[['bpm','TEMPO',30,260],['seqSwing','SWING'],['seqGate','GATE']]);
  const steps=el('div','pro3-steps',seq.body);this.stepButtons=[];
  for(let i=0;i<16;i++){const b=el('button','pro3-step',steps,String(i+1));b.type='button';b.addEventListener('click',()=>this.toggleStep(i));this.stepButtons.push(b);}
  this.seqPage=0;this.updateSequence();
  const arp=section(adv,'ARPEGGIATOR','CAN RUN WITH SEQUENCER AUTOMATION');
  this.makeSelect(arp.body,'arpMode','MODE',['up','down','upDown','random','assign']);this.makeSelect(arp.body,'arpDivision','CLOCK',['1','2','4','8','16']);this.makeKnobs(arp.body,[['arpSwing','SWING']]);this.makeToggle(arp.body,'arpLatch','RELATCH');
  const morph=section(adv,'PATCH MORPH','INTERPOLATE TWO PROGRAM STATES');
  const mb=el('div','pn-buttons',morph.body);button(mb,'SET A',()=>{this.morphA=clone(this.patch);this.display.flash('MORPH A STORED');});button(mb,'SET B',()=>{this.morphB=clone(this.patch);this.display.flash('MORPH B STORED');});
  const mrow=el('label','pro3-touch',morph.body);el('span','',mrow,'MORPH');const slider=el('input','',mrow);slider.type='range';slider.min='0';slider.max='1';slider.step='.001';slider.value='0';
  slider.addEventListener('input',()=>this.applyMorph(Number(slider.value)));
  registerMidiTarget(slider,{id:'pro3:morph',label:'Patch Morph',group:'PERFORMANCE',get:()=>this.patch.morph,set:v=>{slider.value=String(v);this.applyMorph(v);}});
  const wave=section(adv,'CUSTOM WAVETABLE','LOAD A SINGLE-CYCLE WAV AUDIO FILE');
  const file=el('input','',wave.body);file.type='file';file.accept='.wav,audio/wav';
  file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{if(!this.engine.ctx)throw new Error('Power on audio first.');const decoded=await this.engine.ctx.decodeAudioData(await f.arrayBuffer());const data=decoded.getChannelData(0);if(data.length<64||data.length>65536)throw new Error('Use a single-cycle WAV between 64 and 65,536 samples.');this.engine.post({t:'wavetable',data:Array.from(data)});this.display.flash('CUSTOM WAVETABLE LOADED');}catch(e){this.display.flash('WAVETABLE LOAD FAILED');alert(e.message);}});
 }
 toggleStep(i){
  const track=Number(this.patch.seqTrack)||0,step=this.seqPage*16+i,arr=this.patch.seqTracks[track];
  if(track===0)arr[step]=arr[step]===null?48+((i%8)*2):null;
  else arr[step]=arr[step]===null?.7:null;
  this.engine.post({t:'sequence',tracks:this.patch.seqTracks,destinations:this.patch.seqDestinations,length:Number(this.patch.seqLength)||16});
  this.updateSequence();
 }
 updateSequence(){
  const track=Number(this.patch.seqTrack)||0;
  if(this.seqDestSelect){this.seqDestSelect.setValue(this.patch.seqDestinations[track]||'none',true);this.seqDestSelect.select.disabled=track<3;this.seqDestSelect.select.title=track<3?'Tracks 1–3 are note tracks':'Choose the parameter this track automates';}
  this.stepButtons.forEach((b,i)=>{const v=this.patch.seqTracks[track]?.[this.seqPage*16+i];b.classList.toggle('is-on',v!==null&&v!==undefined);b.textContent=String(i+1);});
 }
 applyMorph(t){
  if(!this.morphA||!this.morphB)return;
  const out=clone(this.morphA);
  Object.keys(out).forEach(k=>{const a=this.morphA[k],b=this.morphB[k];if(typeof a==='number'&&typeof b==='number')out[k]=a+(b-a)*t;else if(t>=.5)out[k]=b;});
  out.seqTracks=this.morphA.seqTracks;out.modRoutes=this.morphA.modRoutes;out.morph=t;
  this.patch=clean(out);this.postPatch();
 }
 buildPerformance(){
  this.perf=performance(this.shell,{notes:NOTES,octaves:3,startOctave:2,wheels:true,started:()=>this.engine.started,midiStatusEl:this.midi,handlers:{
   noteOn:(n,v)=>this.engine.noteOn(n,v),noteOff:n=>this.engine.noteOff(n),bend:v=>this.engine.setPitchBend(v),mod:v=>this.engine.setModWheel(v),
   aftertouch:v=>this.engine.setAftertouch(v),sustain:d=>this.engine.setSustain(d),allOff:()=>this.engine.allNotesOff(),
   program:p=>this.presets.load('f:'+ (p%FACTORY.length)),clock:()=>this.engine.post({t:'clock'}),start:()=>this.engine.post({t:'transport',play:true}),continue:()=>this.engine.post({t:'transport',play:true}),stop:()=>this.engine.post({t:'transport',play:false}),cc:(cc,v)=>{if(cc===7)this.set('volume',v/127);if(cc===74)this.set('filterCutoff',v/127);}
  }});
 }
 refresh(){
  Object.entries(this.patch).forEach(([k,v])=>{const c=this.ui[k];if(c?.setValue)c.setValue(v,true);});
  this.modRows?.forEach((r,i)=>{r.src.value=this.patch.modRoutes[i].source;r.dst.value=this.patch.modRoutes[i].destination;r.amount.value=String(this.patch.modRoutes[i].amount);});
  this.updateSequence();this.postPatch();
 }
}
new Pro3App();