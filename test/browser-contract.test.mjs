import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INSTRUMENTS } from '../js/data/instruments.js';

test('PWA shell exposes a manifest and worker registration', async () => {
  const [manifest, worker, home] = await Promise.all(['../manifest.webmanifest', '../service-worker.js', '../index.html'].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  assert.match(manifest, /"display": "standalone"/);
  assert.match(worker, /overture-shell-v1/);
  assert.match(home, /manifest\.webmanifest/);
});

test('all library cards use canonical metadata with declared preset provenance', () => {
  assert.equal(INSTRUMENTS.length, 8);
  assert.equal(INSTRUMENTS.every((instrument) => instrument.presetProvenance && instrument.description), true);
});
