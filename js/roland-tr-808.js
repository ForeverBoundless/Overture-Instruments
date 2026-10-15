/** roland-tr-808.js - rhythm composer page. Sound + sequencer: js/engine/TR808Engine.js */
import { TR808Engine, LANES, GM_NOTES, DEFAULT_PARAMS, TEMPO_MIN, TEMPO_MAX } from './engine/TR808Engine.js';
import { PresetStore, num } from './shared/presetStore.js';
import { MidiManager } from './engine/MidiManager.js';
import { el, section, knob, button, toggle, display, presetBar, footer, clamp } from './shared/panel.js';
import { TR808_PATTERNS } from './data/tr808Patterns.js';

function validatePattern(d) {
  if (!d || typeof d !== 'object') throw new Error('Not a TR-808 pattern.');
  const out = { tempo: num(d.tempo, TEMPO_MIN, TEMPO_MAX, 120), length: Number(d.length) === 32 ? 32 : 16, lanes: {}, params: DEFAULT_PARAMS(), variants: { LT: 'LT', MT: 'MT', HT: 'HT', RS: 'RS', CP: 'CP' } };
  LANES.forEach((l) => { const src = Array.isArray(d.lanes?.[l.id]) ? d.lanes[l.id] : []; out.lanes[l.id] = Array.from({ length: 32 }, (_, i) => (src[i] === 2 ? 2 : src[i] ? 1 : 0)); });
  if (d.params && typeof d.params === 'object') LANES.forEach((l) => l.params.forEach((p) => { if (d.params[l.id] && d.params[l.id][p] !== undefined) out.params[l.id][p] = num(d.params[l.id][p], 0, 1, out.params[l.id][p]); }));
  if (d.variants && typeof d.variants === 'object') Object.keys(out.variants).forEach((k) => { const lane = LANES.find((l) => l.id === k); if (d.variants[k] === lane.alt) out.variants[k] = lane.alt; });
  return out;
}

