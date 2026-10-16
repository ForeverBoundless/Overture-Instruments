/** omni.js - OMNI modular instrument designer: library, canvas, inspector, toolbar, performance input. */
import { MODULES, CATEGORIES, SIGNAL_COLORS } from './omni/modules.js';
import { defaultPatch, validatePatch, connectionError, LiveGraph, patchToSVG, defaultParams } from './omni/graph.js';
import { TEMPLATES, templatePreview } from './omni/templates.js';
import { PresetStore, downloadText, pickFile } from './shared/presetStore.js';
import { Keyboard } from '../ui/Keyboard.js';
import { MidiManager, midiNoteName } from './engine/MidiManager.js';
import { noteToMidi, KEY_TO_SEMI } from './shared/panel.js';
import { registerMidiTarget, registerMidiTargetProvider } from './shared/midiMap.js';

const el = (tag, cls, parent, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; if (parent) parent.appendChild(n); return n; };
const uid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;
const NS = 'http://www.w3.org/2000/svg';

class OmniApp {
  constructor() {
    this.store = new PresetStore({ key: 'overture.omni.patches', version: 1, validate: validatePatch });
    this.patch = defaultPatch();
    this.ctx = null; this.live = null; this.selected = null; this.selectedWire = null; this.pending = null;
    this.view = { x: 20, y: 20, scale: 1 }; this.history = []; this.future = []; this.rebuildTimer = null;
    this._build();
    this.render();
    this.pushHistory();
    this._bindMidi();
    this._bindKeys();
  }

