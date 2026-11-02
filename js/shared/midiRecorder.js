/**
 * Record note events and write a standards-compliant, single-track Standard MIDI File.
 * Times are seconds from the start of the take; files use 480 PPQ and a 120 BPM tempo.
 */
const PPQ = 480;
const TEMPO = 120;
const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
const u16 = (value) => [(value >>> 8) & 0xff, value & 0xff];
const u32 = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];

function variableLength(value) {
  let remaining = Math.max(0, Math.floor(value));
  const bytes = [remaining & 0x7f];
  while ((remaining >>= 7) > 0) bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}

function textBytes(value) {
  return [...new TextEncoder().encode(String(value || 'Overture performance').slice(0, 120))];
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
    const kind = event.kind === 'off' ? 'off' : event.kind === 'on' ? 'on' : null;
    if (!kind) throw new TypeError('MIDI events must have kind "on" or "off".');
    return {
      tick: Math.round(time * ppq * tempo / 60),
      priority: kind === 'off' ? 0 : 1,
      kind,
      note: clampInt(event.note, 0, 127),
      velocity: kind === 'off' ? 0 : clampInt(event.velocity, 1, 127),
      index,
    };
  }).sort((a, b) => a.tick - b.tick || a.priority - b.priority || a.index - b.index);

  let previousTick = 0;
  for (const event of ordered) {
    const delta = Math.max(0, event.tick - previousTick);
    track.push(...variableLength(delta));
    track.push(event.kind === 'on' ? 0x90 : 0x80, event.note, event.velocity);
    previousTick = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64, ...u32(6),
    ...u16(0), ...u16(1), ...u16(ppq),
  ];
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
    this.lastTime = 0;
  }

  start() {
    this.events = [];
    this.held.clear();
    this.startedAt = this.clock();
    this.lastTime = 0;
    this.recording = true;
  }

  _time() {
    const elapsed = Math.max(this.lastTime, Math.max(0, this.clock() - this.startedAt));
    this.lastTime = elapsed;
    return elapsed;
  }

  noteOn(note, velocity = 0.8) {
    if (!this.recording) return;
    const key = clampInt(note, 0, 127);
    const time = this._time();
    if (this.held.has(key)) {
      this.events.push({ kind: 'off', note: key, velocity: 0, time });
      this.held.delete(key);
    }
    this.events.push({ kind: 'on', note: key, velocity: clampInt(Number(velocity) * 127, 1, 127), time });
    this.held.set(key, true);
  }

  noteOff(note) {
    if (!this.recording) return;
    const key = clampInt(note, 0, 127);
    if (!this.held.has(key)) return;
    this.events.push({ kind: 'off', note: key, velocity: 0, time: this._time() });
    this.held.delete(key);
  }

  stop() {
    if (!this.recording) return null;
    const endTime = this._time();
    this.held.forEach((_value, note) => this.events.push({ kind: 'off', note, velocity: 0, time: endTime }));
    this.held.clear();
    this.recording = false;
    if (!this.events.some((event) => event.kind === 'on')) return null;
    return encodeMidiFile(this.events, { title: 'Overture performance', tempo: this.tempo, ppq: this.ppq });
  }
}
