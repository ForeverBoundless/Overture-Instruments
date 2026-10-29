/**
 * experiments/labs.js - Overture Experiments: four interactive sound labs sharing
 * one audio/visualisation kit. The lab is chosen by <body data-lab="...">.
 * Visualisations are labelled honestly: "measured" plots come from an
 * AnalyserNode on the live signal, "theoretical" plots are computed from the
 * parameters.
 */
const el = (tag, cls, parent, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; if (parent) parent.appendChild(n); return n; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const hzToNote = (hz) => { const m = 69 + 12 * Math.log2(hz / 440); const r = Math.round(m); return `${NOTE[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1} ${(m - r) * 100 >= 0 ? '+' : ''}${((m - r) * 100).toFixed(0)}¢`; };

/** Shared audio: one context created on first Play. */
class Audio {
  constructor() { this.ctx = null; this.master = null; this.analyser = null; }
  async ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = 0.6;
    this.master.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    await this.ctx.resume(); return this.ctx;
  }
}

/** Control builders. */
function slider(parent, { label, min, max, value, step = 0.001, unit = '', log = false, format, onInput }) {
  const row = el('label', 'lab-control', parent);
  const top = el('div', 'lab-control-head', row); el('span', '', top, label); const out = el('output', '', top);
  const input = el('input', '', row); input.type = 'range'; input.min = log ? Math.log(min) : min; input.max = log ? Math.log(max) : max; input.step = log ? 0.0005 : step; input.value = log ? Math.log(value) : value;
  const read = () => (log ? Math.exp(Number(input.value)) : Number(input.value));
  const show = () => { out.textContent = (format ? format(read()) : `${read().toFixed(step >= 1 ? 0 : 2)} ${unit}`).trim(); };
  input.addEventListener('input', () => { show(); onInput(read()); });
  show();
  return { get value() { return read(); }, set(v) { input.value = log ? Math.log(v) : v; show(); onInput(read()); }, input };
}
function choice(parent, { label, options, value, onChange }) {
  const row = el('div', 'lab-control', parent); el('div', 'lab-control-head', row).textContent = label; const group = el('div', 'lab-choice', row);
  const buttons = options.map((o) => { const b = el('button', 'lab-chip', group, o.label); b.type = 'button'; b.setAttribute('aria-pressed', String(o.value === value)); b.addEventListener('click', () => { buttons.forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onChange(o.value); }); return b; });
  return { set(v) { buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v))); onChange(v); } };
}

/** Canvas plot with axes. */
class Plot {
  constructor(parent, { title, xLabel, yLabel, height = 220 }) {
    const wrap = el('figure', 'lab-plot', parent); el('figcaption', '', wrap, title);
    this.canvas = el('canvas', '', wrap); this.canvas.height = height; this.canvas.width = 800;
    this.x = xLabel; this.y = yLabel; this.ctx = this.canvas.getContext('2d');
    this.caption = wrap.querySelector('figcaption');
    this.lastFrame = null; this.lastLines = []; this.replaying = false;
    window.addEventListener('overture:themechange', () => {
      if (!this.lastFrame) return;
      const { xTicks, yTicks } = this.lastFrame;
      const lines = this.lastLines.slice();
      this.replaying = true;
      this.frame(xTicks, yTicks);
      lines.forEach((line) => this.line(line.points, line.color, line.width));
      this.replaying = false;
    });
    const ro = new ResizeObserver(() => { this.canvas.width = Math.max(300, Math.floor(wrap.clientWidth)); if (this.lastFrame) { const {xTicks,yTicks}=this.lastFrame; const lines=this.lastLines.slice(); this.replaying=true; this.frame(xTicks,yTicks); lines.forEach((line)=>this.line(line.points,line.color,line.width)); this.replaying=false; } }); ro.observe(wrap);
  }
  frame(xTicks, yTicks) {
    this.lastFrame = { xTicks, yTicks };
    if (!this.replaying) this.lastLines = [];
    const c = this.ctx; const W = this.canvas.width; const H = this.canvas.height; c.clearRect(0, 0, W, H);
    const light = document.documentElement.dataset.theme === 'light';
    c.fillStyle = light ? '#edf2f7' : '#0b0e13'; c.fillRect(0, 0, W, H);
    const L = 46, B = H - 26, T = 10, R = W - 12; this.box = { L, B, T, R };
    c.strokeStyle = light ? '#b8c5d3' : '#2b3240'; c.lineWidth = 1; c.beginPath(); c.rect(L, T, R - L, B - T); c.stroke();
    c.fillStyle = light ? '#637386' : '#8f97a3'; c.font = '10px DM Mono, monospace'; c.textAlign = 'center';
    xTicks.forEach(([t, label]) => { const x = L + t * (R - L); c.strokeStyle = light ? '#d9e1e9' : '#1b212b'; c.beginPath(); c.moveTo(x, T); c.lineTo(x, B); c.stroke(); c.fillText(label, x, B + 14); });
    c.textAlign = 'right'; yTicks.forEach(([t, label]) => { const y = B - t * (B - T); c.strokeStyle = light ? '#d9e1e9' : '#1b212b'; c.beginPath(); c.moveTo(L, y); c.lineTo(R, y); c.stroke(); c.fillText(label, L - 4, y + 3); });
    c.textAlign = 'center'; c.fillStyle = light ? '#405267' : '#c9cfd8'; c.fillText(this.x, (L + R) / 2, H - 3); c.save(); c.translate(10, (T + B) / 2); c.rotate(-Math.PI / 2); c.fillText(this.y, 0, 0); c.restore();
    return this.box;
  }
  line(points, color, width = 2) { const c = this.ctx; c.strokeStyle = color; c.lineWidth = width; c.beginPath(); points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); if (!this.replaying) this.lastLines.push({ points, color, width }); }
}

const ACCENT = '#7de4ff', GREEN = '#82e6a8', AMBER = '#ff9f0a';

