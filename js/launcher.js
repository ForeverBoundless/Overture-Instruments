const INSTRUMENTS = [{
  id: 'little-phatty', name: 'Little Phatty', model: 'Stage Edition', manufacturer: 'Moog Music',
  voiceMode: 'Monophonic', presets: 100, keys: 37, icon: 'graphic_eq',
  description: 'A compact, muscular analog voice: dual VCO weight, singing resonance, and the unmistakable sweep of a Moog ladder filter.',
}, {
  id: 'sub-37', name: 'Sub 37', model: 'Bob Moog Tribute Edition', manufacturer: 'Moog Music',
  voiceMode: 'Mono / 2-note paraphonic', presets: 256, keys: 37, icon: 'tune',
  description: 'A deep, forceful performance synth with two modulation busses, dual DAHDSR envelopes, MultiDrive, and a playable 64-step sequencer.',
}];

const spec = (label, value, icon) => `<div class="instrument-spec"><span class="material-symbols-rounded">${icon}</span><span>${label}</span><strong>${value}</strong></div>`;

function buildTile(instrument) {
  const tile = document.createElement('article');
  tile.className = `instrument-tile instrument-tile--${instrument.id}`;
  tile.tabIndex = 0;
  tile.setAttribute('role', 'button');
  tile.setAttribute('aria-label', `Select ${instrument.name}`);
  tile.innerHTML = `<div class="instrument-tile__visual" aria-hidden="true"><div class="instrument-tile__glow"></div><div class="instrument-tile__display"><span></span><span></span></div><div class="instrument-tile__keys"></div><span class="material-symbols-rounded instrument-tile__icon">${instrument.icon}</span></div><div class="instrument-tile__content"><div class="instrument-tile__eyebrow">${instrument.manufacturer}</div><h2>${instrument.name}</h2><p class="instrument-tile__model">${instrument.model}</p><p class="instrument-tile__description">${instrument.description}</p><div class="instrument-specs">${spec('Voice', instrument.voiceMode, 'radio_button_checked')}${spec('Presets', instrument.presets, 'bookmark')}${spec('Keybed', instrument.keys, 'piano')}</div><div class="instrument-tile__actions"><span class="instrument-tile__hint"><span class="material-symbols-rounded">touch_app</span> to launch</span><md-filled-button class="instrument-launch-button"><span slot="icon" class="material-symbols-rounded">play_arrow</span>Launch</md-filled-button></div></div>`;
  const select = () => { document.querySelectorAll('.instrument-tile.is-selected').forEach((el) => el.classList.remove('is-selected')); tile.classList.add('is-selected'); tile.setAttribute('aria-label', `${instrument.name} selected. Launch button available.`); };
  tile.addEventListener('click', select);
  tile.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
  tile.querySelector('.instrument-launch-button').addEventListener('click', (event) => {
    event.stopPropagation();
    if (instrument.id === 'sub-37') { window.location.assign('./sub37.html'); return; }
    document.dispatchEvent(new CustomEvent('launcher:launch', { detail: instrument }));
  });
  return tile;
}

const page = document.getElementById('launcher-page');
page.innerHTML = `<div class="launcher-ambient launcher-ambient--one" aria-hidden="true"></div><div class="launcher-ambient launcher-ambient--two" aria-hidden="true"></div><div class="launcher-noise" aria-hidden="true"></div><header class="launcher-header"><div class="launcher-brand"><span class="launcher-brand__mark"><i></i><i></i><i></i></span><span>OVERTURE</span></div><div class="launcher-status"><span></span>Instrument library</div></header><section class="launcher-hero" aria-labelledby="launcher-title"><p class="launcher-overline">A focused collection of playable classics</p><h1 id="launcher-title">Choose your<br><em>instrument.</em></h1><p>Start with a carefully modeled synth. Your library will grow here, one unmistakable voice at a time.</p></section><section class="instrument-grid" aria-label="Available instruments"></section><footer class="launcher-footer"><span>01 AVAILABLE INSTRUMENT</span><span>SELECT A TILE TO CONTINUE</span></footer>`;
const grid = page.querySelector('.instrument-grid');
INSTRUMENTS.forEach((instrument) => grid.appendChild(buildTile(instrument)));

const count = page.querySelector('.launcher-footer span');
if (count) {
  const amount = String(INSTRUMENTS.length).padStart(2, '0');
  count.textContent = `${amount} AVAILABLE INSTRUMENT${INSTRUMENTS.length === 1 ? '' : 'S'}`;
}
