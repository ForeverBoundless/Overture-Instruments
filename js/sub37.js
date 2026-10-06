import { Knob } from '../ui/Knob.js';
import { Keyboard } from '../ui/Keyboard.js';
import { PitchWheel, ModWheel } from '../ui/Wheel.js';
import { Sub37Engine } from './engine/Sub37Engine.js';
import { SUB37_PRESETS } from './data/sub37Presets.js';

const KEY_TO_NOTE = { a: 'C3', w: 'C#3', s: 'D3', e: 'D#3', d: 'E3', f: 'F3', t: 'F#3', g: 'G3', y: 'G#3', h: 'A3', u: 'A#3', j: 'B3', k: 'C4', o: 'C#4', l: 'D4', p: 'D#4', ';': 'E4', "'": 'F4' };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

class Sub37 {
  constructor() {
    this.engine = new Sub37Engine();
    this.knobs = {};
    this.buttons = {};
    this.currentPreset = 0;
    this.activeKeys = new Set();
    this._modKeyDirection = 0;
    this._modRampRAF = null;
    this.arp = { on: false, latch: false, sync: false, pattern: 'UP', range: 0, rate: 120, index: 0, notes: [] };
    this.sequence = Array.from({ length: 64 }, () => ({ note: null, tie: false, rest: true, mod: 0 }));
    this.seq = { playing: false, recording: false, page: 0, selected: 0, index: 0, timer: null };
    this._build();
    this._bindPower();
    this._bindComputerKeyboard();
  }

  _build() {
    const root = document.getElementById('sub37-root');
    const shell = document.createElement('main');
    shell.className = 'sub37-shell';
    shell.append(this._buildHeader(), this._buildPerformanceRow(), this._buildSoundRows(), this._buildSequencer(), this._buildKeybed(), this._buildFooter());
    root.appendChild(shell);
  }

  _buildHeader() {
    const header = document.createElement('header');
    header.className = 's37-header';
    header.innerHTML = `<img class="s37-moog" src="/ui/Logos/Moog_Music_logo.png" alt="Overture"><div class="s37-model"><b>SUB 37</b><span>BOB MOOG TRIBUTE EDITION</span></div>`;
    const display = document.createElement('div');
    display.className = 's37-display';
    this.displayTop = document.createElement('div');
    this.displayBottom = document.createElement('div');
    this.displayTop.textContent = '1.01 RHYTHMIC 5TH';
    this.displayBottom.textContent = 'PRESET ACTIVE';
    display.append(this.displayTop, this.displayBottom);
    header.appendChild(display);
    return header;
  }

  _section(title, subtitle = '') {
    const section = document.createElement('section');
    section.className = 's37-section';
    const heading = document.createElement('h2'); heading.textContent = title;
    if (subtitle) { const sub = document.createElement('span'); sub.textContent = subtitle; heading.appendChild(sub); }
    const body = document.createElement('div'); body.className = 's37-section-body';
    section.append(heading, body);
    return { section, body };
  }

  _button(label, onClick, lit = false, className = '') {
    const button = document.createElement('button'); button.type = 'button'; button.className = `s37-button ${className}`; button.textContent = label; button.classList.toggle('lit', lit);
    button.addEventListener('click', () => onClick?.(button)); return button;
  }

  _toggle(label, initial, onChange) {
    let value = initial;
    const button = this._button(label, () => { value = !value; button.classList.toggle('lit', value); onChange(value); }, value);
    button.getValue = () => value;
    button.setValue = (next, silent = false) => { value = !!next; button.classList.toggle('lit', value); if (!silent) onChange(value); };
    return button;
  }

  _selector(label, values, value, onChange) {
    const wrap = document.createElement('label'); wrap.className = 's37-select-wrap';
    const caption = document.createElement('span'); caption.textContent = label;
    const select = document.createElement('select');
    values.forEach((item) => { const option = document.createElement('option'); option.value = item.value ?? item; option.textContent = item.label ?? item; select.appendChild(option); });
    select.value = value; select.addEventListener('change', () => onChange(select.value));
    wrap.append(caption, select);
    wrap.setValue = (next, silent = false) => { select.value = next; if (!silent) onChange(select.value); };
    return wrap;
  }

