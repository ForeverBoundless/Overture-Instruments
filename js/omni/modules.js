/**
 * omni/modules.js - OMNI module catalogue.
 *
 * Every module declares ports (audio | cv | note) and parameters, and builds a
 * live instance from an AudioContext:
 *   audio ports: AudioNode outputs connected to AudioNode inputs
 *   cv ports:    AudioNode outputs connected to AudioParam inputs (audio-rate control)
 *   note ports:  JavaScript events { note, velocity, on } (keyboard, sequencer -> oscillators, envelopes, FM voice)
 * Instrument-derived modules reuse existing engines (LadderFilter, DX7 worklet).
 */
import { LadderFilter } from '../engine/LadderFilter.js';
import { DX7_PRESETS } from '../data/dx7Presets.js';

const DX7_URL = new URL('../engine/DX7Processor.js', import.meta.url).href;
const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const now = (ctx) => ctx.currentTime;

/** Base instance with event ports. */
class Instance {
  constructor(def, ctx) { this.def = def; this.ctx = ctx; this.inputs = {}; this.outputs = {}; this._listeners = {}; this.nodes = []; }
  on(port, fn) { (this._listeners[port] ||= []).push(fn); return () => { this._listeners[port] = this._listeners[port].filter((f) => f !== fn); }; }
  emit(port, ev) { (this._listeners[port] || []).forEach((fn) => fn(ev)); }
  dispose() { this.nodes.forEach((n) => { try { n.stop?.(); } catch { /* not a source */ } try { n.disconnect(); } catch { /* */ } }); this._listeners = {}; }
  track(...nodes) { this.nodes.push(...nodes); return nodes[0]; }
}

const P = (key, label, min, max, def, extra = {}) => ({ key, label, min, max, default: def, ...extra });
const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];

// ---- shared helpers for the extended catalogue
const gain = (inst, v = 1) => { const g = inst.track(inst.ctx.createGain()); g.gain.value = v; return g; };
const biq = (inst, type, f, q = 1) => { const b = inst.track(inst.ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
const constSrc = (inst, v = 0) => { const c = inst.track(inst.ctx.createConstantSource()); c.offset.value = v; c.start(); return c; };
const shaper = (inst, fn, n = 2048) => { const ws = inst.track(inst.ctx.createWaveShaper()); const c = new Float32Array(n); for (let i = 0; i < n; i += 1) c[i] = fn((i / (n - 1)) * 2 - 1); ws.curve = c; return ws; };
const noiseBuf = (ctx, secs = 1) => { const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1; return b; };
const noteIn = (fn) => ({ kind: 'note', handle: fn });
const A = (id, label) => ({ id, label, type: 'audio' }); const C = (id, label) => ({ id, label, type: 'cv' }); const N = (id, label) => ({ id, label, type: 'note' });
const SRC = { category: 'Sources', color: '#ff9f0a' }, PROC = { category: 'Processing', color: '#7de4ff' }, MOD = { category: 'Modulation', color: '#c89bff' }, PERF = { category: 'Performance', color: '#82e6a8' };
/** Adds timer bookkeeping (cleared on dispose) to an instance. */
const timed = (inst) => { inst.timers = new Set(); const d = inst.dispose.bind(inst); inst.dispose = () => { inst.timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); d(); }; inst.after = (ms, fn) => { const t = setTimeout(() => { inst.timers.delete(t); fn(); }, Math.max(0, ms)); inst.timers.add(t); return t; }; inst.every = (ms, fn) => { const t = setInterval(fn, ms); inst.timers.add(t); return t; }; inst.clear = (t) => { clearTimeout(t); clearInterval(t); inst.timers.delete(t); }; return inst; };
/** Emits a note on/off pair on `port` after whenMs, lasting lenMs. */
const fireNote = (inst, note, vel, whenMs, lenMs, port = 'note') => { inst.after(whenMs, () => inst.emit(port, { note, velocity: vel, on: true })); inst.after(whenMs + lenMs, () => inst.emit(port, { note, velocity: 0, on: false })); };
/** Look-ahead clock: step(i, whenMs) schedules events for step i and returns its duration in seconds. */
const clocked = (inst, step) => {
  timed(inst); const ctx = inst.ctx;
  const tick = () => { const ahead = ctx.currentTime + 0.1; while (inst.next < ahead) { const dur = step(inst.i, (inst.next - ctx.currentTime) * 1000); inst.next += Math.max(0.01, dur); inst.i += 1; } };
  inst.setRunning = (run) => { if (run && !inst.clk) { inst.next = ctx.currentTime + 0.05; inst.i = 0; inst.clk = inst.every(25, tick); } if (!run && inst.clk) { inst.clear(inst.clk); inst.clk = null; inst.emit('note', { note: 60, velocity: 0, on: false }); } };
  return inst;
};
const DIVS = ['1/4', '1/8', '1/16', '1/8 triplet', '1/32']; const DIV_BEATS = [1, 0.5, 0.25, 1 / 3, 0.125];
const SCALES = { names: ['major', 'minor', 'pentatonic', 'blues', 'dorian', 'chromatic'], steps: [[0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], [0, 2, 4, 7, 9], [0, 3, 5, 6, 7, 10], [0, 2, 3, 5, 7, 9, 10], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]] };
const VOWELS = { names: ['A', 'E', 'I', 'O', 'U'], f: [[800, 1150, 2900], [400, 1600, 2700], [350, 1700, 2700], [450, 800, 2830], [325, 700, 2530]] };

