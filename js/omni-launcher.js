import { supabaseConfigured, configureSupabase } from './shared/supabaseClient.js';
import { PresetStore, downloadText, pickFile } from './shared/presetStore.js';
import { defaultPatch, validatePatch } from './omni/graph.js?v=20261117-omni-module-expansion-r3';
import { TEMPLATES, templatePreview } from './omni/templates.js?v=20261117-omni-module-expansion-r3';

const root = document.getElementById('omni-root');
const isEditor = new URLSearchParams(window.location.search).get('editor') === '1';
document.documentElement.classList.toggle('omni-editor-mode', isEditor);
document.documentElement.classList.toggle('omni-launcher-mode', !isEditor);

const localStore = new PresetStore({
  key: 'overture.omni.patches',
  version: 2,
  validate: validatePatch,
  migrations: { 1: (stored) => ({ ...stored, version: 2 }) },
});

const state = {
  supabase: null,
  user: null,
  accountPatches: [],
  communityPatches: [],
  query: '',
  filter: 'all',
  sort: 'updated_at',
  setupError: '',
};

const localItems = () => localStore.items.map((item) => ({
  id: item.id,
  title: item.name,
  description: '',
  patch_data: item.data,
  created_at: item.created,
  updated_at: item.created,
  source: 'local',
}));

const allItems = () => [
  ...state.accountPatches.map((item) => ({ ...item, source: 'account' })),
  ...state.communityPatches.map((item) => ({ ...item, source: 'community' })),
  ...localItems(),
];

function setStatus(message, error = false) {
  const node = document.getElementById('omni-launch-status');
  if (!node) return;
  node.textContent = message || '';
  node.classList.toggle('is-error', error);
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Saved on this device'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function sourceLabel(source) {
  return ({ account: 'ACCOUNT', local: 'THIS DEVICE', community: 'PUBLISHED' })[source] || 'PATCH';
}

function getVisibleItems() {
  const query = state.query.trim().toLowerCase();
  const items = allItems().filter((item) => {
    if (state.filter !== 'all' && item.source !== state.filter) return false;
    if (!query) return true;
    const moduleText = item.patch_data.modules.map((module) => module.type + ' ' + module.id).join(' ');
    const connectionText = item.patch_data.connections.map((connection) => connection.from.port + ' ' + connection.to.port).join(' ');
    return (item.title + ' ' + (item.description || '') + ' ' + moduleText + ' ' + connectionText).toLowerCase().includes(query);
  });
  items.sort((a, b) => {
    if (state.sort === 'title') return a.title.localeCompare(b.title);
    if (state.sort === 'modules') return b.patch_data.modules.length - a.patch_data.modules.length;
    if (state.sort === 'connections') return b.patch_data.connections.length - a.patch_data.connections.length;
    return new Date(b[state.sort] || b.created_at).getTime() - new Date(a[state.sort] || a.created_at).getTime();
  });
  return items;
}

function openEditor(data = defaultPatch(), id = null, source = 'new', item = null) {
  try {
    const patch = validatePatch(data);
    if (source === 'community' && item) {
      sessionStorage.setItem('overture.community.import', JSON.stringify({
        data: patch,
        title: item.title,
        communityItemId: item.id,
        previewPath: item.preview_path || null,
      }));
    } else {
      sessionStorage.setItem('overture.omni.launch-patch', JSON.stringify({
        data: patch,
        id: source === 'local' ? id : null,
        source,
      }));
    }
    window.location.assign('/omni?editor=1');
  } catch (error) {
    setStatus(error.message || 'Could not open that patch.', true);
  }
}