  // ------------------------------------------------------------------ layout
  _build() {
    const root = document.getElementById('omni-root');
    const bar = el('header', 'omni-toolbar', root);
    el('div', 'omni-logo', bar).innerHTML = '<a href="/" title="Overture home"><img src="/ui/Logos/OvertureLogo.png" alt="Overture"></a><strong>OMNI</strong>';
    this.nameInput = el('input', 'omni-name', bar); this.nameInput.value = this.patch.name; this.nameInput.setAttribute('aria-label', 'Instrument name'); this.nameInput.addEventListener('change', () => { this.patch.name = this.nameInput.value.slice(0, 60) || 'Untitled'; this.pushHistory(); });
    const tb = (label, fn, title) => { const b = el('button', 'omni-tb', bar, label); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; };
    tb('NEW', () => this.load(defaultPatch()));
    tb('TEMPLATES', () => this.templates(), 'Load a starter patch');
    tb('SAVE', () => this.save());
    this.loadSel = el('select', 'omni-tb omni-load', bar); this.loadSel.setAttribute('aria-label', 'Load saved instrument'); this.loadSel.addEventListener('change', () => { const it = this.store.get(this.loadSel.value); if (it) this.load(JSON.parse(JSON.stringify(it.data)), it.id); this.loadSel.value = ''; });
    this.refreshLoadList();
    tb('DELETE', () => { if (!this.currentId) { this.msg('This instrument is not saved yet.'); return; } if (confirm('Delete the saved instrument?')) { this.store.remove(this.currentId); this.currentId = null; this.refreshLoadList(); this.msg('Deleted.'); } });
    this.undoBtn = tb('UNDO', () => this.undo()); this.redoBtn = tb('REDO', () => this.redo());
    tb('−', () => this.zoom(0.8), 'Zoom out'); tb('+', () => this.zoom(1.25), 'Zoom in'); tb('RESET VIEW', () => { this.view = { x: 20, y: 20, scale: 1 }; this.applyView(); });
    tb('EXPORT JSON', () => downloadText(`${this.patch.name.replace(/\W+/g, '-') || 'omni'}.omni.json`, this.store.exportJSON({ name: this.patch.name, data: this.patch })));
    tb('IMPORT JSON', () => pickFile('.json,application/json', (text) => { try { const { data } = this.store.parseImport(text); this.load(data); this.msg('Imported.'); } catch (err) { this.msg(err.message, true); } }));
    tb('EXPORT SVG', () => downloadText(`${this.patch.name.replace(/\W+/g, '-') || 'omni'}.schematic.svg`, patchToSVG(this.patch), 'image/svg+xml'));
    tb('GUIDE', () => this.guide());
    this.status = el('div', 'omni-status', bar, 'Ready. Power on the audio to hear the instrument.');
    const main = el('div', 'omni-main', root);
    // Library
    const lib = el('aside', 'omni-library', main);
    el('h2', '', lib, 'MODULES');
    el('p', 'omni-hint', lib, 'Click to add at the centre, or drag onto the canvas.');
    CATEGORIES.forEach((cat) => {
      el('h3', '', lib, cat.toUpperCase());
      Object.entries(MODULES).filter(([, d]) => d.category === cat).forEach(([type, d]) => {
        const b = el('button', 'omni-lib-item', lib, d.name); b.type = 'button'; b.style.setProperty('--c', d.color); b.draggable = true;
        b.addEventListener('click', () => this.addModule(type));
        b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/omni-module', type); e.dataTransfer.effectAllowed = 'copy'; });
      });
    });
    // Canvas
    this.canvas = el('div', 'omni-canvas', main); this.canvas.tabIndex = 0; this.canvas.setAttribute('aria-label', 'Patch canvas');
    this.world = el('div', 'omni-world', this.canvas);
    this.wires = document.createElementNS(NS, 'svg'); this.wires.classList.add('omni-wires'); this.world.appendChild(this.wires);
    this.cards = el('div', 'omni-cards', this.world);
    this.canvas.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/omni-module')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    this.canvas.addEventListener('drop', (e) => { const type = e.dataTransfer.getData('text/omni-module'); if (!type) return; e.preventDefault(); const p = this.toWorld(e.clientX, e.clientY); this.addModule(type, p.x - 90, p.y - 20); });
    this._bindCanvas();
    // Inspector
    this.inspector = el('aside', 'omni-inspector', main);
    el('h2', '', this.inspector, 'INSPECTOR');
    this.inspBody = el('div', '', this.inspector);
    // Performance
    const perf = el('section', 'omni-perf', root);
    this.powerBtn = el('button', 'omni-tb omni-power', perf, 'POWER ON AUDIO'); this.powerBtn.type = 'button'; this.powerBtn.addEventListener('click', () => this.power());
    const master = el('label', 'omni-master', perf); el('span', '', master, 'MASTER'); this.masterInput = el('input', '', master); this.masterInput.type = 'range'; this.masterInput.min = 0; this.masterInput.max = 1; this.masterInput.step = 0.01; this.masterInput.value = this.patch.global.master;
    this.masterInput.addEventListener('input', () => { this.patch.global.master = Number(this.masterInput.value); if (this.master) this.master.gain.setTargetAtTime(this.patch.global.master, this.ctx.currentTime, 0.01); });
    registerMidiTarget(this.masterInput, { id: 'omni::master', label: 'MASTER', group: 'OUTPUT', get: () => Number(this.masterInput.value), set: (t) => { this.masterInput.value = t; this.masterInput.dispatchEvent(new Event('input')); } });
    // Every numeric module parameter is assignable, even when its module is not in the inspector.
    registerMidiTargetProvider(() => {
      const out = [];
      this.patch.modules.forEach((m) => {
        const def = MODULES[m.type]; if (!def) return;
        def.params.forEach((p) => {
          if (p.options) return;
          const log = !!p.log;
          const norm = (v) => (log ? (Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min)) : (v - p.min) / (p.max - p.min));
          const denorm = (t) => { let v = log ? Math.exp(Math.log(p.min) + t * (Math.log(p.max) - Math.log(p.min))) : p.min + t * (p.max - p.min); if (p.step) v = Math.round(v / p.step) * p.step; return Math.min(p.max, Math.max(p.min, v)); };
          out.push({ id: `omni::${m.id}::${p.key}`, label: p.label, group: `${def.name} (${m.id})`, el: document.getElementById(`p-${m.id}-${p.key}`),
            get: () => norm(m.params[p.key]),
            set: (t) => { const v = denorm(t); this.setParam(m.id, p.key, v, false); const inp = document.getElementById(`p-${m.id}-${p.key}`); if (inp) { inp.value = log ? Math.log(v) : v; const o = inp.parentElement?.querySelector('output'); if (o) o.textContent = v.toFixed(p.step === 1 ? 0 : 2); } } });
        });
      });
      return out;
    });
    const panic = el('button', 'omni-tb', perf, 'PANIC'); panic.type = 'button'; panic.addEventListener('click', () => this.allOff());
    this.midiEl = el('span', 'omni-midi', perf, 'MIDI: searching…');
    const kbWrap = el('div', 'omni-keys', perf);
    this.keyboard = new Keyboard({ startOctave: 2, octaves: 3, onNoteOn: (n, v) => this.noteOn(noteToMidi(n), v), onNoteOff: (n) => this.noteOff(noteToMidi(n)) });
    kbWrap.appendChild(this.keyboard.el);
  }

  msg(text, error = false) { this.status.textContent = text; this.status.classList.toggle('is-error', error); }
  refreshLoadList() { this.loadSel.replaceChildren(); const o = el('option', '', this.loadSel, 'LOAD…'); o.value = ''; this.store.items.forEach((it) => { const op = el('option', '', this.loadSel, it.name); op.value = it.id; }); }

  // ------------------------------------------------------------------ audio
  async power() {
    if (this.ctx) { this.ctx.close(); this.ctx = null; this.live?.teardown(); this.live = null; this.powerBtn.textContent = 'POWER ON AUDIO'; this.powerBtn.classList.remove('lit'); this.msg('Audio off.'); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC({ latencyHint: 'interactive' }); await this.ctx.resume();
      this.master = this.ctx.createGain(); this.master.gain.value = this.patch.global.master; this.master.connect(this.ctx.destination);
      this.live = new LiveGraph(this.ctx, this.master);
      await this.live.build(this.patch);
      this.powerBtn.textContent = 'POWER OFF'; this.powerBtn.classList.add('lit'); this.msg('Audio running - play the keyboard or your MIDI controller.');
    } catch (err) { this.msg(`Audio could not start: ${err.message}`, true); }
  }
  scheduleRebuild() { if (!this.live) return; clearTimeout(this.rebuildTimer); this.rebuildTimer = setTimeout(async () => { try { await this.live.build(this.patch); } catch (err) { this.msg(`Graph error: ${err.message}`, true); } }, 60); }
  noteOn(midi, vel) { this.keyboard.setKeyActive(midiNoteName(midi), true); this.live?.noteOn(midi, vel); }
  noteOff(midi) { this.keyboard.setKeyActive(midiNoteName(midi), false); this.live?.noteOff(midi); }
  allOff() { this.live?.allOff(); this.keyboard.el.querySelectorAll('.lp-key.active').forEach((k) => k.classList.remove('active')); }

  _bindMidi() {
    this.midi = new MidiManager({
      onNoteOn: (n, v) => this.noteOn(n, v), onNoteOff: (n) => this.noteOff(n), onAllNotesOff: () => this.allOff(), onAllSoundOff: () => this.allOff(),
      onConnectionChange: (c, _n, names) => { this.midiEl.textContent = c ? `MIDI: ${names.join(', ')}` : 'MIDI: no device'; },
    });
    this.midi.init().then((ok) => { if (!ok) this.midiEl.textContent = this.midi.supported ? 'MIDI: permission not granted' : 'MIDI: not supported'; else if (!this.midi.isConnected) this.midiEl.textContent = 'MIDI: no device'; });
  }

  _bindKeys() {
    const held = new Map();
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.ctrlKey || e.metaKey) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selectedWire) this.removeConnection(this.selectedWire); else if (this.selected) this.removeModule(this.selected); return; }
      if (e.key === 'Escape') { this.pending = null; this.renderWires(); this.allOff(); return; }
      if (e.repeat) return;
      const semi = KEY_TO_SEMI[e.key.toLowerCase()]; if (semi === undefined || held.has(e.key)) return;
      const midi = 48 + semi; held.set(e.key, midi); this.noteOn(midi, 0.8);
    });
    window.addEventListener('keyup', (e) => { const m = held.get(e.key); if (m === undefined) return; held.delete(e.key); this.noteOff(m); });
    window.addEventListener('blur', () => { held.forEach((m) => this.noteOff(m)); held.clear(); });
  }

  // ------------------------------------------------------------------ patch editing
  pushHistory() { this.history.push(JSON.stringify(this.patch)); if (this.history.length > 60) this.history.shift(); this.future = []; this.refreshHistoryButtons(); }
  refreshHistoryButtons() { this.undoBtn.disabled = this.history.length <= 1; this.redoBtn.disabled = !this.future.length; }
  undo() { if (this.history.length <= 1) return; this.future.push(this.history.pop()); this.patch = JSON.parse(this.history[this.history.length - 1]); this.afterLoad(); }
  redo() { if (!this.future.length) return; const s = this.future.pop(); this.history.push(s); this.patch = JSON.parse(s); this.afterLoad(); }
  afterLoad() { this.selected = null; this.selectedWire = null; this.nameInput.value = this.patch.name; this.masterInput.value = this.patch.global.master; this.render(); this.scheduleRebuild(); this.refreshHistoryButtons(); }
  load(patch, id = null) { try { this.patch = validatePatch(patch); this.currentId = id; this.afterLoad(); this.pushHistory(); } catch (err) { this.msg(err.message, true); } }
  save() { const existing = this.currentId ? this.store.get(this.currentId) : null; const name = prompt('Instrument name', existing?.name || this.patch.name); if (name === null) return; this.patch.name = name.slice(0, 60) || 'Untitled'; this.nameInput.value = this.patch.name; const it = this.store.save(this.patch.name, this.patch, existing?.id); this.currentId = it.id; this.refreshLoadList(); this.msg(`Saved "${it.name}".`); }

  addModule(type, x, y) {
    const def = MODULES[type];
    if (def.single && this.patch.modules.some((m) => m.type === type)) { this.msg('Only one Audio Output per instrument.', true); return; }
    const centre = this.toWorld(this.canvas.clientWidth / 2 + this.canvas.getBoundingClientRect().left, this.canvas.clientHeight / 2 + this.canvas.getBoundingClientRect().top);
    const m = { id: uid(type.slice(0, 3)), type, x: x ?? centre.x - 90 + (this.patch.modules.length % 4) * 18, y: y ?? centre.y - 40 + (this.patch.modules.length % 4) * 18, params: defaultParams(type) };
    this.patch.modules.push(m); this.selected = m.id; this.render(); this.scheduleRebuild(); this.pushHistory(); this.msg(`Added ${def.name}.`);
  }
  removeModule(id) { this.patch.modules = this.patch.modules.filter((m) => m.id !== id); this.patch.connections = this.patch.connections.filter((c) => c.from.module !== id && c.to.module !== id); this.selected = null; this.render(); this.scheduleRebuild(); this.pushHistory(); }
  duplicateModule(id) { const m = this.patch.modules.find((x) => x.id === id); if (!m || MODULES[m.type].single) return; const copy = { ...m, id: uid(m.type.slice(0, 3)), x: m.x + 30, y: m.y + 30, params: { ...m.params } }; this.patch.modules.push(copy); this.selected = copy.id; this.render(); this.scheduleRebuild(); this.pushHistory(); }
  tryConnect(from, to) {
    const byId = Object.fromEntries(this.patch.modules.map((m) => [m.id, m]));
    const err = connectionError(byId, from, to, this.patch.connections);
    if (err) { this.msg(`Cannot connect: ${err}`, true); return false; }
    this.patch.connections.push({ id: uid('c'), from, to }); this.render(); this.scheduleRebuild(); this.pushHistory(); this.msg('Connected.'); return true;
  }
  removeConnection(id) { this.patch.connections = this.patch.connections.filter((c) => c.id !== id); this.selectedWire = null; this.render(); this.scheduleRebuild(); this.pushHistory(); }
  setParam(id, key, value, commit) {
    const m = this.patch.modules.find((x) => x.id === id); if (!m) return; m.params[key] = value;
    if (this.live) { const ok = this.live.setParam(id, key, value); if (!ok) this.scheduleRebuild(); }
    if (commit) this.pushHistory();
  }

  // ------------------------------------------------------------------ canvas
  toWorld(cx, cy) { const r = this.canvas.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.scale, y: (cy - r.top - this.view.y) / this.view.scale }; }
  applyView() { this.world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`; }
  zoom(f, cx, cy) { const r = this.canvas.getBoundingClientRect(); const px = cx ?? r.width / 2; const py = cy ?? r.height / 2; const next = Math.min(2.5, Math.max(0.3, this.view.scale * f)); this.view.x = px - (px - this.view.x) * (next / this.view.scale); this.view.y = py - (py - this.view.y) * (next / this.view.scale); this.view.scale = next; this.applyView(); }

  _bindCanvas() {
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      const port = e.target.closest('.omni-port'); const card = e.target.closest('.omni-module'); const wire = e.target.closest('.omni-wire');
      if (port) {
        e.preventDefault();
        const ref = { module: port.dataset.module, port: port.dataset.port };
        if (port.dataset.dir === 'out') { drag = { kind: 'wire', from: ref, x: e.clientX, y: e.clientY }; this.pending = ref; this.highlightTargets(ref); this.canvas.setPointerCapture(e.pointerId); }
        else if (this.pending) { this.tryConnect(this.pending, ref); this.pending = null; this.highlightTargets(null); }
        else this.msg('Drag from an output port (right side) to an input port, or click an output first.');
        return;
      }
      if (wire) { this.selectedWire = wire.dataset.id; this.selected = null; this.renderWires(); this.renderInspector(); this.msg('Wire selected - press Delete to remove it.'); return; }
      if (card) {
        const m = this.patch.modules.find((x) => x.id === card.dataset.id);
        this.selected = m.id; this.selectedWire = null; this.renderSelection(); this.renderInspector();
        if (e.target.closest('.omni-module-head')) { drag = { kind: 'move', m, ox: e.clientX, oy: e.clientY, sx: m.x, sy: m.y }; this.canvas.setPointerCapture(e.pointerId); }
        return;
      }
      drag = { kind: 'pan', ox: e.clientX, oy: e.clientY, sx: this.view.x, sy: this.view.y }; this.canvas.setPointerCapture(e.pointerId);
      this.selected = null; this.selectedWire = null; this.renderSelection(); this.renderInspector();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (drag.kind === 'move') { drag.m.x = drag.sx + (e.clientX - drag.ox) / this.view.scale; drag.m.y = drag.sy + (e.clientY - drag.oy) / this.view.scale; this.positionCard(drag.m); this.renderWires(); }
      else if (drag.kind === 'pan') { this.view.x = drag.sx + e.clientX - drag.ox; this.view.y = drag.sy + e.clientY - drag.oy; this.applyView(); }
      else if (drag.kind === 'wire') { const p = this.toWorld(e.clientX, e.clientY); this.renderWires({ from: drag.from, to: p }); }
    });
    const up = (e) => {
      if (!drag) return;
      if (drag.kind === 'wire') {
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.omni-port[data-dir="in"]');
        if (target) { this.tryConnect(drag.from, { module: target.dataset.module, port: target.dataset.port }); this.pending = null; this.highlightTargets(null); }
        else if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { this.pending = null; this.highlightTargets(null); this.msg('Released away from an input - cable dropped.'); }
        else this.msg(`${drag.from.port} selected - now click a highlighted input.`);
        this.renderWires();
      } else if (drag.kind === 'move') this.pushHistory();
      drag = null;
    };
    this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = this.canvas.getBoundingClientRect(); this.zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  }

  highlightTargets(ref) {
    this.cards.querySelectorAll('.omni-port').forEach((p) => p.classList.remove('is-valid', 'is-pending'));
    if (!ref) return;
    const byId = Object.fromEntries(this.patch.modules.map((m) => [m.id, m]));
    this.cards.querySelector(`.omni-port[data-dir="out"][data-module="${ref.module}"][data-port="${ref.port}"]`)?.classList.add('is-pending');
    this.cards.querySelectorAll('.omni-port[data-dir="in"]').forEach((p) => { if (!connectionError(byId, ref, { module: p.dataset.module, port: p.dataset.port }, this.patch.connections)) p.classList.add('is-valid'); });
  }

  // ------------------------------------------------------------------ rendering
  render() { this.renderCards(); this.renderWires(); this.renderInspector(); this.applyView(); }
  positionCard(m) { const c = this.cards.querySelector(`[data-id="${m.id}"]`); if (c) { c.style.left = `${m.x}px`; c.style.top = `${m.y}px`; } }
  renderCards() {
    this.cards.replaceChildren();
    this.patch.modules.forEach((m) => {
      const def = MODULES[m.type];
      const card = el('div', 'omni-module', this.cards); card.dataset.id = m.id; card.style.setProperty('--c', def.color); this.positionCard(m);
      const head = el('div', 'omni-module-head', card); el('span', '', head, def.name); el('small', '', head, m.id);
      const ports = el('div', 'omni-ports', card);
      const inCol = el('div', 'omni-port-col', ports); const outCol = el('div', 'omni-port-col omni-port-col--out', ports);
      def.inputs.forEach((p) => { const row = el('div', 'omni-port-row', inCol); const dot = el('button', `omni-port omni-port--${p.type}`, row); dot.type = 'button'; dot.dataset.dir = 'in'; dot.dataset.module = m.id; dot.dataset.port = p.id; dot.title = `${p.label} (${p.type} in)`; dot.setAttribute('aria-label', `${def.name} ${p.label} input`); el('span', '', row, p.label); });
      def.outputs.forEach((p) => { const row = el('div', 'omni-port-row', outCol); el('span', '', row, p.label); const dot = el('button', `omni-port omni-port--${p.type}`, row); dot.type = 'button'; dot.dataset.dir = 'out'; dot.dataset.module = m.id; dot.dataset.port = p.id; dot.title = `${p.label} (${p.type} out)`; dot.setAttribute('aria-label', `${def.name} ${p.label} output`); });
      const sum = def.params.slice(0, 2).map((p) => `${p.label.split(' (')[0]} ${p.options ? p.options[Math.round(m.params[p.key])] : +Number(m.params[p.key]).toFixed(2)}`).join(' · ');
      el('div', 'omni-module-summary', card, sum);
    });
    this.renderSelection();
  }
  renderSelection() { this.cards.querySelectorAll('.omni-module').forEach((c) => c.classList.toggle('is-selected', c.dataset.id === this.selected)); }
  portPos(ref, dir) {
    const dot = this.cards.querySelector(`.omni-port[data-dir="${dir}"][data-module="${ref.module}"][data-port="${ref.port}"]`); if (!dot) return null;
    const r = dot.getBoundingClientRect(); const w = this.world.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - w.left) / this.view.scale, y: (r.top + r.height / 2 - w.top) / this.view.scale };
  }
  renderWires(temp = null) {
    this.wires.replaceChildren();
    const byId = Object.fromEntries(this.patch.modules.map((m) => [m.id, m]));
    const draw = (a, b, color, id) => {
      const path = document.createElementNS(NS, 'path'); const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
      path.setAttribute('d', `M${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`); path.setAttribute('stroke', color); path.classList.add('omni-wire');
      if (id) { path.dataset.id = id; if (id === this.selectedWire) path.classList.add('is-selected'); } else path.classList.add('is-temp');
      this.wires.appendChild(path);
    };
    this.patch.connections.forEach((c) => { const a = this.portPos(c.from, 'out'); const b = this.portPos(c.to, 'in'); if (!a || !b) return; const type = MODULES[byId[c.from.module].type].outputs.find((p) => p.id === c.from.port)?.type; draw(a, b, SIGNAL_COLORS[type], c.id); });
    if (temp) { const a = this.portPos(temp.from, 'out'); if (a) draw(a, temp.to, '#fff', null); }
  }
  renderInspector() {
    const body = this.inspBody; body.replaceChildren();
    if (this.selectedWire) { const c = this.patch.connections.find((x) => x.id === this.selectedWire); if (c) { el('p', 'omni-hint', body, `${c.from.module}.${c.from.port} → ${c.to.module}.${c.to.port}`); const b = el('button', 'omni-tb', body, 'REMOVE WIRE'); b.type = 'button'; b.addEventListener('click', () => this.removeConnection(c.id)); } return; }
    const m = this.patch.modules.find((x) => x.id === this.selected);
    if (!m) { el('p', 'omni-hint', body, 'Select a module to edit its parameters. Drag module headers to move them; drag from a right-hand port to a left-hand port to connect.'); const miss = this.missingReport(); if (miss) el('p', 'omni-warn', body, miss); return; }
    const def = MODULES[m.type];
    el('h3', '', body, def.name); el('p', 'omni-hint', body, `${m.id} · ${def.category}`);
    def.params.forEach((p) => {
      const row = el('label', 'omni-param', body); const lab = el('span', '', row, p.label);
      if (p.options) {
        const s = el('select', '', row); p.options.forEach((o, i) => { const op = el('option', '', s, o); op.value = i; }); s.value = Math.round(m.params[p.key]);
        s.addEventListener('change', () => { this.setParam(m.id, p.key, Number(s.value), true); this.renderCards(); this.renderWires(); });
      } else {
        const inp = el('input', '', row); inp.type = 'range'; const log = !!p.log; inp.min = log ? Math.log(p.min) : p.min; inp.max = log ? Math.log(p.max) : p.max; inp.step = p.step ?? (log ? 0.001 : (p.max - p.min) / 400);
        inp.value = log ? Math.log(m.params[p.key]) : m.params[p.key];
        const out = el('output', '', row, (+m.params[p.key]).toFixed(p.step === 1 ? 0 : 2));
        const val = () => (log ? Math.exp(Number(inp.value)) : Number(inp.value));
        inp.addEventListener('input', () => { this.setParam(m.id, p.key, val(), false); out.textContent = val().toFixed(p.step === 1 ? 0 : 2); });
        inp.addEventListener('change', () => { this.setParam(m.id, p.key, val(), true); this.renderCards(); this.renderWires(); });
        lab.htmlFor = inp.id = `p-${m.id}-${p.key}`;
        inp.setAttribute('role', 'slider');
        inp._oiMidi = { id: `omni::${m.id}::${p.key}`, label: p.label, group: `${def.name} (${m.id})`, get: () => 0, set: () => {} };
      }
    });
    const bb = el('div', 'omni-insp-buttons', body);
    const dup = el('button', 'omni-tb', bb, 'DUPLICATE'); dup.type = 'button'; dup.addEventListener('click', () => this.duplicateModule(m.id)); if (def.single) dup.disabled = true;
    const del = el('button', 'omni-tb', bb, 'DELETE'); del.type = 'button'; del.addEventListener('click', () => this.removeModule(m.id));
    const miss = this.missingReport(); if (miss) el('p', 'omni-warn', body, miss);
  }
  missingReport() {
    const out = this.patch.modules.find((m) => m.type === 'output');
    if (!out) return 'No Audio Output module - nothing will be heard.';
    if (!this.patch.connections.some((c) => c.to.module === out.id)) return 'The Audio Output has nothing connected to it.';
    const reaches = new Set([out.id]); let grew = true;
    while (grew) { grew = false; this.patch.connections.forEach((c) => { if (reaches.has(c.to.module) && !reaches.has(c.from.module)) { reaches.add(c.from.module); grew = true; } }); }
    const unheard = this.patch.modules.filter((m) => !reaches.has(m.id) && MODULES[m.type].outputs.length);
    return unheard.length ? `Not reaching the output: ${unheard.map((m) => m.id).join(', ')}.` : '';
  }
  templates() {
    const o = el('div', 'omni-guide', document.body);
    const card = el('div', 'omni-guide-card omni-templates', o);
    el('h2', '', card, 'Templates'); el('p', 'omni-hint', card, 'Click a template to load it. Unsaved changes are replaced (Ctrl+Z restores them).');
    const grid = el('div', 'omni-tpl-grid', card);
    TEMPLATES.forEach((t) => {
      const b = el('button', 'omni-tpl', grid); b.type = 'button';
      el('div', 'omni-tpl-prev', b).innerHTML = templatePreview(t.patch);
      el('strong', '', b, t.name); el('span', '', b, t.desc);
      b.addEventListener('click', () => { this.load(JSON.parse(JSON.stringify(t.patch))); this.view = { x: 20, y: 20, scale: 1 }; this.applyView(); o.remove(); this.msg(`Loaded template "${t.name}".`); });
    });
    const close = el('button', '', card, 'CLOSE'); close.type = 'button'; close.addEventListener('click', () => o.remove());
    o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
  }
  guide() {
    const o = el('div', 'omni-guide', document.body);
    o.innerHTML = `<div class="omni-guide-card"><h2>OMNI guide</h2>
<p><b>Build:</b> click a module in the library (or drag it onto the canvas). Drag a module by its header. Scroll to zoom, drag empty space to pan.</p>
<p><b>Connect:</b> drag from an output port (right edge) to an input port (left edge), or click an output then a highlighted input. Colours: <span style="color:#ff9f0a">audio</span>, <span style="color:#7de4ff">control voltage</span>, <span style="color:#82e6a8">note/gate events</span>. Audio feeds audio inputs; CV feeds modulation inputs (filter cutoff, VCA gain, oscillator pitch mod); note ports carry key presses from the keyboard, sequencer, clock, arpeggiator or rhythm generators to oscillators, drums, envelopes and the FM voice. Note utilities (Chord, Transpose, Echo) sit between a note source and its destination.</p>
<p><b>Edit:</b> select a module to change its parameters in the inspector. Delete / Backspace removes the selected module or wire. Ctrl+Z / Ctrl+Shift+Z undo and redo.</p>
<p><b>Play:</b> press POWER ON AUDIO, then play the on-screen keys, your computer keys (A–') or a MIDI controller. Notes are monophonic per keyboard module (last note wins).</p>
<p><b>Keep:</b> SAVE stores the instrument in this browser; EXPORT/IMPORT JSON moves it between browsers; EXPORT SVG produces a schematic drawing of the patch. Structural changes rebuild the audio graph (a brief gap in sound is expected); parameter changes are live.</p>
<button type="button">CLOSE</button></div>`;
    o.querySelector('button').addEventListener('click', () => o.remove()); o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
  }
}
document.addEventListener('DOMContentLoaded', () => { window.__omniApp = new OmniApp(); });
