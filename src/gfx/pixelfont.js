// A pixel font, drawn here glyph by glyph and assembled into a TrueType file
// in memory, then handed to the browser like any web font. Each '#' is one
// pixel; a glyph is 7 rows above the baseline, plus up to 2 below. The em is
// 10 pixels, so at a font size of 20px every pixel is 2 by 2 screen pixels.

const G = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.###.', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '###|.#.|.#.|.#.|.#.|.#.|###', J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  a: '....|....|.##.|...#|.###|#..#|.###', b: '#...|#...|###.|#..#|#..#|#..#|###.',
  c: '...|...|.##|#..|#..|#..|.##', d: '...#|...#|.###|#..#|#..#|#..#|.###',
  e: '....|....|.##.|#..#|####|#...|.###', f: '.##|#..|###|#..|#..|#..|#..',
  g: '....|....|.###|#..#|#..#|#..#|.###|...#|.##.', h: '#...|#...|###.|#..#|#..#|#..#|#..#',
  i: '#|.|#|#|#|#|#', j: '.#|..|.#|.#|.#|.#|.#|.#|#.',
  k: '#...|#...|#..#|#.#.|##..|#.#.|#..#', l: '#.|#.|#.|#.|#.|#.|.#',
  m: '.....|.....|####.|#.#.#|#.#.#|#.#.#|#.#.#', n: '....|....|###.|#..#|#..#|#..#|#..#',
  o: '....|....|.##.|#..#|#..#|#..#|.##.', p: '....|....|###.|#..#|#..#|#..#|###.|#...|#...',
  q: '....|....|.###|#..#|#..#|#..#|.###|...#|...#', r: '...|...|#.#|##.|#..|#..|#..',
  s: '....|....|.###|#...|.##.|...#|###.', t: '.#.|.#.|###|.#.|.#.|.#.|..#',
  u: '....|....|#..#|#..#|#..#|#..#|.###', v: '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
  w: '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.', x: '....|....|#..#|#..#|.##.|#..#|#..#',
  y: '....|....|#..#|#..#|#..#|#..#|.###|...#|.##.', z: '....|....|####|...#|..#.|.#..|####',
  0: '.##.|#..#|#.##|##.#|#..#|#..#|.##.', 1: '.#.|##.|.#.|.#.|.#.|.#.|###',
  2: '.##.|#..#|...#|..#.|.#..|#...|####', 3: '###.|...#|...#|.##.|...#|...#|###.',
  4: '#..#|#..#|#..#|####|...#|...#|...#', 5: '####|#...|#...|###.|...#|...#|###.',
  6: '.##.|#...|#...|###.|#..#|#..#|.##.', 7: '####|...#|...#|..#.|.#..|.#..|.#..',
  8: '.##.|#..#|#..#|.##.|#..#|#..#|.##.', 9: '.##.|#..#|#..#|.###|...#|...#|.##.',
  ' ': '..|..|..|..|..|..|..', '!': '#|#|#|#|#|.|#', '"': '#.#|#.#|...|...|...|...|...',
  '#': '.#.#.|#####|.#.#.|.#.#.|#####|.#.#.|.....', '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##', '&': '.##..|#..#.|.##..|.#...|#.#.#|#..#.|.##.#',
  "'": '#|#|.|.|.|.|.', '(': '.#|#.|#.|#.|#.|#.|.#', ')': '#.|.#|.#|.#|.#|.#|#.',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....', '+': '...|...|.#.|###|.#.|...|...',
  ',': '..|..|..|..|..|..|.#|#.', '-': '...|...|...|###|...|...|...', '.': '.|.|.|.|.|.|#',
  '/': '...#|...#|..#.|.#..|.#..|#...|#...', ':': '.|.|#|.|.|#|.', ';': '..|..|.#|..|..|.#|.#|#.',
  '<': '...#|..#.|.#..|#...|.#..|..#.|...#', '=': '....|....|####|....|####|....|....',
  '>': '#...|.#..|..#.|...#|..#.|.#..|#...', '?': '.##.|#..#|...#|..#.|.#..|....|.#..',
  '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.', '[': '##|#.|#.|#.|#.|#.|##',
  '\\': '#...|#...|.#..|.#..|..#.|...#|...#', ']': '##|.#|.#|.#|.#|.#|##', '^': '.#.|#.#|...|...|...|...|...',
  '_': '....|....|....|....|....|....|....|####', '`': '#.|.#|..|..|..|..|..',
  '{': '..#|.#.|.#.|#..|.#.|.#.|..#', '|': '#|#|#|#|#|#|#', '}': '#..|.#.|.#.|..#|.#.|.#.|#..',
  '~': '.....|.....|.#..#|#.##.|.....|.....|.....',
  '·': '.|.|.|#|.|.|.', '×': '...|...|#.#|.#.|#.#|...|...', '…': '.....|.....|.....|.....|.....|.....|#.#.#',
  '’': '.#|.#|#.|..|..|..|..', '‘': '.#|#.|#.|..|..|..|..', '“': '.#.#|#.#.|#.#.|....|....|....|....',
  '”': '.#.#|.#.#|#.#.|....|....|....|....', '–': '....|....|....|####|....|....|....',
  '—': '......|......|......|######|......|......|......', 'é': '..#.|.#..|.##.|#..#|####|#...|.###',
};

