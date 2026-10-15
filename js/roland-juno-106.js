/** roland-juno-106.js - six-voice DCO polysynth page. Sound: js/engine/JunoProcessor.js */
import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore, num } from './shared/presetStore.js';
import { el, section, knob, toggle, select, display, performance, power, presetBar, footer } from './shared/panel.js';
import { JUNO_PRESETS } from './data/junoPresets.js';

const DEF = { lfoRate: 0.4, lfoDelay: 0, dcoLfo: 0, pwm: 0.3, pwmMode: 'man', range: 8, saw: true, pulse: false, sub: 0, noise: 0, hpf: 1, cutoff: 0.7, res: 0.1, envAmt: 0.3, envPolarity: 1, vcfLfo: 0, kbd: 0.5, vcaMode: 'env', vcaLevel: 0.8, attack: 0.05, decay: 0.3, sustain: 0.7, release: 0.3, chorus: 0, portamento: 0, bendRange: 2, benderLfo: 0.1 };
function validate(d) {
  if (!d || typeof d !== 'object') throw new Error('Not a Juno patch.');
  const o = { ...DEF };
  Object.keys(DEF).forEach((k) => {
    if (!(k in d)) return;
    if (typeof DEF[k] === 'boolean') o[k] = !!d[k];
    else if (k === 'pwmMode') o[k] = d[k] === 'lfo' ? 'lfo' : 'man';
    else if (k === 'vcaMode') o[k] = d[k] === 'gate' ? 'gate' : 'env';
    else if (k === 'range') o[k] = [16, 8, 4].includes(Number(d[k])) ? Number(d[k]) : 8;
    else if (k === 'hpf') o[k] = Math.round(num(d[k], 0, 3, 1));
    else if (k === 'chorus') o[k] = Math.round(num(d[k], 0, 2, 0));
    else if (k === 'envPolarity') o[k] = Number(d[k]) < 0 ? -1 : 1;
    else if (k === 'bendRange') o[k] = num(d[k], 0, 12, 2);
    else o[k] = num(d[k], 0, 1, DEF[k]);
  });
  return o;
}

class JunoApp {
  constructor() {
    this.engine = new WorkletEngine(new URL('./engine/JunoProcessor.js', import.meta.url).href, 'juno-processor');
    this.store = new PresetStore({ key: 'overture.juno106.patches', version: 1, validate });
    this.patch = validate(JUNO_PRESETS[0].data);
    this.ui = {};
    this._build();
    this.perf = performance(this.shell, {
      octaves: 5, startOctave: 2, started: () => this.engine.started, midiStatusEl: this.midiEl,
      handlers: {
        noteOn: (n, v) => this.engine.noteOn(n, v), noteOff: (n) => this.engine.noteOff(n), bend: (v) => this.engine.setPitchBend(v), mod: (v) => this.engine.setModWheel(v),
        sustain: (d) => this.engine.setSustain(d), allOff: () => this.engine.allNotesOff(), program: (p) => this.presets.load(`f:${p % JUNO_PRESETS.length}`),
        cc: (cc, v) => { if (cc === 7) this.ui.volume.setValue(v / 127); if (cc === 74) this.ui.cutoff.setValue(v / 127); if (cc === 71) this.ui.res.setValue(v / 127); if (cc === 65) this.ui.portamento.setValue(v >= 64 ? Math.max(0.15, this.patch.portamento) : 0); },
      },
    });
    footer(this.shell, '6-VOICE DCO POLYSYNTH • STEREO CHORUS I / II • KEYS: A–\' PLAY, -/= OCTAVE, TAB/SHIFT BEND, ↑/↓ MOD, ESC PANIC');
    power('juno-power', () => this.engine.start(), () => { this.send(); this.engine.setVolume(this.ui.volume.value); this.perf.flushPending(); this.disp.flash('AUDIO READY'); });
    this.presets.load('f:0');
  }

  send() { this.engine.post({ t: 'patch', patch: this.patch }); }
  set(key, value) { this.patch[key] = value; this.engine.post({ t: 'param', key, value }); }

