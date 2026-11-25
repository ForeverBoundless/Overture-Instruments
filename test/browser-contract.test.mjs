import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INSTRUMENTS } from '../js/data/instruments.js';
import { OBXA_PRESETS } from '../js/data/obx-a-presets.js';

function assertPrecachedPageAssets(page, worker, pattern) {
  const assets = [...page.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="([^"]+)"[^>]*>/g)]
    .map(([, asset]) => asset)
    .filter((asset) => pattern.test(asset));
  assert.ok(assets.length, 'Expected the page to reference a matching first-party asset.');
  for (const asset of assets) {
    assert.ok(worker.includes("'" + asset + "'"), 'Active page asset is missing from the service-worker shell: ' + asset);
  }
}

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
  assert.match(obApp, /PULSE-WIDTH DEPTH/);
  assert.match(obApp, /PORTAMENTO/);
  assert.match(obApp, /CHORD MEMORY/);
  assert.match(obApp, /LOWER \/ UPPER BALANCE/);
  assert.match(obApp, /GLIDE MODE/);
  assert.match(obApp, /MODULATION \/ BEND ENABLE/);
  assert.match(obApp, /UPPER BANK/);
  assert.match(obApp, /DOWN 1 OCTAVE/);
  assert.match(obApp, /UP 1 OCTAVE/);
  assert.match(obApp, /NARROW RANGE/);
  assert.doesNotMatch(obApp, /VOLUME MOD/);
  assert.match(obEngine, /chordMemory/);
  assert.match(obEngine, /portamentoMode==='quantized'/);
  assert.match(obEngine, /inputNote===note/);
  assert.match(obEngine, /mode==='full'\?0:\(v\.i<half\?0:1\)/);
  assert.match(obEngine, /pwDepth=clamp\(p\.pulseWidthAmount,0,1\)/);
  assert.match(obEngine, /width=clamp\(\.5-p\.pulseWidth\*\.45/);
  assert.doesNotMatch(obEngine, /lfoVca/);
  assert.match(obPage, /Oberheim OB-Xa from Overture Instruments/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(worker, /hohner-d6/);
  assert.match(worker, /ob-xa/);
});


