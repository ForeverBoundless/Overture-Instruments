import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveGraph, connectionError, defaultPatch, validatePatch } from '../js/omni/graph.js';
import { MODULES } from '../js/omni/modules.js';
import { TEMPLATES } from '../js/omni/templates.js';

test('default OMNI patch validates and rejects audio feedback', () => {
  const patch = validatePatch(defaultPatch());
  assert.equal(patch.modules.length, 7);
  const byId = Object.fromEntries(patch.modules.map((module) => [module.id, module]));
  assert.match(connectionError(byId, { module: 'vca1', port: 'out' }, { module: 'flt1', port: 'in' }, patch.connections), /feedback loop/);
});

test('LiveGraph ignores a superseded async build', async () => {
  let releaseFirst;
  const firstReady = new Promise((resolve) => { releaseFirst = resolve; });
  let creates = 0;
  MODULES.__testAsync = {
    params: [], inputs: [], outputs: [],
    async create() {
      creates += 1;
      if (creates === 1) await firstReady;
      return { dispose() {}, apply() {} };
    },
  };
  const graph = new LiveGraph({}, {});
  const makePatch = (id) => ({ name: id, modules: [{ id, type: '__testAsync', x: 0, y: 0, params: {} }], connections: [] });
  try {
    const stale = graph.build(makePatch('old'));
    await Promise.resolve();
    const current = graph.build(makePatch('new'));
    releaseFirst();
    await Promise.all([stale, current]);
    assert.deepEqual([...graph.instances.keys()], ['new']);
  } finally {
    graph.teardown();
    delete MODULES.__testAsync;
  }
});

test('Plucked String template has a damped, filtered signal path', () => {
  const patch = TEMPLATES.find((template) => template.name === 'Plucked String').patch;
  const pluck = patch.modules.find((module) => module.id === 'plk');
  const filter = patch.modules.find((module) => module.id === 'tone');
  const delay = patch.modules.find((module) => module.id === 'dly');
  assert.ok(filter);
  assert.ok(pluck.params.sustain < 0.99);
  assert.ok(pluck.params.brightness <= 3000);
  assert.ok(delay.params.tone <= 3000);
  assert.equal(patch.connections.some((wire) => wire.from.module === 'plk' && wire.to.module === 'tone'), true);
});


test('LiveGraph reuses unchanged modules and replaces only changed nodes and edges', async () => {
  let sourceCreates = 0, sinkCreates = 0, sourceDisposals = 0, connects = 0, disconnects = 0;
  MODULES.__incrementalSource = {
    params: [], inputs: [], outputs: [{ id: 'out', type: 'audio' }],
    create() {
      sourceCreates += 1;
      const node = {
        connect() { connects += 1; },
        disconnect() { disconnects += 1; },
      };
      return { outputs: { out: node }, inputs: {}, dispose() { sourceDisposals += 1; } };
    },
  };
  MODULES.__incrementalSink = {
    params: [], inputs: [{ id: 'in', type: 'audio' }], outputs: [],
    create() {
      sinkCreates += 1;
      return { inputs: { in: { connect() {}, disconnect() {} } }, outputs: {}, dispose() {} };
    },
  };
  const graph = new LiveGraph({}, {});
  const makePatch = (sourceX = 0) => ({
    modules: [
      { id: 'source', type: '__incrementalSource', params: { x: sourceX } },
      { id: 'sink', type: '__incrementalSink', params: {} },
    ],
    connections: [{ id: 'wire', from: { module: 'source', port: 'out' }, to: { module: 'sink', port: 'in' } }],
  });
  try {
    await graph.build(makePatch());
    const firstSource = graph.instances.get('source');
    const firstSink = graph.instances.get('sink');
    assert.equal(connects, 1);

    await graph.build(makePatch());
    assert.equal(graph.instances.get('source'), firstSource);
    assert.equal(graph.instances.get('sink'), firstSink);
    assert.equal(sourceCreates, 1);
    assert.equal(sinkCreates, 1);
    assert.equal(connects, 1);

    await graph.build(makePatch(1));
    assert.notEqual(graph.instances.get('source'), firstSource);
    assert.equal(graph.instances.get('sink'), firstSink);
    assert.equal(sourceCreates, 2);
    assert.equal(sinkCreates, 1);
    assert.equal(sourceDisposals, 1);
    assert.equal(disconnects, 1);
    assert.equal(connects, 2);
  } finally {
    graph.teardown();
    delete MODULES.__incrementalSource;
    delete MODULES.__incrementalSink;
  }
});

test('LiveGraph records one shared note event when a patch fans out to multiple sound modules', async () => {
  let received = 0;
  MODULES.__eventSource = {
    params: [], inputs: [], outputs: [{ id: 'note', type: 'note' }],
    create() {
      const listeners = new Set();
      return {
        on(_port, listener) { listeners.add(listener); return () => listeners.delete(listener); },
        emit(event) { listeners.forEach((listener) => listener(event)); },
        inputs: {}, outputs: {},
      };
    },
  };
  const sinkDefinition = {
    recordNotes: true, params: [], inputs: [{ id: 'pitch', type: 'note' }], outputs: [],
    create() { return { inputs: { pitch: { kind: 'note', handle() {} } }, outputs: {} }; },
  };
  MODULES.__eventSinkA = sinkDefinition;
  MODULES.__eventSinkB = sinkDefinition;
  const graph = new LiveGraph({}, {}, { onNoteEvent: () => { received += 1; } });
  try {
    await graph.build({
      modules: [
        { id: 'source', type: '__eventSource', params: {} },
        { id: 'a', type: '__eventSinkA', params: {} },
        { id: 'b', type: '__eventSinkB', params: {} },
      ],
      connections: [
        { id: 'a-wire', from: { module: 'source', port: 'note' }, to: { module: 'a', port: 'pitch' } },
        { id: 'b-wire', from: { module: 'source', port: 'note' }, to: { module: 'b', port: 'pitch' } },
      ],
    });
    graph.instances.get('source').emit({ note: 60, velocity: 0.8, on: true, time: 1 });
    assert.equal(received, 1);
  } finally {
    graph.teardown();
    delete MODULES.__eventSource;
    delete MODULES.__eventSinkA;
    delete MODULES.__eventSinkB;
  }
});

test('patch macro bindings are validated and remain backward-compatible', () => {
  const original = defaultPatch();
  assert.deepEqual(validatePatch(original).macros, []);
  const macroPatch = {
    ...original,
    macros: [{
      id: 'macro1', name: 'Brightness', value: 0.5,
      bindings: [
        { moduleId: 'flt1', paramKey: 'cutoff', min: 100, max: 12000 },
        { moduleId: 'flt1', paramKey: 'type', min: 0, max: 2 },
        { moduleId: 'missing', paramKey: 'level', min: 0, max: 1 },
      ],
    }],
  };
  const validated = validatePatch(macroPatch);
  assert.equal(validated.macros.length, 1);
  assert.equal(validated.macros[0].bindings.length, 1);
  assert.equal(validated.macros[0].bindings[0].paramKey, 'cutoff');
  assert.equal(validated.macros[0].value, 0.5);
});
