import { INSTRUMENTS } from './data/instruments.js';

const normalizeSearchText = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const spec = (label, value, icon) => `<div class="instrument-spec"><span class="material-symbols-rounded">${icon}</span><span>${label}</span><strong>${value}</strong></div>`;

function buildTile(instrument) {
  const tile = document.createElement('article');
  tile.className = `instrument-tile instrument-tile--${instrument.id}`;
  tile.tabIndex = 0;
  tile.setAttribute('role', 'button');
  tile.setAttribute('aria-label', `Select ${instrument.name}`);
  const art = instrument.id === 'mellotron-m400'
    ? '<div class="m400-tile-art" aria-hidden="true"><span class="m400-tile-reel m400-tile-reel--one"></span><span class="m400-tile-reel m400-tile-reel--two"></span><i></i></div>'
    : '';
  tile.innerHTML = `<div class="instrument-tile__visual" aria-hidden="true"><div class="instrument-tile__glow"></div><div class="instrument-tile__display"><span></span><span></span></div>${art}<div class="instrument-tile__keys"></div><span class="material-symbols-rounded instrument-tile__icon">${instrument.icon}</span></div><div class="instrument-tile__content"><div class="instrument-tile__eyebrow">${instrument.manufacturer}</div><h2>${instrument.name}</h2><p class="instrument-tile__model">${instrument.model}</p><p class="instrument-tile__description">${instrument.description}</p><div class="instrument-specs">${spec('Voice', instrument.voiceMode, 'radio_button_checked')}${spec('Presets', instrument.presets, 'bookmark')}${spec('Keybed', instrument.keys, 'piano')}</div><div class="instrument-tile__actions"><span class="instrument-tile__hint"><span class="material-symbols-rounded">touch_app</span><b>to launch</b></span><md-filled-button class="instrument-launch-button"><span slot="icon" class="material-symbols-rounded">play_arrow</span>Launch</md-filled-button></div></div>`;
  const select = () => { document.querySelectorAll('.instrument-tile.is-selected').forEach((el) => el.classList.remove('is-selected')); tile.classList.add('is-selected'); tile.setAttribute('aria-label', `${instrument.name} selected. Launch button available.`); };
  tile.addEventListener('click', select);
  tile.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
  tile.querySelector('.instrument-launch-button').addEventListener('click', (event) => {
    event.stopPropagation();
    if (instrument.id === 'little-phatty') { window.location.assign('/html/little-phatty'); return; }
    if (instrument.id === 'sub-37') { window.location.assign('/html/sub37'); return; }
    if (instrument.id === 'prophet-10') { window.location.assign('/html/prophet10'); return; }
    if (instrument.id === 'nord-c2d') { window.location.assign('/html/nord-c2d'); return; }
    if (instrument.route) { window.location.assign(instrument.route); return; }
    if (instrument.route) { window.location.assign(instrument.route); return; }
    if (instrument.route) { window.location.assign(instrument.route); return; }
    if (instrument.route) { window.location.assign(instrument.route); return; }
    if (instrument.route) { window.location.assign(instrument.route); return; }
    document.dispatchEvent(new CustomEvent('launcher:launch', { detail: instrument }));
  });
  tile.classList.add('is-entering');
  const finishEntry = (event) => {
    if (event.animationName === 'tile-enter') {
      tile.classList.remove('is-entering');
      tile.removeEventListener('animationend', finishEntry);
    }
  };
  tile.addEventListener('animationend', finishEntry);
  return tile;
}

import './shared/supabase-config.js';
import './shared/account-shell.js?v=20261102-contributions-menu';