// ============================================================================ lab scaffolding
class Lab {
  constructor() {
    this.audio = new Audio(); this.root = document.getElementById('lab-root'); this.playing = false; this.held = new Set();
    this.header = el('header', 'lab-header', this.root);
    el('a', 'lab-back', this.header, '← All experiments').href = '/experiments';
    const h1 = el('h1', '', this.header); this.title = h1;
    this.intro = el('p', 'lab-intro', this.header);
    const grid = el('div', 'lab-grid', this.root);
    this.vis = el('div', 'lab-vis', grid); this.controls = el('aside', 'lab-controls', grid);
    this.transport = el('div', 'lab-transport', this.controls);
    this.playBtn = el('button', 'lab-play', this.transport, 'PLAY'); this.playBtn.type = 'button'; this.playBtn.addEventListener('click', () => (this.playing ? this.stop() : this.play()));
    this.stopBtn = el('button', 'lab-stop', this.transport, 'STOP'); this.stopBtn.type = 'button'; this.stopBtn.addEventListener('click', () => this.stop());
    slider(this.transport, { label: 'Output level', min: 0, max: 1, value: 0.5, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { if (this.audio.master) this.audio.master.gain.setTargetAtTime(v, this.audio.ctx.currentTime, 0.02); this.level = v; } });
    this.level = 0.5;
    this.explain = el('section', 'lab-explain', this.root);
    this.tasks = el('section', 'lab-tasks', this.root);
    window.addEventListener('keydown', (e) => { if (e.key === ' ' && !['INPUT', 'BUTTON'].includes(e.target?.tagName)) { e.preventDefault(); if (!e.repeat) (this.playing ? this.stop() : this.play()); } if (e.key === 'Escape') this.stop(); });
    window.addEventListener('pagehide', () => this.stop());
  }
  setText(title, intro, explainHtml, tasks) {
    this.title.textContent = title; this.intro.textContent = intro; document.title = `${title} | Overture Experiments`;
    this.explain.innerHTML = `<h2>What is going on?</h2>${explainHtml}`;
    this.tasks.innerHTML = `<h2>Try this</h2><ol>${tasks.map((t) => `<li>${t}</li>`).join('')}</ol>`;
  }
  async play() { await this.audio.ensure(); this.audio.master.gain.setTargetAtTime(this.level, this.audio.ctx.currentTime, 0.02); if (!this.playing) { this.playing = true; this.playBtn.textContent = 'PAUSE'; this.playBtn.classList.add('is-on'); this.start?.(); this.loop(); } }
  stop() { if (!this.playing) return; this.playing = false; this.playBtn.textContent = 'PLAY'; this.playBtn.classList.remove('is-on'); this.end?.(); }
  loop() { if (!this.playing) return; this.draw?.(); requestAnimationFrame(() => this.loop()); }
  measured(points = 2048) { const a = this.audio.analyser; if (!a) return null; const b = new Float32Array(a.fftSize); a.getFloatTimeDomainData(b); return b; }
  spectrum() { const a = this.audio.analyser; if (!a) return null; const b = new Float32Array(a.frequencyBinCount); a.getFloatFrequencyData(b); return b; }
  /** Draws a measured time-domain plot, triggered at a rising zero crossing for a stable image. */
  drawMeasured(plot, seconds, color = ACCENT) {
    const buf = this.measured(); const sr = this.audio.ctx.sampleRate; const n = Math.min(buf.length - 1, Math.round(seconds * sr));
    let start = 0; for (let i = 1; i < buf.length - n; i += 1) if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }
    const box = plot.frame([[0, '0'], [0.5, `${(seconds * 500).toFixed(1)} ms`], [1, `${(seconds * 1000).toFixed(1)} ms`]], [[0, '-1'], [0.5, '0'], [1, '+1']]);
    const pts = []; for (let i = 0; i <= n; i += 1) pts.push([box.L + (i / n) * (box.R - box.L), (box.B + box.T) / 2 - buf[start + i] * (box.B - box.T) / 2]);
    plot.line(pts, color);
  }
  drawSpectrum(plot, maxHz = 8000) {
    const sp = this.spectrum(); const sr = this.audio.ctx.sampleRate; const box = plot.frame([0, 0.25, 0.5, 0.75, 1].map((t) => [t, `${Math.round(t * maxHz)}`]), [[0, '-100 dB'], [0.5, '-50 dB'], [1, '0 dB']]);
    const pts = []; const binHz = sr / (sp.length * 2);
    for (let i = 0; i < sp.length && i * binHz <= maxHz; i += 1) pts.push([box.L + (i * binHz / maxHz) * (box.R - box.L), box.B - clamp((sp[i] + 100) / 100, 0, 1) * (box.B - box.T)]);
    plot.line(pts, GREEN, 1.5);
  }
  keyInput(parent, onDown, onUp) {
    const keys = el('div', 'lab-keys', parent); const notes = [['C3', 48], ['D3', 50], ['E3', 52], ['F3', 53], ['G3', 55], ['A3', 57], ['B3', 59], ['C4', 60], ['D4', 62], ['E4', 64]];
    notes.forEach(([n, m]) => { const b = el('button', 'lab-key', keys, n); b.type = 'button'; const down = (e) => { e.preventDefault(); b.classList.add('is-down'); onDown(m); }; const up = () => { if (!b.classList.contains('is-down')) return; b.classList.remove('is-down'); onUp(m); }; b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up); b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) down(e); }); b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') up(); }); });
    el('p', 'lab-hint', parent, 'Keys A S D F G H J K L ; also play these notes.');
    const map = { a: 48, s: 50, d: 52, f: 53, g: 55, h: 57, j: 59, k: 60, l: 62, ';': 64 }; const held = new Set();
    window.addEventListener('keydown', (e) => { const m = map[e.key]; if (m === undefined || e.repeat || ['INPUT'].includes(e.target?.tagName)) return; held.add(m); onDown(m); });
    window.addEventListener('keyup', (e) => { const m = map[e.key]; if (m === undefined || !held.has(m)) return; held.delete(m); onUp(m); });
  }
}

// ============================================================================ 001 Oscillator Lab
class OscillatorLab extends Lab {
  constructor() {
    super();
    this.p = { wave: 'sine', hz: 220, amp: 0.8 };
    this.setText('Experiment 001 - Oscillator Lab', 'An oscillator is the simplest sound source: it repeats a shape over and over. How fast it repeats is the frequency (pitch); how tall the shape is, the amplitude (loudness); and the shape itself decides the tone colour.',
      `<p><b>Frequency</b> is measured in hertz (Hz) - cycles per second. A4, the tuning note, is 440 Hz. Doubling the frequency raises the pitch by one octave.</p><p><b>Amplitude</b> is the height of the wave. Bigger swings push the loudspeaker further and sound louder (the ear hears this on a roughly logarithmic scale).</p><p><b>Waveform</b> decides timbre. A <b>sine</b> is a single pure frequency. A <b>triangle</b> adds weak odd harmonics (3rd, 5th...). A <b>square</b> has strong odd harmonics, giving a hollow, clarinet-like tone. A <b>sawtooth</b> contains every harmonic and sounds bright and buzzy. The spectrum plot shows those harmonics as peaks at whole-number multiples of the frequency.</p><p>The waveform plot is a <em>measurement</em> of the signal actually being played (from an analyser on the output), not a drawing.</p>`,
      ['Play a sine at 220 Hz, then switch to square at the same frequency. The pitch stays the same; only the tone changes. Watch the extra peaks appear in the spectrum.', 'Slide the frequency from 110 Hz to 220 Hz. Count the cycles in the waveform window - there are twice as many.', 'Lower the amplitude to 0.2. The waveform gets shorter but keeps its shape; the pitch does not change.', 'Set the sawtooth to about 55 Hz. You can start to hear the individual ripples - below ~20 Hz you would hear clicks instead of a tone.']);
    this.wavePlot = new Plot(this.vis, { title: 'Waveform (measured from the output)', xLabel: 'time', yLabel: 'amplitude' });
    this.specPlot = new Plot(this.vis, { title: 'Spectrum (measured, FFT of the output)', xLabel: 'frequency (Hz)', yLabel: 'level', height: 180 });
    choice(this.controls, { label: 'Waveform', options: [['sine', 'Sine ∿'], ['triangle', 'Triangle ⋀'], ['square', 'Square ⎍'], ['sawtooth', 'Sawtooth ⩘']].map(([v, l]) => ({ value: v, label: l })), value: 'sine', onChange: (v) => { this.p.wave = v; if (this.osc) this.osc.type = v; } });
    this.freq = slider(this.controls, { label: 'Frequency', min: 27.5, max: 4186, value: 220, log: true, format: (v) => `${v.toFixed(1)} Hz · ${hzToNote(v)}`, onInput: (v) => { this.p.hz = v; this.osc?.frequency.setTargetAtTime(v, this.audio.ctx.currentTime, 0.01); } });
    slider(this.controls, { label: 'Fine tune', min: -100, max: 100, value: 0, step: 1, unit: 'cents', onInput: (v) => { this.osc?.detune.setTargetAtTime(v, this.audio.ctx.currentTime, 0.01); } });
    slider(this.controls, { label: 'Amplitude', min: 0, max: 1, value: 0.8, format: (v) => v.toFixed(2), onInput: (v) => { this.p.amp = v; this.gain?.gain.setTargetAtTime(v, this.audio.ctx.currentTime, 0.01); } });
    this.keyInput(this.controls, (m) => { this.freq.set(440 * Math.pow(2, (m - 69) / 12)); this.play(); }, () => {});
  }
  start() { const c = this.audio.ctx; this.osc = c.createOscillator(); this.osc.type = this.p.wave; this.osc.frequency.value = this.p.hz; this.gain = c.createGain(); this.gain.gain.value = 0; this.osc.connect(this.gain); this.gain.connect(this.audio.master); this.osc.start(); this.gain.gain.setTargetAtTime(this.p.amp, c.currentTime, 0.02); }
  end() { const c = this.audio.ctx; const g = this.gain; const o = this.osc; g.gain.setTargetAtTime(0, c.currentTime, 0.02); o.stop(c.currentTime + 0.2); this.osc = null; this.gain = null; }
  draw() { this.drawMeasured(this.wavePlot, Math.max(0.004, 3 / this.p.hz)); this.drawSpectrum(this.specPlot, Math.min(12000, this.p.hz * 16)); }
}

