/**
 * Spectrum.js
 *
 * FFT spectrum analyzer: draws frequency-domain magnitude to canvas with a
 * logarithmic frequency axis (matching how humans perceive pitch/frequency
 * spacing, and how hardware analyzers are typically scaled) and peak-hold
 * markers that decay slowly over time.
 */

export class Spectrum {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} sourceNode
   */
  constructor(ctx, sourceNode) {
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -10;
    sourceNode.connect(this.analyser);

    this._bins = new Uint8Array(this.analyser.frequencyBinCount);
    this._peaks = new Float32Array(this.analyser.frequencyBinCount);

    this.el = document.createElement('canvas');
    this.el.className = 'lp-spectrum';
    this._ctx2d = this.el.getContext('2d');

    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObserver.observe(this.el);
    this._rafId = null;
  }

  _resizeCanvas() {
    const rect = this.el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.el.width = Math.max(1, rect.width * dpr);
    this.el.height = Math.max(1, rect.height * dpr);
  }

  start() {
    const draw = () => {
      this.analyser.getByteFrequencyData(this._bins);
      this._draw();
      this._rafId = requestAnimationFrame(draw);
    };
    draw();
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _freqForBin(i) {
    return (i * this.ctx.sampleRate) / this.analyser.fftSize / 2;
  }

  _xForFreq(freq, width) {
    const minF = 20;
    const maxF = this.ctx.sampleRate / 2;
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);
    const logF = Math.log10(Math.max(freq, minF));
    return ((logF - logMin) / (logMax - logMin)) * width;
  }

  _draw() {
    const c = this._ctx2d;
    const w = this.el.width;
    const h = this.el.height;
    c.clearRect(0, 0, w, h);

    const barCount = this._bins.length;
    c.fillStyle = 'rgba(255,159,10,0.55)';
    for (let i = 1; i < barCount; i++) {
      const freq = this._freqForBin(i);
      if (freq > this.ctx.sampleRate / 2) break;
      const x = this._xForFreq(freq, w);
      const nextX = this._xForFreq(this._freqForBin(i + 1), w);
      const barWidth = Math.max(1, nextX - x);
      const magnitude = this._bins[i] / 255;
      const barHeight = magnitude * h;
      c.fillRect(x, h - barHeight, barWidth, barHeight);

      // Peak hold: rises instantly, decays slowly.
      if (magnitude > this._peaks[i]) {
        this._peaks[i] = magnitude;
      } else {
        this._peaks[i] = Math.max(0, this._peaks[i] - 0.006);
      }
      const peakY = h - this._peaks[i] * h;
      c.fillStyle = '#ffd07a';
      c.fillRect(x, peakY - 1.5, barWidth, 1.5);
      c.fillStyle = 'rgba(255,159,10,0.55)';
    }
  }
}
