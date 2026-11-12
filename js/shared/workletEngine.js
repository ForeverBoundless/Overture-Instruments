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
    this.processorError = null;
    this.onProcessorError = null;
  }

  start() {
    if (this._starting) return this._starting;
    if (this.started && this.ctx?.state === 'running' && !this.processorError) return Promise.resolve(true);
    // AudioContext can be suspended by browser policy after initial activation.
    // Resume it synchronously from the new trusted power-button gesture instead
    // of treating the old "started" flag as proof that sound is still available.
    if (this.started && this.ctx?.state === 'suspended' && !this.processorError) {
      const ctx = this.ctx;
      const resumeAttempt = ctx.resume().then(() => {
        if (ctx.state !== 'running') throw new Error('The browser suspended audio again. Check this site\'s sound permissions and press Power once more.');
        return true;
      }).catch((error) => {
        this.started = false;
        throw error;
      });
      this._starting = resumeAttempt;
      resumeAttempt.finally(() => { if (this._starting === resumeAttempt) this._starting = null; }).catch(() => {});
      return resumeAttempt;
    }
    const attempt = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not supported in this browser.');
      // Dispose of a stale or failed graph before rebuilding it. Do not await
      // close() before constructing the new context: construction and resume
      // must happen inside the trusted user gesture.
      const oldCtx = this.ctx;
      try { this.node?.disconnect(); } catch {}
      try { this.output?.disconnect(); } catch {}
      if (oldCtx && oldCtx.state !== 'closed') { try { void oldCtx.close(); } catch {} }
      this.node = null; this.output = null; this.started = false;
      const ctx = new AC({ latencyHint: 'interactive' }); this.ctx = ctx;
      try {
        if (!ctx.audioWorklet) throw new Error('AudioWorklet is unavailable (use a secure https:// page or localhost).');
        // Call resume immediately inside the user's trusted gesture. Load the
        // processor at the same time, then verify the browser actually resumed.
        const resume = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
        await Promise.all([ctx.audioWorklet.addModule(this.moduleUrl), resume]);
        if (ctx.state !== 'running') {
          await ctx.resume();
        }
        if (ctx.state !== 'running') {
          throw new Error('The browser kept the audio engine suspended. Check site sound permissions and try Power again.');
        }
        const node = new AudioWorkletNode(ctx, this.processorName, { numberOfInputs: this.inputs, numberOfOutputs: 1, outputChannelCount: [this.channels] });
        const output = ctx.createGain();
        output.gain.value = 1;
        node.connect(output);
        output.connect(ctx.destination);
        node.addEventListener('processorerror', () => {
          this.processorError = new Error('The audio processor stopped unexpectedly. Press Power to rebuild the audio engine.');
          this.started = false;
          this.onProcessorError?.(this.processorError);
        });
        this.node = node; this.output = output; this.started = true;
        this.processorError = null;
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
