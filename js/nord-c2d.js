import { Keyboard } from '../ui/Keyboard.js';
import { NordC2DEngine } from './engine/NordC2DEngine.js';
import { MidiManager } from './engine/MidiManager.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const makeChromaticMap = (keys, startMidi) => keys.map((key, index) => [key, noteName(startMidi + index)]);
const UPPER_MAP = makeChromaticMap('q2w3er5t6y7ui9o0p[=]'.split(''), 48);
const LOWER_MAP = makeChromaticMap('zsxdcvgbhnjm,l.;/'.split(''), 36);
const COMPUTER_KEY_MAP = new Map([
  ...UPPER_MAP.map(([key, note]) => [key, { note, manual: 1 }]),
  ...LOWER_MAP.map(([key, note]) => [key, { note, manual: 0 }]),
]);

class NordC2D {
  constructor() {
    this.engine = new NordC2DEngine();
    this.octaves = [0, 0];
    this.keyboards = [];
    this.computerNotes = new Map();
    this.pendingMidiNotes = new Map();
    this._build();
    this._bindComputerKeyboard();
    this._bindPower();
    this.midi = new MidiManager({
      onNoteOn: (note, velocity, channel) => this._midiNoteOn(note, velocity, channel),
      onNoteOff: (note, channel) => this._midiNoteOff(note, channel),
      onSustain: (down) => this.engine.setSustain(down),
      onAllNotesOff: () => this.engine.allNotesOff(),
      onProgramChange: (program) => this._selectMidiProgram(program),
    });
    this.midi.init();
  }

