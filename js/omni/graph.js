/**
 * omni/graph.js - OMNI patch model: modules, connections, validation,
 * live audio graph construction, JSON schema and SVG schematic export.
 *
 * Patch JSON (schema 1):
 * { schema: 1, name, modules: [{ id, type, x, y, params }], connections: [{ id, from: {module, port}, to: {module, port} }], global: { master } }
 */
import { MODULES, modulePorts } from './modules.js?v=20261103-chord-sliders-32b';
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
    macros: [],
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
  const macros = Array.isArray(raw.macros) ? raw.macros.slice(0, 8).map((macro, index) => {
    const bindings = Array.isArray(macro?.bindings) ? macro.bindings.slice(0, 16).map((binding) => {
      const targetModule = byId[binding?.moduleId];
      if (!targetModule) return null;
      const parameter = MODULES[targetModule.type].params.find((item) => item.key === binding?.paramKey);
      if (!parameter || parameter.options) return null;
      const min = Math.min(parameter.max, Math.max(parameter.min, Number.isFinite(Number(binding.min)) ? Number(binding.min) : parameter.min));
      const max = Math.min(parameter.max, Math.max(min, Number.isFinite(Number(binding.max)) ? Number(binding.max) : parameter.max));
      if (max <= min) return null;
      return { moduleId: targetModule.id, paramKey: parameter.key, min, max };
    }).filter(Boolean) : [];
    return {
      id: String(macro?.id || uid('macro')).slice(0, 60),
      name: String(macro?.name || `Macro ${index + 1}`).slice(0, 32),
      value: Math.min(1, Math.max(0, Number.isFinite(Number(macro?.value)) ? Number(macro.value) : 0)),
      bindings,
    };
  }) : [];
  return {
    schema: SCHEMA,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : 'Untitled',
    modules, connections,
    global: { master: Math.min(1, Math.max(0, Number(raw.global?.master) || 0.8)) },
    macros,
  };
}

function portDef(byId, ref, dir) { const m = byId[ref?.module]; if (!m) return null; return modulePorts(m, dir).find((p) => p.id === ref.port) || null; }

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
    const edges = existing.filter((c) => modulePorts(byId[c.from.module], 'outputs').find((p) => p.id === c.from.port)?.type !== 'note');
    const reach = (start, target, seen = new Set()) => { if (start === target) return true; if (seen.has(start)) return false; seen.add(start); return edges.filter((e) => e.from.module === start).some((e) => reach(e.to.module, target, seen)); };
    if (reach(to.module, from.module)) return 'that would create a feedback loop, which the audio engine cannot run safely.';
  }
  return null;
}

/**
 * Incremental live graph. Unchanged module instances survive edits; only
 * changed modules and changed edges are replaced. Async module creation is
 * prepared before the active graph is touched.
 */
export class LiveGraph {
  constructor(ctx, master, { onNoteEvent = null } = {}) {
    this.ctx = ctx;
    this.bus = { master, algorithms: ALGORITHMS };
    this.instances = new Map();
    this.connectionCleanups = new Map();
    this.onNoteEvent = onNoteEvent;
    this._recordedEvents = new WeakSet();
    this._requestedGeneration = 0;
    this._buildChain = Promise.resolve();
  }

  async build(patch) {
    const generation = ++this._requestedGeneration;
    const snapshot = JSON.parse(JSON.stringify(patch));
    this._buildChain = this._buildChain
      .catch(() => {})
      .then(() => this._replace(snapshot, generation));
    return this._buildChain;
  }

