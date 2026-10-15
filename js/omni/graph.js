/**
 * omni/graph.js - OMNI patch model: modules, connections, validation,
 * live audio graph construction, JSON schema and SVG schematic export.
 *
 * Patch JSON (schema 1):
 * { schema: 1, name, modules: [{ id, type, x, y, params }], connections: [{ id, from: {module, port}, to: {module, port} }], global: { master } }
 */
import { MODULES } from './modules.js';
import { ALGORITHMS } from '../data/dx7Algorithms.js';

export const SCHEMA = 1;
const uid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;

export function defaultParams(type) { const o = {}; MODULES[type].params.forEach((p) => { o[p.key] = p.default; }); return o; }

export function defaultPatch() {
  const kb = { id: 'kb1', type: 'keyboard', x: 40, y: 220, params: defaultParams('keyboard') };
  const osc = { id: 'osc1', type: 'oscillator', x: 320, y: 120, params: defaultParams('oscillator') };
  const env = { id: 'env1', type: 'envelope', x: 320, y: 360, params: defaultParams('envelope') };
  const flt = { id: 'flt1', type: 'filter', x: 600, y: 120, params: { ...defaultParams('filter'), cutoff: 2400, resonance: 3 } };
  const env2 = { id: 'env2', type: 'envelope', x: 600, y: 360, params: { ...defaultParams('envelope'), attack: 0.02, decay: 0.6, sustain: 0.2, release: 0.5 } };
  const vca = { id: 'vca1', type: 'vca', x: 880, y: 120, params: defaultParams('vca') };
  const out = { id: 'out1', type: 'output', x: 1140, y: 120, params: defaultParams('output') };
  return {
    schema: SCHEMA, name: 'New instrument', modules: [kb, osc, env, flt, env2, vca, out],
    connections: [
      { id: uid('c'), from: { module: 'kb1', port: 'note' }, to: { module: 'osc1', port: 'pitch' } },
      { id: uid('c'), from: { module: 'kb1', port: 'note' }, to: { module: 'env1', port: 'gate' } },
      { id: uid('c'), from: { module: 'kb1', port: 'note' }, to: { module: 'env2', port: 'gate' } },
      { id: uid('c'), from: { module: 'osc1', port: 'out' }, to: { module: 'flt1', port: 'in' } },
      { id: uid('c'), from: { module: 'env2', port: 'out' }, to: { module: 'flt1', port: 'cutoffMod' } },
      { id: uid('c'), from: { module: 'flt1', port: 'out' }, to: { module: 'vca1', port: 'in' } },
      { id: uid('c'), from: { module: 'env1', port: 'out' }, to: { module: 'vca1', port: 'gain' } },
      { id: uid('c'), from: { module: 'vca1', port: 'out' }, to: { module: 'out1', port: 'in' } },
    ],
    global: { master: 0.8 },
  };
}

/** Validates + sanitises a patch object. Throws Error with a readable message. */
export function validatePatch(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Patch must be an object.');
  if (raw.schema !== undefined && raw.schema !== SCHEMA) throw new Error(`Unsupported patch schema ${raw.schema} (this build reads schema ${SCHEMA}).`);
  if (!Array.isArray(raw.modules)) throw new Error('Patch has no module list.');
  const ids = new Set();
  const modules = raw.modules.map((m, i) => {
    if (!m || typeof m !== 'object') throw new Error(`Module ${i} is not an object.`);
    if (!MODULES[m.type]) throw new Error(`Unknown module type "${m.type}".`);
    const id = String(m.id || uid('m'));
    if (ids.has(id)) throw new Error(`Duplicate module id "${id}".`);
    ids.add(id);
    const params = defaultParams(m.type);
    MODULES[m.type].params.forEach((p) => { const v = Number(m.params?.[p.key]); if (Number.isFinite(v)) params[p.key] = Math.min(p.max, Math.max(p.min, v)); });
    return { id, type: m.type, x: Number.isFinite(Number(m.x)) ? Number(m.x) : 100, y: Number.isFinite(Number(m.y)) ? Number(m.y) : 100, params };
  });
  if (modules.filter((m) => m.type === 'output').length > 1) throw new Error('A patch can only contain one Audio Output.');
  const byId = Object.fromEntries(modules.map((m) => [m.id, m]));
  const connections = [];
  (Array.isArray(raw.connections) ? raw.connections : []).forEach((c) => {
    const check = connectionError(byId, c?.from, c?.to, connections);
    if (check) throw new Error(`Invalid connection: ${check}`);
    connections.push({ id: String(c.id || uid('c')), from: { module: c.from.module, port: c.from.port }, to: { module: c.to.module, port: c.to.port } });
  });
  return { schema: SCHEMA, name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : 'Untitled', modules, connections, global: { master: Math.min(1, Math.max(0, Number(raw.global?.master) || 0.8)) } };
}