// ============================================================================ 002 Filter Lab
class FilterLab extends Lab {
  constructor() {
    super();
    this.p = { wave: 'sawtooth', hz: 110, type: 'lowpass', cutoff: 1200, q: 1, bypass: false, lfo: 0, env: 0 };
    this.setText('Experiment 002 - Filter and Resonance Lab', 'A filter removes some frequencies from a sound and keeps others. Sweep the cutoff and listen: the same oscillator becomes dull, bright, thin or whistling.',
      `<p>The <b>cutoff frequency</b> is where the filter starts to act. A <b>low-pass</b> filter keeps frequencies <em>below</em> the cutoff and removes those above it (dull, warm). A <b>high-pass</b> filter keeps those <em>above</em> the cutoff (thin, airy). A <b>band-pass</b> filter keeps only a band around the cutoff (nasal, telephone-like).</p><p><b>Resonance</b> (Q) boosts frequencies right at the cutoff. A little adds presence; a lot produces the whistling peak synthesizers are known for. The upper plot is the filter's <em>theoretical</em> frequency response computed from its settings (what gain each frequency receives); the lower plot is a <em>measurement</em> of the filtered sound's spectrum.</p><p>Moving the cutoff with an LFO (slow oscillator) gives an auto-wah; moving it with an envelope on each note gives the classic "pluck" or "wow".</p>`,
      ['With a sawtooth playing, sweep the low-pass cutoff from 8 kHz down to 200 Hz. The buzzy harmonics vanish from the spectrum one band at a time.', 'Set resonance to 12 and sweep again - the peak near the cutoff now "sings".', 'Switch to high-pass at 800 Hz: the bass disappears but the sparkle stays. Compare with BYPASS.', 'Turn the LFO depth up with a band-pass filter for a wah-wah effect, then switch the LFO off and add envelope depth to hear a pluck on each key.']);
    this.respPlot = new Plot(this.vis, { title: 'Filter frequency response (theoretical, from the settings)', xLabel: 'frequency (Hz, log)', yLabel: 'gain (dB)', height: 200 });
    this.specPlot = new Plot(this.vis, { title: 'Output spectrum (measured)', xLabel: 'frequency (Hz)', yLabel: 'level', height: 180 });
    choice(this.controls, { label: 'Source waveform', options: [{ value: 'sawtooth', label: 'Sawtooth' }, { value: 'square', label: 'Square' }, { value: 'triangle', label: 'Triangle' }, { value: 'noise', label: 'White noise' }], value: 'sawtooth', onChange: (v) => { this.p.wave = v; if (this.playing) { this.end(); this.start(); } } });
    choice(this.controls, { label: 'Filter mode', options: [{ value: 'lowpass', label: 'Low-pass' }, { value: 'highpass', label: 'High-pass' }, { value: 'bandpass', label: 'Band-pass' }], value: 'lowpass', onChange: (v) => { this.p.type = v; if (this.filter) this.filter.type = v; this.drawResponse(); } });
    slider(this.controls, { label: 'Cutoff frequency', min: 40, max: 16000, value: 1200, log: true, format: (v) => `${v.toFixed(0)} Hz`, onInput: (v) => { this.p.cutoff = v; this.filter?.frequency.setTargetAtTime(v, this.audio.ctx.currentTime, 0.01); this.drawResponse(); } });
    slider(this.controls, { label: 'Resonance (Q)', min: 0.3, max: 24, value: 1, step: 0.1, format: (v) => v.toFixed(1), onInput: (v) => { this.p.q = v; this.filter?.Q.setTargetAtTime(v, this.audio.ctx.currentTime, 0.01); this.drawResponse(); } });
    choice(this.controls, { label: 'Compare', options: [{ value: false, label: 'Filtered' }, { value: true, label: 'Bypass (dry)' }], value: false, onChange: (v) => { this.p.bypass = v; this.route(); } });
    slider(this.controls, { label: 'LFO → cutoff (depth)', min: 0, max: 1, value: 0, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { this.p.lfo = v; this.lfoGain?.gain.setTargetAtTime(v * 2400, this.audio.ctx.currentTime, 0.02); } });
    slider(this.controls, { label: 'Envelope → cutoff (depth)', min: 0, max: 1, value: 0, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { this.p.env = v; } });
    this.keyInput(this.controls, (m) => { this.p.hz = 440 * Math.pow(2, (m - 69) / 12); this.play().then(() => this.pluck()); }, () => {});
    this.drawResponse();
  }
  start() { const c = this.audio.ctx; this.src = this.p.wave === 'noise' ? this.noise(c) : c.createOscillator(); if (this.p.wave !== 'noise') { this.src.type = this.p.wave; this.src.frequency.value = this.p.hz; }
    this.filter = c.createBiquadFilter(); this.filter.type = this.p.type; this.filter.frequency.value = this.p.cutoff; this.filter.Q.value = this.p.q;
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 1.5; this.lfoGain = c.createGain(); this.lfoGain.gain.value = this.p.lfo * 2400; this.lfo.connect(this.lfoGain); this.lfoGain.connect(this.filter.detune); this.lfo.start();
    this.envGain = c.createConstantSource(); this.envGain.offset.value = 0; this.envGain.connect(this.filter.detune); this.envGain.start();
    this.wet = c.createGain(); this.dry = c.createGain(); this.out = c.createGain(); this.out.gain.value = 0.35;
    this.src.connect(this.filter); this.filter.connect(this.wet); this.src.connect(this.dry); this.wet.connect(this.out); this.dry.connect(this.out); this.out.connect(this.audio.master); this.src.start(); this.route(); }
  noise(c) { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; s.loop = true; return s; }
  route() { if (!this.wet) return; const t = this.audio.ctx.currentTime; this.wet.gain.setTargetAtTime(this.p.bypass ? 0 : 1, t, 0.02); this.dry.gain.setTargetAtTime(this.p.bypass ? 1 : 0, t, 0.02); }
  pluck() { if (!this.envGain || !this.p.env) return; const t = this.audio.ctx.currentTime; const o = this.envGain.offset; o.cancelScheduledValues(t); o.setValueAtTime(this.p.env * 4800, t); o.setTargetAtTime(0, t, 0.25); if (this.src?.frequency) this.src.frequency.setTargetAtTime(this.p.hz, t, 0.005); }
  end() { const c = this.audio.ctx; this.out.gain.setTargetAtTime(0, c.currentTime, 0.02); [this.src, this.lfo, this.envGain].forEach((n) => n.stop(c.currentTime + 0.2)); this.src = this.filter = this.wet = this.dry = this.out = this.lfo = this.lfoGain = this.envGain = null; }
  drawResponse() {
    const plot = this.respPlot; const N = 300; const freqs = new Float32Array(N); for (let i = 0; i < N; i += 1) freqs[i] = 20 * Math.pow(1000, i / (N - 1));
    const mag = new Float32Array(N); const ph = new Float32Array(N);
    const c = this.audio.ctx || new OfflineAudioContext(1, 1, 48000); const f = c.createBiquadFilter(); f.type = this.p.type; f.frequency.value = this.p.cutoff; f.Q.value = this.p.q; f.getFrequencyResponse(freqs, mag, ph);
    const box = plot.frame([[0, '20'], [1 / 3, '200'], [2 / 3, '2k'], [1, '20k']], [[0, '-60'], [0.5, '-30'], [1, '0']]);
    const pts = []; for (let i = 0; i < N; i += 1) { const db = 20 * Math.log10(Math.max(1e-4, mag[i])); pts.push([box.L + (i / (N - 1)) * (box.R - box.L), box.B - clamp((db + 60) / 60, 0, 1) * (box.B - box.T)]); }
    plot.line(pts, AMBER); const x = box.L + (Math.log(this.p.cutoff / 20) / Math.log(1000)) * (box.R - box.L); plot.line([[x, box.T], [x, box.B]], '#ff9f0a66', 1);
  }
  draw() { this.drawSpectrum(this.specPlot, 12000); }
}