async function refreshAccountPatches() {
  state.accountPatches = [];
  state.communityPatches = [];
  if (!state.supabase || !state.user) return;

  const privateQuery = state.supabase.from('omni_user_patches')
    .select('id,owner_id,title,description,patch_data,created_at,updated_at')
    .eq('owner_id', state.user.id)
    .order('updated_at', { ascending: false })
    .limit(250);

  const communityQuery = state.supabase.from('community_patches')
    .select('id,owner_id,title,description,patch_data,preview_path,visibility,created_at,updated_at')
    .eq('owner_id', state.user.id)
    .eq('record_type', 'omni_patch')
    .order('updated_at', { ascending: false })
    .limit(250);

  const [privateResult, communityResult] = await Promise.all([privateQuery, communityQuery]);
  if (privateResult.error) {
    state.setupError = privateResult.error.message || 'The private OMNI patch table is not available.';
  } else {
    state.accountPatches = (privateResult.data || []).map((item) => ({
      ...item,
      patch_data: validatePatch(item.patch_data),
    }));
    state.setupError = '';
  }

  if (!communityResult.error) {
    state.communityPatches = (communityResult.data || []).map((item) => ({
      ...item,
      patch_data: validatePatch(item.patch_data),
    }));
  } else {
    console.warn('Could not load your published OMNI patches:', communityResult.error.message);
  }
}

