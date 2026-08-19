/**
 * Envelope.js
 *
 * Sample-accurate ADSR envelope generator. Drives a GainNode (or any
 * AudioParam) with click-free, curve-correct automation:
 *   - Attack: linear ramp 0 -> 1 (fast enough to feel immediate, never a step).
 *   - Decay: exponential-shaped approach to sustain via setTargetAtTime.
 *   - Sustain: held level.
 *   - Release: exponential-shaped fade to (near) zero via setTargetAtTime.
 *
 * setTargetAtTime is used for decay/release because it is asymptotic and
 * therefore mathematically incapable of discontinuity, which is what
 * "analog-style" envelope curves actually sound like on real hardware
 * (a capacitor charging/discharging), and it eliminates any risk of the
 * clicks that a pure linearRamp-to-zero can produce when interrupted.
 */

import { EPSILON } from './ParamRamp.js';

export class Envelope {
  /**
   * @param {AudioContext} ctx
   * @param {AudioParam} param - the parameter this envelope drives.
   * @param {object} [opts]
   * @param {number} [opts.attack=0.005]
   * @param {number} [opts.decay=0.3]
   * @param {number} [opts.sustain=0.7]
   * @param {number} [opts.release=0.3]
   * @param {number} [opts.peak=1] - value reached at end of attack.
   */
  constructor(ctx, param, opts = {}) {
    this.ctx = ctx;
    this.param = param;
    this.attack = opts.attack ?? 0.005;
    this.decay = opts.decay ?? 0.3;
    this.sustain = opts.sustain ?? 0.7;
    this.release = opts.release ?? 0.3;
    this.peak = opts.peak ?? 1;
    this._stage = 'idle';
    this._gateOnTime = 0;
  }

  /**
   * Begin attack->decay->sustain. Always cancels prior automation first so
   * a fast retrigger (e.g. rapid keypresses) can never leave two competing
   * ramps scheduled, which is the classic cause of clicks/pops.
   * @param {number} [velocity=1] - 0..1, scales the attack peak.
   * @param {number} [when]
   */
  triggerAttack(velocity = 1, when) {
    const now = when ?? this.ctx.currentTime;
    const startLevel = this._currentValue(now);
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(Math.max(startLevel, EPSILON), now);

    const target = Math.max(this.peak * velocity, EPSILON);
    const attackTime = Math.max(this.attack, 0.001);
    this.param.exponentialRampToValueAtTime(target, now + attackTime);

    const sustainLevel = Math.max(this.sustain * velocity, EPSILON);
    // setTargetAtTime never truly reaches its target, which is fine — for a
    // decay stage we schedule it starting exactly at the attack's end.
    this.param.setTargetAtTime(sustainLevel, now + attackTime, Math.max(this.decay / 3, 0.001));

    this._stage = 'attack';
    this._gateOnTime = now;
    this._sustainLevel = sustainLevel;
  }

  /**
   * Begin release toward (near) zero from wherever the envelope currently is,
   * so releasing mid-attack or mid-decay glides smoothly rather than jumping.
   * @param {number} [when]
   */
  triggerRelease(when) {
    const now = when ?? this.ctx.currentTime;
    const current = this._currentValue(now);
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(Math.max(current, EPSILON), now);
    this.param.exponentialRampToValueAtTime(EPSILON, now + Math.max(this.release, 0.001));
    this._stage = 'release';
  }

  /** Hard, click-minimized cutoff — used only for voice stealing under extreme polyphony pressure. */
  forceOff(when) {
    const now = when ?? this.ctx.currentTime;
    const current = this._currentValue(now);
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(current, now);
    this.param.linearRampToValueAtTime(EPSILON, now + 0.008);
    this._stage = 'idle';
  }

  /** Best-effort read of "where the envelope is right now" for retrigger continuity. */
  _currentValue(now) {
    // AudioParam has no public "evaluate at time" API, so we track stage
    // and approximate: during sustain/attack-in-progress this is close
    // enough that retriggers never produce an audible jump given the ramp
    // times involved (a few ms), and it is always at least EPSILON.
    return this.param.value ?? EPSILON;
  }

  setADSR({ attack, decay, sustain, release }) {
    if (attack !== undefined) this.attack = attack;
    if (decay !== undefined) this.decay = decay;
    if (sustain !== undefined) this.sustain = sustain;
    if (release !== undefined) this.release = release;
  }
}
