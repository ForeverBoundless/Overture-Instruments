/**
 * Generate a short WAV preview for an instrument preset without requiring the
 * emulator page or an unlocked live AudioContext. The tone follows the patch's
 * oscillator/filter/envelope settings where those values are available.
 */
const SAMPLE_RATE = 22050;
const MELODY = [60, 64, 67, 72, 71, 67, 69, 64, 62, 65, 69, 74, 72, 67, 65, 64];

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const midiFrequency = (note) => 440 * (2 ** ((note - 69) / 12));

function findValue(root, wantedKey, depth = 0) {
  if (!root || typeof root !== 'object' || depth > 8) return undefined;
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findValue(item, wantedKey, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const [key, value] of Object.entries(root)) {
    if (key.toLowerCase() === wantedKey.toLowerCase() && value !== undefined && value !== null) return value;
  }
  for (const value of Object.values(root)) {
    const found = findValue(value, wantedKey, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function firstValue(root, keys, fallback) {
  for (const key of keys) {
    const value = findValue(root, key);
    if (value !== undefined) return value;
  }
  return fallback;
}

function prophetRawValue(patch, index, fallback) {
  const values = patch?.layers?.[0]?.values;
  const value = Array.isArray(values) ? Number(values[index]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

function normalized(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number > 1.5) return clamp(number / 127, 0, 1);
  return clamp(number, 0, 1);
}

function seconds(value, fallback, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number > 2 ? number / 127 * max : number, 0.002, max);
}

function waveType(value, shapeValue, fallback = 'sawtooth') {
  const name = String(value ?? '').toLowerCase();
  if (name.includes('sine') || name === 'sin') return 'sine';
  if (name.includes('tri')) return 'triangle';
  if (name.includes('square') || name.includes('sqr') || name.includes('pulse') || name.includes('rect')) return 'square';
  if (name.includes('saw') || name.includes('ramp')) return 'sawtooth';
  if (name.includes('noise')) return 'sawtooth';
  const shape = Number(shapeValue);
  if (Number.isFinite(shape)) {
    if (shape < 0.22) return 'triangle';
    if (shape < 0.7) return 'sawtooth';
    return 'square';
  }
  return fallback;
}

function makeNoiseBuffer(context, lengthSeconds = 0.45) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * lengthSeconds), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  for (let i = 0; i < samples.length; i += 1) {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    samples[i] = ((seed ^ (seed >>> 14)) >>> 0) / 2147483648 - 1;
  }
  return buffer;
}

function scheduleNoise(context, output, noiseBuffer, start, duration, frequency, level, type = 'highpass') {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.value = 0.7;
  const gain = context.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, level), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(start);
  source.stop(start + duration + 0.015);
}

function scheduleKick(context, output, start, velocity = 1) {
  const oscillator = context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(148, start);
  oscillator.frequency.exponentialRampToValueAtTime(43, start + 0.16);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.88 * velocity, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + 0.44);
}

function scheduleSnare(context, output, noiseBuffer, start, velocity = 1) {
  scheduleNoise(context, output, noiseBuffer, start, 0.19, 1450, 0.34 * velocity);
  const oscillator = context.createOscillator();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(190, start);
  oscillator.frequency.exponentialRampToValueAtTime(112, start + 0.08);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.24 * velocity, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + 0.17);
}

function scheduleHat(context, output, noiseBuffer, start, velocity = 1, open = false) {
  scheduleNoise(context, output, noiseBuffer, start, open ? 0.24 : 0.055, 7200, (open ? 0.13 : 0.085) * velocity, 'highpass');
}

function scheduleTom(context, output, start, frequency, velocity = 1) {
  const oscillator = context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency * 1.45, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.12);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.26 * velocity, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + 0.26);
}

