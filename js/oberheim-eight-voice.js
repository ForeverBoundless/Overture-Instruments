import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore, num } from './shared/presetStore.js';
import { el, section, knob, select, display, performance, power, presetBar, footer } from './shared/panel.js';
import { OBERHEIM_EIGHT_VOICE_PRESETS } from './data/oberheimEightVoicePresets.js';
import { consumeCommunityInstrumentPreset, createCommunityShareButton } from './shared/communityPreset.js';

const DEF = { cutoff: .53, resonance: .06, filterEnv: .2, filterMode: 'low', osc1: .8, osc2: .68, tune: 0, pulse: .5, wave1: 'saw', wave2: 'saw', attack: .16, decay: .42, sustain: .72, release: .52, master: .64, lfoRate: .13, lfoAmount: 0, lfoTarget: 'pitch', bendRange: 2 };
const validate = (data) => {
  if (!data || typeof data !== 'object') throw new Error('Not an Eight Voice program.');
  const out = { ...DEF };
  Object.keys(DEF).forEach((key) => { if (!(key in data)) return; out[key] = ['filterMode', 'wave1', 'wave2', 'lfoTarget'].includes(key) ? (key === 'filterMode' ? ['low', 'band', 'high', 'notch'].includes(data[key]) : key === 'lfoTarget' ? ['pitch', 'filter'].includes(data[key]) : ['saw', 'pulse'].includes(data[key])) ? data[key] : DEF[key] : key === 'bendRange' ? num(data[key], 1, 12, 2) : num(data[key], 0, 1, DEF[key]); });
  out.voices = Array.from({ length: 8 }, (_, i) => { const v = Array.isArray(data.voices) ? data.voices[i] || {} : {}; return { level: num(v.level, 0, 1, .85), pan: num(v.pan, -1, 1, (i - 3.5) / 5), tune: num(v.tune, -.2, .2, 0), detune: num(v.detune, -.2, .2, 0), cutoff: num(v.cutoff, 0, 1, out.cutoff), resonance: num(v.resonance, 0, .85, out.resonance), osc1: num(v.osc1, 0, 1, out.osc1), osc2: num(v.osc2, 0, 1, out.osc2), filterEnv: num(v.filterEnv, 0, 1, out.filterEnv), filterMode: ['low', 'band', 'high', 'notch'].includes(v.filterMode) ? v.filterMode : out.filterMode, wave1: ['saw', 'pulse'].includes(v.wave1) ? v.wave1 : out.wave1, wave2: ['saw', 'pulse'].includes(v.wave2) ? v.wave2 : out.wave2 }; });
  return out;
};

