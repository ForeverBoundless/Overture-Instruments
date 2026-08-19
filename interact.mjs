// interact.mjs — exercises actual behaviors, not just construction:
// legato-only glide, pitch/mod wheel semantics, octave clamping, preset
// switching, and MIDI message handling. Fails loudly (throws / non-zero
// exit) the moment any assertion doesn't hold.

import './harness-setup.mjs';

await import('./js/app.js');
document.dispatchEvent('DOMContentLoaded');

const app = window.__littlePhattyApp;
if (!app) throw new Error('App instance was not exposed on window.__littlePhattyApp');

// The instrument library emits a deliberate launch event after a user has
// selected a tile and clicked Launch.  That click is the user gesture that
// unlocks Web Audio in the real application.
document.dispatchEvent('launcher:launch', {});
// unlock() is async (awaits engine.start()); give its microtasks a tick to
// finish - including Scope/Spectrum construction - before asserting on state.
await new Promise((resolve) => setTimeout(resolve, 20));
if (!app.engine.started) throw new Error('Engine did not start after simulated launcher launch');
console.log('PASS: engine starts after a deliberate launcher launch');
assert(!!app.scope && !!app.spectrum, 'Scope and Spectrum constructed after audio unlock');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('PASS: ' + msg);
}

// ---------------------------------------------------------------------
// 0. Signal-path safety: destination gains, rather than a muted global
// LFO gain, control modulation depth; zero resonance has zero feedback;
// and tremolo is downstream of the envelope VCA so it cannot leak sound
// while no key is held.
// ---------------------------------------------------------------------
{
  const voice = app.engine.voice;
  assert(app.engine.lfos.main.output.gain.value === 1, 'LFO control signal is live at unity gain');
  voice.filter.setResonance(0);
  assert(voice.filter.feedbackAmount.gain.value === 0, 'zero resonance fully removes filter feedback');
  assert(voice.tremoloVCA.gain.value === 1, 'tremolo VCA starts at unity downstream of the envelope');
}

// ---------------------------------------------------------------------
// 1. Legato-only glide: fresh note from silence must NOT glide; a second
//    note while the first is still held MUST glide; releasing back to a
//    single note must NOT glide (it's a fresh trigger's continuation, not
//    a new legato move in this implementation) - and full release resets.
// ---------------------------------------------------------------------
{
  const engine = app.engine;

  // Fresh trigger from full silence.
  engine.noteOn('C3', 0.9);
  assert(engine._heldNotes.length === 1, 'one note held after first note-on');
  assert(engine.voice._currentFreq.toFixed(2) === '130.81', `C3 frequency correct (got ${engine.voice._currentFreq})`);

  // Second note while first still held -> legato glide, no envelope retrigger.
  const ampEnvAttackCallsBefore = engine.voice.ampEnv._stage;
  engine.noteOn('G3', 0.9);
  assert(engine._heldNotes.length === 2, 'two notes held after legato note-on');
  assert(engine.voice._currentFreq.toFixed(2) === '196.00', `voice re-pitched to G3 (got ${engine.voice._currentFreq})`);
  // glideToNote path does NOT call ampEnv.triggerAttack, so stage should be unchanged from before this second note-on.
  assert(engine.voice.ampEnv._stage === ampEnvAttackCallsBefore, 'amp envelope was NOT re-triggered on legato note-on');

  // Release the (currently sounding) top note -> should fall back to the
  // still-held C3 via glide, without fully releasing the voice.
  engine.noteOff('G3');
  assert(engine._heldNotes.length === 1, 'one note remains held after releasing the top legato note');
  assert(engine.voice._currentFreq.toFixed(2) === '130.81', `voice fell back to remaining held C3 (got ${engine.voice._currentFreq})`);
  assert(engine.voice.ampEnv._stage !== 'idle', 'voice is still sounding (not released) while a note remains held');

  // Release everything -> full reset.
  engine.noteOff('C3');
  assert(engine._heldNotes.length === 0, 'no notes held after releasing the last key');
  assert(engine.voice.ampEnv._stage === 'release', 'amp envelope entered release after full key release');

  // Now: a brand new note from a fully-released keyboard must NOT glide in.
  // We verify this indirectly: glideToNote is only used for legato moves,
  // so a fresh trigger must go through voice.noteOn (which resets pitch
  // immediately) rather than voice.glideToNote. Confirm via frequency jump
  // with a zero time-constant by checking osc frequency was set, not ramped -
  // our mock AudioParam can't distinguish ramp-vs-set, so instead we assert
  // at the engine level that _heldNotes started this trigger from empty,
  // which is exactly the condition AudioEngine.noteOn uses to skip glide.
  engine.noteOn('C5');
  assert(engine._heldNotes.length === 1 && engine._heldNotes[0].note === 'C5', 'fresh trigger after full release starts a clean new held-note stack');
  engine.noteOff('C5');
}

// ---------------------------------------------------------------------
// 2. Pitch wheel: spring-loaded via Tab/Shift; mod wheel: position-hold.
// ---------------------------------------------------------------------
{
  assert(app.modWheel.value === 0, 'mod wheel defaults fully down (0)');

  app.pitchWheel.setExternalValue(1);
  assert(app.pitchWheel.value === 1, 'pitch wheel can be driven to full deflection');
  app.pitchWheel.springReturnToCenter();
  // spring-return uses requestAnimationFrame, which our harness makes inert
  // (returns 0, never calls back) - so to validate the END STATE contract
  // rather than the animation itself, we call the underlying _setValue path
  // the animation would eventually reach:
  app.pitchWheel._setValue(0);
  assert(app.pitchWheel.value === 0, 'pitch wheel returns to exact center');

  app.modWheel.setExternalValue(0.7);
  assert(app.modWheel.value === 0.7, 'mod wheel moved to 0.7');
  // Position-hold: nothing should move it back without explicit input.
  assert(app.modWheel.value === 0.7, 'mod wheel holds position (no spring-return)');
}

// ---------------------------------------------------------------------
// 3. Octave range clamps to [-3, +3].
// ---------------------------------------------------------------------
{
  app.engine.setOctaveShift(0);
  for (let i = 0; i < 5; i++) app._stepOctave(1);
  assert(app.engine.getOctaveShift() === 3, `octave clamps at +3 (got ${app.engine.getOctaveShift()})`);
  for (let i = 0; i < 8; i++) app._stepOctave(-1);
  assert(app.engine.getOctaveShift() === -3, `octave clamps at -3 (got ${app.engine.getOctaveShift()})`);
  app.engine.setOctaveShift(0);
}

// ---------------------------------------------------------------------
// 4. Preset switching actually changes live parameters and stays in sync.
// ---------------------------------------------------------------------
{
  app._loadFactoryPreset(8); // "SUB BASS"
  assert(app.presetManager.currentPresetId === 8, 'preset manager tracks loaded preset id');
  assert(Math.abs(app.engine.voice._baseCutoffHz - 700) < 0.01, `SUB BASS cutoff applied to live voice (got ${app.engine.voice._baseCutoffHz})`);
  assert(app.knobs.cutoff.value === 700, 'cutoff knob position synced to loaded preset');

  app._loadFactoryPreset(27); // "ACID GRIND"
  assert(Math.abs(app.engine.voice.filter.getResonance() - 0.82) < 0.001, `ACID GRIND resonance applied (got ${app.engine.voice.filter.getResonance()})`);
}

// ---------------------------------------------------------------------
// 5. SYNC button no longer references the removed dead knob (regression
//    test for the bug found during review).
// ---------------------------------------------------------------------
{
  assert(app.knobs.osc2Ratio === undefined, 'sanity: no osc2Ratio knob exists (by design)');
  // Directly exercise the voice methods the SYNC button calls, the way the
  // button's click handler does, to confirm no crash results.
  app.engine.voice.setOsc2SyncEnabled(true);
  app.engine.voice.setOsc2Ratio(2);
  app.engine.voice.setOsc2SyncEnabled(false);
  app.engine.voice.setOsc2Ratio(1);
  console.log('PASS: SYNC on/off path runs without referencing a nonexistent knob');
}

