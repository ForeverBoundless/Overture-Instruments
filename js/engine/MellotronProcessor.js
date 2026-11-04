/* M400-style tape replay model.
 * Each held key owns a finite, non-looping tape pass. This is a procedural
 * Each strip plays for approximately eight seconds before reaching its end.\n * This is a procedural approximation, not a recording library: authentic Streetly tape recordings
 * require licensed source audio and are intentionally not fabricated here.
 */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DEFAULT = { volume: 0.72, tone: 0.68, pitch: 0, track: 0, frame: 0 };
const FRAMES = [
  [
    { name: '3 Violins', partials: [1, .72, .43, .25, .13, .07], attack: .22, noise: .035, body: .34, detune: .0018 },
    { name: 'Flute', partials: [1, .16, .035, .012], attack: .075, noise: .018, body: .2, detune: .0005 },
    { name: 'Cello', partials: [1, .48, .27, .16, .09], attack: .28, noise: .025, body: .42, detune: .0012 },
  ],
  [
    { name: '8 Voice Choir', partials: [1, .86, .63, .39, .24, .12], attack: .34, noise: .055, body: .5, detune: .003 },
    { name: 'Male Choir', partials: [1, .58, .38, .24, .11], attack: .3, noise: .04, body: .48, detune: .0022 },
    { name: 'Female Choir', partials: [1, .77, .51, .27, .16], attack: .26, noise: .05, body: .38, detune: .0028 },
  ],
  [
    { name: 'String Section', partials: [1, .75, .48, .28, .16, .09], attack: .25, noise: .045, body: .42, detune: .0024 },
    { name: 'Orchestra', partials: [1, .83, .58, .34, .2, .1], attack: .3, noise: .06, body: .52, detune: .0032 },
    { name: 'Muted Strings', partials: [1, .48, .22, .1, .04], attack: .18, noise: .025, body: .3, detune: .0015 },
  ],
  [
    { name: 'Brass', partials: [1, .88, .66, .42, .24, .13], attack: .13, noise: .07, body: .58, detune: .0018 },
    { name: 'Trombone', partials: [1, .78, .55, .31, .2], attack: .16, noise: .055, body: .56, detune: .0016 },
    { name: 'Tenor Sax', partials: [1, .72, .46, .3, .17, .08], attack: .11, noise: .065, body: .46, detune: .0019 },
  ],
  [
    { name: 'Flute', partials: [1, .16, .035, .012], attack: .075, noise: .018, body: .2, detune: .0005 },
    { name: 'Oboe', partials: [1, .62, .45, .31, .2, .11], attack: .09, noise: .035, body: .43, detune: .001 },
    { name: 'Clarinet', partials: [1, .04, .72, .025, .43, .015], attack: .085, noise: .025, body: .34, detune: .0008 },
  ],
  [
    { name: 'Church Organ', partials: [1, .8, .55, .36, .22, .14, .08], attack: .025, noise: .006, body: .22, detune: .0002 },
    { name: 'Vibraphone', partials: [1, .42, .21, .1, .045], attack: .008, noise: .012, body: .28, detune: .0004 },
    { name: 'Orchestral Bells', partials: [1, .65, .34, .22, .12, .06], attack: .006, noise: .018, body: .35, detune: .0004 },
  ],
];

class TapeVoice {
  constructor() {
    this.note = -1; this.gate = false; this.active = false; this.pos = 0;
    this.speed = 1; this.vel = 0; this.age = 0; this.seed = (Math.random() * 0x7fffffff) | 0;
    this.env = 0; this.releasing = false; this.phase = Math.random();
    this.flutter = Math.random() * Math.PI * 2; this.filter = 0; this.tuning = 0;
  }
}

class MellotronProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { ...DEFAULT };
    this.voices = Array.from({ length: 35 }, () => new TapeVoice());
    this.bend = 0; this.last = 0; this.master = 0;
    this.port.onmessage = (e) => this.message(e.data);
  }

  message(m) {
    if (m.t === 'patch') this.p = { ...DEFAULT, ...m.patch };
    else if (m.t === 'param' && m.key in DEFAULT) this.p[m.key] = m.value;
    else if (m.t === 'noteOn') this.noteOn(m.note | 0, clamp(m.vel, .01, 1));
    else if (m.t === 'noteOff') this.noteOff(m.note | 0);
    else if (m.t === 'bend') this.bend = clamp(m.value, -1, 1);
    else if (m.t === 'volume') this.p.volume = clamp(m.value, 0, 1);
    else if (m.t === 'allOff' || m.t === 'allSoundOff') this.voices.forEach((v) => { v.gate = false; v.releasing = true; });
  }

  noteOn(note, vel) {
    let v = this.voices.find((x) => x.active && x.note === note);
    if (!v) v = this.voices.find((x) => !x.active) || this.voices.slice().sort((a, b) => a.age - b.age)[0];
    v.note = note; v.vel = vel; v.gate = true; v.active = true; v.pos = 0; v.age = ++this.last;
    v.env = 0; v.releasing = false; v.phase = Math.random(); v.flutter = Math.random() * Math.PI * 2;
    v.filter = 0; v.tuning = (Math.random() - .5) * .0016;
  }

  noteOff(note) {
    this.voices.forEach((v) => { if (v.note === note) { v.gate = false; v.releasing = true; } });
  }

  rand(v) {
    let x = v.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; v.seed = x | 0;
    return (x >>> 0) / 4294967296 * 2 - 1;
  }

  process(_inputs, outputs) {
    const out = outputs[0]; const L = out[0]; const R = out[1] || L; const sr = sampleRate;
    for (let i = 0; i < L.length; i += 1) {
      let mix = 0;
      this.voices.forEach((v) => {
        if (!v.active) return;
        const frame = FRAMES[Math.round(clamp(this.p.frame, 0, FRAMES.length - 1))];
        const sound = frame[Math.round(clamp(this.p.track, 0, 2))];
        const noteHz = 440 * Math.pow(2, (v.note - 69) / 12);
        const wow = Math.sin(v.pos * .00017 + v.flutter) * .0018 + Math.sin(v.pos * .000043) * .0035;
        const flutter = Math.sin(v.pos * .0021 + v.flutter) * .0011;
        const speed = Math.max(.25, Math.pow(2, (this.bend * 2) / 12) *
          (1 + clamp(this.p.pitch, -1, 1) * .08 + wow + flutter + v.tuning));
        v.phase += noteHz * speed / sr;
        if (v.phase >= 1) v.phase -= Math.floor(v.phase);
        let sample = 0;
        sound.partials.forEach((amp, n) => {
          const partialDrift = Math.sin(v.pos * (.00011 + n * .000017) + v.flutter * (n + 1)) * sound.detune * (n + 1);
          sample += amp * Math.sin(2 * Math.PI * (v.phase * (n + 1) + partialDrift) + n * .27);
        });
        const tapeNoise = this.rand(v) * sound.noise * (.45 + .55 * Math.sin(v.pos * .00061) ** 2);
        const attack = Math.min(1, v.pos / Math.max(1, sr * sound.attack));
        const tapeEnd = Math.max(0, 1 - v.pos / (sr * 8));
        v.env += (1 - v.env) * .0018;
        if (v.releasing) v.env *= Math.exp(-1 / (sr * .028));
        if (v.env < .0001 || tapeEnd <= 0) { v.active = false; return; }
        const toneCutoff = 900 + this.p.tone * 10500;
        const alpha = 1 - Math.exp(-2 * Math.PI * toneCutoff / sr);
        const raw = (sample * (.15 + sound.body * .12) + tapeNoise) * attack * tapeEnd * v.env * v.vel;
        v.filter += alpha * (raw - v.filter);
        mix += v.filter;
        v.pos += speed;
      });
      this.master += (clamp(this.p.volume, 0, 1) - this.master) * .002;
      const s = Math.tanh(mix * this.master * .9);
      L[i] = s; R[i] = s;
    }
    return true;
  }
}
registerProcessor('mellotron-processor', MellotronProcessor);
