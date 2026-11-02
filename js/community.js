import { validatePatch, LiveGraph } from './omni/graph.js';
import { MODULES } from './omni/modules.js';
import { supabase, supabaseConfigured, previewPublicUrl } from './shared/supabaseClient.js';

const byId = (id) => document.getElementById(id);
const root = byId('community-root');
const state = {
  user: null,
  draft: null,
  items: [],
  offset: 0,
  pageSize: 24,
  hasMore: false,
  loading: false,
  mine: false,
  editingId: null,
  activePreview: null,
  searchTimer: null,
};

function message(id, text, error = false) {
  const node = byId(id);
  if (!node) return;
  node.textContent = text || '';
  node.classList.toggle('is-error', error);
}

function extractPatch(raw) {
  const object = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return validatePatch(object?.data || object?.patch || object);
}

function readDraft() {
  try {
    const raw = sessionStorage.getItem('overture.community.draft');
    if (!raw) return null;
    const patch = extractPatch(raw);
    byId('community-draft-status').textContent = `Attached from OMNI: ${patch.name} (${patch.modules.length} modules).`;
    return patch;
  } catch (error) {
    byId('community-draft-status').textContent = `The OMNI draft could not be read: ${error.message}`;
    return null;
  }
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
  const blob = new Blob([JSON.stringify({ format: 'overture-omni-patch', version: 1, data: item.patch_data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(item.title)}.omni.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  supabase.rpc('increment_community_patch_downloads', { p_patch_id: item.id }).catch(() => {});
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

async function auditionPatch(item, button) {
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
    const built = await graph.build(patch);
    if (!built) throw new Error('The patch could not be prepared for preview.');

    const active = { patchId: item.id, context, graph, stopped: false };
    state.activePreview = active;
    button.textContent = 'STOP';
    button.disabled = false;

    const keyboard = [...graph.instances.values()].find((instance) => typeof instance.noteOn === 'function');
    const runningGenerators = [...graph.instances.values()].filter((instance) => typeof instance.setRunning === 'function');
    if (keyboard) {
      const notes = [60, 64, 67, 72, 69, 67, 64, 62, 60, 64, 67, 72];
      for (const note of notes) {
        if (active.stopped) break;
        graph.noteOn(note, 0.72, 1);
        await wait(220);
        graph.noteOff(note, 1);
        await wait(80);
      }
    } else if (runningGenerators.length) {
      runningGenerators.forEach((instance) => instance.setRunning(true));
      await wait(6000);
      runningGenerators.forEach((instance) => instance.setRunning(false));
    } else {
      throw new Error('This patch has no connected keyboard or running sequencer to audition. You can still download and open it in OMNI.');
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

function openInOmni(item) {
  try {
    sessionStorage.setItem('overture.community.import', JSON.stringify(item.patch_data));
    window.location.assign('/omni');
  } catch (error) {
    message('community-result-count', `Could not prepare this patch: ${error.message}`, true);
  }
}

async function sharePatch(item) {
  const url = new URL('/community', window.location.origin);
  url.searchParams.set('patch', item.id);
  try {
    if (navigator.share) await navigator.share({ title: item.title, text: item.description || 'Community patch from Overture Instruments', url: url.href });
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

function renderCard(item) {
  const card = document.createElement('article');
  card.className = 'community-card';

  const top = addText(card, 'div', 'community-card__top', state.mine && item.visibility === 'unlisted' ? 'UNLISTED PATCH' : 'OMNI PATCH');
  const date = addText(top, 'span', '', friendlyDate(item.created_at));
  date.setAttribute('aria-label', `Published ${friendlyDate(item.created_at)}`);

  addText(card, 'h3', '', item.title);
  addText(card, 'p', 'community-card__description', item.description || 'No description provided.');
  const meta = addText(card, 'div', 'community-card__meta', '');
  addText(meta, 'span', '', `BY ${item.author_name || 'OVERTURE USER'}`);
  addText(meta, 'span', '', `${Number(item.downloads || 0).toLocaleString()} DOWNLOADS`);

  const tags = addText(card, 'div', 'community-tags', '');
  (Array.isArray(item.tags) ? item.tags : []).slice(0, 8).forEach((tag) => addText(tags, 'span', 'community-tag', tag));

  const previewUrl = previewPublicUrl(item.preview_path);
  if (previewUrl) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = previewUrl;
    audio.setAttribute('aria-label', `Audio preview for ${item.title}`);
    card.append(audio);
  }

  const actions = addText(card, 'div', 'community-card__actions', '');
  const listen = addText(actions, 'button', 'community-button', 'LISTEN');
  listen.type = 'button';
  listen.dataset.previewButton = item.id;
  listen.addEventListener('click', () => auditionPatch(item, listen));
  const open = addText(actions, 'button', 'community-button', 'OPEN IN OMNI');
  open.type = 'button'; open.addEventListener('click', () => openInOmni(item));
  const download = addText(actions, 'button', 'community-button', 'DOWNLOAD');
  download.type = 'button'; download.addEventListener('click', () => downloadJSON(item));
  const share = addText(actions, 'button', 'community-button', 'SHARE');
  share.type = 'button'; share.addEventListener('click', () => sharePatch(item));

  if (state.user?.id && item.owner_id === state.user.id) {
    const edit = addText(actions, 'button', 'community-button', 'EDIT');
    edit.type = 'button'; edit.addEventListener('click', () => beginEdit(item));
    const remove = addText(actions, 'button', 'community-button', 'DELETE');
    remove.type = 'button'; remove.addEventListener('click', () => deletePatch(item));
  }
  return card;
}

async function loadPatches({ append = false } = {}) {
  if (!supabase || state.loading) return;
  state.loading = true;
  const grid = byId('community-grid');
  if (!append) {
    state.offset = 0;
    state.items = [];
    grid.replaceChildren();
  }
  byId('community-load-more').hidden = true;
  byId('community-empty').hidden = true;
  message('community-result-count', 'Loading patches…');
  try {
    let query = supabase.from('community_patches')
      .select('id,owner_id,title,description,author_name,tags,visibility,patch_data,preview_path,downloads,created_at');
    if (state.mine && state.user) query = query.eq('owner_id', state.user.id);
    else query = query.eq('visibility', 'public');
    const search = byId('community-search').value.trim().replace(/[%_]/g, '');
    if (search) query = query.ilike('title', `%${search}%`);
    const order = byId('community-sort').value;
    query = query.order(order, { ascending: false }).range(state.offset, state.offset + state.pageSize);
    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const page = rows.slice(0, state.pageSize);
    state.items = append ? [...state.items, ...page] : page;
    state.offset += page.length;
    state.hasMore = rows.length > state.pageSize;
    page.forEach((item) => grid.append(renderCard(item)));
    byId('community-result-count').textContent = `${state.items.length}${state.hasMore ? '+' : ''} PATCHES`;
    byId('community-empty').hidden = state.items.length !== 0;
    byId('community-load-more').hidden = !state.hasMore;
  } catch (error) {
    message('community-result-count', error.message || 'Could not load community patches.', true);
  } finally {
    state.loading = false;
  }
}

function applyDraft(patch) {
  state.draft = patch;
  byId('community-draft-status').textContent = patch
    ? `Patch ready: ${patch.name} · ${patch.modules.length} modules.`
    : 'No OMNI patch selected. Open this page from OMNI or choose a .omni.json file.';
  if (patch && !byId('community-title').value) byId('community-title').value = patch.name.slice(0, 80);
}

function beginEdit(item) {
  state.editingId = item.id;
  applyDraft(item.patch_data);
  byId('community-title').value = item.title;
  byId('community-description').value = item.description || '';
  byId('community-tags').value = (item.tags || []).join(', ');
  byId('community-visibility').value = item.visibility;
  byId('community-audio-file').value = '';
  byId('community-publish-status').textContent = 'Editing your published patch. The current audio preview is kept unless you upload a replacement.';
  byId('community-publish-form').querySelector('[type="submit"]').textContent = 'UPDATE PATCH';
  setPublishOpen(true);
}

async function deletePatch(item) {
  if (!confirm(`Delete "${item.title}" from the community library? This cannot be undone.`)) return;
  try {
    if (item.preview_path) await supabase.storage.from('community-previews').remove([item.preview_path]);
    const { error } = await supabase.from('community_patches').delete().eq('id', item.id);
    if (error) throw error;
    message('community-result-count', 'Patch deleted.');
    await loadPatches();
  } catch (error) {
    message('community-result-count', error.message || 'Could not delete this patch.', true);
  }
}

async function publishPatch(event) {
  event.preventDefault();
  if (!state.user) {
    message('community-publish-status', 'Sign in with your email before publishing.', true);
    byId('community-auth-form').hidden = false;
    return;
  }

  const submit = byId('community-publish-form').querySelector('[type="submit"]');
  submit.disabled = true;
  message('community-publish-status', 'Publishing…');
  let uploadedPath = null;
  try {
    let patch = state.draft;
    const file = byId('community-patch-file').files?.[0];
    if (file) {
      if (file.size > 524288) throw new Error('OMNI patch files must be 512 KB or smaller.');
      const parsed = JSON.parse(await file.text());
      patch = extractPatch(parsed);
    }
    if (!patch) throw new Error('Choose an OMNI patch file or open this page using OMNI’s COMMUNITY button.');
    patch = validatePatch(patch);
    const patchJson = JSON.stringify(patch);
    if (new TextEncoder().encode(patchJson).byteLength > 500000) throw new Error('This patch is too large to publish (maximum 500 KB).');

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
      const patchId = state.editingId || crypto.randomUUID();
      const extension = ({ 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' })[mime];
      previewPath = `${state.user.id}/${patchId}/preview.${extension}`;
      const { error: uploadError } = await supabase.storage.from('community-previews').upload(previewPath, previewFile, { contentType: mime, upsert: true });
      if (uploadError) throw uploadError;
      uploadedPath = previewPath;
    }

    const userName = state.user.user_metadata?.display_name
      || state.user.email?.split('@')[0]
      || 'Overture user';
    const record = {
      owner_id: state.user.id,
      title,
      description: byId('community-description').value.trim().slice(0, 600),
      author_name: String(userName).slice(0, 48),
      tags,
      visibility: byId('community-visibility').value,
      patch_data: patch,
    };
    if (previewPath) record.preview_path = previewPath;
    if (!state.editingId && !previewPath) record.preview_path = null;

    let result;
    if (state.editingId) {
      result = await supabase.from('community_patches').update(record).eq('id', state.editingId).select('id').single();
    } else {
      result = await supabase.from('community_patches').insert(record).select('id').single();
    }
    if (result.error) throw result.error;

    state.draft = patch;
    try { sessionStorage.removeItem('overture.community.draft'); } catch { /* optional draft */ }
    state.editingId = null;
    byId('community-patch-file').value = '';
    byId('community-audio-file').value = '';
    byId('community-publish-form').querySelector('[type="submit"]').textContent = 'PUBLISH PATCH';
    message('community-publish-status', 'Patch published. It is now available in the community library.');
    state.mine = false;
    await loadPatches();
  } catch (error) {
    if (uploadedPath && !state.editingId) {
      try { await supabase.storage.from('community-previews').remove([uploadedPath]); } catch { /* best effort cleanup */ }
    }
    message('community-publish-status', error.message || 'Could not publish this patch.', true);
  } finally {
    submit.disabled = false;
  }
}

async function updateAccount() {
  const status = byId('community-account-status');
  if (!supabaseConfigured) {
    status.textContent = 'Community backend not configured.';
    byId('community-setup').hidden = false;
    byId('community-auth-form').hidden = true;
    byId('community-publish-open').disabled = true;
    return;
  }
  byId('community-setup').hidden = true;
  const { data, error } = await supabase.auth.getSession();
  if (error) status.textContent = error.message;
  state.user = data?.session?.user || null;
  if (state.user) {
    status.textContent = `SIGNED IN AS ${state.user.email || 'OVERTURE USER'}`;
    byId('community-auth-form').hidden = true;
    byId('community-signout').hidden = false;
    byId('community-publish-open').disabled = false;
  } else {
    status.textContent = 'Sign in to publish and manage your patches. Browsing and downloading public patches does not require an account.';
    byId('community-auth-form').hidden = false;
    byId('community-signout').hidden = true;
    byId('community-publish-open').disabled = true;
  }
}

async function signIn(event) {
  event.preventDefault();
  const email = byId('community-email').value.trim();
  if (!email) return;
  const button = byId('community-auth-form').querySelector('button');
  button.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/community` },
    });
    if (error) throw error;
    message('community-account-status', 'Sign-in link sent. Check your email and open the link in this browser.');
  } catch (error) {
    message('community-account-status', error.message || 'Could not send the sign-in link.', true);
  } finally {
    button.disabled = false;
  }
}

function initialiseNavigation() {
  const nav = byId('main-nav');
  const toggle = document.querySelector('.menu-toggle');
  if (!nav || !toggle) return;
  toggle.addEventListener('click', () => {
    const opening = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(opening));
    toggle.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
    nav.classList.toggle('is-open', opening);
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}

function initialise() {
  initialiseNavigation();
  if (!supabaseConfigured) {
    updateAccount();
    return;
  }

  state.draft = readDraft();
  if (new URLSearchParams(window.location.search).get('publish') === '1' && state.draft) setPublishOpen(true);
  byId('community-publish-open').addEventListener('click', () => setPublishOpen(true));
  byId('community-publish-close').addEventListener('click', () => setPublishOpen(false));
  byId('community-publish-form').addEventListener('submit', publishPatch);
  byId('community-patch-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 524288) throw new Error('OMNI patch files must be 512 KB or smaller.');
      const patch = extractPatch(JSON.parse(await file.text()));
      applyDraft(patch);
    } catch (error) {
      applyDraft(null);
      message('community-publish-status', error.message || 'Invalid OMNI patch file.', true);
    }
  });
  byId('community-auth-form').addEventListener('submit', signIn);
  byId('community-signout').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) message('community-account-status', error.message, true);
    await updateAccount();
  });
  byId('community-sort').addEventListener('change', () => loadPatches());
  byId('community-search').addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadPatches(), 250);
  });
  byId('community-load-more').addEventListener('click', () => loadPatches({ append: true }));

  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user || null;
    updateAccount();
    if (!state.mine) loadPatches();
  });
  updateAccount().then(() => {
    const requestedPatch = new URLSearchParams(window.location.search).get('patch');
    if (requestedPatch) {
      supabase.from('community_patches')
        .select('id,owner_id,title,description,author_name,tags,visibility,patch_data,preview_path,downloads,created_at')
        .eq('id', requestedPatch).maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          byId('community-grid').prepend(renderCard(data));
          message('community-result-count', 'Shared patch loaded.');
        });
    }
    loadPatches();
  });
}

initialise();
