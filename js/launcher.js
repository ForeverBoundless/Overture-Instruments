const INSTRUMENTS = [{
  id: 'little-phatty', name: 'Little Phatty', model: 'Stage Edition', manufacturer: 'Moog Music',
  voiceMode: 'Monophonic', presets: 100, keys: 37, icon: 'graphic_eq',
  description: 'A compact, muscular analog voice: dual VCO weight, singing resonance, and the unmistakable sweep of a Moog ladder filter, featuring an oscilloscope/spectrum analyzer for visual feedback. Programmed with the Stage Factory preset bank.',
}, {
  id: 'sub-37', name: 'Sub 37', model: 'Bob Moog Tribute Edition', manufacturer: 'Moog Music',
  voiceMode: 'Mono / 2-note paraphonic', presets: 256, keys: 37, icon: 'tune',
  description: 'A forceful performance synth with two modulation busses, dual DAHDSR envelopes, MultiDrive, arpeggiator, and an intuitive 64-step sequencer. Programmed with the Sub 37 Factory preset bank.',
}, {
  id: 'prophet-10', name: 'Prophet-10', model: 'Rev4', manufacturer: 'Sequential Circuits',
  voiceMode: '10-voice polyphonic', presets: 400, keys: 61, icon: 'piano',
  description: 'A ten-voice analog polyphonic classic with dual oscillators, Poly-Mod, Wheel Mod, vintage voice variation, and classic Prophet architecture. Includes Chord Memory functionality and customizable aftertouch. Programmed with the Prophet-10 Factory preset bank.',
}, {
  id: 'nord-c2d', name: 'Nord C2D', model: 'Combo organ', manufacturer: 'Nord',
  voiceMode: 'Dual manual', presets: "4 models", keys: '2 x 37', icon: 'piano',
  description: 'A stage-ready dual-manual organ layout with complete drawbar racks and Leslie-inspired vibrato, with a red Nord finish. Features a full selection of pipe organ stops alongside classic Hammond, VX, and Farfisa tones.',
}];

const spec = (label, value, icon) => `<div class="instrument-spec"><span class="material-symbols-rounded">${icon}</span><span>${label}</span><strong>${value}</strong></div>`;

