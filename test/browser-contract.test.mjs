import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INSTRUMENTS } from '../js/data/instruments.js';
import { OBXA_PRESETS } from '../js/data/obx-a-presets.js';

test('PWA shell exposes a manifest and worker registration', async () => {
  const [manifest, worker, home] = await Promise.all(['../manifest.webmanifest', '../service-worker.js', '../index.html'].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  assert.match(manifest, /"display": "standalone"/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(home, /manifest\.webmanifest/);
});


test('Hohner D6 and Oberheim OB-Xa are complete first-class emulator entries', async () => {
  const [metadata, library, styles, d6Page, d6App, d6Engine, obPage, obApp, obEngine, worker] = await Promise.all([
    readFile(new URL('../js/data/instruments.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
    readFile(new URL('../html/hohner-d6.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/hohner-d6.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/HohnerD6Processor.js', import.meta.url), 'utf8'),
    readFile(new URL('../html/ob-xa.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/obxa.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/OBXaProcessor.js', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(metadata, /id: 'hohner-d6'/);
  assert.match(metadata, /id: 'ob-xa'/);
  assert.doesNotMatch(library, /hohner-d6-tile-art|obxa-tile-art/);
  
  assert.match(library, /instrument-tile__keys/);
  assert.match(styles, /\.instrument-tile--hohner-d6 \.instrument-tile__visual::after/);
  assert.match(styles, /\.instrument-tile--ob-xa \.instrument-tile__visual::after/);
  assert.match(d6Page, /hohner-d6\.css/);
  assert.match(d6App, /toneFilters/);
  assert.match(d6App, /registerMidiTargetProvider/);
  assert.match(d6App, /pedal:/);
  assert.match(d6Engine, /c\.enabled/);
  assert.match(d6Engine, /tone\.some\(Boolean\)/);
  assert.doesNotMatch(d6Engine, /v\.toneState\s*=\s*0/);
  assert.doesNotMatch(d6Engine, /phaserPhaser/);
  assert.match(d6Engine, /pedalboardEnabled/);
  assert.match(d6App, /BOARD ON/);
  assert.match(d6App, /addDamperSlider\(\)/);
  assert.match(d6App, /type='range'/);
  assert.doesNotMatch(d6App, /label:\s*['\"]DAMPER['\"]/);
  assert.match(obPage, /ob-xa\.css/);
  assert.match(obApp, /EDIT TIMBRE/);
  assert.match(obApp, /DOUBLE \/ LAYER/);
  assert.match(obEngine, /mode==='double'/);
  assert.match(obEngine, /mode==='split'/);
  assert.match(obEngine, /pinkNoise/);
  assert.match(obEngine, /voiceCount\(\)/);
  assert.match(obEngine, /lfoValue\(/);
  assert.match(obApp, /MASTER TUNE/);
  assert.match(obApp, /PULSE WIDTH DEPTH/);
  assert.match(obApp, /PORTAMENTO/);
  assert.match(obApp, /CHORD MEMORY/);
  assert.match(obApp, /LOWER \/ UPPER BALANCE/);
  assert.match(obApp, /GLIDE MODE/);
  assert.match(obApp, /LOWER MOD \/ BEND/);
  assert.match(obApp, /UPPER MOD \/ BEND/);
  assert.match(obApp, /TRANSPOSE DOWN/);
  assert.match(obApp, /TRANSPOSE UP/);
  assert.match(obApp, /NARROW PITCH BEND/);
  assert.doesNotMatch(obApp, /VOLUME MOD/);
  assert.match(obEngine, /chordMemory/);
  assert.match(obEngine, /portamentoMode==='quantized'/);
  assert.match(obEngine, /inputNote===note/);
  assert.match(obEngine, /mode==='full'\?0:\(v\.i<half\?0:1\)/);
  assert.match(obEngine, /modEnabled\?clamp\(p\.pulseWidthAmount/);
  assert.match(obEngine, /width=clamp\(\.5-p\.pulseWidth\*\.45/);
  assert.doesNotMatch(obEngine, /lfoVca/);
  assert.match(obPage, /Oberheim_logo\.png/);
  assert.match(worker, /overture-shell-v50/);
  assert.match(worker, /hohner-d6/);
  assert.match(worker, /ob-xa/);
});

test('all library cards use canonical metadata with declared preset provenance', () => {
  assert.equal(INSTRUMENTS.length, 14);
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

test('Library search has a staggered entrance, accessible status, and no visible result count', async () => {
  const [library, styles] = await Promise.all([
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
  ]);
  assert.match(library, /library-search--entering/);
  assert.match(library, /class="library-search__hint"/);
  assert.match(library, /class="library-search__status" role="status"/);
  assert.doesNotMatch(library, /id="instrument-search-status"[^>]*>8 instruments available/);
  assert.match(styles, /@keyframes library-search-field-in/);
  assert.match(styles, /@keyframes library-search-hint-in/);
  assert.match(styles, /\.library-search__status\s*\{/);
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
  const sizingFix = styles.slice(styles.indexOf('Final viewport sizing correction'));
  assert.match(sizingFix, /#chassis\s*\{[^}]*box-sizing:\s*border-box/);
  assert.match(sizingFix, /#chassis\s*\{[^}]*min-width:\s*0/);
  assert.match(styles, /grid-template-areas:[\s\S]*"master"[\s\S]*"lfo"[\s\S]*"output"/);
  const compactLayout = styles.slice(styles.lastIndexOf('Compact, centred Little Phatty instrument'));
  assert.match(compactLayout, /width: min\(1280px, 100%\)/);
  assert.match(compactLayout, /grid-template-rows: minmax\(180px, auto\) minmax\(196px, auto\)/);
  assert.match(compactLayout, /margin: 0 auto/);
  assert.match(compactLayout, /@media \(max-width: 760px\)/);
  assert.match(engine, /natural, scrollable page flow/);
  assert.doesNotMatch(engine, /availH = window\.innerHeight/);
  assert.match(page, /little-phatty\.css\?v=20261104-compact-centred/);
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
  assert.match(emulatorStyles, /seed='43'/);
  assert.match(emulatorStyles, /font-family: 'Figtree'/);
  const responsiveStyles = emulatorStyles.slice(emulatorStyles.indexOf('Sub 37 responsive and typography correction'));
  assert.match(responsiveStyles, /\.sub37-shell\s*\{[^}]*min-width:\s*0/);
  assert.match(emulatorStyles, /@media \(max-width: 480px\)/);
  assert.match(page, /sub37\.css\?v=20261104-responsive-wood-type/);
});

test('instrument and experiment pages register the shared offline app shell', async () => {
  const paths = [
    '../about.html', '../library.html', '../omni.html', '../experiments.html',
    '../html/korg-ms-20.html', '../html/little-phatty.html', '../html/nord-c2d.html',
    '../html/prophet10.html', '../html/roland-juno-106.html', '../html/roland-tr-808.html',
    '../html/sub37.html', '../html/yamaha-dx7.html', '../html/mellotron-m400.html',
    '../html/oberheim-eight-voice.html', '../html/hohner-d6.html', '../html/ob-xa.html',
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


test('library mini-keybeds are shared except for the TR-808 and new art has no embedded labels', async () => {
  const [libraryCss, libraryJs] = await Promise.all([
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
  ]);
  assert.match(libraryCss, /\.instrument-tile:not\(\.instrument-tile--roland-tr-808\) \.instrument-tile__keys/);
  assert.match(libraryCss, /\.instrument-tile--roland-tr-808 \.instrument-tile__keys/);
  assert.match(libraryJs, /m400-tile-reel/);
  assert.match(libraryJs, /eight-voice-tile-art/);
  assert.doesNotMatch(libraryJs, /SEM 0[1-8]|<b>A<\/b>|<b>B<\/b>|<b>C<\/b>/);
});

test('M400 and Eight Voice are complete instrument pages, not library-only entries', async () => {
  const [mellotronPage, oberheimPage, mellotronApp, oberheimApp, mellotronEngine, oberheimEngine, worker] = await Promise.all([
    '../html/mellotron-m400.html', '../html/oberheim-eight-voice.html',
    '../js/mellotron-m400.js', '../js/oberheim-eight-voice.js',
    '../js/engine/MellotronProcessor.js', '../js/engine/OberheimEightVoiceProcessor.js',
    '../service-worker.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  assert.match(mellotronPage, /id="mellotron-m400-root"/);
  assert.match(mellotronPage, /mellotron-m400\.js/);
  assert.match(oberheimPage, /id="oberheim-eight-voice-root"/);
  assert.match(oberheimPage, /oberheim-eight-voice\.js/);
  assert.match(mellotronApp, /new WorkletEngine/);
  assert.match(mellotronApp, /notes: NOTES/);
  assert.match(mellotronApp, /length: 47/);
  assert.match(mellotronApp, /G2–F6/);
  assert.match(mellotronEngine, /finite/i);
  assert.match(mellotronApp, /VIRTUAL FRAME LIBRARY/);
  assert.match(mellotronApp, /THREE-TRACK HEAD/);
  assert.match(mellotronEngine, /FRAMES = \[/);
  assert.match(mellotronEngine, /8 seconds/);
  assert.match(oberheimApp, /new WorkletEngine/);
  assert.match(oberheimApp, /eight-voice-processor/);
  assert.match(oberheimApp, /VCF CUTOFF/);
  assert.match(oberheimApp, /STEREO PAN/);
  assert.match(oberheimApp, /FILTER RESPONSE/);
  assert.match(oberheimApp, /VCO 1 SHAPE/);
  assert.match(oberheimApp, /LFO ROUTING/);
  assert.match(oberheimApp, /voiceUi\.forEach/);
  assert.match(oberheimEngine, /q\.cutoff/);
  assert.match(oberheimEngine, /q\.resonance/);
  assert.match(oberheimEngine, /polyBlep/);
  assert.match(mellotronEngine, /8 second/);
  assert.match(mellotronEngine, /registerProcessor\('mellotron-processor'/);
  assert.match(oberheimEngine, /Array\.from\(\{ length: 8/);
  assert.match(oberheimEngine, /state-variable filter|state variable filter/i);
  for (const asset of ['/html/mellotron-m400', '/html/oberheim-eight-voice', '/js/engine/MellotronProcessor.js', '/js/engine/OberheimEightVoiceProcessor.js']) assert.ok(worker.includes(asset));
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
  const [page, config, client, migration, app, accountPage, loginPage, accountApp, accountMigration] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/supabase-config.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/supabaseClient.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261102000000_community_patches.sql', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../account.html', import.meta.url), 'utf8'),
    readFile(new URL('../login.html', import.meta.url), 'utf8'),
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
  assert.match(loginPage, /account-signup-form/);
  assert.match(loginPage, /account-google/);
  assert.match(loginPage, /account-login-form/);
  assert.doesNotMatch(loginPage, /account-profile-form/);
  assert.match(accountPage, /account-profile-form/);
  assert.doesNotMatch(accountPage, /account-signup-form/);
  assert.doesNotMatch(accountPage, /account-auth-panel/);
  assert.match(accountApp, /signInWithPassword/);
  assert.ok(accountApp.includes('window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`)'));
  assert.ok(accountApp.includes("const target = getReturnTo() || '/account';"));
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
  assert.ok(shell.includes("currentPath === '/login' || currentPath === '/login/'"));
  assert.ok(shell.includes('await supabase.auth.signOut()'));
  assert.ok(theme.includes('.header-account-wrap.is-signed-in:hover .header-account-menu'));
  assert.ok(theme.includes('.header-account-wrap.is-signed-in:focus-within .header-account-menu'));
  assert.equal(brand.includes('Shared Overture account control'), false);
  assert.ok(omni.includes('/css/site-theme.css'));
  assert.ok(omni.includes('account-shell.js?v=20261102-contributions-menu'));
  assert.ok(library.includes('account-shell.js?v=20261102-contributions-menu'));
  assert.ok(worker.includes('overture-shell-v42'));
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
  assert.ok(worker.includes('overture-shell-v42'));
});


test('Login page has an optimized animated sound-field background with reduced-motion support', async () => {
  const [loginPage, accountCss, worker] = await Promise.all([
    readFile(new URL('../login.html', import.meta.url), 'utf8'),
    readFile(new URL('../css/account.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(loginPage, /class="login-page"/);
  assert.match(loginPage, /class="login-ambient"/);
  assert.match(loginPage, /login-ambient__orbit--outer/);
  assert.match(loginPage, /login-ambient__traces/);
  assert.match(accountCss, /@keyframes login-orbit-outer/);
  assert.match(accountCss, /@keyframes login-glow-float/);
  assert.match(accountCss, /@keyframes login-prismatic-reflection/);
  assert.match(accountCss, /@keyframes login-glass-sheen/);
  assert.match(accountCss, /@keyframes login-orbit-glint/);
  assert.match(accountCss, /login-ambient__orbit::before/);
  assert.match(accountCss, /@media \\(prefers-reduced-motion:reduce\\)/);
  assert.match(accountCss, /Login backdrop performance pass/);
  assert.match(accountCss, /body\\.login-page \\.site-noise \\{\\s*display:none/);
  assert.match(accountCss, /@keyframes login-grid-float/);
  assert.match(worker, /overture-shell-v42/);
  assert.match(worker, /account\\.css\\?v=20261104-login-performance/);
  assert.match(loginPage, /account\\.css\\?v=20261104-login-performance/);
  assert.match(accountCss, /Light-mode graphite and Overture accent treatment/);
  assert.match(accountCss, /rgba\\(12,22,32,.13\\)/);
  assert.match(accountCss, /mix-blend-mode:multiply/);
});


test('Homepage library CTA logo is black in light mode', async () => {
  const [home, index] = await Promise.all([
    readFile(new URL('../css/home.css', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(index, /home\\.css\\?v=20261104-home-logo-light/);
  assert.match(home, /html\\[data-theme="light"\\] a\\.showcase-cta\\[href="\\/library"\\] \\.showcase-cta__icon img/);
  assert.match(home, /filter:brightness\\(0\\) !important/);
});


test('library empty state appears before the coming-soon tile or banner', async () => {
  const [app, styles, page, worker] = await Promise.all([
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
    readFile(new URL('../library.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  const emptyStateInsertion = app.indexOf('grid.prepend(emptyState)');
  const comingSoonCreation = app.indexOf('const comingSoon = document.createElement');
  assert.ok(emptyStateInsertion >= 0 && comingSoonCreation > emptyStateInsertion);
  assert.match(styles, /\.library-search__empty\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(page, /library\.css\?v=20261105-d6-obxa/);
  assert.match(worker, /overture-shell-v42/);
  assert.match(worker, /library\.css\?v=20261105-d6-obxa/);
});


test('Both emulator power overlays use a working button and gesture-first startup', async () => {
  const [obPage, d6Page, panel, obApp, worklet] = await Promise.all([
    readFile(new URL('../html/ob-xa.html', import.meta.url), 'utf8'),
    readFile(new URL('../html/hohner-d6.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/panel.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/obxa.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/workletEngine.js', import.meta.url), 'utf8'),
  ]);
  assert.match(obPage, /<button type="button" id="obxa-power"/);
  assert.match(d6Page, /<button type="button" id="hohner-power"/);
  assert.match(panel, /addEventListener\('pointerdown'/);
  assert.ok(obApp.indexOf("power('obxa-power'") < obApp.indexOf('this.build()'));
  assert.match(worklet, /await ctx\.audioWorklet\.addModule/);
});


test('OB-Xa includes a Lyle Mays-inspired unison ensemble preset', () => {
  const program = OBXA_PRESETS.find(({ name }) => name === 'Lyle Mays Ensemble');
  assert.ok(program, 'the Lyle Mays Ensemble program should be in the factory list');
  const patch = program.data;
  assert.equal(patch.mode, 'full');
  assert.equal(patch.voiceCount, 8);
  assert.equal(patch.unison, true);
  assert.equal(patch.osc1Wave, 'saw');
  assert.equal(patch.osc2Wave, 'saw');
  assert.ok(patch.osc2Tune > 0, 'VCO 2 should sit slightly sharp of VCO 1');
  assert.ok(patch.ampAttack >= .1, 'the stacked sound should fade in gently');
});

test('OB-Xa modulation panel is arranged into labelled responsive control groups', async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL('../js/obxa.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/ob-xa.css', import.meta.url), 'utf8'),
  ]);
  for (const label of ['LFO GENERATOR', 'MODULATION DESTINATIONS', 'PERFORMANCE', 'VOICE ASSIGNMENT & HOLD']) {
    assert.ok(app.includes(label), 'missing modulation group: ' + label);
  }
  assert.match(app, /obxa-modulation-layout/);
  assert.match(app, /obxa-mod-route-grid/);
  assert.match(styles, /\.obxa-mod-grid/);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /@media\(max-width:440px\)/);
});



test('Hohner D6 and OB-Xa library cards use minimalist instrument-specific surfaces', async () => {
  const [styles, page, worker, libraryJs] = await Promise.all([
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
    readFile(new URL('../library.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
  ]);
  for (const id of ['hohner-d6', 'ob-xa']) {
    assert.ok(styles.includes('.instrument-tile--' + id + ' .instrument-specs'));
    assert.ok(styles.includes('.instrument-tile--' + id + ' .instrument-tile__content'));
    assert.ok(styles.includes('html[data-theme="light"] .instrument-tile--' + id));
    assert.ok(styles.includes('.instrument-tile--' + id + ' .instrument-tile__visual::after'));
  }
  assert.doesNotMatch(libraryJs, /hohner-d6-tile-art|obxa-tile-art/);
  assert.doesNotMatch(styles, /hohner-d6-tile-art|obxa-tile-art/);
  assert.match(styles, /\.instrument-tile--hohner-d6 \.instrument-tile__display/);
  assert.match(styles, /\.instrument-tile--ob-xa \.instrument-tile__display/);
  assert.match(page, /library\.css\?v=20261106-tile-minimal-r1/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(worker, /library\.css\?v=20261106-tile-minimal-r1/);
});


test('Sequential Pro 3 and UDO Super 8 are first-class library instruments', async () => {
  const [metadata, library, styles, proPage, proApp, proEngine, superPage, superApp, superEngine, worker] = await Promise.all([
    readFile(new URL('../js/data/instruments.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
    readFile(new URL('../html/sequential-pro-3.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/sequential-pro-3.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/Pro3Processor.js', import.meta.url), 'utf8'),
    readFile(new URL('../html/udo-super-8.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/udo-super-8.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/Super8Processor.js', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  for (const id of ['sequential-pro-3','udo-super-8']) assert.ok(metadata.includes("id: '" + id + "'"));
  assert.ok(metadata.includes("route: '/html/sequential-pro-3'"));
  assert.ok(metadata.includes("route: '/html/udo-super-8'"));
  assert.ok(library.includes('instrument.route'));
  assert.ok(styles.includes('.instrument-tile--sequential-pro-3 .instrument-tile__visual::after'));
  assert.ok(styles.includes('.instrument-tile--udo-super-8 .instrument-tile__visual::after'));
  assert.ok(proPage.includes('sequential-pro-3.css'));
  assert.match(proApp, /MODULATION MATRIX/);
  assert.match(proApp, /SET A/);
  assert.match(proApp, /seqTracks/);
  assert.ok(proEngine.includes('registerProcessor("pro3-processor",Pro3Processor)'));
  assert.match(proEngine, /paraphonic/);
  assert.ok(superPage.includes('udo-super-8.css'));
  assert.match(superApp, /UPPER/);
  assert.match(superApp, /LOWER/);
  assert.match(superApp, /BINAURAL/);
  assert.match(superApp, /polyAftertouch/);
  assert.ok(superEngine.includes("registerProcessor('super8-processor',Super8Processor)"));
  assert.match(superEngine, /superMode/);
  assert.match(superEngine, /modMatrix/);
  assert.match(superEngine, /delayFreeze/);
  assert.ok(worker.includes('/html/sequential-pro-3'));
  assert.ok(worker.includes('/html/udo-super-8'));
  assert.ok(worker.includes('/js/engine/Pro3Processor.js'));
  assert.ok(worker.includes('/js/engine/Super8Processor.js'));
});
