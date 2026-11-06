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
    const attempt = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not supported in this browser.');
      const ctx = new AC({ latencyHint: 'interactive' }); this.ctx = ctx;
      try {
        if (!ctx.audioWorklet) throw new Error('AudioWorklet is unavailable (use a secure https:// page or localhost).');
        // Resume during the pointer gesture, before waiting for the worklet module fetch.
        const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
        await ctx.audioWorklet.addModule(this.moduleUrl);
        const node = new AudioWorkletNode(ctx, this.processorName, { numberOfInputs: this.inputs, numberOfOutputs: 1, outputChannelCount: [this.channels] });
        const output = ctx.createGain(); node.connect(output); output.connect(ctx.destination);
        await resume;
        this.node = node; this.output = output; this.started = true;
        this._queue.forEach((message) => node.port.postMessage(message)); this._queue = [];
        return true;
      } catch (error) {
        this.started = false;
        try { this.node?.disconnect(); } catch {}
        try { this.output?.disconnect(); } catch {}
        this.node = null; this.output = null;
        if (ctx.state !== 'closed') { try { await ctx.close(); } catch {} }
        if (this.ctx === ctx) this.ctx = null;
        throw error;
      }
    })();
    this._starting = attempt;
    attempt.finally(() => { if (this._starting === attempt) this._starting = null; }).catch(() => {});
    return attempt;
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
