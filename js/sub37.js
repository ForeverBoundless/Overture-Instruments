import { AudioEngine } from './engine/AudioEngine.js';
import { Knob } from '../ui/Knob.js';
import { Keyboard } from '../ui/Keyboard.js';
import { PitchWheel, ModWheel } from '../ui/Wheel.js';
import { OLEDDisplay } from '../ui/OLEDDisplay.js';
import { PRESETS } from './data/presets.js';

const KEY_TO_NOTE = {
  a: 'C3', w: 'C#3', s: 'D3', e: 'D#3', d: 'E3',
  f: 'F3', t: 'F#3', g: 'G3', y: 'G#3', h: 'A3', u: 'A#3', j: 'B3',
  k: 'C4', o: 'C#4', l: 'D4', p: 'D#4', ';': 'E4', "'": 'F4',
};

class Sub37 {
  constructor() {
    this.engine = new AudioEngine();
    this.knobs = {};
    this.display = new OLEDDisplay();
    this.currentPresetIndex = 0;
    this._pitchKeyState = { tabDown: false, shiftDown: false };
    this._modKeyState = { up: false, down: false };
    this._modHoldRAF = null;
    this._activeComputerKeys = new Set();
    this._build();
    this._bindPower();
    this._bindComputerKeyboard();
    this._bindScrollGuard();
    this._fitToViewport();
    window.addEventListener('resize', () => this._fitToViewport());
  }

  _formatDisplayValue(label, value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return '0';
    if (Math.abs(v) >= 1000) return `${Math.round(v)}`;
    if (Math.abs(v) >= 10) return `${v.toFixed(1)}`;
    if (Math.abs(v) >= 1) return `${v.toFixed(2)}`;
    if (label.toLowerCase().includes('rate') || label.toLowerCase().includes('cutoff')) return `${v.toFixed(2)}`;
    return `${v.toFixed(3)}`;
  }

  _knob(host, label, min, max, value, onChange, bipolar = false) {
    const knob = new Knob({
      label,
      min,
      max,
      defaultValue: value,
      bipolar,
      formatValue: (v) => Number.isInteger(v) ? String(v) : v.toFixed(2),
      onChange: (v) => {
        if (onChange) onChange(v);
        if (this.display) this.display.showParameter(label, this._formatDisplayValue(label, v));
      },
    });
    host.appendChild(knob.el);
    return knob;
  }

  _section(title) {
    const section = document.createElement('section');
    section.className = 's37-section';
    section.innerHTML = `<h2>${title}</h2>`;
    const knobs = document.createElement('div');
    knobs.className = 's37-knobs';
    section.appendChild(knobs);
    return { section, knobs };
  }

