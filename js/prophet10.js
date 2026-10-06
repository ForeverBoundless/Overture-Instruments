import { Knob } from '../ui/Knob.js';
import { Keyboard } from '../ui/Keyboard.js';
import { PitchWheel, ModWheel } from '../ui/Wheel.js';
import { Prophet10Engine } from './engine/Prophet10Engine.js';
import { MidiManager } from './engine/MidiManager.js';
import { PROPHET10_FACTORY, createProphet10UserPrograms, cloneProphet10Program } from './data/prophet10Presets.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const KEY_TO_NOTE = { a: 'C3', w: 'C#3', s: 'D3', e: 'D#3', d: 'E3', f: 'F3', t: 'F#3', g: 'G3', y: 'G#3', h: 'A3', u: 'A#3', j: 'B3', k: 'C4', o: 'C#4', l: 'D4', p: 'D#4', ';': 'E4', "'": 'F4' };

class Prophet10App {
  constructor() {
    this.engine = new Prophet10Engine();
    this.knobs = {};
    this.factory = PROPHET10_FACTORY;
    this.user = this._loadUserPrograms();
    this.bank = 'factory';
    this.group = 0;
    this.subBank = 0;
    this.program = 0;
    this.compareProgram = null;
    this.state = {};
    this.activeKeys = new Set();
    this._build();
    this._bindKeyboard();
    this._bindPower();
    this.midi = new MidiManager({
      onNoteOn: (note, velocity) => this._noteOn(note, velocity),
      onNoteOff: (note) => this._noteOff(note),
      onPitchBend: (_range, value) => this.engine.setPitchBend(value),
      onModWheel: (value) => this.engine.setModWheel(value),
      onAftertouch: (value) => this.engine.setAftertouch(value),
      onSustain: (down) => this.engine.setSustain(down),
      onProgramChange: (program) => {
        this.program = Math.min(199, program);
        this._refreshProgramSelect();
        this._applyPreset(this.program);
      },
    });
    this.midi.init();
  }

  _loadUserPrograms() {
    try {
      const saved = JSON.parse(localStorage.getItem('prophet10-user-programs') || 'null');
      return Array.isArray(saved) && saved.length === 200 ? saved : createProphet10UserPrograms();
    } catch { return createProphet10UserPrograms(); }
  }
  _saveUserPrograms() {
    try { localStorage.setItem('prophet10-user-programs', JSON.stringify(this.user)); } catch { /* storage is optional */ }
  }
  _programs() { return this.bank === 'user' ? this.user : this.factory; }
  _currentProgram() { return this._programs()[this.program] || this._programs()[0]; }
  _programNumber(index = this.program) {
    const group = Math.floor(index / 40) + 1;
    const bank = Math.floor((index % 40) / 8) + 1;
    const slot = (index % 8) + 1;
    return `${group}${bank}${slot}`;
  }
  _setState(key, value) {
    this.state[key] = value;
    if (!this.engine.started) return;
    if (key === 'oscBSync') this.engine.setOscillator('B', { sync: value });
    else if (key === 'oscBLowFreq') this.engine.setOscillator('B', { lowFreq: value });
    else if (key === 'oscBKeyboard') this.engine.setKeyboardDisconnect(!value);
    else if (key === 'oscAWave' || key === 'oscAPulse') this.engine.setOscillator('A', { waveform: this.state.oscAPulse ? 'pulse' : 'saw' });
    else if (key === 'oscBWave' || key === 'oscBTriangle' || key === 'oscBPulse') {
      this.engine.setOscillator('B', { waveform: this.state.oscBTriangle ? 'triangle' : this.state.oscBPulse ? 'pulse' : 'saw' });
    }
    else if (key === 'filterRevision') this.engine.setFilterRevision(value);
    else if (key === 'wheelDestination') this.engine.setWheelMod({ destination: value });
    else if (key === 'polyDestination') this.engine.setPolyMod({ destination: value });
    else if (key === 'glide') this.engine.setGlide({ time: value });
    else if (key === 'masterTune') this.engine.setMasterTune(440 * Math.pow(2, value / 1200));
    else if (key === 'splitPoint' || key === 'split' || key === 'stack' || key === 'unison') this.engine.setVoiceMode({ [key]: value });
    else if (key === 'chordMemory') this.engine.setChordMemory(value);
    else if (key === 'releaseMode') this.engine.setReleaseHold({ hold: value === 'hold' });
  }

