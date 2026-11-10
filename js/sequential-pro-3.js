import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el, section, knob, select, toggle, button, display, performance, power, presetBar, footer } from './shared/panel.js';
import { registerMidiTarget, registerMidiTargetProvider } from './shared/midiMap.js';
import { createHardwareSurface,addSection,addLabel,addRule,addLED,addKnob,addFader,addButton,addDisplay,addKeyboard,addWheel,addTouchStrip } from './shared/hardwarePanel.js';

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
 arpEnabled:false,arpMode:'up',arpDivision:4,arpRange:1,arpSwing:0,arpLatch:false,
 seqEnabled:false,seqMode:'forward',seqLength:16,seqSwing:0,seqGate:.72,
 seqTracks:Array.from({length:16},()=>Array(64).fill(null)),
 seqDestinations:Array.from({length:16},(_,i)=>i===0?'note':i===1?'osc1Shape':i===2?'filterCutoff':'none'),
 seqPhrase:'A',seqLinked:false,seqTrack:0,seqDestination:'note',seqRecord:false,
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
  this.ui={};this.build();this.buildHardwarePanel();this.buildPerformance();this.presets.load('f:0');
  power('pro3-power',()=>this.engine.start(),()=>{this.perf.flushPending();this.display.set('PRO 3 READY','OVERTURE PROGRAM · AUDIO ACTIVE');});
  this.engine.post({t:'patch',patch:this.patch});
 }
 set(k,v){this.patch[k]=v;this.engine.post({t:'param',key:k,value:v});if(k==='seqTrack')this.updateSequence();this.syncHardware?.();}
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
  this.presets=presetBar(memory.body,{factory:FACTORY,store:this.store,display:this.display,filename:'sequential-pro-3-program',panic:()=>this.perf?.allOff(),apply:(data,name)=>{this.patch=clean(data);this.refresh();this.display.set(name.toUpperCase(),'OVERTURE PRO 3 PROGRAM');this.displayHardwarePreset?.(name);this.renderHardwareSteps?.();},capture:()=>clone(this.patch)});
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
  if(track<3)arr[step]=arr[step]===null?48+((i%8)*2)+track*7:null;
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
  this.updateSequence();this.postPatch();this.syncHardware?.();
 }

 buildHardwarePanel(){
  this.page.classList.add('hp-legacy-hidden');
  const root=document.getElementById('pro3-root');
  const hw=createHardwareSurface(root,{id:'sequential-pro-3',width:1680,height:850,skin:'pro3',programLabel:'PRO 3 · INITIAL PROGRAM'});
  this.hw=hw;const p=hw.instrument;
  this.hwControls={knobs:[],faders:[],buttons:[],selects:[],all:[]};
  const group=(x,y,w,h,title,sub='')=>addSection(p,{x,y,w,h,title,sub});
  const remember=(type,key,control)=>{this.hwControls[type].push({key,control});this.hwControls.all.push(control);return control;};
  const k=(key,label,x,y,min=0,max=1,step,opts={})=>{
   const control=addKnob(p,{x,y,label,min,max,value:this.patch[key],step,size:opts.size||62,small:!!opts.small,accent:!!opts.accent,midiId:'PRO3:'+key,group:opts.group||'SYNTHESIS',formatValue:v=>max>10?String(Number(v).toFixed(1)):max>5?String(Math.round(v)):Number(v).toFixed(2),onChange:v=>this.set(key,v)});
   return remember('knobs',key,control);
  };
  const fader=(key,label,x,y,min=0,max=1,opts={})=>{
   const control=addFader(p,{x,y,label,min,max,value:this.patch[key],height:opts.height||72,width:opts.width||22,small:!!opts.small,midiId:'PRO3:'+key,formatValue:v=>max>10?String(Number(v).toFixed(1)):Number(v).toFixed(2),onChange:v=>this.set(key,v)});
   return remember('faders',key,control);
  };
  const btn=(key,label,x,y,opts={})=>{
   const control=addButton(p,{x,y,label,value:!!this.patch[key],size:opts.size||25,led:opts.led||'red',group:opts.group||'SYNTHESIS',midiId:'PRO3:'+key,onChange:v=>this.set(key,v)});
   return remember('buttons',key,control);
  };
  const sel=(key,label,x,y,options,opts={})=>{
   const wrap=document.createElement('label');wrap.className='hp-native-select hp-pro3-select';
   wrap.style.cssText='position:absolute;left:'+(x-(opts.width||100)/2)+'px;top:'+y+'px;width:'+(opts.width||100)+'px;display:grid;gap:3px;text-align:center;color:var(--hp-ink);font:700 8px Saira,sans-serif;letter-spacing:.07em;z-index:5';
   const title=document.createElement('span');title.textContent=label;
   const select=document.createElement('select');select.setAttribute('aria-label',label);
   select.style.cssText='width:100%;height:24px;background:var(--hp-control);color:var(--hp-ink);border:1px solid var(--hp-line);border-radius:2px;padding:2px 4px;font:8px DM Mono,monospace';
   const current=this.patch[key];
   options.forEach(v=>{const o=document.createElement('option');o.value=String(v);o.textContent=String(v).toUpperCase();select.appendChild(o);});
   select.value=String(current);
   select.addEventListener('change',()=>this.set(key,typeof current==='number'?Number(select.value):select.value));
   wrap.append(title,select);p.appendChild(wrap);
   const control={el:select,getValue:()=>this.patch[key],setValue:(v)=>{select.value=String(v);},_oiMidi:{id:'PRO3:'+key,label,group:opts.group||'SYNTHESIS',get:()=>{const i=options.indexOf(this.patch[key]);return Math.max(0,i)/(options.length-1||1);},set:t=>{const i=Math.round(Math.max(0,Math.min(1,t))*(options.length-1));this.set(key,options[i]);}}};
   this.hwControls.selects.push({key,control});this.hwControls.all.push(control);
   return select;
  };
  p.style.cssText+=';--hp-ink:#e9e6de;--hp-muted:#9ca4a7;--hp-line:#586268;--hp-section:#252b2f;--hp-head:#14191d;--hp-control:#0d1114;--hp-accent:#ff4938;--hp-display:#ffbe66;background:linear-gradient(180deg,#343a3e 0%,#22282c 15%,#14191d 56%,#0a0e11);border:8px solid #090c0f;border-radius:5px';
  // Upper rear control strip: the Pro 3's 16-track sequencer, display and navigation.
  group(14,12,1652,118,'SEQUENTIAL · PRO 3','HYBRID MULTI-FILTER MONOSYNTH');
  const logo=document.createElement('img');logo.src='/ui/Logos/Sequential_logo.png';logo.alt='Sequential';logo.draggable=false;
  logo.style.cssText='position:absolute;left:35px;top:48px;width:145px;height:30px;object-fit:contain;filter:brightness(0) invert(1);z-index:5';p.appendChild(logo);
  this.hwDisplay=addDisplay(p,{x:1165,y:34,w:245,h:55,brand:'PROGRAM / PARAMETER DISPLAY',skin:'amber'});
  this.hwDisplay.set('001 · PROLOGUE BASS','OVERTURE PROGRAM');
  sel('mode','VOICE MODE',930,42,['mono','paraphonic'],{width:115,group:'PERFORMANCE'});
  btn('hold','HOLD',1050,56,{group:'PERFORMANCE'});
  addButton(p,{x:1470,y:54,label:'WRITE',value:false,size:27,onChange:()=>this.hwDisplay.set('WRITE','SELECT A PROGRAM SLOT')});
  addButton(p,{x:1530,y:54,label:'COMPARE',value:false,size:27,onChange:()=>this.hwDisplay.set('COMPARE','PATCH COMPARISON')});
  addButton(p,{x:1590,y:54,label:'GLOBAL',value:false,size:27,onChange:()=>this.hwDisplay.set('GLOBAL','SYSTEM SETTINGS')});
  const seq=group(14,140,1652,112,'16-TRACK STEP SEQUENCER','FOUR 16-STEP PHRASES · 64 STEPS · NOTE / MODULATION TRACKS');
  this.hwTrackSelect=sel('seqTrack','TRACK',130,181,Array.from({length:16},(_,i)=>i),{width:86,group:'SEQUENCER'});
  this.hwPhrase=sel('seqPhrase','PHRASE',245,181,['A','B','C','D'],{width:86,group:'SEQUENCER'});
  this.hwDestSelect=sel('seqDestination','TRACK DESTINATION',365,181,['note','none','osc1Pitch','osc2Pitch','osc3Pitch','osc1Shape','osc2Shape','osc3ShapeMod','filterCutoff','resonance','fx1Mix','fx2Mix','feedbackAmount'],{width:130,group:'SEQUENCER'});
  k('bpm','TEMPO',590,201,30,260,1,{group:'SEQUENCER',size:58});
  k('seqSwing','SWING',690,201,0,1,.01,{group:'SEQUENCER',size:58});
  k('seqGate','GATE',790,201,0,1,.01,{group:'SEQUENCER',size:58});
  btn('seqEnabled','PLAY',905,193,{group:'SEQUENCER'});
  btn('seqRecord','RECORD',975,193,{group:'SEQUENCER'});
  this.hwSteps=[];
  for(let i=0;i<16;i++){
   const step=addButton(p,{x:1080+i*34,y:196,label:String(i+1),value:false,size:23,led:'red',midiId:'PRO3:SEQ:STEP:'+i,group:'SEQUENCER',onChange:()=>{this.toggleStep(i);this.renderHardwareSteps();}});
   this.hwSteps.push(step);this.hwControls.buttons.push({key:'seqStep'+i,control:step});this.hwControls.all.push(step);
  }
  // Main voice panel mirrors the left-to-right Pro 3 hardware signal flow.
  group(14,262,235,265,'LFO 1–3','THREE CLOCKABLE MODULATORS');
  for(let i=1;i<=3;i++){
   const x=49+(i-1)*72;
   addLabel(p,x,305,'LFO '+i);
   k('lfo'+i+'Rate','RATE',x,365,0,1,.005,{size:58,group:'LFO '+i});
   k('lfo'+i+'Amount','AMOUNT',x,444,0,1,.01,{size:58,group:'LFO '+i});
   sel('lfo'+i+'Wave','SHAPE',x,485,['triangle','saw','reverseSaw','square','sampleHold'],{width:66,group:'LFO '+i});
   btn('lfo'+i+'Sync','SYNC',x,516,{size:20,group:'LFO '+i});
  }
  group(256,262,210,265,'OSCILLATOR 1','ANALOG VCO · SAW / TRIANGLE / PULSE');
  sel('osc1Wave','WAVEFORM',315,303,['saw','triangle','pulse'],{width:110,group:'OSCILLATOR 1'});
  sel('osc1Octave','OCTAVE',420,303,[-2,-1,0,1,2],{width:76,group:'OSCILLATOR 1'});
  k('osc1Tune','FINE',367,398,-7,7,.05,{size:58,group:'OSCILLATOR 1'});
  k('osc1Shape','SHAPE / PW',432,398,0,1,.01,{size:58,group:'OSCILLATOR 1'});
  k('osc1Slop','SLOP',302,478,0,1,.01,{size:54,group:'OSCILLATOR 1'});
  k('osc1Glide','GLIDE',390,478,0,1,.01,{size:54,group:'OSCILLATOR 1'});
  
  group(472,262,210,265,'OSCILLATOR 2','ANALOG VCO · VARIABLE SHAPE / PULSE WIDTH');
  sel('osc2Wave','WAVEFORM',532,303,['saw','triangle','pulse'],{width:110,group:'OSCILLATOR 2'});
  sel('osc2Octave','OCTAVE',638,303,[-2,-1,0,1,2],{width:76,group:'OSCILLATOR 2'});
  k('osc2Tune','FINE',583,398,-7,7,.05,{size:58,group:'OSCILLATOR 2'});
  k('osc2Shape','SHAPE / PW',648,398,0,1,.01,{size:58,group:'OSCILLATOR 2'});
  k('osc2Slop','SLOP',518,478,0,1,.01,{size:54,group:'OSCILLATOR 2'});
  k('osc2Glide','GLIDE',606,478,0,1,.01,{size:54,group:'OSCILLATOR 2'});
  btn('osc2Sync','SYNC',656,500,{size:20,group:'OSCILLATOR 2'});
  group(688,262,220,265,'OSCILLATOR 3','DIGITAL WAVETABLE · 32 BANKS / SUPER SAW');
  sel('osc3Wave','WAVEFORM',756,303,['sine','triangle','saw','pulse','superSaw','wavetable'],{width:120,group:'OSCILLATOR 3'});
  sel('osc3Octave','OCTAVE',866,303,[-2,-1,0,1,2],{width:74,group:'OSCILLATOR 3'});
  k('osc3Shape','WAVETABLE',808,398,0,31,1,{size:58,group:'OSCILLATOR 3'});
  k('osc3ShapeMod','MORPH',878,398,0,1,.01,{size:58,group:'OSCILLATOR 3'});
  k('osc3Tune','FINE',758,478,-7,7,.05,{size:54,group:'OSCILLATOR 3'});
  k('osc3Glide','GLIDE',850,478,0,1,.01,{size:54,group:'OSCILLATOR 3'});
  group(914,262,154,265,'MIXER','OSCILLATORS / NOISE / EXTERNAL');
  fader('osc1Level','OSC 1',930,405,0,1,{height:112,width:18});
  fader('osc2Level','OSC 2',958,405,0,1,{height:112,width:18});
  fader('osc3Level','OSC 3',986,405,0,1,{height:112,width:18});
  fader('noiseLevel','NOISE',1014,405,0,1,{height:112,width:18});
  const ext=fader('externalLevel','EXT',1042,405,0,1,{height:112,width:18});ext.el.style.opacity='.42';ext.el.style.pointerEvents='none';ext.el.title='External audio requires a hardware input and is not available in this browser emulator';
  group(1074,262,250,265,'FILTER','PROPHET-6 · LADDER · OB-6 STATE VARIABLE');
  sel('filterType','FILTER MODEL',1137,303,['prophet6','ladder','stateVariable'],{width:130,group:'FILTER'});
  k('filterCutoff','CUTOFF',1126,408,0,1,.005,{size:58,group:'FILTER'});
  k('resonance','RESONANCE',1200,408,0,1,.005,{size:58,group:'FILTER'});
  k('filterDrive','DRIVE',1274,408,0,1,.01,{size:58,group:'FILTER'});
  k('filterEnvAmount','ENV AMOUNT',1145,490,0,1,.01,{size:54,group:'FILTER'});
  k('filterKeyTrack','KEY TRACK',1210,490,0,1,.01,{size:54,group:'FILTER'});
  sel('filterState','LP / NOTCH / HP',1290,480,[0,.25,.5,.75,1],{width:88,group:'FILTER'});
  group(1330,262,336,265,'TUNED FEEDBACK / PERFORMANCE','RESONANT FEEDBACK PATH');
  k('feedbackAmount','FEEDBACK',1410,410,0,.96,.005,{size:62,group:'TUNED FEEDBACK'});
  k('feedbackTune','TUNING',1515,410,0,1,.01,{size:62,group:'TUNED FEEDBACK'});
  btn('feedbackGrunge','GRUNGE',1620,470,{group:'TUNED FEEDBACK'});
  // The four hardware envelope families are grouped as four clear, non-overlapping columns.
  group(14,540,670,150,'ENVELOPES','FILTER · AMPLIFIER · AUXILIARY 1 · AUXILIARY 2');
  const envGroups=[['filter','FILTER'],['amp','AMP'],['aux1','AUX 1'],['aux2','AUX 2']];
  envGroups.forEach(([prefix,label],i)=>{
   const start=90+i*155;addLabel(p,start+3,574,label);
   const fields=[['Delay','DLY'],['Attack','ATK'],['Decay','DEC'],['Sustain','SUS'],['Release','REL']];
   fields.forEach(([suffix,short],j)=>fader(prefix+suffix,short,start-42+j*22,631,0,1,{height:70,width:18}));
   btn(prefix+'Loop','LOOP',start+60,670,{size:20,group:label});
  });
  group(696,540,420,150,'DUAL DIGITAL EFFECTS','SERIAL EFFECT 1 → EFFECT 2');
  sel('fx1Type','EFFECT 1',775,578,['off','stereoDelay','bbdDelay','chorus','flanger','phaser','ringMod','rotary','digitalDistortion','highPass','superPlate'],{width:135,group:'EFFECTS'});
  sel('fx2Type','EFFECT 2',1005,578,['off','stereoDelay','bbdDelay','chorus','flanger','phaser','ringMod','rotary','digitalDistortion','highPass','superPlate'],{width:135,group:'EFFECTS'});
  k('fx1Mix','MIX 1',730,654,0,1,.01,{size:42,group:'EFFECTS'});k('fx1Time','TIME 1',778,654,0,1,.01,{size:42,group:'EFFECTS'});k('fx1Feedback','FEEDBACK 1',826,654,0,.88,.01,{size:42,group:'EFFECTS'});k('fx1Tone','TONE 1',874,654,0,1,.01,{size:42,group:'EFFECTS'});k('fx2Mix','MIX 2',922,654,0,1,.01,{size:42,group:'EFFECTS'});k('fx2Time','TIME 2',970,654,0,1,.01,{size:42,group:'EFFECTS'});k('fx2Feedback','FEEDBACK 2',1018,654,0,.88,.01,{size:42,group:'EFFECTS'});k('fx2Tone','TONE 2',1066,654,0,1,.01,{size:42,group:'EFFECTS'});
  group(1122,540,544,150,'ARPEGGIATOR / SEQUENCER CONTROL','CLOCK · DIRECTION · GATE');
  sel('arpMode','ARP MODE',1212,578,['up','down','upDown','random','assign'],{width:120,group:'ARPEGGIATOR'});
  sel('arpDivision','CLOCK',1370,578,['1','2','4','8','16'],{width:90,group:'ARPEGGIATOR'});
  btn('arpEnabled','ARPEGGIATOR',1530,600,{group:'ARPEGGIATOR'});btn('arpLatch','LATCH',1610,600,{group:'ARPEGGIATOR',size:22});
  k('arpRange','OCTAVE RANGE',1280,654,1,4,1,{size:46,group:'ARPEGGIATOR'});k('arpSwing','SWING',1380,654,0,1,.01,{size:46,group:'ARPEGGIATOR'});
  // Front performance area and the real 37-note keybed.
  group(14,704,174,132,'PERFORMANCE','PITCH · MOD · TOUCH');
  const pitchWheel=addWheel(p,{x:53,y:724,label:'PITCH',min:-1,max:1,value:0,height:78,spring:true,onChange:v=>this.engine.post({t:'bend',value:v}),midiId:'PRO3:Pitch Bend'});
  const modWheel=addWheel(p,{x:110,y:724,label:'MOD',value:0,height:78,onChange:v=>this.engine.post({t:'mod',value:v}),midiId:'PRO3:Mod Wheel'});
  const touchStrip=addTouchStrip(p,{x:168,y:726,w:15,h:78,label:'TOUCH',onChange:v=>{this.patch.touch=v;this.engine.post({t:'touch',value:v});}});
  this.hwControls.all.push(pitchWheel,modWheel,touchStrip);
  addKeyboard(p,{x:196,y:712,w:1468,h:130,firstNote:36,count:37,keyColor:'amber',onNoteOn:(n,v)=>this.engine.noteOn(n,v),onNoteOff:n=>this.engine.noteOff(n),onAftertouch:(n,v)=>this.engine.post({t:'at',value:v})});
  this.hwTrackSelect.addEventListener('change',()=>{this.hwDestSelect.value=this.patch.seqDestinations[Number(this.patch.seqTrack)||0]||'note';this.patch.seqDestination=this.hwDestSelect.value;this.renderHardwareSteps();});
  this.hwPhrase.addEventListener('change',()=>{this.seqPage=['A','B','C','D'].indexOf(this.patch.seqPhrase||'A');this.renderHardwareSteps();});
  this.hwDestSelect.addEventListener('change',()=>{const track=Number(this.patch.seqTrack)||0;this.patch.seqDestinations[track]=this.hwDestSelect.value;this.patch.seqDestination=this.hwDestSelect.value;this.engine.post({t:'sequence',tracks:this.patch.seqTracks,destinations:this.patch.seqDestinations,length:this.patch.seqLength});});
  this.renderHardwareSteps=()=>{
   const track=Number(this.patch.seqTrack)||0,offset=(this.seqPage||0)*16;
   this.hwSteps.forEach((control,i)=>control.setValue(this.patch.seqTracks[track]?.[offset+i]!==null&&this.patch.seqTracks[track]?.[offset+i]!==undefined,true));
   this.hwDestSelect.value=this.patch.seqDestinations[track]||'note';this.patch.seqDestination=this.hwDestSelect.value;this.hwDestSelect.disabled=track<3;
  };
  this.displayHardwarePreset=name=>this.hwDisplay.set(name.toUpperCase(),'PRO 3 · PROGRAM');
  this.syncHardware=()=>{
   this.hwControls.knobs.forEach(({key,control})=>control.setValue(this.patch[key],true));
   this.hwControls.faders.forEach(({key,control})=>control.setValue(this.patch[key],true));
   this.hwControls.buttons.forEach(({key,control})=>{if(this.patch[key]!==undefined)control.setValue(this.patch[key],true);});
   this.hwControls.selects.forEach(({key,control})=>control.setValue(this.patch[key]));
   this.renderHardwareSteps();this.refreshHardwareMatrix?.();
  };
  this.renderHardwareSteps();this.syncHardware();
  // Keep the complete program and modulation workflow available with the physical panel visible.
  const hardwareFooter=document.createElement('div');hardwareFooter.className='hp-pro3-hardware-footer';
  hardwareFooter.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;padding:6px 9px;border:1px solid #555f65;border-radius:3px;background:linear-gradient(#242a2f,#11171b);box-shadow:0 2px 6px #0007';
  this.hw.stage.appendChild(hardwareFooter);
  this.hwPresets=document.createElement('select');this.hwPresets.style.cssText='min-width:250px;height:27px;background:#0e1418;color:#eee7d9;border:1px solid #596268;font:9px DM Mono,monospace';
  hardwareFooter.appendChild(this.hwPresets);this.hwPresets.addEventListener('change',()=>this.presets.load(this.hwPresets.value));
  this.refreshHardwarePresetList=(selected='f:0')=>{this.hwPresets.replaceChildren();FACTORY.forEach((item,i)=>{const o=document.createElement('option');o.value='f:'+i;o.textContent=String(i+1).padStart(2,'0')+' · '+item.name;this.hwPresets.appendChild(o);});this.store.items.forEach(item=>{const o=document.createElement('option');o.value='u:'+item.id;o.textContent='U · '+item.name;this.hwPresets.appendChild(o);});this.hwPresets.value=selected;};
  const saveProgram=document.createElement('button');saveProgram.type='button';saveProgram.textContent='SAVE PROGRAM';saveProgram.className='hp-pro3-action';saveProgram.addEventListener('click',()=>{const name=prompt('Name this Pro 3 program','My Pro 3 Program');if(name===null)return;try{const item=this.store.save(name,clone(this.patch));this.refreshHardwarePresetList('u:'+item.id);this.hwDisplay.set(item.name.toUpperCase(),'USER PROGRAM SAVED');}catch(e){alert(e.message);}});hardwareFooter.appendChild(saveProgram);
  const matrixButton=document.createElement('button');matrixButton.type='button';matrixButton.textContent='MOD MATRIX · 32 ROUTES';matrixButton.className='hp-pro3-action';hardwareFooter.appendChild(matrixButton);
  const waveButton=document.createElement('label');waveButton.textContent='LOAD WAVETABLE';waveButton.className='hp-pro3-action hp-pro3-wave-import';
  const waveInput=document.createElement('input');waveInput.type='file';waveInput.accept='.wav,audio/wav';waveInput.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer';
  waveInput.addEventListener('change',async()=>{const file=waveInput.files?.[0];if(!file)return;try{if(!this.engine.ctx)throw new Error('Power on audio first.');const decoded=await this.engine.ctx.decodeAudioData(await file.arrayBuffer()),data=decoded.getChannelData(0);if(data.length<64||data.length>65536)throw new Error('Use a single-cycle WAV between 64 and 65,536 samples.');this.engine.post({t:'wavetable',data:Array.from(data)});this.hwDisplay.set('WAVETABLE LOADED','USER SINGLE CYCLE');}catch(e){this.hwDisplay.set('WAVETABLE FAILED',e.message);alert(e.message);}});
  waveButton.appendChild(waveInput);hardwareFooter.appendChild(waveButton);
  this.matrixDialog=document.createElement('dialog');this.matrixDialog.className='hp-pro3-matrix-dialog';
  this.matrixDialog.innerHTML='<form method="dialog"><header><strong>MODULATION MATRIX · 32 ROUTES</strong><button aria-label="Close">×</button></header><p>32 freely assignable modulation routes. Depth is bipolar and may be positive or negative.</p><div class="hp-pro3-matrix-routes"></div></form>';
  const matrixRows=this.matrixDialog.querySelector('.hp-pro3-matrix-routes');this.hwMatrixRows=[];
  for(let i=0;i<32;i++){
   const route=document.createElement('div');route.className='hp-pro3-matrix-route';
   const num=document.createElement('strong');num.textContent=String(i+1).padStart(2,'0');
   const src=document.createElement('select');SOURCES.forEach(value=>{const o=document.createElement('option');o.value=value;o.textContent=value;src.appendChild(o);});
   const dst=document.createElement('select');DESTS.forEach(value=>{const o=document.createElement('option');o.value=value;o.textContent=value;dst.appendChild(o);});
   const amount=document.createElement('input');amount.type='range';amount.min='-1';amount.max='1';amount.step='.01';
   const val=document.createElement('output');
   const update=()=>{this.patch.modRoutes[i]={source:src.value,destination:dst.value,amount:Number(amount.value)};val.value=Number(amount.value).toFixed(2);this.postPatch();};
   src.addEventListener('change',update);dst.addEventListener('change',update);amount.addEventListener('input',update);
   route.append(num,src,dst,amount,val);matrixRows.appendChild(route);this.hwMatrixRows.push({src,dst,amount,val});
  }
  this.refreshHardwareMatrix=()=>this.hwMatrixRows.forEach((row,i)=>{const route=this.patch.modRoutes[i];row.src.value=route.source;row.dst.value=route.destination;row.amount.value=String(route.amount);row.val.value=Number(route.amount).toFixed(2);});
  this.refreshHardwareMatrix();document.body.appendChild(this.matrixDialog);
  matrixButton.addEventListener('click',()=>{this.refreshHardwareMatrix();this.matrixDialog.showModal();});
  this.refreshHardwarePresetList('f:0');
  if(!this._hardwareMidiCleanup)this._hardwareMidiCleanup=registerMidiTargetProvider(()=>this.hwControls.all.map(control=>{
   const m=control.el?._oiMidi||control._oiMidi;if(!m)return null;
   return {id:m.id,label:m.label,group:m.group||'HARDWARE PANEL',get:m.get,set:m.set,el:control.el||null};
  }).filter(Boolean));
 }

}
new Pro3App();