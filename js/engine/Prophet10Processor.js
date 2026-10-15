/*
 * Prophet10Processor.js — AudioWorklet DSP for the Prophet-10 emulation.
 *
 * Everything that has to be sample accurate lives here: voice allocation,
 * oscillators, Poly-Mod, filters, envelopes, the global LFO/Wheel-Mod system
 * and the output stage. The main thread only sends programs (raw 0-127
 * hardware parameter values, NRPN order) and performance events.
 *
 * Signal path per voice (run at 2x oversampling, decimated once on the mix):
 *   Osc A (saw + pulse, hard-syncable to B, exponential FM from B / filter EG)
 *   Osc B (saw + triangle + pulse, audio or low-frequency, keyboard on/off)
 *   white noise -> mixer -> 4-pole resonant low-pass (Rev 3 CEM3320 or
 *   Rev 1/2 SSM2140 model) -> VCA (amp ADSR) -> mono sum
 *
 * Calibration notes (see the emulator README section in prophet10.js):
 *   - Oscillator frequency: 2 values per semitone, 4-octave range (0-96),
 *     value 48 = 8' (the original patch sheets' "up 2 octaves").
 *   - Envelope times: ~1 ms .. ~30 s, setting 5 ~ 0.5 s (Prophet-5 manual).
 *   - LFO: 0.022 Hz .. 500 Hz, value 92 ~ 5 Hz (original Brass vibrato).
 *   - Osc B lo-freq: 0.4 .. 30 Hz with keyboard off; keyboard-tracking
 *     lo-freq runs seven octaves below audio pitch.
 */

/* global sampleRate, registerProcessor, AudioWorkletProcessor */

const OS = 2; // oversampling factor
const NUM_VOICES = 10;

// Raw parameter indices (Prophet-5/10 NRPN order; 65 = pitch wheel range, 66 = key mode).
const P = {
  A_FREQ: 0, B_FREQ: 1, B_FINE: 2, A_SAW: 3, A_SQR: 4, B_SAW: 5, B_TRI: 6, B_SQR: 7,
  A_PW: 8, B_PW: 9, SYNC: 10, B_LO: 11, B_KBD: 12, GLIDE: 13, MIX_A: 14, MIX_B: 15,
  MIX_N: 16, CUTOFF: 17, RES: 18, KTRACK: 19, REV: 20, LFO_FREQ: 21, LFO_AMT: 22,
  LFO_SAW: 23, LFO_TRI: 24, LFO_SQR: 25, SRC_MIX: 26, WM_FA: 27, WM_FB: 28, WM_PWA: 29,
  WM_PWB: 30, WM_FILT: 31, PM_ENV: 32, PM_OSCB: 33, PM_FA: 34, PM_PWA: 35, PM_FILT: 36,
  VINTAGE: 37, AT_FILT: 38, AT_LFO: 39, ENV_AMT: 40, VEL_FILT: 41, VEL_AMP: 42,
  F_A: 43, A_A: 44, F_D: 45, A_D: 46, F_S: 47, A_S: 48, F_R: 49, A_R: 50, REL: 51,
  UNI: 52, UNI_V: 53, UNI_DET: 54, CHORD0: 55, PBR: 65, KEYMODE: 66,
};
const RAW_LENGTH = 67;

