/**
 * Voice.js
 *
 * The complete signal path for one instance of the instrument:
 *
 *   Osc1  \
 *   Osc2   -> Mixer -> LadderFilter -> VCA(ampEnv) -> voice output
 *   Noise /
 *
 * The Little Phatty is monophonic, so the running app only ever
 * instantiates one Voice, but the class itself has no assumption of
 * singularity baked in (no module-level state) so it stays reusable if
 * polyphony is added later, per the "easy to extend" requirement.
 *
 * Modulation routing implemented here:
 *   Filter Envelope -> filter cutoff (amount knob)
 *   Amp Envelope     -> VCA gain
 *   LFO              -> pitch (osc1+osc2), filter cutoff, pulse width, osc mix, amplitude
 *   Velocity         -> amp envelope peak, filter envelope amount (subtle)
 *   Key tracking     -> filter cutoff bias
 */

import { Oscillator } from './Oscillator.js';
import { Mixer } from './Mixer.js';
import { LadderFilter } from './LadderFilter.js';
import { Envelope } from './Envelope.js';
import { NoiseSource } from './Noise.js';
import { setImmediate } from './ParamRamp.js';

const A4 = 440;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteNameToMidi(note) {
  const pitch = note.slice(0, -1);
  const octave = parseInt(note.slice(-1), 10);
  return (octave + 1) * 12 + NOTE_NAMES.indexOf(pitch);
}

