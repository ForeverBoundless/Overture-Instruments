/**
 * Sub37Engine
 *
 * A dedicated browser voice for the Sub 37.  It deliberately does not reuse
 * AudioEngine's Little Phatty performance rules: the Sub has two LFOs, two
 * modulation busses, a selectable-slope ladder filter and a two-note
 * paraphonic mode in which the VCOs have independent pitches but still share
 * the filter and amplifier envelopes.
 */
import { Voice, midiToFreq, noteNameToMidi } from './Voice.js';
import { LFO } from './LFO.js';
import { Glide } from './Glide.js';
import { setImmediate } from './ParamRamp.js';
import { DAHDSREnvelope } from './DAHDSREnvelope.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function saturationCurve(amount, size = 2048) {
  const curve = new Float32Array(size);
  const normal = Math.tanh(amount);
  for (let i = 0; i < size; i += 1) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / normal;
  }
  return curve;
}

export class Sub37Engine {
  constructor() {
    this.ctx = null;
    this.voice = null;
    this.master = null;
    this.started = false;
    this.glide = new Glide({ timeSec: 0.12, mode: 'constantRate' });
    this.glide.enabled = true;
    this.duoMode = false;
    this.legato = true;
    this.octaveShift = 0;
    this.fineTuneCents = 0;
    this.osc1Octave = 8;
    this.osc2Octave = 8;
    this.osc2Semitones = 0;
    this.subOctave = -1;
    this._held = [];
    this._sustainDown = false;
    this._sustained = new Set();
    this._pitchBend = 0;
    this._pitchBendRange = 2;
    this._modWheel = 0;
    this.lfos = [];
    this.modBusses = [
      { source: 'LFO 1', destination: 'PITCH', amount: 0 },
      { source: 'LFO 2', destination: 'FILTER', amount: 0 },
    ];
  }

  async start() {
    if (this.started) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.24;
    this.masterColor = this.ctx.createWaveShaper();
    this.masterColor.curve = saturationCurve(1.32);
    this.masterColor.oversample = '2x';
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 18;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;
    this.master.connect(this.masterColor);
    this.masterColor.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.voice = new Voice(this.ctx);
    this.voice.connect(this.master);
    this.voice.filter.setSlope(24);
    // Swap the shared voice's conventional ADSRs for the Sub's two
    // DAHDSR generators while retaining its established filter/VCA graph.
    this.voice.ampEnv = new DAHDSREnvelope(this.ctx, this.voice.vca.gain, { attack: 0.004, decay: 0.26, sustain: 0.72, release: 0.3 });
    this.voice.filterEnv = new DAHDSREnvelope(this.ctx, this.voice._filterEnvSummer.offset, { attack: 0.004, decay: 0.32, sustain: 0.28, release: 0.34 });

    // The Sub 37's square sub-oscillator follows VCO 1 and is mixed before
    // the common ladder filter, exactly where the hardware's sub lives.
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'square';
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0;
    this.subInput = this.ctx.createGain();
    this.subInput.gain.value = 0.42;
    this.subOsc.connect(this.subGain);
    this.subGain.connect(this.subInput);
    this.subInput.connect(this.voice.mixer.sum);
    this.subOsc.start();

    this.lfos = [new LFO(this.ctx), new LFO(this.ctx)];
    this.lfos[0].setRate(4.5);
    this.lfos[1].setRate(0.35);
    this.lfos.forEach((lfo) => lfo.start());
    this._buildModBusses();
    this._refreshTuning();
    this.started = true;
  }

  _buildModBusses() {
    const signalFor = (name) => {
      if (name === 'LFO 1') return this.lfos[0].output;
      if (name === 'LFO 2') return this.lfos[1].output;
      if (name === 'FILTER EG') return this.voice._filterEnvSummer;
      if (name === 'AMP EG') return this.voice.vca;
      if (name === 'OSC 2') return this.voice.osc2.output;
      return this.lfos[0].output;
    };
    this._modSignalFor = signalFor;
    this._modNodes = this.modBusses.map(() => {
      const sources = {};
      ['LFO 1', 'LFO 2', 'FILTER EG', 'AMP EG', 'OSC 2'].forEach((source) => {
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        signalFor(source).connect(gain);
        sources[source] = gain;
      });
      const targets = {
        PITCH: this.ctx.createGain(),
        FILTER: this.ctx.createGain(),
        WAVE: this.ctx.createGain(),
        'OSC 2': this.ctx.createGain(),
        AMP: this.ctx.createGain(),
      };
      Object.values(sources).forEach((source) => Object.values(targets).forEach((target) => source.connect(target)));
      targets.PITCH.connect(this.voice.osc1.pitchModInput);
      targets.PITCH.connect(this.voice.osc2.pitchModInput);
      targets.FILTER.connect(this.voice.filter.poles[0].frequency);
      targets.FILTER.connect(this.voice.filter.poles[1].frequency);
      targets.FILTER.connect(this.voice.filter.poles[2].frequency);
      targets.FILTER.connect(this.voice.filter.poles[3].frequency);
      targets.WAVE.connect(this.voice.osc1.pwmOscB.detune);
      targets.WAVE.connect(this.voice.osc2.pwmOscB.detune);
      targets['OSC 2'].connect(this.voice.osc2.pitchModInput);
      targets.AMP.connect(this.voice.tremoloVCA.gain);
      Object.values(targets).forEach((target) => { target.gain.value = 0; });
      return { sources, targets };
    });
    this.modBusses.forEach((_, index) => this.setModulation(index, this.modBusses[index]));
  }

