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

function render(harness, frames = 2048) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  assert.equal(harness.processor.process([], [[left, right]]), true);
  harness.scope.currentFrame += frames;
  return { left, right };
}

function assertAudio(output, label) {
  const samples = [...output.left, ...output.right];
  assert.ok(samples.every(Number.isFinite), label + ' must remain finite');
  assert.ok(samples.some((sample) => Math.abs(sample) > 1e-7), label + ' should produce an audible signal');
}

test('Sequential Pro 3 worklet registers, responds to notes, and renders finite audio', async () => {
  const h = await createWorklet('../js/engine/Pro3Processor.js', 'pro3-processor');
  h.processor.message({ t: 'patch', patch: {
    osc1Wave: 'saw', osc1Level: .8, osc2Wave: 'pulse', osc2Level: .5,
    osc3Wave: 'wavetable', osc3Level: .35, ampAttack: .005, ampSustain: .9,
    filterCutoff: .78, fx1Type: 'off', fx2Type: 'off',
  } });
  h.processor.message({ t: 'noteOn', note: 60, vel: .9 });
  assert.ok(h.processor.voices.some((voice) => voice.gate));
  assertAudio(render(h), 'Pro 3');
  h.processor.message({ t: 'noteOff', note: 60 });
  assert.ok(h.processor.voices.every((voice) => !voice.gate));
});

test('Sequential Pro 3 paraphonic mode allocates three note gates through shared envelopes', async () => {
  const h = await createWorklet('../js/engine/Pro3Processor.js', 'pro3-processor');
  h.processor.message({ t: 'patch', patch: { mode: 'paraphonic', ampAttack: .001, ampSustain: 1 } });
  for (const note of [48, 55, 60]) h.processor.message({ t: 'noteOn', note, vel: .8 });
  const activeNotes = [];
  for (const voice of h.processor.voices) if (voice.gate) activeNotes.push(voice.note);
  activeNotes.sort((a, b) => a - b);
  assert.equal(activeNotes.join(','), '48,55,60');
  assert.equal(h.processor.envs.amp.gate, true, 'the paraphonic voices share the main amplifier envelope');
});

test('UDO Super 8 dual binaural mode allocates upper/lower voices and renders stereo audio', async () => {
  const h = await createWorklet('../js/engine/Super8Processor.js', 'super8-processor');
  h.processor.message({ t: 'patch', patch: {
    mode: 'dual', binaural: true, mpe: true, volume: .8,
    layers: [
      { dds1Wave: 'saw', dds2Wave: 'triangle', mix: .35, env2Attack: .005, env2Sustain: .9, cutoff: .8, chorus: 'off', delayTime: .01, delayFeedback: 0 },
      { dds1Wave: 'triangle', dds2Wave: 'saw', mix: .65, env2Attack: .005, env2Sustain: .9, cutoff: .75, chorus: 'off', delayTime: .01, delayFeedback: 0 },
    ],
  } });
  h.processor.message({ t: 'noteOn', note: 60, vel: .9, channel: 1, source: 'midi' });
  h.processor.message({ t: 'noteOn', note: 67, vel: .85, channel: 2, source: 'midi' });
  const allocated = h.processor.voices.filter((voice) => voice.active);
  const activeLayers = new Set();
  for (const voice of allocated) activeLayers.add(voice.layer);
  assert.equal([...activeLayers].sort().join(','), '0,1');
  assert.ok(allocated.some((voice) => voice.channel === 1));
  assert.ok(allocated.some((voice) => voice.channel === 2));
  h.processor.message({ t: 'bend', value: .35, channel: 2 });
  h.processor.message({ t: 'at', value: .6, channel: 2 });
  h.processor.message({ t: 'expression', value: .7, channel: 2 });
  h.processor.message({ t: 'mpeSlide', value: .8, channel: 2 });
  h.processor.message({ t: 'polyAt', note: 67, value: .9, channel: 2 });
  assert.equal(h.processor.mpeBend.get(2), .35);
  assert.equal(h.processor.channelPressure.get(2), .6);
  assert.equal(h.processor.channelExpression.get(2), .7);
  assert.equal(h.processor.mpeSlide.get(2), .8);
  assert.equal(h.processor.polyPressure.get('2:67'), .9);
  assertAudio(render(h), 'Super 8');
});

test('UDO Super 8 single mode exposes sixteen mono voices or eight binaural super-voices', async () => {
  const h = await createWorklet('../js/engine/Super8Processor.js', 'super8-processor');
  h.processor.message({ t: 'patch', patch: { mode: 'single', binaural: true, activeLayer: 0 } });
  assert.equal(h.processor.layerRanges(0).length, 8);
  h.processor.message({ t: 'param', key: 'binaural', value: false });
  assert.equal(h.processor.layerRanges(0).length, 16);
});


test('Pro 3 and Super 8 load the shared reference-style hardware surface', async () => {
  const [pro, super8, helper, styles, proPage, superPage, logo, worker] = await Promise.all([
    readFile(new URL('../js/sequential-pro-3.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/udo-super-8.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/hardwarePanel.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/hardware-panel.css', import.meta.url), 'utf8'),
    readFile(new URL('../html/sequential-pro-3.html', import.meta.url), 'utf8'),
    readFile(new URL('../html/udo-super-8.html', import.meta.url), 'utf8'),
    readFile(new URL('../ui/Logos/UDO_logo.png', import.meta.url)),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(pro, /buildHardwarePanel\(\)/);
  assert.match(pro, /SEQUENCER/);
  assert.match(pro, /OSCILLATOR 1/);
  assert.match(pro, /TUNED FEEDBACK/);
  assert.match(super8, /buildHardwarePanel\(\)/);
  assert.match(super8, /LAYER UPPER/);
  assert.match(super8, /BINAURAL/);
  assert.match(super8, /UDO_logo\.png/);
  assert.match(super8, /count:61/);
  assert.match(super8, /BENDER \/ PERFORMANCE/);
  assert.match(super8, /hp-super8-hardware-footer/);
  assert.match(super8, /MODULATION MATRIX/);
  assert.match(helper, /export function addKeyboard/);
  assert.match(helper, /export function addFader/);
  assert.match(styles, /hp-key-black/);
  assert.match(proPage, /hardware-panel\.css/);
  assert.match(superPage, /hardware-panel\.css/);
  assert.ok(logo.byteLength > 1000, 'UDO wordmark should be the real image asset');
  assert.match(worker, /UDO_logo\.png/);
  assert.match(worker, /UDO_logo\.svg/);
});