// ============================================================================ 003 Envelope Lab
class EnvelopeLab extends Lab {
  constructor() {
    super();
    this.p = { a: 0.05, d: 0.3, s: 0.6, r: 0.5, wave: 'sawtooth' }; this.stage = 'idle'; this.stageAt = 0; this.gateOn = false;
    this.setText('Experiment 003 - Envelope Lab', 'An envelope shapes how a sound changes over time. Hold a key and release it: the graph shows which stage the envelope is in while you listen.',
      `<p>When you press a key the envelope rises over the <b>attack</b> time, falls over the <b>decay</b> time to the <b>sustain</b> level, and stays there for as long as the key is held. <b>Sustain is a level, not a time.</b> When you let go, the <b>release</b> time governs how long the sound takes to fade to silence.</p><p>Short attack and decay with zero sustain gives percussive plucks; slow attack and long release give pads that swell and linger. The curve is drawn from the same four numbers that drive the sound, and the moving marker follows the audio engine's actual stage.</p>`,
      ['Hold a key for two seconds and watch the marker travel attack → decay → sustain, then release when you let go.', 'Set attack 0.001 s, decay 0.15 s, sustain 0 - a pluck. Nothing is heard after the decay even if you keep holding the key.', 'Set attack 1.5 s, sustain 1, release 3 s - a pad. Tap a key briefly: the release carries on long after you let go.', 'Compare the two presets below on the same note. Only the envelope changes; the oscillator is identical.']);
    this.plot = new Plot(this.vis, { title: 'Envelope curve (from the settings) with live stage marker', xLabel: 'time (s)', yLabel: 'level', height: 240 });
    this.wavePlot = new Plot(this.vis, { title: 'Output waveform (measured)', xLabel: 'time', yLabel: 'amplitude', height: 150 });
    const sl = (key, label, min, max, value) => slider(this.controls, { label, min, max, value, log: key !== 's', format: (v) => (key === 's' ? `${Math.round(v * 100)}%` : `${v.toFixed(3)} s`), onInput: (v) => { this.p[key] = v; this.drawEnvelope(); } });
    this.sl = { a: sl('a', 'Attack', 0.001, 5, 0.05), d: sl('d', 'Decay', 0.001, 5, 0.3), s: slider(this.controls, { label: 'Sustain level', min: 0, max: 1, value: 0.6, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { this.p.s = v; this.drawEnvelope(); } }), r: sl('r', 'Release', 0.001, 8, 0.5) };
    const pre = el('div', 'lab-choice', this.controls);
    [['Pluck', [0.001, 0.15, 0, 0.1]], ['Organ', [0.005, 0.01, 1, 0.05]], ['Pad', [1.5, 1, 1, 3]], ['Brass', [0.08, 0.3, 0.7, 0.3]]].forEach(([n, v]) => { const b = el('button', 'lab-chip', pre, n); b.type = 'button'; b.addEventListener('click', () => { this.sl.a.set(v[0]); this.sl.d.set(v[1]); this.sl.s.set(v[2]); this.sl.r.set(v[3]); }); });
    this.keyInput(this.controls, (m) => this.noteOn(m), (m) => this.noteOff(m));
    this.playBtn.textContent = 'HOLD TO PLAY'; this.playBtn.addEventListener('pointerdown', () => this.noteOn(57)); this.playBtn.addEventListener('pointerup', () => this.noteOff(57)); this.playBtn.addEventListener('pointerleave', () => this.noteOff(57));
    this.playBtn.onclick = null; this.playBtn.replaceWith(this.playBtn.cloneNode(true)); this.playBtn = this.transport.querySelector('.lab-play');
    this.playBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.noteOn(57); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => this.playBtn.addEventListener(t, () => this.noteOff(57)));
    this.drawEnvelope();
  }
  async noteOn(m) { await this.audio.ensure(); if (!this.playing) { this.playing = true; this.loop(); } const c = this.audio.ctx; this.audio.master.gain.setTargetAtTime(this.level, c.currentTime, 0.02);
    if (!this.osc) { this.osc = c.createOscillator(); this.osc.type = this.p.wave; this.gain = c.createGain(); this.gain.gain.value = 0; this.osc.connect(this.gain); this.gain.connect(this.audio.master); this.osc.start(); }
    this.osc.frequency.setValueAtTime(440 * Math.pow(2, (m - 69) / 12), c.currentTime); this.note = m; this.gateOn = true; this.held.add(m);
    const g = this.gain.gain; const t = c.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.5, t + this.p.a); g.setTargetAtTime(0.5 * this.p.s, t + this.p.a, this.p.d / 3);
    this.stage = 'attack'; this.stageAt = t; this.stageTimer && clearTimeout(this.stageTimer); this.stageTimer = setTimeout(() => { if (this.gateOn) this.stage = 'decay'; }, this.p.a * 1000); this.stageTimer2 && clearTimeout(this.stageTimer2); this.stageTimer2 = setTimeout(() => { if (this.gateOn) this.stage = 'sustain'; }, (this.p.a + this.p.d) * 1000); }
  noteOff(m) { this.held.delete(m); if (!this.gateOn || (this.held.size && m !== this.note)) return; this.gateOn = false; const c = this.audio.ctx; const g = this.gain.gain; const t = c.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0, t, this.p.r / 4); this.stage = 'release'; this.stageAt = t; clearTimeout(this.stageTimer); clearTimeout(this.stageTimer2); setTimeout(() => { if (!this.gateOn) this.stage = 'idle'; }, this.p.r * 1000 + 100); }
  end() { this.held.clear(); if (this.gateOn) this.noteOff(this.note); }
  drawEnvelope() {
    const p = this.p; const hold = 1; const total = p.a + p.d + hold + p.r; const plot = this.plot;
    const box = plot.frame([0, 0.25, 0.5, 0.75, 1].map((t) => [t, (t * total).toFixed(2)]), [[0, '0'], [0.5, '0.5'], [1, '1']]);
    const X = (t) => box.L + (t / total) * (box.R - box.L); const Y = (v) => box.B - v * (box.B - box.T);
    const pts = [[X(0), Y(0)], [X(p.a), Y(1)]]; for (let i = 1; i <= 20; i += 1) { const t = p.a + (i / 20) * p.d; pts.push([X(t), Y(p.s + (1 - p.s) * Math.exp(-(t - p.a) / (p.d / 3)))]); }
    pts.push([X(p.a + p.d + hold), Y(p.s)]); for (let i = 1; i <= 20; i += 1) { const t = p.a + p.d + hold + (i / 20) * p.r; pts.push([X(t), Y(p.s * Math.exp(-(t - p.a - p.d - hold) / (p.r / 4)))]); }
    plot.line(pts, GREEN); const c = plot.ctx; c.fillStyle = '#8f97a3'; c.font = '10px DM Mono, monospace'; c.textAlign = 'center';
    [['ATTACK', p.a / 2], ['DECAY', p.a + p.d / 2], ['SUSTAIN (held)', p.a + p.d + hold / 2], ['RELEASE', p.a + p.d + hold + p.r / 2]].forEach(([l, t]) => c.fillText(l, X(t), box.T + 12));
    plot.line([[X(p.a + p.d + hold), box.T], [X(p.a + p.d + hold), box.B]], '#ff9f0a66', 1); c.fillStyle = AMBER; c.fillText('key up', X(p.a + p.d + hold), box.B - 4);
    if (this.stage !== 'idle' && this.audio.ctx) {
      const since = this.audio.ctx.currentTime - this.stageAt; let t;
      if (this.stage === 'attack') t = Math.min(since, p.a); else if (this.stage === 'decay') t = p.a + Math.min(since - p.a, p.d); else if (this.stage === 'sustain') t = p.a + p.d + Math.min(hold, Math.max(0, since - p.a - p.d)); else t = p.a + p.d + hold + Math.min(since, p.r);
      const level = this.gain ? this.gain.gain.value / 0.5 : 0; c.fillStyle = '#fff'; c.beginPath(); c.arc(X(t), Y(clamp(level, 0, 1)), 5, 0, Math.PI * 2); c.fill(); c.fillText(this.stage.toUpperCase(), X(t), Y(clamp(level, 0, 1)) - 10);
    }
  }
  draw() { this.drawEnvelope(); if (this.audio.analyser) this.drawMeasured(this.wavePlot, 0.02); }
}

