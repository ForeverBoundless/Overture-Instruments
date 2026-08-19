/**
 * PresetManager.js
 *
 * Bridges the static factory preset data to the live AudioEngine/Voice
 * parameters, and handles user preset persistence via localStorage
 * (save/load/rename/delete/import/export as JSON), plus auto-saving the
 * last session so reloading the page restores where the user left off.
 */

import { PRESETS, getPreset } from '../data/presets.js';

const STORAGE_KEY_USER_PRESETS = 'littlePhatty.userPresets';
const STORAGE_KEY_LAST_SESSION = 'littlePhatty.lastSession';

export class PresetManager {
  /**
   * @param {import('./AudioEngine.js').AudioEngine} engine
   * @param {(preset:object)=>void} [onApply] - callback fired after a preset is applied, so UI can sync knob positions.
   */
  constructor(engine, onApply) {
    this.engine = engine;
    this.onApply = onApply;
    this.currentPresetId = 0;
    this.currentPresetSource = 'factory'; // 'factory' | 'user'
    this.userPresets = this._loadUserPresets();
    this._factorySnapshots = new Map();
    this._userSnapshots = new Map();
    this._lastAppliedPatch = null;
  }

  get factoryPresets() {
    return PRESETS;
  }

  _loadUserPresets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_USER_PRESETS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  _saveUserPresets() {
    try {
      localStorage.setItem(STORAGE_KEY_USER_PRESETS, JSON.stringify(this.userPresets));
    } catch (e) {
      // localStorage unavailable (private browsing, quota) - fail silently,
      // in-memory state still works for the current session.
    }
  }

  /** Apply a full patch object's parameters to the live engine's single voice. */
  applyPatch(patch) {
    const engine = this.engine;
    const voice = engine.voice;
    if (!voice) return;

    voice.osc1.setShape(patch.osc1Shape);
    voice.osc2.setShape(patch.osc2Shape);
    voice.mixer.setOsc1Level(patch.osc1Level);
    voice.mixer.setOsc2Level(patch.osc2Level);
    voice.mixer.setNoiseLevel(patch.noiseLevel);
    voice.osc2.setDetuneCents(patch.osc2Detune);
    voice.setOsc2Ratio(patch.osc2Ratio);

    voice.setBaseCutoff(patch.cutoff);
    voice.filter.setResonance(patch.resonance);
    voice.filter.setDrive(patch.drive);
    voice.setKeyTrackAmount(patch.keyTrack);
    voice.setFilterEnvAmount(patch.filterEnvAmount);

    voice.ampEnv.setADSR(patch.ampEnv);
    voice.filterEnv.setADSR(patch.filterEnv);

    engine.setLFORate(patch.lfoRate);
    engine.setLFOWaveform(patch.lfoWaveform);
    engine.setLFODestinationBaseAmount('pitch', patch.lfoToPitch);
    engine.setLFODestinationBaseAmount('filter', patch.lfoToFilter);
    engine.setLFODestinationBaseAmount('pulseWidth', patch.lfoToPW);
    engine.setLFODestinationBaseAmount('mix', patch.lfoToMix);
    engine.setLFODestinationBaseAmount('amplitude', patch.lfoToAmp);

    engine.glide.setTime(patch.glideTime);
    this._lastAppliedPatch = { ...patch };
    if (this.currentPresetSource === 'factory') {
      this._factorySnapshots.set(this.currentPresetId, JSON.parse(JSON.stringify(patch)));
    } else if (this.currentPresetSource === 'user') {
      this._userSnapshots.set(this.currentPresetId, JSON.parse(JSON.stringify(patch)));
    }

    this.onApply?.(patch);
  }

  _snapshotForCurrentSource(patch) {
    if (this.currentPresetSource === 'factory') {
      this._factorySnapshots.set(this.currentPresetId, JSON.parse(JSON.stringify(patch)));
    } else if (this.currentPresetSource === 'user') {
      this._userSnapshots.set(this.currentPresetId, JSON.parse(JSON.stringify(patch)));
    }
  }

  loadFactory(id) {
    const factoryPatch = this._factorySnapshots.get(id) ?? getPreset(id);
    this.currentPresetId = id;
    this.currentPresetSource = 'factory';
    this.applyPatch(factoryPatch);
    this._autoSaveSession();
    return factoryPatch;
  }

