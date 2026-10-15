/* Original demonstration patches for the Overture Juno-106 emulator (not Roland factory data). */
const P = (name, data) => ({ name, data });
export const JUNO_PRESETS = [
  P('Chorus Strings', { saw: true, pulse: true, pwm: 0.55, pwmMode: 'lfo', lfoRate: 0.35, sub: 0.2, cutoff: 0.55, res: 0.05, envAmt: 0.25, attack: 0.45, decay: 0.5, sustain: 0.85, release: 0.6, chorus: 2, kbd: 0.6 }),
  P('Warm Pad', { saw: true, sub: 0.5, cutoff: 0.42, res: 0.15, envAmt: 0.3, attack: 0.6, decay: 0.6, sustain: 0.8, release: 0.7, chorus: 1, hpf: 0, kbd: 0.4 }),
  P('Punchy Brass', { saw: true, sub: 0.3, cutoff: 0.35, res: 0.2, envAmt: 0.65, attack: 0.12, decay: 0.45, sustain: 0.55, release: 0.25, chorus: 0, kbd: 0.7 }),
  P('Deep Bass', { saw: true, pulse: true, pwm: 0.25, sub: 0.9, range: 16, cutoff: 0.3, res: 0.3, envAmt: 0.55, attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.15, chorus: 0, kbd: 0.3 }),
  P('Pluck Keys', { pulse: true, pwm: 0.4, sub: 0.35, cutoff: 0.25, res: 0.35, envAmt: 0.7, attack: 0.005, decay: 0.28, sustain: 0.0, release: 0.25, chorus: 1, kbd: 0.8 }),
  P('PWM Stack', { pulse: true, pwm: 0.9, pwmMode: 'lfo', lfoRate: 0.45, sub: 0.4, cutoff: 0.6, res: 0.1, envAmt: 0.15, attack: 0.25, decay: 0.5, sustain: 0.9, release: 0.5, chorus: 2, hpf: 2 }),
  P('Hollow Organ', { pulse: true, pwm: 0.0, sub: 0.6, cutoff: 0.75, res: 0.0, envAmt: 0.0, attack: 0.01, decay: 0.2, sustain: 1, release: 0.05, vcaMode: 'gate', chorus: 1, hpf: 1 }),
  P('Resonant Sweep', { saw: true, sub: 0.2, cutoff: 0.15, res: 0.8, envAmt: 0.9, attack: 0.35, decay: 0.7, sustain: 0.3, release: 0.6, chorus: 1, kbd: 0.5, vcfLfo: 0.15, lfoRate: 0.2 }),
  P('Noise Wash', { saw: false, pulse: false, noise: 0.9, cutoff: 0.5, res: 0.6, envAmt: 0.4, attack: 0.5, decay: 0.6, sustain: 0.7, release: 0.9, chorus: 2, hpf: 2, vcfLfo: 0.3, lfoRate: 0.15 }),
  P('Lead Glide', { saw: true, pulse: true, pwm: 0.3, sub: 0.3, range: 4, cutoff: 0.5, res: 0.4, envAmt: 0.4, attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.2, portamento: 0.3, chorus: 1, dcoLfo: 0.25, lfoRate: 0.55, lfoDelay: 0.4 }),
  P('Init', { saw: true }),
];