function schedule808(context, output, patch) {
  const tempo = clamp(firstValue(patch, ['tempo', 'bpm'], 110), 70, 160);
  const beat = 60 / tempo;
  const sixteenth = beat / 4;
  const noiseBuffer = makeNoiseBuffer(context);
  const at = (step) => step * sixteenth;

  // Two bars: kick on beats 1 and 3, snare on 2 and 4, eighth-note hats.
  for (let step = 0; step < 32; step += 1) {
    const barStep = step % 16;
    const time = at(step);
    if (barStep === 0 || barStep === 8) scheduleKick(context, output, time, barStep === 0 ? 1 : 0.82);
    if (barStep === 4) scheduleSnare(context, output, noiseBuffer, time, 0.88);
    if (step < 28 && barStep % 2 === 0) scheduleHat(context, output, noiseBuffer, time, barStep === 0 ? 0.85 : 0.72);
    if (barStep === 14) scheduleHat(context, output, noiseBuffer, time, 0.72, true);
  }

  // A short tom/snare pickup in the final beat of bar two.
  scheduleSnare(context, output, noiseBuffer, at(28), 0.82);
  scheduleTom(context, output, at(29), 115, 0.7);
  scheduleTom(context, output, at(30), 155, 0.82);
  scheduleSnare(context, output, noiseBuffer, at(31), 0.9);
  return { duration: 8 * beat + 0.55 };
}

function scheduleOscillator(context, destination, frequency, type, start, stop, detune = 0, level = 1) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.detune.setValueAtTime(detune, start);
  const gain = context.createGain();
  gain.gain.value = level;
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(stop);
  return oscillator;
}

function scheduleOrganVoice(context, destination, frequency, start, stop, velocity) {
  const partials = [1, 2, 3, 4, 6, 8];
  const levels = [0.42, 0.24, 0.18, 0.12, 0.08, 0.055];
  const sum = context.createGain();
  sum.gain.value = 1;
  sum.connect(destination);
  partials.forEach((ratio, index) => {
    scheduleOscillator(context, sum, frequency * ratio, 'sine', start, stop, 0, levels[index] * velocity);
  });
}


