import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveGraph, connectionError, defaultPatch, validatePatch } from '../js/omni/graph.js';
import { MODULES, modulePorts } from '../js/omni/modules.js';
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


test('patch validation rejects chord wires to ports above the selected voice count', () => {
  const chord = {
    schema: 1, name: 'Two voices',
    modules: [
      { id: 'chd', type: 'chord', x: 0, y: 0, params: { voices: 2 } },
      { id: 'osc', type: 'oscillator', x: 200, y: 0, params: {} },
    ],
    connections: [{ id: 'inactive', from: { module: 'chd', port: 'n3' }, to: { module: 'osc', port: 'pitch' } }],
    global: { master: 0.8 },
  };
  assert.throws(() => validatePatch(chord), /source port does not exist/);
});


test('Chord Generator has 2–8 dynamic outputs and preserves the existing four-note minor seventh template', () => {
  const chord = MODULES.chord;
  assert.equal(chord.name, 'Chord Generator (2–8 voices)');
  assert.deepEqual(chord.getOutputs({ voices: 2 }).map((port) => port.id), ['n1', 'n2']);
  assert.equal(modulePorts({ type: 'chord', params: { voices: 2 } }, 'outputs').length, 2);
  assert.equal(modulePorts({ type: 'chord', params: { voices: 8 } }, 'outputs').length, 8);
  const defaults = Object.fromEntries(chord.params.map((parameter) => [parameter.key, parameter.default]));
  assert.equal(defaults.voices, 4);
  assert.deepEqual([defaults.v2, defaults.v3, defaults.v4], [3, 7, 10]);
  assert.equal(chord.getVisibleParams(defaults).some((parameter) => parameter.key === 'v5'), false);
  assert.equal(chord.getVisibleParams({ ...defaults, voices: 5 }).some((parameter) => parameter.key === 'v5'), true);
  const minorSeven = TEMPLATES.find((template) => template.name === 'Four-Voice Chord').patch;
  const templateChord = minorSeven.modules.find((module) => module.type === 'chord');
  assert.equal(templateChord.params.voices, 4);
  assert.deepEqual([templateChord.params.v2, templateChord.params.v3, templateChord.params.v4], [3, 7, 10]);
  assert.equal(minorSeven.connections.filter((connection) => connection.from.module === templateChord.id).length, 4);
});

test('patch validation rejects chord wires to outputs above the selected voice count', () => {
  const patch = {
    schema: 1, name: 'Two voices',
    modules: [
      { id: 'chd', type: 'chord', x: 0, y: 0, params: { voices: 2 } },
      { id: 'osc', type: 'oscillator', x: 200, y: 0, params: {} },
    ],
    connections: [{ id: 'inactive', from: { module: 'chd', port: 'n3' }, to: { module: 'osc', port: 'pitch' } }],
    global: { master: 0.8 },
  };
  assert.throws(() => validatePatch(patch), /source port does not exist/);
});

test('OMNI resonant and feedback modules have bounded parameter ranges', () => {
  assert.ok(MODULES.filter.params.find((parameter) => parameter.key === 'resonance').max <= 8);
  assert.ok(MODULES.ladder.params.find((parameter) => parameter.key === 'resonance').max <= 0.65);
  assert.ok(MODULES.ms20filter.params.find((parameter) => parameter.key === 'lpPeak').max <= 8);
  assert.ok(MODULES.formant.params.find((parameter) => parameter.key === 'resonance').max <= 10);
  assert.ok(MODULES.comb.params.find((parameter) => parameter.key === 'feedback').max <= 0.9);
  assert.ok(MODULES.pluck.params.find((parameter) => parameter.key === 'sustain').max <= 0.965);
});


test('Mixer exposes two to eight audio inputs and retains independent gain controls', () => {
  const mixer = MODULES.mixer;
  assert.equal(mixer.name, 'Mixer (2–8 inputs)');
  assert.deepEqual(mixer.getInputs({ channels: 2 }).map((port) => port.id), ['in1', 'in2']);
  assert.equal(modulePorts({ type: 'mixer', params: { channels: 8 } }, 'inputs').length, 8);
  const defaults = Object.fromEntries(mixer.params.map((parameter) => [parameter.key, parameter.default]));
  assert.equal(defaults.channels, 4);
  assert.equal(mixer.getVisibleParams(defaults).some((parameter) => parameter.key === 'level5'), false);
  assert.equal(mixer.getVisibleParams({ ...defaults, channels: 8 }).some((parameter) => parameter.key === 'level8'), true);
});