  _knob(parent, key, label, min, max, value, onChange, bipolar = false, formatValue) {
    const knob = new Knob({ label, min, max, value, defaultValue: value, bipolar, size: 48, formatValue: formatValue ?? ((v) => `${Math.round(v * 100) / 100}`), onChange });
    knob.el.classList.add('s37-knob'); this.knobs[key] = knob; parent.appendChild(knob.el); return knob;
  }

  _buildPerformanceRow() {
    const row = document.createElement('div'); row.className = 's37-row s37-performance';
    const program = this._section('PROGRAMMING');
    const bank = this._selector('BANK / PRESET', SUB37_PRESETS.map((preset) => ({ value: preset.id, label: `${preset.bank}.${String(preset.slot).padStart(2, '0')}  ${preset.name}` })), 0, (value) => this._applyPreset(Number(value)));
    this.presetSelect = bank; program.body.appendChild(bank);
    const programButtons = document.createElement('div'); programButtons.className = 's37-button-grid';
    programButtons.append(this._button('PRESET', () => this._showMessage('PRESET MODE')), this._button('PANEL', () => this._showMessage('PANEL MODE')), this._button('SAVE', () => this._savePatch()), this._button('INIT', () => this._initPatch())); program.body.appendChild(programButtons);

    const arp = this._section('ARPEGGIATOR'); const arpButtons = document.createElement('div'); arpButtons.className = 's37-button-grid';
    this.buttons.arpOn = this._toggle('ON', false, (on) => { this.arp.on = on; this._refreshClock(); });
    this.buttons.arpLatch = this._toggle('LATCH', false, (on) => { this.arp.latch = on; });
    this.buttons.arpSync = this._toggle('SYNC', false, (on) => { this.arp.sync = on; this._showMessage(on ? 'ARP MIDI SYNC' : 'ARP INTERNAL'); });
    arpButtons.append(this.buttons.arpOn, this.buttons.arpLatch, this.buttons.arpSync);
    arp.body.append(arpButtons, this._selector('PATTERN', ['UP', 'DWN', 'ORDR', 'RND', 'SEQ'], 'UP', (pattern) => { this.arp.pattern = pattern; this._refreshClock(); }));
    const arpKnobs = document.createElement('div'); arpKnobs.className = 's37-knob-row';
    this._knob(arpKnobs, 'arpRate', 'RATE BPM', 2, 280, 120, (v) => { this.arp.rate = v; this._refreshClock(); });
    this._knob(arpKnobs, 'arpRange', 'RANGE', -2, 2, 0, (v) => { this.arp.range = Math.round(v); }, true, (v) => `${Math.round(v)} OCT`);
    arp.body.appendChild(arpKnobs);

    const glide = this._section('GLIDE'); const glideButtons = document.createElement('div'); glideButtons.className = 's37-button-grid';
    this.buttons.glide = this._toggle('ON', true, (on) => this.engine.setGlide(on)); this.buttons.legato = this._toggle('LEGATO', true, (on) => { this.engine.legato = on; });
    glideButtons.append(this.buttons.glide, this.buttons.legato); const glideKnobs = document.createElement('div'); glideKnobs.className = 's37-knob-row';
    this._knob(glideKnobs, 'glide', 'TIME', 0, 5, 0.12, (v) => this.engine.setGlide(undefined, v), false, (v) => `${v.toFixed(2)}s`);
    this._knob(glideKnobs, 'fine', 'FINE TUNE', -100, 100, 0, (v) => this.engine.setFineTune(v), true, (v) => `${v.toFixed(0)} ct`);
    glide.body.append(glideButtons, glideKnobs); row.append(program.section, arp.section, glide.section); return row;
  }

