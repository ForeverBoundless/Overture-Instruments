import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el, section, knob, select, toggle, display, performance, power, presetBar, footer } from './shared/panel.js';
import { OBXA_PRESETS } from './data/obx-a-presets.js';

const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES=Array.from({length:61},(_,i)=>{const n=36+i;return NOTE_NAMES[n%12]+(Math.floor(n/12)-1);});
const DEF={...OBXA_PRESETS[0].data};
const GLOBAL_KEYS=new Set(['mode','splitPoint','unisonDetune','bendRange','bendOsc2Only','master']);
const LAYER_KEYS=['osc1Wave','osc2Wave','osc1Range','fEnvOsc2','osc1Level','osc2Level','osc2Tune','pulseWidth','sync','cutoff','resonance','filterMode','filterEnv','filterTrack','filterAttack','filterDecay','filterSustain','filterRelease','ampAttack','ampDecay','ampSustain','ampRelease','lfoRate','lfoAmount','lfoWave','lfoTarget','osc1Route','osc2Route','osc2Half','noiseRoute'];
const cleanLayer=(source)=>{
 const out={...DEF,...source};
 ['osc1Level','osc2Level','pulseWidth','cutoff','resonance','filterEnv','filterAttack','filterDecay','filterSustain','filterRelease','ampAttack','ampDecay','ampSustain','ampRelease','lfoRate','lfoAmount'].forEach(k=>out[k]=Math.max(0,Math.min(1,Number(out[k])||0)));
 out.osc1Range=Math.max(-2,Math.min(2,Number(out.osc1Range)||0));
 out.osc2Tune=Math.max(-1,Math.min(1,Number(out.osc2Tune)||0));
 ['osc1Wave','osc2Wave'].forEach(k=>out[k]=['saw','pulse','sawPulse','triangle'].includes(out[k])?out[k]:'saw');
 ['fEnvOsc2','filterTrack','osc1Route','osc2Route','osc2Half','noiseRoute'].forEach(k=>out[k]=!!out[k]);
 delete out.noise;delete out.crossMod;delete out.filterKeyTrack;
 out.filterMode=['12','24'].includes(String(out.filterMode))?String(out.filterMode):'24';
 out.lfoWave=['sine','square','saw','s&h'].includes(out.lfoWave)?out.lfoWave:'sine';
 out.lfoTarget=['osc1','osc2','both','filter','pulse'].includes(out.lfoTarget)?out.lfoTarget:'both';
 out.sync=!!out.sync;
 return out;
};
const validate=(data)=>{
 if(!data||typeof data!=='object')throw new Error('Not an OB-Xa program.');
 const {layerB,...rootSource}=data;
 const out=cleanLayer(rootSource);
 out.mode=['poly','unison','double','split'].includes(out.mode)?out.mode:'poly';
 out.splitPoint=Math.max(36,Math.min(96,Math.round(Number(out.splitPoint)||60)));
 out.unisonDetune=Math.max(0,Math.min(1,Number(out.unisonDetune)||0));
 out.bendRange=Math.max(1,Math.min(12,Math.round(Number(out.bendRange)||2)));
 out.master=Math.max(0,Math.min(1,Number(out.master)||0));
 const derivedB=layerB||{...out,osc1Wave:'pulse',osc2Wave:'saw',osc2Tune:Math.min(1,out.osc2Tune+.035),cutoff:Math.max(.08,out.cutoff-.07),resonance:Math.min(.9,out.resonance+.04),ampAttack:Math.min(1,out.ampAttack+.025)};
 out.layerB=cleanLayer(derivedB);
 return out;
};
class OBXaApp{
 constructor(){
  this.engine=new WorkletEngine(new URL('./engine/OBXaProcessor.js?v=20261105-obxa-layers',import.meta.url).href,'obxa-processor');
  this.patch=validate(DEF);this.layerIndex=0;this.ui={};
  this.store=new PresetStore({key:'overture.obxa.programs',version:1,validate});
  this.build();
  this.perf=performance(this.shell,{notes:NOTES,octaves:5,startOctave:2,started:()=>this.engine.started,midiStatusEl:this.midi,handlers:{
   noteOn:(n,v)=>this.engine.noteOn(n,v),noteOff:n=>this.engine.noteOff(n),bend:v=>this.engine.setPitchBend(v),
   mod:v=>this.engine.setModWheel(v),sustain:d=>this.engine.setSustain(d),allOff:()=>this.engine.allNotesOff(),
   program:p=>this.presets.load('f:'+(p%OBXA_PRESETS.length)),
   cc:(cc,value)=>{if(cc===7)this.ui.master.setValue(value/127);if(cc===74)this.ui.cutoff.setValue(value/127);if(cc===71)this.ui.resonance.setValue(value/127);},
  }});
  power('obxa-power',()=>this.engine.start(),()=>{this.perf.flushPending();this.display.set('OB-Xa READY','EIGHT VOICES ONLINE');});
  this.presets.load('f:0');
 }
 currentLayer(){return this.layerIndex===1?this.patch.layerB:this.patch;}
 set(key,value){
  const global=GLOBAL_KEYS.has(key);
  if(global){this.patch[key]=value;if(key==='mode')this.engine.allNotesOff();}
  else this.currentLayer()[key]=value;
  this.engine.post({t:'param',key,value,layer:global?0:this.layerIndex});
 }
 selectLayer(value){
  this.layerIndex=Number(value)===1?1:0;
  this.renderLayerControls();
  this.display.set('EDIT LAYER '+(this.layerIndex?'B':'A'),'OB-Xa TWO-TIMBRE PROGRAM');
 }
 renderLayerControls(){
  const source=this.currentLayer();
  LAYER_KEYS.forEach(key=>{if(this.ui[key]?.setValue)this.ui[key].setValue(source[key],true);});
  if(this.ui.layerEdit)this.ui.layerEdit.setValue(String(this.layerIndex),true);
 }
 build(){
  const page=el('div','pn-page obxa-page',document.getElementById('obxa-root'));
  this.shell=el('main','pn-shell obxa-shell',page);
  const header=el('header','pn-header obxa-header',this.shell);
  el('div','obxa-brand',header).innerHTML='<strong>OBERHEIM</strong><span>OB-Xa · POLYPHONIC ANALOG SYNTHESIZER</span>';
  const right=el('div','pn-header-right',header);this.display=display(right);this.midi=el('div','pn-midi',right,'MIDI: searching…');
  const rows=el('div','pn-rows',this.shell);
  const top=el('div','pn-row obxa-top',rows);
  const oscillators=section(top,'OSCILLATORS','TWO VCOs PER VOICE');
  const ok=el('div','pn-knobs',oscillators.body);
  this.ui.osc1Range=knob(ok,{label:'OSC 1 OCTAVES',min:-2,max:2,value:this.currentLayer().osc1Range,formatValue:v=>v.toFixed(1)+' oct',onChange:v=>this.set('osc1Range',v)});
  this.ui.osc1Level=knob(ok,{label:'OSC 1 LEVEL',min:0,max:1,value:this.currentLayer().osc1Level,onChange:v=>this.set('osc1Level',v)});
  this.ui.osc2Level=knob(ok,{label:'OSC 2 LEVEL',min:0,max:1,value:this.currentLayer().osc2Level,onChange:v=>this.set('osc2Level',v)});
  this.ui.osc2Tune=knob(ok,{label:'OSC 2 RANGE',min:-1,max:1,value:this.currentLayer().osc2Tune,formatValue:v=>(v*30).toFixed(1)+' st',onChange:v=>this.set('osc2Tune',v)});
  this.ui.pulseWidth=knob(ok,{label:'PULSE WIDTH',min:0,max:1,value:this.currentLayer().pulseWidth,onChange:v=>this.set('pulseWidth',v)});
  this.ui.osc1Wave=select(oscillators.body,'OSC 1 SHAPE',[{value:'saw',label:'SAWTOOTH'},{value:'pulse',label:'PULSE'},{value:'sawPulse',label:'SAW + PULSE'}],this.currentLayer().osc1Wave,v=>this.set('osc1Wave',v));
  this.ui.osc2Wave=select(oscillators.body,'OSC 2 SHAPE',[{value:'saw',label:'SAWTOOTH'},{value:'pulse',label:'PULSE'},{value:'sawPulse',label:'SAW + PULSE'}],this.currentLayer().osc2Wave,v=>this.set('osc2Wave',v));
  this.ui.fEnvOsc2=toggle(oscillators.body,'F-ENV → OSC 2',this.currentLayer().fEnvOsc2,v=>this.set('fEnvOsc2',v));
  this.ui.sync=toggle(oscillators.body,'OSC SYNC',this.currentLayer().sync,v=>this.set('sync',v));
  const filter=section(top,'FILTER','CURTIS-STYLE LOW-PASS · 2 OR 4 POLE');
  const fk=el('div','pn-knobs',filter.body);
  this.ui.cutoff=knob(fk,{label:'FREQUENCY',min:0,max:1,value:this.currentLayer().cutoff,onChange:v=>this.set('cutoff',v)});
  this.ui.resonance=knob(fk,{label:'RESONANCE',min:0,max:1,value:this.currentLayer().resonance,onChange:v=>this.set('resonance',v)});
  this.ui.filterEnv=knob(fk,{label:'ENVELOPE AMOUNT',min:0,max:1,value:this.currentLayer().filterEnv,onChange:v=>this.set('filterEnv',v)});
  this.ui.filterKeyTrack=knob(fk,{label:'KEYBOARD TRACK',min:0,max:1,value:this.currentLayer().filterKeyTrack,onChange:v=>this.set('filterKeyTrack',v)});
  this.ui.filterMode=select(filter.body,'SLOPE',[{value:'12',label:'12 dB / OCT'},{value:'24',label:'24 dB / OCT'}],this.currentLayer().filterMode,v=>this.set('filterMode',v));
  const env=section(rows,'ENVELOPES','INDEPENDENT FILTER AND AMPLIFIER ADSR');
  const eg=el('div','obxa-envelope-grid',env.body);
  const makeEnvelope=(parent,title,prefix)=>{
   const box=el('div','obxa-envelope',parent);el('h3','',box,title);const k=el('div','pn-knobs',box);
   [['Attack','Attack'],['Decay','Decay'],['Sustain','Sustain'],['Release','Release']].forEach(([label,suffix])=>{
    const key=prefix+suffix;
    this.ui[key]=knob(k,{label,min:0,max:1,value:this.currentLayer()[key],onChange:v=>this.set(key,v)});
   });
  };
  makeEnvelope(eg,'FILTER ENVELOPE','filter');makeEnvelope(eg,'AMPLIFIER ENVELOPE','amp');
  const modulation=section(rows,'MODULATION & PERFORMANCE','PROGRAM MEMORY · VOICE ALLOCATION · DUAL TIMBRE');
  const mk=el('div','pn-knobs',modulation.body);
  this.ui.lfoRate=knob(mk,{label:'LFO RATE',min:0,max:1,value:this.currentLayer().lfoRate,onChange:v=>this.set('lfoRate',v)});
  this.ui.lfoAmount=knob(mk,{label:'LFO AMOUNT',min:0,max:1,value:this.currentLayer().lfoAmount,onChange:v=>this.set('lfoAmount',v)});
  this.ui.bendRange=knob(mk,{label:'BEND RANGE',min:1,max:12,value:this.patch.bendRange,formatValue:v=>Math.round(v)+' st',onChange:v=>this.set('bendRange',Math.round(v))});
  this.ui.master=knob(mk,{label:'MASTER',min:0,max:1,value:this.patch.master,onChange:v=>{this.set('master',v);this.engine.setVolume(v);}});
  this.ui.lfoWave=select(modulation.body,'LFO SHAPE',[{value:'sine',label:'SINE'},{value:'square',label:'SQUARE'},{value:'saw',label:'SAWTOOTH'},{value:'s&h',label:'SAMPLE & HOLD'}],this.currentLayer().lfoWave,v=>this.set('lfoWave',v));
  this.ui.lfoTarget=select(modulation.body,'FREQUENCY MODULATION',[{value:'both',label:'OSC 1 + OSC 2'},{value:'osc1',label:'OSC 1 ONLY'},{value:'osc2',label:'OSC 2 ONLY'},{value:'filter',label:'FILTER CUTOFF'},{value:'pulse',label:'PULSE WIDTH'}],this.currentLayer().lfoTarget,v=>this.set('lfoTarget',v));
  this.ui.bendOsc2Only=toggle(modulation.body,'BEND OSC 2 ONLY',this.patch.bendOsc2Only,v=>this.set('bendOsc2Only',v));
  const sourceSwitches=section(rows,'FILTER SOURCE & TRACKING','OSCILLATOR / NOISE ROUTING');
  this.ui.osc1Route=toggle(sourceSwitches.body,'OSC 1',this.currentLayer().osc1Route,v=>this.set('osc1Route',v));
  this.ui.osc2Route=toggle(sourceSwitches.body,'OSC 2',this.currentLayer().osc2Route,v=>this.set('osc2Route',v));
  this.ui.osc2Half=toggle(sourceSwitches.body,'OSC 2 HALF LEVEL',this.currentLayer().osc2Half,v=>this.set('osc2Half',v));
  this.ui.noiseRoute=toggle(sourceSwitches.body,'NOISE',this.currentLayer().noiseRoute,v=>this.set('noiseRoute',v));
  this.ui.filterTrack=toggle(sourceSwitches.body,'KEYBOARD TRACK',this.currentLayer().filterTrack,v=>this.set('filterTrack',v));
  this.ui.mode=select(modulation.body,'VOICE MODE',[{value:'poly',label:'POLYPHONIC'},{value:'unison',label:'UNISON'},{value:'double',label:'DOUBLE / LAYER'},{value:'split',label:'SPLIT'}],this.patch.mode,v=>this.set('mode',v));
  this.ui.splitPoint=knob(mk,{label:'SPLIT POINT',min:36,max:96,value:this.patch.splitPoint,formatValue:v=>NOTE_NAMES[Math.round(v)%12]+(Math.floor(Math.round(v)/12)-1),onChange:v=>this.set('splitPoint',Math.round(v))});
  this.ui.unisonDetune=knob(mk,{label:'UNISON SPREAD',min:0,max:1,value:this.patch.unisonDetune,onChange:v=>this.set('unisonDetune',v)});
  this.ui.layerEdit=select(modulation.body,'EDIT TIMBRE',[{value:'0',label:'LAYER A'},{value:'1',label:'LAYER B'}],'0',v=>this.selectLayer(v));
  const memory=section(rows,'PROGRAMMER','OVERTURE OB-Xa-STYLE PROGRAMS');
  this.presets=presetBar(memory.body,{factory:OBXA_PRESETS,store:this.store,display:this.display,filename:'oberheim-obxa-program',panic:()=>this.perf.allOff(),
   apply:(data,name)=>{this.patch=validate(data);this.layerIndex=0;this.refresh();this.display.set(name.toUpperCase(),'OB-Xa PROGRAM');},
   capture:()=>({...this.patch,layerB:{...this.patch.layerB}})});
  footer(this.shell,'OBERHEIM OB-Xa · 8-VOICE MODEL · DUAL VCOs · DUAL VCFs · SPLIT & DOUBLE · ESC PANIC');
 }
 refresh(){
  ['mode','splitPoint','unisonDetune','bendRange','master'].forEach(key=>{if(this.ui[key]?.setValue)this.ui[key].setValue(this.patch[key],true);});
  this.renderLayerControls();
  this.engine.post({t:'patch',patch:this.patch});
 }
}
new OBXaApp();