// ============================================================================ 004 FM Synthesis Lab
class FMLab extends Lab {
  constructor() {
    super();
    this.p = { carrier: 220, ratio: 2, fixed: false, modHz: 440, index: 2, a: 0.01, r: 0.6, envIndex: true };
    this.setText('Experiment 004 - FM Synthesis Lab', 'In frequency modulation one oscillator (the modulator) wobbles the pitch of another (the carrier) thousands of times per second. Nothing is filtered, yet the result can be a bell, a brass stab or a metallic clang.',
      `<p>The <b>carrier</b> is the oscillator you hear. The <b>modulator</b> is not heard directly: its output is added to the carrier's frequency. At slow rates that is vibrato; at audio rates the ear no longer hears a wobble but new frequencies called <b>sidebands</b>, spaced at the modulator frequency on either side of the carrier.</p><p>The <b>ratio</b> between modulator and carrier decides whether the sidebands line up as harmonics (whole-number ratios such as 1, 2, 3 sound "in tune") or fall between them (ratios like 1.41 or 3.7 sound bell-like or metallic). The <b>modulation depth</b> (index) decides how many sidebands appear - more depth, brighter sound. In a <b>fixed</b> modulator the modulator frequency stays put while the carrier follows the keyboard, so the timbre changes from note to note.</p><p>This is the same principle the DX7 extends to six operators; here you only have two, so every change is easy to hear. The spectrum is measured from the real FM signal.</p>`,
      ['Set depth to 0 and play: a plain sine. Raise it slowly and watch sidebands appear on each side of the carrier.', 'Keep ratio 2 and depth 3 - a bright, harmonic tone. Change the ratio to 1.41: the same depth now sounds like a bell.', 'With "Envelope → depth" on, lower the release. The brightness fades with the note, as on an electric-piano patch.', 'Switch to a fixed modulator at 200 Hz and play low and high keys - the timbre differs per key because the ratio differs per key.']);
    this.specPlot = new Plot(this.vis, { title: 'Spectrum (measured): carrier at the marker, sidebands either side', xLabel: 'frequency (Hz)', yLabel: 'level', height: 210 });
    this.wavePlot = new Plot(this.vis, { title: 'Waveform (measured)', xLabel: 'time', yLabel: 'amplitude', height: 150 });
    this.diagram = el('div', 'lab-diagram', this.vis); this.updateDiagram();
    choice(this.controls, { label: 'Modulator frequency', options: [{ value: false, label: 'Ratio of carrier' }, { value: true, label: 'Fixed (Hz)' }], value: false, onChange: (v) => { this.p.fixed = v; this.apply(); } });
    slider(this.controls, { label: 'Ratio (modulator ÷ carrier)', min: 0.25, max: 12, value: 2, step: 0.01, format: (v) => `${v.toFixed(2)} ×`, onInput: (v) => { this.p.ratio = v; this.apply(); } });
    slider(this.controls, { label: 'Fixed modulator frequency', min: 10, max: 4000, value: 440, log: true, format: (v) => `${v.toFixed(0)} Hz`, onInput: (v) => { this.p.modHz = v; this.apply(); } });
    slider(this.controls, { label: 'Modulation depth (index)', min: 0, max: 12, value: 2, step: 0.01, format: (v) => v.toFixed(2), onInput: (v) => { this.p.index = v; this.apply(); } });
    slider(this.controls, { label: 'Attack', min: 0.001, max: 3, value: 0.01, log: true, format: (v) => `${v.toFixed(3)} s`, onInput: (v) => { this.p.a = v; } });
    slider(this.controls, { label: 'Release', min: 0.01, max: 6, value: 0.6, log: true, format: (v) => `${v.toFixed(2)} s`, onInput: (v) => { this.p.r = v; } });
    choice(this.controls, { label: 'Envelope → depth', options: [{ value: true, label: 'On (brightness fades)' }, { value: false, label: 'Off (constant)' }], value: true, onChange: (v) => { this.p.envIndex = v; } });
    this.keyInput(this.controls, (m) => this.noteOn(m), (m) => this.noteOff(m));
    this.playBtn.replaceWith(this.playBtn.cloneNode(true)); this.playBtn = this.transport.querySelector('.lab-play'); this.playBtn.textContent = 'HOLD TO PLAY';
    this.playBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.noteOn(57); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => this.playBtn.addEventListener(t, () => this.noteOff(57)));
  }
  updateDiagram() { const m = this.p.fixed ? `${this.p.modHz.toFixed(0)} Hz (fixed)` : `${(this.p.carrier * this.p.ratio).toFixed(1)} Hz (${this.p.ratio.toFixed(2)} × carrier)`; this.diagram.innerHTML = `<span class="lab-box lab-box--mod">MODULATOR<br><b>${m}</b></span><span class="lab-arrow">× depth ${this.p.index.toFixed(2)} → frequency of</span><span class="lab-box lab-box--car">CARRIER<br><b>${this.p.carrier.toFixed(1)} Hz</b></span><span class="lab-arrow">→</span><span class="lab-box">OUTPUT</span>`; }
  apply() { this.updateDiagram(); if (!this.mod) return; const c = this.audio.ctx; const mh = this.p.fixed ? this.p.modHz : this.p.carrier * this.p.ratio; this.mod.frequency.setTargetAtTime(mh, c.currentTime, 0.01); if (!this.p.envIndex || !this.gateOn) this.modGain.gain.setTargetAtTime(this.p.index * mh, c.currentTime, 0.01); }
  async noteOn(m) { await this.audio.ensure(); if (!this.playing) { this.playing = true; this.loop(); } const c = this.audio.ctx; this.audio.master.gain.setTargetAtTime(this.level, c.currentTime, 0.02);
    if (!this.car) { this.car = c.createOscillator(); this.mod = c.createOscillator(); this.modGain = c.createGain(); this.amp = c.createGain(); this.amp.gain.value = 0; this.mod.connect(this.modGain); this.modGain.connect(this.car.frequency); this.car.connect(this.amp); this.amp.connect(this.audio.master); this.car.start(); this.mod.start(); }
    this.p.carrier = 440 * Math.pow(2, (m - 69) / 12); this.held.add(m); this.note = m; this.gateOn = true; const t = c.currentTime;
    this.car.frequency.setValueAtTime(this.p.carrier, t); const mh = this.p.fixed ? this.p.modHz : this.p.carrier * this.p.ratio; this.mod.frequency.setValueAtTime(mh, t);
    this.amp.gain.cancelScheduledValues(t); this.amp.gain.setValueAtTime(this.amp.gain.value, t); this.amp.gain.linearRampToValueAtTime(0.5, t + this.p.a);
    const mg = this.modGain.gain; mg.cancelScheduledValues(t); if (this.p.envIndex) { mg.setValueAtTime(mg.value, t); mg.linearRampToValueAtTime(this.p.index * mh, t + this.p.a); mg.setTargetAtTime(this.p.index * mh * 0.25, t + this.p.a, 0.6); } else mg.setValueAtTime(this.p.index * mh, t);
    this.updateDiagram(); }
  noteOff(m) { this.held.delete(m); if (!this.gateOn || (this.held.size && m !== this.note)) return; this.gateOn = false; const t = this.audio.ctx.currentTime; this.amp.gain.cancelScheduledValues(t); this.amp.gain.setValueAtTime(this.amp.gain.value, t); this.amp.gain.setTargetAtTime(0, t, this.p.r / 4); if (this.p.envIndex) { this.modGain.gain.cancelScheduledValues(t); this.modGain.gain.setValueAtTime(this.modGain.gain.value, t); this.modGain.gain.setTargetAtTime(0, t, this.p.r / 4); } }
  end() { this.held.clear(); if (this.gateOn) this.noteOff(this.note); }
  draw() { if (!this.audio.analyser) return; this.drawSpectrum(this.specPlot, 6000); const box = this.specPlot.box; const x = box.L + (this.p.carrier / 6000) * (box.R - box.L); this.specPlot.line([[x, box.T], [x, box.B]], '#ff9f0a88', 1); this.drawMeasured(this.wavePlot, Math.max(0.004, 3 / this.p.carrier), AMBER); }
}