function scheduleKeyboardNote(context, output, instrumentId, patch, note, start, gate, velocity, controls) {
  const frequency = midiFrequency(note);
  const profile = controls.profile;
  const stop = start + gate + controls.release + 0.04;
  const filter = context.createBiquadFilter();
  filter.type = instrumentId === 'hohner-d6' ? 'bandpass' : 'lowpass';
  filter.Q.value = controls.resonance;
  filter.frequency.setValueAtTime(controls.cutoff * 0.68, start);
  filter.frequency.exponentialRampToValueAtTime(controls.cutoff, start + Math.min(0.18, controls.attack + 0.04));
  const envelope = context.createGain();
  const peak = (instrumentId === 'nord-c2d' ? 0.54 : 0.2) * velocity * controls.volume;
  const attackEnd = start + Math.max(0.003, controls.attack);
  const releaseStart = start + gate;
  const sustainLevel = Math.max(0.0001, peak * controls.sustain);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), attackEnd);
  envelope.gain.setTargetAtTime(sustainLevel, attackEnd + 0.01, Math.max(0.02, controls.decay / 3));
  envelope.gain.setValueAtTime(sustainLevel, releaseStart);
  envelope.gain.exponentialRampToValueAtTime(0.0001, releaseStart + controls.release);
  filter.connect(envelope);

  const panner = context.createStereoPanner ? context.createStereoPanner() : null;
  if (panner) {
    panner.pan.setValueAtTime(((note % 5) - 2) * 0.075, start);
    panner.connect(output);
    envelope.connect(panner);
  } else envelope.connect(output);

  if (instrumentId === 'nord-c2d') {
    scheduleOrganVoice(context, filter, frequency, start, stop, velocity * controls.volume);
    return;
  }

  if (instrumentId === 'dx7') {
    const operators = Array.isArray(patch.ops) ? patch.ops : [];
    const modulator = context.createOscillator();
    modulator.type = 'sine';
    const modCoarse = clamp(operators[0]?.coarse ?? 2, 0.5, 14);
    modulator.frequency.setValueAtTime(frequency * modCoarse, start);
    const depth = context.createGain();
    const modLevel = normalized(operators[0]?.level ?? 64, 0.5);
    depth.gain.value = frequency * (0.5 + modLevel * 3.2);
    modulator.connect(depth);
    const carrier = context.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(frequency, start);
    depth.connect(carrier.frequency);
    carrier.connect(filter);
    modulator.start(start);
    carrier.start(start);
    modulator.stop(stop);
    carrier.stop(stop);
    return;
  }

  if (instrumentId === 'mellotron-m400') {
    const tone = normalized(firstValue(patch, ['tone'], 0.6));
    scheduleOscillator(context, filter, frequency, 'sawtooth', start, stop, -5, 0.48 + tone * 0.1);
    scheduleOscillator(context, filter, frequency, 'triangle', start, stop, 4, 0.38);
    scheduleOscillator(context, filter, frequency * 2, 'sine', start, stop, 0, 0.12);
    return;
  }

  if (instrumentId === 'hohner-d6') {
    const tone = Number(firstValue(patch, ['tone'], 0));
    const type = tone === 2 ? 'triangle' : 'square';
    scheduleOscillator(context, filter, frequency, type, start, stop, 0, 0.7);
    scheduleOscillator(context, filter, frequency * 2.01, 'sine', start, stop, 0, 0.18);
    return;
  }

  const rawProgram = instrumentId === 'prophet-10';
  const rawSawA = prophetRawValue(patch, 3, 0);
  const rawSquareA = prophetRawValue(patch, 4, 0);
  const rawSawB = prophetRawValue(patch, 5, 0);
  const rawTriangleB = prophetRawValue(patch, 6, 0);
  const rawSquareB = prophetRawValue(patch, 7, 0);
  const firstWave = instrumentId === 'juno-106'
    ? (patch.saw ? 'saw' : patch.pulse ? 'pulse' : 'saw')
    : firstValue(patch, ['osc1Wave', 'dds1Wave', 'vco1Wave', 'osc1Shape'], rawProgram ? (rawSquareA > rawSawA ? 'pulse' : 'saw') : undefined);
  const secondWave = instrumentId === 'juno-106'
    ? (patch.pulse ? 'pulse' : firstWave)
    : firstValue(patch, ['osc2Wave', 'dds2Wave', 'vco2Wave', 'osc2Shape'], rawProgram
      ? (rawTriangleB > rawSawB && rawTriangleB > rawSquareB ? 'triangle' : rawSquareB > rawSawB ? 'pulse' : 'saw')
      : firstWave);
  const shape = firstValue(patch, ['osc1Shape'], undefined);
  const secondShape = firstValue(patch, ['osc2Shape'], undefined);
  const wave1 = waveType(firstWave, shape, 'sawtooth');
  const wave2 = waveType(secondWave, secondShape, wave1);
  const osc1Level = normalized(firstValue(patch, ['osc1Level', 'dds1Level', 'mix1'], 0.8), 0.8);
  const osc2Level = normalized(firstValue(patch, ['osc2Level', 'dds2Level', 'mix2'], 0.42), 0.42);
  const detuneValue = Number(firstValue(patch, ['osc2Detune', 'osc2FineCents', 'osc2Tune'], 7));
  const detune = Number.isFinite(detuneValue) ? clamp(Math.abs(detuneValue) <= 1 ? detuneValue * 100 : detuneValue, -900, 900) : 7;
  scheduleOscillator(context, filter, frequency, wave1, start, stop, 0, 0.58 + osc1Level * 0.35);
  if (osc2Level > 0.015) scheduleOscillator(context, filter, frequency, wave2, start, stop, detune, osc2Level * 0.65);
  if (instrumentId === 'juno-106' || instrumentId === 'udo-super-8') {
    scheduleOscillator(context, filter, frequency, wave1, start, stop, -8, 0.18);
  }
}