function makeButton(label, className, onClick, title = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  if (title) button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

function makePatchTile(item) {
  const tile = document.createElement('article');
  tile.className = 'omni-patch-tile';
  tile.dataset.source = item.source;

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'omni-patch-tile__open';
  open.setAttribute('aria-label', 'Open ' + item.title);
  open.addEventListener('click', () => openEditor(item.patch_data, item.id, item.source, item));

  const preview = document.createElement('div');
  preview.className = 'omni-patch-tile__preview';
  preview.innerHTML = templatePreview(item.patch_data, 380, 150);
  const metrics = document.createElement('span');
  metrics.className = 'omni-patch-tile__metrics';
  metrics.textContent = item.patch_data.modules.length + ' MODULES  ·  ' + item.patch_data.connections.length + ' CONNECTIONS';
  preview.append(metrics);

  const body = document.createElement('div');
  body.className = 'omni-patch-tile__body';
  const details = document.createElement('div');
  details.className = 'omni-patch-tile__details';
  const title = document.createElement('h3');
  title.textContent = item.title;
  const meta = document.createElement('p');
  meta.textContent = dateLabel(item.updated_at || item.created_at) + '  ·  ' + sourceLabel(item.source);
  details.append(title, meta);
  const arrow = document.createElement('span');
  arrow.className = 'omni-patch-tile__arrow';
  arrow.textContent = '↗';
  body.append(details, arrow);
  open.append(preview, body);
  tile.append(open);

  const actions = document.createElement('div');
  actions.className = 'omni-patch-tile__actions';
  actions.append(makeButton('OPEN', 'omni-patch-action omni-patch-action--open', () => openEditor(item.patch_data, item.id, item.source, item)));
  actions.append(makeButton(
    item.source === 'local' ? 'SAVE TO ACCOUNT' : (item.source === 'account' ? 'SAVE' : 'EDIT'),
    'omni-patch-action',
    () => item.source === 'community' ? openEditor(item.patch_data, item.id, item.source, item) : syncItem(item),
  ));
  actions.append(makeButton('RENAME', 'omni-patch-action', () => renameItem(item)));
  actions.append(makeButton('EXPORT', 'omni-patch-action', () => exportItem(item)));
  actions.append(makeButton('DELETE', 'omni-patch-action omni-patch-action--quiet', () => deleteItem(item)));
  tile.append(actions);
  return tile;
}

function renderGrid() {
  const grid = document.getElementById('omni-patch-grid');
  const empty = document.getElementById('omni-empty');
  const count = document.getElementById('omni-patch-count');
  if (!grid || !empty || !count) return;

  const items = getVisibleItems();
  grid.replaceChildren(...items.map(makePatchTile));
  count.textContent = String(allItems().length);
  empty.hidden = items.length > 0;
  const emptyTitle = empty.querySelector('h3');
  const emptyCopy = empty.querySelector('p');
  if (emptyTitle) emptyTitle.textContent = allItems().length ? 'No matching patches' : 'Your patch library is empty';
  if (emptyCopy) emptyCopy.textContent = allItems().length
    ? 'Try a different search or change the filter.'
    : 'Start with a new patch, choose a template, or import a patch you already made.';
}

function renderStatus() {
  if (state.setupError) {
    setStatus('Account library unavailable: ' + state.setupError + '. Run the OMNI user-patches migration in Supabase to enable private cloud saves.', true);
  } else if (!state.user) {
    setStatus('Your device patches are shown here. Sign in to sync them to your Overture account.');
  } else {
    setStatus('Your private account patches, published patches and device saves are shown together.');
  }
}

function render() {
  root.innerHTML = [
    '<main class="omni-launcher">',
    '  <section class="omni-launcher__intro" aria-labelledby="omni-launcher-title">',
    '    <div class="omni-launcher__intro-copy">',
    '      <p class="omni-launcher__eyebrow">OVERTURE / CREATIVE SYSTEMS / 01</p>',
    '      <h1 id="omni-launcher-title">Overture <em>OMNI</em></h1>',
    '      <p>Build an instrument from the ground up, or pick up where you left off.</p>',
    '    </div>',
    '    <div class="omni-launcher__intro-mark" aria-hidden="true"><span>O</span><i></i></div>',
    '  </section>',
    '  <section class="omni-launcher__quick-actions" aria-label="Create or import a patch">',
    '    <button class="omni-launcher__create" id="omni-new" type="button"><span class="omni-launcher__action-symbol">＋</span><span><b>New patch</b><small>Start with an empty instrument</small></span></button>',
    '    <button class="omni-launcher__quick-action" id="omni-templates" type="button"><span class="omni-launcher__action-symbol">▦</span><span><b>Start from template</b><small>Explore the starter library</small></span></button>',
    '    <button class="omni-launcher__quick-action" id="omni-import" type="button"><span class="omni-launcher__action-symbol">↥</span><span><b>Import patch</b><small>Open a saved OMNI JSON file</small></span></button>',
    '    <button class="omni-launcher__quick-action" id="omni-export-all" type="button"><span class="omni-launcher__action-symbol">↓</span><span><b>Export library</b><small>Back up your saved patches</small></span></button>',
    '  </section>',
    '  <section class="omni-launcher__library" aria-labelledby="omni-patches-title">',
    '    <div class="omni-launcher__section-head"><div><p class="omni-launcher__eyebrow">YOUR WORKSPACE</p><h2 id="omni-patches-title">My patches <span id="omni-patch-count">0</span></h2></div><button id="omni-refresh" class="omni-launcher__refresh" type="button">↻ <span>Refresh</span></button></div>',
    '    <div class="omni-launcher__tools">',
    '      <label class="omni-launcher__search"><span aria-hidden="true">⌕</span><input id="omni-search" type="search" placeholder="Search patches or modules…" autocomplete="off"></label>',
    '      <label class="omni-launcher__select"><span>SHOW</span><select id="omni-filter"><option value="all">All patches</option><option value="account">Account</option><option value="local">This device</option><option value="community">Published</option></select></label>',
    '      <label class="omni-launcher__select"><span>SORT BY</span><select id="omni-sort"><option value="updated_at">Recently updated</option><option value="created_at">Date created</option><option value="title">Name</option><option value="modules">Most modules</option><option value="connections">Most connections</option></select></label>',
    '    </div>',
    '    <p id="omni-launch-status" class="omni-launcher__status" role="status" aria-live="polite"></p>',
    '    <div class="omni-launcher__grid" id="omni-patch-grid"></div>',
    '    <div class="omni-launcher__empty" id="omni-empty" hidden><span aria-hidden="true">⌁</span><h3>Your patch library is empty</h3><p>Start with a new patch, choose a template, or import a patch you already made.</p></div>',
    '  </section>',
    '  <footer class="omni-launcher__footer"><span>OVERTURE OMNI <i>·</i> MODULAR SOUND DESIGN</span><span>PRIVATE BY DEFAULT <i>·</i> PUBLISH WHEN YOU ARE READY</span></footer>',
    '</main>',
  ].join('');

  document.getElementById('omni-filter').value = state.filter;
  document.getElementById('omni-sort').value = state.sort;
  document.getElementById('omni-search').value = state.query;

  document.getElementById('omni-new').addEventListener('click', () => openEditor());
  document.getElementById('omni-templates').addEventListener('click', showTemplates);
  document.getElementById('omni-import').addEventListener('click', importPatch);
  document.getElementById('omni-export-all').addEventListener('click', exportLibrary);
  document.getElementById('omni-refresh').addEventListener('click', refreshAndRender);
  document.getElementById('omni-search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderGrid();
  });
  document.getElementById('omni-filter').addEventListener('change', (event) => {
    state.filter = event.target.value;
    renderGrid();
  });
  document.getElementById('omni-sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderGrid();
  });

  renderGrid();
  renderStatus();
}

