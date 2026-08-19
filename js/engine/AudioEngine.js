/**
 * AudioEngine.js
 *
 * Owns the AudioContext and assembles the full signal path for this
 * monophonic instrument: one Voice, one shared LFO (routable to multiple
 * destinations simultaneously), Glide/legato logic, and a master bus with
 * a limiter so nothing downstream can ever clip regardless of how
 * aggressively drive/resonance/mix are set.
 *
 * Monophonic note-priority behavior (last-note priority with held-note
 * stack) lives here, since it is fundamentally about *when* to call
 * Voice.noteOn/noteOff/glideToNote, not about DSP.
 */

import { Voice, noteNameToMidi, midiToFreq } from './Voice.js';
import { LFO } from './LFO.js';
import { Glide } from './Glide.js';
import { setImmediate } from './ParamRamp.js';

function makeSoftSaturationCurve(amount = 1.5, size = 1024) {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.voice = null;
    this.masterGain = null;
    this.masterColorTrim = null;
    this.masterColor = null;
    this.limiter = null;
    this.started = false;

    this.glide = new Glide({ timeSec: 0.15 });
    this._heldNotes = []; // stack of {note, octaveShift, semitoneShift}, most recent last
    this._sustainDown = false;
    this._sustainedNotes = new Set();

    this._octaveShift = 0;
    this._semitoneShift = 0;

    this._pitchBendSemitones = 2;
    this._pitchBendNormalized = 0; // -1..1

    this.lfos = {};
    this._lfoDestinations = new Map(); // name -> {node, connectFn}
  }

  /** Must be called from a user gesture (click) per browser autoplay policy. */
  async start() {
    if (this.started) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.25;

    this.masterColorTrim = this.ctx.createGain();
    this.masterColorTrim.gain.value = 1.05;
    this.masterColor = this.ctx.createWaveShaper();
    this.masterColor.curve = makeSoftSaturationCurve(1.35);
    this.masterColor.oversample = '2x';

    // A DynamicsCompressorNode used purely as a safety limiter (fast attack,
    // near-infinite ratio feel) so the combination of drive + resonance +
    // full mixer never produces a harsh digital clip at the output, matching
    // the "no clipping" requirement while still letting the filter's own
    // saturation stage do its intended analog-style coloring upstream.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.15;

    this.masterGain.connect(this.masterColorTrim);
    this.masterColorTrim.connect(this.masterColor);
    this.masterColor.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.voice = new Voice(this.ctx);
    this.voice.connect(this.masterGain);

    this._buildLFOs();

    this.started = true;
  }

  _buildLFOs() {
    // A single primary LFO, matching the Little Phatty's one-LFO architecture,
    // simultaneously routable to multiple destinations (each destination has
    // its own depth gain so they can have independent amounts while sharing
    // one rate/waveform/phase, which is exactly how the hardware's LFO works).
    const lfo = new LFO(this.ctx);
    lfo.start();
    this.lfos.main = lfo;

    this._lfoDepths = {
      pitch: this.ctx.createGain(),
      filter: this.ctx.createGain(),
      pulseWidth: this.ctx.createGain(),
      mix: this.ctx.createGain(),
      amplitude: this.ctx.createGain(),
    };
    Object.values(this._lfoDepths).forEach((g) => { g.gain.value = 0; });

    lfo.output.connect(this._lfoDepths.pitch);
    lfo.output.connect(this._lfoDepths.filter);
    lfo.output.connect(this._lfoDepths.pulseWidth);
    lfo.output.connect(this._lfoDepths.mix);
    lfo.output.connect(this._lfoDepths.amplitude);

    this.voice.connectLFOToPitch(this._lfoDepths.pitch);
    this.voice.connectLFOToFilter(this._lfoDepths.filter);
    this.voice.connectLFOToPulseWidth(this._lfoDepths.pulseWidth);
    this.voice.connectLFOToMix(this._lfoDepths.mix);
    this.voice.connectLFOToAmplitude(this._lfoDepths.amplitude);
  }

  setLFODestinationAmount(destination, amount) {
    const map = {
      pitch: 40,        // max cents of pitch wobble
      filter: 3000,      // max Hz swing
      pulseWidth: 30,   // max cents-equivalent width swing
      mix: 0.5,          // max mix crossfade swing
      amplitude: 0.4,    // max tremolo depth
    };
    const scale = map[destination] ?? 1;
    if (this._lfoDepths[destination]) {
      setImmediate(this._lfoDepths[destination].gain, amount * scale, this.ctx);
    }
  }

  setLFORate(hz) { this.lfos.main.setRate(hz); }
  setLFOWaveform(type) { this.lfos.main.setWaveform(type); }
  setLFOFadeIn(sec) { this.lfos.main.setFadeInTime(sec); }
  setLFORetrigger(enabled) { this.lfos.main.setRetrigger(enabled); }

  // --- Note handling with legato-only glide + last-note priority + sustain ---

  /**
   * @param {string} noteName - e.g. "C4"
   * @param {number} [velocity=1]
   */
  noteOn(noteName, velocity = 1) {
    if (!this.started) return;

    const wasAnyHeld = this._heldNotes.length > 0;

    // Remove any existing entry for this note first (defends against stuck
    // key-repeat edge cases), then push as the new most-recent note.
    this._heldNotes = this._heldNotes.filter((n) => n.note !== noteName);
    this._heldNotes.push({ note: noteName, octaveShift: this._octaveShift, semitoneShift: this._semitoneShift });

    if (!wasAnyHeld) {
      // Nothing was held: this is a fresh trigger, portamento resets and
      // does NOT glide in, exactly as specified. A fresh trigger is also
      // the correct moment to retrigger the LFO's phase/fade-in, if the
      // LFO's retrigger mode is enabled (no-ops otherwise).
      this.lfos.main?.retriggerNow();
      this.voice.noteOn(noteName, velocity, 0, this._octaveShift, this._semitoneShift);
    } else {
      // Legato: another key was already down when this one was pressed, so
      // glide from the currently sounding pitch to the new one and do NOT
      // re-trigger the envelopes (real analog legato behavior).
      const glideDur = this.glide.timeFor(this.voice._currentFreq, midiToFreq(noteNameToMidi(noteName) + this._octaveShift * 12 + this._semitoneShift), true);
      const tc = Math.max(0.003, Math.min(0.08, this.glide.timeConstantFor(glideDur)));
      this.voice.glideToNote(noteName, tc, this._octaveShift, this._semitoneShift);
    }
  }

  noteOff(noteName) {
    if (!this.started) return;

    if (this._sustainDown) {
      // Under sustain, a note-off doesn't remove it from the audible/held
      // stack for glide purposes until the pedal is released, matching how
      // a real sustain pedal keeps the note voiced.
      this._sustainedNotes.add(noteName);
      return;
    }

    this._releaseNote(noteName);
  }

  _releaseNote(noteName) {
    const wasTop = this._heldNotes.length > 0 && this._heldNotes[this._heldNotes.length - 1].note === noteName;
    this._heldNotes = this._heldNotes.filter((n) => n.note !== noteName);

    if (this._heldNotes.length === 0) {
      // Everything released: portamento fully resets (per spec), and the
      // voice's envelopes begin release.
      this.voice.noteOff();
      return;
    }

    if (wasTop) {
      // The note that was actually sounding was released while others are
      // still held: glide (legato) to the next most-recently-held note,
      // without re-triggering envelopes, matching last-note monophonic priority.
      const next = this._heldNotes[this._heldNotes.length - 1];
      const glideDur = this.glide.timeFor(this.voice._currentFreq, midiToFreq(noteNameToMidi(next.note) + next.octaveShift * 12 + next.semitoneShift), true);
      const tc = Math.max(0.003, Math.min(0.08, this.glide.timeConstantFor(glideDur)));
      this.voice.glideToNote(next.note, tc, next.octaveShift, next.semitoneShift);
    }
    // If a lower-priority (non-sounding) held note was released, the
    // currently sounding note is unaffected.
  }

  setSustain(down) {
    this._sustainDown = down;
    if (!down) {
      const toRelease = Array.from(this._sustainedNotes);
      this._sustainedNotes.clear();
      toRelease.forEach((n) => this._releaseNote(n));
    }
  }

  allNotesOff() {
    this._heldNotes = [];
    this._sustainedNotes.clear();
    this._sustainDown = false;
    if (this.voice) this.voice.noteOff();
  }

  // --- Octave / semitone transpose (affects notes played AFTER the change, and re-pitches any currently held note) ---

  setOctaveShift(shift) {
    this._octaveShift = Math.max(-3, Math.min(3, shift));
    this._repitchHeldTop();
  }

  getOctaveShift() {
    return this._octaveShift;
  }

  _repitchHeldTop() {
    if (this._heldNotes.length === 0) return;
    const top = this._heldNotes[this._heldNotes.length - 1];
    top.octaveShift = this._octaveShift;
    top.semitoneShift = this._semitoneShift;
    // Immediate re-pitch, no glide - octave switching should feel instant, not portamento.
    this.voice.glideToNote(top.note, 0, this._octaveShift, this._semitoneShift);
  }

  // --- Pitch bend (spring-loaded) & mod wheel (held) ---

  /** @param {number} normalized - -1..1, already spring-return-animated by the caller (UI or MIDI). */
  setPitchBend(normalized) {
    this._pitchBendNormalized = normalized;
    if (!this.voice) return;
    const cents = normalized * this._pitchBendSemitones * 100;
    this.voice.setPitchBendCents(cents);
  }

  setPitchBendRangeSemitones(semi) {
    this._pitchBendSemitones = semi;
    this.setPitchBend(this._pitchBendNormalized);
  }

  /** @param {number} amount - 0..1 */
  setModWheel(amount) {
    // Mod wheel amount scales the LFO's overall depth on whichever
    // destinations are currently routed - modeled as a master multiplier so
    // per-destination amounts (set via setLFODestinationAmount) stay intact
    // and the mod wheel simply scales all of them together, matching how
    // hardware mod wheels work as a single macro control.
    this._modWheelAmount = amount;
    Object.keys(this._lfoDepths || {}).forEach((dest) => {
      const base = this._lfoDestinationBaseAmounts?.[dest] ?? 0;
      this.setLFODestinationAmount(dest, base * amount);
    });
  }

  /** Called by UI when a destination's knob changes, so mod wheel scaling has a base to work from. */
  setLFODestinationBaseAmount(destination, amount) {
    if (!this._lfoDestinationBaseAmounts) this._lfoDestinationBaseAmounts = {};
    this._lfoDestinationBaseAmounts[destination] = amount;
    const wheelScale = this._modWheelAmount ?? 0;
    this.setLFODestinationAmount(destination, amount * wheelScale);
  }

  setMasterVolume(v) {
    if (!this.masterGain) return;
    setImmediate(this.masterGain.gain, v, this.ctx);
  }
}
