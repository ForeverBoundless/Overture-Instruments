/**
 * presetStore.js - versioned browser-local preset/pattern storage shared by
 * the newer instruments, OMNI and the experiments.
 *
 * Stored shape: { version, items: [{ id, name, data, created }] }
 * `validate(data)` must return a sanitised copy or throw; invalid stored
 * records are dropped instead of crashing the instrument.
 */
export class PresetStore {
  constructor({ key, version = 1, validate = (d) => d }) {
    this.key = key;
    this.version = version;
    this.validate = validate;
    this.items = this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (!raw || raw.version !== this.version || !Array.isArray(raw.items)) return [];
      return raw.items.map((it) => this._sanitise(it)).filter(Boolean);
    } catch { return []; }
  }

  _sanitise(it) {
    try {
      if (!it || typeof it.name !== 'string') return null;
      return { id: String(it.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), name: it.name.slice(0, 40), data: this.validate(it.data), created: Number(it.created) || Date.now() };
    } catch { return null; }
  }

  _persist() {
    try { localStorage.setItem(this.key, JSON.stringify({ version: this.version, items: this.items })); } catch { /* storage optional */ }
  }

  save(name, data, id = null) {
    const item = this._sanitise({ id, name: name || 'Untitled', data, created: Date.now() });
    if (!item) throw new Error('Preset data is invalid.');
    const index = this.items.findIndex((it) => it.id === item.id);
    if (index >= 0) this.items[index] = item; else this.items.push(item);
    this._persist();
    return item;
  }

  rename(id, name) { const it = this.items.find((x) => x.id === id); if (it) { it.name = String(name).slice(0, 40); this._persist(); } }
  remove(id) { this.items = this.items.filter((it) => it.id !== id); this._persist(); }
  get(id) { return this.items.find((it) => it.id === id) || null; }

  exportJSON(item) { return JSON.stringify({ format: this.key, version: this.version, name: item.name, data: item.data }, null, 2); }

  /** Parses a JSON string, validates it, returns {name, data} or throws a readable error. */
  parseImport(text) {
    let obj;
    try { obj = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
    if (!obj || typeof obj !== 'object') throw new Error('Unexpected file contents.');
    if (obj.format && obj.format !== this.key) throw new Error(`This file is for "${obj.format}", not this instrument.`);
    const data = this.validate(obj.data ?? obj);
    return { name: typeof obj.name === 'string' ? obj.name.slice(0, 40) : 'Imported', data };
  }
}

export function downloadText(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept, onText) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.className = 'pn-file';
  input.addEventListener('change', () => { const f = input.files?.[0]; if (f) f.text().then(onText); input.remove(); });
  document.body.appendChild(input);
  input.click();
}

/** Clamp helper used by validators: returns n within [lo, hi] or the fallback. */
export const num = (v, lo, hi, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };
