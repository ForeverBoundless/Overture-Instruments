/**
 * Knob.js
 *
 * A realistic hardware-style rotary knob rendered in SVG: a fluted dark
 * knob body, a bright indicator line, and a surrounding LED ring that fills
 * proportionally to value (matching the Little Phatty's signature "one
 * knob + LED ring" parameter display).
 *
 * Interaction:
 *   - drag vertically (or radially) to change value
 *   - mouse wheel to nudge
 *   - double-click to reset to default
 *   - right-click(+drag) for fine adjustment (10x reduced sensitivity)
 *   - fully keyboard-accessible (arrow keys when focused, since it's a
 *     real <button>-rooted, tabindexed element with ARIA slider role)
 */

const MIN_ANGLE = -132; // degrees, matches typical hardware knob sweep
const MAX_ANGLE = 132;
const LED_COUNT = 15; // ring segments, echoing the Little Phatty's LED-ring value display

let uidCounter = 0;

export class Knob {
  /**
   * @param {object} opts
   * @param {number} [opts.min=0]
   * @param {number} [opts.max=1]
   * @param {number} [opts.value] - initial value, defaults to min.
   * @param {number} [opts.defaultValue] - value restored on double-click.
   * @param {string} opts.label
   * @param {(v:number)=>void} opts.onChange
   * @param {boolean} [opts.bipolar=false] - if true, LED ring fills from center rather than from the minimum.
   * @param {(v:number)=>string} [opts.formatValue] - for the tooltip/aria display text.
   * @param {number} [opts.size=54] - knob diameter in px.
   */
  constructor(opts) {
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 1;
    this.value = opts.value ?? this.min;
    this.defaultValue = opts.defaultValue ?? this.value;
    this.label = opts.label ?? '';
    this.onChange = opts.onChange ?? (() => {});
    this.bipolar = opts.bipolar ?? false;
    this.formatValue = opts.formatValue ?? ((v) => v.toFixed(2));
    this.size = opts.size ?? 54;

    this.uid = `knob-${uidCounter++}`;
    this.el = this._buildDOM();
    this._bindEvents();
    this._render();
  }

