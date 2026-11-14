/**
 * Render Community previews with the same instrument engines and saved patch
 * formats used by the live emulator pages. Preview note events are scheduled
 * into the offline audio clock; no generic oscillator substitute is used.
 */
import { WorkletEngine } from './workletEngine.js';
import { AudioEngine } from '../engine/AudioEngine.js';
import { PresetManager } from '../engine/PresetManager.js';
import { Sub37Engine } from '../engine/Sub37Engine.js';
import { NordC2DEngine } from '../engine/NordC2DEngine.js';
import { TR808Engine, LANES } from '../engine/TR808Engine.js';
import { Prophet10Engine } from '../engine/Prophet10Engine.js';
import { COMMUNITY_INSTRUMENTS } from '../data/communityInstruments.js';
import { stripCommunityPresetMetadata } from './communityPreset.js';

const SAMPLE_RATE = 44100;
const TEMPO = 112;
const EIGHTH = 60 / TEMPO / 2;
const NOTE_GATE = EIGHTH * 0.82;
const START_OFFSET = 0.06;
const MELODY = [48, 52, 55, 60, 59, 55, 57, 52, 50, 53, 57, 62, 60, 55, 53, 52];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

function noteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

function offlineContext(duration, channels = 2) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) throw new Error('Automatic previews need Web Audio OfflineAudioContext, which is unavailable in this browser.');
  return new Offline(channels, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
}

export function postWorkletMessage(engine, message) {
  if (typeof engine?.post === 'function') {
    engine.post(message);
    return;
  }

  // Older or instrument-specific wrappers may expose the AudioWorkletNode
  // without forwarding the shared .post() convenience method.
  const port = engine?.node?.port;
  if (typeof port?.postMessage === 'function') {
    port.postMessage(message);
    return;
  }

  throw new TypeError('The preview engine is missing its AudioWorklet message port.');
}

function queueWorkletPhrase(engine, context, notes = MELODY, { startOffset = START_OFFSET, gate = NOTE_GATE, spacing = EIGHTH } = {}) {
  buildWorkletPhrase(context.sampleRate, notes, { startOffset, gate, spacing }).forEach((message) => {
    postWorkletMessage(engine, message);
  });
}

function buildWorkletPhrase(sampleRate, notes = MELODY, { startOffset = START_OFFSET, gate = NOTE_GATE, spacing = EIGHTH } = {}) {
  const events = [];
  notes.forEach((note, index) => {
    const start = startOffset + index * spacing;
    const frame = Math.round(start * sampleRate);
    const offFrame = Math.round((start + gate) * sampleRate);
    const velocity = [0.78, 0.62, 0.7, 0.88][index % 4];
    events.push({ t: 'noteOn', note, vel: velocity, frame });
    events.push({ t: 'noteOff', note, frame: offFrame });
  });
  return events;
}

function queueNativePhrase(engine, notes = MELODY, { startOffset = START_OFFSET, gate = NOTE_GATE, spacing = EIGHTH } = {}) {
  notes.forEach((note, index) => {
    const start = startOffset + index * spacing;
    const name = noteName(note);
    const velocity = [0.78, 0.62, 0.7, 0.88][index % 4];
    engine.noteOn(name, velocity, start);
    engine.noteOff(name, start + gate);
  });
}

let previewFlushId = 0;

async function render(context, engine = null) {
  if (!engine?.node?.port) {
    const buffer = await context.startRendering();
    return audioBufferToWav(buffer);
  }

  const port = engine.node.port;
  const id = ++previewFlushId;
  const acknowledged = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      port.removeEventListener('message', onMessage);
      reject(new Error('The instrument audio processor did not acknowledge its preview events.'));
    }, 3000);
    const onMessage = (event) => {
      if (event.data?.t !== '__preview_flush_ack' || event.data.id !== id) return;
      clearTimeout(timeout);
      port.removeEventListener('message', onMessage);
      resolve();
    };
    port.addEventListener('message', onMessage);
    port.start?.();
    port.postMessage({ t: '__preview_flush', id });
  });

  // Starting the offline render lets the AudioWorklet receive its queued
  // messages. Wait for its acknowledgement before considering the buffer ready.
  const rendering = context.startRendering();
  await acknowledged;
  return audioBufferToWav(await rendering);
}

