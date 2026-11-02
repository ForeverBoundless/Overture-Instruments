import test from 'node:test';
import assert from 'node:assert/strict';
import { PresetStore } from '../js/shared/presetStore.js';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), keys: () => [...values.keys()] };
};

test('PresetStore migrates old storage and leaves a backup', () => {
  globalThis.localStorage = memoryStorage();
  localStorage.setItem('test.presets', JSON.stringify({ version: 1, items: [{ id: 'a', name: 'Old', data: { value: 1 }, created: 1 }] }));
  const store = new PresetStore({ key: 'test.presets', version: 2, migrations: { 1: (stored) => ({ ...stored, version: 2 }) } });
  assert.equal(store.items[0].name, 'Old');
  assert.equal(JSON.parse(localStorage.getItem('test.presets')).version, 2);
  assert.equal(localStorage.keys().some((key) => key.startsWith('test.presets.backup.v1.')), true);
});

test('PresetStore validates backup imports and enforces the library limit', () => {
  globalThis.localStorage = memoryStorage();
  const store = new PresetStore({ key: 'test.presets', maxItems: 2, validate: (data) => ({ value: Number(data.value) }) });
  store.save('One', { value: 1 }, 'one');
  const added = store.importAll(JSON.stringify({ format: 'test.presets', items: [{ id: 'two', name: 'Two', data: { value: 2 } }] }));
  assert.equal(added.length, 1);
  assert.throws(() => store.importAll(JSON.stringify({ format: 'test.presets', items: [{ id: 'three', name: 'Three', data: { value: 3 } }] })), /exceeds/);
});
