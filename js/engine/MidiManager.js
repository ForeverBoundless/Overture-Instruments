/**
 * MidiManager.js
 *
 * Shared Web MIDI input layer for every instrument.
 *
 * - Connects to every available input when permission is granted and
 *   re-scans on hot-plug (statechange), including ports that disconnect and
 *   reconnect with the same id.
 * - Decodes all channel-voice messages (note on/off, polyphonic and channel
 *   pressure, control change, program change, pitch bend) and the system
 *   real-time messages used for clock sync (clock, start, continue, stop).
 * - Every callback receives the 1-based MIDI channel as its final argument so
 *   instruments can apply their own channel routing.
 * - Tracks Bank Select (CC0/CC32), 14-bit MSB/LSB controller pairs for the mod
 *   wheel, and RPN/NRPN parameter selection with Data Entry / Increment /
 *   Decrement, as defined by the MIDI 1.0 specification.
 *
 * It is purely additive: when Web MIDI is unavailable or permission is denied
 * nothing here fires, and computer-keyboard / mouse input keeps working.
 */

const CC = {
  BANK_MSB: 0,
  MOD_WHEEL: 1,
  DATA_ENTRY_MSB: 6,
  VOLUME: 7,
  EXPRESSION: 11,
  BANK_LSB: 32,
  MOD_WHEEL_LSB: 33,
  DATA_ENTRY_LSB: 38,
  SUSTAIN: 64,
  DATA_INCREMENT: 96,
  DATA_DECREMENT: 97,
  NRPN_LSB: 98,
  NRPN_MSB: 99,
  RPN_LSB: 100,
  RPN_MSB: 101,
  ALL_SOUND_OFF: 120,
  RESET_ALL_CONTROLLERS: 121,
  ALL_NOTES_OFF: 123,
};

const NULL_PARAM = 0x3fff;

function channelState() {
  return {
    bankMsb: 0,
    bankLsb: 0,
    modMsb: 0,
    paramType: null, // 'rpn' | 'nrpn'
    rpn: NULL_PARAM,
    nrpn: NULL_PARAM,
    dataMsb: 0,
    dataLsb: 0,
  };
}

export class MidiManager {
  /**
   * Global hooks shared by every instance (used by shared/midiMap.js so one
   * MIDI access can serve both the instrument and user CC assignments).
   * ccListeners: (controller, value, channel, deviceName) => boolean; return
   * true to consume the CC so the instrument's built-in CC handling is skipped.
   */
  static instances = new Set();
  static ccListeners = new Set();
  static connectionListeners = new Set();
  static get connectedNames() {
    const names = new Set();
    for (const m of MidiManager.instances) m.deviceNames.forEach((n) => names.add(n));
    return [...names];
  }

