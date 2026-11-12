/**
 * Shared exchange between every Overture emulator and the Community library.
 * Community records are validated again by the receiving emulator before use.
 */
const IMPORT_KEY = 'overture.community.instrument-import';
const DRAFT_KEY = 'overture.community.instrument-draft';

export function createCommunityShareButton(parent, {
  instrumentId, getData, getTitle, className = 'pn-btn', label = 'COMMUNITY',
}) {
  if (!parent || typeof getData !== 'function' || !instrumentId) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.title = 'Share the current instrument patch to the Overture Community library';
  button.addEventListener('click', () => {
    try {
      const data = getData();
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('There is no valid patch to share yet.');
      }
      const payload = {
        format: 'overture-community-instrument-preset',
        version: 1,
        instrumentId,
        title: String(getTitle?.() || 'Untitled patch').slice(0, 80),
        data: JSON.parse(JSON.stringify(data)),
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      window.location.assign('/community?publish=1');
    } catch (error) {
      console.error('Could not prepare this community preset.', error);
      window.alert(error?.message || 'Could not prepare this patch for Community.');
    }
  });
  parent.append(button);
  return button;
}

/** One-shot handoff from the Community library into the selected emulator. */
export function consumeCommunityInstrumentPreset(instrumentId, validate = (value) => value) {
  try {
    const raw = sessionStorage.getItem(IMPORT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || payload.instrumentId !== instrumentId) return null;
    sessionStorage.removeItem(IMPORT_KEY);
    return {
      title: String(payload.title || 'Community preset').slice(0, 80),
      data: validate(payload.data),
    };
  } catch (error) {
    try { sessionStorage.removeItem(IMPORT_KEY); } catch { /* storage unavailable */ }
    console.warn('Community preset could not be imported.', error);
    return null;
  }
}
