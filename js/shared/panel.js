/**
 * panel.js - DOM builders and input plumbing shared by the newer instruments.
 * Builds on ui/Knob.js, ui/Keyboard.js, ui/Wheel.js and engine/MidiManager.js.
 */
import { Knob } from '../../ui/Knob.js';
import { Keyboard } from '../../ui/Keyboard.js';
import { PitchWheel, ModWheel } from '../../ui/Wheel.js';
import { MidiManager, midiNoteName } from '../engine/MidiManager.js';
import { downloadText, pickFile } from './presetStore.js';
import { clearCommunitySource } from './communityPreset.js';

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

function normalizeChoices(options) {
  return (options || []).map((option) => ({
    value: String(option?.value ?? option),
    label: String(option?.label ?? option?.value ?? option),
  }));
}
export function select(parent, label, options, value, onChange = () => {}) {
  let choices = normalizeChoices(options);
  let current = choices.find((option) => option.value === String(value)) || choices[0] || { value: '', label: '—' };
  let index = Math.max(0, choices.findIndex((option) => option.value === current.value));
  const wrap = el('div', 'pn-hw-choice pn-hw-choice--rotary', parent);
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label);
  el('span', 'pn-hw-choice__caption', wrap, label);
  const row = el('div', 'pn-hw-choice__row', wrap);
  const previous = el('button', 'pn-hw-choice__step', row, '−'); previous.type = 'button';
  previous.setAttribute('aria-label', label + ' previous position');
  const dialWrap = el('div', 'pn-hw-choice__dial', row);
  const readout = el('span', 'pn-hw-choice__readout', wrap, current.label);
  const next = el('button', 'pn-hw-choice__step', row, '+'); next.type = 'button';
  next.setAttribute('aria-label', label + ' next position');
  const dial = new Knob({ label, min: 0, max: Math.max(1, choices.length - 1), value: index, size: 38,
    formatValue: (v) => choices[Math.max(0, Math.min(choices.length - 1, Math.round(v)))]?.label || '—',
    onChange: (v) => setIndex(Math.round(v), false) });
  dial.el.classList.add('pn-hw-choice__knob'); dialWrap.appendChild(dial.el);
  const render = () => {
    current = choices[index] || { value: '', label: '—' };
    readout.textContent = current.label; readout.title = current.label;
    dial.max = Math.max(1, choices.length - 1); dial.setValue(index, true);
    dial.el.setAttribute('aria-valuemax', String(Math.max(1, choices.length - 1)));
    previous.disabled = next.disabled = choices.length < 2;
    wrap.setAttribute('aria-valuetext', current.label);
  };
  function setIndex(nextIndex, silent = false) {
    const nextValue = Math.max(0, Math.min(choices.length - 1, Math.round(Number(nextIndex) || 0)));
    if (nextValue === index && current.value === choices[nextValue]?.value) return;
    index = nextValue; render(); if (!silent) onChange(current.value);
  }
  const setValue = (nextValue, silent = false) => {
    const nextIndex = choices.findIndex((option) => option.value === String(nextValue));
    if (nextIndex >= 0) setIndex(nextIndex, silent);
  };
  const setOptions = (nextOptions, nextValue = current.value, silent = true) => {
    choices = normalizeChoices(nextOptions);
    const nextIndex = choices.findIndex((option) => option.value === String(nextValue));
    index = nextIndex >= 0 ? nextIndex : 0; render();
    if (!silent && choices[index]) onChange(choices[index].value);
  };
  previous.addEventListener('click', () => setIndex(index - 1));
  next.addEventListener('click', () => setIndex(index + 1)); render();
  wrap.setValue = setValue; wrap.setOptions = setOptions; wrap.getValue = () => current.value;
  Object.defineProperty(wrap, 'value', { get: () => current.value, set: (v) => setValue(v, true) });
  const proxy = {};
  Object.defineProperty(proxy, 'value', { get: () => current.value, set: (v) => setValue(v, true) });
  Object.defineProperty(proxy, 'options', { get: () => choices.map((option) => ({ ...option })) });
  wrap.select = proxy;
  return wrap;
}
export function choiceButtons(parent, label, options, value, onChange = () => {}) {
  let choices = normalizeChoices(options), current = String(value);
  const wrap = el('div', 'pn-hw-choice pn-hw-choice--buttons', parent);
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label);
  el('span', 'pn-hw-choice__caption', wrap, label);
  const buttons = el('div', 'pn-hw-choice__buttons', wrap);
  const readout = el('span', 'pn-hw-choice__readout', wrap);
  const render = () => {
    buttons.replaceChildren();
    choices.forEach((choice) => {
      const control = el('button', 'pn-button pn-hw-choice__button', buttons, choice.label);
      control.type = 'button'; control.setAttribute('aria-pressed', String(choice.value === current));
      control.classList.toggle('lit', choice.value === current); control.title = choice.label;
      control.addEventListener('click', () => setValue(choice.value));
    });
    readout.textContent = choices.find((choice) => choice.value === current)?.label || '—';
  };
  const setValue = (next, silent = false) => {
    const found = choices.find((choice) => choice.value === String(next));
    if (!found || found.value === current) return;
    current = found.value; render(); if (!silent) onChange(current);
  };
  wrap.setValue = setValue; wrap.setOptions = (next, nextValue = current, silent = true) => {
    choices = normalizeChoices(next);
    current = choices.some((choice) => choice.value === String(nextValue)) ? String(nextValue) : choices[0]?.value || '';
    render(); if (!silent && current) onChange(current);
  };
  wrap.getValue = () => current;
  Object.defineProperty(wrap, 'value', { get: () => current, set: (v) => setValue(v, true) });
  const proxy = {}; Object.defineProperty(proxy, 'value', { get: () => current, set: (v) => setValue(v, true) });
  Object.defineProperty(proxy, 'options', { get: () => choices.map((choice) => ({ ...choice })) });
  wrap.select = proxy; render(); return wrap;
}

