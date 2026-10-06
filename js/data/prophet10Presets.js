// Prophet programs are intentionally plain JSON so they can be saved to localStorage
// and exchanged with a future SysEx implementation.
const base = {
  oscAOctave: 8, oscBOctave: 8, oscALevel: 0.78, oscBLevel: 0.62, oscBFine: 0,
  oscAWave: 'saw', oscAPulse: true, oscBWave: 'saw', oscBPulse: true,
  oscBSync: false, oscBLowFreq: false, oscBKeyboard: true, noiseLevel: 0.02,
  cutoff: 4200, resonance: 0.18, filterEnvAmount: 2800, keyTrack: 0.5, filterRevision: 'rev4',
  lfoRate: 4, lfoAmount: 0, lfoShape: 'triangle', wheelSourceMix: 0, wheelDestination: 'filter',
  polyFilterEnv: 0, polyOscB: 0, polyDestination: 'filter',
  velocity: 0, aftertouch: 0, glide: 0, unison: false, chordMemory: false,
  releaseMode: 'normal', masterTune: 0, a440: true, stack: false, split: false, splitPoint: 60,
  ampEnv: { attack: 0.004, decay: 0.3, sustain: 0.72, release: 0.35 },
  filterEnv: { attack: 0.004, decay: 0.35, sustain: 0.2, release: 0.32 },
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const patch = (id, name, values = {}) => {
  const result = { ...clone(base), ...values, id, name };
  result.ampEnv = { ...base.ampEnv, ...(values.ampEnv || {}) };
  result.filterEnv = { ...base.filterEnv, ...(values.filterEnv || {}) };
  return result;
};

const names = ["It’s a Prophet 5","After Ringer","Forever Keys","Funk Bass II","Formant Seraphim","Stabby Brass","No Whining","Fantastic Five","Velocipeed","PDG Organ","Clavicle","Blow by Blow","Taari Choir","Digi-Recorder","Reedy String Pad","Canned Happiness","Synchrotrill","Born in the 80s","Sticky Plucks","Watery Plucks","Bass Face","Antique Bell","Whiny Opener","Synctink","Trembling Organ","Sci-Fi Echo","Unicorn Dreams","Cocktail Hour","Nice n Smooth","Tumescent Bass","Internalized","Blinker Bells","Pickle Pincher","Underwater Trill","Fairy Dust","The Hats","Congo Bongo","Surdo Taiko","Punchy Bells","Mindfull","Poly McFat","Tangerine Chrch Thm","Reed EP","Cars Strings","Pipe Organisation","Fat Poly Bass","Choral Voices","Small Gong","Another Ocean","Pedaling Sweep","Hum-Along Solo","Fat Bass Stack","Afterblow Horn","Midnight PWM","Hyper Poly","Ripples","Aggro Synth","No Parking Swell","Radio Towers","Harpsi-Vibe","Instability Pad","Vintage Wurly","Phazy Synth","Robot Hamsters","Pressure Points","80s Horror Strings","Nursery Comp","House Mover","Carillons","Vocal Pad","Soft Moving Brass","Squarecliff","J3 808","Cats Meow","Morse Code Lead","Dog","Under The Ice","Distant Future","Marimba","Duotone","Pulse Pluck","Unisawyer","Recorder","Hoof Gelatin","Ghostly Glow","Uptight Bass","Ravecave","Dirty Lead","Celtic Moon","Hollow Dreams","Furry Tines","Mouse Blaster","Kyoto","Pink Neon Brass","Organ Perc","Skreamer Solo","Dream of Orgonon","Bistro","Impact Bass","Pluck Hollow","Velo Res Lead 2","Soft Brass","Regal Movement","Loose Squares","High Strings","Harpsicrud","Rubber Bumper","Galvanized Bucket","Soft Swell","Reverberant Strings","Lagoon Bass","Pluckity Duck","Bell Tree","Riser Chord","Timpanally","Rod Strike","Tuned Percussion","Mystery Bell","FM Clarinet","Funky Rev1 Bells","Sitarama","FedBack","Nylon Fingers","Gamelan","Sparkle Ponies","Marrakesh Radio C","Faint Memories","Full Hexagon","Old String Machine","Mantel Clock","Iconic Brass","Sync Swellpad","Pretty Pluck","House Vibez","Feature My Bass","Chorus Layer","Better Ways","Night Caller","Bassment","After the Denouement","Rewind","Syncwave","Organizer","Maneater Ping","Leslied","Bull By The Horns","Naive Melody","Poly Morgue","Busted and Dusted","Switchback","Tight Bass","Pluckyness","80s Sci Fi Drop","Catfood","Houndstooth","Cyberian Winds","Ominous Bellfall","FM Pluck","Metal Dronespace","End Credits","Brass","Low Strings","Muted Clavinet","Percussive Electric Piano","Flutes","Harpsichord","Sync I","Percussive Organ","Unison Glide With Resonance","Harmonium","Organ With Resonance","Toy Piano","Trumpet/Flute","Filter Mod","Reed Organ","Brass In Fifths","Pipe Organ Flutes","Sync II","Electric Piano","High Strings","Octave Sawteeth","Release-Repeat","Delayed Harmonic","Echo-Repeat","Pulse-Width Mod","Slow Sync Sweep","Fourths With Resonance","Sweeping Harmonics","Slow Sync","Random Arpeggiator","Sawtooth Arpeggiator","Clangorous Bells","Alien","Noise Sweep","Descending Bells","Descending Pulse Wave Mod","Helicopter","Resonance Bells","Hollow Sound","Cat"];
const descriptors = ['BRIGHT', 'DARK', 'WARM', 'HOLLOW', 'WIDE', 'SOFT', 'HARD', 'DEEP', 'AIRY', 'RAW'];
const FACTORY_PROGRAMS = Array.from({ length: 200 }, (_, i) => {
  const name = names[i] || `${descriptors[i % descriptors.length]} SEQUENCE ${String(i + 1).padStart(3, '0')}`;
  const n = i % 10;
  return patch(i, name, {
    cutoff: 900 + ((i * 733) % 7600), resonance: (i % 7) / 14,
    filterEnvAmount: 900 + ((i * 421) % 6200), lfoRate: 1 + (i % 12) * 0.7,
    lfoAmount: (i % 5) * 0.08, oscAOctave: [16, 8, 8, 4][i % 4],
    oscBOctave: [8, 8, 4, 16][(i + 1) % 4], oscBFine: (n - 5) * 2,
    oscAWave: i % 3 === 0 ? 'pulse' : 'saw', oscBWave: i % 4 === 0 ? 'triangle' : (i % 3 === 0 ? 'pulse' : 'saw'),
    stack: i % 37 === 0, unison: i % 29 === 0, split: i % 53 === 0,
  });
});
export const PROPHET10_PRESETS = FACTORY_PROGRAMS;
export const PROPHET10_FACTORY = FACTORY_PROGRAMS;
export const createProphet10UserPrograms = () => FACTORY_PROGRAMS.map((program, i) => ({ ...clone(program), id: i, bank: 'user' }));
export const cloneProphet10Program = (program) => clone(program);
