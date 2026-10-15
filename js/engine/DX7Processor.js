/*
 * DX7Processor.js - six-operator FM synthesis (AudioWorklet).
 *
 * Independent implementation of the DX7 architecture: 6 sine operators per
 * voice, 32 algorithm topologies (data-driven), per-operator 4-rate/4-level
 * envelopes, feedback on one operator, ratio or fixed frequency, key
 * velocity sensitivity, rate key scaling, a global LFO (pitch + amplitude
 * modulation, mod wheel), pitch bend, sustain and 16-voice allocation.
 * Envelope/level curves are approximations of the original's (0.75 dB per
 * level step near the top, exponential rate scale), not a chip emulation.
 */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */

import { ALGORITHMS } from '../data/dx7Algorithms.js';


const TABLE = 4096;
const SINE = new Float32Array(TABLE + 1);
for (let i = 0; i <= TABLE; i += 1) SINE[i] = Math.sin((i / TABLE) * 2 * Math.PI);
const sine = (ph) => { const p = ph - Math.floor(ph); const x = p * TABLE; const i = x | 0; const f = x - i; return SINE[i] + (SINE[i + 1] - SINE[i]) * f; };
const levelAmp = (L) => (L <= 0 ? 0 : L >= 99 ? 1 : Math.pow(2, (L - 99) / 8) * Math.min(1, L / 20));
const rateTime = (r) => 0.001 * Math.pow(10, (99 - r) / 24); // seconds, 99 -> 1 ms, 0 -> ~13 s
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const NUM_VOICES = 16;

class OpState { constructor() { this.inc = 0; this.amp = 0; this.phase = Math.random(); this.env = 0; this.stage = 4; this.out = 0; this.out2 = 0; this.stageTarget = 0; this.coef = 0; } }

class Voice {
  constructor() { this.note = -1; this.vel = 1; this.gate = false; this.order = 0; this.ops = Array.from({ length: 6 }, () => new OpState()); this.active = false; this.pitch = 60; }
}

