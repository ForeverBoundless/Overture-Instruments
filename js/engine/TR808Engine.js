/**
 * TR808Engine.js - synthesized rhythm voices and an audio-clock step sequencer.
 *
 * Every sound is generated from oscillators, noise and filters (no samples):
 * BD (sine with pitch drop + click), SD (two tuned sines + snappy noise),
 * toms / congas (swept sines, selectable per lane like the original's
 * instrument-select switches), rimshot / claves, clap (three noise bursts +
 * tail) / maracas, cowbell (two detuned pulses through a band-pass), cymbal
 * and open/closed hats (six-oscillator metallic bank through high-pass filters).
 * The sequencer uses a lookahead scheduler on the AudioContext clock.
 */
export const LANES = [
  { id: 'AC', name: 'ACCENT', params: ['LEVEL'] },
  { id: 'BD', name: 'BASS DRUM', params: ['LEVEL', 'TONE', 'DECAY'] },
  { id: 'SD', name: 'SNARE DRUM', params: ['LEVEL', 'TONE', 'SNAPPY'] },
  { id: 'LT', name: 'LOW TOM', alt: 'LC', altName: 'LOW CONGA', params: ['LEVEL', 'TUNING'] },
  { id: 'MT', name: 'MID TOM', alt: 'MC', altName: 'MID CONGA', params: ['LEVEL', 'TUNING'] },
  { id: 'HT', name: 'HI TOM', alt: 'HC', altName: 'HI CONGA', params: ['LEVEL', 'TUNING'] },
  { id: 'RS', name: 'RIM SHOT', alt: 'CL', altName: 'CLAVES', params: ['LEVEL'] },
  { id: 'CP', name: 'HAND CLAP', alt: 'MA', altName: 'MARACAS', params: ['LEVEL'] },
  { id: 'CB', name: 'COWBELL', params: ['LEVEL'] },
  { id: 'CY', name: 'CYMBAL', params: ['LEVEL', 'TONE', 'DECAY'] },
  { id: 'OH', name: 'OPEN HAT', params: ['LEVEL', 'DECAY'] },
  { id: 'CH', name: 'CLOSED HAT', params: ['LEVEL'] },
];
export const GM_NOTES = { 36: 'BD', 35: 'BD', 38: 'SD', 40: 'SD', 41: 'LT', 43: 'LT', 45: 'MT', 47: 'MT', 48: 'HT', 50: 'HT', 64: 'LC', 63: 'MC', 62: 'HC', 37: 'RS', 75: 'CL', 39: 'CP', 70: 'MA', 56: 'CB', 49: 'CY', 46: 'OH', 42: 'CH' };
export const TEMPO_MIN = 40;
export const TEMPO_MAX = 300; // Roland TR-808 specification: 40-300 BPM
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800]; // the classic hat/cymbal oscillator bank

export const DEFAULT_PARAMS = () => ({
  AC: { LEVEL: 0.6 }, BD: { LEVEL: 0.9, TONE: 0.3, DECAY: 0.5 }, SD: { LEVEL: 0.8, TONE: 0.5, SNAPPY: 0.6 },
  LT: { LEVEL: 0.8, TUNING: 0.5 }, MT: { LEVEL: 0.8, TUNING: 0.5 }, HT: { LEVEL: 0.8, TUNING: 0.5 },
  RS: { LEVEL: 0.7 }, CP: { LEVEL: 0.8 }, CB: { LEVEL: 0.6 }, CY: { LEVEL: 0.6, TONE: 0.5, DECAY: 0.5 }, OH: { LEVEL: 0.7, DECAY: 0.4 }, CH: { LEVEL: 0.7 },
});

export class TR808Engine {
  constructor() {
    this.ctx = null; this.master = null; this.started = false;
    this.params = DEFAULT_PARAMS();
    this.variants = { LT: 'LT', MT: 'MT', HT: 'HT', RS: 'RS', CP: 'CP' };
    this.masterLevel = 0.8;
    this.tempo = 120; this.length = 16; this.playing = false; this.step = 0; this.nextTime = 0;
    this.pattern = {}; LANES.forEach((l) => { this.pattern[l.id] = new Array(32).fill(0); });
    this.onStep = null; this._timer = null; this._noise = null; this.openHat = null;
  }