class TR808App {
  constructor() {
    this.engine = new TR808Engine();
    this.store = new PresetStore({ key: 'overture.tr808.patterns', version: 1, validate: validatePattern });
    this.bar = 0; this.knobs = {}; this.cells = {}; this.variantButtons = {};
    this._build();
    this.engine.onStep = (s) => this.showStep(s);
    this.midi = new MidiManager({
      onNoteOn: (n, v) => { const id = GM_NOTES[n]; if (id && this.engine.started) this.engine.trigger(id, undefined, v > 0.85); },
      onStart: () => { if (this.engine.started) { this.engine.stop(); this.engine.play(); this.refreshTransport(); } },
      onStop: () => { this.engine.stop(); this.refreshTransport(); },
      onContinue: () => { if (this.engine.started) { this.engine.continue(); this.refreshTransport(); } },
      onControlChange: (cc, v) => { if (cc === 7) this.knobs.master.setValue(v / 127); },
      onConnectionChange: (c, _n, names) => { this.midiEl.textContent = c ? `MIDI: ${names.join(', ')} (GM drum notes)` : 'MIDI: no device'; this.midiEl.classList.toggle('is-on', c); },
    });
    this.midi.init().then((ok) => { if (!ok) this.midiEl.textContent = this.midi.supported ? 'MIDI: permission not granted' : 'MIDI: not supported'; });
    this.presets.load('f:0');
    const powerEl = document.getElementById('tr808-power');
    const start = async () => { try { await this.engine.start(); } catch (e) { powerEl.querySelector('small').textContent = e.message; return; } powerEl.classList.add('is-off'); this.disp.flash('AUDIO READY'); };
    powerEl.addEventListener('click', start);
    powerEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') start(); });
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.repeat) return;
      if (e.key === ' ') { e.preventDefault(); this.toggleTransport(); }
      if (e.key === 'Escape') { this.engine.stop(); this.refreshTransport(); }
    });
  }

  get pattern() { return this._pattern; }

  _build() {
    const page = el('div', 'pn-page', document.getElementById('tr808-root'));
    this.shell = el('main', 'pn-shell tr-shell', page);
    const header = el('header', 'pn-header', this.shell);
    el('div', 'pn-brand', header).innerHTML = '<img src="/ui/Logos/Roland_logo.png" alt="Roland"><div class="pn-model"><b>TR-808</b><span>RHYTHM COMPOSER • COMPUTER CONTROLLED</span></div>';
    const right = el('div', 'pn-header-right', header);
    this.disp = display(right);
    this.midiEl = el('div', 'pn-midi', right, 'MIDI: searching…');
    const rows = el('div', 'pn-rows', this.shell);
    // Instrument sections
    const inst = el('div', 'tr-instruments', rows);
    LANES.forEach((lane) => {
      const s = section(inst, lane.id === 'AC' ? 'ACCENT' : lane.alt ? `${lane.name} / ${lane.altName}` : lane.name);
      s.sec.classList.add('tr-inst');
      const kn = el('div', 'pn-knobs', s.body);
      lane.params.forEach((p) => { this.knobs[`${lane.id}.${p}`] = knob(kn, { label: p, min: 0, max: 1, value: 0.5, size: 40, formatValue: (v) => `${Math.round(v * 100)}`, onChange: (v) => { this._pattern.params[lane.id][p] = v; this.engine.params[lane.id][p] = v; } }); });
      const bb = el('div', 'pn-buttons', s.body);
      if (lane.alt) {
        const sw = button(bb, lane.id, () => { const next = this._pattern.variants[lane.id] === lane.id ? lane.alt : lane.id; this._pattern.variants[lane.id] = next; this.engine.setVariant(lane.id, next); sw.textContent = next; this.disp.flash(`${lane.id} LANE → ${next === lane.id ? lane.name : lane.altName}`); });
        sw.title = 'Instrument select switch';
        this.variantButtons[lane.id] = sw;
      }
      if (lane.id !== 'AC') button(bb, '▶', () => { if (!this.engine.started) return; this.engine.trigger(this._pattern.variants[lane.id] || lane.id); }).title = 'Audition';
    });
    // Sequencer
    const seq = section(rows, 'STEP SEQUENCER', 'CLICK STEPS TO PROGRAM • SHIFT-CLICK FOR AN ACCENTED STEP');
    seq.sec.classList.add('tr-seq');
    const grid = el('div', 'tr-grid', seq.body);
    this.playhead = [];
    const head = el('div', 'tr-grid-row tr-grid-head', grid);
    el('span', 'tr-lane-name', head, '');
    for (let i = 0; i < 16; i += 1) { const h = el('span', `tr-step-head tr-color-${Math.floor(i / 4)}`, head, String(i + 1)); this.playhead.push(h); }
    LANES.forEach((lane) => {
      const r = el('div', 'tr-grid-row', grid);
      const name = el('button', 'tr-lane-name', r, lane.id); name.type = 'button'; name.title = lane.name;
      name.addEventListener('click', () => { if (lane.id !== 'AC' && this.engine.started) this.engine.trigger(this._pattern.variants[lane.id] || lane.id); });
      this.cells[lane.id] = [];
      for (let i = 0; i < 16; i += 1) {
        const c = el('button', `tr-step tr-color-${Math.floor(i / 4)}`, r); c.type = 'button'; c.setAttribute('aria-label', `${lane.name} step ${i + 1}`);
        c.addEventListener('click', (e) => { const idx = this.bar * 16 + i; const cur = this._pattern.lanes[lane.id][idx]; const next = e.shiftKey ? (cur === 2 ? 0 : 2) : (cur ? 0 : 1); this._pattern.lanes[lane.id][idx] = next; this.engine.pattern[lane.id][idx] = next; this.renderCell(lane.id, i); });
        this.cells[lane.id].push(c);
      }
    });
    const ctl = el('div', 'tr-controls', seq.body);
    this.barButtons = [0, 1].map((b) => toggle(ctl, `BAR ${b + 1}`, b === 0, () => { this.bar = b; this.barButtons.forEach((x, i) => x.setValue(i === b, true)); this.renderGrid(); }));
    this.lengthToggle = toggle(ctl, '32 STEPS', false, (v) => { this._pattern.length = v ? 32 : 16; this.engine.length = this._pattern.length; this.barButtons[1].disabled = !v; if (!v && this.bar === 1) this.barButtons[0].click(); });
    button(ctl, 'CLEAR BAR', () => { LANES.forEach((l) => { for (let i = 0; i < 16; i += 1) { this._pattern.lanes[l.id][this.bar * 16 + i] = 0; } }); this.syncEngine(); this.renderGrid(); });
    button(ctl, 'COPY 1 → 2', () => { LANES.forEach((l) => { for (let i = 0; i < 16; i += 1) this._pattern.lanes[l.id][16 + i] = this._pattern.lanes[l.id][i]; }); this.syncEngine(); this.renderGrid(); this.disp.flash('BAR 1 COPIED TO BAR 2'); });
    button(ctl, 'CLEAR ALL', () => { if (!confirm('Clear every step?')) return; LANES.forEach((l) => this._pattern.lanes[l.id].fill(0)); this.syncEngine(); this.renderGrid(); });
    // Transport + patterns
    const bottom = el('div', 'pn-row tr-bottom', rows);
    const tr = section(bottom, 'TRANSPORT');
    const tb = el('div', 'pn-buttons', tr.body);
    this.startBtn = button(tb, 'START', () => this.toggleTransport());
    this.startBtn.classList.add('tr-start');
    button(tb, 'CONTINUE', () => { if (!this.engine.started || this.engine.playing) return; this.engine.continue(); this.refreshTransport(); });
    const tk = el('div', 'pn-knobs', tr.body);
    this.knobs.tempo = knob(tk, { label: 'TEMPO', min: TEMPO_MIN, max: TEMPO_MAX, value: 120, formatValue: (v) => `${Math.round(v)} BPM`, onChange: (v) => { this._pattern.tempo = Math.round(v); this.engine.setTempo(Math.round(v)); this.disp.set(`TEMPO ${Math.round(v)}`, this.disp.sub || ''); } });
    this.knobs.master = knob(tk, { label: 'MASTER', min: 0, max: 1, value: 0.8, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.engine.setMaster(v) });
    el('div', 'pn-help', tr.body, 'Space bar starts/stops. The sequencer is scheduled on the audio clock, so playback stays steady while you edit.');
    const pat = section(bottom, 'PATTERN MEMORY', 'ORIGINAL OVERTURE PATTERNS');
    this.presets = presetBar(pat.body, {
      factory: TR808_PATTERNS, store: this.store, display: this.disp, filename: 'tr-808-pattern', panic: () => { this.engine.stop(); this.refreshTransport(); },
      apply: (data, name) => this.loadPattern(validatePattern(data), name),
      capture: () => JSON.parse(JSON.stringify(this._pattern)),
    });
    footer(this.shell, 'SYNTHESIZED PERCUSSION • 16/32-STEP SEQUENCER • 40–300 BPM • GM DRUM NOTES VIA MIDI');
  }

  loadPattern(p, name) {
    this._pattern = p;
    this.engine.params = JSON.parse(JSON.stringify(p.params));
    this.engine.variants = { ...p.variants };
    this.engine.setTempo(p.tempo); this.engine.length = p.length;
    this.syncEngine();
    LANES.forEach((l) => l.params.forEach((k) => this.knobs[`${l.id}.${k}`].setValue(p.params[l.id][k], true)));
    Object.entries(this.variantButtons).forEach(([id, b]) => { b.textContent = p.variants[id]; });
    this.knobs.tempo.setValue(p.tempo, true);
    this.lengthToggle.setValue(p.length === 32, true); this.barButtons[1].disabled = p.length !== 32;
    if (p.length !== 32 && this.bar === 1) { this.bar = 0; this.barButtons.forEach((x, i) => x.setValue(i === 0, true)); }
    this.disp.sub = `PATTERN ${name}`;
    this.disp.set(`TEMPO ${p.tempo}`, `PATTERN ${name}  ${p.length} STEPS`);
    this.renderGrid();
  }

  syncEngine() { LANES.forEach((l) => { this.engine.pattern[l.id] = this._pattern.lanes[l.id].slice(); }); }
  renderCell(id, i) { const v = this._pattern.lanes[id][this.bar * 16 + i]; const c = this.cells[id][i]; c.classList.toggle('is-on', v > 0); c.classList.toggle('is-accent', v === 2); c.setAttribute('aria-pressed', String(v > 0)); }
  renderGrid() { LANES.forEach((l) => { for (let i = 0; i < 16; i += 1) this.renderCell(l.id, i); }); }
  showStep(s) { this.playhead.forEach((h, i) => h.classList.toggle('is-playing', s >= 0 && s === this.bar * 16 + i)); if (s >= 0 && this._pattern.length === 32 && Math.floor(s / 16) !== this.bar) { this.bar = Math.floor(s / 16); this.barButtons.forEach((x, i) => x.setValue(i === this.bar, true)); this.renderGrid(); } }
  toggleTransport() { if (!this.engine.started) return; if (this.engine.playing) this.engine.stop(); else this.engine.play(); this.refreshTransport(); }
  refreshTransport() { this.startBtn.textContent = this.engine.playing ? 'STOP' : 'START'; this.startBtn.classList.toggle('lit', this.engine.playing); }
}
document.addEventListener('DOMContentLoaded', () => { window.__tr808App = new TR808App(); });
