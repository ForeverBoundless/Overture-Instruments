import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { audioBufferToWav } from '../js/shared/instrumentPreview.js';
import { Prophet10Engine } from '../js/engine/Prophet10Engine.js';
import { postWorkletMessage, INSTRUMENT_PREVIEW_RENDERERS } from '../js/shared/instrumentPreview.js';
import { COMMUNITY_INSTRUMENTS } from '../js/data/communityInstruments.js';
import { attachCommunityPresetMetadata, readCommunityPresetMetadata, stripCommunityPresetMetadata, stripCommunityInstrumentTranspose } from '../js/shared/communityPreset.js';
import { validateOBXAPatch, OBXA_PROGRAM_GROUPS, OBXA_PROGRAM_COUNT, obxaProgramSlotId, obxaSpecialProgramSlotId, validateOBXAProgramRecord } from '../js/data/obxa-patch.js';
import { PresetStore } from '../js/shared/presetStore.js';

test('Community preview WAV output has a valid PCM RIFF/WAVE header', async () => {
  const samples = [
    Float32Array.from([0, 0.25, -0.25, 1]),
    Float32Array.from([0, -0.25, 0.25, -1]),
  ];
  const blob = audioBufferToWav({
    numberOfChannels: 2,
    sampleRate: 44100,
    length: samples[0].length,
    getChannelData: (channel) => samples[channel],
  });
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(blob.type, 'audio/wav');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.toString('ascii', 12, 16), 'fmt ');
  assert.equal(bytes.readUInt32LE(16), 16);
  assert.equal(bytes.readUInt16LE(20), 1, 'PCM format');
  assert.equal(bytes.readUInt16LE(22), 2, 'stereo channels');
  assert.equal(bytes.readUInt32LE(24), 44100);
  assert.equal(bytes.readUInt16LE(34), 16, '16-bit samples');
  assert.equal(bytes.toString('ascii', 36, 40), 'data');
  assert.equal(bytes.readUInt32LE(40), 16);
  assert.equal(bytes.length, 44 + 16);
});

test('Every registered Community instrument has a dedicated patch-aware preview renderer', async () => {
  const source = await readFile(new URL('../js/shared/instrumentPreview.js', import.meta.url), 'utf8');
  const registeredIds = COMMUNITY_INSTRUMENTS.map(({ id }) => id).sort();
  const rendererIds = Object.keys(INSTRUMENT_PREVIEW_RENDERERS).sort();
  assert.deepEqual(rendererIds, registeredIds, 'every Community instrument must have exactly one renderer');
  assert.equal(new Set(registeredIds).size, registeredIds.length, 'instrument IDs must be unique');
  for (const { route } of COMMUNITY_INSTRUMENTS) assert.ok(route.startsWith('/html/'), 'every emulator needs a route');
  for (const engine of ['AudioEngine', 'Sub37Engine', 'NordC2DEngine', 'TR808Engine', 'Prophet10Engine', 'WorkletEngine']) {
    assert.ok(source.includes(engine), `preview renderer should use ${engine}`);
  }
  assert.doesNotMatch(source, /scheduleKeyboardNote|scheduleOrganVoice/);
});

test('Default Community preview melody stays in a comfortable middle register', async () => {
  const source = await readFile(new URL('../js/shared/instrumentPreview.js', import.meta.url), 'utf8');
  assert.match(source, /const MELODY = \[48, 52, 55, 60, 59, 55, 57, 52, 50, 53, 57, 62, 60, 55, 53, 52\]/);
});

test('Community instrument patches omit transpose at every nesting level and preserve other settings', () => {
  const patch = {
    name: 'Legacy patch',
    transpose: 12,
    cutoff: 0.73,
    globals: { transpose: -5, midiChannel: 3, altTuning: 2 },
    layers: [{ transpose: 7, oscillator: { transpose: 2, level: 0.8 } }],
    transposeUp: true,
    transposeDown: false,
  };
  const normalized = stripCommunityInstrumentTranspose('prophet-10', patch);
  assert.deepEqual(normalized, {
    name: 'Legacy patch',
    cutoff: 0.73,
    globals: { midiChannel: 3, altTuning: 2 },
    layers: [{ oscillator: { level: 0.8 } }],
  });
  assert.equal(patch.transpose, 12, 'normalization must not mutate the source patch');
});

