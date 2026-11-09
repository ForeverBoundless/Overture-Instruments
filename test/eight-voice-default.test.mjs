import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { OBERHEIM_EIGHT_VOICE_PRESETS } from '../js/data/oberheimEightVoicePresets.js';

const PROCESSOR_PATH = new URL('../js/engine/OberheimEightVoiceProcessor.js', import.meta.url);

async function createProcessor() {
  const source = await readFile(PROCESSOR_PATH, 'utf8');
  let Processor = null;
  const scope = {
    AudioWorkletProcessor: class {
      constructor() { this.port = { onmessage: null, postMessage() {} }; }
    },
    registerProcessor(name, definition) {
      assert.equal(name, 'oberheim-eight-voice-processor');
      Processor = definition;
    },
    sampleRate: 48000,
    currentFrame: 0,
  };
  runInNewContext(source, scope);
  assert.ok(Processor, 'the Eight Voice worklet should register its processor');
  return { processor: new Processor(), scope };
}

test('Eight Voice default factory patch is stable, consonant unison', () => {
  const patch = OBERHEIM_EIGHT_VOICE_PRESETS[0].data;
  assert.equal(patch.name, undefined);
  assert.equal(patch.tune, 0);
  assert.equal(patch.wave1, 'saw');
  assert.equal(patch.wave2, 'saw');
  assert.equal(patch.lfoAmount, 0);
  assert.equal(patch.lfoTarget, 'pitch');
  assert.equal(patch.voices.length, 8);
  assert.ok(patch.voices.every((voice) => voice.tune === 0), 'factory voice fine-tune should be zero');
  assert.ok(patch.voices.every((voice) => voice.level > 0.7), 'the default should retain a balanced voice level');
  assert.ok(patch.voices.every((voice) => Math.abs(voice.pan) <= 0.7), 'stereo spread should remain moderate');
});

test('Eight Voice worklet default has no hidden voice detune or pitch modulation', async () => {
  const h = await createProcessor();
  assert.equal(h.processor.p.tune, 0);
  assert.equal(h.processor.p.lfoAmount, 0);
  assert.equal(h.processor.p.lfoTarget, 'pitch');
  assert.ok(!h.processor.p.voices, 'fallback patch should not inject per-voice tuning');
});

test('Eight Voice oscillator pairs track at the same pitch across all eight voices', async () => {
  const h = await createProcessor();
  const patch = OBERHEIM_EIGHT_VOICE_PRESETS[0].data;
  h.processor.dispatch({ t: 'patch', patch });
  for (let i = 0; i < 8; i += 1) h.processor.noteOn(60 + i, 0.9);

  const before = h.processor.v.map((voice) => ({ p1: voice.phase1, p2: voice.phase2, note: voice.note }));
  const frames = 128;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  h.processor.process([], [[left, right]]);
  h.scope.currentFrame += frames;

  for (let i = 0; i < 8; i += 1) {
    const voice = h.processor.v[i];
    const advance1 = (voice.phase1 - before[i].p1 + 1) % 1;
    const advance2 = (voice.phase2 - before[i].p2 + 1) % 1;
    const expected = (440 * Math.pow(2, (before[i].note - 69) / 12) * frames / h.scope.sampleRate) % 1;
    assert.ok(Math.abs(advance1 - expected) < 1e-8, `voice ${i + 1} VCO 1 should track its MIDI note`);
    assert.ok(Math.abs(advance2 - expected) < 1e-8, `voice ${i + 1} VCO 2 should be in unison with VCO 1`);
    assert.ok(Math.abs(advance1 - advance2) < 1e-9, `voice ${i + 1} oscillators must not beat due to hidden tuning`);
  }
  assert.ok([...left, ...right].every(Number.isFinite));
});

test('standalone and OMNI defaults use the same stable Eight Voice sound', async () => {
  const [app, modules, templates, worker] = await Promise.all([
    readFile(new URL('../js/oberheim-eight-voice.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni/modules.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni/templates.js', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /const DEF = \{ cutoff: \.53,[^;]*lfoAmount: 0, lfoTarget: 'pitch'/);
  assert.match(app, /OberheimEightVoiceProcessor\.js\?v=20261104-eightvoice-stable/);
  assert.match(modules, /P\('tune', 'VCO 2 interval \(semitones\)', -12, 12, 0/);
  assert.match(modules, /P\('lfoAmount', 'LFO depth', 0, 0\.5, 0\)/);
  assert.match(modules, /OberheimEightVoiceProcessor\.js\?v=20261104-eightvoice-stable/);
  assert.match(templates, /SEM Warm Ensemble[\s\S]*?lfoAmount: 0, lfoTarget: 0/);
  assert.match(worker, /overture-shell-v\\d+/);
  assert.match(worker, /OberheimEightVoiceProcessor\.js\?v=20261104-eightvoice-stable/);
});