  setModulation(index, patch) {
    if (!this.started || !this._modNodes[index]) return;
    const current = { ...this.modBusses[index], ...patch };
    this.modBusses[index] = current;
    const node = this._modNodes[index];
    const scale = {
      PITCH: 145,
      FILTER: 6200,
      WAVE: 34,
      'OSC 2': 230,
      AMP: 0.28,
    }[current.destination] ?? 1;
    Object.entries(node.sources).forEach(([source, gain]) => {
      setImmediate(gain.gain, source === current.source ? current.amount * scale * this._modWheelScale(current.source) : 0, this.ctx);
    });
    Object.entries(node.targets).forEach(([destination, gain]) => setImmediate(gain.gain, destination === current.destination ? 1 : 0, this.ctx));
  }

  _modWheelScale(source) {
    // The physical Mod wheel controls LFO buses.  Envelope and oscillator
    // sources remain hard-wired sources, like their panel routing.
    return source.startsWith('LFO') ? this._modWheel : 1;
  }

  setModWheel(value) {
    this._modWheel = clamp(value, 0, 1);
    this.modBusses.forEach((patch, index) => this.setModulation(index, patch));
  }

  setLFO(index, { rate, waveform, sync, retrigger } = {}) {
    const lfo = this.lfos[index];
    if (!lfo) return;
    if (rate !== undefined) lfo.setRate(clamp(rate, 0.05, 100));
    if (waveform !== undefined) lfo.setWaveform(waveform);
    if (retrigger !== undefined) lfo.setRetrigger(retrigger);
    if (sync !== undefined) lfo.setRetrigger(sync);
  }

  setDuoMode(enabled) {
    this.duoMode = !!enabled;
    this._voiceFromHeld(false);
  }

  setGlide(enabled, time) {
    if (enabled !== undefined) this.glide.enabled = !!enabled;
    if (time !== undefined) this.glide.setTime(clamp(time, 0, 5));
  }

  setPitchBend(value) {
    this._pitchBend = clamp(value, -1, 1);
    if (this.voice) this.voice.setPitchBendCents(this._pitchBend * this._pitchBendRange * 100);
  }

  setPitchBendRange(semitones) {
    this._pitchBendRange = clamp(semitones, 0, 12);
    this.setPitchBend(this._pitchBend);
  }

  setMasterVolume(value) {
    if (this.master) setImmediate(this.master.gain, clamp(value, 0, 1), this.ctx);
  }

  setFilter({ cutoff, resonance, drive, slope, keyTrack, envAmount } = {}) {
    if (!this.voice) return;
    if (cutoff !== undefined) this.voice.setBaseCutoff(clamp(cutoff, 20, 20000));
    if (resonance !== undefined) this.voice.filter.setResonance(clamp(resonance, 0, 1));
    if (drive !== undefined) this.voice.filter.setDrive(clamp(drive, 0, 1));
    if (slope !== undefined) this.voice.filter.setSlope(slope);
    if (keyTrack !== undefined) this.voice.setKeyTrackAmount(clamp(keyTrack, 0, 1));
    if (envAmount !== undefined) this.voice.setFilterEnvAmount(clamp(envAmount, -10000, 10000));
  }

  setOscillator(index, patch = {}) {
    if (!this.voice) return;
    const osc = index === 0 ? this.voice.osc1 : this.voice.osc2;
    if (patch.shape !== undefined) osc.setShape(clamp(patch.shape, 0, 1));
    if (patch.level !== undefined) (index === 0 ? this.voice.mixer.setOsc1Level(patch.level) : this.voice.mixer.setOsc2Level(patch.level));
    if (patch.octave !== undefined) (index === 0 ? this.osc1Octave = patch.octave : this.osc2Octave = patch.octave);
    if (patch.semitones !== undefined && index === 1) this.osc2Semitones = clamp(patch.semitones, -24, 24);
    this._refreshTuning();
  }

