const spread = (width = .06, drift = .01, level = .84, cutoff = .55, resonance = .16) =>
  Array.from({ length: 8 }, (_, i) => ({
    level: Math.max(.25, Math.min(1, level + Math.sin(i * 1.7) * .07)),
    pan: (i - 3.5) / 5,
    tune: Math.sin(i * 1.31) * drift,
    cutoff: Math.max(.08, Math.min(.95, cutoff + Math.sin(i * 1.13) * width)),
    resonance,
    osc1: Math.max(.1, Math.min(1, .76 + Math.sin(i * .9) * .08)),
    osc2: Math.max(.1, Math.min(1, .7 + Math.cos(i * 1.2) * .09)),
  }));

export const OBERHEIM_EIGHT_VOICE_PRESETS = [
  { name: 'SEM Brass', data: { cutoff: .52, resonance: .16, filterEnv: .72, filterMode: 'low', osc1: .8, osc2: .68, tune: .08, pulse: .5, wave1: 'saw', wave2: 'pulse', attack: .06, decay: .32, sustain: .55, release: .18, master: .7, lfoRate: .18, lfoAmount: .04, lfoTarget: 'pitch', bendRange: 2, voices: spread(.045, .012, .9, .54, .17) } },
  { name: 'Eight Voice Pad', data: { cutoff: .42, resonance: .1, filterEnv: .42, filterMode: 'low', osc1: .72, osc2: .7, tune: .03, pulse: .5, wave1: 'saw', wave2: 'pulse', attack: .55, decay: .7, sustain: .82, release: .78, master: .64, lfoRate: .12, lfoAmount: .1, lfoTarget: 'pitch', bendRange: 2, voices: spread(.11, .028, .8, .43, .11) } },
  { name: 'State Variable Sweep', data: { cutoff: .68, resonance: .38, filterEnv: .9, filterMode: 'band', osc1: .66, osc2: .75, tune: .11, pulse: .42, wave1: 'pulse', wave2: 'saw', attack: .01, decay: .2, sustain: .28, release: .24, master: .68, lfoRate: .3, lfoAmount: .2, lfoTarget: 'filter', bendRange: 5, voices: spread(.16, .035, .78, .68, .35) } },
  { name: 'Unison SEM', data: { cutoff: .48, resonance: .24, filterEnv: .5, filterMode: 'notch', osc1: .86, osc2: .86, tune: .015, pulse: .5, wave1: 'saw', wave2: 'saw', attack: .02, decay: .28, sustain: .64, release: .32, master: .7, lfoRate: .2, lfoAmount: .06, lfoTarget: 'pitch', bendRange: 2, voices: spread(.035, .018, .95, .5, .25) } },
  { name: 'Brass Ensemble', data: { cutoff: .61, resonance: .12, filterEnv: .8, filterMode: 'low', osc1: .88, osc2: .74, tune: .1, pulse: .38, wave1: 'saw', wave2: 'pulse', attack: .035, decay: .3, sustain: .62, release: .22, master: .68, lfoRate: .17, lfoAmount: .025, lfoTarget: 'pitch', bendRange: 2, voices: spread(.08, .016, .88, .62, .13) } },
  { name: 'Glass Ensemble', data: { cutoff: .73, resonance: .2, filterEnv: .22, filterMode: 'high', osc1: .55, osc2: .72, tune: .02, pulse: .62, wave1: 'pulse', wave2: 'pulse', attack: .12, decay: .42, sustain: .4, release: .48, master: .66, lfoRate: .23, lfoAmount: .055, lfoTarget: 'pitch', bendRange: 3, voices: spread(.12, .022, .74, .74, .19) } },
  { name: 'Soft Strings', data: { cutoff: .38, resonance: .08, filterEnv: .3, filterMode: 'low', osc1: .68, osc2: .8, tune: .06, pulse: .48, wave1: 'saw', wave2: 'saw', attack: .38, decay: .56, sustain: .78, release: .85, master: .62, lfoRate: .1, lfoAmount: .08, lfoTarget: 'pitch', bendRange: 2, voices: spread(.15, .03, .82, .4, .08) } },
  { name: 'Percussive SEM', data: { cutoff: .82, resonance: .3, filterEnv: .95, filterMode: 'low', osc1: .9, osc2: .62, tune: .17, pulse: .35, wave1: 'pulse', wave2: 'saw', attack: .005, decay: .18, sustain: .08, release: .12, master: .72, lfoRate: .34, lfoAmount: .12, lfoTarget: 'filter', bendRange: 2, voices: spread(.05, .012, .92, .82, .3) } },
];
