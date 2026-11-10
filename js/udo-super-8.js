import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el,section,knob,select,toggle,button,display,performance,power,presetBar,footer } from './shared/panel.js';
import { registerMidiTarget, registerMidiTargetProvider } from './shared/midiMap.js';
import { createHardwareSurface,addSection,addLabel,addRule,addLED,addKnob,addFader,addButton,addDisplay,addKeyboard,addWheel,addTouchStrip } from './shared/hardwarePanel.js';

const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES=Array.from({length:61},(_,i)=>{const n=36+i;return NOTE_NAMES[n%12]+(Math.floor(n/12)-1);});
const clone=o=>JSON.parse(JSON.stringify(o));
const LAYER={
 dds1Wave:'saw',altA:0,altB:1,waveMod:0,waveModSource:'Manual',superMode:'off',detune:.16,pwDrift:.1,
 dds2Wave:'saw',dds2Octave:0,dds2Tune:0,dds2Mode:'normal',crossMod:0,subMode:'off',subLevel:.18,
 mix:.5,pan:.5,hpf:.04,cutoff:.72,resonance:.16,drive:'off',keyTrack:'on',filterMod:'env1',
 env1Attack:.08,env1AttackHold:0,env1DecayHold:0,env1Decay:.25,env1Sustain:.6,env1Release:.35,env1Loop:false,env1KeyTrack:0,
 env2Attack:.02,env2DecayHold:0,env2Decay:.32,env2Sustain:.78,env2Release:.3,
 lfo1Rate:.15,lfo1Delay:0,lfo1Wave:'sine',lfo1Mode:'reset',lfo1HighFreq:false,lrPhase:0,
 lfo2Rate:.15,lfo2Delay:0,lfo2Wave:'triangle',lfo2Destination:'filter',lfo2Amount:0,lfo2Bender:false,lfo2Aftertouch:false,
 chorus:'off',chorusMix:.25,delayTime:.28,delayFeedback:.25,delayMod:.1,delaySync:false,delayFreeze:false,
 voiceMode:'poly1',unison:'off',modMatrix:Array(64).fill(0),
 seqEnabled:false,seqLength:16,seqMode:'step',seqSteps:Array(64).fill(null),seqSlides:Array(64).fill(false),seqAccents:Array(64).fill(false),seqGates:Array(64).fill(.75),seqSwing:0,seqBpm:120,
 arpEnabled:false,arpMode:'up',arpDivision:4,arpRange:1,arpSwing:0,arpHold:false,
 portamento:0,transpose:0,bendRange:2,velocity:1,aftertouch:0
};
const GLOBAL={mode:'single',activeLayer:0,splitPoint:60,binaural:true,mpe:true,volume:.72,distortion:0,benderX:0,benderY:0,expression:1};
function cleanLayer(d={}){const p={...clone(LAYER),...d};p.modMatrix=Array.from({length:64},(_,i)=>Number(d.modMatrix?.[i])||0);p.seqSteps=Array.from({length:64},(_,i)=>d.seqSteps?.[i]??null);p.seqSlides=Array.from({length:64},(_,i)=>!!d.seqSlides?.[i]);p.seqAccents=Array.from({length:64},(_,i)=>!!d.seqAccents?.[i]);p.seqGates=Array.from({length:64},(_,i)=>Math.max(.05,Math.min(1,Number(d.seqGates?.[i]??.75))));return p;}
function validate(d){
 if(!d||typeof d!=='object')throw new Error('Not a Super 8 performance.');
 return {...GLOBAL,...d,layers:[cleanLayer(d.layers?.[0]),cleanLayer(d.layers?.[1])]};
}
const FACTORY=[
 {name:'Binaural Glass',data:{binaural:true,layers:[{dds1Wave:'sine',dds2Wave:'triangle',superMode:'on',detune:.28,cutoff:.82,resonance:.1,env1Attack:.38,env1Decay:.5,env1Sustain:.76,env2Attack:.42,env2Sustain:.88,chorus:'both',chorusMix:.3,delayTime:.42,delayFeedback:.32},{dds1Wave:'triangle',dds2Wave:'saw',superMode:'half',detune:.18,cutoff:.72,env2Attack:.5,env2Sustain:.74,chorus:'II',delayTime:.58,delayFeedback:.4}]}},
 {name:'Super Wide Strings',data:{binaural:true,layers:[{superMode:'on',dds1Wave:'saw',detune:.45,pwDrift:.6,cutoff:.57,env1Attack:.3,env1Sustain:.85,env2Attack:.35,env2Sustain:.9,chorus:'both',chorusMix:.44,delayTime:.36},{superMode:'on',dds1Wave:'triangle',detune:.34,cutoff:.65,env1Attack:.4,env2Attack:.45,chorus:'II',chorusMix:.35,delayTime:.5}]}},
 {name:'Cross Mod Bell',data:{mode:'single',layers:[{dds1Wave:'sine',dds2Wave:'sine',dds2Mode:'ring',crossMod:.5,cutoff:.88,resonance:.24,env1Attack:.01,env1Decay:.48,env1Sustain:0,env2Attack:.002,env2Decay:.48,env2Sustain:0,delayTime:.25,delayFeedback:.3}]}},
 {name:'Super Mono Lead',data:{mode:'single',binaural:false,layers:[{voiceMode:'solo',superMode:'on',detune:.24,dds1Wave:'saw',dds2Wave:'pulse',mix:.27,cutoff:.68,resonance:.25,env2Attack:.01,env2Sustain:.82,lfo2Amount:.12,chorus:'I',chorusMix:.12}]}},
 {name:'Digital Pluck',data:{mode:'single',layers:[{dds1Wave:'altA',altA:13,dds2Wave:'sine',dds2Mode:'ring',crossMod:.34,cutoff:.78,env1Decay:.16,env1Sustain:0,env2Decay:.19,env2Sustain:0,delayTime:.3,delayFeedback:.22}]}},
 {name:'Layered Atmosphere',data:{mode:'dual',binaural:true,layers:[{superMode:'on',detune:.5,dds1Wave:'saw',env2Attack:.55,env2Sustain:.8,cutoff:.58,chorus:'both',delayTime:.52,delayFeedback:.48,delayFreeze:false},{superMode:'half',dds1Wave:'triangle',waveMod:.5,env2Attack:.7,env2Sustain:.72,cutoff:.72,chorus:'II',delayTime:.72,delayFeedback:.55}]}},
 {name:'Glass Keys',data:{binaural:false,layers:[{dds1Wave:'triangle',dds2Wave:'sine',mix:.42,cutoff:.88,env2Attack:.002,env2Decay:.22,env2Sustain:.32,chorus:'I',delayTime:.22,delayFeedback:.15}]}},
 {name:'Ring Bass',data:{mode:'single',layers:[{voiceMode:'solo',dds1Wave:'saw',dds2Wave:'square',dds2Octave:-1,dds2Mode:'ring',mix:.5,cutoff:.32,resonance:.4,drive:'1',env2Attack:.002,env2Decay:.3,env2Sustain:.75}]}},
 {name:'Binaural Drift',data:{layers:[{superMode:'on',detune:.55,lrPhase:.5,lfo1Rate:.23,lfo1Wave:'sine',waveMod:.25,env2Attack:.4,env2Sustain:.85,chorus:'II',delayTime:.61},{superMode:'on',detune:.42,lrPhase:.25,lfo1Rate:.16,lfo1Wave:'triangle',env2Attack:.5,env2Sustain:.8,chorus:'both',delayTime:.48}]}},
 {name:'Sequenced Layers',data:{mode:'dual',layers:[{seqEnabled:false,seqLength:16,seqSteps:[48,52,55,60,null,55,52,43,null,null,null,null,null,null,null,null]},{seqEnabled:false,seqLength:16,seqSteps:[36,null,43,null,48,null,43,null,40,null,48,null,52,null,48,null],dds1Wave:'triangle',cutoff:.45}]}}
].map(x=>({name:x.name,data:validate(x.data)}));
const KNOBS=[
 ['detune','DETUNE'],['pwDrift','PW DRIFT'],['waveMod','WAVE MOD'],['crossMod','CROSS MOD'],
 ['dds2Tune','DDS2 FINE',-7,7],['mix','MIX'],['hpf','HPF'],['cutoff','LPF CUTOFF'],['resonance','RESONANCE'],
 ['env1Attack','ATTACK'],['env1AttackHold','ATTACK HOLD'],['env1DecayHold','DECAY HOLD'],['env1Decay','DECAY'],['env1Sustain','SUSTAIN'],['env1Release','RELEASE'],
 ['env2Attack','ATTACK'],['env2DecayHold','DECAY HOLD'],['env2Decay','DECAY'],['env2Sustain','SUSTAIN'],['env2Release','RELEASE'],
 ['lfo1Rate','RATE'],['lfo1Delay','DELAY'],['lrPhase','LR PHASE'],
 ['lfo2Rate','RATE'],['lfo2Delay','DELAY'],['lfo2Amount','AMOUNT'],
 ['chorusMix','CHORUS MIX'],['delayTime','DELAY TIME'],['delayFeedback','FEEDBACK'],['delayMod','MODULATION']
];
class Super8App{
 constructor(){
  this.engine=new WorkletEngine(new URL('./engine/Super8Processor.js',import.meta.url).href,'super8-processor');
  this.patch=validate({});this.store=new PresetStore({key:'overture.udo-super-8.performances',version:1,validate});
  this.layerStores=[0,1].map(i=>new PresetStore({key:'overture.udo-super-8.layer.'+i,version:1,validate:cleanLayer}));
  this.active=0;this.ui={};this.build();this.buildHardwarePanel();this.presets.load('f:0');
  power('super8-power',()=>this.engine.start(),()=>{this.perf.flushPending();this.display.set('SUPER 8 READY','TWO FPGA-STYLE DDS CORES · STEREO OUTPUT');});
  this.postPatch();
 }
 p(){return this.patch.layers[this.active];}
 set(key,value){this.p()[key]=value;this.engine.post({t:'param',layer:this.active,key,value});this.syncHardware?.();}
 setGlobal(key,value){this.patch[key]=value;this.engine.post({t:'param',key,value});this.syncHardware?.();}
 postPatch(){this.engine.post({t:'patch',patch:this.patch});}
 makeKnobs(parent,defs){
  const row=el('div','pn-knobs',parent);
  defs.forEach(([key,label,min=0,max=1])=>{
   const item=knob(row,{label,min,max,value:this.p()[key],size:45,formatValue:v=>Number(v).toFixed(max>5?1:2),onChange:v=>this.set(key,v)});
   (this.ui[key]||=[]).push(item);
  });
 }
 makeSelect(parent,key,label,options,global=false){
  const val=global?this.patch[key]:this.p()[key];
  const item=select(parent,label,options,val,v=>{
   const value=typeof val==='number'?Number(v):v;
   if(global)this.setGlobal(key,value);else this.set(key,value);
  });
  (this.ui[key]||=[]).push({setValue:(v,silent)=>{item.setValue(v,true);},select:item.select});return item;
 }
 makeToggle(parent,key,label,global=false){
  const value=global?this.patch[key]:this.p()[key];
  const item=toggle(parent,label,value,v=>global?this.setGlobal(key,v):this.set(key,v));
  (this.ui[key]||=[]).push({setValue:(v)=>item.setValue(v,true)});return item;
 }
 build(){
  this.page=el('div','pn-page super8-page',document.getElementById('super8-root'));
  this.shell=el('main','pn-shell super8-shell',this.page);
  const head=el('header','super8-header',this.shell);
  const brand=el('div','super8-brand',head);el('div','super8-wordmark',brand,'UDO AUDIO');const model=el('div','super8-model',brand);el('strong','',model,'SUPER 8');el('span','',model,'16-VOICE ANALOG-HYBRID SYNTHESIZER');
  const right=el('div','super8-header-right',head);this.display=display(right);this.midi=el('div','pn-midi',right,'MIDI: searching…');
  const layerbar=el('div','super8-layerbar',this.shell);el('span','super8-layerbar__label',layerbar,'EDIT LAYER');
  this.layerButtons=[button(layerbar,'UPPER',()=>this.selectLayer(0),true),button(layerbar,'LOWER',()=>this.selectLayer(1))];
  this.makeSelect(layerbar,'mode','MODE',['single','dual','split'],true);
  this.makeToggle(layerbar,'binaural','BINAURAL',true);this.makeToggle(layerbar,'mpe','MPE',true);
  this.makeSelect(layerbar,'splitPoint','SPLIT POINT',Array.from({length:49},(_,i)=>String(48+i)),true);
  const rows=el('div','pn-rows',this.shell);
  const top=el('div','pn-row super8-top',rows);
  const d1=section(top,'DDS 1','FPGA OSCILLATOR · SUPER WAVE');
  this.makeSelect(d1.body,'dds1Wave','WAVE',['sine','saw','square','triangle','whiteNoise','altA','altB']);
  this.makeSelect(d1.body,'altA','WAVE A',Array.from({length:64},(_,i)=>String(i)));
  this.makeSelect(d1.body,'altB','WAVE B',Array.from({length:64},(_,i)=>String(i)));
  this.makeSelect(d1.body,'superMode','SUPER',['off','half','on']);
  this.makeKnobs(d1.body,[['detune','DETUNE'],['pwDrift','PW DRIFT'],['waveMod','WAVE MOD']]);
  const d2=section(top,'DDS 2','SECOND FPGA OSCILLATOR');
  this.makeSelect(d2.body,'dds2Wave','WAVE',['sine','saw','square','triangle','whiteNoise','pulse']);
  this.makeSelect(d2.body,'dds2Octave','RANGE',[-2,-1,0,1,2].map(String));
  this.makeSelect(d2.body,'dds2Mode','MODE',['normal','sync','ring']);
  this.makeSelect(d2.body,'subMode','SUB OSC',['off','sine','square']);
  this.makeKnobs(d2.body,[['dds2Tune','FINE',-7,7],['crossMod','CROSS MOD'],['subLevel','SUB LEVEL']]);
  const mod=section(top,'DDS MODULATOR','OSCILLATOR INTERACTION');
  this.makeSelect(mod.body,'waveModSource','WAVE SOURCE',['Manual','LFO 1','ENV 1']);
  this.makeToggle(mod.body,'lfo1HighFreq','LFO 1 HIGH FREQUENCY');
  this.makeToggle(mod.body,'lfo2Bender','BENDER MOD');
  this.makeToggle(mod.body,'lfo2Aftertouch','AFTERTOUCH MOD');
  const mixer=section(top,'MIXER / VCA','LAYER LEVEL AND PAN');
  this.makeKnobs(mixer.body,[['mix','DDS 1 / DDS 2'],['pan','LAYER PAN']]);
  this.makeKnobs(mixer.body,[['velocity','VELOCITY']]);
  knob(mixer.body,{label:'MASTER',min:0,max:1,value:this.patch.volume,size:45,onChange:v=>this.setGlobal('volume',v)});
  const mid=el('div','pn-row super8-middle',rows);
  const filt=section(mid,'ANALOG VCF','ONE-POLE HPF · FOUR-POLE LPF');
  this.makeKnobs(filt.body,[['hpf','HPF CUTOFF'],['cutoff','LPF CUTOFF'],['resonance','RESONANCE']]);
  this.makeSelect(filt.body,'drive','DRIVE',['off','1','2']);
  this.makeSelect(filt.body,'keyTrack','KEY TRACK',['off','half','on']);
  this.makeSelect(filt.body,'filterMod','ENV MOD',['env1','env2','both']);
  const e1=section(mid,'ENV 1','MODULATION ENVELOPE · HOLD / LOOP');
  this.makeKnobs(e1.body,[['env1Attack','ATTACK'],['env1AttackHold','ATTACK HOLD'],['env1DecayHold','DECAY HOLD'],['env1Decay','DECAY'],['env1Sustain','SUSTAIN'],['env1Release','RELEASE']]);
  this.makeToggle(e1.body,'env1Loop','LOOP');
  const e2=section(mid,'ENV 2','AMPLIFIER ENVELOPE');
  this.makeKnobs(e2.body,[['env2Attack','ATTACK'],['env2DecayHold','DECAY HOLD'],['env2Decay','DECAY'],['env2Sustain','SUSTAIN'],['env2Release','RELEASE']]);
  const low=el('div','pn-row super8-lower',rows);
  const lfo=section(low,'LFO 1 / LFO 2','MODULATION AND PERFORMANCE');
  this.makeSelect(lfo.body,'lfo1Wave','LFO 1 SHAPE',['sine','triangle','saw','reverseSaw','square','random']);
  this.makeSelect(lfo.body,'lfo1Mode','LFO 1 MODE',['reset','once','free']);
  this.makeKnobs(lfo.body,[['lfo1Rate','LFO 1 RATE'],['lfo1Delay','LFO 1 DELAY'],['lrPhase','LR PHASE']]);
  this.makeSelect(lfo.body,'lfo2Wave','LFO 2 SHAPE',['sine','triangle','saw','reverseSaw','square']);
  this.makeKnobs(lfo.body,[['lfo2Rate','LFO 2 RATE'],['lfo2Delay','LFO 2 DELAY'],['lfo2Amount','LFO 2 AMOUNT']]);
  this.makeSelect(lfo.body,'lfo2Destination','LFO 2 DEST',['DDS 1 pitch','DDS 2 pitch','Both pitch','Filter','Amp']);
  const fx=section(low,'CHORUS / DELAY','INDEPENDENT EFFECTS PER LAYER');
  this.makeSelect(fx.body,'chorus','CHORUS MODE',['off','I','II','both']);
  this.makeKnobs(fx.body,[['chorusMix','CHORUS MIX'],['delayTime','DELAY TIME'],['delayFeedback','FEEDBACK'],['delayMod','MODULATION']]);
  this.makeToggle(fx.body,'delayFreeze','DELAY FREEZE');this.makeToggle(fx.body,'delaySync','TEMPO SYNC');
  this.buildPerformanceControls(low);
  this.buildMatrix(rows);
  this.buildSequencer(rows);
  this.buildArp(rows);
  this.buildWaves(rows);
  this.buildLayerPresets(rows);
  const perf=section(rows,'PERFORMANCE MEMORY','ORIGINAL OVERTURE PERFORMANCES');
  this.presets=presetBar(perf.body,{factory:FACTORY,store:this.store,display:this.display,filename:'udo-super-8-performance',panic:()=>this.perf?.allOff(),apply:(data,name)=>{this.patch=validate(data);this.selectLayer(this.patch.activeLayer||0);this.refresh();this.display.set(name.toUpperCase(),'OVERTURE PERFORMANCE');this.displayHardwarePreset?.(name);const saved=this.store.items.find(item=>item.name===name);const factoryIndex=FACTORY.findIndex(item=>item.name===name);this.refreshHardwarePresetList?.(saved?'u:'+saved.id:'f:'+Math.max(0,factoryIndex));this.syncHardware?.();},capture:()=>clone(this.patch)});
  footer(this.page,'UDO AUDIO SUPER 8 · DUAL DDS · SEVEN-OSCILLATOR SUPER MODE · TRUE BINAURAL STEREO · TWO LAYERS · OVERTURE SOFTWARE MODEL');
  this.buildKeyboard();
 }
 buildPerformanceControls(parent){
  const perf=section(parent,'PERFORMANCE CONTROLS','TWO-AXIS BENDER · TRANSPOSE · PORTAMENTO');
  const grid=el('div','super8-bender',perf.body);
  [['benderX','HORIZONTAL · PITCH'],['benderY','VERTICAL · MODULATION']].forEach(([key,label])=>{
   const wrap=el('label','super8-bender__axis',grid);el('span','',wrap,label);
   const input=el('input','',wrap);input.type='range';input.min='-1';input.max='1';input.step='.001';input.value=String(this.patch[key]);
   input.addEventListener('input',()=>{this.patch[key]=Number(input.value);this.engine.post({t:'bendAxis',x:this.patch.benderX,y:this.patch.benderY});});
   registerMidiTarget(input,{id:'super8:'+key,label,get:()=>this.patch[key]/2+.5,set:v=>{input.value=String(v*2-1);this.patch[key]=v*2-1;this.engine.post({t:'bendAxis',x:this.patch.benderX,y:this.patch.benderY});}});
  });
  this.makeSelect(perf.body,'voiceMode','VOICE ASSIGN',['solo','legato','poly1','poly2']);
  this.makeSelect(perf.body,'unison','UNISON',['off','half','all','octave','fifth']);
  this.makeKnobs(perf.body,[['portamento','PORTAMENTO'],['transpose','TRANSPOSE',-24,24],['bendRange','BEND RANGE',1,12]]);
  this.makeToggle(perf.body,'velocity','VELOCITY RESPONSE');
 }
 buildMatrix(rows){
  const sec=section(rows,'8 × 8 MODULATION MATRIX','BUTTONS 1–8: SOURCES · A–H: DESTINATIONS');
  const labels=el('div','super8-controls',sec.body);['1 DDS 2','2 LFO 2','3 ENV 1','4 VELOCITY','5 AFTERTOUCH','6 EXPRESSION','7 BENDER','8 NOTE'].forEach(x=>el('span','super8-matrix__legend',labels,x));
  const grid=el('div','super8-matrix',sec.body);this.matrixCells=[];
  for(let s=0;s<8;s++)for(let d=0;d<8;d++){
   const i=s*8+d,b=el('button','super8-matrix__cell',grid,String.fromCharCode(65+d));b.type='button';b.title=SOURCE_NAMES[s]+' → '+DEST_NAMES[d];
   b.setAttribute('aria-label',b.title+' modulation amount');
   b.addEventListener('click',()=>{const a=this.p().modMatrix[i];this.p().modMatrix[i]=a===0?.6:a>0?-.6:0;this.updateMatrix();this.engine.post({t:'param',layer:this.active,key:'modMatrix',value:this.p().modMatrix});});
   this.matrixCells.push(b);
  }
  this.updateMatrix();
 }
 updateMatrix(){this.matrixCells?.forEach((b,i)=>{const v=this.p().modMatrix[i]||0;b.classList.toggle('is-positive',v>0);b.classList.toggle('is-negative',v<0);b.textContent=v>0?'+':v<0?'−':String.fromCharCode(65+i%8);});}
 buildSequencer(rows){
  const sec=section(rows,'64-STEP SEQUENCER','FOUR PAGES OF SIXTEEN · STORED PER LAYER');
  const controls=el('div','super8-controls',sec.body);
  this.makeSelect(controls,'seqLength','LENGTH',Array.from({length:64},(_,i)=>String(i+1)));
  this.makeSelect(controls,'seqMode','EDIT MODE',['step','slide','accent','rest','length']);
  this.makeKnobs(sec.body,[['seqBpm','TEMPO',40,240],['seqSwing','SWING']]);
  const pages=el('div','pn-buttons',sec.body);this.seqPageButtons=[];
  for(let i=0;i<4;i++){this.seqPageButtons.push(button(pages,'PAGE '+(i+1),()=>{this.seqPage=i;this.updateSeq();this.seqPageButtons.forEach((b,j)=>b.classList.toggle('lit',j===i));},i===0));}
  const steps=el('div','super8-seq__steps',sec.body);this.seqButtons=[];
  for(let i=0;i<16;i++){const b=el('button','super8-seq__step',steps,String(i+1));b.type='button';b.addEventListener('click',()=>this.toggleSeqStep(i));this.seqButtons.push(b);}
  const btns=el('div','pn-buttons',sec.body);button(btns,'PLAY',()=>{this.set('seqEnabled',true);this.engine.post({t:'transport',layer:this.active,play:true});});button(btns,'STOP',()=>{this.set('seqEnabled',false);this.engine.post({t:'transport',layer:this.active,play:false});});
  this.seqPage=0;this.updateSeq();
 }
 toggleSeqStep(i){
  const p=this.p(),step=this.seqPage*16+i,mode=p.seqMode,v=p.seqSteps[step];
  if(mode==='slide'){
   if(v===null||v===undefined)p.seqSteps[step]=48+i;
   p.seqSlides[step]=!p.seqSlides[step];
  }else if(mode==='accent'){
   if(v===null||v===undefined)p.seqSteps[step]=48+i;
   p.seqAccents[step]=!p.seqAccents[step];
  }else if(mode==='rest'){
   p.seqSteps[step]=null;p.seqSlides[step]=false;p.seqAccents[step]=false;
  }else if(mode==='length'){
   const lengths=[.25,.375,.5,.625,.75,.875,1],current=Number(p.seqGates[step]??.75);
   p.seqGates[step]=lengths[(Math.max(0,lengths.indexOf(current))+1)%lengths.length];
  }else{
   if(v===null||v===undefined)p.seqSteps[step]=48+i;
   else {p.seqSteps[step]=null;p.seqSlides[step]=false;p.seqAccents[step]=false;}
  }
  ['seqSteps','seqSlides','seqAccents','seqGates'].forEach(key=>this.engine.post({t:'param',layer:this.active,key,value:p[key]}));
  this.updateSeq();this.renderHardwareSeq?.();
 }
 updateSeq(){this.seqButtons?.forEach((b,i)=>{
  const step=this.seqPage*16+i,v=this.p().seqSteps[step],p=this.p();
  b.classList.toggle('is-on',v!==null&&v!==undefined);
  b.classList.toggle('is-slide',!!p.seqSlides[step]);b.classList.toggle('is-accent',!!p.seqAccents[step]);
  b.dataset.gate=String(p.seqGates[step]);b.title='Step '+(step+1)+' · '+(v===null||v===undefined?'REST':'NOTE '+v)+(p.seqSlides[step]?' · SLIDE':'')+(p.seqAccents[step]?' · ACCENT':'')+' · GATE '+Math.round(p.seqGates[step]*100)+'%';
  b.textContent=String(i+1);
 });}
 buildArp(rows){
  const sec=section(rows,'ARPEGGIATOR','INDEPENDENT FOR UPPER AND LOWER LAYERS');
  this.makeToggle(sec.body,'arpEnabled','ARP ON');this.makeSelect(sec.body,'arpMode','MODE',['up','down','upDown','random','sequencer']);this.makeSelect(sec.body,'arpDivision','CLOCK',['1','2','4','8','16']);this.makeKnobs(sec.body,[['arpRange','RANGE',1,4],['arpSwing','SWING']]);this.makeToggle(sec.body,'arpHold','HOLD');
 }
 buildWaves(rows){
  const sec=section(rows,'ALTERNATIVE WAVEFORMS','LOAD USER WAVETABLE CYCLES · UP TO 64 SLOTS');
  const input=el('input','',sec.body);input.type='file';input.multiple=true;input.accept='.wav,audio/wav';
  input.addEventListener('change',async()=>{try{if(!this.engine.ctx)throw new Error('Power on audio first.');const waves=[];for(const f of [...input.files].slice(0,64)){const decoded=await this.engine.ctx.decodeAudioData(await f.arrayBuffer());const data=decoded.getChannelData(0);if(data.length<64||data.length>65536)throw new Error(f.name+' is not a supported single-cycle file.');waves.push(Array.from(data));}this.engine.post({t:'waves',layer:this.active,waves});this.display.flash(waves.length+' WAVES LOADED');}catch(e){this.display.flash('WAVE IMPORT FAILED');alert(e.message);}});
 }
 buildLayerPresets(rows){
  const sec=section(rows,'LAYER PATCH MEMORY','SAVE EACH LAYER SEPARATELY');
  const controls=el('div','super8-controls',sec.body);
  this.layerSelect=el('select','',controls);
  this.layerSelect.addEventListener('change',()=>{const item=this.layerStores[this.active].get(this.layerSelect.value);if(item){this.patch.layers[this.active]=cleanLayer(item.data);this.postPatch();this.refresh();}});
  button(controls,'SAVE LAYER',()=>{const name=prompt('Name this layer patch','My Super 8 patch');if(name===null)return;const item=this.layerStores[this.active].save(name,clone(this.p()));this.refreshLayerSelect(item.id);this.display.flash('LAYER PATCH SAVED');});
  button(controls,'DELETE PATCH',()=>{const id=this.layerSelect.value;if(!id)return;this.layerStores[this.active].remove(id);this.refreshLayerSelect();});
  this.refreshLayerSelect();
 }
 refreshLayerSelect(selected){
  if(!this.layerSelect)return;this.layerSelect.replaceChildren();
  this.layerStores[this.active].items.forEach(item=>{const o=el('option','',this.layerSelect,item.name);o.value=item.id;});
  if(selected)this.layerSelect.value=selected;
 }
 selectLayer(index){
  this.active=index?1:0;this.patch.activeLayer=this.active;
  this.layerButtons?.forEach((b,i)=>b.classList.toggle('lit',i===this.active));this.syncHardware?.();
  this.ui=Object.fromEntries(Object.entries(this.ui).map(([k,v])=>[k,v]));
  this.refresh();this.refreshLayerSelect();
 }
 refresh(){
  this.ui && Object.entries(this.ui).forEach(([key,items])=>{
   const value=key in this.p()?this.p()[key]:this.patch[key];
   if(value===undefined)return;
   items.forEach(c=>{if(c?.setValue)c.setValue(value,true);});
  });
  this.updateMatrix();this.updateSeq();
  this.engine.post({t:'patch',patch:this.patch});
 }
 buildKeyboard(){
  this.perf=performance(this.shell,{notes:NOTES,octaves:5,startOctave:1,wheels:false,started:()=>this.engine.started,midiStatusEl:this.midi,handlers:{
   noteOn:(n,v,source,channel)=>this.engine.post({t:'noteOn',note:n,vel:v,channel,source}),noteOff:(n,source,channel)=>this.engine.post({t:'noteOff',note:n,channel,source}),
   bend:(v,channel)=>this.engine.post({t:'bend',value:v,channel}),mod:v=>this.engine.setModWheel(v),aftertouch:(v,channel)=>this.engine.post({t:'at',value:v,channel}),expression:(v,channel)=>this.engine.post({t:'expression',value:v,channel}),
   polyAftertouch:(n,v,channel)=>this.engine.post({t:'polyAt',note:n,value:v,channel}),sustain:d=>this.engine.setSustain(d),allOff:()=>this.engine.allNotesOff(),
   program:p=>this.presets.load('f:'+p%FACTORY.length),clock:()=>this.engine.post({t:'clock'}),start:()=>this.engine.post({t:'transport',layer:this.active,play:true}),continue:()=>this.engine.post({t:'transport',layer:this.active,play:true}),stop:()=>this.engine.post({t:'transport',layer:this.active,play:false}),cc:(cc,v,channel)=>{if(cc===7)this.setGlobal('volume',v/127);if(cc===11)this.engine.post({t:'expression',value:v/127,channel});if(cc===74)this.engine.post({t:'mpeSlide',value:v/127,channel});}
  }});
 }

