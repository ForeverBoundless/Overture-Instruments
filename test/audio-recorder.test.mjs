import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioRecorder } from '../js/shared/audioRecorder.js';

class FakeMediaRecorder {
  static isTypeSupported(type) { return type.startsWith('audio/webm'); }
  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive';
    this.listeners = new Map();
  }
  addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
  emit(type, event = {}) { (this.listeners.get(type) || []).forEach((fn) => fn(event)); }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.emit('dataavailable', { data: new Blob(['audio-data'], { type: this.mimeType }) });
    this.emit('stop');
  }
}

test('AudioRecorder taps the output, returns a Blob and releases its stream', async () => {
  const original = globalThis.MediaRecorder;
  let connected = null;
  let disconnected = null;
  let trackStopped = false;
  const destination = { stream: { getTracks: () => [{ stop: () => { trackStopped = true; } }] } };
  const context = { createMediaStreamDestination: () => destination };
  const source = {
    connect: (node) => { connected = node; },
    disconnect: (node) => { disconnected = node; },
  };
  globalThis.MediaRecorder = FakeMediaRecorder;
  try {
    const recorder = new AudioRecorder(context, source);
    recorder.start();
    assert.equal(recorder.recording, true);
    assert.equal(connected, destination);
    const blob = await recorder.stop();
    assert.equal(blob.type, 'audio/webm;codecs=opus');
    assert.equal(blob.size, 10);
    assert.equal(recorder.recording, false);
    assert.equal(disconnected, destination);
    assert.equal(trackStopped, true);
  } finally {
    globalThis.MediaRecorder = original;
  }
});

test('AudioRecorder rejects unsupported browsers without connecting the source', () => {
  const original = globalThis.MediaRecorder;
  const source = { connect() { throw new Error('should not connect'); } };
  try {
    delete globalThis.MediaRecorder;
    assert.throws(() => new AudioRecorder({ createMediaStreamDestination() {} }, source), /not supported/);
  } finally {
    globalThis.MediaRecorder = original;
  }
});
