import test from 'node:test';
import assert from 'node:assert/strict';
import { MidiRecorder, encodeMidiFile } from '../js/shared/midiRecorder.js';

test('MIDI export writes a format-0 file with a valid track length', () => {
  const bytes = encodeMidiFile([
    { kind: 'on', note: 60, velocity: 100, time: 0 },
    { kind: 'off', note: 60, velocity: 0, time: 0.5 },
  ], { title: 'Test take' });
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  assert.equal(ascii(0, 4), 'MThd');
  assert.equal(ascii(14, 18), 'MTrk');
  assert.equal(new DataView(bytes.buffer).getUint32(18, false), bytes.length - 22);
  assert.ok(bytes.includes(0x90));
  assert.ok(bytes.includes(0x80));
});

test('MidiRecorder closes held notes when a take is stopped', () => {
  let now = 10;
  const recorder = new MidiRecorder({ clock: () => now });
  recorder.start();
  now = 10.25;
  recorder.noteOn(64, 0.5);
  now = 10.75;
  const bytes = recorder.stop();
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(recorder.recording, false);
  assert.equal(recorder.held.size, 0);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
});

test('MIDI note-off events at a shared tick are ordered before retriggers', () => {
  const bytes = encodeMidiFile([
    { kind: 'on', note: 60, velocity: 90, time: 0 },
    { kind: 'on', note: 60, velocity: 90, time: 0.5 },
    { kind: 'off', note: 60, velocity: 0, time: 0.5 },
  ]);
  const track = [...bytes.slice(22)];
  const noteOnOffsets = [];
  const noteOffOffsets = [];
  for (let i = 0; i < track.length - 2; i += 1) {
    if (track[i] === 0x90 && track[i + 1] === 60) noteOnOffsets.push(i);
    if (track[i] === 0x80 && track[i + 1] === 60) noteOffOffsets.push(i);
  }
  assert.equal(noteOnOffsets.length, 2);
  assert.equal(noteOffOffsets.length, 1);
  assert.ok(noteOffOffsets[0] < noteOnOffsets[1]);
});