  async _replace(patch, generation) {
    if (generation !== this._requestedGeneration) return false;
    const desired = new Map(patch.modules.map((module) => [module.id, module]));
    const next = new Map();
    const prepared = new Map();
    const disposePrepared = () => prepared.forEach((instance) => {
      try { instance.allOff?.(); } catch { /* best effort */ }
      try { instance.dispose?.(); } catch { /* best effort */ }
    });

    try {
      for (const module of patch.modules) {
        const existing = this.instances.get(module.id);
        const unchanged = existing
          && existing.type === module.type
          && !existing.needsRebuild
          && JSON.stringify(existing.params) === JSON.stringify(module.params);

        if (unchanged) {
          next.set(module.id, existing);
          continue;
        }

        const definition = MODULES[module.type];
        const instance = await definition.create(this.ctx, this.bus);
        if (generation !== this._requestedGeneration) {
          try { instance.dispose?.(); } catch { /* best effort */ }
          disposePrepared();
          return false;
        }
        instance.id = module.id;
        instance.type = module.type;
        instance.recordNotes = Boolean(definition.recordNotes);
        instance.params = { ...module.params };
        instance.needsRebuild = false;
        prepared.set(module.id, instance);
        instance.apply?.();
        next.set(module.id, instance);
      }
    } catch (error) {
      disposePrepared();
      throw error;
    }

    if (generation !== this._requestedGeneration) {
      disposePrepared();
      return false;
    }

    // Preserve an existing edge only when its endpoints are the same live
    // instances. Module replacement therefore changes only adjacent edges.
    const desiredEdges = new Map(patch.connections.map((connection) => [
      connection.id,
      connection,
    ]));
    for (const [id, edge] of this.connectionCleanups) {
      const nextEdge = desiredEdges.get(id);
      const sameEndpoints = nextEdge
        && nextEdge.from.module === edge.from.module
        && nextEdge.from.port === edge.from.port
        && nextEdge.to.module === edge.to.module
        && nextEdge.to.port === edge.to.port;
      const sameInstances = sameEndpoints
        && edge.fromInstance === next.get(nextEdge.from.module)
        && edge.toInstance === next.get(nextEdge.to.module);
      if (!sameInstances) {
        try { edge.dispose(); } catch { /* disconnected nodes are harmless */ }
        this.connectionCleanups.delete(id);
      }
    }

    // Stop and dispose only modules that were removed or explicitly replaced.
    for (const [id, instance] of this.instances) {
      if (next.get(id) === instance) continue;
      try { instance.allOff?.(); } catch { /* best effort */ }
      try { instance.dispose?.(); } catch { /* best effort */ }
    }
    this.instances = next;

    for (const connection of patch.connections) {
      if (this.connectionCleanups.has(connection.id)) continue;
      const cleanup = this.connect(connection);
      if (cleanup) this.connectionCleanups.set(connection.id, cleanup);
    }
    return true;
  }

  connect(connection) {
    const fromInstance = this.instances.get(connection.from.module);
    const toInstance = this.instances.get(connection.to.module);
    if (!fromInstance || !toInstance) return null;

    const source = fromInstance.outputs?.[connection.from.port];
    const destination = toInstance.inputs?.[connection.to.port];
    if (!destination) return null;

    if (destination.kind === 'note') {
      const unsubscribe = fromInstance.on(connection.from.port, (event) => {
        if (toInstance.recordNotes && event && typeof event === 'object'
          && !this._recordedEvents.has(event)) {
          this._recordedEvents.add(event);
          this.onNoteEvent?.(event, {
            sourceModule: fromInstance.id,
            destinationModule: toInstance.id,
            destinationPort: connection.to.port,
          });
        }
        destination.handle(event);
      });
      return {
        from: connection.from, to: connection.to,
        fromInstance, toInstance,
        dispose: unsubscribe,
      };
    }

    if (!source) return null;
    try {
      source.connect(destination);
    } catch (error) {
      console.warn('OMNI connect failed', connection, error);
      return null;
    }
    return {
      from: connection.from, to: connection.to,
      fromInstance, toInstance,
      dispose: () => { try { source.disconnect(destination); } catch { /* already disconnected */ } },
    };
  }

  setParam(id, key, value) {
    const instance = this.instances.get(id);
    if (!instance) return false;
    instance.params[key] = value;
    instance.apply?.();
    return !instance.needsRebuild;
  }

  teardown(cancelBuilds = true) {
    if (cancelBuilds) this._requestedGeneration += 1;
    this.connectionCleanups.forEach((edge) => {
      try { edge.dispose(); } catch { /* best effort */ }
    });
    this.connectionCleanups.clear();
    this.instances.forEach((instance) => {
      try { instance.allOff?.(); } catch { /* best effort */ }
      try { instance.dispose?.(); } catch { /* best effort */ }
    });
    this.instances.clear();
  }

  setPitchBend(semitones) {
    const value = Math.max(-2, Math.min(2, Number(semitones) || 0));
    this.instances.forEach((instance) => instance.setPitchBend?.(value));
  }