const page = document.getElementById('launcher-page');
page.innerHTML = `<div class="launcher-ambient launcher-ambient--one" aria-hidden="true"></div><div class="launcher-ambient launcher-ambient--two" aria-hidden="true"></div><div class="launcher-noise" aria-hidden="true"></div><header class="site-header" id="top">
  <a class="site-brand" href="/" aria-label="Overture Instruments home">
    <span class="site-brand__mark"><img src="/ui/Logos/OvertureLogo.png" alt="" width="24" height="24"></span>
    <span class="site-brand__wordmark">OVERTURE INSTRUMENTS</span>
  </a>
  <nav class="main-nav" id="main-nav" aria-label="Main navigation">
    <a href="/about">About</a>
    <a href="/library" aria-current="page">Library</a>
    <a href="/#omni">OMNI</a>
    <a href="/community">Community</a>
    <a href="/experiments">Experiments</a>
  </nav>
  <a class="header-account" href="/account" aria-label="Log in to your Overture account"><span class="header-account__label">LOG IN</span></a>
  <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="main-nav"><span></span><span></span></button>
</header><section class="launcher-hero" aria-labelledby="launcher-title">
  <div class="launcher-hero__copy">
    <p class="launcher-overline">An expanding collection of MIDI-playable classics</p>

    <h1 id="launcher-title">
      Ch<img class="launcher-hero__o-icon" src="/ui/Logos/OvertureLogo.png" alt="o">ose your<br>
      <em>instrument.</em>
    </h1>

    <p class="launcher-hero__description">
      <span>Explore OI's library of instrument emulators, built with obsessive realism and attention to every detail. Here you'll find plug-and-play versions of all your favourite sounds from legendary brands.</span><br>
      <b>The difference? These are free.</b>
    </p>
  </div>

  <div class="launcher-brand-grid" aria-label="Emulated instrument brands">
    <div class="launcher-brand-slot">
      <img src="/ui/Logos/Moog_Music_logo.png" alt="Moog">
    </div>

    <div class="launcher-brand-slot">
      <img src="/ui/Logos/Roland_logo.png" alt="Roland">
    </div>

    <div class="launcher-brand-slot">
      <img src="/ui/Logos/Sequential_logo.png" alt="Sequential">
    </div>

    <div class="launcher-brand-slot">
      <img src="/ui/Logos/Yamaha_logo.png" alt="Yamaha">
    </div>

    <div class="launcher-brand-slot">
      <img src="/ui/Logos/Nord_logo.png" alt="Nord">
    </div>

    <div class="launcher-brand-slot">
      <img src="/ui/Logos/Korg_logo.png" alt="Korg">
    </div>
  </div>
</section><section class="library-search library-search--entering" role="search" aria-label="Search the instrument library">
  <div class="library-search__field">
    <label class="library-search__label" for="instrument-search">Search instruments</label>
    <span class="material-symbols-rounded library-search__icon" aria-hidden="true">search</span>
    <input id="instrument-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search brands, instruments, voices, features..." aria-describedby="instrument-search-status">
    <button class="library-search__clear" type="button" aria-label="Clear search" hidden><span class="material-symbols-rounded" aria-hidden="true">close</span></button>
  </div>
  <div class="library-search__meta">
    <span class="library-search__hint">Search by brand, model, voice, or feature</span>
    <span id="instrument-search-status" class="library-search__status" role="status" aria-live="polite"></span>
  </div>
</section><section class="instrument-grid" aria-label="Available instruments"></section><footer class="launcher-footer"><span>04 AVAILABLE INSTRUMENTS</span><span>SELECT A TILE TO CONTINUE</span></footer>
<div class="launcher-legal"></div>`;
{
  const nav = page.querySelector('#main-nav');
  const toggle = page.querySelector('.menu-toggle');
  if (nav && toggle) {
    toggle.addEventListener('click', () => {
      const opening = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(opening));
      toggle.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
      nav.classList.toggle('is-open', opening);
    });
  }
}
const grid = page.querySelector('.instrument-grid');
const searchableInstruments = INSTRUMENTS.map((instrument) => {
  const tile = buildTile(instrument);
  grid.appendChild(tile);

  // Search the complete card metadata, not only its visible title. Include
  // field names so terms such as "brand", "voice", and "keybed" are useful too.
  const searchableValues = [
    instrument.id,
    instrument.name,
    instrument.model,
    'model subtitle',
    instrument.manufacturer,
    'brand',
    instrument.voiceMode,
    'voice voice mode',
    instrument.presets,
    'presets programs patches patterns',
    instrument.keys,
    'keys keybed',
    instrument.presetProvenance,
    instrument.description,
  ];
  const searchText = normalizeSearchText(searchableValues.join(' '));

  return {
    tile,
    searchText,
    compactText: searchText.replace(/\s+/g, ''),
  };
});