  _build() {
    const page = el('div', 'pn-page', document.getElementById('juno-root'));
    this.shell = el('main', 'pn-shell juno-shell', page);
    const header = el('header', 'pn-header', this.shell);
    const brand = el('div', 'pn-brand', header);
    brand.innerHTML = '<img src="/ui/Logos/Roland_logo.png" alt="Roland"><div class="pn-model"><b>JUNO-106</b><span>PROGRAMMABLE POLYPHONIC SYNTHESIZER</span></div>';
    const right = el('div', 'pn-header-right', header);
    this.disp = display(right);
    this.midiEl = el('div', 'pn-midi', right, 'MIDI: searching…');
    const rows = el('div', 'pn-rows', this.shell);
    const r1 = el('div', 'pn-row juno-row', rows);
    const K = (parent, key, label, fmt = (v) => `${Math.round(v * 100)}`, opts = {}) => { this.ui[key] = knob(parent, { label, min: 0, max: 1, value: DEF[key], formatValue: fmt, ...opts, onChange: (v) => this.set(key, v) }); };
    const lfo = section(r1, 'LFO');
    const lk = el('div', 'pn-knobs', lfo.body); K(lk, 'lfoRate', 'RATE', (v) => `${(0.1 * Math.pow(300, v)).toFixed(2)} Hz`); K(lk, 'lfoDelay', 'DELAY');
    const dco = section(r1, 'DCO');
    this.ui.range = select(dco.body, 'RANGE', [16, 8, 4].map((r) => ({ value: r, label: `${r}'` })), 8, (v) => this.set('range', Number(v)));
    const dk = el('div', 'pn-knobs', dco.body); K(dk, 'dcoLfo', 'LFO'); K(dk, 'pwm', 'PWM');
    this.ui.pwmMode = select(dco.body, 'PWM SOURCE', [{ value: 'man', label: 'MANUAL' }, { value: 'lfo', label: 'LFO' }], 'man', (v) => this.set('pwmMode', v));
    const wb = el('div', 'pn-buttons', dco.body);
    this.ui.pulse = toggle(wb, 'PULSE ⎍', false, (v) => this.set('pulse', v)); this.ui.saw = toggle(wb, 'SAW ⩘', true, (v) => this.set('saw', v));
    const dk2 = el('div', 'pn-knobs', dco.body); K(dk2, 'sub', 'SUB OSC'); K(dk2, 'noise', 'NOISE');
    const hpf = section(r1, 'HPF');
    this.ui.hpf = select(hpf.body, 'FREQ', [{ value: 0, label: '0 (BASS LIFT)' }, { value: 1, label: '1 (FLAT)' }, { value: 2, label: '2' }, { value: 3, label: '3' }], 1, (v) => this.set('hpf', Number(v)));
    const vcf = section(r1, 'VCF', '24 dB LOW-PASS');
    const fk = el('div', 'pn-knobs', vcf.body); K(fk, 'cutoff', 'FREQ', (v) => `${Math.round(20 * Math.pow(2, (20 + v * 110) / 12))} Hz`); K(fk, 'res', 'RES'); K(fk, 'envAmt', 'ENV'); K(fk, 'vcfLfo', 'LFO'); K(fk, 'kbd', 'KYBD');
    this.ui.envPolarity = toggle(vcf.body, 'ENV INVERT', false, (v) => this.set('envPolarity', v ? -1 : 1));
    const vca = section(r1, 'VCA');
    this.ui.vcaMode = select(vca.body, 'MODE', [{ value: 'env', label: 'ENV' }, { value: 'gate', label: 'GATE' }], 'env', (v) => this.set('vcaMode', v));
    const vk = el('div', 'pn-knobs', vca.body); K(vk, 'vcaLevel', 'LEVEL');
    const env = section(r1, 'ENV');
    const ek = el('div', 'pn-knobs', env.body);
    const tfmt = (max) => (v) => `${(0.001 + v * v * max).toFixed(2)} s`;
    K(ek, 'attack', 'A', tfmt(3)); K(ek, 'decay', 'D', tfmt(12)); K(ek, 'sustain', 'S'); K(ek, 'release', 'R', tfmt(12));
    const ch = section(r1, 'CHORUS');
    const cb = el('div', 'pn-buttons', ch.body);
    this.chorusButtons = [0, 1, 2].map((n) => toggle(cb, n ? `CHORUS ${'I'.repeat(n)}` : 'OFF', n === 0, () => this.setChorus(n)));
    el('div', 'pn-help', ch.body, 'Stereo BBD-style chorus: I = slow and gentle, II = faster and wider. Headphones or stereo speakers show the spread.');
    const r2 = el('div', 'pn-row juno-row-bottom', rows);
    const perf = section(r2, 'PERFORMANCE');
    const pk = el('div', 'pn-knobs', perf.body); K(pk, 'portamento', 'PORTAMENTO', tfmt(1.5)); K(pk, 'benderLfo', 'BENDER→LFO');
    this.ui.bendRange = select(perf.body, 'BEND RANGE', [1, 2, 3, 5, 7, 12].map((n) => ({ value: n, label: `${n} st` })), 2, (v) => this.set('bendRange', Number(v)));
    this.ui.volume = knob(pk, { label: 'VOLUME', min: 0, max: 1, value: 0.7, formatValue: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.engine.setVolume(v) });
    const pre = section(r2, 'PATCH MEMORY', 'ORIGINAL OVERTURE PATCHES');
    this.presets = presetBar(pre.body, {
      factory: JUNO_PRESETS, store: this.store, display: this.disp, filename: 'juno-106-patch', panic: () => this.perf.allOff(),
      apply: (data, name) => { this.patch = validate(data); this.disp.set(`PATCH  ${name}`, `CHORUS ${['OFF', 'I', 'II'][this.patch.chorus]}  HPF ${this.patch.hpf}`); this.send(); this.refresh(); },
      capture: () => ({ ...this.patch }),
    });
  }

  setChorus(n) { this.patch.chorus = n; this.engine.post({ t: 'param', key: 'chorus', value: n }); this.chorusButtons.forEach((b, i) => b.setValue(i === n, true)); }

  refresh() {
    const p = this.patch;
    Object.keys(this.ui).forEach((k) => {
      const c = this.ui[k];
      if (!(k in p)) return;
      if (k === 'envPolarity') c.setValue(p[k] < 0, true);
      else if (typeof p[k] === 'boolean') c.setValue(p[k], true);
      else c.setValue(p[k], true);
    });
    this.chorusButtons.forEach((b, i) => b.setValue(i === p.chorus, true));
  }
}
document.addEventListener('DOMContentLoaded', () => { window.__junoApp = new JunoApp(); });
