/*
 * JunoProcessor.js - six-voice DCO polysynth with stereo chorus (AudioWorklet).
 * Independent model inspired by the Juno-106 architecture:
 *   DCO (band-limited saw + variable pulse with PWM, square sub-oscillator one
 *   octave down, white noise) -> HPF (4-position: bass lift / flat / 2 cut
 *   settings) -> resonant 4-pole low-pass (TPT ladder with soft saturation)
 *   -> VCA (ADSR or gate) -> stereo BBD-style chorus (I / II).
 * One ADSR per voice shapes the VCF (bipolar amount) and the VCA.
 */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */
const NV = 6;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sat = (x) => (x > 3 ? 1 : x < -3 ? -1 : (x * (27 + x * x)) / (27 + 9 * x * x));
const DEFAULT = { lfoRate: 0.4, lfoDelay: 0, dcoLfo: 0, pwm: 0.3, pwmMode: 'man', range: 8, saw: true, pulse: false, sub: 0, noise: 0,
  hpf: 1, cutoff: 0.7, res: 0.1, envAmt: 0.3, envPolarity: 1, vcfLfo: 0, kbd: 0.5, vcaMode: 'env', vcaLevel: 0.8,
  attack: 0.05, decay: 0.3, sustain: 0.7, release: 0.3, chorus: 0, portamento: 0, bendRange: 2, benderLfo: 0.1 };

class Voice {
  constructor() { this.note = -1; this.gate = false; this.active = false; this.order = 0; this.rel = 0; this.pitch = 60; this.target = 60; this.ph = Math.random(); this.subPh = 0; this.prev = 0; this.env = 0; this.stage = 'idle'; this.s = [0, 0, 0, 0]; this.hp1 = 0; this.hp2 = 0; this.ls = 0; this.seed = (Math.random() * 2 ** 31) | 0; this.vel = 1; }
}

class JunoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.p = { ...DEFAULT };
    this.voices = Array.from({ length: NV }, () => new Voice());
    this.order = 0; this.bend = 0; this.mod = 0; this.sustain = false; this.volume = 0.7; this.gain = 0;
    this.lfoPh = 0; this.lfoFade = 0; this.lastNoteTime = 0; this.held = 0;
    const len = Math.ceil(this.sr * 0.05);
    this.dl = new Float32Array(len); this.dw = 0; this.dlen = len; this.chPh = 0; this.chMix = 0;
    this.port.onmessage = (e) => this._msg(e.data);
  }

  _msg(m) {
    switch (m.t) {
      case 'patch': this.p = { ...DEFAULT, ...m.patch }; break;
      case 'param': if (m.key in DEFAULT) this.p[m.key] = m.value; break;
      case 'noteOn': this._noteOn(m.note | 0, clamp(m.vel, 0.01, 1)); break;
      case 'noteOff': this._noteOff(m.note | 0); break;
      case 'bend': this.bend = clamp(m.value, -1, 1); break;
      case 'mod': this.mod = clamp(m.value, 0, 1); break;
      case 'sustain': this.sustain = !!m.down; if (!this.sustain) this.voices.forEach((v) => { if (v.pedal) { v.pedal = false; this._release(v); } }); break;
      case 'volume': this.volume = clamp(m.value, 0, 1); break;
      case 'allOff': this.voices.forEach((v) => { v.pedal = false; if (v.gate) this._release(v); }); break;
      case 'allSoundOff': this.voices.forEach((v) => { v.active = false; v.gate = false; v.env = 0; v.stage = 'idle'; }); break;
      default: break;
    }
  }

  _noteOn(note, vel) {
    let v = this.voices.find((x) => x.active && x.note === note);
    if (!v) { const free = this.voices.filter((x) => !x.gate).sort((a, b) => (a.active === b.active ? a.rel - b.rel : a.active ? 1 : -1)); v = free[0] || this.voices.slice().sort((a, b) => a.order - b.order)[0]; }
    const anyHeld = this.voices.some((x) => x.gate);
    if (!anyHeld) this.lfoFade = 0;
    v.target = note;
    if (!v.active || this.p.portamento <= 0) v.pitch = note; else if (!v.gate) v.pitch = this.lastPitch ?? note;
    this.lastPitch = note;
    v.note = note; v.vel = vel; v.gate = true; v.pedal = false; v.active = true; v.order = ++this.order; v.stage = 'attack';
    v.ls = 0;
  }

  _noteOff(note) { this.voices.forEach((v) => { if (v.note === note && v.gate) { if (this.sustain) v.pedal = true; else this._release(v); } }); }
  _release(v) { v.gate = false; v.stage = 'release'; v.rel = ++this.order; }

  process(_i, outputs) {
    const out = outputs[0]; const L = out[0]; if (!L) return true; const R = out[1] || L;
    const p = this.p; const sr = this.sr;
    const lfoHz = 0.1 * Math.pow(300, p.lfoRate); // 0.1 .. 30 Hz
    const lfoInc = lfoHz / sr;
    const fadeInc = p.lfoDelay <= 0 ? 1 : 1 / (sr * (0.05 + p.lfoDelay * 4));
    const bendSemi = this.bend * p.bendRange;
    const rangeMul = p.range === 16 ? 0.5 : p.range === 4 ? 2 : 1;
    const aT = 0.001 + Math.pow(p.attack, 2) * 3, dT = 0.002 + Math.pow(p.decay, 2) * 12, rT = 0.002 + Math.pow(p.release, 2) * 12;
    const aC = 1 - Math.exp(-1 / (sr * aT / 3)), dC = Math.exp(-1 / (sr * dT / 4.6)), rC = Math.exp(-1 / (sr * rT / 4.6));
    const glideC = p.portamento <= 0 ? 1 : 1 - Math.exp(-1 / (sr * p.portamento * 1.5 / 4));
    const k = 4.1 * Math.pow(p.res, 1.3);
    const hpSetting = Math.round(p.hpf);
    const hpFc = hpSetting === 2 ? 220 : hpSetting === 3 ? 620 : 0;
    const hpA = hpFc ? Math.exp(-2 * Math.PI * hpFc / sr) : 0;
    const chorusTarget = p.chorus ? 1 : 0;
    const chRate = p.chorus === 2 ? 0.83 : 0.5;
    const chDepth = (p.chorus === 2 ? 0.0024 : 0.0018) * sr;
    const chBase = (p.chorus === 2 ? 0.0045 : 0.0035) * sr;
    for (let n = 0; n < L.length; n += 1) {
      this.lfoPh += lfoInc; if (this.lfoPh >= 1) this.lfoPh -= 1;
      this.lfoFade = Math.min(1, this.lfoFade + fadeInc);
      const lfo = (this.lfoPh < 0.5 ? 4 * this.lfoPh - 1 : 3 - 4 * this.lfoPh) * this.lfoFade;
      const pitchLfo = lfo * (p.dcoLfo * p.dcoLfo * 7 + this.mod * p.benderLfo * 6);
      let mix = 0;
      for (let vi = 0; vi < NV; vi += 1) {
        const v = this.voices[vi];
        if (!v.active) continue;
        // envelope
        if (v.stage === 'attack') { v.env += (1.2 - v.env) * aC; if (v.env >= 1) { v.env = 1; v.stage = 'decay'; } }
        else if (v.stage === 'decay') { v.env = p.sustain + (v.env - p.sustain) * dC; }
        else if (v.stage === 'release') { v.env *= rC; if (v.env < 1e-4) { v.env = 0; v.active = false; v.stage = 'idle'; continue; } }
        const vca = (p.vcaMode === 'gate' ? (v.ls += ((v.gate ? 1 : 0) - v.ls) * 0.002, v.ls) : v.env);
        if (!v.gate && p.vcaMode === 'gate' && v.ls < 1e-4 && v.stage === 'release') { v.active = false; continue; }
        // pitch
        v.pitch += (v.target - v.pitch) * glideC;
        const hz = 440 * Math.pow(2, (v.pitch - 69 + bendSemi + pitchLfo) / 12) * rangeMul;
        const inc = Math.min(0.45, hz / sr);
        // DCO: saw + pulse (polyBLEP), sub square one octave down
        const pw = 0.5 - 0.48 * (p.pwmMode === 'lfo' ? p.pwm * (0.5 + 0.5 * lfo) : p.pwm);
        let ph = v.ph + inc; let blepPrev = 0, blepCur = 0, blepPrevP = 0, blepCurP = 0;
        const p0 = v.ph;
        if (ph >= 1) { const t = (ph - 1) / inc; blepPrev -= t * t; blepCur += (1 - t) * (1 - t); blepPrevP += t * t; blepCurP -= (1 - t) * (1 - t); v.subPh = v.subPh ? 0 : 1; }
        if (p0 < pw && ph >= pw) { const t = (ph - pw) / inc; blepPrevP -= t * t; blepCurP += (1 - t) * (1 - t); }
        else if (ph >= 1 + pw) { const t = (ph - 1 - pw) / inc; blepPrevP -= t * t; blepCurP += (1 - t) * (1 - t); }
        if (ph >= 1) ph -= 1;
        v.ph = ph;
        const saw = 2 * ph - 1 + blepCur; const pulse = (ph < pw ? 1 : -1) + blepCurP;
        const sawOut = v.prev + (p.saw ? blepPrev : 0) + (p.pulse ? blepPrevP : 0);
        v.prev = (p.saw ? saw : 0) + (p.pulse ? pulse : 0);
        const sub = (v.subPh ? 1 : -1) * p.sub;
        let s = v.seed; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; v.seed = s >>> 0;
        const noise = ((v.seed / 4294967296) * 2 - 1) * p.noise;
        let x = (sawOut + sub + noise) * 0.5;
        // HPF section
        if (hpSetting === 0) { v.hp1 += (x - v.hp1) * 0.006; x += v.hp1 * 0.9; } // bass lift
        else if (hpFc) { const y = x - v.hp2 + hpA * v.hp1; v.hp2 = x; v.hp1 = y; x = y; }
        // VCF
        const envMod = v.env * p.envAmt * p.envPolarity * 7 * (1 - 0.3 * (1 - v.vel));
        const cutSemi = 20 + p.cutoff * 110 + envMod * 12 + lfo * p.vcfLfo * 48 + (v.pitch - 60) * p.kbd;
        let fc = 20 * Math.pow(2, cutSemi / 12); if (fc > 0.45 * sr) fc = 0.45 * sr;
        const g = Math.tan(Math.PI * fc / sr); const G = g / (1 + g);
        const G2 = G * G, G4 = G2 * G2; const st = v.s;
        const S = (1 - G) * (G2 * G * st[0] + G2 * st[1] + G * st[2] + st[3]);
        const y4e = (G4 * x + S) / (1 + k * G4);
        const u = sat(x - k * y4e + 0.0002 * noise);
        let w = (u - st[0]) * G; const y1 = w + st[0]; st[0] = y1 + w;
        w = (y1 - st[1]) * G; const y2 = w + st[1]; st[1] = y2 + w;
        w = (y2 - st[2]) * G; const y3 = w + st[2]; st[2] = y3 + w;
        w = (y3 - st[3]) * G; const y4 = w + st[3]; st[3] = y4 + w;
        mix += y4 * vca * p.vcaLevel * (0.6 + 0.4 * v.vel) * (1 + k * 0.12);
      }
      // chorus
      this.chMix += (chorusTarget - this.chMix) * 0.0005;
      this.chPh += chRate / sr; if (this.chPh >= 1) this.chPh -= 1;
      const tri = this.chPh < 0.5 ? 4 * this.chPh - 1 : 3 - 4 * this.chPh;
      const dry = mix * 0.5;
      this.dl[this.dw] = dry;
      const rd = (buf, delay) => { let pos = this.dw - delay; if (pos < 0) pos += this.dlen; const i = pos | 0; const f = pos - i; const j = i + 1 >= this.dlen ? 0 : i + 1; return buf[i] + (buf[j] - buf[i]) * f; };
      const wetL = rd(this.dl, chBase + chDepth * tri);
      const wetR = rd(this.dl, chBase - chDepth * tri);
      this.dw += 1; if (this.dw >= this.dlen) this.dw = 0;
      this.gain += (this.volume * this.volume - this.gain) * 0.002;
      const cm = this.chMix;
      let l = (dry + wetL * cm) * this.gain * 1.3; let r = (dry + wetR * cm) * this.gain * 1.3;
      if (l > 0.9 || l < -0.9) l = Math.sign(l) * (0.9 + 0.1 * Math.tanh((Math.abs(l) - 0.9) * 4));
      if (r > 0.9 || r < -0.9) r = Math.sign(r) * (0.9 + 0.1 * Math.tanh((Math.abs(r) - 0.9) * 4));
      L[n] = l; R[n] = r;
    }
    return true;
  }
}
registerProcessor('juno-processor', JunoProcessor);
