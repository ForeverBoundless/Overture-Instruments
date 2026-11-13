import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { audioBufferToWav } from '../js/shared/instrumentPreview.js';
import { Prophet10Engine } from '../js/engine/Prophet10Engine.js';
import { postWorkletMessage } from '../js/shared/instrumentPreview.js';

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

test('Every Community instrument ID routes to its matching patch-aware renderer', async () => {
  const source = await readFile(new URL('../js/shared/instrumentPreview.js', import.meta.url), 'utf8');
  const ids = [
    'little-phatty', 'sub-37', 'prophet-10', 'nord-c2d', 'dx7', 'juno-106',
    'tr-808', 'ms-20', 'mellotron-m400', 'oberheim-eight-voice', 'hohner-d6',
    'ob-xa', 'sequential-pro-3', 'udo-super-8',
  ];
  for (const id of ids) assert.ok(source.includes(`'${id}'`), `missing preview route for ${id}`);
  for (const engine of ['AudioEngine', 'Sub37Engine', 'NordC2DEngine', 'TR808Engine', 'Prophet10Engine', 'WorkletEngine']) {
    assert.ok(source.includes(engine), `preview renderer should use ${engine}`);
  }
  assert.doesNotMatch(source, /scheduleKeyboardNote|scheduleOrganVoice/);
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