const PX = 128;                 // font units per pixel
const ASC = 8, DESC = 2;        // pixels above and below the baseline; the em is 10 pixels
export const FONT_NAME = 'Gauntlet Pixel';

// ------------------------------------------------------------ glyph outlines
// Each run of lit pixels in a row becomes a rectangle; rectangles that line up
// row after row are merged into one.
function outline(spec) {
  const rows = spec.split('|');
  const width = Math.max(...rows.map((r) => r.length));
  const open = new Map(), rects = [];
  rows.forEach((row, r) => {
    const yTop = 7 - r;                       // the top edge of this row, in pixels
    const seen = new Set();
    for (let x = 0; x < row.length;) {
      if (row[x] !== '#') { x++; continue; }
      let e = x;
      while (e < row.length && row[e] === '#') e++;
      const key = x + ',' + e;
      seen.add(key);
      const o = open.get(key);
      if (o) o.y0 = yTop - 1; else open.set(key, { x0: x, x1: e, y0: yTop - 1, y1: yTop });
      x = e;
    }
    for (const [key, o] of [...open]) if (!seen.has(key)) { rects.push(o); open.delete(key); }
  });
  rects.push(...open.values());
  return { width, rects };
}

// ------------------------------------------------------------ binary writing
class Bytes {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 255); return this; }
  u16(v) { this.a.push((v >> 8) & 255, v & 255); return this; }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { this.a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this; }
  tag(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  pad() { while (this.a.length % 4) this.a.push(0); return this; }
  get length() { return this.a.length; }
}

