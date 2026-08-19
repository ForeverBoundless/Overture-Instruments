/**
 * presets.js
 *
 * The 100 factory preset slots, named exactly as supplied by the user
 * (the real Little Phatty Stage II factory bank names). Each preset carries
 * a full parameter set so every slot is audibly and functionally distinct -
 * no placeholder/duplicate patches.
 *
 * Parameter ranges:
 *   osc1Shape/osc2Shape   0..1   (triangle -> saw -> square -> pulse)
 *   osc1Level/osc2Level   0..1
 *   osc2Detune            cents, signed
 *   osc2Ratio             frequency multiplier (1 = unison, 2 = octave up, 0.5 = octave down, etc.)
 *   noiseLevel            0..1
 *   cutoff                Hz
 *   resonance             0..1
 *   drive                 0..1
 *   keyTrack              0..1
 *   filterEnvAmount       Hz swing
 *   ampEnv/filterEnv      {attack, decay, sustain, release} in seconds, sustain 0..1
 *   lfoRate               Hz
 *   lfoWaveform            'triangle'|'square'|'sine'|'saw'|'reverseSaw'|'sh'
 *   lfoToPitch/Filter/PW/Mix/Amp   0..1 (base amount before mod-wheel scaling)
 *   glideTime              seconds
 */

function preset(id, name, params) {
  return { id, name, ...params };
}

const base = {
  osc1Shape: 0.28, osc2Shape: 0.28, osc1Level: 0.8, osc2Level: 0.6, osc2Detune: 6, osc2Ratio: 1,
  noiseLevel: 0, cutoff: 4000, resonance: 0.15, drive: 0.1, keyTrack: 0.5, filterEnvAmount: 3000,
  ampEnv: { attack: 0.004, decay: 0.25, sustain: 0.75, release: 0.3 },
  filterEnv: { attack: 0.004, decay: 0.4, sustain: 0.3, release: 0.4 },
  lfoRate: 4, lfoWaveform: 'triangle', lfoToPitch: 0, lfoToFilter: 0, lfoToPW: 0, lfoToMix: 0, lfoToAmp: 0,
  glideTime: 0.15,
};

function p(overrides) {
  return { ...base, ...overrides };
}

