/**
 * LadderFilter.js
 *
 * 24 dB/octave resonant low-pass modelled on the Moog transistor ladder, built
 * from native nodes so the whole Little Phatty / Sub 37 voice stays on the
 * Web Audio graph (parameters stay automatable from LFOs and envelopes).
 *
 * The previous version fed the output back into the input through a
 * WaveShaper. Web Audio delays every feedback loop by one render quantum
 * (128 samples), which turns "resonance" into a comb filter rather than a peak
 * at the cutoff. This version instead distributes the resonance across two
 * cascaded 2-pole sections (the classic analytic decomposition of a 4-pole
 * ladder): the first section stays near-Butterworth and the second section's
 * Q rises with the resonance control, giving a genuine peak at the cutoff that
 * sweeps with it. Two things the hardware does are reproduced on top:
 *   - passband droop: the ladder loses low-end as resonance rises,
 *   - saturation: a tanh drive stage before the filter and a gentler one after
 *     it, so high resonance and hot inputs round off instead of ringing cleanly.
 *
 * Slope (6/12/18/24 dB) selects which sections are in the chain. `poles[]`
 * stays a four-element array of BiquadFilterNodes whose `frequency` params are
 * the modulation targets used by the engines.
 */

import { setImmediate, glideTo } from './ParamRamp.js';

function makeSoftClipCurve(amount, samples = 2048) {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(amount);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / norm;
  }
  return curve;
}

export class LadderFilter {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // --- drive stage ---
    this.driveInputTrim = ctx.createGain();
    this.driveShaper = ctx.createWaveShaper();
    this.driveShaper.curve = makeSoftClipCurve(1.0);
    this.driveShaper.oversample = '4x';
    this.driveOutputTrim = ctx.createGain();
    this.input.connect(this.driveInputTrim);
    this.driveInputTrim.connect(this.driveShaper);
    this.driveShaper.connect(this.driveOutputTrim);

    // --- four sections (two 2-pole pairs + two gentle 2-pole stages for the 6/18 dB taps) ---
    this.poles = [];
    for (let i = 0; i < 4; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1000;
      f.Q.value = 0.5;
      this.poles.push(f);
    }
    // Chain: drive -> p0 -> p1 -> p2 -> p3. Taps select the slope.
    this.driveOutputTrim.connect(this.poles[0]);
    this.poles[0].connect(this.poles[1]);
    this.poles[1].connect(this.poles[2]);
    this.poles[2].connect(this.poles[3]);
    this._taps = this.poles.map((pole) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      pole.connect(g);
      return g;
    });

    // --- output saturation + resonance-dependent level ---
    this.outputShaper = ctx.createWaveShaper();
    this.outputShaper.curve = makeSoftClipCurve(1.6);
    this.outputShaper.oversample = '2x';
    this.outputCompensation = ctx.createGain();
    this._taps.forEach((g) => g.connect(this.outputShaper));
    this.outputShaper.connect(this.outputCompensation);
    this.outputCompensation.connect(this.output);

    this._cutoff = 1000;
    this._resonance = 0;
    this._drive = 0;
    this._slopeDb = 24;
    this.setSlope(24);
    this.setResonance(0);
  }

  connect(dest) { this.output.connect(dest); return dest; }
  disconnect() { this.output.disconnect(); }

  setCutoff(hz, glideSec = 0.003) {
    this._cutoff = Math.min(20000, Math.max(20, hz));
    this.poles.forEach((p) => glideTo(p.frequency, this._cutoff, glideSec, this.ctx));
  }
  getCutoff() { return this._cutoff; }

  /** 0..1. The peak rises smoothly; near 1 it rings hard but stays bounded by the output stage. */
  setResonance(amount) {
    this._resonance = Math.min(1, Math.max(0, amount));
    this._applyQ();
    // Ladder passband droop (about -8 dB at full resonance), partly made up in level.
    const droop = 1 - 0.55 * this._resonance;
    setImmediate(this.outputCompensation.gain, droop * (1 + this._resonance * 0.35), this.ctx);
  }
  getResonance() { return this._resonance; }

  _applyQ() {
    const r = this._resonance;
    const peakQ = 0.55 + Math.pow(r, 1.5) * 15; // the resonant section
    const now = this.ctx.currentTime;
    const q = (i, v) => this.poles[i].Q.setTargetAtTime(v, now, 0.005);
    switch (this._slopeDb) {
      case 6: q(0, 0.5); break;
      case 12: q(0, Math.max(0.6, peakQ * 0.9)); break;
      case 18: q(0, 0.6); q(1, 0.5); q(2, peakQ); break;
      default: q(0, 0.54 + r * 0.3); q(1, peakQ); q(2, 0.5); q(3, 0.5); break;
    }
  }

  /** @param {number} db - 6, 12, 18 or 24 dB/oct. */
  setSlope(db) {
    const allowed = [6, 12, 18, 24];
    this._slopeDb = allowed.includes(db) ? db : 24;
    // 6 dB: p0 with Q 0.5 behaves close to a one-pole; 12: p0 resonant; 18: p0+p1+p2; 24: p0+p1.
    const tap = { 6: 0, 12: 0, 18: 2, 24: 1 }[this._slopeDb];
    this._taps.forEach((g, i) => setImmediate(g.gain, i === tap ? 1 : 0, this.ctx));
    this._applyQ();
  }
  getSlope() { return this._slopeDb; }

  /** 0..1 pre-filter overdrive (Little Phatty Overload / Sub 37 Multidrive). */
  setDrive(amount) {
    this._drive = Math.min(1, Math.max(0, amount));
    this.driveShaper.curve = makeSoftClipCurve(1 + this._drive * 3);
    setImmediate(this.driveInputTrim.gain, 1 + this._drive * 2.2, this.ctx);
    setImmediate(this.driveOutputTrim.gain, 1 / (1 + this._drive * 0.9), this.ctx);
  }
  getDrive() { return this._drive; }
}
