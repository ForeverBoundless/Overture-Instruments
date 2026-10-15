/**
 * panel.js - DOM builders and input plumbing shared by the newer instruments.
 * Builds on ui/Knob.js, ui/Keyboard.js, ui/Wheel.js and engine/MidiManager.js.
 */
import { Knob } from '../../ui/Knob.js';
import { Keyboard } from '../../ui/Keyboard.js';
import { PitchWheel, ModWheel } from '../../ui/Wheel.js';
import { MidiManager, midiNoteName } from '../engine/MidiManager.js';
import { downloadText, pickFile } from './presetStore.js';

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteToMidi = (name) => { const m = /^([A-G]#?)(-?\d+)$/.exec(name); return m ? (parseInt(m[2], 10) + 1) * 12 + NOTE_NAMES.indexOf(m[1]) : NaN; };
export { midiNoteName };
export const KEY_TO_SEMI = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17 };

export function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

export function section(parent, title, subtitle) {
  const sec = el('section', 'pn-section', parent);
  const h = el('h2', '', sec, title);
  if (subtitle) el('span', '', h, subtitle);
  const body = el('div', 'pn-body', sec);
  return { sec, body };
}

export function knob(parent, opts) {
  const k = new Knob({ size: 46, ...opts, defaultValue: opts.defaultValue ?? opts.value });
  k.el.classList.add('pn-knob');
  parent.appendChild(k.el);
  return k;
}

export function button(parent, label, onClick, lit = false) {
  const b = el('button', 'pn-button', parent, label);
  b.type = 'button';
  b.classList.toggle('lit', lit);
  b.addEventListener('click', () => onClick(b));
  return b;
}

/** Toggle button: returns element with getValue()/setValue(v, silent). */
export function toggle(parent, label, initial, onChange) {
  let value = !!initial;
  const b = button(parent, label, () => { value = !value; b.classList.toggle('lit', value); onChange(value); }, value);
  b.setAttribute('aria-pressed', String(value));
  b.getValue = () => value;
  b.setValue = (v, silent) => { value = !!v; b.classList.toggle('lit', value); b.setAttribute('aria-pressed', String(value)); if (!silent) onChange(value); };
  return b;
}

export function select(parent, label, options, value, onChange) {
  const wrap = el('label', 'pn-select', parent);
  el('span', '', wrap, label);
  const s = el('select', '', wrap);
  options.forEach((o) => { const opt = el('option', '', s, o.label ?? String(o)); opt.value = String(o.value ?? o); });
  s.value = String(value);
  s.addEventListener('change', () => onChange(s.value));
  wrap.setValue = (v, silent) => { s.value = String(v); if (!silent) onChange(s.value); };
  wrap.select = s;
  return wrap;
}

export function display(parent) {
  const d = el('div', 'pn-display', parent);
  const top = el('div', '', d);
  const bottom = el('small', '', d);
  let timer = 0;
  return {
    el: d,
    set(a, b = '') { top.textContent = a; bottom.textContent = b; },
    flash(msg, ms = 1500) { const prev = bottom.textContent; bottom.textContent = msg; clearTimeout(timer); timer = setTimeout(() => { if (bottom.textContent === msg) bottom.textContent = prev; }, ms); },
  };
}

/**
 * Performance input: on-screen keyboard (+ optional wheels), computer keys,
 * MIDI with pending notes until the engine starts, and all-notes-off.
 * handlers: { noteOn(midi, vel, source), noteOff(midi, source), bend(v), mod(v), sustain(down), aftertouch(v), cc(cc,val), program(n), allOff() }
 */
export function performance(parent, { octaves = 4, startOctave = 2, wheels = true, started = () => true, handlers, midiStatusEl, octaveShift = true }) {
  const keybed = el('section', `pn-keybed${wheels ? '' : ' pn-keybed--nowheels'}`, parent);
  let pitchWheel = null;
  let modWheel = null;
  if (wheels) {
    const w = el('div', 'pn-wheels', keybed);
    pitchWheel = new PitchWheel({ onChange: (v) => handlers.bend?.(v) });
    modWheel = new ModWheel({ onChange: (v) => handlers.mod?.(v) });
    w.append(pitchWheel.el, modWheel.el);
  }
  const wrap = el('div', '', keybed);
  const keyboard = new Keyboard({ startOctave, octaves, onNoteOn: (n, v) => noteOn(noteToMidi(n), v, 'ui'), onNoteOff: (n) => noteOff(noteToMidi(n), 'ui') });
  wrap.appendChild(keyboard.el);
  const held = new Map();
  const pending = new Map();
  const compKeys = new Map();
  let compOct = 0;
  const light = (midi, on) => keyboard.setKeyActive(midiNoteName(midi), on);
  function noteOn(midi, vel, source) {
    if (midi < 0 || midi > 127) return;
    held.set(midi, vel);
    light(midi, true);
    if (!started()) { pending.set(midi, vel); return; }
    handlers.noteOn(midi, vel, source);
  }
  function noteOff(midi, source) {
    if (!held.has(midi)) return;
    held.delete(midi);
    pending.delete(midi);
    light(midi, false);
    if (started()) handlers.noteOff(midi, source);
  }
  function allOff() {
    [...held.keys()].forEach((m) => light(m, false));
    held.clear(); pending.clear(); compKeys.clear();
    if (started()) handlers.allOff?.();
  }
  function flushPending() { pending.forEach((v, m) => handlers.noteOn(m, v, 'pending')); pending.clear(); }
  const typing = (t) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName);
  window.addEventListener('keydown', (e) => {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (pitchWheel && key === 'tab') { e.preventDefault(); if (!e.repeat) pitchWheel.setExternalValue(1); return; }
    if (pitchWheel && e.key === 'Shift' && e.location === 1) { if (!e.repeat) pitchWheel.setExternalValue(-1); return; }
    if (modWheel && (key === 'arrowup' || key === 'arrowdown') && !e.target?.closest?.('.lp-knob, .lp-wheel, button, [role=slider]')) { e.preventDefault(); modWheel.setExternalValue(clamp(modWheel.value + (key === 'arrowup' ? 0.05 : -0.05), 0, 1)); return; }
    if (e.key === 'Escape') { allOff(); return; }
    if (e.repeat) return;
    if (octaveShift && (key === '-' || key === '_')) { compOct = clamp(compOct - 1, -3, 3); return; }
    if (octaveShift && (key === '=' || key === '+')) { compOct = clamp(compOct + 1, -3, 3); return; }
    const semi = KEY_TO_SEMI[key];
    if (semi === undefined || compKeys.has(key)) return;
    e.preventDefault();
    const midi = 48 + compOct * 12 + semi;
    compKeys.set(key, midi);
    noteOn(midi, 0.8, 'keys');
  });
  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (pitchWheel && (key === 'tab' || e.key === 'Shift')) pitchWheel.springReturnToCenter();
    const midi = compKeys.get(key);
    if (midi === undefined) return;
    compKeys.delete(key);
    noteOff(midi, 'keys');
  });
  window.addEventListener('blur', () => { compKeys.forEach((m) => noteOff(m, 'keys')); compKeys.clear(); pitchWheel?.springReturnToCenter(); });

  const midi = new MidiManager({
    onNoteOn: (n, v) => noteOn(n, v, 'midi'),
    onNoteOff: (n) => noteOff(n, 'midi'),
    onPitchBend: (_r, v) => pitchWheel ? pitchWheel.setExternalValue(v) : handlers.bend?.(v),
    onModWheel: (v) => modWheel ? modWheel.setExternalValue(v) : handlers.mod?.(v),
    onSustain: (d) => { if (started()) handlers.sustain?.(d); },
    onAftertouch: (v) => { if (started()) handlers.aftertouch?.(v); },
    onProgramChange: (p) => handlers.program?.(p),
    onControlChange: (cc, v) => { if (started()) handlers.cc?.(cc, v); },
    onAllNotesOff: () => allOff(),
    onAllSoundOff: () => allOff(),
    onResetControllers: () => { pitchWheel?.setExternalValue(0); modWheel?.setExternalValue(0); if (started()) handlers.sustain?.(false); },
    onConnectionChange: (c, _n, names) => { if (midiStatusEl) { midiStatusEl.textContent = c ? `MIDI: ${names.join(', ')}` : 'MIDI: no device'; midiStatusEl.classList.toggle('is-on', c); } },
  });
  midi.init().then((ok) => { if (midiStatusEl && !ok) midiStatusEl.textContent = midi.supported ? 'MIDI: permission not granted' : 'MIDI: not supported'; else if (midiStatusEl && !midi.isConnected) midiStatusEl.textContent = 'MIDI: no device'; });
  return { keybed, keyboard, pitchWheel, modWheel, midi, noteOn, noteOff, allOff, flushPending, held };
}

