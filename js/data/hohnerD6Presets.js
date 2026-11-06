export const HOHNER_D6_PRESETS = [
  { name: 'Clavinet Classic', data: { tone: 0, pickup: 'bothIn', volume: 0.72, damping: 0.34, pedals: {} } },
  { name: 'Dry Funk', data: { tone: 1, pickup: 'bridge', volume: 0.78, damping: 0.48, pedals: { overdrive: { enabled: true, drive: 0.18, tone: 0.72, level: 0.78 }, wah: { enabled: false, position: 0.55, resonance: 0.62, mix: 0.72 } } } },
  { name: 'Nasal Muted', data: { tone: 2, pickup: 'neck', volume: 0.7, damping: 0.72, pedals: {} } },
  { name: 'Bright Chicken Pickin', data: { tone: 0, pickup: 'bothOut', volume: 0.76, damping: 0.28, pedals: { compressor: { enabled: true, sustain: 0.58, level: 0.72 } } } },
  { name: 'Auto Wah Funk', data: { tone: 0, pickup: 'bridge', volume: 0.74, damping: 0.32, pedals: { wah: { enabled: true, position: 0.68, resonance: 0.8, mix: 0.82 }, overdrive: { enabled: true, drive: 0.12, tone: 0.68, level: 0.82 } } } },
  { name: 'Phased Chords', data: { tone: 1, pickup: 'bothIn', volume: 0.7, damping: 0.38, pedals: { phaser: { enabled: true, rate: 0.24, depth: 0.62, feedback: 0.2, mix: 0.54 }, spring: { enabled: true, mix: 0.2, decay: 0.3 } } } },
  { name: 'Chorus Suitcase', data: { tone: 1, pickup: 'bothIn', volume: 0.7, damping: 0.3, pedals: { chorus: { enabled: true, rate: 0.22, depth: 0.64, mix: 0.42 }, spring: { enabled: true, mix: 0.28, decay: 0.42 } } } },
  { name: 'Soft Out of Phase', data: { tone: 3, pickup: 'bothOut', volume: 0.68, damping: 0.58, pedals: { chorus: { enabled: true, rate: 0.12, depth: 0.38, mix: 0.3 } } } },
];
