/**
 * midiMap.js - user MIDI CC assignments for on-screen knobs and sliders.
 *
 * Any control that exposes `el._oiMidi = { label, get() -> 0..1, set(0..1) }`
 * (ui/Knob.js does this automatically; custom controls call registerMidiTarget)
 * becomes assignable. Assignments are learned from the physical controller, so
 * every assignment is backed by one real knob/slider (device + channel + CC),
 * and the number of possible assignments is simply the number of distinct
 * controls the device has been seen to send. Assignments are saved per
 * instrument in localStorage and edited from a slide-in pane on the right.
 */
import { MidiManager } from '../engine/MidiManager.js';

// CCs with a fixed MIDI meaning that the instruments already handle.
const RESERVED_CC = new Set([0, 1, 6, 32, 33, 38, 64, 96, 97, 98, 99, 100, 101, 120, 121, 122, 123, 124, 125, 126, 127]);
const STORE_VERSION = 1;

export function registerMidiTarget(el, { label, get, set, group, id }) {
  el._oiMidi = { label, get, set, group, id };
  if (!el.hasAttribute('role')) el.setAttribute('role', 'slider');
  el.setAttribute('data-oi-midi', '');
  return el;
}

/**
 * Register a provider of "virtual" targets that may not currently be in the
 * DOM (e.g. parameters of modules that are not being inspected).
 * provider: () => [{ id, label, group, get, set, el? }]
 */
const providers = new Set();
export function registerMidiTargetProvider(provider) { providers.add(provider); instance?.invalidate(); return () => providers.delete(provider); }

const instrumentId = () => {
  const path = (globalThis.location?.pathname || '').replace(/\.html$/, '').replace(/\/+$/, '');
  return path.split('/').filter(Boolean).pop() || 'instrument';
};

const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

/** Human-readable group for a control: nearest heading in its section. */
function groupOf(el) {
  let node = el.parentElement;
  while (node && node !== document.body) {
    if (node.dataset.midiGroup) return node.dataset.midiGroup;
    const head = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > header, :scope > .pn-section-title, :scope > [class*="title"], :scope > [class*="head"]');
    if (head && node.matches('section, fieldset, article, .pn-section, [class*="section"], [class*="module"], [class*="panel"], [class*="card"], [class*="lane"]')) {
      const t = textOf(head).slice(0, 40);
      if (t) return t;
    }
    node = node.parentElement;
  }
  return '';
}