 buildHardwarePanel(){
  this.page.classList.add('hp-legacy-hidden');
  const root=document.getElementById('super8-root');
  const hw=createHardwareSurface(root,{id:'udo-super-8',width:1680,height:770,skin:'super8',programLabel:'SUPER 8 · INITIAL PERFORMANCE'});
  this.hw=hw;const p=hw.instrument;
  p.style.cssText+=';--hp-ink:#30383d;--hp-muted:#67737a;--hp-line:#9ba5aa;--hp-section:#d9dfe2;--hp-head:#c4cdd1;--hp-control:#edf0f1;--hp-accent:#d65b3c;--hp-display:#f2a183;background:linear-gradient(180deg,#e5e8e9 0%,#cbd2d6 50%,#aeb8be);border:8px solid #727b80;border-radius:4px;box-shadow:0 25px 60px #1a232955,inset 0 1px #fff';
  this.hwControls={knobs:[],faders:[],buttons:[],selects:[],all:[]};
  const remember=(type,key,control)=>{this.hwControls[type].push({key,control});this.hwControls.all.push(control);return control;};
  const panelSection=(x,y,w,h,title,sub='')=>addSection(p,{x,y,w,h,title,sub});
  const knob=(key,label,x,y,opts={})=>{
   const layer=opts.global?false:true,value=layer?this.p()[key]:this.patch[key];
   const control=addKnob(p,{x,y,label,min:opts.min??0,max:opts.max??1,value,step:opts.step,midiId:'SUPER8:'+(layer?'L'+this.active+':':'G:')+key,group:opts.group||'SYNTHESIS',size:opts.size||54,formatValue:v=>opts.max>10?String(Number(v).toFixed(1)):opts.max>5?String(Math.round(v)):Number(v).toFixed(2),onChange:v=>layer?this.set(key,v):this.setGlobal(key,v)});
   this.hwKnobs.push({key,control,global:!layer});return remember('knobs',key,control);
  };
  const fader=(key,label,x,y,opts={})=>{
   const control=addFader(p,{x,y,label,min:opts.min??0,max:opts.max??1,value:this.p()[key],height:opts.height||82,width:opts.width||20,midiId:'SUPER8:L'+this.active+':'+key,formatValue:v=>Number(v).toFixed(2),onChange:v=>this.set(key,v)});
   this.hwFaders.push({key,control});return remember('faders',key,control);
  };
  const btn=(key,label,x,y,opts={})=>{
   const global=!!opts.global;
   const control=addButton(p,{x,y,label,value:global?this.patch[key]:this.p()[key],size:opts.size||23,led:opts.led||'red',group:opts.group||'SYNTHESIS',midiId:'SUPER8:'+(global?'G:':'L'+this.active+':')+key,onChange:v=>global?this.setGlobal(key,v):this.set(key,v)});
   this.hwButtons.push({key,control,global});return remember('buttons',key,control);
  };
  const sel=(key,label,x,y,options,opts={})=>{
   const global=!!opts.global,current=global?this.patch[key]:this.p()[key],width=opts.width||91;
   const wrap=document.createElement('label');wrap.className='hp-native-select hp-super8-select';
   wrap.style.cssText='position:absolute;left:'+(x-width/2)+'px;top:'+y+'px;width:'+width+'px;display:grid;gap:3px;text-align:center;color:var(--hp-ink);font:700 8px Saira,sans-serif;letter-spacing:.06em;z-index:6';
   const title=document.createElement('span');title.textContent=label;
   const select=document.createElement('select');select.setAttribute('aria-label',label);
   select.style.cssText='width:100%;height:23px;background:var(--hp-control);color:var(--hp-ink);border:1px solid var(--hp-line);border-radius:2px;padding:2px 4px;font:8px DM Mono,monospace';
   options.forEach(v=>{const o=document.createElement('option');o.value=String(v);o.textContent=String(v).toUpperCase();select.appendChild(o);});
   select.value=String(current);
   select.addEventListener('change',()=>{const n=typeof current==='number'?Number(select.value):select.value;global?this.setGlobal(key,n):this.set(key,n);});
   wrap.append(title,select);p.appendChild(wrap);
   const control={el:select,getValue:()=>global?this.patch[key]:this.p()[key],setValue:v=>{select.value=String(v);},_oiMidi:{id:'SUPER8:'+(global?'G:':'L'+this.active+':')+key,label,group:opts.group||'SYNTHESIS',get:()=>{const values=options.map(String),i=values.indexOf(String(global?this.patch[key]:this.p()[key]));return Math.max(0,i)/(values.length-1||1);},set:t=>{const i=Math.round(Math.max(0,Math.min(1,t))*(options.length-1));const n=options[i];global?this.setGlobal(key,n):this.set(key,n);}}};
   this.hwSelects.push({key,select,global});return remember('selects',key,control);
  };
  const range=(key,label,x,y,width=120,opts={})=>{
   const wrap=document.createElement('label');wrap.className='hp-super8-range';
   wrap.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;width:'+width+'px;display:grid;gap:4px;z-index:6;color:var(--hp-ink);font:700 8px Saira,sans-serif;letter-spacing:.04em';
   const caption=document.createElement('span');caption.textContent=label;
   const input=document.createElement('input');input.type='range';input.min=String(opts.min??0);input.max=String(opts.max??1);input.step=String(opts.step??.001);input.value=String(opts.global?this.patch[key]:this.p()[key]);input.setAttribute('aria-label',label);
   input.addEventListener('input',()=>{const v=Number(input.value);opts.global?this.setGlobal(key,v):this.set(key,v);});
   wrap.append(caption,input);p.appendChild(wrap);
   const control={el:input,setValue:v=>{input.value=String(v);},_oiMidi:{id:'SUPER8:'+(opts.global?'G:':'L'+this.active+':')+key,label,group:opts.group||'PERFORMANCE',get:()=>{const min=Number(input.min),max=Number(input.max);return (Number(input.value)-min)/(max-min||1);},set:t=>{const min=Number(input.min),max=Number(input.max),v=min+Math.max(0,Math.min(1,t))*(max-min);input.value=String(v);opts.global?this.setGlobal(key,v):this.set(key,v);}}};
   if(!opts.global)this.hwRanges.push({key,control});return remember('faders',key,control);
  };
  this.hwKnobs=[];this.hwFaders=[];this.hwButtons=[];this.hwSelects=[];this.hwRanges=[];
  // Header carries the actual UDO logo asset, patch display and status lights.
  panelSection(15,12,1650,50,'UDO AUDIO · SUPER 8','16-VOICE · TWO-PART BINAURAL ANALOG-HYBRID KEYBOARD');
  const logo=document.createElement('img');logo.src='/ui/Logos/UDO_logo.png';logo.alt='UDO Audio';logo.draggable=false;
  logo.style.cssText='position:absolute;left:27px;top:27px;width:122px;height:28px;object-fit:contain;z-index:7';p.appendChild(logo);
  this.hwDisplay=addDisplay(p,{x:1115,y:20,w:225,h:36,brand:'PERFORMANCE / PROGRAM',skin:'amber'});this.hwDisplay.set('P 001','OVERTURE PERFORMANCE');
  addButton(p,{x:1550,y:36,label:'POWER',value:false,size:25,group:'GLOBAL',onChange:v=>{if(v)document.getElementById('super8-power').click();}});
  // Top strip mirrors the silver Super 8's real left-to-right signal path.
  panelSection(15,72,97,226,'MASTER','VOLUME / DISTORTION');
  knob('volume','MASTER VOLUME',63,150,{global:true,group:'MASTER',size:63});
  knob('distortion','DISTORTION',63,235,{global:true,group:'MASTER',size:54});
  panelSection(116,72,140,226,'LFO 1','RATE / DEPTH / SHAPE');
  knob('lfo1Rate','RATE',158,150,{group:'LFO 1'});knob('lfo1Delay','DELAY',215,150,{group:'LFO 1'});
  sel('lfo1Wave','WAVE',185,205,['sine','triangle','saw','reverseSaw','square'],{width:112,group:'LFO 1'});
  btn('lfo1HighFreq','HIGH FREQ',185,269,{group:'LFO 1',size:22});
  panelSection(260,72,150,226,'DDS MODULATOR','WAVE MORPH / DESTINATION');
  sel('waveModSource','SOURCE',335,114,['Manual','LFO 1','ENV 1'],{width:104,group:'DDS MODULATOR'});
  knob('waveMod','WAVE MOD',335,190,{group:'DDS MODULATOR',size:60});
  btn('lfo2Bender','BENDER',305,268,{group:'DDS MODULATOR'});btn('lfo2Aftertouch','AFTERTOUCH',370,268,{group:'DDS MODULATOR'});
  panelSection(414,72,202,226,'DDS 1','FPGA OSCILLATOR · SUPER / ALTERNATIVE WAVES');
  sel('dds1Wave','WAVE',485,114,['sine','saw','square','triangle','whiteNoise','altA','altB'],{width:120,group:'DDS 1'});
  sel('altA','WAVE A',462,161,Array.from({length:64},(_,i)=>i),{width:82,group:'DDS 1'});
  sel('altB','WAVE B',562,161,Array.from({length:64},(_,i)=>i),{width:82,group:'DDS 1'});
  sel('superMode','SUPER MODE',470,218,['off','half','on'],{width:100,group:'DDS 1'});knob('detune','DETUNE',550,250,{group:'DDS 1'});
  knob('pwDrift','PW DRIFT',605,250,{group:'DDS 1',size:51});
  panelSection(620,72,204,226,'DDS 2','OSCILLATOR · SUB / CROSS MOD / SYNC');
  sel('dds2Wave','WAVE',685,114,['sine','saw','square','triangle','whiteNoise','pulse'],{width:112,group:'DDS 2'});
  sel('dds2Octave','OCTAVE',782,114,[-2,-1,0,1,2],{width:72,group:'DDS 2'});
  sel('dds2Mode','MODE',685,161,['normal','sync','ring'],{width:112,group:'DDS 2'});
  sel('subMode','SUB OSC',782,161,['off','sine','square'],{width:72,group:'DDS 2'});
  knob('dds2Tune','FINE',670,250,{min:-7,max:7,step:.01,group:'DDS 2'});
  knob('crossMod','CROSS MOD',735,250,{group:'DDS 2'});
  knob('subLevel','SUB LEVEL',800,250,{group:'DDS 2',size:51});
  panelSection(828,72,112,226,'MIXER','DDS 1 / DDS 2');
  fader('mix','DDS BALANCE',854,142,{height:95,width:18});fader('pan','PAN',910,142,{height:95,width:18});
  panelSection(944,72,206,226,'VCF','ANALOG HPF / 4-POLE LPF');
  knob('hpf','HPF',980,172,{group:'VCF',size:55});knob('cutoff','LPF CUTOFF',1045,172,{group:'VCF',size:55});knob('resonance','RESONANCE',1110,172,{group:'VCF',size:55});
  sel('drive','DRIVE',982,226,['off','1','2'],{width:82,group:'VCF'});sel('keyTrack','KEY TRACK',1080,226,['off','half','on'],{width:92,group:'VCF'});sel('filterMod','ENV MOD',1110,265,['env1','env2','both'],{width:85,group:'VCF'});
  panelSection(1154,72,103,226,'VCA','LEVEL / VELOCITY');
  knob('velocity','VELOCITY',1205,160,{group:'VCA',size:60});
  panelSection(1261,72,220,226,'ENVELOPES','ENVELOPE 1 MODULATION / ENVELOPE 2 AMP');
  addLabel(p,1310,111,'ENV 1');addLabel(p,1426,111,'ENV 2');
  const env1=[['env1Attack','ATK'],['env1AttackHold','A-HOLD'],['env1DecayHold','D-HOLD'],['env1Decay','DEC'],['env1Sustain','SUS'],['env1Release','REL']];
  const env2=[['env2Attack','ATK'],['env2DecayHold','D-HOLD'],['env2Decay','DEC'],['env2Sustain','SUS'],['env2Release','REL']];
  env1.forEach(([key,label],i)=>knob(key,label,1278+(i%3)*39,174+Math.floor(i/3)*67,{size:36,group:'ENVELOPE 1'}));
  env2.forEach(([key,label],i)=>knob(key,label,1390+(i%3)*39,174+Math.floor(i/3)*67,{size:36,group:'ENVELOPE 2'}));
  addButton(p,{x:1315,y:283,label:'',value:!!this.p().env1Loop,size:17,group:'ENVELOPE 1',onChange:v=>this.set('env1Loop',v)});addLabel(p,1370,286,'ENV 1 LOOP');
  panelSection(1485,72,180,226,'EFFECTS','STEREO CHORUS / DELAY');
  sel('chorus','CHORUS',1530,114,['off','I','II','both'],{width:95,group:'EFFECTS'});
  knob('chorusMix','CHORUS MIX',1525,188,{size:44,group:'EFFECTS'});knob('delayTime','DELAY TIME',1605,188,{size:44,group:'EFFECTS'});
  knob('delayFeedback','FEEDBACK',1525,245,{size:39,group:'EFFECTS'});knob('delayMod','DELAY MOD',1605,245,{size:39,group:'EFFECTS'});
  btn('delaySync','SYNC',1535,284,{group:'EFFECTS',size:17});btn('delayFreeze','FREEZE',1618,284,{group:'EFFECTS',size:17});
  // Second hardware row: mode, layers, sequencer, and arpeggiator.
  panelSection(15,310,1650,128,'LAYER / PERFORMANCE / STEP CONTROL','UPPER AND LOWER PARTS · 64-STEPS PER PART · BINAURAL VOICE MODE');
  addLabel(p,85,345,'EDIT PART');
  const upper=addButton(p,{x:55,y:382,label:'UPPER',value:this.active===0,size:27,group:'LAYER',onChange:()=>this.selectLayer(0)});
  const lower=addButton(p,{x:125,y:382,label:'LOWER',value:this.active===1,size:27,group:'LAYER',onChange:()=>this.selectLayer(1)});
  this.layerButtonsHardware=[upper,lower];
  sel('mode','VOICE MODE',260,345,['single','dual','split'],{global:true,width:110,group:'GLOBAL'});
  btn('binaural','BINAURAL',395,380,{global:true,group:'GLOBAL'});btn('mpe','MPE',485,380,{global:true,group:'GLOBAL'});
  sel('splitPoint','SPLIT POINT',580,345,Array.from({length:49},(_,i)=>48+i),{global:true,width:112,group:'GLOBAL'});
  sel('voiceMode','VOICE ASSIGN',725,345,['solo','legato','poly1','poly2'],{width:112,group:'PERFORMANCE'});
  sel('unison','UNISON',854,345,['off','half','all','octave','fifth'],{width:100,group:'PERFORMANCE'});
  knob('portamento','PORTAMENTO',990,380,{size:49,group:'PERFORMANCE'});
  knob('transpose','TRANSPOSE',1065,380,{min:-24,max:24,step:1,size:49,group:'PERFORMANCE'});
  knob('bendRange','BEND RANGE',1140,380,{min:1,max:12,step:1,size:49,group:'PERFORMANCE'});
  sel('arpMode','ARP MODE',1260,345,['up','down','upDown','random','sequencer'],{width:105,group:'ARPEGGIATOR'});
  sel('arpDivision','ARP CLOCK',1380,345,['1','2','4','8','16'],{width:96,group:'ARPEGGIATOR'});
  knob('arpRange','ARP RANGE',1510,380,{min:1,max:4,step:1,size:50,group:'ARPEGGIATOR'});
  knob('arpSwing','ARP SWING',1590,380,{size:50,group:'ARPEGGIATOR'});
  btn('arpEnabled','ARP ON',1460,420,{group:'ARPEGGIATOR'});
  btn('arpHold','HOLD',1550,420,{group:'ARPEGGIATOR'});
  // Sequencer: four pages × 16 steps. Step values are actual MIDI note numbers.
  panelSection(15,448,1650,84,'64-STEP SEQUENCER','FOUR PAGES OF 16 · STORED PER PART');
  this.hwSeqPage=0;
  this.hwSeqPageButtons=[];
  ['1–16','17–32','33–48','49–64'].forEach((label,i)=>{
   const control=addButton(p,{x:74+i*54,y:480,label,value:i===0,size:23,group:'SEQUENCER',onChange:()=>{this.hwSeqPage=i;this.hwSeqPageButtons.forEach((c,j)=>c.setValue(j===i,true));this.renderHardwareSeq();}});
   this.hwSeqPageButtons.push(control);
  });
  sel('seqLength','SEQ LENGTH',420,461,Array.from({length:64},(_,i)=>i+1),{width:96,group:'SEQUENCER'});
  knob('seqBpm','TEMPO',560,495,{min:40,max:240,step:1,size:47,group:'SEQUENCER'});
  knob('seqSwing','SWING',640,495,{size:47,group:'SEQUENCER'});
  sel('seqMode','STEP MODE',744,461,['step','slide','accent','rest','length'],{width:110,group:'SEQUENCER'});
  btn('seqEnabled','PLAY',906,480,{group:'SEQUENCER'});
  this.hwSeqButtons=[];
  for(let i=0;i<16;i++){
   const step=addButton(p,{x:1040+i*37,y:480,label:String(i+1),size:25,value:this.p().seqSteps[i]!==null,group:'SEQUENCER',onChange:()=>{this.toggleSeqStep(i);this.renderHardwareSeq();}});
   this.hwSeqButtons.push(step);
  }
  // Lower-left controller block and a continuous 61-note Fatar keybed.
  panelSection(15,542,230,212,'LFO 2 / BENDER','MODULATION / TWO-AXIS CONTROL');
  knob('lfo2Rate','RATE',58,606,{size:42,group:'LFO 2'});knob('lfo2Delay','DELAY',130,606,{size:42,group:'LFO 2'});knob('lfo2Amount','AMOUNT',202,606,{size:42,group:'LFO 2'});
  sel('lfo2Wave','LFO 2 SHAPE',70,658,['sine','triangle','saw','reverseSaw','square'],{width:92,group:'LFO 2'});
  sel('lfo2Destination','DESTINATION',174,658,['DDS 1 pitch','DDS 2 pitch','Both pitch','Filter','Amp'],{width:108,group:'LFO 2'});
  // The Super 8's bender is a two-axis touch surface, not two independent sliders.
  const pad=document.createElement('div');pad.className='hp-super8-bender-pad';pad.tabIndex=0;pad.setAttribute('role','group');pad.setAttribute('aria-label','Two-axis bender: horizontal pitch, vertical modulation');
  const padCross=document.createElement('i');padCross.className='hp-super8-bender-cross';
  const padDot=document.createElement('i');padDot.className='hp-super8-bender-dot';pad.append(padCross,padDot);
  const padCaption=document.createElement('span');padCaption.className='hp-super8-bender-caption';padCaption.textContent='X · PITCH    Y · MOD';
  pad.style.cssText='position:absolute;left:61px;top:705px;width:128px;height:42px;z-index:8;touch-action:none';
  p.appendChild(pad);p.appendChild(padCaption);
  padCaption.style.cssText='position:absolute;left:80px;top:747px;width:100px;text-align:center;font:6px DM Mono,monospace;color:var(--hp-muted)';
  const renderBender=()=>{padDot.style.left=((this.patch.benderX+1)*50)+'%';padDot.style.top=((1-this.patch.benderY)*50)+'%';pad.setAttribute('aria-label','Bender X '+this.patch.benderX.toFixed(2)+', Y '+this.patch.benderY.toFixed(2));};
  const updateBender=(e)=>{const rect=pad.getBoundingClientRect();this.patch.benderX=Math.max(-1,Math.min(1,((e.clientX-rect.left)/(rect.width||1))*2-1));this.patch.benderY=Math.max(-1,Math.min(1,1-((e.clientY-rect.top)/(rect.height||1))*2));renderBender();this.engine.post({t:'bendAxis',x:this.patch.benderX,y:this.patch.benderY});};
  let benderPointer=null;
  pad.addEventListener('pointerdown',e=>{benderPointer=e.pointerId;pad.setPointerCapture?.(e.pointerId);updateBender(e);e.preventDefault();});
  pad.addEventListener('pointermove',e=>{if(e.pointerId===benderPointer)updateBender(e);});
  const finishBender=e=>{if(e.pointerId===benderPointer)benderPointer=null;};pad.addEventListener('pointerup',finishBender);pad.addEventListener('pointercancel',finishBender);
  pad.addEventListener('keydown',e=>{const step=e.shiftKey?.2:.05;if(e.key==='ArrowLeft')this.patch.benderX-=step;else if(e.key==='ArrowRight')this.patch.benderX+=step;else if(e.key==='ArrowUp')this.patch.benderY+=step;else if(e.key==='ArrowDown')this.patch.benderY-=step;else return;this.patch.benderX=Math.max(-1,Math.min(1,this.patch.benderX));this.patch.benderY=Math.max(-1,Math.min(1,this.patch.benderY));renderBender();this.engine.post({t:'bendAxis',x:this.patch.benderX,y:this.patch.benderY});e.preventDefault();});
  this.hwBenderPad=pad;this.renderHardwareBender=renderBender;renderBender();
  addKeyboard(p,{x:255,y:548,w:1395,h:202,firstNote:36,count:61,keyColor:'amber',onNoteOn:(n,v)=>this.engine.post({t:'noteOn',note:n,vel:v,source:'ui'}),onNoteOff:n=>this.engine.post({t:'noteOff',note:n,source:'ui'}),onAftertouch:(n,v)=>this.engine.post({t:'polyAt',note:n,value:v,channel:1})});
  // Preset and layer-memory controls remain in the visible front panel.
  const hardwareFooter=document.createElement('div');hardwareFooter.className='hp-super8-hardware-footer';
  hardwareFooter.style.cssText='display:flex;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap;width:100%;padding:6px 9px;border:1px solid #9aa4a9;border-radius:3px;background:linear-gradient(#d7dde0,#bac3c8);box-shadow:0 2px 5px #0002';
  this.hw.stage.appendChild(hardwareFooter);
  this.hwPresets=document.createElement('select');this.hwPresets.className='hp-super8-presets';this.hwPresets.style.cssText='min-width:260px;height:27px;background:#eef1f2;color:#283238;border:1px solid #8f9a9f;font:9px DM Mono,monospace';hardwareFooter.appendChild(this.hwPresets);
  this.hwPresets.addEventListener('change',()=>this.presets.load(this.hwPresets.value));
  const save=document.createElement('button');save.type='button';save.textContent='SAVE PERFORMANCE';save.className='hp-super8-action';save.style.cssText='height:27px';save.addEventListener('click',()=>{const name=prompt('Name this performance','My Super 8 Performance');if(name===null)return;try{const item=this.store.save(name,clone(this.patch));this.refreshHardwarePresetList('u:'+item.id);this.displayHardwarePreset?.(item.name);}catch(e){alert(e.message);}});hardwareFooter.appendChild(save);
  const saveLayer=document.createElement('button');saveLayer.type='button';saveLayer.textContent='SAVE LAYER';saveLayer.className='hp-super8-action';saveLayer.style.cssText='height:27px';saveLayer.addEventListener('click',()=>{const name=prompt('Name this layer patch','My Layer Patch');if(name===null)return;try{const item=this.layerStores[this.active].save(name,clone(this.p()));this.refreshLayerSelect(item.id);}catch(e){alert(e.message);}});hardwareFooter.appendChild(saveLayer);
  this.hwLayerPresets=document.createElement('select');this.hwLayerPresets.style.cssText='min-width:180px;height:27px;background:#eef1f2;color:#283238;border:1px solid #8f9a9f;font:9px DM Mono,monospace';this.hwLayerPresets.addEventListener('change',()=>{const item=this.layerStores[this.active].get(this.hwLayerPresets.value);if(item){this.patch.layers[this.active]=cleanLayer(item.data);this.postPatch();this.refresh();this.syncHardware?.();}});hardwareFooter.appendChild(this.hwLayerPresets);
  const matrix=document.createElement('button');matrix.type='button';matrix.textContent='MOD MATRIX';matrix.className='hp-super8-action';matrix.style.cssText='height:27px';matrix.addEventListener('click',()=>this.toggleHardwareMatrix());hardwareFooter.appendChild(matrix);
  const waveLabel=document.createElement('label');waveLabel.className='hp-super8-action hp-super8-wave-import';waveLabel.textContent='LOAD WAVES';waveLabel.style.cssText='height:27px;display:inline-flex;align-items:center;position:relative;overflow:hidden;padding:0 12px;cursor:pointer';
  const waveInput=document.createElement('input');waveInput.type='file';waveInput.multiple=true;waveInput.accept='.wav,audio/wav';waveInput.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer';
  waveInput.addEventListener('change',async()=>{try{if(!this.engine.ctx)throw new Error('Power on audio first.');const waves=[];for(const file of [...(waveInput.files||[])].slice(0,64)){const decoded=await this.engine.ctx.decodeAudioData(await file.arrayBuffer());const data=decoded.getChannelData(0);if(data.length<64||data.length>65536)throw new Error(file.name+' is not a supported single-cycle file.');waves.push(Array.from(data));}if(waves.length)this.engine.post({t:'waves',layer:this.active,waves});this.display.flash(waves.length+' WAVES LOADED');}catch(error){this.display.flash('WAVE IMPORT FAILED');alert(error.message);}});
  waveLabel.appendChild(waveInput);hardwareFooter.appendChild(waveLabel);
  this.renderHardwareSeq=()=>{
   const offset=this.hwSeqPage*16,p=this.p();
   this.hwSeqButtons.forEach((control,i)=>{
    const step=offset+i,button=control.el,active=p.seqSteps[step]!==null&&p.seqSteps[step]!==undefined;
    control.setValue(active,true);button?.classList.toggle('is-slide',!!p.seqSlides[step]);button?.classList.toggle('is-accent',!!p.seqAccents[step]);
    if(button){button.title='Step '+(step+1)+' · '+(active?'NOTE '+p.seqSteps[step]:'REST')+(p.seqSlides[step]?' · SLIDE':'')+(p.seqAccents[step]?' · ACCENT':'')+' · GATE '+Math.round(p.seqGates[step]*100)+'%';}
   });
  };
  this.refreshHardwarePresetList=(selected='f:0')=>{
   this.hwPresets.replaceChildren();
   FACTORY.forEach((item,i)=>{const option=document.createElement('option');option.value='f:'+i;option.textContent=String(i+1).padStart(2,'0')+' · '+item.name;this.hwPresets.appendChild(option);});
   this.store.items.forEach(item=>{const option=document.createElement('option');option.value='u:'+item.id;option.textContent='U · '+item.name;this.hwPresets.appendChild(option);});
   this.hwPresets.value=selected;
  };
  this.displayHardwarePreset=name=>this.hwDisplay.set(name.toUpperCase(),'SUPER 8 · PERFORMANCE');
  this.syncHardware=()=>{
   this.hwKnobs.forEach(({key,control,global})=>control.setValue(global?this.patch[key]:this.p()[key],true));
   this.hwFaders.forEach(({key,control})=>control.setValue(this.p()[key],true));
   this.hwButtons.forEach(({key,control,global})=>{const owner=global?this.patch:this.p();if(key in owner)control.setValue(owner[key],true);});
   this.hwSelects.forEach(({key,select,global})=>{const owner=global?this.patch:this.p();if(key in owner)select.value=String(owner[key]);});
   this.renderHardwareBender?.();
   this.layerButtonsHardware.forEach((control,i)=>control.setValue(i===this.active,true));
   this.refreshLayerSelect();this.renderHardwareSeq();this.refreshHardwareLayerList();this.renderHardwareMatrix?.();
  };
  this.refreshHardwarePresetList('f:0');this.refreshHardwareLayerList=()=>{this.hwLayerPresets.replaceChildren();this.layerStores[this.active].items.forEach(item=>{const o=document.createElement('option');o.value=item.id;o.textContent='LAYER · '+item.name;this.hwLayerPresets.appendChild(o);});};this.syncHardware();
  this.matrixDialog=document.createElement('dialog');this.matrixDialog.className='hp-super8-matrix-dialog';
  this.matrixDialog.innerHTML='<form method="dialog"><header><strong>8 × 8 MODULATION MATRIX</strong><button>×</button></header><p>Rows are modulation sources; columns are destinations. Click a cell to cycle + depth, − depth, and off.</p><div class="hp-super8-matrix-grid"></div></form>';
  const grid=this.matrixDialog.querySelector('.hp-super8-matrix-grid');
  SOURCE_NAMES.forEach((source,s)=>{for(let d=0;d<8;d++){const i=s*8+d,b=document.createElement('button');b.type='button';b.textContent=String.fromCharCode(65+d);b.title=source+' → '+DEST_NAMES[d];b.addEventListener('click',()=>{const old=this.p().modMatrix[i]||0;this.p().modMatrix[i]=old===0?.6:old>0?-.6:0;b.dataset.value=String(this.p().modMatrix[i]);b.textContent=this.p().modMatrix[i]>0?'+':this.p().modMatrix[i]<0?'−':String.fromCharCode(65+d);this.engine.post({t:'param',layer:this.active,key:'modMatrix',value:this.p().modMatrix});});grid.appendChild(b);}});
  this.matrixDialog.addEventListener('close',()=>{});
  p.appendChild(this.matrixDialog);
  this.toggleHardwareMatrix=()=>{if(this.matrixDialog.open)this.matrixDialog.close();else this.matrixDialog.showModal();};
  this.hwControls.all.push({el:pad,_oiMidi:{id:'SUPER8:G:benderX',label:'Bender X · Pitch',group:'PERFORMANCE',get:()=>((this.patch.benderX+1)/2),set:v=>{this.patch.benderX=v*2-1;this.renderHardwareBender();this.engine.post({t:'bendAxis',x:this.patch.benderX,y:this.patch.benderY});}}});
  this.hwControls.all.push({el:pad,_oiMidi:{id:'SUPER8:G:benderY',label:'Bender Y · Modulation',group:'PERFORMANCE',get:()=>((this.patch.benderY+1)/2),set:v=>{this.patch.benderY=v*2-1;this.renderHardwareBender();this.engine.post({t:'bendAxis',x:this.patch.benderX,y:this.patch.benderY});}}});
  this.matrixDialog=document.createElement('dialog');this.matrixDialog.className='hp-super8-matrix-dialog';
  this.matrixDialog.innerHTML='<form method="dialog"><header><strong>8 × 8 MODULATION MATRIX</strong><button>×</button></header><p>Rows are modulation sources; columns are destinations. Click a cell to cycle + depth, − depth, and off.</p><div class="hp-super8-matrix-grid"></div></form>';
  const grid=this.matrixDialog.querySelector('.hp-super8-matrix-grid');grid.style.cssText='display:grid;grid-template-columns:120px repeat(8,minmax(30px,1fr));gap:4px;align-items:center';
  const destinations=['LFO 1 RATE','CROSS MOD','WAVE MOD','OSC MIX','HPF CUTOFF','LPF RESONANCE','ENV 1 DECAY','DELAY TIME'];
  grid.appendChild(document.createElement('span'));destinations.forEach(label=>{const h=document.createElement('span');h.textContent=label;h.className='hp-super8-matrix-head';grid.appendChild(h);});
  this.hwMatrixCells=[];
  SOURCE_NAMES.forEach((source,s)=>{const label=document.createElement('strong');label.textContent=source;label.className='hp-super8-matrix-source';grid.appendChild(label);for(let d=0;d<8;d++){const i=s*8+d,b=document.createElement('button');b.type='button';b.title=source+' → '+destinations[d];b.dataset.value=String(this.p().modMatrix[i]||0);b.addEventListener('click',()=>{const old=this.p().modMatrix[i]||0;this.p().modMatrix[i]=old===0?.6:old>0?-.6:0;this.renderHardwareMatrix();this.engine.post({t:'param',layer:this.active,key:'modMatrix',value:this.p().modMatrix});});this.hwMatrixCells.push({button:b,index:i});grid.appendChild(b);}});
  this.matrixDialog.addEventListener('close',()=>{});document.body.appendChild(this.matrixDialog);
  this.renderHardwareMatrix=()=>this.hwMatrixCells.forEach(({button,index})=>{const v=this.p().modMatrix[index]||0;button.dataset.value=String(v);button.textContent=v>0?'+':v<0?'−':'·';button.setAttribute('aria-label',button.title+' · '+(v>0?'positive depth':v<0?'negative depth':'off'));});
  this.renderHardwareMatrix();
  this.toggleHardwareMatrix=()=>{if(this.matrixDialog.open)this.matrixDialog.close();else this.matrixDialog.showModal();};
  if(!this._hardwareMidiCleanup)this._hardwareMidiCleanup=registerMidiTargetProvider(()=>this.hwControls.all.map(control=>{const m=control.el?._oiMidi||control._oiMidi;if(!m)return null;return {id:m.id,label:m.label,group:m.group||'SUPER 8',get:m.get,set:m.set,el:control.el||null};}).filter(Boolean));
 }

}
new Super8App();