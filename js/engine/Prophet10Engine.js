/**
 * Prophet10Engine.js
 *
 * Main-thread front end for the Prophet-10 AudioWorklet (Prophet10Processor.js).
 * It owns the AudioContext and forwards programs, panel edits and performance
 * events to the DSP. Every piece of state is cached so it can be (re)sent the
 * moment audio starts; calls made before start() are therefore never lost.
 */

const PROCESSOR_URL = new URL('./Prophet10Processor.js', import.meta.url);

export class Prophet10Engine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.started = false;
    this._starting = null;
    this.layers = [
      { values: null, extras: {} },
      { values: null, extras: {} },
    ];
    this.state = {
      mode: { mode: 'normal', splitPoint: 60, volumes: [1, 1] },
      globals: { releaseMode: 'hold', fiveVoice: false, roundRobin: false, qCompMode: 'vin' },
      volume: 0.7,
      masterTune: 0,
      transpose: 0,
      tuning: null,
      bend: 0,
      mod: 0,
      at: 0,
      brightness: 0,
      filterPedal: 0,
      expression: 1,
      midiVolume: 1,
      a440: false,
      mute: false,
    };
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  start() {
    if (this.started) return Promise.resolve(true);
    if (this._starting) return this._starting;
    this._starting = (async () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser.');
      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
      if (!this.ctx.audioWorklet) throw new Error('AudioWorklet is not available (a secure https:// or localhost page is required).');
      const resume = this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
      await this.ctx.audioWorklet.addModule(PROCESSOR_URL.href);
      this.node = new AudioWorkletNode(this.ctx, 'prophet10-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.node.connect(this.ctx.destination);
      await resume;
      this.started = true;
      this._sendAll();
      return true;
    })();
    this._starting.catch(() => { this._starting = null; });
    return this._starting;
  }

  _post(message) {
    if (this.node) this.node.port.postMessage(message);
  }

  _sendAll() {
    const s = this.state;
    this._post({ t: 'globals', ...s.globals });
    this._post({ t: 'mode', ...s.mode });
    this.layers.forEach((layer, index) => {
      if (layer.values) this._post({ t: 'program', layer: index, values: layer.values, extras: layer.extras });
    });
    this._post({ t: 'volume', value: s.volume });
    this._post({ t: 'masterTune', cents: s.masterTune });
    this._post({ t: 'transpose', semis: s.transpose });
    this._post({ t: 'tuning', table: s.tuning });
    this._post({ t: 'bend', value: s.bend });
    this._post({ t: 'mod', value: s.mod });
    this._post({ t: 'at', value: s.at });
    this._post({ t: 'brightness', value: s.brightness });
    this._post({ t: 'filterPedal', value: s.filterPedal });
    this._post({ t: 'expression', value: s.expression });
    this._post({ t: 'midiVolume', value: s.midiVolume });
    this._post({ t: 'a440', on: s.a440 });
    this._post({ t: 'mute', on: s.mute });
  }

  // ----------------------------------------------------------------- programs
  loadProgram(layer, values, extras = {}) {
    const index = layer === 1 ? 1 : 0;
    this.layers[index].values = Array.from(values);
    this.layers[index].extras = { ...extras };
    this._post({ t: 'program', layer: index, values: this.layers[index].values, extras: this.layers[index].extras });
  }

  setParam(layer, index, value) {
    const target = this.layers[layer === 1 ? 1 : 0];
    if (target.values) target.values[index] = value;
    this._post({ t: 'param', layer: layer === 1 ? 1 : 0, index, value });
  }

  setExtras(layer, extras) {
    const target = this.layers[layer === 1 ? 1 : 0];
    Object.assign(target.extras, extras);
    this._post({ t: 'extras', layer: layer === 1 ? 1 : 0, extras });
  }

  setMode(mode, splitPoint, volumes) {
    const m = this.state.mode;
    m.mode = mode;
    if (typeof splitPoint === 'number') m.splitPoint = splitPoint;
    if (Array.isArray(volumes)) m.volumes = volumes.slice(0, 2);
    this._post({ t: 'mode', ...m });
  }

  setGlobals(patch) {
    Object.assign(this.state.globals, patch);
    this._post({ t: 'globals', ...patch });
  }

  // ------------------------------------------------------------- performance
  noteOn(note, velocity) { this._post({ t: 'noteOn', note, vel: velocity }); }
  noteOff(note) { this._post({ t: 'noteOff', note }); }
  allNotesOff() { this._post({ t: 'allNotesOff' }); }
  allSoundOff() { this._post({ t: 'allSoundOff' }); }
  setSustain(down) { this._post({ t: 'sustain', down: !!down }); }

  _set(key, type, field, value) {
    this.state[key] = value;
    this._post({ t: type, [field]: value });
  }

  setPitchBend(value) { this._set('bend', 'bend', 'value', value); }
  setModWheel(value) { this._set('mod', 'mod', 'value', value); }
  setAftertouch(value) { this._set('at', 'at', 'value', value); }
  setBrightness(value) { this._set('brightness', 'brightness', 'value', value); }
  setFilterPedal(value) { this._set('filterPedal', 'filterPedal', 'value', value); }
  setExpression(value) { this._set('expression', 'expression', 'value', value); }
  setMidiVolume(value) { this._set('midiVolume', 'midiVolume', 'value', value); }
  setVolume(value) { this._set('volume', 'volume', 'value', value); }
  setMasterTune(cents) { this._set('masterTune', 'masterTune', 'cents', cents); }
  setTranspose(semis) { this._set('transpose', 'transpose', 'semis', semis); }
  setTuning(table) { this._set('tuning', 'tuning', 'table', table ? Array.from(table) : null); }
  setA440(on) { this._set('a440', 'a440', 'on', !!on); }
  setMute(on) { this._set('mute', 'mute', 'on', !!on); }
  calibrate() { this._post({ t: 'calibrate' }); }
}
