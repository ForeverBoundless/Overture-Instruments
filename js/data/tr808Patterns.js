/* Original starter patterns for the Overture TR-808 (not Roland pattern banks). "x" = hit, "." = rest, 16 steps per bar. */
const row = (s) => s.replace(/\s/g, '').split('').map((c) => (c === 'x' ? 1 : c === 'X' ? 2 : 0));
const pat = (name, tempo, lanes, length = 16) => {
  const out = { tempo, length, lanes: {} };
  Object.entries(lanes).forEach(([k, v]) => { const r = row(v); out.lanes[k] = r.length === 32 ? r : [...r, ...new Array(32 - r.length).fill(0)]; });
  return { name, data: out };
};
export const TR808_PATTERNS = [
  pat('Four on the Floor', 124, { BD: 'x...x...x...x...', SD: '....x.......x...', CH: 'x.x.x.x.x.x.x.x.', OH: '..x...x...x...x.', AC: 'x...........x...' }),
  pat('Electro Boom', 108, { BD: 'x.....x..x......', SD: '....x.......x...', CH: 'x.xxx.xxx.xxx.xx', CP: '....x.......x...', CB: '......x.......x.', AC: 'x.......x.......' }),
  pat('Sparse Groove', 92, { BD: 'x.......x..x....', SD: '....x.......x...', CH: '..x...x...x...x.', MA: 'x.x.x.x.x.x.x.x.', RS: '.......x.......x' }),
  pat('Syncopated Toms', 116, { BD: 'x..x..x...x..x..', SD: '....x.......x...', LT: '.......x........', MT: '..........x.....', HT: '..............x.', CH: 'x.x.x.x.x.x.x.x.', AC: 'x..x............' }),
  pat('Half-time Fill', 96, { BD: 'x.......x.......x.......x...x...', SD: '........x...............x.......', CH: 'x.x.x.x.x.x.x.x.x.x.x.x.x.......', OH: '......x.......x.......x.........', LT: '............................x...', MT: '.............................x..', HT: '..............................xx', CY: '................................', AC: 'x...............x...............' }, 32),
  pat('Latin Congas', 128, { BD: 'x.....x.x.....x.', CL: '..x..x....x..x..', LT: '....x......x....', MT: '......x.......x.', HT: 'x..x....x..x....', MA: 'x.xxx.xxx.xxx.xx', CB: 'x...x...x...x...' }),
  pat('Empty', 120, {}),
];
