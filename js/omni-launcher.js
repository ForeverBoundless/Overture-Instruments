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
  patchTileIntroPlayed: false,
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

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function patchSignature(patch) {
  const modules = patch.modules || [];
  const indexById = new Map(modules.map((module, index) => [module.id, index]));
  const normalizedModules = modules.map((module) => ({ type: module.type, params: module.params || {} }));
  const connections = (patch.connections || []).map((connection) => ({
    from: [indexById.get(connection.from.module), connection.from.port],
    to: [indexById.get(connection.to.module), connection.to.port],
  })).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  return stableStringify({ schema: patch.schema, modules: normalizedModules, connections, global: patch.global || {} });
}
const allItems = () => {
  const sources = [
    ...state.accountPatches.map((item) => ({ ...item, source: 'account' })),
    ...state.communityPatches.map((item) => ({ ...item, source: 'community' })),
    ...localItems(),
  ];
  const unique = new Map();
  sources.forEach((item) => {
    const signature = patchSignature(item.patch_data);
    const existing = unique.get(signature);
    if (!existing) unique.set(signature, { ...item, locations: [item.source] });
    else if (!existing.locations.includes(item.source)) existing.locations.push(item.source);
  });
  return [...unique.values()];
};

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

function sourceLabel(item) {
  const sources = item.locations || [item.source];
  if (sources.includes('account')) return sources.includes('community') ? 'ACCOUNT · PUBLISHED' : 'ACCOUNT';
  if (sources.includes('community')) return 'PUBLISHED';
  return 'THIS DEVICE';
}