test('OB-Xa exposes the hardware programmer, modulation panel and voice-pan controls in its blue-steel theme', async () => {
  const [app, engine, patch, page, worker, styles] = await Promise.all([
    readFile(new URL('../js/obxa.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/OBXaProcessor.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/data/obxa-patch.js', import.meta.url), 'utf8'),
    readFile(new URL('../html/ob-xa.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/ob-xa.css', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /MODULATION PANEL LFO/);
  assert.match(app, /PULL UP TO ENABLE/);
  assert.match(app, /AUTO-TUNE/);
  assert.match(app, /OSC 2 FREQUENCY/);
  assert.match(app, /OSC 2 DETUNE/);
  assert.match(app, /VOICE PAN POTS/);
  assert.match(app, /HARDWARE PROGRAMMER/);
  assert.match(app, /SPLIT \/ DOUBLE MEMORY/);
  assert.match(app, /MEMORY PROTECT/);
  assert.match(app, /enterManualMode/);
  assert.match(app, /TIMBRE TRANSPOSE',min:-60,max:60/);
  assert.match(engine, /this\.modPanelLfo=\{phase:0\}/);
  assert.match(engine, /modPanelLfoValue\(dt\)/);
  assert.match(engine, /m\.t==='autoTune'/);
  assert.match(engine, /this\.p\.voicePan\?\.\[v\.i\]/);
  assert.match(engine, /p\.osc2Detune\|\|0/);
  assert.match(patch, /modPanelLfoDepthEnabled/);
  assert.match(patch, /osc2Detune/);
  assert.match(patch, /voicePan:\[-1,-1,-1,-1,1,1,1,1\]/);
  assert.match(styles, /\.obxa-programmer-layout/);
  assert.match(styles, /\.obxa-voice-grid/);
  assert.match(styles, /radial-gradient\(ellipse at 50% -20%,#314c63/);
  assert.match(page, /ob-xa\.css\?v=20261123-hardware-panel-r1/);
  assert.match(page, /obxa\.js\?v=20261123-obxa-patch-r5/);
  assert.match(worker, /OBXaProcessor\.js\?v=20261123-audio-r4/);
  assert.match(worker, /obxa-patch\.js\?v=20261123-obxa-patch-r4/);
  assert.match(worker, /ob-xa\.css\?v=20261123-hardware-panel-r1/);
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
  const [styles, engine, page, worker] = await Promise.all([
    readFile(new URL('../css/little-phatty.css', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../html/little-phatty.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
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
  assertPrecachedPageAssets(page, worker, /\/css\/little-phatty\.css/);
});

test('Sub 37 keeps its top controls reachable and uses compact horizontal modulation buses', async () => {
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
  assert.ok(emulatorStyles.includes('#sub37-root { min-height: 100vh; padding: 18px; display: grid; place-items: start center; align-content: start; }'));
  assert.ok(emulatorStyles.includes('#sub37-root { place-items: start center; align-content: start; }'));
  const responsiveStyles = emulatorStyles.slice(emulatorStyles.indexOf('Sub 37 responsive and typography correction'));
  assert.match(responsiveStyles, /\.sub37-shell\s*\{[^}]*min-width:\s*0/);
  assert.match(emulatorStyles, /@media \(max-width: 480px\)/);
  assert.ok(emulatorStyles.includes('.s37-mod-row .s37-section-body {'));
  assert.ok(emulatorStyles.includes('grid-template-columns: minmax(72px, 1fr) minmax(72px, 1fr)'));
  assert.ok(page.includes('sub37.css?v=20261123-scroll-r1'));
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
    '../experiments/wavefolding-lab.html', '../experiments/granular-lab.html',
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
  assert.match(mellotronApp, /G2-F6/);
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
  assert.ok(loginPage.includes('account.css?v=20261104-login-performance'));
  assert.ok(loginPage.includes('account.css?v=20261104-login-performance'));
  assert.ok(loginPage.includes('account.css?v=20261104-login-performance'));
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


test('Community preset exchange covers every library emulator and its native patch handoff', async () => {
  const [page, app, helper, migration, contributions, omni, registry, panel, d6, sources] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/communityPreset.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261102000000_community_patches.sql', import.meta.url), 'utf8'),
    readFile(new URL('../js/contributions.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/data/communityInstruments.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/panel.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/hohner-d6.js', import.meta.url), 'utf8'),
    Promise.all([
      '../js/engine/app.js','../js/sub37.js','../js/prophet10.js','../js/nord-c2d.js',
      '../js/yamaha-dx7.js','../js/roland-juno-106.js','../js/roland-tr-808.js','../js/korg-ms-20.js',
      '../js/mellotron-m400.js','../js/oberheim-eight-voice.js','../js/hohner-d6.js','../js/obxa.js',
      '../js/sequential-pro-3.js','../js/udo-super-8.js',
    ].map((path) => readFile(new URL(path, import.meta.url), 'utf8'))),
  ]);
  const ids = ["little-phatty","sub-37","prophet-10","nord-c2d","dx7","juno-106","tr-808","ms-20","mellotron-m400","oberheim-eight-voice","hohner-d6","ob-xa","sequential-pro-3","udo-super-8"];
  for (const id of ids) {
    assert.ok(page.includes(`value="${id}"`), `Community form should offer ${id}`);
    assert.ok(migration.includes(`'${id}'`), `database schema should allow ${id}`);
  }
  assert.match(app, /extractInstrumentPreset/);
  assert.match(app, /instrument-draft/);
  assert.match(helper, /createCommunityShareButton/);
  assert.match(helper, /consumeCommunityInstrumentPreset/);
  assert.match(helper, /consumeCommunitySource/);
  assert.match(helper, /editingItemId/);
  assert.match(helper, /attachCommunityPresetMetadata/);
  assert.match(helper, /restoreCommunityPresetSelection/);
  assert.match(registry, /COMMUNITY_INSTRUMENTS/);
  assert.match(contributions, /COMMUNITY_INSTRUMENT_BY_ID/);
  assert.match(app, /draftPresetSelection/);
  assert.ok(panel.includes('dataset.overturePresetSelector'));
  assert.ok(panel.includes('restoreCommunityPresetSelection'));
  assert.ok(d6.includes('capture:()=>clone(validate(this.patch))'));
  assert.ok(d6.includes("this.set('damping',value)"));
  assert.ok(d6.includes('Number.isFinite(damping)'));
  assert.equal((page.match(/id="community-title"/g) || []).length, 1, 'the form title input must have a unique ID');
  assert.match(page, /<h1 id="community-hero-title">/);
  assert.match(app, /community-edit-id/);
  assert.match(app, /data\.name = title\.slice\(0, 60\)/);
  assert.match(app, /\.update\(record\)[\s\S]*?\.eq\('owner_id', state\.user\.id\)/);
  assert.match(app, /editingId[\s\S]*?\.insert\(/);
  assert.match(app, /communityItemId: state\.user\?\.id === item\.owner_id \? item\.id : null/);
  assert.match(contributions, /communityItemId: state\.user\?\.id === item\.owner_id \? item\.id : null/);
  assert.match(omni, /communitySource/);
  assert.match(omni, /editingItemId: source\?\.id/);
  assert.match(migration, /record_type/);
  assert.ok(migration.includes('grant update (record_type, instrument_id'));
  assert.doesNotMatch(migration, /grant update on public\.community_patches to authenticated/i);
  for (const source of sources) {
    assert.match(source, /createCommunityShareButton/, 'each emulator should expose a one-click Community share action');
    assert.match(source, /consumeCommunityInstrumentPreset/, 'each emulator should accept Community patch imports');
  }
});


test('Community instrument patches receive automatic previews and clear upload moderation guidance', async () => {
  const [page, app, renderer, css, worker] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/instrumentPreview.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/community.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /generateInstrumentPreview\(instrumentId, data\)/);
  assert.match(app, /auto-preview-/);
  assert.match(app, /existingPreviewIsGenerated/);
  assert.match(app, /validateUserAudioFile/);
  assert.match(app, /GENERATE & PLAY/);
  assert.match(renderer, /OfflineAudioContext/);
  assert.match(renderer, /new TR808Engine\(\)/);
  assert.match(renderer, /engine\.trigger\(variant, time,/);
  assert.match(renderer, /new Prophet10Engine\(\)/);
  assert.match(renderer, /program\.values\[52\]/);
  assert.match(renderer, /new Sub37Engine\(\)/);
  assert.match(renderer, /new NordC2DEngine\(\)/);
  assert.match(renderer, /new WorkletEngine\(/);
  assert.doesNotMatch(renderer, /scheduleKeyboardNote|scheduleOrganVoice/);
  assert.match(page, /id="community-audio-warning"/);
  assert.match(page, /community-guidelines-check" hidden/);
  assert.doesNotMatch(page, /community-content-confirmation" required/);
  assert.match(app, /checkbox\.required = hasUploadedAudio/);
  assert.match(app, /label\.hidden = !hasUploadedAudio/);
  assert.match(page, /Inappropriate, abusive, hateful, sexual, threatening, or infringing audio will be removed/);
  assert.match(css, /community-warning-tooltip/);
  assert.match(css, /\.community-warning-wrap:focus-within/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(worker, /instrumentPreview\.js/);
  assert.match(worker, /20261112-auto-preview-r1/);
});


test('Community reports, moderator review, strike escalation and protected account rules are enforced', async () => {
  const [page, app, css, migration, worker] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/community.css', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261112010000_community_moderation.sql', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /community-report-dialog/);
  assert.match(page, /community-moderation-panel/);
  assert.match(page, /community-moderation-queue-status/);
  assert.match(app, /submit_community_patch_report/);
  assert.match(app, /get_community_moderation_reports/);
  assert.match(app, /review_community_patch_report/);
  assert.match(app, /get_community_account_status/);
  assert.match(app, /communityItemId/);
  assert.match(app, /REPORT/);
  assert.match(migration, /unique \(patch_id, reporter_id\)/);
  assert.match(migration, /recent_reports >= 10/);
  assert.match(migration, /current_strikes = 2[\s\S]*?interval '7 days'/);
  assert.match(migration, /current_strikes = 3[\s\S]*?interval '30 days'/);
  assert.match(migration, /current_strikes >= 4[\s\S]*?banned_at/);
  assert.match(migration, /lower\(username\) = 'michaelcarpiano'/);
  assert.match(migration, /community_is_protected_user\(patch_owner_id\)/);
  assert.match(migration, /jsonb_build_object\('status', 'protected'[\s\S]*?'hidden', false\)/);
  assert.match(migration, /community_can_publish/);
  assert.match(css, /community-report-dialog/);
  assert.match(css, /community-moderation-actions/);
  assert.match(worker, /overture-shell-v\d+/);
  assertPrecachedPageAssets(page, worker, /\/css\/community\.css|\/js\/community\.js/);
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
  assert.match(worker, /overture-shell-v\d+/);
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
  assert.ok(worker.includes('/js/contributions.js?v=20261112-community-edit-r1'));
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
  assertPrecachedPageAssets(page, worker, /\/css\/contributions\.css|\/js\/contributions\.js/);
  assert.ok(page.includes('contributions.js?v=20261112-community-edit-r1'));
  assert.ok(css.includes('#contributions-count'));
  assert.ok(css.includes('.contributions-toolbar.is-owner'));
  assert.ok(css.includes('@media (max-width:380px)'));
  assert.ok(app.includes("classList.toggle('is-owner', state.isOwner)"));
  assert.match(worker, /overture-shell-v\d+/);
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
  assert.ok(accountCss.includes('@media (prefers-reduced-motion:reduce)'));
  assert.match(accountCss, /Login backdrop performance pass/);
  assert.ok(accountCss.includes('body.login-page .site-noise'));
  assert.match(accountCss, /@keyframes login-grid-float/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.ok(worker.includes('/css/account.css?v=20261104-login-performance'));
  assert.ok(loginPage.includes('account.css?v=20261104-login-performance'));
  assert.match(accountCss, /Light-mode graphite and Overture accent treatment/);
  assert.ok(accountCss.includes('rgba(12,22,32,.13)'));
  assert.match(accountCss, /mix-blend-mode:multiply/);
});


test('Homepage library CTA logo is black in light mode', async () => {
  const [home, index, worker] = await Promise.all([
    readFile(new URL('../css/home.css', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assertPrecachedPageAssets(index, worker, /\/css\/home\.css/);
  assert.ok(home.includes('html[data-theme="light"] a.showcase-cta[href="/library"] .showcase-cta__icon img'));
  assert.ok(home.includes('filter:brightness(0) !important'));
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
  assert.match(worker, /overture-shell-v\d+/);
  assertPrecachedPageAssets(page, worker, /\/css\/library\.css/);
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
  assert.match(panel, /addEventListener\('click'/);
  assert.ok(obApp.indexOf("power('obxa-power'") < obApp.indexOf('this.build()'));
  assert.ok(worklet.includes('ctx.audioWorklet.addModule'));
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
  assert.match(worker, /overture-shell-v\d+/);
  assertPrecachedPageAssets(page, worker, /\/css\/library\.css/);
});


test('Sequential Pro 3 and UDO Super 8 are first-class library instruments', async () => {
  const [metadata, library, styles, proPage, proApp, proEngine, superPage, superApp, superEngine, superStyles, worker, proSkin] = await Promise.all([
    readFile(new URL('../js/data/instruments.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/library.css', import.meta.url), 'utf8'),
    readFile(new URL('../html/sequential-pro-3.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/sequential-pro-3.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/Pro3Processor.js', import.meta.url), 'utf8'),
    readFile(new URL('../html/udo-super-8.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/udo-super-8.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/Super8Processor.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/udo-super-8.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/sequential-pro-3.css', import.meta.url), 'utf8'),
  ]);
  for (const id of ['sequential-pro-3','udo-super-8']) assert.ok(metadata.includes("id: '" + id + "'"));
  assert.ok(metadata.includes("route: '/html/sequential-pro-3'"));
  assert.ok(metadata.includes("route: '/html/udo-super-8'"));
  assert.ok(library.includes('instrument.route'));
  assert.ok(styles.includes('.instrument-tile--sequential-pro-3 .instrument-tile__visual::after'));
  assert.ok(styles.includes('.instrument-tile--udo-super-8 .instrument-tile__visual::after'));
  assert.ok(proPage.includes('sequential-pro-3.css'));
  assert.match(proApp, /MODULATION MATRIX/);
  assert.match(proApp, /seqTracks/);
  assert.ok(proApp.includes('p3-overture-slider'));
  assert.ok(proApp.includes('p3-morph-actions'));
  assert.ok(proSkin.includes('.hp-pro3-stage > .hp-info'));
  assert.ok(proSkin.includes('.p3-morph-slider'));
  assert.ok(proSkin.includes('::-webkit-slider-runnable-track'));
  assert.ok(proEngine.includes('registerProcessor("pro3-processor",Pro3Processor)'));
  assert.match(proEngine, /paraphonic/);
  assert.ok(superPage.includes('udo-super-8.css'));
  assert.match(superApp, /UPPER/i);
  assert.match(superApp, /LOWER/i);
  assert.match(superApp, /binaural/i);
  assert.match(superApp, /polyAftertouch/);
  assert.ok(superEngine.includes("registerProcessor('super8-processor',Super8Processor)"));
  assert.match(superEngine, /superMode/);
  assert.match(superEngine, /modMatrix/);
  assert.match(superEngine, /delayFreeze/);
  assert.ok(superApp.includes('s8-upper'));
  assert.ok(superApp.includes('s8-console-row'));
  assert.ok(superApp.includes('s8-performance-bay'));
  assert.ok(superApp.includes('s8-mod-row'));
  assert.ok(superApp.includes('[l1,l2].forEach(section=>modRow.appendChild(section))'));
  assert.ok(superApp.includes('s8-mod-brand'));
  assert.ok(superApp.includes("modBrandLogo.src='/ui/Logos/UDO_logo.png'"));
  assert.ok(superStyles.includes('grid-template-columns:\n    minmax(230px, .72fr)'));
  assert.ok(superStyles.includes('.s8-mod-brand-copy strong'));
  assert.ok(superStyles.includes('.s8-mod-row > .s8-lfo1 .hp-group-body'));
  assert.ok(superStyles.includes('.s8-mod-row > .s8-lfo2 .s8-faders'));
  assert.ok(superStyles.includes('.s8-mod-row > .hp-group > .hp-group-body'));
  assert.ok(superStyles.includes('grid-template-columns: repeat(6, minmax(0, 1fr))'));
  assert.ok(superStyles.includes('height: 44px !important'));
  assert.ok(superApp.includes("k(l1.body,'lfo1Rate','Rate',{size:36"));
  assert.ok(superApp.includes("k(l2.body,'lfo2Rate','Rate',{size:36"));
  assert.doesNotMatch(styles, /super8-tile-art|pro3-tile-art/);
  assert.ok(superStyles.includes('.hp-super8 .hp-keybed'));
  assert.ok(superStyles.includes('.hp-super8-stage > .hp-info'));
  assert.ok(superStyles.includes('.s8-ddsmod .s8-faders'));
  assert.ok(superStyles.includes('.s8-lfo2 .s8-faders'));
  assert.ok(superStyles.includes('.s8-part .s8-part-performance'));
  assert.ok(superApp.includes("const dmFaders=addRow(dm.body,'s8-faders')"));
  assert.ok(superApp.includes("const l2faders=addRow(l2.body,'s8-faders')"));
  assert.ok(worker.includes('/html/sequential-pro-3'));
  assert.ok(worker.includes('/html/udo-super-8'));
  assert.ok(worker.includes('/js/engine/Pro3Processor.js'));
  assert.ok(worker.includes('/js/engine/Super8Processor.js'));
});


test('Community OMNI drafts use an explicit not-applicable instrument value', async () => {
  const [page, source, worker] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(page.includes('<option value="omni">Not applicable — OMNI patch</option>'));
  assert.ok(source.includes("instrument.value = 'omni'"));
  assert.ok(source.includes("instrument.hidden = !isInstrumentPreset"));
  assert.ok(source.includes("byId('community-instrument-wrap').hidden = !isInstrumentPreset"));
  assert.ok(source.includes("type === 'omni_patch' ? 'omni' : (instrumentId || 'little-phatty')"));
  assert.ok(source.includes("if (!INSTRUMENTS[instrument.value]) instrument.value = 'little-phatty'"));
  assert.ok(source.includes('function beginEdit'));
  assertPrecachedPageAssets(page, worker, /\/js\/community\.js/);
});

test('Shared emulator power cards support both span and div markup', async () => {
  const [styles, pages] = await Promise.all([
    readFile(new URL('../css/panel.css', import.meta.url), 'utf8'),
    Promise.all([
      '../html/mellotron-m400.html', '../html/yamaha-dx7.html', '../html/korg-ms-20.html',
      '../html/roland-juno-106.html', '../html/roland-tr-808.html', '../html/hohner-d6.html',
      '../html/ob-xa.html', '../html/sequential-pro-3.html', '../html/udo-super-8.html',
    ].map((file) => readFile(new URL(file, import.meta.url), 'utf8'))),
  ]);
  assert.ok(styles.includes('.pn-power > :is(span, div)'));
  assert.ok(styles.includes('.pn-power.is-starting > :is(span, div)'));
  for (const page of pages) assert.match(page, /class="[^"]*\bpn-power\b[^"]*"/);
});


test('Granular lab initializes without AudioContext and its note keys start/stop pitch-mapped grains', async () => {
  const [source, page, worker] = await Promise.all([
    readFile(new URL('../js/experiments/labs.js', import.meta.url), 'utf8'),
    readFile(new URL('../experiments/granular-lab.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  const granular = source.slice(source.indexOf('class GranularLab'), source.indexOf('const LABS'));
  const constructor = granular.slice(granular.indexOf('  constructor(){'), granular.indexOf('  makeSourceData('));
  assert.match(constructor, /this\.sourceData\s*=\s*this\.makeSourceData\(44100\)/);
  assert.doesNotMatch(constructor, /this\.makeSource\(/);
  assert.match(granular, /makeSourceData\(sampleRate\)/);
  assert.match(granular, /start\(\)\{this\.makeSource\(\);this\.nextGrain=this\.audio\.ctx\.currentTime;\}/);
  assert.match(granular, /this\.buffer\?\.getChannelData\(0\)\|\|this\.sourceData/);
  assert.match(granular, /this\.keyInput\(this\.controls,m=>this\.noteOn\(m\),m=>this\.noteOff\(m\)\)/);
  assert.match(granular, /this\.noteRate=Math\.pow\(2,\(midi-45\)\/12\)/);
  assert.match(granular, /source\.playbackRate\.value=\(this\.p\.reverse\?-1:1\)\*rate/);
  assert.match(page, /labs\.js\?v=20261118-green-sliders-r1/);
  assert.match(worker, /labs\.js\?v=20261118-green-sliders-r1/);
});

test('Community confirmation is required only when an audio file is attached', async () => {
  const [page, app] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /community-guidelines-check" hidden/);
  assert.doesNotMatch(page, /community-content-confirmation" required/);
  assert.match(app, /checkbox\.required = hasUploadedAudio/);
  assert.match(app, /label\.hidden = !hasUploadedAudio/);
});

test('Community serializers preserve output levels and Pro 3 LFO controls stay within their panel', async () => {
  const [lp, dx7, juno, p10, drums, pro3, styles] = await Promise.all([
    readFile(new URL('../js/engine/PresetManager.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/yamaha-dx7.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/roland-juno-106.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/prophet10.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/roland-tr-808.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/sequential-pro-3.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/sequential-pro-3.css', import.meta.url), 'utf8'),
  ]);
  assert.match(lp, /masterVolume: this\.engine\._masterVolume/);
  assert.match(dx7, /volume: num\(d\.volume/);
  assert.match(juno, /volume: 0\.7/);
  assert.match(p10, /masterTune: this\.engine\.state\.masterTune/);
  assert.match(drums, /masterLevel: num\(d\.masterLevel/);
  assert.match(drums, /masterLevel: this\.engine\.masterLevel/);
  assert.match(pro3, /labels:\['TRI','SAW','R\.SAW','SQR','S&H'\]/);
  assert.match(styles, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});


test('Community supports short direct instrument-output preview recordings', async () => {
  const [helper, community, page, worker, ...emulators] = await Promise.all([
    readFile(new URL('../js/shared/communityPreset.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
    ...[
      '../js/engine/app.js', '../js/sub37.js', '../js/prophet10.js', '../js/nord-c2d.js',
      '../js/roland-tr-808.js', '../js/yamaha-dx7.js', '../js/roland-juno-106.js',
      '../js/korg-ms-20.js', '../js/mellotron-m400.js', '../js/oberheim-eight-voice.js',
      '../js/hohner-d6.js', '../js/obxa.js', '../js/sequential-pro-3.js', '../js/udo-super-8.js',
    ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  ]);
  assert.match(helper, /COMMUNITY_PREVIEW_MAX_DURATION_MS = 10_000/);
  assert.match(helper, /createMediaStreamDestination/);
  assert.match(helper, /getAudioOutput/);
  assert.match(helper, /MediaRecorder/);
  assert.match(helper, /overture-community-preview-recorded/);
  assert.match(community, /openCommunityInstrumentRecorder/);
  assert.match(community, /receiveCommunityPreviewRecording/);
  assert.match(community, /renderRecordedPreview/);
  assert.match(page, /community-record-preview/);
  assert.match(page, /community-recorded-preview/);
  assert.match(worker, /overture-shell-v\d+/);
  assert.match(worker, /20261113-recorded-preview-r1/);
  assert.equal(emulators.every((source) => source.includes('getAudioOutput:')), true,
    'all 14 emulator pages must expose their final output node to the recorder');
});


test('Homepage includes a dedicated, theme-aware Community feature after Experiments', async () => {
  const [page, styles, worker] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../css/home.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  const experiments = page.indexOf('class="feature-section feature-section--experiments"');
  const community = page.indexOf('class="feature-section feature-section--community"');
  const comingSoon = page.indexOf('class="home-coming-soon"');
  assert.ok(experiments >= 0 && community > experiments && comingSoon > community);
  assert.match(page, /href="\/community"/);
  assert.match(page, /OMNI PATCHES/);
  assert.match(page, /INSTRUMENT PRESETS/);
  assert.match(styles, /\.feature-section--community/);
  assert.match(styles, /html\[data-theme="light"\] \.feature-section--community/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*feature-layout--community/);
  assertPrecachedPageAssets(page, worker, /\/css\/home\.css/);
});


test('Community pages, homepage feature and emulator share action use the violet accent', async () => {
  const [theme, communityCss, contributionsCss, homeCss, midiCss, communityPage, profilePage, homePage, worker] = await Promise.all([
    readFile(new URL('../css/site-theme.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/community.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/contributions.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/home.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/midi-map.css', import.meta.url), 'utf8'),
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../contributions.html', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(theme, /--oi-community-accent:\s*#c493ff/);
  assert.match(theme, /html\[data-theme="light"\][\s\S]*--oi-community-accent:\s*#743bb8/);
  assert.match(theme, /\.community-button--primary[\s\S]*var\(--oi-community-button-background\)/);
  assert.match(communityCss, /\.community-card__top\s*\{\s*color:\s*var\(--oi-community-accent\)/);
  assert.match(communityCss, /html\[data-theme="light"\] \.community-record-preview/);
  assert.match(contributionsCss, /\.contributions-profile__summary strong\s*\{\s*color:\s*var\(--oi-community-accent\)/);
  assert.match(homeCss, /\.feature-section--community \.feature-copy h2 em\s*\{\s*color:\s*var\(--oi-community-accent\)/);
  assert.match(homeCss, /html\[data-theme="light"\] \.community-feature-showcase/);
  assert.match(midiCss, /button\.oi-community-share[\s\S]*#e6d2ff/);
  assert.match(midiCss, /html\[data-theme="light"\] button\.oi-community-share[\s\S]*#eee2ff/);
  assertPrecachedPageAssets(communityPage, worker, /\/css\/community\.css/);
  assertPrecachedPageAssets(profilePage, worker, /\/css\/contributions\.css/);
  assertPrecachedPageAssets(homePage, worker, /\/css\/home\.css/);
  assert.match(worker, /overture-shell-v\d+/);
});


test('Community violet remains the active highlight above the shared light-theme polish', async () => {
  const [polish, home, theme, worker] = await Promise.all([
    readFile(new URL('../css/site-theme-polish.css', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../css/site-theme.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(polish, /body \.community-hero h1 em[\s\S]*--oi-community-accent-strong/);
  assert.match(polish, /main \.feature-section--community \.feature-copy h2 em/);
  assert.match(polish, /main \.feature-section--community \.eyebrow-dot--cyan/);
  assertPrecachedPageAssets(home, worker, /\/css\/site-theme-polish\.css/);
  assert.match(theme, /--oi-community-accent:\s*#c493ff/);
});


test('Emulator pages use the shared Overture toolbar and the Community preview recorder matches both themes', async () => {
  const [helper, toolbar, recorder, communityCss, communityPage, worker] = await Promise.all([
    readFile(new URL('../js/shared/communityPreset.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/emulator-topbar.css', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/communityPreset.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/community.css', import.meta.url), 'utf8'),
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(helper, /placeCommunityButtonInEmulatorTopbar\(button, instrumentId\)/);
  assert.match(helper, /instrumentId === 'prophet-10'/);
  assert.match(toolbar, /\.oi-emulator-topbar/);
  assert.match(toolbar, /html\[data-theme="light"\]/);
  assert.match(recorder, /oi-community-recorder__head/);
  assert.match(recorder, /html\[data-theme="light"\] \.oi-community-recorder/);
  assert.match(communityCss, /#community-root \.community-hero h1 em[\s\S]*#6930aa/);
  assertPrecachedPageAssets(communityPage, worker, /\/css\/community\.css/);
  assert.ok(worker.includes('/css/emulator-topbar.css?v=20261116-r3'));
  assert.match(worker, /overture-shell-v\d+/);
});


test('The homepage Community section and coming-soon banner share a continuous violet contour field', async () => {
  const [page, styles, worker, phattyCss, phattyPage, toolbar] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../css/home.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/little-phatty.css', import.meta.url), 'utf8'),
    readFile(new URL('../html/little-phatty.html', import.meta.url), 'utf8'),
    readFile(new URL('../css/emulator-topbar.css', import.meta.url), 'utf8'),
  ]);
  assert.ok(page.indexOf('<div class="community-feature-region">') < page.indexOf('class="feature-section feature-section--community"'));
  assert.ok(page.indexOf('class="home-coming-soon"') > page.indexOf('class="feature-section feature-section--community"'));
  assert.ok(page.includes('    </aside>') && page.includes('  </main>') && page.lastIndexOf('</div>', page.indexOf('  </main>')) > page.indexOf('class="home-coming-soon"'));
  assert.ok(styles.includes('.community-feature-region::before') && styles.includes('repeating-radial-gradient'));
  assert.ok(styles.includes('.community-feature-region .home-coming-soon'));
  assert.ok(styles.includes('html[data-theme="light"] .community-feature-region::before'));
  assertPrecachedPageAssets(page, worker, /\/css\/home\.css/);
  assert.ok(toolbar.includes('grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) auto'));
  assert.ok(phattyCss.includes('body.little-phatty-body.oi-emulator-topbar-active #app-root'));
  assert.ok(phattyPage.includes('little-phatty.css?v=20261116-toolbar-offset-r1'));
  assert.match(worker, /overture-shell-v\d+/);
  assert.ok(worker.includes('/css/home.css?v=20261117-omni-denser-lines-r1'));
  assert.ok(worker.includes('toolbar-offset-r1'));
});


test('Every non-Prophet emulator toolbar shows live MIDI status, Help and Community with an instrument-specific guide', async () => {
  const [helper, toolbar, worker] = await Promise.all([
    readFile(new URL('../js/shared/communityPreset.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/emulator-topbar.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(helper, /from '\.\.\/engine\/MidiManager\.js'/);
  assert.match(helper, /MidiManager\.connectionListeners\.add/);
  assert.match(helper, /MIDI: no device connected/);
  assert.match(helper, /createEmulatorHelpButton/);
  assert.match(helper, /CLOSE GUIDE/);
  assert.match(helper, /'sub-37': \{/);
  assert.match(helper, /'nord-c2d': \{/);
  assert.match(helper, /'dx7': \{/);
  assert.match(helper, /'tr-808': \{/);
  assert.match(helper, /'ob-xa': \{/);
  assert.match(helper, /'udo-super-8': \{/);
  assert.match(helper, /'sequential-pro-3': \{/);
  assert.match(helper, /'little-phatty': \{/);
  assert.match(helper, /'mellotron-m400': \{/);
  assert.match(helper, /'hohner-d6': \{/);
  assert.match(helper, /'oberheim-eight-voice': \{/);
  assert.match(helper, /'juno-106': \{/);
  assert.match(helper, /'ms-20': \{/);
  assert.match(toolbar, /\.oi-emulator-help__close/);
  assert.match(toolbar, /\.oi-emulator-topbar__help/);
  assert.match(toolbar, /html\[data-theme="light"\] \.oi-emulator-help/);
  assert.match(worker, /emulator-topbar\.css\?v=20261116-r3/);
  assert.match(worker, /overture-shell-v\d+/);
});


test('OMNI patch rename uses a theme-aware modal and patch tile entrance plays only once', async () => {
  const [launcher, styles, page, worker] = await Promise.all([
    readFile(new URL('../js/omni-launcher.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/omni-launcher.css', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(launcher, /window\.prompt\(['"]Patch name/);
  assert.match(launcher, /className = 'omni-rename-dialog'/);
  assert.match(launcher, /dialog\.showModal\(\)/);
  assert.match(launcher, /aria-labelledby', 'omni-rename-title'/);
  assert.match(launcher, /Patch names must contain at least three characters/);
  assert.match(styles, /\.omni-rename-dialog::backdrop/);
  assert.match(styles, /omni-rename-accent:#7de4ff/);
  assert.match(styles, /html\[data-theme="light"\]\.omni-launcher-mode \.omni-rename-dialog[\s\S]*omni-rename-accent:#087f9f/);
  assert.match(styles, /omni-rename-dialog \.omni-rename-actions \.community-button--primary:hover/);

  assert.match(styles, /html\[data-theme="light"\]\.omni-launcher-mode \.omni-rename-dialog/);
  assert.match(launcher, /patchTileIntroPlayed/);
  assert.match(launcher, /makePatchTile\(item, playIntro = false\)/);
  assert.match(styles, /\.omni-patch-grid > \.omni-patch-card\.is-entering/);
  assert.match(launcher, /visibilitychange/);
  assert.match(page, /omni-launcher\.css\?v=20261118-rename-modal-blue-r2/);
  assert.match(page, /omni-launcher\.js\?v=20261119-front-panel-r18/);
  assert.match(worker, /overture-shell-v\d+/);
});


test('Experiments sliders use the OMNI range design recoloured green', async () => {
  const [source, styles, worker] = await Promise.all([
    readFile(new URL('../js/experiments/labs.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/experiments.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(source.includes("el('input', 'lab-slider', row)"));
  assert.ok(source.includes('--lab-slider-fill'));
  assert.ok(styles.includes('.lab-control input.lab-slider::-webkit-slider-runnable-track'));
  assert.ok(styles.includes('.lab-control input.lab-slider::-webkit-slider-thumb'));
  assert.ok(styles.includes('html[data-theme="light"] .lab-control input.lab-slider'));
  assert.ok(worker.includes('/css/experiments.css?v=20261118-green-sliders-r1'));
  assert.match(worker, /overture-shell-v\d+/);
});


test('OMNI organ card exposes nine linked drawbars and a wider layout', async () => {
  const [app, styles, page, worker] = await Promise.all([
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/omni.css', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(app.includes('ORGAN_DRAWBARS = ['));
  assert.ok(app.includes('omni-organ-drawbar__input'));
  assert.ok(app.includes('input.addEventListener(\'input\', () => this.setParam(m.id, key, Number(input.value), false))'));
  assert.ok(app.includes('input.dataset.paramKey = key'));
  assert.ok(app.includes('this.inspBody?.querySelectorAll'));
  assert.ok(styles.includes('.omni-module--organ {width:440px'));
  assert.ok(styles.includes('grid-template-columns:repeat(9,minmax(0,1fr))'));
  assert.ok(page.includes('omni.css?v=20261119-front-panel-r17'));
  assert.ok(worker.includes('omni.js?v=20261119-front-panel-r17'));
});

test('Experiments sliders use OMNI styling with green accents in both themes', async () => {
  const [source, styles, page, worker] = await Promise.all([
    readFile(new URL('../js/experiments/labs.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/experiments.css', import.meta.url), 'utf8'),
    readFile(new URL('../experiments/filter-lab.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(source.includes("el('input', 'lab-slider', row)"));
  assert.ok(source.includes('--lab-slider-fill'));
  assert.ok(styles.includes('.lab-control input.lab-slider::-webkit-slider-runnable-track'));
  assert.ok(styles.includes('.lab-control input.lab-slider::-webkit-slider-thumb'));
  assert.ok(styles.includes('html[data-theme="light"] .lab-control input.lab-slider'));
  assert.ok(page.includes('/js/experiments/labs.js'));
  assert.ok(worker.includes('/css/experiments.css?v=20261118-green-sliders-r1'));
});


test('OMNI organ starter templates expand their layout and preview to fit the drawbar module', async () => {
  const [templates, app, launcher, page, worker] = await Promise.all([
    readFile(new URL('../js/omni/templates.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/omni-launcher.js', import.meta.url), 'utf8'),
    readFile(new URL('../omni.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(templates.includes("function templateModuleWidth(type)"));
  assert.ok(templates.includes("return type === 'nordOrgan' ? 440 : 210;"));
  assert.ok(templates.includes("return 78 + rows * 23 + (module.type === 'nordOrgan' ? 180 : 0);"));
  assert.ok(templates.includes('columnX.set(col, x);'));
  assert.ok(templates.includes('rowY.set(row, y);'));
  assert.ok(templates.includes("const BW = (m) => m.type === 'nordOrgan' ? 440 : 210;"));
  assert.ok(templates.includes('miniature nine-drawbar bank'));
  assert.ok(templates.includes('drawbar${index + 1}'));
  assert.ok(templates.includes("T('Nord Rotary Registration'"));
  assert.ok(templates.includes("T('Organ & Mellotron Layers'"));
  assert.ok(app.includes('templates.js?v=20261119-front-panel-r2'));
  assert.ok(launcher.includes('omni.js?v=20261119-front-panel-r17'));
  assert.ok(page.includes('omni-launcher.js?v=20261119-front-panel-r18'));
  assert.match(worker, /overture-shell-v\d+/);
  assert.ok(worker.includes('templates.js?v=20261119-front-panel-r2'));
});


test('Community feed defers patch JSON and avoids continuous full-page gradient repaints', async () => {
  const [page, app, styles, worker] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/community.css', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  const feedLoader = app.slice(app.indexOf('async function loadPatches'), app.indexOf('async function beginEdit'));
  assert.doesNotMatch(feedLoader, /patch_data/);
  assert.match(app, /async function ensurePatchData\(item\)/);
  assert.match(app, /\.select\('patch_data'\)/);
  assert.match(app, /await ensurePatchData\(item\)/);
  assert.match(app, /patchDataRequests: new Map\(\)/);
  assert.match(app, /renderedCards: new Map\(\)/);
  assert.doesNotMatch(styles, /animation:\s*community-signal-drift/);
  assert.doesNotMatch(styles, /@keyframes community-signal-drift/);
  assert.match(page, /community\.css\?v=20261124-community-performance-r1/);
  assert.match(page, /community\.js\?v=20261124-lazy-patches-r1/);
  assert.match(worker, /community\.css\?v=20261124-community-performance-r1/);
  assert.match(worker, /community\.js\?v=20261124-lazy-patches-r1/);
});


test('Community defers OMNI and instrument audio engines, and loads contact vendors only on demand', async () => {
  const [page, app, contact] = await Promise.all([
    readFile(new URL('../community.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/community.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/shared/contact.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(app, /from ['"]\.\/omni\/graph\.js/);
  assert.doesNotMatch(app, /from ['"]\.\/shared\/instrumentPreview\.js/);
  assert.match(app, /import\('\.\/omni\/graph\.js'\)/);
  assert.match(app, /import\('\.\/shared\/instrumentPreview\.js'\)/);
  assert.doesNotMatch(page, /cdn\.jsdelivr\.net\/npm\/\@emailjs\/browser/);
  assert.doesNotMatch(page, /cdn\.jsdelivr\.net\/npm\/dompurify/);
  assert.match(contact, /Load a browser library only when it is actually needed/);
  assert.match(page, /community\.js\?v=20261124-lazy-patches-r2/);
});