async function renderLittlePhatty(context, patch) {
  const engine = new AudioEngine();
  await engine.start(context);
  const presets = new PresetManager(engine);
  presets.applyPatch(patch);
  queueNativePhrase(engine);
  return render(context);
}

async function renderSub37(context, patch) {
  const engine = new Sub37Engine();
  await engine.start(context);

  engine.setOscillator(0, {
    shape: patch.osc1Shape, level: patch.osc1Level,
    semitones: patch.osc1Semitones ?? 0, fineCents: patch.osc1FineCents ?? 0,
  });
  engine.setOscillator(1, {
    shape: patch.osc2Shape, level: patch.osc2Level,
    semitones: patch.osc2Semitones ?? 0, fineCents: patch.osc2FineCents ?? 0,
  });
  engine.setMixer({ sub: patch.subLevel, noise: patch.noiseLevel });
  engine.setFilter({
    cutoff: patch.cutoff, resonance: patch.resonance, drive: patch.drive,
    keyTrack: patch.keyTrack, envAmount: patch.filterEnvAmount,
    slope: Number(patch.communityState?.filterSlope ?? 24),
  });
  engine.setEnvelope('filter', patch.filterEnv);
  engine.setEnvelope('amp', patch.ampEnv);
  engine.setLFO(0, { rate: patch.lfo1Rate, waveform: patch.lfo1Wave });
  engine.setLFO(1, { rate: patch.lfo2Rate });
  engine.setModulation(0, patch.mod1);
  engine.setModulation(1, patch.mod2);
  engine.setDuoMode(!!patch.duo);
  engine.voice?.setOsc2SyncEnabled(!!patch.sync);

  const extra = patch.communityState || {};
  if (extra.osc1Octave !== undefined) engine.setOscillator(0, { octave: Number(extra.osc1Octave) });
  if (extra.osc2Octave !== undefined) engine.setOscillator(1, { octave: Number(extra.osc2Octave) });
  if (extra.fineTune !== undefined) engine.setFineTune(extra.fineTune);
  if (extra.glideTime !== undefined) engine.setGlide(undefined, extra.glideTime);
  if (extra.glideEnabled !== undefined) engine.setGlide(!!extra.glideEnabled);
  if (extra.legato !== undefined) engine.legato = !!extra.legato;
  if (extra.bendRange !== undefined) engine.setPitchBendRange(extra.bendRange);
  if (extra.masterVolume !== undefined) engine.setMasterVolume(extra.masterVolume);
  if (Array.isArray(extra.lfoWaves)) extra.lfoWaves.forEach((wave, index) => engine.setLFO(index, { waveform: wave }));

  queueNativePhrase(engine);
  return render(context);
}

function applyNordRegistration(engine, patch) {
  engine.setModel(patch.model);
  engine.setCrosstalk(patch.crosstalk || 'Vintage 3');
  engine.setKeyClick(patch.keyClick || 'Normal', patch.keyBounce !== false);
  engine.greatSplit = !!patch.greatSplit;
  engine.pedal = {
    ...engine.pedal, ...patch.pedal,
    drawbars: [...patch.pedal.drawbars], notes: new Map(),
  };
  engine.pipe = {
    stops: [...patch.pipe.stops],
    couplers: [...patch.pipe.couplers],
    tremulant: !!patch.pipe.tremulant,
  };
  patch.manuals.forEach((source, index) => {
    const manual = engine.manuals[index];
    Object.assign(manual, source, {
      drawbars: [...source.drawbars],
      banks: { A: [...source.banks.A], B: [...source.banks.B] },
    });
    manual.activeBank = source.activeBank === 'B' ? 'B' : 'A';
    manual.percussion = !!source.percussion;
    engine.setDrawbarBank(index, manual.activeBank);
    engine.setVibrato(index, manual.vibrato);
    engine.octaveShift[index] = patch.octaveShift[index] || 0;
  });
  patch.pipe.stops.forEach((enabled, index) => engine.setPipeStop(index, enabled));
  patch.pipe.couplers.forEach((enabled, index) => {
    if (index === 5) engine.setTremulant(enabled);
    else engine.setPipeCoupler(index, enabled);
  });
  engine.setGreatSplit(!!patch.greatSplit);
  engine.expressionLevel = clamp(patch.expressionLevel ?? 1, 0, 1);
  engine.setReverb(patch.reverb ?? 0.18);
  engine.setDrive(patch.drive ?? 0);
  engine.masterLevel = clamp(patch.masterLevel ?? 0.55, 0, 1);
  engine.rotary = !!patch.rotary;
  engine.rotaryEnabled = !!patch.rotaryEnabled;
}

