import {
  supabase,
  supabaseConfigured,
  configureSupabase,
  previewPublicUrl,
} from './shared/supabaseClient.js';

const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 24;
const INSTRUMENTS = {
  'little-phatty': { name: 'Moog Little Phatty', route: '/html/little-phatty' },
  'sub-37': { name: 'Moog Subsequent 37', route: '/html/sub37' },
  'prophet-10': { name: 'Sequential Prophet-10', route: '/html/prophet10' },
  'nord-c2d': { name: 'Nord C2D', route: '/html/nord-c2d' },
  'ms-20': { name: 'Korg MS-20', route: '/html/korg-ms-20' },
  'juno-106': { name: 'Roland Juno-106', route: '/html/roland-juno-106' },
  dx7: { name: 'Yamaha DX7', route: '/html/yamaha-dx7' },
  'tr-808': { name: 'Roland TR-808', route: '/html/roland-tr-808' },
};

const state = {
  profile: null,
  user: null,
  isOwner: false,
  items: [],
  offset: 0,
  hasMore: false,
  loading: false,
  requestId: 0,
  totalCount: 0,
  searchTimer: null,
};

function setStatus(value, isError = false) {
  const node = $('contributions-status');
  node.textContent = value || '';
  node.classList.toggle('is-error', isError);
}

function showPrompt(title, copy, href = '/account?returnTo=%2Fcontributions', label = 'LOG IN') {
  $('contributions-prompt-title').textContent = title;
  $('contributions-prompt-copy').textContent = copy;
  $('contributions-prompt-link').href = href;
  $('contributions-prompt-link').textContent = label;
  $('contributions-prompt').hidden = false;
  $('contributions-toolbar').hidden = true;
  $('contributions-profile').hidden = true;
  $('contributions-results').hidden = true;
  setStatus('');
}

function initials(value) {
  return String(value || 'OI').trim().split(/[\s._-]+/).filter(Boolean)
    .slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'OI';
}

function friendlyDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(date);
}

function safeFilename(value) {
  return String(value || 'overture-patch').trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'overture-patch';
}

function setProfileHeader(profile) {
  const name = profile.display_name || profile.username;
  $('contributions-name').textContent = name;
  $('contributions-username').textContent = `@${profile.username}`;
  $('contributions-eyebrow').textContent = state.isOwner ? 'YOUR CONTRIBUTIONS' : 'COMMUNITY CONTRIBUTOR';
  $('contributions-total-label').textContent = state.isOwner ? 'PUBLISHED ITEMS' : 'PUBLIC CONTRIBUTIONS';

  const avatar = $('contributions-avatar');
  avatar.replaceChildren();
  if (profile.avatar_url && /^https?:\/\//i.test(profile.avatar_url)) {
    const image = document.createElement('img');
    image.src = profile.avatar_url;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      avatar.textContent = initials(name);
    }, { once: true });
    avatar.append(image);
  } else {
    avatar.textContent = initials(name);
  }

  $('contributions-profile').hidden = false;
  $('contributions-prompt').hidden = true;
  $('contributions-toolbar').hidden = false;
  $('contributions-results').hidden = false;
  $('contributions-publish').hidden = !state.isOwner;
  document.title = `${name} (@${profile.username}) | Contributions | Overture Instruments`;
}

function addText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value ?? '';
  parent.append(node);
  return node;
}

function profileHref() {
  return `/contributions?username=${encodeURIComponent(state.profile.username)}`;
}

function downloadItem(item) {
  const isInstrument = item.record_type === 'instrument_preset';
  const contents = isInstrument
    ? {
      format: 'overture-community-instrument-preset',
      version: 1,
      instrumentId: item.instrument_id,
      name: item.title,
      data: item.patch_data,
    }
    : { format: 'overture-omni-patch', version: 1, data: item.patch_data };
  const blob = new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(item.title)}.${isInstrument ? 'preset' : 'omni'}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  void supabase.rpc('increment_community_patch_downloads', { p_patch_id: item.id });
}

function openItem(item) {
  try {
    if (item.record_type === 'instrument_preset') {
      const instrument = INSTRUMENTS[item.instrument_id];
      if (!instrument) throw new Error('This instrument preset is not supported by the current Overture library.');
      sessionStorage.setItem('overture.community.instrument-import', JSON.stringify({
        instrumentId: item.instrument_id,
        title: item.title,
        data: item.patch_data,
      }));
      window.location.assign(instrument.route);
    } else {
      sessionStorage.setItem('overture.community.import', JSON.stringify(item.patch_data));
      window.location.assign('/omni');
    }
  } catch (error) {
    setStatus(`Could not prepare this item: ${error.message}`, true);
  }
}