function portDef(byId, ref, dir) { const m = byId[ref?.module]; if (!m) return null; return MODULES[m.type][dir].find((p) => p.id === ref.port) || null; }

/** Returns null if the connection is allowed, otherwise a message. */
export function connectionError(byId, from, to, existing) {
  const src = portDef(byId, from, 'outputs'); const dst = portDef(byId, to, 'inputs');
  if (!src) return 'the source port does not exist.';
  if (!dst) return 'the destination port does not exist.';
  if (from.module === to.module) return 'a module cannot connect to itself.';
  if (src.type !== dst.type) return `${src.type.toUpperCase()} outputs only connect to ${src.type.toUpperCase()} inputs (this input takes ${dst.type.toUpperCase()}).`;
  if (existing.some((c) => c.from.module === from.module && c.from.port === from.port && c.to.module === to.module && c.to.port === to.port)) return 'that connection already exists.';
  if (dst.type === 'note' && existing.some((c) => c.to.module === to.module && c.to.port === to.port)) return 'a note input accepts one source at a time.';
  if (src.type !== 'note') {
    // Web Audio cannot run feedback loops without a delay: reject audio/cv cycles.
    const edges = existing.filter((c) => MODULES[byId[c.from.module].type].outputs.find((p) => p.id === c.from.port).type !== 'note');
    const reach = (start, target, seen = new Set()) => { if (start === target) return true; if (seen.has(start)) return false; seen.add(start); return edges.filter((e) => e.from.module === start).some((e) => reach(e.to.module, target, seen)); };
    if (reach(to.module, from.module)) return 'that would create a feedback loop, which the audio engine cannot run safely.';
  }
  return null;
}

/** Builds and maintains the live Web Audio graph for a patch. */
export class LiveGraph {
  constructor(ctx, master) { this.ctx = ctx; this.bus = { master, algorithms: ALGORITHMS }; this.instances = new Map(); this.unsubs = []; }

  async build(patch) {
    this.teardown();
    for (const m of patch.modules) {
      const def = MODULES[m.type];
      const inst = await def.create(this.ctx, this.bus);
      inst.id = m.id; inst.params = { ...m.params };
      inst.apply?.();
      this.instances.set(m.id, inst);
    }
    patch.connections.forEach((c) => this.connect(c));
  }

  connect(c) {
    const a = this.instances.get(c.from.module); const b = this.instances.get(c.to.module);
    if (!a || !b) return;
    const src = a.outputs[c.from.port]; const dst = b.inputs[c.to.port];
    if (!dst) return;
    if (dst.kind === 'note') { this.unsubs.push(a.on(c.from.port, (ev) => dst.handle(ev))); return; } // event port: no AudioNode
    if (!src) return;
    try { src.connect(dst instanceof AudioNode ? dst : dst); } catch (err) { console.warn('OMNI connect failed', c, err); }
  }

  setParam(id, key, value) { const inst = this.instances.get(id); if (!inst) return false; inst.params[key] = value; inst.apply?.(); return !inst.needsRebuild; }

  teardown() {
    this.unsubs.forEach((u) => u()); this.unsubs = [];
    this.instances.forEach((i) => { try { i.allOff?.(); } catch { /* */ } i.dispose(); });
    this.instances.clear();
  }

