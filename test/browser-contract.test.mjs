import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INSTRUMENTS } from '../js/data/instruments.js';

test('PWA shell exposes a manifest and worker registration', async () => {
  const [manifest, worker, home] = await Promise.all(['../manifest.webmanifest', '../service-worker.js', '../index.html'].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  assert.match(manifest, /"display": "standalone"/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(home, /manifest\.webmanifest/);
});

test('all library cards use canonical metadata with declared preset provenance', () => {
  assert.equal(INSTRUMENTS.length, 8);
  assert.equal(INSTRUMENTS.every((instrument) => instrument.presetProvenance && instrument.description), true);
});

test('instrument library search covers canonical descriptive metadata and both themes', async () => {
  const [library, styles] = await Promise.all([
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
  ]);
  assert.match(library, /id="instrument-search"/);
  assert.match(library, /instrument\.manufacturer/);
  assert.match(library, /instrument\.model/);
  assert.match(library, /instrument\.voiceMode/);
  assert.match(library, /instrument\.presetProvenance/);
  assert.match(library, /instrument\.description/);
  assert.match(library, /aria-live="polite"/);
  assert.match(styles, /\.library-search__field:focus-within/);
  assert.match(styles, /html\[data-theme="light"\] #launcher-page \.library-search__field/);
});

test('Little Phatty uses a grouped responsive layout without viewport shrinking', async () => {
  const [styles, engine, page] = await Promise.all([
    readFile(new URL('../css/little-phatty.css', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../html/little-phatty.html', import.meta.url), 'utf8'),
  ]);
  assert.match(styles, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-areas:[\s\S]*"master master lfo lfo lfo lfo osc osc osc osc osc osc"[\s\S]*"master master filter filter filter filter env env env env output output"/);
  assert.match(styles, /@media \(max-width: 1180px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /min-width: 680px/);
  assert.match(styles, /#sections-row > \.lp-section > \.lp-section-title/);
  assert.match(styles, /max-height: none/);
  assert.match(engine, /natural, scrollable page flow/);
  assert.doesNotMatch(engine, /availH = window\.innerHeight/);
  assert.match(page, /little-phatty\.css\?v=20261103-layout-rebuild/);
});

test('Sub 37 side panels use the seeded wood grain from its Library tile', async () => {
  const [tileStyles, emulatorStyles, page] = await Promise.all([
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/sub37.css', import.meta.url), 'utf8'),
    readFile(new URL('../html/sub37.html', import.meta.url), 'utf8'),
  ]);
  assert.match(tileStyles, /baseFrequency='\.018 \.18' numOctaves='3' seed='17'/);
  assert.match(emulatorStyles, /baseFrequency='\.018 \.18' numOctaves='3' seed='17'/);
  assert.match(emulatorStyles, /background-size:96px 160px/);
  assert.match(page, /sub37\.css\?v=20261103-library-walnut/);
});

test('instrument and experiment pages register the shared offline app shell', async () => {
  const paths = [
    '../about.html', '../library.html', '../omni.html', '../experiments.html',
    '../html/korg-ms-20.html', '../html/little-phatty.html', '../html/nord-c2d.html',
    '../html/prophet10.html', '../html/roland-juno-106.html', '../html/roland-tr-808.html',
    '../html/sub37.html', '../html/yamaha-dx7.html',
    '../experiments/beats-lab.html', '../experiments/envelope-lab.html',
    '../experiments/filter-lab.html', '../experiments/fm-lab.html',
    '../experiments/harmonics-lab.html', '../experiments/modulation-lab.html',
    '../experiments/oscillator-lab.html', '../experiments/space-lab.html',
  ];
  const pages = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const page of pages) {
    assert.match(page, /rel="manifest"/);
    assert.ok(page.includes('/js/shared/pwa.js'));
  }
});


test('offline shell precaches the synthesis engines and OMNI dependencies', async () => {
  const worker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  for (const asset of [
    '/js/engine/Prophet10Processor.js',
    '/js/engine/DX7Processor.js',
    '/js/omni/modules.js',
    '/js/shared/audioRecorder.js',
    '/js/shared/midiRecorder.js',
    '/experiments/filter-lab',
  ]) {
    assert.ok(worker.includes(asset), `offline shell should include ${asset}`);
  }
});


test('Community library has an optional Supabase setup and owner-scoped schema migration', async () => {
  const [page, config, client, migration, app, accountPage, accountApp, accountMigration] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/supabase-config.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/supabaseClient.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261102000000_community_patches.sql', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../account.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/account.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261103000000_overture_accounts.sql', import.meta.url), 'utf8'),
  ]);
  assert.ok(page.includes('supabase-config.js'));
  assert.match(config, /anonKey/);
  assert.equal(config.split('\\n').some((line) => line.trim().startsWith('service_role:')), false);
  assert.match(client, /createClient/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /get_community_patch_by_id/);
  assert.match(migration, /using \(visibility = 'public' or owner_id/);
  assert.ok(migration.includes('owner_id = (select auth.uid())'));
  assert.match(page, /community-account-link/);
  assert.doesNotMatch(page, /community-auth-form/);
  assert.match(app, /increment_community_patch_downloads/);
  assert.match(accountPage, /account-signup-form/);
  assert.match(accountPage, /account-google/);
  assert.match(accountPage, /account-profile-form/);
  assert.match(accountApp, /signInWithPassword/);
  assert.match(accountApp, /signInWithOAuth/);
  assert.match(accountApp, /updateUser/);
  assert.match(accountMigration, /create table if not exists public\.profiles/);
  assert.match(accountMigration, /on_auth_user_created_overture_profile/);
  assert.match(accountMigration, /profile-avatars/);
  assert.match(app, /OPEN IN OMNI/);
});


test('Community preset exchange covers supported instruments and protects download counters', async () => {
  const [page, app, helper, migration, instrumentSources] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/communityPreset.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261102000000_community_patches.sql', import.meta.url), 'utf8'),
    Promise.all([
      '../js/engine/app.js', '../js/korg-ms-20.js', '../js/roland-juno-106.js',
      '../js/yamaha-dx7.js', '../js/roland-tr-808.js',
    ].map((path) => readFile(new URL(path, import.meta.url), 'utf8'))),
  ]);
  assert.match(page, /community-record-type/);
  assert.match(page, /community-instrument/);
  assert.match(app, /instrument_preset/);
  assert.match(app, /extractInstrumentPreset/);
  assert.match(app, /MY ITEMS/);
  assert.match(helper, /consumeCommunityInstrumentPreset/);
  assert.match(migration, /record_type/);
  assert.equal(migration.split(String.fromCharCode(10)).filter((line) => line.trim() === 'as ' + '$$').length, 3);
  assert.equal(migration.split(String.fromCharCode(10)).filter((line) => line.trim() === '$$;').length, 3);
  assert.match(app, /reloadPending/);
  assert.match(migration, /grant update \(record_type, instrument_id/);
  assert.doesNotMatch(migration, /grant update on public\.community_patches to authenticated/i);
  for (const source of instrumentSources) assert.match(source, /consumeCommunityInstrumentPreset/);
});


test('Account and Community use the shared Overture CSS design system', async () => {
  const [theme, accountCss, communityCss, accountPage, communityPage, communityApp] = await Promise.all([
    readFile(new URL('../css/site-theme.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/account.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/community.css', import.meta.url), 'utf8'),
    readFile(new URL('../account.html', import.meta.url), 'utf8'),
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
  ]);
  assert.match(theme, /--oi-panel-background:/);
  assert.match(theme, /--oi-primary-background:/);
  assert.match(theme, /\.account-button,\.community-button/);
  assert.doesNotMatch(accountCss, /:root\s*\{|@font-face/);
  assert.doesNotMatch(communityCss, /:root\s*\{|@font-face/);
  assert.match(accountPage, /\/css\/site-theme\.css/);
  assert.match(communityPage, /\/css\/site-theme\.css/);
  assert.match(accountPage, /\/js\/shared\/site-nav\.js/);
  assert.match(communityPage, /\/js\/shared\/site-nav\.js/);
  assert.match(communityPage, /community-account__actions/);
  assert.doesNotMatch(communityApp, /initialiseNavigation/);
  assert.doesNotMatch(communityCss, /\.contact-modal\s*\{\s*position\s*:\s*relative/i);
});


test('The shared account menu works across site, OMNI, Library and all experiment headers', async () => {
  const experimentPages = [
    'beats-lab', 'envelope-lab', 'filter-lab', 'fm-lab',
    'harmonics-lab', 'modulation-lab', 'oscillator-lab', 'space-lab',
  ];
  const [account, omni, shell, theme, brand, worker, library] = await Promise.all([
    readFile(new URL('../account.html', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/account-shell.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/site-theme.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/brand.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
  ]);
  assert.equal(account.includes('account-hero'), false);
  assert.equal(account.includes('Your place in'), false);
  assert.ok(shell.includes('header-account-logout'));
  assert.ok(shell.includes('await supabase.auth.signOut()'));
  assert.ok(theme.includes('.header-account-wrap.is-signed-in:hover .header-account-menu'));
  assert.ok(theme.includes('.header-account-wrap.is-signed-in:focus-within .header-account-menu'));
  assert.equal(brand.includes('Shared Overture account control'), false);
  assert.ok(omni.includes('/css/site-theme.css'));
  assert.ok(omni.includes('account-shell.js?v=20261102-contributions-menu'));
  assert.ok(library.includes('account-shell.js?v=20261102-contributions-menu'));
  assert.ok(worker.includes('overture-shell-v23'));
  assert.ok(worker.includes('account-shell.js?v=20261102-contributions-menu'));
  for (const page of experimentPages) {
    const html = await readFile(new URL(`../experiments/${page}.html`, import.meta.url), 'utf8');
    assert.ok(html.includes('supabase-config.js'), `${page} should load the Supabase config`);
    assert.ok(html.includes('account-shell.js?v=20261102-contributions-menu'), `${page} should load the shared account controller`);
  }
});


test('Account menu contains Settings, Contributions and Log Out in the requested order', async () => {
  const [shell, theme] = await Promise.all([
    readFile(new URL('../js/shared/account-shell.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/site-theme.css', import.meta.url), 'utf8'),
  ]);
  const settings = shell.indexOf("accountSettings = document.createElement('a')");
  const contributions = shell.indexOf("contributions = document.createElement('a')");
  const logout = shell.indexOf("logout = document.createElement('button')");
  assert.ok(settings >= 0 && settings < contributions && contributions < logout);
  assert.ok(shell.includes("accountSettings.href = '/account'"));
  assert.ok(shell.includes("contributions.href = '/contributions'"));
  assert.ok(shell.includes("logout.textContent = 'Log Out'"));
  assert.ok(theme.includes('.header-account-menu__link'));
});

test('Contribution profiles respect profile ownership and expose edit actions only to the owner', async () => {
  const [page, app, community, css, worker] = await Promise.all([
    readFile(new URL('../contributions.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/contributions.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/contributions.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(page.includes('contributions-profile'));
  assert.ok(page.includes('site-theme.css'));
  assert.ok(app.includes(".get('username')"));
  assert.ok(app.includes("state.user.id === state.profile.id"));
  assert.ok(app.includes(".eq('owner_id', state.profile.id)"));
  assert.ok(app.includes("query.eq('visibility', 'public')"));
  assert.ok(app.includes("if (state.isOwner && item.owner_id === state.profile.id)"));
  assert.ok(app.includes("item.owner_id !== state.profile.id"));
  assert.ok(app.includes("url.searchParams.set('edit', '1')"));
  assert.ok(community.includes('community-card__author'));
  assert.ok(community.includes('/contributions?username='));
  assert.ok(css.includes('.contributions-profile'));
  assert.ok(worker.includes("'/contributions'"));
  assert.ok(worker.includes('/js/contributions.js?v=20261102-profile-3'));
});


test('Contribution search includes tags as well as titles and descriptions', async () => {
  const app = await readFile(new URL('../js/contributions.js', import.meta.url), 'utf8');
  assert.ok(app.includes('tags.cs.{'));
  assert.ok(app.includes('title.ilike.%'));
  assert.ok(app.includes('description.ilike.%'));
});


test('Contribution page profile, toolbar and result counts have responsive alignment rules', async () => {
  const [page, css, app, worker] = await Promise.all([
    readFile(new URL('../contributions.html', import.meta.url), 'utf8'),
    readFile(new URL('../css/contributions.css', import.meta.url), 'utf8'),
    readFile(new URL('../js/contributions.js', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(page.includes('contributions.css?v=20261102-profile-3'));
  assert.ok(page.includes('contributions.js?v=20261102-profile-3'));
  assert.ok(css.includes('#contributions-count'));
  assert.ok(css.includes('.contributions-toolbar.is-owner'));
  assert.ok(css.includes('@media (max-width:380px)'));
  assert.ok(app.includes("classList.toggle('is-owner', state.isOwner)"));
  assert.ok(worker.includes('overture-shell-v23'));
});