/** Two-position maintained lever switch, for hardware selectors rather than button banks. */
export function switchControl(parent, label, options, value, onChange = () => {}) {
  const choices = normalizeChoices(options);
  if (choices.length !== 2) throw new RangeError('A hardware lever switch requires exactly two positions.');
  let current = choices.some((choice) => choice.value === String(value)) ? String(value) : choices[0].value;
  const wrap = el('div', 'pn-toggle-switch', parent);
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', label);
  el('span', 'pn-toggle-switch__caption', wrap, label);
  const positions = el('div', 'pn-toggle-switch__positions', wrap);
  const top = el('span', 'pn-toggle-switch__position-label', positions, choices[0].label);
  const actuator = el('button', 'pn-toggle-switch__actuator', positions);
  actuator.type = 'button';
  actuator.setAttribute('role', 'switch');
  actuator.setAttribute('aria-label', label);
  const rail = el('span', 'pn-toggle-switch__rail', actuator);
  el('span', 'pn-toggle-switch__lever', rail);
  const bottom = el('span', 'pn-toggle-switch__position-label', positions, choices[1].label);
  const readout = el('output', 'pn-toggle-switch__readout', wrap);
  const render = () => {
    const index = Math.max(0, choices.findIndex((choice) => choice.value === current));
    const selected = choices[index];
    wrap.dataset.position = String(index);
    actuator.dataset.position = String(index);
    actuator.setAttribute('aria-checked', String(index === 1));
    actuator.setAttribute('aria-valuetext', selected.label);
    top.classList.toggle('active', index === 0);
    bottom.classList.toggle('active', index === 1);
    readout.textContent = selected.label;
  };
  const setValue = (next, silent = false) => {
    const found = choices.find((choice) => choice.value === String(next));
    if (!found || found.value === current) return;
    current = found.value;
    render();
    if (!silent) onChange(current);
  };
  actuator.addEventListener('click', () => setValue(current === choices[0].value ? choices[1].value : choices[0].value));
  wrap.setValue = setValue;
  wrap.getValue = () => current;
  Object.defineProperty(wrap, 'value', { get: () => current, set: (next) => setValue(next, true) });
  render();
  return wrap;
}


