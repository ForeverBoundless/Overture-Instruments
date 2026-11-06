import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { el, section, knob, select, toggle, display, performance, power, presetBar, footer } from './shared/panel.js';
import { registerMidiTargetProvider, registerMidiTarget } from './shared/midiMap.js';
import { HOHNER_D6_PRESETS } from './data/hohnerD6Presets.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES = Array.from({ length: 60 }, (_, i) => {
  const midi = 29 + i;
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
});
const PEDAL_DEFS = {
  compressor: { name: 'Compressor', subtitle: 'Sustain / level', controls: [['sustain','SUSTAIN',0,1,.45],['level','LEVEL',0,1,.75]] },
  overdrive: { name: 'Overdrive', subtitle: 'Analog drive / clipping', controls: [['drive','DRIVE',0,1,.24],['tone','TONE',0,1,.66],['level','LEVEL',0,1,.78]] },
  wah: { name: 'Wah', subtitle: 'Resonant filter', controls: [['position','POSITION',0,1,.5],['resonance','RESONANCE',0,1,.65],['mix','MIX',0,1,.75]] },
  phaser: { name: 'Phaser', subtitle: 'Four-stage sweep', controls: [['rate','RATE',0,1,.22],['depth','DEPTH',0,1,.5],['feedback','FEEDBACK',0,1,.15],['mix','MIX',0,1,.5]] },
  chorus: { name: 'Chorus', subtitle: 'Stereo modulation', controls: [['rate','RATE',0,1,.2],['depth','DEPTH',0,1,.5],['mix','MIX',0,1,.38]] },
  spring: { name: 'Spring Reverb', subtitle: 'Spring tank', controls: [['mix','MIX',0,1,.25],['decay','DECAY',0,1,.35]] },
};
const DEFAULT_PEDALS = Object.fromEntries(Object.entries(PEDAL_DEFS).map(([id, def]) => [id, {
  enabled: false, ...Object.fromEntries(def.controls.map(([key,label,min,max,value]) => [key, value])),
}]));
const DEF = { toneFilters: [true, false, false, false], pickup: 'bothIn', volume: .72, damping: .34, pedalboardEnabled: true, pedals: DEFAULT_PEDALS };
const LEGACY_TONES = [[true,false,false,false],[false,true,false,false],[false,false,true,false],[false,false,false,true]];
const clone = (value) => JSON.parse(JSON.stringify(value));
const validate = (data) => {
  if (!data || typeof data !== 'object') throw new Error('Not a D6 program.');
  const out = { ...DEF, ...data, pedals: clone(DEFAULT_PEDALS) };
  out.toneFilters = Array.isArray(data.toneFilters)
    ? Array.from({length:4},(_,i)=>!!data.toneFilters[i])
    : LEGACY_TONES[Math.round(Math.min(3,Math.max(0,Number(data.tone)||0)))];
  delete out.tone;
  out.pickup = ['bridge','neck','bothIn','bothOut'].includes(data.pickup) ? data.pickup : 'bothIn';
  out.volume = Math.min(1, Math.max(0, Number(data.volume) || 0));
  out.damping = Math.min(1, Math.max(0, Number(data.damping) || 0));
  out.pedalboardEnabled = data.pedalboardEnabled !== false;
  Object.entries(DEFAULT_PEDALS).forEach(([id, values]) => {
    const supplied = data.pedals && data.pedals[id] ? data.pedals[id] : {};
    out.pedals[id] = { ...values, ...supplied, enabled: !!supplied.enabled };
    Object.keys(values).forEach((key) => {
      if (key !== 'enabled') out.pedals[id][key] = Math.min(1, Math.max(0, Number(out.pedals[id][key]) || 0));
    });
  });
  return out;
};
class HohnerD6App {
  constructor() {
    this.engine = new WorkletEngine(new URL('./engine/HohnerD6Processor.js?v=20261106-audio-r1', import.meta.url).href, 'hohner-d6-processor');
    this.patch = validate(HOHNER_D6_PRESETS[0].data);
    this.ui = {}; this.pedalUi = {}; this.pedalSwitches = {};
    this.store = new PresetStore({ key: 'overture.hohner-d6.programs', version: 1, validate });
    this.build();
    this.perf = performance(this.shell, {
      notes: NOTES, octaves: 5, startOctave: 1, wheels: false,
      started: () => this.engine.started, midiStatusEl: this.midi,
      handlers: {
        noteOn: (n,v) => this.engine.noteOn(n,v), noteOff: (n) => this.engine.noteOff(n),
        bend: (v) => this.engine.setPitchBend(v), sustain: (v) => this.engine.setSustain(v),
        allOff: () => this.engine.allNotesOff(),
        program: (p) => this.presets.load('f:' + (p % HOHNER_D6_PRESETS.length)),
        cc: (cc,value) => { if (cc === 7) this.ui.volume.setValue(value / 127); if (cc === 74) { if(this.damperRange)this.damperRange.value=String(value / 127); this.set('damping',value / 127); } },
      },
    });
    this.buildPedals(this.page);
    footer(this.page,'HOHNER D6 · 60 NOTES · TWO MAGNETIC PICKUPS · FOUR FILTERS · PEDALBOARD IS A SEPARATE SIGNAL CHAIN');
    this.addDamperSlider();
    power('hohner-power', () => this.engine.start(), () => {
      this.perf.flushPending(); this.display.set('D6 READY','60 STRINGS · PICKUPS ONLINE');
    });
    this.presets.load('f:0');
    registerMidiTargetProvider(() => Object.entries(this.pedalSwitches).map(([id, button]) => ({
      id: 'pedal:' + id + ':bypass', label: PEDAL_DEFS[id].name + ' bypass', group: 'PEDALBOARD',
      get: () => this.patch.pedals[id].enabled ? 1 : 0,
      set: (value) => this.setPedal(id, { enabled: value >= .5 }), el: button,
    })));
  }
  set(key, value) {
    this.patch[key] = value;
    this.engine.post({ t: 'param', key, value });
  }
  setPedal(id, patch) {
    Object.assign(this.patch.pedals[id], patch);
    this.engine.post({ t: 'pedal', name: id, values: patch });
    const button = this.pedalSwitches[id];
    if (button) {
      button.classList.toggle('is-on', this.patch.pedals[id].enabled);
      button.setAttribute('aria-pressed', String(this.patch.pedals[id].enabled));
      button.querySelector('span').textContent = this.patch.pedals[id].enabled ? 'ON' : 'OFF';
    }
  }
  build() {
    this.page = el('div','pn-page d6-page',document.getElementById('hohner-d6-root'));
    this.shell = el('main','pn-shell d6-shell',this.page);
    const header = el('header','pn-header d6-header',this.shell);
    el('div','pn-brand d6-brand',header).innerHTML = '<div class="d6-wordmark"><strong>HOHNER</strong><span>MADE IN GERMANY</span></div><div class="pn-model"><b>CLAVINET D6</b><span>ELECTROMECHANICAL KEYBOARD · 1971</span></div>';
    const right = el('div','pn-header-right',header);
    this.display = display(right); this.midi = el('div','pn-midi',right,'MIDI: searching…');
    const rows = el('div','pn-rows',this.shell);
    const top = el('div','pn-row d6-controls',rows);
    const strings = section(top,'STRING & PICKUP SYSTEM','60 TANGENT-ACTUATED STRINGS');
    const pick = el('div','d6-pickup-options',strings.body);
    const pickupAB = el('div','d6-pickup-group',pick); el('span','d6-pickup-label',pickupAB,'A / B · PICKUP / PHASE');
    const abButtons = el('div','d6-pickup-buttons',pickupAB); this.pickupButtons = { ab: {}, cd: {} };
    ['A','B'].forEach((value)=>{const b=el('button','d6-pickup-switch',abButtons,value);b.type='button';b.addEventListener('click',()=>this.setPickupSwitch('ab',value));this.pickupButtons.ab[value]=b;});
    const pickupCD = el('div','d6-pickup-group',pick); el('span','d6-pickup-label',pickupCD,'C / D · SINGLE / BOTH PICKUPS');
    const cdButtons = el('div','d6-pickup-buttons',pickupCD);
    ['C','D'].forEach((value)=>{const b=el('button','d6-pickup-switch',cdButtons,value);b.type='button';b.addEventListener('click',()=>this.setPickupSwitch('cd',value));this.pickupButtons.cd[value]=b;});
    const tone = section(top,'TONE SELECTOR','FOUR MECHANICAL ROCKER FILTERS');
    const toneButtons = el('div','d6-tone-switches',tone.body);
    ['BRILLIANT','TREBLE','MEDIUM','SOFT'].forEach((label,index) => {
      const b = el('button','d6-rocker',toneButtons);
      b.type = 'button'; b.innerHTML = '<span>' + String(index+1).padStart(2,'0') + '</span><b>' + label + '</b>';
      b.addEventListener('click',()=>{const next=this.patch.toneFilters.slice();next[index]=!next[index];this.set('toneFilters',next);this.updateToneButtons();});
      this.toneButtons ||= []; this.toneButtons.push(b);
    });
    const level = section(top,'ONBOARD OUTPUT','VOLUME CONTROL');
    const knobs = el('div','pn-knobs',level.body);
    this.ui.volume = knob(knobs,{label:'VOLUME',min:0,max:1,value:this.patch.volume,onChange:(v)=>this.set('volume',v)});
    const memory = section(rows,'PROGRAM MEMORY','OVERTURE CLAVINET REGISTRATIONS');
    this.presets = presetBar(memory.body,{factory:HOHNER_D6_PRESETS,store:this.store,display:this.display,filename:'hohner-d6-program',
      panic:()=>this.perf.allOff(),apply:(data,name)=>{this.patch=validate(data);this.refresh();this.display.set(name.toUpperCase(),'CLAVINET D6 PROGRAM');},
      capture:()=>clone(this.patch)});
    
    this.updateToneButtons();
  }
  buildPedals(parent) {
    const board = el('section','d6-pedalboard',parent);
    const head = el('header','d6-pedalboard__head',board);
    const title = el('div','',head); el('h2','',title,'EFFECTS PEDALBOARD'); el('p','',title,'INDEPENDENT STOMPBOXES · SERIAL SIGNAL CHAIN');
    this.ui.pedalboardEnabled = toggle(head,'BOARD ON',this.patch.pedalboardEnabled,v=>this.set('pedalboardEnabled',v));
    this.ui.pedalboardEnabled.classList.add('d6-pedalboard__master');
    this.ui.pedalboardEnabled.setAttribute('aria-label','Enable or bypass the entire effects pedalboard');
    el('span','d6-pedalboard__signal',head,'CLAV OUT → PEDALS → AMP');
    const grid = el('div','d6-pedals',board);
    Object.entries(PEDAL_DEFS).forEach(([id,def],index)=>{
      const pedal = el('article','d6-pedal d6-pedal--' + id,grid);
      el('div','d6-pedal__brand',pedal,index%2===0?'OVERTURE EFFECTS':'OI FX');
      el('h3','d6-pedal__title',pedal,def.name); el('div','d6-pedal__subtitle',pedal,def.subtitle);
      const controls = el('div','d6-pedal__controls',pedal); this.pedalUi[id]={};
      def.controls.forEach(([key,label,min,max,value])=>{
        this.pedalUi[id][key]=knob(controls,{label,min,max,value:this.patch.pedals[id][key] ?? value,size:42,
          formatValue:(v)=>String(Math.round(v*100)),onChange:(v)=>this.setPedal(id,{[key]:v})});
      });
      const foot = el('div','d6-pedal__foot',pedal);
      const led = el('i','d6-pedal__led',foot);
      const bypass = el('button','d6-pedal__switch',foot);
      bypass.type='button';bypass.setAttribute('aria-pressed','false');bypass.innerHTML='<span>OFF</span>';
      bypass.addEventListener('click',()=>this.setPedal(id,{enabled:!this.patch.pedals[id].enabled}));
      this.pedalSwitches[id]=bypass; el('div','d6-pedal__bypass-label',foot,'BYPASS / ENGAGE');
      bypass.setAttribute('aria-label','Toggle ' + def.name); led.setAttribute('aria-hidden','true');
    });
  }
  setPickupSwitch(group,value){
    const state=this.pickupState();
    if(group==='ab')state.ab=value;else state.cd=value;
    this.patch.pickup=state.cd==='C'?(state.ab==='A'?'neck':'bridge'):(state.ab==='A'?'bothIn':'bothOut');
    this.engine.post({t:'param',key:'pickup',value:this.patch.pickup});
    this.updatePickupButtons();
  }
  pickupState(){
    const pickup=this.patch.pickup;
    return {ab:(pickup==='neck'||pickup==='bothIn')?'A':'B',cd:(pickup==='neck'||pickup==='bridge')?'C':'D'};
  }
  updatePickupButtons(){
    const state=this.pickupState();
    Object.entries(this.pickupButtons||{}).forEach(([group,buttons])=>Object.entries(buttons).forEach(([value,button])=>{
      const active=state[group]===value;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
    }));
  }
  updateToneButtons(){this.toneButtons?.forEach((b,index)=>{const active=!!this.patch.toneFilters[index];b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});}
  addDamperSlider(){
    const wrap=el('label','d6-damper-control',this.perf.keybed);
    el('span','d6-damper-control__label',wrap,'DAMPER');
    const range=el('input','d6-damper-control__range',wrap);
    range.type='range';range.min='0';range.max='1';range.step='.001';range.value=String(this.patch.damping);
    range.setAttribute('aria-label','String damper / mute slider');range.setAttribute('aria-orientation','vertical');
    range.addEventListener('input',()=>{const value=Number(range.value);this.set('damping',value);});
    registerMidiTarget(range,{id:'d6:damper',label:'String damper',group:'KEYBOARD',get:()=>this.patch.damping,set:(value)=>{range.value=String(value);this.set('damping',value);}});
    this.damperRange=range;
  }
  refresh(){
    Object.entries(this.patch).forEach(([key,value])=>{if(key!=='pedals'&&this.ui[key]?.setValue)this.ui[key].setValue(value,true);});
    this.updateToneButtons(); this.updatePickupButtons();
    if(this.damperRange)this.damperRange.value=String(this.patch.damping);
    Object.entries(this.patch.pedals).forEach(([id,values])=>{
      this.setPedal(id,values);
      Object.entries(values).forEach(([key,value])=>{if(key!=='enabled')this.pedalUi[id]?.[key]?.setValue(value,true);});
    });
    this.engine.post({t:'patch',patch:this.patch});
  }
}
new HohnerD6App();