test('OB-Xa validation preserves the selected pitch-bend range and both timbre transpositions', () => {
  for (const bendRange of [1, 2, 3, 6, 12]) {
    const patch = validateOBXAPatch({
      mode: 'split', voiceCount: 8, bendRange, bendNarrow: bendRange <= 2,
      transpose: 47, osc2Detune: -37, voicePan: [-1, -0.8, -0.6, -0.4, 0.4, 0.6, 0.8, 1],
      modPanelLfoRate: 0.8, modPanelLfoDepth: 0.65, modPanelLfoDepthEnabled: true, modPanelLfoWave: 'saw', modPanelLfoOsc1: true, modPanelLfoOsc2: false,
      layerB: { transpose: -47, osc2Tune: 0.4, osc2Detune: 23 },
    });
    assert.equal(patch.bendRange, bendRange);
    assert.equal(patch.bendNarrow, bendRange <= 2);
    assert.equal(patch.transpose, 47);
    assert.equal(patch.osc2Detune, -37);
    assert.deepEqual(patch.voicePan, [-1, -0.8, -0.6, -0.4, 0.4, 0.6, 0.8, 1]);
    assert.deepEqual(validateOBXAPatch({}).voicePan, [-1, -1, -1, -1, 1, 1, 1, 1], 'factory pan positions match the original');
    assert.equal(patch.modPanelLfoRate, 0.8);
    assert.equal(patch.modPanelLfoDepth, 0.65);
    assert.equal(patch.modPanelLfoDepthEnabled, true);
    assert.equal(patch.modPanelLfoWave, 'saw');
    assert.equal(patch.modPanelLfoOsc1, true);
    assert.equal(patch.modPanelLfoOsc2, false);
    assert.equal(patch.layerB.transpose, -47);
    assert.equal(patch.layerB.osc2Detune, 23);
    assert.equal(patch.layerB.osc2Tune, 0.4);
  }
  const legacyNarrowPatch = validateOBXAPatch({ bendNarrow: true });
  assert.equal(legacyNarrowPatch.bendRange, 2, 'legacy narrow-range patches remain compatible');
});

test('OB-Xa local preset save, JSON export/import and backup restore preserve all patch fields', () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  try {
    const store = new PresetStore({ key: 'test.obxa.programs', version: 3, validate: validateOBXAPatch });
    const patch = validateOBXAPatch({
      mode: 'double', voiceCount: 8, bendRange: 7,
      transpose: 48, cutoff: 0.71, osc2Detune: 42, voicePan: [-1, -0.7, -0.3, -0.1, 0.1, 0.3, 0.7, 1],
      modPanelLfoRate: 0.73, modPanelLfoDepth: 0.55, modPanelLfoDepthEnabled: true, modPanelLfoWave: 'square', modPanelLfoOsc1: true,
      layerB: { transpose: -48, osc2Tune: 0.45, osc2Detune: -63, lfoWave: 'square' },
    });
    const saved = store.save('Layered brass', patch, 'layered-brass');
    const singleExport = store.exportJSON(saved);
    const singleImport = store.parseImport(singleExport);
    assert.equal(singleImport.data.bendRange, 7);
    assert.equal(singleImport.data.transpose, 48);
    assert.equal(singleImport.data.osc2Detune, 42);
    assert.deepEqual(singleImport.data.voicePan, [-1, -0.7, -0.3, -0.1, 0.1, 0.3, 0.7, 1]);
    assert.equal(singleImport.data.modPanelLfoDepth, 0.55);
    assert.equal(singleImport.data.modPanelLfoDepthEnabled, true);
    assert.equal(singleImport.data.modPanelLfoWave, 'square');
    assert.equal(singleImport.data.layerB.transpose, -48);
    assert.equal(singleImport.data.layerB.osc2Detune, -63);
    assert.equal(singleImport.data.layerB.osc2Tune, 0.45);

    const restored = new PresetStore({ key: 'test.obxa.programs', version: 3, validate: validateOBXAPatch });
    assert.equal(restored.items[0].data.bendRange, 7);
    assert.equal(restored.items[0].data.layerB.lfoWave, 'square');
    assert.equal(restored.items[0].data.modPanelLfoOsc1, true);

    const backup = store.exportAllJSON();
    const backupValues = new Map();
    globalThis.localStorage = {
      getItem: (key) => backupValues.get(key) ?? null,
      setItem: (key, value) => backupValues.set(key, String(value)),
    };
    const backupStore = new PresetStore({ key: 'test.obxa.programs', version: 3, validate: validateOBXAPatch });
    backupStore.importAll(backup);
    assert.equal(backupStore.items[0].data.bendRange, 7);
    assert.equal(backupStore.items[0].data.transpose, 48);
    assert.equal(backupStore.items[0].data.osc2Detune, 42);
    assert.deepEqual(backupStore.items[0].data.voicePan, [-1, -0.7, -0.3, -0.1, 0.1, 0.3, 0.7, 1]);
    assert.equal(backupStore.items[0].data.modPanelLfoRate, 0.73);
    assert.equal(backupStore.items[0].data.modPanelLfoDepthEnabled, true);
    assert.equal(backupStore.items[0].data.layerB.transpose, -48);
    assert.equal(backupStore.items[0].data.layerB.osc2Detune, -63);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});


