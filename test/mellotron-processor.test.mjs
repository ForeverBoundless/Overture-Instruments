import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const PROCESSOR_PATH = new URL('../js/engine/MellotronProcessor.js', import.meta.url);

async function createProcessor() {
  const source = await readFile(PROCESSOR_PATH, 'utf8');
  let Processor = null;
  const scope = {
    AudioWorkletProcessor: class {
      constructor() { this.port = { onmessage: null, postMessage() {} }; }
    },
    registerProcessor(name, definition) {
      assert.equal(name, 'mellotron-processor');
      Processor = definition;
    },
    sampleRate: 48000,
    currentFrame: 0,
  };
  runInNewContext(source, scope);
  assert.ok(Processor, 'the Mellotron worklet should register its processor');
  return { processor: new Processor(), scope };
}

function render(harness, length = 128) {
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  harness.processor.process([], [[left, right]]);
  harness.scope.currentFrame += length;
  return { left, right };
}

test('Mellotron processor keeps playing notes on their original tape frame and track', async () => {
  const h = await createProcessor();
  h.processor.dispatch({ t: 'patch', patch: { frame: 0, track: 0, volume: 0.8, tone: 0.65 } });
  h.processor.noteOn(60, 0.9);
  render(h, 4096);
  const voice = h.processor.voices.find((item) => item.active && item.note === 60);
  assert.ok(voice);
  assert.equal(voice.frameIndex, 0);
  assert.equal(voice.trackIndex, 0);

  h.processor.dispatch({ t: 'patch', patch: { frame: 3, track: 2, volume: 0.8, tone: 0.65 } });
  render(h, 128);
  assert.equal(voice.frameIndex, 0, 'a playing note must not have its partial set swapped underneath it');
  assert.equal(voice.trackIndex, 0);

  h.processor.noteOn(64, 0.8);
  const newVoice = h.processor.voices.find((item) => item.active && item.note === 64);
  assert.ok(newVoice);
  assert.equal(newVoice.frameIndex, 3);
  assert.equal(newVoice.trackIndex, 2);
});

test('Mellotron retriggers overlap a short de-click tail and release without non-finite samples', async () => {
  const h = await createProcessor();
  h.processor.dispatch({ t: 'patch', patch: { frame: 1, track: 0, volume: 0.8, tone: 0.7, release: 0.18 } });
  h.processor.noteOn(60, 1);
  const first = render(h, 8192);
  assert.ok(first.left.some((sample) => Math.abs(sample) > 1e-4), 'the voice should produce audible output');

  h.processor.noteOn(60, 0.85);
  const voice = h.processor.voices.find((item) => item.active && item.note === 60);
  assert.ok(voice);
  assert.equal(voice.tailLevel, 1, 'retrigger should preserve a short tail from the previous voice state');

  const retrigger = render(h, 128);
  assert.ok(voice.tailLevel > 0 && voice.tailLevel < 1, 'the preserved tail should decay while the replacement note is sounding');
  assert.ok([...retrigger.left, ...retrigger.right].every(Number.isFinite));

  const envBeforeRelease = voice.env;
  h.processor.noteOff(60);
  assert.equal(voice.releasing, true);
  render(h, 512);
  assert.ok(voice.env < envBeforeRelease, 'the note envelope should decay after key release');

  const tail = render(h, 96000);
  assert.ok([...tail.left, ...tail.right].every(Number.isFinite));
  const finalWindow = [...tail.left.slice(-12000), ...tail.right.slice(-12000)];
  const maxFinal = finalWindow.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
  assert.equal(voice.active, false, 'the released voice should finish');
  assert.ok(maxFinal <= 1e-6,
    `the released note should eventually reach silence (active=${voice.active}, env=${voice.env}, tail=${voice.tailLevel}, peak=${maxFinal})`);
});

test('Mellotron default note release is long enough to avoid an abrupt key-up', async () => {
  const h = await createProcessor();
  assert.equal(h.processor.p.release, 0.18);
});

test('standalone M400 and OMNI load the corrected, cache-busted Mellotron worklet', async () => {
  const [standalone, modules, worker] = await Promise.all([
    readFile(new URL('../js/mellotron-m400.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni/modules.js', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(standalone, /MellotronProcessor\.js\?v=20261104-declick/);
  assert.match(modules, /MellotronProcessor\.js\?v=20261104-declick/);
  assert.match(worker, /overture-shell-v30/);
  assert.match(worker, /MellotronProcessor\.js\?v=20261104-declick/);
});