  async start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.master = this.ctx.createGain(); this.master.gain.value = this.masterLevel;
    this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -6; this.comp.ratio.value = 6; this.comp.attack.value = 0.002; this.comp.release.value = 0.12;
    this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    this.started = true;
  }

  setMaster(v) { this.masterLevel = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01); }
  setTempo(bpm) { this.tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, bpm)); }
  setVariant(lane, variant) { this.variants[lane] = variant; }

  // ----------------------------------------------------------------- voices
  _env(t, peak, decay, curve = 0.001) { const g = this.ctx.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(Math.max(curve, 0.0001), t + decay); g.connect(this.master); return g; }
  _noiseSrc(t, dur) { const s = this.ctx.createBufferSource(); s.buffer = this._noise; s.loop = true; s.loopStart = Math.random() * 1.5; s.loopEnd = s.loopStart + 0.5; s.start(t, s.loopStart); s.stop(t + dur + 0.05); return s; }
  _osc(type, freq, t, dur) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.start(t); o.stop(t + dur + 0.05); return o; }
  _filter(type, freq, q = 1) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }

  /** Trigger an instrument. `id` is a voice id (BD, SD, LT, LC ...). */
  trigger(id, time = this.ctx?.currentTime ?? 0, accent = false) {
    if (!this.started) return;
    const t = Math.max(time, this.ctx.currentTime);
    const lane = LANES.find((l) => l.id === id || l.alt === id);
    if (!lane) return;
    const p = this.params[lane.id];
    const level = p.LEVEL * (accent ? 1 + this.params.AC.LEVEL * 0.9 : 1) * 0.9;
    if (level <= 0) return;
    switch (id) {
      case 'BD': {
        const decay = 0.12 + p.DECAY * p.DECAY * 1.4;
        const g = this._env(t, level * 1.2, decay);
        const o = this._osc('sine', 48 + p.TONE * 10, t, decay);
        o.frequency.setValueAtTime(160 + p.TONE * 120, t); o.frequency.exponentialRampToValueAtTime(48 + p.TONE * 10, t + 0.04 + p.TONE * 0.03);
        const shaper = this.ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i += 1) { const x = (i / 127.5) - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); } shaper.curve = curve;
        o.connect(shaper); shaper.connect(g);
        const click = this._env(t, level * (0.25 + p.TONE * 0.5), 0.012); const cn = this._noiseSrc(t, 0.02); const cf = this._filter('bandpass', 1800, 1.5); cn.connect(cf); cf.connect(click);
        break;
      }
      case 'SD': {
        const tone = 0.7 + p.TONE * 0.6;
        [[180 * tone, 0.11, 0.55], [330 * tone, 0.09, 0.4]].forEach(([f, d, a]) => { const g = this._env(t, level * a, d); const o = this._osc('sine', f, t, d); o.connect(g); });
        const nd = 0.08 + p.SNAPPY * 0.25; const ng = this._env(t, level * (0.3 + p.SNAPPY * 0.8), nd);
        const n = this._noiseSrc(t, nd); const hp = this._filter('highpass', 900 + p.TONE * 1200, 0.7); const bp = this._filter('bandpass', 2400 + p.TONE * 2000, 0.8);
        n.connect(hp); hp.connect(bp); bp.connect(ng);
        break;
      }
      case 'LT': case 'MT': case 'HT': case 'LC': case 'MC': case 'HC': {
        const conga = id.endsWith('C');
        const base = { L: conga ? 165 : 80, M: conga ? 250 : 120, H: conga ? 370 : 165 }[id[0]] * (0.7 + p.TUNING * 0.8);
        const d = conga ? 0.22 : 0.45;
        const g = this._env(t, level * 0.95, d);
        const o = this._osc('sine', base, t, d); o.frequency.setValueAtTime(base * (conga ? 1.3 : 1.7), t); o.frequency.exponentialRampToValueAtTime(base, t + (conga ? 0.015 : 0.06));
        o.connect(g);
        if (!conga) { const ng = this._env(t, level * 0.18, 0.08); const n = this._noiseSrc(t, 0.08); const bp = this._filter('bandpass', base * 6, 1); n.connect(bp); bp.connect(ng); }
        break;
      }
      case 'RS': {
        [[1700, 0.025, 0.5], [440, 0.03, 0.7]].forEach(([f, d, a]) => { const g = this._env(t, level * a, d); const o = this._osc('triangle', f, t, d); const bp = this._filter('bandpass', f, 3); o.connect(bp); bp.connect(g); });
        const ng = this._env(t, level * 0.3, 0.012); const n = this._noiseSrc(t, 0.02); const hp = this._filter('highpass', 2500); n.connect(hp); hp.connect(ng);
        break;
      }
      case 'CL': { const g = this._env(t, level * 0.8, 0.045); const o = this._osc('sine', 2500, t, 0.05); const bp = this._filter('bandpass', 2500, 6); o.connect(bp); bp.connect(g); break; }
      case 'CP': {
        const bp = this._filter('bandpass', 1050, 1.1); const hp = this._filter('highpass', 600); bp.connect(hp);
        const n = this._noiseSrc(t, 0.4); n.connect(bp);
        const g = this.ctx.createGain(); hp.connect(g); g.connect(this.master);
        g.gain.setValueAtTime(0, t);
        [0, 0.011, 0.022].forEach((o) => { g.gain.setValueAtTime(level, t + o); g.gain.exponentialRampToValueAtTime(0.05, t + o + 0.01); });
        g.gain.setValueAtTime(level * 0.85, t + 0.033); g.gain.exponentialRampToValueAtTime(0.001, t + 0.033 + 0.22);
        break;
      }
      case 'MA': { const g = this._env(t, level * 0.6, 0.055); g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(level * 0.6, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06); const n = this._noiseSrc(t, 0.07); const hp = this._filter('highpass', 5500); n.connect(hp); hp.connect(g); break; }
      case 'CB': {
        const bp = this._filter('bandpass', 1000, 1.8); const g = this._env(t, level * 0.6, 0.32); bp.connect(g);
        [540, 800].forEach((f) => { const o = this._osc('square', f, t, 0.35); const og = this.ctx.createGain(); og.gain.value = 0.4; o.connect(og); og.connect(bp); });
        const g2 = this._env(t, level * 0.5, 0.03); bp.connect(g2);
        break;
      }
      case 'CY': {
        const d = 0.3 + p.DECAY * 2.2;
        const bank = this._metalBank(t, d);
        const bp = this._filter('bandpass', 3500 + p.TONE * 3500, 0.7); const hp = this._filter('highpass', 6000 + p.TONE * 2000, 0.5);
        bank.connect(bp); bp.connect(hp);
        const g = this._env(t, level * 0.5, d); hp.connect(g);
        const g2 = this._env(t, level * 0.5, d * 0.25); const hp2 = this._filter('highpass', 9000); bank.connect(hp2); hp2.connect(g2);
        break;
      }
      case 'OH': case 'CH': {
        const d = id === 'OH' ? 0.15 + p.DECAY * 0.9 : 0.06;
        if (id === 'CH' && this.openHat) { try { this.openHat.gain.cancelScheduledValues(t); this.openHat.gain.setTargetAtTime(0.0001, t, 0.004); } catch { /* ended */ } }
        const bank = this._metalBank(t, d);
        const hp = this._filter('highpass', 7500, 0.6); const bp = this._filter('bandpass', 10000, 0.6);
        bank.connect(hp); hp.connect(bp);
        const g = this._env(t, level * 0.55, d); bp.connect(g);
        if (id === 'OH') this.openHat = g;
        break;
      }
      default: break;
    }
  }

  _metalBank(t, dur) {
    const sum = this.ctx.createGain(); sum.gain.value = 0.18;
    METAL.forEach((f) => { const o = this._osc('square', f, t, dur); o.connect(sum); });
    return sum;
  }

  // -------------------------------------------------------------- sequencer
  play() { if (!this.started || this.playing) return; this.playing = true; this.step = 0; this.nextTime = this.ctx.currentTime + 0.05; this._timer = setInterval(() => this._schedule(), 25); this._schedule(); }
  stop() { this.playing = false; clearInterval(this._timer); this._timer = null; this.onStep?.(-1); }
  continue() { if (!this.started || this.playing) return; this.playing = true; this.nextTime = this.ctx.currentTime + 0.05; this._timer = setInterval(() => this._schedule(), 25); this._schedule(); }

  _schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextTime < ahead) {
      const step = this.step;
      const accent = !!this.pattern.AC[step];
      LANES.forEach((lane) => {
        if (lane.id === 'AC' || !this.pattern[lane.id][step]) return;
        const voice = this.variants[lane.id] || lane.id;
        this.trigger(voice, this.nextTime, accent || this.pattern[lane.id][step] === 2);
      });
      const when = this.nextTime;
      const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
      setTimeout(() => { if (this.playing) this.onStep?.(step); }, delay);
      this.nextTime += 60 / this.tempo / 4;
      this.step = (this.step + 1) % this.length;
    }
  }
}
