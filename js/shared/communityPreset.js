import { MidiManager } from '../engine/MidiManager.js';

/**
 * Shared exchange between every Overture emulator and the Community library.
 * Community records are validated again by the receiving emulator before use.
 */
export const COMMUNITY_INSTRUMENT_IMPORT_KEY = 'overture.community.instrument-import';
const IMPORT_KEY = COMMUNITY_INSTRUMENT_IMPORT_KEY;
export const COMMUNITY_PREVIEW_MAX_DURATION_MS = 10_000;
const DRAFT_KEY = 'overture.community.instrument-draft';
const SOURCE_KEY = 'overture.community.source-item';
export const COMMUNITY_PRESET_SELECTION_KEY = '__overturePresetSelection';

function getSessionStorage() {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; }
  catch { return null; }
}
function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

function normalizePresetSelection(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
  const kind = selection.kind === 'factory' || selection.kind === 'user' ? selection.kind : null;
  const name = typeof selection.name === 'string' ? selection.name.slice(0, 80) : '';
  if (!kind || !name) return null;
  const result = { kind, name };
  if (selection.value !== undefined && selection.value !== null) result.value = String(selection.value).slice(0, 100);
  if (selection.index !== undefined && Number.isInteger(Number(selection.index))) result.index = Number(selection.index);
  if (typeof selection.id === 'string' && selection.id) result.id = selection.id.slice(0, 100);
  return result;
}

export function readCommunityPresetMetadata(data) {
  try { return normalizePresetSelection(data?.[COMMUNITY_PRESET_SELECTION_KEY]); }
  catch { return null; }
}
export function stripCommunityPresetMetadata(data) {
  const copy = cloneJson(data);
  if (copy && typeof copy === 'object' && !Array.isArray(copy)) delete copy[COMMUNITY_PRESET_SELECTION_KEY];
  return copy;
}

/**
 * Transpose is a performance control, not part of a shareable instrument patch.
 * Walk nested patch objects so legacy Prophet-10 globals and layered instruments
 * are normalized in the same way as patches with root-level transpose settings.
 */
export function stripCommunityInstrumentTranspose(instrumentId, data) {
  const copy = stripCommunityPresetMetadata(data);
  if (typeof instrumentId !== 'string' || !instrumentId || !copy || typeof copy !== 'object') return copy;

  const excludedKeys = new Set(['transpose', 'transposeUp', 'transposeDown']);
  const visit = (value, depth = 0, parentKey = '') => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth, parentKey));
      return;
    }
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach((key) => {
      const isObXaTimbreTranspose = instrumentId === 'ob-xa'
        && key === 'transpose'
        && (depth === 0 || (depth === 1 && parentKey === 'layerB'));
      if (excludedKeys.has(key) && !isObXaTimbreTranspose) delete value[key];
      else visit(value[key], depth + 1, key);
    });
  };
  visit(copy);
  return copy;
}
export function attachCommunityPresetMetadata(data, selection) {
  const copy = stripCommunityPresetMetadata(data);
  const normalized = normalizePresetSelection(selection);
  if (normalized && copy && typeof copy === 'object' && !Array.isArray(copy)) copy[COMMUNITY_PRESET_SELECTION_KEY] = normalized;
  return copy;
}
function currentPresetSelection() {
  if (typeof document === 'undefined') return null;
  const selector = document.querySelector('[data-overture-preset-selector="true"]');
  try { return normalizePresetSelection(selector?.getCommunityPresetSelection?.()); }
  catch { return null; }
}
export function restoreCommunityPresetSelection(selection) {
  const normalized = normalizePresetSelection(selection);
  if (!normalized || typeof document === 'undefined') return false;
  const selector = document.querySelector('[data-overture-preset-selector="true"]');
  if (!selector) return false;
  try {
    if (typeof selector.restoreCommunityPresetSelection === 'function') return !!selector.restoreCommunityPresetSelection(normalized);
    const options = [...(selector.options || [])];
    const exact = normalized.value && options.find((option) => option.value === normalized.value);
    const named = options.find((option) => option.textContent.trim().endsWith(normalized.name));
    const match = exact || named;
    if (!match) return false;
    selector.value = match.value;
    return true;
  } catch { return false; }
}
export function setCommunitySource(source) {
  try {
    const storage = getSessionStorage();
    if (!storage) return false;
    if (!source) storage.removeItem(SOURCE_KEY);
    else storage.setItem(SOURCE_KEY, JSON.stringify(source));
    return true;
  } catch { return false; }
}
export function consumeCommunitySource(recordType, instrumentId = null) {
  try {
    const storage = getSessionStorage();
    if (!storage) return null;
    const raw = storage.getItem(SOURCE_KEY);
    if (!raw) return null;
    storage.removeItem(SOURCE_KEY);
    const source = JSON.parse(raw);
    if (!source || source.recordType !== recordType || (instrumentId && source.instrumentId !== instrumentId)) return null;
    return source;
  } catch {
    try { getSessionStorage()?.removeItem(SOURCE_KEY); } catch { /* storage unavailable */ }
    return null;
  }
}