// ---------------------------------------------------------------------------
// Fast math
// ---------------------------------------------------------------------------
const POW2_INT = new Float64Array(257);
for (let i = 0; i <= 256; i += 1) POW2_INT[i] = Math.pow(2, i - 128);
function exp2(x) {
  if (x > 127) x = 127; else if (x < -127) x = -127;
  const xi = Math.floor(x);
  const f = x - xi;
  const p = 1 + f * (0.6931471806 + f * (0.2402265070 + f * (0.0555041087 + f * (0.0096181291
    + f * (0.0013333558 + f * (0.0001540353 + f * 0.0000152527))))));
  return p * POW2_INT[xi + 128];
}
function sat(x) {
  // Smooth tanh-like saturator; exact unity slope at 0, hard limit +-1 past |x| = 3.
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------
// Hardware value curves (raw 0..127 -> physical units)
// ---------------------------------------------------------------------------
function envTime(v) {
  const x = v / 12.7; // panel 0..10
  return Math.pow(10, -3 + 0.6319 * x - 0.01842 * x * x); // 1 ms .. ~30 s, "5" ~ 0.5 s
}
function lfoHz(v) {
  const over = Math.max(0, v - 92);
  return 0.022 * Math.pow(10, 0.025615 * v + 0.0009 * over * over); // 0.022 Hz .. 500 Hz
}
function glideTime(v) {
  return v <= 0 ? 0 : 0.15 * Math.pow(10, (v - 61) * 0.02417); // ~5 ms .. ~6 s
}
function resonanceK(v) {
  // Self-oscillation sets in around panel 7.5 (raw ~95), as on the original.
  if (v <= 95) return 4.0 * Math.pow(v / 95, 1.15);
  return 4.0 + 0.95 * ((v - 95) / 32);
}
const UNISON_DETUNE_CENTS = [0, 2.5, 5, 8, 12, 17, 23, 30];
const KT = [0, 0.5, 1];

// Seeded RNG so every voice keeps its own repeatable "component tolerances".
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Layer: one program's derived parameters plus its global LFO / noise
// ---------------------------------------------------------------------------
class Layer {
  constructor(index, sr) {
    this.index = index;
    this.sr = sr;
    this.raw = new Float64Array(RAW_LENGTH);
    this.extras = { velAmount: 127, atAmount: 127, qComp: 0, polyUnison: false };
    this.version = 0;
    this.lfoPhase = 0;
    this.lfoOut = 0;
    this.pink = [0, 0, 0];
    this.noiseSeed = 0x9e3779b9 ^ (index * 7919);
    this.volume = 1;
    // modulation outputs (per base sample)
    this.mFreqA = 0; this.mFreqB = 0; this.mPWA = 0; this.mPWB = 0; this.mFilt = 0;
    this.heldNotes = []; // [{note, vel, order}]
    this.order = 0;
    this.monoNote = -1;
    this.monoActive = false;
    this.lastPitch = null; // last pitch played on this layer (glide origin for fresh voices)
    this.derive();
  }

  setRaw(values, extras) {
    for (let i = 0; i < RAW_LENGTH; i += 1) this.raw[i] = clamp(Number(values[i]) || 0, 0, 127);
    if (extras) Object.assign(this.extras, extras);
    this.derive();
  }

  setParam(index, value) {
    if (index < 0 || index >= RAW_LENGTH) return;
    this.raw[index] = clamp(Number(value) || 0, 0, 127);
    this.derive();
  }

  derive() {
    const r = this.raw;
    const sr = this.sr;
    this.aSemi = Math.min(48, Math.floor(r[P.A_FREQ] / 2)) - 24;
    this.bSemi = Math.min(48, Math.floor(r[P.B_FREQ] / 2)) - 24;
    this.bKbd = r[P.B_KBD] >= 1;
    this.bLo = r[P.B_LO] >= 1;
    this.bFixedNote = 12 + r[P.B_FREQ] * (108 / 127); // keyboard off: 9-octave range from C0
    this.bLoFixedHz = 0.4 * Math.pow(75, r[P.B_FREQ] / 127); // lo freq, keyboard off: 0.4..30 Hz
    this.bFine = r[P.B_FINE] * 0.75 / 100; // semitones, up to ~0.95
    this.aSaw = r[P.A_SAW] >= 1 ? 1 : 0;
    this.aSqr = r[P.A_SQR] >= 1 ? 1 : 0;
    this.bSaw = r[P.B_SAW] >= 1 ? 1 : 0;
    this.bTri = r[P.B_TRI] >= 1 ? 1 : 0;
    this.bSqr = r[P.B_SQR] >= 1 ? 1 : 0;
    this.aDuty = 0.01 + 0.98 * r[P.A_PW] / 127;
    this.bDuty = 0.01 + 0.98 * r[P.B_PW] / 127;
    this.sync = r[P.SYNC] >= 1;
    const gt = glideTime(r[P.GLIDE]);
    this.glideCoef = gt <= 0 ? 1 : 1 - Math.exp(-1 / (sr * gt / 4));
    this.mixA = r[P.MIX_A] / 127;
    this.mixB = r[P.MIX_B] / 127;
    this.mixN = (r[P.MIX_N] / 127) * 0.85;
    this.cutoffSemi = r[P.CUTOFF] * (120 / 127);
    this.ssm = r[P.REV] >= 1; // 1 = Rev 1/2 (SSI 2140), 0 = Rev 3 (CEM 3320)
    this.k = resonanceK(r[P.RES]) * (this.ssm ? 1.04 : 1);
    this.kt = KT[clamp(Math.round(r[P.KTRACK]), 0, 2)];
    this.lfoInc = lfoHz(r[P.LFO_FREQ]) / sr;
    this.lfoAmt = r[P.LFO_AMT] / 127;
    this.lfoSaw = r[P.LFO_SAW] >= 1;
    this.lfoTri = r[P.LFO_TRI] >= 1;
    this.lfoSqr = r[P.LFO_SQR] >= 1;
    this.srcMix = r[P.SRC_MIX] / 127;
    this.wmFA = r[P.WM_FA] >= 1; this.wmFB = r[P.WM_FB] >= 1;
    this.wmPWA = r[P.WM_PWA] >= 1; this.wmPWB = r[P.WM_PWB] >= 1; this.wmFilt = r[P.WM_FILT] >= 1;
    this.pmEnv = r[P.PM_ENV] / 127;
    this.pmOscB = r[P.PM_OSCB] / 127;
    this.pmFA = r[P.PM_FA] >= 1; this.pmPWA = r[P.PM_PWA] >= 1; this.pmFilt = r[P.PM_FILT] >= 1;
    this.vintage = r[P.VINTAGE] / 127; // 0 = "4" (stable) .. 1 = "1" (Rev 1)
    this.atFilt = r[P.AT_FILT] >= 1;
    this.atLfo = r[P.AT_LFO] >= 1;
    this.envAmt = r[P.ENV_AMT] / 127;
    this.velFilt = r[P.VEL_FILT] >= 1;
    this.velAmp = r[P.VEL_AMP] >= 1;
    this.tFA = envTime(r[P.F_A]); this.tAA = envTime(r[P.A_A]);
    this.tFD = envTime(r[P.F_D]); this.tAD = envTime(r[P.A_D]);
    this.fS = r[P.F_S] / 127; this.aS = r[P.A_S] / 127;
    this.tFR = envTime(r[P.F_R]); this.tAR = envTime(r[P.A_R]);
    this.releaseOn = r[P.REL] >= 1;
    this.unison = r[P.UNI] >= 1;
    this.uniVoicesRaw = Math.round(r[P.UNI_V]);
    this.uniDetune = UNISON_DETUNE_CENTS[clamp(Math.round(r[P.UNI_DET]), 0, 7)];
    const chord = [];
    for (let i = 0; i < 10; i += 1) {
      const v = r[P.CHORD0 + i];
      if (v < 127) chord.push(v);
    }
    this.chord = chord;
    this.pbr = clamp(Math.round(r[P.PBR]), 0, 11) + 1;
    this.keyMode = clamp(Math.round(r[P.KEYMODE]), 0, 5);
    this.velAmount = clamp(this.extras.velAmount, 0, 127) / 127;
    this.atAmount = clamp(this.extras.atAmount, 0, 127) / 127;
    this.qComp = clamp(this.extras.qComp, 0, 7) / 7;
    this.polyUnison = !!this.extras.polyUnison;
    this.version += 1;
  }

  /** Global LFO + pink noise -> Wheel-Mod destinations (run once per base sample). */
  tickMod(modWheel, aftertouch) {
    this.lfoPhase += this.lfoInc;
    if (this.lfoPhase >= 1) this.lfoPhase -= Math.floor(this.lfoPhase);
    const ph = this.lfoPhase;
    // Saw and square are positive-only; triangle is bipolar (Prophet-5 manual).
    let lfo = 0;
    if (this.lfoSaw) lfo += ph;
    if (this.lfoTri) lfo += ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    if (this.lfoSqr) lfo += ph < 0.5 ? 1 : 0;
    // Pink noise (Paul Kellet's economy filter); the original Wheel-Mod uses pink noise.
    let s = this.noiseSeed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.noiseSeed = s >>> 0;
    const w = (this.noiseSeed / 4294967296) * 2 - 1;
    const pk = this.pink;
    pk[0] = 0.99765 * pk[0] + w * 0.0990460;
    pk[1] = 0.96300 * pk[1] + w * 0.2965164;
    pk[2] = 0.57000 * pk[2] + w * 1.0526913;
    const pink = (pk[0] + pk[1] + pk[2] + w * 0.1848) * 0.22;
    const src = lfo * (1 - this.srcMix) + pink * this.srcMix;
    const amount = clamp(this.lfoAmt + modWheel + (this.atLfo ? aftertouch * this.atAmount : 0), 0, 1);
    const depth = amount * amount * src;
    this.mFreqA = this.wmFA ? depth * 12 : 0;
    this.mFreqB = this.wmFB ? depth * 12 : 0;
    this.mPWA = this.wmPWA ? depth * 0.48 : 0;
    this.mPWB = this.wmPWB ? depth * 0.48 : 0;
    this.mFilt = this.wmFilt ? depth * 60 : 0;
  }
}

// ---------------------------------------------------------------------------
// Envelope generator (Curtis RC curves, or SSM near-linear curves)
// ---------------------------------------------------------------------------
const STAGE_IDLE = 0, STAGE_ATTACK = 1, STAGE_DECAY = 2, STAGE_SUSTAIN = 3, STAGE_RELEASE = 4;
class Envelope {
  constructor() {
    this.stage = STAGE_IDLE;
    this.level = 0;
    this.relTarget = 0;
    this.aCoef = 0; this.aInc = 0; this.dCoef = 0; this.rCoef = 0;
    this.ssm = false;
    this.sustain = 0;
  }

  configure(sr, tA, tD, s, tR, scale, ssm) {
    const dt = 1 / sr;
    this.ssm = ssm;
    this.sustain = s;
    const a = Math.max(0.0005, tA * scale);
    const d = Math.max(0.001, tD * scale);
    const r = Math.max(0.001, tR * scale);
    if (ssm) {
      this.aInc = dt / a; // linear attack
      this.dCoef = Math.exp(-dt / (d / Math.log(5))); // truncated exponential, lands at the target
      this.rCoef = Math.exp(-dt / (r / Math.log(5)));
    } else {
      this.aCoef = 1 - Math.exp(-dt / (a / Math.log(3))); // RC charge toward 1.5, stops at 1
      this.dCoef = Math.exp(-dt / (d / 4.6));
      this.rCoef = Math.exp(-dt / (r / 4.6));
    }
  }

  gateOn() { this.stage = STAGE_ATTACK; }

  gateOff() {
    if (this.stage === STAGE_IDLE) return;
    this.stage = STAGE_RELEASE;
    this.relTarget = -0.25 * this.level;
  }

  tick() {
    switch (this.stage) {
      case STAGE_ATTACK:
        if (this.ssm) this.level += this.aInc;
        else this.level += (1.5 - this.level) * this.aCoef;
        if (this.level >= 1) { this.level = 1; this.stage = STAGE_DECAY; }
        break;
      case STAGE_DECAY:
        if (this.ssm) {
          const target = this.sustain - 0.25 * (1 - this.sustain);
          this.level = target + (this.level - target) * this.dCoef;
          if (this.level <= this.sustain) { this.level = this.sustain; this.stage = STAGE_SUSTAIN; }
        } else {
          this.level = this.sustain + (this.level - this.sustain) * this.dCoef;
        }
        break;
      case STAGE_SUSTAIN:
        this.level += (this.sustain - this.level) * 0.002;
        break;
      case STAGE_RELEASE:
        if (this.ssm) {
          this.level = this.relTarget + (this.level - this.relTarget) * this.rCoef;
          if (this.level <= 0) { this.level = 0; this.stage = STAGE_IDLE; }
        } else {
          this.level *= this.rCoef;
          if (this.level < 1e-5) { this.level = 0; this.stage = STAGE_IDLE; }
        }
        break;
      default:
        break;
    }
    return this.level;
  }
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------
class Voice {
  constructor(index, sr) {
    this.index = index;
    this.sr = sr;
    this.fsOS = sr * OS;
    this.layer = 0;
    this.note = -1;
    this.keyNote = -1; // the key that owns this voice (unison/chord voices share it)
    this.gate = false;
    this.order = 0; // allocation age
    this.releaseOrder = 0;
    this.pitch = 60; // current (glided) tuned pitch, semitones (MIDI scale)
    this.target = 60;
    this.trackNote = 60;
    this.velocity = 1;
    this.unisonCents = 0;
    this.envF = new Envelope();
    this.envA = new Envelope();
    this.cfgVersion = -1;
    this.cfgRelease = -1;
    // oscillators
    this.phA = Math.random(); this.phB = Math.random();
    this.prevA = 0; this.prevB = 0;
    this.lastB = 0;
    // filter state
    this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0;
    this.noise = (0x2545f491 ^ ((index + 1) * 2654435761)) >>> 0;
    // "component tolerances" (scaled by the Vintage knob)
    const rng = mulberry32(0xa511e9b3 ^ (index * 0x9e3779b1));
    this.tolA = rng() * 2 - 1;
    this.tolB = rng() * 2 - 1;
    this.tolCut = rng() * 2 - 1;
    this.tolEnvF = rng() * 2 - 1;
    this.tolEnvA = rng() * 2 - 1;
    this.tolGain = rng() * 2 - 1;
    this.tolRes = rng() * 2 - 1;
    this.driftA = 0; this.driftB = 0;
    this.dA1 = 0; this.dA2 = 0; this.dB1 = 0; this.dB2 = 0;
    this.driftCount = index & 15;
    this.noteJitter = 0;
    this.hasPlayed = false;
    this.rng = rng;
  }

  get active() {
    return this.envA.stage !== STAGE_IDLE;
  }

  /** Re-roll tolerances (TUNE re-calibrates, so voices settle somewhere new). */
  recalibrate() {
    const rng = this.rng;
    this.tolA = rng() * 2 - 1; this.tolB = rng() * 2 - 1; this.tolCut = rng() * 2 - 1;
    this.tolEnvF = rng() * 2 - 1; this.tolEnvA = rng() * 2 - 1; this.tolGain = rng() * 2 - 1;
    this.tolRes = rng() * 2 - 1;
    this.dA1 = 0; this.dA2 = 0; this.dB1 = 0; this.dB2 = 0;
  }
}

// ---------------------------------------------------------------------------
// Half-band style FIR for 2x -> 1x decimation (windowed sinc, Blackman-Harris)
// ---------------------------------------------------------------------------
function designDecimator(taps, cutoff) {
  const h = new Float64Array(taps);
  const m = taps - 1;
  let sum = 0;
  for (let n = 0; n < taps; n += 1) {
    const x = n - m / 2;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const w = 0.35875 - 0.48829 * Math.cos((2 * Math.PI * n) / m) + 0.14128 * Math.cos((4 * Math.PI * n) / m)
      - 0.01168 * Math.cos((6 * Math.PI * n) / m);
    h[n] = sinc * w;
    sum += h[n];
  }
  for (let n = 0; n < taps; n += 1) h[n] /= sum;
  return h;
}

// ---------------------------------------------------------------------------
// The processor
// ---------------------------------------------------------------------------
class Prophet10Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.fsOS = sampleRate * OS;
    this.layers = [new Layer(0, sampleRate), new Layer(1, sampleRate)];
    this.voices = Array.from({ length: NUM_VOICES }, (_, i) => new Voice(i, sampleRate));
    this.mode = 'normal'; // 'normal' | 'stack' | 'split'
    this.splitPoint = 60;
    this.fiveVoice = false;
    this.roundRobin = false;
    this.rrNext = [0, 0];
    this.releaseMode = 'hold'; // global: 'rel' (classic Prophet-5) | 'hold'
    this.qCompMode = 'vin'; // 'vin' | 'prg'
    this.sustain = false;
    this.bend = 0;
    this.modWheel = 0;
    this.aftertouch = 0;
    this.brightness = 0; // CC74, cutoff units
    this.filterPedal = 0; // CC4
    this.expression = 1; // CC11 / amp pedal
    this.midiVolume = 1; // CC7
    this.masterVolume = 0.5;
    this.masterGain = 0;
    this.masterTuneSemi = 0;
    this.transpose = 0;
    this.tuning = null; // Float64Array(128) of Hz, or null for 12-TET
    this.order = 0;
    this.a440 = false;
    this.a440Level = 0;
    this.a440Phase = 0;
    this.mute = false;
    this.muteGain = 1;
    this.dcX = 0; this.dcY = 0;
    this.dcCoef = 1 - (2 * Math.PI * 8) / sampleRate;
    // Drift noise: two one-pole low-passes at 0.25 Hz run every 16 samples;
    // K normalises the cascade's output to unit standard deviation.
    this.driftA16 = (2 * Math.PI * 0.25 * 16) / sampleRate;
    this.driftK = 2 / (0.5774 * Math.sqrt(this.driftA16));
    this.decim = designDecimator(63, 0.23);
    this.osBuf = new Float64Array(63 + 256 * OS);
    this.osLen = 63;
    this.port.onmessage = (event) => this._onMessage(event.data);
    this._activity = 0;
  }

  // ------------------------------------------------------------- messages
  _onMessage(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'program': {
        const layer = this.layers[m.layer === 1 ? 1 : 0];
        layer.setRaw(m.values, m.extras);
        break;
      }
      case 'param':
        this.layers[m.layer === 1 ? 1 : 0].setParam(m.index, m.value);
        if (m.index === P.UNI || m.index === P.UNI_V || m.index === P.KEYMODE) this._resetLayerVoices(m.layer === 1 ? 1 : 0);
        break;
      case 'extras':
        Object.assign(this.layers[m.layer === 1 ? 1 : 0].extras, m.extras);
        this.layers[m.layer === 1 ? 1 : 0].derive();
        break;
      case 'mode':
        if (m.mode !== this.mode) this._allVoicesOff();
        this.mode = m.mode === 'stack' || m.mode === 'split' ? m.mode : 'normal';
        if (typeof m.splitPoint === 'number') this.splitPoint = clamp(Math.round(m.splitPoint), 0, 127);
        if (Array.isArray(m.volumes)) { this.layers[0].volume = clamp(m.volumes[0], 0, 1); this.layers[1].volume = clamp(m.volumes[1], 0, 1); }
        break;
      case 'globals':
        if (m.releaseMode === 'rel' || m.releaseMode === 'hold') this.releaseMode = m.releaseMode;
        if (typeof m.fiveVoice === 'boolean') { if (m.fiveVoice !== this.fiveVoice) this._allVoicesOff(); this.fiveVoice = m.fiveVoice; }
        if (typeof m.roundRobin === 'boolean') this.roundRobin = m.roundRobin;
        if (m.qCompMode === 'vin' || m.qCompMode === 'prg') this.qCompMode = m.qCompMode;
        break;
      case 'noteOn': this._noteOn(m.note | 0, clamp(Number(m.vel), 0, 1)); break;
      case 'noteOff': this._noteOff(m.note | 0); break;
      case 'bend': this.bend = clamp(Number(m.value) || 0, -1, 1); break;
      case 'mod': this.modWheel = clamp(Number(m.value) || 0, 0, 1); break;
      case 'at': this.aftertouch = clamp(Number(m.value) || 0, 0, 1); break;
      case 'sustain': this._setSustain(!!m.down); break;
      case 'brightness': this.brightness = clamp(Number(m.value) || 0, 0, 1) * 120; break;
      case 'filterPedal': this.filterPedal = clamp(Number(m.value) || 0, 0, 1) * 72; break;
      case 'expression': this.expression = clamp(Number(m.value), 0, 1); break;
      case 'midiVolume': this.midiVolume = clamp(Number(m.value), 0, 1); break;
      case 'volume': this.masterVolume = clamp(Number(m.value), 0, 1); break;
      case 'masterTune': this.masterTuneSemi = clamp(Number(m.cents) || 0, -100, 100) / 100; break;
      case 'transpose': this.transpose = clamp(Math.round(m.semis) || 0, -12, 12); break;
      case 'tuning': this.tuning = m.table ? Float64Array.from(m.table) : null; break;
      case 'a440': this.a440 = !!m.on; break;
      case 'mute': this.mute = !!m.on; break;
      case 'calibrate': this.voices.forEach((v) => v.recalibrate()); break;
      case 'allNotesOff': this._allNotesOff(); break;
      case 'allSoundOff': this._allVoicesOff(true); break;
      default: break;
    }
  }

  // ------------------------------------------------------- voice management
  _pool(layerIndex) {
    const limit = this.fiveVoice ? 5 : NUM_VOICES;
    if (this.mode === 'normal') return limit === NUM_VOICES ? this.voices : this.voices.slice(0, 5);
    // Bi-timbral: each layer owns half the voices (Prophet-10 OS 2.0).
    const half = limit === NUM_VOICES ? 5 : 3;
    const start = layerIndex === 0 ? 0 : 5;
    return this.voices.slice(start, start + half);
  }

  _layersForNote(note) {
    if (this.mode === 'stack') return [0, 1];
    if (this.mode === 'split') return [note < this.splitPoint ? 0 : 1];
    return [0];
  }

  _tunedPitch(note) {
    const n = clamp(note + this.transpose, 0, 127);
    if (this.tuning) {
      const hz = this.tuning[n];
      if (hz > 0) return 69 + 12 * Math.log2(hz / 440);
    }
    return n;
  }

  _noteOn(note, vel) {
    if (note < 0 || note > 127) return;
    if (vel <= 0) { this._noteOff(note); return; }
    for (const li of this._layersForNote(note)) {
      const layer = this.layers[li];
      layer.heldNotes = layer.heldNotes.filter((h) => h.note !== note);
      layer.heldNotes.push({ note, vel, order: ++layer.order, released: false });
      if (layer.unison) this._monoUpdate(li, true, note, vel);
      else this._polyNoteOn(li, note, vel);
    }
  }

  _noteOff(note) {
    for (let li = 0; li < 2; li += 1) {
      const layer = this.layers[li];
      const held = layer.heldNotes.find((h) => h.note === note && !h.released);
      if (!held) continue;
      if (this.sustain && this.releaseMode === 'hold') {
        held.released = true; // held by the pedal until it lifts
        continue;
      }
      layer.heldNotes = layer.heldNotes.filter((h) => h !== held);
      if (layer.unison) this._monoUpdate(li, false, note, 0);
      else this._releaseKey(li, note);
    }
  }

  _setSustain(down) {
    this.sustain = down;
    if (down || this.releaseMode !== 'hold') return;
    for (let li = 0; li < 2; li += 1) {
      const layer = this.layers[li];
      const released = layer.heldNotes.filter((h) => h.released);
      layer.heldNotes = layer.heldNotes.filter((h) => !h.released);
      released.forEach((h) => {
        if (layer.unison) this._monoUpdate(li, false, h.note, 0);
        else this._releaseKey(li, h.note);
      });
    }
  }

  _releaseKey(li, keyNote) {
    for (const v of this.voices) {
      if (v.layer === li && v.gate && v.keyNote === keyNote) this._gateOff(v);
    }
  }

  _polyNoteOn(li, note, vel) {
    const layer = this.layers[li];
    const pool = this._pool(li);
    const perNote = layer.polyUnison ? 2 : 1;
    const chosen = [];
    // Repeated strikes of the same key retrigger the same voice(s).
    for (const v of pool) if (v.layer === li && v.keyNote === note && v.active && chosen.length < perNote) chosen.push(v);
    while (chosen.length < perNote) {
      const v = this._allocate(li, pool, chosen);
      if (!v) break;
      chosen.push(v);
    }
    chosen.forEach((v, i) => {
      const spread = perNote > 1 ? (i === 0 ? -1 : 1) * Math.max(layer.uniDetune, 3) * 0.5 : 0;
      this._startVoice(v, li, note, note, vel, spread, false);
    });
  }

  _allocate(li, pool, exclude) {
    const candidates = pool.filter((v) => !exclude.includes(v));
    if (!candidates.length) return null;
    const free = candidates.filter((v) => !v.gate);
    if (this.roundRobin) {
      // Voices are used strictly in turn (OS 2.0 round-robin allocation).
      const n = pool.length;
      for (let k = 0; k < n; k += 1) {
        const v = pool[(this.rrNext[li] + k) % n];
        if (!exclude.includes(v) && (!v.gate || free.length === 0)) {
          this.rrNext[li] = (pool.indexOf(v) + 1) % n;
          return v;
        }
      }
    }
    if (free.length) {
      // Prefer silent voices, then the one released longest ago.
      free.sort((a, b) => (a.active === b.active ? a.releaseOrder - b.releaseOrder : a.active ? 1 : -1));
      return free[0];
    }
    // All voices busy: last-note priority steals the oldest note.
    candidates.sort((a, b) => a.order - b.order);
    return candidates[0];
  }

  _startVoice(v, li, keyNote, note, vel, cents, legato) {
    const layer = this.layers[li];
    const changedLayer = v.layer !== li;
    v.layer = li;
    v.keyNote = keyNote;
    v.note = note;
    v.velocity = vel;
    v.unisonCents = cents;
    v.order = ++this.order;
    const target = this._tunedPitch(note);
    v.target = target;
    // Glide works per voice from that voice's previous pitch; a voice that has
    // not played yet starts from the last pitch played on this layer.
    if (changedLayer || layer.glideCoef >= 1) v.pitch = target;
    else if (!v.hasPlayed) v.pitch = layer.lastPitch ?? target;
    v.hasPlayed = true;
    layer.lastPitch = target;
    v.noteJitter = (Math.random() * 2 - 1) * layer.vintage * 0.04; // per-note analog jitter, semitones
    v.gate = true;
    if (!legato) {
      this._configureVoice(v, layer, true);
      v.envF.gateOn();
      v.envA.gateOn();
    }
  }

  _gateOff(v) {
    v.gate = false;
    v.releaseOrder = ++this.order;
    this._configureVoice(v, this.layers[v.layer], true);
    v.envF.gateOff();
    v.envA.gateOff();
  }

  _releaseTimes(layer) {
    // Release switch off = fast release, unless the classic footswitch (rEL mode) is held.
    const programmed = layer.releaseOn || (this.releaseMode === 'rel' && this.sustain);
    return programmed ? [layer.tFR, layer.tAR] : [0.015, 0.015];
  }

  _configureVoice(v, layer, force) {
    const relKey = (layer.releaseOn ? 1 : 0) + (this.sustain ? 2 : 0) + (this.releaseMode === 'rel' ? 4 : 0);
    if (!force && v.cfgVersion === layer.version && v.cfgRelease === relKey) return;
    v.cfgVersion = layer.version;
    v.cfgRelease = relKey;
    const va = layer.vintage;
    const scaleF = 1 + v.tolEnvF * (0.01 + 0.16 * va);
    const scaleA = 1 + v.tolEnvA * (0.01 + 0.16 * va);
    const [tFR, tAR] = this._releaseTimes(layer);
    v.envF.configure(this.sr, layer.tFA, layer.tFD, layer.fS, tFR, scaleF, layer.ssm);
    v.envA.configure(this.sr, layer.tAA, layer.tAD, layer.aS, tAR, scaleA, false);
  }

  /** Unison / chord-memory key handling with the Prophet's key priority modes. */
  _monoUpdate(li, isOn, note, vel) {
    const layer = this.layers[li];
    const held = layer.heldNotes;
    const mode = layer.keyMode; // 0 LO, 1 LOr, 2 LAS, 3 LAr, 4 HI, 5 HIr
    const retrig = mode === 1 || mode === 3 || mode === 5;
    let pick = null;
    for (const h of held) {
      if (!pick) { pick = h; continue; }
      if (mode <= 1 && h.note < pick.note) pick = h;
      else if ((mode === 2 || mode === 3) && h.order > pick.order) pick = h;
      else if (mode >= 4 && h.note > pick.note) pick = h;
    }
    const pool = this._pool(li);
    if (!pick) {
      pool.forEach((v) => { if (v.layer === li && v.gate) this._gateOff(v); });
      layer.monoNote = -1;
      layer.monoActive = false;
      return;
    }
    const changed = pick.note !== layer.monoNote;
    if (!changed && layer.monoActive && !(isOn && retrig && note === pick.note)) return;
    // Legato (no retrigger) unless a retrigger mode is selected or this is the first key.
    const legato = layer.monoActive && !(retrig && isOn);
    const useVel = isOn ? vel : pick.vel;
    layer.monoNote = pick.note;
    layer.monoActive = true;
    const chordMode = layer.uniVoicesRaw >= 10;
    const notes = [];
    if (chordMode) {
      const chord = layer.chord.length ? layer.chord : [0];
      chord.slice(0, pool.length).forEach((interval) => notes.push(pick.note + interval));
    } else {
      const count = clamp(layer.uniVoicesRaw + 1, 1, pool.length);
      for (let i = 0; i < count; i += 1) notes.push(pick.note);
    }
    const count = notes.length;
    pool.forEach((v, i) => {
      if (i >= count) {
        if (v.layer === li && v.gate) this._gateOff(v);
        return;
      }
      const spread = count > 1 && !chordMode ? ((i / (count - 1)) * 2 - 1) * layer.uniDetune : 0;
      const voiceLegato = legato && v.gate && v.layer === li;
      this._startVoice(v, li, pick.note, clamp(notes[i], 0, 127), useVel, spread, voiceLegato);
    });
  }

  _resetLayerVoices(li) {
    const layer = this.layers[li];
    this.voices.forEach((v) => { if (v.layer === li && v.gate) this._gateOff(v); });
    layer.heldNotes = [];
    layer.monoNote = -1;
    layer.monoActive = false;
  }

  _allNotesOff() {
    this.sustain = false;
    for (const layer of this.layers) { layer.heldNotes = []; layer.monoNote = -1; layer.monoActive = false; }
    this.voices.forEach((v) => { if (v.gate) this._gateOff(v); });
  }

  _allVoicesOff(hard = false) {
    this._allNotesOff();
    if (!hard) return;
    this.voices.forEach((v) => {
      v.envA.stage = STAGE_IDLE; v.envA.level = 0;
      v.envF.stage = STAGE_IDLE; v.envF.level = 0;
      v.s1 = v.s2 = v.s3 = v.s4 = 0;
    });
  }

  // ------------------------------------------------------------------ DSP
  process(_inputs, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    if (!ch0) return true;
    const frames = ch0.length;
    const need = this.osLen + frames * OS;
    if (this.osBuf.length < need) {
      const bigger = new Float64Array(need * 2);
      bigger.set(this.osBuf.subarray(0, this.osLen));
      this.osBuf = bigger;
    }
    const buf = this.osBuf;
    const base = this.osLen;
    buf.fill(0, base, base + frames * OS);

    const layers = this.layers;
    for (const v of this.voices) this._configureVoice(v, layers[v.layer], false);

    let activeCount = 0;
    for (let i = 0; i < frames; i += 1) {
      layers[0].tickMod(this.modWheel, this.aftertouch);
      if (this.mode !== 'normal') layers[1].tickMod(this.modWheel, this.aftertouch);
      for (let vi = 0; vi < NUM_VOICES; vi += 1) {
        const v = this.voices[vi];
        if (v.envA.stage === STAGE_IDLE) continue;
        if (i === 0) activeCount += 1;
        this._renderVoiceSample(v, layers[v.layer], buf, base + i * OS);
      }
    }

    // Decimate 2x -> 1x, then the output stage.
    const h = this.decim;
    const taps = h.length;
    const targetGain = this.masterVolume * this.masterVolume * this.midiVolume * this.expression;
    const a440Target = this.a440 ? 0.22 : 0;
    const muteTarget = this.mute ? 0 : 1;
    const a440Inc = (2 * Math.PI * 440) / this.sr;
    for (let i = 0; i < frames; i += 1) {
      const end = base + i * OS + 1; // newest sample index for this output frame
      let acc = 0;
      for (let k = 0; k < taps; k += 1) acc += h[k] * buf[end - k];
      // AC-coupled output (the pulse waves carry DC at extreme widths).
      const y = acc - this.dcX + this.dcCoef * this.dcY;
      this.dcX = acc;
      this.dcY = y;
      this.masterGain += (targetGain - this.masterGain) * 0.002;
      this.muteGain += (muteTarget - this.muteGain) * 0.003;
      this.a440Level += (a440Target - this.a440Level) * 0.002;
      let s = y * 0.45 * this.masterGain;
      if (this.a440Level > 1e-5) {
        this.a440Phase += a440Inc;
        if (this.a440Phase > 2 * Math.PI) this.a440Phase -= 2 * Math.PI;
        s += Math.sin(this.a440Phase) * this.a440Level * this.masterGain;
      }
      // Output stage: clean until it nears full scale, then rounds off.
      s *= this.muteGain;
      const sample = s > 0.8 || s < -0.8 ? Math.sign(s) * (0.8 + 0.2 * sat((Math.abs(s) - 0.8) * 5)) : s;
      ch0[i] = sample;
    }
    for (let c = 1; c < out.length; c += 1) out[c].set(ch0);
    // Keep the FIR history for the next block.
    buf.copyWithin(0, frames * OS, frames * OS + base);
    this._activity = activeCount;
    return true;
  }

  _renderVoiceSample(v, layer, buf, idx) {
    const va = layer.vintage;
    // --- control rate (once per base sample) ---------------------------------
    v.pitch += (v.target - v.pitch) * layer.glideCoef;
    // Slow analog drift: unit-variance noise low-passed twice at ~0.25 Hz,
    // updated every 16 samples, scaled by the Vintage knob.
    v.driftCount = (v.driftCount + 1) & 15;
    if (v.driftCount === 0) {
      const a = this.driftA16;
      const K = this.driftK;
      v.dA1 += a * ((Math.random() * 2 - 1) * K - v.dA1); v.dA2 += a * (v.dA1 - v.dA2);
      v.dB1 += a * ((Math.random() * 2 - 1) * K - v.dB1); v.dB2 += a * (v.dB1 - v.dB2);
    }
    const driftDepth = 0.003 + 0.05 * va; // semitones (standard deviation)
    v.driftA = v.dA2 * driftDepth;
    v.driftB = v.dB2 * driftDepth;
    const envF = v.envF.tick();
    const envA = v.envA.tick();

    const bendSemi = this.bend * layer.pbr;
    const common = v.pitch + bendSemi + this.masterTuneSemi + v.unisonCents / 100 + v.noteJitter;
    const tolA = v.tolA * (0.006 + 0.14 * va);
    const tolB = v.tolB * (0.006 + 0.14 * va);
    const pmEnvAmt = layer.pmEnv * envF;
    let pitchA = common + layer.aSemi + tolA + v.driftA + layer.mFreqA;
    if (layer.pmFA) pitchA += pmEnvAmt * 60;
    let incA = (440 * exp2((pitchA - 69) / 12)) / this.fsOS;

    let incB;
    if (layer.bKbd) {
      let pitchB = common + layer.bSemi + layer.bFine + tolB + v.driftB + layer.mFreqB;
      if (layer.bLo) pitchB -= 84; // seven octaves down in lo-freq mode
      incB = (440 * exp2((pitchB - 69) / 12)) / this.fsOS;
    } else if (layer.bLo) {
      incB = (layer.bLoFixedHz * exp2((layer.bFine + layer.mFreqB + tolB) / 12)) / this.fsOS;
    } else {
      const pitchB = layer.bFixedNote + layer.bFine + tolB + v.driftB + layer.mFreqB + this.masterTuneSemi;
      incB = (440 * exp2((pitchB - 69) / 12)) / this.fsOS;
    }
    const incMax = 0.45;
    if (incA > incMax) incA = incMax;
    if (incB > incMax) incB = incMax;

    const velF = layer.velFilt ? 1 - layer.velAmount * (1 - v.velocity) : 1;
    let cutoffSemi = layer.cutoffSemi + layer.kt * (v.pitch - 36)
      + envF * layer.envAmt * 96 * velF
      + layer.mFilt + this.brightness + this.filterPedal
      + v.tolCut * (0.08 + 2.2 * va);
    if (layer.pmFilt) cutoffSemi += pmEnvAmt * 96; // same CV range as ENVELOPE AMOUNT
    if (layer.atFilt) cutoffSemi += this.aftertouch * layer.atAmount * 48;

    let dutyA = layer.aDuty + layer.mPWA;
    if (layer.pmPWA) dutyA += pmEnvAmt * 0.98;
    const dutyBBase = clamp(layer.bDuty + layer.mPWB, 0, 1);

    const velA = layer.velAmp ? 1 - layer.velAmount * 0.85 * (1 - v.velocity) : 1;
    const gainTol = 1 + v.tolGain * (0.01 + 0.17 * va);
    const vca = envA * velA * gainTol * layer.volume;

    const fmOscB = layer.pmOscB > 0 && (layer.pmFA || layer.pmPWA || layer.pmFilt) && (layer.bSaw || layer.bTri || layer.bSqr);
    const filtFM = fmOscB && layer.pmFilt;
    const k = layer.k * (1 + v.tolRes * 0.02 * va);
    const qc = this.qCompMode === 'prg' ? layer.qComp * 0.85 : 0;
    const inGain = (layer.ssm ? 0.5 : 0.42) * (1 + qc * k);
    const fsOS = this.fsOS;

    let G = 0;
    if (!filtFM) G = this._filterG(cutoffSemi, fsOS);

    // --- audio rate (OS sub-samples) ------------------------------------------
    for (let s = 0; s < OS; s += 1) {
      // PolyBLEP convention: a step of height H whose distance to the current
      // sample is t (0 <= t < 1) corrects the previous sample by +(H/2)t^2 and
      // the current one by -(H/2)(1-t)^2. Outputs are delayed one sample so
      // the previous sample can still be corrected.

      // ---- Osc B (sync master) ----
      const dB = dutyBBase;
      const bEdges = dB > 0 && dB < 1;
      const p0B = v.phB;
      const p1B = p0B + incB;
      let cpB = 0;
      let ccB = 0;
      let bWrapT = -1;
      if (p1B >= 1) {
        const t = (p1B - 1) / incB;
        bWrapT = t;
        if (layer.bSaw) { cpB -= t * t; ccB += (1 - t) * (1 - t); } // saw falls by 2
        if (layer.bSqr && bEdges) { cpB += t * t; ccB -= (1 - t) * (1 - t); } // pulse rises by 2
      }
      if (layer.bSqr && bEdges) {
        let te = -1;
        if (p0B < dB && p1B >= dB) te = (p1B - dB) / incB;
        else if (p1B >= 1 + dB) te = (p1B - 1 - dB) / incB;
        if (te >= 0) { cpB -= te * te; ccB += (1 - te) * (1 - te); } // pulse falls by 2
      }
      const phB = p1B >= 1 ? p1B - 1 : p1B;
      v.phB = phB;
      let naiveB = 0;
      if (layer.bSaw) naiveB += 2 * phB - 1;
      if (layer.bTri) naiveB += phB < 0.5 ? 4 * phB - 1 : 3 - 4 * phB;
      if (layer.bSqr) naiveB += phB < dB ? 1 : -1;
      const outB = v.prevB + cpB;
      v.prevB = naiveB + ccB;
      const bMod = naiveB; // Poly-Mod uses the live waveform

      // ---- Osc A (slave), exponential FM / PWM from Osc B ----
      let incAe = incA;
      let dA = dutyA;
      if (fmOscB) {
        if (layer.pmFA) incAe = incA * exp2(bMod * layer.pmOscB * 15 / 12);
        if (layer.pmPWA) dA += bMod * layer.pmOscB * 0.45;
        if (incAe > incMax) incAe = incMax;
      }
      if (dA < 0) dA = 0; else if (dA > 1) dA = 1;
      const aEdges = dA > 0 && dA < 1;
      const aSaw = layer.aSaw;
      const aSqr = layer.aSqr;
      let cpA = 0;
      let ccA = 0;
      const p0A = v.phA;
      let phA;
      if (layer.sync && bWrapT >= 0) {
        // Run A up to the instant B wrapped (bWrapT before the sample), then
        // reset its phase to zero and run the remainder.
        const p1 = p0A + incAe * (1 - bWrapT);
        if (p1 >= 1) {
          const t = bWrapT + (p1 - 1) / incAe;
          if (aSaw) { cpA -= t * t; ccA += (1 - t) * (1 - t); }
          if (aSqr && aEdges) { cpA += t * t; ccA -= (1 - t) * (1 - t); }
        }
        if (aSqr && aEdges) {
          let te = -1;
          if (p0A < dA && p1 >= dA) te = bWrapT + (p1 - dA) / incAe;
          else if (p1 >= 1 + dA) te = bWrapT + (p1 - 1 - dA) / incAe;
          if (te >= 0) { cpA -= te * te; ccA += (1 - te) * (1 - te); }
        }
        const pr = p1 >= 1 ? p1 - 1 : p1; // phase at the reset instant
        let h = 0;
        if (aSaw) h -= 2 * pr; // saw jumps from (2pr - 1) to -1
        if (aSqr) h += (dA > 0 ? 1 : -1) - (pr < dA ? 1 : -1);
        if (h !== 0) {
          const hh = h * 0.5;
          const t = bWrapT;
          cpA += hh * t * t;
          ccA -= hh * (1 - t) * (1 - t);
        }
        phA = incAe * bWrapT;
        if (aSqr && aEdges && phA >= dA) {
          const te = (phA - dA) / incAe;
          cpA -= te * te; ccA += (1 - te) * (1 - te);
        }
      } else {
        const p1 = p0A + incAe;
        if (p1 >= 1) {
          const t = (p1 - 1) / incAe;
          if (aSaw) { cpA -= t * t; ccA += (1 - t) * (1 - t); }
          if (aSqr && aEdges) { cpA += t * t; ccA -= (1 - t) * (1 - t); }
        }
        if (aSqr && aEdges) {
          let te = -1;
          if (p0A < dA && p1 >= dA) te = (p1 - dA) / incAe;
          else if (p1 >= 1 + dA) te = (p1 - 1 - dA) / incAe;
          if (te >= 0) { cpA -= te * te; ccA += (1 - te) * (1 - te); }
        }
        phA = p1 >= 1 ? p1 - 1 : p1;
      }
      v.phA = phA;
      const corrPrevA = cpA;
      const corrCurA = ccA;
      let naiveA = 0;
      if (aSaw) naiveA += 2 * phA - 1;
      if (aSqr) naiveA += phA < dA ? 1 : -1;
      const outA = v.prevA + corrPrevA;
      v.prevA = naiveA + corrCurA;

      // Noise
      let ns = v.noise;
      ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
      v.noise = ns >>> 0;
      const white = (v.noise / 4294967296) * 2 - 1;

      // The analog noise floor (~ -80 dB) is what lets a resonant filter start
      // self-oscillating with no oscillator input, as on the hardware.
      // Analog mixers also bleed a little oscillator signal (~ -60 dB) with
      // their level at zero; several factory programs rely on it.
      const x = (outA * (layer.mixA + 0.001) + outB * (layer.mixB + 0.001) + white * (layer.mixN + 0.0002)) * inGain;

      // Filter
      if (filtFM) G = this._filterG(cutoffSemi + bMod * layer.pmOscB * 48, fsOS);
      const y4 = layer.ssm ? this._ssmFilter(v, x, G, k) : this._cemFilter(v, x, G, k);
      buf[idx + s] += y4 * vca * 2.0;
    }
  }

  _filterG(semi, fsOS) {
    let fc = 18 * exp2(semi / 12);
    const maxFc = 0.43 * fsOS;
    if (fc > maxFc) fc = maxFc; else if (fc < 4) fc = 4;
    const g = Math.tan((Math.PI * fc) / fsOS);
    return g / (1 + g);
  }

  /** Rev 3: Curtis CEM 3320 - clean stages, saturation in the input/feedback path. */
  _cemFilter(v, x, G, k) {
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G3 * G;
    const S = (1 - G) * (G3 * v.s1 + G2 * v.s2 + G * v.s3 + v.s4);
    const y4e = (G4 * x + S) / (1 + k * G4);
    const u = sat(x - k * y4e);
    let w = (u - v.s1) * G; const y1 = w + v.s1; v.s1 = y1 + w;
    w = (y1 - v.s2) * G; const y2 = w + v.s2; v.s2 = y2 + w;
    w = (y2 - v.s3) * G; const y3 = w + v.s3; v.s3 = y3 + w;
    w = (y3 - v.s4) * G; const y4 = w + v.s4; v.s4 = y4 + w;
    return y4;
  }

  /** Rev 1/2: SSI 2140 (SSM 2040) - OTA stages that each saturate: thicker, rounder, grittier. */
  _ssmFilter(v, x, G, k) {
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G3 * G;
    const S = (1 - G) * (G3 * v.s1 + G2 * v.s2 + G * v.s3 + v.s4);
    const y4e = (G4 * x + S) / (1 + k * G4);
    const u = sat((x - k * y4e) * 1.15) / 1.15;
    let w = (u - v.s1) * G; const y1 = w + v.s1; v.s1 = y1 + w;
    w = (sat(y1 * 1.3) / 1.3 - v.s2) * G; const y2 = w + v.s2; v.s2 = y2 + w;
    w = (sat(y2 * 1.3) / 1.3 - v.s3) * G; const y3 = w + v.s3; v.s3 = y3 + w;
    w = (sat(y3 * 1.3) / 1.3 - v.s4) * G; const y4 = w + v.s4; v.s4 = y4 + w;
    return y4;
  }
}

registerProcessor('prophet10-processor', Prophet10Processor);
