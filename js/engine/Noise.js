/**
 * Noise.js
 *
 * White and pink noise sources. Web Audio has no built-in noise generator,
 * so both are synthesized into a short looping AudioBuffer once at startup
 * and shared across all voices via BufferSourceNodes (cheap to instantiate,
 * avoids per-voice noise-buffer allocation which would otherwise be a
 * garbage-collection and CPU cost under polyphony).
 */

const NOISE_BUFFER_SECONDS = 4; // long enough that looping isn't audible as periodicity

let sharedWhiteBuffer = null;
let sharedPinkBuffer = null;

function buildWhiteBuffer(ctx) {
  const length = ctx.sampleRate * NOISE_BUFFER_SECONDS;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function buildPinkBuffer(ctx) {
  // Paul Kellet's refined pink noise filter - standard, efficient approximation.
  const length = ctx.sampleRate * NOISE_BUFFER_SECONDS;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11; // scale down, unfiltered sum runs hot
  }
  return buffer;
}

export class NoiseSource {
  /**
   * @param {AudioContext} ctx
   * @param {'white'|'pink'} [type='white']
   */
  constructor(ctx, type = 'white') {
    this.ctx = ctx;
    this.type = type;
    this.output = ctx.createGain();
    this.output.gain.value = 0;

    if (!sharedWhiteBuffer) sharedWhiteBuffer = buildWhiteBuffer(ctx);
    if (!sharedPinkBuffer) sharedPinkBuffer = buildPinkBuffer(ctx);

    this._source = null;
    this._started = false;
  }

  start(when) {
    if (this._started) return;
    this._started = true;
    this._source = this.ctx.createBufferSource();
    this._source.buffer = this.type === 'pink' ? sharedPinkBuffer : sharedWhiteBuffer;
    this._source.loop = true;
    // Random start offset so simultaneously-triggered voices don't share
    // identical noise phase (would otherwise correlate and thin the sound).
    this._source.loopStart = 0;
    this._source.loopEnd = this._source.buffer.duration;
    this._source.connect(this.output);
    const offset = Math.random() * (this._source.buffer.duration - 0.1);
    this._source.start(when ?? this.ctx.currentTime, offset);
  }

  stop(when) {
    if (!this._started || !this._source) return;
    try { this._source.stop(when ?? this.ctx.currentTime); } catch (e) { /* already stopped */ }
    this._started = false;
  }

  setLevel(v) {
    this._level = v;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(v, now, 0.005);
  }

  setType(type) {
    this.type = type;
  }

  connect(dest) {
    this.output.connect(dest);
    return dest;
  }

  disconnect() {
    this.output.disconnect();
  }
}