// ============================================================================ 005 Harmonics Lab
class HarmonicsLab extends Lab {
  constructor() {
    super();
    this.p = { hz: 220, h: [1, 0, 0, 0, 0, 0, 0, 0] };
    this.setText('Experiment 005 - Harmonics Lab', 'Any repeating sound can be built from sine waves at whole-number multiples of one base frequency. Mix eight of them by hand and watch the waveform you draw become the waveform you hear.',
      `<p>The lowest sine is the <b>fundamental</b> (1×); the others are <b>harmonics</b> or overtones at 2×, 3×, 4×... The pitch you hear comes from the fundamental; the <em>balance</em> of the harmonics gives the timbre. This is called <b>additive synthesis</b>, and the reverse operation (finding which sines are inside a sound) is the Fourier transform used by the spectrum plot.</p><p>Classic shapes are just recipes: a <b>sawtooth</b> is every harmonic at 1/n; a <b>square</b> is odd harmonics only at 1/n; a <b>triangle</b> is odd harmonics at 1/n², which is why it sounds so much softer. The upper plot is the <em>theoretical</em> sum of your eight sines; the lower plots are <em>measured</em> from the audio.</p>`,
      ['Start with only harmonic 1 (a sine). Add harmonic 2 at half level - the pitch is unchanged but the tone gets a little fuller.', 'Press the SAWTOOTH recipe, then set every even harmonic to zero. You just turned a sawtooth into a square.', 'Mute harmonic 1 entirely but keep 2 to 8. Does the pitch move? (Usually not: the ear infers the missing fundamental.)', 'Put only harmonics 1 and 8 on. The spectrum shows two spikes far apart and the sound is a buzzing "two-note" tone.']);
    this.sumPlot = new Plot(this.vis, { title: 'Sum of the eight sines (theoretical)', xLabel: 'one cycle', yLabel: 'amplitude', height: 200 });
    this.wavePlot = new Plot(this.vis, { title: 'Waveform (measured)', xLabel: 'time', yLabel: 'amplitude', height: 150 });
    this.specPlot = new Plot(this.vis, { title: 'Spectrum (measured): one peak per harmonic', xLabel: 'frequency (Hz)', yLabel: 'level', height: 170 });
    const pre = el('div', 'lab-choice', this.controls);
    [['Sine', [1, 0, 0, 0, 0, 0, 0, 0]], ['Sawtooth', [1, 0.5, 0.33, 0.25, 0.2, 0.17, 0.14, 0.13]], ['Square', [1, 0, 0.33, 0, 0.2, 0, 0.14, 0]], ['Triangle', [1, 0, 0.11, 0, 0.04, 0, 0.02, 0]], ['Organ', [1, 0.6, 0.3, 0.6, 0.1, 0.3, 0, 0.4]]].forEach(([n, v]) => { const b = el('button', 'lab-chip', pre, n); b.type = 'button'; b.addEventListener('click', () => v.forEach((x, i) => this.sl[i].set(x))); });
    this.sl = this.p.h.map((v, i) => slider(this.controls, { label: `Harmonic ${i + 1} (${i + 1}×)`, min: 0, max: 1, value: v, format: (x) => x.toFixed(2), onInput: (x) => { this.p.h[i] = x; this.apply(); } }));
    this.freq = slider(this.controls, { label: 'Fundamental', min: 55, max: 880, value: 220, log: true, format: (v) => `${v.toFixed(1)} Hz · ${hzToNote(v)}`, onInput: (v) => { this.p.hz = v; this.osc?.frequency.setTargetAtTime(v, this.audio.ctx.currentTime, 0.01); } });
    this.keyInput(this.controls, (m) => { this.freq.set(440 * Math.pow(2, (m - 69) / 12)); this.play(); }, () => {});
    this.drawSum();
  }
  wave(c) { const re = new Float32Array(9); const im = new Float32Array(9); this.p.h.forEach((v, i) => { im[i + 1] = v; }); return c.createPeriodicWave(re, im, { disableNormalization: true }); }
  apply() { this.drawSum(); if (this.osc) this.osc.setPeriodicWave(this.wave(this.audio.ctx)); }
  start() { const c = this.audio.ctx; this.osc = c.createOscillator(); this.osc.setPeriodicWave(this.wave(c)); this.osc.frequency.value = this.p.hz; this.gain = c.createGain(); this.gain.gain.value = 0; this.osc.connect(this.gain); this.gain.connect(this.audio.master); this.osc.start(); this.gain.gain.setTargetAtTime(0.3, c.currentTime, 0.02); }
  end() { const c = this.audio.ctx; const g = this.gain, o = this.osc; g.gain.setTargetAtTime(0, c.currentTime, 0.02); o.stop(c.currentTime + 0.2); this.osc = this.gain = null; }
  drawSum() { const box = this.sumPlot.frame([[0, '0'], [0.5, '½'], [1, '1 cycle']], [[0, '-2'], [0.5, '0'], [1, '+2']]); const pts = []; for (let i = 0; i <= 400; i += 1) { const t = i / 400; let y = 0; this.p.h.forEach((v, k) => { y += v * Math.sin(2 * Math.PI * (k + 1) * t); }); pts.push([box.L + t * (box.R - box.L), (box.B + box.T) / 2 - clamp(y / 2, -1, 1) * (box.B - box.T) / 2]); } this.sumPlot.line(pts, AMBER); }
  draw() { this.drawMeasured(this.wavePlot, 2 / this.p.hz); this.drawSpectrum(this.specPlot, this.p.hz * 10); }
}