function scheduleKeyboard(context, output, instrumentId, patch) {
  const beat = 60 / 112;
  const eighth = beat / 2;
  const rawProgram = instrumentId === 'prophet-10';
  const rawCutoff = Number(firstValue(patch, ['cutoff', 'filterCutoff', 'lpCut'], rawProgram ? prophetRawValue(patch, 17, 70) : 0.56));
  const cutoff = rawCutoff > 24 ? clamp(rawProgram ? 180 * (16000 / 180) ** (rawCutoff / 127) : rawCutoff, 220, 10500) : 180 * (16000 / 180) ** normalized(rawCutoff, 0.56);
  const rawAttack = firstValue(patch, ['ampAttack', 'attack', 'env1Attack', 'env2Attack'], rawProgram ? prophetRawValue(patch, 44, undefined) : undefined);
  const rawDecay = firstValue(patch, ['ampDecay', 'decay', 'env1Decay'], rawProgram ? prophetRawValue(patch, 46, undefined) : undefined);
  const rawSustain = firstValue(patch, ['ampSustain', 'sustain', 'env1Sustain', 'env2Sustain'], rawProgram ? prophetRawValue(patch, 48, undefined) : undefined);
  const rawRelease = firstValue(patch, ['ampRelease', 'release', 'env1Release', 'env2Release'], rawProgram ? prophetRawValue(patch, 50, undefined) : undefined);
  const profile = {
    attack: instrumentId === 'mellotron-m400' ? 0.065 : instrumentId === 'hohner-d6' ? 0.004 : instrumentId === 'nord-c2d' ? 0.006 : 0.014,
  };
  const controls = {
    cutoff: clamp(cutoff, 250, 10000),
    resonance: 0.7 + normalized(firstValue(patch, ['resonance', 'res', 'lpPeak'], rawProgram ? prophetRawValue(patch, 18, 16) : 0.12)) * 5.5,
    attack: Math.min(0.15, seconds(rawAttack, profile.attack, 0.65)),
    decay: seconds(rawDecay, instrumentId === 'hohner-d6' ? 0.12 : 0.24, 1),
    sustain: instrumentId === 'hohner-d6' ? 0.15 : normalized(rawSustain, instrumentId === 'nord-c2d' ? 0.92 : 0.68),
    release: seconds(rawRelease, instrumentId === 'mellotron-m400' ? 0.24 : 0.12, 0.8),
    volume: clamp(normalized(firstValue(patch, ['master', 'volume'], 0.8), 0.8), 0.35, 1),
    profile,
  };
  const noteGate = eighth * 0.82;
  MELODY.forEach((note, index) => {
    const start = index * eighth;
    const velocity = [0.78, 0.62, 0.7, 0.88][index % 4];
    scheduleKeyboardNote(context, output, instrumentId, patch, note, start, noteGate, velocity, controls);
  });
  return { duration: 8 * beat + controls.release + 0.45 };
}

function audioBufferToWav(buffer) {
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

export async function generateInstrumentPreview(instrumentId, patch) {
  if (!instrumentId || !patch || typeof patch !== 'object') throw new Error('A valid instrument preset is required to generate its preview.');
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error('Automatic previews need Web Audio OfflineAudioContext, which is unavailable in this browser.');
  const tempo = instrumentId === 'tr-808' ? clamp(firstValue(patch, ['tempo', 'bpm'], 110), 70, 160) : 112;
  const beat = 60 / tempo;
  const tail = instrumentId === 'tr-808' ? 0.65 : 1.0;
  const duration = 8 * beat + tail;
  const context = new OfflineContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const master = context.createGain();
  master.gain.value = instrumentId === 'tr-808' ? 0.62 : 0.82;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;
  master.connect(compressor);
  compressor.connect(context.destination);

  if (instrumentId === 'tr-808') schedule808(context, master, patch);
  else scheduleKeyboard(context, master, instrumentId, patch);

  const rendered = await context.startRendering();
  return audioBufferToWav(rendered);
}
