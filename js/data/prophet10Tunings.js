/*
 * Prophet-10 alternative tunings (User's Guide, Appendix D).
 * buildTuning(n) returns a 128-entry table of frequencies in Hz for MIDI
 * notes 0-127, or null for normal 12-tone equal temperament.
 */

const r = (text) => text.split(/\s+/).filter(Boolean).map((f) => {
  const [a, b] = f.split('/').map(Number);
  return a / (b || 1);
});

// Octave-repeating 12-note ratio scales: [ratios from the root, root MIDI note, root Hz]
const RATIO_SCALES = {
  3: [r('1/1 17/16 9/8 19/16 5/4 21/16 11/8 3/2 13/8 27/16 7/4 15/8'), 69, 440], // Carlos Harmonic, A
  8: [r('1/1 256/243 9/8 32/27 81/64 4/3 729/512 3/2 128/81 27/16 16/9 243/128'), 60, 261.625], // Pythagorean C
  // JI in A with a 7/5 tritone at D#. The manual's printed list skips the 4/3
  // fourth (D), leaving 11 ratios; it is restored so every key has a pitch.
  9: [r('1/1 16/15 9/8 6/5 5/4 4/3 7/5 3/2 8/5 5/3 9/5 15/8'), 69, 440],
  10: [r('1/1 16/15 10/9 6/5 5/4 4/3 64/45 3/2 8/5 5/3 16/9 15/8'), 69, 440], // 3-5 lattice in A
  11: [r('1/1 9/8 8/7 7/6 9/7 21/16 4/3 3/2 32/21 12/7 7/4 63/32'), 69, 440], // 3-7 lattice in A
  12: [r('1/1 15/14 9/8 7/6 5/4 4/3 7/5 3/2 14/9 5/3 7/4 15/8'), 60, 261.625], // Other Music, C
  13: [r('1/1 1/1 9/8 7/6 5/4 4/3 11/8 3/2 3/2 7/4 7/4 15/8'), 34, 60], // Pelog/Slendro, Bb & B = 60 Hz
  14: [r('1/1 16/15 9/8 6/5 5/4 4/3 45/32 3/2 8/5 5/3 16/9 15/8'), 60, 261.625], // Yamaha Just Major C
  15: [r('1/1 25/24 10/9 6/5 5/4 4/3 45/32 3/2 8/5 5/3 16/9 15/8'), 60, 261.625], // Yamaha Just Minor C
};

const PARTCH = r('1/1 81/80 33/32 21/20 16/15 12/11 11/10 10/9 9/8 8/7 7/6 32/27 6/5 11/9 5/4 14/11 9/7 21/16 4/3 27/20 11/8 7/5 10/7 16/11 40/27 3/2 32/21 14/9 11/7 8/5 18/11 5/3 27/16 12/7 7/4 16/9 9/5 20/11 11/6 15/8 40/21 64/33 160/81');

// Quarter-comma meantone, cents from C.
const MEANTONE_CENTS = [0, 76.0, 193.2, 310.3, 386.3, 503.4, 579.5, 696.6, 772.6, 889.7, 1006.8, 1082.9];

function ratioScale(ratios, rootNote, rootHz, note) {
  const n = ratios.length;
  const offset = note - rootNote;
  const octave = Math.floor(offset / n);
  const degree = ((offset % n) + n) % n;
  return rootHz * ratios[degree] * Math.pow(2, octave);
}

export const PROPHET10_TUNING_NAMES = [
  'Normal', '12-Tone Equal Temperament', 'Harmonic Series', 'Carlos Harmonic Twelve Tone', 'Meantone Temperament',
  '1/4 Tone Equal Temperament', '19 Tone Equal Temperament', '31 Tone Equal Temperament', 'Pythagorean C',
  'Just Intonation in A with 7-Limit Tritone at D#', '3-5 Lattice in A', '3-7 Lattice in A',
  'Other Music 7-Limit Black Keys in C', 'Dan Schmidt Pelog/Slendro', 'Yamaha Just Major C', 'Yamaha Just Minor C',
  'Harry Partch 11-Limit 43 Note Just Intonation',
];

export function buildTuning(index) {
  if (!index || index === 1) return null; // Normal / 12-TET (non-erasable)
  const table = new Float64Array(128);
  for (let note = 0; note < 128; note += 1) {
    let hz;
    switch (index) {
      case 2: // Harmonic series: notes 36.. = harmonics 2.. of A = 27.5 Hz; Carlos intervals outside
        hz = note >= 36 && note <= 94 ? 27.5 * (note - 34) : ratioScale(...RATIO_SCALES[3], note);
        break;
      case 4:
        hz = 260 * Math.pow(2, (MEANTONE_CENTS[((note - 60) % 12 + 12) % 12] / 1200) + Math.floor((note - 60) / 12));
        break;
      case 5: hz = 440 * Math.pow(2, (note - 69) / 24); break;
      case 6: hz = 440 * Math.pow(2, (note - 69) / 19); break;
      case 7: hz = 440 * Math.pow(2, (note - 69) / 31); break;
      case 16: hz = ratioScale(PARTCH, 67, 392, note); break;
      default: {
        const scale = RATIO_SCALES[index];
        hz = scale ? ratioScale(...scale, note) : 440 * Math.pow(2, (note - 69) / 12);
      }
    }
    table[note] = Math.min(20000, Math.max(4, hz));
  }
  return table;
}