test('an eight-voice chord can route eight oscillator outputs into all eight mixer inputs', () => {
  const modules = [
    { id: 'chd', type: 'chord', x: 0, y: 0, params: { voices: 8 } },
    ...Array.from({ length: 8 }, (_, i) => ({ id: 'osc' + (i + 1), type: 'oscillator', x: 200, y: i * 80, params: {} })),
    { id: 'mix', type: 'mixer', x: 500, y: 0, params: { channels: 8 } },
    { id: 'out', type: 'output', x: 800, y: 0, params: {} },
  ];
  const connections = [];
  for (let i = 0; i < 8; i += 1) {
    connections.push({ id: 'note' + (i + 1), from: { module: 'chd', port: 'n' + (i + 1) }, to: { module: 'osc' + (i + 1), port: 'pitch' } });
    connections.push({ id: 'audio' + (i + 1), from: { module: 'osc' + (i + 1), port: 'out' }, to: { module: 'mix', port: 'in' + (i + 1) } });
  }
  connections.push({ id: 'mix-out', from: { module: 'mix', port: 'out' }, to: { module: 'out', port: 'in' } });
  const patch = validatePatch({ schema: 1, name: 'Eight voice chord', modules, connections, global: { master: 0.8 } });
  assert.equal(patch.connections.length, 17);
  assert.equal(modulePorts(patch.modules.find((module) => module.id === 'mix'), 'inputs').length, 8);
});

test('mixer validation rejects input sockets above its selected channel count', () => {
  const patch = {
    schema: 1, name: 'Four input mixer',
    modules: [
      { id: 'osc', type: 'oscillator', x: 0, y: 0, params: {} },
      { id: 'mix', type: 'mixer', x: 200, y: 0, params: { channels: 4 } },
    ],
    connections: [{ id: 'extra', from: { module: 'osc', port: 'out' }, to: { module: 'mix', port: 'in5' } }],
    global: { master: 0.8 },
  };
  assert.throws(() => validatePatch(patch), /destination port does not exist/);
});

test('SEM and Mellotron are distinct instrument-level OMNI sources with starter patches', () => {
  assert.equal(MODULES.semSynth.name, 'SEM Poly Synth');
  assert.equal(MODULES.mellotron.name, 'Mellotron Tape Voice');
  assert.deepEqual(modulePorts({ type: 'semSynth', params: {} }, 'inputs').map((port) => port.id), ['note']);
  assert.deepEqual(modulePorts({ type: 'mellotron', params: {} }, 'outputs').map((port) => port.id), ['out']);
  assert.ok(MODULES.semSynth.params.some((parameter) => parameter.key === 'filterMode'));
  assert.ok(MODULES.semSynth.params.some((parameter) => parameter.key === 'tune'));
  assert.ok(MODULES.mellotron.params.some((parameter) => parameter.key === 'frame'));
  assert.ok(MODULES.mellotron.params.some((parameter) => parameter.key === 'track'));
  assert.ok(MODULES.mellotron.params.some((parameter) => parameter.key === 'release'));

  const sem = TEMPLATES.find((template) => template.name === 'SEM Warm Ensemble');
  const mellotron = TEMPLATES.find((template) => template.name === 'Mellotron Choir');
  assert.ok(sem);
  assert.ok(mellotron);
  const semPatch = validatePatch(sem.patch);
  const mellotronPatch = validatePatch(mellotron.patch);
  assert.equal(semPatch.connections.some((wire) => wire.from.module === 'kb' && wire.to.module === 'sem'), true);
  assert.equal(mellotronPatch.connections.some((wire) => wire.from.module === 'kb' && wire.to.module === 'mtr'), true);
  assert.equal(mellotronPatch.modules.find((module) => module.id === 'mtr').params.frame, 1);
});