  setMixer({ sub, noise, feedback } = {}) {
    if (!this.voice) return;
    if (sub !== undefined) setImmediate(this.subGain.gain, clamp(sub, 0, 1), this.ctx);
    if (noise !== undefined) this.voice.mixer.setNoiseLevel(clamp(noise, 0, 1));
    // Feedback is deliberately represented as additional pre-filter drive,
    // which has the musical compression/growl of the hardware without an
    // unstable direct browser-audio feedback loop.
    if (feedback !== undefined) this.voice.filter.setDrive(clamp((this.voice.filter.getDrive() * 0.65) + feedback * 0.55, 0, 1));
  }

  setEnvelope(which, patch) {
    const env = which === 'filter' ? this.voice?.filterEnv : this.voice?.ampEnv;
    if (!env) return;
    env.setDAHDSR({
      delay: patch.delay === undefined ? undefined : clamp(patch.delay, 0, 10),
      attack: patch.attack === undefined ? undefined : clamp(patch.attack, 0.001, 10),
      hold: patch.hold === undefined ? undefined : clamp(patch.hold, 0, 10),
      decay: patch.decay === undefined ? undefined : clamp(patch.decay, 0.001, 10),
      sustain: patch.sustain === undefined ? undefined : clamp(patch.sustain, 0, 1),
      release: patch.release === undefined ? undefined : clamp(patch.release, 0.001, 10),
      loop: patch.loop,
    });
  }

  setSubOctave(value) {
    this.subOctave = value;
    this._refreshTuning();
  }

  setFineTune(value) {
    this.fineTuneCents = clamp(value, -100, 100);
    this._refreshTuning();
  }

  setOctaveShift(value) {
    this.octaveShift = clamp(value, -2, 2);
    this._voiceFromHeld(false);
  }

  noteOn(note, velocity = 0.9) {
    if (!this.started) return;
    const prior = this._held.length;
    this._held = this._held.filter((item) => item.note !== note);
    this._held.push({ note, velocity });
    this._sustained.delete(note);
    this._voiceFromHeld(prior > 0, velocity);
  }

  noteOff(note) {
    if (!this.started) return;
    if (this._sustainDown) {
      this._sustained.add(note);
      return;
    }
    this._release(note);
  }

  _release(note) {
    this._held = this._held.filter((item) => item.note !== note);
    if (!this._held.length) {
      this.voice.noteOff();
      return;
    }
    this._voiceFromHeld(true);
  }

  setSustain(down) {
    this._sustainDown = !!down;
    if (!down) {
      [...this._sustained].forEach((note) => this._release(note));
      this._sustained.clear();
    }
  }

  allNotesOff() {
    this._held = [];
    this._sustained.clear();
    if (this.voice) this.voice.noteOff();
  }

  _voiceFromHeld(legato, velocity = 0.9) {
    if (!this.voice || !this._held.length) return;
    const held = this.duoMode ? this._held.slice(-2) : [this._held[this._held.length - 1]];
    const a = held[0];
    const b = held[1] ?? a;
    const midiA = noteNameToMidi(a.note) + this.octaveShift * 12;
    const midiB = noteNameToMidi(b.note) + this.octaveShift * 12;
    const f1 = midiToFreq(midiA) * this._octaveRatio(this.osc1Octave);
    const f2 = midiToFreq(midiB + this.osc2Semitones) * this._octaveRatio(this.osc2Octave);
    const glideDuration = this.glide.timeFor(this.voice._currentFreq || f1, f1, legato);
    const tc = glideDuration ? this.glide.timeConstantFor(glideDuration) : 0;
    this.voice._currentMidiNote = midiA;
    this.voice._currentFreq = f1;
    this.voice.osc1.setFrequency(f1, tc);
    this.voice.osc2.setFrequency(f2, tc);
    this.subOsc.frequency.setTargetAtTime(Math.max(10, f1 * Math.pow(2, this.subOctave)), this.ctx.currentTime, Math.max(tc, 0.002));
    this.voice._updateCutoff(0.01);
    if (!legato || !this.legato) {
      this.lfos.forEach((lfo) => lfo.retriggerNow());
      this.voice.ampEnv.triggerAttack(velocity);
      this.voice.filterEnv.triggerAttack(velocity);
    }
  }

  _octaveRatio(feet) {
    return { 16: 0.5, 8: 1, 4: 2, 2: 4 }[feet] ?? 1;
  }

  _refreshTuning() {
    if (!this.voice) return;
    this.voice.osc1.setDetuneCents(this.fineTuneCents);
    this.voice.osc2.setDetuneCents(this.fineTuneCents);
    this._voiceFromHeld(false);
  }
}
