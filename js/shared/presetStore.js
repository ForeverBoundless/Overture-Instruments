/**
 * presetStore.js - versioned browser-local preset/pattern storage shared by
 * the newer instruments, OMNI and the experiments.
 *
 * Stored shape: { version, items: [{ id, name, data, created }] }
 * `validate(data)` must return a sanitised copy or throw; invalid stored
 * records are dropped instead of crashing the instrument.
 */
export class PresetStore {
  constructor({ key, version = 1, validate = (d) => d, migrations = {}, maxItems = 250, maxImportBytes = 2 * 1024 * 1024 }) {
    this.key = key;
    this.version = version;
    this.validate = validate;
    this.migrations = migrations;
    this.maxItems = maxItems;
    this.maxImportBytes = maxImportBytes;
    this.items = this._load();
  }

  _load() {
    try {
      const source = localStorage.getItem(this.key);
      let raw = JSON.parse(source || 'null');
      if (!raw || !Array.isArray(raw.items)) return [];
      if (raw.version !== this.version) {
        this._backup(source, raw.version);
        raw = this._migrate(raw);
        if (!raw) return [];
        this._persistItems(raw.items);
      }
      return raw.items.map((it) => this._sanitise(it)).filter(Boolean);
    } catch { return []; }
  }

  _backup(source, version = 'unknown') {
    try { localStorage.setItem(`${this.key}.backup.v${version}.${Date.now()}`, source); } catch { /* storage is optional */ }
  }

  _migrate(raw) {
    let current = raw;
    let version = Number(current.version) || 1;
    while (version < this.version) {
      const migrate = this.migrations[version];
      if (typeof migrate !== 'function') return null;
      current = migrate(current);
      version += 1;
      if (!current || !Array.isArray(current.items)) return null;
      current.version = version;
    }
    return version === this.version ? current : null;
  }

  _sanitise(it) {
    try {
      if (!it || typeof it.name !== 'string') return null;
      return { id: String(it.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), name: it.name.slice(0, 40), data: this.validate(it.data), created: Number(it.created) || Date.now() };
    } catch { return null; }
  }

  _persistItems(items) {
    try { localStorage.setItem(this.key, JSON.stringify({ version: this.version, items })); } catch { /* storage optional */ }
  }

  _persist() {
    this._persistItems(this.items);
  }

  save(name, data, id = null) {
    const item = this._sanitise({ id, name: name || 'Untitled', data, created: Date.now() });
    if (!item) throw new Error('Preset data is invalid.');
    const index = this.items.findIndex((it) => it.id === item.id);
    if (index >= 0) this.items[index] = item;
    else {
      if (this.items.length >= this.maxItems) throw new Error(`This browser library is limited to ${this.maxItems} presets. Export or remove a preset before adding another.`);
      this.items.push(item);
    }
    this._persist();
    return item;
  }

  rename(id, name) { const it = this.items.find((x) => x.id === id); if (it) { it.name = String(name).slice(0, 40); this._persist(); } }
  remove(id) { this.items = this.items.filter((it) => it.id !== id); this._persist(); }
  get(id) { return this.items.find((it) => it.id === id) || null; }

  exportJSON(item) { return JSON.stringify({ format: this.key, version: this.version, name: item.name, data: item.data }, null, 2); }
  exportAllJSON() { return JSON.stringify({ format: this.key, version: this.version, exported: Date.now(), items: this.items }, null, 2); }

  /** Parses a JSON string, validates it, returns {name, data} or throws a readable error. */
  parseImport(text) {
    if (typeof text !== 'string' || new Blob([text]).size > this.maxImportBytes) throw new Error(`Import files must be smaller than ${Math.round(this.maxImportBytes / 1024 / 1024)} MB.`);
    let obj;
    try { obj = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
    if (!obj || typeof obj !== 'object') throw new Error('Unexpected file contents.');
    if (obj.format && obj.format !== this.key) throw new Error(`This file is for "${obj.format}", not this instrument.`);
    const data = this.validate(obj.data ?? obj);
    return { name: typeof obj.name === 'string' ? obj.name.slice(0, 40) : 'Imported', data };
  }

  /** Imports a validated library backup and returns the saved records. */
  importAll(text) {
    if (typeof text !== 'string' || new Blob([text]).size > this.maxImportBytes) throw new Error(`Import files must be smaller than ${Math.round(this.maxImportBytes / 1024 / 1024)} MB.`);
    let obj;
    try { obj = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
    if (!obj || obj.format !== this.key || !Array.isArray(obj.items)) throw new Error('This is not a library backup for this instrument.');
    const additions = obj.items.map((it) => this._sanitise(it)).filter(Boolean);
    if (!additions.length && obj.items.length) throw new Error('The backup contains no valid presets.');
    const byId = new Map(this.items.map((it) => [it.id, it]));
    additions.forEach((it) => byId.set(it.id, it));
    if (byId.size > this.maxItems) throw new Error(`That backup exceeds the ${this.maxItems}-preset library limit.`);
    this.items = [...byId.values()]; this._persist();
    return additions;
  }
}

export function downloadText(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept, onText, onError = (message) => alert(message), maxBytes = 2 * 1024 * 1024) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.className = 'pn-file';
  input.addEventListener('change', () => { const f = input.files?.[0]; if (f) { if (f.size > maxBytes) onError(`Import files must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`); else f.text().then(onText).catch(() => onError('Could not read that file.')); } input.remove(); });
  document.body.appendChild(input);
  input.click();
}

/** Clamp helper used by validators: returns n within [lo, hi] or the fallback. */
export const num = (v, lo, hi, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };
