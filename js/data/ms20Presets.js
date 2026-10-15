/* Original demonstration patches for the Overture MS-20 emulator (not Korg factory data). */
const P = (name, params, cables = []) => ({ name, data: { params, cables } });
export const MS20_PRESETS = [
  P('Default Lead', { mix1: 0.8, mix2: 0.3, vco2Wave: 'sqr', lpCut: 0.6, lpPeak: 0.35, lpEgInt: 0.45, eg2Decay: 0.4, eg2Sustain: 0.6, vcoMgInt: 0.08, mgFreq: 0.5 }),
  P('Acid Bass', { vco1Wave: 'saw', vco1Scale: 16, mix1: 0.9, mix2: 0, lpCut: 0.25, lpPeak: 0.8, lpEgInt: 0.7, eg2Attack: 0, eg2Decay: 0.3, eg2Sustain: 0.1, eg2Release: 0.2, portamento: 0.15, hpCut: 0.02 }),
  P('Screaming Sweep', { vco1Wave: 'saw', vco2Wave: 'saw', mix1: 0.8, mix2: 0.7, vco2Pitch: 7, lpCut: 0.35, lpPeak: 0.9, hpPeak: 0.5, hpCut: 0.2, lpMgInt: 0.6, mgFreq: 0.2, eg2Sustain: 1 }),
  P('Ring Metal', { vco1Wave: 'pulse', vco1Pw: 0.3, vco2Wave: 'ring', vco2Pitch: 5.1, mix1: 0.2, mix2: 0.9, lpCut: 0.75, lpPeak: 0.3, lpEgInt: 0.3, eg2Decay: 0.5, eg2Sustain: 0.3 }),
  P('S&H Modular', { vco1Wave: 'saw', mix1: 0.8, lpCut: 0.45, lpPeak: 0.7, mgFreq: 0.55, eg2Sustain: 0.8 }, [{ from: 'SH_OUT', to: 'TOTAL_IN' }, { from: 'MG_RECT', to: 'EG1_TRIG_IN' }, { from: 'EG1_OUT', to: 'LPF_CUT_IN' }]),
  P('MG Tremolo Pad', { vco1Wave: 'tri', vco2Wave: 'saw', mix1: 0.7, mix2: 0.5, vco2Pitch: 0.1, lpCut: 0.55, lpPeak: 0.1, eg2Attack: 0.4, eg2Release: 0.6, mgFreq: 0.4, mgWave: 0.5 }, [{ from: 'MG_TRI', to: 'VCA_IN' }]),
  P('Noise Percussion', { vco1Wave: 'noise', mix1: 1, mix2: 0, hpCut: 0.4, hpPeak: 0.6, lpCut: 0.6, lpPeak: 0.7, lpEgInt: 0.8, eg2Attack: 0, eg2Decay: 0.12, eg2Sustain: 0, eg2Release: 0.1 }),
  P('Self-Oscillating Filter', { mix1: 0, mix2: 0, lpCut: 0.45, lpPeak: 1, lpEgInt: 0.35, eg2Decay: 0.5, eg2Sustain: 0.5, portamento: 0.2 }, [{ from: 'KBD_CV', to: 'LPF_CUT_IN' }]),
  P('ESP Processing', { mix1: 0, mix2: 0, lpCut: 0.7, lpPeak: 0.4, hpCut: 0.15, espLevel: 0.7, eg2Sustain: 1, eg2Attack: 0 }, [{ from: 'ESP_SIGNAL', to: 'EXT_SIGNAL_IN' }, { from: 'ESP_TRIG', to: 'EG2_TRIG_IN' }, { from: 'ESP_ENV', to: 'LPF_CUT_IN' }]),
  P('Init', { }),
];
