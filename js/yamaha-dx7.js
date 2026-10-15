/**
 * yamaha-dx7.js - Overture's six-operator FM synthesizer page.
 * Sound: js/engine/DX7Processor.js. Algorithms: js/data/dx7Algorithms.js.
 */
import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore, num } from './shared/presetStore.js';
import { el, section, knob, button, toggle, select, display, performance, power, presetBar, footer, clamp } from './shared/panel.js';
import { ALGORITHMS } from './data/dx7Algorithms.js';
import { DX7_PRESETS, DX7_INIT } from './data/dx7Presets.js';

const LFO_WAVES = ['tri', 'saw', 'sqr', 'sine', 'sh'];
function validateDX7(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.ops) || d.ops.length !== 6) throw new Error('Not a DX7 voice.');
  const out = {
    algorithm: num(d.algorithm, 1, 32, 1), feedback: num(d.feedback, 0, 7, 0), transpose: num(d.transpose, -24, 24, 0), bendRange: num(d.bendRange, 0, 12, 2),
    wheelPitch: num(d.wheelPitch, 0, 1, 1), wheelAmp: num(d.wheelAmp, 0, 1, 0), atPitch: num(d.atPitch, 0, 1, 0),
    lfo: { speed: num(d.lfo?.speed, 0, 99, 35), delay: num(d.lfo?.delay, 0, 99, 0), pmd: num(d.lfo?.pmd, 0, 99, 0), amd: num(d.lfo?.amd, 0, 99, 0), wave: LFO_WAVES.includes(d.lfo?.wave) ? d.lfo.wave : 'tri', sync: !!d.lfo?.sync, pms: num(d.lfo?.pms, 0, 7, 3) },
    ops: d.ops.map((o) => ({
      enabled: o?.enabled !== false, mode: o?.mode === 'fixed' ? 'fixed' : 'ratio', coarse: Math.round(num(o?.coarse, 0, 31, 1)), fine: num(o?.fine, 0, 99, 0), detune: num(o?.detune, -7, 7, 0),
      level: num(o?.level, 0, 99, 0), rates: [0, 1, 2, 3].map((i) => num(o?.rates?.[i], 0, 99, 50)), levels: [0, 1, 2, 3].map((i) => num(o?.levels?.[i], 0, 99, i === 3 ? 0 : 99)),
      velSens: num(o?.velSens, 0, 7, 0), rateScale: num(o?.rateScale, 0, 7, 0), ams: num(o?.ams, 0, 3, 0),
    })),
  };
  return out;
}

class DX7App {
  constructor() {
    this.engine = new WorkletEngine(new URL('./engine/DX7Processor.js', import.meta.url).href, 'dx7-processor');
    this.store = new PresetStore({ key: 'overture.dx7.voices', version: 1, validate: validateDX7 });
    this.patch = validateDX7(DX7_PRESETS[0].data);
    this.selectedOp = 0;
    this.knobs = {};
    this.opKnobs = {};
    this._build();
    this.perf = performance(this.shell, {
      octaves: 5, startOctave: 2, started: () => this.engine.started, midiStatusEl: this.midiEl,
      handlers: {
        noteOn: (n, v) => this.engine.noteOn(n, v), noteOff: (n) => this.engine.noteOff(n),
        bend: (v) => this.engine.setPitchBend(v), mod: (v) => this.engine.setModWheel(v), sustain: (d) => this.engine.setSustain(d),
        aftertouch: (v) => this.engine.setAftertouch(v), allOff: () => this.engine.allNotesOff(),
        program: (p) => this.presets.load(`f:${p % DX7_PRESETS.length}`),
        cc: (cc, v) => { if (cc === 7) this.knobs.volume.setValue(v / 127); },
      },
    });
    footer(this.shell, '6-OPERATOR FM • 32 ALGORITHMS • 16 VOICES • KEYS: A–\' PLAY, -/= OCTAVE, TAB/SHIFT BEND, ↑/↓ MOD, ESC PANIC');
    power('dx7-power', () => this.engine.start(), () => { this.send(); this.engine.setVolume(this.knobs.volume.value); this.perf.flushPending(); this.disp.flash('AUDIO READY'); });
    this.presets.load('f:0');
  }

