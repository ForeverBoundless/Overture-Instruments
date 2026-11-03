import { validatePatch, LiveGraph } from './omni/graph.js';
import { supabase, supabaseConfigured, configureSupabase, previewPublicUrl } from './shared/supabaseClient.js';

const byId = (id) => document.getElementById(id);
const INSTRUMENTS = {
  'little-phatty': { name: 'Moog Little Phatty', route: '/html/little-phatty' },
  'ms-20': { name: 'Korg MS-20', route: '/html/korg-ms-20' },
  'juno-106': { name: 'Roland Juno-106', route: '/html/roland-juno-106' },
  'dx7': { name: 'Yamaha DX7', route: '/html/yamaha-dx7' },
  'tr-808': { name: 'Roland TR-808', route: '/html/roland-tr-808' },
};

const state = {
  user: null,
  draft: null,
  draftType: 'omni_patch',
  draftInstrument: null,
  items: [],
  directItem: null,
  offset: 0,
  pageSize: 24,
  hasMore: false,
  loading: false,
  reloadPending: false,
  pendingAppend: false,
  mine: false,
  editingId: null,
  editingOriginalPreviewPath: null,
  activePreview: null,
  searchTimer: null,
  authorProfiles: new Map(),
};

function message(id, text, error = false) {
  const node = byId(id);
  if (!node) return;
  node.textContent = text || '';
  node.classList.toggle('is-error', error);
}

function safeJsonCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJsonFileObject(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The file must contain a JSON object.');
  return value;
}

function extractOmniPatch(raw) {
  const object = parseJsonFileObject(raw);
  return validatePatch(object.data ?? object.patch ?? object);
}

function extractInstrumentPreset(raw, instrumentId) {
  if (!INSTRUMENTS[instrumentId]) throw new Error('Choose a supported instrument.');
  const object = parseJsonFileObject(raw);
  let data = object.data ?? object.patch ?? object;
  if (Array.isArray(object.presets)) data = object.presets[0];
  if (Array.isArray(object.items)) data = object.items[0]?.data;
  if (data && Array.isArray(data.presets)) data = data.presets[0];

  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('No instrument preset was found in that file.');

  switch (instrumentId) {
    case 'little-phatty': {
      const required = ['osc1Shape', 'osc2Shape', 'osc1Level', 'osc2Level', 'noiseLevel', 'cutoff', 'resonance', 'drive', 'keyTrack', 'filterEnvAmount', 'ampEnv', 'filterEnv', 'lfoRate', 'lfoWaveform', 'glideTime'];
      if (required.some((key) => !(key in data))) throw new Error('This is not a Little Phatty user preset.');
      for (const env of ['ampEnv', 'filterEnv']) {
        if (!data[env] || ['attack', 'decay', 'sustain', 'release'].some((key) => !Number.isFinite(Number(data[env][key])))) {
          throw new Error('The Little Phatty envelope data is incomplete.');
        }
      }
      break;
    }
    case 'ms-20':
      if (!data.params || typeof data.params !== 'object' || !Array.isArray(data.cables)) throw new Error('This is not an MS-20 patch (expected parameters and patch cables).');
      break;
    case 'juno-106':
      if (!['cutoff', 'res', 'lfoRate', 'vcaLevel', 'chorus'].some((key) => key in data)) throw new Error('This does not look like a Juno-106 patch.');
      break;
    case 'dx7':
      if (!Array.isArray(data.ops) || data.ops.length !== 6) throw new Error('A DX7 voice must contain six operators.');
      break;
    case 'tr-808':
      if (!data.lanes || typeof data.lanes !== 'object' || !Number.isFinite(Number(data.tempo))) throw new Error('This is not a TR-808 pattern.');
      break;
    default:
      throw new Error('This instrument preset format is not supported yet.');
  }
  return safeJsonCopy(data);
}

function readDraft() {
  try {
    const raw = sessionStorage.getItem('overture.community.draft');
    if (!raw) return null;
    const patch = extractOmniPatch(raw);
    state.draftType = 'omni_patch';
    state.draftInstrument = null;
    byId('community-draft-status').textContent = `Attached from OMNI: ${patch.name} (${patch.modules.length} modules).`;
    return patch;
  } catch (error) {
    byId('community-draft-status').textContent = `The OMNI draft could not be read: ${error.message}`;
    return null;
  }
}

