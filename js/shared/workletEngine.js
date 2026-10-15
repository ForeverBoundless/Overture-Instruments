/**
 * workletEngine.js - base class for the AudioWorklet-based instruments.
 * Owns the AudioContext and node, queues messages sent before start(), and
 * provides a shared performance-message API.
 */
export class WorkletEngine {
  constructor(moduleUrl, processorName, { channels = 2, inputs = 0 } = {}) {
    this.inputs = inputs;
    this.moduleUrl = moduleUrl;
    this.processorName = processorName;
    this.channels = channels;
    this.ctx = null;
    this.node = null;
    this.output = null;
    this.started = false;
    this._starting = null;
    this._queue = [];
  }

  start() {
    if (this.started) return Promise.resolve(true);
    if (this._starting) return this._starting;
    this._starting = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not supported in this browser.');
      this.ctx = new AC({ latencyHint: 'interactive' });
      if (!this.ctx.audioWorklet) throw new Error('AudioWorklet is unavailable (use a secure https:// page or localhost).');
      const resume = this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
      await this.ctx.audioWorklet.addModule(this.moduleUrl);
      this.node = new AudioWorkletNode(this.ctx, this.processorName, { numberOfInputs: this.inputs, numberOfOutputs: 1, outputChannelCount: [this.channels] });
      this.output = this.ctx.createGain();
      this.node.connect(this.output);
      this.output.connect(this.ctx.destination);
      await resume;
      this.started = true;
      this._queue.forEach((m) => this.node.port.postMessage(m));
      this._queue = [];
      return true;
    })();
    this._starting.catch(() => { this._starting = null; });
    return this._starting;
  }

  post(message) {
    if (this.node) this.node.port.postMessage(message);
    else if (message.t !== 'noteOn' && message.t !== 'noteOff') this._queue.push(message);
  }

  noteOn(note, vel) { this.post({ t: 'noteOn', note, vel }); }
  noteOff(note) { this.post({ t: 'noteOff', note }); }
  setPitchBend(v) { this.post({ t: 'bend', value: v }); }
  setModWheel(v) { this.post({ t: 'mod', value: v }); }
  setAftertouch(v) { this.post({ t: 'at', value: v }); }
  setSustain(d) { this.post({ t: 'sustain', down: d }); }
  setVolume(v) { this.post({ t: 'volume', value: v }); }
  allNotesOff() { this.post({ t: 'allOff' }); }
  allSoundOff() { this.post({ t: 'allSoundOff' }); }
}
