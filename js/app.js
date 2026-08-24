/**
 * app.js
 *
 * Top-level application: builds the DOM UI (panel sections, knobs, wheels,
 * keyboard, OLED, scope/spectrum), wires it to the AudioEngine, and owns
 * the two "outer" input sources that are NOT part of the DSP engine
 * itself: computer-keyboard key handling (piano notes, pitch/mod wheel
 * keys, octave keys) and MIDI device events. Both input sources funnel
 * into the exact same AudioEngine methods, so behavior is identical
 * regardless of input method, and the computer keyboard always works
 * whether or not a MIDI controller is connected.
 */

import { AudioEngine } from './engine/AudioEngine.js';
import { MidiManager } from './engine/MidiManager.js';
import { PresetManager } from './engine/PresetManager.js';
import { midiToFreq } from './engine/Voice.js';
import { Knob } from '../ui/Knob.js';
import { PitchWheel, ModWheel } from '../ui/Wheel.js';
import { Keyboard } from '../ui/Keyboard.js';
import { OLEDDisplay } from '../ui/OLEDDisplay.js';
import { Scope } from '../ui/Scope.js';
import { Spectrum } from '../ui/Spectrum.js';
import { PRESETS } from './data/presets.js';

const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiNoteToName(midi) {
  const name = MIDI_NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

// Computer-keyboard piano mapping (two rows, matching common DAW/synth convention).
const KEY_TO_NOTE = {
  a: 'C3', w: 'C#3', s: 'D3', e: 'D#3', d: 'E3',
  f: 'F3', t: 'F#3', g: 'G3', y: 'G#3', h: 'A3', u: 'A#3', j: 'B3',
  k: 'C4', o: 'C#4', l: 'D4', p: 'D#4', ';': 'E4', "'": 'F4',
};

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.presetManager = new PresetManager(this.engine, (patch) => this._syncKnobsToPatch(patch));
    this.midi = new MidiManager({
      onNoteOn: (midiNote, vel) => this._handleNoteOn(midiNoteToName(midiNote), vel, 'midi'),
      onNoteOff: (midiNote) => this._handleNoteOff(midiNoteToName(midiNote), 'midi'),
      onPitchBend: (rangeSemi, normalized) => this._handleMidiPitchBend(normalized),
      onModWheel: (v) => this._handleModWheelInput(v, 'midi'),
      onSustain: (down) => this.engine.setSustain(down),
      onProgramChange: (num) => this._loadFactoryPreset(num % PRESETS.length),
      onConnectionChange: (connected, name) => this.oled?.setMidiStatus(connected, name),
      onUnhandledCC: (cc, value) => this._handleUnmappedMidiCC(cc, value),
    });

    // Keyboard-held-note bookkeeping for pitch-bend spring-return and mod-hold semantics.
    this._pitchKeyState = { tabDown: false, shiftDown: false };
    this._modKeyState = { up: false, down: false };
    this._modHoldRAF = null;
    this._modWheelValue = 0;

    this._activeComputerKeys = new Set();

    this.knobs = {};
    this._buildUI();
    this._bindComputerKeyboard();
    this._bindScrollGuard();
    this._bindStartButton();
    this._fitToViewport();
    window.addEventListener('resize', () => this._scheduleFit());

    this.midi.init(); // safe no-op if unsupported/denied; never blocks keyboard input
  }

  /**
   * Scales #chassis down (never up) so the full instrument - panel, wheels,
   * and keyboard together - always fits within the current viewport,
   * including the 1366x768 target this build was specifically required to
   * fit. Implemented as a runtime measurement + transform rather than
   * hand-tuned CSS, because font-metric and box-model variance across
   * browsers/OSes makes hand-tuned pixel budgets fragile; measuring the
   * real rendered size and scaling to fit is exact by construction.
   */
  _fitToViewport() {
    const chassis = document.getElementById('chassis');
    if (!chassis) return;
    const margin = 20;
    const availW = window.innerWidth - margin * 2;
    const availH = window.innerHeight - margin * 2;

    chassis.style.transform = 'translate(-50%, -50%) scale(1)';
    const rect = chassis.getBoundingClientRect();
    const scale = Math.min(1, availW / rect.width, availH / rect.height);
    chassis.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  _scheduleFit() {
    if (this._fitRAF) cancelAnimationFrame(this._fitRAF);
    this._fitRAF = requestAnimationFrame(() => this._fitToViewport());
  }

  // -------------------------------------------------------------------
  // UI construction
  // -------------------------------------------------------------------

  _buildUI() {
    const root = document.getElementById('app-root');

    const chassis = document.createElement('div');
    chassis.id = 'chassis';

    chassis.appendChild(this._buildBrandStrip());

    const panel = document.createElement('div');
    panel.id = 'panel';

    panel.appendChild(this._buildTopRow());
    panel.appendChild(this._buildSectionsRow());
    panel.appendChild(this._buildMasterRow());
    panel.appendChild(this._buildScopeRow());

    chassis.appendChild(panel);
    chassis.appendChild(this._buildLowerRow());

    const bottomCap = document.createElement('div');
    bottomCap.id = 'chassis-bottom-cap';
    chassis.appendChild(bottomCap);

    root.appendChild(chassis);
  }

  _buildBrandStrip() {
    const strip = document.createElement('div');
    strip.id = 'brand-strip';

    const name = document.createElement('img');
    name.className = 'brand-logo';
    name.alt = 'Moog';
    name.src = './ui/Moog_Music_logo.png';
    name.title = 'Moog';

    const model = document.createElement('div');
    model.className = 'brand-model';
    model.textContent = 'little phatty';
    strip.appendChild(name);
    strip.appendChild(model);
    return strip;
  }

  _buildTopRow() {
    const row = document.createElement('div');
    row.id = 'panel-top-row';

    this.oled = new OLEDDisplay();
    row.appendChild(this.oled.el);

    row.appendChild(this._buildPresetControls());

    return row;
  }

  _buildPresetControls() {
    const wrap = document.createElement('div');
    wrap.id = 'preset-controls';

    const row1 = document.createElement('div');
    row1.className = 'preset-row';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'lp-btn';
    prevBtn.textContent = '◀ PRESET';
    prevBtn.addEventListener('click', () => this._stepPreset(-1));

    const nextBtn = document.createElement('button');
    nextBtn.className = 'lp-btn';
    nextBtn.textContent = 'PRESET ▶';
    nextBtn.addEventListener('click', () => this._stepPreset(1));

    row1.appendChild(prevBtn);
    row1.appendChild(nextBtn);

    const select = document.createElement('select');
    select.id = 'preset-select';
    PRESETS.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${String(p.id).padStart(2, '0')}  ${p.name}`;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => this._loadFactoryPreset(parseInt(select.value, 10)));
    this._presetSelect = select;

    const row2 = document.createElement('div');
    row2.className = 'preset-row';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'lp-btn';
    saveBtn.textContent = 'SAVE';
    saveBtn.addEventListener('click', () => this._openSaveDialog());

    const exportBtn = document.createElement('button');
    exportBtn.className = 'lp-btn';
    exportBtn.textContent = 'EXPORT';
    exportBtn.addEventListener('click', () => this._exportPresets());

    const importBtn = document.createElement('button');
    importBtn.className = 'lp-btn';
    importBtn.textContent = 'IMPORT';
    importBtn.addEventListener('click', () => this._openImportDialog());

    row2.appendChild(saveBtn);
    row2.appendChild(exportBtn);
    row2.appendChild(importBtn);

    wrap.appendChild(row1);
    wrap.appendChild(select);
    wrap.appendChild(row2);

    return wrap;
  }

  _buildSectionsRow() {
    const row = document.createElement('div');
    row.id = 'sections-row';

    row.appendChild(this._buildOscSection());
    row.appendChild(this._buildLFOSection());
    row.appendChild(this._buildFilterSection());
    row.appendChild(this._buildEnvSection());

    return row;
  }

  _makeSection(title) {
    const sec = document.createElement('div');
    sec.className = 'lp-section';
    const h = document.createElement('div');
    h.className = 'lp-section-title';
    h.textContent = title;
    sec.appendChild(h);
    const knobsRow = document.createElement('div');
    knobsRow.className = 'lp-section-knobs';
    sec.appendChild(knobsRow);
    return { sec, knobsRow };
  }

  _addKnob(container, key, opts) {
    const knob = new Knob(opts);
    this.knobs[key] = knob;
    container.appendChild(knob.el);
    return knob;
  }

  _rememberCurrentPresetState() {
    if (!this.engine?.started || !this.engine.voice) return;
    this.presetManager.rememberCurrentState();
  }

  _buildOscSection() {
    const { sec, knobsRow } = this._makeSection('OSCILLATORS');

    this._addKnob(knobsRow, 'osc1Shape', {
      label: 'OSC1 SHAPE', min: 0, max: 1, defaultValue: 0.28, formatValue: (v) => this._shapeLabel(v),
      onChange: (v) => { this.engine.voice.osc1.setShape(v); this.oled.showParameter('OSC1 SHAPE', this._shapeLabel(v)); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'osc1Level', {
      label: 'OSC1 LEVEL', min: 0, max: 1, defaultValue: 0.8, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.voice.mixer.setOsc1Level(v); this.oled.showParameter('OSC1 LEVEL', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'osc2Shape', {
      label: 'OSC2 SHAPE', min: 0, max: 1, defaultValue: 0.28, formatValue: (v) => this._shapeLabel(v),
      onChange: (v) => { this.engine.voice.osc2.setShape(v); this.oled.showParameter('OSC2 SHAPE', this._shapeLabel(v)); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'osc2Level', {
      label: 'OSC2 LEVEL', min: 0, max: 1, defaultValue: 0.6, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.voice.mixer.setOsc2Level(v); this.oled.showParameter('OSC2 LEVEL', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'osc2Detune', {
      label: 'OSC2 TUNE', min: -50, max: 50, defaultValue: 6, bipolar: true, formatValue: (v) => `${v.toFixed(0)}\u00A2`,
      onChange: (v) => { this.engine.voice.osc2.setDetuneCents(v); this.oled.showParameter('OSC2 TUNE', `${v.toFixed(0)} cents`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'noiseLevel', {
      label: 'NOISE', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.voice.mixer.setNoiseLevel(v); this.oled.showParameter('NOISE', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });

    const buttons = document.createElement('div');
    buttons.className = 'lp-section-buttons';
    const syncBtn = document.createElement('button');
    syncBtn.className = 'lp-btn';
    syncBtn.textContent = 'SYNC';
    syncBtn.addEventListener('click', () => {
      const enabled = !syncBtn.classList.contains('lit');
      syncBtn.classList.toggle('lit', enabled);
      this.engine.voice.setOsc2SyncEnabled(enabled);
      // Sync locks Osc2 to an exact harmonic ratio of Osc1; turning it off
      // returns Osc2 to unison (ratio 1), leaving the OSC2 TUNE knob's
      // cents-detune as the only remaining offset.
      this.engine.voice.setOsc2Ratio(enabled ? 2 : 1);
      this.oled.showParameter('OSC2 SYNC', enabled ? 'ON' : 'OFF');
    });
    buttons.appendChild(syncBtn);
    sec.appendChild(buttons);

    return sec;
  }

  _shapeLabel(v) {
    if (v < 0.08) return 'TRI';
    if (v < 0.33 - 0.05) return 'TRI/SAW';
    if (v < 0.4) return 'SAW';
    if (v < 0.6) return 'SAW/SQR';
    if (v < 0.7) return 'SQR';
    return `PW ${Math.round((1 - v) * 250)}\u00B5`;
  }

  _buildLFOSection() {
    const { sec, knobsRow } = this._makeSection('LFO');

    this._addKnob(knobsRow, 'lfoRate', {
      label: 'RATE', min: 0.02, max: 20, defaultValue: 4, formatValue: (v) => `${v.toFixed(2)} Hz`,
      onChange: (v) => { this.engine.setLFORate(v); this.oled.showParameter('LFO RATE', `${v.toFixed(2)} Hz`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'lfoToPitch', {
      label: 'TO PITCH', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.setLFODestinationBaseAmount('pitch', v); this.oled.showParameter('LFO>PITCH', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'lfoToFilter', {
      label: 'TO FILTER', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.setLFODestinationBaseAmount('filter', v); this.oled.showParameter('LFO>FILTER', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'lfoToPW', {
      label: 'TO PW', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.setLFODestinationBaseAmount('pulseWidth', v); this.oled.showParameter('LFO>PW', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'lfoToMix', {
      label: 'TO MIX', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.setLFODestinationBaseAmount('mix', v); this.oled.showParameter('LFO>MIX', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'lfoToAmp', {
      label: 'TO AMP', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.setLFODestinationBaseAmount('amplitude', v); this.oled.showParameter('LFO>AMP', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });

    const buttons = document.createElement('div');
    buttons.className = 'lp-section-buttons';
    const waves = [['TRI', 'triangle'], ['SQR', 'square'], ['SIN', 'sine'], ['SAW', 'saw'], ['R.SAW', 'reverseSaw'], ['S&H', 'sh']];
    this._lfoWaveButtons = [];
    waves.forEach(([label, value]) => {
      const btn = document.createElement('button');
      btn.className = 'lp-btn';
      btn.textContent = label;
      if (value === 'triangle') btn.classList.add('lit');
      btn.addEventListener('click', () => {
        this._lfoWaveButtons.forEach((b) => b.classList.remove('lit'));
        btn.classList.add('lit');
        this.engine.setLFOWaveform(value);
        this.oled.showParameter('LFO WAVE', label);
        this._rememberCurrentPresetState();
      });
      this._lfoWaveButtons.push(btn);
      buttons.appendChild(btn);
    });
    const retrigBtn = document.createElement('button');
    retrigBtn.className = 'lp-btn';
    retrigBtn.textContent = 'RETRIG';
    retrigBtn.addEventListener('click', () => {
      const enabled = !retrigBtn.classList.contains('lit');
      retrigBtn.classList.toggle('lit', enabled);
      this.engine.setLFORetrigger(enabled);
      this._rememberCurrentPresetState();
    });
    buttons.appendChild(retrigBtn);
    sec.appendChild(buttons);

    return sec;
  }

  _buildFilterSection() {
    const { sec, knobsRow } = this._makeSection('FILTER');

    this._addKnob(knobsRow, 'cutoff', {
      label: 'CUTOFF', min: 20, max: 12000, defaultValue: 4000, formatValue: (v) => `${Math.round(v)} Hz`,
      onChange: (v) => { this.engine.voice.setBaseCutoff(v); this.oled.showParameter('CUTOFF', `${Math.round(v)} Hz`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'resonance', {
      label: 'RESONANCE', min: 0, max: 1, defaultValue: 0.15, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.voice.filter.setResonance(v); this.oled.showParameter('RESONANCE', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'drive', {
      label: 'DRIVE', min: 0, max: 1, defaultValue: 0.1, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.voice.filter.setDrive(v); this.oled.showParameter('DRIVE', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'filterEnvAmount', {
      label: 'ENV AMT', min: -8000, max: 8000, defaultValue: 3000, bipolar: true, formatValue: (v) => `${Math.round(v)} Hz`,
      onChange: (v) => { this.engine.voice.setFilterEnvAmount(v); this.oled.showParameter('ENV AMT', `${Math.round(v)} Hz`); this._rememberCurrentPresetState(); },
    });
    this._addKnob(knobsRow, 'keyTrack', {
      label: 'KEY TRACK', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.voice.setKeyTrackAmount(v); this.oled.showParameter('KEY TRACK', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });

    return sec;
  }

  _buildEnvSection() {
    const { sec, knobsRow } = this._makeSection('ENVELOPES');

    const envRow1 = document.createElement('div');
    envRow1.className = 'lp-section-knobs';
    const label1 = document.createElement('div');
    label1.className = 'lp-knob-label';
    label1.style.width = '100%';
    label1.style.textAlign = 'center';
    label1.style.fontSize = '9px';
    label1.textContent = 'FILTER EG';
    sec.appendChild(label1);

    ['fAttack', 'fDecay', 'fSustain', 'fRelease'].forEach((key, i) => {
      const names = ['ATTACK', 'DECAY', 'SUSTAIN', 'RELEASE'];
      const isTimeParam = i !== 2;
      this._addKnob(knobsRow, key, {
        label: names[i], min: isTimeParam ? 0.001 : 0, max: isTimeParam ? 4 : 1, defaultValue: isTimeParam ? [0.004, 0.4, 0.4][i] ?? 0.4 : 0.3,
        formatValue: (v) => (isTimeParam ? `${v.toFixed(2)}s` : `${Math.round(v * 100)}%`),
        onChange: (v) => {
          const adsr = {};
          adsr[['attack', 'decay', 'sustain', 'release'][i]] = v;
          this.engine.voice.filterEnv.setADSR(adsr);
          this.oled.showParameter(`F.${names[i]}`, isTimeParam ? `${v.toFixed(2)}s` : `${Math.round(v * 100)}%`);
          this._rememberCurrentPresetState();
        },
      });
    });

    const ampRow = document.createElement('div');
    ampRow.className = 'lp-section-knobs';
    const label2 = document.createElement('div');
    label2.className = 'lp-knob-label';
    label2.style.width = '100%';
    label2.style.textAlign = 'center';
    label2.style.fontSize = '9px';
    label2.style.marginTop = '6px';
    sec.appendChild(label2);
    label2.textContent = 'AMP EG';
    sec.appendChild(ampRow);

    ['aAttack', 'aDecay', 'aSustain', 'aRelease'].forEach((key, i) => {
      const names = ['ATTACK', 'DECAY', 'SUSTAIN', 'RELEASE'];
      const isTimeParam = i !== 2;
      this._addKnob(ampRow, key, {
        label: names[i], min: isTimeParam ? 0.001 : 0, max: isTimeParam ? 4 : 1, defaultValue: isTimeParam ? [0.004, 0.25, 0.3][i] ?? 0.3 : 0.75,
        formatValue: (v) => (isTimeParam ? `${v.toFixed(2)}s` : `${Math.round(v * 100)}%`),
        onChange: (v) => {
          const adsr = {};
          adsr[['attack', 'decay', 'sustain', 'release'][i]] = v;
          this.engine.voice.ampEnv.setADSR(adsr);
          this.oled.showParameter(`A.${names[i]}`, isTimeParam ? `${v.toFixed(2)}s` : `${Math.round(v * 100)}%`);
          this._rememberCurrentPresetState();
        },
      });
    });

    return sec;
  }

  _buildMasterRow() {
    const row = document.createElement('div');
    row.id = 'master-row';

    const volKnobWrap = document.createElement('div');
    this._addKnob(volKnobWrap, 'masterVolume', {
      label: 'VOLUME', min: 0, max: 1, defaultValue: 0.25, formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { this.engine.setMasterVolume(v); this.oled.showParameter('VOLUME', `${Math.round(v * 100)}%`); this._rememberCurrentPresetState(); },
    });

    const glideKnobWrap = document.createElement('div');
    this._addKnob(glideKnobWrap, 'glideTime', {
      label: 'GLIDE', min: 0, max: 2, defaultValue: 0.15, formatValue: (v) => `${v.toFixed(2)}s`,
      onChange: (v) => { this.engine.glide.setTime(v); this.oled.showParameter('GLIDE', `${v.toFixed(2)}s`); this._rememberCurrentPresetState(); },
    });

    this.octaveDisplay = document.createElement('div');
    this.octaveDisplay.id = 'octave-display';
    this._renderOctaveDisplay();

    const toggles = document.createElement('div');
    toggles.id = 'view-toggles';
    const contrastBtn = document.createElement('button');
    contrastBtn.className = 'lp-btn';
    contrastBtn.textContent = 'CONTRAST';
    contrastBtn.addEventListener('click', () => document.body.classList.toggle('high-contrast'));
    const helpBtn = document.createElement('button');
    helpBtn.className = 'lp-btn';
    helpBtn.textContent = 'HELP';
    helpBtn.addEventListener('click', () => this._toggleHelp());
    toggles.appendChild(contrastBtn);
    toggles.appendChild(helpBtn);

    row.appendChild(volKnobWrap);
    row.appendChild(glideKnobWrap);
    row.appendChild(this.octaveDisplay);
    row.appendChild(toggles);

    return row;
  }

  _buildScopeRow() {
    const row = document.createElement('div');
    row.id = 'scope-row';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginTop = '10px';

    const scopePanel = document.createElement('div');
    scopePanel.className = 'lp-scope-panel';
    scopePanel.style.flex = '1';
    this._scopePanel = scopePanel;

    const spectrumPanel = document.createElement('div');
    spectrumPanel.className = 'lp-scope-panel';
    spectrumPanel.style.flex = '1';
    this._spectrumPanel = spectrumPanel;

    row.appendChild(scopePanel);
    row.appendChild(spectrumPanel);
    return row;
  }

  _buildLowerRow() {
    const row = document.createElement('div');
    row.id = 'lower-row';

    const wheelBlock = document.createElement('div');
    wheelBlock.id = 'wheel-housing-block';

    this.pitchWheel = new PitchWheel({ onChange: (v) => this.engine.setPitchBend(v) });
    this.modWheel = new ModWheel({ onChange: (v) => this.engine.setModWheel(v) });
    wheelBlock.appendChild(this.pitchWheel.el);
    wheelBlock.appendChild(this.modWheel.el);

    const keyboardBlock = document.createElement('div');
    keyboardBlock.id = 'keyboard-block';
    this.keyboard = new Keyboard({
      startOctave: 2,
      octaves: 3,
      onNoteOn: (note, vel) => this._handleNoteOn(note, vel, 'mouse'),
      onNoteOff: (note) => this._handleNoteOff(note, 'mouse'),
    });
    keyboardBlock.appendChild(this.keyboard.el);

    row.appendChild(wheelBlock);
    row.appendChild(keyboardBlock);

    return row;
  }

  // -------------------------------------------------------------------
  // Start / audio unlock
  // -------------------------------------------------------------------

  _bindStartButton() {
    // The audio context is unlocked only by a deliberate instrument launch.
    // Browsing the library must never start audio as a side effect.
    const unlock = async () => {
      if (this.engine.started) return;
      await this.engine.start();
      this.presetManager.restoreLastSession();
      this._initScopeAndSpectrum();
      document.removeEventListener('launcher:launch', unlock);
      this.oled.showParameter('AUDIO', 'READY', 1200);
      const launcher = document.getElementById('launcher-page');
      if (launcher) {
        launcher.classList.add('launcher-page--leaving');
        setTimeout(() => launcher.remove(), 480);
      }
    };
    document.addEventListener('launcher:launch', unlock, { once: true });
  }

  _initScopeAndSpectrum() {
    this.scope = new Scope(this.engine.ctx, this.engine.masterGain);
    this._scopePanel.appendChild(this.scope.el);
    this.scope.start();

    this.spectrum = new Spectrum(this.engine.ctx, this.engine.masterGain);
    this._spectrumPanel.appendChild(this.spectrum.el);
    this.spectrum.start();
  }

  // -------------------------------------------------------------------
  // Note routing (shared by mouse/computer-keyboard/MIDI)
  // -------------------------------------------------------------------

  _handleNoteOn(note, velocity, source) {
    if (!this.engine.started) return;
    this.engine.noteOn(note, velocity);
    this.keyboard.setKeyActive(note, true);
  }

  _handleNoteOff(note, source) {
    if (!this.engine.started) return;
    this.engine.noteOff(note);
    this.keyboard.setKeyActive(note, false);
  }

  // -------------------------------------------------------------------
  // Computer keyboard: piano keys, pitch bend (Tab/Shift, spring-loaded),
  // mod wheel (arrow keys, position-hold), octave (-/+).
  // -------------------------------------------------------------------

  _bindScrollGuard() {
    window.addEventListener('keydown', (e) => {
      const onSynthPage = !!document.getElementById('chassis');
      if (!onSynthPage) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        if (!this._isTypingTarget(e.target)) e.preventDefault();
      }
    });
  }

  _bindComputerKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this._isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (key === 'tab') {
        e.preventDefault();
        this._pitchKeyState.tabDown = true;
        this._updatePitchFromKeys();
        return;
      }
      if (e.key === 'Shift' && e.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT) {
        this._pitchKeyState.shiftDown = true;
        this._updatePitchFromKeys();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._modKeyState.up = true;
        this._syncModHold();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._modKeyState.down = true;
        this._syncModHold();
        return;
      }
      if (key === '-' || key === '_') {
        this._stepOctave(-1);
        return;
      }
      if (key === '=' || key === '+') {
        this._stepOctave(1);
        return;
      }

      const note = KEY_TO_NOTE[key];
      if (note && !this._activeComputerKeys.has(key)) {
        this._activeComputerKeys.add(key);
        this._handleNoteOn(note, 0.85, 'keyboard');
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();

      if (key === 'tab') {
        this._pitchKeyState.tabDown = false;
        this._updatePitchFromKeys();
        return;
      }
      if (e.key === 'Shift' && e.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT) {
        this._pitchKeyState.shiftDown = false;
        this._updatePitchFromKeys();
        return;
      }
      if (key === 'arrowup') {
        this._modKeyState.up = false;
        this._syncModHold();
        return;
      }
      if (key === 'arrowdown') {
        this._modKeyState.down = false;
        this._syncModHold();
        return;
      }

      const note = KEY_TO_NOTE[key];
      if (note && this._activeComputerKeys.has(key)) {
        this._activeComputerKeys.delete(key);
        this._handleNoteOff(note, 'keyboard');
      }
    });

    // Losing window focus mid-bend must not leave the pitch wheel stuck off-center.
    window.addEventListener('blur', () => {
      this._pitchKeyState.tabDown = false;
      this._pitchKeyState.shiftDown = false;
      this._updatePitchFromKeys();
      this._modKeyState.up = false;
      this._modKeyState.down = false;
      this._stopModHold();
      this._activeComputerKeys.forEach((key) => {
        const note = KEY_TO_NOTE[key];
        if (note) this._handleNoteOff(note, 'keyboard');
      });
      this._activeComputerKeys.clear();
    });
  }

  _isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  /**
   * Tab bends up, Left Shift bends down, matching the exact spec. If both
   * are held simultaneously they cancel out (net zero), and releasing
   * either one lets the wheel spring back toward whatever the remaining
   * key implies (or fully to center if neither is held).
   */
  _updatePitchFromKeys() {
    const { tabDown, shiftDown } = this._pitchKeyState;
    let target = 0;
    if (tabDown) target += 1;
    if (shiftDown) target -= 1;

    if (target === 0) {
      // Neither held (or they cancel out): spring all the way back to center.
      this.pitchWheel.springReturnToCenter();
    } else {
      // At least one held: snap toward full deflection in that direction.
      // A quick animated ramp (not instant) reads as "the wheel being
      // pushed" rather than a teleport, while still feeling immediate.
      this._animatePitchWheelTo(target);
    }
  }

  _animatePitchWheelTo(target) {
    if (this._pitchAnimRAF) cancelAnimationFrame(this._pitchAnimRAF);
    const start = this.pitchWheel.value;
    const startTime = performance.now();
    const duration = 70;
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 2);
      this.pitchWheel.setExternalValue(start + (target - start) * eased);
      if (t < 1 && this._pitchKeyIntentStillMatches(target)) {
        this._pitchAnimRAF = requestAnimationFrame(step);
      } else if (!this._pitchKeyIntentStillMatches(target)) {
        // Key state changed mid-animation (e.g. user tapped both keys
        // quickly); re-evaluate from scratch rather than finishing a stale animation.
        this._updatePitchFromKeys();
      }
    };
    this._pitchAnimRAF = requestAnimationFrame(step);
  }

  _pitchKeyIntentStillMatches(target) {
    const { tabDown, shiftDown } = this._pitchKeyState;
    const current = (tabDown ? 1 : 0) - (shiftDown ? 1 : 0);
    return current === target;
  }

  _handleMidiPitchBend(normalized) {
    // MIDI pitch bend is not spring-loaded by this app's own logic - the
    // physical hardware wheel handles its own return - so we just mirror
    // the incoming value directly onto our UI wheel and engine.
    this.pitchWheel.setExternalValue(normalized);
  }

  /**
   * Mod wheel: arrow keys nudge it, and it holds position exactly where
   * left, mirroring the spec (defaults fully down, no spring-return).
   */
  _setModWheelValue(value) {
    const next = Math.max(0, Math.min(1, value));
    this.modWheel.setExternalValue(next);
    this.engine.setModWheel(next);
  }

  _syncModHold() {
    const active = this._modKeyState.up || this._modKeyState.down;
    if (!active) {
      this._stopModHold();
      return;
    }
    if (this._modHoldRAF) return;

    const step = () => {
      if (!this._modKeyState.up && !this._modKeyState.down) {
        this._stopModHold();
        return;
      }
      const delta = (this._modKeyState.up ? 1 : 0) - (this._modKeyState.down ? 1 : 0);
      if (delta !== 0) {
        this._setModWheelValue(this.modWheel.value + delta * 0.02);
      }
      this._modHoldRAF = requestAnimationFrame(step);
    };
    this._modHoldRAF = requestAnimationFrame(step);
  }

  _stopModHold() {
    if (this._modHoldRAF) cancelAnimationFrame(this._modHoldRAF);
    this._modHoldRAF = null;
  }

  _nudgeModWheel(delta) {
    this._setModWheelValue(this.modWheel.value + delta);
  }

  _handleModWheelInput(value, source) {
    this.modWheel.setExternalValue(value);
  }

  _handleUnmappedMidiCC(cc, value) {
    // Common octave-button CC numbers vary by controller; rather than
    // guessing wrong and silently doing nothing useful, we treat any
    // unmapped CC crossing from low->high as a generic "octave up" trigger
    // and high->low as "octave down", which covers the vast majority of
    // controllers that expose octave buttons as momentary CC switches.
    if (value >= 100 && !this._lastUnmappedHigh) {
      this._stepOctave(1);
      this._lastUnmappedHigh = true;
    } else if (value < 20) {
      this._lastUnmappedHigh = false;
    }
  }

  // -------------------------------------------------------------------
  // Octave control
  // -------------------------------------------------------------------

  _stepOctave(delta) {
    const next = Math.max(-3, Math.min(3, this.engine.getOctaveShift() + delta));
    this.engine.setOctaveShift(next);
    this._renderOctaveDisplay();
    this.oled.showParameter('OCTAVE', next > 0 ? `+${next}` : `${next}`);
  }

  _renderOctaveDisplay() {
    const shift = this.engine.getOctaveShift();
    this.octaveDisplay.textContent = `OCT ${shift > 0 ? '+' : ''}${shift}`;
  }

  // -------------------------------------------------------------------
  // Preset loading + knob sync
  // -------------------------------------------------------------------

  _loadFactoryPreset(id) {
    const patch = this.presetManager.loadFactory(id);
    this._presetSelect.value = id;
    this.oled.showPreset(id, patch.name);
  }

  _stepPreset(delta) {
    const next = (this.presetManager.currentPresetId + delta + PRESETS.length) % PRESETS.length;
    this._loadFactoryPreset(next);
  }

  _syncKnobsToPatch(patch) {
    const set = (key, value) => { if (this.knobs[key]) this.knobs[key].setValue(value, true); };
    set('osc1Shape', patch.osc1Shape);
    set('osc1Level', patch.osc1Level);
    set('osc2Shape', patch.osc2Shape);
    set('osc2Level', patch.osc2Level);
    set('osc2Detune', patch.osc2Detune);
    set('noiseLevel', patch.noiseLevel);
    set('cutoff', patch.cutoff);
    set('resonance', patch.resonance);
    set('drive', patch.drive);
    set('filterEnvAmount', patch.filterEnvAmount);
    set('keyTrack', patch.keyTrack);
    set('fAttack', patch.filterEnv.attack);
    set('fDecay', patch.filterEnv.decay);
    set('fSustain', patch.filterEnv.sustain);
    set('fRelease', patch.filterEnv.release);
    set('aAttack', patch.ampEnv.attack);
    set('aDecay', patch.ampEnv.decay);
    set('aSustain', patch.ampEnv.sustain);
    set('aRelease', patch.ampEnv.release);
    set('lfoRate', patch.lfoRate);
    set('lfoToPitch', patch.lfoToPitch);
    set('lfoToFilter', patch.lfoToFilter);
    set('lfoToPW', patch.lfoToPW);
    set('lfoToMix', patch.lfoToMix);
    set('lfoToAmp', patch.lfoToAmp);
    set('glideTime', patch.glideTime);

    if (this._lfoWaveButtons) {
      const waveMap = { triangle: 0, square: 1, sine: 2, saw: 3, reverseSaw: 4, sh: 5 };
      this._lfoWaveButtons.forEach((b, i) => b.classList.toggle('lit', i === waveMap[patch.lfoWaveform]));
    }
  }

  // -------------------------------------------------------------------
  // Save / Export / Import dialogs
  // -------------------------------------------------------------------

  _openSaveDialog() {
    this._showModal('Save Preset', (body, close) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Preset name';
      body.appendChild(input);
      const actions = document.createElement('div');
      actions.className = 'lp-modal-actions';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'lp-btn';
      saveBtn.textContent = 'SAVE';
      saveBtn.addEventListener('click', () => {
        const name = input.value.trim() || 'Untitled';
        this.presetManager.saveAsUserPreset(name);
        this.oled.showParameter('SAVED', name);
        close();
      });
      actions.appendChild(saveBtn);
      body.appendChild(actions);
      input.focus();
    });
  }

  _exportPresets() {
    const json = this.presetManager.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'little-phatty-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  _openImportDialog() {
    this._showModal('Import Presets (JSON)', (body, close) => {
      const textarea = document.createElement('textarea');
      textarea.placeholder = 'Paste preset JSON here';
      body.appendChild(textarea);
      const actions = document.createElement('div');
      actions.className = 'lp-modal-actions';
      const importBtn = document.createElement('button');
      importBtn.className = 'lp-btn';
      importBtn.textContent = 'IMPORT';
      importBtn.addEventListener('click', () => {
        const ok = this.presetManager.importJSON(textarea.value);
        this.oled.showParameter('IMPORT', ok ? 'SUCCESS' : 'FAILED');
        if (ok) close();
      });
      actions.appendChild(importBtn);
      body.appendChild(actions);
    });
  }

  _showModal(title, buildBody) {
    const backdrop = document.createElement('div');
    backdrop.className = 'lp-modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'lp-modal';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    modal.appendChild(h3);

    const close = () => backdrop.remove();
    buildBody(modal, close);

    const cancelRow = document.createElement('div');
    cancelRow.className = 'lp-modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'lp-btn';
    cancelBtn.textContent = 'CLOSE';
    cancelBtn.addEventListener('click', close);
    cancelRow.appendChild(cancelBtn);
    modal.appendChild(cancelRow);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.body.appendChild(backdrop);
  }

  _toggleHelp() {
    if (this._helpVisible) {
      this._helpVisible = false;
      this._helpBackdrop?.remove();
      return;
    }
    this._helpVisible = true;
    this._showModal('Help', (body) => {
      const text = document.createElement('div');
      text.style.fontSize = '12px';
      text.style.lineHeight = '1.6';
      text.innerHTML = `
        <p><strong>Keyboard:</strong> A W S E D F T G Y H U J K O L P ; ' play notes.</p>
        <p><strong>Pitch bend:</strong> Tab = up, Left Shift = down. Release to spring back to center.</p>
        <p><strong>Mod wheel:</strong> Up/Down arrows adjust; stays where you leave it. The LFO section's "TO ..." knobs set a maximum depth - matching the real hardware, that depth is only actually heard once the mod wheel is raised above zero.</p>
        <p><strong>Octave:</strong> - and + change octave, -3 to +3.</p>
        <p><strong>Glide:</strong> only occurs when a new key is pressed while another is already held (legato). Releasing all keys resets glide.</p>
        <p><strong>Knobs:</strong> drag to change, mouse wheel to nudge, double-click to reset, right-click+drag for fine adjustment.</p>
        <p><strong>MIDI:</strong> auto-connects when a controller is plugged in. Computer keyboard always works too.</p>
      `;
      body.appendChild(text);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  // Exposed for browser-console debugging/tweaking (e.g.
  // `__littlePhattyApp.engine.voice.filter.setResonance(0.9)`), and used by
  // this project's own interaction tests to reach the live instance.
  if (typeof window !== 'undefined') window.__littlePhattyApp = app;
});
