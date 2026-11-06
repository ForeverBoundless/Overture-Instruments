import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function createWorklet(path, expectedName) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let Processor = null;
  const scope = {
    AudioWorkletProcessor: class {
      constructor() { this.port = { onmessage: null, postMessage() {} }; }
    },
    registerProcessor(name, definition) {
      assert.equal(name, expectedName);
      Processor = definition;
    },
    sampleRate: 48000,
    currentFrame: 0,
  };
  runInNewContext(source, scope);
  assert.ok(Processor, expectedName + ' should register');
  return { processor: new Processor(), scope };
}

function render(processor, scope, frames = 512) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  assert.equal(processor.process([], [[left, right]]), true);
  scope.currentFrame += frames;
  return { left, right };
}

test('Hohner D6 worklet renders a struck string and honours the six-switch tone logic', async () => {
  const h = await createWorklet('../js/engine/HohnerD6Processor.js', 'hohner-d6-processor');
  assert.equal(h.processor.voices.length, 60, 'the D6 model should provide one voice for each physical string');
  h.processor.dispatch({ t: 'patch', patch: {
    toneFilters: [true, true, false, false], pickup: 'bothIn', volume: .8, damping: .3,
  } });
  h.processor.noteOn(60, .95);
  const sound = render(h.processor, h.scope);
  assert.ok([...sound.left, ...sound.right].every(Number.isFinite));
  assert.ok([...sound.left, ...sound.right].some((sample) => Math.abs(sample) > 1e-6), 'struck string should produce an output signal');

  const silent = await createWorklet('../js/engine/HohnerD6Processor.js', 'hohner-d6-processor');
  silent.processor.dispatch({ t: 'patch', patch: { toneFilters: [false, false, false, false] } });
  silent.processor.noteOn(60, .95);
  const muted = render(silent.processor, silent.scope);
  assert.ok([...muted.left, ...muted.right].every((sample) => sample === 0), 'all four tone rockers released must mute the D6');
});

test('Hohner D6 worklet exposes pickup combinations, damping and all six pedal processors', async () => {
  const h = await createWorklet('../js/engine/HohnerD6Processor.js', 'hohner-d6-processor');
  h.processor.dispatch({ t: 'param', key: 'pickup', value: 'bothOut' });
  h.processor.dispatch({ t: 'param', key: 'damping', value: .9 });
  for (const name of ['overdrive','compressor','wah','phaser','chorus','spring']) {
    h.processor.dispatch({ t: 'pedal', name, values: { enabled: true } });
    assert.equal(h.processor.pedals[name].enabled, true);
  }
  h.processor.noteOn(52, .8);
  h.processor.noteOff(52);
  const output = render(h.processor, h.scope);
  assert.ok([...output.left, ...output.right].every(Number.isFinite));
});

test('OB-Xa worklet allocates two independent timbres for split and double modes', async () => {
  const h = await createWorklet('../js/engine/OBXaProcessor.js', 'obxa-processor');
  h.processor.dispatch({ t: 'patch', patch: {
    mode: 'split',
    splitPoint: 60,
    osc1Wave: 'saw',
    layerB: { osc1Wave: 'pulse', osc2Wave: 'saw', cutoff: .35, filterMode: '12' },
  } });
  h.processor.noteOn(59, .8);
  h.processor.noteOn(60, .8);
  let active = h.processor.voices.filter((voice) => voice.active);
  assert.equal(active.length, 2);
  assert.deepEqual(Array.from(active, (voice) => voice.layer).sort(), [0, 1]);
  assert.ok(active.some((voice) => voice.i < 4), 'lower/Layer A should allocate from the first four voice cards');
  assert.ok(active.some((voice) => voice.i >= 4), 'upper/Layer B should allocate from the second four voice cards');

  h.processor.dispatch({ t: 'param', key: 'mode', value: 'double', layer: 0 });
  h.processor.noteOn(64, .9);
  active = h.processor.voices.filter((voice) => voice.active && voice.note === 64);
  assert.equal(active.length, 2);
  assert.deepEqual(Array.from(active, (voice) => voice.layer).sort(), [0, 1]);
});

test('OB-Xa worklet supports eight-voice unison and generates finite audio', async () => {
  const h = await createWorklet('../js/engine/OBXaProcessor.js', 'obxa-processor');
  h.processor.dispatch({ t: 'patch', patch: {
    mode: 'unison', unisonDetune: .6, master: .7,
    osc1Wave: 'saw', osc2Wave: 'pulse', osc1Level: .8, osc2Level: .65,
    filterMode: '24', lfoWave: 's&h', lfoAmount: .3, noiseRoute: true, filterTrack: true, osc1Range: .5, fEnvOsc2: true,
  } });
  h.processor.noteOn(57, .9);
  const active = h.processor.voices.filter((voice) => voice.active);
  assert.equal(active.length, 8);
  assert.ok(active.every((voice) => voice.layer === 0));
  const output = render(h.processor, h.scope, 1024);
  assert.ok([...output.left, ...output.right].every(Number.isFinite));
  assert.ok([...output.left, ...output.right].some((sample) => Math.abs(sample) > 1e-7));
});


async function renderD6(pedal = null, boardEnabled = true, frames = 12288) {
  const h = await createWorklet('../js/engine/HohnerD6Processor.js', 'hohner-d6-processor');
  h.processor.dispatch({ t: 'patch', patch: { toneFilters: [true, false, false, false], pickup: 'bothIn', volume: .82, damping: 0, pedalboardEnabled: boardEnabled } });
  if (pedal) h.processor.dispatch({ t: 'pedal', name: pedal, values: { enabled: true } });
  h.processor.noteOn(57, .96);
  return render(h.processor, h.scope, frames);
}
const signalRms = (signal) => Math.sqrt(signal.reduce((sum, sample) => sum + sample * sample, 0) / signal.length);
const differenceRms = (a, b) => Math.sqrt(a.reduce((sum, sample, i) => sum + (sample - b[i]) ** 2, 0) / a.length);

test('Each D6 pedal changes the rendered audio signal', async () => {
  const dry = await renderD6();
  const drySignal = Float32Array.from(dry.left, (x, i) => (x + dry.right[i]) * .5);
  assert.ok(signalRms(drySignal) > 1e-5, 'dry Clavinet should produce audible output');
  for (const pedal of ['overdrive','compressor','wah','phaser','chorus','spring']) {
    const wet = await renderD6(pedal);
    const wetSignal = Float32Array.from(wet.left, (x, i) => (x + wet.right[i]) * .5);
    assert.ok([...wet.left, ...wet.right].every(Number.isFinite), pedal + ' should remain numerically stable');
    assert.ok(differenceRms(drySignal, wetSignal) > 1e-6, pedal + ' should audibly change the dry signal');
  }
});

test('D6 master pedalboard bypass returns the dry signal unchanged', async () => {
  const dry = await renderD6(null, true, 4096);
  const bypass = await renderD6('overdrive', false, 4096);
  assert.ok(differenceRms(dry.left, bypass.left) < 1e-7);
  assert.ok(differenceRms(dry.right, bypass.right) < 1e-7);
});

test('OB-Xa worklet uses stable filter stages and per-voice analog variation', async () => {
  const source = await readFile(new URL('../js/engine/OBXaProcessor.js', import.meta.url), 'utf8');
  assert.match(source, /Math\.tan\(Math\.PI\*cutoff\/sr\)/);
  assert.match(source, /ic1a/);
  assert.match(source, /tune1/);
  assert.match(source, /filterTrim/);
});
