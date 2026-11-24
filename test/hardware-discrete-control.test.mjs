import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const instrumentScripts = [
  'js/hohner-d6.js',
  'js/korg-ms-20.js',
  'js/engine/app.js',
  'js/mellotron-m400.js',
  'js/nord-c2d.js',
  'js/obxa.js',
  'js/oberheim-eight-voice.js',
  'js/prophet10.js',
  'js/roland-juno-106.js',
  'js/roland-tr-808.js',
  'js/sequential-pro-3.js',
  'js/sub37.js',
  'js/udo-super-8.js',
  'js/yamaha-dx7.js',
];

test('library instrument scripts do not create native dropdowns', () => {
  for (const path of instrumentScripts) {
    const source = read(path);
    assert.doesNotMatch(source, /document\.createElement\(\s*['"]select['"]\s*\)|<select\b/i, path);
  }
});

test('shared selectors expose rotary, button-bank and DX-style data-entry controls', () => {
  const panel = read('js/shared/panel.js');
  const hardware = read('js/shared/hardwarePanel.js');
  assert.match(panel, /pn-hw-choice--rotary/);
  assert.match(panel, /pn-hw-choice--buttons/);
  assert.match(panel, /export function dataEntry/);
  assert.match(panel, /OVERTURE PATCH LIBRARY/);
  assert.match(hardware, /hp-discrete-control/);
  assert.match(hardware, /export function addChoiceButtons/);
  assert.doesNotMatch(panel, /document\.createElement\(\s*['"]select['"]\s*\)/);
  assert.doesNotMatch(hardware, /document\.createElement\(\s*['"]select['"]\s*\)/);
});

test('hardware-specific choice controls use the corresponding control types', () => {
  const juno = read('js/roland-juno-106.js');
  const mellotron = read('js/mellotron-m400.js');
  const dx7 = read('js/yamaha-dx7.js');
  const nord = read('js/nord-c2d.js');
  const obxa = read('js/obxa.js');
  const pro3 = read('js/sequential-pro-3.js');
  const super8 = read('js/udo-super-8.js');
  const eightVoice = read('js/oberheim-eight-voice.js');

  assert.match(juno, /DCO RANGE/);
  assert.match(juno, /choiceButtons\(dco\.body/);
  assert.match(mellotron, /TAPE FRAME · LOAD SIMULATION/);
  assert.match(mellotron, /TRACK SELECT · A \/ B \/ C/);
  assert.match(dx7, /dataEntry\(gc, 'ALGORITHM/);
  assert.match(nord, /cycleControl\('\.nord-model'/);
  assert.match(obxa, /obxa-bank-groups__buttons/);
  assert.match(obxa, /PROGRAM NUMBER/);
  assert.match(pro3, /SOURCE · SOFT KNOB/);
  assert.match(pro3, /DESTINATION · SOFT KNOB/);
  assert.match(super8, /DDS 1 WAVEFORM/);
  assert.match(eightVoice, /osc1Saw/);
  assert.doesNotMatch(eightVoice, /VCO 1 WAVEFORM/);
});

test('SEM voice migration retains the old single-wave patch format', () => {
  const app = read('js/oberheim-eight-voice.js');
  const worklet = read('js/engine/OberheimEightVoiceProcessor.js');
  assert.match(app, /data\[\`wave\${oscillator}\`\] === 'pulse'/);
  assert.match(app, /osc1Saw/);
  assert.match(app, /osc1Pulse/);
  assert.match(worklet, /if \(!\(\`osc\${oscillator}Saw\` in incoming\)\)/);
  assert.match(worklet, /const source = \(osc1 \+ osc2\) \* \.5/);
});

test('all instrument pages load the revised controls and the new offline shell', () => {
  const serviceWorker = read('service-worker.js');
  assert.match(serviceWorker, /overture-shell-v164/);
  assert.match(serviceWorker, /20261123-discrete-controls-r1/);
  assert.match(serviceWorker, /20261123-sem-mixer-r1/);
});
