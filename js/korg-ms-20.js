/** korg-ms-20.js - semi-modular mono synth page with a working patch panel. Sound: js/engine/MS20Processor.js */
import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore, num } from './shared/presetStore.js';
import { el, section, knob, button, toggle, select, display, performance, power, presetBar, footer } from './shared/panel.js';
import { MS20_DEFAULT as DEF, MS20_JACKS as JACKS } from './data/ms20Jacks.js';
import { MS20_PRESETS } from './data/ms20Presets.js';

const ENUMS = { vco1Wave: ['tri', 'saw', 'pulse', 'noise'], vco2Wave: ['saw', 'sqr', 'pulse', 'ring'], vco1Scale: [32, 16, 8, 4], vco2Scale: [16, 8, 4, 2] };
export function validateCables(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((c) => {
    if (!c || !JACKS.sources[c.from] || !JACKS.inputs[c.to]) return false;
    if (!JACKS.inputs[c.to].accepts.includes(JACKS.sources[c.from].type)) return false;
    const key = `${c.from}>${c.to}`; if (seen.has(key)) return false; seen.add(key); return true;
  }).map((c) => ({ from: c.from, to: c.to }));
}
function validate(d) {
  if (!d || typeof d !== 'object') throw new Error('Not an MS-20 patch.');
  const params = { ...DEF };
  Object.keys(DEF).forEach((k) => {
    const v = d.params?.[k] ?? d[k];
    if (v === undefined) return;
    if (ENUMS[k]) params[k] = ENUMS[k].includes(typeof ENUMS[k][0] === 'number' ? Number(v) : v) ? (typeof ENUMS[k][0] === 'number' ? Number(v) : v) : DEF[k];
    else if (k === 'vco2Pitch') params[k] = num(v, -24, 24, 0);
    else if (k === 'bendRange') params[k] = num(v, 0, 12, 2);
    else params[k] = num(v, 0, 1, DEF[k]);
  });
  return { params, cables: validateCables(d.cables) };
}

class MS20App {
  constructor() {
    this.engine = new WorkletEngine(new URL('./engine/MS20Processor.js', import.meta.url).href, 'ms20-processor', { inputs: 1 });
    this.store = new PresetStore({ key: 'overture.ms20.patches', version: 1, validate });
    this.patch = validate(MS20_PRESETS[0].data);
    this.ui = {}; this.pendingSource = null; this.jackEls = {};
    this._build();
    this.perf = performance(this.shell, {
      octaves: 3, startOctave: 2, started: () => this.engine.started, midiStatusEl: this.midiEl,
      handlers: {
        noteOn: (n, v) => this.engine.noteOn(n, v), noteOff: (n) => this.engine.noteOff(n), bend: (v) => this.engine.setPitchBend(v), mod: (v) => this.engine.setModWheel(v),
        allOff: () => this.engine.allNotesOff(), program: (p) => this.presets.load(`f:${p % MS20_PRESETS.length}`),
        cc: (cc, v) => { if (cc === 7) this.ui.volume.setValue(v / 127); if (cc === 74) this.ui.lpCut.setValue(v / 127); if (cc === 71) this.ui.lpPeak.setValue(v / 127); },
      },
    });
    footer(this.shell, 'MONOPHONIC SEMI-MODULAR • HPF → LPF • PATCHABLE MG / EG / S&H / ESP • LOW-NOTE PRIORITY • KEYS: A–\' PLAY, -/= OCTAVE, ESC PANIC');
    power('ms20-power', () => this.engine.start(), () => { this.send(); this.perf.flushPending(); this.disp.flash('AUDIO READY'); });
    this.presets.load('f:0');
    window.addEventListener('resize', () => this.drawCables());
  }

  send() { this.engine.post({ t: 'patch', patch: this.patch.params }); this.engine.post({ t: 'cables', cables: this.patch.cables }); }
  set(key, value) { this.patch.params[key] = value; this.engine.post({ t: 'param', key, value }); }