function syncContentType() {
  const type = byId('community-record-type').value;
  const instrument = byId('community-instrument');
  instrument.hidden = type !== 'instrument_preset';
  byId('community-instrument-wrap').hidden = type !== 'instrument_preset';
  if (type === 'omni_patch') {
    state.draftType = 'omni_patch';
    state.draftInstrument = null;
    if (state.draft) byId('community-draft-status').textContent = `OMNI patch ready: ${state.draft.name || 'Untitled'}.`;
  } else {
    state.draftType = 'instrument_preset';
    state.draftInstrument = instrument.value;
    byId('community-draft-status').textContent = 'Choose a supported instrument and upload its exported preset JSON file.';
  }
}

function setDraft(data, type, instrumentId = null, title = '') {
  state.draft = data;
  state.draftType = type;
  state.draftInstrument = instrumentId;
  byId('community-record-type').value = type;
  byId('community-instrument').value = instrumentId || 'little-phatty';
  syncContentType();
  byId('community-draft-status').textContent = type === 'omni_patch'
    ? `OMNI patch ready: ${data.name || title || 'Untitled'} · ${data.modules.length} modules.`
    : `${INSTRUMENTS[instrumentId]?.name || 'Instrument'} preset ready.`;
  if (!byId('community-title').value) byId('community-title').value = title || data.name || '';
}

function setPublishOpen(open) {
  const panel = byId('community-publish-panel');
  panel.hidden = !open;
  if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function friendlyDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function safeFilename(value) {
  return String(value || 'overture-patch').trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'overture-patch';
}

function downloadJSON(item) {
  const instrument = item.record_type === 'instrument_preset';
  const contents = instrument
    ? { format: 'overture-community-instrument-preset', version: 1, instrumentId: item.instrument_id, name: item.title, data: item.patch_data }
    : { format: 'overture-omni-patch', version: 1, data: item.patch_data };
  const blob = new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(item.title)}.${instrument ? 'preset' : 'omni'}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  void supabase.rpc('increment_community_patch_downloads', { p_patch_id: item.id });
}

