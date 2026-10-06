import { Voice, midiToFreq, noteNameToMidi } from './Voice.js';
import { LFO } from './LFO.js';
import { setImmediate } from './ParamRamp.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeNote = (note) => typeof note === 'number'
  ? note
  : noteNameToMidi(note);
const noteToName = (note) => typeof note === 'string'
  ? note
  : `C${Math.floor(note / 12) - 1}`.replace('C', ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][note % 12]);

export class Prophet10Engine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = [];
    this.started = false;
    this.maxVoices = 10;
    this._held = new Map();
    this._voiceAge = 0;
    this._pitchBend = 0;
    this._pitchBendRange = 7;
    this._modWheel = 0;
    this._aftertouch = 0;
    this._sustain = false;
    this._sustainedNotes = new Set();
    this._noteOrder = [];
    this._glide = { mode: 'rate', time: 0, legato: true };
    this._notePriority = 'last';
    this._unison = false;
    this._polyUnison = false;
    this._stack = false;
    this._split = { enabled: false, point: 60 };
    this._chordMemory = { enabled: false, notes: [] };
    this._chordHeld = new Map();
    this._chordCapturing = false;
    this._hold = false;
    this._masterTune = 440;
    this._alternateTuning = null;
    this._calibration = null;
    this._masterVolume = 0.24;
    this._vintage = 4;
    this._params = {
      cutoff: 4200, resonance: 0.18, filterEnvAmount: 2800, keyTrack: 0.5,
      oscALevel: 0.78, oscBLevel: 0.62, noiseLevel: 0.02,
      oscAOctave: 8, oscBOctave: 8, oscBFine: 0,
      ampEnv: { attack: 0.004, decay: 0.3, sustain: 0.72, release: 0.35 },
      filterEnv: { attack: 0.004, decay: 0.35, sustain: 0.2, release: 0.32 },
      lfoRate: 4, lfoAmount: 0, wheelSourceMix: 0, wheelDestination: 'filter',
      polyFilterEnv: 0, polyOscB: 0,
      polyDestination: 'filter',
      oscAWaveform: 'saw', oscBWaveform: 'saw', oscAPulseWidth: 0.5, oscBPulseWidth: 0.5,
      oscASync: false, oscBSync: false, oscALowFreq: false, oscBLowFreq: false,
      keyboardDisconnect: false, velocityToAmp: 1, velocityToFilter: 0.16,
      aftertouchToFilter: 0, aftertouchToLfo: 0, wheelDestination: 'filter',
      filterRevision: 'rev4', qCompensation: 'program',
    };
  }

  async start() {
    if (this.started) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._masterVolume;
    this.master.connect(this.ctx.destination);
    this.lfo = new LFO(this.ctx);
    this.lfo.setRate(this._params.lfoRate);
    this.lfo.start();
    this.voices = Array.from({ length: this.maxVoices }, (_, index) => this._createVoice(index));
    this.started = true;
  }

  _createVoice(index) {
    const voice = new Voice(this.ctx);
    voice.connect(this.master);
    voice.mixer.setOsc1Level(this._params.oscALevel / this.maxVoices * 2.2);
    voice.mixer.setOsc2Level(this._params.oscBLevel / this.maxVoices * 2.2);
    voice.mixer.setNoiseLevel(this._params.noiseLevel / this.maxVoices * 2.2);
    voice.setBaseCutoff(this._params.cutoff);
    voice.filter.setResonance(this._params.resonance);
    voice.setFilterEnvAmount(this._params.filterEnvAmount);
    voice.setKeyTrackAmount(this._params.keyTrack);
    voice.ampEnv.setADSR(this._params.ampEnv);
    voice.filterEnv.setADSR(this._params.filterEnv);
    voice._prophetAge = 0;
    voice._prophetIndex = index;
    voice.osc1.setShape(this._params.oscAWaveform === 'triangle' ? 0 : this._params.oscAWaveform === 'square' ? 2 / 3 : this._params.oscAWaveform === 'pulse' ? 1 : 1 / 3);
    voice.osc2.setShape(this._params.oscBWaveform === 'triangle' ? 0 : this._params.oscBWaveform === 'square' ? 2 / 3 : this._params.oscBWaveform === 'pulse' ? 1 : 1 / 3);
    voice.osc1.setPulseWidth(this._params.oscAPulseWidth);
    voice.osc2.setPulseWidth(this._params.oscBPulseWidth);
    voice._polyFilterEnv = this.ctx.createGain();
    voice._polyOscB = this.ctx.createGain();
    voice._polyFilterEnv.gain.value = 0;
    voice._polyOscB.gain.value = 0;
    voice.filterEnvOutput = voice._filterEnvSummer;
    voice.filterEnvOutput.connect(voice._polyFilterEnv);
    voice._polyFilterEnv.connect(voice.osc1.pitchModInput);
    voice._polyFilterEnv.connect(voice.osc1.pwmOscB.detune);
    voice._polyFilterEnv.connect(voice.filter.poles[0].frequency);
    voice._polyFilterEnv.connect(voice.filter.poles[1].frequency);
    voice._polyFilterEnv.connect(voice.filter.poles[2].frequency);
    voice._polyFilterEnv.connect(voice.filter.poles[3].frequency);
    voice.osc2.output.connect(voice._polyOscB);
    voice._polyOscB.connect(voice.osc1.pitchModInput);
    voice._polyOscB.connect(voice.osc1.pwmOscB.detune);
    voice._polyOscB.connect(voice.filter.poles[0].frequency);
    voice._polyOscB.connect(voice.filter.poles[1].frequency);
    voice._polyOscB.connect(voice.filter.poles[2].frequency);
    voice._polyOscB.connect(voice.filter.poles[3].frequency);
    this.lfo.output.connect(voice.osc1.pitchModInput);
    this.lfo.output.connect(voice.osc2.pitchModInput);
    this.lfo.output.connect(voice.osc1.pwmOscB.detune);
    this.lfo.output.connect(voice.osc2.pwmOscB.detune);
    this.lfo.output.connect(voice.filter.poles[0].frequency);
    this.lfo.output.connect(voice.filter.poles[1].frequency);
    this.lfo.output.connect(voice.filter.poles[2].frequency);
    this.lfo.output.connect(voice.filter.poles[3].frequency);
    return voice;
  }

  _findVoice(note, excluded = []) {
    const existing = this._held.get(note);
    if (existing && !excluded.includes(existing.voice)) return existing.voice;
    return this.voices.find((voice) => !excluded.includes(voice) && (voice.ampEnv._stage === 'idle' || voice.ampEnv._stage === 'release'))
      ?? this.voices.filter((voice) => !excluded.includes(voice)).sort((a, b) => a._prophetAge - b._prophetAge)[0]
      ?? this.voices[0];
  }

  noteOn(note, velocity = 0.9) {
    if (!this.started) return;
    const midi = normalizeNote(note);
    if (this._chordMemory.enabled && !this._chordCapturing && this._chordMemory.notes.length > 1) {
      const root = this._chordMemory.notes[0];
      const chordNotes = this._chordMemory.notes.map((stored) => midi + stored - root);
      chordNotes.forEach((chordNote) => this._noteOnMidi(chordNote, velocity));
      this._chordHeld.set(midi, chordNotes);
      return chordNotes;
    }
    if (this._chordMemory.enabled && this._chordCapturing && this._chordMemory.notes.length === 0) {
      this._chordMemory.notes = [midi];
    } else if (this._chordMemory.enabled && this._chordCapturing && this._held.size && !this._chordMemory.notes.includes(midi)) {
      this._chordMemory.notes.push(midi);
    }
    if (this._split.enabled && midi < this._split.point) return this._noteOnMidi(midi, velocity, true);
    return this._noteOnMidi(midi, velocity);
  }

  _noteOnMidi(midi, velocity = 0.9, lowerSplit = false) {
    const note = noteToName(midi);
    const prior = this._held.get(note);
    if (prior) prior.voices.forEach((voice) => voice.noteOff());
    if (this._notePriority === 'low' && this._noteOrder.length && midi > this._noteOrder[0]) return;
    if (this._notePriority === 'high' && this._noteOrder.length && midi < this._noteOrder[0]) return;
    this._noteOrder = this._noteOrder.filter((n) => n !== midi);
    this._noteOrder.push(midi);
    const voiceCount = this._unison ? Math.max(2, Math.min(this._params.unisonVoices ?? 2, this.maxVoices)) : 1;
    const voices = [];
    for (let index = 0; index < voiceCount; index += 1) {
      const voice = this._findVoice(note, voices);
      if (voices.includes(voice)) continue;
      voice._prophetAge = ++this._voiceAge;
      voice._prophetNote = note;
      voice._prophetVelocity = velocity;
      const glide = this._glide.legato && this._held.size ? this._glide.time : 0;
      voice.noteOn(note, velocity, glide);
      if (!this._params.keyboardDisconnect) this._applyVoicePitch(voice, note);
      if (this._unison) {
        const spread = (index - (voiceCount - 1) / 2) * 7;
        voice.osc2.setDetuneCents(this._params.oscBFine + spread);
      }
      voices.push(voice);
    }
    this._held.set(note, { voice: voices[0], voices, midi });
    return voices[0];
  }

  noteOff(note) {
    const midi = normalizeNote(note);
    const name = noteToName(midi);
    const chordVoices = this._chordHeld.get(midi);
    if (chordVoices) {
      this._chordHeld.delete(midi);
      chordVoices.forEach((chordNote) => this.noteOff(chordNote));
      return;
    }
    const held = this._held.get(name);
    if (!held) return;
    this._noteOrder = this._noteOrder.filter((n) => n !== midi);
    if (this._sustain || this._hold) {
      this._sustainedNotes.add(name);
      return;
    }
    held.voices.forEach((voice) => voice.noteOff());
    this._held.delete(name);
    if (this._chordMemory.enabled && this._chordCapturing && this._held.size === 0 && this._chordMemory.notes.length > 1) {
      this._chordCapturing = false;
    }
  }

  allNotesOff() {
    this._held.clear();
    this._chordHeld.clear();
    if (this._chordMemory.enabled && this._chordMemory.notes.length > 1) this._chordCapturing = false;
    this._noteOrder = [];
    this._sustainedNotes.clear();
    this.voices.forEach((voice) => voice.noteOff());
  }

  setSustain(down) {
    this._sustain = !!down;
    if (!this._sustain) this._releaseSustained();
  }

  setHold(enabled) {
    this._hold = !!enabled;
    if (!this._hold) this._releaseSustained();
  }

  _releaseSustained() {
    this._sustainedNotes.forEach((note) => {
      const held = this._held.get(note);
      if (held && !this._noteOrder.includes(held.midi)) held.voice.noteOff();
      this._held.delete(note);
    });
    this._sustainedNotes.clear();
  }

  setOscillator(which, patch = {}) {
    const octaveKey = which === 'A' ? 'oscAOctave' : 'oscBOctave';
    const waveKey = which === 'A' ? 'oscAWaveform' : 'oscBWaveform';
    const widthKey = which === 'A' ? 'oscAPulseWidth' : 'oscBPulseWidth';
    const syncKey = which === 'A' ? 'oscASync' : 'oscBSync';
    const lowKey = which === 'A' ? 'oscALowFreq' : 'oscBLowFreq';
    if (patch.octave !== undefined) this._params[octaveKey] = Number(patch.octave);
    if (patch.waveform !== undefined) {
      this._params[waveKey] = patch.waveform;
      this.voices.forEach((voice) => voice[which === 'A' ? 'osc1' : 'osc2'].setShape(
        typeof patch.waveform === 'number' ? patch.waveform : ({ triangle: 0, saw: 1 / 3, square: 2 / 3, pulse: 1 }[patch.waveform] ?? 1 / 3)
      ));
    }
    if (patch.pulseWidth !== undefined) {
      this._params[widthKey] = clamp(patch.pulseWidth, 0.05, 0.95);
      this.voices.forEach((voice) => voice[which === 'A' ? 'osc1' : 'osc2'].setPulseWidth(this._params[widthKey]));
    }
    if (patch.sync !== undefined) {
      this._params[syncKey] = !!patch.sync;
      this.voices.forEach((voice) => voice.setOsc2SyncEnabled(which === 'B' && this._params[syncKey]));
    }
    if (patch.lowFreq !== undefined) this._params[lowKey] = !!patch.lowFreq;
    if (patch.level !== undefined) {
      this._params[which === 'A' ? 'oscALevel' : 'oscBLevel'] = clamp(patch.level, 0, 1);
      this.voices.forEach((voice) => (which === 'A' ? voice.mixer.setOsc1Level(patch.level / this.maxVoices * 2.2) : voice.mixer.setOsc2Level(patch.level / this.maxVoices * 2.2)));
    }
    if (patch.fine !== undefined) {
      this._params.oscBFine = clamp(patch.fine, -100, 100);
      this.voices.forEach((voice) => voice.osc2.setDetuneCents(this._params.oscBFine));
    }
    this._retuneHeld();
  }

  setKeyboardDisconnect(enabled) { this._params.keyboardDisconnect = !!enabled; }

  setGlide({ time, rate, mode, legato } = {}) {
      if (time !== undefined) this._glide.time = clamp(Number(time), 0, 10);
      if (rate !== undefined) this._glide.time = clamp(Number(rate), 0, 10);
      if (mode !== undefined) this._glide.mode = mode;
      if (legato !== undefined) this._glide.legato = !!legato;
    }

  setUnison({ enabled, poly, voices } = {}) {
      if (enabled !== undefined) this._unison = !!enabled;
      if (poly !== undefined) this._polyUnison = !!poly;
      if (voices !== undefined) this._params.unisonVoices = clamp(Math.round(voices), 1, 10);
    }

  setVoiceMode({ unison, polyUnison, stack, split, splitPoint } = {}) {
      this.setUnison({ enabled: unison, poly: polyUnison });
      if (stack !== undefined) this._stack = !!stack;
      if (split !== undefined) this._split.enabled = !!split;
      if (splitPoint !== undefined) this._split.point = clamp(Math.round(splitPoint), 0, 127);
    }

  setNotePriority(priority) {
      if (['last', 'low', 'high', 'first'].includes(priority)) this._notePriority = priority;
    }

  setChordMemory(enabled, notes = this._chordMemory.notes) {
      this._chordMemory.enabled = !!enabled;
      if (Array.isArray(notes) && notes.length) this._chordMemory.notes = notes.map(normalizeNote);
      if (!this._chordMemory.enabled) {
        this._chordMemory.notes = [];
        this._chordCapturing = false;
      } else {
        this._chordCapturing = this._chordMemory.notes.length < 2;
      }
    }

  setAftertouch(value, { filter, lfo, volume } = {}) {
      this._aftertouch = clamp(value, 0, 1);
      if (filter !== undefined) this._params.aftertouchToFilter = clamp(filter, 0, 1);
      if (lfo !== undefined) this._params.aftertouchToLfo = clamp(lfo, 0, 1);
      if (volume !== undefined) this._params.aftertouchToAmp = clamp(volume, 0, 1);
      this.voices.forEach((voice) => {
        if (voice._baseCutoffHz) voice.setBaseCutoff(this._params.cutoff + this._aftertouch * this._params.aftertouchToFilter * 3000);
      });
    }

  setVelocityRouting({ amp, filter } = {}) {
      if (amp !== undefined) this._params.velocityToAmp = clamp(amp, 0, 1);
      if (filter !== undefined) {
        this._params.velocityToFilter = clamp(filter, 0, 1);
        this.voices.forEach((voice) => voice.setVelocityToFilterEnv(this._params.velocityToFilter));
      }
    }

  setMasterTune(value) {
      this._masterTune = clamp(Number(value), 400, 480);
      const ratio = this._masterTune / 440;
      this.voices.forEach((voice) => voice.osc1.setDetuneCents(1200 * Math.log2(ratio)));
    }

  setAlternateTuning(tuning) {
      this._alternateTuning = Array.isArray(tuning) ? tuning.slice(0, 128) : (tuning || null);
      this._retuneHeld();
    }

    calibrate({ seed = 1 } = {}) {
      let value = Number(seed) || 1;
      const next = () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return (value / 0xffffffff) * 2 - 1;
      };
      this._calibration = this.voices.map((voice) => ({
        voice: voice._prophetIndex,
        oscillatorCents: next() * (4 - this._vintage) * 0.8,
        filterCents: next() * (4 - this._vintage) * 1.2,
        envelopeScale: 1 + next() * (4 - this._vintage) * 0.01,
      }));
      this.voices.forEach((voice, index) => voice.osc2.setDetuneCents(this._params.oscBFine + (this._calibration[index]?.oscillatorCents ?? 0)));
      return this._calibration;
    }

    clearCalibration() {
      this._calibration = null;
      this.voices.forEach((voice) => voice.osc2.setDetuneCents(this._params.oscBFine));
    }

  setReleaseHold({ release, hold } = {}) {
      if (release !== undefined) this.setEnvelope('amp', { release });
      if (hold !== undefined) this.setHold(hold);
    }

  getState() {
      return {
        ...this._params, masterTune: this._masterTune, alternateTuning: this._alternateTuning,
        unison: this._unison, polyUnison: this._polyUnison, stack: this._stack,
        split: { ...this._split }, notePriority: this._notePriority,
        chordMemory: { ...this._chordMemory }, glide: { ...this._glide },
        calibration: this._calibration ? this._calibration.map((entry) => ({ ...entry })) : null,
      };
    }
  _retuneHeld() {
    this._held.forEach(({ voice }, note) => {
      voice.glideToNote(note, 0);
      this._applyVoicePitch(voice, note);
    });
  }

  _applyVoicePitch(voice, note) {
    const midi = noteNameToMidi(note);
    const tuning = this._alternateTuning?.[midi];
    const base = (typeof tuning === 'number' && tuning > 20)
      ? tuning
      : midiToFreq(midi) * (this._masterTune / 440) * Math.pow(2, (Number(tuning || 0)) / 1200);
    const a = base * this._octaveRatio(this._params.oscAOctave);
    const b = base * this._octaveRatio(this._params.oscBOctave);
    voice.osc1.setFrequency(a, 0);
    voice.osc2.setFrequency(b, 0);
    voice.osc2.setDetuneCents(this._params.oscBFine);
    voice._currentFreq = a;
  }

  _octaveRatio(feet) {
    return { 16: 0.5, 8: 1, 4: 2, 2: 4 }[feet] ?? 1;
  }

  setFilter(patch = {}) {
    Object.assign(this._params, patch);
    this.voices.forEach((voice) => {
      if (patch.cutoff !== undefined) voice.setBaseCutoff(clamp(patch.cutoff, 20, 20000));
      if (patch.resonance !== undefined) voice.filter.setResonance(clamp(patch.resonance, 0, 1));
      if (patch.filterEnvAmount !== undefined) voice.setFilterEnvAmount(patch.filterEnvAmount);
      if (patch.keyTrack !== undefined) voice.setKeyTrackAmount(clamp(patch.keyTrack, 0, 1));
    });
  }

  setFilterRevision(revision) {
    if (!['rev1', 'rev2', 'rev3', 'rev4'].includes(revision)) return;
    this._params.filterRevision = revision;
    const response = revision === 'rev1' || revision === 'rev2' ? 0.96 : 1;
    this.voices.forEach((voice) => voice.filter.setResonance(this._params.resonance * response));
  }

  setQCompensation(mode) {
    if (mode === 'vintage' || mode === 'program') this._params.qCompensation = mode;
  }

  setMixer({ noise } = {}) {
    if (noise === undefined) return;
    this._params.noiseLevel = clamp(noise, 0, 1);
    this.voices.forEach((voice) => voice.mixer.setNoiseLevel(this._params.noiseLevel / this.maxVoices * 2.2));
  }

  setEnvelope(which, patch) {
    const key = which === 'amp' ? 'ampEnv' : 'filterEnv';
    Object.assign(this._params[key], patch);
    this.voices.forEach((voice) => voice[key].setADSR(patch));
  }

  setLFO({ rate, amount } = {}) {
    if (rate !== undefined) {
      this._params.lfoRate = clamp(rate, 0.22, 500);
      this.lfo?.setRate(this._params.lfoRate);
    }
    if (amount !== undefined) {
      this._params.lfoAmount = clamp(amount, 0, 1);
      this._updateLFOAmount();
    }
  }

  setWheelMod({ sourceMix, destination } = {}) {
    if (sourceMix !== undefined) this._params.wheelSourceMix = clamp(sourceMix, 0, 1);
    if (destination !== undefined) this._params.wheelDestination = destination;
    this._updateLFOAmount();
  }

  _updateLFOAmount() {
    const depth = this._params.lfoAmount * (0.15 + this._modWheel * 0.85);
    this.lfo?.output && setImmediate(this.lfo.output.gain, depth, this.ctx);
  }

  setPolyMod({ filterEnv, oscB, destination } = {}) {
    if (filterEnv !== undefined) this._params.polyFilterEnv = clamp(filterEnv, 0, 1);
    if (oscB !== undefined) this._params.polyOscB = clamp(oscB, 0, 1);
    if (destination !== undefined) this._params.polyDestination = destination;
    this.voices.forEach((voice) => {
      setImmediate(voice._polyFilterEnv.gain, this._params.polyFilterEnv * 2600, this.ctx);
      setImmediate(voice._polyOscB.gain, this._params.polyOscB * 90, this.ctx);
    });
  }

  setModWheel(value) {
    this._modWheel = clamp(value, 0, 1);
    this._updateLFOAmount();
  }

  // MIDI-facing aliases keep external controllers independent of note-name
  // conversion and preserve the same public behavior as computer-keyboard input.
  midiNoteOn(note, velocity = 127) { this.noteOn(note, velocity > 1 ? velocity / 127 : velocity); }
  midiNoteOff(note) { this.noteOff(note); }
  midiControlChange(controller, value) {
    const normalized = value > 1 ? value / 127 : value;
    if (controller === 1) this.setModWheel(normalized);
    else if (controller === 7) this.setMasterVolume(normalized);
    else if (controller === 64) this.setSustain(normalized >= 0.5);
    else if (controller === 74) this.setFilter({ cutoff: 20 + normalized * 9980 });
  }
  midiPitchBend(value) { this.setPitchBend(value > 1 ? (value - 8192) / 8192 : value); }

  setPitchBend(value) {
    this._pitchBend = clamp(value, -1, 1);
    this.voices.forEach((voice) => voice.setPitchBendCents(this._pitchBend * this._pitchBendRange * 100));
  }

  setPitchBendRange(value) {
    this._pitchBendRange = clamp(value, 1, 12);
    this.setPitchBend(this._pitchBend);
  }

  setMasterVolume(value) {
    this._masterVolume = clamp(value, 0, 1);
    if (this.master) setImmediate(this.master.gain, this._masterVolume, this.ctx);
  }

  setVintage(value) {
    this._vintage = clamp(Math.round(value), 1, 4);
    const spread = (4 - this._vintage) * 2.5;
    this.voices.forEach((voice) => voice.osc2.setDetuneCents(this._params.oscBFine + ((voice._prophetIndex % 3) - 1) * spread));
  }
}
