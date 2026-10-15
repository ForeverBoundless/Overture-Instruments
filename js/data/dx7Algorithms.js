/*
 * The 32 DX7 algorithm topologies (independent data representation).
 * Operators are numbered 1-6; in every algorithm modulators carry higher
 * numbers than the operators they modulate, so voices evaluate 6 -> 1.
 */
// Algorithms: ops numbered 1-6. mods[i] = list of operators modulating op i.
// carriers = ops that reach the output. fb = operator with feedback.
export const ALGORITHMS = [
  { carriers: [1, 3], mods: { 1: [2], 3: [4], 4: [5], 5: [6] }, fb: 6 },
  { carriers: [1, 3], mods: { 1: [2], 3: [4], 4: [5], 5: [6] }, fb: 2 },
  { carriers: [1, 4], mods: { 1: [2], 2: [3], 4: [5], 5: [6] }, fb: 6 },
  { carriers: [1, 4], mods: { 1: [2], 2: [3], 4: [5], 5: [6] }, fb: 4 },
  { carriers: [1, 3, 5], mods: { 1: [2], 3: [4], 5: [6] }, fb: 6 },
  { carriers: [1, 3, 5], mods: { 1: [2], 3: [4], 5: [6] }, fb: 5 },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5], 5: [6] }, fb: 6 },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5], 5: [6] }, fb: 4 },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5], 5: [6] }, fb: 2 },
  { carriers: [1, 4], mods: { 1: [2], 2: [3], 4: [5, 6] }, fb: 3 },
  { carriers: [1, 4], mods: { 1: [2], 2: [3], 4: [5, 6] }, fb: 6 },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5, 6] }, fb: 2 },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5, 6] }, fb: 6 },
  { carriers: [1, 3], mods: { 1: [2], 3: [4], 4: [5, 6] }, fb: 6 },
  { carriers: [1, 3], mods: { 1: [2], 3: [4], 4: [5, 6] }, fb: 2 },
  { carriers: [1], mods: { 1: [2, 3, 5], 3: [4], 5: [6] }, fb: 6 },
  { carriers: [1], mods: { 1: [2, 3, 5], 3: [4], 5: [6] }, fb: 2 },
  { carriers: [1], mods: { 1: [2, 3, 4], 4: [5], 5: [6] }, fb: 3 },
  { carriers: [1, 4, 5], mods: { 1: [2], 2: [3], 4: [6], 5: [6] }, fb: 6 },
  { carriers: [1, 2, 4], mods: { 1: [3], 2: [3], 4: [5, 6] }, fb: 3 },
  { carriers: [1, 2, 4, 5], mods: { 1: [3], 2: [3], 4: [6], 5: [6] }, fb: 3 },
  { carriers: [1, 3, 4, 5], mods: { 1: [2], 3: [6], 4: [6], 5: [6] }, fb: 6 },
  { carriers: [1, 2, 4], mods: { 2: [3], 4: [5, 6] }, fb: 6 },
  { carriers: [1, 2, 3, 4, 5], mods: { 3: [6], 4: [6], 5: [6] }, fb: 6 },
  { carriers: [1, 2, 3, 4, 5], mods: { 4: [6], 5: [6] }, fb: 6 },
  { carriers: [1, 2, 4], mods: { 2: [3], 4: [5, 6] }, fb: 6 },
  { carriers: [1, 2, 4], mods: { 2: [3], 4: [5, 6] }, fb: 3 },
  { carriers: [1, 3, 6], mods: { 1: [2], 3: [4], 4: [5] }, fb: 5 },
  { carriers: [1, 2, 3, 5], mods: { 3: [4], 5: [6] }, fb: 6 },
  { carriers: [1, 2, 3, 6], mods: { 3: [4], 4: [5] }, fb: 5 },
  { carriers: [1, 2, 3, 4, 5], mods: { 5: [6] }, fb: 6 },
  { carriers: [1, 2, 3, 4, 5, 6], mods: {}, fb: 6 },
];
