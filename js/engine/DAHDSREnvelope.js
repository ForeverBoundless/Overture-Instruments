/**
 * Delay-Attack-Hold-Decay-Sustain-Release envelope used by the Sub 37.
 * It uses AudioParam automation rather than animation timers for the sound
 * itself, so delay/hold stages stay sample-accurate even when the page is
 * under load. The timer is only used to request a new cycle in loop mode.
 */
import { EPSILON } from './ParamRamp.js';

export class DAHDSREnvelope {
  constructor(ctx, param, options = {}) {
    this.ctx = ctx;
    this.param = param;
    this.delay = options.delay ?? 0;
    this.attack = options.attack ?? 0.005;
    this.hold = options.hold ?? 0;
    this.decay = options.decay ?? 0.3;
    this.sustain = options.sustain ?? 0.7;
    this.release = options.release ?? 0.3;
    this.peak = options.peak ?? 1;
    this.loop = false;
    this._loopTimer = null;
    this._gate = false;
  }

  setDAHDSR(values = {}) {
    ['delay', 'attack', 'hold', 'decay', 'sustain', 'release'].forEach((key) => {
      if (values[key] !== undefined) this[key] = values[key];
    });
    if (values.loop !== undefined) this.loop = !!values.loop;
  }

  // Compatibility with the shared voice UI helpers.
  setADSR(values = {}) { this.setDAHDSR(values); }

  triggerAttack(velocity = 1, when = this.ctx.currentTime) {
    this._gate = true;
    this._clearLoop();
    const now = when;
    const target = Math.max(EPSILON, this.peak * velocity);
    const sustain = Math.max(EPSILON, this.sustain * velocity);
    const delayEnd = now + Math.max(0, this.delay);
    const attackEnd = delayEnd + Math.max(0.001, this.attack);
    const holdEnd = attackEnd + Math.max(0, this.hold);
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(Math.max(this.param.value || 0, EPSILON), now);
    this.param.setValueAtTime(EPSILON, now + 0.001);
    this.param.setValueAtTime(EPSILON, delayEnd);
    this.param.exponentialRampToValueAtTime(target, attackEnd);
    this.param.setValueAtTime(target, holdEnd);
    this.param.setTargetAtTime(sustain, holdEnd, Math.max(this.decay / 3, 0.001));
    if (this.loop && this._gate) {
      const cycleMs = Math.max(12, (this.delay + this.attack + this.hold + this.decay) * 1000);
      this._loopTimer = setTimeout(() => this.triggerAttack(velocity), cycleMs);
    }
  }

  triggerRelease(when = this.ctx.currentTime) {
    this._gate = false;
    this._clearLoop();
    const now = when;
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(Math.max(this.param.value || 0, EPSILON), now);
    this.param.exponentialRampToValueAtTime(EPSILON, now + Math.max(0.001, this.release));
  }

  _clearLoop() {
    if (this._loopTimer) clearTimeout(this._loopTimer);
    this._loopTimer = null;
  }
}
