/* M400-style finite tape replay model. Each note strip runs for 8 seconds.
 * This is a procedural approximation, not a recording library. Authentic
 * Streetly tape recordings require licensed source audio and are not fabricated.
 */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DEFAULT = { volume: 0.72, tone: 0.68, pitch: 0, track: 0, frame: 0, release: 0.18 };
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
    this.speed = 1; this.vel = 0; this.age = 0; this.seed = ((Math.random() * 0x7fffffff) | 0) || 1;
    this.env = 0; this.releasing = false; this.phase = Math.random();
    this.flutter = Math.random() * Math.PI * 2; this.filter = 0; this.filterR = 0; this.tuning = 0; this.pan = 0;
    this.noteHz = 0; this.frameIndex = 0; this.trackIndex = 0;
    this.tailL = 0; this.tailR = 0; this.tailLevel = 0; this.tailDecay = 0;

  }
}

class MellotronProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { ...DEFAULT };
    this.voices = Array.from({ length: 35 }, () => new TapeVoice());
    this.bend = 0; this.last = 0; this.master = 0; this.tone = DEFAULT.tone; this.scheduled = [];
    this.port.onmessage = (e) => this.message(e.data);
  }

  message(m) {
    if (m?.t === '__preview_flush') { this.port.postMessage({ t: '__preview_flush_ack', id: m.id }); return; }

    // Honour OMNI's look-ahead timestamps instead of waking notes on receipt.
    if ((m.t === 'noteOn' || m.t === 'noteOff') && Number.isFinite(m.frame) && m.frame > currentFrame) {
      this.scheduled.push(m);
      this.scheduled.sort((a, b) => a.frame - b.frame);
      return;
    }
    this.dispatch(m);
  }
  dispatch(m) {
    if (m.t === 'patch') this.p = { ...DEFAULT, ...m.patch };
    else if (m.t === 'param' && m.key in DEFAULT) this.p[m.key] = m.value;
    else if (m.t === 'noteOn') this.noteOn(m.note | 0, clamp(m.vel, .01, 1));
    else if (m.t === 'noteOff') this.noteOff(m.note | 0);
    else if (m.t === 'bend') this.bend = clamp(m.value, -1, 1);
    else if (m.t === 'volume') this.p.volume = clamp(m.value, 0, 1);
    else if (m.t === 'allOff' || m.t === 'allSoundOff') {
      this.scheduled.length = 0;
      this.voices.forEach((v) => { v.gate = false; v.releasing = true; });
    }
  }

  noteOn(note, vel) {
    let v = this.voices.find((x) => x.active && x.note === note);
    if (!v) v = this.voices.find((x) => !x.active) || this.voices.slice().sort((a, b) => a.age - b.age)[0];

    // Preserve the previous voice's last output as a very short release tail.
    // This prevents repeated notes and voice stealing from resetting a live
    // filter state directly to zero, which can produce an audible click.
    if (v.active) {
      const pan = clamp(v.pan, -.5, .5);
      v.tailL = v.filter * (1 - pan);
      v.tailR = v.filterR * (1 + pan);
      v.tailLevel = 1;
      v.tailDecay = Math.exp(-1 / (sampleRate * 0.012));
    } else if (v.tailLevel > 0.0001) {
      // If the previous note has just entered its tiny de-click tail, carry
      // its current level forward rather than cutting it when the slot is reused.
      v.tailL *= v.tailLevel;
      v.tailR *= v.tailLevel;
      v.tailLevel = 1;
      v.tailDecay = Math.exp(-1 / (sampleRate * 0.012));
    } else {
      v.tailL = 0; v.tailR = 0; v.tailLevel = 0; v.tailDecay = 0;
    }

    v.note = note; v.noteHz = 440 * Math.pow(2, (note - 69) / 12);
    v.frameIndex = Math.round(clamp(this.p.frame, 0, FRAMES.length - 1));
    v.trackIndex = Math.round(clamp(this.p.track, 0, 2));
    v.vel = vel; v.gate = true; v.active = true; v.pos = 0; v.age = ++this.last;
    v.env = 0; v.releasing = false; v.phase = Math.random(); v.flutter = Math.random() * Math.PI * 2;
    v.filter = 0; v.filterR = 0; v.tuning = (Math.random() - .5) * .0016; v.pan = (Math.random() - .5) * .12;
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
    // Smooth tone changes across render quanta so preset and control changes
    // cannot abruptly alter every active voice's filter coefficient.
    const targetTone = clamp(this.p.tone, 0, 1);
    this.tone += (targetTone - this.tone) * (1 - Math.exp(-L.length / (sr * 0.025)));
    // These filter coefficients are shared by every voice and reused for the
    // whole render quantum rather than recalculated inside the voice loop.
    const toneCutoff = 1100 + this.tone * 7900;
    const alpha = 1 - Math.exp(-2 * Math.PI * toneCutoff / sr);
    const stereoAlpha = 1 - Math.exp(-2 * Math.PI * Math.max(500, toneCutoff * .94) / sr);
    const releaseSeconds = Math.max(0.08, Number(this.p.release) || DEFAULT.release);
    const releaseCoeff = Math.exp(-1 / (sr * releaseSeconds));

    for (let i = 0; i < L.length; i += 1) {
      while (this.scheduled.length && this.scheduled[0].frame <= currentFrame + i) this.dispatch(this.scheduled.shift());
      let mixL = 0; let mixR = 0;

      for (let vi = 0; vi < this.voices.length; vi += 1) {
        const v = this.voices[vi];
        // The tiny steal/retrigger tail must overlap the new note as well as
        // inactive voices; otherwise the transition would still be abrupt.
        if (v.tailLevel > 0.0001) {
          mixL += v.tailL * v.tailLevel;
          mixR += v.tailR * v.tailLevel;
          v.tailLevel *= v.tailDecay;
        } else {
          v.tailLevel = 0;
        }
        if (!v.active) continue;

        // A tape note keeps the frame and track it started with. Changing the
        // transport while notes are held cannot swap their spectrum abruptly.
        const sound = FRAMES[v.frameIndex][v.trackIndex];
        const wow = Math.sin(v.pos * .00013 + v.flutter) * .0022 + Math.sin(v.pos * .000037 + v.flutter * .37) * .0031;
        const flutter = Math.sin(v.pos * .0027 + v.flutter) * .00075 + Math.sin(v.pos * .0061 + v.flutter * 1.7) * .00022;
        const speed = Math.max(.25, Math.pow(2, (this.bend * 2) / 12) *
          (1 + clamp(this.p.pitch, -1, 1) * .08 + wow + flutter + v.tuning));
        v.phase += v.noteHz * speed / sr;
        if (v.phase >= 1) v.phase -= Math.floor(v.phase);

        let sample = 0;
        for (let n = 0; n < sound.partials.length; n += 1) {
          const amp = sound.partials[n];
          const partialDrift = Math.sin(v.pos * (.00011 + n * .000017) + v.flutter * (n + 1)) * sound.detune * (n + 1);
          const partialPhase = v.phase * (n + 1) + partialDrift;
          const stereoPhase = Math.sin(2 * Math.PI * (partialPhase + v.pan * (n + 1) * .001));
          sample += amp * (Math.sin(2 * Math.PI * partialPhase + n * .27) * .985 + stereoPhase * .015);
        }

        // Retain the tape's soft mechanical bed, but keep it below the tonal
        // signal so the seeded noise cannot be mistaken for digital crackle.
        const tapeNoise = this.rand(v) * sound.noise * 0.22 * (.35 + .65 * Math.sin(v.pos * .00061) ** 2);
        const attackTime = Math.max(1, sr * sound.attack);
        const attackProgress = clamp(v.pos / attackTime, 0, 1);
        const attack = attackProgress * attackProgress * (3 - 2 * attackProgress);
        const tapeEnd = Math.max(0, 1 - v.pos / (sr * 8));
        if (v.releasing) v.env *= releaseCoeff;
        else v.env += (1 - v.env) * .0018;
        if (v.env < .0001 || tapeEnd <= 0) {
          // Keep the residual one-pole filter state alive for a tiny fade after
          // the tape/envelope stops. Otherwise the last filtered sample can
          // be cut off above zero and produce a click on note release.
          const pan = clamp(v.pan, -.5, .5);
          v.tailL = v.filter * (1 - pan);
          v.tailR = v.filterR * (1 + pan);
          v.tailLevel = 1;
          v.tailDecay = Math.exp(-1 / (sr * 0.012));
          v.active = false;
          continue;
        }

        const raw = (sample * (.2 + sound.body * .17) + tapeNoise) * attack * tapeEnd * v.env * v.vel;
        v.filter += alpha * (raw - v.filter);
        v.filterR += stereoAlpha * ((raw * (1 + v.pan * .14)) - v.filterR);
        const pan = clamp(v.pan, -.5, .5);
        mixL += v.filter * (1 - pan);
        mixR += v.filterR * (1 + pan);
        v.pos += speed;
      }

      this.master += (clamp(this.p.volume, 0, 1) - this.master) * .002;
      L[i] = Math.tanh(mixL * this.master * .72);
      R[i] = Math.tanh(mixR * this.master * .72);
    }
    return true;
  }
}
registerProcessor('mellotron-processor', MellotronProcessor);