function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) sum = (sum + (((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0)) >>> 0;
  return sum;
}

export function buildFont() {
  const chars = Object.keys(G).filter((c) => [...c].length === 1).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const glyphs = [{ width: 4, rects: [] }, ...chars.map((c) => outline(G[c]))];   // glyph 0 is .notdef
  const n = glyphs.length;

  // glyf and loca
  const glyf = new Bytes(), loca = [];
  let xMin = 0, yMin = 0, xMax = 0, yMax = 0, maxPoints = 0, maxContours = 0;
  for (const g of glyphs) {
    loca.push(glyf.length);
    if (!g.rects.length) continue;
    const bx0 = Math.min(...g.rects.map((r) => r.x0)) * PX, bx1 = Math.max(...g.rects.map((r) => r.x1)) * PX;
    const by0 = Math.min(...g.rects.map((r) => r.y0)) * PX, by1 = Math.max(...g.rects.map((r) => r.y1)) * PX;
    xMin = Math.min(xMin, bx0); yMin = Math.min(yMin, by0); xMax = Math.max(xMax, bx1); yMax = Math.max(yMax, by1);
    glyf.i16(g.rects.length).i16(bx0).i16(by0).i16(bx1).i16(by1);
    g.rects.forEach((_, i) => glyf.u16(i * 4 + 3));
    glyf.u16(0);                                           // no instructions
    const pts = [];
    for (const r of g.rects) {                             // clockwise, y up
      pts.push([r.x0, r.y0], [r.x0, r.y1], [r.x1, r.y1], [r.x1, r.y0]);
    }
    for (let i = 0; i < pts.length; i++) glyf.u8(1);       // on curve, 16-bit deltas
    let px = 0, py = 0;
    for (const [x] of pts) { glyf.i16(x * PX - px); px = x * PX; }
    for (const [, y] of pts) { glyf.i16(y * PX - py); py = y * PX; }
    while (glyf.length % 4) glyf.u8(0);
    maxPoints = Math.max(maxPoints, pts.length);
    maxContours = Math.max(maxContours, g.rects.length);
  }
  loca.push(glyf.length);
  const locaB = new Bytes();
  for (const o of loca) locaB.u32(o);

  const adv = glyphs.map((g) => (g.width + 1) * PX);
  const upem = (ASC + DESC) * PX;

  const head = new Bytes().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(upem)
    .u32(0).u32(0).u32(0).u32(0).i16(xMin).i16(yMin).i16(xMax).i16(yMax).u16(0).u16(8).i16(2).i16(1).i16(0);
  const hhea = new Bytes().u32(0x00010000).i16(ASC * PX).i16(-DESC * PX).i16(0).u16(Math.max(...adv))
    .i16(0).i16(0).i16(xMax).i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(n);
  const maxp = new Bytes().u32(0x00010000).u16(n).u16(maxPoints).u16(maxContours).u16(0).u16(0).u16(2)
    .u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  const hmtx = new Bytes();
  for (const a of adv) hmtx.u16(a).i16(0);
  const avg = Math.round(adv.reduce((s, v) => s + v, 0) / n);
  const os2 = new Bytes().u16(4).i16(avg).u16(400).u16(5).u16(0)
    .i16(5 * PX).i16(5 * PX).i16(0).i16(PX).i16(5 * PX).i16(5 * PX).i16(0).i16(3 * PX).i16(PX).i16(3 * PX).i16(0);
  for (let i = 0; i < 10; i++) os2.u8(0);
  os2.u32(3).u32(0).u32(0).u32(0).tag('PIXL').u16(0x40)
    .u16(32).u16(Math.min(0xffff, chars[chars.length - 1].codePointAt(0)))
    .i16(ASC * PX).i16(-DESC * PX).i16(0).u16(ASC * PX).u16(DESC * PX).u32(1).u32(0)
    .i16(5 * PX).i16(7 * PX).u16(0).u16(32).u16(1);

  // cmap: one format 4 segment per character, plus the closing 0xFFFF
  const codes = chars.map((c) => c.codePointAt(0)).filter((c) => c < 0xffff);
  const segs = codes.map((c, i) => ({ start: c, end: c, delta: (i + 1 - c + 65536) % 65536 }));
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const segX2 = segs.length * 2, sel = Math.floor(Math.log2(segs.length)), range = 2 * 2 ** sel;
  const sub = new Bytes().u16(4).u16(16 + segs.length * 8).u16(0).u16(segX2).u16(range).u16(sel).u16(segX2 - range);
  for (const s of segs) sub.u16(s.end);
  sub.u16(0);
  for (const s of segs) sub.u16(s.start);
  for (const s of segs) sub.u16(s.delta);
  for (const s of segs) sub.u16(0);
  const cmap = new Bytes().u16(0).u16(1).u16(3).u16(1).u32(12);
  cmap.a.push(...sub.a);

  // name
  const names = [[1, FONT_NAME], [2, 'Regular'], [3, FONT_NAME + ' Regular'], [4, FONT_NAME], [5, 'Version 1.0'], [6, 'GauntletPixel-Regular']];
  const strings = new Bytes();
  const records = names.map(([id, text]) => {
    const off = strings.length;
    for (const ch of text) strings.u16(ch.charCodeAt(0));
    return { id, off, len: strings.length - off };
  });
  const name = new Bytes().u16(0).u16(names.length).u16(6 + names.length * 12);
  for (const r of records) name.u16(3).u16(1).u16(0x409).u16(r.id).u16(r.len).u16(r.off);
  name.a.push(...strings.a);

  const post = new Bytes().u32(0x00030000).u32(0).i16(-PX).i16(PX).u32(0).u32(0).u32(0).u32(0).u32(0);

  // the file: directory, then the tables in tag order
  const tables = [['OS/2', os2], ['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea], ['hmtx', hmtx], ['loca', locaB], ['maxp', maxp], ['name', name], ['post', post]];
  const sel2 = Math.floor(Math.log2(tables.length)), sr = 16 * 2 ** sel2;
  const dir = new Bytes().u32(0x00010000).u16(tables.length).u16(sr).u16(sel2).u16(tables.length * 16 - sr);
  let offset = 12 + tables.length * 16;
  const body = [];
  for (const [tag, t] of tables) {
    const bytes = t.a.slice();
    dir.tag(tag).u32(checksum(bytes)).u32(offset).u32(bytes.length);
    while (bytes.length % 4) bytes.push(0);
    body.push(...bytes);
    offset += bytes.length;
  }
  const all = new Uint8Array([...dir.a, ...body]);
  // head.checkSumAdjustment makes the whole file sum to a fixed value
  const adjust = (0xb1b0afba - checksum(all) + 0x100000000) >>> 0;
  const headAt = 12 + tables.length * 16 + [os2, cmap, glyf].reduce((s, t) => s + Math.ceil(t.length / 4) * 4, 0);
  all[headAt + 8] = adjust >>> 24; all[headAt + 9] = (adjust >>> 16) & 255; all[headAt + 10] = (adjust >>> 8) & 255; all[headAt + 11] = adjust & 255;
  return all.buffer;
}

// Builds the font and registers it with the page. Resolves when it can be used.
export async function loadPixelFont() {
  const face = new FontFace(FONT_NAME, buildFont());
  await face.load();
  document.fonts.add(face);
  return face;
}