/** Four-position panel fader for stepped analog controls such as the Juno HPF. */
export function discreteFader(parent, label, options, value, onChange = () => {}) {
  const choices = normalizeChoices(options);
  if (!choices.length) throw new RangeError('A discrete fader needs at least one position.');
  let index = Math.max(0, choices.findIndex((choice) => choice.value === String(value)));
  const wrap = el('div', 'pn-discrete-fader', parent);
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', label);
  el('span', 'pn-discrete-fader__caption', wrap, label);
  const body = el('div', 'pn-discrete-fader__body', wrap);
  const marks = el('div', 'pn-discrete-fader__marks', body);
  const track = el('div', 'pn-discrete-fader__track-wrap', body);
  const input = el('input', 'pn-discrete-fader__input', track);
  input.type = 'range';
  input.min = '0';
  input.max = String(choices.length - 1);
  input.step = '1';
  input.setAttribute('aria-label', label);
  input.setAttribute('aria-valuemin', '0');
  input.setAttribute('aria-valuemax', String(choices.length - 1));
  const readout = el('output', 'pn-discrete-fader__readout', wrap);
  const render = () => {
    const choice = choices[index];
    input.value = String(index);
    input.setAttribute('aria-valuenow', String(index));
    input.setAttribute('aria-valuetext', choice.label);
    readout.textContent = choice.label;
    readout.title = choice.label;
    marks.replaceChildren();
    choices.slice().reverse().forEach((item) => {
      const mark = el('span', 'pn-discrete-fader__mark', marks, item.label.split(' ')[0]);
      mark.classList.toggle('active', item.value === choice.value);
    });
  };
  const setValue = (next, silent = false) => {
    const found = choices.findIndex((choice) => choice.value === String(next));
    if (found < 0 || found === index) return;
    index = found;
    render();
    if (!silent) onChange(choices[index].value);
  };
  input.addEventListener('input', () => {
    const next = Math.max(0, Math.min(choices.length - 1, Math.round(Number(input.value))));
    if (next === index) return;
    index = next;
    render();
    onChange(choices[index].value);
  });
  wrap.setValue = setValue;
  wrap.getValue = () => choices[index].value;
  Object.defineProperty(wrap, 'value', { get: () => choices[index].value, set: (next) => setValue(next, true) });
  render();
  return wrap;
}