test('OB-Xa engine includes the third modulation-panel LFO and manual AUTO-TUNE', async () => {
  const [processor, app, preview] = await Promise.all([
    readFile(new URL('../js/engine/OBXaProcessor.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/obxa.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/instrumentPreview.js', import.meta.url), 'utf8'),
  ]);
  assert.match(processor, /this\.lfos=\[\{phase:0,hold:0\},\{phase:0,hold:0\}\]/);
  assert.match(processor, /this\.modPanelLfo=\{phase:0\}/);
  assert.match(processor, /modPanelLfoValue\(dt\)/);
  assert.match(processor, /m\.t==='autoTune'/);
  assert.match(processor, /this\.p\.modPanelLfoOsc1/);
  assert.match(processor, /this\.p\.modPanelLfoOsc2/);
  assert.match(processor, /this\.p\.modPanelLfoDepthEnabled\?this\.p\.modPanelLfoDepth:0/);
  assert.match(processor, /p\.osc2Detune\|\|0/);
  assert.match(preview, /OBXaProcessor\.js\?v=20261123-audio-r3/);
  assert.match(app, /MODULATION PANEL LFO/);
  assert.match(app, /AUTO-TUNE/);
  assert.match(app, /PULL UP TO ENABLE/);
  assert.match(app, /cc===4\|\|cc===74/);
  assert.match(app, /cc===66\)this\.ui\.hold\.setValue/);
  assert.match(app, /OSC 2 FREQUENCY/);
  assert.match(app, /OSC 2 DETUNE/);
  assert.match(app, /TIMBRE TRANSPOSE',min:-60,max:60/);
  assert.match(app, /HARDWARE PROGRAMMER/);
  assert.match(app, /120 PROGRAM LOCATIONS/);
  assert.match(app, /MEMORY PROTECT/);
  assert.match(app, /SPLIT \/ DOUBLE MEMORY/);
  assert.match(app, /MANUAL/);
  assert.match(app, /VOICE PAN POTS/);
  assert.match(processor, /v\.pan=clamp\(this\.p\.voicePan\?\.\[v\.i\]\?\?/);
});


test('OB-Xa hardware program memories expose 120 group slots and dedicated Split/Double banks', () => {
  assert.equal(OBXA_PROGRAM_GROUPS.length, 15);
  assert.equal(OBXA_PROGRAM_COUNT, 120);
  assert.equal(obxaProgramSlotId(0, 1), 'program:0:1');
  assert.equal(obxaProgramSlotId(14, 8), 'program:14:8');
  assert.equal(obxaSpecialProgramSlotId('split', 8), 'split:8');
  assert.equal(obxaSpecialProgramSlotId('double', 1), 'double:1');
  assert.throws(() => obxaSpecialProgramSlotId('full', 1), /SPLIT or DOUBLE/);
  const splitProgram = validateOBXAProgramRecord({ kind: 'split', patch: validateOBXAPatch({ mode: 'split' }) });
  const doubleProgram = validateOBXAProgramRecord({ kind: 'double', patch: validateOBXAPatch({ mode: 'double' }) });
  assert.equal(splitProgram.kind, 'split');
  assert.equal(doubleProgram.kind, 'double');
  assert.equal(splitProgram.patch.mode, 'split');
  assert.equal(doubleProgram.patch.mode, 'double');
});

test('Community OB-Xa patches retain timbre A and B transpose while dropping master transpose switches', () => {
  const patch = {
    mode: 'split', transpose: 12, cutoff: 0.63, voicePan: [-1, -0.8, -0.6, -0.4, 0.4, 0.6, 0.8, 1],
    modPanelLfoDepth: 0.6, modPanelLfoOsc1: true,
    layerB: { transpose: -7, osc2Tune: 0.2 },
    transposeUp: true, transposeDown: false,
  };
  const shared = stripCommunityInstrumentTranspose('ob-xa', patch);
  assert.deepEqual(shared, {
    mode: 'split', transpose: 12, cutoff: 0.63, voicePan: [-1, -0.8, -0.6, -0.4, 0.4, 0.6, 0.8, 1],
    modPanelLfoDepth: 0.6, modPanelLfoOsc1: true,
    layerB: { transpose: -7, osc2Tune: 0.2 },
  });
  assert.equal(patch.layerB.transpose, -7, 'sharing must not mutate the live patch');
  assert.deepEqual(stripCommunityInstrumentTranspose('ob-xa', {
    layerB: { transpose: 4, nested: { transpose: 9 } }, transposeUp: true,
  }), { layerB: { transpose: 4, nested: {} } }, 'only root and layer B transpose are patch data');
});

test('Community selector metadata does not mutate instrument patch data', () => {
  const patch = { name: 'Whatever', damping: 0.73, cutoff: 0.42 };
  const selection = { kind: 'factory', index: 3, value: 'f:3', name: 'Dry Funk' };
  const stored = attachCommunityPresetMetadata(patch, selection);
  assert.deepEqual(readCommunityPresetMetadata(stored), selection);
  assert.deepEqual(stripCommunityPresetMetadata(stored), patch);
  assert.equal(stored.name, 'Whatever');
  assert.equal(stored.damping, 0.73);
});

test('All worklet instruments accept frame-timed preview note events', async () => {
  const files = [
    'Prophet10Processor.js', 'DX7Processor.js', 'JunoProcessor.js', 'MS20Processor.js',
    'Pro3Processor.js', 'Super8Processor.js', 'OBXaProcessor.js', 'HohnerD6Processor.js',
    'OberheimEightVoiceProcessor.js', 'MellotronProcessor.js',
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../js/engine/${file}`, import.meta.url), 'utf8');
    assert.match(source, /Number\.isFinite\(m\.frame\)/, `${file} should queue future note events`);
    assert.match(source, /scheduled/, `${file} should retain queued note events until their frame`);
  }
});

test('Native synth engines expose offline contexts and scheduled note times', async () => {
  const [audio, sub, nord, drums] = await Promise.all([
    readFile(new URL('../js/engine/AudioEngine.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/Sub37Engine.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/NordC2DEngine.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/TR808Engine.js', import.meta.url), 'utf8'),
  ]);
  for (const [name, source] of [['Little Phatty', audio], ['Sub 37', sub], ['Nord C2D', nord], ['TR-808', drums]]) {
    assert.match(source, /start\(context = null\)/, `${name} should accept an OfflineAudioContext`);
  }
  assert.match(audio, /noteOn\(noteName, velocity = 1, when = this\.ctx\.currentTime\)/);
  assert.match(sub, /noteOn\(note, velocity = 0\.9, when = this\.ctx\.currentTime\)/);
  assert.match(nord, /noteOn\(manual, note, velocity = 0\.9, when = this\.ctx\.currentTime\)/);
  assert.match(drums, /trigger\(id, time = this\.ctx\?\.currentTime/);
});

test('Prophet-10 preview engine exposes the public post API used by shared worklet scheduling', () => {
  const engine = new Prophet10Engine();
  const messages = [];
  engine.node = { port: { postMessage: (message) => messages.push(message) } };
  const noteOn = { t: 'noteOn', note: 60, vel: 0.78, frame: 2646 };
  const noteOff = { t: 'noteOff', note: 60, frame: 4263 };
  assert.equal(typeof engine.post, 'function');
  engine.post(noteOn);
  engine.post(noteOff);
  assert.deepEqual(messages, [noteOn, noteOff]);
});


test('Shared preview message dispatch supports both engine wrappers and raw worklet ports', () => {
  const message = { t: 'noteOn', note: 60, vel: 0.8, frame: 2646 };
  const wrapperMessages = [];
  postWorkletMessage({ post: (value) => wrapperMessages.push(value) }, message);
  assert.deepEqual(wrapperMessages, [message]);

  const portMessages = [];
  postWorkletMessage({ node: { port: { postMessage: (value) => portMessages.push(value) } } }, message);
  assert.deepEqual(portMessages, [message]);

  assert.throws(
    () => postWorkletMessage({}, message),
    /missing its AudioWorklet message port/,
  );
});

test('Worklet previews wait for the processor to receive queued events before accepting the render', async () => {
  const preview = await readFile(new URL('../js/shared/instrumentPreview.js', import.meta.url), 'utf8');
  assert.match(preview, /__preview_flush_ack/);
  assert.match(preview, /await acknowledged/);
  assert.match(preview, /queueWorkletPhrase\(engine, context\);\s*return render\(context, engine\);/);
  const processors = [
    'Prophet10Processor.js', 'DX7Processor.js', 'JunoProcessor.js', 'MS20Processor.js',
    'Pro3Processor.js', 'Super8Processor.js', 'OBXaProcessor.js', 'HohnerD6Processor.js',
    'OberheimEightVoiceProcessor.js', 'MellotronProcessor.js',
  ];
  for (const file of processors) {
    const source = await readFile(new URL(`../js/engine/${file}`, import.meta.url), 'utf8');
    assert.match(source, /__preview_flush_ack/, `${file} should acknowledge preview message delivery`);
  }
});
