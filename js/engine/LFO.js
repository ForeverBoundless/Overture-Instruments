/**
 * LFO.js
 *
 * Low frequency oscillator supporting triangle, square, sine, saw, reverse
 * saw, and sample & hold (random) waveforms, with rate, depth, fade-in, and
 * retrigger/free-run modes. Because native OscillatorNode has no
 * "sample & hold" type, S&H is synthesized with an AudioWorklet-free trick:
 * a ScriptProcessor-free approach isn't available for true per-sample
 * S&H, so we approximate it at control-rate using a periodic
 * setValueAtTime step sequence scheduled slightly ahead of playback,
 * which is inaudibly close to true audio-rate S&H for LFO-range modulation.
 */

import { setImmediate } from './ParamRamp.js';

export class LFO {
  /**
   * @param {AudioContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    // Destination gains in AudioEngine own the modulation depths.  Keep the
    // LFO itself at unity so a routed destination receives the oscillator's
    // full bipolar -1..1 control signal.
    this.output = ctx.createGain();
    this.output.gain.value = 1;

    this.osc = ctx.createOscillator();
    this.osc.type = 'triangle';
    this.osc.frequency.value = 4;
    this.osc.detune.value = 0;
    this._activeWave = 'triangle';

    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = 1;

    this.fadeGain = ctx.createGain(); // implements fade-in
    this.fadeGain.gain.value = 1;

    this.osc.connect(this.depthGain);
    this.depthGain.connect(this.fadeGain);
    this.fadeGain.connect(this.output);

    this.waveform = 'triangle';
    this.rate = 4;
    this.depth = 1;
    this.fadeInTime = 0;
    this.retrigger = false;
    this.started = false;

    // Sample & hold scheduling state
    this._shTimer = null;
    this._shGain = null; // used in place of depthGain when waveform === 'sh'
  }

  start(when) {
    if (this.started) return;
    this.started = true;
    const t = when ?? this.ctx.currentTime;
    this.osc.start(t);
    if (this.waveform === 'sh') this._startSampleHold();
  }

  /** Called on note-on when retrigger mode is active, to reset LFO phase and fade envelope. */
  retriggerNow(when) {
    if (!this.retrigger) return;
    const now = when ?? this.ctx.currentTime;
    const wasSH = this.waveform === 'sh';
    try { this.osc.stop(now); } catch (e) { /* noop */ }
    this.osc.disconnect();
    this.osc = this.ctx.createOscillator();
    this.osc.frequency.value = this.rate;
    if (this.waveform === 'reverseSaw') {
      this.osc.setPeriodicWave(this._buildReverseSawWave());
    } else if (wasSH) {
      this.osc.type = 'sine';
    } else {
      this.osc.type = this.waveform === 'saw' ? 'sawtooth' : this.waveform;
    }
    if (!wasSH) this.osc.connect(this.depthGain);
    this.osc.start(now);

    if (this.fadeInTime > 0) {
      this.fadeGain.gain.cancelScheduledValues(now);
      this.fadeGain.gain.setValueAtTime(0, now);
      this.fadeGain.gain.linearRampToValueAtTime(1, now + this.fadeInTime);
    } else {
      setImmediate(this.fadeGain.gain, 1, this.ctx);
    }

    if (wasSH) this._startSampleHold(now);
  }

  setWaveform(type) {
    this.waveform = type;
    this._activeWave = type;
    const now = this.ctx.currentTime;
    if (type === 'sh') {
      this.osc.disconnect();
      this._startSampleHold(now);
      return;
    }
    if (this._shTimer) {
      clearInterval(this._shTimer);
      this._shTimer = null;
    }
    this.osc.disconnect();
    this.osc.connect(this.depthGain);
    switch (type) {
      case 'triangle': this.osc.type = 'triangle'; break;
      case 'square': this.osc.type = 'square'; break;
      case 'sine': this.osc.type = 'sine'; break;
      case 'saw': this.osc.type = 'sawtooth'; break;
      case 'reverseSaw':
        this.osc.setPeriodicWave(this._buildReverseSawWave());
        break;
      default: this.osc.type = 'triangle';
    }
  }

  _buildReverseSawWave() {
    const harmonics = 16;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) {
      imag[n] = (2 / (n * Math.PI)) * Math.pow(-1, n); // inverted sign vs. standard saw
    }
    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  _startSampleHold(when) {
    if (this._shTimer) clearInterval(this._shTimer);
    const stepMs = Math.max(1000 / Math.max(this.rate, 0.1), 15);
    const schedule = () => {
      const now = this.ctx.currentTime;
      const value = Math.random() * 2 - 1;
      this.depthGain.gain.cancelScheduledValues(now);
      this.depthGain.gain.setValueAtTime(value * this.depth, now);
      this.depthGain.gain.linearRampToValueAtTime(value * this.depth, now + 0.001);
    };
    schedule();
    this._shTimer = setInterval(schedule, stepMs);
  }

  setRate(hz) {
    this.rate = hz;
    setImmediate(this.osc.frequency, hz, this.ctx);
    if (this.waveform === 'sh' && this._shTimer) {
      this._startSampleHold();
    }
  }

  setDepth(amount) {
    this.depth = amount;
    setImmediate(this.depthGain.gain, amount, this.ctx);
  }

  setFadeInTime(sec) {
    this.fadeInTime = sec;
  }

  setRetrigger(enabled) {
    this.retrigger = enabled;
  }

  connect(destParam) {
    this.output.connect(destParam);
    return destParam;
  }

  disconnect() {
    this.output.disconnect();
  }
}
