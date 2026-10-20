/* MS-20 emulator: default parameters and patch-panel jack definitions (shared by UI and DSP). */
export const MS20_DEFAULT = {
  vco1Wave: 'saw', vco1Scale: 8, vco1Pw: 0.5, vco2Wave: 'sqr', vco2Scale: 8, vco2Pitch: 0, mix1: 0.8, mix2: 0.0, portamento: 0,
  vcoMgInt: 0, vcoEgInt: 0, hpCut: 0.05, hpPeak: 0, lpCut: 0.7, lpPeak: 0.2, hpMgInt: 0, hpEgInt: 0, lpMgInt: 0, lpEgInt: 0.4,
  mgWave: 0.5, mgFreq: 0.3, eg1Delay: 0, eg1Attack: 0.1, eg1Release: 0.3, eg2Hold: 0, eg2Attack: 0.02, eg2Decay: 0.3, eg2Sustain: 0.7, eg2Release: 0.3,
  espLevel: 0.5, espLow: 0.1, espHigh: 0.9, espThreshold: 0.3, espPitch: 0, bendRange: 2, volume: 0.7,
};
// Patch panel jacks. Sources produce a signal; inputs consume one.
export const MS20_JACKS = {
  sources: {
    KBD_CV: { label: 'KBD CV OUT', type: 'cv' }, KBD_TRIG: { label: 'KBD TRIG OUT', type: 'gate' }, MG_TRI: { label: 'MG TRI/SAW OUT', type: 'cv' },
    MG_RECT: { label: 'MG RECT OUT', type: 'gate' }, EG1_OUT: { label: 'EG1 OUT', type: 'cv' }, EG2_OUT: { label: 'EG2 OUT', type: 'cv' },
    EG2_REV: { label: 'EG2 REV OUT', type: 'cv' }, SH_OUT: { label: 'S&H OUT', type: 'cv' }, NOISE_WHITE: { label: 'WHITE NOISE', type: 'audio' },
    NOISE_PINK: { label: 'PINK NOISE', type: 'audio' }, VCO2_OUT: { label: 'VCO2 OUT', type: 'audio' }, ESP_SIGNAL: { label: 'ESP SIGNAL OUT', type: 'audio' },
    ESP_PITCH_CV: { label: 'ESP PITCH CV OUT', type: 'cv' },
    ESP_ENV: { label: 'ESP ENV OUT', type: 'cv' }, ESP_TRIG: { label: 'ESP TRIG OUT', type: 'gate' },
  },
  inputs: {
    TOTAL_IN: { label: 'TOTAL (PITCH)', accepts: ['cv', 'audio'] }, VCO2_CV_IN: { label: 'VCO2 CV IN', accepts: ['cv', 'audio'] }, FM_IN: { label: 'VCO FM (MG/T.EXT)', accepts: ['cv', 'audio', 'gate'] },
    HPF_CUT_IN: { label: 'HPF CUTOFF (EXT)', accepts: ['cv', 'audio', 'gate'] }, LPF_CUT_IN: { label: 'LPF CUTOFF (EXT)', accepts: ['cv', 'audio', 'gate'] },
    VCA_IN: { label: 'VCA INITIAL GAIN', accepts: ['cv', 'gate'] }, EG1_TRIG_IN: { label: 'EG1 TRIG IN', accepts: ['gate'] }, EG2_TRIG_IN: { label: 'EG2 TRIG IN', accepts: ['gate'] },
    SH_CLOCK_IN: { label: 'S&H CLOCK IN', accepts: ['gate'] }, SH_IN: { label: 'S&H SIGNAL IN', accepts: ['cv', 'audio'] }, EXT_SIGNAL_IN: { label: 'EXT SIGNAL IN (TO FILTER)', accepts: ['audio'] },
    MOD_VCA_IN: { label: 'MOD VCA (RING/AM)', accepts: ['cv', 'audio'] },
  },
};
