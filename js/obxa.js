import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el, section, knob, select, toggle, button, display, performance, power, presetBar, footer } from './shared/panel.js';
import { OBXA_PRESETS } from './data/obx-a-presets.js';
import { DEF, GLOBAL_KEYS, LAYER_KEYS, OBXA_PROGRAM_GROUPS, OBXA_PROGRAM_COUNT, obxaProgramSlotId, obxaSpecialProgramSlotId, validateOBXAProgramRecord, validateOBXAPatch as validate } from './data/obxa-patch.js?v=20261123-obxa-patch-r3';
import { consumeCommunityInstrumentPreset, createCommunityShareButton } from './shared/communityPreset.js';
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES=Array.from({length:61},(_,i)=>{const n=36+i;return NOTE_NAMES[n%12]+(Math.floor(n/12)-1);});
class OBXaApp{
 constructor(){
  this.engine=new WorkletEngine(new URL('./engine/OBXaProcessor.js?v=20261123-audio-r2',import.meta.url).href,'obxa-processor');
  power('obxa-power',()=>this.engine.start(),()=>{this.perf?.flushPending();this.display?.set('OB-Xa READY',this.patch.voiceCount+' VOICES · TWO CONTROL GROUPS');});
  this.patch=validate(DEF);this.layerIndex=0;this.ui={};this.manualMode=false;this.store=new PresetStore({key:'overture.obxa.programs',version:3,validate});this.hardwareStore=new PresetStore({key:'overture.obxa.hardware-programs',version:1,maxItems:136,validate:validateOBXAProgramRecord});this.seedHardwarePrograms();this.build();
  this.perf=performance(this.shell,{notes:NOTES,octaves:5,startOctave:2,started:()=>this.engine.started,midiStatusEl:this.midi,handlers:{
   noteOn:(n,v)=>this.engine.noteOn(n,v),noteOff:n=>this.engine.noteOff(n),bend:v=>this.engine.setPitchBend(v),mod:v=>this.engine.setModWheel(v),
   sustain:d=>this.engine.setSustain(d),allOff:()=>this.engine.allNotesOff(),program:p=>{const slot=Math.abs(Number(p)||0)%OBXA_PROGRAM_COUNT,group=Math.floor(slot/8),program=slot%8+1;this.ui.hwGroup?.setValue(String(group),true);this.refreshHardwareProgramOptions();this.ui.hwProgram?.setValue(String(program),true);this.loadHardwareProgram();},
   cc:(cc,value)=>{if(cc===4||cc===74)this.ui.cutoff.setValue(value/127);if(cc===7)this.ui.master.setValue(value/127);if(cc===71)this.ui.resonance.setValue(value/127);if(cc===66)this.ui.hold.setValue(value>=64);}
  }});
  this.presets.load('f:0');
  const community=consumeCommunityInstrumentPreset('ob-xa',validate);
  if(community){this.patch=community.data;this.layerIndex=0;this.refresh();this.display.set(community.title.toUpperCase(),'COMMUNITY OB-Xa PROGRAM');}
 }

