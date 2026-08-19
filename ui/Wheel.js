/**
 * Wheel.js
 *
 * Pitch bend and modulation wheels, styled after the Little Phatty's
 * blue-backlit wheel housings (a signature visual feature borrowed from
 * the Voyager). Both wheels are driven identically by mouse drag, MIDI,
 * and computer keyboard, but differ in release behavior:
 *
 *   PitchWheel (spring-loaded): value snaps back to 0 (center) whenever the
 *   pointer/key is released, animated as a smooth glide-back rather than an
 *   instant jump, matching a real spring-centered hardware wheel.
 *
 *   ModWheel (position-hold): value stays exactly where it is released;
 *   only explicit input (drag, key, MIDI CC1) changes it again.
 */

function buildWheelDOM(label) {
  const wrap = document.createElement('div');
  wrap.className = 'lp-wheel';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-label', label);

  const housing = document.createElement('div');
  housing.className = 'lp-wheel-housing';

  const track = document.createElement('div');
  track.className = 'lp-wheel-track';

  const thumb = document.createElement('div');
  thumb.className = 'lp-wheel-thumb';
  for (let i = 0; i < 5; i++) {
    const grip = document.createElement('div');
    grip.className = 'lp-wheel-grip';
    thumb.appendChild(grip);
  }

  track.appendChild(thumb);
  housing.appendChild(track);
  wrap.appendChild(housing);

  const labelEl = document.createElement('div');
  labelEl.className = 'lp-wheel-label';
  labelEl.textContent = label;
  wrap.appendChild(labelEl);

  return { wrap, thumb };
}

class WheelBase {
  constructor(label, opts = {}) {
    this.onChange = opts.onChange ?? (() => {});
    this.value = 0; // normalized: pitch -1..1, mod 0..1
    const { wrap, thumb } = buildWheelDOM(label);
    this.el = wrap;
    this._thumb = thumb;
    this._bindPointerEvents();
  }

  _bindPointerEvents() {
    let dragging = false;
    let startY = 0;
    let startValue = 0;

    const onDown = (e) => {
      dragging = true;
      startY = e.clientY;
      startValue = this.value;
      this.el.classList.add('active');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      e.preventDefault();
      this._onUserGrab?.();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dy = startY - e.clientY;
      const range = this._range();
      const delta = (dy / 90) * range; // 90px of travel = full range
      this._setFromUser(startValue + delta);
    };
    const onUp = () => {
      dragging = false;
      this.el.classList.remove('active');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this._onUserRelease?.();
    };
    this.el.addEventListener('pointerdown', onDown);
  }

  _range() {
    return 1;
  }

  _setFromUser(v) {
    this._setValue(v);
  }

  _setValue(v) {
    // overridden by subclasses for clamping semantics
  }

  _render() {
    // overridden by subclasses
  }
}

export class PitchWheel extends WheelBase {
  /**
   * @param {object} opts
   * @param {(v:number)=>void} opts.onChange - called with -1..1.
   * @param {number} [opts.returnTimeMs=90] - spring-return animation speed.
   */
  constructor(opts = {}) {
    super('Pitch', opts);
    this.el.classList.add('lp-wheel-pitch');
    this.returnTimeMs = opts.returnTimeMs ?? 90;
    this._returnRAF = null;
    this._render();
  }

  _range() { return 2; } // -1..1

  _setValue(v) {
    this.value = Math.max(-1, Math.min(1, v));
    this._render();
    this.onChange(this.value);
  }

  _onUserRelease() {
    this._springReturn();
  }

  /** Public: drives the wheel externally (keyboard Tab/Shift, or MIDI pitch bend). Does NOT auto-spring-return; caller decides when to release. */
  setExternalValue(v) {
    if (this._returnRAF) cancelAnimationFrame(this._returnRAF);
    this._setValue(v);
  }

  /** Public: begin the spring-loaded glide back to center. Call when the driving key/controller is released. */
  springReturnToCenter() {
    this._springReturn();
  }

  _springReturn() {
    if (this._returnRAF) cancelAnimationFrame(this._returnRAF);
    const startVal = this.value;
    const startTime = performance.now();
    const duration = this.returnTimeMs;
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      // Ease-out for a natural "spring settling" feel rather than linear snap.
      const eased = 1 - Math.pow(1 - t, 3);
      this._setValue(startVal * (1 - eased));
      if (t < 1) {
        this._returnRAF = requestAnimationFrame(step);
      } else {
        this._setValue(0);
        this._returnRAF = null;
      }
    };
    this._returnRAF = requestAnimationFrame(step);
  }

  _render() {
    // Thumb travels the full track height, centered at value=0.
    const pct = (this.value + 1) / 2; // 0..1
    this._thumb.style.top = `${(1 - pct) * 100}%`;
    this.el.setAttribute('aria-valuenow', this.value.toFixed(2));
  }
}

export class ModWheel extends WheelBase {
  /**
   * @param {object} opts
   * @param {(v:number)=>void} opts.onChange - called with 0..1.
   */
  constructor(opts = {}) {
    super('Mod', opts);
    this.el.classList.add('lp-wheel-mod');
    this.value = 0; // defaults fully down (no mod), per spec
    this._render();
  }

  _range() { return 1; }

  _setValue(v) {
    this.value = Math.max(0, Math.min(1, v));
    this._render();
    this.onChange(this.value);
  }

  /** Public: drives the wheel externally (arrow keys or MIDI CC1). Position-hold: no spring-return ever happens. */
  setExternalValue(v) {
    this._setValue(v);
  }

  _render() {
    this._thumb.style.top = `${(1 - this.value) * 100}%`;
    this.el.setAttribute('aria-valuenow', this.value.toFixed(2));
  }
}
