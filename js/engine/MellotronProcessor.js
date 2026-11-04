/* Mellotron M400 tape-replay model.
 * The worklet deliberately uses finite, non-looping tape envelopes. Each key
 * has its own phase and tape position; changing pitch changes tape speed and
 * therefore the remaining playback time, unlike a sustained synth oscillator.
 */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const N = 35;
const DEFAULT = { volume: 0.72, tone: 0.68, pitch: 0, track: 1, frame: 0 };
const FRAME = [
  { name: '3 Violins', partials: [1, .52, .22, .1], attack: .18, noise: .16 },
  { name: 'Flute', partials: [1, .14, .04], attack: .07, noise: .08 },
  { name: '8 Voice Choir', partials: [1, .66, .35, .18, .08], attack: .3, noise: .2 },
  { name: 'Cello', partials: [1, .42, .16, .08], attack: .22, noise: .1 },
];
// Every tape strip is finite: the original M400 gives approximately 8 seconds.

class TapeVoice {
  constructor() {
    this.note = -1; this.gate = false; this.active = false; this.pos = 0;
    this.speed = 1; this.vel = 0; this.age = 0; this.seed = (Math.random() * 0x7fffffff) | 0;
    this.env = 0; this.release = false; this.phase = Math.random(); this.flutter = Math.random() * Math.PI * 2;
  }
}

class MellotronProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { ...DEFAULT };
    this.voices = Array.from({ length: N }, () => new TapeVoice());
    this.bend = 0; this.sustain = false; this.master = 0; this.last = 0;
    this.port.onmessage = (e) => this.message(e.data);
  }

  message(m) {
    if (m.t === 'patch') this.p = { ...DEFAULT, ...m.patch };
    else if (m.t === 'param' && m.key in DEFAULT) this.p[m.key] = m.value;
    else if (m.t === 'noteOn') this.noteOn(m.note | 0, clamp(m.vel, .01, 1));
    else if (m.t === 'noteOff') this.noteOff(m.note | 0);
    else if (m.t === 'bend') this.bend = clamp(m.value, -1, 1);
    else if (m.t === 'volume') this.p.volume = clamp(m.value, 0, 1);
    else if (m.t === 'allOff' || m.t === 'allSoundOff') this.voices.forEach((v) => { v.gate = false; v.active = false; });
  }

  noteOn(note, vel) {
    let v = this.voices.find((x) => x.active && x.note === note);
    if (!v) v = this.voices.find((x) => !x.active) || this.voices.slice().sort((a, b) => a.age - b.age)[0];
    v.note = note; v.vel = vel; v.gate = true; v.active = true; v.pos = 0; v.age = ++this.last;
    v.env = 0; v.release = false; v.phase = Math.random(); v.flutter = Math.random() * Math.PI * 2;
  }

  noteOff(note) {
    this.voices.forEach((v) => { if (v.note === note) { v.gate = false; v.release = true; } });
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
        const ratio = Math.pow(2, (v.note - 60 + this.bend * 2) / 12);
        const wow = Math.sin(v.pos * .00017 + v.flutter) * .002 + Math.sin(v.pos * .000041) * .004;
        const flutter = Math.sin(v.pos * .0023 + v.flutter) * .0012;
        const speed = ratio * (1 + clamp(this.p.pitch, -1, 1) * .15 + wow + flutter);
        const frame = FRAME[Math.round(clamp(this.p.frame, 0, FRAME.length - 1))];
        const track = clamp(this.p.track, 0, 4);
        const trackMix = track === 0 ? [1, 0] : track === 1 ? [.5, .5] : track === 2 ? [0, 1] : track === 3 ? [.5, 0] : [0, .5];
        const base = 55 * Math.pow(2, (v.note - 31) / 12);
        v.phase += base * speed / sr;
        if (v.phase >= 1) v.phase -= 1;
        const phase = v.phase;
        let sample = 0;
        frame.partials.forEach((amp, n) => { sample += amp * Math.sin(2 * Math.PI * phase * (n + 1) + n * .31 + wow * (n + 1) * 2); });
        const tapeNoise = this.rand(v) * frame.noise * (.25 + .75 * Math.sin(v.pos * .0007) ** 2);
        const attack = Math.min(1, v.pos / (sr * frame.attack));
        const tail = Math.max(0, 1 - v.pos / (sr * 8));
        const trackColor = trackMix[0] * (1 + .08 * Math.sin(v.pos * .0003)) + trackMix[1] * (1 + .06 * Math.cos(v.pos * .00023));
        const tone = .45 + this.p.tone * .55;
        v.env += ((v.release ? 0 : 1) - v.env) * (v.release ? .00055 : .0025);
        if (v.release && v.env < .0001) v.active = false;
        sample = (sample * .2 * tone + tapeNoise * (1 - this.p.tone * .35)) * attack * tail * v.env * v.vel * trackColor;
        mix += sample;
        v.pos += speed;
        if (v.pos >= sr * 8) v.active = false;
      });
      this.master += (this.p.volume - this.master) * .002;
      const s = Math.tanh(mix * this.master * .9);
      L[i] = s; R[i] = s;
    }
    return true;
  }
}
registerProcessor('mellotron-processor', MellotronProcessor);
