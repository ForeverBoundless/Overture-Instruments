import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { performance, power } from './shared/panel.js';
import { registerMidiTargetProvider } from './shared/midiMap.js';
import { createHardwareSurface,addPanel,addRow,addLabel,addKnob,addFader,addButton,addSelect,addSlider,addDisplay,addKeyboard,addWheel,addTouchStrip } from './shared/hardwarePanel.js';
import { PRO3_PRESETS } from './data/pro3Presets.js';
import { consumeCommunityInstrumentPreset, createCommunityShareButton, clearCommunitySource } from './shared/communityPreset.js';

const NOTES=Array.from({length:37},(_,i)=>{const n=36+i;return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][n%12]+(Math.floor(n/12)-1);});
const clone=v=>JSON.parse(JSON.stringify(v));
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,Number(v)||0));
const BASE={
 mode:'mono',osc1Wave:'saw',osc1Octave:0,osc1Tune:0,osc1Shape:.5,osc1Level:.78,osc1Glide:.04,osc1Slop:.08,osc1Sync:false,
 osc2Wave:'pulse',osc2Octave:0,osc2Tune:0,osc2Shape:.5,osc2Level:.55,osc2Glide:.04,osc2Slop:.08,osc2Sync:false,
 osc3Wave:'wavetable',osc3Octave:0,osc3Tune:0,osc3Shape:.35,osc3ShapeMod:.25,osc3Level:.45,osc3Glide:.02,osc3Slop:.02,
 noiseLevel:0,externalLevel:0,filterType:'prophet6',filterCutoff:.68,resonance:.16,filterState:0,filterBp:false,filterKeyTrack:.35,filterEnvAmount:.38,filterDrive:.08,distortion:.08,
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
 feedbackAmount:0,feedbackTune:24,feedbackGrunge:false,
 arpEnabled:false,arpMode:'up',arpDivision:4,arpRange:1,arpSwing:0,arpLatch:false,
 seqEnabled:false,seqMode:'forward',seqLength:16,seqSwing:0,seqGate:.72,
 seqTracks:Array.from({length:16},()=>Array(64).fill(null)),
 seqDestinations:Array.from({length:16},(_,i)=>i===0?'note':i===1?'osc1Shape':i===2?'filterCutoff':'none'),
 seqPhrase:'A',seqLinked:false,seqTrack:0,seqDestination:'note',seqRecord:false,
 modRoutes:Array.from({length:32},()=>({source:'LFO 1',destination:'filterCutoff',amount:0})),morph:0
};
function clean(data){
 const p={...BASE,...data};
 if(Number(p.feedbackTune)<=1)p.feedbackTune=Number(p.feedbackTune||0)*48;
 p.seqTracks=Array.from({length:16},(_,i)=>Array.from({length:64},(_,j)=>data.seqTracks?.[i]?.[j]??null));
 p.seqDestinations=Array.from({length:16},(_,i)=>data.seqDestinations?.[i]||BASE.seqDestinations[i]);
 p.modRoutes=Array.from({length:32},(_,i)=>{const r=data.modRoutes?.[i]||BASE.modRoutes[i];return {source:r.source||'LFO 1',destination:r.destination||'filterCutoff',amount:clamp(r.amount,-1,1)};});
 return p;
}
const FACTORY=PRO3_PRESETS.map(x=>({name:x.name,data:clean(x.data)}));
const SOURCES=['LFO 1','LFO 2','LFO 3','Filter Env','Amp Env','Aux Env 1','Aux Env 2','Mod Wheel','Aftertouch','Touch Slider','Velocity','Key Number','Sequencer'];
const DESTS=['osc1Pitch','osc2Pitch','osc3Pitch','osc1Shape','osc2Shape','osc3Shape','osc3ShapeMod','filterCutoff','resonance','filterState','ampLevel','fx1Mix','fx2Mix','feedbackAmount','lfo1Rate','lfo2Rate','lfo3Rate','none'];
const SEQ_DESTS=['note','none','osc1Pitch','osc2Pitch','osc3Pitch','osc1Shape','osc2Shape','osc3ShapeMod','filterCutoff','resonance','fx1Mix','fx2Mix','feedbackAmount'];
const FX_TYPES=['off','stereoDelay','bbdDelay','chorus','flanger','phaser','ringMod','rotary','digitalDistortion','highPass','superPlate'];
const FX_LABELS=['Off','Stereo delay','BBD delay','Chorus','Flanger','Phaser','Ring mod','Rotary','Digital dist.','High-pass','Plate reverb'];
const OCTAVES=[-2,-1,0,1,2];
const fmt2=v=>Number(v).toFixed(2);

