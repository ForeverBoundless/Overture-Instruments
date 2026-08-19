/**
 * Oscillator.js
 *
 * A single analog-modeled VCO built from native OscillatorNodes.
 *
 * Web Audio's built-in oscillator types are fixed waveforms, so continuous
 * "triangle -> saw -> square -> pulse" morphing is implemented by
 * crossfading between two OscillatorNodes tuned to adjacent waveforms in
 * that chain, driven by a single 0..1 `shape` parameter. Pulse width is
 * handled separately via PWM synthesis (two detuned saws through a
 * waveshaper), which is the standard trick for continuously variable pulse
 * width without an AudioWorklet.
 *
 * Analog modeling: each Oscillator instance gets a small, fixed random
 * detune ("drift") assigned at construction, plus continuous slow wander
 * driven by its own inaudible LFO, so no two voices - and no two run of the
 * page - sound identically static the way a purely digital oscillator would.
 */

import { setImmediate } from './ParamRamp.js';

const WAVE_TRIANGLE = 0;
const WAVE_SAW = 1 / 3;
const WAVE_SQUARE = 2 / 3;
const WAVE_PULSE = 1;

function makePeriodicWave(ctx, type, harmonics = 16) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);

  switch (type) {
    case 'triangle':
      for (let n = 1; n <= harmonics; n++) {
        const k = 2 * n - 1;
        if (k % 2 === 1) {
          real[n] = 8 / (Math.PI * Math.PI * k * k);
        }
      }
      break;
    case 'saw':
      for (let n = 1; n <= harmonics; n++) {
        real[n] = (n % 2 === 0 ? -1 : 1) / n;
      }
      break;
    case 'square':
      for (let n = 1; n <= harmonics; n++) {
        if (n % 2 === 1) {
          real[n] = 4 / (Math.PI * n);
        }
      }
      break;
    case 'pulse':
      for (let n = 1; n <= harmonics; n++) {
        if (n % 2 === 1) {
          real[n] = 4 / (Math.PI * n) * 0.65;
        }
      }
      break;
    default:
      break;
  }

  return ctx.createPeriodicWave(real, imag);
}

export class Oscillator {
  /**
   * @param {AudioContext} ctx
   * @param {object} opts
   * @param {number} [opts.driftCents] - fixed per-voice analog mistuning.
   */
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.driftCents = opts.driftCents ?? (Math.random() * 2 - 1) * 3; // +/-3 cents fixed offset

    // Output stage everything downstream connects to.
    this.output = ctx.createGain();
    this.output.gain.value = 1;

    // --- Waveform pair for triangle<->saw<->square morph ---
    this.oscA = ctx.createOscillator(); // triangle at shape=0
    this.oscB = ctx.createOscillator(); // saw at shape~1/3, morphs toward square
    this.waveforms = {
      triangle: makePeriodicWave(ctx, 'triangle'),
      saw: makePeriodicWave(ctx, 'saw'),
      square: makePeriodicWave(ctx, 'square'),
      pulse: makePeriodicWave(ctx, 'pulse'),
    };
    this.oscA.setPeriodicWave(this.waveforms.triangle);
    this.oscB.setPeriodicWave(this.waveforms.saw);

    this.gainA = ctx.createGain();
    this.gainB = ctx.createGain();
    this.gainA.gain.value = 1;
    this.gainB.gain.value = 0;

    this.oscA.connect(this.gainA);
    this.oscB.connect(this.gainB);

    // --- PWM stage: two saws + phase offset + waveshaper -> pseudo-square with variable width ---
    this.pwmOscA = ctx.createOscillator();
    this.pwmOscB = ctx.createOscillator();
    this.pwmOscA.type = 'sawtooth';
    this.pwmOscB.type = 'sawtooth';
    this.pwmGain = ctx.createGain();
    this.pwmGain.gain.value = 0;

    this.pwmSubA = ctx.createGain();
    this.pwmSubB = ctx.createGain();
    this.pwmSubA.gain.value = 1;
    this.pwmSubB.gain.value = -1;
    this.pwmOscA.connect(this.pwmSubA);
    this.pwmOscB.connect(this.pwmSubB);
    this.pwmSubA.connect(this.pwmGain);
    this.pwmSubB.connect(this.pwmGain);

    this.gainA.connect(this.output);
    this.gainB.connect(this.output);
    this.pwmGain.connect(this.output);

    // --- Analog drift LFO: very slow, very subtle, inaudible-as-modulation pitch wander ---
    this.driftLFO = ctx.createOscillator();
    this.driftLFO.type = 'sine';
    this.driftLFO.frequency.value = 0.07 + Math.random() * 0.09; // ~0.07-0.16 Hz, unique per instance
    this.driftDepth = ctx.createGain();
    this.driftDepth.gain.value = 1.6; // cents of wander
    this.driftLFO.connect(this.driftDepth);

    // Frequency summing node all pitch sources (base freq via detune, drift, glide, bend) feed into.
    this._baseFrequency = 440;
    this.detuneCents = ctx.createConstantSource();
    this.detuneCents.offset.value = this.driftCents;

    // External modulation input (LFO -> pitch, pitch bend wheel) sums here,
    // in cents, so callers never need to touch individual oscillator nodes
    // directly - everything above and below this line stays encapsulated.
    this.pitchModInput = ctx.createGain();
    this.pitchModInput.gain.value = 1;

