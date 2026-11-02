import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INSTRUMENTS } from '../js/data/instruments.js';

test('PWA shell exposes a manifest and worker registration', async () => {
  const [manifest, worker, home] = await Promise.all(['../manifest.webmanifest', '../service-worker.js', '../index.html'].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  assert.match(manifest, /"display": "standalone"/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(home, /manifest\.webmanifest/);
});

test('all library cards use canonical metadata with declared preset provenance', () => {
  assert.equal(INSTRUMENTS.length, 8);
  assert.equal(INSTRUMENTS.every((instrument) => instrument.presetProvenance && instrument.description), true);
});

test('instrument and experiment pages register the shared offline app shell', async () => {
  const paths = [
    '../about.html', '../library.html', '../omni.html', '../experiments.html',
    '../html/korg-ms-20.html', '../html/little-phatty.html', '../html/nord-c2d.html',
    '../html/prophet10.html', '../html/roland-juno-106.html', '../html/roland-tr-808.html',
    '../html/sub37.html', '../html/yamaha-dx7.html',
    '../experiments/beats-lab.html', '../experiments/envelope-lab.html',
    '../experiments/filter-lab.html', '../experiments/fm-lab.html',
    '../experiments/harmonics-lab.html', '../experiments/modulation-lab.html',
    '../experiments/oscillator-lab.html', '../experiments/space-lab.html',
  ];
  const pages = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const page of pages) {
    assert.match(page, /rel="manifest"/);
    assert.ok(page.includes('/js/shared/pwa.js'));
  }
});


test('offline shell precaches the synthesis engines and OMNI dependencies', async () => {
  const worker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  for (const asset of [
    '/js/engine/Prophet10Processor.js',
    '/js/engine/DX7Processor.js',
    '/js/omni/modules.js',
    '/js/shared/audioRecorder.js',
    '/js/shared/midiRecorder.js',
    '/experiments/filter-lab',
  ]) {
    assert.ok(worker.includes(asset), `offline shell should include ${asset}`);
  }
});


test('Community library has an optional Supabase setup and owner-scoped schema migration', async () => {
  const [page, client, migration, app] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/supabaseClient.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261102000000_community_patches.sql', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /supabase-config\.js/);
  assert.match(client, /service_role/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(app, /signInWithOtp/);
  assert.match(app, /increment_community_patch_downloads/);
  assert.match(app, /OPEN IN OMNI/);
});


test('Community preset exchange covers supported instruments and protects download counters', async () => {
  const [page, app, helper, migration, instrumentSources] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/communityPreset.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261102000000_community_patches.sql', import.meta.url), 'utf8'),
    Promise.all([
      '../js/engine/app.js', '../js/korg-ms-20.js', '../js/roland-juno-106.js',
      '../js/yamaha-dx7.js', '../js/roland-tr-808.js',
    ].map((path) => readFile(new URL(path, import.meta.url), 'utf8'))),
  ]);
  assert.match(page, /community-record-type/);
  assert.match(page, /community-instrument/);
  assert.match(app, /instrument_preset/);
  assert.match(app, /extractInstrumentPreset/);
  assert.match(app, /MY ITEMS/);
  assert.match(helper, /consumeCommunityInstrumentPreset/);
  assert.match(migration, /record_type/);
  assert.match(migration, /grant update \(record_type, instrument_id/);
  assert.doesNotMatch(migration, /grant update on public\.community_patches to authenticated/i);
  for (const source of instrumentSources) assert.match(source, /consumeCommunityInstrumentPreset/);
});