  _build() {
    const root = document.getElementById('nord-c2d-root');
    const shell = document.createElement('main');
    shell.className = 'nord-shell';
    shell.innerHTML = `<header class="nord-header"><img src="./ui/Logos/Nord_logo.png" alt="Nord" class="nord-logo"><div class="nord-title"><strong>nord <b>c2d</b></strong><span>DUAL MANUAL ORGAN</span></div></header><section class="nord-top-panel"><div class="nord-brand-display"><small>PROGRAM <b class="nord-program-number">001</b></small><strong class="nord-program-name">B3 DRAWBAR PANEL</strong><span>LIVE MEMORY</span></div><div class="nord-global-controls"><label>ORGAN MODEL<select class="nord-model"><option>B3</option><option>VX</option><option>Farf</option><option>Pipe</option></select></label><button data-action="rotary">ROTARY</button><button data-action="reverb">REVERB</button><button data-action="drive">DRIVE</button><button data-action="split">TO GREAT</button><button data-action="pedal">PEDAL</button><button data-action="store">STORE</button></div><div class="nord-global-knobs"><label class="nord-control-slider"><span>MASTER LEVEL</span><i class="nord-slider-face" data-control="master" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="1" aria-valuenow=".55" aria-label="Master level"><b></b></i><output>55</output></label><label class="nord-control-slider"><span>REVERB</span><i class="nord-slider-face" data-control="reverb" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="1" aria-valuenow=".18" aria-label="Reverb"><b></b></i><output>18</output></label><label class="nord-control-slider"><span>DRIVE</span><i class="nord-slider-face" data-control="drive" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0" aria-label="Drive"><b></b></i><output>0</output></label></div></section><section class="nord-system-row"><label>CROSSTALK<select class="nord-crosstalk"><option>Clean</option><option>Vintage 1</option><option>Vintage 2</option><option selected>Vintage 3</option></select></label><label>KEY CLICK<select class="nord-click"><option>Low</option><option selected>Normal</option><option>High</option><option>Higher</option></select></label><label>ROTARY SPEED<select class="nord-rotary-speed"><option>Slow</option><option selected>Stop</option><option>Fast</option></select></label><label>PROGRAM <button data-program="previous">−</button><output class="nord-program-readout">001</output><button data-program="next">+</button></label></section><section class="nord-model-panel"></section><section class="nord-manuals"></section><footer class="nord-footer">NORD C2D • DUAL 37-KEY MANUALS • B3 / VX / FARF / PIPE • COMPUTER KEYBOARD READY</footer>`;
    root.appendChild(shell);
    shell.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
      button.classList.toggle('active');
      if (button.dataset.action === 'rotary') this.engine.setRotary(button.classList.contains('active'));
      if (button.dataset.action === 'reverb') this.engine.setReverb(button.classList.contains('active') ? 0.45 : 0.08);
    }));
    const controls = { master: 0.55, reverb: 0.18, drive: 0 };
    shell.querySelectorAll('[data-control]').forEach((control) => {
      const output = control.parentElement.querySelector('output');
      const setValue = (value) => {
        const next = clamp(value, 0, 1);
        controls[control.dataset.control] = next;
        control.setAttribute('aria-valuenow', next);
        control.style.setProperty('--slider-value', next);
        output.textContent = `${Math.round(next * 100)}`;
        if (control.dataset.control === 'master' && this.engine.output) this.engine.output.gain.value = next;
        if (control.dataset.control === 'reverb') this.engine.setReverb(next);
        if (control.dataset.control === 'drive') this.engine.setDrive(next);
      };
      setValue(controls[control.dataset.control]);
      control.addEventListener('pointerdown', (event) => {
        control.setPointerCapture(event.pointerId);
        const bounds = control.getBoundingClientRect();
        setValue((event.clientX - bounds.left) / bounds.width);
      });
      control.addEventListener('pointermove', (event) => {
        if (event.buttons) {
          const bounds = control.getBoundingClientRect();
          setValue((event.clientX - bounds.left) / bounds.width);
        }
      });
      control.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          setValue(controls[control.dataset.control] + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 0.01 : -0.01));
        }
      });
    });
    shell.querySelector('.nord-model').addEventListener('change', (event) => this.engine.setModel(event.target.value));
    shell.querySelector('.nord-crosstalk').addEventListener('change', (event) => this.engine.setCrosstalk(event.target.value));
    shell.querySelector('.nord-click').addEventListener('change', (event) => this.engine.setKeyClick(event.target.value));
    shell.querySelector('.nord-rotary-speed').addEventListener('change', (event) => this.engine.setRotary(event.target.value === 'Fast'));
    shell.querySelector('[data-action="split"]').addEventListener('click', (event) => { event.currentTarget.classList.toggle('active'); this.engine.setGreatSplit(event.currentTarget.classList.contains('active')); });
    shell.querySelectorAll('[data-program]').forEach((button) => button.addEventListener('click', () => this._changeProgram(button.dataset.program)));
    shell.querySelector('[data-action="store"]').addEventListener('click', () => this._storeProgram());
    this._buildModelPanel(shell.querySelector('.nord-model-panel'));
    const manuals = shell.querySelector('.nord-manuals');
    manuals.appendChild(this._buildManual('UPPER MANUAL', 1));
    manuals.appendChild(this._buildManual('LOWER MANUAL', 0));
  }

  _buildModelPanel(panel) {
    const presets = ['UPPER 1', 'UPPER 2', 'UPPER 3', 'GREAT 1', 'GREAT 2', 'GREAT 3', 'PEDAL'];
    const stops = ['Prinzipal 16', 'Subbass 16', 'Octave 8', 'Gedackt 8', 'Octave 4', 'Quint 2 2/3', 'Super Octave 2', 'Mixture IV', 'Trumpet 8', 'Clarion 4', 'Fugara 4', 'Nasat 2 2/3', 'Tierce 1 3/5', 'Sifflet 1', 'Bourdon 16', 'Flute 8', 'Flute 4', 'Sesquialtera', 'Cromorne 8', 'Voix humaine 8', 'Pedal Principal'];
    panel.innerHTML = `<div class="nord-preset-bank"><span>PRESET / DRAWBAR FOCUS</span>${presets.map((preset) => `<button>${preset}</button>`).join('')}</div><div class="nord-pipe-controls"><span>PIPE STOPS / COUPLERS</span><div class="nord-stop-grid">${stops.map((stop, index) => `<button data-stop="${index}">${stop}</button>`).join('')}</div><div class="nord-couplers">${['Swell to Great', 'Great to Pedal', 'Swell to Pedal', 'Super Octave', 'Sub Octave', 'Tremulant', 'Pipe Release'].map((name, index) => `<button data-coupler="${index}">${name}</button>`).join('')}</div></div>`;
    panel.querySelectorAll('[data-stop]').forEach((button) => button.addEventListener('click', () => { button.classList.toggle('active'); this.engine.setPipeStop(Number(button.dataset.stop), button.classList.contains('active')); }));
    panel.querySelectorAll('[data-coupler]').forEach((button) => button.addEventListener('click', () => { button.classList.toggle('active'); const index = Number(button.dataset.coupler); if (index === 5) this.engine.setTremulant(button.classList.contains('active')); else this.engine.setPipeCoupler(index, button.classList.contains('active')); }));
    panel.querySelectorAll('.nord-preset-bank button').forEach((button) => button.addEventListener('click', () => { panel.querySelectorAll('.nord-preset-bank button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); }));
  }

  _buildManual(label, index) {
    const section = document.createElement('section');
    section.className = `nord-manual nord-manual--${index ? 'upper' : 'lower'}`;
    section.innerHTML = `<div class="nord-manual-head"><div><span>MANUAL ${index ? 'II' : 'I'}</span><strong>${label}</strong></div><div class="nord-manual-switches"><button data-bank="A" class="active">DRAWBAR A</button><button data-bank="B">DRAWBAR B</button><button data-vibrato="C3">VIB/CHORUS C3</button><button data-vibrato="OFF">VIB OFF</button><button data-percussion="true">PERCUSSION</button></div><div class="nord-octave"><span class="nord-octave-label">OCTAVE</span><button type="button" aria-label="${label} octave down">−</button><output>OCT 0</output><button type="button" aria-label="${label} octave up">+</button></div></div><div class="nord-drawbar-panel"><div class="nord-manual-banks"></div></div><div class="nord-keyboard-wrap"></div>`;
    const drawbarLabels = ["16'", "5 1/3'", "8'", "4'", "2 2/3'", "2'", "1 3/5'", "1 1/3'", "1'"];
    const banks = section.querySelector('.nord-manual-banks');
    ['A', 'B'].forEach((bank) => {
      const bankPanel = document.createElement('div');
      bankPanel.className = `nord-drawbar-bank nord-drawbar-bank--${bank.toLowerCase()}`;
      bankPanel.innerHTML = `<header>${index ? 'SWELL' : 'GREAT'} ${bank} <small>${bank === 'A' ? '(PRESET)' : bank === 'B' ? '(PERC)' : ''}</small></header><div class="nord-drawbars"></div>`;
      const drawbars = bankPanel.querySelector('.nord-drawbars');
      drawbarLabels.forEach((labelText, drawbarIndex) => {
      const labelEl = document.createElement('label');
      const value = 0;
      const meanings = ['SUB-OCTAVE', 'FIFTH', 'FUNDAMENTAL', 'OCTAVE', 'TWELFTH', 'TWO OCTAVES', 'SEVENTEENTH', 'NINETEENTH', 'THREE OCTAVES'];
      const color = [0, 1].includes(drawbarIndex) ? 'brown' : [4, 6, 7].includes(drawbarIndex) ? 'black' : 'white';
      labelEl.innerHTML = `<span>${labelText}</span><small>${meanings[drawbarIndex]}</small><span class="nord-drawbar nord-drawbar--${color}" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${value}" aria-label="${labelText} ${bank} drawbar"><i></i><b></b><em>8 7 6 5 4 3 2 1 0</em></span><output>${value}</output>`;
      const drawbar = labelEl.querySelector('.nord-drawbar');
      const output = labelEl.querySelector('output');
      const setValue = (next) => { const amount = clamp(Math.round(next), 0, 8); drawbar.setAttribute('aria-valuenow', amount); drawbar.style.setProperty('--drawbar', amount); output.textContent = amount; this.engine.setBankDrawbar(index, bank, drawbarIndex, amount); };
      const updateFromPointer = (event) => { const rect = drawbar.getBoundingClientRect(); setValue(8 - ((event.clientY - rect.top) / rect.height) * 8); };
      drawbar.style.setProperty('--drawbar', value);
      drawbar.addEventListener('pointerdown', (event) => { drawbar.setPointerCapture(event.pointerId); updateFromPointer(event); });
      drawbar.addEventListener('pointermove', (event) => { if (event.buttons) updateFromPointer(event); });
      drawbar.addEventListener('keydown', (event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setValue(Number(drawbar.getAttribute('aria-valuenow')) + (event.key === 'ArrowUp' ? 1 : -1)); } });
      drawbars.appendChild(labelEl);
      });
      banks.appendChild(bankPanel);
    });
    section.querySelectorAll('[data-vibrato]').forEach((button) => button.addEventListener('click', () => {
      section.querySelectorAll('[data-vibrato]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      this.engine.setVibrato(index, button.dataset.vibrato);
    }));
    section.querySelectorAll('[data-bank]').forEach((button) => button.addEventListener('click', () => {
      section.querySelectorAll('[data-bank]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      this.engine.setDrawbarBank(index, button.dataset.bank);
      section.querySelector(`.nord-drawbar-bank--${button.dataset.bank.toLowerCase()}`).querySelectorAll('.nord-drawbar').forEach((drawbar, drawbarIndex) => {
        const value = this.engine.manuals[index].drawbars[drawbarIndex];
        drawbar.setAttribute('aria-valuenow', value);
        drawbar.style.setProperty('--drawbar', value);
        drawbar.nextElementSibling.textContent = value;
      });
    }));
    section.querySelector('[data-percussion]').addEventListener('click', (event) => {
      event.currentTarget.classList.toggle('active');
      this.engine.manuals[index].percussion = event.currentTarget.classList.contains('active');
    });
    const keyboard = new Keyboard({ startOctave: 2, octaves: 3, onNoteOn: (note, velocity) => this._noteOn(index, note, velocity), onNoteOff: (note) => this._noteOff(index, note) });
    section.querySelector('.nord-keyboard-wrap').appendChild(keyboard.el);
    const output = section.querySelector('output');
    const buttons = section.querySelectorAll('.nord-octave button');
    buttons[0].addEventListener('click', () => this._setOctave(index, this.octaves[index] - 1, output));
    buttons[1].addEventListener('click', () => this._setOctave(index, this.octaves[index] + 1, output));
    this.keyboards[index] = keyboard;
    return section;
  }

  _setOctave(index, value, output) {
    this.octaves[index] = clamp(value, -2, 2);
    this.engine.setOctave(index, this.octaves[index]);
    output.textContent = `OCT ${this.octaves[index] > 0 ? '+' : ''}${this.octaves[index]}`;
  }

  _changeProgram(direction) {
    this.engine.program.index = clamp(this.engine.program.index + (direction === 'next' ? 1 : -1), 1, 126);
    const value = String(this.engine.program.index).padStart(3, '0');
    document.querySelector('.nord-program-number').textContent = value;
    document.querySelector('.nord-program-readout').textContent = value;
    document.querySelector('.nord-program-name').textContent = this.engine.program.index <= 104 ? 'FACTORY ORGAN PROGRAM' : 'EMPTY PROGRAM';
  }

  _selectMidiProgram(program) {
    this.engine.program.index = clamp(Number(program) + 1, 1, 126);
    const value = String(this.engine.program.index).padStart(3, '0');
    document.querySelector('.nord-program-number').textContent = value;
    document.querySelector('.nord-program-readout').textContent = value;
    document.querySelector('.nord-program-name').textContent = this.engine.program.index <= 104 ? 'FACTORY ORGAN PROGRAM' : 'EMPTY PROGRAM';
  }

  _midiManual(channel) {
    if (channel === 1) return 1;
    if (channel === 2) return 0;
    return null;
  }

  _midiNoteName(note) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
  }

  _midiNoteOn(note, velocity, channel) {
    const manual = this._midiManual(channel);
    if (manual === null) return;
    const noteName = this._midiNoteName(note);
    const key = `midi:${channel}:${note}`;
    this.computerNotes.set(key, { manual, note: noteName });
    if (!this.engine.started) {
      this.pendingMidiNotes.set(key, { manual, note: noteName, velocity });
      return;
    }
    this._noteOn(manual, noteName, velocity);
  }

  _midiNoteOff(note, channel) {
    const held = this.computerNotes.get(`midi:${channel}:${note}`);
    if (!held) return;
    this.pendingMidiNotes.delete(`midi:${channel}:${note}`);
    if (!this.engine.started) {
      this.computerNotes.delete(`midi:${channel}:${note}`);
      return;
    }
    this._noteOff(held.manual, held.note);
    this.computerNotes.delete(`midi:${channel}:${note}`);
  }

  _storeProgram() {
    if (this.engine.program.memoryProtect) {
      document.querySelector('.nord-program-name').textContent = 'MEMORY PROTECT ON';
      return;
    }
    localStorage.setItem(`nord-c2d-program-${this.engine.program.index}`, JSON.stringify({ model: this.engine.model, manuals: this.engine.manuals }));
    document.querySelector('.nord-program-name').textContent = 'PROGRAM STORED';
    this.engine.program.dirty = false;
  }

  _bindComputerKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      const entry = COMPUTER_KEY_MAP.get(key);
      if (!entry) return;
      this.computerNotes.set(key, entry);
      this._noteOn(entry.manual, entry.note, 0.8);
      event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      const held = this.computerNotes.get(event.key.toLowerCase());
      if (!held) return;
      this._noteOff(held.manual, held.note);
      this.computerNotes.delete(event.key.toLowerCase());
      event.preventDefault();
    });
  }

  async _bindPower() {
    const power = document.getElementById('nord-c2d-power');
    let powered = false;
    const start = async () => {
      if (powered) return;
      powered = true;
      await this.engine.start();
      this.pendingMidiNotes.forEach(({ manual, note, velocity }) => this._noteOn(manual, note, velocity));
      this.pendingMidiNotes.clear();
      power.classList.add('is-off');
    };
    power.addEventListener('click', start);
    power.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') start(); });
  }

  _noteOn(index, note, velocity) {
    this.keyboards[index].setKeyActive(note, true);
    this.engine.noteOn(index, note, velocity);
  }

  _noteOff(index, note) {
    this.keyboards[index].setKeyActive(note, false);
    this.engine.noteOff(index, note);
  }
}

new NordC2D();
