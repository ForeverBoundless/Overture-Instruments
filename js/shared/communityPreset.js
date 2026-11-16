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
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach((key) => {
      if (excludedKeys.has(key)) delete value[key];
      else visit(value[key]);
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


const EMULATOR_TOPBAR_LABELS = {
  'sub-37': 'MOOG SUB 37',
  'prophet-10': 'SEQUENTIAL PROPHET-10',
  'nord-c2d': 'NORD C2D',
  'dx7': 'YAMAHA DX7',
  'tr-808': 'ROLAND TR-808',
  'ob-xa': 'OBERHEIM OB-Xa',
  'udo-super-8': 'UDO SUPER 8',
  'sequential-pro-3': 'SEQUENTIAL PRO 3',
  'little-phatty': 'MOOG LITTLE PHATTY',
  'mellotron-m400': 'MELLOTRON M400',
  'hohner-d6': 'HOHNER CLAVINET D6',
  'oberheim-eight-voice': 'OBERHEIM EIGHT VOICE',
  'juno-106': 'ROLAND JUNO-106',
  'ms-20': 'KORG MS-20',
};

function placeCommunityButtonInEmulatorTopbar(button, instrumentId) {
  // Prophet-10 already has this exact Overture/info-bar pattern built into
  // its stage, so retain its existing layout and right-hand action slot.
  if (!button || instrumentId === 'prophet-10' || document.querySelector('.p10-info')) return;

  const root = document.querySelector('body > main[id$="-root"], body > #app-root');
  if (!root) return;

  document.body.classList.add('oi-emulator-topbar-active');

  if (!document.getElementById('oi-emulator-topbar-styles')) {
    const stylesheet = document.createElement('link');
    stylesheet.id = 'oi-emulator-topbar-styles';
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/css/emulator-topbar.css?v=20261116-r1';
    document.head.appendChild(stylesheet);
  }

  let bar = document.querySelector('.oi-emulator-topbar');
  if (!bar) {
    bar = document.createElement('header');
    bar.className = 'oi-emulator-topbar';
    bar.setAttribute('aria-label', 'Overture instrument toolbar');

    const brand = document.createElement('a');
    brand.className = 'oi-emulator-topbar__brand';
    brand.href = '/';
    brand.setAttribute('aria-label', 'Overture Instruments home');

    const logo = document.createElement('img');
    logo.className = 'oi-emulator-topbar__logo';
    logo.src = '/ui/Logos/OvertureLogo.png';
    logo.alt = '';
    logo.width = 21;
    logo.height = 21;

    const wording = document.createElement('span');
    wording.className = 'oi-emulator-topbar__wording';
    const title = document.createElement('strong');
    title.textContent = 'OVERTURE INSTRUMENTS';
    const subtitle = document.createElement('span');
    subtitle.textContent = EMULATOR_TOPBAR_LABELS[instrumentId] || instrumentId.replace(/-/g, ' ').toUpperCase();
    wording.append(title, subtitle);
    brand.append(logo, wording);

    const actions = document.createElement('div');
    actions.className = 'oi-emulator-topbar__actions';
    bar.append(brand, actions);
    root.parentNode.insertBefore(bar, root);
  }

  const actions = bar.querySelector('.oi-emulator-topbar__actions');
  if (actions) {
    button.className = 'oi-community-share oi-emulator-topbar__community';
    button.textContent = 'COMMUNITY';
    actions.appendChild(button);
  }
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
