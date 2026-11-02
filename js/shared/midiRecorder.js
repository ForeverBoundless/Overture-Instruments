/**
 * Capture performance note events and controller automation, then export
 * a single-track Standard MIDI File. All event times are seconds relative
 * to the take start; channel numbers are 1..16.
 */
const PPQ = 480;
const TEMPO = 120;
const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
const u16 = (value) => [(value >>> 8) & 0xff, value & 0xff];
const u32 = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const channelOf = (value) => clampInt(value || 1, 1, 16) - 1;

function variableLength(value) {
  let remaining = Math.max(0, Math.floor(value));
  const bytes = [remaining & 0x7f];
  while ((remaining >>= 7) > 0) bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}

function textBytes(value) {
  return [...new TextEncoder().encode(String(value || 'Overture performance').slice(0, 120))];
}

function eventPriority(kind) {
  if (kind === 'off') return 0;
  if (kind === 'on') return 1;
  return 2;
}

function encodeEvent(event) {
  const channel = channelOf(event.channel);
  switch (event.kind) {
    case 'on': return [0x90 | channel, clampInt(event.note, 0, 127), clampInt(event.velocity, 1, 127)];
    case 'off': return [0x80 | channel, clampInt(event.note, 0, 127), clampInt(event.velocity, 0, 127)];
    case 'cc': return [0xb0 | channel, clampInt(event.controller, 0, 127), clampInt(event.value, 0, 127)];
    case 'pitchBend': {
      const raw = clampInt(event.value, 0, 16383);
      return [0xe0 | channel, raw & 0x7f, (raw >> 7) & 0x7f];
    }
    case 'aftertouch': return [0xd0 | channel, clampInt(event.value, 0, 127)];
    case 'polyAftertouch': return [0xa0 | channel, clampInt(event.note, 0, 127), clampInt(event.value, 0, 127)];
    case 'program': return [0xc0 | channel, clampInt(event.value, 0, 127)];
    default: throw new TypeError(`Unsupported MIDI event kind "${event.kind}".`);
  }
}

export function encodeMidiFile(events, { title = 'Overture performance', tempo = TEMPO, ppq = PPQ } = {}) {
  if (!Array.isArray(events)) throw new TypeError('MIDI events must be an array.');
  if (!Number.isFinite(tempo) || tempo < 20 || tempo > 300) throw new RangeError('MIDI tempo must be between 20 and 300 BPM.');
  if (!Number.isInteger(ppq) || ppq < 24 || ppq > 32767) throw new RangeError('MIDI PPQ must be an integer between 24 and 32767.');

  const name = textBytes(title);
  const microsecondsPerQuarter = Math.round(60000000 / tempo);
  const track = [
    0x00, 0xff, 0x03, ...variableLength(name.length), ...name,
    0x00, 0xff, 0x51, 0x03,
    (microsecondsPerQuarter >>> 16) & 0xff,
    (microsecondsPerQuarter >>> 8) & 0xff,
    microsecondsPerQuarter & 0xff,
  ];

  const ordered = events.map((event, index) => {
    const time = Number(event.time);
    if (!Number.isFinite(time) || time < 0) throw new TypeError('MIDI event times must be non-negative finite seconds.');
    return { ...event, tick: Math.round(time * ppq * tempo / 60), priority: eventPriority(event.kind), index };
  }).sort((a, b) => a.tick - b.tick || a.priority - b.priority || a.index - b.index);

  let previousTick = 0;
  for (const event of ordered) {
    const delta = Math.max(0, event.tick - previousTick);
    track.push(...variableLength(delta), ...encodeEvent(event));
    previousTick = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(0), ...u16(1), ...u16(ppq)];
  const trackChunk = [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track];
  return new Uint8Array([...header, ...trackChunk]);
}

export class MidiRecorder {
  constructor({ clock = () => performance.now() / 1000, tempo = TEMPO, ppq = PPQ } = {}) {
    this.clock = clock;
    this.tempo = tempo;
    this.ppq = ppq;
    this.recording = false;
    this.events = [];
    this.held = new Map();
    this.startedAt = 0;
  }

  start() {
    this.events = [];
    this.held.clear();
    this.startedAt = this.clock();
    this.recording = true;
  }

  _time(absoluteTime) {
    const timestamp = Number.isFinite(absoluteTime) ? absoluteTime : this.clock();
    return Math.max(0, timestamp - this.startedAt);
  }

  noteOn(note, velocity = 0.8, options = {}) {
    if (!this.recording) return;
    const key = clampInt(note, 0, 127);
    const channel = clampInt(options.channel || 1, 1, 16);
    const time = this._time(options.time);
    const heldKey = `${channel}:${key}`;
    if (this.held.has(heldKey)) {
      this.events.push({ kind: 'off', note: key, velocity: 0, channel, time });
      this.held.delete(heldKey);
    }
    this.events.push({ kind: 'on', note: key, velocity: clampInt(Number(velocity) * 127, 1, 127), channel, time });
    this.held.set(heldKey, { note: key, channel });
  }

  noteOff(note, options = {}) {
    if (!this.recording) return;
    const key = clampInt(note, 0, 127);
    const channel = clampInt(options.channel || 1, 1, 16);
    const heldKey = `${channel}:${key}`;
    if (!this.held.has(heldKey)) return;
    this.events.push({ kind: 'off', note: key, velocity: 0, channel, time: this._time(options.time) });
    this.held.delete(heldKey);
  }

  controlChange(controller, value, options = {}) {
    if (!this.recording) return;
    this.events.push({ kind: 'cc', controller: clampInt(controller, 0, 127), value: clampInt(value, 0, 127), channel: clampInt(options.channel || 1, 1, 16), time: this._time(options.time) });
  }

  pitchBend(value, options = {}) {
    if (!this.recording) return;
    this.events.push({ kind: 'pitchBend', value: clampInt(value, 0, 16383), channel: clampInt(options.channel || 1, 1, 16), time: this._time(options.time) });
  }

  aftertouch(value, options = {}) {
    if (!this.recording) return;
    this.events.push({ kind: 'aftertouch', value: clampInt(value, 0, 127), channel: clampInt(options.channel || 1, 1, 16), time: this._time(options.time) });
  }

  polyAftertouch(note, value, options = {}) {
    if (!this.recording) return;
    this.events.push({ kind: 'polyAftertouch', note: clampInt(note, 0, 127), value: clampInt(value, 0, 127), channel: clampInt(options.channel || 1, 1, 16), time: this._time(options.time) });
  }

  programChange(value, options = {}) {
    if (!this.recording) return;
    this.events.push({ kind: 'program', value: clampInt(value, 0, 127), channel: clampInt(options.channel || 1, 1, 16), time: this._time(options.time) });
  }

  stop() {
    if (!this.recording) return null;
    const endTime = this._time();
    this.held.forEach(({ note, channel }) => this.events.push({ kind: 'off', note, velocity: 0, channel, time: endTime }));
    this.held.clear();
    this.recording = false;
    if (!this.events.some((event) => event.kind === 'on')) return null;
    return encodeMidiFile(this.events, { title: 'Overture performance', tempo: this.tempo, ppq: this.ppq });
  }
}
