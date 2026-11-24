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
  const sub37 = read('js/sub37.js');
  const hardware = read('js/shared/hardwarePanel.js');
  const eightVoice = read('js/oberheim-eight-voice.js');

  assert.match(juno, /DCO RANGE/);
  assert.match(juno, /choiceButtons\(dco\.body/);
  assert.match(mellotron, /TAPE FRAME · LOAD SIMULATION/);
  assert.match(mellotron, /TRACK SELECT · A \/ B \/ C/);
  assert.match(dx7, /dataEntry\(gc, 'ALGORITHM/);
  assert.match(nord, /cycleControl\('\.nord-model'/);
  assert.match(nord, /data-rotary-speed="slow"/);
  assert.match(nord, /data-rotary-speed="fast"/);
  assert.match(nord, /data-rotary-stop-mode/);
  assert.match(nord, /data-sound-menu-shift/);
  assert.match(nord, /data-sound-menu-enter/);
  assert.match(nord, /data-sound-menu-up/);
  assert.match(nord, /data-sound-menu-down/);
  assert.doesNotMatch(nord, /cycleControl\('\.nord-crosstalk'/);
  assert.doesNotMatch(nord, /cycleControl\('\.nord-click'/);
  assert.match(nord, /SHIFT \+ UP\/DOWN/);
  assert.doesNotMatch(nord, /cycleControl\('\.nord-rotary-speed'/);
  assert.match(nord, /slowStop\.textContent = 'SLOW \/ STOP'/);
  assert.match(read('css/nord-c2d.css'), /button\.stopped/);
  assert.match(read('js/engine/NordC2DEngine.js'), /setRotaryMode\(mode\)/);
  assert.match(obxa, /obxa-bank-groups__buttons/);
  assert.match(obxa, /PROGRAM NUMBER/);
  assert.match(pro3, /SOFT KNOB 2 · SOURCE/);
  assert.match(pro3, /SOFT KNOB 4 · DESTINATION/);
  assert.match(pro3, /SOFT KNOB 3 · AMOUNT/);
  assert.match(pro3, /label:'AMOUNT'/);
  assert.match(pro3, /label:'SOURCE'/);
  assert.match(pro3, /label:'DESTINATION'/);
  assert.match(pro3, /this\.openMatrixEditor/);
  assert.match(read('css/sequential-pro-3.css'), /\.p3-matrix-soft-controls/);
  assert.match(pro3, /PARAPHONIC/);
  assert.match(pro3, /FILTER MODEL/);
  assert.match(pro3, /TRACK SEL/);
  assert.match(pro3, /PRESS STEP 1–16/);
  assert.match(pro3, /BANK/);
  assert.match(pro3, /PROGRAM/);
  assert.match(sub37, /s37-bank-preset/);
  assert.match(sub37, /SELECT BANK · PRESS 1–16/);
  assert.match(hardware, /export function addCycleButton/);
  assert.match(super8, /o\.cycle\?addCycleButton/);
  assert.match(super8, /label:'MODE'/);
  assert.match(super8, /label:'UNISON'/);
  assert.match(super8, /unisonSize/);
  assert.doesNotMatch(super8, /UNISON SIZE · OVERTURE SHIFT\\\+MODE MAPPING/);
  assert.match(super8, /label:'SHIFT'/);
  assert.match(super8, /label:'PERF'/);
  assert.match(super8, /this\.hwPerformanceShifted\?1:0/);
  assert.match(super8, /SUPER8:PERFORMANCE:GROUP/);
  assert.match(super8, /SUPER8:PERFORMANCE:BANK/);
  assert.match(super8, /this\.hwPerformanceGroup\*64/);
  assert.match(super8, />=128/);
  assert.match(super8, /SUPER8:PERFORMANCE:PROGRAM/);
  assert.match(super8, /const program=selectedIndex>=0&&Math\.floor\(selectedIndex\/8\)===this\.hwPerformanceBank/);
  assert.match(super8, /this\.renderPerformanceKeys=\(\)=>/);
  assert.match(super8, /DDS 1 WAVEFORM SWITCH/);
  assert.match(eightVoice, /osc1Saw/);
  assert.match(eightVoice, /choiceButtons\(env\.body, 'LFO ROUTING'/);
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
  assert.match(serviceWorker, /overture-shell-v169/);
  assert.match(serviceWorker, /20261124-discrete-controls-r2/);
  assert.match(serviceWorker, /20261123-sem-mixer-r1/);
});


test('hardware selector styles are defined and scoped to instrument surfaces', () => {
  const panel = read('css/panel.css');
  const hardware = read('css/hardware-panel.css');
  assert.match(panel, /body\.pn-body \* \{ box-sizing: border-box; \}/);
  assert.doesNotMatch(panel, /^\*\s*\{/m);
  assert.doesNotMatch(panel, /^html,\s*body\s*\{/m);
  assert.doesNotMatch(hardware, /^html,\s*body\s*\{/m);
  assert.match(hardware, /\.hp-choice-control-bank/);
  assert.match(hardware, /\.hp-choice-control-button\.active/);
  assert.match(hardware, /\.hp-cycle-control-button/);
});


test('service-worker cache references match the repaired hardware control assets', async () => {
  const worker = read('service-worker.js');
  const pro3 = read('html/sequential-pro-3.html');
  const nord = read('html/nord-c2d.html');
  const super8 = read('html/udo-super-8.html');
  assert.match(worker, /\/css\/panel\.css\?v=20261124-discrete-controls-r2/);
  assert.match(worker, /\/css\/hardware-panel\.css\?v=20261124-discrete-controls-r3/);
  assert.match(worker, /\/js\/sequential-pro-3\.js\?v=20261124-discrete-controls-r4/);
  assert.match(worker, /\/css\/nord-c2d\.css\?v=20261124-discrete-controls-r4/);
  assert.match(worker, /\/js\/nord-c2d\.js\?v=20261124-discrete-controls-r4/);
  assert.match(worker, /\/js\/udo-super-8\.js\?v=20261124-discrete-controls-r3/);
  assert.match(pro3, /hardware-panel\.css\?v=20261124-discrete-controls-r3/);
  assert.match(pro3, /sequential-pro-3\.js\?v=20261124-discrete-controls-r4/);
  assert.match(nord, /nord-c2d\.js\?v=20261124-discrete-controls-r4/);
  assert.match(super8, /hardware-panel\.css\?v=20261124-discrete-controls-r3/);
});


test('Juno-106 uses maintained switches and models the separate VCF bend control', () => {
  const juno = read('js/roland-juno-106.js');
  const processor = read('js/engine/JunoProcessor.js');
  const panel = read('js/shared/panel.js');
  const styles = read('css/roland-juno-106.css');
  assert.match(panel, /export function switchControl/);
  assert.match(panel, /export function discreteFader/);
  assert.match(juno, /discreteFader\(hpf\.body, 'HPF FREQ'/);
  assert.match(juno, /switchControl\(dco\.body, 'PWM MODE'/);
  assert.match(juno, /switchControl\(vca\.body, 'VCA CONTROL'/);
  assert.match(juno, /label: 'DCO BEND SENS'/);
  assert.match(juno, /label: 'VCF BEND SENS'/);
  assert.match(processor, /vcfBendRange: 0/);
  assert.match(processor, /this\.bend \* p\.vcfBendRange/);
  assert.match(styles, /\.pn-toggle-switch__actuator/);
  assert.match(styles, /\.pn-discrete-fader__input/);
});


test('Juno-106 lever switch and VCF-bend assets are precached at the active versions', () => {
  const worker = read('service-worker.js');
  const page = read('html/roland-juno-106.html');
  assert.match(worker, /overture-shell-v170/);
  assert.match(worker, /roland-juno-106\.css\?v=20261124-discrete-controls-r1/);
  assert.match(worker, /roland-juno-106\.js\?v=20261124-discrete-controls-r2/);
  assert.match(page, /roland-juno-106\.css\?v=20261124-discrete-controls-r1/);
  assert.match(page, /roland-juno-106\.js\?v=20261124-discrete-controls-r2/);
});
