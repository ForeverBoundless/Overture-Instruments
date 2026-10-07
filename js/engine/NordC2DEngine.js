import { midiToFreq, noteNameToMidi } from './Voice.js';

const PARTIAL_RATIOS = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
const B3_DRAWBAR_LEVELS = [0.095, 0.078, 0.064, 0.052, 0.042, 0.033, 0.025, 0.017, 0];
const DEFAULT_DRAWBARS = Array(9).fill(0);
const MODEL_RATIOS = {
  B3: PARTIAL_RATIOS,
  VX: [0.5, 1, 2, 3, 4, 6, 8, 10, 12],
  Farf: [0.5, 1, 2, 2, 3, 4, 5, 8, 12],
  Pipe: [0.5, 1, 2, 3, 4, 6, 8, 10, 12],
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class NordC2DEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.manuals = [this._manualState(), this._manualState()];
    this.voices = [new Map(), new Map()];
    this.sustain = false;
    this.sustainedNotes = [new Set(), new Set()];
    this.octaveShift = [0, 0];
    this.model = 'B3';
    this.pedal = { drawbars: [0, 0], notes: new Map(), synthBass: false, pluck: 0, release: 0 };
    this.greatSplit = false;
    this.crosstalk = 'Vintage 3';
    this.keyClick = 'Normal';
    this.keyBounce = true;
    this.program = { index: 1, live: false, dirty: false, memoryProtect: true };
    this.pipe = { stops: Array(21).fill(false), couplers: Array(7).fill(false), tremulant: false };
    this.rotary = false;
    this.reverb = 0.18;
    this.drive = 0;
    this._rotaryPhase = 0;
  }

  _manualState() {
    return { drawbars: [...DEFAULT_DRAWBARS], vibrato: 'C3', vibratoEnabled: true, percussion: false, percussionHarmonic: 3, percussionLevel: 'Normal', percussionDecayMode: 'Slow', percussionDecay: 0.35, preset: 1, activeBank: 'A', banks: { A: [...DEFAULT_DRAWBARS], B: [...DEFAULT_DRAWBARS] } };
  }

  async start() {
    if (this.started) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.output = this.ctx.createGain();
    this.output.gain.value = 0.55;
    this.driveNode = this.ctx.createWaveShaper();
    this.driveNode.curve = this._driveCurve();
    this.delay = this.ctx.createDelay(1);
    this.delay.delayTime.value = 0.22;
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.value = this.reverb;
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this._impulse(1.4, 1.8);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = this.reverb;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.ratio.value = 12;
    this.output.connect(this.driveNode);
    this.driveNode.connect(this.limiter);
    this.output.connect(this.delay);
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.limiter);
    this.output.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
    this.rotaryLfo = this.ctx.createOscillator();
    this.rotaryDepth = this.ctx.createGain();
    this.rotaryLfo.frequency.value = 0.8;
    this.rotaryDepth.gain.value = 0;
    this.rotaryLfo.connect(this.rotaryDepth);
    this.rotaryLfo.start();
    this.started = true;
    this._startTonewheelLeakage();
  }

  _driveCurve() {
    const curve = new Float32Array(256);
    const amount = 1.2 + this.drive * 8;
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    return curve;
  }

  _impulse(seconds, decay) {
    const buffer = this.ctx.createBuffer(2, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, decay);
    }
    return buffer;
  }

  _startTonewheelLeakage() {
      this.leakageGain = this.ctx.createGain();
      this.leakageGain.gain.value = 0;
      this.leakageGain.connect(this.output);
      this.leakage = [36.7, 41.2, 49].map((frequency, index) => {
        const oscillator = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        oscillator.type = index === 1 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 0 ? 0.65 : 0.2;
        oscillator.connect(gain);
        gain.connect(this.leakageGain);
        oscillator.start();
        return oscillator;
      });
      this._updateLeakage();
    }

  _updateLeakage() {
    if (!this.leakageGain) return;
    const audible = this.manuals.some((manual) => manual.drawbars.some((value) => value < 8)) || this.pedal.drawbars.some((value) => value < 8);
    const amount = audible ? ({ Clean: 0.00008, 'Vintage 1': 0.00025, 'Vintage 2': 0.00055, 'Vintage 3': 0.0011 }[this.crosstalk] ?? 0.00055) : 0;
    this.leakageGain.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.01);
  }

  setModel(model) {
      this.model = model;
      this.program.dirty = true;
      this.voices.forEach((voices) => voices.forEach((voice) => {
        voice.partials.forEach(({ oscillator }, index) => { oscillator.type = model === 'VX' ? 'sawtooth' : model === 'Farf' ? 'square' : 'sine'; oscillator.frequency.value = voice.baseFrequency * this._foldback((MODEL_RATIOS[model] ?? PARTIAL_RATIOS)[index], voice.midi); });
        this._retuneVoice(voice);
      }));
    }

  setCrosstalk(mode) {
      this.crosstalk = mode;
      this._updateLeakage();
    }

  setKeyClick(level, bounce = this.keyBounce) { this.keyClick = level; this.keyBounce = bounce; }

  setPedalDrawbar(index, value) { this.pedal.drawbars[index] = clamp(Number(value), 0, 8); }

  setBassSettings({ synthBass = this.pedal.synthBass, pluck = this.pedal.pluck, release = this.pedal.release } = {}) {
      this.pedal.synthBass = synthBass; this.pedal.pluck = clamp(Number(pluck), 0, 8); this.pedal.release = clamp(Number(release), 0, 8);
    }

  setGreatSplit(enabled) { this.greatSplit = !!enabled; }

  setSustain(down) {
    this.sustain = !!down;
    if (!this.sustain) this.sustainedNotes.forEach((notes, manual) => {
      [...notes].forEach((note) => { notes.delete(note); this.noteOff(manual, note); });
    });
  }

  setPipeStop(index, enabled) { this.pipe.stops[index] = !!enabled; }

  setPipeCoupler(index, enabled) { this.pipe.couplers[index] = !!enabled; }

  setTremulant(enabled) { this.pipe.tremulant = !!enabled; }

  _retuneVoice(voice) {
      const ratios = MODEL_RATIOS[this.model] ?? PARTIAL_RATIOS;
      voice.partials.forEach(({ oscillator }, index) => oscillator.frequency.setTargetAtTime(voice.baseFrequency * this._foldback(ratios[index], voice.midi), this.ctx.currentTime, 0.01));
    }

  _foldback(ratio, midi) {
      let frequency = midiToFreq(midi) * ratio;
      while (frequency > 12000) frequency /= 2;
      return frequency / midiToFreq(midi);
    }

  _click(voice, amount, release = false) {
      const click = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      click.type = 'square';
      filter.type = 'bandpass';
      filter.frequency.value = release ? 1550 : 2400;
      filter.Q.value = 2.2;
      click.frequency.value = release ? 1700 : 2300;
      gain.gain.setValueAtTime(amount, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + (release ? 0.022 : 0.012));
      click.connect(filter); filter.connect(gain); gain.connect(this.output); click.start(); click.stop(this.ctx.currentTime + 0.03);
  }

  setOctave(manual, value) {
    this.octaveShift[manual] = clamp(value, -2, 2);
  }

  setDrawbar(manual, index, value) {
    const normalized = (this.model === 'Farf' || this.model === 'Pipe') ? (Number(value) > 0 ? 8 : 0) : clamp(Number(value), 0, 8);
    this.manuals[manual].drawbars[index] = normalized;
    this.manuals[manual].banks[this.manuals[manual].activeBank][index] = this.manuals[manual].drawbars[index];
    this.voices[manual].forEach((voice) => { voice.partials[index].gain.gain.setTargetAtTime(this._drawbarGain(normalized), this.ctx.currentTime, 0.015); });
    this._updateLeakage();
  }

  setBankDrawbar(manual, bank, index, value) {
    const nextBank = bank === 'B' ? 'B' : 'A';
    const normalized = (this.model === 'Farf' || this.model === 'Pipe') ? (Number(value) > 0 ? 8 : 0) : clamp(Number(value), 0, 8);
    this.manuals[manual].banks[nextBank][index] = normalized;
    if (this.manuals[manual].activeBank === nextBank) this.setDrawbar(manual, index, normalized);
  }

  setDrawbarBank(manual, bank) {
    const nextBank = bank === 'B' ? 'B' : 'A';
    this.manuals[manual].activeBank = nextBank;
    this.manuals[manual].drawbars = [...this.manuals[manual].banks[nextBank]];
    this.manuals[manual].drawbars.forEach((value, index) => {
      this.voices[manual].forEach((voice) => { voice.partials[index].gain.gain.setTargetAtTime(this._drawbarGain(value), this.ctx.currentTime, 0.015); });
    });
    this._updateLeakage();
  }

  setVibrato(manual, value) {
    this.manuals[manual].vibrato = value;
  }

  setRotary(enabled) {
    this.rotary = !!enabled;
    this.voices.forEach((voices) => voices.forEach((voice) => voice.rotaryGain?.gain.setTargetAtTime(this.rotary ? 6 : 0, this.ctx.currentTime, 0.25)));
    if (this.rotary) {
      this.rotaryLfo.frequency.setTargetAtTime(6.2, this.ctx.currentTime, 0.25);
      this.rotaryDepth.gain.setTargetAtTime(0.012, this.ctx.currentTime, 0.25);
    } else {
      this.rotaryLfo.frequency.setTargetAtTime(0.8, this.ctx.currentTime, 0.25);
      this.rotaryDepth.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
  }

  setReverb(value) {
    this.reverb = clamp(Number(value), 0, 1);
    if (this.reverbGain) this.reverbGain.gain.setTargetAtTime(this.reverb * 0.45, this.ctx.currentTime, 0.02);
  }

  setDrive(value) {
    this.drive = clamp(Number(value), 0, 1);
    if (this.driveNode) this.driveNode.curve = this._driveCurve();
  }

  _drawbarGain(value) {
    const step = clamp(Math.round(Number(value)), 0, 8);
    return this.model === 'B3' ? B3_DRAWBAR_LEVELS[step] : ((8 - step) / 8) * 0.095;
  }

  _percussion(manual, midi, velocity) {
    const state = this.manuals[manual];
    if (manual !== 1 || !state.percussion || state.activeBank !== 'B' || this.voices[manual].size > 0) return;
    const partialIndex = state.percussionHarmonic === 2 ? 1 : 2;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const ratio = (MODEL_RATIOS.B3 ?? PARTIAL_RATIOS)[partialIndex];
    const level = state.percussionLevel === 'Soft' ? 0.045 : 0.085;
    const decay = state.percussionDecayMode === 'Fast' ? 0.12 : 0.32;
    oscillator.type = 'sine';
    oscillator.frequency.value = midiToFreq(midi) * ratio;
    gain.gain.setValueAtTime(Math.max(0.001, velocity * level), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    oscillator.connect(gain);
    gain.connect(this.output);
    oscillator.start(now);
    oscillator.stop(now + decay + 0.03);
  }

  noteOn(manual, note, velocity = 0.9) {
    if (!this.started) return;
    this.sustainedNotes[manual].delete(note);
    this.noteOff(manual, note);
    const midi = noteNameToMidi(note) + this.octaveShift[manual] * 12;
    const now = this.ctx.currentTime;
    const voice = { partials: [], gain: this.ctx.createGain(), note };
    voice.gain.gain.setValueAtTime(0.0001, now);
    voice.gain.gain.exponentialRampToValueAtTime(Math.max(0.018, velocity * 0.58), now + 0.008);
    voice.gain.connect(this.output);
    const vibratoCents = !this.manuals[manual].vibratoEnabled || this.manuals[manual].vibrato === 'OFF'
      ? 0
      : this.manuals[manual].vibrato === 'C3' ? 5 : 8;
    const ratios = MODEL_RATIOS[this.model] ?? PARTIAL_RATIOS;
    PARTIAL_RATIOS.forEach((_, index) => {
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = this.model === 'VX' ? 'sawtooth' : this.model === 'Farf' ? 'square' : 'sine';
      const ratio = ratios[index];
      oscillator.frequency.value = midiToFreq(midi) * this._foldback(ratio, midi);
      if (vibratoCents) oscillator.detune.value = 0;
      gain.gain.value = this._drawbarGain(this.manuals[manual].drawbars[index]);
      oscillator.connect(gain);
      gain.connect(voice.gain);
      oscillator.start(now);
      voice.partials.push({ oscillator, gain });
    });
    voice.baseFrequency = midiToFreq(midi);
    voice.midi = midi;
    if (this.model === 'B3' && this.manuals[manual].drawbars.some((value) => value < 8)) {
      this._click(voice, { Low: 0.015, Normal: 0.03, High: 0.05, Higher: 0.08 }[this.keyClick] ?? 0.03);
      this._percussion(manual, midi, velocity);
    }
    voice.gain.connect(this.reverbNode);
    voice.gain.connect(this.delay);
    voice.lfo = this.ctx.createOscillator();
    voice.lfo.frequency.value = vibratoCents ? 5.9 : 0;
    voice.lfoGain = this.ctx.createGain();
    voice.lfoGain.gain.value = vibratoCents;
    voice.lfo.connect(voice.lfoGain);
    if (this.model === 'B3') voice.partials.forEach(({ oscillator }) => voice.lfoGain.connect(oscillator.detune));
    voice.rotaryGain = this.ctx.createGain();
    voice.rotaryGain.gain.value = this.rotary && this.model === 'B3' ? 6 : 0;
    this.rotaryLfo.connect(voice.rotaryGain);
    voice.partials.forEach(({ oscillator }) => voice.rotaryGain.connect(oscillator.detune));
    voice.lfo.start(now);
    this.voices[manual].set(note, voice);
  }

  noteOff(manual, note) {
    const voice = this.voices[manual].get(note);
    if (!voice || !this.started) return;
    if (this.sustain) {
      this.sustainedNotes[manual].add(note);
      return;
    }
    const now = this.ctx.currentTime;
    if (this.model === 'B3' && this.keyBounce) this._click(voice, 0.018, true);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.09);
    voice.partials.forEach(({ oscillator }) => oscillator.stop(now + 0.45));
    voice.lfo.stop(now + 0.45);
    this.voices[manual].delete(note);
  }

  allNotesOff() {
    this.sustain = false;
    this.sustainedNotes.forEach((notes) => notes.clear());
    this.voices.forEach((voices, manual) => [...voices.keys()].forEach((note) => this.noteOff(manual, note)));
  }
}