function getVisibleItems() {
  const query = state.query.trim().toLowerCase();
  const items = allItems().filter((item) => {
    if (state.filter !== 'all' && !(item.locations || [item.source]).includes(state.filter)) return false;
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

function makePatchTile(item, playIntro = false) {
  const card = document.createElement('article');
  card.className = 'community-card omni-patch-card' + (playIntro ? ' is-entering' : '');
  if (playIntro) {
    card.addEventListener('animationend', (event) => {
      if (event.target === card && event.animationName === 'omni-launcher-card-enter') {
        card.classList.remove('is-entering');
      }
    });
  }

  const top = document.createElement('div');
  top.className = 'community-card__top';
  const kind = document.createElement('span');
  kind.textContent = 'OMNI PATCH';
  const date = document.createElement('span');
  date.textContent = dateLabel(item.updated_at || item.created_at);
  top.append(kind, date);

  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'omni-patch-preview';
  preview.setAttribute('aria-label', 'Open ' + item.title);
  preview.innerHTML = templatePreview(item.patch_data, 420, 142);
  preview.addEventListener('click', () => openEditor(item.patch_data, item.id, item.source, item));

  const title = document.createElement('h3');
  title.textContent = item.title;
  const description = document.createElement('p');
  description.className = 'community-card__description omni-patch-card__description';
  description.textContent = item.description ||
    item.patch_data.modules.length + ' modules · ' + item.patch_data.connections.length + ' connections';

  const meta = document.createElement('div');
  meta.className = 'community-card__meta';
  const source = document.createElement('span');
  source.textContent = sourceLabel(item);
  meta.append(source);

  const actions = document.createElement('div');
  actions.className = 'community-card__actions omni-patch-card__actions';
  const open = makeButton('OPEN PATCH', 'community-button community-button--primary',
    () => openEditor(item.patch_data, item.id, item.source, item));
  const controls = document.createElement('div');
  controls.className = 'omni-patch-card__menu-wrap';
  const more = makeButton('···', 'community-button omni-patch-more', null, 'More patch actions');
  const menu = document.createElement('div');
  menu.className = 'omni-patch-menu';
  menu.hidden = true;
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    document.querySelectorAll('.omni-patch-menu').forEach((other) => { if (other !== menu) other.hidden = true; });
    menu.hidden = !menu.hidden;
  });
  const menuAction = (label, action, danger = false) => {
    menu.append(makeButton(label, 'omni-patch-menu__item' + (danger ? ' is-danger' : ''), () => {
      menu.hidden = true;
      action();
    }));
  };
  menuAction(item.source === 'account' ? 'Save changes' : 'Save to account', () => syncItem(item));
  menuAction('Rename', () => renameItem(item));
  menuAction('Export JSON', () => exportItem(item));
  menuAction('Delete', () => deleteItem(item), true);
  controls.append(more, menu);
  actions.append(open, controls);
  card.append(top, preview, title, description, meta, actions);
  return card;
}
function renderGrid() {
  const grid = document.getElementById('omni-patch-grid');
  const empty = document.getElementById('omni-empty');
  const count = document.getElementById('omni-patch-count');
  if (!grid || !empty || !count) return;

  const items = getVisibleItems();
  const playTileIntro = !state.patchTileIntroPlayed && items.length > 0 && !document.hidden;
  grid.replaceChildren(...items.map((item) => makePatchTile(item, playTileIntro)));
  if (items.length > 0) state.patchTileIntroPlayed = true;
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

let wordmarkPixelationTimer = 0;

function paintWordmarkPixels(target, canvas, blockSize, textStyle) {
  const bounds = target.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return false;

  const width = Math.max(1, Math.ceil(bounds.width / blockSize));
  const height = Math.max(1, Math.ceil(bounds.height / blockSize));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return false;

  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  const text = target.textContent.trim();
  context.font = textStyle.font;
  context.fillStyle = textStyle.color;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  if ('letterSpacing' in context) context.letterSpacing = textStyle.letterSpacing;

  /* Centre the visible glyph bounds inside the existing span box.
     fontBoundingBox metrics include reserved font space and pushed the canvas
     lettering lower than the browser-rendered wordmark. */
  const metrics = context.measureText(text);
  const glyphAscent = Number.isFinite(metrics.actualBoundingBoxAscent)
    ? metrics.actualBoundingBoxAscent
    : Number.parseFloat(textStyle.fontSize) * 0.72;
  const glyphDescent = Number.isFinite(metrics.actualBoundingBoxDescent)
    ? metrics.actualBoundingBoxDescent
    : Number.parseFloat(textStyle.fontSize) * 0.18;
  const baseline = (bounds.height + glyphAscent - glyphDescent) / 2;

  context.scale(width / bounds.width, height / bounds.height);
  context.fillText(text, bounds.width / 2, baseline, bounds.width);
  return true;
}

function runWordmarkPixelation(target) {
  if (!target || !target.isConnected || document.hidden) return;

  /* Capture the real text styling before making the source lettering
     transparent. Re-reading it during the effect would return transparent. */
  const style = window.getComputedStyle(target);
  const textStyle = {
    font: [style.fontStyle, style.fontVariant, style.fontWeight, style.fontSize, style.fontFamily].join(' '),
    fontSize: style.fontSize,
    color: style.color,
    letterSpacing: style.letterSpacing,
  };

  let canvas = target.querySelector('.omni-wordmark__pixel-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'omni-wordmark__pixel-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    target.append(canvas);
  }

  if (!paintWordmarkPixels(target, canvas, 1, textStyle)) {
    canvas.remove();
    return;
  }

  target.classList.add('is-pixelating');
  /* Pixelate, hold briefly at the coarsest resolution, then resolve back. */
  const pixelSteps = [1, 1.5, 2, 2.8, 3.8, 5, 5, 3.8, 2.8, 2, 1.5, 1];
  const duration = 3000 + Math.random() * 2000;

  pixelSteps.slice(1).forEach((blockSize, index) => {
    const stepTime = duration * (index + 1) / (pixelSteps.length - 1);
    window.setTimeout(() => {
      if (target.isConnected && !document.hidden) {
        paintWordmarkPixels(target, canvas, blockSize, textStyle);
      }
    }, stepTime);
  });

  window.setTimeout(() => {
    if (!target.isConnected) return;
    target.classList.remove('is-pixelating');
    canvas.remove();
  }, duration + 40);
}

function scheduleWordmarkPixelation() {
  window.clearTimeout(wordmarkPixelationTimer);
  const target = document.querySelector('.omni-wordmark__product');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!target || reducedMotion) return;

  const delay = 10000 + Math.floor(Math.random() * 5001);
  wordmarkPixelationTimer = window.setTimeout(() => {
    const currentTarget = document.querySelector('.omni-wordmark__product');
    if (!document.hidden) runWordmarkPixelation(currentTarget);
    scheduleWordmarkPixelation();
  }, delay);
}

function render() {
  root.innerHTML = [
    '<div class="community-shell omni-shell">',
    '  <section class="community-hero omni-wordmark-hero" aria-labelledby="omni-launcher-title">',
    '    <div class="omni-wordmark-lockup">',
    '      <h1 class="omni-wordmark" id="omni-launcher-title" aria-label="OMNI">',
    '        <img class="omni-wordmark__logo" src="/ui/Logos/OvertureLogo.png" alt="">',
    '        <span class="omni-wordmark__product">MNI</span>',
    '      </h1>',
    '      <p class="omni-wordmark__byline"><span>from</span> <strong>Overture Instruments</strong></p>',
    '    </div>',
    '  </section>',
    '  <section class="community-toolbar omni-toolbar" aria-label="Patch library controls">',
    '    <label class="community-search omni-search-label">',
    '      <span>SEARCH PATCHES</span>',
    '      <input id="omni-search" type="search" placeholder="Search by name or module" autocomplete="off">',
    '    </label>',
    '    <label>',
    '      <span>SHOW</span>',
    '      <select id="omni-filter">',
    '        <option value="all">All patches</option>',
    '        <option value="account">Account</option>',
    '        <option value="local">This device</option>',
    '        <option value="community">Published</option>',
    '      </select>',
    '    </label>',
    '    <label>',
    '      <span>SORT BY</span>',
    '      <select id="omni-sort">',
    '        <option value="updated_at">Recently updated</option>',
    '        <option value="created_at">Date created</option>',
    '        <option value="title">Name</option>',
    '        <option value="modules">Most modules</option>',
    '        <option value="connections">Most connections</option>',
    '      </select>',
    '    </label>',
    '    <button class="community-button community-button--primary" id="omni-new" type="button">NEW PATCH</button>',
    '  </section>',
    '  <section class="community-account omni-account-row" aria-label="Patch actions">',
    '    <div id="omni-launch-status" role="status" aria-live="polite"></div>',
    '    <div class="community-account__actions">',
    '      <button class="community-button community-button--quiet" id="omni-templates" type="button">TEMPLATES</button>',
    '      <button class="community-button community-button--quiet" id="omni-import" type="button">IMPORT</button>',
    '      <button class="community-button community-button--quiet" id="omni-export-all" type="button">EXPORT LIBRARY</button>',
    '      <button class="community-button community-button--quiet" id="omni-refresh" type="button" aria-label="Refresh patches">↻</button>',
    '    </div>',
    '  </section>',
    '  <section class="community-results" aria-labelledby="omni-patches-title">',
    '    <div class="community-section-heading omni-library-heading">',
    '      <div><h2 id="omni-patches-title">My patches <span id="omni-patch-count">0</span></h2></div>',
    '    </div>',
    '    <div class="community-grid omni-patch-grid" id="omni-patch-grid"></div>',
    '    <p class="community-empty omni-empty" id="omni-empty" hidden>No patches here yet. Create a new patch or start from a template.</p>',
    '  </section>',
    '</div>',
  ].join("");

  scheduleWordmarkPixelation();
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
  const dialog = document.createElement('dialog');
  dialog.className = 'omni-template-dialog';
  dialog.setAttribute('aria-labelledby', 'omni-template-title');

  const panel = document.createElement('div');
  panel.className = 'omni-template-panel community-publish-panel';
  const header = document.createElement('header');
  header.className = 'omni-template-panel__head';
  const heading = document.createElement('h2');
  heading.id = 'omni-template-title';
  heading.textContent = 'Start from a template';
  const close = makeButton('×', 'community-button community-button--quiet omni-template-close', () => dialog.close(), 'Close templates');
  header.append(heading, close);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'omni-template-search';
  const label = document.createElement('label');
  label.textContent = 'SEARCH TEMPLATES';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Name or module';
  search.autocomplete = 'off';
  label.append(search);
  searchWrap.append(label);

  const grid = document.createElement('div');
  grid.className = 'omni-template-grid';
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    const items = TEMPLATES.filter((item) => (item.name + ' ' + item.desc).toLowerCase().includes(query));
    grid.replaceChildren();
    items.forEach((item) => {
      const card = makeButton('', 'omni-template-card', () => {
        dialog.close();
        dialog.remove();
        openEditor(item.patch, null, 'template');
      });
      const name = document.createElement('b');
      name.textContent = item.name;
      const description = document.createElement('small');
      description.textContent = item.desc;
      card.append(name, description);
      grid.append(card);
    });
  };
  search.addEventListener('input', draw);
  draw();
  panel.append(header, searchWrap, grid);
  dialog.append(panel);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  search.focus();
}
function importPatch() {
  pickFile('.json,application/json', (raw) => {
    try {
      const imported = localStore.parseImport(raw);
      imported.data.name = imported.name;
      if (allItems().some((item) => patchSignature(item.patch_data) === patchSignature(imported.data))) {
        setStatus('That patch is already in your library.');
        return;
      }
      localStore.save(imported.name, imported.data);
      renderGrid();
      setStatus('Patch imported to this device.');
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
    const signature = patchSignature(item.patch_data);
    const alreadySaved = state.accountPatches.find((candidate) => patchSignature(candidate.patch_data) === signature);
    if (item.source !== 'account' && alreadySaved) {
      localStore.items.filter((local) => patchSignature(local.data) === signature).forEach((local) => localStore.remove(local.id));
      renderGrid();
      setStatus('This patch is already saved to your account. The duplicate has been combined.');
      return;
    }
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
    localStore.items.filter((local) => patchSignature(local.data) === signature).forEach((local) => localStore.remove(local.id));
    await refreshAccountPatches();
    renderGrid();
    setStatus(item.source === 'account' ? 'Account patch saved.' : 'Patch synced to your Overture account.');
  } catch (error) {
    setStatus(error.message || 'Could not save this account patch.', true);
  }
}

async function renameItem(item) {
  const dialog = document.createElement('dialog');
  dialog.className = 'omni-rename-dialog';
  dialog.setAttribute('aria-labelledby', 'omni-rename-title');

  const panel = document.createElement('form');
  panel.className = 'omni-rename-panel';
  panel.noValidate = true;

  const header = document.createElement('header');
  header.className = 'omni-rename-panel__head';
  const heading = document.createElement('h2');
  heading.id = 'omni-rename-title';
  heading.textContent = 'Rename patch';
  let saving = false;
  const close = makeButton('×', 'community-button community-button--quiet omni-rename-close', () => {
    if (!saving) dialog.close();
  }, 'Close rename dialog');
  header.append(heading, close);

  const field = document.createElement('label');
  field.className = 'omni-rename-field';
  const fieldLabel = document.createElement('span');
  fieldLabel.textContent = 'PATCH NAME';
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'patch-name';
  input.value = item.title;
  input.maxLength = 80;
  input.minLength = 3;
  input.required = true;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Patch name');
  field.append(fieldLabel, input);

  const feedback = document.createElement('p');
  feedback.className = 'omni-rename-error';
  feedback.setAttribute('role', 'alert');
  feedback.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'omni-rename-actions';
  const cancel = makeButton('CANCEL', 'community-button community-button--quiet', () => {
    if (!saving) dialog.close();
  });
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'community-button community-button--primary';
  save.textContent = 'SAVE NAME';
  actions.append(cancel, save);
  panel.append(header, field, feedback, actions);

  const showError = (message) => {
    feedback.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  };

  input.addEventListener('input', () => {
    feedback.textContent = '';
    input.removeAttribute('aria-invalid');
  });

  panel.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;

    const title = input.value.trim().slice(0, 80);
    if (title.length < 3) {
      showError('Patch names must contain at least three characters.');
      return;
    }
    if (title === item.title) {
      dialog.close();
      return;
    }

    saving = true;
    input.disabled = true;
    close.disabled = true;
    cancel.disabled = true;
    save.disabled = true;
    save.textContent = 'SAVING…';
    feedback.textContent = '';

    try {
      if (item.source === 'local') {
        localStore.rename(item.id, title);
      } else {
        if (!state.supabase || !state.user) {
          throw new Error('Sign in to your Overture account before renaming this patch.');
        }
        const table = item.source === 'community' ? 'community_patches' : 'omni_user_patches';
        const { error } = await state.supabase.from(table)
          .update({ title }).eq('id', item.id).eq('owner_id', state.user.id);
        if (error) throw error;
      }
      await refreshAccountPatches();
      renderGrid();
      dialog.close();
      setStatus('Renamed "' + title + '".');
    } catch (error) {
      saving = false;
      input.disabled = false;
      close.disabled = false;
      cancel.disabled = false;
      save.disabled = false;
      save.textContent = 'SAVE NAME';
      showError(error.message || 'Could not rename that patch.');
    }
  });

  dialog.append(panel);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !saving) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (saving) event.preventDefault();
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  document.body.append(dialog);
  dialog.showModal();
  input.focus();
  input.select();
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
  import('./omni.js?v=20261119-front-panel-r16');
} else {
  void bootLauncher();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  document.querySelectorAll('.omni-patch-card.is-entering').forEach((card) => {
    card.classList.remove('is-entering');
  });
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.omni-patch-tile__controls')) {
    document.querySelectorAll('.omni-patch-menu').forEach((menu) => { menu.hidden = true; });
  }
});
