import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el, section, knob, select, toggle, button, display, performance, power, presetBar, footer } from './shared/panel.js';
import { OBXA_PRESETS } from './data/obx-a-presets.js';
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES=Array.from({length:61},(_,i)=>{const n=36+i;return NOTE_NAMES[n%12]+(Math.floor(n/12)-1);});
const GLOBAL_DEFAULTS={mode:'full',voiceCount:8,splitPoint:60,unison:false,unisonDetune:.12,bendRange:12,bendNarrow:false,bendOsc2Only:false,master:.7,masterTune:0,hold:false,layerBalance:.5,chordMode:false,portamentoMode:'linear',portamentoOffset:true,transposeDown:false,transposeUp:false,modLowerEnabled:true,modUpperEnabled:true};
const LAYER_DEFAULTS={osc1Wave:'saw',osc2Wave:'saw',osc1Range:0,osc1Level:.82,osc2Level:.56,osc2Tune:0,pulseWidth:.5,sync:false,fEnvOsc2:false,osc1Route:true,osc2Route:true,osc2Half:false,noiseRoute:false,cutoff:.53,resonance:.13,filterMode:'24',filterTrack:true,filterEnv:.42,filterAttack:.08,filterDecay:.32,filterSustain:.12,filterRelease:.32,ampAttack:.015,ampDecay:.3,ampSustain:.76,ampRelease:.32,lfoRate:.16,lfoAmount:0,lfoWave:'sine',lfoTarget:'both',lfoOsc1:true,lfoOsc2:true,lfoFilter:false,pulseWidthAmount:0,lfoPulse1:false,lfoPulse2:false,transpose:0,portamento:0};
const DEF={...GLOBAL_DEFAULTS,...LAYER_DEFAULTS},GLOBAL_KEYS=new Set(Object.keys(GLOBAL_DEFAULTS)),LAYER_KEYS=Object.keys(LAYER_DEFAULTS);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const cleanLayer=(source={})=>{
 const out={...LAYER_DEFAULTS,...source};
 ['osc1Level','osc2Level','pulseWidth','cutoff','resonance','filterEnv','filterAttack','filterDecay','filterSustain','filterRelease','ampAttack','ampDecay','ampSustain','ampRelease','lfoRate','lfoAmount','pulseWidthAmount','portamento'].forEach(k=>out[k]=clamp(out[k],0,1));
 out.osc1Range=Math.round(clamp(out.osc1Range,-2,2));out.osc2Tune=clamp(out.osc2Tune,-1,1);out.transpose=Math.round(clamp(out.transpose,-24,24));
 ['osc1Wave','osc2Wave'].forEach(k=>out[k]=out[k]==='pulse'?'pulse':'saw');
 ['fEnvOsc2','sync','osc1Route','osc2Route','osc2Half','noiseRoute','filterTrack','lfoPulse1','lfoPulse2'].forEach(k=>out[k]=!!out[k]);delete out.lfoVca;
 ['lfoOsc1','lfoOsc2','lfoFilter'].forEach(k=>out[k]=source[k]===undefined?(k==='lfoOsc1'?(out.lfoTarget==='osc1'||out.lfoTarget==='both'):k==='lfoOsc2'?(out.lfoTarget==='osc2'||out.lfoTarget==='both'):out.lfoTarget==='filter'):!!source[k]);
 out.filterMode=String(out.filterMode)==='12'?'12':'24';out.lfoWave=['sine','square','s&h'].includes(out.lfoWave)?out.lfoWave:'sine';
 out.lfoTarget=['osc1','osc2','filter','both'].includes(out.lfoTarget)?out.lfoTarget:'both';return out;
};
const validate=data=>{
 if(!data||typeof data!=='object')throw new Error('Not an OB-Xa program.');
 const {layerB,...root}=data;const out={...GLOBAL_DEFAULTS,...cleanLayer(root)};
 if(data.mode==='unison'){out.mode='full';out.unison=true;}else out.mode=['full','split','double'].includes(data.mode)?data.mode:'full';
 out.voiceCount=[4,6,8].includes(Number(data.voiceCount))?Number(data.voiceCount):8;out.splitPoint=Math.round(clamp(data.splitPoint??60,36,96));
 out.unison=!!out.unison;out.unisonDetune=clamp(data.unisonDetune??.12,0,1);out.bendRange=Math.round(clamp(data.bendRange??2,1,12));
 out.bendOsc2Only=!!out.bendOsc2Only;out.bendNarrow=data.bendNarrow===undefined?Number(data.bendRange??12)<=2:!!data.bendNarrow;out.bendRange=out.bendNarrow?2:12;out.master=clamp(data.master??.7,0,1);out.masterTune=clamp(data.masterTune??0,-1,1);out.hold=!!out.hold;out.transposeDown=!!data.transposeDown;out.transposeUp=!!data.transposeUp;if(out.transposeDown&&out.transposeUp)out.transposeUp=false;out.modLowerEnabled=data.modLowerEnabled!==false;out.modUpperEnabled=data.modUpperEnabled!==false;if(out.mode==='full'){out.modLowerEnabled=true;out.modUpperEnabled=true;}
 const derivedB=layerB||{...out,osc1Wave:'pulse',osc2Wave:'saw',osc2Tune:Math.min(1,out.osc2Tune+.035),cutoff:Math.max(.08,out.cutoff-.07),resonance:Math.min(.9,out.resonance+.04),ampAttack:Math.min(1,out.ampAttack+.025)};
 out.layerB=cleanLayer(derivedB);return out;
};
class OBXaApp{
 constructor(){
  this.engine=new WorkletEngine(new URL('./engine/OBXaProcessor.js?v=20261106-audio-r1',import.meta.url).href,'obxa-processor');
  power('obxa-power',()=>this.engine.start(),()=>{this.perf?.flushPending();this.display?.set('OB-Xa READY',this.patch.voiceCount+' VOICES · TWO CONTROL GROUPS');});
  this.patch=validate(DEF);this.layerIndex=0;this.ui={};this.store=new PresetStore({key:'overture.obxa.programs',version:3,validate});this.build();
  this.perf=performance(this.shell,{notes:NOTES,octaves:5,startOctave:2,started:()=>this.engine.started,midiStatusEl:this.midi,handlers:{
   noteOn:(n,v)=>this.engine.noteOn(n,v),noteOff:n=>this.engine.noteOff(n),bend:v=>this.engine.setPitchBend(v),mod:v=>this.engine.setModWheel(v),
   sustain:d=>this.engine.setSustain(d),allOff:()=>this.engine.allNotesOff(),program:p=>this.presets.load('f:'+(p%OBXA_PRESETS.length)),
   cc:(cc,value)=>{if(cc===7)this.ui.master.setValue(value/127);if(cc===74)this.ui.cutoff.setValue(value/127);if(cc===71)this.ui.resonance.setValue(value/127);}
  }});
  this.presets.load('f:0');
 }
 currentLayer(){return this.layerIndex===1?this.patch.layerB:this.patch;}
 set(key,value){
  const global=GLOBAL_KEYS.has(key);
  if(global){this.patch[key]=value;if(key==='bendNarrow'){this.patch.bendRange=value?2:12;this.engine.post({t:'param',key:'bendRange',value:this.patch.bendRange,layer:0});}if(['mode','voiceCount','unison','chordMode','transposeDown','transposeUp'].includes(key))this.engine.allNotesOff();if(key==='hold')this.engine.post({t:'hold',value:!!value});}
  else this.currentLayer()[key]=value;
  this.engine.post({t:'param',key,value,layer:global?0:this.layerIndex});this.updateLayoutState();
 }
 selectLayer(value){this.layerIndex=Number(value)===1?1:0;this.renderLayerControls();this.display.set('EDIT TIMBRE '+(this.layerIndex?'B':'A'),'OB-Xa TWO-SYNTH PROGRAM');}
 setMasterTranspose(key,value){const other=key==='transposeDown'?'transposeUp':'transposeDown';if(value){this.patch[other]=false;this.engine.post({t:'param',key:other,value:false,layer:0});this.ui[other]?.setValue(false,true);}this.set(key,!!value);}
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
  this.ui.osc2Tune=knob(ok,{label:'OSC 2 DETUNE',min:-1,max:1,value:this.currentLayer().osc2Tune,formatValue:v=>(Math.round(v*60)/2).toFixed(1)+' ST',onChange:v=>this.set('osc2Tune',Math.round(v*60)/60)});
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
  const modulation=section(rows,'MODULATION','TWO FOUR-VOICE LFO GROUPS · FREQUENCY AND PULSE-WIDTH ROUTING'),mk=el('div','pn-knobs',modulation.body);
  this.ui.lfoRate=knob(mk,{label:'LFO RATE',min:0,max:1,value:this.currentLayer().lfoRate,onChange:v=>this.set('lfoRate',v)});
  this.ui.lfoAmount=knob(mk,{label:'FREQUENCY DEPTH',min:0,max:1,value:this.currentLayer().lfoAmount,onChange:v=>this.set('lfoAmount',v)});
  this.ui.pulseWidthAmount=knob(mk,{label:'PULSE WIDTH DEPTH',min:0,max:1,value:this.currentLayer().pulseWidthAmount,onChange:v=>this.set('pulseWidthAmount',v)});
  this.ui.lfoWave=select(modulation.body,'LFO WAVEFORM',[{value:'sine',label:'SINE'},{value:'square',label:'SQUARE'},{value:'s&h',label:'SAMPLE / HOLD'}],this.currentLayer().lfoWave,v=>this.set('lfoWave',v));
  const pwRoutes=el('div','obxa-switch-row',modulation.body);
  this.ui.lfoPulse1=toggle(pwRoutes,'PULSE WIDTH · OSC 1',this.currentLayer().lfoPulse1,v=>this.set('lfoPulse1',v));
  this.ui.lfoPulse2=toggle(pwRoutes,'PULSE WIDTH · OSC 2',this.currentLayer().lfoPulse2,v=>this.set('lfoPulse2',v));
  const freqRoutes=el('div','obxa-switch-row',modulation.body);
  this.ui.lfoOsc1=toggle(freqRoutes,'OSC 1 FREQ',this.currentLayer().lfoOsc1,v=>this.set('lfoOsc1',v));
  this.ui.lfoOsc2=toggle(freqRoutes,'OSC 2 FREQ',this.currentLayer().lfoOsc2,v=>this.set('lfoOsc2',v));
  this.ui.lfoFilter=toggle(freqRoutes,'FILTER FREQ',this.currentLayer().lfoFilter,v=>this.set('lfoFilter',v));
  this.ui.bendOsc2Only=toggle(modulation.body,'OSC 2 ONLY',this.patch.bendOsc2Only,v=>this.set('bendOsc2Only',v));
  this.ui.bendNarrow=toggle(modulation.body,'NARROW PITCH BEND',this.patch.bendNarrow,v=>this.set('bendNarrow',v));
  const modAssign=el('div','obxa-switch-row',modulation.body);
  this.ui.modLowerEnabled=toggle(modAssign,'LOWER MOD / BEND',this.patch.modLowerEnabled,v=>this.set('modLowerEnabled',v));
  this.ui.modUpperEnabled=toggle(modAssign,'UPPER MOD / BEND',this.patch.modUpperEnabled,v=>this.set('modUpperEnabled',v));
  const transposeRow=el('div','obxa-switch-row',modulation.body);
  this.ui.transposeDown=toggle(transposeRow,'TRANSPOSE DOWN',this.patch.transposeDown,v=>this.setMasterTranspose('transposeDown',v));
  this.ui.transposeUp=toggle(transposeRow,'TRANSPOSE UP',this.patch.transposeUp,v=>this.setMasterTranspose('transposeUp',v));
  this.ui.hold=toggle(modulation.body,'HOLD / CAPTURE',this.patch.hold,v=>this.set('hold',v));
  this.ui.chordMode=toggle(modulation.body,'CHORD MEMORY',this.patch.chordMode,v=>this.set('chordMode',v));
  this.ui.clearChord=button(modulation.body,'CLEAR CHORD',()=>{this.engine.post({t:'clearChord'});this.display.set('CHORD MEMORY CLEARED','PLAY AND HOLD A NEW CHORD');});
  el('p','pn-help',modulation.body,'With HOLD enabled, play a chord and release the keys to capture it. Turn HOLD off to release the sound; enable CHORD MEMORY to play the stored intervals from another root. In SPLIT and DOUBLE, LOWER and UPPER assign modulation and pitch bend to each voice group. Both assignments stay on in FULL mode.');
  const allocation=section(rows,'KEYBOARD & VOICE ALLOCATION','FULL · SPLIT · DOUBLE · PROGRAMMABLE VOICE BANKS'),ak=el('div','pn-knobs',allocation.body);
  this.ui.mode=select(allocation.body,'KEYBOARD MODE',[{value:'full',label:'FULL · POLY'},{value:'split',label:'SPLIT'},{value:'double',label:'DOUBLE / LAYER'}],this.patch.mode,v=>this.set('mode',v));
  this.ui.voiceCount=select(allocation.body,'VOICE CONFIGURATION',[{value:'4',label:'4 VOICES'},{value:'6',label:'6 VOICES'},{value:'8',label:'8 VOICES'}],String(this.patch.voiceCount),v=>this.set('voiceCount',Number(v)));
  this.ui.splitPoint=knob(ak,{label:'SPLIT POINT',min:36,max:96,value:this.patch.splitPoint,formatValue:v=>NOTE_NAMES[Math.round(v)%12]+(Math.floor(Math.round(v)/12)-1),onChange:v=>this.set('splitPoint',Math.round(v))});
  this.ui.layerBalance=knob(ak,{label:'LOWER / UPPER BALANCE',min:0,max:1,value:this.patch.layerBalance,formatValue:v=>Math.round(v*100)+'% UPPER',onChange:v=>this.set('layerBalance',v)});
  this.ui.unison=toggle(allocation.body,'UNISON',this.patch.unison,v=>this.set('unison',v));
  this.ui.unisonDetune=knob(ak,{label:'UNISON DETUNE',min:0,max:1,value:this.patch.unisonDetune,onChange:v=>this.set('unisonDetune',v)});
  this.ui.transpose=knob(ak,{label:'TIMBRE TRANSPOSE',min:-24,max:24,value:this.currentLayer().transpose,formatValue:v=>(Math.round(v)>0?'+':'')+Math.round(v)+' ST',onChange:v=>this.set('transpose',Math.round(v))});
  this.ui.portamento=knob(ak,{label:'PORTAMENTO',min:0,max:1,value:this.currentLayer().portamento,onChange:v=>this.set('portamento',v)});
  this.ui.portamentoMode=select(allocation.body,'GLIDE MODE',[{value:'linear',label:'LINEAR'},{value:'quantized',label:'QUANTIZED'}],this.patch.portamentoMode,v=>this.set('portamentoMode',v));
  this.ui.portamentoOffset=toggle(allocation.body,'PORTAMENTO OFFSET',this.patch.portamentoOffset,v=>this.set('portamentoOffset',v));
  this.ui.bendRange=knob(ak,{label:'PITCH BEND RANGE',min:1,max:12,value:this.patch.bendRange,formatValue:v=>Math.round(v)+' ST',onChange:v=>this.set('bendRange',Math.round(v))});
  this.ui.masterTune=knob(ak,{label:'MASTER TUNE',min:-1,max:1,value:this.patch.masterTune,formatValue:v=>(v*100).toFixed(0)+' CENT',onChange:v=>this.set('masterTune',v)});
  this.ui.master=knob(ak,{label:'MASTER VOLUME',min:0,max:1,value:this.patch.master,onChange:v=>this.set('master',v)});
  this.ui.layerEdit=select(allocation.body,'EDIT TIMBRE',[{value:'0',label:'LOWER / A'},{value:'1',label:'UPPER / B'}],'0',v=>this.selectLayer(v));
  const memory=section(rows,'PROGRAMMER','OVERTURE OB-Xa PROGRAMS');
  this.presets=presetBar(memory.body,{factory:OBXA_PRESETS,store:this.store,display:this.display,filename:'oberheim-obxa-program',panic:()=>this.perf.allOff(),apply:(data,name)=>{this.patch=validate(data);this.layerIndex=0;this.refresh();this.display.set(name.toUpperCase(),'OB-Xa PROGRAM');},capture:()=>({...this.patch,layerB:{...this.patch.layerB}})});
  footer(this.shell,'OBERHEIM OB-Xa · 4 / 6 / 8 VOICES · DUAL VCO · SELECTABLE 2 / 4-POLE VCF · PINK NOISE · POLYPHONIC GLIDE');this.updateLayoutState();
 }
 refresh(){['mode','voiceCount','splitPoint','unison','unisonDetune','bendNarrow','bendOsc2Only','transposeDown','transposeUp','modLowerEnabled','modUpperEnabled','master','masterTune','hold','layerBalance','chordMode','portamentoMode','portamentoOffset'].forEach(key=>{if(this.ui[key]?.setValue)this.ui[key].setValue(this.patch[key],true);});this.renderLayerControls();this.updateLayoutState();this.engine.post({t:'patch',patch:this.patch});}
}
new OBXaApp();