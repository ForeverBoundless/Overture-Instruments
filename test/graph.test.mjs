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
