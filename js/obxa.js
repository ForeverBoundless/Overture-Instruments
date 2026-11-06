import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el, section, knob, select, toggle, display, performance, power, presetBar, footer } from './shared/panel.js';
import { OBXA_PRESETS } from './data/obx-a-presets.js';
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES=Array.from({length:61},(_,i)=>{const n=36+i;return NOTE_NAMES[n%12]+(Math.floor(n/12)-1);});
const DEF={...OBXA_PRESETS[0].data};
const validate=(data)=>{
 if(!data||typeof data!=='object')throw new Error('Not an OB-Xa program.');
 const out={...DEF,...data};
 ['osc1Level','osc2Level','pulseWidth','noise','crossMod','cutoff','resonance','filterEnv','filterKeyTrack','filterAttack','filterDecay','filterSustain','filterRelease','ampAttack','ampDecay','ampSustain','ampRelease','lfoRate','lfoAmount','master','unisonDetune'].forEach(k=>out[k]=Math.max(0,Math.min(1,Number(out[k])||0)));
 out.osc2Tune=Math.max(-1,Math.min(1,Number(out.osc2Tune)||0));
 ['osc1Wave','osc2Wave'].forEach(k=>out[k]=['saw','pulse','triangle'].includes(out[k])?out[k]:'saw');
 out.filterMode=['12','24'].includes(String(out.filterMode))?String(out.filterMode):'24';
 out.lfoWave=['triangle','square','saw'].includes(out.lfoWave)?out.lfoWave:'triangle';
 out.lfoTarget=['pitch','filter','pulse'].includes(out.lfoTarget)?out.lfoTarget:'pitch';
 out.mode=['poly','unison'].includes(out.mode)?out.mode:'poly';
 out.splitPoint=Math.max(36,Math.min(96,Math.round(Number(out.splitPoint)||60)));
 out.bendRange=Math.max(1,Math.min(12,Math.round(Number(out.bendRange)||2)));
 out.sync=!!out.sync;
 return out;
};
class OBXaApp{
 constructor(){
  this.engine=new WorkletEngine(new URL('./engine/OBXaProcessor.js?v=20261105-obxa',import.meta.url).href,'obxa-processor');
  this.patch=validate(DEF);this.ui={};
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
 set(key,value){this.patch[key]=value;this.engine.post({t:'param',key,value});}
 build(){
  const page=el('div','pn-page obxa-page',document.getElementById('obxa-root'));
  this.shell=el('main','pn-shell obxa-shell',page);
  const header=el('header','pn-header obxa-header',this.shell);
  el('div','obxa-brand',header).innerHTML='<strong>OBERHEIM</strong><span>OB-Xa · POLYPHONIC SYNTHESIZER</span>';
  const right=el('div','pn-header-right',header);this.display=display(right);this.midi=el('div','pn-midi',right,'MIDI: searching…');
  const rows=el('div','pn-rows',this.shell);
  const top=el('div','pn-row obxa-top',rows);
  const oscillators=section(top,'OSCILLATORS','TWO VCOs PER VOICE');
  const ok=el('div','pn-knobs',oscillators.body);
  this.ui.osc1Level=knob(ok,{label:'OSC 1 LEVEL',min:0,max:1,value:this.patch.osc1Level,onChange:v=>this.set('osc1Level',v)});
  this.ui.osc2Level=knob(ok,{label:'OSC 2 LEVEL',min:0,max:1,value:this.patch.osc2Level,onChange:v=>this.set('osc2Level',v)});
  this.ui.osc2Tune=knob(ok,{label:'OSC 2 SEMITONES',min:-1,max:1,value:this.patch.osc2Tune,formatValue:v=>(v*12).toFixed(1)+' st',onChange:v=>this.set('osc2Tune',v)});
  this.ui.pulseWidth=knob(ok,{label:'PULSE WIDTH',min:0,max:1,value:this.patch.pulseWidth,onChange:v=>this.set('pulseWidth',v)});
  this.ui.noise=knob(ok,{label:'NOISE',min:0,max:1,value:this.patch.noise,onChange:v=>this.set('noise',v)});
  this.ui.osc1Wave=select(oscillators.body,'OSC 1 SHAPE',[{value:'saw',label:'SAWTOOTH'},{value:'pulse',label:'PULSE'}],this.patch.osc1Wave,v=>this.set('osc1Wave',v));
  this.ui.osc2Wave=select(oscillators.body,'OSC 2 SHAPE',[{value:'saw',label:'SAWTOOTH'},{value:'pulse',label:'PULSE'},{value:'triangle',label:'TRIANGLE'}],this.patch.osc2Wave,v=>this.set('osc2Wave',v));
  this.ui.sync=toggle(oscillators.body,'OSC SYNC',this.patch.sync,v=>this.set('sync',v));
  this.ui.crossMod=knob(ok,{label:'CROSS MOD',min:0,max:1,value:this.patch.crossMod,onChange:v=>this.set('crossMod',v)});
  const filter=section(top,'FILTER','CEM-STYLE LOW-PASS · 2 OR 4 POLE');
  const fk=el('div','pn-knobs',filter.body);
  this.ui.cutoff=knob(fk,{label:'FREQUENCY',min:0,max:1,value:this.patch.cutoff,onChange:v=>this.set('cutoff',v)});
  this.ui.resonance=knob(fk,{label:'RESONANCE',min:0,max:1,value:this.patch.resonance,onChange:v=>this.set('resonance',v)});
  this.ui.filterEnv=knob(fk,{label:'ENVELOPE AMOUNT',min:0,max:1,value:this.patch.filterEnv,onChange:v=>this.set('filterEnv',v)});
  this.ui.filterKeyTrack=knob(fk,{label:'KEYBOARD TRACK',min:0,max:1,value:this.patch.filterKeyTrack,onChange:v=>this.set('filterKeyTrack',v)});
  this.ui.filterMode=select(filter.body,'SLOPE',[{value:'12',label:'12 dB / OCT'},{value:'24',label:'24 dB / OCT'}],this.patch.filterMode,v=>this.set('filterMode',v));
  const env=section(rows,'ENVELOPES','INDEPENDENT FILTER AND AMPLIFIER ADSR');
  const eg=el('div','obxa-envelope-grid',env.body);
  const makeEnvelope=(parent,title,prefix)=>{
   const box=el('div','obxa-envelope',parent);el('h3','',box,title);const k=el('div','pn-knobs',box);
   [['Attack','Attack'],['Decay','Decay'],['Sustain','Sustain'],['Release','Release']].forEach(([label,suffix])=>{
    const key=prefix+suffix;
    this.ui[key]=knob(k,{label,min:0,max:1,value:this.patch[key],onChange:v=>this.set(key,v)});
   });
  };
  makeEnvelope(eg,'FILTER ENVELOPE','filter');makeEnvelope(eg,'AMPLIFIER ENVELOPE','amp');
  const modulation=section(rows,'MODULATION & PERFORMANCE','LFO · VOICE ALLOCATION · POLYPHONY');
  const mk=el('div','pn-knobs',modulation.body);
  this.ui.lfoRate=knob(mk,{label:'LFO RATE',min:0,max:1,value:this.patch.lfoRate,onChange:v=>this.set('lfoRate',v)});
  this.ui.lfoAmount=knob(mk,{label:'LFO AMOUNT',min:0,max:1,value:this.patch.lfoAmount,onChange:v=>this.set('lfoAmount',v)});
  this.ui.bendRange=knob(mk,{label:'BEND RANGE',min:1,max:12,value:this.patch.bendRange,formatValue:v=>Math.round(v)+' st',onChange:v=>this.set('bendRange',Math.round(v))});
  this.ui.master=knob(mk,{label:'MASTER',min:0,max:1,value:this.patch.master,onChange:v=>{this.set('master',v);this.engine.setVolume(v);}});
  this.ui.lfoWave=select(modulation.body,'LFO SHAPE',[{value:'triangle',label:'TRIANGLE'},{value:'square',label:'SQUARE'},{value:'saw',label:'SAWTOOTH'}],this.patch.lfoWave,v=>this.set('lfoWave',v));
  this.ui.lfoTarget=select(modulation.body,'MOD DESTINATION',[{value:'pitch',label:'OSCILLATOR FREQUENCY'},{value:'filter',label:'FILTER CUTOFF'},{value:'pulse',label:'PULSE WIDTH'}],this.patch.lfoTarget,v=>this.set('lfoTarget',v));
  this.ui.mode=select(modulation.body,'VOICE MODE',[{value:'poly',label:'POLYPHONIC'},{value:'unison',label:'UNISON'}],this.patch.mode,v=>this.set('mode',v));
  this.ui.unisonDetune=knob(mk,{label:'UNISON SPREAD',min:0,max:1,value:this.patch.unisonDetune,onChange:v=>this.set('unisonDetune',v)});
  const memory=section(rows,'PROGRAMMER','OVERTURE OB-Xa-STYLE PROGRAMS');
  this.presets=presetBar(memory.body,{factory:OBXA_PRESETS,store:this.store,display:this.display,filename:'oberheim-obxa-program',panic:()=>this.perf.allOff(),
   apply:(data,name)=>{this.patch=validate(data);this.refresh();this.display.set(name.toUpperCase(),'OB-Xa PROGRAM');},capture:()=>({...this.patch})});
  footer(this.shell,'OBERHEIM OB-Xa · 8-VOICE MODEL · 61-KEY RANGE · DUAL VCOs · 2-/4-POLE LOW-PASS · ESC PANIC');
 }
 refresh(){Object.entries(this.patch).forEach(([key,value])=>{if(this.ui[key]?.setValue)this.ui[key].setValue(value,true);});this.engine.post({t:'patch',patch:this.patch});}
}
new OBXaApp();