  _modSection(index) {
    const part = this._section(`MOD ${index + 1}`, 'ASSIGNABLE BUS'); const state = this.engine.modBusses[index];
    const sync = () => this.engine.setModulation(index, { source: this.modSelectors[index].source.querySelector('select').value, destination: this.modSelectors[index].destination.querySelector('select').value, amount: this.knobs[`mod${index}Amount`].value });
    const source = this._selector('SOURCE', ['LFO 1', 'LFO 2', 'FILTER EG', 'AMP EG', 'OSC 2'], state.source, sync);
    const destination = this._selector('DESTINATION', ['PITCH', 'FILTER', 'WAVE', 'OSC 2', 'AMP'], state.destination, sync);
    this.modSelectors ??= []; this.modSelectors[index] = { source, destination };
    const row = document.createElement('div'); row.className = 's37-knob-row'; this._knob(row, `mod${index}Amount`, 'AMOUNT', 0, 1, state.amount, sync, false, (v) => `${Math.round(v * 100)}%`);
    const lfoRate = document.createElement('div'); lfoRate.className = 's37-knob-row'; this._knob(lfoRate, `lfo${index}Rate`, `LFO ${index + 1} RATE`, 0.05, 100, index ? 0.35 : 4.5, (v) => this.engine.setLFO(index, { rate: v }), false, (v) => `${v.toFixed(2)} Hz`);
    const wave = this._selector('WAVE', [{ value: 'triangle', label: 'TRI' }, { value: 'square', label: 'SQR' }, { value: 'saw', label: 'SAW' }, { value: 'reverseSaw', label: 'RAMP' }, { value: 'sh', label: 'S&H' }], 'triangle', (value) => this.engine.setLFO(index, { waveform: value }));
    part.body.append(source, destination, row, wave, lfoRate); return part.section;
  }

  _buildSoundRows() {
    const all = document.createElement('div'); all.className = 's37-sound-area';
    const mods = document.createElement('div'); mods.className = 's37-row s37-mod-row'; mods.append(this._modSection(0), this._modSection(1));
    const oscillatorRow = document.createElement('div'); oscillatorRow.className = 's37-row s37-osc-row'; oscillatorRow.append(this._oscSection(0), this._oscSection(1), this._mixerSection(), this._filterSection());
    const envRow = document.createElement('div'); envRow.className = 's37-row s37-env-row'; envRow.append(this._envelopeSection('filter', 'FILTER ENVELOPE'), this._envelopeSection('amp', 'AMPLIFIER ENVELOPE'), this._outputSection());
    all.append(mods, oscillatorRow, envRow); return all;
  }