class DX7Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.patch = null;
    this.alg = ALGORITHMS[0];
    this.voices = Array.from({ length: NUM_VOICES }, () => new Voice());
    this.order = 0;
    this.bend = 0; this.mod = 0; this.at = 0; this.sustain = false; this.held = [];
    this.lfoPhase = 0; this.lfoDelay = 0; this.lfoSH = 0; this.lfoLast = 0;
    this.volume = 0.7; this.gain = 0;
    this.port.onmessage = (e) => this._msg(e.data);
  }

  _msg(m) {
    switch (m.t) {
      case 'patch': this.patch = m.patch; this.alg = ALGORITHMS[clamp((m.patch.algorithm | 0) - 1, 0, 31)]; break;
      case 'noteOn': this._noteOn(m.note | 0, clamp(m.vel, 0.01, 1)); break;
      case 'noteOff': this._noteOff(m.note | 0); break;
      case 'bend': this.bend = clamp(m.value, -1, 1); break;
      case 'mod': this.mod = clamp(m.value, 0, 1); break;
      case 'at': this.at = clamp(m.value, 0, 1); break;
      case 'sustain': this.sustain = !!m.down; if (!this.sustain) this.voices.forEach((v) => { if (v.gate && v.pedalHeld) { v.pedalHeld = false; this._release(v); } }); break;
      case 'volume': this.volume = clamp(m.value, 0, 1); break;
      case 'allOff': this.voices.forEach((v) => { v.pedalHeld = false; if (v.gate) this._release(v); }); this.held = []; break;
      case 'allSoundOff': this.voices.forEach((v) => { v.active = false; v.gate = false; v.ops.forEach((o) => { o.env = 0; o.stage = 4; }); }); break;
      default: break;
    }
  }

  _noteOn(note, vel) {
    if (!this.patch) return;
    let v = this.voices.find((x) => x.note === note && x.active);
    if (!v) v = this.voices.find((x) => !x.active);
    if (!v) v = this.voices.filter((x) => !x.gate).sort((a, b) => a.order - b.order)[0] || this.voices.slice().sort((a, b) => a.order - b.order)[0];
    v.note = note; v.vel = vel; v.gate = true; v.pedalHeld = false; v.active = true; v.order = ++this.order;
    v.pitch = note;
    const ops = this.patch.ops;
    for (let i = 0; i < 6; i += 1) {
      const o = v.ops[i];
      o.stage = 0; o.out = 0; o.out2 = 0;
      if (this.patch.lfo?.sync) this.lfoPhase = 0;
      this._enterStage(o, ops[i], 0, note);
    }
    this.lfoDelay = 0;
  }

  _noteOff(note) {
    this.voices.forEach((v) => {
      if (v.note !== note || !v.gate) return;
      if (this.sustain) { v.pedalHeld = true; return; }
      this._release(v);
    });
  }

  _release(v) {
    v.gate = false;
    v.ops.forEach((o, i) => this._enterStage(o, this.patch.ops[i], 3, v.note));
  }

  _enterStage(o, op, stage, note) {
    o.stage = stage;
    const rate = clamp(op.rates[stage] + (note - 60) / 12 * (op.rateScale || 0) * 6, 0, 99);
    const t = rateTime(rate);
    o.stageTarget = levelAmp(op.levels[stage]);
    o.coef = 1 - Math.exp(-1 / (this.sr * Math.max(0.0005, t) / 4));
    o.linear = Math.abs(o.stageTarget - o.env) / Math.max(1, this.sr * Math.max(0.0005, t));
  }

  _lfo() {
    const lfo = this.patch.lfo;
    const hz = 0.06 * Math.pow(10, (lfo.speed / 99) * 2.8);
    this.lfoPhase += hz / this.sr;
    if (this.lfoPhase >= 1) { this.lfoPhase -= 1; this.lfoSH = Math.random() * 2 - 1; }
    const p = this.lfoPhase;
    let v;
    switch (lfo.wave) {
      case 'saw': v = 1 - 2 * p; break;
      case 'sqr': v = p < 0.5 ? 1 : -1; break;
      case 'sine': v = sine(p); break;
      case 'sh': v = this.lfoSH; break;
      default: v = p < 0.5 ? 4 * p - 1 : 3 - 4 * p; // triangle
    }
    const delayT = rateTime(99 - lfo.delay) * 2;
    this.lfoDelay = Math.min(1, this.lfoDelay + 1 / (this.sr * Math.max(0.001, delayT)));
    return v * this.lfoDelay;
  }

  process(_i, outputs) {
    const out = outputs[0];
    const L = out[0];
    if (!L || !this.patch) return true;
    const R = out[1] || L;
    const patch = this.patch;
    const alg = this.alg;
    const ops = patch.ops;
    const sr = this.sr;
    const carrierNorm = 0.55 / Math.pow(alg.carriers.length, 0.6);
    const fbIndex = alg.fb - 1;
    const fbAmt = (patch.feedback / 7) * 0.22; // phase cycles at feedback 7 (~1.4 rad)
    const pmsDepth = [0, 0.3, 0.6, 1.2, 2.4, 4, 7, 12][clamp(patch.lfo.pms | 0, 0, 7)];
    const bendSemi = this.bend * (patch.bendRange ?? 2);
    const modIndex = 0.62; // phase cycles at level 99 (~3.9 rad)
    const modOrder = [5, 4, 3, 2, 1, 0];
    // Per-block: operator frequencies and static levels (pitch LFO is applied per block, 2.7 ms resolution).
    const lfoNow = this.lfoLast;
    const pitchModBlock = lfoNow * ((patch.lfo.pmd / 99) + this.mod * (patch.wheelPitch ?? 1) + this.at * (patch.atPitch ?? 0)) * pmsDepth;
    for (let vi = 0; vi < NUM_VOICES; vi += 1) {
      const v = this.voices[vi];
      if (!v.active) continue;
      const baseHz = 440 * Math.pow(2, (v.pitch + (patch.transpose || 0) + bendSemi + pitchModBlock - 69) / 12);
      for (let i = 0; i < 6; i += 1) {
        const op = ops[i]; const o = v.ops[i];
        o.inc = (op.mode === 'fixed' ? Math.pow(10, (op.coarse % 4)) * (1 + op.fine / 100) * Math.pow(2, op.detune / 24) : baseHz * (op.coarse === 0 ? 0.5 : op.coarse) * (1 + op.fine / 100) * Math.pow(2, op.detune / 600)) / sr;
        o.amp = op.enabled ? levelAmp(op.level) * (1 - (op.velSens / 7) * (1 - v.vel) * 0.9) : 0;
      }
    }
    for (let n = 0; n < L.length; n += 1) {
      const lfo = this._lfo();
      this.lfoLast = lfo;
      const ampModDepth = (patch.lfo.amd / 99) + this.mod * (patch.wheelAmp ?? 0);
      const ampMod = 1 - Math.max(0, ampModDepth * (0.5 + 0.5 * lfo)) ;
      let mix = 0;
      let anyActive = false;
      for (let vi = 0; vi < NUM_VOICES; vi += 1) {
        const v = this.voices[vi];
        if (!v.active) continue;
        anyActive = true;
        let voiceOut = 0;
        let silent = true;
        for (let k = 0; k < 6; k += 1) {
          const i = modOrder[k];
          const op = ops[i];
          const o = v.ops[i];
          // envelope
          if (o.stage < 4) {
            if (o.stageTarget > o.env) { o.env += Math.max(o.linear, (o.stageTarget - o.env) * o.coef * 0.5); if (o.env >= o.stageTarget) { o.env = o.stageTarget; if (o.stage < 2) this._enterStage(o, op, o.stage + 1, v.note); else if (o.stage === 3) o.stage = 4; } }
            else { o.env += (o.stageTarget - o.env) * o.coef; if (o.env - o.stageTarget < 1e-4) { o.env = o.stageTarget; if (o.stage < 2) this._enterStage(o, op, o.stage + 1, v.note); else if (o.stage === 3) o.stage = 4; } }
          }
          if (o.stage === 3 && o.env < 1e-4 && o.stageTarget < 1e-4) o.stage = 4;
          if (!op.enabled) { o.out = o.out2 = 0; continue; }
          if (o.env > 1e-5 || o.stage < 4) silent = false;
          o.phase += o.inc;
          if (o.phase >= 1) o.phase -= Math.floor(o.phase);
          // modulation input
          let pm = 0;
          const mods = alg.mods[i + 1];
          if (mods) for (let m = 0; m < mods.length; m += 1) pm += v.ops[mods[m] - 1].out;
          if (i === fbIndex) pm += (o.out + o.out2) * 0.5 * fbAmt / modIndex;
          const amsScale = op.ams ? 1 - (op.ams / 3) * (1 - ampMod) : 1;
          const amp = o.amp * o.env * amsScale;
          const s = sine(o.phase + pm * modIndex) * amp;
          o.out2 = o.out; o.out = s;
        }
        for (let c = 0; c < alg.carriers.length; c += 1) voiceOut += v.ops[alg.carriers[c] - 1].out;
        mix += voiceOut * carrierNorm;
        if (silent && !v.gate) v.active = false;
      }
      this.gain += (this.volume * this.volume - this.gain) * 0.002;
      let s = mix * this.gain;
      if (s > 0.9 || s < -0.9) s = Math.sign(s) * (0.9 + 0.1 * Math.tanh((Math.abs(s) - 0.9) * 4));
      L[n] = s; R[n] = s;
      if (!anyActive) { L.fill(0, n); R.fill(0, n); break; }
    }
    return true;
  }
}
registerProcessor('dx7-processor', DX7Processor);
