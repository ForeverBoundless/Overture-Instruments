/** omni/templates.js - starter patches. Compact DSL: modules [id,type,col,row,params?], wires 'a.port>b.port'. */
import { MODULES, SIGNAL_COLORS } from './modules.js';
import { defaultParams, SCHEMA } from './graph.js';

const CX = 260, CY = 210;
const T = (name, desc, mods, wires, master = 0.8) => ({ name, desc, mods, wires, master });
const env = (a, d, s, r, amount) => ({ attack: a, decay: d, sustain: s, release: r, ...(amount !== undefined && { amount }) });
const lfo = (wave, rate, depth) => ({ wave, rate, depth });

const DEFS = [
  T('Classic Subtractive', 'Keyboard → saw → filter → VCA with two envelopes.',
    [['kb', 'keyboard', 0, 1], ['osc', 'oscillator', 1, 0, { wave: 2 }], ['env', 'envelope', 1, 1], ['flt', 'filter', 2, 0, { cutoff: 2400, resonance: 3 }], ['fenv', 'envelope', 2, 1, env(0.02, 0.6, 0.2, 0.5)], ['vca', 'vca', 3, 0], ['out', 'output', 4, 0]],
    ['kb.note>osc.pitch', 'kb.note>env.gate', 'kb.note>fenv.gate', 'osc.out>flt.in', 'fenv.out>flt.cutoffMod', 'flt.out>vca.in', 'env.out>vca.gain', 'vca.out>out.in']),
  T('Fat Mono Bass', 'Saw + sub oscillator through a ladder filter and tube drive.',
    [['kb', 'keyboard', 0, 1], ['osc', 'oscillator', 1, 0, { wave: 2, octave: -1, glide: 0.05 }], ['sub', 'subOsc', 1, 1, { wave: 1, octave: 1 }], ['env', 'envelope', 1, 2, env(0.005, 0.3, 0.6, 0.2)], ['mix', 'mixer', 2, 0], ['fenv', 'envelope', 2, 2, env(0.005, 0.25, 0.1, 0.2)], ['lad', 'ladder', 3, 0, { cutoff: 400, resonance: 0.5, drive: 0.5, slope: 3, modDepth: 3000 }], ['vca', 'vca', 4, 0], ['dst', 'distortion', 4, 1, { type: 3, drive: 3, mix: 0.5 }], ['out', 'output', 5, 1]],
    ['kb.note>osc.pitch', 'kb.note>sub.pitch', 'kb.note>env.gate', 'kb.note>fenv.gate', 'osc.out>mix.in1', 'sub.out>mix.in2', 'mix.out>lad.in', 'fenv.out>lad.cutoffMod', 'lad.out>vca.in', 'env.out>vca.gain', 'vca.out>dst.in', 'dst.out>out.in']),
  T('Supersaw Pad', 'Detuned supersaw, slow LFO on the filter, Juno chorus and reverb.',
    [['kb', 'keyboard', 0, 1], ['ss', 'supersaw', 1, 0, { voices: 7, detune: 30 }], ['env', 'envelope', 1, 1, env(1.2, 1, 0.8, 2)], ['lfo', 'lfo', 1, 2, lfo(0, 0.15, 0.4)], ['flt', 'filter', 2, 0, { cutoff: 1500, resonance: 1.5 }], ['vca', 'vca', 3, 0], ['cho', 'junoChorus', 4, 0, { mode: 2 }], ['rev', 'reverb', 4, 1, { size: 4, mix: 0.45 }], ['out', 'output', 5, 1]],
    ['kb.note>ss.pitch', 'kb.note>env.gate', 'ss.out>flt.in', 'lfo.out>flt.cutoffMod', 'flt.out>vca.in', 'env.out>vca.gain', 'vca.out>cho.in', 'cho.out>rev.in', 'rev.out>out.in'], 0.6),
  T('FM Electric Piano', 'Six-operator FM voice with a touch of chorus and room.',
    [['kb', 'keyboard', 0, 0], ['fm', 'fmVoice', 1, 0, { preset: 0 }], ['cho', 'junoChorus', 2, 0, { mode: 1 }], ['rev', 'reverb', 3, 0, { size: 2.5, mix: 0.25 }], ['out', 'output', 4, 0]],
    ['kb.note>fm.note', 'fm.out>cho.in', 'cho.out>rev.in', 'rev.out>out.in']),
  T('Plucked String', 'Karplus-Strong pluck into a dotted delay and hall.',
    [['kb', 'keyboard', 0, 0], ['plk', 'pluck', 1, 0, { sustain: 0.995, brightness: 6000 }], ['dly', 'delay', 2, 0, { time: 0.375, feedback: 0.45, mix: 0.3 }], ['rev', 'reverb', 3, 0, { size: 3, mix: 0.35 }], ['out', 'output', 4, 0]],
    ['kb.note>plk.pitch', 'plk.out>dly.in', 'dly.out>rev.in', 'rev.out>out.in']),
  T('Acid Sequence', 'Running step sequencer → saw → MS-20 filter with snappy envelope, drive and delay.',
    [['seq', 'sequencer', 0, 1, { running: 1, tempo: 130, gate: 0.4, root: 36, step1: 0, step2: 0, step3: 12, step4: 0, step5: 3, step6: 0, step7: 10, step8: 12 }], ['osc', 'oscillator', 1, 0, { wave: 2, glide: 0.04 }], ['fenv', 'envelope', 1, 1, env(0.003, 0.2, 0, 0.1)], ['env', 'envelope', 1, 2, env(0.003, 0.25, 0.3, 0.1)], ['ms', 'ms20filter', 2, 0, { lpCutoff: 500, lpPeak: 8, hpCutoff: 60, modDepth: 3 }], ['vca', 'vca', 3, 0], ['dst', 'distortion', 3, 1, { type: 0, drive: 4, mix: 0.4 }], ['dly', 'delay', 4, 1, { time: 0.23, feedback: 0.35, mix: 0.25 }], ['out', 'output', 5, 1]],
    ['seq.note>osc.pitch', 'seq.note>fenv.gate', 'seq.note>env.gate', 'osc.out>ms.in', 'fenv.out>ms.cutoffMod', 'ms.out>vca.in', 'env.out>vca.gain', 'vca.out>dst.in', 'dst.out>dly.in', 'dly.out>out.in']),
  T('Drum Machine', 'Euclidean kick and snare, clocked hats, mixed and compressed.',
    [['ek', 'euclid', 0, 0, { running: 1, tempo: 120, steps: 8, hits: 4 }], ['es', 'euclid', 0, 1, { running: 1, tempo: 120, steps: 8, hits: 2, rotate: 2 }], ['ch', 'clock', 0, 2, { running: 1, tempo: 120, division: 2, gate: 0.3 }], ['et', 'euclid', 0, 3, { running: 1, tempo: 120, steps: 16, hits: 3, rotate: 5 }], ['kick', 'drum', 1, 0, { type: 0, decay: 0.5 }], ['snr', 'drum', 1, 1, { type: 1, decay: 0.3 }], ['hat', 'drum', 1, 2, { type: 2, decay: 0.08, level: 0.5 }], ['tom', 'drum', 1, 3, { type: 3, tune: -3, decay: 0.4 }], ['mix', 'mixer', 2, 1], ['cmp', 'compressor', 3, 1, { threshold: -18, ratio: 4 }], ['out', 'output', 4, 1]],
    ['ek.note>kick.trigger', 'es.note>snr.trigger', 'ch.note>hat.trigger', 'et.note>tom.trigger', 'kick.out>mix.in1', 'snr.out>mix.in2', 'hat.out>mix.in3', 'tom.out>mix.in4', 'mix.out>cmp.in', 'cmp.out>out.in']),
  T('Arpeggio Dream', 'Hold a chord: up-down arpeggiator into square wave, filter, delay and reverb.',
    [['kb', 'keyboard', 0, 0], ['arp', 'arpeggiator', 1, 0, { mode: 2, tempo: 128, division: 2, octaves: 2, gate: 0.4 }], ['osc', 'oscillator', 2, 0, { wave: 3, pulseWidth: 0.3 }], ['env', 'envelope', 2, 1, env(0.003, 0.25, 0.2, 0.3)], ['flt', 'filter', 3, 0, { cutoff: 3000, resonance: 2 }], ['vca', 'vca', 4, 0], ['dly', 'delay', 4, 1, { time: 0.35, feedback: 0.5, mix: 0.4 }], ['rev', 'reverb', 5, 1, { size: 3, mix: 0.3 }], ['out', 'output', 6, 1]],
    ['kb.note>arp.in', 'arp.note>osc.pitch', 'arp.note>env.gate', 'osc.out>flt.in', 'flt.out>vca.in', 'env.out>vca.gain', 'vca.out>dly.in', 'dly.out>rev.in', 'rev.out>out.in']),
  T('Four-Voice Chord', 'One key plays a minor-7th chord across four oscillators.',
    [['kb', 'keyboard', 0, 1], ['chd', 'chord', 1, 1, { v2: 3, v3: 7, v4: 10 }], ['o1', 'oscillator', 2, 0, { wave: 2 }], ['o2', 'oscillator', 2, 1, { wave: 2, detune: 6 }], ['o3', 'oscillator', 2, 2, { wave: 2, detune: -6 }], ['o4', 'oscillator', 2, 3, { wave: 1 }], ['env', 'envelope', 3, 2, env(0.4, 0.8, 0.7, 1.2)], ['mix', 'mixer', 3, 0, { level1: 0.5, level2: 0.5, level3: 0.5, level4: 0.5 }], ['flt', 'filter', 4, 0, { cutoff: 1800 }], ['vca', 'vca', 5, 0], ['cho', 'junoChorus', 6, 0, { mode: 1 }], ['out', 'output', 7, 0]],
    ['kb.note>chd.in', 'kb.note>env.gate', 'chd.n1>o1.pitch', 'chd.n2>o2.pitch', 'chd.n3>o3.pitch', 'chd.n4>o4.pitch', 'o1.out>mix.in1', 'o2.out>mix.in2', 'o3.out>mix.in3', 'o4.out>mix.in4', 'mix.out>flt.in', 'flt.out>vca.in', 'env.out>vca.gain', 'vca.out>cho.in', 'cho.out>out.in'], 0.7),
  T('Generative Music Box', 'Random pentatonic notes, echoed, on an FM pair that drifts across the stereo field.',
    [['rnd', 'randomNotes', 0, 0, { running: 1, tempo: 90, scale: 2, root: 60, range: 2, density: 0.5 }], ['echo', 'noteEcho', 1, 0, { time: 0.333, repeats: 2, decay: 0.5, transpose: 12 }], ['fm', 'fmPair', 2, 0, { ratio: 3.5, index: 2 }], ['env', 'envelope', 2, 1, env(0.002, 0.8, 0, 0.6)], ['vca', 'vca', 3, 0], ['lfo', 'lfo', 3, 1, lfo(1, 0.2, 0.8)], ['pan', 'panner', 4, 0], ['dly', 'delay', 5, 0, { time: 0.5, feedback: 0.4, mix: 0.3 }], ['rev', 'reverb', 6, 0, { size: 4, mix: 0.5 }], ['out', 'output', 7, 0]],
    ['rnd.note>echo.in', 'echo.note>fm.pitch', 'echo.note>env.gate', 'fm.out>vca.in', 'env.out>vca.gain', 'vca.out>pan.in', 'lfo.out>pan.panMod', 'pan.out>dly.in', 'dly.out>rev.in', 'rev.out>out.in']),
  T('Wind & Rain', 'Self-playing noise drone: S&H and slow LFOs sweep a resonant band-pass.',
    [['nz', 'noise', 0, 0, { color: 1 }], ['sh', 'sampleHold', 0, 1, { rate: 0.5, depth: 0.6, smooth: 0.8 }], ['lfo', 'lfo', 0, 2, lfo(0, 0.07, 0.6)], ['flt', 'filter', 1, 0, { type: 2, cutoff: 800, resonance: 12, modDepth: 2.5 }], ['sum', 'cvUtil', 1, 1, { offset: 0.5 }], ['vca', 'vca', 2, 0, { initial: 0.2 }], ['rev', 'reverb', 3, 0, { size: 5, mix: 0.5 }], ['out', 'output', 4, 0]],
    ['nz.out>flt.in', 'sh.out>flt.cutoffMod', 'lfo.out>sum.in1', 'sum.out>vca.gain', 'flt.out>vca.in', 'vca.out>rev.in', 'rev.out>out.in'], 0.6),
  T('Vowel Synth', 'Saw through a formant filter whose vowel is swept by an LFO.',
    [['kb', 'keyboard', 0, 1], ['osc', 'oscillator', 1, 0, { wave: 2 }], ['env', 'envelope', 1, 1, env(0.05, 0.3, 0.8, 0.4)], ['lfo', 'lfo', 1, 2, lfo(1, 0.3, 1)], ['fmt', 'formant', 2, 0, { vowel: 0, resonance: 10 }], ['vca', 'vca', 3, 0], ['rev', 'reverb', 4, 0, { mix: 0.25 }], ['out', 'output', 5, 0]],
    ['kb.note>osc.pitch', 'kb.note>env.gate', 'osc.out>fmt.in', 'lfo.out>fmt.vowelMod', 'fmt.out>vca.in', 'env.out>vca.gain', 'vca.out>rev.in', 'rev.out>out.in']),
  T('Wobble Bass', 'Two detuned oscillators, ladder filter wobbled by a tempo-ish square LFO.',
    [['kb', 'keyboard', 0, 1], ['o1', 'oscillator', 1, 0, { wave: 2, octave: -1 }], ['o2', 'oscillator', 1, 1, { wave: 3, octave: -1, detune: 12 }], ['env', 'envelope', 1, 2, env(0.01, 0.2, 0.9, 0.2)], ['mix', 'mixer', 2, 0], ['lfo', 'lfo2', 2, 2, { wave: 1, rate: 3, depth: 1, fade: 0.1 }], ['lad', 'ladder', 3, 0, { cutoff: 300, resonance: 0.6, drive: 0.4, modDepth: 2500 }], ['vca', 'vca', 4, 0], ['dst', 'distortion', 5, 0, { type: 0, drive: 3, mix: 0.3 }], ['out', 'output', 6, 0]],
    ['kb.note>o1.pitch', 'kb.note>o2.pitch', 'kb.note>env.gate', 'kb.note>lfo.gate', 'o1.out>mix.in1', 'o2.out>mix.in2', 'mix.out>lad.in', 'lfo.out>lad.cutoffMod', 'lad.out>vca.in', 'env.out>vca.gain', 'vca.out>dst.in', 'dst.out>out.in']),
  T('Drawbar Organ', 'Additive harmonics with rotary-style tremolo and phaser, instant attack.',
    [['kb', 'keyboard', 0, 0], ['add', 'additive', 1, 0, { h1: 1, h2: 0.8, h3: 0.6, h4: 0.3, h5: 0, h6: 0.4, h7: 0, h8: 0.5 }], ['env', 'envelope', 1, 1, env(0.003, 0.05, 1, 0.05)], ['vca', 'vca', 2, 0], ['trm', 'tremolo', 3, 0, { rate: 6, depth: 0.35 }], ['phs', 'phaser', 4, 0, { rate: 0.8, depth: 0.5, mix: 0.4 }], ['out', 'output', 5, 0]],
    ['kb.note>add.pitch', 'kb.note>env.gate', 'add.out>vca.in', 'env.out>vca.gain', 'vca.out>trm.in', 'trm.out>phs.in', 'phs.out>out.in']),
  T('Lo-fi Keys', 'FM glass keys crushed to 8 bits, EQ scooped, with wow-style tremolo.',
    [['kb', 'keyboard', 0, 0], ['fm', 'fmVoice', 1, 0, { preset: 0, brightness: 0.7 }], ['bc', 'bitcrusher', 2, 0, { bits: 8, tone: 5000, mix: 0.8 }], ['eq', 'eq3', 3, 0, { low: 3, mid: -4, high: -6 }], ['trm', 'tremolo', 4, 0, { rate: 0.6, depth: 0.2 }], ['rev', 'reverb', 5, 0, { size: 2, damping: 0.7, mix: 0.3 }], ['out', 'output', 6, 0]],
    ['kb.note>fm.note', 'fm.out>bc.in', 'bc.out>eq.in', 'eq.out>trm.in', 'trm.out>rev.in', 'rev.out>out.in']),
  T('Ring-Mod Bells', 'Sine oscillator ring-modulated at a fixed frequency for metallic bell tones.',
    [['kb', 'keyboard', 0, 0], ['osc', 'oscillator', 1, 0, { wave: 0 }], ['env', 'envelope', 1, 1, env(0.002, 1.5, 0, 1.2)], ['rm', 'ringMod', 2, 0, { freq: 311 }], ['vca', 'vca', 3, 0], ['dly', 'delay', 4, 0, { time: 0.4, feedback: 0.4, mix: 0.3 }], ['rev', 'reverb', 5, 0, { size: 4, mix: 0.4 }], ['out', 'output', 6, 0]],
    ['kb.note>osc.pitch', 'kb.note>env.gate', 'osc.out>rm.in', 'rm.out>vca.in', 'env.out>vca.gain', 'vca.out>dly.in', 'dly.out>rev.in', 'rev.out>out.in']),
  T('Noise Burst Resonator', 'Short noise bursts excite a comb filter tuned to the played note.',
    [['kb', 'keyboard', 0, 1], ['nz', 'noise', 1, 0], ['ar', 'arEnv', 1, 1, { attack: 0.001, release: 0.03 }], ['vca', 'vca', 2, 0], ['cmb', 'comb', 3, 0, { feedback: 0.97, damping: 5000, mix: 1 }], ['rev', 'reverb', 4, 0, { mix: 0.3 }], ['out', 'output', 5, 0]],
    ['kb.note>ar.gate', 'kb.note>cmb.pitch', 'nz.out>vca.in', 'ar.out>vca.gain', 'vca.out>cmb.in', 'cmb.out>rev.in', 'rev.out>out.in']),
  T('Sidechain Pump', 'Four-on-the-floor kick ducks a supersaw pad via envelope follower → inverted CV.',
    [['ek', 'euclid', 0, 0, { running: 1, tempo: 124, steps: 4, hits: 4 }], ['kick', 'drum', 1, 0, { type: 0, decay: 0.4 }], ['flw', 'envFollower', 2, 0, { sensitivity: 4, speed: 0.08 }], ['inv', 'cvUtil', 3, 0, { amt1: -1, offset: 1 }], ['kb', 'keyboard', 0, 2], ['ss', 'supersaw', 1, 2, { detune: 20 }], ['env', 'envelope', 1, 3, env(0.3, 0.5, 0.9, 0.8)], ['flt', 'filter', 2, 2, { cutoff: 1800 }], ['v1', 'vca', 3, 2], ['duck', 'vca', 4, 1], ['mix', 'mixer', 5, 0], ['out', 'output', 6, 0]],
    ['ek.note>kick.trigger', 'kick.out>flw.in', 'flw.out>inv.in1', 'kb.note>ss.pitch', 'kb.note>env.gate', 'ss.out>flt.in', 'flt.out>v1.in', 'env.out>v1.gain', 'v1.out>duck.in', 'inv.out>duck.gain', 'duck.out>mix.in1', 'kick.out>mix.in2', 'mix.out>out.in'], 0.7),
  T('Dub Echo Chords', 'Clock-triggered stabs with note echo, wobbly delay time and big reverb.',
    [['clk', 'clock', 0, 0, { running: 1, tempo: 70, division: 0, note: 55, gate: 0.2 }], ['echo', 'noteEcho', 1, 0, { time: 0.43, repeats: 3, decay: 0.6, transpose: 7 }], ['chd', 'chord', 2, 0, { v2: 3, v3: 7, v4: 10 }], ['o1', 'oscillator', 3, 0, { wave: 3, pulseWidth: 0.4 }], ['o2', 'oscillator', 3, 1, { wave: 3, pulseWidth: 0.4, detune: 5 }], ['o3', 'oscillator', 3, 2, { wave: 3, pulseWidth: 0.4, detune: -5 }], ['ar', 'arEnv', 2, 2, { attack: 0.005, release: 0.3 }], ['mix', 'mixer', 4, 0, { level1: 0.5, level2: 0.5, level3: 0.5 }], ['flt', 'filter', 4, 1, { cutoff: 1200, resonance: 2 }], ['vca', 'vca', 5, 1], ['lfo', 'lfo', 5, 2, lfo(0, 0.3, 0.02)], ['dly', 'delay', 6, 1, { time: 0.43, feedback: 0.6, tone: 2500, mix: 0.5 }], ['rev', 'reverb', 7, 1, { size: 5, mix: 0.4 }], ['out', 'output', 8, 1]],
    ['clk.note>echo.in', 'echo.note>chd.in', 'echo.note>ar.gate', 'chd.n1>o1.pitch', 'chd.n2>o2.pitch', 'chd.n3>o3.pitch', 'o1.out>mix.in1', 'o2.out>mix.in2', 'o3.out>mix.in3', 'mix.out>flt.in', 'flt.out>vca.in', 'ar.out>vca.gain', 'vca.out>dly.in', 'lfo.out>dly.timeMod', 'dly.out>rev.in', 'rev.out>out.in'], 0.7),
  T('S&H Bleeps', 'Sixteenth-note clock gates a sine whose pitch is stepped by sample & hold.',
    [['clk', 'clock', 0, 0, { running: 1, tempo: 110, division: 2, note: 72, gate: 0.3 }], ['sh', 'sampleHold', 0, 1, { rate: 7.33, depth: 1, bipolar: 1 }], ['osc', 'oscillator', 1, 0, { wave: 0, modDepth: 12 }], ['ar', 'arEnv', 1, 1, { attack: 0.002, release: 0.12 }], ['vca', 'vca', 2, 0], ['pan', 'panner', 3, 0], ['lfo', 'lfo', 3, 1, lfo(3, 1.83, 0.8)], ['dly', 'delay', 4, 0, { time: 0.41, feedback: 0.5, mix: 0.4 }], ['out', 'output', 5, 0]],
    ['clk.note>osc.pitch', 'clk.note>ar.gate', 'sh.out>osc.pitchMod', 'osc.out>vca.in', 'ar.out>vca.gain', 'vca.out>pan.in', 'lfo.out>pan.panMod', 'pan.out>dly.in', 'dly.out>out.in']),
  T('Brass Stab', 'Two detuned saws, ladder filter with a slow-ish attack envelope, compressed.',
    [['kb', 'keyboard', 0, 1], ['o1', 'oscillator', 1, 0, { wave: 2 }], ['o2', 'oscillator', 1, 1, { wave: 2, detune: 8 }], ['env', 'envelope', 1, 2, env(0.08, 0.3, 0.8, 0.3)], ['mix', 'mixer', 2, 0], ['fenv', 'envelope', 2, 2, env(0.12, 0.4, 0.4, 0.3)], ['lad', 'ladder', 3, 0, { cutoff: 600, resonance: 0.2, drive: 0.3, modDepth: 4000 }], ['vca', 'vca', 4, 0], ['cmp', 'compressor', 5, 0, { threshold: -20, ratio: 6 }], ['out', 'output', 6, 0]],
    ['kb.note>o1.pitch', 'kb.note>o2.pitch', 'kb.note>env.gate', 'kb.note>fenv.gate', 'o1.out>mix.in1', 'o2.out>mix.in2', 'mix.out>lad.in', 'fenv.out>lad.cutoffMod', 'lad.out>vca.in', 'env.out>vca.gain', 'vca.out>cmp.in', 'cmp.out>out.in']),
  T('Crossfade Morph', 'LFO crossfades between a saw and an additive tone before the filter.',
    [['kb', 'keyboard', 0, 1], ['osc', 'oscillator', 1, 0, { wave: 2 }], ['add', 'additive', 1, 1, { h1: 1, h2: 0, h3: 0.6, h4: 0, h5: 0.4, h6: 0, h7: 0.3, h8: 0 }], ['env', 'envelope', 1, 2, env(0.2, 0.4, 0.7, 0.8)], ['lfo', 'lfo', 2, 1, lfo(1, 0.25, 0.5)], ['xf', 'crossfader', 2, 0], ['flt', 'filter', 3, 0, { cutoff: 2500 }], ['vca', 'vca', 4, 0], ['rev', 'reverb', 5, 0, { mix: 0.3 }], ['out', 'output', 6, 0]],
    ['kb.note>osc.pitch', 'kb.note>add.pitch', 'kb.note>env.gate', 'osc.out>xf.a', 'add.out>xf.b', 'lfo.out>xf.position', 'xf.out>flt.in', 'flt.out>vca.in', 'env.out>vca.gain', 'vca.out>rev.in', 'rev.out>out.in']),
  T('Velocity Pluck', 'Keyboard velocity opens the filter; glide and slew for a smooth lead.',
    [['kb', 'keyboard', 0, 1], ['osc', 'oscillator', 1, 0, { wave: 1, glide: 0.08 }], ['env', 'envelope', 1, 1, env(0.005, 0.4, 0.3, 0.3)], ['slw', 'slew', 1, 2, { time: 0.05 }], ['flt', 'filter', 2, 0, { cutoff: 600, resonance: 4, modDepth: 3 }], ['vca', 'vca', 3, 0], ['dly', 'delay', 4, 0, { time: 0.3, feedback: 0.3, mix: 0.2 }], ['out', 'output', 5, 0]],
    ['kb.note>osc.pitch', 'kb.note>env.gate', 'kb.velocity>slw.in', 'slw.out>flt.cutoffMod', 'osc.out>flt.in', 'flt.out>vca.in', 'env.out>vca.gain', 'vca.out>dly.in', 'dly.out>out.in']),
  T('Empty Canvas', 'Just an Audio Output - build from scratch.', [['out', 'output', 2, 0]], []),
];