export function dataEntry(parent, label, options, value, onChange = () => {}) {
  let choices = normalizeChoices(options);
  let index = Math.max(0, choices.findIndex((choice) => choice.value === String(value)));
  const wrap = el('div', 'pn-data-entry', parent); el('span', 'pn-hw-choice__caption', wrap, label);
  const display = el('output', 'pn-data-entry__display', wrap);
  const controls = el('div', 'pn-data-entry__controls', wrap);
  const down = el('button', 'pn-button', controls, '−1'); down.type = 'button';
  const range = el('input', 'pn-data-entry__range', controls); range.type = 'range'; range.min = '0'; range.max = String(Math.max(0, choices.length - 1)); range.step = '1';
  const up = el('button', 'pn-button', controls, '+1'); up.type = 'button';
  const render = () => { display.textContent = choices[index]?.label || '—'; range.value = String(index); range.max = String(Math.max(0, choices.length - 1)); };
  const setValue = (v, silent = false) => { const i = choices.findIndex((choice) => choice.value === String(v)); if (i < 0 || i === index) return; index = i; render(); if (!silent) onChange(choices[index].value); };
  const stepBy = (amount) => { const i = Math.max(0, Math.min(choices.length - 1, index + amount)); if (i !== index) { index = i; render(); onChange(choices[index].value); } };
  down.addEventListener('click', () => stepBy(-1)); up.addEventListener('click', () => stepBy(1));
  range.addEventListener('input', () => { index = Number(range.value); render(); onChange(choices[index].value); });
  wrap.setValue = setValue; wrap.getValue = () => choices[index]?.value ?? '';
  Object.defineProperty(wrap, 'value', { get: () => wrap.getValue(), set: (v) => setValue(v, true) });
  render(); return wrap;
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
export function performance(parent, { octaves = 4, startOctave = 2, notes = null, wheels = true, started = () => true, handlers, midiStatusEl, octaveShift = true, extraComputerKeys = {} }) {
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
  const keyboard = new Keyboard({ startOctave, octaves, notes, onNoteOn: (n, v) => noteOn(noteToMidi(n), v, 'ui'), onNoteOff: (n) => noteOff(noteToMidi(n), 'ui') });
  wrap.appendChild(keyboard.el);
  const held = new Map();
  const pending = new Map();
  const compKeys = new Map();
  let compOct = 0;
  const light = (midi, on) => keyboard.setKeyActive(midiNoteName(midi), on);
  function noteOn(midi, vel, source, channel = 1) {
    if (midi < 0 || midi > 127) return;
    held.set(midi, vel);
    light(midi, true);
    if (!started()) { pending.set(midi, vel); return; }
    handlers.noteOn(midi, vel, source, channel);
  }
  function noteOff(midi, source, channel = 1) {
    if (!held.has(midi)) return;
    held.delete(midi);
    pending.delete(midi);
    light(midi, false);
    if (started()) handlers.noteOff(midi, source, channel);
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
    const semi = KEY_TO_SEMI[key] ?? extraComputerKeys[key];
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
    onNoteOn: (n, v, channel) => noteOn(n, v, 'midi', channel),
    onNoteOff: (n, channel) => noteOff(n, 'midi', channel),
    onPitchBend: (_r, v, channel) => pitchWheel ? pitchWheel.setExternalValue(v) : handlers.bend?.(v, channel),
    onModWheel: (v) => modWheel ? modWheel.setExternalValue(v) : handlers.mod?.(v),
    onSustain: (d) => { if (started()) handlers.sustain?.(d); },
    onAftertouch: (v, channel) => { if (started()) handlers.aftertouch?.(v, channel); },
    onExpression: (v, channel) => { if (started()) handlers.expression?.(v, channel); },
    onPolyAftertouch: (n, v, channel) => { if (started()) handlers.polyAftertouch?.(n, v, channel); },
    onClock: () => { if (started()) handlers.clock?.(); },
    onStart: () => { if (started()) handlers.start?.(); },
    onContinue: () => { if (started()) handlers.continue?.(); },
    onStop: () => { if (started()) handlers.stop?.(); },
    onProgramChange: (p) => handlers.program?.(p),
    onControlChange: (cc, v, channel) => { if (started()) handlers.cc?.(cc, v, channel); },
    onAllNotesOff: () => allOff(),
    onAllSoundOff: () => allOff(),
    onResetControllers: () => { pitchWheel?.setExternalValue(0); modWheel?.setExternalValue(0); if (started()) handlers.sustain?.(false); },
    onConnectionChange: (c, _n, names) => { if (midiStatusEl) { midiStatusEl.textContent = c ? `MIDI: ${names.join(', ')}` : 'MIDI: no device'; midiStatusEl.classList.toggle('is-on', c); } },
  });
  midi.init().then((ok) => { if (midiStatusEl && !ok) midiStatusEl.textContent = midi.supported ? 'MIDI: permission not granted' : 'MIDI: not supported'; else if (midiStatusEl && !midi.isConnected) midiStatusEl.textContent = 'MIDI: no device'; });
  return { keybed, keyboard, pitchWheel, modWheel, midi, noteOn, noteOff, allOff, flushPending, held };
}