  _section(title, subtitle = '') {
    const section = document.createElement('section');
    section.className = 's37-section';
    const heading = document.createElement('h2');
    heading.textContent = title;
    if (subtitle) { const sub = document.createElement('span'); sub.textContent = subtitle; heading.appendChild(sub); }
    const body = document.createElement('div'); body.className = 's37-section-body';
    section.append(heading, body);
    return { section, body };
  }

  _knob(parent, key, label, min, max, value, onChange, bipolar = false, formatValue) {
    const knob = new Knob({ label, min, max, value, defaultValue: value, bipolar, size: 48, formatValue: formatValue ?? ((v) => `${Math.round(v * 100) / 100}`), onChange });
    knob.el.classList.add('s37-knob');
    this.knobs[key] = knob;
    parent.appendChild(knob.el);
    return knob;
  }

  _button(label, onClick, lit = false) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 's37-button'; button.textContent = label; button.classList.toggle('lit', lit);
    button.addEventListener('click', () => onClick(button));
    return button;
  }

  _selector(label, values, value, onChange) {
    const wrap = document.createElement('label'); wrap.className = 's37-select-wrap';
    const caption = document.createElement('span'); caption.textContent = label;
    const select = document.createElement('select');
    values.forEach((item) => { const option = document.createElement('option'); option.value = item.value ?? item; option.textContent = item.label ?? item; select.appendChild(option); });
    select.value = value; select.addEventListener('change', () => onChange(select.value));
    wrap.append(caption, select); return wrap;
  }

  _build() {
    const root = document.getElementById('prophet10-root');
    const shell = document.createElement('main'); shell.className = 'sub37-shell prophet10-shell';
    shell.append(this._header(), this._performanceRow(), this._soundRows(), this._keybed(), this._footer());
    root.appendChild(shell);
  }

  _header() {
    const header = document.createElement('header'); header.className = 's37-header';
    header.innerHTML = '<img class="s37-moog" src="./ui/Logos/Sequential_logo.png" alt="Sequential"><div class="s37-model"><b>PROPHET-10</b><span>REV4 POLYPHONIC ANALOG SYNTHESIZER</span></div>';
    const display = document.createElement('div'); display.className = 's37-display';
    this.displayTop = document.createElement('div'); this.displayBottom = document.createElement('div');
    display.append(this.displayTop, this.displayBottom); header.appendChild(display);
    this._showPreset(0); return header;
  }

  _performanceRow() {
    const row = document.createElement('div'); row.className = 's37-row s37-performance';
    const program = this._section('PROGRAM');
    this.bankSelect = this._selector('MEMORY', ['factory', 'user'], this.bank, (value) => {
      this.bank = value;
      this.group = 0;
      this.subBank = 0;
      this.program = 0;
      this._refreshProgramSelect();
      this._applyPreset(0);
    });
    this.programSelect = this._selector('PROGRAM', [], '0', (id) => { this.program = Number(id); this._applyPreset(this.program); });
    this.groupSelect = this._selector('GROUP', Array.from({ length: 5 }, (_, i) => `GROUP ${i + 1}`), 'GROUP 1', (v) => {
      this.group = Number(v.split(' ')[1]) - 1;
      this.subBank = 0;
      this.program = this.group * 40;
      this._refreshProgramSelect();
      this._applyPreset(this.program);
    });
    this.subBankSelect = this._selector('BANK', Array.from({ length: 5 }, (_, i) => `BANK ${i + 1}`), 'BANK 1', (v) => {
      this.subBank = Number(v.split(' ')[1]) - 1;
      this.program = this.group * 40 + this.subBank * 8;
      this._refreshProgramSelect();
      this._applyPreset(this.program);
    });
    this._refreshProgramSelect();
    const actions = document.createElement('div'); actions.className = 's37-button-row';
    actions.append(this._button('INIT', () => this._initProgram()), this._button('SAVE', () => this._saveProgram()), this._button('COMPARE', () => this._compareProgram()));
    program.body.append(this.bankSelect, this.groupSelect, this.subBankSelect, this.programSelect, actions);
    const performance = this._section('PERFORMANCE');
    const knobs = document.createElement('div'); knobs.className = 's37-knob-row';
    this._knob(knobs, 'bend', 'PITCH BEND', 1, 12, 7, (v) => this.engine.setPitchBendRange(Math.round(v)), false, (v) => `±${Math.round(v)} st`);
    this._knob(knobs, 'vintage', 'VINTAGE', 1, 4, 4, (v) => this.engine.setVintage(v), false, (v) => `REV ${Math.round(v)}`);
    performance.body.append(knobs, this._button('HOLD', (button) => {
      const enabled = !button.classList.contains('lit');
      button.classList.toggle('lit', enabled);
      this.engine.setHold(enabled);
    }));
    const output = this._section('OUTPUT');
    const outKnobs = document.createElement('div'); outKnobs.className = 's37-knob-row';
    this._knob(outKnobs, 'volume', 'VOLUME', 0, 1, 0.24, (v) => this.engine.setMasterVolume(v), false, (v) => `${Math.round(v * 100)}%`);
    output.body.appendChild(outKnobs);
    row.append(program.section, performance.section, output.section); return row;
  }

  _refreshProgramSelect() {
    const select = this.programSelect?.querySelector('select'); if (!select) return;
    const start = this.group * 40 + this.subBank * 8;
    const programs = this._programs().slice(start, start + 8);
    select.replaceChildren(...programs.map((p, offset) => {
      const i = start + offset;
      const option = document.createElement('option'); option.value = i; option.textContent = `${this._programNumber(i)}  ${p.name}`; return option;
    }));
    select.value = String(this.program);
  }
  _initProgram() {
    const init = cloneProphet10Program(this.factory[0]); init.id = this.program; init.name = 'INIT PROGRAM';
    this._applyPresetObject(init);
  }
  _saveProgram() {
    const current = cloneProphet10Program(this._currentProgram());
    Object.assign(current, this.state, { id: this.program, name: current.name || `USER ${this.program + 1}`, bank: 'user' });
    this.user[this.program] = current; this.bank = 'user'; this._saveUserPrograms(); this._refreshProgramSelect();
    this.displayBottom.textContent = 'PROGRAM SAVED';
  }
  _compareProgram() {
    if (!this.compareProgram) { this.compareProgram = cloneProphet10Program(this._currentProgram()); this.displayBottom.textContent = 'COMPARE STORED'; }
    else { this._applyPresetObject(this.compareProgram); this.displayBottom.textContent = 'COMPARE RECALL'; this.compareProgram = null; }
  }

  _oscillator(index) {
    const label = index === 'A' ? 'OSCILLATOR A' : 'OSCILLATOR B';
    const section = this._section(label);
    const row = document.createElement('div'); row.className = 's37-knob-row';
    this._knob(row, `${index}Level`, 'LEVEL', 0, 1, index === 'A' ? 0.78 : 0.62, (v) => this.engine.setOscillator(index, { level: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, `${index}Fine`, 'FINE TUNE', -100, 100, 0, (v) => this.engine.setOscillator(index, { fine: v }), true, (v) => `${v.toFixed(0)} ct`);
    section.body.append(row, this._selector('OCTAVE', ['16', '8', '4', '2'], '8', (v) => this.engine.setOscillator(index, { octave: Number(v) })));
    return section.section;
  }

  _soundRows() {
    const area = document.createElement('div'); area.className = 's37-sound-area';
    const osc = document.createElement('div'); osc.className = 's37-row s37-osc-row';
    osc.append(this._oscillator('A'), this._oscillator('B'));
    const mixer = this._section('MIXER');
    const mixRow = document.createElement('div'); mixRow.className = 's37-knob-row';
    this._knob(mixRow, 'noise', 'NOISE', 0, 1, 0.02, (v) => this.engine.setMixer({ noise: v }), false, (v) => `${Math.round(v * 100)}%`);
    mixer.body.appendChild(mixRow); osc.append(mixer.section);
    const filter = this._section('FILTER', '24 DB LOW PASS');
    const filterRow = document.createElement('div'); filterRow.className = 's37-knob-row';
    this._knob(filterRow, 'cutoff', 'CUTOFF', 20, 20000, 4200, (v) => this.engine.setFilter({ cutoff: v }), false, (v) => `${Math.round(v)} Hz`);
    this._knob(filterRow, 'resonance', 'RESONANCE', 0, 1, 0.18, (v) => this.engine.setFilter({ resonance: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(filterRow, 'filterEnvAmount', 'ENV AMOUNT', -10000, 10000, 2800, (v) => this.engine.setFilter({ filterEnvAmount: v }), true, (v) => `${Math.round(v)} Hz`);
    filter.body.appendChild(filterRow);
    filter.body.append(this._selector('REVISION', ['rev1', 'rev2', 'rev3', 'rev4'], 'rev4', (v) => this._setState('filterRevision', v)), this._selector('TRACKING', ['0%', '50%', '100%'], '50%', (v) => this._setState('keyTrack', Number.parseInt(v, 10) / 100)), this._selector('Q COMP', ['program', 'vintage'], 'program', (v) => this.engine.setQCompensation(v)));
    osc.append(filter.section); area.appendChild(osc);
    const lower = document.createElement('div'); lower.className = 's37-row s37-env-row';
    lower.append(this._envelope('filter', 'FILTER ENVELOPE'), this._envelope('amp', 'AMPLIFIER ENVELOPE'), this._modulation(), this._advanced());
    area.appendChild(lower); return area;
  }

  _advanced() {
    const section = this._section('PERFORMANCE / ROUTING');
    const toggles = document.createElement('div'); toggles.className = 's37-button-row';
    const toggle = (label, key) => { const b = this._button(label, (button) => { this._setState(key, !this.state[key]); button.classList.toggle('lit', this.state[key]); }); return b; };
    toggles.append(toggle('A SAW', 'oscAWave'), toggle('A PULSE', 'oscAPulse'), toggle('B SAW', 'oscBWave'), toggle('B TRI', 'oscBTriangle'), toggle('B PULSE', 'oscBPulse'), toggle('SYNC', 'oscBSync'), toggle('B LO FREQ', 'oscBLowFreq'), toggle('B NO KEY', 'oscBKeyboard'));
    const selectors = [
      ['LFO SHAPE', ['triangle', 'saw', 'square', 'sample & hold'], 'lfoShape'],
      ['WHEEL MOD', ['filter', 'osc a', 'osc b', 'pitch', 'pulse width'], 'wheelDestination'],
      ['POLY-MOD', ['filter', 'osc a freq', 'osc a pw'], 'polyDestination'],
      ['VELOCITY', ['off', 'amp', 'filter', 'both'], 'velocity'],
      ['AFTERTOUCH', ['off', 'filter', 'pitch', 'lfo'], 'aftertouch'],
      ['RELEASE', ['normal', 'slow', 'fast', 'hold'], 'releaseMode'],
    ];
    selectors.forEach(([label, values, key]) => section.body.appendChild(this._selector(label, values, values[0], (v) => this._setState(key, v))));
    const knobs = document.createElement('div'); knobs.className = 's37-knob-row';
    this._knob(knobs, 'glide', 'GLIDE', 0, 5, 0, (v) => this._setState('glide', v), false, (v) => `${v.toFixed(2)}s`);
    this._knob(knobs, 'masterTune', 'MASTER TUNE', -100, 100, 0, (v) => this._setState('masterTune', v), true, (v) => `${v.toFixed(0)} ct`);
    this._knob(knobs, 'splitPoint', 'SPLIT POINT', 36, 96, 60, (v) => this._setState('splitPoint', Math.round(v)), false, (v) => `${Math.round(v)}`);
    section.body.append(toggles, knobs, toggle('UNISON', 'unison'), toggle('CHORD MEMORY', 'chordMemory'), toggle('STACK', 'stack'), toggle('SPLIT', 'split'), toggle('A440', 'a440'));
    return section.section;
  }

  _envelope(which, title) {
    const section = this._section(title);
    const row = document.createElement('div'); row.className = 's37-knob-row s37-env-knobs';
    const defaults = which === 'filter' ? [0.004, 0.35, 0.2, 0.32] : [0.004, 0.3, 0.72, 0.35];
    ['attack', 'decay', 'sustain', 'release'].forEach((key, i) => this._knob(row, `${which}${key}`, key.toUpperCase(), 0, key === 'sustain' ? 1 : 4, defaults[i], (v) => this.engine.setEnvelope(which, { [key]: v }), key === 'sustain', (v) => key === 'sustain' ? `${Math.round(v * 100)}%` : `${v.toFixed(2)}s`));
    section.body.appendChild(row); return section.section;
  }

  _modulation() {
    const section = this._section('MODULATION');
    const row = document.createElement('div'); row.className = 's37-knob-row';
    this._knob(row, 'lfoRate', 'LFO RATE', 0.22, 500, 4, (v) => this.engine.setLFO({ rate: v }), false, (v) => `${v.toFixed(2)} Hz`);
    this._knob(row, 'lfoAmount', 'INITIAL AMT', 0, 1, 0, (v) => this.engine.setLFO({ amount: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, 'wheelMix', 'SOURCE MIX', 0, 1, 0, (v) => this.engine.setWheelMod({ sourceMix: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, 'polyFilterEnv', 'POLY EG', 0, 1, 0, (v) => this.engine.setPolyMod({ filterEnv: v }), false, (v) => `${Math.round(v * 100)}%`);
    section.body.append(row, this._selector('DESTINATION', ['OSC A FREQ', 'OSC B FREQ', 'PW A', 'PW B', 'FILTER'], 'FILTER', (v) => this.engine.setWheelMod({ destination: v })));
    return section.section;
  }

  _keybed() {
    const lower = document.createElement('section'); lower.className = 's37-keybed';
    const wheels = document.createElement('div'); wheels.className = 's37-wheels';
    this.pitchWheel = new PitchWheel({ onChange: (v) => this.engine.setPitchBend(v) });
    this.modWheel = new ModWheel({ onChange: (v) => this.engine.setModWheel(v) });
    wheels.append(this.pitchWheel.el, this.modWheel.el);
    const wrap = document.createElement('div'); wrap.className = 's37-keyboard-wrap';
    this.keyboard = new Keyboard({ startOctave: 2, octaves: 3, onNoteOn: (n, v) => this._noteOn(n, v), onNoteOff: (n) => this._noteOff(n) });
    wrap.appendChild(this.keyboard.el); lower.append(wheels, wrap); return lower;
  }

  _footer() { const footer = document.createElement('footer'); footer.className = 's37-footer'; footer.textContent = '10-VOICE POLYPHONIC ANALOG SYNTHESIZER • POLY-MOD • WHEEL MOD • MIDI READY'; return footer; }

  _bindPower() {
    document.getElementById('prophet10-power').addEventListener('click', async () => {
      await this.engine.start(); this._applyPreset(0); document.getElementById('prophet10-power').classList.add('sub37-power-off'); this.displayBottom.textContent = 'AUDIO READY';
    }, { once: true });
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
      const key = event.key.toLowerCase();
      const note = KEY_TO_NOTE[key];
      if (note || key === 'tab' || (event.key === 'Shift' && event.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT)) event.preventDefault();
      if (event.repeat) return;
      if (key === 'tab') this.pitchWheel.setExternalValue(1);
      else if (event.key === 'Shift' && event.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT) this.pitchWheel.setExternalValue(-1);
      else {
        if (note && !this.activeKeys.has(key)) {
          this.activeKeys.add(key);
          this._noteOn(note, 0.9);
        }
      }
    });
    window.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      const note = KEY_TO_NOTE[key];
      if (note || key === 'tab' || event.key === 'Shift') event.preventDefault();
      if (key === 'tab' || event.key === 'Shift') this.pitchWheel.springReturnToCenter();
      if (note && this.activeKeys.has(key)) {
        this.activeKeys.delete(key);
        this._noteOff(note);
      }
    });
    window.addEventListener('blur', () => { this.activeKeys.clear(); this.engine.allNotesOff(); this.pitchWheel.springReturnToCenter(); });
  }

  _noteOn(note, velocity) { if (!this.engine.started) return; this.keyboard.setKeyActive(note, true); this.engine.noteOn(note, velocity); }
  _noteOff(note) { if (!this.engine.started) return; this.keyboard.setKeyActive(note, false); this.engine.noteOff(note); }

  _showPreset(id) { const preset = this._programs()[id] || this._programs()[0]; this.displayTop.textContent = `${this._programNumber(id)} ${preset.name}`; this.displayBottom.textContent = 'PRESET READY'; }
  _applyPreset(id) {
    const preset = this._programs()[id] ?? this._programs()[0];
    this._applyPresetObject(preset);
  }
  _applyPresetObject(preset) {
    Object.assign(this.state, cloneProphet10Program(preset));
    this.engine.setOscillator('A', { octave: preset.oscAOctave, level: preset.oscALevel });
    this.engine.setOscillator('A', { waveform: preset.oscAWave, pulseWidth: preset.oscAPulse ? 0.5 : 0 });
    this.engine.setOscillator('B', { octave: preset.oscBOctave, level: preset.oscBLevel, fine: preset.oscBFine, waveform: preset.oscBWave, sync: preset.oscBSync, lowFreq: preset.oscBLowFreq });
    this.engine.setMixer({ noise: preset.noiseLevel ?? 0.02 });
    this.engine.setFilter(preset); this.engine.setEnvelope('amp', preset.ampEnv); this.engine.setEnvelope('filter', preset.filterEnv);
    this.engine.setFilterRevision(preset.filterRevision ?? 'rev4');
    this.engine.setKeyboardDisconnect(preset.oscBKeyboard === false);
    this.engine.setLFO(preset); this.engine.setWheelMod({ sourceMix: preset.wheelSourceMix, destination: preset.wheelDestination }); this.engine.setPolyMod({ filterEnv: preset.polyFilterEnv, oscB: preset.polyOscB, destination: preset.polyDestination });
    this.engine.setVelocityRouting({ amp: preset.velocity === 'amp' || preset.velocity === 'both' ? 1 : 0, filter: preset.velocity === 'filter' || preset.velocity === 'both' ? 1 : 0 });
    this.engine.setAftertouch(0, { filter: preset.aftertouch === 'filter' || preset.aftertouch === 'both' ? 1 : 0, lfo: preset.aftertouch === 'lfo' || preset.aftertouch === 'both' ? 1 : 0 });
    this.engine.setGlide({ time: Number(preset.glide) || 0 });
    this.engine.setVoiceMode({ unison: !!preset.unison, stack: !!preset.stack, split: !!preset.split, splitPoint: preset.splitPoint });
    this.engine.setChordMemory(!!preset.chordMemory);
    this._showPreset(preset.id);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.__prophet10App = new Prophet10App(); });
