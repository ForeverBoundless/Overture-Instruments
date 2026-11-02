/**
 * One-shot handoff from the community library to an instrument emulator.
 * The target instrument still runs its own validator and applies its normal
 * local preset pathway; community records never bypass instrument validation.
 */
export function consumeCommunityInstrumentPreset(instrumentId, validate = (value) => value) {
  let payload;
  try {
    const raw = sessionStorage.getItem('overture.community.instrument-import');
    if (!raw) return null;
    payload = JSON.parse(raw);
    if (!payload || payload.instrumentId !== instrumentId) return null;
    sessionStorage.removeItem('overture.community.instrument-import');
    return {
      title: String(payload.title || 'Community preset').slice(0, 80),
      data: validate(payload.data),
    };
  } catch (error) {
    try { sessionStorage.removeItem('overture.community.instrument-import'); } catch { /* storage unavailable */ }
    console.warn('Community preset could not be imported.', error);
    return null;
  }
}