export function midiToFreq(midi) {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

export class Voice {
  /**
   * @param {AudioContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;

    this.osc1 = new Oscillator(ctx, { driftCents: (Math.random() * 2 - 1) * 1.5 });
    this.osc2 = new Oscillator(ctx, { driftCents: (Math.random() * 2 - 1) * 2.5 }); // osc2 drifts slightly more, per real dual-VCO analog behavior
    this.noise = new NoiseSource(ctx, 'white');

    this.mixer = new Mixer(ctx);
    this.osc1.connect(this.mixer.osc1In);
    this.osc2.connect(this.mixer.osc2In);
    this.noise.connect(this.mixer.noiseIn);

    this.filter = new LadderFilter(ctx);
    this.mixer.connect(this.filter.input);

    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.filter.connect(this.vca);

    // Keep tremolo after the envelope-controlled VCA.  Connecting a bipolar
    // LFO directly to vca.gain would add positive gain while the envelope is
    // closed, leaking an audible oscillator drone between notes.  This
    // second VCA remains at unity and is safely modulated around it.
    this.tremoloVCA = ctx.createGain();
    this.tremoloVCA.gain.value = 1;
    this.output = ctx.createGain();
    this.output.gain.value = 1;
    this.vca.connect(this.tremoloVCA);
    this.tremoloVCA.connect(this.output);

    this.ampEnv = new Envelope(ctx, this.vca.gain, { attack: 0.002, decay: 0.2, sustain: 0.78, release: 0.24, peak: 1 });

    // Filter envelope modulates cutoff via its own summing gain, so it can
    // be added on top of the base cutoff (set by the Cutoff knob) and LFO
    // modulation without the three fighting over the same AudioParam value.
    this._filterEnvAmountHz = 2800; // "envelope amount" knob, in Hz of swing
    this._filterEnvSummer = ctx.createConstantSource();
    this._filterEnvSummer.offset.value = 0;
    this._filterEnvSummer.start();
    this._filterEnvGain = ctx.createGain();
    this._filterEnvGain.gain.value = this._filterEnvAmountHz;
    this._filterEnvSummer.connect(this._filterEnvGain);
    this._filterEnvGain.connect(this.filter.poles[0].frequency);
    this._filterEnvGain.connect(this.filter.poles[1].frequency);
    this._filterEnvGain.connect(this.filter.poles[2].frequency);
    this._filterEnvGain.connect(this.filter.poles[3].frequency);
    this.filterEnv = new Envelope(ctx, this._filterEnvSummer.offset, { attack: 0.003, decay: 0.3, sustain: 0.18, release: 0.28, peak: 1 });

    this._baseCutoffHz = 4000;
    this._keyTrackAmount = 0; // 0..1
    this._currentMidiNote = 60;
    this._velocityToFilterEnv = 0.16; // subtle by default, per spec

    this.osc1.start();
    this.osc2.start();
    this.noise.start();

    this._glideTimeConstant = 0;
    this._currentFreq = midiToFreq(60);

    // Pitch bend (wheel + MIDI) sums into both oscillators identically, in
    // cents, through their pitchModInput so it never fights glide or drift.
    this._pitchBendCents = ctx.createConstantSource();
    this._pitchBendCents.offset.value = 0;
    this._pitchBendCents.start();
    this._pitchBendCents.connect(this.osc1.pitchModInput);
    this._pitchBendCents.connect(this.osc2.pitchModInput);
  }

  /** @param {number} cents - signed pitch bend offset applied to both oscillators identically. */
  setPitchBendCents(cents) {
    setImmediate(this._pitchBendCents.offset, cents, this.ctx);
  }

  /**
   * @param {string} noteName - e.g. "C4"
   * @param {number} velocity - 0..1
   * @param {number} glideTimeConstant - 0 for immediate, >0 to glide (legato only; caller decides).
   * @param {number} [octaveShift=0] - applied semitone shift in whole octaves.
   * @param {number} [semitoneShift=0]
   */
  noteOn(noteName, velocity = 1, glideTimeConstant = 0, octaveShift = 0, semitoneShift = 0) {
    const midi = noteNameToMidi(noteName) + octaveShift * 12 + semitoneShift;
    this._currentMidiNote = midi;
    const freq = midiToFreq(midi);
    this._currentFreq = freq;

    this.osc1.setFrequency(freq * this._osc1RatioMultiplier(), glideTimeConstant);
    this.osc2.setFrequency(freq * this._osc2RatioMultiplier(), glideTimeConstant);

    this._updateCutoff(0.01);

    const velToFilterEnv = 1 - this._velocityToFilterEnv * (1 - velocity);

    this.ampEnv.triggerAttack(velocity);
    const originalPeak = this.filterEnv.peak;
    this.filterEnv.peak = originalPeak * velToFilterEnv;
    this.filterEnv.triggerAttack(1);
    this.filterEnv.peak = originalPeak;
  }

  noteOff() {
    this.ampEnv.triggerRelease();
    this.filterEnv.triggerRelease();
  }

  /** Immediately re-pitch the currently sounding voice (used for legato note changes without re-triggering envelopes). */
  glideToNote(noteName, glideTimeConstant, octaveShift = 0, semitoneShift = 0) {
    const midi = noteNameToMidi(noteName) + octaveShift * 12 + semitoneShift;
    this._currentMidiNote = midi;
    const freq = midiToFreq(midi);
    this._currentFreq = freq;
    this.osc1.setFrequency(freq * this._osc1RatioMultiplier(), glideTimeConstant);
    this.osc2.setFrequency(freq * this._osc2RatioMultiplier(), glideTimeConstant);
    this._updateCutoff(0.01);
  }

  _osc1RatioMultiplier() {
    return this._osc1SyncRatio ?? 1;
  }
  _osc2RatioMultiplier() {
    return this._osc2Ratio ?? 1;
  }

  /** Osc2 hard sync to Osc1: approximated by locking Osc2's frequency to an integer multiple of Osc1's. */
  setOsc2SyncEnabled(enabled) {
    this._osc2SyncEnabled = enabled;
  }

  setOsc2Ratio(ratio) {
    this._osc2Ratio = ratio;
    this.osc2.setFrequency(this._currentFreq * ratio, 0);
  }

  setKeyTrackAmount(amount) {
    this._keyTrackAmount = amount;
    this._updateCutoff(0.01);
  }

  /**
   * Single source of truth for the filter's base (pre-envelope, pre-LFO)
   * cutoff: combines the Cutoff knob with the current note's key-tracking
   * offset. Both the Cutoff knob and key-tracking amount route through
   * this method so neither can silently override the other - previously,
   * turning the Cutoff knob while a key-tracked note was held would drop
   * the tracking offset until the next note-on.
   */
  _updateCutoff(glideSec = 0.01) {
    const semitoneOffset = this._currentMidiNote - 60; // reference at C4
    const trackHz = this._keyTrackAmount === 0
      ? 0
      : this._baseCutoffHz * (Math.pow(2, (semitoneOffset * this._keyTrackAmount) / 12) - 1);
    this.filter.setCutoff(this._baseCutoffHz + trackHz, glideSec);
  }

  setBaseCutoff(hz) {
    this._baseCutoffHz = hz;
    this._updateCutoff(0.003);
  }

  setFilterEnvAmount(hz) {
    this._filterEnvAmountHz = hz;
    setImmediate(this._filterEnvGain.gain, hz, this.ctx);
  }

  setVelocityToFilterEnv(amount) {
    this._velocityToFilterEnv = amount;
  }

  connect(dest) {
    this.output.connect(dest);
    return dest;
  }

  /**
   * Route an LFO's output node into pitch modulation for both oscillators.
   * The LFO's own depth gain already scales it into cents before this is
   * called, so this method just fans the signal out to both VCOs.
   * @param {AudioNode} lfoOutputNode
   */
  connectLFOToPitch(lfoOutputNode) {
    lfoOutputNode.connect(this.osc1.pitchModInput);
    lfoOutputNode.connect(this.osc2.pitchModInput);
  }

  /** Route an LFO's output node into filter cutoff modulation (in Hz swing). */
  connectLFOToFilter(lfoOutputNode) {
    this.filter.poles.forEach((p) => lfoOutputNode.connect(p.frequency));
  }

  /** Route an LFO's output node into oscillator mix modulation. */
  connectLFOToMix(lfoOutputNode) {
    lfoOutputNode.connect(this.mixer.lfoMixModInput);
  }

  /** Route an LFO's output node into amplitude (tremolo) modulation. */
  connectLFOToAmplitude(lfoOutputNode) {
    lfoOutputNode.connect(this.tremoloVCA.gain);
  }

  /** Route an LFO's output node into pulse-width modulation for both oscillators. */
  connectLFOToPulseWidth(lfoOutputNode) {
    lfoOutputNode.connect(this.osc1.pwmOscB.detune);
    lfoOutputNode.connect(this.osc2.pwmOscB.detune);
  }
}
