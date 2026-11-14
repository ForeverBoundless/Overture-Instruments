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
    .oi-community-recorder{position:fixed;z-index:2147483000;right:18px;top:18px;width:min(360px,calc(100vw - 36px));padding:16px;border:1px solid rgba(125,228,255,.35);border-radius:14px;background:rgba(11,14,19,.96);color:#edf3f8;box-shadow:0 16px 48px rgba(0,0,0,.45);font:14px/1.45 Inter,system-ui,sans-serif;backdrop-filter:blur(16px)}
    .oi-community-recorder strong{display:block;font:600 11px/1.3 'DM Mono',monospace;letter-spacing:.12em;color:#7de4ff;margin-bottom:7px}
    .oi-community-recorder p{margin:0 0 12px;color:#b8c2cd;font-size:12px}
    .oi-community-recorder__status{min-height:20px;margin:10px 0!important;color:#ffb75e!important}
    .oi-community-recorder__actions{display:flex;gap:8px;flex-wrap:wrap}
    .oi-community-recorder button{border:1px solid rgba(125,228,255,.42);border-radius:7px;background:#17232c;color:#f3f7fa;padding:8px 11px;font:600 11px 'DM Mono',monospace;cursor:pointer}
    .oi-community-recorder button:disabled{opacity:.45;cursor:not-allowed}
    .oi-community-recorder .is-recording{border-color:#ff7777;color:#ffaaaa}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.className = 'oi-community-recorder';
  panel.setAttribute('aria-label', 'Community preview recording');
  panel.innerHTML = `
    <strong>COMMUNITY PREVIEW RECORDING</strong>
    <p>Power on the instrument, press record, then play normally. The recording captures the instrument's actual audio output, not your microphone. Maximum length: 10 seconds.</p>
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
        data: stripCommunityPresetMetadata(rawData),
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
    const data = validate(stripCommunityPresetMetadata(payload.data));
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
