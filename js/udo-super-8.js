import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el,section,knob,select,toggle,button,display,performance,power,presetBar,footer } from './shared/panel.js';
import { registerMidiTarget } from './shared/midiMap.js';

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
 seqEnabled:false,seqLength:16,seqMode:'step',seqSteps:Array(64).fill(null),seqSwing:0,seqBpm:120,
 arpEnabled:false,arpMode:'up',arpDivision:4,arpRange:1,arpSwing:0,arpHold:false,
 portamento:0,transpose:0,bendRange:2,velocity:1,aftertouch:0
};
const GLOBAL={mode:'single',activeLayer:0,splitPoint:60,binaural:true,mpe:true,volume:.72,benderX:0,benderY:0,expression:1};
function cleanLayer(d={}){const p={...clone(LAYER),...d};p.modMatrix=Array.from({length:64},(_,i)=>Number(d.modMatrix?.[i])||0);p.seqSteps=Array.from({length:64},(_,i)=>d.seqSteps?.[i]??null);return p;}
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
  this.active=0;this.ui={};this.build();this.presets.load('f:0');
  power('super8-power',()=>this.engine.start(),()=>{this.perf.flushPending();this.display.set('SUPER 8 READY','TWO FPGA-STYLE DDS CORES · STEREO OUTPUT');});
  this.postPatch();
 }
 p(){return this.patch.layers[this.active];}
 set(key,value){this.p()[key]=value;this.engine.post({t:'param',layer:this.active,key,value});}
 setGlobal(key,value){this.patch[key]=value;this.engine.post({t:'param',key,value});}
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
  this.makeSelect(mod.body,'lfo2Destination','PITCH DEST',['DDS 1','DDS 1 + DDS 2','DDS 2']);
  this.makeToggle(mod.body,'lfo1HighFreq','LFO 1 HIGH FREQUENCY');
  this.makeToggle(mod.body,'lfo2Bender','BENDER MOD');
  this.makeToggle(mod.body,'lfo2Aftertouch','AFTERTOUCH MOD');
  const mixer=section(top,'MIXER / VCA','LAYER LEVEL AND PAN');
  this.makeKnobs(mixer.body,[['mix','DDS 1 / DDS 2'],['pan','LAYER PAN']]);
  this.makeKnobs(mixer.body,[['velocity','VELOCITY'],['volume','MASTER',0,1]]);
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
  this.presets=presetBar(perf.body,{factory:FACTORY,store:this.store,display:this.display,filename:'udo-super-8-performance',panic:()=>this.perf?.allOff(),apply:(data,name)=>{this.patch=validate(data);this.selectLayer(this.patch.activeLayer||0);this.refresh();this.display.set(name.toUpperCase(),'OVERTURE PERFORMANCE');},capture:()=>clone(this.patch)});
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
  const p=this.p(),step=this.seqPage*16+i,v=p.seqSteps[step];
  if(v===null||v===undefined)p.seqSteps[step]=48+i;
  else p.seqSteps[step]=null;
  this.engine.post({t:'param',layer:this.active,key:'seqSteps',value:p.seqSteps});this.updateSeq();
 }
 updateSeq(){this.seqButtons?.forEach((b,i)=>{const v=this.p().seqSteps[this.seqPage*16+i];b.classList.toggle('is-on',v!==null&&v!==undefined);b.textContent=String(i+1);});}
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
  this.layerButtons?.forEach((b,i)=>b.classList.toggle('lit',i===this.active));
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
   noteOn:(n,v,source,channel)=>this.engine.noteOn(n,v,channel),noteOff:(n,source,channel)=>this.engine.noteOff(n,channel),
   bend:v=>this.engine.setPitchBend(v),mod:v=>this.engine.setModWheel(v),aftertouch:v=>this.engine.setAftertouch(v),
   polyAftertouch:(n,v)=>this.engine.post({t:'polyAt',note:n,value:v}),sustain:d=>this.engine.setSustain(d),allOff:()=>this.engine.allNotesOff(),
   program:p=>this.presets.load('f:'+p%FACTORY.length),cc:(cc,v)=>{if(cc===7)this.setGlobal('volume',v/127);if(cc===11)this.engine.post({t:'expression',value:v/127});}
  }});
 }
}
new Super8App();