// ============================================================================ 006 Beats & Tuning Lab
class BeatsLab extends Lab {
  constructor() {
    super();
    this.p = { hz: 220, off: 3, wave: 'sine' }; this.hist = new Float32Array(360).fill(0);
    this.setText('Experiment 006 - Beats and Tuning Lab', 'Play two tones a few hertz apart and you hear one tone that pulses. That pulse is how musicians tune by ear - and how synth players make sounds "fat".',
      `<p>Two sines at 220 Hz and 223 Hz drift in and out of phase: when their peaks line up they add, when they oppose they cancel. The result swells and fades <b>3 times per second</b> - the <b>beat frequency</b> is simply the difference between the two frequencies. The plot shows a long window of the measured signal so the slow envelope is visible.</p><p>Tuning a guitar or a synth oscillator is just slowing the beats down until they stop. Doing the opposite - deliberately detuning by a few cents - gives the chorus-like width of a two-oscillator lead or a supersaw. Push the offset past ~20 Hz and the beats stop being a rhythm and become a rough, buzzy tone (the ear can no longer follow them individually).</p>`,
      ['Set the offset to 0 Hz: a single steady tone. Move to 1 Hz, then 4 Hz, and count the pulses per second.', 'Set the offset to 2 Hz and switch the waveform to sawtooth. The beating stays, but each harmonic now beats at its own rate.', 'Slide to 30 Hz and beyond. At what point does the pulse become roughness, then a second pitch?', 'Return to around 1.5 Hz: this is roughly the detune used for a classic "fat" two-oscillator synth lead.']);
    this.envPlot = new Plot(this.vis, { title: 'Measured peak level, last ~6 s (the slow swell is the beat)', xLabel: 'time \u2192', yLabel: 'amplitude', height: 220 });
    this.wavePlot = new Plot(this.vis, { title: 'Waveform (measured, 80 ms)', xLabel: 'time', yLabel: 'amplitude', height: 150 });
    this.specPlot = new Plot(this.vis, { title: 'Spectrum (measured) - two close peaks', xLabel: 'frequency (Hz)', yLabel: 'level', height: 170 });
    this.info = el('div', 'lab-diagram', this.vis);
    choice(this.controls, { label: 'Waveform', options: [{ value: 'sine', label: 'Sine' }, { value: 'sawtooth', label: 'Sawtooth' }], value: 'sine', onChange: (v) => { this.p.wave = v; this.oscs?.forEach((o) => { o.type = v; }); } });
    slider(this.controls, { label: 'Tone A frequency', min: 55, max: 880, value: 220, log: true, format: (v) => `${v.toFixed(1)} Hz`, onInput: (v) => { this.p.hz = v; this.apply(); } });
    slider(this.controls, { label: 'Tone B offset', min: 0, max: 60, value: 3, step: 0.1, format: (v) => `+${v.toFixed(1)} Hz`, onInput: (v) => { this.p.off = v; this.apply(); } });
    this.apply();
  }
  apply() { const cents = this.p.off ? 1200 * Math.log2((this.p.hz + this.p.off) / this.p.hz) : 0; this.info.innerHTML = `<span class="lab-box lab-box--car">TONE A<br><b>${this.p.hz.toFixed(1)} Hz</b></span><span class="lab-arrow">+</span><span class="lab-box lab-box--mod">TONE B<br><b>${(this.p.hz + this.p.off).toFixed(1)} Hz (${cents.toFixed(1)}¢)</b></span><span class="lab-arrow">=</span><span class="lab-box">BEAT RATE<br><b>${this.p.off.toFixed(1)} per second</b></span>`; if (!this.oscs) return; const t = this.audio.ctx.currentTime; this.oscs[0].frequency.setTargetAtTime(this.p.hz, t, 0.01); this.oscs[1].frequency.setTargetAtTime(this.p.hz + this.p.off, t, 0.01); }
  start() { const c = this.audio.ctx; this.gain = c.createGain(); this.gain.gain.value = 0; this.gain.connect(this.audio.master); this.oscs = [0, 1].map((i) => { const o = c.createOscillator(); o.type = this.p.wave; o.frequency.value = this.p.hz + (i ? this.p.off : 0); o.connect(this.gain); o.start(); return o; }); this.gain.gain.setTargetAtTime(0.25, c.currentTime, 0.02); }
  end() { const c = this.audio.ctx; this.gain.gain.setTargetAtTime(0, c.currentTime, 0.02); this.oscs.forEach((o) => o.stop(c.currentTime + 0.2)); this.oscs = this.gain = null; }
  draw() { const buf = this.measured(); let pk = 0; for (let i = 0; i < buf.length; i += 1) pk = Math.max(pk, Math.abs(buf[i])); this.hist.copyWithin(0, 1); this.hist[this.hist.length - 1] = pk;
    const box = this.envPlot.frame([[0, '-6 s'], [0.5, '-3 s'], [1, 'now']], [[0, '-1'], [0.5, '0'], [1, '+1']]); const mid = (box.B + box.T) / 2; const X = (i) => box.L + (i / (this.hist.length - 1)) * (box.R - box.L); const Y = (v) => mid - clamp(v, 0, 1) * (box.B - box.T) / 2;
    this.envPlot.line(Array.from(this.hist, (v, i) => [X(i), Y(v)]), ACCENT); this.envPlot.line(Array.from(this.hist, (v, i) => [X(i), 2 * mid - Y(v)]), ACCENT);
    this.drawMeasured(this.wavePlot, 0.08); this.drawSpectrum(this.specPlot, Math.min(4000, this.p.hz * 4)); }
}

// ============================================================================ 007 Echo & Reverb Lab
class SpaceLab extends Lab {
  constructor() {
    super();
    this.p = { time: 0.35, fb: 0.4, dmix: 0.4, size: 2, rmix: 0.25 }; this.hist = new Float32Array(600).fill(0);
    this.setText('Experiment 007 - Echo and Reverb Lab', 'Space is an effect. A delay line repeats a sound after a set time; feed some of it back and you get echoes; blur thousands of them together and you get the reverb of a room or a hall.',
      `<p>A <b>delay</b> stores the signal and plays it again <em>time</em> seconds later. Routing part of the output back into the input (<b>feedback</b>) makes each echo spawn another, quieter one; at 100% they would never die away. Short times (under ~40 ms) are heard as thickening rather than echo - that is how chorus and flanger effects work.</p><p><b>Reverb</b> is what a real room does: countless reflections arriving so densely that they merge into a decaying wash. Here it is simulated by convolving the sound with a synthetic <em>impulse response</em> - a burst of decaying noise whose length is the <b>size</b>. The lower plot is a rolling history of the <em>measured</em> output level, so you can see echoes as separate bumps and reverb as a smooth tail.</p>`,
      ['Set reverb mix to 0, delay feedback to 0 and time to 0.5 s. Tap a key: one pluck and one echo, clearly visible as two bumps.', 'Raise feedback to 70%: the bumps become a decaying staircase. Try 95% and listen to it almost run away.', 'Set delay mix to 0 and reverb mix to 50% with size 0.5 s, then 6 s. A small room versus a cathedral - same pluck.', 'Delay time 0.02 s, feedback 60%: the echoes are too fast to hear separately and turn into a metallic ringing tone.']);
    this.lvlPlot = new Plot(this.vis, { title: 'Output level history (measured, last ~6 s)', xLabel: 'time →', yLabel: 'level', height: 200 });
    this.wavePlot = new Plot(this.vis, { title: 'Waveform (measured)', xLabel: 'time', yLabel: 'amplitude', height: 150 });
    slider(this.controls, { label: 'Delay time', min: 0.01, max: 1.5, value: 0.35, log: true, format: (v) => `${(v * 1000).toFixed(0)} ms`, onInput: (v) => { this.p.time = v; this.delay?.delayTime.setTargetAtTime(v, this.audio.ctx.currentTime, 0.05); } });
    slider(this.controls, { label: 'Delay feedback', min: 0, max: 0.95, value: 0.4, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { this.p.fb = v; this.fb?.gain.setTargetAtTime(v, this.audio.ctx.currentTime, 0.02); } });
    slider(this.controls, { label: 'Delay mix', min: 0, max: 1, value: 0.4, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { this.p.dmix = v; this.dwet?.gain.setTargetAtTime(v, this.audio.ctx.currentTime, 0.02); } });
    slider(this.controls, { label: 'Reverb size', min: 0.2, max: 8, value: 2, format: (v) => `${v.toFixed(1)} s`, onInput: (v) => { this.p.size = v; clearTimeout(this.irT); this.irT = setTimeout(() => this.buildIR(), 150); } });
    slider(this.controls, { label: 'Reverb mix', min: 0, max: 1, value: 0.25, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { this.p.rmix = v; this.rwet?.gain.setTargetAtTime(v * 1.5, this.audio.ctx.currentTime, 0.02); } });
    this.keyInput(this.controls, (m) => this.pluck(m), () => {});
    this.playBtn.replaceWith(this.playBtn.cloneNode(true)); this.playBtn = this.transport.querySelector('.lab-play'); this.playBtn.textContent = 'PLUCK'; this.playBtn.addEventListener('click', () => this.pluck(57));
  }
  buildIR() { const c = this.audio.ctx; if (!c || !this.conv) return; const n = Math.floor(c.sampleRate * this.p.size); const b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch += 1) { const d = b.getChannelData(ch); for (let i = 0; i < n; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); } this.conv.buffer = b; }
  async ensureGraph() { await this.audio.ensure(); if (!this.playing) { this.playing = true; this.loop(); } if (this.input) return; const c = this.audio.ctx; this.audio.master.gain.setTargetAtTime(this.level, c.currentTime, 0.02);
    this.input = c.createGain(); this.delay = c.createDelay(2); this.delay.delayTime.value = this.p.time; this.fb = c.createGain(); this.fb.gain.value = this.p.fb; const lp = c.createBiquadFilter(); lp.frequency.value = 4000; this.dwet = c.createGain(); this.dwet.gain.value = this.p.dmix; this.conv = c.createConvolver(); this.rwet = c.createGain(); this.rwet.gain.value = this.p.rmix * 1.5; const sum = c.createGain();
    this.input.connect(sum); this.input.connect(this.delay); this.delay.connect(lp); lp.connect(this.fb); this.fb.connect(this.delay); lp.connect(this.dwet); this.dwet.connect(sum); sum.connect(this.audio.master); sum.connect(this.conv); this.conv.connect(this.rwet); this.rwet.connect(this.audio.master); this.buildIR(); }
  async pluck(m) { await this.ensureGraph(); const c = this.audio.ctx; const hz = 440 * Math.pow(2, (m - 69) / 12); const t = c.currentTime; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = hz; const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(this.input); o.start(t); o.stop(t + 0.3); }
  draw() { const buf = this.measured(); let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] * buf[i]; const rms = Math.sqrt(s / (buf.length / 4)); this.hist.copyWithin(0, 1); this.hist[this.hist.length - 1] = rms;
    const box = this.lvlPlot.frame([[0, '-6 s'], [0.5, '-3 s'], [1, 'now']], [[0, '-60 dB'], [0.5, '-30 dB'], [1, '0 dB']]); const pts = Array.from(this.hist, (v, i) => [box.L + (i / (this.hist.length - 1)) * (box.R - box.L), box.B - clamp((20 * Math.log10(Math.max(1e-3, v)) + 60) / 60, 0, 1) * (box.B - box.T)]); this.lvlPlot.line([...pts], GREEN);
    this.drawMeasured(this.wavePlot, 0.02); }
  end() {}
}

