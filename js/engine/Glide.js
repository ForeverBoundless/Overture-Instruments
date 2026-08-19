/**
 * Glide.js
 *
 * Legato-only portamento, matching the explicit correction given for this
 * build: glide only happens when a new key is pressed WHILE another key is
 * still physically held. If all keys are released, the glide state resets
 * completely, so the next note played from a fully-released keyboard starts
 * "cold" (no glide in), exactly like true analog portamento driven by a
 * single, unbroken control voltage that only moves while the previous gate
 * is still up.
 *
 * This module is deliberately just a time-constant calculator plus a
 * "should I glide this transition?" decision function; Voice.js/App.js
 * own the actual key-held-count bookkeeping and call into this.
 */

export class Glide {
  /**
   * @param {object} [opts]
   * @param {number} [opts.timeSec=0.15] - portamento time.
   * @param {'constantTime'|'constantRate'} [opts.mode='constantTime']
   */
  constructor(opts = {}) {
    this.timeSec = opts.timeSec ?? 0.15;
    this.mode = opts.mode ?? 'constantTime';
    this.enabled = true;
  }

  setTime(sec) {
    this.timeSec = Math.max(0, sec);
  }

  setMode(mode) {
    this.mode = mode;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Compute the actual glide duration to use for a given transition.
   * @param {number} fromHz - previous frequency (only meaningful if legato).
   * @param {number} toHz - new target frequency.
   * @param {boolean} isLegato - true only when at least one other key was
   *   already held down at the moment this new key was pressed.
   * @returns {number} seconds; 0 means "jump immediately, no glide."
   */
  timeFor(fromHz, toHz, isLegato) {
    if (!this.enabled || !isLegato || this.timeSec <= 0) return 0;

    if (this.mode === 'constantRate') {
      // Constant-rate: larger intervals take proportionally longer, glide
      // time scales with the interval size (in octaves) rather than being fixed.
      const octaves = Math.abs(Math.log2(toHz / fromHz));
      return this.timeSec * Math.max(octaves, 0.05) * 4;
    }
    // constantTime: every legato transition takes the same wall-clock time
    // regardless of interval size, which is how the Little Phatty's glide
    // control actually behaves.
    return this.timeSec;
  }

  /** setTargetAtTime uses a time CONSTANT, not a total duration; ~5 time
   * constants is a settle-to-99.3% convention, so we convert here.
   */
  timeConstantFor(durationSec) {
    return durationSec / 5;
  }
}
