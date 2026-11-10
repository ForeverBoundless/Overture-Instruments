import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { addFader } from '../js/shared/hardwarePanel.js';

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

test('Sequential Pro 3 paraphonic mode has independent VCA envelopes and a shared filter envelope', async () => {
  const h = await createWorklet('../js/engine/Pro3Processor.js', 'pro3-processor');
  h.processor.message({ t: 'patch', patch: { mode: 'paraphonic', ampAttack: .001, ampSustain: 1, filterAttack: .001, filterSustain: 1 } });
  for (const note of [48, 55, 60]) h.processor.message({ t: 'noteOn', note, vel: .8 });
  const held = h.processor.voices.filter((voice) => voice.gate);
  assert.equal(held.map((voice) => voice.note).sort((a, b) => a - b).join(','), '48,55,60');
  assert.ok(held.every((voice) => voice.ampEnv?.gate), 'each paraphonic oscillator has its own amplifier envelope');
  assert.equal(h.processor.envs.filter.gate, true, 'the filter envelope remains shared');
  const released = held.find((voice) => voice.note === 55);
  h.processor.message({ t: 'noteOff', note: 55 });
  assert.equal(released.ampEnv.gate, false);
  assert.equal(released.ampEnv.stage, 'release');
  assert.equal(held.filter((voice) => voice.gate).length, 2, 'the other two oscillator gates remain held');
  assert.equal(h.processor.envs.filter.gate, true, 'the shared filter envelope stays open while another note is held');
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


test('UDO Super 8 allocates separate voices for a multi-note chord', async () => {
  const h = await createWorklet('../js/engine/Super8Processor.js', 'super8-processor');
  h.processor.message({ t: 'patch', patch: { mode: 'single', binaural: false, activeLayer: 0, layers: [{ voiceMode: 'poly1', unison: 'off', env2Attack: .001, env2Sustain: .9 }] } });
  for (const note of [48, 55, 60, 64]) h.processor.message({ t: 'noteOn', note, vel: .8, channel: 1, source: 'midi' });
  const voices = h.processor.voices.filter((voice) => voice.active && voice.layer === 0);
  assert.equal(voices.length, 4);
  assert.equal(voices.map((voice) => voice.inputNote).sort((a, b) => a - b).join(','), '48,55,60,64');
  assert.equal(h.processor.layerRanges(0).length, 16);
  assertAudio(render(h), 'Super 8 four-note chord');
});

test('UDO Super 8 pressure axis is non-negative and maps to the modulation-matrix source', async () => {
  const h = await createWorklet('../js/engine/Super8Processor.js', 'super8-processor');
  h.processor.message({ t: 'patch', patch: { mode: 'single', binaural: false, activeLayer: 0 } });
  h.processor.message({ t: 'bendAxis', x: .25, y: .8 });
  assert.equal(h.processor.global.benderX, .25);
  assert.equal(h.processor.global.benderY, .8);
  assert.equal(h.processor.source(6, { note: 60 }, h.processor.layers[0], 0, 0), .8);
});

test('UDO Super 8 single mode exposes sixteen mono voices or eight binaural super-voices', async () => {
  const h = await createWorklet('../js/engine/Super8Processor.js', 'super8-processor');
  h.processor.message({ t: 'patch', patch: { mode: 'single', binaural: true, activeLayer: 0 } });
  assert.equal(h.processor.layerRanges(0).length, 8);
  h.processor.message({ t: 'param', key: 'binaural', value: false });
  assert.equal(h.processor.layerRanges(0).length, 16);
});



test('default Pro 3 and Super 8 performances produce audible audio without a custom test patch', async () => {
  const pro = await createWorklet('../js/engine/Pro3Processor.js', 'pro3-processor');
  pro.processor.message({ t: 'noteOn', note: 60, vel: .85 });
  assertAudio(render(pro, 4096), 'Pro 3 factory default');

  const super8 = await createWorklet('../js/engine/Super8Processor.js', 'super8-processor');
  super8.processor.message({ t: 'noteOn', note: 60, vel: .85, channel: 1, source: 'ui' });
  assertAudio(render(super8, 4096), 'Super 8 factory default');
});

test('both visible hardware keyboards use the pending-note performance input path', async () => {
  const [pro, super8] = await Promise.all([
    readFile(new URL('../js/sequential-pro-3.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/udo-super-8.js', import.meta.url), 'utf8'),
  ]);
  assert.match(pro, /this\.hwKeyboard=addKeyboard\(p,\{[^}]*onNoteOn:\(n,v\)=>this\.perf\.noteOn\(n,v,'ui'\),onNoteOff:n=>this\.perf\.noteOff\(n,'ui'\)/);
  assert.match(super8, /this\.hwKeyboard=addKeyboard\(p,\{[^}]*onNoteOn:\(n,v\)=>this\.perf\.noteOn\(n,v,'ui'\),onNoteOff:n=>this\.perf\.noteOff\(n,'ui'\)/);
  assert.match(pro, /this\.hwKeyboard\?\.setActive\(n,true\)/);
  assert.match(super8, /this\.hwKeyboard\?\.setActive\(n,true\)/);
});

test('shared hardware fader can construct and expose MIDI metadata at runtime', () => {
  class FakeNode {
    constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.attributes = {}; this.listeners = {}; }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    closest() { return null; }
  }
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  try {
    const parent = new FakeNode('div');
    const control = addFader(parent, { x: 10, y: 20, label: 'FILTER', value: .4, group: 'FILTER', onChange() {} });
    assert.equal(control.el._oiMidi.group, 'FILTER');
    assert.equal(control.el._oiMidi.label, 'FILTER');
    assert.ok(Number.isFinite(control.getValue()));
    assert.ok(parent.children.length > 0);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('shared hardware faders always have a defined MIDI target group', async () => {
  const helper = await readFile(new URL('../js/shared/hardwarePanel.js', import.meta.url), 'utf8');
  assert.ok(helper.includes("export function addFader(parent,{x,y,label,min=0,max=1,value=0,height=92,width=32,orientation='vertical',small=false,onChange=()=>{},formatValue=v=>Number(v).toFixed(2),midiId,group=''}){"), 'addFader defines a default MIDI target group');
  assert.match(helper, /wrap\._oiMidi=\{id:midiId\|\|\('HW:'\+label\),label,group,get:/);
  const [pro, super8] = await Promise.all([
    readFile(new URL('../js/sequential-pro-3.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/udo-super-8.js', import.meta.url), 'utf8'),
  ]);
  assert.match(pro, /addFader\(p,\{[^}]*group:opts\.group/);
  assert.match(super8, /addFader\(p,\{[^}]*group:opts\.group/);
});

test('Super 8 starts with the complete hardware surface, not the retired card build', async () => {
  const source = await readFile(new URL('../js/udo-super-8.js', import.meta.url), 'utf8');
  const constructor = source.slice(source.indexOf(' constructor(){'), source.indexOf('\n }\n p(){'));
  assert.match(constructor, /this\.buildHardwarePanel\(\)/);
  assert.doesNotMatch(constructor, /this\.build\(\)/);
  assert.match(constructor, /this\.buildKeyboard\(\)/);
  assert.match(source, /addKeyboard\(p,\{x:255,y:548,w:1395,h:202,firstNote:36,count:61/);
  assert.match(source, /this\.hwKeyboard=addKeyboard/);
  assert.match(source, /this\.hwKeyboard\?\.setActive\(n,true\)/);
});

test('Pro 3 and Super 8 hardware modules parse before browser startup', async () => {
  const [pro, super8] = await Promise.all([
    readFile(new URL('../js/sequential-pro-3.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/udo-super-8.js', import.meta.url), 'utf8'),
  ]);
  const stripModuleSyntax = (source, className) => source
    .replace(/^import\s+.*?;\s*$/gm, '')
    .replaceAll('import.meta.url', "'https://example.test/'")
    .replace(new RegExp('new\\s+' + className + '\\(\\);\\s*$'), '');
  assert.doesNotThrow(() => new Function(stripModuleSyntax(pro, 'Pro3App')), 'Pro 3 UI module parses');
  assert.doesNotThrow(() => new Function(stripModuleSyntax(super8, 'Super8App')), 'Super 8 UI module parses');
  const hardwareMethod = super8.slice(super8.indexOf(' buildHardwarePanel(){'), super8.indexOf('\n }\n\n}', super8.indexOf(' buildHardwarePanel(){')));
  assert.equal((hardwareMethod.match(/const hardwareGrid=/g) || []).length, 1, 'Super 8 hardware matrix is declared once');
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
  assert.match(pro, /addKeyboard\(p,\{x:196,y:712,w:1468,h:130,firstNote:36,count:37/);
  assert.match(super8, /buildHardwarePanel\(\)/);
  assert.match(super8, /label:'UPPER'/);
  assert.match(super8, /BINAURAL/);
  assert.match(super8, /UDO_logo\.png/);
  assert.match(super8, /count:61/);
  assert.match(super8, /PRESSURE  Y/);
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