  _oscSection(index) {
    const section = this._section(`OSCILLATOR ${index + 1}`); const row = document.createElement('div'); row.className = 's37-knob-row';
    this._knob(row, `osc${index}Wave`, 'WAVE', 0, 1, 0.42, (v) => { this.engine.setOscillator(index, { shape: v }); this._showMessage(`OSC ${index + 1} ${this._waveType(v)}`); }, false, (v) => ['TRI', 'SAW', 'SQR', 'PULSE'][Math.min(3, Math.floor(v * 4))]);
    this._knob(row, `osc${index}Level`, 'LEVEL', 0, 1, index ? 0.68 : 0.82, (v) => this.engine.setOscillator(index, { level: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, `osc${index}Tune`, 'FREQUENCY', -7, 7, 0, (v) => this.engine.setOscillator(index, { semitones: Math.round(v) }), true, (v) => `${Math.round(v)} st`);
    this._knob(row, `osc${index}Fine`, 'FINE TUNE', -100, 100, 0, (v) => this.engine.setOscillator(index, { fineCents: v }), true, (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)} ct`);
    const octave = this._selector('OCTAVE', ['16', '8', '4', '2'], '8', (value) => this.engine.setOscillator(index, { octave: Number(value) })); this[`osc${index}Octave`] = octave;
    const controls = document.createElement('div'); controls.className = 's37-osc-controls'; controls.appendChild(octave);
    if (index === 1) { this.buttons.sync = this._toggle('OSC 1–2 SYNC', false, (on) => this.engine.voice?.setOsc2SyncEnabled(on)); controls.appendChild(this.buttons.sync); }
    section.body.append(row, controls);
    return section.section;
  }

  _mixerSection() {
    const section = this._section('MIXER'); const row = document.createElement('div'); row.className = 's37-knob-row s37-knob-row--wide';
    this._knob(row, 'sub', 'SUB OSC', 0, 1, 0.22, (v) => this.engine.setMixer({ sub: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, 'noise', 'NOISE', 0, 1, 0.03, (v) => this.engine.setMixer({ noise: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, 'feedback', 'FDBK / EXT IN', 0, 1, 0, (v) => this.engine.setMixer({ feedback: v }), false, (v) => `${Math.round(v * 100)}%`); section.body.appendChild(row); return section.section;
  }

  _filterSection() {
    const section = this._section('FILTER', 'MOOG LADDER'); const row = document.createElement('div'); row.className = 's37-knob-row s37-knob-row--wide';
    this._knob(row, 'cutoff', 'CUTOFF', 20, 20000, 3200, (v) => this.engine.setFilter({ cutoff: v }), false, (v) => `${Math.round(v)} Hz`);
    this._knob(row, 'resonance', 'RESONANCE', 0, 1, 0.25, (v) => this.engine.setFilter({ resonance: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, 'drive', 'MULTIDRIVE', 0, 1, 0.12, (v) => this.engine.setFilter({ drive: v }), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, 'filterEnv', 'FILTER EG', -10000, 10000, 3000, (v) => this.engine.setFilter({ envAmount: v }), true, (v) => `${Math.round(v)} Hz`);
    this._knob(row, 'keyTrack', 'KB CTRL', 0, 1, 0.5, (v) => this.engine.setFilter({ keyTrack: v }), false, (v) => `${Math.round(v * 100)}%`);
    section.body.append(row, this._selector('SLOPE', ['6', '12', '18', '24'], '24', (value) => this.engine.setFilter({ slope: Number(value) }))); return section.section;
  }

  _envelopeSection(which, title) {
    const section = this._section(title, 'DAHDSR'); const row = document.createElement('div'); row.className = 's37-knob-row s37-env-knobs';
    const defaults = which === 'filter' ? [0, 0.004, 0, 0.32, 0.28, 0.34] : [0, 0.004, 0, 0.26, 0.72, 0.3];
    const keys = ['delay', 'attack', 'hold', 'decay', 'sustain', 'release']; const labels = ['DELAY', 'ATTACK', 'HOLD', 'DECAY', 'SUSTAIN', 'RELEASE'];
    keys.forEach((key, index) => this._knob(row, `${which}${key}`, labels[index], 0, key === 'sustain' ? 1 : 10, defaults[index], (v) => this.engine.setEnvelope(which, { [key]: v }), key === 'sustain', (v) => key === 'sustain' ? `${Math.round(v * 100)}%` : `${v.toFixed(2)}s`));
    const loop = this._toggle('LOOP', false, (on) => this.engine.setEnvelope(which, { loop: on })); section.body.append(row, loop); return section.section;
  }

  _outputSection() {
    const section = this._section('OUTPUT'); const row = document.createElement('div'); row.className = 's37-knob-row';
    this._knob(row, 'volume', 'MASTER VOLUME', 0, 1, 0.24, (v) => this.engine.setMasterVolume(v), false, (v) => `${Math.round(v * 100)}%`);
    this._knob(row, 'bendRange', 'PITCH BEND', 0, 12, 2, (v) => this.engine.setPitchBendRange(Math.round(v)), false, (v) => `±${Math.round(v)} st`);
    this.buttons.duo = this._toggle('DUO MODE', false, (on) => this.engine.setDuoMode(on)); section.body.append(row, this.buttons.duo); return section.section;
  }

  _buildSequencer() {
    const section = document.createElement('section'); section.className = 's37-sequencer'; const head = document.createElement('div'); head.className = 's37-seq-head'; head.innerHTML = '<strong>64-STEP SEQUENCER</strong><span>REST / TIE / STEP MOD</span>';
    const controls = document.createElement('div'); controls.className = 's37-button-grid';
    this.buttons.seqPlay = this._toggle('PLAY', false, (on) => { this.seq.playing = on; this.arp.on = false; this.buttons.arpOn.setValue(false, true); this._refreshClock(); });
    this.buttons.seqRecord = this._toggle('REC', false, (on) => { this.seq.recording = on; this._showMessage(on ? 'STEP RECORD' : 'STEP RECORD OFF'); });
    controls.append(this.buttons.seqPlay, this.buttons.seqRecord, this._button('REST', () => this._setSeqFlag('rest')), this._button('TIE', () => this._setSeqFlag('tie')), this._button('CLEAR', () => this._clearSequence()));
    this.seqPage = this._selector('PAGE', ['1', '2', '3', '4'], '1', (page) => { this.seq.page = Number(page) - 1; this._renderSequence(); }); controls.appendChild(this.seqPage);
    this.stepGrid = document.createElement('div'); this.stepGrid.className = 's37-step-grid';
    Array.from({ length: 16 }, (_, localIndex) => { const button = this._button(String(localIndex + 1).padStart(2, '0'), () => { this.seq.selected = this.seq.page * 16 + localIndex; this._renderSequence(); }, false, 's37-step'); this.stepGrid.appendChild(button); });
    section.append(head, controls, this.stepGrid); this._renderSequence(); return section;
  }

  _buildKeybed() {
    const lower = document.createElement('section'); lower.className = 's37-keybed'; const wheels = document.createElement('div'); wheels.className = 's37-wheels';
    this.pitchWheel = new PitchWheel({ onChange: (value) => this.engine.setPitchBend(value) }); this.modWheel = new ModWheel({ onChange: (value) => this.engine.setModWheel(value) }); wheels.append(this.pitchWheel.el, this.modWheel.el);
    const keyboardWrap = document.createElement('div'); keyboardWrap.className = 's37-keyboard-wrap'; this.keyboard = new Keyboard({ startOctave: 2, octaves: 3, onNoteOn: (note, velocity) => this._noteOn(note, velocity), onNoteOff: (note) => this._noteOff(note) }); keyboardWrap.appendChild(this.keyboard.el);
    const octave = document.createElement('div'); octave.className = 's37-octave'; this.octaveReadout = document.createElement('span'); octave.append(this._button('KB OCT –', () => this._setOctave(this.engine.octaveShift - 1)), this.octaveReadout, this._button('KB OCT +', () => this._setOctave(this.engine.octaveShift + 1))); this._renderOctave();
    lower.append(wheels, keyboardWrap, octave); return lower;
  }

  _buildFooter() { const footer = document.createElement('footer'); footer.className = 's37-footer'; footer.textContent = '37-KEY VELOCITY + AFTERTOUCH • TWO-NOTE PARAPHONIC ANALOG SYNTHESIZER • WEB MIDI READY'; return footer; }

  _bindPower() { const power = document.getElementById('sub37-power'); power.addEventListener('click', async () => { await this.engine.start(); this._applyPreset(this.currentPreset); power.classList.add('sub37-power-off'); this._showMessage('AUDIO READY'); }, { once: true }); }

  _applyPreset(index) {
    const preset = SUB37_PRESETS[clamp(index, 0, SUB37_PRESETS.length - 1)]; this.currentPreset = preset.id; this.presetSelect?.setValue(String(preset.id), true);
    const set = (key, value) => this.knobs[key]?.setValue(value, true);
    set('osc0Wave', preset.osc1Shape); set('osc1Wave', preset.osc2Shape); set('osc0Level', preset.osc1Level); set('osc1Level', preset.osc2Level); set('osc0Tune', preset.osc1Semitones ?? 0); set('osc1Tune', preset.osc2Semitones); set('osc0Fine', preset.osc1FineCents ?? 0); set('osc1Fine', preset.osc2FineCents ?? 0); set('sub', preset.subLevel); set('noise', preset.noiseLevel); set('cutoff', preset.cutoff); set('resonance', preset.resonance); set('drive', preset.drive); set('keyTrack', preset.keyTrack); set('filterEnv', preset.filterEnvAmount); set('lfo0Rate', preset.lfo1Rate); set('lfo1Rate', preset.lfo2Rate); set('mod0Amount', preset.mod1.amount); set('mod1Amount', preset.mod2.amount);
    ['filter', 'amp'].forEach((which) => ['delay', 'attack', 'hold', 'decay', 'sustain', 'release'].forEach((key) => set(`${which}${key}`, preset[`${which}Env`][key])));
    this.modSelectors?.[0]?.source.setValue(preset.mod1.source, true); this.modSelectors?.[0]?.destination.setValue(preset.mod1.destination, true); this.modSelectors?.[1]?.source.setValue(preset.mod2.source, true); this.modSelectors?.[1]?.destination.setValue(preset.mod2.destination, true); this.buttons.duo.setValue(preset.duo, true); this.buttons.sync.setValue(preset.sync, true);
    this.engine.setOscillator(0, { shape: preset.osc1Shape, level: preset.osc1Level, semitones: preset.osc1Semitones ?? 0, fineCents: preset.osc1FineCents ?? 0 }); this.engine.setOscillator(1, { shape: preset.osc2Shape, level: preset.osc2Level, semitones: preset.osc2Semitones, fineCents: preset.osc2FineCents ?? 0 }); this.engine.setMixer({ sub: preset.subLevel, noise: preset.noiseLevel }); this.engine.setFilter({ cutoff: preset.cutoff, resonance: preset.resonance, drive: preset.drive, keyTrack: preset.keyTrack, envAmount: preset.filterEnvAmount }); this.engine.setEnvelope('filter', preset.filterEnv); this.engine.setEnvelope('amp', preset.ampEnv); this.engine.setLFO(0, { rate: preset.lfo1Rate, waveform: preset.lfo1Wave }); this.engine.setLFO(1, { rate: preset.lfo2Rate }); this.engine.setModulation(0, preset.mod1); this.engine.setModulation(1, preset.mod2); this.engine.setDuoMode(preset.duo); this.engine.voice?.setOsc2SyncEnabled(preset.sync);
    this.displayTop.textContent = `${preset.bank}.${String(preset.slot).padStart(2, '0')} ${preset.name}`.slice(0, 22); this.displayBottom.textContent = preset.initialized ? 'INIT PRESET' : 'PRESET ACTIVE';
  }

  _initPatch() { this._applyPreset(255); this._showMessage('PANEL INITIALIZED'); }
  _savePatch() { this._showMessage('PATCH SAVED LOCALLY'); }
  _showMessage(message) { this.displayBottom.textContent = message; clearTimeout(this.messageTimer); this.messageTimer = setTimeout(() => { const preset = SUB37_PRESETS[this.currentPreset]; this.displayBottom.textContent = preset?.initialized ? 'INIT PRESET' : 'PANEL ACTIVE'; }, 1200); }
  _waveType(value) { return ['TRIANGLE', 'SAW', 'SQUARE', 'PULSE'][Math.min(3, Math.floor(value * 4))]; }
  _setOctave(value) { this.engine.setOctaveShift(value); this._renderOctave(); }
  _renderOctave() { const value = this.engine.octaveShift; this.octaveReadout.textContent = `KB OCT ${value > 0 ? '+' : ''}${value}`; }

  _noteOn(note, velocity = 0.86) { if (!this.engine.started) return; this.keyboard.setKeyActive(note, true); if (this.seq.recording) { Object.assign(this.sequence[this.seq.selected], { note, rest: false, tie: false }); this.seq.selected = (this.seq.selected + 1) % 64; this._renderSequence(); return; } if (this.arp.on) { if (!this.arp.notes.includes(note)) this.arp.notes.push(note); this._refreshClock(); return; } this.engine.noteOn(note, velocity); }
  _noteOff(note) { if (!this.engine.started) return; this.keyboard.setKeyActive(note, false); if (this.arp.on) { this.arp.notes = this.arp.notes.filter((item) => item !== note); if (!this.arp.latch && !this.arp.notes.length) this.engine.allNotesOff(); return; } this.engine.noteOff(note); }

  _refreshClock() { clearInterval(this.seq.timer); this.seq.timer = null; if (!this.engine.started || (!this.arp.on && !this.seq.playing)) return; const ms = clamp(60000 / Math.max(2, this.arp.rate) / 2, 28, 2000); this.seq.timer = setInterval(() => this._clock(), ms); this._clock(); }
  _clock() { if (this.seq.playing || this.arp.pattern === 'SEQ') this._playSequenceStep(); else this._playArpStep(); }
  _playArpStep() { if (!this.arp.notes.length) return; const notes = [...this.arp.notes].sort(); let index = this.arp.index++; if (this.arp.pattern === 'DWN') index = notes.length - 1 - (index % notes.length); else if (this.arp.pattern === 'RND') index = Math.floor(Math.random() * notes.length); else index %= notes.length; const note = notes[index]; this.engine.noteOn(note, 0.88); clearTimeout(this.arp.releaseTimer); this.arp.releaseTimer = setTimeout(() => this.engine.noteOff(note), clamp(60000 / this.arp.rate * 0.38, 16, 600)); }
  _playSequenceStep() { const index = this.seq.index++ % 64; const step = this.sequence[index]; this._renderSequence(index); if (step.rest || !step.note) { if (!step.tie) this.engine.allNotesOff(); return; } this.engine.noteOn(step.note, 0.88); if (!step.tie) { clearTimeout(this.seq.releaseTimer); this.seq.releaseTimer = setTimeout(() => this.engine.noteOff(step.note), clamp(60000 / this.arp.rate * 0.42, 18, 600)); } }
  _setSeqFlag(flag) { const step = this.sequence[this.seq.selected]; step[flag] = !step[flag]; if (flag === 'rest' && !step.rest) step.note ??= 'C3'; this._renderSequence(); }
  _clearSequence() { this.sequence.forEach((step) => Object.assign(step, { note: null, rest: true, tie: false, mod: 0 })); this._renderSequence(); this._showMessage('SEQUENCE CLEARED'); }
  _renderSequence(playingIndex = -1) { if (!this.stepGrid) return; [...this.stepGrid.children].forEach((button, local) => { const index = this.seq.page * 16 + local; const step = this.sequence[index]; button.classList.toggle('lit', !step.rest); button.classList.toggle('selected', index === this.seq.selected); button.classList.toggle('playing', index === playingIndex); button.title = step.rest ? `Step ${index + 1}: rest` : `Step ${index + 1}: ${step.note}${step.tie ? ' (tie)' : ''}`; }); }

  _bindComputerKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'tab') { event.preventDefault(); this.pitchWheel.setExternalValue(1); return; }
      if (event.key === 'Shift' && event.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT) { this.pitchWheel.setExternalValue(-1); return; }
      if (key === 'arrowup' || key === 'arrowdown') {
        event.preventDefault();
        this._startModWheelRamp(key === 'arrowup' ? 1 : -1);
        return;
      }
      if (event.repeat) return;
      if (key === '-' || key === '_') { this._setOctave(this.engine.octaveShift - 1); return; }
      if (key === '=' || key === '+') { this._setOctave(this.engine.octaveShift + 1); return; }
      const note = KEY_TO_NOTE[key];
      if (note && !this.activeKeys.has(key)) { this.activeKeys.add(key); this._noteOn(note); }
    });
    window.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowup' || key === 'arrowdown') {
        if ((key === 'arrowup' && this._modKeyDirection === 1) || (key === 'arrowdown' && this._modKeyDirection === -1)) {
          this._stopModWheelRamp();
        }
        return;
      }
      if (key === 'tab' || (event.key === 'Shift' && event.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT)) { this.pitchWheel.springReturnToCenter(); return; }
      const note = KEY_TO_NOTE[key];
      if (note && this.activeKeys.has(key)) { this.activeKeys.delete(key); this._noteOff(note); }
    });
    window.addEventListener('blur', () => { this.activeKeys.clear(); this.engine.allNotesOff(); this.pitchWheel.springReturnToCenter(); this._stopModWheelRamp(); });
  }

  _startModWheelRamp(direction) {
    this._modKeyDirection = direction;
    if (this._modRampRAF) return;
    let previous = performance.now();
    const step = (now) => {
      if (!this._modKeyDirection) { this._modRampRAF = null; return; }
      const elapsed = Math.min(0.05, Math.max(0, (now - previous) / 1000));
      previous = now;
      this.modWheel.setExternalValue(clamp(this.modWheel.value + this._modKeyDirection * elapsed * 1.4, 0, 1));
      this._modRampRAF = requestAnimationFrame(step);
    };
    this._modRampRAF = requestAnimationFrame(step);
  }

  _stopModWheelRamp() {
    this._modKeyDirection = 0;
    if (this._modRampRAF) cancelAnimationFrame(this._modRampRAF);
    this._modRampRAF = null;
  }
}

document.addEventListener('DOMContentLoaded', () => { const app = new Sub37(); window.__sub37App = app; });