/** Power overlay: resolves the first user gesture into engine start. */
export function power(id, start, onReady) {
  const node = document.getElementById(id);
  const go = async () => {
    try { await start(); } catch (err) { const s = node.querySelector('small'); if (s) s.textContent = String(err?.message || err); return; }
    node.classList.add('is-off');
    onReady?.();
  };
  node.addEventListener('click', go);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(); });
}

/**
 * Preset UI: factory list + user store, with save/rename/delete/export/import.
 * opts: { factory: [{name,data}], store, apply(data,name), capture() -> data, display }
 */
export function presetBar(parent, opts) {
  const { factory, store, apply, capture, display: disp, filename = 'preset' } = opts;
  const body = el('div', 'pn-body', parent);
  let current = { kind: 'factory', index: 0 };
  const options = () => [
    ...factory.map((p, i) => ({ value: `f:${i}`, label: `${String(i + 1).padStart(2, '0')}  ${p.name}` })),
    ...store.items.map((it) => ({ value: `u:${it.id}`, label: `U  ${it.name}` })),
  ];
  const sel = select(body, 'PRESET', options(), 'f:0', (v) => load(v));
  const refresh = (value) => { const s = sel.select; s.replaceChildren(); options().forEach((o) => { const opt = el('option', '', s, o.label); opt.value = o.value; }); if (value) s.value = value; };
  function load(v) {
    if (v.startsWith('f:')) { const i = Number(v.slice(2)); current = { kind: 'factory', index: i }; apply(JSON.parse(JSON.stringify(factory[i].data)), factory[i].name); }
    else { const it = store.get(v.slice(2)); if (!it) return; current = { kind: 'user', id: it.id }; apply(JSON.parse(JSON.stringify(it.data)), it.name); }
    sel.select.value = v;
  }
  const row = el('div', 'pn-buttons', body);
  button(row, 'SAVE', () => {
    const existing = current.kind === 'user' ? store.get(current.id) : null;
    const name = prompt('Preset name', existing?.name || 'My preset');
    if (name === null) return;
    const it = store.save(name, capture(), existing?.id);
    current = { kind: 'user', id: it.id };
    refresh(`u:${it.id}`);
    disp?.flash('SAVED');
  });
  button(row, 'RENAME', () => { if (current.kind !== 'user') { disp?.flash('SAVE FIRST'); return; } const it = store.get(current.id); const n = prompt('New name', it.name); if (n) { store.rename(it.id, n); refresh(`u:${it.id}`); } });
  button(row, 'DELETE', () => { if (current.kind !== 'user') { disp?.flash('FACTORY PRESET'); return; } if (!confirm('Delete this preset?')) return; store.remove(current.id); refresh('f:0'); load('f:0'); });
  button(row, 'EXPORT', () => downloadText(`${filename}.json`, store.exportJSON({ name: current.kind === 'user' ? store.get(current.id).name : factory[current.index].name, data: capture() })));
  button(row, 'IMPORT', () => pickFile('.json,application/json', (text) => {
    try { const { name, data } = store.parseImport(text); const it = store.save(name, data); refresh(`u:${it.id}`); load(`u:${it.id}`); disp?.flash('IMPORTED'); }
    catch (err) { disp?.flash(String(err.message).toUpperCase().slice(0, 30), 3000); alert(err.message); }
  }));
  button(row, 'PANIC', () => opts.panic?.());
  return { load, refresh, get current() { return current; } };
}

export function footer(parent, text) { el('footer', 'pn-footer', parent, text); }
export const midiVel = (v) => (v > 1 ? v / 127 : v);