  noteOn(note, vel) { this.instances.forEach((i) => i.noteOn?.(note, vel)); }
  noteOff(note) { this.instances.forEach((i) => i.noteOff?.(note)); }
  allOff() { this.instances.forEach((i) => i.allOff?.()); }
}

/** SVG schematic export: modules as boxes with labelled ports, connections as curves. */
export function patchToSVG(patch) {
  const W = 180; const H = (m) => 40 + Math.max(MODULES[m.type].inputs.length, MODULES[m.type].outputs.length) * 18 + 12;
  const xs = patch.modules.map((m) => m.x); const ys = patch.modules.map((m) => m.y);
  const minX = Math.min(...xs, 0) - 40, minY = Math.min(...ys, 0) - 60, maxX = Math.max(...xs.map((x) => x + W), 400) + 40, maxY = Math.max(...patch.modules.map((m) => m.y + H(m)), 200) + 40;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const portPos = (m, port, dir) => { const list = MODULES[m.type][dir]; const i = list.findIndex((p) => p.id === port); return [m.x + (dir === 'inputs' ? 0 : W), m.y + 40 + i * 18]; };
  const byId = Object.fromEntries(patch.modules.map((m) => [m.id, m]));
  const colors = { audio: '#c8701a', cv: '#2a8fb5', note: '#3f9b60' };
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}" font-family="Helvetica, Arial, sans-serif" font-size="11">\n<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#fff"/>\n<text x="${minX + 16}" y="${minY + 28}" font-size="18" font-weight="bold">${esc(patch.name)} - OMNI schematic (schema ${SCHEMA})</text>\n<text x="${minX + 16}" y="${minY + 44}" fill="#555">Orange = audio, blue = control voltage, green = note/gate events.</text>\n`;
  patch.connections.forEach((c) => {
    const a = byId[c.from.module], b = byId[c.to.module]; if (!a || !b) return;
    const [x1, y1] = portPos(a, c.from.port, 'outputs'); const [x2, y2] = portPos(b, c.to.port, 'inputs');
    const type = MODULES[a.type].outputs.find((p) => p.id === c.from.port)?.type || 'audio';
    out += `<path d="M${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}" fill="none" stroke="${colors[type]}" stroke-width="2"/>\n`;
  });
  patch.modules.forEach((m) => {
    const def = MODULES[m.type]; const h = H(m);
    out += `<g><rect x="${m.x}" y="${m.y}" width="${W}" height="${h}" rx="6" fill="#f6f6f6" stroke="#333" stroke-width="1.5"/>\n<rect x="${m.x}" y="${m.y}" width="${W}" height="24" rx="6" fill="#333"/><text x="${m.x + 8}" y="${m.y + 16}" fill="#fff" font-weight="bold">${esc(def.name)}</text>\n<text x="${m.x + W - 6}" y="${m.y + 16}" fill="#bbb" text-anchor="end" font-size="9">${esc(m.id)}</text>\n`;
    def.inputs.forEach((p, i) => { out += `<circle cx="${m.x}" cy="${m.y + 40 + i * 18}" r="4" fill="${colors[p.type]}"/><text x="${m.x + 8}" y="${m.y + 44 + i * 18}">${esc(p.label)}</text>\n`; });
    def.outputs.forEach((p, i) => { out += `<circle cx="${m.x + W}" cy="${m.y + 40 + i * 18}" r="4" fill="${colors[p.type]}"/><text x="${m.x + W - 8}" y="${m.y + 44 + i * 18}" text-anchor="end">${esc(p.label)}</text>\n`; });
    const summary = def.params.slice(0, 3).map((p) => `${p.label.split(' (')[0]}: ${p.options ? p.options[Math.round(m.params[p.key])] : +Number(m.params[p.key]).toFixed(2)}`).join(' · ');
    out += `<text x="${m.x + 8}" y="${m.y + h - 6}" fill="#666" font-size="9">${esc(summary)}</text></g>\n`;
  });
  return `${out}</svg>`;
}
