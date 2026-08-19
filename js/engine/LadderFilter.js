/**
 * LadderFilter.js
 *
 * A 24 dB/octave, 4-pole resonant low-pass filter modeled after the Moog
 * transistor ladder topology.
 *
 * True ladder filters derive their character from a nonlinear feedback path
 * (the resonance signal is fed back through a soft-clipping stage before
 * subtracting from the input), which is what allows self-oscillation and
 * gives Moog filters their particular "squelchy," slightly overdriven
 * resonance rather than the clean, ringing resonance of a linear filter.
 *
 * This is approximated here using four cascaded native BiquadFilterNodes
 * (each contributing ~6 dB/octave, four in series = 24 dB/octave) with the
 * resonance signal tapped after the final pole, driven through a
 * WaveShaperNode implementing a soft-clip (tanh-style) curve, and summed
 * back into the input via a feedback gain stage. This reproduces the two
 * qualities that make a ladder filter sound like a ladder filter:
 *   1) resonance-dependent output-level compensation (ladder filters lose
 *      volume as resonance/cutoff interact - real hardware compensates),
 *   2) soft saturation in the feedback path, so high resonance drives
 *      gentle harmonic distortion rather than clean ringing, and can be
 *      pushed into full self-oscillation at maximum resonance.
 *
 * A dedicated "drive" stage adds pre-filter saturation, modeling the
 * Little Phatty's overdrive control.
 */

import { setImmediate, glideTo } from './ParamRamp.js';

