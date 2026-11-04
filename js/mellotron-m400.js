import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore, num } from './shared/presetStore.js';
import { el, section, knob, select, display, performance, power, presetBar, footer } from './shared/panel.js';
import { MELLOTRON_PRESETS } from './data/mellotronPresets.js';

const NOTES = [];
for (let midi = 31; midi <= 65; midi += 1) NOTES.push(`${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12]}${Math.floor(midi / 12) - 1}`);
const DEF = { frame: 0, track: 1, volume: .72, tone: .68, pitch: 0 };
const validate = (data) => {
  if (!data || typeof data !== 'object') throw new Error('Not an M400 frame.');
  return { frame: Math.round(num(data.frame, 0, 3, 0)), track: Math.round(num(data.track, 0, 4, 1)), volume: num(data.volume, 0, 1, .72), tone: num(data.tone, 0, 1, .68), pitch: num(data.pitch, -1, 1, 0) };
};

class MellotronApp {
  constructor() {
    this.engine = new WorkletEngine(new URL('./engine/MellotronProcessor.js', import.meta.url).href, 'mellotron-processor');
    this.patch = { ...DEF }; this.ui = {};
    this.store = new PresetStore({ key: 'overture.mellotron-m400.frames', version: 1, validate });
    this.build();
    this.perf = performance(this.shell, { notes: NOTES, wheels: false, started: () => this.engine.started, midiStatusEl: this.midi, handlers: {
      noteOn: (n, v) => this.engine.noteOn(n, v), noteOff: (n) => this.engine.noteOff(n), bend: (v) => this.engine.setPitchBend(v),
      sustain: () => {}, allOff: () => this.engine.allNotesOff(), program: (p) => this.presets.load(`f:${p % MELLOTRON_PRESETS.length}`),
      cc: (cc, value) => { if (cc === 7) this.ui.volume.setValue(value / 127); if (cc === 74) this.ui.tone.setValue(value / 127); },
    } });
    power('mellotron-power', () => this.engine.start(), () => { this.perf.flushPending(); this.display.set('M400 READY', 'TAPE MOTOR ENGAGED'); });
    this.presets.load('f:0');
  }
  set(key, value) { this.patch[key] = value; this.engine.post({ t: 'param', key, value }); }
  build() {
    const root = document.getElementById('mellotron-m400-root');
    const page = el('div', 'pn-page m400-page', root); this.shell = el('main', 'pn-shell m400-shell', page);
    const header = el('header', 'pn-header', this.shell);
    el('div', 'pn-brand', header).innerHTML = '<div class="m400-mark">STREETLY</div><div class="pn-model"><b>M400</b><span>TAPE REPLAY KEYBOARD · 1970</span></div>';
    const right = el('div', 'pn-header-right', header); this.display = display(right); this.midi = el('div', 'pn-midi', right, 'MIDI: searching…');
    const rows = el('div', 'pn-rows', this.shell); const top = el('div', 'pn-row m400-top', rows);
    const frame = section(top, 'TAPE FRAME', 'FINITE 8 SECOND REPLAY');
    this.ui.frame = select(frame.body, 'INSTALLED FRAME', [
      { value: 0, label: '3 VIOLINS' }, { value: 1, label: 'FLUTE' }, { value: 2, label: '8 VOICE CHOIR' }, { value: 3, label: 'CELLO' },
    ], 0, (v) => this.set('frame', Number(v)));
    const track = section(top, 'PLAYBACK HEAD', 'A / B / C · BLEND POSITIONS');
    this.ui.track = select(track.body, 'TRACK POSITION', [
      { value: 0, label: 'A  ·  TRACK ONE' }, { value: 1, label: 'A + B  ·  BLEND' }, { value: 2, label: 'B  ·  TRACK TWO' }, { value: 3, label: 'B + C  ·  BLEND' }, { value: 4, label: 'C  ·  TRACK THREE' },
    ], 1, (v) => this.set('track', Number(v)));
    const controls = section(top, 'M400 CONTROL BAY', 'MECHANICAL PLAYBACK');
    const ck = el('div', 'pn-knobs', controls.body);
    this.ui.volume = knob(ck, { label: 'VOLUME', min: 0, max: 1, value: DEF.volume, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('volume', v) });
    this.ui.tone = knob(ck, { label: 'TONE', min: 0, max: 1, value: DEF.tone, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('tone', v) });
    this.ui.pitch = knob(ck, { label: 'PITCH / SPEED', min: -1, max: 1, value: DEF.pitch, formatValue: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 15)}%`, onChange: (v) => this.set('pitch', v) });
    const tape = el('div', 'm400-tape-bay', top); tape.innerHTML = '<div class="m400-reel m400-reel--left"></div><div class="m400-tape-window"><span>TAPE RUNNING</span><b>NO LOOP</b></div><div class="m400-reel m400-reel--right"></div>';
    const memory = section(rows, 'FRAME MEMORY', 'OVERTURE REGISTRATIONS');
    this.presets = presetBar(memory.body, { factory: MELLOTRON_PRESETS, store: this.store, display: this.display, filename: 'mellotron-m400-frame', panic: () => this.perf.allOff(), apply: (data, name) => { this.patch = validate(data); this.refresh(); this.display.set(`FRAME  ${name}`, 'A / B / C HEAD READY'); }, capture: () => ({ ...this.patch }) });
    footer(this.shell, 'M400 · 35 TAPES · G1–F4 · FINITE PLAYBACK · COMPUTER KEYS: A–\' · ESC PANIC');
  }
  refresh() {
    Object.entries(this.patch).forEach(([key, value]) => { if (this.ui[key]?.setValue) this.ui[key].setValue(value, true); });
    this.engine.post({ t: 'patch', patch: this.patch });
  }
}
new MellotronApp();
