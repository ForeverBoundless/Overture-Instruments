/**
 * Shared exchange between every Overture emulator and the Community library.
 * Community records are validated again by the receiving emulator before use.
 */
const IMPORT_KEY = 'overture.community.instrument-import';
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

export function createCommunityShareButton(parent, {
  instrumentId, getData, getTitle, className = 'pn-btn', label = 'COMMUNITY',
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