class Pro3App{
 constructor(){
  this.engine=new WorkletEngine(new URL('./engine/Pro3Processor.js',import.meta.url).href,'pro3-processor');
  this.patch=clean(BASE);this.store=new PresetStore({key:'overture.sequential-pro-3.programs',version:1,validate:clean});
  // Queue the real synth state before any UI construction. If a visual control
  // throws during startup, the power overlay can still start a playable engine.
  this.engine.post({t:'patch',patch:this.patch});
  this.activateAudio=power('pro3-power',()=>this.engine.start(),()=>{
   this.engine.post({t:'patch',patch:this.patch});
   this.hwPower?.setValue(true,true);
   this.perf?.flushPending();
   this.hwDisplay?.set('PRO 3 READY','OVERTURE PROGRAM · AUDIO ACTIVE');
  },error=>{
   this.hwPower?.setValue(false,true);
   this.hwDisplay?.set('AUDIO START FAILED',String(error?.message||error||'Unknown audio error').slice(0,58));
  });
  this.engine.onProcessorError=error=>this.hwDisplay?.set('AUDIO PROCESSOR ERROR',String(error?.message||error).slice(0,58));
  this.ui={};this.seqPage=0;
   this.hwControls={knobs:[],faders:[],buttons:[],selects:[],all:[]};
   this.buildHardwarePanel();
   // Keep computer-keyboard and MIDI input plumbing off-screen; the visible
   // hardware keybed is the only keyboard rendered for this instrument.
   this.midiHost=document.createElement('div');
   this.midiHost.setAttribute('aria-hidden','true');
   this.midiHost.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
   document.body.appendChild(this.midiHost);
   this.shell=this.midiHost;
   this.presets={load:id=>this.loadProgram(id)};
   this.buildPerformance();
   this.presets.load('f:0');
  this.engine.post({t:'patch',patch:this.patch});
  const community=consumeCommunityInstrumentPreset('sequential-pro-3',clean);
  if(community){this.patch=community.data;this.refresh();this.displayHardwarePreset(community.title);this.refreshHardwarePresetList('f:0');}
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
 loadProgram(id){
  const key=String(id||'f:0');let item=null;
  if(key.startsWith('f:'))item=FACTORY[Number(key.slice(2))];else if(key.startsWith('u:'))item=this.store.get(key.slice(2));
  if(!item)return;
  this.patch=clean(clone(item.data));this.refresh();
  this.displayHardwarePreset(item.name);this.refreshHardwarePresetList(key);
 }
 set(k,v){this.patch[k]=v;this.engine.post({t:'param',key:k,value:v});}
 postPatch(){this.engine.post({t:'patch',patch:this.patch});}
 postSequence(){this.engine.post({t:'sequence',tracks:this.patch.seqTracks,destinations:this.patch.seqDestinations,length:Number(this.patch.seqLength)||16});}
 toggleStep(i){
  const track=Number(this.patch.seqTrack)||0,step=this.seqPage*16+i,arr=this.patch.seqTracks[track];
  if(track<3)arr[step]=arr[step]===null?48+((i%8)*2)+track*7:null;else arr[step]=arr[step]===null?.7:null;
  this.postSequence();this.renderSteps();
 }
 renderSteps(){
  const track=Number(this.patch.seqTrack)||0,offset=this.seqPage*16;
  this.hwSteps?.forEach((c,i)=>{const v=this.patch.seqTracks[track]?.[offset+i];c.setValue(v!==null&&v!==undefined,true);});
  if(this.hwDest){this.hwDest.setValue(this.patch.seqDestinations[track]||'none');this.hwDest.el.disabled=track<3;}
 }
 applyMorph(t){
  if(!this.morphA||!this.morphB)return;
  const out=clone(this.morphA);
  Object.keys(out).forEach(k=>{const a=this.morphA[k],b=this.morphB[k];if(typeof a==='number'&&typeof b==='number')out[k]=a+(b-a)*t;else if(t>=.5)out[k]=b;});
  out.seqTracks=this.morphA.seqTracks;out.modRoutes=this.morphA.modRoutes;out.morph=t;
  this.patch=clean(out);this.postPatch();this.syncHardware();
 }
 buildPerformance(){
  this.perf=performance(this.shell,{notes:NOTES,octaves:3,startOctave:2,wheels:false,started:()=>this.engine.started,midiStatusEl:this.midi,handlers:{
   noteOn:(n,v)=>{this.hwKeyboard?.setActive(n,true);this.engine.noteOn(n,v);},noteOff:n=>{this.hwKeyboard?.setActive(n,false);this.engine.noteOff(n);},bend:v=>this.engine.setPitchBend(v),mod:v=>this.engine.setModWheel(v),
   aftertouch:v=>this.engine.setAftertouch(v),sustain:d=>this.engine.setSustain(d),allOff:()=>this.engine.allNotesOff(),
   program:p=>this.presets.load('f:'+(p%FACTORY.length)),clock:()=>this.engine.post({t:'clock'}),start:()=>this.engine.post({t:'transport',play:true}),continue:()=>this.engine.post({t:'transport',play:true}),stop:()=>this.engine.post({t:'transport',play:false}),cc:(cc,v)=>{if(cc===7){this.set('volume',v/127);this.syncHardware();}if(cc===74){this.set('filterCutoff',v/127);this.syncHardware();}}
  }});
 }
 refresh(){this.postPatch();this.syncHardware();}

 buildHardwarePanel(){
  const root=document.getElementById('pro3-root');
  const hw=createHardwareSurface(root,{id:'sequential-pro-3',skin:'pro3',programLabel:'PRO 3 · INITIAL PROGRAM'});
  this.hw=hw;const p=hw.instrument;this.midi=hw.midi;
  const remember=(type,key,control)=>{this.hwControls[type].push({key,control});this.hwControls.all.push(control);return control;};
  const k=(parent,key,label,o={})=>remember('knobs',key,addKnob(parent,{label,min:o.min??0,max:o.max??1,value:this.patch[key],step:o.step,size:o.size||48,small:o.small,bipolar:o.bipolar,accent:o.accent,midiId:'PRO3:'+key,group:o.group||'SYNTHESIS',formatValue:o.fmt||(o.max>10?(v=>Number(v).toFixed(1)):o.max>5?(v=>String(Math.round(v))):fmt2),onChange:v=>this.set(key,v)}));
  const f=(parent,key,label,o={})=>remember('faders',key,addFader(parent,{label,value:this.patch[key],height:o.height||84,midiId:'PRO3:'+key,group:o.group||'SYNTHESIS',onChange:v=>this.set(key,v)}));
  const b=(parent,key,label,o={})=>remember('buttons',key,addButton(parent,{label,value:!!this.patch[key],led:o.led||'red',midiId:'PRO3:'+key,group:o.group||'SYNTHESIS',onChange:v=>this.set(key,v)}));
  const s=(parent,key,label,options,o={})=>{const c=addSelect(parent,{label,options,value:this.patch[key],optionLabels:o.labels,wide:o.wide,midiId:'PRO3:'+key,group:o.group||'SYNTHESIS',onChange:v=>{this.set(key,v);if(o.after)o.after(v);}});c.holder.dataset.key=key;c.el._oiMidi.id='PRO3:'+key;return remember('selects',key,c);};

  // ---- top strip: brand, display, voice, power ----
  const top=addRow(p,'p3-top');
  const brand=document.createElement('div');brand.className='p3-brand';top.appendChild(brand);
  const logo=document.createElement('img');logo.src='/ui/Logos/Sequential_logo.png';logo.alt='Sequential';logo.draggable=false;brand.appendChild(logo);
  const model=document.createElement('div');model.className='p3-model';model.innerHTML='<strong>PRO 3</strong><span>Hybrid multi-filter monosynth</span>';brand.appendChild(model);
  this.hwDisplay=addDisplay(top,{brand:'PROGRAM / PARAMETER DISPLAY'});this.display=this.hwDisplay;this.display.flash=m=>this.hwDisplay.set(String(m).toUpperCase(),'PRO 3');this.hwDisplay.set('001 · PROLOGUE BASS','OVERTURE PROGRAM');
  const voice=addRow(top,'p3-voice');
  s(voice,'mode','Voice mode',['mono','paraphonic'],{group:'PERFORMANCE',wide:true});
  b(voice,'hold','Hold',{group:'PERFORMANCE',led:'amber'});
  k(voice,'volume','Master',{size:46,group:'MASTER'});
  this.hwPower=addButton(voice,{label:'POWER',value:false,toggle:false,led:'green',group:'GLOBAL',onChange:async()=>{const ready=await this.activateAudio?.();this.hwPower?.setValue(!!ready,true);}});

  // ---- sequencer ----
  const seq=addPanel(p,{title:'Sequencer',sub:'16 tracks · four 16-step phrases',className:'p3-seq'});
  const seqTop=addRow(seq.body,'p3-seq-top');
  s(seqTop,'seqTrack','Track',Array.from({length:16},(_,i)=>i),{labels:Array.from({length:16},(_,i)=>i+1),group:'SEQUENCER',after:()=>this.renderSteps()});
  s(seqTop,'seqPhrase','Phrase',['A','B','C','D'],{group:'SEQUENCER',after:v=>{this.seqPage=['A','B','C','D'].indexOf(v);this.renderSteps();}});
  this.hwDest=addSelect(seqTop,{label:'Track destination',options:SEQ_DESTS,value:'note',wide:true,midiId:'PRO3:seqDestination',group:'SEQUENCER',onChange:v=>{const t=Number(this.patch.seqTrack)||0;this.patch.seqDestinations[t]=v;this.patch.seqDestination=v;this.postSequence();}});
  this.hwControls.all.push(this.hwDest);
  s(seqTop,'seqMode','Play mode',['forward','reverse','forwardReverse','random'],{group:'SEQUENCER',wide:true});
  s(seqTop,'seqLength','Length',Array.from({length:64},(_,i)=>i+1),{group:'SEQUENCER'});
  k(seqTop,'bpm','Tempo',{min:30,max:260,step:1,size:42,group:'SEQUENCER',fmt:v=>String(Math.round(v))});
  k(seqTop,'seqSwing','Swing',{size:42,group:'SEQUENCER'});
  k(seqTop,'seqGate','Gate',{size:42,group:'SEQUENCER'});
  b(seqTop,'seqEnabled','Play',{group:'SEQUENCER',led:'green'});
  b(seqTop,'seqRecord','Rec',{group:'SEQUENCER'});
  const steps=document.createElement('div');steps.className='p3-steps';seq.body.appendChild(steps);this.hwSteps=[];
  for(let i=0;i<16;i++){const c=addButton(steps,{label:String(i+1),value:false,led:'red',midiId:'PRO3:SEQ:STEP:'+i,group:'SEQUENCER',onChange:()=>this.toggleStep(i)});this.hwSteps.push(c);this.hwControls.all.push(c);}
  // keep transport buttons in sync with the engine
  const playBtn=this.hwControls.buttons.find(x=>x.key==='seqEnabled').control;
  playBtn.el.addEventListener('click',()=>this.engine.post({t:'transport',play:this.patch.seqEnabled}));

  // ---- voice sections ----
  const main=addRow(p,'hp-main p3-main');
  const lfo=addPanel(main,{title:'LFO 1–3',sub:'clockable modulators',className:'p3-lfo'});
  for(let i=1;i<=3;i++){
   const col=document.createElement('div');col.className='p3-col';lfo.body.appendChild(col);addLabel(col,'LFO '+i);
   const primary=addRow(col,'p3-lfo-row');
   k(primary,'lfo'+i+'Rate','Rate',{size:40,group:'LFO '+i});
   k(primary,'lfo'+i+'Amount','Amount',{size:40,group:'LFO '+i});
   s(primary,'lfo'+i+'Wave','Shape',['triangle','saw','reverseSaw','square','sampleHold'],{group:'LFO '+i});
   const secondary=addRow(col,'p3-lfo-row');
   k(secondary,'lfo'+i+'Phase','Phase',{size:36,group:'LFO '+i});
   k(secondary,'lfo'+i+'Slew','Slew',{size:36,group:'LFO '+i});
   b(secondary,'lfo'+i+'Sync','Sync',{group:'LFO '+i});
  }
  const osc=(n,title,sub,waves)=>{
   const g=addPanel(main,{title,sub,className:'p3-osc'});const grp=title;
   s(g.body,'osc'+n+'Wave','Waveform',waves,{group:grp,wide:true});s(g.body,'osc'+n+'Octave','Octave',OCTAVES,{group:grp});
   return g;
  };
  const o1=osc(1,'Oscillator 1','analogue VCO',['saw','triangle','pulse']);
  k(o1.body,'osc1Tune','Fine',{min:-7,max:7,step:.05,bipolar:true,group:'OSCILLATOR 1',fmt:v=>Number(v).toFixed(1)});k(o1.body,'osc1Shape','Shape / PW',{group:'OSCILLATOR 1'});
  k(o1.body,'osc1Slop','Slop',{size:40,group:'OSCILLATOR 1'});k(o1.body,'osc1Glide','Glide',{size:40,group:'OSCILLATOR 1'});
  const o2=osc(2,'Oscillator 2','analogue VCO',['saw','triangle','pulse']);
  k(o2.body,'osc2Tune','Fine',{min:-7,max:7,step:.05,bipolar:true,group:'OSCILLATOR 2',fmt:v=>Number(v).toFixed(1)});k(o2.body,'osc2Shape','Shape / PW',{group:'OSCILLATOR 2'});
  k(o2.body,'osc2Slop','Slop',{size:40,group:'OSCILLATOR 2'});k(o2.body,'osc2Glide','Glide',{size:40,group:'OSCILLATOR 2'});b(o2.body,'osc2Sync','Sync',{group:'OSCILLATOR 2'});
  const o3=osc(3,'Oscillator 3','digital wavetable',['sine','triangle','saw','pulse','superSaw','wavetable']);
  k(o3.body,'osc3Shape','Wavetable',{step:1/31,group:'OSCILLATOR 3',fmt:v=>'Bank '+(Math.round(v*31)+1)});k(o3.body,'osc3ShapeMod','Morph',{group:'OSCILLATOR 3'});
  k(o3.body,'osc3Tune','Fine',{min:-7,max:7,step:.05,bipolar:true,size:40,group:'OSCILLATOR 3',fmt:v=>Number(v).toFixed(1)});k(o3.body,'osc3Glide','Glide',{size:40,group:'OSCILLATOR 3'});
  const mix=addPanel(main,{title:'Mixer',sub:'levels',className:'p3-mixer'});
  f(mix.body,'osc1Level','Osc 1',{group:'MIXER',height:96});f(mix.body,'osc2Level','Osc 2',{group:'MIXER',height:96});f(mix.body,'osc3Level','Osc 3',{group:'MIXER',height:96});f(mix.body,'noiseLevel','Noise',{group:'MIXER',height:96});
  const ext=f(mix.body,'externalLevel','Ext',{group:'MIXER',height:96});ext.el.style.opacity='.4';ext.el.style.pointerEvents='none';ext.el.title='External audio needs a hardware input and is not available in the browser';
  const fl=addPanel(main,{title:'Filter',sub:'three designs',className:'p3-filter'});
  s(fl.body,'filterType','Model',['prophet6','ladder','stateVariable'],{group:'FILTER',wide:true,labels:['Prophet-6','Ladder','State variable']});
  b(fl.body,'filterBp','Band pass',{group:'FILTER'});
  addRow(fl.body,'p3-break');
  k(fl.body,'filterCutoff','Cutoff',{step:.005,size:56,group:'FILTER'});k(fl.body,'resonance','Resonance',{step:.005,size:56,group:'FILTER'});k(fl.body,'filterDrive','Drive',{group:'FILTER'});
  k(fl.body,'filterEnvAmount','Env amount',{group:'FILTER'});k(fl.body,'filterKeyTrack','Key track',{group:'FILTER'});k(fl.body,'filterState','LP · notch · HP',{group:'FILTER'});k(fl.body,'distortion','Distortion',{group:'FILTER'});
  const fb=addPanel(main,{title:'Tuned feedback',sub:'resonant delay path',className:'p3-feedback'});
  k(fb.body,'feedbackAmount','Amount',{min:-1,max:.96,step:.005,bipolar:true,size:56,group:'TUNED FEEDBACK'});k(fb.body,'feedbackTune','Tuning',{min:0,max:48,step:1,size:56,group:'TUNED FEEDBACK',fmt:v=>String(Math.round(v))+' st'});
  b(fb.body,'feedbackGrunge','Grunge',{group:'TUNED FEEDBACK'});

  // ---- envelopes, effects, arp, morph ----
  const lower=addRow(p,'hp-main p3-lower');
  const env=addPanel(lower,{title:'Envelopes',sub:'delay · attack · decay · sustain · release',className:'p3-env'});
  [['filter','Filter'],['amp','Amp'],['aux1','Aux 1'],['aux2','Aux 2']].forEach(([prefix,label])=>{
   const col=document.createElement('div');col.className='p3-col p3-env-col';env.body.appendChild(col);addLabel(col,label);
   const faders=addRow(col,'hp-row-tight');
   [['Delay','Dly'],['Attack','Atk'],['Decay','Dec'],['Sustain','Sus'],['Release','Rel']].forEach(([suffix,short])=>f(faders,prefix+suffix,short,{group:label.toUpperCase(),height:72}));
   b(col,prefix+'Loop','Loop',{group:label.toUpperCase()});
  });
  const fx=addPanel(lower,{title:'Effects',sub:'effect 1 → effect 2',className:'p3-fx'});
  [1,2].forEach(n=>{
   const col=document.createElement('div');col.className='p3-col';fx.body.appendChild(col);
   s(col,'fx'+n+'Type','Effect '+n,FX_TYPES,{group:'EFFECTS',wide:true,labels:FX_LABELS});
   const r=addRow(col,'hp-row-tight');
   k(r,'fx'+n+'Mix','Mix',{size:40,group:'EFFECTS'});k(r,'fx'+n+'Time','Time',{size:40,group:'EFFECTS'});k(r,'fx'+n+'Feedback','Feedback',{max:.88,size:40,group:'EFFECTS'});k(r,'fx'+n+'Tone','Tone',{size:40,group:'EFFECTS'});
  });
  const arp=addPanel(lower,{title:'Arpeggiator',sub:'runs with the sequencer',className:'p3-arp'});
  b(arp.body,'arpEnabled','Arp on',{group:'ARPEGGIATOR',led:'green'});b(arp.body,'arpLatch','Latch',{group:'ARPEGGIATOR'});
  s(arp.body,'arpMode','Mode',['up','down','upDown','random','assign'],{group:'ARPEGGIATOR',wide:true});s(arp.body,'arpDivision','Clock',[1,2,4,8,16],{group:'ARPEGGIATOR'});
  k(arp.body,'arpRange','Octaves',{min:1,max:4,step:1,size:42,group:'ARPEGGIATOR',fmt:v=>String(Math.round(v))});k(arp.body,'arpSwing','Swing',{size:42,group:'ARPEGGIATOR'});
  const morph=addPanel(lower,{title:'Patch morph',sub:'blend two program states',className:'p3-morph'});
  const mr=addRow(morph.body,'hp-row-tight');
  const setA=addButton(mr,{label:'Store A',toggle:false,led:'amber',group:'MORPH',onChange:()=>{this.morphA=clone(this.patch);this.display.set('MORPH A STORED','PATCH MORPH');}});
  const setB=addButton(mr,{label:'Store B',toggle:false,led:'amber',group:'MORPH',onChange:()=>{this.morphB=clone(this.patch);this.display.set('MORPH B STORED','PATCH MORPH');}});
  this.hwControls.all.push(setA,setB);
  this.hwMorph=addSlider(morph.body,{label:'Morph A → B',value:0,midiId:'PRO3:morph',group:'MORPH',onChange:v=>this.applyMorph(v)});this.hwControls.all.push(this.hwMorph);

  // ---- performance and keybed ----
  const play=addRow(p,'hp-play');
  const wheels=document.createElement('div');wheels.className='hp-wheels';play.appendChild(wheels);
  const pitch=addWheel(wheels,{label:'Pitch',min:-1,max:1,value:0,spring:true,onChange:v=>this.engine.post({t:'bend',value:v}),midiId:'PRO3:Pitch Bend'});
  const modw=addWheel(wheels,{label:'Mod',value:0,onChange:v=>this.engine.post({t:'mod',value:v}),midiId:'PRO3:Mod Wheel'});
  const touch=addTouchStrip(wheels,{label:'Touch',onChange:v=>{this.patch.touch=v;this.engine.post({t:'touch',value:v});}});
  this.hwControls.all.push(pitch,modw,touch);
  this.hwKeyboard=addKeyboard(play,{firstNote:36,count:37,keyColor:'amber',onNoteOn:(n,v)=>this.perf.noteOn(n,v,'ui'),onNoteOff:n=>this.perf.noteOff(n,'ui'),onAftertouch:(n,v)=>this.engine.post({t:'at',value:v})});

  // ---- program memory ----
  const footer=document.createElement('div');footer.className='hp-footer';p.appendChild(footer);
  this.hwPresets=document.createElement('select');this.hwPresets.setAttribute('aria-label','Program');footer.appendChild(this.hwPresets);
  this.hwPresets.addEventListener('change',()=>{clearCommunitySource();this.presets.load(this.hwPresets.value);});
  const action=(label,fn)=>{const a=document.createElement('button');a.type='button';a.className='hp-action';a.textContent=label;a.addEventListener('click',fn);footer.appendChild(a);return a;};
  action('Save program',()=>{const name=prompt('Name this Pro 3 program','My Pro 3 Program');if(name===null)return;try{const item=this.store.save(name,clone(this.patch));this.refreshHardwarePresetList('u:'+item.id);this.hwDisplay.set(item.name.toUpperCase(),'USER PROGRAM SAVED');}catch(e){alert(e.message);}});
  createCommunityShareButton(footer,{instrumentId:'sequential-pro-3',className:'hp-action',getData:()=>clean(clone(this.patch)),getTitle:()=> 'Sequential Pro 3 program'});
  const matrixButton=action('Mod matrix · 32 routes',()=>{this.refreshMatrix();this.matrixDialog.showModal();});
  const waveButton=document.createElement('label');waveButton.className='hp-action';waveButton.textContent='Load wavetable';
  const waveInput=document.createElement('input');waveInput.type='file';waveInput.accept='.wav,audio/wav';waveButton.appendChild(waveInput);footer.appendChild(waveButton);
  waveInput.addEventListener('change',async()=>{const file=waveInput.files?.[0];if(!file)return;try{if(!this.engine.ctx)throw new Error('Power on audio first.');const decoded=await this.engine.ctx.decodeAudioData(await file.arrayBuffer()),data=decoded.getChannelData(0);if(data.length<64||data.length>65536)throw new Error('Use a single-cycle WAV between 64 and 65,536 samples.');this.engine.post({t:'wavetable',data:Array.from(data)});this.hwDisplay.set('WAVETABLE LOADED','USER SINGLE CYCLE · BANK 32');}catch(e){this.hwDisplay.set('WAVETABLE FAILED',e.message);alert(e.message);}});
  this.refreshHardwarePresetList=(selected='f:0')=>{this.hwPresets.replaceChildren();FACTORY.forEach((item,i)=>{const o=document.createElement('option');o.value='f:'+i;o.textContent=String(i+1).padStart(2,'0')+' · '+item.name;this.hwPresets.appendChild(o);});this.store.items.forEach(item=>{const o=document.createElement('option');o.value='u:'+item.id;o.textContent='User · '+item.name;this.hwPresets.appendChild(o);});this.hwPresets.value=selected;};
  this.displayHardwarePreset=name=>{this.hwDisplay.set(name.toUpperCase(),'PRO 3 · PROGRAM');hw.program.textContent='PRO 3 · '+name;};

  // ---- modulation matrix dialog ----
  this.matrixDialog=document.createElement('dialog');this.matrixDialog.className='hp-dialog p3-matrix-dialog';
  this.matrixDialog.innerHTML='<form method="dialog"><header><strong>MODULATION MATRIX · 32 ROUTES</strong><button aria-label="Close">×</button></header><p>Each route sends a source to a destination. Depth is bipolar: negative values invert the modulation.</p><div class="p3-matrix"></div></form>';
  const rowsEl=this.matrixDialog.querySelector('.p3-matrix');this.matrixRows=[];
  for(let i=0;i<32;i++){
   const route=document.createElement('div');route.className='p3-route';
   const num=document.createElement('strong');num.textContent=String(i+1).padStart(2,'0');
   const src=document.createElement('select');SOURCES.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;src.appendChild(o);});src.setAttribute('aria-label','Route '+(i+1)+' source');
   const dst=document.createElement('select');DESTS.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;dst.appendChild(o);});dst.setAttribute('aria-label','Route '+(i+1)+' destination');
   const amount=document.createElement('input');amount.type='range';amount.min='-1';amount.max='1';amount.step='.01';amount.setAttribute('aria-label','Route '+(i+1)+' depth');
   const val=document.createElement('output');
   const update=()=>{this.patch.modRoutes[i]={source:src.value,destination:dst.value,amount:Number(amount.value)};val.value=Number(amount.value).toFixed(2);this.postPatch();};
   src.addEventListener('change',update);dst.addEventListener('change',update);amount.addEventListener('input',update);
   route.append(num,src,dst,amount,val);rowsEl.appendChild(route);this.matrixRows.push({src,dst,amount,val});
  }
  this.refreshMatrix=()=>this.matrixRows.forEach((row,i)=>{const r=this.patch.modRoutes[i];row.src.value=r.source;row.dst.value=r.destination;row.amount.value=String(r.amount);row.val.value=Number(r.amount).toFixed(2);});
  document.body.appendChild(this.matrixDialog);

  this.syncHardware=()=>{
   this.hwControls.knobs.forEach(({key,control})=>control.setValue(this.patch[key],true));
   this.hwControls.faders.forEach(({key,control})=>control.setValue(this.patch[key],true));
   this.hwControls.buttons.forEach(({key,control})=>{if(this.patch[key]!==undefined)control.setValue(this.patch[key],true);});
   this.hwControls.selects.forEach(({key,control})=>control.setValue(this.patch[key]));
   this.seqPage=Math.max(0,['A','B','C','D'].indexOf(this.patch.seqPhrase||'A'));
   this.renderSteps();this.refreshMatrix?.();
  };
  this.refreshHardwarePresetList('f:0');this.syncHardware();
  if(!this._hardwareMidiCleanup)this._hardwareMidiCleanup=registerMidiTargetProvider(()=>this.hwControls.all.map(control=>{
   const m=control.el?._oiMidi||control._oiMidi;if(!m)return null;
   return {id:m.id,label:m.label,group:m.group||'HARDWARE PANEL',get:m.get,set:m.set,el:control.el||null};
  }).filter(Boolean));
 }
}
new Pro3App();