async function stopPreview() {
  const active = state.activePreview;
  if (!active) return;
  state.activePreview = null;
  active.stopped = true;
  try { active.graph?.allOff(); } catch { /* best effort */ }
  try { active.graph?.teardown(); } catch { /* best effort */ }
  try { await active.context?.close(); } catch { /* already closed */ }
  document.querySelectorAll('[data-preview-button]').forEach((button) => {
    if (button.dataset.previewButton === active.patchId) button.textContent = 'LISTEN';
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function auditionOmniPatch(item, button) {
  if (state.activePreview?.patchId === item.id) {
    await stopPreview();
    return;
  }
  if (state.activePreview) await stopPreview();
  button.disabled = true;
  button.textContent = 'LOADING…';
  let context = null;
  let graph = null;
  try {
    const patch = validatePatch(item.patch_data);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser.');
    context = new AudioContextClass({ latencyHint: 'interactive' });
    await context.resume();
    const master = context.createGain();
    master.gain.value = Math.min(0.9, patch.global.master);
    master.connect(context.destination);
    graph = new LiveGraph(context, master);
    if (!await graph.build(patch)) throw new Error('The patch could not be prepared for preview.');

    const active = { patchId: item.id, context, graph, stopped: false };
    state.activePreview = active;
    button.textContent = 'STOP';
    button.disabled = false;

    const hasKeyboard = [...graph.instances.values()].some((instance) => typeof instance.noteOn === 'function');
    const generators = [...graph.instances.values()].filter((instance) => typeof instance.setRunning === 'function');
    if (hasKeyboard) {
      const notes = [60, 64, 67, 72, 69, 67, 64, 62, 60, 64, 67, 72];
      for (const note of notes) {
        if (active.stopped) break;
        graph.noteOn(note, 0.72, 1);
        await wait(220);
        graph.noteOff(note, 1);
        await wait(80);
      }
    } else if (generators.length) {
      generators.forEach((instance) => instance.setRunning(true));
      await wait(6000);
      generators.forEach((instance) => instance.setRunning(false));
    } else {
      throw new Error('This patch has no keyboard or running sequencer to audition. Add an audio preview or open it in OMNI.');
    }
    if (!active.stopped) await stopPreview();
  } catch (error) {
    if (state.activePreview?.patchId === item.id) await stopPreview();
    else {
      try { graph?.teardown(); } catch { /* best effort */ }
      try { await context?.close(); } catch { /* best effort */ }
    }
    message('community-result-count', error.message, true);
  } finally {
    if (button.isConnected && button.textContent === 'LOADING…') {
      button.textContent = 'LISTEN';
      button.disabled = false;
    }
  }
}

function openItem(item) {
  try {
    if (item.record_type === 'instrument_preset') {
      if (!INSTRUMENTS[item.instrument_id]) throw new Error('This instrument preset is not supported by the current prototype.');
      sessionStorage.setItem('overture.community.instrument-import', JSON.stringify({
        instrumentId: item.instrument_id,
        title: item.title,
        data: item.patch_data,
      }));
      window.location.assign(INSTRUMENTS[item.instrument_id].route);
    } else {
      sessionStorage.setItem('overture.community.import', JSON.stringify(item.patch_data));
      window.location.assign('/omni');
    }
  } catch (error) {
    message('community-result-count', `Could not prepare this item: ${error.message}`, true);
  }
}

async function shareItem(item) {
  const url = new URL('/community', window.location.origin);
  url.searchParams.set('patch', item.id);
  try {
    if (navigator.share) await navigator.share({ title: item.title, text: item.description || 'Community item from Overture Instruments', url: url.href });
    else {
      await navigator.clipboard.writeText(url.href);
      message('community-result-count', 'Share link copied.');
    }
  } catch (error) {
    if (error.name !== 'AbortError') message('community-result-count', 'Could not share this link. Copy the page URL from your browser.', true);
  }
}

function addText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value ?? '';
  parent.append(node);
  return node;
}

async function loadAuthorProfiles(items) {
  const ids = [...new Set(items.map((item) => item.owner_id).filter(Boolean))]
    .filter((id) => !state.authorProfiles.has(id));
  if (!ids.length) return;
  const { data, error } = await supabase.from('profiles')
    .select('id,username,display_name')
    .in('id', ids);
  if (error) {
    console.warn('Could not load community author profiles:', error.message);
    return;
  }
  (data || []).forEach((profile) => state.authorProfiles.set(profile.id, profile));
}

function renderCard(item) {
  const card = document.createElement('article');
  card.className = 'community-card';
  card.dataset.communityItemId = String(item.id).toLowerCase();
  const isInstrument = item.record_type === 'instrument_preset';
  const instrumentName = INSTRUMENTS[item.instrument_id]?.name || 'Instrument preset';
  const top = addText(card, 'div', 'community-card__top', isInstrument ? instrumentName : 'OMNI PATCH');
  addText(top, 'span', '', friendlyDate(item.created_at));
  addText(card, 'h3', '', item.title);
  addText(card, 'p', 'community-card__description', item.description || 'No description provided.');

  const meta = addText(card, 'div', 'community-card__meta', '');
  const by = addText(meta, 'span', '', 'BY ');
  const authorProfile = state.authorProfiles.get(item.owner_id);
  if (authorProfile?.username) {
    const authorLink = addText(by, 'a', 'community-card__author', item.author_name || authorProfile.display_name || `@${authorProfile.username}`);
    authorLink.href = `/contributions?username=${encodeURIComponent(authorProfile.username)}`;
    authorLink.title = `View @${authorProfile.username}'s contributions`;
  } else {
    by.append(document.createTextNode(item.author_name || 'OVERTURE USER'));
  }
  addText(meta, 'span', '', `${Number(item.downloads || 0).toLocaleString()} DOWNLOADS`);

  const tags = addText(card, 'div', 'community-tags', '');
  (Array.isArray(item.tags) ? item.tags : []).slice(0, 8).forEach((tag) => addText(tags, 'span', 'community-tag', tag));

  const previewUrl = previewPublicUrl(item.preview_path);
  let audio = null;
  if (previewUrl) {
    audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = previewUrl;
    audio.setAttribute('aria-label', `Audio preview for ${item.title}`);
    card.append(audio);
  }

  const actions = addText(card, 'div', 'community-card__actions', '');
  const listen = addText(actions, 'button', 'community-button', isInstrument ? (audio ? 'PLAY PREVIEW' : 'NO AUDIO PREVIEW') : 'LISTEN');
  listen.type = 'button';
  listen.dataset.previewButton = item.id;
  if (isInstrument) {
    listen.disabled = !audio;
    listen.addEventListener('click', async () => {
      if (!audio) return;
      try {
        if (audio.paused) await audio.play();
        else audio.pause();
      } catch (error) { message('community-result-count', error.message, true); }
    });
  } else listen.addEventListener('click', () => auditionOmniPatch(item, listen));

  const open = addText(actions, 'button', 'community-button', isInstrument ? 'OPEN IN INSTRUMENT' : 'OPEN IN OMNI');
  open.type = 'button';
  open.addEventListener('click', () => openItem(item));
  const download = addText(actions, 'button', 'community-button', 'DOWNLOAD');
  download.type = 'button';
  download.addEventListener('click', () => downloadJSON(item));
  const share = addText(actions, 'button', 'community-button', 'SHARE');
  share.type = 'button';
  share.addEventListener('click', () => shareItem(item));

  if (state.user?.id && item.owner_id === state.user.id) {
    const edit = addText(actions, 'button', 'community-button', 'EDIT');
    edit.type = 'button'; edit.addEventListener('click', () => beginEdit(item));
    const remove = addText(actions, 'button', 'community-button', 'DELETE');
    remove.type = 'button'; remove.addEventListener('click', () => deleteItem(item));
  }
  return card;
}

function renderCardOnce(item, { prepend = false } = {}) {
  const grid = byId('community-grid');
  const itemId = String(item.id).toLowerCase();
  const existing = [...grid.children].find((card) => card.dataset.communityItemId === itemId);
  if (existing) return existing;

  const card = renderCard(item);
  if (prepend) grid.prepend(card);
  else grid.append(card);
  return card;
}

async function loadPatches({ append = false } = {}) {
  if (!supabase) return;
  if (state.loading) {
    state.pendingAppend = state.reloadPending ? state.pendingAppend && append : append;
    state.reloadPending = true;
    return;
  }
  state.loading = true;
  const grid = byId('community-grid');
  if (!append) {
    state.offset = 0;
    state.items = [];
    grid.replaceChildren();
  }
  byId('community-load-more').hidden = true;
  byId('community-empty').hidden = true;
  message('community-result-count', 'Loading community items…');
  try {
    let query = supabase.from('community_patches')
      .select('id,owner_id,record_type,instrument_id,title,description,author_name,tags,visibility,patch_data,preview_path,downloads,created_at');
    if (state.mine && state.user) query = query.eq('owner_id', state.user.id);
    else query = query.eq('visibility', 'public');
    const search = byId('community-search').value.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').slice(0, 50);
    if (search) {
      const tagTerms = [...new Set(search.split(/\\s+/).filter(Boolean))].map((term) => `tags.cs.{${term}}`);
      query = query.or([`title.ilike.%${search}%`, `description.ilike.%${search}%`, ...tagTerms].join(','));
    }
    const type = byId('community-filter-type').value;
    if (type !== 'all') query = query.eq('record_type', type);
    query = query.order(byId('community-sort').value, { ascending: false }).range(state.offset, state.offset + state.pageSize);
    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const page = rows.slice(0, state.pageSize);
    await loadAuthorProfiles(page);

    // Keep pagination state unique by record ID, even if requests overlap.
    const knownIds = new Set(append ? state.items.map((item) => String(item.id).toLowerCase()) : []);
    const uniquePage = page.filter((item) => {
      const id = String(item.id).toLowerCase();
      if (knownIds.has(id)) return false;
      knownIds.add(id);
      return true;
    });
    state.items = append ? [...state.items, ...uniquePage] : uniquePage;
    state.offset += page.length;
    state.hasMore = rows.length > state.pageSize;

    // A direct-linked item stays visible across feed refreshes and pagination.
    if (state.directItem) renderCardOnce(state.directItem, { prepend: true });
    uniquePage.forEach((item) => renderCardOnce(item));

    const directItemInFeed = state.directItem
      && state.items.some((item) => String(item.id).toLowerCase() === String(state.directItem.id).toLowerCase());
    const visibleCount = state.items.length + (state.directItem && !directItemInFeed ? 1 : 0);
    byId('community-result-count').textContent = `${visibleCount}${state.hasMore ? '+' : ''} ITEMS`;
    byId('community-empty').hidden = visibleCount !== 0;
    byId('community-load-more').hidden = !state.hasMore;
  } catch (error) {
    message('community-result-count', error.message || 'Could not load community items.', true);
  } finally {
    state.loading = false;
    if (state.reloadPending) {
      const nextAppend = state.pendingAppend;
      state.reloadPending = false;
      state.pendingAppend = false;
      void loadPatches({ append: nextAppend });
    }
  }
}

function beginEdit(item) {
  state.editingId = item.id;
  state.editingOriginalPreviewPath = item.preview_path || null;
  const type = item.record_type || 'omni_patch';
  setDraft(item.patch_data, type, item.instrument_id, item.title);
  byId('community-title').value = item.title;
  byId('community-description').value = item.description || '';
  byId('community-tags').value = (item.tags || []).join(', ');
  byId('community-visibility').value = item.visibility;
  byId('community-audio-file').value = '';
  byId('community-publish-form').querySelector('[type="submit"]').textContent = 'UPDATE ITEM';
  byId('community-publish-status').textContent = 'Editing your published item. Its current audio preview is retained unless replaced.';
  setPublishOpen(true);
}

async function deleteItem(item) {
  if (!confirm(`Delete "${item.title}" from the community library? This cannot be undone.`)) return;
  try {
    const { error } = await supabase.from('community_patches').delete().eq('id', item.id);
    if (error) throw error;
    if (item.preview_path) {
      const { error: storageError } = await supabase.storage.from('community-previews').remove([item.preview_path]);
      if (storageError) console.warn('Community preview could not be removed:', storageError.message);
    }
    message('community-result-count', 'Item deleted.');
    await loadPatches();
  } catch (error) {
    message('community-result-count', error.message || 'Could not delete this item.', true);
  }
}

async function publishItem(event) {
  event.preventDefault();
  if (!state.user) {
    message('community-publish-status', 'Sign in with your email before publishing.', true);
    byId('community-account-link').hidden = false;
    return;
  }
  const submit = byId('community-publish-form').querySelector('[type="submit"]');
  submit.disabled = true;
  message('community-publish-status', 'Publishing…');
  let uploadedPath = null;
  try {
    const recordType = byId('community-record-type').value;
    const instrumentId = recordType === 'instrument_preset' ? byId('community-instrument').value : null;
    let data = state.draft;
    let file = byId('community-patch-file').files?.[0];
    if (file) {
      if (file.size > 524288) throw new Error('Preset files must be 512 KB or smaller.');
      const parsed = JSON.parse(await file.text());
      data = recordType === 'omni_patch'
        ? extractOmniPatch(parsed)
        : extractInstrumentPreset(parsed, instrumentId);
    } else if (state.draftType !== recordType || (recordType === 'instrument_preset' && state.draftInstrument !== instrumentId)) {
      data = null;
    }
    if (!data) throw new Error(recordType === 'omni_patch'
      ? 'Choose an OMNI patch file or use OMNI’s COMMUNITY button.'
      : 'Choose an exported instrument preset JSON file.');
    if (recordType === 'omni_patch') data = validatePatch(data);
    else data = extractInstrumentPreset(data, instrumentId);
    const bytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
    if (bytes > 500000) throw new Error('This preset is too large to publish (maximum 500 KB).');

    const title = byId('community-title').value.trim();
    if (title.length < 3 || title.length > 80) throw new Error('The title must be between 3 and 80 characters.');
    const tags = [...new Set(byId('community-tags').value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    const previewFile = byId('community-audio-file').files?.[0];
    let previewPath = null;
    if (previewFile) {
      if (previewFile.size > 8388608) throw new Error('Audio previews must be 8 MB or smaller.');
      const mime = (previewFile.type || '').split(';')[0].toLowerCase();
      const allowed = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'];
      if (!allowed.includes(mime)) throw new Error('Choose a WebM, Ogg, MP4, MP3 or WAV audio preview.');
      const itemId = state.editingId || crypto.randomUUID();
      const extension = ({ 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' })[mime];
      previewPath = `${state.user.id}/${itemId}/preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('community-previews').upload(previewPath, previewFile, { contentType: mime });
      if (uploadError) throw uploadError;
      uploadedPath = previewPath;
    }

    const { data: authorProfile } = await supabase.from('profiles').select('username,display_name').eq('id', state.user.id).maybeSingle();
    const userName = authorProfile?.display_name || authorProfile?.username || 'Overture user';
    const record = {
      record_type: recordType,
      instrument_id: instrumentId,
      title,
      description: byId('community-description').value.trim().slice(0, 600),
      author_name: String(userName).slice(0, 48),
      tags,
      visibility: byId('community-visibility').value,
      patch_data: data,
    };
    if (previewPath) record.preview_path = previewPath;
    else if (!state.editingId) record.preview_path = null;

    let result;
    if (state.editingId) {
      result = await supabase.from('community_patches').update(record).eq('id', state.editingId).select('id').single();
    } else {
      result = await supabase.from('community_patches').insert({ ...record, owner_id: state.user.id }).select('id').single();
    }
    if (result.error) throw result.error;

    if (previewPath && state.editingOriginalPreviewPath && previewPath !== state.editingOriginalPreviewPath) {
      await supabase.storage.from('community-previews').remove([state.editingOriginalPreviewPath]);
    }
    state.editingId = null;
    state.editingOriginalPreviewPath = null;
    state.draft = data;
    state.draftType = recordType;
    state.draftInstrument = instrumentId;
    try { sessionStorage.removeItem('overture.community.draft'); } catch { /* optional draft */ }
    byId('community-patch-file').value = '';
    byId('community-audio-file').value = '';
    byId('community-publish-form').querySelector('[type="submit"]').textContent = 'PUBLISH ITEM';
    message('community-publish-status', 'Published. Your item is now available in the community library.');
    state.mine = false;
    byId('community-my-items').textContent = 'MY ITEMS';
    await loadPatches();
  } catch (error) {
    if (uploadedPath) {
      try { await supabase.storage.from('community-previews').remove([uploadedPath]); } catch { /* best effort cleanup */ }
    }
    message('community-publish-status', error.message || 'Could not publish this item.', true);
  } finally {
    submit.disabled = false;
  }
}

function renderAccount(session) {
  const status = byId('community-account-status');
  if (!supabaseConfigured) {
    status.textContent = 'Community backend not configured.';
    byId('community-setup').hidden = false;
    byId('community-publish-open').disabled = true;
    byId('community-my-items').hidden = true;
    byId('community-my-items').textContent = 'MY ITEMS';
    return;
  }
  byId('community-setup').hidden = true;
  state.user = session?.user || null;
  if (state.user) {
    status.textContent = 'You are signed in to Overture. You can publish and manage your community patches.';
    byId('community-account-link').hidden = true;
    byId('community-signout').hidden = false;
    byId('community-my-items').hidden = false;
    byId('community-publish-open').disabled = false;
  } else {
    status.textContent = 'Sign in to publish and manage your items. Browsing and downloading public items does not require an account.';
    byId('community-account-link').hidden = false;
    byId('community-signout').hidden = true;
    byId('community-my-items').hidden = true;
    byId('community-publish-open').disabled = true;
    state.mine = false;
  }
}

async function updateAccount() {
  if (!supabaseConfigured) { renderAccount(null); return; }
  const { data, error } = await supabase.auth.getSession();
  if (error) message('community-account-status', error.message, true);
  renderAccount(data?.session || null);
}

async function initialise() {
  if (!supabaseConfigured) {
    renderAccount(null);
    return;
  }
  try {
    await configureSupabase();
  } catch (error) {
    byId('community-setup').hidden = false;
    byId('community-account-status').textContent = `Supabase could not be loaded: ${error.message || error}`;
    byId('community-publish-open').disabled = true;
    byId('community-my-items').hidden = true;
    return;
  }

  state.draft = readDraft();
  if (state.draft) setDraft(state.draft, 'omni_patch', null);
  if (new URLSearchParams(window.location.search).get('publish') === '1') setPublishOpen(true);
  byId('community-publish-open').addEventListener('click', () => setPublishOpen(true));
  byId('community-publish-close').addEventListener('click', () => setPublishOpen(false));
  byId('community-publish-form').addEventListener('submit', publishItem);
  byId('community-record-type').addEventListener('change', syncContentType);
  byId('community-instrument').addEventListener('change', () => {
    state.draftType = 'instrument_preset';
    state.draftInstrument = byId('community-instrument').value;
  });
  byId('community-patch-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 524288) throw new Error('Preset files must be 512 KB or smaller.');
      const parsed = JSON.parse(await file.text());
      const type = byId('community-record-type').value;
      const instrumentId = type === 'instrument_preset' ? byId('community-instrument').value : null;
      const data = type === 'omni_patch' ? extractOmniPatch(parsed) : extractInstrumentPreset(parsed, instrumentId);
      setDraft(data, type, instrumentId, parsed.name || file.name.replace(/\.json$/i, ''));
    } catch (error) {
      state.draft = null;
      message('community-publish-status', error.message || 'Invalid preset file.', true);
      byId('community-draft-status').textContent = 'The selected file could not be validated for this content type.';
    }
  });
  byId('community-signout').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) message('community-account-status', error.message, true);
    renderAccount(null);
    await loadPatches();
  });
  byId('community-my-items').addEventListener('click', () => {
    state.mine = !state.mine;
    byId('community-my-items').textContent = state.mine ? 'PUBLIC LIBRARY' : 'MY ITEMS';
    loadPatches();
  });
  byId('community-sort').addEventListener('change', () => loadPatches());
  byId('community-filter-type').addEventListener('change', () => loadPatches());
  byId('community-search').addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadPatches(), 250);
  });
  byId('community-load-more').addEventListener('click', () => loadPatches({ append: true }));

  // Do not call auth methods inside this callback: Supabase serializes auth
  // state changes and recursive auth calls can deadlock its internal lock.
  supabase.auth.onAuthStateChange((event, session) => {
    renderAccount(session);
    // INITIAL_SESSION is already covered by the first explicit feed load below.
    // Refresh only for subsequent sign-in, sign-out or token-change events.
    if (!state.mine && event !== 'INITIAL_SESSION') setTimeout(() => loadPatches(), 0);
  });

  await updateAccount();
  await loadPatches();

  const params = new URLSearchParams(window.location.search);
  const requestedPatch = params.get('patch');
  const editRequested = params.get('edit') === '1';
  if (requestedPatch) {
    const requestedId = String(requestedPatch).toLowerCase();
    let item = state.items.find((entry) => String(entry.id).toLowerCase() === requestedId);
    if (!item) {
      const { data, error } = await supabase.rpc('get_community_patch_by_id', { p_patch_id: requestedPatch });
      item = Array.isArray(data) ? data[0] : data;
      if (error) {
        message('community-result-count', error.message || 'The shared item could not be opened.', true);
      } else if (item) {
        await loadAuthorProfiles([item]);
      }
    }
    if (item) {
      state.directItem = item;
      renderCardOnce(item, { prepend: true });
    }
    if (item && editRequested) {
      if (state.user?.id && item.owner_id === state.user.id) beginEdit(item);
      else message('community-result-count', 'Only the owner can edit this contribution.', true);
    }
  }
}

initialise();