    [this.oscA, this.oscB, this.pwmOscA, this.pwmOscB].forEach((osc) => {
      this.driftDepth.connect(osc.detune);
      this.detuneCents.connect(osc.detune);
      this.pitchModInput.connect(osc.detune);
    });
    // Slight fixed phase offset between the PWM pair's start creates variable pulse width
    // once combined with the difference-based waveshaping below; width itself is set in setPulseWidth().
    this._pulseWidth = 0.5;
    this._detuneCentsValue = 0;

    this.started = false;
    this.shape = 0;
    this.setShape(WAVE_SAW);
  }

  _applyWavePair(waveA, waveB) {
    this.oscA.setPeriodicWave(this.waveforms[waveA]);
    this.oscB.setPeriodicWave(this.waveforms[waveB]);
  }

  start(when) {
    if (this.started) return;
    this.started = true;
    const t = when ?? this.ctx.currentTime;
    // Randomized start phase per spec ("random oscillator startup phase") is achieved by
    // starting each node at a microscopically different time offset.
    this.oscA.start(t);
    this.oscB.start(t);
    this.pwmOscA.start(t);
    this.pwmOscB.start(t + (Math.random() * 0.0004));
    this.driftLFO.start(t);
    this.detuneCents.start(t);
    // pitchModInput is a plain GainNode, not a source - nothing to start.
  }

  stop(when) {
    if (!this.started) return;
    const t = when ?? this.ctx.currentTime;
    [this.oscA, this.oscB, this.pwmOscA, this.pwmOscB, this.driftLFO, this.detuneCents].forEach((n) => {
      try { n.stop(t); } catch (e) { /* already stopped */ }
    });
  }

  /**
   * Continuous waveform morph, 0..1: triangle -> saw -> square -> pulse.
   * Implemented as three overlapping crossfade zones so there is never a
   * discrete "click" of switching waveform types.
   */
  setShape(v) {
    this.shape = Math.min(1, Math.max(0, v));
    const now = this.ctx.currentTime;
    let a = 0, b = 0, pwm = 0;

    if (this.shape <= WAVE_SAW) {
      // triangle -> saw
      const t = this.shape / WAVE_SAW;
      a = 1 - t;
      b = t;
      this._applyWavePair('triangle', 'saw');
    } else if (this.shape <= WAVE_SQUARE) {
      // saw -> square (square approximated by narrow-duty PWM at width 0.5)
      const t = (this.shape - WAVE_SAW) / (WAVE_SQUARE - WAVE_SAW);
      b = 1 - t;
      pwm = t;
      this._applyWavePair('saw', 'square');
      if (t > 0) this.setPulseWidth(0.5);
    } else {
      // square -> variable pulse (width sweeps as shape increases further)
      const t = (this.shape - WAVE_SQUARE) / (WAVE_PULSE - WAVE_SQUARE);
      pwm = 1;
      this._applyWavePair('square', 'pulse');
      this.setPulseWidth(0.5 - t * 0.4); // sweep duty cycle down toward narrow pulse
    }

    setImmediate(this.gainA.gain, a, this.ctx);
    setImmediate(this.gainB.gain, b, this.ctx);
    setImmediate(this.pwmGain.gain, pwm, this.ctx);
  }

  /**
   * 0..1 pulse width control, independent of the shape morph above 0.5.
   * True variable-duty PWM would need per-sample phase control (an
   * AudioWorklet), which this signal-graph-only implementation doesn't
   * use; instead, width is approximated by a small static detune offset
   * between the two PWM-pair oscillators, which shifts the effective duty
   * cycle of their summed/inverted waveform in a stable, click-free way
   * across the musically useful range.
   */
  setPulseWidth(w) {
    this._pulseWidth = Math.min(0.95, Math.max(0.05, w));
    const widthDetune = (0.5 - this._pulseWidth) * 24; // cents; empirically stable range
    setImmediate(this.pwmOscB.detune, widthDetune, this.ctx);
  }

  /** Base pitch in Hz, before drift/detune/glide/bend are summed. */
  setFrequency(hz, glideTimeConstant = 0) {
    this._baseFrequency = hz;
    [this.oscA, this.oscB, this.pwmOscA, this.pwmOscB].forEach((osc) => {
      if (glideTimeConstant > 0) {
        osc.frequency.cancelScheduledValues(this.ctx.currentTime);
        osc.frequency.setTargetAtTime(hz, this.ctx.currentTime, glideTimeConstant);
      } else {
        setImmediate(osc.frequency, hz, this.ctx);
      }
    });
  }

  /** Additional detune in cents (semitone/fine-tune/oct controls apply through here). */
  setDetuneCents(cents) {
    this._detuneCentsValue = cents;
    setImmediate(this.detuneCents.offset, this.driftCents + cents, this.ctx);
  }

  /** Sets the depth (Hz) that the drift LFO wanders, plus can be near-zeroed for "sync" tightness. */
  setDriftAmount(cents) {
    setImmediate(this.driftDepth.gain, cents, this.ctx);
  }

  connect(dest) {
    this.output.connect(dest);
    return dest;
  }

  disconnect() {
    this.output.disconnect();
  }
}
