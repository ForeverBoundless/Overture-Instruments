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
  const chord = modules.slice(modules.indexOf('  chord: {'), modules.indexOf('  noteUtil:', modules.indexOf('  chord: {')));
  assert.equal((chord.match(/P\('v[2-8]', 'Voice [2-8] interval \\(semitones\\)', -32, 32,/g) || []).length, 7);
  assert.match(source, /inp\.min = log \? Math\.log\(p\.min\) : p\.min; inp\.max = log \? Math\.log\(p\.max\) : p\.max;/);
  assert.match(source, /const chordInterval = m\.type === 'chord' && \/\^v\[2-8\]\$\/\.test\(p\.key\)/);
  assert.match(source, /aria-valuemin', String\(p\.min\)/);
  assert.match(source, /aria-valuemax', String\(p\.max\)/);
  assert.match(source, /omni-param__bounds/);
  assert.match(css, /\.omni-param__bounds/);
  assert.match(page, /omni\.css\?v=20261103-chord-sliders-32/);
  assert.match(page, /omni\.js\?v=20261103-chord-sliders-32/);
  assert.match(worker, /overture-shell-v20/);
  assert.match(worker, /omni\.css\?v=20261103-chord-sliders-32/);
  assert.match(worker, /omni\.js\?v=20261103-chord-sliders-32/);
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
  for (const file of ['../js/omni.js', '../js/shared/audioRecorder.js', '../js/shared/midiRecorder.js', '../js/community.js', '../js/shared/communityPreset.js', '../js/shared/supabaseClient.js']) {
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
  assert.match(source, /const scale = 0\.66/);
  assert.match(css, /grid-template-columns:88px minmax\(0,1fr\)/);
  assert.match(css, /\.omni-keys \.lp-keyboard[^}]*width:100%/);
  assert.match(css, /\.omni-keys \.lp-keyboard[^}]*min-width:520px/);
  assert.match(page, /omni\.css\?v=20261103-chord-sliders-32/);
  assert.match(page, /omni\.js\?v=20261103-chord-sliders-32/);
  assert.match(worker, /overture-shell-v20/);
  assert.match(worker, /omni\.css\?v=20261103-chord-sliders-32/);
  assert.match(worker, /omni\.js\?v=20261103-chord-sliders-32/);
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
  assert.match(page, /omni\.js\?v=20261103-chord-sliders-32/);
  assert.match(worker, /overture-shell-v20/);
});

test('community publish login link honours Supabase hidden state in every responsive layout', async () => {
  const [css, page, worker] = await Promise.all([
    readFile(new URL('../css/community.css', import.meta.url), 'utf8'),
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(css, /#community-account-link\[hidden\][\s\S]*display:none !important/);
  assert.match(page, /community\.css\?v=20261103-auth-hidden/);
  assert.match(worker, /community\.css\?v=20261103-auth-hidden/);
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
  assert.match(page, /site-theme-polish\.css\?v=20261103-accent-spacing/);
  assert.match(worker, /overture-shell-v20/);
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
  assert.match(page, /omni\.css\?v=20261103-chord-sliders-32/);
  assert.match(worker, /overture-shell-v20/);
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
  assert.match(page, /omni\.js\?v=20261103-chord-sliders-32/);
  assert.match(worker, /overture-shell-v20/);
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
  assert.match(worker, /overture-shell-v20/);
});