function buildTile(instrument) {
  const tile = document.createElement('article');
  tile.className = `instrument-tile instrument-tile--${instrument.id}`;
  tile.tabIndex = 0;
  tile.setAttribute('role', 'button');
  tile.setAttribute('aria-label', `Select ${instrument.name}`);
  tile.innerHTML = `<div class="instrument-tile__visual" aria-hidden="true"><div class="instrument-tile__glow"></div><div class="instrument-tile__display"><span></span><span></span></div><div class="instrument-tile__keys"></div><span class="material-symbols-rounded instrument-tile__icon">${instrument.icon}</span></div><div class="instrument-tile__content"><div class="instrument-tile__eyebrow">${instrument.manufacturer}</div><h2>${instrument.name}</h2><p class="instrument-tile__model">${instrument.model}</p><p class="instrument-tile__description">${instrument.description}</p><div class="instrument-specs">${spec('Voice', instrument.voiceMode, 'radio_button_checked')}${spec('Presets', instrument.presets, 'bookmark')}${spec('Keybed', instrument.keys, 'piano')}</div><div class="instrument-tile__actions"><span class="instrument-tile__hint"><span class="material-symbols-rounded">touch_app</span><b>to launch</b></span><md-filled-button class="instrument-launch-button"><span slot="icon" class="material-symbols-rounded">play_arrow</span>Launch</md-filled-button></div></div>`;
  const select = () => { document.querySelectorAll('.instrument-tile.is-selected').forEach((el) => el.classList.remove('is-selected')); tile.classList.add('is-selected'); tile.setAttribute('aria-label', `${instrument.name} selected. Launch button available.`); };
  tile.addEventListener('click', select);
  tile.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
  tile.querySelector('.instrument-launch-button').addEventListener('click', (event) => {
    event.stopPropagation();
    if (instrument.id === 'little-phatty') { window.location.assign('./little-phatty/'); return; }
    if (instrument.id === 'sub-37') { window.location.assign('./sub37.html'); return; }
    if (instrument.id === 'prophet-10') { window.location.assign('./prophet10.html'); return; }
    if (instrument.id === 'nord-c2d') { window.location.assign('./nord-c2d.html'); return; }
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

const page = document.getElementById('launcher-page');
page.innerHTML = `<div class="launcher-ambient launcher-ambient--one" aria-hidden="true"></div><div class="launcher-ambient launcher-ambient--two" aria-hidden="true"></div><div class="launcher-noise" aria-hidden="true"></div><header class="launcher-header"><div class="launcher-brand"><span class="launcher-brand__mark"><img class="launcher-brand__mark-img" src="./ui/Logos/OvertureLogo.png" alt="Overture" width="24" height="24"></span>
<span>OVERTURE INSTRUMENTS</span></div><div class="launcher-status"><span></span><b>OI Library</b></div></header><section class="launcher-hero" aria-labelledby="launcher-title">
  <div class="launcher-hero__copy">
    <p class="launcher-overline">An expanding collection of MIDI-playable classics</p>

    <h1 id="launcher-title">
      Ch<img class="launcher-hero__o-icon" src="./ui/Logos/OvertureLogo.png" alt="o">ose your<br>
      <em>instrument.</em>
    </h1>

    <p class="launcher-hero__description">
      <span>Explore OI's library of keyboard emulators, built with obsessive realism and detail.</span><br>
      <b>Completely free.</b>
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
      <img src="/ui/Logos/Oberheim_logo.png" alt="Oberheim">
    </div>

    <div class="launcher-brand-slot">
      <img src="/ui/Logos/Nord_logo.png" alt="Nord">
    </div>

    <div class="launcher-brand-slot">
      <img src="/ui/Logos/Korg_logo.png" alt="Korg">
    </div>
  </div>
</section><section class="instrument-grid" aria-label="Available instruments"></section><footer class="launcher-footer"><span>01 AVAILABLE INSTRUMENT</span><span>SELECT A TILE TO CONTINUE</span></footer>
<div class="launcher-legal">
  © 2026 Overture Instruments. Independent, unofficial project. Not affiliated with, endorsed by, or sponsored by any manufacturer represented here.
  All trademarks and brand names belong to their respective owners.
</div>`;
const grid = page.querySelector('.instrument-grid');
INSTRUMENTS.forEach((instrument) => grid.appendChild(buildTile(instrument)));

const comingSoon = document.createElement('aside');
comingSoon.className = `launcher-coming-soon ${INSTRUMENTS.length % 2 ? 'launcher-coming-soon--tile' : 'launcher-coming-soon--banner'}`;
comingSoon.setAttribute('aria-label', 'More instruments coming soon');
comingSoon.innerHTML = `<span class="launcher-coming-soon__signal" aria-hidden="true"></span><div class="launcher-coming-soon__copy"><span class="launcher-coming-soon__eyebrow"><!-- Something can go here --></span><strong>M<img class="launcher-coming-soon__o-icon" src="./ui/Logos/OvertureLogo.png" alt="">re is coming soon!</strong><span class="launcher-coming-soon__subline">New instruments are already in development.<br>Check out the GitHub to stay tuned!</span></div><a class="launcher-coming-soon__arrow" href="https://github.com/ForeverBoundless/Overture-Instruments" target="_blank" rel="noopener noreferrer" aria-label="Visit the Overture Instruments GitHub repository">↗</a>`;
if (INSTRUMENTS.length % 2) grid.appendChild(comingSoon);
else grid.insertAdjacentElement('afterend', comingSoon);

const count = page.querySelector('.launcher-footer span');
if (count) {
  const amount = String(INSTRUMENTS.length).padStart(2, '0');
  count.textContent = `${amount} AVAILABLE INSTRUMENT${INSTRUMENTS.length === 1 ? '' : 'S'}`;
}