  loadUser(index) {
    const patch = this._userSnapshots.get(index) ?? this.userPresets[index];
    if (!patch) return null;
    this.currentPresetId = index;
    this.currentPresetSource = 'user';
    this.applyPatch(patch);
    this._autoSaveSession();
    return patch;
  }

  /** Capture the CURRENT live engine state into a patch object (for saving). */
  captureCurrentPatch(name) {
    const voice = this.engine.voice;
    return {
      name: name || 'Untitled',
      osc1Shape: voice.osc1.shape,
      osc2Shape: voice.osc2.shape,
      osc1Level: voice.mixer._osc1Base ?? 0.8,
      osc2Level: voice.mixer._osc2Base ?? 0.6,
      osc2Detune: voice.osc2._detuneCentsValue ?? 0,
      osc2Ratio: voice._osc2Ratio ?? 1,
      noiseLevel: voice.mixer._noiseBase ?? voice.noise._level ?? voice.noise.output.gain.value,
      cutoff: voice._baseCutoffHz,
      resonance: voice.filter.getResonance(),
      drive: voice.filter.getDrive(),
      keyTrack: voice._keyTrackAmount,
      filterEnvAmount: voice._filterEnvAmountHz,
      ampEnv: { attack: voice.ampEnv.attack, decay: voice.ampEnv.decay, sustain: voice.ampEnv.sustain, release: voice.ampEnv.release },
      filterEnv: { attack: voice.filterEnv.attack, decay: voice.filterEnv.decay, sustain: voice.filterEnv.sustain, release: voice.filterEnv.release },
      lfoRate: this.engine.lfos.main.rate,
      lfoWaveform: this.engine.lfos.main.waveform,
      lfoToPitch: this.engine._lfoDestinationBaseAmounts?.pitch ?? 0,
      lfoToFilter: this.engine._lfoDestinationBaseAmounts?.filter ?? 0,
      lfoToPW: this.engine._lfoDestinationBaseAmounts?.pulseWidth ?? 0,
      lfoToMix: this.engine._lfoDestinationBaseAmounts?.mix ?? 0,
      lfoToAmp: this.engine._lfoDestinationBaseAmounts?.amplitude ?? 0,
      glideTime: this.engine.glide.timeSec,
    };
  }

  rememberCurrentState() {
    if (!this.engine?.voice) return null;
    const patch = this.captureCurrentPatch();
    this._snapshotForCurrentSource(patch);
    return patch;
  }

  saveAsUserPreset(name) {
    const patch = this.captureCurrentPatch(name);
    this.userPresets.push(patch);
    this._saveUserPresets();
    return this.userPresets.length - 1;
  }

  renameUserPreset(index, newName) {
    if (!this.userPresets[index]) return false;
    this.userPresets[index].name = newName;
    this._saveUserPresets();
    return true;
  }

  deleteUserPreset(index) {
    if (!this.userPresets[index]) return false;
    this.userPresets.splice(index, 1);
    this._saveUserPresets();
    return true;
  }

  exportJSON() {
    return JSON.stringify({ version: 1, presets: this.userPresets }, null, 2);
  }

  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const incoming = Array.isArray(data) ? data : data.presets;
      if (!Array.isArray(incoming)) throw new Error('Invalid preset file format');
      this.userPresets = this.userPresets.concat(incoming);
      this._saveUserPresets();
      return true;
    } catch (e) {
      return false;
    }
  }

  _autoSaveSession() {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_SESSION, JSON.stringify({
        presetId: this.currentPresetId,
        source: this.currentPresetSource,
      }));
    } catch (e) {
      // Non-fatal.
    }
  }

  /** Called once on startup to restore the last session, if any. */
  restoreLastSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LAST_SESSION);
      if (!raw) return this.loadFactory(0);
      const { presetId, source } = JSON.parse(raw);
      if (source === 'user' && this.userPresets[presetId]) {
        return this.loadUser(presetId);
      }
      return this.loadFactory(presetId ?? 0);
    } catch (e) {
      return this.loadFactory(0);
    }
  }
}
