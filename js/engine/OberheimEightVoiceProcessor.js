/* Eight independent SEM-style voices: two band-limited oscillators, a
 * two-pole state-variable filter, ADS envelopes, per-voice drift and stereo
 * pan. The voices intentionally own all phase/filter/envelope state. */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DEF = { cutoff: .58, resonance: .16, filterEnv: .48, filterMode: 'low', osc1: .7, osc2: .65, tune: 0.02, pulse: .5, wave1: 'saw', wave2: 'pulse', attack: .08, decay: .35, sustain: .7, release: .32, master: .7, lfoRate: .18, lfoAmount: .08, lfoTarget: 'pitch', bendRange: 2 };
const polyBlep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};
const saw = (p, dt) => 2 * p - 1 - polyBlep(p, dt);
const wave = (p, pulse, dt) => {
  const duty = clamp(pulse, .05, .95);
  return saw(p, dt) - saw((p + 1 - duty) % 1, dt) * .5;
};
const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

class Voice {
  constructor(i) {
    this.i = i; this.note = -1; this.target = 60; this.gate = false; this.active = false;
    this.phase1 = Math.random(); this.phase2 = Math.random(); this.lfo = Math.random();
    this.env1 = 0; this.env2 = 0; this.stage = 'idle'; this.order = 0;
    this.lp = 0; this.bp = 0; this.hp = 0; this.pan = (i - 3.5) / 5; this.seed = (Math.random() * 0x7fffffff) | 0;
  }
}

class EightVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.p = { ...DEF }; this.v = Array.from({ length: 8 }, (_, i) => new Voice(i));
    this.bend = 0; this.mod = 0; this.sustain = false; this.order = 0; this.port.onmessage = (e) => this.message(e.data);
  }
  message(m) {
    if (m.t === 'patch') this.p = { ...DEF, ...m.patch };
    else if (m.t === 'param' && (m.key in DEF || m.key.startsWith('voice'))) this.setParam(m.key, m.value);
    else if (m.t === 'noteOn') this.noteOn(m.note | 0, clamp(m.vel, .01, 1));
    else if (m.t === 'noteOff') this.v.forEach((v) => { if (v.note === (m.note | 0)) { v.gate = false; if (!this.sustain) v.stage = 'release'; } });
    else if (m.t === 'bend') this.bend = clamp(m.value, -1, 1);
    else if (m.t === 'mod') this.mod = clamp(m.value, 0, 1);
    else if (m.t === 'sustain') { this.sustain = !!m.down; if (!this.sustain) this.v.forEach((v) => { if (!v.gate) v.stage = 'release'; }); }
    else if (m.t === 'volume') this.p.master = clamp(m.value, 0, 1);
    else if (m.t === 'allOff' || m.t === 'allSoundOff') this.v.forEach((v) => { v.gate = false; v.stage = 'release'; });
  }
  setParam(key, value) {
    const match = /^voice(\d+)_(.+)$/.exec(key);
    if (match) { const i = Number(match[1]); this.p.voices ||= Array.from({ length: 8 }, () => ({})); this.p.voices[i][match[2]] = value; }
    else this.p[key] = value;
  }
  noteOn(note, vel) {
    let v = this.v.find((x) => x.active && x.note === note);
    if (!v) v = this.v.find((x) => !x.gate) || this.v.slice().sort((a, b) => a.order - b.order)[0];
    v.note = note; v.target = note; v.gate = true; v.active = true; v.stage = 'attack'; v.env1 = 0; v.env2 = 0; v.vel = vel; v.order = ++this.order;
  }
  env(v, sr) {
    const a = .002 + this.p.attack * this.p.attack * 1.8;
    const d = .01 + this.p.decay * this.p.decay * 4;
    if (v.stage === 'attack') { v.env1 += (1.1 - v.env1) / (sr * a / 3); v.env2 += (1.1 - v.env2) / (sr * a / 3); if (v.env1 >= 1) v.stage = 'decay'; }
    else if (v.stage === 'decay') { v.env1 += (this.p.sustain - v.env1) / (sr * d / 4); v.env2 += (this.p.sustain - v.env2) / (sr * d / 4); }
    else if (v.stage === 'release') { const release = .015 + this.p.release * this.p.release * 4; v.env1 *= Math.exp(-1 / (sr * release)); v.env2 *= Math.exp(-1 / (sr * release * 1.06)); if (v.env1 < .0001) { v.active = false; v.stage = 'idle'; } }
  }
  process(_inputs, outputs) {
    const out = outputs[0]; const L = out[0]; const R = out[1] || L; const sr = sampleRate;
    for (let n = 0; n < L.length; n += 1) {
      let left = 0; let right = 0;
      this.v.forEach((v, i) => {
        if (!v.active) return;
        const q = this.p.voices?.[i] || {};
        this.env(v, sr);
        v.lfo += (0.1 * Math.pow(300, this.p.lfoRate)) / sr; if (v.lfo >= 1) v.lfo -= 1;
        const lfo = Math.sin(v.lfo * Math.PI * 2) * (this.p.lfoAmount + this.mod * .15);
        const drift = ((i - 3.5) * .006) + (q.tune || 0);
        const pitchMod = this.p.lfoTarget === 'pitch' ? lfo * 1.8 : 0;
        const hz = midiHz(v.target + this.bend * this.p.bendRange + pitchMod) * Math.pow(2, drift / 12);
        const inc1 = hz / sr; const inc2 = hz * Math.pow(2, (this.p.tune * 12 + (q.detune || 0)) / 12) / sr;
        v.phase1 += inc1; v.phase2 += inc2; if (v.phase1 >= 1) v.phase1 -= 1; if (v.phase2 >= 1) v.phase2 -= 1;
        const pulse = clamp(this.p.pulse + lfo * .15, .05, .95);
        const osc1 = (q.wave1 ?? this.p.wave1) === 'pulse' ? wave(v.phase1, pulse, inc1) : saw(v.phase1, inc1);
        const osc2 = (q.wave2 ?? this.p.wave2) === 'saw' ? saw(v.phase2, inc2) : wave(v.phase2, pulse, inc2);
        const source = osc1 * (q.osc1 ?? this.p.osc1) * .5 + osc2 * (q.osc2 ?? this.p.osc2) * .5;
        const cutoff = 30 * Math.pow(2, 8.5 * clamp((q.cutoff ?? this.p.cutoff) + (this.p.lfoTarget === 'filter' ? lfo : 0) + (q.filterEnv ?? this.p.filterEnv) * v.env2, 0, 1));
        const g = Math.min(.5, 2 * Math.sin(Math.PI * Math.min(cutoff, sr * .42) / sr));
        const damping = 1.8 - clamp(q.resonance ?? this.p.resonance, 0, .85) * 1.65;
        v.lp += g * v.bp; v.hp = source - v.lp - damping * v.bp; v.bp += g * v.hp;
        const mode = this.p.filterMode; const filtered = mode === 'high' ? v.hp : mode === 'band' ? v.bp : mode === 'notch' ? v.lp + v.hp : v.lp;
        const level = v.env1 * (q.level ?? .85) * .16; const pan = clamp((q.pan ?? v.pan), -1, 1);
        left += filtered * level * (1 - pan) * .5; right += filtered * level * (1 + pan) * .5;
      });
      const gain = Math.tanh(this.p.master * 1.35); L[n] = Math.tanh(left * gain); R[n] = Math.tanh(right * gain);
    }
    return true;
  }
}
registerProcessor('oberheim-eight-voice-processor', EightVoiceProcessor);