// ============================================================================ 008 Modulation Lab
class ModulationLab extends Lab {
  constructor() {
    super();
    this.p = { target: 'pitch', rate: 5, depth: 0.3, shape: 'sine', hz: 220 };
    this.setText('Experiment 008 - Modulation (LFO) Lab', 'An LFO is an oscillator too slow to hear - instead you aim it at another control and hear that control move. The same wobble becomes vibrato, tremolo or wah depending on where you point it.',
      `<p>A <b>low-frequency oscillator</b> runs at a few hertz. Its output is not sent to the speaker; it is added to a parameter. Aimed at <b>pitch</b> the result is <b>vibrato</b> (a singer's wobble); aimed at <b>amplitude</b> it is <b>tremolo</b> (a pulsing volume); aimed at a <b>filter cutoff</b> it is an <b>auto-wah</b>. The <b>rate</b> sets how fast the wobble is and the <b>depth</b> how far it travels.</p><p>The LFO's <b>shape</b> matters as much as its rate: a sine glides, a square jumps between two values (a trill when aimed at pitch), a sawtooth ramps and snaps back. The top plot is the <em>theoretical</em> LFO shape; the lower plots are <em>measured</em>. Push the rate above ~20 Hz and the modulation itself becomes a tone - which is the doorway to FM and ring modulation.</p>`,
      ['Target pitch, sine, rate 5 Hz, depth 30%: a vibrato. Lower the depth to 5% for a realistic singer-style wobble.', 'Switch the target to amplitude: the pitch is now steady and the loudness pulses. Watch the measured waveform swell and shrink.', 'Target the filter with a square LFO at 2 Hz: the tone jumps between dull and bright.', 'Target pitch with a square at 6 Hz and depth 100%: that is a trill between two notes. Raise the rate to 40 Hz and hear it become a buzzy new timbre.']);
    this.lfoPlot = new Plot(this.vis, { title: 'LFO shape (theoretical, one second)', xLabel: 'time (s)', yLabel: 'value', height: 160 });
    this.wavePlot = new Plot(this.vis, { title: 'Waveform (measured, 100 ms)', xLabel: 'time', yLabel: 'amplitude', height: 170 });
    this.specPlot = new Plot(this.vis, { title: 'Spectrum (measured)', xLabel: 'frequency (Hz)', yLabel: 'level', height: 160 });
    choice(this.controls, { label: 'LFO target', options: [{ value: 'pitch', label: 'Pitch (vibrato)' }, { value: 'amp', label: 'Amplitude (tremolo)' }, { value: 'filter', label: 'Filter (wah)' }], value: 'pitch', onChange: (v) => { this.p.target = v; this.apply(); } });
    choice(this.controls, { label: 'LFO shape', options: ['sine', 'triangle', 'square', 'sawtooth'].map((v) => ({ value: v, label: v })), value: 'sine', onChange: (v) => { this.p.shape = v; this.apply(); } });
    slider(this.controls, { label: 'LFO rate', min: 0.1, max: 60, value: 5, log: true, format: (v) => `${v.toFixed(2)} Hz`, onInput: (v) => { this.p.rate = v; this.apply(); } });
    slider(this.controls, { label: 'LFO depth', min: 0, max: 1, value: 0.3, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { this.p.depth = v; this.apply(); } });
    this.keyInput(this.controls, (m) => { this.p.hz = 440 * Math.pow(2, (m - 69) / 12); this.osc?.frequency.setTargetAtTime(this.p.hz, this.audio.ctx.currentTime, 0.01); this.play(); }, () => {});
    this.drawLFO();
  }
  apply() { this.drawLFO(); if (!this.lfo) return; const t = this.audio.ctx.currentTime; const p = this.p; this.lfo.type = p.shape; this.lfo.frequency.setTargetAtTime(p.rate, t, 0.02);
    this.toPitch.gain.setTargetAtTime(p.target === 'pitch' ? p.depth * 1200 : 0, t, 0.02); this.toAmp.gain.setTargetAtTime(p.target === 'amp' ? p.depth * 0.5 : 0, t, 0.02); this.amp.gain.setTargetAtTime(p.target === 'amp' ? 1 - p.depth * 0.5 : 1, t, 0.02); this.toFilt.gain.setTargetAtTime(p.target === 'filter' ? p.depth * 3600 : 0, t, 0.02); }
  start() { const c = this.audio.ctx; this.osc = c.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = this.p.hz; this.filt = c.createBiquadFilter(); this.filt.frequency.value = 900; this.filt.Q.value = 6; this.amp = c.createGain(); this.out = c.createGain(); this.out.gain.value = 0; this.lfo = c.createOscillator(); this.toPitch = c.createGain(); this.toAmp = c.createGain(); this.toFilt = c.createGain();
    this.lfo.connect(this.toPitch); this.toPitch.connect(this.osc.detune); this.lfo.connect(this.toAmp); this.toAmp.connect(this.amp.gain); this.lfo.connect(this.toFilt); this.toFilt.connect(this.filt.detune); this.osc.connect(this.filt); this.filt.connect(this.amp); this.amp.connect(this.out); this.out.connect(this.audio.master); this.osc.start(); this.lfo.start(); this.apply(); this.out.gain.setTargetAtTime(0.3, c.currentTime, 0.02); }
  end() { const c = this.audio.ctx; this.out.gain.setTargetAtTime(0, c.currentTime, 0.02); [this.osc, this.lfo].forEach((o) => o.stop(c.currentTime + 0.2)); this.osc = this.lfo = null; }
  drawLFO() { const box = this.lfoPlot.frame([[0, '0'], [0.5, '0.5'], [1, '1']], [[0, '-1'], [0.5, '0'], [1, '+1']]); const f = { sine: (x) => Math.sin(2 * Math.PI * x), triangle: (x) => 1 - 4 * Math.abs(((x + 0.25) % 1) - 0.5), square: (x) => ((x % 1) < 0.5 ? 1 : -1), sawtooth: (x) => 2 * (x % 1) - 1 }[this.p.shape]; const pts = []; for (let i = 0; i <= 600; i += 1) { const t = i / 600; pts.push([box.L + t * (box.R - box.L), (box.B + box.T) / 2 - f(t * this.p.rate) * this.p.depth * (box.B - box.T) / 2]); } this.lfoPlot.line(pts, '#c89bff'); }
  draw() { this.drawMeasured(this.wavePlot, 0.1); this.drawSpectrum(this.specPlot, 6000); }
}

const LABS = { oscillator: OscillatorLab, filter: FilterLab, envelope: EnvelopeLab, fm: FMLab, harmonics: HarmonicsLab, beats: BeatsLab, space: SpaceLab, modulation: ModulationLab };
document.addEventListener('DOMContentLoaded', () => { const L = LABS[document.body.dataset.lab]; if (L) window.__lab = new L(); });
