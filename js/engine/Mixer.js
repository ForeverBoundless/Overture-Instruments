/**
 * Mixer.js
 *
 * Sums Osc1, Osc2, and Noise into a single signal feeding the filter, with
 * independent level trim per source and automatic headroom management so
 * three simultaneous full-level analog-ish sources never clip going into
 * the filter's drive stage (clipping should only ever happen intentionally,
 * via the Drive control, never as an accident of the mixer stage).
 *
 * Also exposes lfoMixModInput, a modulation input that lets the LFO
 * crossfade between Osc1 and Osc2 emphasis (a documented Little Phatty LFO
 * destination) without the UI needing to know the mixer's internal wiring.
 */

import { setImmediate } from './ParamRamp.js';

// Headroom trim applied to the summed signal so 3 unity-gain sources don't
// clock into the filter stage hot; keeps the ladder filter's own drive
// control meaningful rather than being pre-saturated by the mixer.
const HEADROOM = 0.42;

export class Mixer {
  constructor(ctx) {
    this.ctx = ctx;

    this.osc1In = ctx.createGain();
    this.osc2In = ctx.createGain();
    this.noiseIn = ctx.createGain();
    this._osc1Base = 0.8;
    this._osc2Base = 0.6;
    this._noiseBase = 0;
    this.osc1In.gain.value = this._osc1Base;
    this.osc2In.gain.value = this._osc2Base;
    this.noiseIn.gain.value = this._noiseBase;

    // LFO-driven mix modulation: adds to osc2's level and subtracts (via an
    // inverted tap) from osc1's, producing a crossfade-style "mix" LFO
    // destination rather than both oscillators simply getting louder together.
    this.lfoMixModInput = ctx.createGain();
    this.lfoMixModInput.gain.value = 1;
    this._mixModInvert = ctx.createGain();
    this._mixModInvert.gain.value = -1;
    this.lfoMixModInput.connect(this.osc2In.gain);
    this.lfoMixModInput.connect(this._mixModInvert);
    this._mixModInvert.connect(this.osc1In.gain);

    this.sum = ctx.createGain();
    this.sum.gain.value = HEADROOM;

    this.osc1In.connect(this.sum);
    this.osc2In.connect(this.sum);
    this.noiseIn.connect(this.sum);
  }

  setOsc1Level(v) { this._osc1Base = v; setImmediate(this.osc1In.gain, v, this.ctx); }
  setOsc2Level(v) { this._osc2Base = v; setImmediate(this.osc2In.gain, v, this.ctx); }
  setNoiseLevel(v) { this._noiseBase = v; setImmediate(this.noiseIn.gain, v, this.ctx); }

  connect(dest) {
    this.sum.connect(dest);
    return dest;
  }

  disconnect() {
    this.sum.disconnect();
  }
}