  send() { this.engine.post({ t: 'patch', patch: JSON.parse(JSON.stringify(this.patch)) }); }
  edit(fn) { fn(this.patch); this.send(); this.drawAlgorithm(); this.drawEnvelope(); }

  _build() {
    const root = document.getElementById('dx7-root');
    const page = el('div', 'pn-page', root);
    this.shell = el('main', 'pn-shell dx7-shell', page);
    const header = el('header', 'pn-header', this.shell);
    el('div', 'pn-brand', header).innerHTML = '<span class="pn-brand-text dx7-brand">YAMAHA</span><div class="pn-model"><b>DX7</b><span>DIGITAL PROGRAMMABLE ALGORITHM SYNTHESIZER</span></div>';
    const right = el('div', 'pn-header-right', header);
    this.disp = display(right);
    this.midiEl = el('div', 'pn-midi', right, 'MIDI: searching…');
    const rows = el('div', 'pn-rows', this.shell);
    const row1 = el('div', 'pn-row dx7-row-top', rows);
    const presets = section(row1, 'VOICE MEMORY', 'ORIGINAL OVERTURE VOICES');
    this.presets = presetBar(presets.body, {
      factory: DX7_PRESETS, store: this.store, display: this.disp, filename: 'dx7-voice', panic: () => this.perf.allOff(),
      apply: (data, name) => { this.patch = validateDX7(data); this.disp.set(`VOICE  ${name}`, `ALG ${this.patch.algorithm}  FB ${this.patch.feedback}`); this.send(); this.refresh(); },
      capture: () => JSON.parse(JSON.stringify(this.patch)),
    });
    const g = section(row1, 'ALGORITHM', 'TOPOLOGY & FEEDBACK');
    this.algSelect = select(g.body, 'ALGORITHM', Array.from({ length: 32 }, (_, i) => ({ value: i + 1, label: `${i + 1}  (${ALGORITHMS[i].carriers.length} carrier${ALGORITHMS[i].carriers.length > 1 ? 's' : ''})` })), 1, (v) => this.edit((p) => { p.algorithm = Number(v); }));
    const gk = el('div', 'pn-knobs', g.body);
    this.knobs.feedback = knob(gk, { label: 'FEEDBACK', min: 0, max: 7, value: 5, formatValue: (v) => String(Math.round(v)), onChange: (v) => this.edit((p) => { p.feedback = Math.round(v); }) });
    this.knobs.transpose = knob(gk, { label: 'TRANSPOSE', min: -24, max: 24, value: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} st`, onChange: (v) => this.edit((p) => { p.transpose = Math.round(v); }) });
    this.knobs.volume = knob(gk, { label: 'VOLUME', min: 0, max: 1, value: 0.7, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.engine.setVolume(v) });
    this.algSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.algSvg.setAttribute('viewBox', '0 0 240 120');
    this.algSvg.classList.add('dx7-alg');
    g.body.appendChild(this.algSvg);
    const lfo = section(row1, 'LFO & CONTROLLERS');
    const lk = el('div', 'pn-knobs', lfo.body);
    const lknob = (key, label, max, fmt) => { this.knobs[key] = knob(lk, { label, min: 0, max, value: 0, formatValue: fmt || ((v) => String(Math.round(v))), onChange: (v) => this.edit((p) => { p.lfo[key] = Math.round(v); }) }); };
    lknob('speed', 'SPEED', 99, (v) => `${(0.06 * Math.pow(10, (v / 99) * 2.8)).toFixed(2)} Hz`); lknob('delay', 'DELAY', 99); lknob('pmd', 'PITCH MOD', 99); lknob('amd', 'AMP MOD', 99); lknob('pms', 'PM SENS', 7);
    this.lfoWave = select(lfo.body, 'WAVE', LFO_WAVES.map((w) => ({ value: w, label: { tri: 'TRIANGLE', saw: 'SAW DOWN', sqr: 'SQUARE', sine: 'SINE', sh: 'S&H' }[w] })), 'tri', (v) => this.edit((p) => { p.lfo.wave = v; }));
    this.lfoSync = toggle(lfo.body, 'KEY SYNC', false, (v) => this.edit((p) => { p.lfo.sync = v; }));
    const ck = el('div', 'pn-knobs', lfo.body);
    this.knobs.wheelPitch = knob(ck, { label: 'WHEEL→PITCH', min: 0, max: 1, value: 1, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.edit((p) => { p.wheelPitch = v; }) });
    this.knobs.wheelAmp = knob(ck, { label: 'WHEEL→AMP', min: 0, max: 1, value: 0, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.edit((p) => { p.wheelAmp = v; }) });
    this.knobs.atPitch = knob(ck, { label: 'A.TOUCH→PITCH', min: 0, max: 1, value: 0, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.edit((p) => { p.atPitch = v; }) });
    this.bendSel = select(lfo.body, 'BEND RANGE', [0, 1, 2, 3, 4, 5, 7, 12].map((n) => ({ value: n, label: `${n} st` })), 2, (v) => this.edit((p) => { p.bendRange = Number(v); }));

    // Operator editor
    const row2 = el('div', 'pn-row dx7-row-op', rows);
    const opSec = section(row2, 'OPERATOR', 'SELECT AN OPERATOR, THEN EDIT IT');
    const tabs = el('div', 'dx7-tabs', opSec.body);
    this.tabs = [];
    this.opEnables = [];
    for (let i = 0; i < 6; i += 1) {
      const tab = el('div', 'dx7-tab', tabs);
      const b = button(tab, `OP ${i + 1}`, () => { this.selectedOp = i; this.refreshOp(); });
      b.classList.add('dx7-tab-button');
      this.tabs.push(b);
      this.opEnables.push(toggle(tab, 'ON', true, (v) => this.edit((p) => { p.ops[i].enabled = v; })));
    }
    const opBody = el('div', 'dx7-op-body', opSec.body);
    const freq = el('div', 'dx7-op-group', opBody);
    el('h3', '', freq, 'FREQUENCY & OUTPUT');
    this.modeToggle = toggle(freq, 'FIXED FREQ', false, (v) => this.editOp((o) => { o.mode = v ? 'fixed' : 'ratio'; }));
    const fk = el('div', 'pn-knobs', freq);
    const ok = (key, label, min, max, fmt, bipolar = false) => { this.opKnobs[key] = knob(fk, { label, min, max, value: 0, bipolar, formatValue: fmt, onChange: (v) => this.editOp((o) => { o[key] = key === 'coarse' ? Math.round(v) : Math.round(v); }) }); };
    ok('coarse', 'COARSE', 0, 31, (v) => this.freqLabel(Math.round(v)));
    ok('fine', 'FINE', 0, 99, (v) => String(Math.round(v)));
    ok('detune', 'DETUNE', -7, 7, (v) => String(Math.round(v)), true);
    ok('level', 'OUTPUT LEVEL', 0, 99, (v) => String(Math.round(v)));
    ok('velSens', 'VELOCITY', 0, 7, (v) => String(Math.round(v)));
    ok('rateScale', 'RATE SCALING', 0, 7, (v) => String(Math.round(v)));
    ok('ams', 'AMP MOD SENS', 0, 3, (v) => String(Math.round(v)));
    this.opRole = el('div', 'pn-help dx7-role', freq);
    const eg = el('div', 'dx7-op-group', opBody);
    el('h3', '', eg, 'ENVELOPE GENERATOR  (RATE 1-4 / LEVEL 1-4)');
    const ek = el('div', 'pn-knobs', eg);
    this.egKnobs = { rates: [], levels: [] };
    for (let i = 0; i < 4; i += 1) this.egKnobs.rates.push(knob(ek, { label: `RATE ${i + 1}`, min: 0, max: 99, value: 50, formatValue: (v) => String(Math.round(v)), onChange: (v) => this.editOp((o) => { o.rates[i] = Math.round(v); }) }));
    for (let i = 0; i < 4; i += 1) this.egKnobs.levels.push(knob(ek, { label: `LEVEL ${i + 1}`, min: 0, max: 99, value: 99, formatValue: (v) => String(Math.round(v)), onChange: (v) => this.editOp((o) => { o.levels[i] = Math.round(v); }) }));
    this.egCanvas = el('canvas', 'dx7-eg', eg);
    this.egCanvas.width = 420; this.egCanvas.height = 110;
    el('div', 'pn-help', eg, 'The envelope runs through rate/level 1 → 2 → 3 on key-down, stays at level 3 while held, then rate 4 → level 4 on release. A modulator\'s envelope shapes brightness; a carrier\'s shapes loudness.');
  }

  freqLabel(c) { const o = this.patch.ops[this.selectedOp]; return o.mode === 'fixed' ? `${Math.pow(10, c % 4) * (1 + o.fine / 100)} Hz` : `×${c === 0 ? 0.5 : c}`; }
  editOp(fn) { this.edit((p) => fn(p.ops[this.selectedOp])); this.refreshOpLabels(); }

  refresh() {
    const p = this.patch;
    this.algSelect.setValue(p.algorithm, true);
    this.knobs.feedback.setValue(p.feedback, true); this.knobs.transpose.setValue(p.transpose, true);
    ['speed', 'delay', 'pmd', 'amd', 'pms'].forEach((k) => this.knobs[k].setValue(p.lfo[k], true));
    this.lfoWave.setValue(p.lfo.wave, true); this.lfoSync.setValue(p.lfo.sync, true);
    this.knobs.wheelPitch.setValue(p.wheelPitch, true); this.knobs.wheelAmp.setValue(p.wheelAmp, true); this.knobs.atPitch.setValue(p.atPitch, true);
    this.bendSel.setValue(p.bendRange, true);
    this.opEnables.forEach((t, i) => t.setValue(p.ops[i].enabled, true));
    this.refreshOp();
  }

  refreshOp() {
    const o = this.patch.ops[this.selectedOp];
    this.tabs.forEach((t, i) => t.classList.toggle('lit', i === this.selectedOp));
    this.modeToggle.setValue(o.mode === 'fixed', true);
    ['coarse', 'fine', 'detune', 'level', 'velSens', 'rateScale', 'ams'].forEach((k) => this.opKnobs[k].setValue(o[k], true));
    o.rates.forEach((r, i) => this.egKnobs.rates[i].setValue(r, true));
    o.levels.forEach((l, i) => this.egKnobs.levels[i].setValue(l, true));
    this.refreshOpLabels();
    this.drawAlgorithm();
    this.drawEnvelope();
  }

  refreshOpLabels() {
    const alg = ALGORITHMS[this.patch.algorithm - 1];
    const n = this.selectedOp + 1;
    const carrier = alg.carriers.includes(n);
    const targets = Object.entries(alg.mods).filter(([, m]) => m.includes(n)).map(([t]) => `OP ${t}`);
    this.opRole.textContent = `OP ${n} is a ${carrier ? 'CARRIER (its output is heard directly)' : `MODULATOR of ${targets.join(', ') || 'nothing in this algorithm'}`}${alg.fb === n ? ' with FEEDBACK' : ''}. Level ${this.patch.ops[this.selectedOp].level}: ${carrier ? 'sets loudness' : 'sets modulation depth (brightness/harmonics)'}.`;
    this.opKnobs.coarse._render();
  }

  drawAlgorithm() {
    const alg = ALGORITHMS[this.patch.algorithm - 1];
    const svg = this.algSvg;
    svg.replaceChildren();
    const depth = {};
    const col = {};
    const chains = alg.carriers.map((c) => [c]);
    const placed = new Set(alg.carriers);
    alg.carriers.forEach((c) => { depth[c] = 0; });
    const place = (target, chainIndex, d) => {
      (alg.mods[target] || []).forEach((m, k) => {
        if (placed.has(m)) return;
        placed.add(m); depth[m] = d; col[m] = chainIndex + k * 0.5; place(m, chainIndex + k * 0.5, d + 1);
      });
    };
    alg.carriers.forEach((c, i) => { col[c] = i; place(c, i, 1); });
    const maxDepth = Math.max(...Object.values(depth));
    const cols = Math.max(...Object.values(col)) + 1;
    const x = (n) => 20 + (col[n] * (200 / Math.max(1, cols))) + 100 / Math.max(1, cols) - 10;
    const y = (n) => 100 - depth[n] * (80 / Math.max(1, maxDepth)) - 8;
    const ns = 'http://www.w3.org/2000/svg';
    const line = (x1, y1, x2, y2, cls) => { const l = document.createElementNS(ns, 'line'); l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); l.setAttribute('class', cls); svg.appendChild(l); };
    Object.entries(alg.mods).forEach(([t, ms]) => ms.forEach((m) => line(x(m) + 10, y(m) + 16, x(Number(t)) + 10, y(Number(t)), 'dx7-alg-wire')));
    alg.carriers.forEach((c) => line(x(c) + 10, y(c) + 16, x(c) + 10, 118, 'dx7-alg-out'));
    for (let n = 1; n <= 6; n += 1) {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', `dx7-alg-op${alg.carriers.includes(n) ? ' is-carrier' : ''}${n === this.selectedOp + 1 ? ' is-selected' : ''}${this.patch.ops[n - 1].enabled ? '' : ' is-off'}`);
      g.addEventListener('click', () => { this.selectedOp = n - 1; this.refreshOp(); });
      const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', x(n)); r.setAttribute('y', y(n)); r.setAttribute('width', 20); r.setAttribute('height', 16); r.setAttribute('rx', 2);
      const t = document.createElementNS(ns, 'text'); t.setAttribute('x', x(n) + 10); t.setAttribute('y', y(n) + 11.5); t.setAttribute('text-anchor', 'middle'); t.textContent = n;
      g.append(r, t); svg.appendChild(g);
      if (alg.fb === n) { const f = document.createElementNS(ns, 'path'); f.setAttribute('d', `M${x(n) + 20} ${y(n) + 4} h6 v-10 h-16 v6`); f.setAttribute('class', 'dx7-alg-fb'); svg.appendChild(f); }
    }
  }

  drawEnvelope() {
    const c = this.egCanvas.getContext('2d');
    const o = this.patch.ops[this.selectedOp];
    const W = this.egCanvas.width; const H = this.egCanvas.height;
    c.clearRect(0, 0, W, H);
    const t = (r) => 0.001 * Math.pow(10, (99 - r) / 24);
    const segs = [t(o.rates[0]), t(o.rates[1]), t(o.rates[2]), 0.5, t(o.rates[3])];
    const total = segs.reduce((a, b) => a + b, 0);
    const scale = (W - 20) / Math.max(total, 0.05);
    let x = 10;
    let level = 0;
    c.strokeStyle = '#2f3a33'; c.lineWidth = 1; c.strokeRect(10, 6, W - 20, H - 18);
    c.beginPath(); c.moveTo(x, H - 12);
    const pts = [[x, H - 12]];
    [o.levels[0], o.levels[1], o.levels[2], o.levels[2], o.levels[3]].forEach((L, i) => {
      x += segs[i] * scale; level = L / 99;
      pts.push([x, H - 12 - level * (H - 24)]);
    });
    c.strokeStyle = '#8cf5b4'; c.lineWidth = 2; c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke();
    c.fillStyle = '#9aa1ad'; c.font = '9px DM Mono, monospace';
    ['R1', 'R2', 'R3', 'HOLD', 'R4'].forEach((l, i) => c.fillText(l, pts[i][0] + 2, H - 1));
    c.fillStyle = '#ff9f0a'; c.fillRect(pts[3][0] - 1, 6, 1, H - 18); c.fillText('key up', pts[3][0] + 3, 14);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.__dx7App = new DX7App(); });