async function shareItem(item) {
  const url = new URL('/community', window.location.origin);
  url.searchParams.set('patch', item.id);
  try {
    if (navigator.share) {
      await navigator.share({
        title: item.title,
        text: item.description || 'Community item from Overture Instruments',
        url: url.href,
      });
    } else {
      await navigator.clipboard.writeText(url.href);
      setStatus('Share link copied.');
    }
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('Could not share this link. Copy the page URL from your browser.', true);
  }
}

function editItem(item) {
  if (!state.isOwner || item.owner_id !== state.profile.id) return;
  const url = new URL('/community', window.location.origin);
  url.searchParams.set('patch', item.id);
  url.searchParams.set('edit', '1');
  window.location.assign(url.href);
}

async function deleteItem(item, card) {
  if (!state.isOwner || item.owner_id !== state.profile.id) return;
  if (!window.confirm(`Delete "${item.title}" from the Overture community? This cannot be undone.`)) return;

  const buttons = card.querySelectorAll('button');
  buttons.forEach((button) => { button.disabled = true; });
  setStatus(`Deleting "${item.title}"…`);
  try {
    const { error } = await supabase.from('community_patches').delete().eq('id', item.id);
    if (error) throw error;

    if (item.preview_path) {
      const { error: storageError } = await supabase.storage
        .from('community-previews').remove([item.preview_path]);
      if (storageError) console.warn('Community preview could not be removed:', storageError.message);
    }
    state.items = state.items.filter((entry) => entry.id !== item.id);
    state.totalCount = Math.max(0, state.totalCount - 1);
    card.remove();
    $('contributions-total').textContent = String(state.totalCount);
    $('contributions-count').textContent = `${state.items.length} SHOWN`;
    $('contributions-empty').hidden = state.items.length !== 0 || state.hasMore;
    setStatus('Contribution deleted.');
  } catch (error) {
    setStatus(error.message || 'Could not delete this contribution.', true);
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function renderCard(item) {
  const card = document.createElement('article');
  card.className = 'community-card contributions-card';
  const isInstrument = item.record_type === 'instrument_preset';
  const top = addText(
    card,
    'div',
    'community-card__top',
    isInstrument ? (INSTRUMENTS[item.instrument_id]?.name || 'INSTRUMENT PRESET') : 'OMNI PATCH',
  );
  addText(top, 'span', '', friendlyDate(item.created_at));
  addText(card, 'h3', '', item.title);
  addText(card, 'p', 'community-card__description', item.description || 'No description provided.');

  const meta = addText(card, 'div', 'community-card__meta', '');
  const by = addText(meta, 'span', '', 'BY ');
  const author = addText(by, 'a', 'community-card__author', item.author_name || state.profile.display_name || `@${state.profile.username}`);
  author.href = profileHref();
  author.title = `View @${state.profile.username}'s contributions`;
  addText(meta, 'span', '', `${Number(item.downloads || 0).toLocaleString()} DOWNLOADS`);

  const tags = addText(card, 'div', 'community-tags', '');
  (Array.isArray(item.tags) ? item.tags : []).slice(0, 8)
    .forEach((tag) => addText(tags, 'span', 'community-tag', tag));
  if (state.isOwner) {
    addText(
      tags,
      'span',
      'contributions-card__visibility',
      item.visibility === 'unlisted' ? 'UNLISTED' : 'PUBLIC',
    );
  }

  const previewUrl = previewPublicUrl(item.preview_path);
  if (previewUrl) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = previewUrl;
    audio.setAttribute('aria-label', `Audio preview for ${item.title}`);
    card.append(audio);
  }

  const actions = addText(card, 'div', 'contributions-card__actions', '');
  const openCommunity = addText(actions, 'a', 'community-button', 'VIEW IN COMMUNITY');
  openCommunity.href = `/community?patch=${encodeURIComponent(item.id)}`;
  const open = addText(actions, 'button', 'community-button', isInstrument ? 'OPEN IN INSTRUMENT' : 'OPEN IN OMNI');
  open.type = 'button';
  open.addEventListener('click', () => openItem(item));
  const download = addText(actions, 'button', 'community-button', 'DOWNLOAD');
  download.type = 'button';
  download.addEventListener('click', () => downloadItem(item));
  const share = addText(actions, 'button', 'community-button', 'SHARE');
  share.type = 'button';
  share.addEventListener('click', () => shareItem(item));

  if (state.isOwner && item.owner_id === state.profile.id) {
    const edit = addText(actions, 'button', 'community-button', 'EDIT');
    edit.type = 'button';
    edit.addEventListener('click', () => editItem(item));
    const remove = addText(actions, 'button', 'community-button community-button--danger', 'DELETE');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteItem(item, card));
  }
  return card;
}