  _buttons(section, values, onPick, initialValue = values[0]?.[1]) {
    const row = document.createElement('div');
    row.className = 's37-buttons';
    const buttons = [];

    const setValue = (value, emit = true) => {
      let picked = null;
      buttons.forEach(({ value: buttonValue, button }) => {
        const active = buttonValue === value;
        button.classList.toggle('lit', active);
        if (active) picked = buttonValue;
      });

      if (picked === null && buttons.length > 0) {
        buttons[0].button.classList.add('lit');
        picked = buttons[0].value;
      }

      if (emit && picked !== null) onPick(picked);
    };

    values.forEach(([label, value], i) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (i === 0) b.classList.add('lit');
      b.addEventListener('click', () => {
        setValue(value, true);
      });
      buttons.push({ value, button: b });
      row.appendChild(b);
    });
    setValue(initialValue, false);
    section.appendChild(row);
    return { row, setValue };
  }

  _buildPresetControls() {
    const controls = document.createElement('div');
    controls.className = 'sub37-preset-controls';

    const head = document.createElement('div');
    head.className = 'sub37-preset-head';
    head.textContent = 'PRESETS';
    controls.appendChild(head);

    const row = document.createElement('div');
    row.className = 'sub37-preset-row';

    const prev = document.createElement('button');
    prev.className = 's37-preset-btn';
    prev.textContent = '◀';
    prev.setAttribute('aria-label', 'Previous preset');
    prev.addEventListener('click', () => this._stepPreset(-1));

    const next = document.createElement('button');
    next.className = 's37-preset-btn';
    next.textContent = '▶';
    next.setAttribute('aria-label', 'Next preset');
    next.addEventListener('click', () => this._stepPreset(1));

    const select = document.createElement('select');
    select.className = 'sub37-preset-select';
    PRESETS.forEach((patch) => {
      const opt = document.createElement('option');
      opt.value = patch.id;
      opt.textContent = `${String(patch.id).padStart(2, '0')}  ${patch.name}`;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      this._loadPreset(parseInt(select.value, 10));
    });

    this._presetSelect = select;
    row.append(prev, select, next);
    controls.appendChild(row);
    return controls;
  }

  _build() {
    const root = document.getElementById('sub37-root');
    const shell = document.createElement('div');
    shell.className = 'sub37-shell';
    shell.innerHTML = `
      <header class="sub37-top">
        <div class="sub37-brand">MOOG MUSIC</div>
        <div class="sub37-title">SUB 37 <b>BOB MOOG TRIBUTE</b></div>
      </header>
    `;

    const displayRow = document.createElement('div');
    displayRow.className = 'sub37-display-row';
    displayRow.appendChild(this.display.el);
    displayRow.appendChild(this._buildPresetControls());
    shell.appendChild(displayRow);

    const panel = document.createElement('div');
    panel.className = 'sub37-panel';

    const row = document.createElement('div');
    row.className = 'sub37-row';

    const osc = this._section('OSCILLATORS');
    this.knobs.osc1Shape = this._knob(osc.knobs, 'OSC 1 WAVE', 0, 1, 0.38, (v) => this.engine.voice?.osc1.setShape(v));
    this.knobs.osc1Tune = this._knob(osc.knobs, 'OSC 1 TUNE', -24, 24, 0, (v) => this.engine.voice?.osc1.setDetuneCents(v * 100), true);
    this.knobs.osc1Fine = this._knob(osc.knobs, 'OSC 1 FINE', -1, 1, 0, (v) => this.engine.voice?.osc1.setDetuneCents(v * 100), true);
    this.knobs.osc2Shape = this._knob(osc.knobs, 'OSC 2 WAVE', 0, 1, 0.38, (v) => this.engine.voice?.osc2.setShape(v));
    this.knobs.osc2Tune = this._knob(osc.knobs, 'OSC 2 TUNE', -24, 24, 0, (v) => this.engine.voice?.osc2.setDetuneCents(v * 100), true);
    this.knobs.osc2Detune = this._knob(osc.knobs, 'OSC 2 FINE', -1, 1, 0, (v) => this.engine.voice?.osc2.setDetuneCents(v * 100), true);
    this._buttons(osc.section, [['SYNC', true], ['DUO', false]], (v) => {
      if (v === true && this.engine.voice) this.engine.voice.setOsc2Ratio(2);
      else this.engine.voice?.setOsc2Ratio(1);
    });
    row.appendChild(osc.section);

    const mix = this._section('MIXER');
    this.knobs.osc1Level = this._knob(mix.knobs, 'OSC 1', 0, 1, 0.8, (v) => this.engine.voice?.mixer.setOsc1Level(v));
    this.knobs.subOsc = this._knob(mix.knobs, 'SUB OSC', 0, 1, 0.25, (v) => {
      if (this.subGain) this.subGain.gain.value = v;
    });
    this.knobs.osc2Level = this._knob(mix.knobs, 'OSC 2', 0, 1, 0.6, (v) => this.engine.voice?.mixer.setOsc2Level(v));
    this.knobs.noiseLevel = this._knob(mix.knobs, 'NOISE', 0, 1, 0.08, (v) => this.engine.voice?.mixer.setNoiseLevel(v));
    row.appendChild(mix.section);

    const filter = this._section('FILTER');
    this.knobs.cutoff = this._knob(filter.knobs, 'CUTOFF', 20, 18000, 4000, (v) => this.engine.voice?.setBaseCutoff(v));
    this.knobs.resonance = this._knob(filter.knobs, 'RESONANCE', 0, 1, 0.18, (v) => this.engine.voice?.filter.setResonance(v));
    this.knobs.drive = this._knob(filter.knobs, 'DRIVE', 0, 1, 0.08, (v) => this.engine.voice?.filter.setDrive(v));
    this.knobs.filterEnvAmount = this._knob(filter.knobs, 'FILTER EG', -8000, 8000, 3000, (v) => this.engine.voice?.setFilterEnvAmount(v), true);
    this.knobs.keyTrack = this._knob(filter.knobs, 'KEY TRACK', 0, 1, 0.5, (v) => this.engine.voice?.setKeyTrackAmount(v));
    this._filterSlopeButtons = this._buttons(filter.section, [['24dB', 24], ['18dB', 18], ['12dB', 12], ['6dB', 6]], (v) => {
      this.engine.voice?.filter.setSlope(v);
      this.display.showParameter('FILTER SLOPE', `${v}dB`);
    }, 24);
    row.appendChild(filter.section);

    const mod = this._section('MODULATION');
    this.knobs.lfoRate = this._knob(mod.knobs, 'LFO RATE', 0.01, 100, 5.5, (v) => this.engine.setLFORate(v));
    this.knobs.lfoFilter = this._knob(mod.knobs, 'LFO AMT', 0, 1, 0.25, (v) => this.engine.setLFODestinationBaseAmount('filter', v));
    this.knobs.modWheel = this._knob(mod.knobs, 'MOD WHEEL', 0, 1, 0, (v) => this.engine.setModWheel(v));
    this.knobs.lfoPitch = this._knob(mod.knobs, 'LFO PITCH', 0, 1, 0.12, (v) => this.engine.setLFODestinationBaseAmount('pitch', v));
    this._lfoWaveButtons = this._buttons(mod.section, [['TRI', 'triangle'], ['SQR', 'square'], ['S&H', 'sh'], ['RAMP', 'saw']], (v) => this.engine.setLFOWaveform(v), 'triangle');
    row.appendChild(mod.section);
    panel.appendChild(row);

    const envRow = document.createElement('div');
    envRow.className = 'sub37-row';

    const filterEnv = this._section('FILTER ENV');
    this.filterEnvKnobs = [];
    ['ATTACK', 'DECAY', 'SUSTAIN', 'RELEASE'].forEach((name, i) => {
      const knob = this._knob(filterEnv.knobs, name, i === 2 ? 0 : 0.001, i === 2 ? 1 : 4, i === 2 ? 0.35 : 0.2, (v) => {
        if (!this.engine.voice) return;
        this.engine.voice.filterEnv.setADSR({ attack: i === 0 ? v : this.engine.voice.filterEnv.attack, decay: i === 1 ? v : this.engine.voice.filterEnv.decay, sustain: i === 2 ? v : this.engine.voice.filterEnv.sustain, release: i === 3 ? v : this.engine.voice.filterEnv.release });
      });
      this.filterEnvKnobs.push(knob);
    });
    envRow.appendChild(filterEnv.section);

    const ampEnv = this._section('AMP ENV');
    this.ampEnvKnobs = [];
    ['ATTACK', 'DECAY', 'SUSTAIN', 'RELEASE'].forEach((name, i) => {
      const knob = this._knob(ampEnv.knobs, name, i === 2 ? 0 : 0.001, i === 2 ? 1 : 4, i === 2 ? 0.78 : 0.18, (v) => {
        if (!this.engine.voice) return;
        this.engine.voice.ampEnv.setADSR({ attack: i === 0 ? v : this.engine.voice.ampEnv.attack, decay: i === 1 ? v : this.engine.voice.ampEnv.decay, sustain: i === 2 ? v : this.engine.voice.ampEnv.sustain, release: i === 3 ? v : this.engine.voice.ampEnv.release });
      });
      this.ampEnvKnobs.push(knob);
    });
    envRow.appendChild(ampEnv.section);

    const out = this._section('OUTPUT / GLIDE');
    this.knobs.volume = this._knob(out.knobs, 'VOLUME', 0, 1, 0.25, (v) => this.engine.setMasterVolume(v));
    this.knobs.glide = this._knob(out.knobs, 'GLIDE', 0, 1, 0.15, (v) => this.engine.glide.setTime(v));
    this._buttons(out.section, [['MONO', false], ['DUO', true]], (v) => { this.engine.voice?.setOsc2Ratio(v ? 1.5 : 1); });
    envRow.appendChild(out.section);
    panel.appendChild(envRow);

    shell.appendChild(panel);

    const lower = document.createElement('div');
    lower.className = 's37-lower';

    const wood1 = document.createElement('div');
    wood1.className = 's37-wood';
    lower.appendChild(wood1);

    const wheels = document.createElement('div');
    wheels.className = 's37-wheels';

    const pitchWrap = document.createElement('div');
    pitchWrap.className = 's37-wheel-wrap';
    const pitchLabel = document.createElement('div');
    pitchLabel.className = 's37-wheel-label';
    pitchLabel.textContent = 'PITCH';
    this.pitchWheel = new PitchWheel({ onChange: (v) => this.engine.setPitchBend(v) });
    pitchWrap.appendChild(pitchLabel);
    pitchWrap.appendChild(this.pitchWheel.el);

    const modWrap = document.createElement('div');
    modWrap.className = 's37-wheel-wrap';
    const modLabel = document.createElement('div');
    modLabel.className = 's37-wheel-label';
    modLabel.textContent = 'MOD';
    this.modWheel = new ModWheel({ onChange: (v) => this.engine.setModWheel(v) });
    modWrap.appendChild(modLabel);
    modWrap.appendChild(this.modWheel.el);

    wheels.append(pitchWrap, modWrap);
    lower.appendChild(wheels);

    const keybed = document.createElement('div');
    keybed.className = 's37-keybed';
    const keybedLabel = document.createElement('div');
    keybedLabel.className = 's37-keyboard-label';
    keybedLabel.textContent = 'SEMI-WEIGHTED KEYBOARD';
    this.keyboard = new Keyboard({
      startOctave: 2,
      octaves: 3,
      onNoteOn: (note, velocity) => this._handleNoteOn(note, velocity),
      onNoteOff: (note) => this._handleNoteOff(note),
    });
    keybed.appendChild(keybedLabel);
    keybed.appendChild(this.keyboard.el);
    lower.appendChild(keybed);

    const wood2 = document.createElement('div');
    wood2.className = 's37-wood';
    lower.appendChild(wood2);

    shell.appendChild(lower);
    shell.insertAdjacentHTML('beforeend', '<footer class="sub37-footer"><span><strong>37</strong> SEMI-WEIGHTED KEYS / AFTERTOUCH</span><span><strong>256</strong> PRESETS / 16 BANKS × 16 PATCHES</span><span>2-NOTE PARAPHONIC ANALOG SYNTHESIZER</span></footer>');
    root.appendChild(shell);
  }

  async _start() {
    if (this.engine.started) return;
    await this.engine.start();
    this.engine.setMasterVolume(0.25);
    this.engine.setModWheel(this.modWheel?.value ?? 0);
    this.engine.setPitchBend(0);

    this.subGain = this.engine.ctx.createGain();
    this.subGain.gain.value = 0.25;
    this.subOsc = this.engine.ctx.createOscillator();
    this.subOsc.type = 'square';
    this.subOsc.frequency.value = 110;
    this.subOsc.connect(this.subGain);
    this.subGain.connect(this.engine.voice.filter.input);
    this.subOsc.start();

    this._loadPreset(this.currentPresetIndex);
  }

  _loadPreset(index) {
    const safe = ((index % PRESETS.length) + PRESETS.length) % PRESETS.length;
    const patch = PRESETS[safe];
    this.currentPresetIndex = safe;

    if (this._presetSelect) this._presetSelect.value = String(safe);
    this.display.showPreset(safe, patch.name);

    if (!this.engine.voice) return;

    this.engine.voice.osc1.setShape(patch.osc1Shape);
    this.engine.voice.osc2.setShape(patch.osc2Shape);
    this.engine.voice.mixer.setOsc1Level(patch.osc1Level);
    this.engine.voice.mixer.setOsc2Level(patch.osc2Level);
    this.engine.voice.mixer.setNoiseLevel(patch.noiseLevel);
    this.engine.voice.osc2.setDetuneCents(patch.osc2Detune);
    this.engine.voice.setOsc2Ratio(patch.osc2Ratio);
    this.engine.voice.setBaseCutoff(patch.cutoff);
    this.engine.voice.filter.setResonance(patch.resonance);
    this.engine.voice.filter.setDrive(patch.drive);
    this.engine.voice.setFilterEnvAmount(patch.filterEnvAmount);
    this.engine.voice.setKeyTrackAmount(patch.keyTrack);
    this.engine.voice.filter.setSlope(24);

    this.engine.voice.filterEnv.setADSR(patch.filterEnv);
    this.engine.voice.ampEnv.setADSR(patch.ampEnv);

    this.engine.setLFORate(patch.lfoRate);
    this.engine.setLFOWaveform(patch.lfoWaveform);
    this.engine.setLFODestinationBaseAmount('pitch', patch.lfoToPitch);
    this.engine.setLFODestinationBaseAmount('filter', patch.lfoToFilter);
    this.engine.setLFODestinationBaseAmount('pulseWidth', patch.lfoToPW);
    this.engine.setLFODestinationBaseAmount('mix', patch.lfoToMix);
    this.engine.setLFODestinationBaseAmount('amplitude', patch.lfoToAmp);
    this.engine.setModWheel(this.modWheel?.value ?? 0);

    this.engine.glide.setTime(patch.glideTime);
    if (this.subGain) this.subGain.gain.value = patch.osc2Ratio < 0.9 ? 0.35 : 0.25;

    this._syncKnobsToPatch(patch);
  }

  _stepPreset(delta) {
    this._loadPreset(this.currentPresetIndex + delta);
  }

  _syncKnobsToPatch(patch) {
    const set = (key, value) => {
      if (this.knobs[key]) this.knobs[key].setValue(value, true);
    };

    set('osc1Shape', patch.osc1Shape);
    set('osc1Tune', 0);
    set('osc1Fine', 0);
    set('osc2Shape', patch.osc2Shape);
    set('osc2Tune', 0);
    set('osc2Detune', Math.max(-1, Math.min(1, patch.osc2Detune / 100)));
    set('osc1Level', patch.osc1Level);
    set('osc2Level', patch.osc2Level);
    set('noiseLevel', patch.noiseLevel);
    set('cutoff', patch.cutoff);
    set('resonance', patch.resonance);
    set('drive', patch.drive);
    set('filterEnvAmount', patch.filterEnvAmount);
    set('keyTrack', patch.keyTrack);
    set('lfoRate', patch.lfoRate);
    set('lfoFilter', patch.lfoToFilter);
    set('lfoPitch', patch.lfoToPitch);
    set('glide', patch.glideTime);

    if (this.filterEnvKnobs?.length === 4) {
      this.filterEnvKnobs[0].setValue(patch.filterEnv.attack, true);
      this.filterEnvKnobs[1].setValue(patch.filterEnv.decay, true);
      this.filterEnvKnobs[2].setValue(patch.filterEnv.sustain, true);
      this.filterEnvKnobs[3].setValue(patch.filterEnv.release, true);
    }

    if (this.ampEnvKnobs?.length === 4) {
      this.ampEnvKnobs[0].setValue(patch.ampEnv.attack, true);
      this.ampEnvKnobs[1].setValue(patch.ampEnv.decay, true);
      this.ampEnvKnobs[2].setValue(patch.ampEnv.sustain, true);
      this.ampEnvKnobs[3].setValue(patch.ampEnv.release, true);
    }

    this._lfoWaveButtons?.setValue(patch.lfoWaveform, false);
    this._filterSlopeButtons?.setValue(24, false);
  }

  _handleNoteOn(note, velocity) {
    if (!this.engine.started) return;
    this.engine.noteOn(note, velocity);
    if (this.subOsc && this.engine.voice) {
      this.subOsc.frequency.setValueAtTime(this.engine.voice._currentFreq / 2, this.engine.ctx.currentTime);
    }
    this.keyboard?.setKeyActive(note, true);
  }

  _handleNoteOff(note) {
    if (!this.engine.started) return;
    this.engine.noteOff(note);
    this.keyboard?.setKeyActive(note, false);
  }

  _bindPower() {
    const power = document.getElementById('sub37-power');
    if (!power) return;

    power.addEventListener('click', async () => {
      await this._start();
      power.remove();
    }, { once: true });
  }

  _fitToViewport() {
    const shell = document.querySelector('.sub37-shell');
    if (!shell) return;
    const scale = Math.min(1, window.innerWidth / 1320, window.innerHeight / 760);
    shell.style.transform = `translate(-50%, -50%) scale(${scale})`;
    shell.style.position = 'absolute';
    shell.style.left = '50%';
    shell.style.top = '50%';
    shell.style.transformOrigin = 'center center';
  }

  _isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  _bindScrollGuard() {
    window.addEventListener('keydown', (e) => {
      const onSynthPage = !!document.getElementById('sub37-root');
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
        this.engine.setOctaveShift(Math.max(-3, this.engine.getOctaveShift() - 1));
        return;
      }
      if (key === '=' || key === '+') {
        this.engine.setOctaveShift(Math.min(3, this.engine.getOctaveShift() + 1));
        return;
      }

      const note = KEY_TO_NOTE[key];
      if (note && !this._activeComputerKeys.has(key)) {
        this._activeComputerKeys.add(key);
        this._handleNoteOn(note, 0.85);
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
        this._handleNoteOff(note);
      }
    });

    window.addEventListener('blur', () => {
      this._pitchKeyState.tabDown = false;
      this._pitchKeyState.shiftDown = false;
      this._updatePitchFromKeys();
      this._modKeyState.up = false;
      this._modKeyState.down = false;
      this._stopModHold();
      this._activeComputerKeys.forEach((key) => {
        const note = KEY_TO_NOTE[key];
        if (note) this._handleNoteOff(note);
      });
      this._activeComputerKeys.clear();
    });
  }

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

  _updatePitchFromKeys() {
    const { tabDown, shiftDown } = this._pitchKeyState;
    let target = 0;
    if (tabDown) target += 1;
    if (shiftDown) target -= 1;

    if (target === 0) {
      this.pitchWheel.springReturnToCenter();
    } else {
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

  _nudgeModWheel(delta) {
    if (!this.modWheel) return;
    const next = Math.max(0, Math.min(1, this.modWheel.value + delta));
    this.modWheel.setExternalValue(next);
    this.engine.setModWheel(next);
  }
}

new Sub37();