export class MidiMap {
  constructor() {
    this.instrument = instrumentId();
    this.key = `oi.midimap.v${STORE_VERSION}.${this.instrument}`;
    this.state = this._load();
    this.targets = [];
    this.byId = new Map();
    this.dirty = true;
    this.learn = null; // { source?, targetId?, editing? }
    this.devices = [];
    this.lastSeen = new Map(); // source key -> timestamp
    if (typeof MutationObserver === 'function') {
      this._observer = new MutationObserver(() => { this.dirty = true; });
      this._observer.observe(document.body, { childList: true, subtree: true });
    }
    MidiManager.ccListeners.add((cc, v, ch, dev) => this._onCC(cc, v, ch, dev));
    MidiManager.connectionListeners.add(() => this._onConnection());
    this._buildPane();
    this._onConnection();
    document.addEventListener('pointerdown', (e) => this._onPointerDown(e), true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.learn) { this._cancelLearn(); } });
  }

  // ---- persistence -------------------------------------------------------
  _load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (raw && Array.isArray(raw.assignments)) return { assignments: raw.assignments, detected: raw.detected || {} };
    } catch { /* ignore */ }
    return { assignments: [], detected: {} };
  }

  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.state)); } catch { /* storage full / disabled */ } }

  // ---- targets -------------------------------------------------------------
  _scan() {
    if (!this.dirty) return;
    this.dirty = false;
    const seen = new Map();
    this.targets = [];
    this.byId.clear();
    const add = (id, el, label, group, api) => {
      if (this.byId.has(id)) { if (el && !this.byId.get(id).el) this.byId.get(id).el = el; return; }
      const t = { id, el, label, group, api };
      this.targets.push(t);
      this.byId.set(id, t);
      if (el) { el.setAttribute('data-oi-midi', ''); el.toggleAttribute('data-oi-midi-assigned', this.state.assignments.some((a) => a.target === id)); }
    };
    providers.forEach((fn) => { try { fn().forEach((v) => add(v.id, v.el || null, v.label, v.group || '', v)); } catch { /* provider error */ } });
    document.querySelectorAll('[role="slider"]').forEach((el) => {
      const m = el._oiMidi;
      if (!m || !m.set) return;
      const label = (m.label || el.getAttribute('aria-label') || 'Control').trim();
      const group = m.group ?? groupOf(el);
      let id = m.id;
      if (!id) {
        const base = group ? `${group}::${label}` : label;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        id = n > 1 ? `${base}#${n}` : base;
      }
      add(id, el, label, group, m);
    });
  }

  invalidate() { this.dirty = true; }

  _target(id) { this._scan(); return this.byId.get(id) || null; }
  _targetFromEvent(e) {
    const el = e.target?.closest?.('[role="slider"]');
    if (!el || !el._oiMidi) return null;
    this._scan();
    return this.targets.find((t) => t.el === el) || (el._oiMidi.id && this.byId.get(el._oiMidi.id)) || null;
  }

  // ---- MIDI ----------------------------------------------------------------
  static sourceKey(s) { return `${s.device}|${s.channel}|${s.cc}`; }

  _onCC(cc, value, channel, device) {
    if (RESERVED_CC.has(cc)) return false;
    const source = { device: device || '', channel, cc };
    const skey = MidiMap.sourceKey(source);
    // Remember every physical control the device has shown us.
    const list = (this.state.detected[source.device] ||= []);
    const tag = `${channel}:${cc}`;
    if (!list.includes(tag)) { list.push(tag); this._save(); this._renderCount(); }
    this.lastSeen.set(skey, performance.now());

    if (this.learn && this.learn.step === 'source') {
      this.learn.source = source;
      this.learn.step = 'target';
      this._renderLearn();
      return true;
    }
    let consumed = false;
    for (const a of this.state.assignments) {
      if (a.cc !== cc || a.channel !== channel || (a.device && a.device !== source.device)) continue;
      const t = this._target(a.target);
      if (!t) continue;
      let v = value / 127;
      if (a.invert) v = 1 - v;
      try { t.api.set(v); } catch { /* instrument not ready */ }
      if (t.el?.isConnected) this._pulse(t.el);
      this._pulseRow(a.id);
      consumed = true;
    }
    return consumed;
  }

  _onConnection() {
    this.devices = MidiManager.connectedNames;
    if (this.deviceEl) {
      this.deviceEl.textContent = this.devices.length ? this.devices.join(', ') : 'No MIDI controller connected';
      this.deviceEl.classList.toggle('is-on', this.devices.length > 0);
    }
    this._renderList();
    this._renderCount();
  }

  _pulse(el) {
    el.classList.add('oi-midi-active');
    clearTimeout(el._oiPulse);
    el._oiPulse = setTimeout(() => el.classList.remove('oi-midi-active'), 180);
  }

  _pulseRow(id) {
    const row = this.listEl?.querySelector(`[data-assignment="${CSS.escape(id)}"]`);
    if (!row) return;
    row.classList.add('is-active');
    clearTimeout(row._pulse);
    row._pulse = setTimeout(() => row.classList.remove('is-active'), 180);
  }

  // ---- assignments ---------------------------------------------------------
  get detectedCount() {
    const names = new Set(this.devices);
    let n = 0;
    Object.entries(this.state.detected).forEach(([dev, list]) => { if (names.size === 0 || names.has(dev)) n += list.length; });
    return n;
  }

  _findBySource(s) { return this.state.assignments.find((a) => a.cc === s.cc && a.channel === s.channel && a.device === s.device); }

  _commit({ id, source, targetId, invert }) {
    const existingSource = this._findBySource(source);
    if (existingSource && existingSource.id !== id) {
      // One physical control drives exactly one on-screen control.
      this.state.assignments = this.state.assignments.filter((a) => a.id !== existingSource.id);
    }
    this.state.assignments = this.state.assignments.filter((a) => a.target !== targetId || a.id === id);
    const entry = { id: id || `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...source, target: targetId, invert: !!invert };
    const idx = this.state.assignments.findIndex((a) => a.id === entry.id);
    if (idx >= 0) this.state.assignments[idx] = entry; else this.state.assignments.push(entry);
    this._save();
    this.dirty = true;
    this._renderList();
    this._renderCount();
  }

  _delete(id) {
    this.state.assignments = this.state.assignments.filter((a) => a.id !== id);
    this._save();
    this.dirty = true;
    this._renderList();
    this._renderCount();
  }

  // ---- learn flow ----------------------------------------------------------
  _startLearn(existing = null) {
    this.learn = existing
      ? { id: existing.id, source: { device: existing.device, channel: existing.channel, cc: existing.cc }, targetId: existing.target, invert: existing.invert, step: 'target', editing: true }
      : { step: 'source', invert: false };
    this.open(true);
    document.body.classList.add('oi-midi-learning');
    this._renderLearn();
    this._renderList();
  }

  _cancelLearn() {
    this.learn = null;
    document.body.classList.remove('oi-midi-learning');
    this._renderLearn();
    this._renderList();
  }

  _relearnSource() { if (this.learn) { this.learn.step = 'source'; this._renderLearn(); } }

  _onPointerDown(e) {
    if (!this.learn || this.learn.step !== 'target') return;
    if (this.pane.contains(e.target)) return;
    const t = this._targetFromEvent(e);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    this.learn.targetId = t.id;
    this._renderLearn();
  }

  // ---- UI --------------------------------------------------------------------
  _buildPane() {
    const h = (tag, cls, parent, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; parent?.appendChild(n); return n; };
    this.tab = h('button', 'oi-midi-tab', document.body);
    this.tab.type = 'button';
    this.tab.setAttribute('aria-label', 'Open MIDI assignments');
    this.tab.innerHTML = '<span>MIDI</span><span>MAP</span>';
    this.tab.addEventListener('click', () => this.open());

    this.pane = h('aside', 'oi-midi-pane', document.body);
    this.pane.setAttribute('aria-label', 'MIDI assignments');
    this.pane.hidden = true;
    const head = h('header', 'oi-midi-head', this.pane);
    const titles = h('div', '', head);
    h('h2', '', titles, 'MIDI assignments');
    this.deviceEl = h('p', 'oi-midi-device', titles, 'No MIDI controller connected');
    const close = h('button', 'oi-midi-close', head, '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.open(false));

    this.countEl = h('p', 'oi-midi-count', this.pane);
    const actions = h('div', 'oi-midi-actions', this.pane);
    this.addBtn = h('button', 'oi-midi-btn oi-midi-btn--primary', actions, '+ New assignment');
    this.addBtn.type = 'button';
    this.addBtn.addEventListener('click', () => this._startLearn());
    const clear = h('button', 'oi-midi-btn', actions, 'Clear all');
    clear.type = 'button';
    clear.addEventListener('click', () => { if (this.state.assignments.length && confirm('Remove all MIDI assignments for this instrument?')) { this.state.assignments = []; this._save(); this.dirty = true; this._renderList(); this._renderCount(); } });

    this.learnEl = h('section', 'oi-midi-learn', this.pane);
    this.learnEl.hidden = true;
    this.listEl = h('ul', 'oi-midi-list', this.pane);
    h('p', 'oi-midi-help', this.pane, 'Assignments are learned from your controller and saved in this browser. Each physical knob or slider can drive one on-screen control.');
    this._renderCount();
    this._renderList();
  }

  open(force) {
    const show = force ?? this.pane.hidden;
    this.pane.hidden = !show;
    this.tab.classList.toggle('is-open', show);
    document.body.classList.toggle('oi-midi-pane-open', show);
    if (show) { this.dirty = true; this._renderList(); this._renderCount(); }
    else if (this.learn) this._cancelLearn();
  }

  _renderCount() {
    if (!this.countEl) return;
    const n = this.state.assignments.length;
    const d = this.detectedCount;
    this.countEl.textContent = d
      ? `${n} of ${d} detected control${d === 1 ? '' : 's'} assigned`
      : (n ? `${n} assignment${n === 1 ? '' : 's'}` : 'Move a knob or slider on your controller to detect it.');
    if (this.addBtn) this.addBtn.disabled = d > 0 && n >= d && !this.learn;
    if (this.addBtn) this.addBtn.title = this.addBtn.disabled ? 'Every detected control on your controller is already assigned.' : '';
  }

  _sourceLabel(s) { return `CC ${s.cc} · Ch ${s.channel}${s.device ? ` · ${s.device}` : ''}`; }

  _targetSelect(selected) {
    this._scan();
    const sel = document.createElement('select');
    sel.className = 'oi-midi-select';
    const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Choose an on-screen control…'; sel.appendChild(ph);
    const groups = new Map();
    this.targets.forEach((t) => { const g = t.group || 'Controls'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(t); });
    groups.forEach((items, g) => {
      const og = document.createElement('optgroup'); og.label = g;
      items.forEach((t) => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.id.includes('#') ? `${t.label} (${t.id.split('#')[1]})` : t.label; og.appendChild(o); });
      sel.appendChild(og);
    });
    sel.value = selected && this.byId.has(selected) ? selected : '';
    return sel;
  }

  _renderLearn() {
    const L = this.learn;
    const box = this.learnEl;
    box.hidden = !L;
    box.replaceChildren();
    if (!L) return;
    const h = (tag, cls, parent, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; parent?.appendChild(n); return n; };
    h('h3', '', box, L.editing ? 'Edit assignment' : 'New assignment');

    const step1 = h('div', `oi-midi-step${L.step === 'source' ? ' is-current' : ' is-done'}`, box);
    h('span', 'oi-midi-step__n', step1, '1');
    const s1 = h('div', '', step1);
    h('strong', '', s1, 'Controller');
    if (L.step === 'source') h('p', '', s1, 'Move a knob or slider on your MIDI controller…');
    else {
      h('p', 'oi-midi-source', s1, this._sourceLabel(L.source));
      const re = h('button', 'oi-midi-link', s1, 'Relearn'); re.type = 'button'; re.addEventListener('click', () => this._relearnSource());
    }

    const step2 = h('div', `oi-midi-step${L.step === 'target' ? ' is-current' : ''}`, box);
    h('span', 'oi-midi-step__n', step2, '2');
    const s2 = h('div', '', step2);
    h('strong', '', s2, 'On-screen control');
    if (L.step === 'target') {
      h('p', '', s2, L.targetId ? '' : 'Click a knob or slider on the instrument, or pick one:');
      const sel = this._targetSelect(L.targetId);
      sel.addEventListener('change', () => { L.targetId = sel.value || null; this._renderLearn(); });
      s2.appendChild(sel);
      const inv = h('label', 'oi-midi-check', s2);
      const cb = h('input', '', inv); cb.type = 'checkbox'; cb.checked = !!L.invert; cb.addEventListener('change', () => { L.invert = cb.checked; });
      h('span', '', inv, 'Invert direction');
      const taken = L.targetId && this.state.assignments.find((a) => a.target === L.targetId && a.id !== L.id);
      if (taken) h('p', 'oi-midi-warn', s2, `Replaces the existing assignment (${this._sourceLabel(taken)}).`);
      const takenSrc = this._findBySource(L.source);
      if (takenSrc && takenSrc.id !== L.id) h('p', 'oi-midi-warn', s2, `This controller knob is currently assigned to "${takenSrc.target.split('::').pop()}" — saving will move it.`);
    } else h('p', '', s2, 'Waiting for step 1.');

    const row = h('div', 'oi-midi-actions', box);
    const save = h('button', 'oi-midi-btn oi-midi-btn--primary', row, 'Save');
    save.type = 'button';
    save.disabled = !(L.step === 'target' && L.source && L.targetId);
    save.addEventListener('click', () => { this._commit({ id: L.id, source: L.source, targetId: L.targetId, invert: L.invert }); this._cancelLearn(); });
    const cancel = h('button', 'oi-midi-btn', row, 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this._cancelLearn());
  }

  _renderList() {
    if (!this.listEl) return;
    this._scan();
    this.listEl.replaceChildren();
    const h = (tag, cls, parent, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; parent?.appendChild(n); return n; };
    if (!this.state.assignments.length) { h('li', 'oi-midi-empty', this.listEl, 'No assignments yet.'); return; }
    const connected = new Set(this.devices);
    this.state.assignments.forEach((a) => {
      const li = h('li', 'oi-midi-row', this.listEl);
      li.dataset.assignment = a.id;
      if (this.learn?.id === a.id) li.classList.add('is-editing');
      const t = this.byId.get(a.target);
      const info = h('div', 'oi-midi-row__info', li);
      h('strong', '', info, t ? t.label : a.target.split('::').pop());
      if (t?.group) h('small', '', info, t.group);
      h('span', 'oi-midi-source', info, `${this._sourceLabel(a)}${a.invert ? ' · inverted' : ''}`);
      if (!t) h('span', 'oi-midi-warn', info, 'Control not found on this page');
      else if (a.device && connected.size && !connected.has(a.device)) h('span', 'oi-midi-warn', info, 'Controller not connected');
      const btns = h('div', 'oi-midi-row__btns', li);
      const edit = h('button', 'oi-midi-btn oi-midi-btn--small', btns, 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => this._startLearn(a));
      const del = h('button', 'oi-midi-btn oi-midi-btn--small oi-midi-btn--danger', btns, 'Delete'); del.type = 'button'; del.addEventListener('click', () => this._delete(a.id));
    });
  }
}

let instance = null;
export function initMidiMap() {
  if (instance) return instance;
  const boot = () => { instance = instance || new MidiMap(); if (typeof window !== 'undefined') window.__oiMidiMap = instance; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  return instance;
}
if (typeof document !== 'undefined' && globalThis.location) initMidiMap();
