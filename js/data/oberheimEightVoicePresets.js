const spread = (width = .06, drift = .01, level = .84, cutoff = .55, resonance = .16, wave1 = 'saw', wave2 = 'saw') =>
  Array.from({ length: 8 }, (_, i) => {
    const osc1 = Math.max(.1, Math.min(1, .76 + Math.sin(i * .9) * .08));
    const osc2 = Math.max(.1, Math.min(1, .7 + Math.cos(i * 1.2) * .09));
    return {
      level: Math.max(.25, Math.min(1, level + Math.sin(i * 1.7) * .07)),
      pan: (i - 3.5) / 5,
      tune: Math.sin(i * 1.31) * drift,
      cutoff: Math.max(.08, Math.min(.95, cutoff + Math.sin(i * 1.13) * width)),
      resonance,
      osc1Saw: wave1 === 'saw' ? osc1 : 0,
      osc1Pulse: wave1 === 'pulse' ? osc1 : 0,
      osc2Saw: wave2 === 'saw' ? osc2 : 0,
      osc2Pulse: wave2 === 'pulse' ? osc2 : 0,
    };
  });

export const OBERHEIM_EIGHT_VOICE_PRESETS = [
  { name: 'Warm SEM Ensemble', data: { cutoff: .53, resonance: .06, filterEnv: .2, filterMode: 'low', osc1Saw: .8, osc1Pulse: 0, osc2Saw: .68, osc2Pulse: 0, tune: 0, pulse: .5, attack: .16, decay: .42, sustain: .72, release: .52, master: .64, lfoRate: .13, lfoAmount: 0, lfoTarget: 'pitch', bendRange: 2, voices: spread(.018, 0, .86, .53, .06, 'saw', 'saw') } },
  { name: 'Eight Voice Pad', data: { cutoff: .42, resonance: .1, filterEnv: .42, filterMode: 'low', osc1Saw: .72, osc1Pulse: 0, osc2Saw: 0, osc2Pulse: .7, tune: .03, pulse: .5, attack: .55, decay: .7, sustain: .82, release: .78, master: .64, lfoRate: .12, lfoAmount: .1, lfoTarget: 'pitch', bendRange: 2, voices: spread(.11, .028, .8, .43, .11, 'saw', 'pulse') } },
  { name: 'State Variable Sweep', data: { cutoff: .68, resonance: .38, filterEnv: .9, filterMode: 'band', osc1Saw: 0, osc1Pulse: .66, osc2Saw: .75, osc2Pulse: 0, tune: .11, pulse: .42, attack: .01, decay: .2, sustain: .28, release: .24, master: .68, lfoRate: .3, lfoAmount: .2, lfoTarget: 'filter', bendRange: 5, voices: spread(.16, .035, .78, .68, .35, 'pulse', 'saw') } },
  { name: 'Unison SEM', data: { cutoff: .48, resonance: .24, filterEnv: .5, filterMode: 'notch', osc1Saw: .86, osc1Pulse: 0, osc2Saw: .86, osc2Pulse: 0, tune: .015, pulse: .5, attack: .02, decay: .28, sustain: .64, release: .32, master: .7, lfoRate: .2, lfoAmount: .06, lfoTarget: 'pitch', bendRange: 2, voices: spread(.035, .018, .95, .5, .25, 'saw', 'saw') } },
  { name: 'Brass Ensemble', data: { cutoff: .61, resonance: .12, filterEnv: .8, filterMode: 'low', osc1Saw: .88, osc1Pulse: 0, osc2Saw: 0, osc2Pulse: .74, tune: .1, pulse: .38, attack: .035, decay: .3, sustain: .62, release: .22, master: .68, lfoRate: .17, lfoAmount: .025, lfoTarget: 'pitch', bendRange: 2, voices: spread(.08, .016, .88, .62, .13, 'saw', 'pulse') } },
  { name: 'Glass Ensemble', data: { cutoff: .73, resonance: .2, filterEnv: .22, filterMode: 'high', osc1Saw: 0, osc1Pulse: .55, osc2Saw: 0, osc2Pulse: .72, tune: .02, pulse: .62, attack: .12, decay: .42, sustain: .4, release: .48, master: .66, lfoRate: .23, lfoAmount: .055, lfoTarget: 'pitch', bendRange: 3, voices: spread(.12, .022, .74, .74, .19, 'pulse', 'pulse') } },
  { name: 'Soft Strings', data: { cutoff: .38, resonance: .08, filterEnv: .3, filterMode: 'low', osc1Saw: .68, osc1Pulse: 0, osc2Saw: .8, osc2Pulse: 0, tune: .06, pulse: .48, attack: .38, decay: .56, sustain: .78, release: .85, master: .62, lfoRate: .1, lfoAmount: .08, lfoTarget: 'pitch', bendRange: 2, voices: spread(.15, .03, .82, .4, .08, 'saw', 'saw') } },
  { name: 'Percussive SEM', data: { cutoff: .82, resonance: .3, filterEnv: .95, filterMode: 'low', osc1Saw: 0, osc1Pulse: .9, osc2Saw: .62, osc2Pulse: 0, tune: .17, pulse: .35, attack: .005, decay: .18, sustain: .08, release: .12, master: .72, lfoRate: .34, lfoAmount: .12, lfoTarget: 'filter', bendRange: 2, voices: spread(.05, .012, .92, .82, .3, 'pulse', 'saw') } },
];
