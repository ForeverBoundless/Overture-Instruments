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
};

export const CATEGORIES = ['Performance', 'Sources', 'Processing', 'Modulation', 'Instrument modules', 'Output'];
export const SIGNAL_COLORS = { audio: '#ff9f0a', cv: '#7de4ff', note: '#82e6a8' };