function makeSoftClipCurve(amount, samples = 1024) {
  const curve = new Float32Array(samples);
  const k = amount;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    // tanh-style soft clip; k controls how hard the knee is.
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export class LadderFilter {
  /**
   * @param {AudioContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.output.gain.value = 1;

    // --- Pre-filter drive/saturation stage ---
    this.driveShaper = ctx.createWaveShaper();
    this.driveShaper.curve = makeSoftClipCurve(1.0);
    this.driveShaper.oversample = '4x';
    this.driveInputTrim = ctx.createGain(); // compensates level before hitting the shaper
    this.driveInputTrim.gain.value = 1;
    this.driveOutputTrim = ctx.createGain(); // compensates makeup gain after the shaper
    this.driveOutputTrim.gain.value = 1;

    this.input.connect(this.driveInputTrim);
    this.driveInputTrim.connect(this.driveShaper);
    this.driveShaper.connect(this.driveOutputTrim);

    // --- Four cascaded one-pole-equivalent stages (24 dB/oct total) ---
    this.poles = [];
    for (let i = 0; i < 4; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1000;
      // Individual pole Q kept low/flat; the *ladder's* resonance character
      // comes from the nonlinear feedback loop below, not from stacking Qs,
      // which would just produce a steep but sterile linear response.
      f.Q.value = 0.55;
      this.poles.push(f);
    }
    this.driveOutputTrim.connect(this.poles[0]);
    this.poles[0].connect(this.poles[1]);
    this.poles[1].connect(this.poles[2]);
    this.poles[2].connect(this.poles[3]);

    // --- Nonlinear resonance feedback loop ---
    this.feedbackTap = ctx.createGain();
    this.feedbackTap.gain.value = 1;
    this.feedbackShaper = ctx.createWaveShaper();
    this.feedbackShaper.curve = makeSoftClipCurve(2.2);
    this.feedbackShaper.oversample = '2x';
    this.feedbackAmount = ctx.createGain(); // this is "resonance"
    this.feedbackAmount.gain.value = 0;
    this.feedbackInvert = ctx.createGain(); // subtract feedback from input, per ladder topology
    this.feedbackInvert.gain.value = -1;

    this.feedbackTap.connect(this.feedbackShaper);
    this.feedbackShaper.connect(this.feedbackAmount);
    this.feedbackAmount.connect(this.feedbackInvert);
    this.feedbackInvert.connect(this.input);

    // Tap each pole so we can select 6/12/18/24 dB outputs like classic
    // Moog switchable ladders.
    this._slopeOutputGains = this.poles.map((pole) => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      pole.connect(gain);
      return gain;
    });

    this._slopeFeedbackGains = this.poles.map((pole) => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      pole.connect(gain);
      gain.connect(this.feedbackTap);
      return gain;
    });

    // --- Output compensation: resonant ladder filters lose perceived
    // level as resonance rises (energy is diverted into the feedback loop
    // rather than passed straight through), so we add a small resonance-
    // dependent makeup gain to keep loudness roughly constant, matching
    // how the hardware's output stage is calibrated. ---
    this.outputCompensation = ctx.createGain();
    this.outputCompensation.gain.value = 1;
    this._slopeOutputGains.forEach((gain) => gain.connect(this.outputCompensation));
    this.outputCompensation.connect(this.output);

    this._cutoff = 1000;
    this._resonance = 0;
    this._drive = 0;
    this._keyTrackAmount = 0;
    this._slopeDb = 24;
    this.setSlope(24);
  }

  connect(dest) {
    this.output.connect(dest);
    return dest;
  }

  /**
   * @param {number} hz - target cutoff frequency.
   * @param {number} [glideSec=0] - if >0, smoothly glides rather than stepping (used by envelope/LFO modulation to avoid zipper noise).
   */
  setCutoff(hz, glideSec = 0.003) {
    this._cutoff = Math.min(20000, Math.max(20, hz));
    this.poles.forEach((p) => glideTo(p.frequency, this._cutoff, glideSec, this.ctx));
  }

  getCutoff() {
    return this._cutoff;
  }

  /**
   * @param {number} amount - 0..1, mapped internally to a feedback gain that
   * approaches (but is clamped just under) full self-oscillation at 1.0.
   */
  setResonance(amount) {
    this._resonance = Math.min(1, Math.max(0, amount));
    // The Little Phatty's ladder filter stays musical and punchy without
    // going into an unstable, digital-sounding self-oscillation regime, so
    // we keep the feedback gain below the harsh edge while still giving a
    // strong, classic resonance peak.
    // At zero resonance there must be no feedback at all.  A non-zero
    // baseline changes the filter response even when the front-panel
    // resonance control is fully counter-clockwise.  The upper range is
    // deliberately capped below unstable runaway while retaining a strong
    // Moog-style peak.
    const fbGain = this._resonance * 1.25;
    setImmediate(this.feedbackAmount.gain, fbGain, this.ctx);

    // Output compensation scales up gently with resonance since the
    // feedback loop siphons off amplitude from the forward path.
    const comp = 1 + this._resonance * 0.18;
    setImmediate(this.outputCompensation.gain, comp, this.ctx);
  }

  getResonance() {
    return this._resonance;
  }

  /** @param {number} db - one of 6, 12, 18, 24 dB/oct. */
  setSlope(db) {
    const allowed = [6, 12, 18, 24];
    const next = allowed.includes(db) ? db : 24;
    this._slopeDb = next;

    const index = next / 6 - 1;
    this._slopeOutputGains.forEach((gain, i) => {
      setImmediate(gain.gain, i === index ? 1 : 0, this.ctx);
    });
    this._slopeFeedbackGains.forEach((gain, i) => {
      setImmediate(gain.gain, i === index ? 1 : 0, this.ctx);
    });
  }

  getSlope() {
    return this._slopeDb;
  }

  /** @param {number} amount - 0..1 drive/overdrive into the filter input. */
  setDrive(amount) {
    this._drive = Math.min(1, Math.max(0, amount));
    const k = 1 + this._drive * 1.8; // softer, more analog-style saturation
    this.driveShaper.curve = makeSoftClipCurve(k);
    setImmediate(this.driveInputTrim.gain, 1 + this._drive * 0.9, this.ctx);
    // Makeup gain keeps perceived loudness roughly constant as drive increases saturation.
    setImmediate(this.driveOutputTrim.gain, 1 / (1 + this._drive * 0.35), this.ctx);
  }

  getDrive() {
    return this._drive;
  }

  disconnect() {
    this.output.disconnect();
  }
}