/** Starts audio from a trusted pointer or keyboard gesture, with retry feedback. */
export function power(id, start, onReady, onError) {
  const node = document.getElementById(id);
  if (!node) throw new Error('Power control #' + id + ' is missing from the page.');
  let busy = false; const status = node.querySelector('small');
  const go = async (event) => {
    if (event?.type === 'keydown' && !['Enter', ' '].includes(event.key)) return false;
    if (event?.type === 'keydown') event.preventDefault();
    if (busy) return false;
    busy = true; node.classList.add('is-starting'); node.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'STARTING AUDIO ENGINE…';
    try {
      await start();
      node.classList.add('is-off');
      node.classList.remove('is-starting');
      node.removeAttribute('aria-busy');
      onReady?.();
      busy = false;
      return true;
    } catch (err) {
      const detail = String(err?.message || err || 'Unknown audio error');
      if (status) status.textContent = 'AUDIO START FAILED · ' + detail;
      node.setAttribute('aria-label', 'Retry power on. ' + detail);
      node.classList.remove('is-starting'); node.removeAttribute('aria-busy'); busy = false;
      onError?.(err);
      return false;
    }
  };
  // A native button click is trusted for mouse, touch, and keyboard activation.
  // Avoid starting on pointerdown and then receiving a second click for the same
  // gesture; the single click path is especially reliable on touch devices.
  node.addEventListener('click', (event) => { void go(event); });
  // Hardware-panel switches call this same handler directly from their trusted
  // click callback. This avoids synthetic clicks on the visually hidden button,
  // which browsers may reject as an AudioContext user-activation gesture.
  return go;
}

/**
 * Preset UI: factory list + user store, with save/rename/delete/export/import.
 * opts: { factory: [{name,data}], store, apply(data,name), capture() -> data, display }
 */