class EightVoiceApp {
  constructor() {
    this.engine = new WorkletEngine(new URL('./engine/OberheimEightVoiceProcessor.js?v=20261104-eightvoice-stable', import.meta.url).href, 'oberheim-eight-voice-processor');
    this.patch = validate(OBERHEIM_EIGHT_VOICE_PRESETS[0].data); this.ui = {}; this.voiceUi = [];
    this.store = new PresetStore({ key: 'overture.oberheim-eight-voice.programs', version: 1, validate });
    this.build();
    this.perf = performance(this.shell, { octaves: 4, startOctave: 2, started: () => this.engine.started, midiStatusEl: this.midi, handlers: {
      noteOn: (n, v) => this.engine.noteOn(n, v), noteOff: (n) => this.engine.noteOff(n), bend: (v) => this.engine.setPitchBend(v), mod: (v) => this.engine.setModWheel(v),
      sustain: (d) => this.engine.setSustain(d), allOff: () => this.engine.allNotesOff(), program: (p) => this.presets.load(`f:${p % OBERHEIM_EIGHT_VOICE_PRESETS.length}`),
      cc: (cc, value) => { if (cc === 7) this.ui.master.setValue(value / 127); if (cc === 74) this.ui.cutoff.setValue(value / 127); if (cc === 71) this.ui.resonance.setValue(value / 127); },
    } });
    power('oberheim-power', () => this.engine.start(), () => { this.perf.flushPending(); this.display.set('EIGHT VOICE READY', '8 SEM VOICES ONLINE'); });
    this.presets.load('f:0');
    const community = consumeCommunityInstrumentPreset('oberheim-eight-voice', validate);
    if (community) { this.patch = community.data; this.refresh(); this.display.set('COMMUNITY PROGRAM', community.title); }
  }
  set(key, value) {
    this.patch[key] = value;
    this.engine.post({ t: 'param', key, value });
    const linked = ['cutoff', 'resonance', 'filterEnv', 'filterMode', 'osc1', 'osc2', 'wave1', 'wave2'];
    if (linked.includes(key)) {
      this.patch.voices?.forEach((voice, index) => {
        voice[key] = value;
        this.engine.post({ t: 'param', key: `voice${index}_${key}`, value });
        this.voiceUi[index]?.[key]?.setValue?.(value, true);
      });
    }
  }
  build() {
    const root = document.getElementById('oberheim-eight-voice-root');
    const page = el('div', 'pn-page eight-page', root); this.shell = el('main', 'pn-shell eight-shell', page);
    const header = el('header', 'pn-header', this.shell);
    el('div', 'pn-brand', header).innerHTML = '<img src="/ui/Logos/Oberheim_logo.png" alt="Oberheim"><div class="pn-model"><b>EIGHT VOICE</b><span>POLYPHONIC SYNTHESIZER · EIGHT SEMs</span></div>';
    const right = el('div', 'pn-header-right', header); this.display = display(right); this.midi = el('div', 'pn-midi', right, 'MIDI: searching…');
    const rows = el('div', 'pn-rows', this.shell); const global = el('div', 'pn-row eight-global', rows);
    const osc = section(global, 'OSCILLATOR MIX', 'EACH SEM · TWO VCOs');
    const ok = el('div', 'pn-knobs', osc.body);
    this.ui.osc1 = knob(ok, { label: 'VCO 1', min: 0, max: 1, value: DEF.osc1, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('osc1', v) });
    this.ui.osc2 = knob(ok, { label: 'VCO 2', min: 0, max: 1, value: DEF.osc2, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('osc2', v) });
    this.ui.tune = knob(ok, { label: 'VCO 2 INTERVAL', min: 0, max: 1, value: DEF.tune, formatValue: (v) => `${(v * 12).toFixed(1)} st`, onChange: (v) => this.set('tune', v) });
    this.ui.wave1 = select(osc.body, 'VCO 1 WAVEFORM', [{ value: 'saw', label: 'SAWTOOTH' }, { value: 'pulse', label: 'PULSE' }], DEF.wave1, (v) => this.set('wave1', v));
    this.ui.wave2 = select(osc.body, 'VCO 2 WAVEFORM', [{ value: 'pulse', label: 'PULSE' }, { value: 'saw', label: 'SAWTOOTH' }], DEF.wave2, (v) => this.set('wave2', v));
    this.ui.pulse = knob(ok, { label: 'PULSE WIDTH', min: 0, max: 1, value: DEF.pulse, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('pulse', v) });
    const filter = section(global, 'STATE VARIABLE VCF', '12 dB / OCTAVE · SEM RESPONSE');
    const fk = el('div', 'pn-knobs', filter.body);
    this.ui.cutoff = knob(fk, { label: 'CUTOFF', min: 0, max: 1, value: DEF.cutoff, onChange: (v) => this.set('cutoff', v) });
    this.ui.resonance = knob(fk, { label: 'RESONANCE', min: 0, max: 1, value: DEF.resonance, onChange: (v) => this.set('resonance', v) });
    this.ui.filterEnv = knob(fk, { label: 'ENV AMOUNT', min: 0, max: 1, value: DEF.filterEnv, onChange: (v) => this.set('filterEnv', v) });
    this.ui.filterMode = select(filter.body, 'RESPONSE', [{ value: 'low', label: 'LOW PASS' }, { value: 'band', label: 'BAND PASS' }, { value: 'high', label: 'HIGH PASS' }, { value: 'notch', label: 'NOTCH' }], DEF.filterMode, (v) => this.set('filterMode', v));
    const env = section(global, 'ENVELOPE / LFO', 'ADS · INDEPENDENT PER VOICE');
    const ek = el('div', 'pn-knobs', env.body);
    this.ui.attack = knob(ek, { label: 'ATTACK', min: 0, max: 1, value: DEF.attack, formatValue: (v) => `${(v * v * 1.8).toFixed(2)} s`, onChange: (v) => this.set('attack', v) });
    this.ui.decay = knob(ek, { label: 'DECAY', min: 0, max: 1, value: DEF.decay, onChange: (v) => this.set('decay', v) });
    this.ui.sustain = knob(ek, { label: 'SUSTAIN', min: 0, max: 1, value: DEF.sustain, onChange: (v) => this.set('sustain', v) });
    this.ui.lfoAmount = knob(ek, { label: 'LFO MOD', min: 0, max: 1, value: DEF.lfoAmount, onChange: (v) => this.set('lfoAmount', v) });
    this.ui.release = knob(ek, { label: 'RELEASE', min: 0, max: 1, value: DEF.release, formatValue: (v) => `${(v * v * 4).toFixed(2)} s`, onChange: (v) => this.set('release', v) });
    this.ui.lfoRate = knob(ek, { label: 'LFO RATE', min: 0, max: 1, value: DEF.lfoRate, onChange: (v) => this.set('lfoRate', v) });
    this.ui.lfoTarget = select(env.body, 'LFO ROUTING', [{ value: 'pitch', label: 'VIBRATO / PITCH' }, { value: 'filter', label: 'FILTER MOD' }], DEF.lfoTarget, (v) => this.set('lfoTarget', v));
    this.ui.bendRange = knob(ek, { label: 'BEND RANGE', min: 1, max: 12, value: DEF.bendRange, formatValue: (v) => `${Math.round(v)} st`, onChange: (v) => this.set('bendRange', Math.round(v)) });
    this.ui.master = knob(ek, { label: 'MASTER', min: 0, max: 1, value: DEF.master, onChange: (v) => { this.set('master', v); this.engine.setVolume(v); } });
    const voices = el('div', 'eight-voice-grid', rows);
    for (let i = 0; i < 8; i += 1) this.buildVoice(voices, i);
    const memory = section(rows, 'PROGRAMMER', 'OVERTURE VOICE PROGRAMS');
    this.presets = presetBar(memory.body, { factory: OBERHEIM_EIGHT_VOICE_PRESETS, store: this.store, display: this.display, filename: 'oberheim-eight-voice-program', panic: () => this.perf.allOff(), apply: (data, name) => { this.patch = validate(data); this.refresh(); this.display.set(`PROGRAM  ${name}`, 'EIGHT VOICE PROGRAMMER'); }, capture: () => ({ ...this.patch, voices: this.voiceUi.map((v) => Object.fromEntries(Object.entries(v).map(([key, control]) => [key, control.select ? control.select.value : control.value]))) }) });
    createCommunityShareButton(memory.body, {
      instrumentId: 'oberheim-eight-voice', className: 'pn-btn',
      getData: () => validate({ ...this.patch, voices: this.voiceUi.map((controls) => Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.select ? control.select.value : control.value]))) }),
      getAudioOutput: () => this.engine.output,
       getTitle: () => 'Oberheim Eight Voice program',
    });
    footer(this.shell, 'EIGHT VOICE · 8 INDEPENDENT SEMs · 49 KEYS · STATE VARIABLE FILTER · ESC PANIC');
  }
  buildVoice(parent, index) {
    const sec = section(parent, `VOICE ${index + 1}`, 'INDEPENDENT SEM');
    const knobs = el('div', 'pn-knobs', sec.body);
    const state = {};
    const initial = this.patch.voices?.[index] || {};
    const control = (key, label, min, max, fallback, formatValue) => {
      state[key] = knob(knobs, {
        label, min, max, value: initial[key] ?? fallback, formatValue,
        onChange: (v) => this.engine.post({ t: 'param', key: `voice${index}_${key}`, value: v }),
      });
    };
    control('level', 'LEVEL', 0, 1, .85, (v) => `${Math.round(v * 100)}%`);
    control('pan', 'STEREO PAN', -1, 1, (index - 3.5) / 5, (v) => `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`);
    control('tune', 'FINE TUNE', -.2, .2, 0, (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)} ct`);
    control('cutoff', 'VCF CUTOFF', 0, 1, this.patch.cutoff, (v) => `${Math.round(v * 100)}%`);
    control('resonance', 'VCF RES', 0, .85, this.patch.resonance, (v) => `${Math.round(v * 100)}%`);
    control('osc1', 'VCO 1 LEVEL', 0, 1, this.patch.osc1, (v) => `${Math.round(v * 100)}%`);
    control('osc2', 'VCO 2 LEVEL', 0, 1, this.patch.osc2, (v) => `${Math.round(v * 100)}%`);
    const choice = (key, label, options, fallback) => {
      state[key] = select(sec.body, label, options, initial[key] ?? fallback, (value) => this.engine.post({ t: 'param', key: `voice${index}_${key}`, value }));
    };
    choice('filterMode', 'FILTER RESPONSE', [{ value: 'low', label: 'LOW PASS' }, { value: 'band', label: 'BAND PASS' }, { value: 'high', label: 'HIGH PASS' }, { value: 'notch', label: 'NOTCH' }], this.patch.filterMode);
    choice('wave1', 'VCO 1 SHAPE', [{ value: 'saw', label: 'SAWTOOTH' }, { value: 'pulse', label: 'PULSE' }], this.patch.wave1);
    choice('wave2', 'VCO 2 SHAPE', [{ value: 'pulse', label: 'PULSE' }, { value: 'saw', label: 'SAWTOOTH' }], this.patch.wave2);
    this.voiceUi[index] = state;
  }
  refresh() {
    Object.entries(this.patch).forEach(([key, value]) => { if (this.ui[key]?.setValue) this.ui[key].setValue(value, true); });
    this.voiceUi.forEach((voice, index) => Object.entries(voice).forEach(([key, control]) => {
      const fallback = key === 'pan' ? (index - 3.5) / 5 : key === 'level' ? .85 : key === 'tune' ? 0 : this.patch[key] ?? 0;
      control.setValue(this.patch.voices?.[index]?.[key] ?? fallback, true);
    }));
    this.engine.post({ t: 'patch', patch: this.patch });
  }
}
new EightVoiceApp();
