/*
 * MS20Processor.js - monophonic semi-modular synth (AudioWorklet).
 * Inspired by the MS-20 architecture: two VCOs (VCO1 tri/saw/pulse/noise,
 * VCO2 saw/square/pulse/ring-mod), high-pass then low-pass 2-pole resonant
 * filters with saturation (self-oscillate at full peak), EG1 (delay/attack/
 * release), EG2 (hold/attack/decay/sustain/release), MG (triangle<->ramp and
 * rectangle with variable width), sample & hold, noise, VCA, and a patch panel
 * whose cables re-route control/audio signals inside this processor. One audio
 * input feeds the External Signal Processor (band-pass, envelope follower,
 * trigger). Low-note priority, single trigger (legato), portamento.
 */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sat = (x) => (x > 3 ? 1 : x < -3 ? -1 : (x * (27 + x * x)) / (27 + 9 * x * x));
import { MS20_DEFAULT, MS20_JACKS } from '../data/ms20Jacks.js';


class MS20Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate; this.p = { ...MS20_DEFAULT }; this.cables = [];
    this.keys = []; this.gate = false; this.pitch = 60; this.target = 60; this.bend = 0; this.mod = 0;
    this.ph1 = 0; this.ph2 = 0; this.prev1 = 0; this.prev2 = 0; this.noise = 0x1234567; this.pink = [0, 0, 0];
    this.mgPh = 0; this.sh = 0; this.shClockPrev = 0; this.eg1 = { v: 0, stage: 'idle', t: 0 }; this.eg2 = { v: 0, stage: 'idle', t: 0 };
    this.hp = [0, 0]; this.lp = [0, 0]; this.gain = 0; this.espEnv = 0; this.esp = [0, 0, 0, 0]; this.vcaSm = 0;
    this.pitchRing = new Float32Array(1024); this.pitchFrame = new Float32Array(1024);
    this.pitchDiff = new Float32Array(257); this.pitchCmnd = new Float32Array(257);
    this.pitchRingWrite = 0; this.pitchRingCount = 0; this.pitchHopCount = 0;
    this.pitchDecimSum = 0; this.pitchDecimCount = 0; this.pitchTargetCv = 0; this.pitchCv = 0;
    this.pitchSlew = 1 - Math.exp(-1 / (this.sr * 0.02)); this.pitchLostSamples = 0;
    this.pitchValid = false; this.pitchHz = 0; this.pitchMidi = 60; this.pitchConfidence = 0; this.pitchMessageCounter = 0;
    this.trigPrev = { EG1_TRIG_IN: 0, EG2_TRIG_IN: 0 }; this.src = {};
    this.port.onmessage = (e) => this._msg(e.data);
  }

  _msg(m) {
    switch (m.t) {
      case 'patch': this.p = { ...MS20_DEFAULT, ...m.patch }; break;
      case 'param': if (m.key in MS20_DEFAULT) this.p[m.key] = m.value; break;
      case 'cables': this.cables = (m.cables || []).filter((c) => MS20_JACKS.sources[c.from] && MS20_JACKS.inputs[c.to]); break;
      case 'noteOn': this.keys = this.keys.filter((k) => k !== m.note); this.keys.push(m.note | 0); this.vel = m.vel; this._pick(true); break;
      case 'noteOff': this.keys = this.keys.filter((k) => k !== m.note); this._pick(false); break;
      case 'bend': this.bend = clamp(m.value, -1, 1); break;
      case 'mod': this.mod = clamp(m.value, 0, 1); break;
      case 'volume': this.p.volume = clamp(m.value, 0, 1); break;
      case 'allOff': case 'allSoundOff': this.keys = []; this._pick(false); break;
      default: break;
    }
  }

  _pick(isOn) {
    if (!this.keys.length) { this.gate = false; return; }
    const low = Math.min(...this.keys); // low-note priority, single trigger
    const wasGate = this.gate;
    this.target = low;
    if (!wasGate) { this.pitch = this.p.portamento > 0 ? this.pitch : low; this.gate = true; this.trigger('EG1'); this.trigger('EG2'); }
    else if (isOn && this.p.portamento <= 0) { /* legato: pitch jumps, no retrigger */ }
  }

  trigger(id) { const e = id === 'EG1' ? this.eg1 : this.eg2; e.stage = id === 'EG1' ? 'delay' : 'hold'; e.t = 0; }

  _patched(input) { return this.cables.some((c) => c.to === input); }
  _in(input) { let s = 0; for (let i = 0; i < this.cables.length; i += 1) if (this.cables[i].to === input) s += this.src[this.cables[i].from] || 0; return s; }

  process(inputs, outputs) {
    const out = outputs[0]; const L = out[0]; if (!L) return true; const R = out[1] || L;
    const ext = inputs[0]?.[0];
    const p = this.p; const sr = this.sr; const src = this.src;
    const egGate1 = this._patched('EG1_TRIG_IN'); const egGate2 = this._patched('EG2_TRIG_IN');
    const mgHz = 0.1 * Math.pow(300, p.mgFreq);
    const glideC = p.portamento <= 0 ? 1 : 1 - Math.exp(-1 / (sr * (p.portamento * 2) / 4));
    const t = (x, max) => 0.002 + x * x * max;
    const hpR = 1 - p.hpPeak * 1.03, lpR = 1 - p.lpPeak * 1.03;
    const oct1 = { 32: -2, 16: -1, 8: 0, 4: 1 }[p.vco1Scale] ?? 0; const oct2 = { 16: -1, 8: 0, 4: 1, 2: 2 }[p.vco2Scale] ?? 0;
    const espLow = 40 * Math.pow(100, p.espLow); const espHigh = 200 * Math.pow(60, p.espHigh);
    const eLo = Math.exp(-2 * Math.PI * espLow / sr); const eHi = 1 - Math.exp(-2 * Math.PI * espHigh / sr);
    for (let n = 0; n < L.length; n += 1) {
      // ---- sources computed first from previous-sample state
      let s = this.noise; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.noise = s >>> 0;
      const white = (this.noise / 4294967296) * 2 - 1;
      const pk = this.pink; pk[0] = 0.99765 * pk[0] + white * 0.099; pk[1] = 0.963 * pk[1] + white * 0.2965; pk[2] = 0.57 * pk[2] + white * 1.0527;
      const pink = (pk[0] + pk[1] + pk[2] + white * 0.1848) * 0.2;
      this.mgPh += mgHz / sr; if (this.mgPh >= 1) this.mgPh -= 1;
      const skew = clamp(p.mgWave, 0.02, 0.98);
      const mgTri = this.mgPh < skew ? -1 + 2 * this.mgPh / skew : 1 - 2 * (this.mgPh - skew) / (1 - skew);
      const mgRect = this.mgPh < skew ? 1 : 0;
      // Voice pitch tracking. Decimate 4:1, then estimate the fundamental about every 21 ms.
      if (ext && p.espPitch >= 0.5) this._pushPitchSample(ext[n]);
      else {
        this.pitchTargetCv = 0; this.pitchDecimSum = 0; this.pitchDecimCount = 0;
        this.pitchRingCount = 0; this.pitchHopCount = 0; this.pitchLostSamples = 0; this.pitchValid = false;
      }
      this.pitchCv += this.pitchSlew * (this.pitchTargetCv - this.pitchCv);

      // ESP
      let esp = 0; let espTrig = 0;
      if (ext) {
        const x = ext[n] * p.espLevel * 4;
        this.esp[0] += eHi * (x - this.esp[0]); // low-pass
        const hp = this.esp[0] - this.esp[1]; this.esp[1] += (1 - eLo) * (this.esp[0] - this.esp[1]); // high-pass via subtracting a low-pass
        esp = hp;
        const a = Math.abs(esp); this.espEnv += (a > this.espEnv ? 0.02 : 0.0008) * (a - this.espEnv);
        espTrig = this.espEnv > p.espThreshold * 0.5 ? 1 : 0;
      }
      // S&H
      const shClock = this._patched('SH_CLOCK_IN') ? (this._in('SH_CLOCK_IN') > 0.5 ? 1 : 0) : mgRect;
      if (shClock && !this.shClockPrev) this.sh = this._patched('SH_IN') ? clamp(this._in('SH_IN'), -1, 1) : white;
      this.shClockPrev = shClock;
      src.KBD_CV = (this.pitch - 60) / 12; src.KBD_TRIG = this.gate ? 1 : 0; src.MG_TRI = mgTri; src.MG_RECT = mgRect;
      src.EG1_OUT = this.eg1.v; src.EG2_OUT = this.eg2.v; src.EG2_REV = -this.eg2.v; src.SH_OUT = this.sh; src.NOISE_WHITE = white; src.NOISE_PINK = pink;
      src.VCO2_OUT = this.prev2; src.ESP_SIGNAL = esp; src.ESP_ENV = this.espEnv * 2; src.ESP_TRIG = espTrig;
      src.ESP_PITCH_CV = p.espPitch >= 0.5 ? this.pitchCv : 0;
      // ---- envelopes (external triggers replace the keyboard)
      const gate1 = egGate1 ? this._in('EG1_TRIG_IN') > 0.5 : this.gate;
      const gate2 = egGate2 ? this._in('EG2_TRIG_IN') > 0.5 : this.gate;
      if (egGate1) { if (gate1 && !this.trigPrev.EG1_TRIG_IN) this.trigger('EG1'); this.trigPrev.EG1_TRIG_IN = gate1 ? 1 : 0; }
      if (egGate2) { if (gate2 && !this.trigPrev.EG2_TRIG_IN) this.trigger('EG2'); this.trigPrev.EG2_TRIG_IN = gate2 ? 1 : 0; }
      this._eg1(gate1, t(p.eg1Delay, 4), t(p.eg1Attack, 5), t(p.eg1Release, 8));
      this._eg2(gate2, t(p.eg2Hold, 4), t(p.eg2Attack, 5), t(p.eg2Decay, 8), p.eg2Sustain, t(p.eg2Release, 8));
      // ---- pitch
      this.pitch += (this.target - this.pitch) * glideC;
      const fmSrc = this._patched('FM_IN') ? this._in('FM_IN') : mgTri;
      const pitchMod = fmSrc * p.vcoMgInt * p.vcoMgInt * 24 + this.eg1.v * p.vcoEgInt * 24 + this._in('TOTAL_IN') * 12 + this.bend * p.bendRange + this.mod * mgTri * 1.5;
      const base = this.pitch + pitchMod;
      const hz1 = Math.min(0.45 * sr, 440 * Math.pow(2, (base + oct1 * 12 - 69) / 12));
      const hz2 = Math.min(0.45 * sr, 440 * Math.pow(2, (base + oct2 * 12 + p.vco2Pitch + this._in('VCO2_CV_IN') * 12 - 69) / 12));
      // ---- VCO1
      const inc1 = hz1 / sr; let o1;
      if (p.vco1Wave === 'noise') o1 = white;
      else {
        const p0 = this.ph1; let ph = p0 + inc1; let cp = 0, cc = 0;
        const pw = clamp(p.vco1Pw, 0.05, 0.95);
        if (ph >= 1) { const tt = (ph - 1) / inc1; if (p.vco1Wave === 'saw') { cp -= tt * tt; cc += (1 - tt) * (1 - tt); } else if (p.vco1Wave === 'pulse') { cp += tt * tt; cc -= (1 - tt) * (1 - tt); } }
        if (p.vco1Wave === 'pulse') { let te = -1; if (p0 < pw && ph >= pw) te = (ph - pw) / inc1; else if (ph >= 1 + pw) te = (ph - 1 - pw) / inc1; if (te >= 0) { cp -= te * te; cc += (1 - te) * (1 - te); } }
        if (ph >= 1) ph -= 1; this.ph1 = ph;
        const naive = p.vco1Wave === 'tri' ? (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) : p.vco1Wave === 'saw' ? 2 * ph - 1 : (ph < pw ? 1 : -1);
        o1 = this.prev1 + cp; this.prev1 = naive + cc;
      }
      // ---- VCO2
      const inc2 = hz2 / sr; const p0 = this.ph2; let ph2 = p0 + inc2; let cp2 = 0, cc2 = 0;
      const pw2 = p.vco2Wave === 'pulse' ? 0.15 : 0.5;
      const sq = p.vco2Wave === 'sqr' || p.vco2Wave === 'pulse' || p.vco2Wave === 'ring';
      if (ph2 >= 1) { const tt = (ph2 - 1) / inc2; if (sq) { cp2 += tt * tt; cc2 -= (1 - tt) * (1 - tt); } else { cp2 -= tt * tt; cc2 += (1 - tt) * (1 - tt); } }
      if (sq) { let te = -1; if (p0 < pw2 && ph2 >= pw2) te = (ph2 - pw2) / inc2; else if (ph2 >= 1 + pw2) te = (ph2 - 1 - pw2) / inc2; if (te >= 0) { cp2 -= te * te; cc2 += (1 - te) * (1 - te); } }
      if (ph2 >= 1) ph2 -= 1; this.ph2 = ph2;
      const naive2 = sq ? (ph2 < pw2 ? 1 : -1) : 2 * ph2 - 1;
      let o2 = this.prev2 + cp2; this.prev2 = naive2 + cc2;
      if (p.vco2Wave === 'ring') o2 = o2 * o1;
      // ---- mixer + filters
      let x = (o1 * p.mix1 + o2 * p.mix2 + this._in('EXT_SIGNAL_IN') * 0.8) * 0.6;
      const hpMod = (this._patched('HPF_CUT_IN') ? this._in('HPF_CUT_IN') : mgTri) * p.hpMgInt * 48 + (this._patched('HPF_CUT_IN') ? 0 : this.eg2.v) * p.hpEgInt * 60;
      const lpMod = (this._patched('LPF_CUT_IN') ? this._in('LPF_CUT_IN') : mgTri) * p.lpMgInt * 48 + this.eg2.v * p.lpEgInt * 72 + this.mod * 12;
      x = this._svf(this.hp, x, 20 * Math.pow(2, (p.hpCut * 108 + hpMod) / 12), hpR, true);
      x = this._svf(this.lp, x, 20 * Math.pow(2, (p.lpCut * 118 + lpMod + (this.pitch - 60) * 0.3) / 12), lpR, false);
      // ---- VCA
      let vca = this.eg2.v + (this._patched('VCA_IN') ? this._in('VCA_IN') : 0);
      if (this._patched('MOD_VCA_IN')) vca *= 0.5 + 0.5 * this._in('MOD_VCA_IN');
      vca = clamp(vca, 0, 1.5);
      this.vcaSm += (vca - this.vcaSm) * 0.05;
      this.gain += (p.volume * p.volume - this.gain) * 0.002;
      let y = sat(x * 1.2) * this.vcaSm * this.gain * 0.9;
      L[n] = y; R[n] = y;
    }
    return true;
  }

  _pushPitchSample(sample) {
    this.pitchDecimSum += sample;
    this.pitchDecimCount += 1;
    if (this.pitchDecimCount < 4) return;
    const downsampled = this.pitchDecimSum * 0.25;
    this.pitchDecimSum = 0; this.pitchDecimCount = 0;
    this.pitchRing[this.pitchRingWrite] = downsampled;
    this.pitchRingWrite = (this.pitchRingWrite + 1) % this.pitchRing.length;
    if (this.pitchRingCount < this.pitchRing.length) this.pitchRingCount += 1;
    if (this.pitchRingCount < this.pitchRing.length) return;
    this.pitchHopCount += 1;
    if (this.pitchHopCount >= 256) {
      this.pitchHopCount = 0;
      this._estimateVoicePitch();
    }
  }

  _estimateVoicePitch() {
    const N = this.pitchRing.length;
    const rate = this.sr / 4;
    const minLag = Math.max(2, Math.floor(rate / 900));
    const maxLag = Math.min(240, Math.floor(rate / 50));
    let mean = 0;
    for (let i = 0; i < N; i += 1) {
      const v = this.pitchRing[(this.pitchRingWrite + i) % N];
      this.pitchFrame[i] = v;
      mean += v;
    }
    mean /= N;
    let energy = 0;
    for (let i = 0; i < N; i += 1) {
      this.pitchFrame[i] -= mean;
      energy += this.pitchFrame[i] * this.pitchFrame[i];
    }
    const rms = Math.sqrt(energy / N);
    this.pitchCmnd.fill(1);
    let valid = false;
    let frequency = 0;
    let midi = 60;
    let confidence = 0;

    if (rms >= 0.002) {
      let cumulative = 0;
      const limit = N - maxLag;
      for (let lag = 1; lag <= maxLag; lag += 1) {
        let difference = 0;
        for (let i = 0; i < limit; i += 1) {
          const delta = this.pitchFrame[i] - this.pitchFrame[i + lag];
          difference += delta * delta;
        }
        this.pitchDiff[lag] = difference;
        cumulative += difference;
        this.pitchCmnd[lag] = cumulative > 1e-12 ? difference * lag / cumulative : 1;
      }

      // Search all credible local minima rather than accepting the first dip.
      // A strong second/third harmonic can create an earlier (shorter-lag) dip;
      // the true fundamental normally has the lower normalized-difference score.
      let candidate = -1;
      let bestScore = 0.30;
      for (let lag = minLag; lag <= maxLag; lag += 1) {
        const score = this.pitchCmnd[lag];
        const isMinimum = score <= this.pitchCmnd[lag - 1]
          && (lag === maxLag || score <= this.pitchCmnd[lag + 1]);
        if (isMinimum && score < bestScore) {
          candidate = lag;
          bestScore = score;
        }
      }

      if (candidate >= minLag && candidate <= maxLag) {
        const left = this.pitchCmnd[candidate - 1];
        const center = this.pitchCmnd[candidate];
        const right = candidate < maxLag ? this.pitchCmnd[candidate + 1] : center;
        const denom = left - 2 * center + right;
        const offset = candidate > minLag && candidate < maxLag && Math.abs(denom) > 1e-9
          ? 0.5 * (left - right) / denom : 0;
        const refinedLag = candidate + clamp(offset, -0.5, 0.5);
        frequency = rate / refinedLag;
        confidence = clamp(1 - center, 0, 1);
        if (frequency >= 50 && frequency <= 900 && confidence >= 0.70) {
          midi = 69 + 12 * Math.log2(frequency / 440);
          this.pitchTargetCv = clamp((midi - 60) / 12, -2.5, 2.5);
          this.pitchLostSamples = 0;
          valid = true;
        }
      }
    }

    if (!valid) {
      this.pitchLostSamples += 1024;
      if (this.pitchLostSamples > this.sr * 0.16) this.pitchTargetCv = 0;
      frequency = 0;
      midi = 60;
    }
    this.pitchValid = valid;
    this.pitchHz = frequency;
    this.pitchMidi = midi;
    this.pitchConfidence = confidence;
    this.pitchMessageCounter += 1;
    if (this.pitchMessageCounter % 3 === 0) {
      this.port.postMessage({
        t: 'espPitch', valid: this.pitchValid, frequency: this.pitchHz,
        midi: this.pitchMidi, confidence: this.pitchConfidence,
      });
    }
  }

  _svf(st, x, fc, R, highpass) {
    fc = clamp(fc, 10, 0.45 * this.sr);
    const g = Math.tan(Math.PI * fc / this.sr);
    const k = 2 * clamp(R, -0.02, 1);
    const a1 = 1 / (1 + g * (g + k)); const a2 = g * a1;
    const v3 = x - st[1];
    const v1 = a1 * st[0] + a2 * v3;
    const v2 = st[1] + g * v1;
    st[0] = sat(2 * v1 - st[0]); st[1] = sat(2 * v2 - st[1]);
    const lp = v2; const bp = v1; const hp = x - k * bp - lp;
    return highpass ? hp : lp;
  }

  _eg1(gate, delay, attack, release) {
    const e = this.eg1; const dt = 1 / this.sr;
    if (!gate && e.stage !== 'idle' && e.stage !== 'release') e.stage = 'release';
    if (e.stage === 'delay') { e.t += dt; if (e.t >= delay) { e.stage = 'attack'; } }
    else if (e.stage === 'attack') { e.v += dt / attack; if (e.v >= 1) { e.v = 1; e.stage = 'on'; } }
    else if (e.stage === 'on') { e.v = 1; }
    else if (e.stage === 'release') { e.v *= Math.exp(-dt / (release / 4.6)); if (e.v < 1e-4) { e.v = 0; e.stage = 'idle'; } }
  }

  _eg2(gate, hold, attack, decay, sustain, release) {
    const e = this.eg2; const dt = 1 / this.sr;
    if (!gate && e.stage !== 'idle' && e.stage !== 'release') e.stage = 'release';
    if (e.stage === 'hold') { e.t += dt; if (e.t >= hold) e.stage = 'attack'; }
    else if (e.stage === 'attack') { e.v += (1.3 - e.v) * (1 - Math.exp(-dt / (attack / 3))); if (e.v >= 1) { e.v = 1; e.stage = 'decay'; } }
    else if (e.stage === 'decay') { e.v = sustain + (e.v - sustain) * Math.exp(-dt / (decay / 4.6)); }
    else if (e.stage === 'release') { e.v *= Math.exp(-dt / (release / 4.6)); if (e.v < 1e-4) { e.v = 0; e.stage = 'idle'; } }
  }
}
registerProcessor('ms20-processor', MS20Processor);