export const PRESETS = [
  preset(0, 'THANK YOU BOB', p({ osc1Shape: 0.3, osc2Shape: 0.35, osc2Detune: 8, cutoff: 2600, resonance: 0.25, filterEnvAmount: 3400, ampEnv: { attack: 0.01, decay: 0.6, sustain: 0.65, release: 1.4 }, filterEnv: { attack: 0.01, decay: 0.8, sustain: 0.35, release: 1.2 }, lfoRate: 3.2, lfoToFilter: 0.12 })),
  preset(1, 'NAS T FUN KAY', p({ osc1Shape: 0.62, osc2Shape: 0.66, osc2Detune: 11, osc2Ratio: 1, cutoff: 3200, resonance: 0.45, drive: 0.3, filterEnvAmount: 4200, ampEnv: { attack: 0.001, decay: 0.15, sustain: 0.4, release: 0.12 }, filterEnv: { attack: 0.001, decay: 0.18, sustain: 0.1, release: 0.15 }, glideTime: 0.03 })),
  preset(2, 'SNAPPY LEAD', p({ osc1Shape: 0.34, osc2Shape: 0.34, osc2Detune: 9, cutoff: 5200, resonance: 0.3, filterEnvAmount: 2200, ampEnv: { attack: 0.002, decay: 0.1, sustain: 0.85, release: 0.15 }, filterEnv: { attack: 0.001, decay: 0.12, sustain: 0.5, release: 0.15 }, glideTime: 0.08 })),
  preset(3, 'MODBUBBLER', p({ osc1Shape: 0.7, osc2Shape: 0.72, osc2Detune: 4, cutoff: 1800, resonance: 0.55, filterEnvAmount: 1500, lfoRate: 5.5, lfoWaveform: 'sine', lfoToFilter: 0.55, lfoToPW: 0.3, ampEnv: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.5 } })),
  preset(4, 'MOD TALK BASS', p({ osc1Shape: 0.15, osc2Shape: 0.68, osc2Ratio: 0.5, osc2Detune: 0, cutoff: 900, resonance: 0.4, filterEnvAmount: 1800, lfoRate: 3.8, lfoWaveform: 'square', lfoToFilter: 0.4, ampEnv: { attack: 0.002, decay: 0.4, sustain: 0.5, release: 0.2 }, glideTime: 0.05 })),
  preset(5, 'MOD SYNCER', p({ osc1Shape: 0.4, osc2Shape: 0.4, osc2Ratio: 2.01, osc2Detune: 0, cutoff: 3600, resonance: 0.35, lfoRate: 6.2, lfoWaveform: 'saw', lfoToFilter: 0.3, lfoToPitch: 0.15, filterEnvAmount: 2600 })),
  preset(6, 'PLUMNET NH', p({ osc1Shape: 0.2, osc2Shape: 0.22, osc2Detune: 5, cutoff: 1600, resonance: 0.2, filterEnvAmount: 2000, ampEnv: { attack: 0.02, decay: 1.2, sustain: 0.4, release: 1.8 }, filterEnv: { attack: 0.05, decay: 1.5, sustain: 0.2, release: 1.6 } })),
  preset(7, 'MW KOTOISH KL', p({ osc1Shape: 0.85, osc2Shape: 0.15, osc2Ratio: 2, osc2Detune: 3, cutoff: 4800, resonance: 0.15, ampEnv: { attack: 0.001, decay: 0.35, sustain: 0.1, release: 0.4 }, filterEnv: { attack: 0.001, decay: 0.3, sustain: 0.05, release: 0.3 }, lfoRate: 4.5, lfoToPitch: 0.08 })),
  preset(8, 'SUB BASS', p({ osc1Shape: 0.02, osc2Shape: 0.02, osc2Ratio: 0.5, osc2Detune: 0, osc1Level: 0.9, osc2Level: 0.85, cutoff: 700, resonance: 0.1, keyTrack: 0.7, filterEnvAmount: 900, ampEnv: { attack: 0.001, decay: 0.2, sustain: 0.9, release: 0.15 }, glideTime: 0.04 })),
  preset(9, 'HI MOD WOBBLE', p({ osc1Shape: 0.5, osc2Shape: 0.5, osc2Detune: 14, cutoff: 2200, resonance: 0.6, filterEnvAmount: 1200, lfoRate: 5.8, lfoWaveform: 'sine', lfoToFilter: 0.7 })),
  preset(10, 'ZAP GUN', p({ osc1Shape: 1, osc2Shape: 0.9, osc2Ratio: 1.5, cutoff: 8000, resonance: 0.5, filterEnvAmount: 7000, ampEnv: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 }, filterEnv: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, glideTime: 0 })),
  preset(11, 'WILKINS NH', p({ osc1Shape: 0.32, osc2Shape: 0.3, osc2Detune: 7, cutoff: 3000, resonance: 0.25, ampEnv: { attack: 0.008, decay: 0.5, sustain: 0.7, release: 0.7 } })),
  preset(12, 'C HENDRE NH', p({ osc1Shape: 0.6, osc2Shape: 0.55, osc2Detune: 10, cutoff: 3400, resonance: 0.4, drive: 0.25, filterEnvAmount: 3000, ampEnv: { attack: 0.005, decay: 0.4, sustain: 0.6, release: 0.5 } })),
  preset(13, 'VERY MINI NH', p({ osc1Shape: 0.33, osc2Shape: 0.33, osc2Detune: 6, cutoff: 4500, resonance: 0.3, drive: 0.15, filterEnvAmount: 2500, ampEnv: { attack: 0.003, decay: 0.3, sustain: 0.7, release: 0.25 } })),
  preset(14, 'OVERLOADER', p({ osc1Shape: 0.5, osc2Shape: 0.5, osc2Detune: 12, cutoff: 2600, resonance: 0.35, drive: 0.75, filterEnvAmount: 3500, ampEnv: { attack: 0.002, decay: 0.35, sustain: 0.6, release: 0.3 } })),
  preset(15, 'MW METAL KL', p({ osc1Shape: 0.9, osc2Shape: 0.88, osc2Detune: 2, osc2Ratio: 1.01, cutoff: 3800, resonance: 0.5, drive: 0.4, lfoRate: 7, lfoWaveform: 'sh', lfoToFilter: 0.6, lfoToPitch: 0.1, ampEnv: { attack: 0.001, decay: 0.2, sustain: 0.4, release: 0.2 } })),
  preset(16, 'ULTRALINE NH', p({ osc1Shape: 0.28, osc2Shape: 0.3, osc2Detune: 3, cutoff: 5000, resonance: 0.2, ampEnv: { attack: 0.001, decay: 0.05, sustain: 0.95, release: 0.1 }, glideTime: 0.02 })),
  preset(17, 'DR BASS NH', p({ osc1Shape: 0.1, osc2Shape: 0.5, osc2Ratio: 1, osc2Detune: 0, cutoff: 1100, resonance: 0.3, keyTrack: 0.6, filterEnvAmount: 1600, ampEnv: { attack: 0.001, decay: 0.3, sustain: 0.4, release: 0.15 } })),
  preset(18, 'BRASSISH LEAD', p({ osc1Shape: 0.62, osc2Shape: 0.6, osc2Detune: 9, cutoff: 3600, resonance: 0.3, filterEnvAmount: 2800, ampEnv: { attack: 0.06, decay: 0.3, sustain: 0.8, release: 0.3 }, filterEnv: { attack: 0.08, decay: 0.35, sustain: 0.4, release: 0.3 } })),
  preset(19, 'DONE MINI NH', p({ osc1Shape: 0.34, osc2Shape: 0.36, osc2Detune: 7, cutoff: 4000, resonance: 0.28, ampEnv: { attack: 0.004, decay: 0.28, sustain: 0.72, release: 0.28 } })),
  preset(20, 'ORG LEAD', p({ osc1Shape: 0.66, osc2Shape: 0.64, osc2Ratio: 2, osc2Detune: 0, cutoff: 5500, resonance: 0.15, ampEnv: { attack: 0.001, decay: 0.02, sustain: 1, release: 0.05 }, filterEnv: { attack: 0.001, decay: 0.02, sustain: 1, release: 0.05 } })),
  preset(21, 'PHATTYSIGN NH', p({ osc1Shape: 0.4, osc2Shape: 0.42, osc2Detune: 10, cutoff: 2400, resonance: 0.45, drive: 0.35, filterEnvAmount: 3200, ampEnv: { attack: 0.005, decay: 0.45, sustain: 0.55, release: 0.6 } })),
  preset(22, 'OLAFS SEQ NH', p({ osc1Shape: 0.55, osc2Shape: 0.2, osc2Ratio: 2, cutoff: 3000, resonance: 0.4, lfoRate: 8, lfoWaveform: 'square', lfoToFilter: 0.3, glideTime: 0.02, ampEnv: { attack: 0.001, decay: 0.12, sustain: 0.3, release: 0.08 } })),
  preset(23, '4THPOLE NH', p({ osc1Shape: 0.3, osc2Shape: 0.28, osc2Ratio: 1.5, osc2Detune: 0, cutoff: 3200, resonance: 0.3, filterEnvAmount: 2600 })),
  preset(24, 'BIG UN', p({ osc1Shape: 0.34, osc2Shape: 0.38, osc2Detune: 13, osc1Level: 0.9, osc2Level: 0.85, noiseLevel: 0.05, cutoff: 2200, resonance: 0.3, drive: 0.3, filterEnvAmount: 3600, ampEnv: { attack: 0.01, decay: 0.6, sustain: 0.7, release: 0.9 } })),
  preset(25, 'BONGO FURY KL', p({ osc1Shape: 0.75, osc2Shape: 0.1, osc2Ratio: 3, noiseLevel: 0.2, cutoff: 2600, resonance: 0.35, ampEnv: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 }, filterEnv: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 } })),
  preset(26, 'MY LITTLE NH', p({ osc1Shape: 0.36, osc2Shape: 0.34, osc2Detune: 8, cutoff: 3400, resonance: 0.25 })),
  preset(27, 'ACID GRIND', p({ osc1Shape: 1, osc2Shape: 0, osc2Level: 0, cutoff: 1400, resonance: 0.82, drive: 0.5, filterEnvAmount: 4200, lfoRate: 0.3, lfoWaveform: 'sine', lfoToFilter: 0.2, ampEnv: { attack: 0.001, decay: 0.3, sustain: 0.6, release: 0.1 }, filterEnv: { attack: 0.001, decay: 0.35, sustain: 0.15, release: 0.15 }, glideTime: 0.06 })),
  preset(28, 'BACK2ROOT NH', p({ osc1Shape: 0.25, osc2Shape: 0.5, osc2Ratio: 0.5, cutoff: 1200, resonance: 0.2, keyTrack: 0.6 })),
  preset(29, 'HARP ARP', p({ osc1Shape: 0.15, osc2Shape: 0.6, osc2Ratio: 2, cutoff: 5200, resonance: 0.2, ampEnv: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.3 }, filterEnv: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.3 } })),
  preset(30, 'MW BADTOYS KL', p({ osc1Shape: 0.95, osc2Shape: 0.9, osc2Detune: 18, cutoff: 3000, resonance: 0.5, drive: 0.5, lfoRate: 9, lfoWaveform: 'sh', lfoToFilter: 0.5, lfoToPitch: 0.15 })),
  preset(31, 'BRITESYNCBASS', p({ osc1Shape: 0.3, osc2Shape: 0.85, osc2Ratio: 2, cutoff: 2000, resonance: 0.4, keyTrack: 0.65, filterEnvAmount: 2400 })),
  preset(32, 'FARAK NH', p({ osc1Shape: 0.44, osc2Shape: 0.4, osc2Detune: 9, cutoff: 3000, resonance: 0.3 })),
  preset(33, 'TOCATTA NH', p({ osc1Shape: 0.3, osc2Shape: 0.3, osc2Detune: 5, cutoff: 4200, resonance: 0.15, ampEnv: { attack: 0.001, decay: 0.05, sustain: 0.9, release: 0.05 }, glideTime: 0 })),
  preset(34, 'FM BLOCK NH', p({ osc1Shape: 0.5, osc2Shape: 0.95, osc2Ratio: 3.98, osc2Level: 0.3, cutoff: 4600, resonance: 0.25, filterEnvAmount: 2000 })),
  preset(35, 'IMAGES NH', p({ osc1Shape: 0.2, osc2Shape: 0.25, osc2Detune: 6, cutoff: 2200, resonance: 0.2, ampEnv: { attack: 0.4, decay: 0.6, sustain: 0.6, release: 1.5 }, filterEnv: { attack: 0.5, decay: 0.8, sustain: 0.3, release: 1.4 }, lfoRate: 0.6, lfoWaveform: 'sine', lfoToFilter: 0.25 })),
  preset(36, 'DELAY OUT NH', p({ osc1Shape: 0.3, osc2Shape: 0.35, osc2Detune: 8, cutoff: 3200, resonance: 0.25, ampEnv: { attack: 0.005, decay: 0.5, sustain: 0.5, release: 1.1 } })),
  preset(37, 'CLUSTERCRUNCH', p({ osc1Shape: 0.5, osc2Shape: 0.52, osc2Detune: 25, cutoff: 2400, resonance: 0.55, drive: 0.5, filterEnvAmount: 3200 })),
  preset(38, 'NO LIMITS NH', p({ osc1Shape: 0.4, osc2Shape: 0.45, osc2Detune: 11, cutoff: 6000, resonance: 0.3, drive: 0.2 })),
  preset(39, 'OH WA', p({ osc1Shape: 0.2, osc2Shape: 0.22, osc2Detune: 4, cutoff: 1800, resonance: 0.15, ampEnv: { attack: 0.15, decay: 0.4, sustain: 0.7, release: 0.9 } })),
  preset(40, 'THUG KICK KL', p({ osc1Shape: 0.02, osc2Shape: 0.02, osc2Level: 0, cutoff: 400, resonance: 0.1, filterEnvAmount: 3600, filterEnv: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.15 }, ampEnv: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 }, keyTrack: 0 })),
  preset(41, 'BRUVAMOOG NH', p({ osc1Shape: 0.3, osc2Shape: 0.32, osc2Detune: 9, cutoff: 2600, resonance: 0.35, drive: 0.3, filterEnvAmount: 3000 })),
  preset(42, 'WIRE CUTTER', p({ osc1Shape: 1, osc2Shape: 1, osc2Detune: 30, cutoff: 4200, resonance: 0.6, drive: 0.6, filterEnvAmount: 3800 })),
  preset(43, 'SWEET TEA', p({ osc1Shape: 0.15, osc2Shape: 0.18, osc2Detune: 3, cutoff: 2400, resonance: 0.1, ampEnv: { attack: 0.1, decay: 0.5, sustain: 0.75, release: 0.8 } })),
  preset(44, 'HONYHUNY NH', p({ osc1Shape: 0.35, osc2Shape: 0.34, osc2Detune: 7, cutoff: 3000, resonance: 0.25 })),
  preset(45, 'DEEP BASS', p({ osc1Shape: 0.05, osc2Shape: 0.05, osc2Ratio: 0.5, cutoff: 600, resonance: 0.15, keyTrack: 0.5, ampEnv: { attack: 0.001, decay: 0.3, sustain: 0.85, release: 0.15 } })),
  preset(46, 'LOW DOWN NH', p({ osc1Shape: 0.08, osc2Shape: 0.4, osc2Ratio: 1, osc2Detune: 0, cutoff: 850, resonance: 0.25, keyTrack: 0.55 })),
  preset(47, 'PEOWPHATTY NH', p({ osc1Shape: 0.9, osc2Shape: 0.85, osc2Detune: 15, cutoff: 7000, resonance: 0.4, filterEnvAmount: 6500, ampEnv: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.2 }, filterEnv: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.2 } })),
  preset(48, 'MOD GRONK', p({ osc1Shape: 0.6, osc2Shape: 0.62, osc2Detune: 10, cutoff: 1600, resonance: 0.5, drive: 0.4, lfoRate: 2.2, lfoWaveform: 'square', lfoToFilter: 0.45 })),
  preset(49, 'BASSOONER NH', p({ osc1Shape: 0.22, osc2Shape: 0.24, osc2Detune: 5, cutoff: 1900, resonance: 0.2, keyTrack: 0.4, ampEnv: { attack: 0.03, decay: 0.4, sustain: 0.7, release: 0.4 } })),
  preset(50, 'MOD PERCUSS', p({ osc1Shape: 0.6, osc2Shape: 0.1, osc2Ratio: 2, noiseLevel: 0.1, cutoff: 3400, resonance: 0.3, ampEnv: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.08 }, filterEnv: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 } })),
  preset(51, '1 POLE NH', p({ osc1Shape: 0.3, osc2Shape: 0, osc2Level: 0, cutoff: 3600, resonance: 0.1 })),
  preset(52, 'MAGIC SQUARE', p({ osc1Shape: 0.66, osc2Shape: 0.68, osc2Ratio: 2, cutoff: 3200, resonance: 0.3, filterEnvAmount: 2400 })),
  preset(53, 'MOD BENDER', p({ osc1Shape: 0.4, osc2Shape: 0.42, osc2Detune: 9, cutoff: 2600, resonance: 0.35, lfoRate: 3.6, lfoWaveform: 'sine', lfoToPitch: 0.25 })),
  preset(54, 'BELLISH', p({ osc1Shape: 0.55, osc2Shape: 0.9, osc2Ratio: 3.5, osc2Level: 0.35, cutoff: 5200, resonance: 0.1, ampEnv: { attack: 0.001, decay: 1.2, sustain: 0.1, release: 1.5 }, filterEnv: { attack: 0.001, decay: 1, sustain: 0, release: 1.3 } })),
  preset(55, 'EVER DEEPA NH', p({ osc1Shape: 0.18, osc2Shape: 0.2, osc2Detune: 4, cutoff: 1400, resonance: 0.2, ampEnv: { attack: 0.3, decay: 0.7, sustain: 0.6, release: 1.8 } })),
  preset(56, 'DIRTY SQUARE', p({ osc1Shape: 0.66, osc2Shape: 0.66, osc2Detune: 8, cutoff: 2000, resonance: 0.4, drive: 0.55, filterEnvAmount: 2800 })),
  preset(57, 'YUP NH', p({ osc1Shape: 0.3, osc2Shape: 0.32, osc2Detune: 6, cutoff: 3400, resonance: 0.25 })),
  preset(58, 'THAT BASS KL', p({ osc1Shape: 0.12, osc2Shape: 0.55, osc2Ratio: 1, osc2Detune: 0, cutoff: 950, resonance: 0.35, keyTrack: 0.6, filterEnvAmount: 1400 })),
  preset(59, 'SWEEPING 5THS', p({ osc1Shape: 0.4, osc2Shape: 0.42, osc2Ratio: 1.5, osc2Detune: 0, cutoff: 2200, resonance: 0.3, lfoRate: 0.4, lfoWaveform: 'triangle', lfoToFilter: 0.6, filterEnvAmount: 2600 })),
  preset(60, 'DUWAH NH', p({ osc1Shape: 0.35, osc2Shape: 0.4, osc2Detune: 9, cutoff: 1800, resonance: 0.3, filterEnvAmount: 3400, filterEnv: { attack: 0.02, decay: 0.5, sustain: 0.2, release: 0.5 } })),
  preset(61, 'RHOOBARB NH', p({ osc1Shape: 0.5, osc2Shape: 0.48, osc2Detune: 12, cutoff: 2600, resonance: 0.4, drive: 0.2 })),
  preset(62, 'FLOWBEE JR KL', p({ osc1Shape: 0.85, osc2Shape: 0.15, osc2Ratio: 2, noiseLevel: 0.15, cutoff: 3600, resonance: 0.3, ampEnv: { attack: 0.001, decay: 0.2, sustain: 0.1, release: 0.15 } })),
  preset(63, 'PLUCK LEAD KL', p({ osc1Shape: 0.4, osc2Shape: 0.38, osc2Detune: 7, cutoff: 4000, resonance: 0.3, ampEnv: { attack: 0.001, decay: 0.3, sustain: 0.2, release: 0.2 }, filterEnv: { attack: 0.001, decay: 0.25, sustain: 0.1, release: 0.2 }, filterEnvAmount: 2800 })),
  preset(64, 'FM BASS NH', p({ osc1Shape: 0.1, osc2Shape: 0.95, osc2Ratio: 2.98, osc2Level: 0.25, cutoff: 1200, resonance: 0.2, keyTrack: 0.5 })),
  preset(65, 'WITCHSEQ NH', p({ osc1Shape: 0.6, osc2Shape: 0.3, osc2Ratio: 2, cutoff: 3000, resonance: 0.5, lfoRate: 6.5, lfoWaveform: 'sh', lfoToFilter: 0.4, glideTime: 0.03 })),
  preset(66, 'FFYRLIN NH', p({ osc1Shape: 0.33, osc2Shape: 0.35, osc2Detune: 8, cutoff: 3200, resonance: 0.25 })),
  preset(67, 'STEP BASS1 KL', p({ osc1Shape: 0.15, osc2Shape: 0.5, osc2Ratio: 1, osc2Detune: 0, cutoff: 1000, resonance: 0.3, keyTrack: 0.6, glideTime: 0 })),
  preset(68, 'JUST ONE NH', p({ osc1Shape: 0.3, osc2Shape: 0, osc2Level: 0, cutoff: 3400, resonance: 0.2 })),
  preset(69, 'MODD DETUNED', p({ osc1Shape: 0.4, osc2Shape: 0.42, osc2Detune: 22, cutoff: 2400, resonance: 0.3, lfoRate: 4.8, lfoWaveform: 'sine', lfoToPitch: 0.12 })),
  preset(70, 'MW VOICE KL', p({ osc1Shape: 0.7, osc2Shape: 0.65, osc2Detune: 6, cutoff: 2800, resonance: 0.4, lfoRate: 5.2, lfoWaveform: 'triangle', lfoToFilter: 0.35, lfoToAmp: 0.15 })),
  preset(71, 'WORMY GRIND', p({ osc1Shape: 0.8, osc2Shape: 0.82, osc2Detune: 16, cutoff: 1800, resonance: 0.5, drive: 0.45, filterEnvAmount: 3200 })),
  preset(72, 'KLEVATREVA NH', p({ osc1Shape: 0.45, osc2Shape: 0.44, osc2Detune: 9, cutoff: 3000, resonance: 0.3 })),
  preset(73, 'REZZY LEAD', p({ osc1Shape: 0.5, osc2Shape: 0.5, osc2Detune: 10, cutoff: 3800, resonance: 0.65, filterEnvAmount: 2200 })),
  preset(74, 'FFION BASS NH', p({ osc1Shape: 0.12, osc2Shape: 0.14, osc2Ratio: 0.5, cutoff: 800, resonance: 0.2, keyTrack: 0.55 })),
  preset(75, 'SYNC4SOLO NH', p({ osc1Shape: 0.5, osc2Shape: 0.85, osc2Ratio: 1.5, cutoff: 4400, resonance: 0.35, filterEnvAmount: 2600 })),
  preset(76, 'PLINK PLONK', p({ osc1Shape: 0.9, osc2Shape: 0.1, osc2Ratio: 4, osc2Level: 0.3, cutoff: 5000, resonance: 0.2, ampEnv: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 } })),
  preset(77, 'HAIRY BASS KL', p({ osc1Shape: 0.2, osc2Shape: 0.6, osc2Ratio: 1, osc2Detune: 0, cutoff: 1300, resonance: 0.45, drive: 0.35, keyTrack: 0.5 })),
  preset(78, 'METALRING', p({ osc1Shape: 0.95, osc2Shape: 0.92, osc2Ratio: 1.41, cutoff: 3600, resonance: 0.4, drive: 0.3 })),
  preset(79, 'SQUEAKYCUTTER', p({ osc1Shape: 0.7, osc2Shape: 0.68, osc2Detune: 20, cutoff: 6500, resonance: 0.55, filterEnvAmount: 3000 })),
  preset(80, 'HELP OAPS NH', p({ osc1Shape: 0.3, osc2Shape: 0.32, osc2Detune: 7, cutoff: 3000, resonance: 0.25 })),
  preset(81, 'BREAM NH', p({ osc1Shape: 0.18, osc2Shape: 0.2, osc2Detune: 4, cutoff: 2200, resonance: 0.2, ampEnv: { attack: 0.02, decay: 0.5, sustain: 0.65, release: 0.6 } })),
  preset(82, 'LUMATIC NH', p({ osc1Shape: 0.55, osc2Shape: 0.5, osc2Detune: 9, cutoff: 3200, resonance: 0.35 })),
  preset(83, 'SEQ MOD PWM', p({ osc1Shape: 0.72, osc2Shape: 0.75, osc2Detune: 5, cutoff: 3400, resonance: 0.35, lfoRate: 4.2, lfoWaveform: 'triangle', lfoToPW: 0.6 })),
  preset(84, 'PHATTYWAH NH', p({ osc1Shape: 0.4, osc2Shape: 0.42, osc2Detune: 8, cutoff: 1500, resonance: 0.4, lfoRate: 1.1, lfoWaveform: 'triangle', lfoToFilter: 0.55, filterEnvAmount: 2400 })),
  preset(85, 'FIFTH GRUNGE', p({ osc1Shape: 0.5, osc2Shape: 0.5, osc2Ratio: 1.5, osc2Detune: 0, cutoff: 2200, resonance: 0.45, drive: 0.4 })),
  preset(86, 'NERDY BASS KL', p({ osc1Shape: 0.1, osc2Shape: 0.3, osc2Ratio: 1, osc2Detune: 0, cutoff: 750, resonance: 0.25, keyTrack: 0.5 })),
  preset(87, 'OLOADBASSDRUM', p({ osc1Shape: 0.02, osc2Shape: 0.02, osc2Level: 0.4, cutoff: 350, resonance: 0.15, filterEnvAmount: 3200, filterEnv: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }, ampEnv: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 }, keyTrack: 0 })),
  preset(88, 'PHATNFUNKY NH', p({ osc1Shape: 0.35, osc2Shape: 0.55, osc2Ratio: 1, osc2Detune: 0, cutoff: 1900, resonance: 0.4, filterEnvAmount: 2400, filterEnv: { attack: 0.001, decay: 0.25, sustain: 0.2, release: 0.2 } })),
  preset(89, 'OVERLORD NH', p({ osc1Shape: 0.5, osc2Shape: 0.5, osc2Detune: 14, cutoff: 2400, resonance: 0.4, drive: 0.6, filterEnvAmount: 3600 })),
  preset(90, 'TEQUILA NH', p({ osc1Shape: 0.45, osc2Shape: 0.4, osc2Detune: 9, cutoff: 3000, resonance: 0.3, ampEnv: { attack: 0.005, decay: 0.35, sustain: 0.6, release: 0.4 } })),
  preset(91, 'MOD PWM BASS', p({ osc1Shape: 0.75, osc2Shape: 0.2, osc2Ratio: 1, osc2Detune: 0, cutoff: 1100, resonance: 0.3, lfoRate: 3, lfoWaveform: 'triangle', lfoToPW: 0.5, keyTrack: 0.5 })),
  preset(92, 'NICKYSLEAD NH', p({ osc1Shape: 0.5, osc2Shape: 0.48, osc2Detune: 8, cutoff: 4200, resonance: 0.4, filterEnvAmount: 2200 })),
  preset(93, 'GONG THING', p({ osc1Shape: 0.6, osc2Shape: 0.9, osc2Ratio: 2.76, osc2Level: 0.4, cutoff: 4800, resonance: 0.2, ampEnv: { attack: 0.001, decay: 2, sustain: 0, release: 2.5 }, filterEnv: { attack: 0.001, decay: 1.8, sustain: 0, release: 2 } })),
  preset(94, 'EGGHIMON NH', p({ osc1Shape: 0.3, osc2Shape: 0.32, osc2Detune: 6, cutoff: 3200, resonance: 0.25 })),
  preset(95, 'SIGN TEST NH', p({ osc1Shape: 0, osc2Shape: 0, osc2Level: 0, cutoff: 6000, resonance: 0.05, ampEnv: { attack: 0.001, decay: 0.05, sustain: 1, release: 0.05 }, glideTime: 0 })),
  preset(96, 'PIT SNIPER NH', p({ osc1Shape: 0.4, osc2Shape: 0.4, osc2Detune: 8, cutoff: 3400, resonance: 0.3, lfoRate: 6, lfoWaveform: 'sine', lfoToPitch: 0.3 })),
  preset(97, 'MOD PERCUSS2', p({ osc1Shape: 0.5, osc2Shape: 0.15, osc2Ratio: 2.5, noiseLevel: 0.15, cutoff: 3000, resonance: 0.35, ampEnv: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 } })),
  preset(98, 'TERAMINT 2 NH', p({ osc1Shape: 0.35, osc2Shape: 0.36, osc2Detune: 7, cutoff: 3200, resonance: 0.28 })),
  preset(99, 'VERYSLOWSWEEP', p({ osc1Shape: 0.4, osc2Shape: 0.42, osc2Detune: 9, cutoff: 1200, resonance: 0.4, lfoRate: 0.08, lfoWaveform: 'triangle', lfoToFilter: 0.75, filterEnvAmount: 2800, ampEnv: { attack: 0.5, decay: 1, sustain: 0.7, release: 2 } })),
];

export function getPreset(id) {
  return PRESETS[id] ?? PRESETS[0];
}
