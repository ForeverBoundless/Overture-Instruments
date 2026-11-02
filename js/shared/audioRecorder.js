/**
 * Capture an AudioNode's output with the browser's MediaRecorder API.
 * The recorder taps the signal in parallel and never changes the audible path.
 */
const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/ogg',
];

function recorderOptions() {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : undefined;
}

export class AudioRecorder {
  constructor(context, source) {
    if (!context || !source || typeof context.createMediaStreamDestination !== 'function') {
      throw new Error('A running Web Audio context and an output node are required.');
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Audio recording is not supported in this browser.');
    }

    this.context = context;
    this.source = source;
    this.destination = context.createMediaStreamDestination();
    this.chunks = [];
    this.state = 'ready';
    this.blob = null;
    this._stopPromise = null;
    this._resolveStop = null;
    this._rejectStop = null;
    this._error = null;

    try {
      source.connect(this.destination);
      const options = recorderOptions();
      this.recorder = options
        ? new MediaRecorder(this.destination.stream, options)
        : new MediaRecorder(this.destination.stream);
    } catch (error) {
      this._cleanup();
      throw new Error(`Could not initialise audio recording: ${error.message || error}`);
    }

    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.addEventListener('error', (event) => {
      this._error = event.error || new Error('The browser stopped the audio recording unexpectedly.');
      if (this._rejectStop) {
        this._rejectStop(this._error);
        this._rejectStop = null;
        this._resolveStop = null;
        this._cleanup();
      }
    });
    this.recorder.addEventListener('stop', () => this._finish());
  }

  get recording() {
    return this.state === 'recording';
  }

  start(timeslice = 1000) {
    if (this.state !== 'ready') throw new Error('This recorder has already been started.');
    try {
      this.recorder.start(timeslice);
      this.state = 'recording';
    } catch (error) {
      this._cleanup();
      this.state = 'error';
      throw new Error(`Could not start audio recording: ${error.message || error}`);
    }
    return true;
  }

  stop() {
    if (this._stopPromise) return this._stopPromise;
    if (this.state === 'stopped') return Promise.resolve(this.blob);
    if (this.state !== 'recording') return Promise.reject(new Error('There is no active audio recording.'));

    this.state = 'stopping';
    this._stopPromise = new Promise((resolve, reject) => {
      this._resolveStop = resolve;
      this._rejectStop = reject;
      try {
        if (this.recorder.state === 'inactive') this._finish();
        else this.recorder.stop();
      } catch (error) {
        this.state = 'error';
        this._rejectStop = null;
        this._resolveStop = null;
        this._cleanup();
        reject(error);
      }
    });
    return this._stopPromise;
  }

  _finish() {
    if (this.state === 'stopped' || this.state === 'error') return;
    if (this._error) {
      this.state = 'error';
      this._rejectStop?.(this._error);
      this._rejectStop = null;
      this._resolveStop = null;
      this._cleanup();
      return;
    }
    const type = this.recorder.mimeType || this.chunks[0]?.type || 'application/octet-stream';
    this.blob = new Blob(this.chunks, { type });
    this.state = 'stopped';
    this._cleanup();
    this._resolveStop?.(this.blob);
    this._resolveStop = null;
    this._rejectStop = null;
  }

  _cleanup() {
    try { this.source?.disconnect(this.destination); } catch { /* already disconnected */ }
    this.destination?.stream?.getTracks?.().forEach((track) => {
      try { track.stop(); } catch { /* track already stopped */ }
    });
  }

  async dispose() {
    if (this.recording) await this.stop();
    else this._cleanup();
  }
}
