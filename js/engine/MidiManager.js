/**
 * MidiManager.js
 *
 * Web MIDI input handling. Auto-detects and connects to any available MIDI
 * input the moment permission is granted, and re-scans on hot-plug
 * (statechange), so a controller connected mid-session is picked up without
 * requiring a page reload.
 *
 * Critically, this module is purely additive: it only ever calls the same
 * callback surface (onNoteOn/onNoteOff/onPitchBend/onModWheel/etc.) that
 * the computer-keyboard input path also calls in App.js. Nothing here can
 * disable or gate keyboard input - if no MIDI device is present, or the
 * browser lacks Web MIDI support, every method here simply never fires,
 * and the rest of the instrument is unaffected.
 */

const CC = {
  MOD_WHEEL: 1,
  VOLUME: 7,
  SUSTAIN: 64,
};

export class MidiManager {
  /**
   * @param {object} callbacks
   * @param {(midiNote:number, velocity:number)=>void} callbacks.onNoteOn
   * @param {(midiNote:number)=>void} callbacks.onNoteOff
   * @param {(semitoneRange:number, normalizedValue:number)=>void} callbacks.onPitchBend - normalizedValue is -1..1
   * @param {(value:number)=>void} callbacks.onModWheel - 0..1
   * @param {(down:boolean)=>void} callbacks.onSustain
   * @param {(programNumber:number)=>void} callbacks.onProgramChange
   * @param {(delta:number)=>void} callbacks.onOctaveChange - delta is +1 or -1, for controllers with dedicated octave buttons mapped via CC.
   * @param {(connected:boolean, deviceName:string)=>void} [callbacks.onConnectionChange]
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.inputs = new Map();
    this.pitchBendRangeSemitones = 2; // standard default MIDI pitch bend range
    this.supported = 'requestMIDIAccess' in navigator;
    this.access = null;
  }

  /** Begin MIDI detection. Safe to call even if the browser has no Web MIDI support. */
  async init() {
    if (!this.supported) {
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this._scanInputs();
      this.access.onstatechange = () => this._scanInputs();
      return true;
    } catch (err) {
      // Permission denied or unavailable - the instrument continues to work
      // perfectly from the computer keyboard regardless.
      return false;
    }
  }

  _scanInputs() {
    const seen = new Set();
    for (const input of this.access.inputs.values()) {
      seen.add(input.id);
      if (!this.inputs.has(input.id)) {
        input.onmidimessage = (msg) => this._handleMessage(msg);
        this.inputs.set(input.id, input);
        this.callbacks.onConnectionChange?.(true, input.name || 'MIDI Device');
      }
    }
    // Clean up disconnected devices.
    for (const id of this.inputs.keys()) {
      if (!seen.has(id)) {
        this.inputs.delete(id);
      }
    }
    if (this.inputs.size === 0) {
      this.callbacks.onConnectionChange?.(false, '');
    }
  }

  _handleMessage(msg) {
    const [status, d1, d2] = msg.data;
    const command = status & 0xf0;

    switch (command) {
      case 0x90: // Note On
        if (d2 === 0) {
          this.callbacks.onNoteOff?.(d1);
        } else {
          this.callbacks.onNoteOn?.(d1, d2 / 127);
        }
        break;
      case 0x80: // Note Off
        this.callbacks.onNoteOff?.(d1);
        break;
      case 0xe0: { // Pitch Bend (14-bit, d1=LSB d2=MSB)
        const raw = (d2 << 7) | d1; // 0..16383
        const normalized = (raw - 8192) / 8192; // -1..1
        this.callbacks.onPitchBend?.(this.pitchBendRangeSemitones, normalized);
        break;
      }
      case 0xb0: // Control Change
        this._handleCC(d1, d2);
        break;
      case 0xc0: // Program Change
        this.callbacks.onProgramChange?.(d1);
        break;
      case 0xd0: // Channel aftertouch
        this.callbacks.onAftertouch?.(d1 / 127);
        break;
      default:
        break;
    }
  }

  _handleCC(controller, value) {
    switch (controller) {
      case CC.MOD_WHEEL:
        this.callbacks.onModWheel?.(value / 127);
        break;
      case CC.SUSTAIN:
        this.callbacks.onSustain?.(value >= 64);
        break;
      case CC.VOLUME:
        this.callbacks.onVolume?.(value / 127);
        break;
      default:
        // Many controllers map octave up/down to unused CC numbers or
        // dedicated buttons that arrive as CC; common convention buttons
        // (e.g. many DAW-style controllers) send CC 0x5A/0x5B-ish device-
        // specific values, so we surface all unhandled CCs generically for
        // callers who want to MIDI-learn a specific controller's octave
        // buttons rather than guessing a single universal number.
        this.callbacks.onUnhandledCC?.(controller, value);
        break;
    }
  }

  setPitchBendRange(semitones) {
    this.pitchBendRangeSemitones = semitones;
  }

  get isConnected() {
    return this.inputs.size > 0;
  }

  get deviceNames() {
    return Array.from(this.inputs.values()).map((i) => i.name || 'MIDI Device');
  }
}