async function refreshAndRender() {
  const button = document.getElementById('omni-refresh');
  if (button) { button.disabled = true; button.textContent = 'Refreshing…'; }
  try {
    await refreshAccountPatches();
    renderGrid();
    renderStatus();
  } catch (error) {
    setStatus(error.message || 'Could not refresh the patch library.', true);
  } finally {
    if (button) { button.disabled = false; button.innerHTML = '↻ <span>Refresh</span>'; }
  }
}

function showTemplates() {
  const overlay = document.createElement('div');
  overlay.className = 'omni-launcher__overlay';
  const dialog = document.createElement('section');
  dialog.className = 'omni-launcher__template-panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'omni-template-title');

  const header = document.createElement('header');
  header.className = 'omni-launcher__dialog-head';
  const headingGroup = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'omni-launcher__eyebrow';
  eyebrow.textContent = 'STARTER PATCHES';
  const heading = document.createElement('h2');
  heading.id = 'omni-template-title';
  heading.textContent = 'Choose a template';
  headingGroup.append(eyebrow, heading);
  const close = makeButton('×', 'omni-launcher__dialog-close', () => overlay.remove(), 'Close templates');
  header.append(headingGroup, close);

  const searchLabel = document.createElement('label');
  searchLabel.className = 'omni-launcher__search omni-launcher__template-search';
  const searchLabelText = document.createElement('span');
  searchLabelText.textContent = '⌕';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search templates…';
  search.autocomplete = 'off';
  searchLabel.append(searchLabelText, search);

  const grid = document.createElement('div');
  grid.className = 'omni-launcher__template-grid';
  const drawTemplates = () => {
    const query = search.value.trim().toLowerCase();
    const templates = TEMPLATES.filter((item) => (item.name + ' ' + item.desc).toLowerCase().includes(query));
    grid.replaceChildren();
    templates.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'omni-launcher__template';
      const name = document.createElement('b');
      name.textContent = item.name;
      const description = document.createElement('small');
      description.textContent = item.desc;
      button.append(name, description);
      button.addEventListener('click', () => {
        overlay.remove();
        openEditor(item.patch, null, 'template');
      });
      grid.append(button);
    });
  };
  search.addEventListener('input', drawTemplates);
  drawTemplates();
  dialog.append(header, searchLabel, grid);
  overlay.append(dialog);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') overlay.remove(); });
  document.body.append(overlay);
  close.focus();
}

function importPatch() {
  pickFile('.json,application/json', (raw) => {
    try {
      const imported = localStore.parseImport(raw);
      const item = localStore.save(imported.name, imported.data);
      renderGrid();
      setStatus('Imported "' + item.name + '" to this device. Open it from your patch library.');
    } catch (error) {
      setStatus(error.message || 'Could not import that patch.', true);
    }
  });
}

function exportItem(item) {
  downloadText(
    item.title.replace(/\W+/g, '-') + '.omni.json',
    JSON.stringify({ format: 'overture.omni.patches', version: 2, name: item.title, data: item.patch_data }, null, 2),
  );
}

