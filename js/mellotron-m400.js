import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore, num } from './shared/presetStore.js';
import { el, section, knob, select, display, performance, power, presetBar, footer } from './shared/panel.js';
import { MELLOTRON_PRESETS } from './data/mellotronPresets.js';
import { consumeCommunityInstrumentPreset, createCommunityShareButton } from './shared/communityPreset.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES = Array.from({ length: 47 }, (_, i) => {
  const midi = 43 + i; return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
});
const FRAMES = [
  { value: 0, label: '01 · CLASSIC M400' },
  { value: 1, label: '02 · CHOIR FRAME' },
  { value: 2, label: '03 · STRINGS FRAME' },
  { value: 3, label: '04 · BRASS FRAME' },
  { value: 4, label: '05 · WOODWIND FRAME' },
  { value: 5, label: '06 · ORGAN & BELLS' },
];
const TRACKS = [
  { value: 0, label: 'A · LOWER TRACK' },
  { value: 1, label: 'B · MIDDLE TRACK' },
  { value: 2, label: 'C · UPPER TRACK' },
];
const SOUND_NAMES = [
  ['3 Violins', 'Flute', 'Cello'],
  ['8 Voice Choir', 'Male Choir', 'Female Choir'],
  ['String Section', 'Orchestra', 'Muted Strings'],
  ['Brass', 'Trombone', 'Tenor Sax'],
  ['Flute', 'Oboe', 'Clarinet'],
  ['Church Organ', 'Vibraphone', 'Orchestral Bells'],
];
const DEF = { frame: 0, track: 0, volume: .72, tone: .68, pitch: 0 };
const validate = (data) => {
  if (!data || typeof data !== 'object') throw new Error('Not an M400 frame.');
  return {
    frame: Math.round(num(data.frame, 0, FRAMES.length - 1, 0)),
    track: Math.round(num(data.track, 0, 2, 0)),
    volume: num(data.volume, 0, 1, .72),
    tone: num(data.tone, 0, 1, .68),
    pitch: num(data.pitch, -1, 1, 0),
  };
};