const searchInput = page.querySelector('#instrument-search');
const searchClear = page.querySelector('.library-search__clear');
const searchStatus = page.querySelector('#instrument-search-status');
const emptyState = document.createElement('div');
emptyState.className = 'library-search__empty';
emptyState.hidden = true;
emptyState.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">search_off</span><strong>No instruments found</strong><p>Try another brand, model, voice type, or feature.</p>`;
grid.insertAdjacentElement('afterend', emptyState);

function updateInstrumentSearch() {
  const rawQuery = searchInput.value.trim();
  const normalizedQuery = normalizeSearchText(rawQuery);
  const terms = normalizedQuery.split(' ').filter(Boolean);
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  let visibleCount = 0;

  searchableInstruments.forEach(({ tile, searchText, compactText }) => {
    const matches = !terms.length
      || terms.every((term) => searchText.includes(term))
      || Boolean(compactQuery && compactText.includes(compactQuery));

    tile.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  emptyState.hidden = visibleCount !== 0;
  searchClear.hidden = !rawQuery;
  searchStatus.textContent = !normalizedQuery
    ? `${INSTRUMENTS.length} instruments available`
    : visibleCount
      ? `${visibleCount} of ${INSTRUMENTS.length} instruments`
      : `No matches for “${rawQuery}”`;
}

searchInput.addEventListener('input', updateInstrumentSearch);
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  updateInstrumentSearch();
  searchInput.focus();
});

const comingSoon = document.createElement('aside');
comingSoon.className = `launcher-coming-soon ${INSTRUMENTS.length % 2 ? 'launcher-coming-soon--tile' : 'launcher-coming-soon--banner'}`;
comingSoon.setAttribute('aria-label', 'More instruments coming soon');
comingSoon.innerHTML = `<span class="launcher-coming-soon__signal" aria-hidden="true"></span><div class="launcher-coming-soon__copy"><span class="launcher-coming-soon__eyebrow"><!-- Something can go here --></span><strong>M<img class="launcher-coming-soon__o-icon" src="/ui/Logos/OvertureLogo.png" alt="">re is coming soon!</strong><span class="launcher-coming-soon__subline">New instruments are already in development.<br>Check out the GitHub to stay tuned!</span></div><a class="launcher-coming-soon__arrow" href="https://github.com/ForeverBoundless/Overture-Instruments" target="_blank" rel="noopener noreferrer" aria-label="Visit the Overture Instruments GitHub repository">↗</a>`;
if (INSTRUMENTS.length % 2) grid.appendChild(comingSoon);
else grid.insertAdjacentElement('afterend', comingSoon);

const count = page.querySelector('.launcher-footer span');
if (count) {
  const amount = String(INSTRUMENTS.length).padStart(2, '0');
  count.textContent = `${amount} AVAILABLE INSTRUMENT${INSTRUMENTS.length === 1 ? '' : 'S'}`;
}

// Shared footer markup belongs inside the Library scroll container, but the
// contact dialog must be a direct child of <body>. #launcher-page is a fixed,
// scrollable element with backdrop-filter; a fixed modal nested inside it is
// positioned/blurred relative to that element instead of the viewport.
const footerTemplate = document.getElementById('site-footer-template');
if (footerTemplate) {
  const footerContent = footerTemplate.content.cloneNode(true);
  const contactModal = footerContent.querySelector('#contact-modal');
  if (contactModal) contactModal.remove();

  page.append(footerContent);

  if (contactModal) {
    document.body.append(contactModal);
  }
}
