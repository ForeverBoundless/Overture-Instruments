/* Hohner D6-style struck-string model.
 * A plucked-string delay line approximates the tangent/anvil excitation and
 * the two pickup positions. It is a procedural physical-model approximation,
 * not a sample bank or a claim of circuit-level identity.
 */
/* global sampleRate, currentFrame, registerProcessor, AudioWorkletProcessor */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DEFAULT = { tone: 0, pickup: 'bothIn', volume: 0.72, damping: 0.34 };
const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

class ClavString {
  constructor() {
    this.note = -1; this.active = false; this.gate = false; this.order = 0;
    this.buffer = new Float32Array(2048); this.length = 2048; this.index = 0;
    this.velocity = 0.7; this.release = 1; this.toneState = 0; this.lp = 0;
    this.pan = 0; this.seed = 1;
  }
}
class HohnerD6Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { ...DEFAULT };
    this.voices = Array.from({ length: 24 }, () => new ClavString());
    this.order = 0; this.bend = 0; this.sustain = false; this.scheduled = [];
    this.pedals = {
      overdrive: { enabled: false, drive: 0.25, tone: 0.65, level: 0.78 },
      compressor: { enabled: false, sustain: 0.45, level: 0.75 },
      wah: { enabled: false, position: 0.5, resonance: 0.65, mix: 0.75 },
      phaser: { enabled: false, rate: 0.22, depth: 0.5, feedback: 0.15, mix: 0.5 },
      chorus: { enabled: false, rate: 0.2, depth: 0.5, mix: 0.38 },
      spring: { enabled: false, mix: 0.25, decay: 0.35 },
    };
    this.fx = {
      phase: 0, wahL: 0, wahB: 0, wahR: 0, wahBR: 0, driveL: 0, driveR: 0,
      phaserL: new Float32Array(4), phaserR: new Float32Array(4),
      chorusL: new Float32Array(8192), chorusR: new Float32Array(8192), chorusIndex: 0,
      springL: new Float32Array(16384), springR: new Float32Array(16384), springIndex: 0,
      compEnvelope: 0,
    };
    this.port.onmessage = (event) => this.message(event.data);
  }
  message(m) {
    if ((m.t === 'noteOn' || m.t === 'noteOff') && Number.isFinite(m.frame) && m.frame > currentFrame) {
      this.scheduled.push(m); this.scheduled.sort((a, b) => a.frame - b.frame); return;
    }
    this.dispatch(m);
  }
  dispatch(m) {
    if (m.t === 'patch') {
      this.p = { ...DEFAULT, ...m.patch };
      if (m.patch?.pedals) this.pedals = this.mergePedals(m.patch.pedals);
    } else if (m.t === 'param' && m.key in DEFAULT) this.p[m.key] = m.value;
    else if (m.t === 'pedals') this.pedals = this.mergePedals(m.pedals || {});
    else if (m.t === 'pedal') this.pedals[m.name] = { ...(this.pedals[m.name] || {}), ...m.values };
    else if (m.t === 'noteOn') this.noteOn(m.note | 0, clamp(m.vel, 0.01, 1));
    else if (m.t === 'noteOff') this.noteOff(m.note | 0);
    else if (m.t === 'bend') this.bend = clamp(m.value, -1, 1);
    else if (m.t === 'sustain') { this.sustain = !!m.down; if (!this.sustain) this.voices.forEach((v) => { if (!v.gate && v.note >= 0) v.active = false; }); }
    else if (m.t === 'volume') this.p.volume = clamp(m.value, 0, 1);
    else if (m.t === 'allOff' || m.t === 'allSoundOff') {
      this.scheduled.length = 0; this.voices.forEach((v) => { v.gate = false; v.release = 0; v.active = false; v.note = -1; });
    }
  }
  mergePedals(incoming) {
    const next = { ...this.pedals };
    Object.keys(next).forEach((name) => { if (incoming[name]) next[name] = { ...next[name], ...incoming[name] }; });
    return next;
  }
  random(v) {
    let x = v.seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; v.seed = x | 0;
    return (x >>> 0) / 4294967296 * 2 - 1;
  }
  noteOn(note, velocity) {
    let v = this.voices.find((voice) => voice.active && voice.note === note);
    if (!v) v = this.voices.find((voice) => !voice.active) || this.voices.slice().sort((a, b) => a.order - b.order)[0];
    const hz = midiHz(note);
    const length = Math.max(32, Math.round(sampleRate / hz));
    v.buffer = new Float32Array(length); v.length = length; v.index = 0;
    v.seed = ((note * 7919 + (this.order + 17) * 104729) | 0) || 1;
    const pluck = 0.16 + velocity * 0.22;
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.exp(-i / Math.max(12, length * pluck));
      const tangentPulse = i < Math.max(8, length * 0.12) ? 1 : 0.24;
      v.buffer[i] = this.random(v) * envelope * tangentPulse * velocity * 0.52;
    }
    v.note = note; v.velocity = velocity; v.active = true; v.gate = true; v.order = ++this.order;
    v.release = 1; v.toneState = 0; v.lp = 0; v.pan = ((note % 5) - 2) * 0.018;
  }
  noteOff(note) {
    this.voices.forEach((v) => { if (v.note === note) { v.gate = false; if (!this.sustain) v.release = Math.min(v.release, 0.98); } });
  }
  pickupSample(v, position) {
    const offset = Math.max(1, Math.floor(v.length * position));
    const index = (v.index - offset + v.length) % v.length;
    return v.buffer[index];
  }
  applyEffects(left, right, sr) {
    const fx = this.fx; const pedals = this.pedals;
    const drive = pedals.overdrive;
    if (drive.enabled) {
      const amount = 1 + clamp(drive.drive, 0, 1) * 22;
      const mix = 0.35 + clamp(drive.drive, 0, 1) * 0.55;
      const a = 1 - Math.exp(-2 * Math.PI * (450 + drive.tone * 9200) / sr);
      fx.driveL += a * (left - fx.driveL); fx.driveR += a * (right - fx.driveR);
      const wetL = Math.tanh(fx.driveL * amount) * drive.level * 1.35;
      const wetR = Math.tanh(fx.driveR * amount) * drive.level * 1.35;
      left = left * (1 - mix) + wetL * mix; right = right * (1 - mix) + wetR * mix;
    }
    const wah = pedals.wah;
    if (wah.enabled) {
      const center = 330 + clamp(wah.position, 0, 1) * 2250;
      const g = Math.min(0.48, 2 * Math.sin(Math.PI * center / sr));
      const q = 1.15 + clamp(wah.resonance, 0, 1) * 5.4;
      fx.wahL += g * fx.wahB; const highL = left - fx.wahL - q * fx.wahB; fx.wahB += g * highL;
      fx.wahR += g * fx.wahBR; const highR = right - fx.wahR - q * fx.wahBR; fx.wahBR += g * highR;
      const mix = clamp(wah.mix, 0, 1);
      left = left * (1 - mix) + fx.wahB * mix * 2.1; right = right * (1 - mix) + fx.wahBR * mix * 2.1;
    }
    const phaser = pedals.phaser;
    if (phaser.enabled) {
      fx.phase += (0.1 + clamp(phaser.rate, 0, 1) * 2.1) / sr;
      if (fx.phase >= 1) fx.phase -= 1;
      const sweep = 0.18 + (0.55 + 0.45 * Math.sin(fx.phase * Math.PI * 2)) * clamp(phaser.depth, 0, 1) * 0.64;
      let l = left + fx.phaserL[3] * phaser.feedback * 0.65;
      let r = right + fx.phaserR[3] * phaser.feedback * 0.65;
      for (let stage = 0; stage < 4; stage += 1) {
        const yl = -sweep * l + fx.phaserL[stage]; fx.phaserL[stage] = l + sweep * yl; l = yl;
        const yr = -sweep * r + fx.phaserR[stage]; fx.phaserR[stage] = r + sweep * yr; r = yr;
      }
      const mix = clamp(phaser.mix, 0, 1);
      left = left * (1 - mix) + l * mix; right = right * (1 - mix) + r * mix;
    }
    const chorus = pedals.chorus;
    if (chorus.enabled) {
      fx.phase += (0.08 + clamp(chorus.rate, 0, 1) * 1.25) / sr;
      const depth = clamp(chorus.depth, 0, 1);
      const delayL = 900 + Math.sin(fx.phase * Math.PI * 2) * 430 * depth;
      const delayR = 1050 + Math.sin(fx.phase * Math.PI * 2 + 1.2) * 430 * depth;
      const readL = (fx.chorusIndex - delayL + fx.chorusL.length) % fx.chorusL.length;
      const readR = (fx.chorusIndex - delayR + fx.chorusR.length) % fx.chorusR.length;
      const wetL = fx.chorusL[Math.floor(readL)] || 0; const wetR = fx.chorusR[Math.floor(readR)] || 0;
      fx.chorusL[fx.chorusIndex] = left + wetL * 0.18; fx.chorusR[fx.chorusIndex] = right + wetR * 0.18;
      fx.chorusIndex = (fx.chorusIndex + 1) % fx.chorusL.length;
      const mix = clamp(chorus.mix, 0, 1);
      left = left * (1 - mix) + wetL * mix; right = right * (1 - mix) + wetR * mix;
    }
    const spring = pedals.spring;
    if (spring.enabled) {
      const idx = fx.springIndex;
      const dl = fx.springL[(idx - 1901 + fx.springL.length) % fx.springL.length];
      const dr = fx.springR[(idx - 2237 + fx.springR.length) % fx.springR.length];
      const decay = 0.28 + clamp(spring.decay, 0, 1) * 0.62;
      fx.springL[idx] = left + dr * decay * 0.52;
      fx.springR[idx] = right + dl * decay * 0.52;
      fx.springIndex = (idx + 1) % fx.springL.length;
      const mix = clamp(spring.mix, 0, 1);
      left = left * (1 - mix) + dl * mix; right = right * (1 - mix) + dr * mix;
    }
    return [left, right];
  }
  process(_inputs, outputs) {
    const out = outputs[0]; const L = out[0]; const R = out[1] || L; const sr = sampleRate;
    const toneCutoff = [15000, 9800, 5700, 3100][Math.round(clamp(this.p.tone, 0, 3))] || 15000;
    const toneAlpha = 1 - Math.exp(-2 * Math.PI * toneCutoff / sr);
    const damping = 0.991 + (1 - clamp(this.p.damping, 0, 1)) * 0.006;
    for (let i = 0; i < L.length; i += 1) {
      while (this.scheduled.length && this.scheduled[0].frame <= currentFrame + i) this.dispatch(this.scheduled.shift());
      let left = 0; let right = 0;
      for (const v of this.voices) {
        if (!v.active) continue;
        const pitch = v.note + this.bend * 2;
        const speed = Math.pow(2, (pitch - v.note) / 12);
        const length = Math.max(32, Math.round(sampleRate / midiHz(pitch)));
        const readDelay = Math.min(v.length - 1, Math.max(1, Math.round(length * 0.999)));
        const read = v.buffer[v.index] || 0;
        const next = v.buffer[(v.index + 1) % v.length] || 0;
        const loop = (read + next) * 0.5;
        v.lp += toneAlpha * (loop - v.lp);
        v.buffer[v.index] = v.lp * (damping * (v.gate ? 1 : 0.965));
        v.index += 1;
        if (v.index >= v.length) v.index = 0;
        let a = this.pickupSample(v, 0.13);
        let b = this.pickupSample(v, 0.37);
        let sample = this.p.pickup === 'bridge' ? a
          : this.p.pickup === 'neck' ? b
            : this.p.pickup === 'bothOut' ? (a - b) * 0.88
              : (a + b) * 0.5;
        const releaseTime = 0.018 + clamp(this.p.damping, 0, 1) * 0.09;
        if (!v.gate) v.release *= Math.exp(-1 / (sr * releaseTime));
        const output = sample * v.release * v.velocity * 1.65;
        left += output * (1 - v.pan) * 0.5; right += output * (1 + v.pan) * 0.5;
        if (v.release < 0.001) { v.active = false; v.note = -1; }
      }
      let l = left * this.p.volume * 0.9; let r = right * this.p.volume * 0.9;
      [l, r] = this.applyEffects(l, r, sr);
      L[i] = Math.tanh(l); R[i] = Math.tanh(r);
    }
    return true;
  }
}
registerProcessor('hohner-d6-processor', HohnerD6Processor);
