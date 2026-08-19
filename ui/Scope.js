/**
 * Scope.js
 *
 * Real-time oscilloscope: draws the master output waveform to a canvas via
 * an AnalyserNode in time-domain mode. Supports freeze (pauses the draw
 * loop without disconnecting audio) and adjustable time scale (by changing
 * the analyser's fftSize, which changes how many samples/how much time the
 * captured buffer spans).
 */

export class Scope {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} sourceNode - node to tap (connected in parallel, doesn't affect main signal path).
   */
  constructor(ctx, sourceNode) {
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    sourceNode.connect(this.analyser);

    this._buffer = new Float32Array(this.analyser.fftSize);
    this.frozen = false;
    this._rafId = null;

    this.el = document.createElement('canvas');
    this.el.className = 'lp-scope';
    this._ctx2d = this.el.getContext('2d');

    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObserver.observe(this.el);
  }

  _resizeCanvas() {
    const rect = this.el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.el.width = Math.max(1, rect.width * dpr);
    this.el.height = Math.max(1, rect.height * dpr);
  }

  setTimeScale(fftSize) {
    // Must be a power of 2 between 32 and 32768 per Web Audio spec.
    this.analyser.fftSize = fftSize;
    this._buffer = new Float32Array(fftSize);
  }

  setFrozen(frozen) {
    this.frozen = frozen;
  }

  start() {
    const draw = () => {
      if (!this.frozen) {
        this.analyser.getFloatTimeDomainData(this._buffer);
        this._draw();
      }
      this._rafId = requestAnimationFrame(draw);
    };
    draw();
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _draw() {
    const c = this._ctx2d;
    const w = this.el.width;
    const h = this.el.height;
    c.clearRect(0, 0, w, h);

    // Grid
    c.strokeStyle = 'rgba(255,159,10,0.08)';
    c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }

    c.strokeStyle = '#ffb347';
    c.lineWidth = 2;
    c.beginPath();
    const step = w / this._buffer.length;
    for (let i = 0; i < this._buffer.length; i++) {
      const x = i * step;
      const y = h / 2 + this._buffer[i] * (h / 2) * 0.9;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
}