export const MODULES = {
  keyboard: {
    name: 'Keyboard & MIDI', category: 'Performance', color: '#82e6a8',
    params: [P('octave', 'Octave shift', -3, 3, 0, { step: 1 })],
    inputs: [], outputs: [{ id: 'note', label: 'Note', type: 'note' }, { id: 'velocity', label: 'Velocity', type: 'cv' }],
    create(ctx) {
      const inst = new Instance(this, ctx);
      const vel = inst.track(ctx.createConstantSource()); vel.offset.value = 0; vel.start();
      inst.outputs.velocity = vel;
      inst.held = [];
      inst.noteOn = (note, velocity) => { const n = note + inst.params.octave * 12; inst.held = inst.held.filter((h) => h.note !== n); inst.held.push({ note: n, velocity }); vel.offset.setTargetAtTime(velocity, now(ctx), 0.005); inst.emit('note', { note: n, velocity, on: true, legato: inst.held.length > 1 }); };
      inst.noteOff = (note) => { const n = note + inst.params.octave * 12; const was = inst.held.length; inst.held = inst.held.filter((h) => h.note !== n); if (!was) return; if (inst.held.length) { const top = inst.held[inst.held.length - 1]; inst.emit('note', { note: top.note, velocity: top.velocity, on: true, legato: true }); } else inst.emit('note', { note: n, velocity: 0, on: false }); };
      inst.allOff = () => { inst.held = []; inst.emit('note', { note: 60, velocity: 0, on: false }); };
      return inst;
    },
  },
  oscillator: {
    name: 'Oscillator', category: 'Sources', color: '#ff9f0a',
    params: [P('wave', 'Waveform', 0, 3, 2, { options: WAVES }), P('octave', 'Octave', -3, 3, 0, { step: 1 }), P('detune', 'Detune (cents)', -100, 100, 0), P('pulseWidth', 'Pulse width (square)', 0.05, 0.95, 0.5), P('glide', 'Glide (s)', 0, 2, 0), P('modDepth', 'Pitch mod depth (semitones)', 0, 48, 2), P('level', 'Level', 0, 1, 0.8)],
    inputs: [{ id: 'pitch', label: 'Pitch', type: 'note' }, { id: 'pitchMod', label: 'Pitch mod', type: 'cv' }],
    outputs: [{ id: 'out', label: 'Audio', type: 'audio' }],
    create(ctx) {
      const inst = new Instance(this, ctx);
      const osc = inst.track(ctx.createOscillator()); const level = inst.track(ctx.createGain()); const modGain = inst.track(ctx.createGain());
      // Variable pulse: two sawtooths, one phase-offset via a short delay, subtracted.
      const osc2 = inst.track(ctx.createOscillator()); const inv = inst.track(ctx.createGain()); inv.gain.value = -1; const delay = inst.track(ctx.createDelay(0.05)); const pulseGain = inst.track(ctx.createGain()); const mainGain = inst.track(ctx.createGain());
      osc.type = 'sawtooth'; osc2.type = 'sawtooth'; osc.connect(mainGain); mainGain.connect(level);
      osc.connect(pulseGain); osc2.connect(delay); delay.connect(inv); inv.connect(pulseGain); pulseGain.connect(level);
      modGain.connect(osc.detune); modGain.connect(osc2.detune);
      osc.start(); osc2.start();
      inst.outputs.out = level; inst.inputs.pitchMod = modGain;
      inst.freq = 110;
      const apply = () => {
        const p = inst.params; const pulse = p.wave === 3;
        osc.type = pulse ? 'sawtooth' : WAVES[p.wave]; mainGain.gain.setTargetAtTime(pulse ? 0 : 1, now(ctx), 0.01); pulseGain.gain.setTargetAtTime(pulse ? 1 : 0, now(ctx), 0.01);
        const hz = inst.freq * Math.pow(2, p.octave); const t = now(ctx);
        [osc, osc2].forEach((o) => { o.frequency.cancelScheduledValues(t); if (p.glide > 0) o.frequency.setTargetAtTime(hz, t, p.glide / 4); else o.frequency.setValueAtTime(hz, t); o.detune.value = p.detune; });
        delay.delayTime.setTargetAtTime(Math.min(0.05, p.pulseWidth / Math.max(20, hz)), t, 0.005);
        modGain.gain.value = p.modDepth * 100; level.gain.setTargetAtTime(p.level * 0.5, t, 0.01);
      };
      inst.inputs.pitch = { kind: 'note', handle: (ev) => { if (ev.on) { inst.freq = midiHz(ev.note); apply(); } } };
      inst.apply = apply;
      return inst;
    },
  },
  noise: {
    name: 'Noise Generator', category: 'Sources', color: '#ff9f0a',
    params: [P('color', 'Colour', 0, 1, 0, { options: ['white', 'pink'] }), P('level', 'Level', 0, 1, 0.5)],
    inputs: [], outputs: [{ id: 'out', label: 'Audio', type: 'audio' }],
    create(ctx) {
      const inst = new Instance(this, ctx);
      const len = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      const white = new Float32Array(len); for (let i = 0; i < len; i += 1) white[i] = Math.random() * 2 - 1;
      const pinkBuf = ctx.createBuffer(1, len, ctx.sampleRate); const pd = pinkBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) { const w = white[i]; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25; d[i] = w; }
      const src = inst.track(ctx.createBufferSource()); src.loop = true; const level = inst.track(ctx.createGain());
      src.connect(level); inst.outputs.out = level;
      inst.apply = () => { const want = inst.params.color === 1 ? pinkBuf : buf; if (!inst.started) { src.buffer = want; src.start(); inst.started = true; inst.color = inst.params.color; } else if (inst.color !== inst.params.color) { inst.color = inst.params.color; inst.needsRebuild = true; } level.gain.setTargetAtTime(inst.params.level * 0.4, now(ctx), 0.01); };
      return inst;
    },
  },
  mixer: {
    name: 'Mixer', category: 'Processing', color: '#7de4ff',
    params: [P('level1', 'Input 1 level', 0, 1, 0.8), P('level2', 'Input 2 level', 0, 1, 0.8), P('level3', 'Input 3 level', 0, 1, 0.8), P('level4', 'Input 4 level', 0, 1, 0.8)],
    inputs: [1, 2, 3, 4].map((i) => ({ id: `in${i}`, label: `In ${i}`, type: 'audio' })), outputs: [{ id: 'out', label: 'Mix', type: 'audio' }],
    create(ctx) {
      const inst = new Instance(this, ctx); const out = inst.track(ctx.createGain()); out.gain.value = 0.5;
      const gains = [1, 2, 3, 4].map((i) => { const g = inst.track(ctx.createGain()); g.connect(out); inst.inputs[`in${i}`] = g; return g; });
      inst.outputs.out = out;
      inst.apply = () => gains.forEach((g, i) => g.gain.setTargetAtTime(inst.params[`level${i + 1}`], now(ctx), 0.01));
      return inst;
    },
  },
  filter: {
    name: 'Filter', category: 'Processing', color: '#7de4ff',
    params: [P('type', 'Mode', 0, 2, 0, { options: ['lowpass', 'highpass', 'bandpass'] }), P('cutoff', 'Cutoff (Hz)', 20, 18000, 1200, { log: true }), P('resonance', 'Resonance (Q)', 0.1, 20, 1), P('modDepth', 'Cutoff mod depth (octaves)', 0, 8, 2)],
    inputs: [{ id: 'in', label: 'Audio', type: 'audio' }, { id: 'cutoffMod', label: 'Cutoff mod', type: 'cv' }], outputs: [{ id: 'out', label: 'Audio', type: 'audio' }],
    create(ctx) {
      const inst = new Instance(this, ctx); const f = inst.track(ctx.createBiquadFilter()); const mod = inst.track(ctx.createGain()); mod.connect(f.detune);
      inst.inputs.in = f; inst.inputs.cutoffMod = mod; inst.outputs.out = f;
      inst.apply = () => { f.type = ['lowpass', 'highpass', 'bandpass'][inst.params.type]; f.frequency.setTargetAtTime(inst.params.cutoff, now(ctx), 0.01); f.Q.setTargetAtTime(inst.params.resonance, now(ctx), 0.01); mod.gain.value = inst.params.modDepth * 1200; };
      return inst;
    },
  },
  envelope: {
    name: 'Envelope (ADSR)', category: 'Modulation', color: '#c89bff',
    params: [P('attack', 'Attack (s)', 0.001, 4, 0.01), P('decay', 'Decay (s)', 0.001, 4, 0.2), P('sustain', 'Sustain', 0, 1, 0.7), P('release', 'Release (s)', 0.001, 6, 0.3), P('amount', 'Amount', 0, 1, 1)],
    inputs: [{ id: 'gate', label: 'Gate', type: 'note' }], outputs: [{ id: 'out', label: 'CV', type: 'cv' }],
    create(ctx) {
      const inst = new Instance(this, ctx); const cs = inst.track(ctx.createConstantSource()); cs.offset.value = 0; cs.start(); inst.outputs.out = cs;
      inst.inputs.gate = { kind: 'note', handle: (ev) => {
        const p = inst.params; const t = now(ctx); const o = cs.offset;
        if (ev.on) { if (ev.legato && inst.gateOn) return; inst.gateOn = true; o.cancelScheduledValues(t); o.setValueAtTime(o.value, t); o.linearRampToValueAtTime(p.amount, t + p.attack); o.setTargetAtTime(p.sustain * p.amount, t + p.attack, p.decay / 3); }
        else { inst.gateOn = false; o.cancelScheduledValues(t); o.setValueAtTime(o.value, t); o.setTargetAtTime(0, t, p.release / 4); }
      } };
      inst.apply = () => {};
      return inst;
    },
  },
  lfo: {
    name: 'LFO', category: 'Modulation', color: '#c89bff',
    params: [P('wave', 'Shape', 0, 3, 0, { options: WAVES }), P('rate', 'Rate (Hz)', 0.05, 30, 2, { log: true }), P('depth', 'Depth', 0, 1, 0.5)],
    inputs: [], outputs: [{ id: 'out', label: 'CV', type: 'cv' }],
    create(ctx) {
      const inst = new Instance(this, ctx); const o = inst.track(ctx.createOscillator()); const g = inst.track(ctx.createGain()); o.connect(g); o.start(); inst.outputs.out = g;
      inst.apply = () => { o.type = WAVES[inst.params.wave]; o.frequency.setTargetAtTime(inst.params.rate, now(ctx), 0.02); g.gain.setTargetAtTime(inst.params.depth, now(ctx), 0.02); };
      return inst;
    },
  },
  vca: {
    name: 'VCA (Amplifier)', category: 'Processing', color: '#7de4ff',
    params: [P('initial', 'Initial gain', 0, 1, 0), P('cvAmount', 'CV amount', 0, 2, 1)],
    inputs: [{ id: 'in', label: 'Audio', type: 'audio' }, { id: 'gain', label: 'Gain CV', type: 'cv' }], outputs: [{ id: 'out', label: 'Audio', type: 'audio' }],
    create(ctx) {
      const inst = new Instance(this, ctx); const g = inst.track(ctx.createGain()); const cv = inst.track(ctx.createGain()); cv.connect(g.gain);
      inst.inputs.in = g; inst.inputs.gain = cv; inst.outputs.out = g;
      inst.apply = () => { g.gain.setTargetAtTime(inst.params.initial, now(ctx), 0.01); cv.gain.value = inst.params.cvAmount; };
      return inst;
    },
  },
  output: {
    name: 'Audio Output', category: 'Output', color: '#ff6a3d', single: true,
    params: [P('level', 'Level', 0, 1, 0.8)],
    inputs: [{ id: 'in', label: 'Audio', type: 'audio' }], outputs: [],
    create(ctx, bus) {
      const inst = new Instance(this, ctx); const g = inst.track(ctx.createGain()); const clip = inst.track(ctx.createWaveShaper());
      const curve = new Float32Array(1024); for (let i = 0; i < 1024; i += 1) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 1.5) / Math.tanh(1.5); } clip.curve = curve; clip.oversample = '2x';
      g.connect(clip); clip.connect(bus.master); inst.inputs.in = g; inst.meterNode = clip;
      inst.apply = () => g.gain.setTargetAtTime(inst.params.level, now(ctx), 0.01);
      return inst;
    },
  },
  sequencer: {
    name: 'Step Sequencer', category: 'Performance', color: '#82e6a8',
    params: [P('running', 'Running', 0, 1, 0, { options: ['stopped', 'running'] }), P('tempo', 'Tempo (BPM)', 40, 240, 120, { step: 1 }), P('gate', 'Gate length', 0.1, 1, 0.5), P('root', 'Root note (MIDI)', 24, 84, 48, { step: 1 }),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => P(`step${i}`, `Step ${i} (-1 = rest)`, -1, 24, [0, 3, 7, 12, 0, 3, 7, 10][i - 1], { step: 1 }))],
    inputs: [], outputs: [{ id: 'note', label: 'Note', type: 'note' }],
    create(ctx) {
      const inst = new Instance(this, ctx); inst.step = 0; inst.next = 0; inst.timer = null;
      const tick = () => {
        const p = inst.params; const ahead = ctx.currentTime + 0.1;
        while (inst.next < ahead) {
          const dur = 60 / p.tempo / 2; const v = p[`step${(inst.step % 8) + 1}`]; const when = Math.max(0, inst.next - ctx.currentTime) * 1000;
          if (v >= 0) { const note = p.root + v; setTimeout(() => inst.emit('note', { note, velocity: 0.9, on: true }), when); setTimeout(() => inst.emit('note', { note, velocity: 0, on: false }), when + dur * p.gate * 1000); }
          inst.next += dur; inst.step = (inst.step + 1) % 8;
        }
      };
      inst.apply = () => { const run = inst.params.running === 1; if (run && !inst.timer) { inst.next = ctx.currentTime + 0.05; inst.step = 0; inst.timer = setInterval(tick, 25); } if (!run && inst.timer) { clearInterval(inst.timer); inst.timer = null; inst.emit('note', { note: 60, velocity: 0, on: false }); } };
      const dispose = inst.dispose.bind(inst); inst.dispose = () => { clearInterval(inst.timer); inst.timer = null; dispose(); };
      return inst;
    },
  },
  ladder: {
    name: 'Moog Ladder Filter', category: 'Instrument modules', color: '#ffb75e',
    params: [P('cutoff', 'Cutoff (Hz)', 20, 12000, 1500, { log: true }), P('resonance', 'Resonance', 0, 1, 0.3), P('drive', 'Drive', 0, 1, 0.2), P('slope', 'Slope (dB/oct)', 0, 3, 3, { options: ['6', '12', '18', '24'] }), P('modDepth', 'Cutoff mod depth (Hz)', 0, 8000, 2000)],
    inputs: [{ id: 'in', label: 'Audio', type: 'audio' }, { id: 'cutoffMod', label: 'Cutoff mod', type: 'cv' }], outputs: [{ id: 'out', label: 'Audio', type: 'audio' }],
    create(ctx) {
      const inst = new Instance(this, ctx); const f = new LadderFilter(ctx); const mod = inst.track(ctx.createGain()); f.poles.forEach((p) => mod.connect(p.frequency));
      inst.inputs.in = f.input; inst.inputs.cutoffMod = mod; inst.outputs.out = f.output; inst.track(f.input, f.output);
      inst.apply = () => { f.setCutoff(inst.params.cutoff, 0.01); f.setResonance(inst.params.resonance); f.setDrive(inst.params.drive); f.setSlope([6, 12, 18, 24][inst.params.slope]); mod.gain.value = inst.params.modDepth; };
      return inst;
    },
  },
  ms20filter: {
    name: 'MS-20 Dual Filter', category: 'Instrument modules', color: '#ffd36b',
    params: [P('hpCutoff', 'HPF cutoff (Hz)', 20, 10000, 80, { log: true }), P('hpPeak', 'HPF peak', 0.5, 25, 1), P('lpCutoff', 'LPF cutoff (Hz)', 20, 18000, 2500, { log: true }), P('lpPeak', 'LPF peak', 0.5, 25, 3), P('modDepth', 'Cutoff mod depth (octaves)', 0, 8, 2)],
    inputs: [{ id: 'in', label: 'Audio', type: 'audio' }, { id: 'cutoffMod', label: 'Cutoff mod', type: 'cv' }], outputs: [{ id: 'out', label: 'Audio', type: 'audio' }],
    create(ctx) {
      const inst = new Instance(this, ctx); const hp = inst.track(ctx.createBiquadFilter()); const lp = inst.track(ctx.createBiquadFilter()); const mod = inst.track(ctx.createGain()); const sat = inst.track(ctx.createWaveShaper());
      hp.type = 'highpass'; lp.type = 'lowpass'; const curve = new Float32Array(512); for (let i = 0; i < 512; i += 1) { const x = (i / 255.5) - 1; curve[i] = Math.tanh(x * 2) / Math.tanh(2); } sat.curve = curve;
      hp.connect(lp); lp.connect(sat); mod.connect(hp.detune); mod.connect(lp.detune);
      inst.inputs.in = hp; inst.inputs.cutoffMod = mod; inst.outputs.out = sat;
      inst.apply = () => { const p = inst.params; hp.frequency.setTargetAtTime(p.hpCutoff, now(ctx), 0.01); hp.Q.value = p.hpPeak; lp.frequency.setTargetAtTime(p.lpCutoff, now(ctx), 0.01); lp.Q.value = p.lpPeak; mod.gain.value = p.modDepth * 1200; };
      return inst;
    },
  },
  junoChorus: {
    name: 'Juno Chorus', category: 'Instrument modules', color: '#ff6a3d',
    params: [P('mode', 'Chorus', 0, 2, 1, { options: ['Off', 'I', 'II'] })],
    inputs: [{ id: 'in', label: 'Audio', type: 'audio' }], outputs: [{ id: 'out', label: 'Stereo', type: 'audio' }],
    create(ctx) {
      const inst = new Instance(this, ctx); const input = inst.track(ctx.createGain()); const merge = inst.track(ctx.createChannelMerger(2)); const dry = inst.track(ctx.createGain()); dry.gain.value = 0.5;
      const dL = inst.track(ctx.createDelay(0.05)); const dR = inst.track(ctx.createDelay(0.05)); const lfo = inst.track(ctx.createOscillator()); lfo.type = 'triangle'; const depthL = inst.track(ctx.createGain()); const depthR = inst.track(ctx.createGain()); const wet = inst.track(ctx.createGain());
      input.connect(dry); dry.connect(merge, 0, 0); dry.connect(merge, 0, 1); input.connect(dL); input.connect(dR); dL.connect(wet); wet.connect(merge, 0, 0); const wetR = inst.track(ctx.createGain()); dR.connect(wetR); wetR.connect(merge, 0, 1);
      lfo.connect(depthL); lfo.connect(depthR); depthL.connect(dL.delayTime); depthR.connect(dR.delayTime); lfo.start();
      inst.inputs.in = input; inst.outputs.out = merge;
      inst.apply = () => { const m = inst.params.mode; const t = now(ctx); lfo.frequency.setTargetAtTime(m === 2 ? 0.83 : 0.5, t, 0.05); dL.delayTime.value = m === 2 ? 0.0045 : 0.0035; dR.delayTime.value = m === 2 ? 0.0045 : 0.0035; depthL.gain.value = m === 2 ? 0.0024 : 0.0018; depthR.gain.value = -(m === 2 ? 0.0024 : 0.0018); wet.gain.setTargetAtTime(m ? 0.5 : 0, t, 0.05); wetR.gain.setTargetAtTime(m ? 0.5 : 0, t, 0.05); };
      return inst;
    },
  },
  fmVoice: {
    name: 'DX7 FM Voice', category: 'Instrument modules', color: '#5fd3c4', async: true,
    params: [P('preset', 'Voice', 0, DX7_PRESETS.length - 1, 0, { options: DX7_PRESETS.map((p) => p.name) }), P('algorithm', 'Algorithm', 1, 32, 5, { step: 1 }), P('feedback', 'Feedback', 0, 7, 5, { step: 1 }), P('brightness', 'Modulator level scale', 0, 1.5, 1), P('level', 'Level', 0, 1, 0.8)],
    inputs: [{ id: 'note', label: 'Note', type: 'note' }], outputs: [{ id: 'out', label: 'Audio', type: 'audio' }],
    async create(ctx, bus) {
      const inst = new Instance(this, ctx);
      if (!bus.dx7Loaded) { await ctx.audioWorklet.addModule(DX7_URL); bus.dx7Loaded = true; }
      const node = new AudioWorkletNode(ctx, 'dx7-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      const level = inst.track(ctx.createGain()); node.connect(level); inst.track(node); inst.outputs.out = level;
      inst.inputs.note = { kind: 'note', handle: (ev) => node.port.postMessage(ev.on ? { t: 'noteOn', note: ev.note, vel: ev.velocity } : { t: 'noteOff', note: ev.note }) };
      inst.apply = () => {
        const p = inst.params; const base = JSON.parse(JSON.stringify(DX7_PRESETS[p.preset].data));
        if (inst.lastPreset !== p.preset) { inst.lastPreset = p.preset; p.algorithm = base.algorithm; p.feedback = base.feedback; }
        base.algorithm = p.algorithm; base.feedback = p.feedback;
        const carriers = new Set((bus.algorithms?.[base.algorithm - 1]?.carriers) || []);
        base.ops.forEach((o, i) => { if (!carriers.has(i + 1)) o.level = Math.min(99, o.level * p.brightness); });
        node.port.postMessage({ t: 'patch', patch: base }); node.port.postMessage({ t: 'volume', value: 1 });
        level.gain.setTargetAtTime(p.level, now(ctx), 0.01);
      };
      inst.allOff = () => node.port.postMessage({ t: 'allOff' });
      return inst;
    },
  },

  // ======================================================================== extended sources
  subOsc: {
    name: 'Sub Oscillator', ...SRC,
    params: [P('wave', 'Waveform', 0, 1, 1, { options: ['sine', 'square'] }), P('octave', 'Octaves below', 1, 2, 1, { step: 1 }), P('level', 'Level', 0, 1, 0.7)],
    inputs: [N('pitch', 'Pitch')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const o = inst.track(ctx.createOscillator()); const lv = gain(inst, 0); o.connect(lv); o.start(); inst.outputs.out = lv; inst.freq = 110;
      inst.apply = () => { const p = inst.params; o.type = ['sine', 'square'][p.wave]; o.frequency.setTargetAtTime(inst.freq / Math.pow(2, p.octave), now(ctx), 0.005); lv.gain.setTargetAtTime(p.level * 0.5, now(ctx), 0.01); };
      inst.inputs.pitch = noteIn((ev) => { if (ev.on) { inst.freq = midiHz(ev.note); inst.apply(); } });
      return inst;
    },
  },
  supersaw: {
    name: 'Supersaw', ...SRC,
    params: [P('voices', 'Voices', 1, 7, 7, { step: 1 }), P('detune', 'Detune (cents)', 0, 100, 25), P('octave', 'Octave', -3, 3, 0, { step: 1 }), P('modDepth', 'Pitch mod depth (semitones)', 0, 48, 2), P('level', 'Level', 0, 1, 0.7)],
    inputs: [N('pitch', 'Pitch'), C('pitchMod', 'Pitch mod')], outputs: [A('out', 'Stereo')],
    create(ctx) {
      const inst = new Instance(this, ctx); const lv = gain(inst, 0); const mod = gain(inst, 0); const merge = inst.track(ctx.createChannelMerger(2)); inst.freq = 110;
      const vs = [...Array(7)].map((_, i) => { const o = inst.track(ctx.createOscillator()); o.type = 'sawtooth'; const g = gain(inst, 0); o.connect(g); g.connect(merge, 0, i % 2); mod.connect(o.detune); o.start(); return { o, g }; });
      merge.connect(lv); inst.outputs.out = lv; inst.inputs.pitchMod = mod;
      inst.apply = () => { const p = inst.params; const t = now(ctx); const hz = inst.freq * Math.pow(2, p.octave); vs.forEach(({ o, g }, i) => { o.frequency.setTargetAtTime(hz, t, 0.005); o.detune.value = ((i - 3) / 3) * p.detune; g.gain.setTargetAtTime(i < p.voices ? 1 / Math.sqrt(p.voices) : 0, t, 0.01); }); mod.gain.value = p.modDepth * 100; lv.gain.setTargetAtTime(p.level * 0.4, t, 0.01); };
      inst.inputs.pitch = noteIn((ev) => { if (ev.on) { inst.freq = midiHz(ev.note); inst.apply(); } });
      return inst;
    },
  },
  additive: {
    name: 'Additive Oscillator', ...SRC,
    params: [...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => P(`h${i}`, `Harmonic ${i}`, 0, 1, +(1 / i).toFixed(2))), P('octave', 'Octave', -3, 3, 0, { step: 1 }), P('modDepth', 'Pitch mod depth (semitones)', 0, 48, 2), P('level', 'Level', 0, 1, 0.7)],
    inputs: [N('pitch', 'Pitch'), C('pitchMod', 'Pitch mod')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const o = inst.track(ctx.createOscillator()); const lv = gain(inst, 0); const mod = gain(inst, 0); o.connect(lv); mod.connect(o.detune); o.start(); inst.outputs.out = lv; inst.inputs.pitchMod = mod; inst.freq = 110;
      inst.apply = () => { const p = inst.params; const re = new Float32Array(9); const im = new Float32Array(9); for (let i = 1; i <= 8; i += 1) im[i] = p[`h${i}`]; o.setPeriodicWave(ctx.createPeriodicWave(re, im)); o.frequency.setTargetAtTime(inst.freq * Math.pow(2, p.octave), now(ctx), 0.005); mod.gain.value = p.modDepth * 100; lv.gain.setTargetAtTime(p.level * 0.5, now(ctx), 0.01); };
      inst.inputs.pitch = noteIn((ev) => { if (ev.on) { inst.freq = midiHz(ev.note); inst.apply(); } });
      return inst;
    },
  },
  pluck: {
    name: 'Plucked String', ...SRC,
    params: [P('sustain', 'Sustain (feedback)', 0.8, 0.999, 0.99), P('brightness', 'Brightness (Hz)', 500, 12000, 5000, { log: true }), P('level', 'Level', 0, 1, 0.8)],
    inputs: [N('pitch', 'Pluck')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const d = inst.track(ctx.createDelay(1)); const fb = gain(inst, 0.99); const lp = biq(inst, 'lowpass', 5000, 0.5); const out = gain(inst, 0.8); const burst = noiseBuf(ctx, 0.05);
      d.connect(lp); lp.connect(fb); fb.connect(d); d.connect(out); inst.outputs.out = out;
      inst.inputs.pitch = noteIn((ev) => { if (!ev.on) return; const hz = midiHz(ev.note); const t = now(ctx); d.delayTime.setValueAtTime(1 / hz, t); const s = ctx.createBufferSource(); s.buffer = burst; const g = ctx.createGain(); g.gain.value = ev.velocity; s.connect(g); g.connect(d); s.start(t); s.stop(t + 1 / hz); s.onended = () => { s.disconnect(); g.disconnect(); }; });
      inst.apply = () => { fb.gain.value = inst.params.sustain; lp.frequency.value = inst.params.brightness; out.gain.setTargetAtTime(inst.params.level, now(ctx), 0.01); };
      return inst;
    },
  },
  drum: {
    name: 'Drum Voice', ...SRC,
    params: [P('type', 'Type', 0, 3, 0, { options: ['kick', 'snare', 'hi-hat', 'tom'] }), P('tune', 'Tune (semitones)', -12, 12, 0), P('decay', 'Decay (s)', 0.02, 2, 0.4), P('level', 'Level', 0, 1, 0.8)],
    inputs: [N('trigger', 'Trigger')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const out = gain(inst, 0.8); const noise = noiseBuf(ctx, 1); inst.outputs.out = out;
      const env = (g, peak, t, dec) => { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + dec); };
      const tone = (type, f0, f1, t, dec, peak) => { const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(dec, 0.08)); env(g, peak, t, dec); o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.05); o.onended = () => { o.disconnect(); g.disconnect(); }; };
      const hiss = (hp, t, dec, peak) => { const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ctx.createGain(); env(g, peak, t, dec); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dec + 0.05); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); }; };
      inst.inputs.trigger = noteIn((ev) => {
        if (!ev.on) return; const p = inst.params; const t = now(ctx); const k = Math.pow(2, p.tune / 12); const v = ev.velocity;
        if (p.type === 0) tone('sine', 160 * k, 45 * k, t, p.decay, v);
        else if (p.type === 1) { tone('triangle', 220 * k, 170 * k, t, p.decay * 0.4, v * 0.6); hiss(1200, t, p.decay, v * 0.8); }
        else if (p.type === 2) hiss(7000 * k, t, p.decay * 0.4, v * 0.6);
        else tone('sine', 300 * k, 110 * k, t, p.decay, v);
      });
      inst.apply = () => out.gain.setTargetAtTime(inst.params.level, now(ctx), 0.01);
      return inst;
    },
  },
  fmPair: {
    name: '2-Op FM', ...SRC,
    params: [P('ratio', 'Modulator ratio', 0.25, 12, 2, { step: 0.25 }), P('index', 'Mod depth (index)', 0, 20, 3), P('octave', 'Octave', -3, 3, 0, { step: 1 }), P('level', 'Level', 0, 1, 0.8)],
    inputs: [N('pitch', 'Pitch'), C('indexMod', 'Index mod')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const car = inst.track(ctx.createOscillator()); const mod = inst.track(ctx.createOscillator()); const mg = gain(inst, 0); const cv = gain(inst, 0); const lv = gain(inst, 0);
      mod.connect(mg); mg.connect(car.frequency); cv.connect(mg.gain); car.connect(lv); car.start(); mod.start(); inst.outputs.out = lv; inst.inputs.indexMod = cv; inst.freq = 110;
      inst.apply = () => { const p = inst.params; const t = now(ctx); const hz = inst.freq * Math.pow(2, p.octave); const mh = hz * p.ratio; car.frequency.setTargetAtTime(hz, t, 0.005); mod.frequency.setTargetAtTime(mh, t, 0.005); mg.gain.setTargetAtTime(p.index * mh, t, 0.01); cv.gain.value = 10 * mh; lv.gain.setTargetAtTime(p.level * 0.5, t, 0.01); };
      inst.inputs.pitch = noteIn((ev) => { if (ev.on) { inst.freq = midiHz(ev.note); inst.apply(); } });
      return inst;
    },
  },

  // ======================================================================== extended processing
  delay: {
    name: 'Delay / Echo', ...PROC,
    params: [P('time', 'Time (s)', 0.01, 2, 0.375), P('feedback', 'Feedback', 0, 0.95, 0.4), P('tone', 'Feedback tone (Hz)', 200, 12000, 4000, { log: true }), P('mix', 'Mix', 0, 1, 0.35)],
    inputs: [A('in', 'Audio'), C('timeMod', 'Time mod')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const inp = gain(inst); const dry = gain(inst); const wet = gain(inst); const out = gain(inst); const d = inst.track(ctx.createDelay(3)); const lp = biq(inst, 'lowpass', 4000, 0.5); const fb = gain(inst, 0.4); const tm = gain(inst, 0.01);
      inp.connect(dry); dry.connect(out); inp.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(out); tm.connect(d.delayTime);
      inst.inputs.in = inp; inst.inputs.timeMod = tm; inst.outputs.out = out;
      inst.apply = () => { const p = inst.params; const t = now(ctx); d.delayTime.setTargetAtTime(p.time, t, 0.05); fb.gain.setTargetAtTime(p.feedback, t, 0.01); lp.frequency.setTargetAtTime(p.tone, t, 0.01); wet.gain.setTargetAtTime(p.mix, t, 0.01); dry.gain.setTargetAtTime(1 - p.mix, t, 0.01); };
      return inst;
    },
  },
  reverb: {
    name: 'Reverb', ...PROC,
    params: [P('size', 'Size (s)', 0.2, 8, 2), P('damping', 'Damping', 0, 1, 0.4), P('mix', 'Mix', 0, 1, 0.3)],
    inputs: [A('in', 'Audio')], outputs: [A('out', 'Stereo')],
    create(ctx) {
      const inst = new Instance(this, ctx); const inp = gain(inst); const dry = gain(inst); const wet = gain(inst); const out = gain(inst); const cv = inst.track(ctx.createConvolver());
      inp.connect(dry); dry.connect(out); inp.connect(cv); cv.connect(wet); wet.connect(out); inst.inputs.in = inp; inst.outputs.out = out;
      const ir = (size, damp) => { const n = Math.floor(ctx.sampleRate * size); const b = ctx.createBuffer(2, n, ctx.sampleRate); for (let ch = 0; ch < 2; ch += 1) { const d = b.getChannelData(ch); let y = 0; const a = 0.05 + damp * 0.9; for (let i = 0; i < n; i += 1) { y += a * ((Math.random() * 2 - 1) - y); d[i] = y * Math.pow(1 - i / n, 2.5 + damp * 2) * (1 - damp * 0.5 + (Math.random() - 0.5) * 0.3); } } return b; };
      inst.apply = () => { const p = inst.params; const key = `${p.size.toFixed(2)}|${p.damping.toFixed(2)}`; if (inst.key !== key) { inst.key = key; cv.buffer = ir(p.size, p.damping); } wet.gain.setTargetAtTime(p.mix * 1.5, now(ctx), 0.02); dry.gain.setTargetAtTime(1 - p.mix, now(ctx), 0.02); };
      return inst;
    },
  },
  distortion: {
    name: 'Distortion', ...PROC,
    params: [P('type', 'Type', 0, 3, 0, { options: ['soft clip', 'hard clip', 'wavefold', 'tube'] }), P('drive', 'Drive', 1, 40, 6), P('tone', 'Tone (Hz)', 500, 18000, 6000, { log: true }), P('mix', 'Mix', 0, 1, 1), P('level', 'Level', 0, 1, 0.5)],
    inputs: [A('in', 'Audio')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const inp = gain(inst); const dry = gain(inst); const wet = gain(inst); const out = gain(inst); const ws = inst.track(ctx.createWaveShaper()); ws.oversample = '4x'; const lp = biq(inst, 'lowpass', 6000, 0.5);
      inp.connect(dry); dry.connect(out); inp.connect(ws); ws.connect(lp); lp.connect(wet); wet.connect(out); inst.inputs.in = inp; inst.outputs.out = out;
      const fns = [(x, d) => Math.tanh(x * d), (x, d) => Math.max(-1, Math.min(1, x * d)), (x, d) => Math.sin(x * d * 0.6), (x, d) => (x >= 0 ? Math.tanh(x * d) : Math.tanh(x * d * 0.35) * 1.3)];
      inst.apply = () => { const p = inst.params; const key = `${p.type}|${p.drive}`; if (inst.key !== key) { inst.key = key; const c = new Float32Array(2048); for (let i = 0; i < 2048; i += 1) c[i] = fns[p.type]((i / 2047) * 2 - 1, p.drive); ws.curve = c; } const t = now(ctx); lp.frequency.setTargetAtTime(p.tone, t, 0.01); wet.gain.setTargetAtTime(p.mix, t, 0.01); dry.gain.setTargetAtTime(1 - p.mix, t, 0.01); out.gain.setTargetAtTime(p.level, t, 0.01); };
      return inst;
    },
  },
  bitcrusher: {
    name: 'Bitcrusher', ...PROC,
    params: [P('bits', 'Bit depth', 1, 16, 6, { step: 1 }), P('tone', 'Tone (Hz)', 500, 18000, 8000, { log: true }), P('mix', 'Mix', 0, 1, 1)],
    inputs: [A('in', 'Audio')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const inp = gain(inst); const dry = gain(inst); const wet = gain(inst); const out = gain(inst); const ws = inst.track(ctx.createWaveShaper()); const lp = biq(inst, 'lowpass', 8000, 0.5);
      inp.connect(dry); dry.connect(out); inp.connect(ws); ws.connect(lp); lp.connect(wet); wet.connect(out); inst.inputs.in = inp; inst.outputs.out = out;
      inst.apply = () => { const p = inst.params; if (inst.bits !== p.bits) { inst.bits = p.bits; const L = Math.pow(2, p.bits - 1); const c = new Float32Array(8192); for (let i = 0; i < 8192; i += 1) c[i] = Math.round(((i / 8191) * 2 - 1) * L) / L; ws.curve = c; } const t = now(ctx); lp.frequency.setTargetAtTime(p.tone, t, 0.01); wet.gain.setTargetAtTime(p.mix, t, 0.01); dry.gain.setTargetAtTime(1 - p.mix, t, 0.01); };
      return inst;
    },
  },
  compressor: {
    name: 'Compressor', ...PROC,
    params: [P('threshold', 'Threshold (dB)', -60, 0, -24), P('ratio', 'Ratio', 1, 20, 4), P('attack', 'Attack (s)', 0.001, 1, 0.01, { log: true }), P('release', 'Release (s)', 0.01, 1, 0.25, { log: true }), P('makeup', 'Make-up gain', 0, 4, 1.5)],
    inputs: [A('in', 'Audio')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const c = inst.track(ctx.createDynamicsCompressor()); const mk = gain(inst); c.connect(mk); inst.inputs.in = c; inst.outputs.out = mk;
      inst.apply = () => { const p = inst.params; const t = now(ctx); c.threshold.setTargetAtTime(p.threshold, t, 0.01); c.ratio.setTargetAtTime(p.ratio, t, 0.01); c.attack.value = p.attack; c.release.value = p.release; mk.gain.setTargetAtTime(p.makeup, t, 0.01); };
      return inst;
    },
  },
  eq3: {
    name: '3-Band EQ', ...PROC,
    params: [P('low', 'Low shelf (dB)', -18, 18, 0), P('mid', 'Mid peak (dB)', -18, 18, 0), P('midFreq', 'Mid frequency (Hz)', 200, 6000, 1000, { log: true }), P('high', 'High shelf (dB)', -18, 18, 0)],
    inputs: [A('in', 'Audio')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const lo = biq(inst, 'lowshelf', 200); const mid = biq(inst, 'peaking', 1000, 1); const hi = biq(inst, 'highshelf', 4000); lo.connect(mid); mid.connect(hi); inst.inputs.in = lo; inst.outputs.out = hi;
      inst.apply = () => { const p = inst.params; const t = now(ctx); lo.gain.setTargetAtTime(p.low, t, 0.01); mid.gain.setTargetAtTime(p.mid, t, 0.01); mid.frequency.setTargetAtTime(p.midFreq, t, 0.01); hi.gain.setTargetAtTime(p.high, t, 0.01); };
      return inst;
    },
  },
  ringMod: {
    name: 'Ring Modulator', ...PROC,
    params: [P('source', 'Carrier', 0, 1, 0, { options: ['internal oscillator', 'Mod input'] }), P('freq', 'Internal carrier (Hz)', 1, 4000, 200, { log: true }), P('mix', 'Mix', 0, 1, 1)],
    inputs: [A('in', 'Audio'), A('mod', 'Mod')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const inp = gain(inst); const dry = gain(inst); const wet = gain(inst); const out = gain(inst); const mult = gain(inst, 0); const modIn = gain(inst, 0); const o = inst.track(ctx.createOscillator()); const og = gain(inst, 1);
      inp.connect(dry); dry.connect(out); inp.connect(mult); mult.connect(wet); wet.connect(out); modIn.connect(mult.gain); o.connect(og); og.connect(mult.gain); o.start();
      inst.inputs.in = inp; inst.inputs.mod = modIn; inst.outputs.out = out;
      inst.apply = () => { const p = inst.params; const t = now(ctx); o.frequency.setTargetAtTime(p.freq, t, 0.01); og.gain.value = p.source ? 0 : 1; modIn.gain.value = p.source ? 1 : 0; wet.gain.setTargetAtTime(p.mix, t, 0.01); dry.gain.setTargetAtTime(1 - p.mix, t, 0.01); };
      return inst;
    },
  },
  formant: {
    name: 'Formant (Vowel) Filter', ...PROC,
    params: [P('vowel', 'Vowel', 0, 4, 0, { options: VOWELS.names }), P('resonance', 'Resonance (Q)', 1, 30, 8), P('level', 'Level', 0, 2, 1)],
    inputs: [A('in', 'Audio'), C('vowelMod', 'Vowel mod')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const inp = gain(inst); const out = gain(inst); const mod = gain(inst, 1200);
      const bands = [1, 0.5, 0.25].map((g) => { const f = biq(inst, 'bandpass', 800, 8); const fg = gain(inst, g); inp.connect(f); f.connect(fg); fg.connect(out); mod.connect(f.detune); return f; });
      inst.inputs.in = inp; inst.inputs.vowelMod = mod; inst.outputs.out = out;
      inst.apply = () => { const p = inst.params; const t = now(ctx); bands.forEach((f, i) => { f.frequency.setTargetAtTime(VOWELS.f[p.vowel][i], t, 0.03); f.Q.setTargetAtTime(p.resonance, t, 0.01); }); out.gain.setTargetAtTime(p.level, t, 0.01); };
      return inst;
    },
  },
  panner: {
    name: 'Stereo Panner', ...PROC,
    params: [P('pan', 'Pan (L ↔ R)', -1, 1, 0), P('modDepth', 'Pan mod depth', 0, 1, 1)],
    inputs: [A('in', 'Audio'), C('panMod', 'Pan mod')], outputs: [A('out', 'Stereo')],
    create(ctx) {
      const inst = new Instance(this, ctx); const pn = inst.track(ctx.createStereoPanner()); const mod = gain(inst, 1); mod.connect(pn.pan); inst.inputs.in = pn; inst.inputs.panMod = mod; inst.outputs.out = pn;
      inst.apply = () => { pn.pan.setTargetAtTime(inst.params.pan, now(ctx), 0.01); mod.gain.value = inst.params.modDepth; };
      return inst;
    },
  },
  phaser: {
    name: 'Phaser', ...PROC,
    params: [P('rate', 'Rate (Hz)', 0.05, 10, 0.4, { log: true }), P('depth', 'Depth', 0, 1, 0.7), P('center', 'Centre (Hz)', 200, 4000, 800, { log: true }), P('stages', 'Stages', 2, 8, 4, { step: 2 }), P('mix', 'Mix', 0, 1, 0.5)],
    inputs: [A('in', 'Audio')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const inp = gain(inst); const dry = gain(inst); const wet = gain(inst); const out = gain(inst); const lfo = inst.track(ctx.createOscillator()); lfo.type = 'triangle'; const dep = gain(inst, 0); lfo.connect(dep); lfo.start();
      const aps = [...Array(8)].map(() => { const f = biq(inst, 'allpass', 800, 0.7); dep.connect(f.detune); return f; }); const taps = aps.map(() => gain(inst, 0));
      inp.connect(dry); dry.connect(out); inp.connect(aps[0]); aps.forEach((f, i) => { if (i < 7) f.connect(aps[i + 1]); f.connect(taps[i]); taps[i].connect(wet); }); wet.connect(out);
      inst.inputs.in = inp; inst.outputs.out = out;
      inst.apply = () => { const p = inst.params; const t = now(ctx); lfo.frequency.setTargetAtTime(p.rate, t, 0.02); dep.gain.setTargetAtTime(p.depth * 2400, t, 0.02); aps.forEach((f) => f.frequency.setTargetAtTime(p.center, t, 0.02)); taps.forEach((g, i) => g.gain.setTargetAtTime(i === p.stages - 1 ? 1 : 0, t, 0.01)); wet.gain.setTargetAtTime(p.mix, t, 0.01); dry.gain.setTargetAtTime(1 - p.mix, t, 0.01); };
      return inst;
    },
  },
  tremolo: {
    name: 'Tremolo', ...PROC,
    params: [P('rate', 'Rate (Hz)', 0.1, 30, 5, { log: true }), P('depth', 'Depth', 0, 1, 0.5), P('shape', 'Shape', 0, 3, 0, { options: WAVES })],
    inputs: [A('in', 'Audio')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const g = gain(inst, 1); const lfo = inst.track(ctx.createOscillator()); const dep = gain(inst, 0); lfo.connect(dep); dep.connect(g.gain); lfo.start(); inst.inputs.in = g; inst.outputs.out = g;
      inst.apply = () => { const p = inst.params; const t = now(ctx); lfo.type = WAVES[p.shape]; lfo.frequency.setTargetAtTime(p.rate, t, 0.02); g.gain.setTargetAtTime(1 - p.depth / 2, t, 0.02); dep.gain.setTargetAtTime(p.depth / 2, t, 0.02); };
      return inst;
    },
  },
  comb: {
    name: 'Comb Resonator', ...PROC,
    params: [P('freq', 'Frequency (Hz)', 20, 5000, 220, { log: true }), P('feedback', 'Feedback', 0, 0.98, 0.85), P('damping', 'Damping (Hz)', 500, 15000, 6000, { log: true }), P('mix', 'Mix', 0, 1, 0.6)],
    inputs: [A('in', 'Audio'), N('pitch', 'Tune to note')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const inp = gain(inst); const dry = gain(inst); const wet = gain(inst); const out = gain(inst); const d = inst.track(ctx.createDelay(1)); const fb = gain(inst, 0.85); const lp = biq(inst, 'lowpass', 6000, 0.5);
      inp.connect(dry); dry.connect(out); inp.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(out); inst.inputs.in = inp; inst.outputs.out = out; inst.hz = 220;
      inst.inputs.pitch = noteIn((ev) => { if (ev.on) { inst.hz = midiHz(ev.note); d.delayTime.setTargetAtTime(1 / inst.hz, now(ctx), 0.005); } });
      inst.apply = () => { const p = inst.params; const t = now(ctx); if (inst.lastFreq !== p.freq) { inst.lastFreq = p.freq; inst.hz = p.freq; d.delayTime.setTargetAtTime(1 / p.freq, t, 0.005); } fb.gain.setTargetAtTime(p.feedback, t, 0.01); lp.frequency.setTargetAtTime(p.damping, t, 0.01); wet.gain.setTargetAtTime(p.mix, t, 0.01); dry.gain.setTargetAtTime(1 - p.mix, t, 0.01); };
      return inst;
    },
  },
  crossfader: {
    name: 'Crossfader', ...PROC,
    params: [P('position', 'Position (A ↔ B)', 0, 1, 0.5), P('modDepth', 'CV depth', 0, 1, 1)],
    inputs: [A('a', 'In A'), A('b', 'In B'), C('position', 'Position CV')], outputs: [A('out', 'Audio')],
    create(ctx) {
      const inst = new Instance(this, ctx); const ga = gain(inst, 0.5); const gb = gain(inst, 0.5); const out = gain(inst); const cv = gain(inst, 1); const neg = gain(inst, -1); ga.connect(out); gb.connect(out); cv.connect(gb.gain); cv.connect(neg); neg.connect(ga.gain);
      inst.inputs.a = ga; inst.inputs.b = gb; inst.inputs.position = cv; inst.outputs.out = out;
      inst.apply = () => { const p = inst.params; const t = now(ctx); ga.gain.setTargetAtTime(1 - p.position, t, 0.01); gb.gain.setTargetAtTime(p.position, t, 0.01); cv.gain.value = p.modDepth; };
      return inst;
    },
  },

  // ======================================================================== extended modulation
  sampleHold: {
    name: 'Sample & Hold / Random', ...MOD,
    params: [P('rate', 'Rate (Hz)', 0.1, 50, 4, { log: true }), P('depth', 'Depth', 0, 1, 0.5), P('smooth', 'Smoothing', 0, 1, 0), P('bipolar', 'Range', 0, 1, 1, { options: ['0 … +depth', '−depth … +depth'] })],
    inputs: [], outputs: [C('out', 'CV')],
    create(ctx) {
      const inst = timed(new Instance(this, ctx)); const cs = constSrc(inst, 0); inst.outputs.out = cs;
      const step = () => { const p = inst.params; const v = (p.bipolar ? Math.random() * 2 - 1 : Math.random()) * p.depth; cs.offset.setTargetAtTime(v, now(ctx), 0.001 + (p.smooth / p.rate) / 3); };
      inst.apply = () => { const r = inst.params.rate; if (inst.rate !== r) { inst.rate = r; if (inst.t) inst.clear(inst.t); inst.t = inst.every(1000 / r, step); } };
      return inst;
    },
  },
  cvUtil: {
    name: 'CV Mixer / Offset', ...MOD,
    params: [P('amt1', 'In 1 amount', -2, 2, 1), P('amt2', 'In 2 amount', -2, 2, 1), P('offset', 'Offset', -1, 1, 0)],
    inputs: [C('in1', 'CV 1'), C('in2', 'CV 2')], outputs: [C('out', 'CV')],
    create(ctx) {
      const inst = new Instance(this, ctx); const g1 = gain(inst); const g2 = gain(inst); const out = gain(inst); const off = constSrc(inst, 0); g1.connect(out); g2.connect(out); off.connect(out);
      inst.inputs.in1 = g1; inst.inputs.in2 = g2; inst.outputs.out = out;
      inst.apply = () => { const p = inst.params; const t = now(ctx); g1.gain.setTargetAtTime(p.amt1, t, 0.01); g2.gain.setTargetAtTime(p.amt2, t, 0.01); off.offset.setTargetAtTime(p.offset, t, 0.01); };
      return inst;
    },
  },
  slew: {
    name: 'Slew Limiter (CV glide)', ...MOD,
    params: [P('time', 'Slew time (s)', 0.005, 5, 0.2, { log: true })],
    inputs: [C('in', 'CV')], outputs: [C('out', 'CV')],
    create(ctx) {
      const inst = new Instance(this, ctx); const lp = biq(inst, 'lowpass', 1, 0.5); inst.inputs.in = lp; inst.outputs.out = lp;
      inst.apply = () => lp.frequency.setTargetAtTime(1 / (2 * Math.PI * inst.params.time), now(ctx), 0.01);
      return inst;
    },
  },
  envFollower: {
    name: 'Envelope Follower', ...MOD,
    params: [P('sensitivity', 'Sensitivity', 0, 10, 3), P('speed', 'Response time (s)', 0.005, 1, 0.05, { log: true })],
    inputs: [A('in', 'Audio')], outputs: [C('out', 'CV')],
    create(ctx) {
      const inst = new Instance(this, ctx); const abs = shaper(inst, (x) => Math.abs(x)); const lp = biq(inst, 'lowpass', 20, 0.5); const out = gain(inst, 3); abs.connect(lp); lp.connect(out); inst.inputs.in = abs; inst.outputs.out = out;
      inst.apply = () => { lp.frequency.setTargetAtTime(1 / (2 * Math.PI * inst.params.speed), now(ctx), 0.01); out.gain.setTargetAtTime(inst.params.sensitivity, now(ctx), 0.01); };
      return inst;
    },
  },
  arEnv: {
    name: 'AR Envelope / Looper', ...MOD,
    params: [P('attack', 'Attack (s)', 0.001, 4, 0.05, { log: true }), P('release', 'Release (s)', 0.001, 6, 0.4, { log: true }), P('loop', 'Loop', 0, 1, 0, { options: ['off (gate)', 'on (free-running)'] }), P('amount', 'Amount', 0, 1, 1)],
    inputs: [N('gate', 'Trigger')], outputs: [C('out', 'CV')],
    create(ctx) {
      const inst = timed(new Instance(this, ctx)); const cs = constSrc(inst, 0); inst.outputs.out = cs;
      const fire = () => { const p = inst.params; const t = now(ctx); const o = cs.offset; o.cancelScheduledValues(t); o.setValueAtTime(o.value, t); o.linearRampToValueAtTime(p.amount, t + p.attack); o.setTargetAtTime(0, t + p.attack, p.release / 4); };
      inst.inputs.gate = noteIn((ev) => { if (ev.on && !inst.params.loop) fire(); });
      inst.apply = () => { const p = inst.params; const key = p.loop ? `${p.attack}|${p.release}` : null; if (inst.key !== key) { inst.key = key; if (inst.t) inst.clear(inst.t); inst.t = null; if (key) { fire(); inst.t = inst.every((p.attack + p.release) * 1000, fire); } } };
      return inst;
    },
  },
  lfo2: {
    name: 'LFO with Fade & Offset', ...MOD,
    params: [P('wave', 'Shape', 0, 3, 0, { options: WAVES }), P('rate', 'Rate (Hz)', 0.05, 30, 4, { log: true }), P('depth', 'Depth', 0, 1, 0.5), P('offset', 'Offset', -1, 1, 0), P('fade', 'Fade-in on gate (s)', 0, 5, 0)],
    inputs: [N('gate', 'Retrigger fade')], outputs: [C('out', 'CV')],
    create(ctx) {
      const inst = new Instance(this, ctx); const o = inst.track(ctx.createOscillator()); const dep = gain(inst, 0); const out = gain(inst); const off = constSrc(inst, 0); o.connect(dep); dep.connect(out); off.connect(out); o.start(); inst.outputs.out = out;
      inst.inputs.gate = noteIn((ev) => { const p = inst.params; if (!ev.on || !p.fade) return; const t = now(ctx); dep.gain.cancelScheduledValues(t); dep.gain.setValueAtTime(0, t); dep.gain.linearRampToValueAtTime(p.depth, t + p.fade); });
      inst.apply = () => { const p = inst.params; const t = now(ctx); o.type = WAVES[p.wave]; o.frequency.setTargetAtTime(p.rate, t, 0.02); if (!p.fade) dep.gain.setTargetAtTime(p.depth, t, 0.02); off.offset.setTargetAtTime(p.offset, t, 0.02); };
      return inst;
    },
  },

  // ======================================================================== extended performance (note generators & utilities)
  clock: {
    name: 'Clock / Trigger', ...PERF,
    params: [P('running', 'Running', 0, 1, 0, { options: ['stopped', 'running'] }), P('tempo', 'Tempo (BPM)', 40, 240, 120, { step: 1 }), P('division', 'Division', 0, 4, 1, { options: DIVS }), P('note', 'Note (MIDI)', 24, 96, 60, { step: 1 }), P('gate', 'Gate length', 0.05, 1, 0.5)],
    inputs: [], outputs: [N('note', 'Trigger')],
    create(ctx) {
      const inst = clocked(new Instance(this, ctx), (i, when) => { const p = inst.params; const dur = (60 / p.tempo) * DIV_BEATS[p.division]; fireNote(inst, p.note, 0.9, when, dur * p.gate * 1000); return dur; });
      inst.apply = () => inst.setRunning(inst.params.running === 1);
      return inst;
    },
  },
  euclid: {
    name: 'Euclidean Rhythm', ...PERF,
    params: [P('running', 'Running', 0, 1, 0, { options: ['stopped', 'running'] }), P('tempo', 'Tempo (BPM)', 40, 240, 120, { step: 1 }), P('steps', 'Steps', 1, 16, 8, { step: 1 }), P('hits', 'Hits', 0, 16, 3, { step: 1 }), P('rotate', 'Rotate', 0, 15, 0, { step: 1 }), P('note', 'Note (MIDI)', 24, 96, 36, { step: 1 }), P('gate', 'Gate length', 0.05, 1, 0.5)],
    inputs: [], outputs: [N('note', 'Trigger')],
    create(ctx) {
      const inst = clocked(new Instance(this, ctx), (i, when) => { const p = inst.params; const dur = 60 / p.tempo / 4; const k = (i + p.rotate) % p.steps; const h = Math.min(p.hits, p.steps); if (h && ((k * h) % p.steps) < h) fireNote(inst, p.note, 0.9, when, dur * p.gate * 1000); return dur; });
      inst.apply = () => inst.setRunning(inst.params.running === 1);
      return inst;
    },
  },
  randomNotes: {
    name: 'Random Melody', ...PERF,
    params: [P('running', 'Running', 0, 1, 0, { options: ['stopped', 'running'] }), P('tempo', 'Tempo (BPM)', 40, 240, 110, { step: 1 }), P('scale', 'Scale', 0, 5, 2, { options: SCALES.names }), P('root', 'Root (MIDI)', 24, 84, 48, { step: 1 }), P('range', 'Range (octaves)', 1, 4, 2, { step: 1 }), P('density', 'Density', 0, 1, 0.7), P('gate', 'Gate length', 0.05, 1, 0.5)],
    inputs: [], outputs: [N('note', 'Note')],
    create(ctx) {
      const inst = clocked(new Instance(this, ctx), (i, when) => { const p = inst.params; const dur = 60 / p.tempo / 2; if (Math.random() < p.density) { const sc = SCALES.steps[p.scale]; const deg = Math.floor(Math.random() * sc.length * p.range); fireNote(inst, p.root + Math.floor(deg / sc.length) * 12 + sc[deg % sc.length], 0.5 + Math.random() * 0.5, when, dur * p.gate * 1000); } return dur; });
      inst.apply = () => inst.setRunning(inst.params.running === 1);
      return inst;
    },
  },
  arpeggiator: {
    name: 'Arpeggiator', ...PERF,
    params: [P('mode', 'Mode', 0, 3, 0, { options: ['up', 'down', 'up-down', 'random'] }), P('tempo', 'Tempo (BPM)', 40, 240, 120, { step: 1 }), P('division', 'Division', 0, 4, 2, { options: DIVS }), P('octaves', 'Octaves', 1, 4, 2, { step: 1 }), P('gate', 'Gate length', 0.05, 1, 0.5)],
    inputs: [N('in', 'Notes (held)')], outputs: [N('note', 'Note')],
    create(ctx) {
      const held = new Set();
      const inst = clocked(new Instance(this, ctx), (i, when) => { const p = inst.params; const dur = (60 / p.tempo) * DIV_BEATS[p.division]; const base = [...held].sort((a, b) => a - b); const pool = []; for (let o = 0; o < p.octaves; o += 1) base.forEach((n) => pool.push(n + o * 12)); if (!pool.length) return dur; let n; if (p.mode === 3) n = pool[Math.floor(Math.random() * pool.length)]; else if (p.mode === 2 && pool.length > 1) { const cyc = pool.concat(pool.slice(1, -1).reverse()); n = cyc[i % cyc.length]; } else n = pool[p.mode === 1 ? pool.length - 1 - (i % pool.length) : i % pool.length]; fireNote(inst, n, 0.9, when, dur * p.gate * 1000); return dur; });
      inst.inputs.in = noteIn((ev) => { if (ev.on) { held.add(ev.note); inst.setRunning(true); } else { held.clear(); inst.setRunning(false); } });
      inst.apply = () => {};
      return inst;
    },
  },
  chord: {
    name: 'Chord (4 voices)', ...PERF,
    params: [P('v2', 'Voice 2 (semitones)', -24, 24, 4, { step: 1 }), P('v3', 'Voice 3 (semitones)', -24, 24, 7, { step: 1 }), P('v4', 'Voice 4 (semitones)', -24, 24, 12, { step: 1 })],
    inputs: [N('in', 'Note')], outputs: [N('n1', 'Root'), N('n2', 'Voice 2'), N('n3', 'Voice 3'), N('n4', 'Voice 4')],
    create(ctx) {
      const inst = new Instance(this, ctx);
      inst.inputs.in = noteIn((ev) => { const p = inst.params; [0, p.v2, p.v3, p.v4].forEach((s, i) => inst.emit(`n${i + 1}`, { ...ev, note: ev.note + s })); });
      inst.apply = () => {};
      return inst;
    },
  },
  noteUtil: {
    name: 'Note Transpose / Velocity', ...PERF,
    params: [P('transpose', 'Transpose (semitones)', -36, 36, 0, { step: 1 }), P('velScale', 'Velocity scale', 0, 2, 1), P('fixedVel', 'Fixed velocity (0 = off)', 0, 1, 0)],
    inputs: [N('in', 'Note')], outputs: [N('note', 'Note')],
    create(ctx) {
      const inst = new Instance(this, ctx);
      inst.inputs.in = noteIn((ev) => { const p = inst.params; inst.emit('note', { ...ev, note: ev.note + p.transpose, velocity: ev.on ? Math.min(1, p.fixedVel || ev.velocity * p.velScale) : 0 }); });
      inst.apply = () => {};
      return inst;
    },
  },
  noteEcho: {
    name: 'Note Echo', ...PERF,
    params: [P('time', 'Time (s)', 0.05, 2, 0.3), P('repeats', 'Repeats', 1, 8, 3, { step: 1 }), P('decay', 'Velocity decay', 0, 1, 0.6), P('transpose', 'Transpose per repeat', -12, 12, 0, { step: 1 })],
    inputs: [N('in', 'Note')], outputs: [N('note', 'Note')],
    create(ctx) {
      const inst = timed(new Instance(this, ctx));
      inst.inputs.in = noteIn((ev) => { if (!ev.on) return; const p = inst.params; for (let k = 0; k <= p.repeats; k += 1) fireNote(inst, ev.note + k * p.transpose, ev.velocity * Math.pow(p.decay, k), k * p.time * 1000, p.time * 500); });
      inst.apply = () => {};
      return inst;
    },
  },
};

export const CATEGORIES = ['Performance', 'Sources', 'Processing', 'Modulation', 'Instrument modules', 'Output'];
export const SIGNAL_COLORS = { audio: '#ff9f0a', cv: '#7de4ff', note: '#82e6a8' };