  _build() {
    const page = el('div', 'pn-page', document.getElementById('ms20-root'));
    this.shell = el('main', 'pn-shell ms-shell', page);
    const header = el('header', 'pn-header', this.shell);
    el('div', 'pn-brand', header).innerHTML = '<img src="/ui/Logos/Korg_logo.png" alt="Korg"><div class="pn-model"><b>MS-20</b><span>MONOPHONIC SEMI-MODULAR SYNTHESIZER</span></div>';
    const right = el('div', 'pn-header-right', header);
    this.disp = display(right);
    this.midiEl = el('div', 'pn-midi', right, 'MIDI: searching…');
    const rows = el('div', 'pn-rows', this.shell);
    const r1 = el('div', 'pn-row ms-row', rows);
    const K = (parent, key, label, fmt = (v) => `${Math.round(v * 10)}`, opts = {}) => { this.ui[key] = knob(parent, { label, min: 0, max: 1, value: DEF[key], formatValue: fmt, ...opts, onChange: (v) => this.set(key, v) }); };
    const S = (parent, key, label, values, labels) => { this.ui[key] = select(parent, label, values.map((v, i) => ({ value: v, label: labels ? labels[i] : String(v) })), DEF[key], (v) => this.set(key, typeof values[0] === 'number' ? Number(v) : v)); };
    const v1 = section(r1, 'VCO 1'); S(v1.body, 'vco1Wave', 'WAVEFORM', ENUMS.vco1Wave, ['TRIANGLE', 'SAWTOOTH', 'PULSE', 'WHITE NOISE']); S(v1.body, 'vco1Scale', 'SCALE', ENUMS.vco1Scale, ["32'", "16'", "8'", "4'"]);
    const k1 = el('div', 'pn-knobs', v1.body); K(k1, 'vco1Pw', 'PULSE WIDTH');
    const v2 = section(r1, 'VCO 2'); S(v2.body, 'vco2Wave', 'WAVEFORM', ENUMS.vco2Wave, ['SAWTOOTH', 'SQUARE', 'NARROW PULSE', 'RING MOD']); S(v2.body, 'vco2Scale', 'SCALE', ENUMS.vco2Scale, ["16'", "8'", "4'", "2'"]);
    const k2 = el('div', 'pn-knobs', v2.body); K(k2, 'vco2Pitch', 'PITCH', (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} st`, { min: -24, max: 24, bipolar: true });
    const mx = section(r1, 'VCO MIXER & PORTAMENTO'); const km = el('div', 'pn-knobs', mx.body); K(km, 'mix1', 'VCO 1'); K(km, 'mix2', 'VCO 2'); K(km, 'portamento', 'PORTAMENTO');
    const fm = section(r1, 'VCO FREQ MOD'); const kf = el('div', 'pn-knobs', fm.body); K(kf, 'vcoMgInt', 'MG / T.EXT'); K(kf, 'vcoEgInt', 'EG1 / EXT');
    const hp = section(r1, 'HIGH-PASS FILTER'); const kh = el('div', 'pn-knobs', hp.body); K(kh, 'hpCut', 'CUTOFF', (v) => `${Math.round(20 * Math.pow(2, v * 108 / 12))} Hz`); K(kh, 'hpPeak', 'PEAK'); K(kh, 'hpMgInt', 'MG / T.EXT'); K(kh, 'hpEgInt', 'EG2 / EXT');
    const lp = section(r1, 'LOW-PASS FILTER'); const kl = el('div', 'pn-knobs', lp.body); K(kl, 'lpCut', 'CUTOFF', (v) => `${Math.round(20 * Math.pow(2, v * 118 / 12))} Hz`); K(kl, 'lpPeak', 'PEAK'); K(kl, 'lpMgInt', 'MG / T.EXT'); K(kl, 'lpEgInt', 'EG2 / EXT');
    const r2 = el('div', 'pn-row ms-row2', rows);
    const mg = section(r2, 'MODULATION GENERATOR'); const kg = el('div', 'pn-knobs', mg.body); K(kg, 'mgWave', 'WAVEFORM', (v) => (v < 0.45 ? 'RAMP ↓' : v > 0.55 ? 'RAMP ↑' : 'TRI / SQUARE')); K(kg, 'mgFreq', 'FREQUENCY', (v) => `${(0.1 * Math.pow(300, v)).toFixed(2)} Hz`);
    const e1 = section(r2, 'ENVELOPE GENERATOR 1'); const ke1 = el('div', 'pn-knobs', e1.body); const tf = (max) => (v) => `${(0.002 + v * v * max).toFixed(2)} s`; K(ke1, 'eg1Delay', 'DELAY', tf(4)); K(ke1, 'eg1Attack', 'ATTACK', tf(5)); K(ke1, 'eg1Release', 'RELEASE', tf(8));
    const e2 = section(r2, 'ENVELOPE GENERATOR 2'); const ke2 = el('div', 'pn-knobs', e2.body); K(ke2, 'eg2Hold', 'HOLD', tf(4)); K(ke2, 'eg2Attack', 'ATTACK', tf(5)); K(ke2, 'eg2Decay', 'DECAY', tf(8)); K(ke2, 'eg2Sustain', 'SUSTAIN'); K(ke2, 'eg2Release', 'RELEASE', tf(8));
    const esp = section(r2, 'EXTERNAL SIGNAL PROCESSOR', 'LOCAL ONLY • NO PITCH-TO-CV');
    const eb = el('div', 'pn-buttons', esp.body);
    this.micBtn = toggle(eb, 'ENABLE INPUT (MIC)', false, (on) => this.toggleMic(on));
    const kesp = el('div', 'pn-knobs', esp.body); K(kesp, 'espLevel', 'SIGNAL LEVEL'); K(kesp, 'espLow', 'LOW CUT'); K(kesp, 'espHigh', 'HIGH CUT'); K(kesp, 'espThreshold', 'THRESHOLD');
    el('div', 'pn-help', esp.body, 'Your browser asks for microphone permission only when you enable this. Audio stays in the page. Routes ESP SIGNAL / ENV / TRIG appear on the patch panel; pitch-to-CV is not implemented.');
    const outS = section(r2, 'OUTPUT'); const ko = el('div', 'pn-knobs', outS.body); K(ko, 'volume', 'MASTER', (v) => `${Math.round(v * 100)}%`);
    this.ui.bendRange = select(outS.body, 'BEND RANGE', [1, 2, 5, 7, 12].map((n) => ({ value: n, label: `${n} st` })), 2, (v) => this.set('bendRange', Number(v)));
    // Patch panel
    const r3 = el('div', 'pn-row ms-row3', rows);
    const pp = section(r3, 'PATCH PANEL', 'CLICK AN OUTPUT, THEN AN INPUT • CLICK A CABLE TO REMOVE IT');
    pp.sec.classList.add('ms-patch');
    const board = el('div', 'ms-board', pp.body);
    this.board = board;
    const col = (title, jacks, kind) => {
      const c = el('div', 'ms-jack-col', board); el('h3', '', c, title);
      Object.entries(jacks).forEach(([id, j]) => {
        const b = el('button', `ms-jack ms-jack--${kind} ms-type-${j.type || j.accepts[0]}`, c); b.type = 'button'; b.dataset.id = id;
        b.innerHTML = `<i></i><span>${j.label}</span><small>${j.type ? j.type.toUpperCase() : j.accepts.map((a) => a.toUpperCase()).join('/')}</small>`;
        b.addEventListener('click', () => (kind === 'src' ? this.pickSource(id) : this.pickInput(id)));
        this.jackEls[id] = b;
      });
    };
    col('OUTPUTS', JACKS.sources, 'src');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.classList.add('ms-cables'); board.appendChild(this.svg);
    col('INPUTS', JACKS.inputs, 'in');
    this.patchMsg = el('div', 'pn-help ms-msg', pp.body, 'Normalled routing (no cables): keyboard → VCOs and EG triggers, MG → the MG/T.EXT knobs, EG1 → VCO EG1/EXT, EG2 → filters and VCA. A cable into an EXT input replaces that normalled source.');
    const pre = section(r3, 'PATCH MEMORY', 'ORIGINAL OVERTURE PATCHES, CABLES INCLUDED');
    this.presets = presetBar(pre.body, {
      factory: MS20_PRESETS, store: this.store, display: this.disp, filename: 'ms-20-patch', panic: () => this.perf.allOff(),
      apply: (data, name) => { this.patch = validate(data); this.disp.set(`PATCH  ${name}`, `${this.patch.cables.length} CABLE${this.patch.cables.length === 1 ? '' : 'S'}`); this.send(); this.refresh(); },
      capture: () => JSON.parse(JSON.stringify(this.patch)),
    });
    button(el('div', 'pn-buttons', pre.body), 'REMOVE ALL CABLES', () => { this.patch.cables = []; this.send(); this.drawCables(); });
  }

  pickSource(id) { this.pendingSource = this.pendingSource === id ? null : id; Object.values(this.jackEls).forEach((b) => b.classList.toggle('is-pending', b.dataset.id === this.pendingSource)); Object.entries(JACKS.inputs).forEach(([iid, j]) => this.jackEls[iid].classList.toggle('is-valid', !!this.pendingSource && j.accepts.includes(JACKS.sources[this.pendingSource].type))); this.patchMsg.textContent = this.pendingSource ? `${JACKS.sources[id].label} selected - now click a highlighted input.` : 'Cable cancelled.'; }
  pickInput(id) {
    if (!this.pendingSource) { this.patchMsg.textContent = 'Click an OUTPUT jack first.'; return; }
    const src = JACKS.sources[this.pendingSource]; const inp = JACKS.inputs[id];
    if (!inp.accepts.includes(src.type)) { this.patchMsg.textContent = `${inp.label} does not accept a ${src.type.toUpperCase()} signal.`; return; }
    if (this.patch.cables.some((c) => c.from === this.pendingSource && c.to === id)) { this.patchMsg.textContent = 'That cable already exists.'; return; }
    this.patch.cables.push({ from: this.pendingSource, to: id });
    this.patchMsg.textContent = `Connected ${src.label} → ${inp.label}.`;
    this.pendingSource = null; Object.values(this.jackEls).forEach((b) => b.classList.remove('is-pending', 'is-valid'));
    this.send(); this.drawCables();
  }
  removeCable(i) { const c = this.patch.cables.splice(i, 1)[0]; this.patchMsg.textContent = `Removed ${JACKS.sources[c.from].label} → ${JACKS.inputs[c.to].label}.`; this.send(); this.drawCables(); }

  drawCables() {
    const svg = this.svg; svg.replaceChildren();
    const br = this.board.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`);
    svg.style.width = `${br.width}px`; svg.style.height = `${br.height}px`;
    const colors = ['#ff9f0a', '#7de4ff', '#82e6a8', '#ff6a3d', '#c89bff', '#ffd36b'];
    Object.values(this.jackEls).forEach((b) => b.classList.remove('is-connected'));
    this.patch.cables.forEach((c, i) => {
      const a = this.jackEls[c.from].querySelector('i').getBoundingClientRect(); const b = this.jackEls[c.to].querySelector('i').getBoundingClientRect();
      const x1 = a.left + a.width / 2 - br.left, y1 = a.top + a.height / 2 - br.top, x2 = b.left + b.width / 2 - br.left, y2 = b.top + b.height / 2 - br.top;
      const sag = 30 + Math.abs(x2 - x1) * 0.1;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1} ${y1} C ${x1 + 60} ${y1 + sag}, ${x2 - 60} ${y2 + sag}, ${x2} ${y2}`);
      path.setAttribute('stroke', colors[i % colors.length]); path.setAttribute('class', 'ms-cable');
      path.addEventListener('click', () => this.removeCable(i));
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = `${JACKS.sources[c.from].label} → ${JACKS.inputs[c.to].label} (click to remove)`; path.appendChild(t);
      svg.appendChild(path);
      this.jackEls[c.from].classList.add('is-connected'); this.jackEls[c.to].classList.add('is-connected');
    });
  }

  async toggleMic(on) {
    if (!on) { this.micStream?.getTracks().forEach((t) => t.stop()); this.micSource?.disconnect(); this.micStream = null; this.micSource = null; this.patchMsg.textContent = 'External input disabled.'; return; }
    if (!this.engine.started) { this.micBtn.setValue(false, true); this.patchMsg.textContent = 'Power on first.'; return; }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      this.micSource = this.engine.ctx.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.engine.node);
      this.patchMsg.textContent = 'External input live. Patch ESP SIGNAL OUT → EXT SIGNAL IN to run it through the filters.';
    } catch (err) { this.micBtn.setValue(false, true); this.patchMsg.textContent = `Input unavailable: ${err.message}`; }
  }

  refresh() {
    const p = this.patch.params;
    Object.keys(this.ui).forEach((k) => { if (k in p) this.ui[k].setValue(p[k], true); });
    this.drawCables();
  }
}
document.addEventListener('DOMContentLoaded', () => { window.__ms20App = new MS20App(); });
