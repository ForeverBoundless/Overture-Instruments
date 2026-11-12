/**
 * Shared exchange between every Overture emulator and the Community library.
 * Community records are validated again by the receiving emulator before use.
 */
const IMPORT_KEY = 'overture.community.instrument-import';
const DRAFT_KEY = 'overture.community.instrument-draft';
const SOURCE_KEY = 'overture.community.source-item';

function getSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Carry the originating Community record across an emulator round-trip. */
export function setCommunitySource(source) {
  try {
    const storage = getSessionStorage();
    if (!storage) return false;
    if (!source) storage.removeItem(SOURCE_KEY);
    else storage.setItem(SOURCE_KEY, JSON.stringify(source));
    return true;
  } catch {
    return false;
  }
}

/** Take the source context once, so unrelated later patches are never linked to it. */
export function consumeCommunitySource(recordType, instrumentId = null) {
  try {
    const storage = getSessionStorage();
    if (!storage) return null;
    const raw = storage.getItem(SOURCE_KEY);
    if (!raw) return null;
    storage.removeItem(SOURCE_KEY);
    const source = JSON.parse(raw);
    if (!source || source.recordType !== recordType) return null;
    if (instrumentId && source.instrumentId !== instrumentId) return null;
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
      const data = getData();
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('There is no valid patch to share yet.');
      }
      const storage = getSessionStorage();
      if (!storage) throw new Error('Community sharing needs browser session storage. Please use a regular browser tab.');
      const source = consumeCommunitySource('instrument_preset', instrumentId);
      const payload = {
        format: 'overture-community-instrument-preset',
        version: 1,
        instrumentId,
        title: String(source?.title || getTitle?.() || 'Untitled patch').slice(0, 80),
        editingItemId: source?.id || null,
        editingOriginalPreviewPath: source?.previewPath || null,
        data: JSON.parse(JSON.stringify(data)),
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

/** One-shot handoff from the Community library into the selected emulator. */
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
    const data = validate(payload.data);
    if (Object.prototype.hasOwnProperty.call(data, 'name')) data.name = title;
    setCommunitySource({
      id: payload.communityItemId || null,
      recordType: 'instrument_preset',
      instrumentId,
      title,
      previewPath: payload.previewPath || null,
    });
    return { title, data };
  } catch (error) {
    try { getSessionStorage()?.removeItem(IMPORT_KEY); } catch { /* storage unavailable */ }
    console.warn('Community preset could not be imported.', error);
    return null;
  }
}