async function renderNord(context, patch) {
  const engine = new NordC2DEngine();
  applyNordRegistration(engine, patch);
  await engine.start(context);
  engine.setExpression(patch.expressionLevel ?? 1);
  if (patch.rotaryEnabled) engine.setRotary(!!patch.rotary);
  else engine.setRotaryEnabled(false);

  // Use both manuals, as the registration stores two independent drawbar and
  // vibrato states. The left-hand part is deliberately sparse so it does not
  // obscure the patch's upper-manual tone.
  const bassNotes = [48, 48, 50, 45];
  bassNotes.forEach((midi, index) => {
    const start = START_OFFSET + index * (EIGHTH * 4);
    const name = noteName(midi);
    engine.noteOn(0, name, 0.72, start);
    engine.noteOff(0, name, start + EIGHTH * 1.5);
  });
  MELODY.forEach((midi, index) => {
    const start = START_OFFSET + index * EIGHTH;
    const name = noteName(midi);
    engine.noteOn(1, name, [0.78, 0.62, 0.7, 0.88][index % 4], start);
    engine.noteOff(1, name, start + NOTE_GATE);
  });
  return render(context);
}

async function renderTR808(context, patch) {
  const engine = new TR808Engine();
  await engine.start(context);
  engine.params = JSON.parse(JSON.stringify(patch.params));
  engine.variants = { ...patch.variants };
  engine.length = Number(patch.length) === 32 ? 32 : 16;
  engine.setTempo(patch.tempo);
  engine.setMaster(0.8);

  const steps = engine.length === 32 ? 32 : 32;
  const stepDuration = 60 / clamp(patch.tempo, 40, 300) / 4;
  for (let step = 0; step < steps; step += 1) {
    const sourceStep = step % engine.length;
    const time = START_OFFSET + step * stepDuration;
    const accent = !!patch.lanes.AC?.[sourceStep];
    LANES.filter((lane) => lane.id !== 'AC').forEach((lane) => {
      const value = patch.lanes[lane.id]?.[sourceStep] || 0;
      if (!value) return;
      const variant = patch.variants?.[lane.id] || lane.id;
      engine.trigger(variant, time, accent || value === 2);
    });
  }
  const length = START_OFFSET + steps * stepDuration + 0.8;
  // Extend a little beyond the fixed context to preserve the longest cymbal tail.
  if (length > context.length / context.sampleRate) throw new Error('The TR-808 preview pattern is too long to render.');
  return render(context);
}

async function renderProphet10(context, patch) {
  const programs = patch.layers.map((program) => ({
    values: program.values,
    extras: {
      velAmount: program.extras.velAmount,
      atAmount: program.extras.atAmount,
      qComp: program.extras.qComp,
      polyUnison: !!program.extras.polyUnison && !program.values[52],
    },
  }));
  const layerState = patch.layers[0].extras || {};
  const mode = ['stack', 'split'].includes(layerState.layerMode) ? layerState.layerMode : 'normal';
  const balance = clamp(layerState.balance ?? 0.5, 0, 1);
  const volumes = mode === 'normal'
    ? [1, 1]
    : [Math.min(1, (1 - balance) * 2), Math.min(1, balance * 2)];
  const globals = patch.globals || {};
  const messages = [
    { t: 'globals', releaseMode: globals.releaseMode === 'rel' ? 'rel' : 'hold',
      fiveVoice: !!globals.fiveVoice, roundRobin: globals.voiceAlloc === 'rr',
      qCompMode: globals.qCompMode === 'prg' ? 'prg' : 'vin' },
    { t: 'mode', mode, splitPoint: layerState.splitPoint ?? 60, volumes },
    { t: 'program', layer: 0, values: programs[0].values, extras: programs[0].extras },
    ...(mode !== 'normal' ? [{ t: 'program', layer: 1, values: programs[1].values, extras: programs[1].extras }] : []),
    { t: 'transpose', semis: Number(globals.transpose) || 0 },
    { t: 'volume', value: 0.72 },
    ...buildWorkletPhrase(context.sampleRate),
  ];
  const engine = new Prophet10Engine();
  await engine.start(context, { messages });
  return render(context, engine);
}