 seedHardwarePrograms(){
  OBXA_PRESETS.forEach((preset,index)=>{
   const group=Math.floor(index/8),program=index%8+1,id=obxaProgramSlotId(group,program);
   if(!this.hardwareStore.get(id))this.hardwareStore.save(preset.name,{kind:'sound',patch:preset.data},id);
  });
 }
 patchSnapshot(){return JSON.parse(JSON.stringify(this.patch));}
 refreshHardwareProgramOptions(){
  if(!this.ui.hwProgram?.select||!this.ui.hwGroup?.select)return;
  const group=Number(this.ui.hwGroup.select.value)||0,selectEl=this.ui.hwProgram.select,current=selectEl.value||'1';
  selectEl.replaceChildren();
  for(let program=1;program<=8;program++){
   const record=this.hardwareStore.get(obxaProgramSlotId(group,program));
   const option=document.createElement('option');
   option.value=String(program);
   option.textContent=record?program+' · '+record.name:program+' · EMPTY';
   selectEl.appendChild(option);
  }
  selectEl.value=current;
  if(!selectEl.value)selectEl.value='1';
 }
 refreshSpecialProgramOptions(){
  if(!this.ui.specialProgram?.select||!this.ui.specialType?.select)return;
  const mode=this.ui.specialType.select.value,selectEl=this.ui.specialProgram.select,current=selectEl.value||'1';
  selectEl.replaceChildren();
  for(let program=1;program<=8;program++){
   const record=this.hardwareStore.get(obxaSpecialProgramSlotId(mode,program));
   const option=document.createElement('option');
   option.value=String(program);
   option.textContent=record?program+' · '+record.name:program+' · EMPTY';
   selectEl.appendChild(option);
  }
  selectEl.value=current;
  if(!selectEl.value)selectEl.value='1';
 }
 saveHardwareProgram(){
  const group=Number(this.ui.hwGroup.select.value)||0,program=Number(this.ui.hwProgram.select.value)||1,id=obxaProgramSlotId(group,program);
  const existing=this.hardwareStore.get(id);
  if(existing&&!confirm('Overwrite program '+OBXA_PROGRAM_GROUPS[group]+program+'?'))return;
  const patch=this.patchSnapshot(),kind=patch.mode==='split'?'split':patch.mode==='double'?'double':'sound';
  this.hardwareStore.save(existing?.name||('Program '+OBXA_PROGRAM_GROUPS[group]+program),{kind,patch},id);
  this.refreshHardwareProgramOptions();
  this.display.flash('PROGRAM '+OBXA_PROGRAM_GROUPS[group]+program+' WRITTEN');
 }
 loadHardwareProgram(){
  const group=Number(this.ui.hwGroup.select.value)||0,program=Number(this.ui.hwProgram.select.value)||1;
  const record=this.hardwareStore.get(obxaProgramSlotId(group,program));
  if(!record){this.display.flash('PROGRAM SLOT EMPTY');return;}
  this.applyHardwareProgram(record.data,record.name);
 }
 saveSpecialProgram(){
  const mode=this.ui.specialType.select.value,program=Number(this.ui.specialProgram.select.value)||1,id=obxaSpecialProgramSlotId(mode,program);
  if(this.patch.mode!==mode){this.display.flash('SELECT '+mode.toUpperCase()+' MODE FIRST');return;}
  const existing=this.hardwareStore.get(id);
  if(existing&&!confirm('Overwrite '+mode.toUpperCase()+' program '+program+'?'))return;
  this.hardwareStore.save(existing?.name||mode.toUpperCase()+' '+program,{kind:mode,patch:this.patchSnapshot()},id);
  this.refreshSpecialProgramOptions();
  this.display.flash(mode.toUpperCase()+' PROGRAM '+program+' WRITTEN');
 }
 loadSpecialProgram(){
  const mode=this.ui.specialType.select.value,program=Number(this.ui.specialProgram.select.value)||1;
  const record=this.hardwareStore.get(obxaSpecialProgramSlotId(mode,program));
  if(!record){this.display.flash(mode.toUpperCase()+' MEMORY EMPTY');return;}
  this.applyHardwareProgram(record.data,record.name);
 }
 applyHardwareProgram(data,name){
  this.manualMode=false;this.patch=validate(data.patch||data);this.layerIndex=0;this.refresh();
  this.display.set(String(name||'OB-Xa PROGRAM').toUpperCase(),this.patch.mode.toUpperCase()+' · HARDWARE PROGRAM');
 }
 enterManualMode(){
  if(this.patch.mode!=='full')this.patch.mode='full';
  this.manualMode=true;this.layerIndex=0;this.refresh();
  this.display.set('MANUAL','LIVE PANEL SETTINGS · FULL POLY');
 }
 currentLayer(){return this.layerIndex===1?this.patch.layerB:this.patch;}
 set(key,value){
  const global=GLOBAL_KEYS.has(key);
  if(global){
   this.patch[key]=value;
   if(key==='bendNarrow'){
    this.patch.bendRange=value?2:12;
    this.ui.bendRange?.setValue(this.patch.bendRange,true);
    this.engine.post({t:'param',key:'bendRange',value:this.patch.bendRange,layer:0});
   }else if(key==='bendRange'){
    this.patch.bendRange=Math.round(Math.max(1,Math.min(12,Number(value)||1)));
    this.patch.bendNarrow=this.patch.bendRange<=2;
    this.ui.bendNarrow?.setValue(this.patch.bendNarrow,true);
   }
   if(['mode','voiceCount','unison','chordMode','transposeDown','transposeUp'].includes(key))this.engine.allNotesOff();
   if(key==='hold')this.engine.post({t:'hold',value:!!value});
  }else this.currentLayer()[key]=value;
  this.engine.post({t:'param',key,value,layer:global?0:this.layerIndex});this.updateLayoutState();
 }
 selectLayer(value){this.layerIndex=Number(value)===1?1:0;this.renderLayerControls();this.display.set('EDIT TIMBRE '+(this.layerIndex?'B':'A'),'OB-Xa TWO-SYNTH PROGRAM');}
 setMasterTranspose(key,value){const other=key==='transposeDown'?'transposeUp':'transposeDown';if(value){this.patch[other]=false;this.engine.post({t:'param',key:other,value:false,layer:0});this.ui[other]?.setValue(false,true);}this.set(key,!!value);}
 renderVoicePanControls(){(this.patch.voicePan||[]).forEach((value,index)=>this.ui['voicePan'+index]?.setValue(value,true));}
 renderLayerControls(){const source=this.currentLayer();LAYER_KEYS.forEach(key=>{if(this.ui[key]?.setValue)this.ui[key].setValue(source[key],true);});if(this.ui.layerEdit)this.ui.layerEdit.setValue(String(this.layerIndex),true);}
 updateLayoutState(){const full=this.patch.mode==='full';this.shell.classList.toggle('is-split',this.patch.mode==='split');this.shell.classList.toggle('is-dual',!full);if(full){['modLowerEnabled','modUpperEnabled'].forEach(key=>{if(!this.patch[key]){this.patch[key]=true;this.engine.post({t:'param',key,value:true,layer:0});}});}['modLowerEnabled','modUpperEnabled'].forEach(key=>{const control=this.ui[key];if(control){control.disabled=full;control.setAttribute('aria-disabled',String(full));control.setValue(this.patch[key],true);}});}
 build(){
  const page=el('div','pn-page obxa-page',document.getElementById('obxa-root'));this.shell=el('main','pn-shell obxa-shell',page);
  const header=el('header','pn-header obxa-header',this.shell),brand=el('div','obxa-brand',header);
  const logo=el('img','obxa-brand__logo',brand);logo.src='/ui/Logos/Oberheim_logo.png';logo.alt='Oberheim';
  el('span','obxa-brand__model',brand,'OB-Xa · PROGRAMMABLE POLYPHONIC SYNTHESIZER');
  const right=el('div','pn-header-right',header);this.display=display(right);this.midi=el('div','pn-midi',right,'MIDI: searching…');
  const rows=el('div','pn-rows',this.shell),top=el('div','pn-row obxa-top',rows);
  const oscillators=section(top,'OSCILLATORS','TWO VCOs PER VOICE'),ok=el('div','pn-knobs',oscillators.body);
  this.ui.osc1Range=knob(ok,{label:'OSC 1 FREQUENCY',min:-2,max:2,value:this.currentLayer().osc1Range,formatValue:v=>(Math.round(v)>0?'+':'')+Math.round(v)+' OCT',onChange:v=>this.set('osc1Range',Math.round(v))});
  this.ui.osc1Level=knob(ok,{label:'OSC 1 LEVEL',min:0,max:1,value:this.currentLayer().osc1Level,onChange:v=>this.set('osc1Level',v)});
  this.ui.osc2Level=knob(ok,{label:'OSC 2 LEVEL',min:0,max:1,value:this.currentLayer().osc2Level,onChange:v=>this.set('osc2Level',v)});
  this.ui.osc2Tune=knob(ok,{label:'OSC 2 FREQUENCY',min:-1,max:1,value:this.currentLayer().osc2Tune,formatValue:v=>(Math.round(v*60)/2).toFixed(1)+' ST',onChange:v=>this.set('osc2Tune',Math.round(v*60)/60)});
  this.ui.pulseWidth=knob(ok,{label:'PULSE WIDTH',min:0,max:1,value:this.currentLayer().pulseWidth,onChange:v=>this.set('pulseWidth',v)});
  this.ui.osc1Wave=select(oscillators.body,'OSC 1 WAVEFORM',[{value:'saw',label:'SAWTOOTH'},{value:'pulse',label:'PULSE'}],this.currentLayer().osc1Wave,v=>this.set('osc1Wave',v));
  this.ui.osc2Wave=select(oscillators.body,'OSC 2 WAVEFORM',[{value:'saw',label:'SAWTOOTH'},{value:'pulse',label:'PULSE'}],this.currentLayer().osc2Wave,v=>this.set('osc2Wave',v));
  this.ui.fEnvOsc2=toggle(oscillators.body,'F-ENV → OSC 2',this.currentLayer().fEnvOsc2,v=>this.set('fEnvOsc2',v));
  this.ui.sync=toggle(oscillators.body,'OSC 2 SYNC',this.currentLayer().sync,v=>this.set('sync',v));
  const filter=section(top,'FILTER','TWO SELECTABLE LOW-PASS RESPONSES'),fk=el('div','pn-knobs',filter.body);
  this.ui.cutoff=knob(fk,{label:'FREQUENCY',min:0,max:1,value:this.currentLayer().cutoff,onChange:v=>this.set('cutoff',v)});
  this.ui.resonance=knob(fk,{label:'RESONANCE',min:0,max:1,value:this.currentLayer().resonance,onChange:v=>this.set('resonance',v)});
  this.ui.filterEnv=knob(fk,{label:'ENVELOPE MODULATION',min:0,max:1,value:this.currentLayer().filterEnv,onChange:v=>this.set('filterEnv',v)});
  this.ui.filterMode=select(filter.body,'FILTER POLES',[{value:'12',label:'2-POLE · 12 dB/OCT'},{value:'24',label:'4-POLE · 24 dB/OCT'}],this.currentLayer().filterMode,v=>this.set('filterMode',v));
  const routes=el('div','obxa-switch-row',filter.body);
  this.ui.osc1Route=toggle(routes,'OSC 1',this.currentLayer().osc1Route,v=>this.set('osc1Route',v));
  this.ui.osc2Route=toggle(routes,'OSC 2',this.currentLayer().osc2Route,v=>this.set('osc2Route',v));
  this.ui.osc2Half=toggle(routes,'OSC 2 HALF',this.currentLayer().osc2Half,v=>this.set('osc2Half',v));
  this.ui.noiseRoute=toggle(routes,'PINK NOISE',this.currentLayer().noiseRoute,v=>this.set('noiseRoute',v));
  this.ui.filterTrack=toggle(routes,'TRACK',this.currentLayer().filterTrack,v=>this.set('filterTrack',v));
  const env=section(rows,'ENVELOPES','INDEPENDENT FILTER AND LOUDNESS ADSR'),eg=el('div','obxa-envelope-grid',env.body);
  const makeEnvelope=(parent,title,prefix)=>{
   const box=el('div','obxa-envelope',parent);el('h3','',box,title);const k=el('div','pn-knobs',box);
   [['Attack','ATTACK'],['Decay','DECAY'],['Sustain','SUSTAIN'],['Release','RELEASE']].forEach(([suffix,label])=>{const key=prefix+suffix;this.ui[key]=knob(k,{label,min:0,max:1,value:this.currentLayer()[key],onChange:v=>this.set(key,v)});});
  };
  makeEnvelope(eg,'FILTER ENVELOPE','filter');makeEnvelope(eg,'LOUDNESS ENVELOPE','amp');
    const modulation=section(rows,'MODULATION','LFO ROUTING · PITCH BEND · VOICE ASSIGNMENT');
  modulation.body.classList.add('obxa-modulation-layout');
  const modGrid=el('div','obxa-mod-grid',modulation.body);
  const modBlock=(parent,title,detail)=>{
   const block=el('section','obxa-mod-block',parent);
   const head=el('div','obxa-mod-block__head',block);
   el('h3','obxa-mod-block__title',head,title);
   if(detail)el('p','obxa-mod-block__hint',head,detail);
   return block;
  };
  const routeGroup=(parent,title)=>{
   const group=el('div','obxa-mod-route',parent);
   el('h4','obxa-mod-route__title',group,title);
   return el('div','obxa-switch-row obxa-mod-switches',group);
  };

  const lfoBlock=modBlock(modGrid,'LFO GENERATOR','One LFO per four-voice bank; timbre settings control its rate and waveform.');
  const lfoControls=el('div','obxa-mod-knobs',lfoBlock);
  this.ui.lfoRate=knob(lfoControls,{label:'RATE',min:0,max:1,value:this.currentLayer().lfoRate,onChange:v=>this.set('lfoRate',v)});
  this.ui.lfoAmount=knob(lfoControls,{label:'FREQUENCY DEPTH',min:0,max:1,value:this.currentLayer().lfoAmount,onChange:v=>this.set('lfoAmount',v)});
  this.ui.pulseWidthAmount=knob(lfoControls,{label:'PULSE-WIDTH DEPTH',min:0,max:1,value:this.currentLayer().pulseWidthAmount,onChange:v=>this.set('pulseWidthAmount',v)});
  this.ui.lfoWave=select(lfoControls,'WAVEFORM',[{value:'sine',label:'SINE'},{value:'square',label:'SQUARE'},{value:'s&h',label:'SAMPLE / HOLD'}],this.currentLayer().lfoWave,v=>this.set('lfoWave',v));

  const routesBlock=modBlock(modGrid,'MODULATION DESTINATIONS','Choose where the LFO is applied.');
  const routeGrid=el('div','obxa-mod-route-grid',routesBlock);
  const frequencyRoutes=routeGroup(routeGrid,'FREQUENCY');
  this.ui.lfoOsc1=toggle(frequencyRoutes,'OSC 1',this.currentLayer().lfoOsc1,v=>this.set('lfoOsc1',v));
  this.ui.lfoOsc2=toggle(frequencyRoutes,'OSC 2',this.currentLayer().lfoOsc2,v=>this.set('lfoOsc2',v));
  this.ui.lfoFilter=toggle(frequencyRoutes,'FILTER',this.currentLayer().lfoFilter,v=>this.set('lfoFilter',v));
  const pulseRoutes=routeGroup(routeGrid,'PULSE WIDTH');
  this.ui.lfoPulse1=toggle(pulseRoutes,'OSC 1',this.currentLayer().lfoPulse1,v=>this.set('lfoPulse1',v));
  this.ui.lfoPulse2=toggle(pulseRoutes,'OSC 2',this.currentLayer().lfoPulse2,v=>this.set('lfoPulse2',v));

  const panelLfoBlock=modBlock(modGrid,'MODULATION PANEL LFO','Third hardware LFO. The modulation lever controls its depth; assign it to either oscillator.');
  const panelLfoControls=el('div','obxa-mod-knobs',panelLfoBlock);
  this.ui.modPanelLfoRate=knob(panelLfoControls,{label:'RATE',min:0,max:1,value:this.patch.modPanelLfoRate,onChange:v=>this.set('modPanelLfoRate',v)});
  this.ui.modPanelLfoDepth=knob(panelLfoControls,{label:'DEPTH',min:0,max:1,value:this.patch.modPanelLfoDepth,onChange:v=>this.set('modPanelLfoDepth',v)});
  this.ui.modPanelLfoWave=select(panelLfoControls,'WAVEFORM',[{value:'sine',label:'SINE'},{value:'saw',label:'SAWTOOTH'},{value:'square',label:'SQUARE'}],this.patch.modPanelLfoWave,v=>this.set('modPanelLfoWave',v));
  const panelLfoRoutes=routeGroup(panelLfoBlock,'FREQUENCY DESTINATION');
  this.ui.modPanelLfoOsc1=toggle(panelLfoRoutes,'OSC 1',this.patch.modPanelLfoOsc1,v=>this.set('modPanelLfoOsc1',v));
  this.ui.modPanelLfoOsc2=toggle(panelLfoRoutes,'OSC 2',this.patch.modPanelLfoOsc2,v=>this.set('modPanelLfoOsc2',v));


  const performanceBlock=modBlock(modGrid,'PERFORMANCE','Pitch-bend behaviour and master transposition.');
  const performanceGrid=el('div','obxa-mod-route-grid',performanceBlock);
  const bendOptions=routeGroup(performanceGrid,'PITCH BEND');
  this.ui.bendOsc2Only=toggle(bendOptions,'OSC 2 ONLY',this.patch.bendOsc2Only,v=>this.set('bendOsc2Only',v));
  this.ui.bendNarrow=toggle(bendOptions,'NARROW RANGE',this.patch.bendNarrow,v=>this.set('bendNarrow',v));
  const transposeOptions=routeGroup(performanceGrid,'MASTER TRANSPOSE');
  this.ui.transposeDown=toggle(transposeOptions,'DOWN 1 OCTAVE',this.patch.transposeDown,v=>this.setMasterTranspose('transposeDown',v));
  this.ui.transposeUp=toggle(transposeOptions,'UP 1 OCTAVE',this.patch.transposeUp,v=>this.setMasterTranspose('transposeUp',v));
  this.ui.autoTune=button(performanceBlock,'AUTO-TUNE',()=>{this.perf?.allOff();this.engine.post({t:'autoTune'});this.display.set('AUTO-TUNE COMPLETE','ALL VOICE OSCILLATORS RETUNED');});

  const assignmentBlock=modBlock(modGrid,'VOICE ASSIGNMENT & HOLD','Independent control of the lower and upper four-voice groups.');
  const assignmentRoutes=routeGroup(assignmentBlock,'MODULATION / BEND ENABLE');
  this.ui.modLowerEnabled=toggle(assignmentRoutes,'LOWER BANK',this.patch.modLowerEnabled,v=>this.set('modLowerEnabled',v));
  this.ui.modUpperEnabled=toggle(assignmentRoutes,'UPPER BANK',this.patch.modUpperEnabled,v=>this.set('modUpperEnabled',v));
  const memoryRow=el('div','obxa-mod-memory',assignmentBlock);
  this.ui.hold=toggle(memoryRow,'HOLD / CAPTURE',this.patch.hold,v=>this.set('hold',v));
  this.ui.chordMode=toggle(memoryRow,'CHORD MEMORY',this.patch.chordMode,v=>this.set('chordMode',v));
  this.ui.clearChord=button(memoryRow,'CLEAR CHORD',()=>{this.engine.post({t:'clearChord'});this.display.set('CHORD MEMORY CLEARED','PLAY AND HOLD A NEW CHORD');});
  el('p','pn-help obxa-mod-help',assignmentBlock,'With HOLD on, play and release a chord to capture its intervals. Turn HOLD off to release held notes; CHORD MEMORY then transposes the stored voicing from each new root. Bank assignment is only editable in SPLIT and DOUBLE modes.');
const allocation=section(rows,'KEYBOARD & VOICE ALLOCATION','FULL · SPLIT · DOUBLE · PROGRAMMABLE VOICE BANKS'),ak=el('div','pn-knobs',allocation.body);
  this.ui.mode=select(allocation.body,'KEYBOARD MODE',[{value:'full',label:'FULL · POLY'},{value:'split',label:'SPLIT'},{value:'double',label:'DOUBLE / LAYER'}],this.patch.mode,v=>this.set('mode',v));
  this.ui.voiceCount=select(allocation.body,'VOICE CONFIGURATION',[{value:'4',label:'4 VOICES'},{value:'6',label:'6 VOICES'},{value:'8',label:'8 VOICES'}],String(this.patch.voiceCount),v=>this.set('voiceCount',Number(v)));
  this.ui.splitPoint=knob(ak,{label:'SPLIT POINT',min:36,max:96,value:this.patch.splitPoint,formatValue:v=>NOTE_NAMES[Math.round(v)%12]+(Math.floor(Math.round(v)/12)-1),onChange:v=>this.set('splitPoint',Math.round(v))});
  this.ui.layerBalance=knob(ak,{label:'LOWER / UPPER BALANCE',min:0,max:1,value:this.patch.layerBalance,formatValue:v=>Math.round(v*100)+'% UPPER',onChange:v=>this.set('layerBalance',v)});
  this.ui.unison=toggle(allocation.body,'UNISON',this.patch.unison,v=>this.set('unison',v));
  this.ui.unisonDetune=knob(ak,{label:'UNISON SPREAD · OVERTURE EXTRA',min:0,max:1,value:this.patch.unisonDetune,onChange:v=>this.set('unisonDetune',v)});
  this.ui.osc2Detune=knob(ak,{label:'OSC 2 DETUNE',min:-100,max:100,value:this.currentLayer().osc2Detune,formatValue:v=>(Math.round(v)>0?'+':'')+Math.round(v)+' CENT',onChange:v=>this.set('osc2Detune',Math.round(v))});
  this.ui.transpose=knob(ak,{label:'TIMBRE TRANSPOSE',min:-60,max:60,value:this.currentLayer().transpose,formatValue:v=>(Math.round(v)>0?'+':'')+Math.round(v)+' ST',onChange:v=>this.set('transpose',Math.round(v))});
  this.ui.portamento=knob(ak,{label:'PORTAMENTO',min:0,max:1,value:this.currentLayer().portamento,onChange:v=>this.set('portamento',v)});
  this.ui.portamentoMode=select(allocation.body,'GLIDE MODE',[{value:'linear',label:'LINEAR'},{value:'quantized',label:'QUANTIZED'}],this.patch.portamentoMode,v=>this.set('portamentoMode',v));
  this.ui.portamentoOffset=toggle(allocation.body,'PORTAMENTO OFFSET',this.patch.portamentoOffset,v=>this.set('portamentoOffset',v));
  this.ui.bendRange=knob(ak,{label:'PITCH BEND RANGE',min:1,max:12,value:this.patch.bendRange,formatValue:v=>Math.round(v)+' ST',onChange:v=>this.set('bendRange',Math.round(v))});
  this.ui.masterTune=knob(ak,{label:'MASTER TUNE',min:-1,max:1,value:this.patch.masterTune,formatValue:v=>(v*100).toFixed(0)+' CENT',onChange:v=>this.set('masterTune',v)});
  this.ui.master=knob(ak,{label:'MASTER VOLUME',min:0,max:1,value:this.patch.master,onChange:v=>this.set('master',v)});
  this.ui.layerEdit=select(allocation.body,'EDIT TIMBRE',[{value:'0',label:'LOWER / A'},{value:'1',label:'UPPER / B'}],'0',v=>this.selectLayer(v));

  const panSection=section(rows,'VOICE PAN POTS','Eight internal pan controls · voices 1–4 left, voices 5–8 right by default');
  const panGrid=el('div','pn-knobs',panSection.body);
  for(let index=0;index<8;index++){
   this.ui['voicePan'+index]=knob(panGrid,{label:'VOICE '+(index+1),min:-1,max:1,value:this.patch.voicePan[index],formatValue:v=>Math.round(v*100)+'% '+(v<-.02?'L':v>.02?'R':'C'),onChange:value=>{const pans=this.patch.voicePan.slice();pans[index]=value;this.set('voicePan',pans);}});
  }

  const memory=section(rows,'PROGRAMMER','OVERTURE OB-Xa PROGRAMS');
  this.presets=presetBar(memory.body,{factory:OBXA_PRESETS,store:this.store,display:this.display,filename:'oberheim-obxa-program',panic:()=>this.perf.allOff(),apply:(data,name)=>{this.patch=validate(data);this.layerIndex=0;this.refresh();this.display.set(name.toUpperCase(),'OB-Xa PROGRAM');},capture:()=>({...this.patch,layerB:{...this.patch.layerB}})});
  createCommunityShareButton(memory.body,{instrumentId:'ob-xa',className:'pn-btn',getData:()=>validate(this.patch),getAudioOutput: () => this.engine.output,
       getTitle:()=> 'Oberheim OB-Xa program'});
  footer(this.shell,'OBERHEIM OB-Xa · 4 / 6 / 8 VOICES · DUAL VCO · SELECTABLE 2 / 4-POLE VCF · PINK NOISE · POLYPHONIC GLIDE');this.updateLayoutState();
 }
 refresh(){['mode','voiceCount','splitPoint','unison','unisonDetune','bendRange','bendNarrow','bendOsc2Only','transposeDown','transposeUp','modLowerEnabled','modUpperEnabled','modPanelLfoRate','modPanelLfoDepth','modPanelLfoWave','modPanelLfoOsc1','modPanelLfoOsc2','master','masterTune','hold','layerBalance','chordMode','portamentoMode','portamentoOffset'].forEach(key=>{if(this.ui[key]?.setValue)this.ui[key].setValue(this.patch[key],true);});this.renderLayerControls();this.renderVoicePanControls();this.updateLayoutState();this.engine.post({t:'patch',patch:this.patch});}
}
new OBXaApp();