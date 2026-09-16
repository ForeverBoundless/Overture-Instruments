/*
 * Original Sub 37 Tribute factory-bank names, 1.01-9.06.  The hardware's
 * remaining locations were Init Preset, not invented factory sounds.  The
 * parameter recipes are intentionally generated from musical families (bass,
 * duo, sequence, sync, etc.) so each recall is usable while keeping the
 * actual patch-name/address layout faithful to the original bank.
 */
const names = [
  'Rhythmic 5th Filtration','DARK MINDS','Bomb Bass Tick','Duotronic Moogtrons','BRIGHT PWM MOTION','AHSEEEED MOOGER','Octavia','BAD ATMOS FEAR','Zaxxor’s Revenge','POLEMICS','RUNNER RUNNING','Werkers Unite','STRINGOTRON','Pulse Bass','Gamecom 8Bit Chiptime Fun','1974th',
  'CRAFT LABOR','DAILY GRIND','DUO ORG','Organ 2','CELESTIAL','EMO ALIENS','The Zaxxor Chronicles','2D SPACE','FAN+C B A S S','COLD NOISE','STRYNGTH','SOFT PRESS 4 SPARKLE','Orbital Momentum X85','DIRTY DRUM','The New Disco','L.A. Freeway Patrol',
  'Seeker of Truth','Lyrical Theremin','THE L TRAIN','PERCUSS DUB','DUO WAVE MOD','Analog Kick','KLARINETIK','CLIPPING A LOT','70s TV PI Theme','A LONG RIDE','Cave People Drum','Dirty Organ','BOOM BAH','SUNNY LEAD','CYBRASS','Eastern Alliance',
  'HERE HE COMES','RUNAWAY ROBOTS','MASS 19-','Echo Chirp','Gravity: Reversed','BEETLE ATTACK','TouchBass','HELICCOPPER','Underground Transit','OLDE SYNTHE','ODD ODE','Message From Outer Space','LITTLE GRIND','1970s SciFi Computer','funk bass','FEEDBACK BEAT PATTERN',
  'No Resonance Required','REZZO BASS','DI^tOR~ED BRA/S','ELEKTPOHNKA Telekom Net','Raw Z','LOW BASS','Trajectory Achieved','OLD LEAD','Organ Time','Sweep It try the weel','Industrial Machine','RIGID BASS','Main Engines Full Burn','5TH BOUNCE','SYNTH DRUM1','RISING SYNC',
  'BUZZINESS AS UNUSUAL','BROKE BASS','Carnival Freak','LONELY QUEST','The Triax Paradox','SYNC/SNARE','sub BASS','SPARKLESLIDE','THE INTRO TO THAT ONE','LITTLE LYRIC','ORGAN GRINDER','FRETTED BASS','NOISE IMPACT','SOFT LEAD WHEEL BRIGHT','Alien Language','SAWTEETH DUO DANCER',
  'SMOOTH LEAD MODWHEELSYNC','5TH IN LINE','Percolated','EuroSynth-Tastic','Dr. Press Growl','Duo Distort Artifacts','Hard Sync Hijinxx','BASS MELT FACE','Raymond’s Caught','SYNTH GONG1','RUBBER BANG','RUN!','B MOVIE','Percussophonic Blip','Gyro House','Trill Pickles',
  'Braid Walker','Acid Wiggler','Minor Bender','STG Liberatn Lead 2003','Dorian Electra','Distortech MW is Accent','Distortech 2 MW is Accent','Acid Tracks MW is Accent','Analogue Native Dance','Just Add Kick Drums','Rubber Glass','What Time Is','Funk Cowboys','Space Banjo MW is Rate','Mushrooms In A Corn Field','ACROSS THE SKY',
  'Up in the Sky','Tastes Metallic','TRIPLET 5THS','Interstellar Express','Intercranial Voyager','Sweet Lead',
];

const words = (name) => name.toLowerCase();
function recipe(name, index) {
  const n = words(name);
  const bass = /bass|bomb|kick|drum|low|boom/.test(n);
  const duo = /duo|zaxxor|mass|eastern|up in/.test(n);
  const dirty = /dirty|grind|clip|distort|melt|industrial|feedback/.test(n);
  const moving = /seq|run|rhythm|motion|wiggler|bounce|gyro|train|track|percol/.test(n);
  const soft = /dark|celestial|lonely|space|sky|long|atmos|truth/.test(n);
  const sync = /sync/.test(n);
  const noise = /noise|fear|alien|outer|beetle|cave/.test(n);
  return {
    osc1Shape: bass ? 0.62 : 0.37 + (index % 4) * 0.09,
    osc2Shape: bass ? 0.66 : 0.32 + ((index + 2) % 5) * 0.1,
    osc1Level: 0.82,
    osc2Level: duo ? 0.8 : 0.62,
    osc2Semitones: /5th|fifth/.test(n) ? 7 : duo ? (index % 3 === 0 ? 12 : 0) : (index % 5 === 0 ? 12 : 0),
    subLevel: bass ? 0.62 : 0.2,
    noiseLevel: noise ? 0.38 : 0.03,
    cutoff: bass ? 900 : soft ? 1800 : 3300 + (index % 4) * 520,
    resonance: moving ? 0.53 : bass ? 0.34 : 0.25,
    drive: dirty ? 0.68 : bass ? 0.24 : 0.12,
    keyTrack: bass ? 0.3 : 0.52,
    filterEnvAmount: bass ? 4800 : soft ? 1700 : 3000,
    filterEnv: { delay: 0, attack: soft ? 0.18 : 0.004, hold: 0, decay: bass ? 0.26 : 0.55, sustain: soft ? 0.45 : 0.24, release: soft ? 1.3 : 0.35 },
    ampEnv: { delay: 0, attack: soft ? 0.24 : 0.003, hold: 0, decay: bass ? 0.22 : 0.45, sustain: soft ? 0.66 : bass ? 0.64 : 0.54, release: soft ? 1.5 : 0.28 },
    lfo1Rate: moving ? 5.4 : 3.1,
    lfo1Wave: moving ? 'saw' : 'triangle',
    lfo2Rate: soft ? 0.16 : 0.43,
    mod1: { source: 'LFO 1', destination: moving ? 'FILTER' : 'PITCH', amount: moving ? 0.24 : 0.06 },
    mod2: { source: 'LFO 2', destination: soft ? 'FILTER' : 'WAVE', amount: soft ? 0.16 : 0.08 },
    duo,
    sync,
    sequence: moving,
  };
}

export const SUB37_PRESETS = Array.from({ length: 256 }, (_, index) => {
  const bank = Math.floor(index / 16) + 1;
  const slot = (index % 16) + 1;
  const name = names[index] ?? 'Init Preset';
  return { id: index, bank, slot, name, initialized: index >= names.length, ...recipe(name, index) };
});