async function loadItems({ append = false } = {}) {
  if (!supabase || !state.profile) return;
  if (append && state.loading) return;
  state.loading = true;
  const requestId = ++state.requestId;
  const start = append ? state.offset : 0;
  if (!append) {
    state.offset = 0;
    state.items = [];
    $('contributions-grid').replaceChildren();
    $('contributions-empty').hidden = true;
  }
  $('contributions-load-more').hidden = true;
  setStatus('Loading contributions…');

  try {
    let query = supabase.from('community_patches')
      .select('id,owner_id,record_type,instrument_id,title,description,author_name,tags,visibility,patch_data,preview_path,downloads,created_at', { count: 'exact' })
      .eq('owner_id', state.profile.id);

    // Owners can see their own public and unlisted items. Everyone else is
    // restricted to public records, with RLS enforcing the same rule server-side.
    if (!state.isOwner) query = query.eq('visibility', 'public');

    const search = $('contributions-search').value.trim()
      .toLowerCase().replace(/[^a-z0-9\s-]/g, '').slice(0, 50);
    if (search) {
      const tagTerms = [...new Set(search.split(/\s+/).filter(Boolean))]
        .map((term) => 'tags.cs.{' + term + '}');
      query = query.or([
        'title.ilike.%' + search + '%',
        'description.ilike.%' + search + '%',
        ...tagTerms,
      ].join(','));
    }

    const type = $('contributions-filter-type').value;
    if (type !== 'all') query = query.eq('record_type', type);
    query = query.order($('contributions-sort').value, { ascending: false })
      .range(start, start + PAGE_SIZE);

    const { data, error, count } = await query;
    if (error) throw error;
    if (requestId !== state.requestId) return;

    const rows = data || [];
    state.totalCount = Number.isFinite(count) ? count : (append ? state.totalCount : rows.length);
    const page = rows.slice(0, PAGE_SIZE);
    state.items = append ? [...state.items, ...page] : page;
    state.offset = start + page.length;
    state.hasMore = rows.length > PAGE_SIZE;
    page.forEach((item) => $('contributions-grid').append(renderCard(item)));

    const shown = state.items.length;
    $('contributions-total').textContent = String(state.totalCount);
    $('contributions-count').textContent = `${shown}${state.hasMore ? '+' : ''} ITEMS`;
    $('contributions-empty').hidden = shown !== 0;
    $('contributions-load-more').hidden = !state.hasMore;
    setStatus(state.isOwner
      ? 'These are your published community items. You can edit or delete your own work here.'
      : 'Public contributions from this Overture creator.');
  } catch (error) {
    if (requestId === state.requestId) setStatus(error.message || 'Could not load contributions.', true);
  } finally {
    if (requestId === state.requestId) state.loading = false;
  }
}

function bindControls() {
  $('contributions-sort').addEventListener('change', () => { void loadItems(); });
  $('contributions-filter-type').addEventListener('change', () => { void loadItems(); });
  $('contributions-search').addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => { void loadItems(); }, 250);
  });
  $('contributions-load-more').addEventListener('click', () => { void loadItems({ append: true }); });
}

async function loadTargetProfile(session) {
  const requested = new URLSearchParams(window.location.search).get('username');
  let query = supabase.from('profiles').select('id,username,display_name,avatar_url');
  if (requested) {
    const username = requested.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return null;
    query = query.eq('username', username);
  } else {
    if (!session?.user?.id) return null;
    query = query.eq('id', session.user.id);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function initialise() {
  if (!supabaseConfigured) {
    showPrompt(
      'Contributions unavailable',
      'The Overture community connection has not been configured.',
      '/community',
      'OPEN COMMUNITY',
    );
    return;
  }

  try {
    await configureSupabase();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    state.user = sessionData.session?.user || null;

    if (!new URLSearchParams(window.location.search).has('username') && !state.user) {
      showPrompt(
        'My Contributions',
        'Sign in to view your published Overture community contributions.',
      );
      return;
    }

    state.profile = await loadTargetProfile(sessionData.session);
    if (!state.profile) {
      showPrompt(
        'Profile not found',
        'This Overture contributor could not be found. They may have changed their username.',
        '/community',
        'BROWSE COMMUNITY',
      );
      return;
    }

    state.isOwner = Boolean(state.user?.id && state.user.id === state.profile.id);
    setProfileHeader(state.profile);
    bindControls();
    await loadItems();

    supabase.auth.onAuthStateChange((_event, session) => {
      state.user = session?.user || null;
      const wasOwner = state.isOwner;
      state.isOwner = Boolean(state.user?.id && state.user.id === state.profile.id);
      if (wasOwner !== state.isOwner) {
        $('contributions-eyebrow').textContent = state.isOwner ? 'YOUR CONTRIBUTIONS' : 'COMMUNITY CONTRIBUTOR';
        $('contributions-total-label').textContent = state.isOwner ? 'PUBLISHED ITEMS' : 'PUBLIC CONTRIBUTIONS';
        $('contributions-publish').hidden = !state.isOwner;
        void loadItems();
      }
    });
  } catch (error) {
    showPrompt('Could not load contributions', error.message || 'The Overture community could not be reached.', '/community', 'OPEN COMMUNITY');
  }
}

initialise();