function installCommunityPreviewRecorder({ instrumentId, getAudioOutput }) {
  const token = new URLSearchParams(window.location.search).get('communityPreviewRecording');
  if (!token) return null;

  const style = document.createElement('style');
  style.textContent = `
    .oi-community-recorder {
      --oi-rec-bg: rgba(14,18,26,.97);
      --oi-rec-border: rgba(196,147,255,.28);
      --oi-rec-ink: #edf1f7;
      --oi-rec-muted: #aab4c2;
      --oi-rec-soft: rgba(196,147,255,.09);
      position: fixed;
      z-index: 2147483000;
      top: 18px;
      right: 18px;
      width: min(410px, calc(100vw - 28px));
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--oi-rec-border);
      border-radius: 13px;
      background: var(--oi-rec-bg);
      color: var(--oi-rec-ink);
      box-shadow: 0 18px 54px rgba(0,0,0,.46), inset 0 1px rgba(255,255,255,.045);
      font: 13px/1.5 'Inter Variable', Inter, system-ui, sans-serif;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    .oi-community-recorder__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 15px 11px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      background: linear-gradient(135deg, rgba(196,147,255,.105), transparent 72%);
    }
    .oi-community-recorder__identity {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 10px;
    }
    .oi-community-recorder__identity img {
      width: 23px;
      height: 23px;
      flex: 0 0 23px;
      object-fit: contain;
    }
    .oi-community-recorder__identity > div {
      display: grid;
      min-width: 0;
      gap: 2px;
    }
    .oi-community-recorder__identity strong {
      color: #dec4ff;
      font: 650 9px/1.25 'Inter Variable', Inter, sans-serif;
      letter-spacing: .13em;
    }
    .oi-community-recorder__identity span {
      color: var(--oi-rec-muted);
      font: 600 9px/1.25 'DM Mono', monospace;
      letter-spacing: .065em;
    }
    .oi-community-recorder__limit {
      flex: 0 0 auto;
      padding: 5px 7px;
      border: 1px solid rgba(196,147,255,.22);
      border-radius: 5px;
      background: var(--oi-rec-soft);
      color: #d9c0f7;
      font: 600 8px/1 'DM Mono', monospace;
      letter-spacing: .07em;
      white-space: nowrap;
    }
    .oi-community-recorder__copy {
      margin: 0 !important;
      padding: 13px 15px 10px;
      color: var(--oi-rec-muted);
      font-size: 12px;
      line-height: 1.55;
    }
    .oi-community-recorder__status {
      display: flex;
      min-height: 34px;
      align-items: center;
      margin: 0 15px 13px !important;
      padding: 7px 9px;
      border: 1px solid rgba(196,147,255,.16);
      border-radius: 7px;
      background: var(--oi-rec-soft);
      color: #d9c0f7 !important;
      font-size: 11px !important;
      line-height: 1.35;
    }
    .oi-community-recorder__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 11px 15px 13px;
      border-top: 1px solid rgba(255,255,255,.075);
      background: rgba(0,0,0,.13);
    }
    .oi-community-recorder button {
      min-height: 32px;
      padding: 0 11px;
      border: 1px solid rgba(196,147,255,.24);
      border-radius: 6px;
      background: rgba(196,147,255,.08);
      color: #e8d8fb;
      font: 650 9px/1 'Inter Variable', Inter, sans-serif;
      letter-spacing: .075em;
      cursor: pointer;
      transition: background .16s ease, border-color .16s ease, color .16s ease, opacity .16s ease;
    }
    .oi-community-recorder button[data-record-start] {
      border-color: rgba(196,147,255,.7);
      background: linear-gradient(135deg, #e0caff, #bd91f0);
      color: #28153b;
      box-shadow: inset 0 1px rgba(255,255,255,.55), 0 3px 10px rgba(156,93,221,.18);
    }
    .oi-community-recorder button[data-record-start]:hover:not(:disabled) {
      background: linear-gradient(135deg, #ebdcff, #cba8f8);
    }
    .oi-community-recorder button[data-record-stop],
    .oi-community-recorder button.is-recording {
      border-color: rgba(255,112,112,.35);
      background: rgba(255,112,112,.08);
      color: #ffaaaa;
    }
    .oi-community-recorder button[data-record-return] {
      margin-left: auto;
      border-color: transparent;
      background: transparent;
      color: var(--oi-rec-muted);
    }
    .oi-community-recorder button:hover:not(:disabled) {
      border-color: rgba(196,147,255,.55);
      background: rgba(196,147,255,.15);
      color: #fff;
    }
    .oi-community-recorder button:focus-visible {
      outline: 2px solid #c493ff;
      outline-offset: 2px;
    }
    .oi-community-recorder button:disabled {
      opacity: .42;
      cursor: not-allowed;
    }
    html[data-theme="light"] .oi-community-recorder {
      --oi-rec-bg: rgba(250,252,255,.98);
      --oi-rec-border: rgba(116,59,184,.22);
      --oi-rec-ink: #1c2939;
      --oi-rec-muted: #596b80;
      --oi-rec-soft: rgba(116,59,184,.07);
      border-color: var(--oi-rec-border);
      box-shadow: 0 18px 48px rgba(45,60,81,.2), inset 0 1px rgba(255,255,255,.95);
    }
    html[data-theme="light"] .oi-community-recorder__head {
      border-bottom-color: rgba(43,59,78,.1);
      background: linear-gradient(135deg, rgba(116,59,184,.09), transparent 72%);
    }
    html[data-theme="light"] .oi-community-recorder__identity img { filter: brightness(0); }
    html[data-theme="light"] .oi-community-recorder__identity strong { color: #6930aa; }
    html[data-theme="light"] .oi-community-recorder__limit {
      border-color: rgba(116,59,184,.2);
      color: #6930aa;
    }
    html[data-theme="light"] .oi-community-recorder__status {
      border-color: rgba(116,59,184,.16);
      color: #6930aa !important;
    }
    html[data-theme="light"] .oi-community-recorder__actions {
      border-top-color: rgba(43,59,78,.1);
      background: rgba(230,235,243,.48);
    }
    html[data-theme="light"] .oi-community-recorder button {
      border-color: rgba(116,59,184,.22);
      background: rgba(116,59,184,.06);
      color: #54228f;
    }
    html[data-theme="light"] .oi-community-recorder button[data-record-start] {
      border-color: #b88cde;
      background: linear-gradient(135deg, #ead8ff, #cfb1f1);
      color: #39204f;
    }
    html[data-theme="light"] .oi-community-recorder button[data-record-stop],
    html[data-theme="light"] .oi-community-recorder button.is-recording {
      border-color: rgba(178,55,55,.26);
      background: rgba(178,55,55,.06);
      color: #a42f2f;
    }
    html[data-theme="light"] .oi-community-recorder button[data-record-return] {
      color: #596b80;
    }
    html[data-theme="light"] .oi-community-recorder button:hover:not(:disabled) {
      border-color: rgba(116,59,184,.42);
      background: rgba(116,59,184,.12);
      color: #54228f;
    }
    @media (max-width: 480px) {
      .oi-community-recorder { top: 10px; right: 10px; width: calc(100vw - 20px); }
      .oi-community-recorder__head { padding-inline: 12px; }
      .oi-community-recorder__copy { padding-inline: 12px; }
      .oi-community-recorder__status { margin-inline: 12px !important; }
      .oi-community-recorder__actions { padding-inline: 12px; }
      .oi-community-recorder button[data-record-return] { margin-left: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .oi-community-recorder button { transition: none; }
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.className = 'oi-community-recorder';
  panel.setAttribute('aria-label', 'Community preview recording');
  panel.innerHTML = `
    <div class="oi-community-recorder__head">
      <div class="oi-community-recorder__identity">
        <img src="/ui/Logos/OvertureLogo.png" alt="">
        <div>
          <strong>OVERTURE COMMUNITY</strong>
          <span>PATCH PREVIEW RECORDING</span>
        </div>
      </div>
      <span class="oi-community-recorder__limit">MAX 10 SEC</span>
    </div>
    <p class="oi-community-recorder__copy">Power on the instrument, then record yourself playing. This captures the instrument's audio output, not your microphone. You can record up to 10 seconds.</p>
    <p class="oi-community-recorder__status" role="status" aria-live="polite">Ready when the instrument is powered on.</p>
    <div class="oi-community-recorder__actions">
      <button type="button" data-record-start>START RECORDING</button>
      <button type="button" class="is-recording" data-record-stop disabled>STOP</button>
      <button type="button" data-record-return>RETURN TO COMMUNITY</button>
    </div>`;
  document.body.appendChild(panel);

  const status = panel.querySelector('.oi-community-recorder__status');
  const startButton = panel.querySelector('[data-record-start]');
  const stopButton = panel.querySelector('[data-record-stop]');
  const returnButton = panel.querySelector('[data-record-return]');
  let recorder = null;
  let source = null;
  let destination = null;
  let chunks = [];
  let startedAt = 0;
  let stopTimer = 0;
  let displayTimer = 0;

  const cleanup = () => {
    clearTimeout(stopTimer);
    clearInterval(displayTimer);
    if (source && destination) {
      try { source.disconnect(destination); } catch { /* the audio graph may already be closed */ }
    }
    destination?.stream?.getTracks?.().forEach((track) => track.stop());
    source = null;
    destination = null;
    recorder = null;
    startButton.disabled = false;
    stopButton.disabled = true;
  };

  const stop = () => {
    if (!recorder || recorder.state === 'inactive') return;
    clearTimeout(stopTimer);
    clearInterval(displayTimer);
    stopButton.disabled = true;
    status.textContent = 'Finishing recording…';
    recorder.stop();
  };

  startButton.addEventListener('click', async () => {
    if (recorder && recorder.state !== 'inactive') return;
    if (!window.MediaRecorder) {
      status.textContent = 'This browser does not support in-browser audio recording.';
      return;
    }
    try {
      source = getAudioOutput?.();
      const context = source?.context;
      if (!source || !context || typeof context.createMediaStreamDestination !== 'function') {
        throw new Error('Power on the instrument first, then start recording.');
      }
      if (context.state === 'suspended') await context.resume();
      if (context.state !== 'running') throw new Error('The instrument audio engine is not running. Press Power and try again.');

      destination = context.createMediaStreamDestination();
      source.connect(destination);
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'];
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported?.(type));
      recorder = mimeType ? new MediaRecorder(destination.stream, { mimeType }) : new MediaRecorder(destination.stream);
      chunks = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.addEventListener('error', () => {
        cleanup();
        status.textContent = 'Recording failed. Check that the instrument is powered on and try again.';
      }, { once: true });
      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunks, { type: recorder?.mimeType || mimeType || 'audio/webm' });
        const actualMime = blob.type.split(';')[0] || 'audio/webm';
        cleanup();
        if (!blob.size) {
          status.textContent = 'No audio was captured. Play a few notes while recording and try again.';
          return;
        }
        if (!window.opener || window.opener.closed) {
          status.textContent = 'The Community publishing tab is no longer available. Reopen the recorder from the publishing form.';
          return;
        }
        window.opener.postMessage({
          type: 'overture-community-preview-recorded',
          token,
          instrumentId,
          blob,
          mimeType: actualMime,
        }, window.location.origin);
        status.textContent = 'Recording sent to Community. You can record another take or return to the publishing form.';
        chunks = [];
      }, { once: true });

      recorder.start(200);
      startedAt = Date.now();
      startButton.disabled = true;
      stopButton.disabled = false;
      status.textContent = 'Recording… 10.0s remaining';
      displayTimer = window.setInterval(() => {
        const remaining = Math.max(0, COMMUNITY_PREVIEW_MAX_DURATION_MS - (Date.now() - startedAt));
        status.textContent = `Recording… ${(remaining / 1000).toFixed(1)}s remaining`;
        if (remaining <= 0) stop();
      }, 100);
      stopTimer = window.setTimeout(stop, COMMUNITY_PREVIEW_MAX_DURATION_MS);
    } catch (error) {
      cleanup();
      status.textContent = error?.message || 'Could not start recording.';
    }
  });

  stopButton.addEventListener('click', stop);
  returnButton.addEventListener('click', () => {
    if (recorder && recorder.state !== 'inactive') stop();
    window.close();
  });
  window.addEventListener('pagehide', cleanup, { once: true });
  return panel;
}


const EMULATOR_TOPBAR_INFO = {
  'sub-37': {
    title: 'MOOG SUB 37',
    detail: '37-KEY MONOPHONIC ANALOG SYNTHESIZER',
    help: {
      summary: 'The Sub 37 is a two-oscillator mono synth with a ladder filter, modulation, an arpeggiator and a step sequencer. Its paraphonic mode can sound two notes at once while sharing parts of the signal path.',
      sections: [
        ['Play notes', 'Use the on-screen keyboard, a MIDI keyboard, or the computer keys A W S E D F T G Y H U J K O L P ; and apostrophe. Hold a key to sustain the note; release it to end the note.'],
        ['Shape the sound', 'Set oscillator waveforms and levels in the oscillator area, then shape brightness and movement with the mixer, ladder filter, envelopes and modulation controls. The filter cutoff and resonance are good starting points.'],
        ['Performance', 'Use the pitch and modulation wheels for expressive control. The arpeggiator and step sequencer have their own rate, pattern and clock-sync settings. MIDI clock can drive synced playback.'],
        ['MIDI', 'MIDI note input, pitch bend, mod wheel, sustain, program changes and MIDI clock are supported. Connect a controller before playing; audio must be powered on separately.']
      ]
    }
  },
  'nord-c2d': {
    title: 'NORD C2D',
    detail: 'DUAL-MANUAL COMBO ORGAN',
    help: {
      summary: 'The C2D has two independent 37-key manuals and four organ models: B3, VX, Farf and Pipe. You can play the manuals separately or configure the split and pedal controls.',
      sections: [
        ['Play the manuals', 'Click either on-screen keyboard. On your computer, the upper manual uses Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P [ = ], while the lower manual uses Z S X D C V G B H N J M , L . ; /.'],
        ['Choose an organ', 'Use ORGAN MODEL to switch between B3, VX, Farf and Pipe. The model panel changes to show the controls for that organ. Adjust drawbars or registers to change the tone.'],
        ['Performance controls', 'ROTARY enables the rotary effect; choose its speed in ROTARY SPEED. REVERB and DRIVE add ambience and grit. TO GREAT, PEDAL and the split controls determine how the manuals and pedal part are routed.'],
        ['MIDI', 'Connect a controller to play notes. Sustain, expression, volume, program changes and the mod-wheel rotary switch are supported.']
      ]
    }
  },
  'dx7': {
    title: 'YAMAHA DX7',
    detail: 'SIX-OPERATOR FM DIGITAL SYNTHESIZER',
    help: {
      summary: 'The DX7 creates sounds through frequency modulation (FM). Each of its six operators can act as a carrier or modulator, and the algorithm determines how they are connected.',
      sections: [
        ['Play notes', 'Use the on-screen keyboard, a MIDI controller, or the computer-keyboard note row: A W S E D F T G Y H U J K O L P ; and apostrophe. Use the octave controls to move the range when needed.'],
        ['Build an FM sound', 'Choose an algorithm, then set each operator’s frequency, level and envelope. A carrier contributes directly to the sound; a modulator changes another operator’s frequency and therefore its harmonic content.'],
        ['Envelopes and modulation', 'Edit each operator’s rate/level envelope to control how its sound changes over time. Modulation sensitivity and pitch settings affect how the patch responds to performance controls.'],
        ['MIDI', 'MIDI notes and the instrument’s supported performance controls are received automatically when a controller is connected. Power on the instrument before expecting sound.']
      ]
    }
  },
  'tr-808': {
    title: 'ROLAND TR-808',
    detail: 'STEP-PROGRAMMABLE RHYTHM COMPOSER',
    help: {
      summary: 'The TR-808 is a drum machine rather than a pitched keyboard. Build a rhythm by placing hits on the step grid, then shape each drum voice and set the pattern tempo.',
      sections: [
        ['Enter a pattern', 'Choose a step on a drum lane to toggle its hit. Use the pattern-length controls to work with 16 or 32 steps. The active step follows the sequencer during playback.'],
        ['Shape the kit', 'Select a drum lane and adjust its available voice controls. Use the lane’s instrument/variant choices for the alternate sounds, and adjust accent and master level to balance the pattern.'],
        ['Transport and tempo', 'Press Space to start or stop playback. Set TEMPO to change the pattern speed. MIDI Start, Continue, Stop and clock messages can control synced playback.'],
        ['MIDI', 'The TR-808 accepts the General MIDI drum-note map, MIDI transport and MIDI volume. Connect a controller or sequencer to trigger sounds externally.']
      ]
    }
  },
  'ob-xa': {
    title: 'OBERHEIM OB-Xa',
    detail: 'DUAL-TIMBRE POLYPHONIC ANALOG SYNTHESIZER',
    help: {
      summary: 'The OB-Xa combines two oscillators per voice with a classic analog filter and envelope controls. It can run as a single full keyboard, split the keyboard, or layer two timbres.',
      sections: [
        ['Play notes', 'Use the on-screen keyboard, a MIDI keyboard, or the computer keys A W S E D F T G Y H U J K O L P ; and apostrophe. The on-screen keyboard covers the available playing range.'],
        ['Choose a voice mode', 'FULL uses one timbre across the keyboard. SPLIT assigns timbres to opposite keyboard zones, and DOUBLE layers both timbres. Choose the voice count and unison options in the global controls.'],
        ['Edit timbres', 'Select TIMBRE A or B before changing its oscillator, pulse-width, filter, envelope and LFO settings. The layer selector determines which sound you are editing.'],
        ['MIDI', 'MIDI note input, pitch bend, modulation, sustain and program changes are supported. The master and voice-mode settings affect the whole instrument.']
      ]
    }
  },
  'udo-super-8': {
    title: 'UDO SUPER 8',
    detail: 'EIGHT-VOICE HYBRID POLYSYNTH',
    help: {
      summary: 'The Super 8 combines digital oscillators with an analog-style signal path and a performance-focused control surface. Use its layer and voice controls to move between single sounds and more complex combinations.',
      sections: [
        ['Play notes', 'Play the 61-note on-screen keyboard or connect a MIDI keyboard. The computer-keyboard note row is A W S E D F T G Y H U J K O L P ; and apostrophe.'],
        ['Shape a patch', 'Work through the oscillator, mixer, filter, envelope and modulation sections. The controls update the sound as you adjust them; use the display to check the current value or mode.'],
        ['Layers and performance', 'Select the active layer before editing its sound. The performance controls, modulation sources and sequencer provide movement beyond a held keyboard note. Use the on-screen bender for expressive pitch and modulation changes.'],
        ['MIDI', 'The Super 8 receives MIDI notes and performance data through its MIDI input. Connect a controller and power on the audio engine before playing.']
      ]
    }
  },
  'sequential-pro-3': {
    title: 'SEQUENTIAL PRO 3',
    detail: 'THREE-OSCILLATOR MONOPHONIC SYNTHESIZER',
    help: {
      summary: 'The Pro 3 is a mono synth with three oscillators, multiple filter types, modulation routing, effects, an arpeggiator and a multitrack sequencer.',
      sections: [
        ['Play notes', 'Use the on-screen keybed or a MIDI controller. The computer-keyboard note row is A W S E D F T G Y H U J K O L P ; and apostrophe. The Pro 3 is monophonic, so overlapping notes follow its selected priority and glide behaviour.'],
        ['Create a sound', 'Start with oscillator levels and waveforms, then set the filter type, cutoff and resonance. Shape the filter and amplifier with their envelopes; use the LFOs and modulation matrix to add movement.'],
        ['Sequence and effects', 'Enable the arpeggiator or sequencer to create repeating patterns. The sequencer can target notes or synthesis parameters. FX 1 and FX 2 provide separate effect stages.'],
        ['MIDI', 'MIDI note input and the shared performance controls are available. MIDI clock can be used by tempo-synced functions; power on the synth before playing.']
      ]
    }
  },
  'little-phatty': {
    title: 'MOOG LITTLE PHATTY',
    detail: '37-KEY ANALOG MONOPHONIC SYNTHESIZER',
    help: {
      summary: 'The Little Phatty is a hands-on mono synth. Its signal path runs from two oscillators through the mixer and filter to the amplifier.',
      sections: [
        ['Play notes', 'Use the on-screen keyboard or the computer keys A W S E D F T G Y H U J K O L P ; and apostrophe. The keyboard is monophonic. Use - and = to shift the computer-keyboard octave, from three octaves down to three up.'],
        ['Pitch and modulation', 'Tab bends pitch up and Left Shift bends down; release the key to return to centre. The Up and Down arrows adjust the mod wheel. The modulation amount is set in the LFO section and is brought in with the mod wheel.'],
        ['Shape the sound', 'Set oscillator waveforms and levels, then adjust filter cutoff and resonance. The filter and amplifier envelopes control the sound over time. Glide is heard when you play legato, pressing a new note before releasing the previous one.'],
        ['Controls and MIDI', 'Drag knobs to change them, use the mouse wheel for small adjustments, double-click to reset, or right-drag for fine control. A connected MIDI keyboard can play notes and send pitch bend, mod wheel, sustain and other supported controller data.']
      ]
    }
  },
  'mellotron-m400': {
    title: 'MELLOTRON M400',
    detail: 'THREE-TRACK TAPE-REPLAY KEYBOARD',
    help: {
      summary: 'The M400 plays recorded tape sounds rather than synthesizing oscillators. Choose a tape frame, select one of its three tracks, and play the keyboard.',
      sections: [
        ['Choose a tape sound', 'Select one of the installed tape frames. Each frame contains three sounds; choose TRACK A, B or C to select the sound that plays. The monitor shows the selected sound and track.'],
        ['Play notes', 'Use the on-screen keyboard or a MIDI keyboard. The playable range is G2-F6. The tape recordings have a finite playback length, so a held key does not loop indefinitely.'],
        ['Tone and pitch', 'VOLUME controls output level, TONE changes the brightness, and PITCH shifts the tape playback speed and pitch. Save a frame registration when you want to keep your selection.'],
        ['MIDI', 'MIDI note input, program changes and supported controller messages are available when a controller is connected.']
      ]
    }
  },
  'hohner-d6': {
    title: 'HOHNER CLAVINET D6',
    detail: 'ELECTROMECHANICAL CLAVINET EMULATOR',
    help: {
      summary: 'The Clavinet D6 models its string and pickup system, pickup switching, tone controls and external pedal effects. It responds like a struck, muted electric keyboard.',
      sections: [
        ['Play notes', 'Use the on-screen keyboard or connect a MIDI keyboard. The computer-keyboard note row is A W S E D F T G Y H U J K O L P ; and apostrophe.'],
        ['Pickups and tone', 'The A/B switch selects pickup or phase character; C/D selects single or combined pickup behaviour. Use the tone controls to shape the bright, percussive string sound.'],
        ['Pedalboard', 'The effects are separate from the keyboard. Enable the pedalboard, then switch individual effects and adjust their controls. Try compressor, wah, phaser, chorus and other available pedals in different orders/settings.'],
        ['MIDI', 'MIDI note input and supported performance controls are available. The on-screen keys and MIDI controller play the same instrument sound.']
      ]
    }
  },
  'oberheim-eight-voice': {
    title: 'OBERHEIM EIGHT VOICE',
    detail: 'EIGHT-VOICE SEM POLYSYNTH',
    help: {
      summary: 'The Eight Voice brings together eight SEM-style synthesizer voices. Each voice has its own oscillator and filter settings, with global controls for the shared performance and modulation behaviour.',
      sections: [
        ['Play notes', 'Use the on-screen keyboard or a MIDI controller. The computer-keyboard note row is A W S E D F T G Y H U J K O L P ; and apostrophe.'],
        ['Global sound', 'Use the oscillator mix, state-variable filter, envelope, LFO and master controls to set the overall character. The global settings provide a starting point for all eight SEMs.'],
        ['Individual voices', 'Open each voice section to adjust that SEM independently, including its level, pan, tuning, oscillator balance and filter response. Small differences between voices can make the combined sound wider.'],
        ['MIDI', 'MIDI note input, pitch bend, modulation, sustain and program changes are supported. Power on the instrument before expecting audio.']
      ]
    }
  },
  'juno-106': {
    title: 'ROLAND JUNO-106',
    detail: 'SIX-VOICE DCO POLYSYNTH',
    help: {
      summary: 'The Juno-106 is a six-voice analog-style polysynth with a digitally controlled oscillator, filter, amplifier, modulation and its characteristic stereo chorus.',
      sections: [
        ['Play notes', 'Use the on-screen keyboard, a MIDI keyboard or the computer-keyboard note row A W S E D F T G Y H U J K O L P ; and apostrophe. The instrument can play multiple notes at once.'],
        ['Shape the tone', 'Use the DCO controls for waveform balance and pulse width. The high-pass filter, low-pass filter and envelope amount shape the tone; the VCA and ADSR controls shape its volume over time.'],
        ['Chorus and performance', 'Choose OFF, CHORUS I or CHORUS II for the stereo chorus. Adjust LFO, portamento and bender settings for movement and expression.'],
        ['MIDI', 'MIDI note input, pitch bend, mod wheel, sustain, program change and supported controller messages are available.']
      ]
    }
  },
  'ms-20': {
    title: 'KORG MS-20',
    detail: 'SEMI-MODULAR MONOPHONIC SYNTHESIZER',
    help: {
      summary: 'The MS-20 is a monophonic semi-modular synth. Its normalled signal path works without patch cables, while the patch bay lets you route audio and control voltages manually.',
      sections: [
        ['Play notes', 'Use the on-screen keyboard, a MIDI controller, or the computer-keyboard note row A W S E D F T G Y H U J K O L P ; and apostrophe. The MS-20 plays one note at a time.'],
        ['Shape the sound', 'Start with the VCO controls, mixer, high-pass and low-pass filters, and the envelope generators. Try moving the filter cutoff and resonance while holding a note.'],
        ['Use the patch bay', 'Drag from an output jack to a compatible input jack to create a cable. Cables replace or supplement the normalled routing depending on the jack. Use REMOVE ALL CABLES to clear the patch bay and return to the default signal path.'],
        ['External signal processor', 'The ESP section can track incoming audio and derive control signals. Microphone-based pitch tracking requires microphone permission and a clear monophonic source; it is separate from normal keyboard playing.'],
        ['MIDI', 'MIDI note input, pitch bend, modulation, sustain and program changes are supported.']
      ]
    }
  }
};

function createEmulatorHelpButton(actions, instrumentId) {
  const info = EMULATOR_TOPBAR_INFO[instrumentId];
  if (!info?.help) return null;

  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'oi-emulator-topbar__help';
  help.textContent = 'HELP';

  // The Little Phatty already has a help control with its own complete guide.
  // Move that existing control into the shared toolbar rather than adding a
  // second Help button or duplicating the same window.
  if (instrumentId === 'little-phatty') {
    const existing = [...document.querySelectorAll('.little-phatty-body button.lp-btn')]
      .find((button) => button.textContent.trim().toUpperCase() === 'HELP');
    if (existing) {
      existing.className = 'oi-emulator-topbar__help';
      actions.appendChild(existing);
      return existing;
    }
  }

  help.addEventListener('click', () => {
    let dialog = document.querySelector('.oi-emulator-help');
    if (dialog?.open) {
      dialog.close();
      return;
    }
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'oi-emulator-help';
      dialog.setAttribute('aria-labelledby', 'oi-emulator-help-title');

      const head = document.createElement('header');
      head.className = 'oi-emulator-help__header';
      const heading = document.createElement('div');
      const eyebrow = document.createElement('span');
      eyebrow.className = 'oi-emulator-help__eyebrow';
      eyebrow.textContent = 'OVERTURE INSTRUMENT GUIDE';
      const title = document.createElement('h2');
      title.id = 'oi-emulator-help-title';
      title.textContent = info.title + ' · PLAYING GUIDE';
      heading.append(eyebrow, title);

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'oi-emulator-help__close';
      close.setAttribute('aria-label', 'Close help');
      close.textContent = '×';
      close.addEventListener('click', () => dialog.close());
      head.append(heading, close);

      const content = document.createElement('div');
      content.className = 'oi-emulator-help__content';
      const summary = document.createElement('p');
      summary.className = 'oi-emulator-help__summary';
      summary.textContent = info.help.summary;
      content.appendChild(summary);

      info.help.sections.forEach(([sectionTitle, detail]) => {
        const section = document.createElement('section');
        section.className = 'oi-emulator-help__section';
        const h3 = document.createElement('h3');
        h3.textContent = sectionTitle;
        const p = document.createElement('p');
        p.textContent = detail;
        section.append(h3, p);
        content.appendChild(section);
      });

      const footer = document.createElement('footer');
      footer.className = 'oi-emulator-help__footer';
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'oi-emulator-help__done';
      done.textContent = 'CLOSE GUIDE';
      done.addEventListener('click', () => dialog.close());
      footer.appendChild(done);
      dialog.append(head, content, footer);
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener('close', () => help.focus());
      document.body.appendChild(dialog);
    }
    dialog.showModal();
  });

  actions.appendChild(help);
  return help;
}

function updateEmulatorMidiStatus(mid, secondary) {
  const names = MidiManager.connectedNames;
  if (names.length) {
    mid.textContent = 'MIDI: ' + names.join(', ');
    secondary.textContent = names.length === 1 ? '1 INPUT CONNECTED' : names.length + ' INPUTS CONNECTED';
    mid.classList.add('is-connected');
  } else {
    const supported = typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
    mid.textContent = supported ? 'MIDI: no device connected' : 'MIDI: not supported';
    secondary.textContent = supported ? 'CONNECT A MIDI CONTROLLER' : 'WEB MIDI UNAVAILABLE IN THIS BROWSER';
    mid.classList.remove('is-connected');
  }
}

function placeCommunityButtonInEmulatorTopbar(button, instrumentId) {
  // Prophet-10 already has the full info-bar treatment and its own Help guide.
  if (!button || instrumentId === 'prophet-10' || document.querySelector('.p10-info')) return;

  const root = document.querySelector('body > main[id$="-root"], body > #app-root');
  if (!root) return;

  document.body.classList.add('oi-emulator-topbar-active');

  if (!document.getElementById('oi-emulator-topbar-styles')) {
    const stylesheet = document.createElement('link');
    stylesheet.id = 'oi-emulator-topbar-styles';
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/css/emulator-topbar.css?v=20261116-r3';
    document.head.appendChild(stylesheet);
  }

  const info = EMULATOR_TOPBAR_INFO[instrumentId] || {
    title: instrumentId.replace(/-/g, ' ').toUpperCase(),
    detail: 'OVERTURE INSTRUMENT EMULATOR'
  };

  const bar = document.createElement('header');
  bar.className = 'oi-emulator-topbar';
  bar.setAttribute('aria-label', info.title + ' instrument controls');

  const identity = document.createElement('div');
  identity.className = 'oi-emulator-topbar__identity';

  const logo = document.createElement('img');
  logo.className = 'oi-emulator-topbar__logo';
  logo.src = '/ui/Logos/OvertureLogo.png';
  logo.alt = '';
  logo.width = 20;
  logo.height = 20;

  const label = document.createElement('div');
  label.className = 'oi-emulator-topbar__label';

  const title = document.createElement('strong');
  title.textContent = info.title;

  const detail = document.createElement('span');
  detail.textContent = info.detail;

  label.append(title, detail);
  identity.append(logo, label);

  const midi = document.createElement('div');
  midi.className = 'oi-emulator-topbar__midi';

  const midiStatus = document.createElement('span');
  midiStatus.className = 'oi-emulator-topbar__midi-status';

  const midiDetail = document.createElement('span');
  midiDetail.className = 'oi-emulator-topbar__midi-detail';

  midi.append(midiStatus, midiDetail);

  const actions = document.createElement('div');
  actions.className = 'oi-emulator-topbar__actions';

  createEmulatorHelpButton(actions, instrumentId);

  button.className = 'oi-community-share oi-emulator-topbar__share';
  button.textContent = 'COMMUNITY';
  actions.appendChild(button);

  bar.append(identity, midi, actions);
  root.parentNode.insertBefore(bar, root);

  updateEmulatorMidiStatus(midiStatus, midiDetail);
  const refreshMidi = () => updateEmulatorMidiStatus(midiStatus, midiDetail);
  MidiManager.connectionListeners.add(refreshMidi);

  // Also reflects a controller that was connected before this toolbar was
  // mounted; the status listener keeps subsequent hot-plug changes current.
  window.addEventListener('pagehide', () => MidiManager.connectionListeners.delete(refreshMidi), { once: true });
}

export function createCommunityShareButton(parent, {
  instrumentId, getData, getTitle, getAudioOutput, className = 'pn-btn', label = 'COMMUNITY',
}) {
  if (!parent || typeof getData !== 'function' || !instrumentId) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.classList.add('oi-community-share');
  button.textContent = label;
  button.title = 'Share the current instrument patch to the Overture Community library';
  button.addEventListener('click', () => {
    try {
      const rawData = getData();
      if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) throw new Error('There is no valid patch to share yet.');
      const storage = getSessionStorage();
      if (!storage) throw new Error('Community sharing needs browser session storage. Please use a regular browser tab.');
      const source = consumeCommunitySource('instrument_preset', instrumentId);
      const presetSelection = currentPresetSelection()
        || normalizePresetSelection(source?.presetSelection)
        || readCommunityPresetMetadata(rawData);
      const payload = {
        format: 'overture-community-instrument-preset',
        version: 1,
        instrumentId,
        title: String(source?.title || getTitle?.() || 'Untitled patch').slice(0, 80),
        presetSelection,
        editingItemId: source?.id || null,
        editingOriginalPreviewPath: source?.previewPath || null,
        data: stripCommunityInstrumentTranspose(instrumentId, rawData),
      };
      storage.setItem(DRAFT_KEY, JSON.stringify(payload));
      const query = new URLSearchParams({ publish: '1' });
      if (payload.editingItemId) {
        query.set('patch', payload.editingItemId);
        query.set('edit', '1');
      }
      window.location.assign(`/community?${query.toString()}`);
    } catch (error) {
      console.error('Could not prepare this community preset.', error);
      window.alert(error?.message || 'Could not prepare this patch for Community.');
    }
  });
  parent.appendChild(button);
  placeCommunityButtonInEmulatorTopbar(button, instrumentId);
  installCommunityPreviewRecorder({ instrumentId, getAudioOutput });
  return button;
}
export function clearCommunitySource() {
  try { getSessionStorage()?.removeItem(SOURCE_KEY); } catch { /* storage unavailable */ }
}
export function consumeCommunityInstrumentPreset(instrumentId, validate = (value) => value) {
  try {
    const storage = getSessionStorage();
    if (!storage) return null;
    const raw = storage.getItem(IMPORT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || payload.instrumentId !== instrumentId) return null;
    storage.removeItem(IMPORT_KEY);
    const title = String(payload.title || 'Community preset').slice(0, 80);
    const presetSelection = normalizePresetSelection(payload.presetSelection) || readCommunityPresetMetadata(payload.data);
    const data = validate(stripCommunityInstrumentTranspose(instrumentId, payload.data));
    restoreCommunityPresetSelection(presetSelection);
    setCommunitySource({
      id: payload.communityItemId || null, recordType: 'instrument_preset', instrumentId,
      title, previewPath: payload.previewPath || null, presetSelection,
    });
    return { title, data, presetSelection };
  } catch (error) {
    try { getSessionStorage()?.removeItem(IMPORT_KEY); } catch { /* storage unavailable */ }
    console.warn('Community preset could not be imported.', error);
    return null;
  }
}