function exportLibrary() {
  const items = allItems();
  downloadText('overture-omni-library.json', JSON.stringify({
    format: 'overture-omni-library',
    version: 1,
    exported_at: new Date().toISOString(),
    items: items.map((item) => ({ name: item.title, source: item.source, data: item.patch_data })),
  }, null, 2));
  setStatus('Exported the patches currently shown in your library.');
}

async function syncItem(item) {
  if (!state.supabase || !state.user) {
    setStatus('Sign in to your Overture account before syncing patches.', true);
    return;
  }
  try {
    const payload = {
      owner_id: state.user.id,
      title: item.title.slice(0, 80),
      description: item.description || '',
      patch_data: validatePatch(item.patch_data),
    };
    let result;
    if (item.source === 'account') {
      result = await state.supabase.from('omni_user_patches')
        .update(payload).eq('id', item.id).eq('owner_id', state.user.id).select('id').single();
    } else {
      result = await state.supabase.from('omni_user_patches')
        .insert(payload).select('id').single();
    }
    if (result.error) throw result.error;
    if (item.source === 'local') localStore.remove(item.id);
    await refreshAccountPatches();
    renderGrid();
    setStatus(item.source === 'account' ? 'Account patch saved.' : 'Patch synced to your Overture account.');
  } catch (error) {
    setStatus(error.message || 'Could not save this account patch.', true);
  }
}

async function renameItem(item) {
  const nextName = window.prompt('Patch name', item.title);
  if (nextName === null) return;
  const title = nextName.trim().slice(0, 80);
  if (title.length < 3) {
    setStatus('Patch names must contain at least three characters.', true);
    return;
  }
  try {
    if (item.source === 'local') {
      localStore.rename(item.id, title);
    } else {
      const table = item.source === 'community' ? 'community_patches' : 'omni_user_patches';
      const { error } = await state.supabase.from(table).update({ title }).eq('id', item.id).eq('owner_id', state.user.id);
      if (error) throw error;
    }
    await refreshAccountPatches();
    renderGrid();
    setStatus('Renamed "' + title + '".');
  } catch (error) {
    setStatus(error.message || 'Could not rename that patch.', true);
  }
}

async function deleteItem(item) {
  if (!window.confirm('Delete "' + item.title + '"? This cannot be undone.')) return;
  try {
    if (item.source === 'local') {
      localStore.remove(item.id);
    } else {
      const table = item.source === 'community' ? 'community_patches' : 'omni_user_patches';
      const { error } = await state.supabase.from(table).delete().eq('id', item.id).eq('owner_id', state.user.id);
      if (error) throw error;
      if (item.source === 'community' && item.preview_path) {
        const { error: storageError } = await state.supabase.storage.from('community-previews').remove([item.preview_path]);
        if (storageError) console.warn('Could not remove the published preview file:', storageError.message);
      }
    }
    await refreshAccountPatches();
    renderGrid();
    setStatus('Deleted "' + item.title + '".');
  } catch (error) {
    setStatus(error.message || 'Could not delete that patch.', true);
  }
}

async function bootLauncher() {
  root.innerHTML = '<div class="omni-launcher__loading"><img src="/ui/Logos/OvertureLogo.png" alt=""><span>LOADING YOUR PATCH LIBRARY</span><i></i></div>';
  try {
    if (supabaseConfigured) {
      state.supabase = await configureSupabase();
      if (state.supabase) {
        const { data, error } = await state.supabase.auth.getSession();
        if (error) throw error;
        state.user = data?.session?.user || null;
        if (state.user) await refreshAccountPatches();
      }
    }
  } catch (error) {
    console.warn('OMNI account library is unavailable:', error);
    state.setupError = error.message || 'Could not connect to your account library.';
  }

  render();
  if (state.supabase) {
    state.supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(async () => {
        state.user = session?.user || null;
        try {
          await refreshAccountPatches();
          renderGrid();
          renderStatus();
        } catch (error) {
          setStatus(error.message || 'Could not refresh account patches.', true);
        }
      }, 0);
    });
  }
}

if (isEditor) {
  import('./omni.js?v=20261117-omni-module-expansion-r3');
} else {
  void bootLauncher();
}