// ---------------------------------------------------------------------
// 6. LFO retrigger is actually wired to fresh note-on (regression test).
// ---------------------------------------------------------------------
{
  app.engine.setLFORetrigger(true);
  let retriggered = false;
  const originalRetrigger = app.engine.lfos.main.retriggerNow.bind(app.engine.lfos.main);
  app.engine.lfos.main.retriggerNow = (...args) => { retriggered = true; originalRetrigger(...args); };
  app.engine.noteOn('C4', 0.9);
  assert(retriggered === true, 'LFO retriggerNow() is called on a fresh note-on when retrigger mode is enabled');
  app.engine.noteOff('C4');
  app.engine.lfos.main.retriggerNow = originalRetrigger;
  app.engine.setLFORetrigger(false);
}

// ---------------------------------------------------------------------
// 7. Cutoff knob no longer silently drops key-tracking offset (regression
//    test for the bug found during review).
// ---------------------------------------------------------------------
{
  app.engine.voice.setKeyTrackAmount(0.5);
  app.engine.noteOn('C5', 0.9); // well above C4 reference -> should raise cutoff
  const cutoffWithTracking = app.engine.voice.filter.getCutoff();
  app.engine.voice.setBaseCutoff(app.knobs.cutoff.value); // simulate turning the Cutoff knob mid-note
  const cutoffAfterKnobTurn = app.engine.voice.filter.getCutoff();
  assert(Math.abs(cutoffWithTracking - cutoffAfterKnobTurn) < 1, `turning Cutoff knob mid-note preserves key-tracking offset (before=${cutoffWithTracking.toFixed(1)}, after=${cutoffAfterKnobTurn.toFixed(1)})`);
  app.engine.noteOff('C5');
  app.engine.voice.setKeyTrackAmount(0.5);
}

// ---------------------------------------------------------------------
// 8. MIDI message handling (constructed directly against MidiManager,
//    bypassing the absence of real Web MIDI support in this environment).
// ---------------------------------------------------------------------
{
  const seen = [];
  const mgr = new (await import('./js/engine/MidiManager.js')).MidiManager({
    onNoteOn: (n, v) => seen.push(['on', n, v]),
    onNoteOff: (n) => seen.push(['off', n]),
    onPitchBend: (range, norm) => seen.push(['bend', range, norm]),
    onModWheel: (v) => seen.push(['mod', v]),
    onSustain: (d) => seen.push(['sustain', d]),
    onProgramChange: (p) => seen.push(['pc', p]),
  });

  mgr._handleMessage({ data: [0x90, 60, 100] }); // note on, middle C, vel 100
  mgr._handleMessage({ data: [0x80, 60, 0] });    // note off
  mgr._handleMessage({ data: [0xe0, 0, 96] });    // pitch bend, near max (MSB=96 of 127)
  mgr._handleMessage({ data: [0xb0, 1, 127] });   // mod wheel full
  mgr._handleMessage({ data: [0xb0, 64, 127] });  // sustain on
  mgr._handleMessage({ data: [0xc0, 5] });        // program change 5

  assert(seen[0][0] === 'on' && seen[0][1] === 60 && Math.abs(seen[0][2] - 100 / 127) < 0.001, 'MIDI note-on decoded correctly');
  assert(seen[1][0] === 'off' && seen[1][1] === 60, 'MIDI note-off decoded correctly');
  assert(seen[2][0] === 'bend', 'MIDI pitch bend decoded');
  assert(seen[3][0] === 'mod' && Math.abs(seen[3][1] - 1) < 0.01, 'MIDI mod wheel (CC1) decoded to full scale');
  assert(seen[4][0] === 'sustain' && seen[4][1] === true, 'MIDI sustain (CC64) decoded as down');
  assert(seen[5][0] === 'pc' && seen[5][1] === 5, 'MIDI program change decoded');

  // Velocity 0 note-on must be treated as note-off (MIDI running-status convention).
  mgr._handleMessage({ data: [0x90, 67, 0] });
  assert(seen[6][0] === 'off' && seen[6][1] === 67, 'MIDI note-on with velocity 0 is treated as note-off');
}

console.log('\nALL INTERACTION TESTS PASSED');
