import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('OMNI chord interval sliders expose the complete ±32-semitone range', async () => {
  const [modules, source, css, page, worker] = await Promise.all([
    readFile(new URL('../js/omni/modules.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/omni.css', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  const chordStart = modules.indexOf('  chord: {');
  const chord = modules.slice(chordStart, modules.indexOf('  noteUtil:', chordStart));
  assert.equal((chord.match(/-32, 32/g) || []).length, 7);
  assert.ok(source.includes('inp.min = log ? Math.log(p.min) : p.min; inp.max = log ? Math.log(p.max) : p.max;'));
  assert.ok(source.includes("const chordInterval = m.type === 'chord' && /^v[2-8]$/.test(p.key);"));
  assert.ok(source.includes("inp.setAttribute('aria-valuemin', String(p.min));"));
  assert.ok(source.includes("inp.setAttribute('aria-valuemax', String(p.max));"));
  assert.ok(source.includes("el('div', 'omni-param__bounds', row)"));
  assert.ok(css.includes('.omni-param__bounds'));
  assert.ok(source.includes(`'./omni/modules.js?v=20261118-organ-drawbar-r1'`));
  assert.ok(source.includes(`'./omni/graph.js?v=20261119-front-panel-r2'`));
  assert.ok((await readFile(new URL('../js/omni/graph.js', import.meta.url), 'utf8')).includes(`from './modules.js?v=20261118-organ-drawbar-r1'`));
  assert.ok(worker.includes(`/js/omni/graph.js?v=20261119-front-panel-r2`));
  assert.ok(worker.includes(`/js/omni/modules.js?v=20261118-organ-drawbar-r1`));
  assert.ok(page.includes('omni.css?v=20261119-front-panel-r2'));
  assert.ok(page.includes('omni-launcher.js?v=20261119-front-panel-r2'));
  assert.match(worker, /overture-shell-v\d+/);
  assert.ok(worker.includes('/css/omni.css?v=20261119-front-panel-r2'));
  assert.ok(worker.includes('/js/omni-launcher.js?v=20261119-front-panel-r2'));
});

test('OMNI exposes recording, searchable modules and editing shortcuts', async () => {
  const source = await readFile(new URL('../js/omni.js', import.meta.url), 'utf8');
  assert.match(source, /toggleAudioRecording/);
  assert.match(source, /toggleMidiRecording/);
  assert.match(source, /moduleSearch/);
  assert.match(source, /duplicateSelection/);
  assert.match(source, /fitView\(\)/);
});

test('OMNI styles include recording, selection and library search states', async () => {
  const css = await readFile(new URL('../css/omni.css', import.meta.url), 'utf8');
  assert.match(css, /omni-tb\.is-recording/);
  assert.match(css, /omni-selection-rect/);
  assert.match(css, /omni-module-search/);
});

test('OMNI and recording modules pass the Node JavaScript syntax parser', () => {
  for (const file of ['../js/omni.js', '../js/omni/front-panel.js', '../js/shared/audioRecorder.js', '../js/shared/midiRecorder.js', '../js/community.js', '../js/shared/communityPreset.js', '../js/shared/supabaseClient.js']) {
    const path = fileURLToPath(new URL(file, import.meta.url));
    execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
  }
});


test('OMNI exposes macro editing, MIDI automation and community publishing hooks', async () => {
  const source = await readFile(new URL('../js/omni.js', import.meta.url), 'utf8');
  assert.match(source, /openMacros/);
  assert.match(source, /applyMacro/);
  assert.match(source, /publishToCommunity/);
  assert.match(source, /_recordGraphNote/);
  assert.match(source, /onPitchBend/);
  assert.match(source, /onControlChange/);
});


test('OMNI studio menus and performance controls are wired to the live graph', async () => {
  const source = await readFile(new URL('../js/omni.js', import.meta.url), 'utf8');
  const graph = await readFile(new URL('../js/omni/graph.js', import.meta.url), 'utf8');
  const modules = await readFile(new URL('../js/omni/modules.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../css/omni.css', import.meta.url), 'utf8');
  assert.match(source, /const fileMenu = group\('File'\)/);
  assert.match(source, /const editMenu = group\('Edit'\)/);
  assert.match(source, /new PitchWheel/);
  assert.match(source, /new ModWheel/);
  assert.match(source, /omni::keyboard-octave/);
  assert.match(source, /setKeyboardOctave\(value\)/);
  assert.match(graph, /setPitchBend\(semitones\)/);
  assert.match(graph, /setModWheel\(value\)/);
  assert.match(modules, /inst\.setPitchBend/);
  assert.match(modules, /inst\.setModWheel/);
  assert.match(css, /omni-perf__deck/);
  assert.match(css, /html\[data-theme="light"\] \.omni-perf/);
});


test('OMNI performance deck keeps octave controls in the keyboard header and gives the keybed usable width', async () => {
  const [source, css, page, worker] = await Promise.all([
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/omni.css', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(source.includes("const octavePanel = el('div', 'omni-octave', keyboardMeta)"));
  assert.ok(source.includes("this.setInitialView();"));
  assert.match(source, /scale: 0\.66/);
  assert.match(css, /grid-template-columns:88px minmax\(0,1fr\)/);
  assert.match(css, /\.omni-keys \.lp-keyboard[^}]*width:100%/);
  assert.match(css, /\.omni-keys \.lp-keyboard[^}]*min-width:520px/);
  assert.match(page, /omni\.css\?v=20261119-front-panel-r2/);
  assert.match(page, /omni-launcher\.js\?v=20261119-front-panel-r2/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(worker, /omni\.css\?v=20261119-front-panel-r2/);
  assert.ok(worker.includes('/js/omni-launcher.js?v=20261119-front-panel-r2'));
});


test('OMNI keyboard spans four octaves and status text avoids the centered theme toggle', async () => {
  const [source, css, page, worker] = await Promise.all([
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/omni.css', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /octaves:\s*4/);
  assert.match(source, /C2 – C6/);
  assert.match(css, /\.omni-commandbar > \.omni-status[\s\S]*text-align:right/);
  assert.match(source, /commandbar\.appendChild\(this\.status\)/);
  assert.match(page, /omni-launcher\.js\?v=20261119-front-panel-r2/);
  assert.match(worker, /overture-shell-v\d+/);
});

test('community publish login link honours Supabase hidden state in every responsive layout', async () => {
  const [css, page, worker] = await Promise.all([
    readFile(new URL('../css/community.css', import.meta.url), 'utf8'),
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(css, /#community-account-link\[hidden\][\s\S]*display:none !important/);
  assert.match(page, /community\.css\?v=20261117-community-signal-r1/);
  assert.match(worker, /community\.css\?v=20261117-community-signal-r1/);
});

test('light-mode accent effects retain the original luminous brand colours', async () => {
  const css = await readFile(new URL('../css/site-theme-polish.css', import.meta.url), 'utf8');
  assert.match(css, /color:#ffb75e !important/);
  assert.match(css, /color:#7de4ff !important/);
  assert.match(css, /color:#82e6a8 !important/);
});


test('shared MIDI map panel has a complete light-mode skin without changing dark mode', async () => {
  const css = await readFile(new URL('../css/midi-map.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-theme="light"\] \.oi-midi-pane/);
  assert.match(css, /html\[data-theme="light"\] \.oi-midi-tab/);
  assert.match(css, /html\[data-theme="light"\] \.oi-midi-select/);
  assert.match(css, /html\[data-theme="light"\] \.oi-midi-row/);
  assert.match(css, /\.oi-midi-pane \{[\s\S]*background: linear-gradient\(180deg, rgba\(16,19,26/);
});

test('OMNI wordmark is black in light mode and hero accent tracking inherits the same value in both themes', async () => {
  const [theme, page, worker] = await Promise.all([
    readFile(new URL('../css/site-theme-polish.css', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(theme, /html\[data-theme="light"\] \.omni-logo-wording strong[\s\S]*color:#111820 !important/);
  assert.match(theme, /letter-spacing: inherit !important/);
  assert.match(page, /site-theme-polish\.css\?v=20261117-inter-type-r1/);
  assert.match(worker, /overture-shell-v\d+/);
});


test('OMNI measures wire ports only after applying the current world zoom', async () => {
  const source = await readFile(new URL('../js/omni.js', import.meta.url), 'utf8');
  const render = source.slice(source.indexOf('  render() {'), source.indexOf('  positionCard('));
  assert.ok(render.indexOf('this.applyView();') < render.indexOf('this.renderWires();'));
  assert.match(source, /new ResizeObserver\(\(\) => this\.renderWires\(\)\)/);
  assert.match(source, /this\.cards\.querySelectorAll\('\.omni-module'\)\.forEach\(\(card\) => this\._wireResizeObserver\?\.observe\(card\)\)/);
});

test('OMNI wordmark explicitly uses Inter Variable', async () => {
  const css = await readFile(new URL('../css/omni.css', import.meta.url), 'utf8');
  const page = await readFile(new URL('../omni.html', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(css, /\.omni-logo-wording strong\s*\{[^}]*font-family:\s*'Inter Variable'/s);
  assert.match(page, /omni\.css\?v=20261119-front-panel-r2/);
  assert.match(worker, /overture-shell-v\d+/);
});


test('OMNI performance pane can be shown/hidden from View and remembers its state', async () => {
  const [source, css, page, worker] = await Promise.all([
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/omni.css', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /Hide Performance Pane/);
  assert.match(source, /this\.performancePane\.hidden = !this\.performanceVisible/);
  assert.match(source, /localStorage\.setItem\('overture\.omni\.performance-visible'/);
  assert.match(source, /this\.performanceToggleBtn\.setAttribute\('aria-pressed'/);
  assert.match(css, /#omni-root > \.omni-perf\[hidden\]\s*\{\s*display:none !important/);
  assert.match(page, /omni-launcher\.js\?v=20261119-front-panel-r2/);
  assert.match(worker, /overture-shell-v\d+/);
});

test('OMNI renders voice-dependent ports, prunes removed wires, and applies MIDI voice-count changes', async () => {
  const source = await readFile(new URL('../js/omni.js', import.meta.url), 'utf8');
  const modules = await readFile(new URL('../js/omni/modules.js', import.meta.url), 'utf8');
  assert.match(source, /modulePorts\(m, 'outputs'\)/);
  assert.match(source, /modulePorts\(byId\[c\.from\.module\], 'outputs'\)/);
  assert.match(source, /syncModulePorts\(m\.id\)/);
  assert.match(source, /Removed connections to inactive/);
  assert.match(modules, /getOutputs\(params = \{\}\)/);
});

test('OMNI output includes peak control and a high-frequency guard', async () => {
  const modules = await readFile(new URL('../js/omni/modules.js', import.meta.url), 'utf8');
  assert.match(modules, /createDynamicsCompressor\(\)/);
  assert.match(modules, /highCut\.type = 'lowpass'/);
  assert.match(modules, /Math\.min\(17000, ctx\.sampleRate \* 0\.42\)/);
});


test('OMNI mixer exposes dynamic 2–8 inputs and MIDI controls follow the active channel count', async () => {
  const [modules, graph, source, worker] = await Promise.all([
    readFile(new URL('../js/omni/modules.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni/graph.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(modules, /name: 'Mixer \(2–8 inputs\)'/);
  assert.match(modules, /getInputs\(params = \{\}\)/);
  assert.match(modules, /Array\.from\(\{ length: 8 \}/);
  assert.match(modules, /if \(direction === 'inputs' && typeof definition\.getInputs/);
  assert.match(graph, /modulePorts\(m, dir\)/);
  assert.match(source, /m\.type === 'mixer' && key === 'channels'/);
  assert.match(source, /this\.syncModulePorts\(m\.id\)/);
  assert.match(modules, /Math\.sqrt\(4 \/ channels\)/);
  assert.match(worker, /overture-shell-v\d+/);
});

test('OMNI exposes native SEM and Mellotron instrument modules and refreshes offline assets', async () => {
  const paths = [
    '../js/omni/modules.js', '../js/omni.js', '../js/omni/graph.js',
    '../js/omni/templates.js', '../js/engine/OberheimEightVoiceProcessor.js',
    '../js/engine/MellotronProcessor.js', '../omni.html', '../service-worker.js',
  ];
  const [modules, app, graph, templates, sem, mellotron, page, worker] = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
  );
  assert.match(modules, /name: 'SEM Poly Synth'/);
  assert.match(modules, /name: 'Mellotron Tape Voice'/);
  assert.match(modules, /oberheim-eight-voice-processor/);
  assert.match(modules, /mellotron-processor/);
  assert.match(modules, /filterMode: \['low', 'band', 'high', 'notch'\]/);
  assert.match(modules, /Tape frame/);
  assert.match(sem, /this\.scheduled\.push\(m\)/);
  assert.match(sem, /this\.scheduled\[0\]\.frame <= currentFrame \+ n/);
  assert.match(mellotron, /this\.scheduled\[0\]\.frame <= currentFrame \+ i/);
  assert.match(mellotron, /this\.p\.release/);
  assert.match(app, /20261117-omni-module-expansion-r3/);
  assert.match(graph, /20261118-organ-drawbar-r1/);
  assert.match(templates, /SEM Warm Ensemble/);
  assert.match(templates, /Mellotron Choir/);
  assert.match(page, /omni-launcher\.js\?v=20261119-front-panel-r2/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(worker, /OberheimEightVoiceProcessor\.js/);
  assert.match(worker, /MellotronProcessor\.js/);
  assert.ok(worker.includes('/js/omni-launcher.js?v=20261119-front-panel-r2'));
});


test('every OMNI module has a complete technical reference and the inspector can open it', async () => {
  const [catalogue, references, app, page, styles, worker, contributorGuide] = await Promise.all([
    import('../js/omni/modules.js'),
    import('../js/omni/moduleInfo.js'),
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../css/omni-info.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../CONTRIBUTING.md', import.meta.url), 'utf8'),
  ]);
  assert.equal(references.assertModuleInfoCoverage(catalogue.MODULES), true);
  assert.deepEqual(Object.keys(references.MODULE_INFO).sort(), Object.keys(catalogue.MODULES).sort());
  for (const [type, info] of Object.entries(references.MODULE_INFO)) {
    for (const field of ['summary', 'circuit', 'use', 'implementation']) {
      assert.equal(typeof info[field], 'string', `${type} needs ${field}`);
      assert.ok(info[field].trim().length > 40, `${type} needs a substantive ${field} explanation`);
    }
  }
  assert.match(app, /assertModuleInfoCoverage\(MODULES\)/);
  assert.match(app, /this\.moduleInfoButton/);
  assert.match(app, /openModuleInfo\(type\)/);
  assert.match(app, /setAttribute\('role', 'dialog'\)/);
  assert.match(app, /aria-modal/);
  assert.match(styles, /html\[data-theme="light"\] \.omni-info-dialog/);
  assert.match(styles, /\.omni-info-dialog\s*\{/);
  assert.match(page, /omni-info\.css\?v=20261114-info-type/);
  assert.match(page, /omni-launcher\.js\?v=20261119-front-panel-r2/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(worker, /omni-info\.css\?v=20261114-info-type/);
  assert.match(worker, /moduleInfo\.js\?v=20261117-omni-module-expansion-r3/);
  assert.match(contributorGuide, /every module must also have a complete entry in `js\/omni\/moduleInfo\.js`/);
});


test('OMNI dependency import order matches the destructured module bindings', async () => {
  const source = await readFile(new URL('../js/omni.js', import.meta.url), 'utf8');
  const groups = source.slice(source.indexOf('const dependencyGroups = ['), source.indexOf('let completedGroups'));
  const modules = groups.indexOf('./omni/modules.js');
  const info = groups.indexOf('./omni/moduleInfo.js');
  const graph = groups.indexOf('./omni/graph.js');
  const templates = groups.indexOf('./omni/templates.js');
  assert.ok(modules >= 0 && modules < info && info < graph && graph < templates);
  assert.match(source, /\{ MODULES, CATEGORIES, SIGNAL_COLORS, modulePorts \},\s*\{ MODULE_INFO, assertModuleInfoCoverage \},\s*\{ defaultPatch, validatePatch, connectionError, LiveGraph, patchToSVG, defaultParams \},\s*\{ TEMPLATES, templatePreview \}/);
  assert.match(source, /assertModuleInfoCoverage\(MODULES\)/);
});


test('Community share action uses the violet accent in dark and light themes', async () => {
  const css = await readFile(new URL('../css/midi-map.css', import.meta.url), 'utf8');
  assert.match(css, /button\.oi-community-share[\s\S]*#e6d2ff/);
  assert.match(css, /html\[data-theme="light"\] button\.oi-community-share[\s\S]*#eee2ff/);
  assert.match(css, /html\[data-theme="light"\] button\.oi-community-share:hover:not\(:disabled\)[\s\S]*#dfc9fb/);
});


test('OMNI front-panel workspaces and precision design tools are integrated', async () => {
  const [source, editor, graph, css, page, launcher, worker, readme, architecture] = await Promise.all([
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni/front-panel.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni/graph.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/omni.css', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni-launcher.js', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/ARCHITECTURE.md', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /FrontPanelEditor/);
  assert.match(source, /ENGINE VIEW/);
  assert.match(source, /FRONT-END VIEW/);
  assert.match(source, /setWorkspaceView\(view/);
  assert.match(source, /workspaceView: this\.workspaceView/);
  assert.match(source, /this\.frontPanelEditor\?\.setPatch/);
  assert.match(editor, /buildDesignTools/);
  assert.match(editor, /text\/omni-front-component/);
  assert.match(editor, /addComponent\(type, x = null, y = null\)/);
  assert.match(editor, /buildLayerPanel/);
  assert.match(editor, /renderRulers/);
  assert.match(editor, /beginMeasurement/);
  assert.match(editor, /renderSmartGuides/);
  assert.match(editor, /alignSelection/);
  assert.match(editor, /unitPixels/);
  assert.match(editor, /safeMargin/);
  assert.match(editor, /colorField\('Panel colour'/);
  assert.match(editor, /selectField\('Material'/);
  assert.match(editor, /exportSVG/);
  assert.match(editor, /setParam\(/);
  assert.match(graph, /frontPanel/);
  assert.match(graph, /measurements/);
  assert.match(graph, /guides/);
  assert.match(graph, /zoom: Math\.min\(3/);
  assert.match(css, /\.ofp-faceplate/);
  assert.match(css, /\.ofp-ruler/);
  assert.match(css, /\.ofp-measurements/);
  assert.match(css, /\.ofp-layers-panel/);
  assert.match(css, /html\[data-theme="light"\].*ofp-library/);
  assert.match(page, /omni\.css\?v=20261119-front-panel-r2/);
  assert.match(launcher, /omni\.js\?v=20261119-front-panel-r2/);
  assert.match(worker, /overture-shell-v136/);
  assert.match(worker, /front-panel\.js\?v=20261119-front-panel-r2/);
  assert.match(worker, /graph\.js\?v=20261119-front-panel-r2/);
  assert.match(readme, /Front-end View/);
  assert.match(architecture, /OMNI front-panel studio/);
});

test('OMNI front-panel validation remains backwards-compatible and sanitizes imported layouts', async () => {
  const graph = await import('../js/omni/graph.js');
  const patch = graph.defaultPatch();
  const oldPatch = graph.validatePatch(patch);
  assert.equal(oldPatch.frontPanel, undefined);
  const filter = patch.modules.find((item) => item.type === 'filter');
  const organ = { id: 'organ1', type: 'nordOrgan', x: 30, y: 30, params: graph.defaultParams('nordOrgan') };
  patch.modules.push(organ);
  patch.frontPanel = {
    width: 1240, height: 520, finish: 'walnut', unit: 'mm', zoom: 1.5,
    panelColor: '#252d35', panelBorderColor: '#ff9f0a', panelBorderWidth: 4, panelRadius: 20, safeMargin: 400, gridSize: 28,
    guides: [{ id: 'g1', axis: 'x', position: 600, color: '#7de4ff' }],
    measurements: [{ x1: 10, y1: 10, x2: 100, y2: 100 }],
    components: [
      { id: 'knob1', type: 'knob', label: 'CUTOFF', x: 12, y: 12, w: 100, h: 120, bind: { moduleId: filter.id, paramKey: 'cutoff' }, finish: 'brushed' },
      { id: 'bad1', type: 'script', x: 0, y: 0 },
      { id: 'orphan1', type: 'slider', x: 0, y: 0, bind: { moduleId: 'missing', paramKey: 'cutoff' } },
      { id: 'drawbars1', type: 'drawbars', x: 20, y: 200, bind: { moduleId: organ.id }, margin: 150 },
      { id: 'bad id', type: 'label', x: 10, y: 10, text: 'SAFE TEXT' },
      { id: 'bad id', type: 'label', x: 30, y: 30, text: 'SECOND LABEL' },
      { id: 'keys1', type: 'keyboard', x: 40, y: 320, w: 560, h: 140, startNote: 48, octaves: 4 },
      { id: 'slider1', type: 'slider', x: 650, y: 40, w: 64, h: 140, orientation: 'vertical', padding: 12, gap: 8, radius: 14, fontSize: 12, borderWidth: 4, shadow: 'hard' },
    ],
  };
  const validated = graph.validatePatch(patch);
  assert.equal(validated.frontPanel.components.length, 7);
  assert.equal(validated.frontPanel.components[0].bind.moduleId, filter.id);
  assert.equal(validated.frontPanel.components[0].bind.paramKey, 'cutoff');
  assert.equal(validated.frontPanel.components[0].padding, 7);
  assert.equal(validated.frontPanel.components[0].radius, 7);
  assert.equal(validated.frontPanel.components[0].shadow, 'soft');
  assert.equal(validated.frontPanel.components[1].bind, undefined);
  assert.equal(validated.frontPanel.components[2].bind.moduleId, organ.id);
  assert.ok(validated.frontPanel.components[2].margin <= 180);
  assert.equal(validated.frontPanel.components[5].octaves, 4);
  assert.equal(validated.frontPanel.components[6].orientation, 'vertical');
  assert.equal(validated.frontPanel.components[6].padding, 12);
  assert.equal(validated.frontPanel.components[6].gap, 8);
  assert.equal(validated.frontPanel.components[6].radius, 14);
  assert.equal(validated.frontPanel.components[6].fontSize, 12);
  assert.equal(validated.frontPanel.components[6].borderWidth, 4);
  assert.equal(validated.frontPanel.components[6].shadow, 'hard');
  assert.notEqual(validated.frontPanel.components[3].id, validated.frontPanel.components[4].id);
  assert.match(validated.frontPanel.components[3].id, /^[a-zA-Z0-9_-]+$/);
  assert.equal(validated.frontPanel.panelBorderColor, '#ff9f0a');
  assert.equal(validated.frontPanel.panelBorderWidth, 4);
  assert.equal(validated.frontPanel.panelRadius, 20);
  assert.equal(validated.frontPanel.finish, 'walnut');
  assert.equal(validated.frontPanel.unit, 'mm');
  assert.equal(validated.frontPanel.zoom, 1.5);
  assert.equal(validated.frontPanel.guides[0].axis, 'x');
  assert.equal(validated.frontPanel.measurements.length, 1);
  assert.equal(validated.frontPanel.safeMargin, 400);
  const unsafe = graph.validatePatch({ ...patch, frontPanel: { ...patch.frontPanel, panelColor: 'url(javascript:alert(1))', zoom: 99, components: patch.frontPanel.components } });
  assert.equal(unsafe.frontPanel.panelColor, '#252d35');
  assert.equal(unsafe.frontPanel.zoom, 3);
  assert.equal(unsafe.frontPanel.panelBorderColor, '#ff9f0a');
  const zeroValues = graph.validatePatch({
    ...patch,
    frontPanel: {
      ...patch.frontPanel,
      safeMargin: 0,
      gridSize: 450,
      zoom: 0,
      components: [
        { id: 'low-key', type: 'keyboard', x: 0, y: 0, w: 500, h: 120, startNote: 0, octaves: 1 },
        { id: 'low-pad', type: 'pad', x: 520, y: 0, w: 90, h: 90, note: 0 },
      ],
    },
  });
  assert.equal(zeroValues.frontPanel.safeMargin, 0);
  assert.equal(zeroValues.frontPanel.gridSize, 450);
  assert.equal(zeroValues.frontPanel.zoom, .25);
  assert.equal(zeroValues.frontPanel.components[0].startNote, 0);
  assert.equal(zeroValues.frontPanel.components[1].note, 0);
});