class MellotronApp {
  constructor() {
    this.engine = new WorkletEngine(new URL('./engine/MellotronProcessor.js?v=20261104-declick', import.meta.url).href, 'mellotron-processor');
    this.patch = { ...DEF }; this.ui = {};
    this.store = new PresetStore({ key: 'overture.mellotron-m400.frames', version: 1, validate });
    this.build();
    this.perf = performance(this.shell, { notes: NOTES, wheels: false, started: () => this.engine.started, midiStatusEl: this.midi, handlers: {
      noteOn: (n, v) => this.engine.noteOn(n, v), noteOff: (n) => this.engine.noteOff(n), bend: (v) => this.engine.setPitchBend(v),
      sustain: () => {}, allOff: () => this.engine.allNotesOff(), program: (p) => this.presets.load(`f:${p % MELLOTRON_PRESETS.length}`),
      cc: (cc, value) => { if (cc === 7) this.ui.volume.setValue(value / 127); if (cc === 74) this.ui.tone.setValue(value / 127); },
    } });
    power('mellotron-power', () => this.engine.start(), () => { this.perf.flushPending(); this.display.set('M400 READY', 'TAPE TRANSPORT ENGAGED'); });
    this.presets.load('f:0');
    const community = consumeCommunityInstrumentPreset('mellotron-m400', validate);
    if (community) {
      this.patch = community.data;
      this.refresh();
      this.display.set('COMMUNITY FRAME', community.title);
    }
  }
  set(key, value) {
    this.patch[key] = value;
    this.engine.post({ t: 'param', key, value });
    this.updateTapeReadout();
  }
  updateTapeReadout() {
    const sound = SOUND_NAMES[this.patch.frame]?.[this.patch.track] || 'UNASSIGNED TAPE';
    this.tapeName.textContent = sound.toUpperCase();
    this.tapeTrack.textContent = `TRACK ${'ABC'[this.patch.track]} / FRAME ${String(this.patch.frame + 1).padStart(2, '0')}`;
    this.display.set(sound.toUpperCase(), `FRAME ${this.patch.frame + 1} · TRACK ${'ABC'[this.patch.track]}`);
  }
  build() {
    const root = document.getElementById('mellotron-m400-root');
    const page = el('div', 'pn-page m400-page', root); this.shell = el('main', 'pn-shell m400-shell', page);
    const header = el('header', 'pn-header', this.shell);
    el('div', 'pn-brand', header).innerHTML = '<div class="m400-mark" aria-label="Streetly Electronics">STREETLY</div><div class="pn-model"><b>M400</b><span>TAPE REPLAY KEYBOARD · 1970</span></div>';
    const right = el('div', 'pn-header-right', header); this.display = display(right); this.midi = el('div', 'pn-midi', right, 'MIDI: searching…');
    const rows = el('div', 'pn-rows', this.shell); const top = el('div', 'pn-row m400-top', rows);
    const frame = section(top, 'TAPE FRAME', 'VIRTUAL FRAME LIBRARY');
    this.ui.frame = select(frame.body, 'INSTALLED FRAME', FRAMES, DEF.frame, (v) => this.set('frame', Number(v)));
    const track = section(top, 'THREE-TRACK HEAD', 'SELECT ONE TRACK · A / B / C');
    this.ui.track = select(track.body, 'PLAYBACK TRACK', TRACKS, DEF.track, (v) => this.set('track', Number(v)));
    const monitor = el('section', 'm400-monitor', top);
    el('div', 'm400-monitor__eyebrow', monitor, 'TAPE HEAD MONITOR');
    this.tapeName = el('strong', 'm400-monitor__name', monitor, '3 VIOLINS');
    this.tapeTrack = el('span', 'm400-monitor__track', monitor, 'TRACK A / FRAME 01');
    const transport = el('div', 'm400-transport', monitor);
    transport.innerHTML = '<span class="m400-transport__head"></span><span class="m400-transport__tape"></span><span class="m400-transport__roller"></span><span class="m400-transport__roller m400-transport__roller--right"></span>';
    const controls = section(top, 'M400 CONTROL PANEL', 'ORIGINAL THREE-CONTROL LAYOUT');
    const ck = el('div', 'pn-knobs', controls.body);
    this.ui.volume = knob(ck, { label: 'VOLUME', min: 0, max: 1, value: DEF.volume, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('volume', v) });
    this.ui.tone = knob(ck, { label: 'TONE', min: 0, max: 1, value: DEF.tone, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('tone', v) });
    this.ui.pitch = knob(ck, { label: 'PITCH', min: -1, max: 1, value: DEF.pitch, formatValue: (v) => `${v >= 0 ? '+' : ''}${(v * 8).toFixed(1)}%`, onChange: (v) => this.set('pitch', v) });
    const memory = section(rows, 'FRAME MEMORY', 'OVERTURE TAPE REGISTRATIONS');
    this.presets = presetBar(memory.body, { factory: MELLOTRON_PRESETS, store: this.store, display: this.display, filename: 'mellotron-m400-frame', panic: () => this.perf.allOff(), apply: (data, name) => { this.patch = validate(data); this.refresh(); this.display.set(`FRAME  ${name}`, 'TAPE HEAD READY'); }, capture: () => ({ ...this.patch }) });
    createCommunityShareButton(memory.body, {
      instrumentId: 'mellotron-m400', className: 'pn-btn',
      getData: () => validate(this.patch), getAudioOutput: () => this.engine.output,
       getTitle: () => 'Mellotron M400 frame',
    });
    footer(this.shell, 'M400 · 47 ON-SCREEN NOTES · G2–F6 · 35-KEY TAPE RANGE · THREE SELECTABLE TAPE TRACKS · FINITE 8-SECOND REPLAY · ESC PANIC');
    this.updateTapeReadout();
  }
  refresh() {
    Object.entries(this.patch).forEach(([key, value]) => { if (this.ui[key]?.setValue) this.ui[key].setValue(value, true); });
    this.engine.post({ t: 'patch', patch: this.patch });
    this.updateTapeReadout();
  }
}
new MellotronApp();
