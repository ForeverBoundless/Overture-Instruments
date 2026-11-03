import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