async function renderWorklet(context, processorPath, processorName, patch, instrumentId, instrumentOptions = {}) {
  const workletOptions = { ...instrumentOptions };
  if (instrumentId === 'ms-20') workletOptions.inputs = 1;

  const messages = instrumentId === 'ms-20'
    ? [{ t: 'patch', patch: patch.params }, { t: 'cables', cables: patch.cables || [] }]
    : [{ t: 'patch', patch }];
  messages.push(...buildWorkletPhrase(context.sampleRate));

  // AudioWorkletProcessor receives processorOptions in its constructor,
  // before OfflineAudioContext starts advancing its render clock.
  workletOptions.processorOptions = { messages };
  const engine = new WorkletEngine(new URL(processorPath, import.meta.url).href, processorName, workletOptions);
  await engine.start(context);

  if (Number.isFinite(Number(instrumentOptions.volume))) engine.setVolume(Number(instrumentOptions.volume));
  return render(context, engine);
}

export function audioBufferToWav(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  const writeText = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clamp(channelData[channel][frame], -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: 'audio/wav' });
}

/**
 * Every Community instrument has one patch-aware renderer. New emulator IDs
 * must be paired with a renderer; tests fail if either list drifts.
 */
const STANDARD_PREVIEW_DURATION = START_OFFSET + MELODY.length * EIGHTH + 1.4;
export const INSTRUMENT_PREVIEW_RENDERERS = Object.freeze({
  'little-phatty': (patch) => renderLittlePhatty(offlineContext(STANDARD_PREVIEW_DURATION), patch),
  'sub-37': (patch) => renderSub37(offlineContext(STANDARD_PREVIEW_DURATION), patch),
  'prophet-10': (patch) => renderProphet10(offlineContext(STANDARD_PREVIEW_DURATION), patch),
  'nord-c2d': (patch) => renderNord(offlineContext(STANDARD_PREVIEW_DURATION), patch),
  'dx7': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/DX7Processor.js', 'dx7-processor', patch, 'dx7', { volume: patch.volume ?? 0.7 }),
  'juno-106': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/JunoProcessor.js', 'juno-processor', patch, 'juno-106', { volume: patch.volume ?? 0.7 }),
  'tr-808': (patch) => {
    const tempo = clamp(patch.tempo, 40, 300);
    return renderTR808(offlineContext(START_OFFSET + 32 * (60 / tempo / 4) + 2.8), patch);
  },
  'ms-20': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/MS20Processor.js', 'ms20-processor', patch, 'ms-20'),
  'mellotron-m400': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/MellotronProcessor.js?v=20261104-declick', 'mellotron-processor', patch, 'mellotron-m400'),
  'oberheim-eight-voice': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/OberheimEightVoiceProcessor.js?v=20261104-eightvoice-stable', 'oberheim-eight-voice-processor', patch, 'oberheim-eight-voice'),
  'hohner-d6': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/HohnerD6Processor.js?v=20261106-audio-r1', 'hohner-d6-processor', patch, 'hohner-d6'),
  'ob-xa': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/OBXaProcessor.js?v=20261106-audio-r1', 'obxa-processor', patch, 'ob-xa'),
  'sequential-pro-3': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/Pro3Processor.js', 'pro3-processor', patch, 'sequential-pro-3'),
  'udo-super-8': (patch) => renderWorklet(offlineContext(STANDARD_PREVIEW_DURATION), '../engine/Super8Processor.js', 'super8-processor', patch, 'udo-super-8'),
});
export async function generateInstrumentPreview(instrumentId, patch) {
  if (!instrumentId || !patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('A valid instrument preset is required to generate its preview.');
  }
  if (!COMMUNITY_INSTRUMENTS.some((instrument) => instrument.id === instrumentId)) {
    throw new Error(`Previews are not supported for the instrument "${instrumentId}".`);
  }
  const renderPreview = INSTRUMENT_PREVIEW_RENDERERS[instrumentId];
  if (typeof renderPreview !== 'function') throw new Error(`No Community preview renderer is registered for "${instrumentId}".`);
  return renderPreview(stripCommunityPresetMetadata(patch));
}