/** Expands a compact definition into a schema-1 patch. */
export function buildTemplate(def) {
  const modules = def.mods.map(([id, type, c, r, params]) => ({ id, type, x: 40 + c * CX, y: 40 + r * CY, params: { ...defaultParams(type), ...(params || {}) } }));
  const connections = def.wires.map((w, i) => { const [a, b] = w.split('>'); const [am, ap] = a.split('.'); const [bm, bp] = b.split('.'); return { id: `t${i}`, from: { module: am, port: ap }, to: { module: bm, port: bp } }; });
  return { schema: SCHEMA, name: def.name, modules, connections, global: { master: def.master } };
}

export const TEMPLATES = DEFS.map((d) => ({ name: d.name, desc: d.desc, patch: buildTemplate(d) }));

/** Small dark-theme SVG preview of a patch (modules as colour blocks, wires as curves). */
export function templatePreview(patch, W = 240, H = 120) {
  const BW = 180, BH = (m) => 52 + Math.max(MODULES[m.type].inputs.length, MODULES[m.type].outputs.length) * 18;
  const maxX = Math.max(...patch.modules.map((m) => m.x + BW)) + 40, maxY = Math.max(...patch.modules.map((m) => m.y + BH(m))) + 40;
  const byId = Object.fromEntries(patch.modules.map((m) => [m.id, m]));
  const port = (m, id, dir) => { const i = MODULES[m.type][dir].findIndex((p) => p.id === id); return [m.x + (dir === 'inputs' ? 0 : BW), m.y + 40 + i * 18]; };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX} ${maxY}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet">`;
  patch.connections.forEach((c) => { const a = byId[c.from.module], b = byId[c.to.module]; const [x1, y1] = port(a, c.from.port, 'outputs'); const [x2, y2] = port(b, c.to.port, 'inputs'); const t = MODULES[a.type].outputs.find((p) => p.id === c.from.port).type; s += `<path d="M${x1} ${y1} C ${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}" fill="none" stroke="${SIGNAL_COLORS[t]}" stroke-width="4" opacity=".85"/>`; });
  patch.modules.forEach((m) => { s += `<rect x="${m.x}" y="${m.y}" width="${BW}" height="${BH(m)}" rx="10" fill="#141c25" stroke="${MODULES[m.type].color}" stroke-width="4"/><rect x="${m.x}" y="${m.y}" width="${BW}" height="22" rx="10" fill="${MODULES[m.type].color}"/><text x="${m.x + 10}" y="${m.y + 48}" fill="#dfe7f1" font-family="DM Mono, monospace" font-size="20">${MODULES[m.type].name}</text>`; });
  return `${s}</svg>`;
}