export function presetBar(parent, opts) {
  const { factory, store, apply, capture, display: disp, filename = 'preset' } = opts;
  const body = el('div', 'pn-preset-browser', parent);
  let current = { kind: 'factory', index: 0 }, page = 0;
  const pageSize = 8;
  const options = () => [
    ...factory.map((preset, index) => ({ value: `f:${index}`, label: preset.name })),
    ...store.items.map((item) => ({ value: `u:${item.id}`, label: item.name })),
  ];
  const selectedValue = () => current.kind === 'factory' ? `f:${current.index}` : `u:${current.id}`;
  el('div', 'pn-preset-browser__title', body, 'OVERTURE PATCH LIBRARY');
  const displayRow = el('div', 'pn-preset-browser__display', body);
  const patchNumber = el('span', 'pn-preset-browser__number', displayRow, '001');
  const patchName = el('strong', 'pn-preset-browser__name', displayRow, factory[0]?.name || 'INITIAL PATCH');
  const pageInfo = el('span', 'pn-preset-browser__page', displayRow, 'BANK 1');
  const controls = el('div', 'pn-preset-browser__controls', body);
  const previous = button(controls, '◀ BANK', () => { page = Math.max(0, page - 1); render(); });
  const slots = el('div', 'pn-preset-browser__slots', body);
  const next = button(controls, 'BANK ▶', () => { page = Math.min(Math.ceil(options().length / pageSize) - 1, page + 1); render(); });
  body.dataset.overturePresetSelector = 'true';
  body.getCommunityPresetSelection = () => {
    if (current.kind === 'factory') { const item = factory[current.index]; return item ? { kind: 'factory', index: current.index, value: `f:${current.index}`, name: item.name } : null; }
    const item = store.get(current.id); return item ? { kind: 'user', id: item.id, value: `u:${item.id}`, name: item.name } : null;
  };
  body.restoreCommunityPresetSelection = (selection) => {
    if (selection.kind === 'factory') {
      let index = Number.isInteger(selection.index) ? selection.index : -1;
      if (index < 0 || index >= factory.length || (selection.name && factory[index]?.name !== selection.name)) index = factory.findIndex((item) => item.name === selection.name);
      if (index < 0) return false; current = { kind: 'factory', index };
    } else {
      const item = (selection.id && store.get(selection.id)) || store.items.find((entry) => entry.name === selection.name);
      if (item) current = { kind: 'user', id: item.id };
      else { const index = factory.findIndex((entry) => entry.name === selection.name); if (index < 0) return false; current = { kind: 'factory', index }; }
    }
    const position = options().findIndex((option) => option.value === selectedValue());
    if (position >= 0) page = Math.floor(position / pageSize);
    render(); return true;
  };
  function render() {
    const all = options(), index = all.findIndex((option) => option.value === selectedValue());
    patchNumber.textContent = index >= 0 ? String(index + 1) : '---';
    patchName.textContent = all[index]?.label || 'NO PATCH SELECTED';
    pageInfo.textContent = `BANK ${page + 1} / ${Math.max(1, Math.ceil(all.length / pageSize))}`;
    previous.disabled = page <= 0; next.disabled = page >= Math.ceil(all.length / pageSize) - 1;
    slots.replaceChildren();
    all.slice(page * pageSize, page * pageSize + pageSize).forEach((item, offset) => {
      const number = page * pageSize + offset + 1;
      const key = button(slots, String(number), () => load(item.value), item.value === selectedValue());
      key.classList.add('pn-preset-browser__slot'); key.title = item.label;
      key.setAttribute('aria-label', `Load patch ${number}: ${item.label}`);
      key.setAttribute('aria-pressed', String(item.value === selectedValue()));
    });
  }
  function refresh(value = selectedValue()) {
    if (String(value).startsWith('f:')) current = { kind: 'factory', index: Number(String(value).slice(2)) };
    else if (String(value).startsWith('u:')) current = { kind: 'user', id: String(value).slice(2) };
    const position = options().findIndex((option) => option.value === selectedValue());
    if (position >= 0) page = Math.floor(position / pageSize);
    render();
  }
  function load(value) {
    clearCommunitySource();
    if (value.startsWith('f:')) {
      const index = Number(value.slice(2)), item = factory[index]; if (!item) return;
      current = { kind: 'factory', index }; page = Math.floor(index / pageSize); apply(JSON.parse(JSON.stringify(item.data)), item.name);
    } else {
      const item = store.get(value.slice(2)); if (!item) return;
      current = { kind: 'user', id: item.id }; const position = options().findIndex((entry) => entry.value === value); if (position >= 0) page = Math.floor(position / pageSize); apply(JSON.parse(JSON.stringify(item.data)), item.name);
    }
    render();
  }
  const row = el('div', 'pn-buttons', body);
  button(row, 'SAVE', () => {
    const existing = current.kind === 'user' ? store.get(current.id) : null;
    const name = prompt('Preset name', existing?.name || 'My preset'); if (name === null) return;
    const item = store.save(name, capture(), existing?.id); current = { kind: 'user', id: item.id };
    refresh(selectedValue()); disp?.flash('SAVED');
  });
  button(row, 'RENAME', () => {
    if (current.kind !== 'user') { disp?.flash('SAVE FIRST'); return; }
    const item = store.get(current.id), name = prompt('New name', item.name);
    if (name) { store.rename(item.id, name); refresh(selectedValue()); }
  });
  button(row, 'DELETE', () => {
    if (current.kind !== 'user') { disp?.flash('FACTORY PRESET'); return; }
    if (!confirm('Delete this preset?')) return;
    store.remove(current.id); current = { kind: 'factory', index: 0 }; refresh('f:0'); load('f:0');
  });
  button(row, 'EXPORT', () => {
    const item = current.kind === 'user' ? store.get(current.id) : factory[current.index];
    if (item) downloadText(`${filename}.json`, store.exportJSON({ name: item.name, data: capture() }));
  });
  button(row, 'IMPORT', () => pickFile('.json,application/json', (text) => {
    try {
      const { name, data } = store.parseImport(text), item = store.save(name, data);
      current = { kind: 'user', id: item.id }; refresh(selectedValue()); load(selectedValue()); disp?.flash('IMPORTED');
    } catch (err) { disp?.flash(String(err.message).toUpperCase().slice(0, 30), 3000); alert(err.message); }
  }));
  button(row, 'PANIC', () => opts.panic?.());
  Object.defineProperty(body, 'value', { get: selectedValue, set: (value) => refresh(String(value)) });
  render();
  return { load, refresh, get current() { return current; }, selector: body };
}

export function footer(parent, text) { el('footer', 'pn-footer', parent, text); }
export const midiVel = (v) => (v > 1 ? v / 127 : v);