  setModWheel(value) {
    const normalized = Math.max(0, Math.min(1, Number(value) || 0));
    this.instances.forEach((instance) => instance.setModWheel?.(normalized));
  }

  noteOn(note, velocity, channel = 1) {
    this.instances.forEach((instance) => instance.noteOn?.(note, velocity, channel));
  }

  noteOff(note, channel = 1) {
    this.instances.forEach((instance) => instance.noteOff?.(note, channel));
  }

  allOff() {
    this.instances.forEach((instance) => instance.allOff?.());
  }
}

/** SVG schematic export: modules as boxes with labelled ports, connections as curves. */
export function patchToSVG(patch) {
  const W = 180; const H = (m) => 40 + Math.max(modulePorts(m, 'inputs').length, modulePorts(m, 'outputs').length) * 18 + 12;
  const xs = patch.modules.map((m) => m.x); const ys = patch.modules.map((m) => m.y);
  const minX = Math.min(...xs, 0) - 40, minY = Math.min(...ys, 0) - 60, maxX = Math.max(...xs.map((x) => x + W), 400) + 40, maxY = Math.max(...patch.modules.map((m) => m.y + H(m)), 200) + 40;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const portPos = (m, port, dir) => { const list = modulePorts(m, dir); const i = list.findIndex((p) => p.id === port); return [m.x + (dir === 'inputs' ? 0 : W), m.y + 40 + i * 18]; };
  const byId = Object.fromEntries(patch.modules.map((m) => [m.id, m]));
  const colors = { audio: '#c8701a', cv: '#2a8fb5', note: '#3f9b60' };
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}" font-family="Helvetica, Arial, sans-serif" font-size="11">\n<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#fff"/>\n<text x="${minX + 16}" y="${minY + 28}" font-size="18" font-weight="bold">${esc(patch.name)} - OMNI schematic (schema ${SCHEMA})</text>\n<text x="${minX + 16}" y="${minY + 44}" fill="#555">Orange = audio, blue = control voltage, green = note/gate events.</text>\n`;
  patch.connections.forEach((c) => {
    const a = byId[c.from.module], b = byId[c.to.module]; if (!a || !b) return;
    const [x1, y1] = portPos(a, c.from.port, 'outputs'); const [x2, y2] = portPos(b, c.to.port, 'inputs');
    const type = modulePorts(a, 'outputs').find((p) => p.id === c.from.port)?.type || 'audio';
    out += `<path d="M${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}" fill="none" stroke="${colors[type]}" stroke-width="2"/>\n`;
  });
  patch.modules.forEach((m) => {
    const def = MODULES[m.type]; const h = H(m);
    out += `<g><rect x="${m.x}" y="${m.y}" width="${W}" height="${h}" rx="6" fill="#f6f6f6" stroke="#333" stroke-width="1.5"/>\n<rect x="${m.x}" y="${m.y}" width="${W}" height="24" rx="6" fill="#333"/><text x="${m.x + 8}" y="${m.y + 16}" fill="#fff" font-weight="bold">${esc(def.name)}</text>\n<text x="${m.x + W - 6}" y="${m.y + 16}" fill="#bbb" text-anchor="end" font-size="9">${esc(m.id)}</text>\n`;
    modulePorts(m, 'inputs').forEach((p, i) => { out += `<circle cx="${m.x}" cy="${m.y + 40 + i * 18}" r="4" fill="${colors[p.type]}"/><text x="${m.x + 8}" y="${m.y + 44 + i * 18}">${esc(p.label)}</text>\n`; });
    modulePorts(m, 'outputs').forEach((p, i) => { out += `<circle cx="${m.x + W}" cy="${m.y + 40 + i * 18}" r="4" fill="${colors[p.type]}"/><text x="${m.x + W - 8}" y="${m.y + 44 + i * 18}" text-anchor="end">${esc(p.label)}</text>\n`; });
    const summary = def.params.slice(0, 3).map((p) => `${p.label.split(' (')[0]}: ${p.options ? p.options[Math.round(m.params[p.key])] : +Number(m.params[p.key]).toFixed(2)}`).join(' · ');
    out += `<text x="${m.x + 8}" y="${m.y + h - 6}" fill="#666" font-size="9">${esc(summary)}</text></g>\n`;
  });
  return `${out}</svg>`;
}