  _buildDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'lp-knob';
    wrap.style.setProperty('--knob-size', `${this.size}px`);
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'slider');
    wrap.setAttribute('aria-label', this.label);
    wrap.setAttribute('aria-valuemin', this.min);
    wrap.setAttribute('aria-valuemax', this.max);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.classList.add('lp-knob-svg');

    // Radial gradient def for the knob body's machined-metal shading.
    // (SVG `fill` cannot take a raw CSS radial-gradient() - it needs a
    // reference to a <radialGradient> defined here, which is why this
    // lives in JS rather than knobs.css.)
    const defs = document.createElementNS(svgNS, 'defs');
    const gradId = `${this.uid}-body-grad`;
    const grad = document.createElementNS(svgNS, 'radialGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('cx', '35%');
    grad.setAttribute('cy', '30%');
    grad.setAttribute('r', '75%');
    const stops = [
      ['0%', '#46474d'],
      ['55%', '#26272b'],
      ['100%', '#141518'],
    ];
    stops.forEach(([offset, color]) => {
      const stop = document.createElementNS(svgNS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);
    this._bodyGradId = gradId;

    // LED ring track (dim, always visible).
    const ringTrack = document.createElementNS(svgNS, 'path');
    ringTrack.classList.add('lp-knob-ring-track');
    ringTrack.setAttribute('d', this._arcPath(MIN_ANGLE, MAX_ANGLE, 44));
    svg.appendChild(ringTrack);

    // LED ring fill (lit segments), built as discrete segments to match
    // the hardware's actual discrete-LED ring rather than a smooth arc.
    const ringGroup = document.createElementNS(svgNS, 'g');
    ringGroup.classList.add('lp-knob-ring-leds');
    this._ledEls = [];
    for (let i = 0; i < LED_COUNT; i++) {
      const t = i / (LED_COUNT - 1);
      const angle = MIN_ANGLE + t * (MAX_ANGLE - MIN_ANGLE);
      const dot = document.createElementNS(svgNS, 'circle');
      const rad = (angle - 90) * (Math.PI / 180);
      const r = 44;
      dot.setAttribute('cx', 50 + r * Math.cos(rad));
      dot.setAttribute('cy', 50 + r * Math.sin(rad));
      dot.setAttribute('r', 2.6);
      dot.classList.add('lp-knob-led');
      ringGroup.appendChild(dot);
      this._ledEls.push(dot);
    }
    svg.appendChild(ringGroup);

    // Knob body: fluted dark disc.
    const body = document.createElementNS(svgNS, 'circle');
    body.setAttribute('cx', 50);
    body.setAttribute('cy', 50);
    body.setAttribute('r', 30);
    body.setAttribute('fill', `url(#${gradId})`);
    body.classList.add('lp-knob-body');
    svg.appendChild(body);

    // Flutes (small radial grooves around the body edge for a machined look).
    const fluteGroup = document.createElementNS(svgNS, 'g');
    fluteGroup.classList.add('lp-knob-flutes');
    const fluteCount = 24;
    for (let i = 0; i < fluteCount; i++) {
      const a = (i / fluteCount) * 360 * (Math.PI / 180);
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', 50 + 26 * Math.cos(a));
      line.setAttribute('y1', 50 + 26 * Math.sin(a));
      line.setAttribute('x2', 50 + 29.5 * Math.cos(a));
      line.setAttribute('y2', 50 + 29.5 * Math.sin(a));
      line.classList.add('lp-knob-flute');
      fluteGroup.appendChild(line);
    }
    svg.appendChild(fluteGroup);

    // Indicator line (rotates with value) with a small pointer cap.
    this._pointerGroup = document.createElementNS(svgNS, 'g');
    this._pointerGroup.classList.add('lp-knob-pointer-group');
    const pointer = document.createElementNS(svgNS, 'line');
    pointer.setAttribute('x1', 50);
    pointer.setAttribute('y1', 50);
    pointer.setAttribute('x2', 50);
    pointer.setAttribute('y2', 24);
    pointer.classList.add('lp-knob-pointer');
    this._pointerGroup.appendChild(pointer);
    const pointerDot = document.createElementNS(svgNS, 'circle');
    pointerDot.setAttribute('cx', 50);
    pointerDot.setAttribute('cy', 24);
    pointerDot.setAttribute('r', 2.2);
    pointerDot.classList.add('lp-knob-pointer-dot');
    this._pointerGroup.appendChild(pointerDot);
    svg.appendChild(this._pointerGroup);

    // Center cap highlight for a subtle machined-metal specular look.
    const cap = document.createElementNS(svgNS, 'circle');
    cap.setAttribute('cx', 50);
    cap.setAttribute('cy', 50);
    cap.setAttribute('r', 6);
    cap.classList.add('lp-knob-cap');
    svg.appendChild(cap);

    wrap.appendChild(svg);

    const labelEl = document.createElement('div');
    labelEl.className = 'lp-knob-label';
    labelEl.textContent = this.label;
    wrap.appendChild(labelEl);

    this._wrap = wrap;
    this._svg = svg;
    return wrap;
  }

  _arcPath(startDeg, endDeg, r) {
    const toXY = (deg) => {
      const rad = (deg - 90) * (Math.PI / 180);
      return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
    };
    const [sx, sy] = toXY(startDeg);
    const [ex, ey] = toXY(endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
  }

  _bindEvents() {
    let dragging = false;
    let fineMode = false;
    let startY = 0;
    let startValue = 0;

    const range = this.max - this.min;

    const onPointerDown = (e) => {
      dragging = true;
      fineMode = e.button === 2;
      startY = e.clientY;
      startValue = this.value;
      this._wrap.classList.add('lp-knob-dragging');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const dy = startY - e.clientY;
      const sensitivity = fineMode ? 0.0025 : 0.01; // right-drag = fine adjustment (10x reduced, roughly)
      const delta = dy * sensitivity * range;
      this.setValue(startValue + delta);
    };

    const onPointerUp = () => {
      dragging = false;
      this._wrap.classList.remove('lp-knob-dragging');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    this._wrap.addEventListener('pointerdown', onPointerDown);
    this._wrap.addEventListener('contextmenu', (e) => e.preventDefault());

    this._wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = range * 0.02 * (e.deltaY > 0 ? -1 : 1);
      this.setValue(this.value + step);
    }, { passive: false });

    this._wrap.addEventListener('dblclick', () => {
      this.setValue(this.defaultValue);
    });

    this._wrap.addEventListener('keydown', (e) => {
      const step = range * 0.02;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { this.setValue(this.value + step); e.preventDefault(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { this.setValue(this.value - step); e.preventDefault(); }
      if (e.key === 'Home') { this.setValue(this.min); e.preventDefault(); }
      if (e.key === 'End') { this.setValue(this.max); e.preventDefault(); }
    });
  }

  setValue(v, silent = false) {
    const clamped = Math.min(this.max, Math.max(this.min, v));
    this.value = clamped;
    this._render();
    if (!silent) this.onChange(clamped);
  }

  _render() {
    const t = (this.value - this.min) / (this.max - this.min);
    const angle = MIN_ANGLE + t * (MAX_ANGLE - MIN_ANGLE);
    this._pointerGroup.setAttribute('transform', `rotate(${angle} 50 50)`);

    this._wrap.setAttribute('aria-valuenow', this.value.toFixed(3));
    this._wrap.setAttribute('aria-valuetext', this.formatValue(this.value));
    this._wrap.title = `${this.label}: ${this.formatValue(this.value)}`;

    // Light LEDs up to current position; bipolar params light from the
    // center LED outward in either direction instead of from the start.
    if (this.bipolar) {
      const centerIdx = (LED_COUNT - 1) / 2;
      const litIdx = t * (LED_COUNT - 1);
      this._ledEls.forEach((dot, i) => {
        const lit = t >= 0.5 ? (i >= centerIdx && i <= litIdx) : (i <= centerIdx && i >= litIdx);
        dot.classList.toggle('lit', lit);
      });
    } else {
      const litCount = Math.round(t * (LED_COUNT - 1));
      this._ledEls.forEach((dot, i) => dot.classList.toggle('lit', i <= litCount));
    }
  }
}