  /**
   * @param {object} callbacks
   * @param {(note:number, velocity:number, channel:number, rawVelocity:number)=>void} [callbacks.onNoteOn] velocity 0..1
   * @param {(note:number, channel:number)=>void} [callbacks.onNoteOff]
   * @param {(semitoneRange:number, normalized:number, channel:number, raw14:number)=>void} [callbacks.onPitchBend] normalized -1..1
   * @param {(value:number, channel:number)=>void} [callbacks.onModWheel] 0..1 (14-bit when the sender uses CC33)
   * @param {(down:boolean, channel:number, value:number)=>void} [callbacks.onSustain]
   * @param {(value:number, channel:number)=>void} [callbacks.onVolume] 0..1
   * @param {(value:number, channel:number)=>void} [callbacks.onExpression] 0..1
   * @param {(value:number, channel:number)=>void} [callbacks.onAftertouch] channel pressure 0..1
   * @param {(note:number, value:number, channel:number)=>void} [callbacks.onPolyAftertouch] 0..1
   * @param {(program:number, channel:number, bank:{msb:number, lsb:number})=>void} [callbacks.onProgramChange]
   * @param {(controller:number, value:number, channel:number)=>void} [callbacks.onControlChange] every CC, raw 0..127
   * @param {(controller:number, value:number, channel:number)=>void} [callbacks.onUnhandledCC] CCs not consumed above
   * @param {(param:number, value:number, channel:number, detail:object)=>void} [callbacks.onNRPN] 14-bit param, value = (MSB<<7)|LSB
   * @param {(param:number, value:number, channel:number, detail:object)=>void} [callbacks.onRPN]
   * @param {(channel:number)=>void} [callbacks.onAllNotesOff] CC123 and CC124-127 (mode changes imply all notes off)
   * @param {(channel:number)=>void} [callbacks.onAllSoundOff] CC120 (falls back to onAllNotesOff)
   * @param {(channel:number)=>void} [callbacks.onResetControllers] CC121
   * @param {()=>void} [callbacks.onClock] 0xF8, 24 per quarter note
   * @param {()=>void} [callbacks.onStart] 0xFA
   * @param {()=>void} [callbacks.onContinue] 0xFB
   * @param {()=>void} [callbacks.onStop] 0xFC
   * @param {(connected:boolean, deviceName:string, names:string[])=>void} [callbacks.onConnectionChange]
   */
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.inputs = new Map();
    this.pitchBendRangeSemitones = 2;
    this.supported = typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
    this.access = null;
    this._initPromise = null;
    this._channels = Array.from({ length: 16 }, channelState);
    this._handler = (msg) => this._handleMessage(msg);
    MidiManager.instances.add(this);
  }

  /** Begin MIDI detection. Safe to call repeatedly and when Web MIDI is unsupported. */
  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      if (!this.supported) return false;
      try {
        this.access = await navigator.requestMIDIAccess({ sysex: false });
      } catch {
        // Permission denied or unavailable - every other input keeps working.
        this.access = null;
        return false;
      }
      this._scanInputs();
      this.access.onstatechange = () => this._scanInputs();
      return true;
    })();
    return this._initPromise;
  }

  _scanInputs() {
    if (!this.access) return;
    const seen = new Set();
    let added = null;
    for (const input of this.access.inputs.values()) {
      if (input.state === 'disconnected') continue;
      seen.add(input.id);
      // Re-assigning the handler is idempotent and also re-binds ports that
      // were disconnected and came back as the same object.
      if (input.onmidimessage !== this._handler) input.onmidimessage = this._handler;
      if (!this.inputs.has(input.id)) {
        this.inputs.set(input.id, input);
        added = input.name || 'MIDI Device';
      }
    }
    let removed = false;
    for (const [id, input] of this.inputs) {
      if (!seen.has(id)) {
        if (input.onmidimessage === this._handler) input.onmidimessage = null;
        this.inputs.delete(id);
        removed = true;
      }
    }
    if (added !== null) this.callbacks.onConnectionChange?.(true, added, this.deviceNames);
    else if (removed) this.callbacks.onConnectionChange?.(this.inputs.size > 0, this.deviceNames[0] || '', this.deviceNames);
    if (added !== null || removed) MidiManager.connectionListeners.forEach((fn) => fn(this.deviceNames));
  }

  /** Decode one MIDI message. Public so tests and virtual sources can inject data. */
  _handleMessage(msg) {
    const data = msg?.data;
    if (!data || data.length === 0) return;
    const status = data[0];
    if (status >= 0xf8) {
      this._handleRealtime(status);
      return;
    }
    if (status < 0x80 || status >= 0xf0) return; // stray data bytes / SysEx / common messages
    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const d1 = (data[1] ?? 0) & 0x7f;
    const d2 = (data[2] ?? 0) & 0x7f;
    const cb = this.callbacks;
    switch (command) {
      case 0x90:
        if (d2 === 0) cb.onNoteOff?.(d1, channel);
        else cb.onNoteOn?.(d1, d2 / 127, channel, d2);
        break;
      case 0x80:
        cb.onNoteOff?.(d1, channel);
        break;
      case 0xa0:
        cb.onPolyAftertouch?.(d1, d2 / 127, channel);
        break;
      case 0xb0:
        this._handleCC(d1, d2, channel, msg.target?.name || '');
        break;
      case 0xc0: {
        const state = this._channels[channel - 1];
        cb.onProgramChange?.(d1, channel, { msb: state.bankMsb, lsb: state.bankLsb });
        break;
      }
      case 0xd0:
        cb.onAftertouch?.(d1 / 127, channel);
        break;
      case 0xe0: {
        const raw = (d2 << 7) | d1; // 0..16383, centre 8192
        // Asymmetric scaling so both extremes reach exactly -1 and +1.
        const normalized = raw >= 8192 ? (raw - 8192) / 8191 : (raw - 8192) / 8192;
        cb.onPitchBend?.(this.pitchBendRangeSemitones, Math.max(-1, Math.min(1, normalized)), channel, raw);
        break;
      }
      default:
        break;
    }
  }

  _handleRealtime(status) {
    const cb = this.callbacks;
    if (status === 0xf8) cb.onClock?.();
    else if (status === 0xfa) cb.onStart?.();
    else if (status === 0xfb) cb.onContinue?.();
    else if (status === 0xfc) cb.onStop?.();
  }

  _handleCC(controller, value, channel, deviceName = '') {
    const cb = this.callbacks;
    const state = this._channels[channel - 1];
    let consumed = false;
    for (const fn of MidiManager.ccListeners) { if (fn(controller, value, channel, deviceName)) consumed = true; }
    if (consumed) return;
    cb.onControlChange?.(controller, value, channel);
    switch (controller) {
      case CC.BANK_MSB:
        state.bankMsb = value;
        return;
      case CC.BANK_LSB:
        state.bankLsb = value;
        return;
      case CC.MOD_WHEEL:
        state.modMsb = value;
        cb.onModWheel?.(value / 127, channel);
        return;
      case CC.MOD_WHEEL_LSB:
        cb.onModWheel?.(Math.min(1, ((state.modMsb << 7) | value) / 16383), channel);
        return;
      case CC.SUSTAIN:
        cb.onSustain?.(value >= 64, channel, value);
        return;
      case CC.VOLUME:
        if (cb.onVolume) { cb.onVolume(value / 127, channel); return; }
        break;
      case CC.EXPRESSION:
        if (cb.onExpression) { cb.onExpression(value / 127, channel); return; }
        break;
      case CC.NRPN_MSB:
        state.paramType = 'nrpn';
        state.nrpn = (value << 7) | (state.nrpn & 0x7f);
        return;
      case CC.NRPN_LSB:
        state.paramType = 'nrpn';
        state.nrpn = (state.nrpn & 0x3f80) | value;
        return;
      case CC.RPN_MSB:
        state.paramType = 'rpn';
        state.rpn = (value << 7) | (state.rpn & 0x7f);
        return;
      case CC.RPN_LSB:
        state.paramType = 'rpn';
        state.rpn = (state.rpn & 0x3f80) | value;
        return;
      case CC.DATA_ENTRY_MSB:
        state.dataMsb = value;
        state.dataLsb = 0;
        this._emitParam(state, channel, 'msb');
        return;
      case CC.DATA_ENTRY_LSB:
        state.dataLsb = value;
        this._emitParam(state, channel, 'lsb');
        return;
      case CC.DATA_INCREMENT:
      case CC.DATA_DECREMENT: {
        const current = (state.dataMsb << 7) | state.dataLsb;
        const next = Math.max(0, Math.min(0x3fff, current + (controller === CC.DATA_INCREMENT ? 1 : -1)));
        state.dataMsb = next >> 7;
        state.dataLsb = next & 0x7f;
        this._emitParam(state, channel, controller === CC.DATA_INCREMENT ? 'increment' : 'decrement');
        return;
      }
      case CC.ALL_SOUND_OFF:
        if (cb.onAllSoundOff) cb.onAllSoundOff(channel);
        else cb.onAllNotesOff?.(channel);
        return;
      case CC.RESET_ALL_CONTROLLERS:
        state.modMsb = 0;
        cb.onResetControllers?.(channel);
        return;
      case CC.ALL_NOTES_OFF:
      case 124: // Omni off
      case 125: // Omni on
      case 126: // Mono on
      case 127: // Poly on
        cb.onAllNotesOff?.(channel);
        return;
      default:
        break;
    }
    cb.onUnhandledCC?.(controller, value, channel);
  }

  _emitParam(state, channel, part) {
    const value = (state.dataMsb << 7) | state.dataLsb;
    const detail = { msb: state.dataMsb, lsb: state.dataLsb, part };
    if (state.paramType === 'nrpn' && state.nrpn !== NULL_PARAM) {
      this.callbacks.onNRPN?.(state.nrpn, value, channel, detail);
    } else if (state.paramType === 'rpn' && state.rpn !== NULL_PARAM) {
      this.callbacks.onRPN?.(state.rpn, value, channel, detail);
    }
  }

  setPitchBendRange(semitones) {
    this.pitchBendRangeSemitones = semitones;
  }

  dispose() {
    for (const input of this.inputs.values()) {
      if (input.onmidimessage === this._handler) input.onmidimessage = null;
    }
    this.inputs.clear();
    if (this.access) this.access.onstatechange = null;
    MidiManager.instances.delete(this);
  }

  get isConnected() {
    return this.inputs.size > 0;
  }

  get deviceNames() {
    return Array.from(this.inputs.values()).map((input) => input.name || 'MIDI Device');
  }
}

/** Standard MIDI note number -> scientific note name (MIDI 60 = C4). */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiNoteName(note) {
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}
