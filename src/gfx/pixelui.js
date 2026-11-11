// The pixel-art interface kit, drawn at start-up: nine-slice frames for
// panels, buttons and cards, small sprites (crowns, coins, aether, pips,
// checkboxes), a stepped vignette, and a filter that turns any picture into
// chunky, dithered pixel art. Everything is published as CSS variables.

export const SCALE = 2;          // screen pixels per art pixel

export const PAL = {
  ink: '#07060a', panel: '#141119', panel2: '#1f1a26', line: '#3a3042', shade: '#0b090e',
  brass: '#c9a25a', brassHi: '#f0d488', brassLo: '#6e5226', bone: '#e8dcc0', dim: '#8a8070',
  blood: '#a8262a', bloodHi: '#e0503e', aether: '#3cc8f0', aetherHi: '#c8f4ff', aetherLo: '#0c5a7a',
};

const KIND = {
  move: ['#1f9a8a', '#7ee0d0', '#0c4a42'], guard: ['#3f72c8', '#9cc0ff', '#1a3060'], control: ['#5aa8d0', '#c0ecff', '#20506a'],
  attack: ['#c8443e', '#ff9a80', '#5a1412'], utility: ['#7e58c8', '#c8b0ff', '#34205a'], summon: ['#3f9a54', '#a0e8a8', '#18421f'],
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Draws a picture from rows of characters, one colour per character ('.' is clear).
export function sprite(rows, palette, scale = SCALE) {
  const list = typeof rows === 'string' ? rows.split('|') : rows;
  const w = Math.max(...list.map((r) => r.length)), h = list.length;
  const c = canvas(w * scale, h * scale), ctx = c.getContext('2d');
  list.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !palette[ch]) return;
    ctx.fillStyle = palette[ch];
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
  return c;
}
const url = (c) => `url(${c.toDataURL('image/png')})`;

// A nine-slice frame: a dark outline with clipped corners, a bevel (light on
// the top and left, dark on the bottom and right), an optional inner line, and a fill.
function frame({ out, hi, lo, fill, inner = null, border = 3 }) {
  const N = border * 2 + 2, rows = [];
  for (let y = 0; y < N; y++) {
    let row = '';
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, y, N - 1 - x, N - 1 - y);
      const corner = (x === 0 || x === N - 1) && (y === 0 || y === N - 1);
      const corner1 = (x === 1 || x === N - 2) && (y === 1 || y === N - 2);
      if (corner) row += '.';
      else if (d === 0 || corner1) row += 'o';
      else if (d === 1) row += (y === 1 || x === 1) && y !== N - 2 && x !== N - 2 ? 'h' : 'l';
      else if (d === 2 && inner) row += 'i';
      else row += 'f';
    }
    rows.push(row);
  }
  return sprite(rows, { o: out, h: hi, l: lo, i: inner, f: fill });
}

// A diamond n pixels across: outline, a lit upper-left edge, a dark lower-right edge.
function diamond(n) {
  const c = (n - 1) / 2, rows = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const d = Math.abs(x - c) + Math.abs(y - c);
      if (d > c) row += '.';
      else if (d > c - 1) row += 'o';
      else if (d > c - 2) row += x + y < n - 1 ? 'h' : 'l';
      else row += 'f';
    }
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------- pixelation
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);

// Shrinks a picture to w by h art pixels, cuts it to `levels` shades per
// channel with ordered dithering, and makes alpha all-or-nothing.
export function pixelate(src, w, h, { levels = 6, dither = true, alpha = 0.5 } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h), d = img.data, k = levels - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, b = dither ? BAYER[(y & 3) * 4 + (x & 3)] : 0;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, Math.min(k, Math.round((d[i + ch] / 255) * k + b))) * (255 / k);
      d[i + 3] = d[i + 3] / 255 >= alpha ? 255 : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// --------------------------------------------------------------- the kit
export function installPixelKit(root = document.documentElement) {
  const P = PAL, set = (name, c) => root.style.setProperty(name, url(c));
  set('--px-panel', frame({ out: P.ink, hi: P.brassLo, lo: '#040306', inner: '#2a2232', fill: P.panel }));
  set('--px-panel-lit', frame({ out: P.ink, hi: P.brassHi, lo: P.brassLo, inner: '#2a2232', fill: P.panel }));
  set('--px-inset', frame({ out: P.ink, hi: '#050407', lo: P.line, fill: '#0e0c12' }));
  set('--px-btn', frame({ out: P.ink, hi: '#5c5064', lo: '#0c0a0e', fill: '#26202c' }));
  set('--px-btn-hi', frame({ out: P.ink, hi: P.brassHi, lo: P.brassLo, fill: '#332a3a' }));
  set('--px-btn-dn', frame({ out: P.ink, hi: '#0c0a0e', lo: '#5c5064', fill: '#1c1820' }));
  set('--px-btn-gold', frame({ out: P.ink, hi: P.brassHi, lo: P.brassLo, fill: P.brass }));
  set('--px-btn-gold-hi', frame({ out: P.ink, hi: '#fff4c0', lo: P.brassLo, fill: '#ddb86a' }));
  set('--px-btn-on', frame({ out: P.ink, hi: '#fff4c0', lo: P.brassLo, fill: P.brass }));
  set('--px-bubble', frame({ out: '#1a1209', hi: '#fff6e0', lo: '#b4a282', fill: P.bone, border: 2 }));
  set('--px-bubble-foe', frame({ out: P.ink, hi: '#7a2024', lo: '#1a0506', fill: '#2c0b0e', border: 2 }));
  set('--px-tip', frame({ out: P.ink, hi: P.line, lo: '#040306', fill: '#100d14', border: 2 }));
  set('--px-hurt', frame({ out: P.ink, hi: '#7a3020', lo: '#040306', inner: '#2a1414', fill: '#181014' }));
  for (const [kind, [base, hi, lo]] of Object.entries(KIND)) set(`--px-card-${kind}`, frame({ out: P.ink, hi, lo, inner: base, fill: '#121016' }));
  set('--px-card-sel', frame({ out: P.ink, hi: '#ffffff', lo: P.brassHi, inner: P.brassHi, fill: '#121016' }));

  const crown = '#...#...#|##.###.##|#########|#########|#########|.#######.|.........';
  set('--px-crown', sprite(crown, { '#': P.brass }));
  set('--px-crown-off', sprite(crown, { '#': '#3a3438' }));
  set('--px-coin', sprite('.###.|#hhh#|#h#h#|#hhh#|.###.', { '#': P.brassLo, h: P.brassHi }));
  const orb = '...#...|..#h#..|.#hh##.|#hh####|.#####.|..###..|...#...';
  set('--px-orb', sprite(orb, { '#': P.aether, h: P.aetherHi }));
  set('--px-orb-off', sprite(orb, { '#': '#16303c', h: '#1e4252' }));
  const pip = '..#..|.###.|#####|.###.|..#..';
  set('--px-pip', sprite(pip, { '#': '#4a4250' }));
  set('--px-pip-done', sprite(pip, { '#': P.brass }));
  set('--px-pip-here', sprite(pip, { '#': '#ffffff' }));
  set('--px-pip-boss', sprite('..#..|.#.#.|#...#|.#.#.|..#..', { '#': P.bloodHi }));
  set('--px-cost', sprite(diamond(15), { o: P.ink, h: P.aetherHi, f: P.aether, l: P.aetherLo }));
  set('--px-gem', sprite('.#.|#h#|.#.', { '#': '#9ab0d0', h: '#ffffff' }));
  set('--px-gem-rare', sprite('..#..|.#h#.|#hhh#|.#h#.|..#..', { '#': P.brass, h: P.brassHi }));
  const box = '#########|#.......#|#.......#|#.......#|#.......#|#.......#|#.......#|#.......#|#########';
  set('--px-check', sprite(box, { '#': '#5c5064', '.': '#0e0c12' }));
  set('--px-check-on', sprite('#########|#.......#|#.....#.#|#....##.#|#.#.##..#|#.###...#|#..#....#|#.......#|#########', { '#': P.brass, '.': '#0e0c12' }));
  set('--px-thumb', sprite('#####|#hhh#|#hhh#|#hhh#|#hhh#|#hhh#|#####', { '#': P.ink, h: P.brass }));
  set('--px-tail', sprite('#######|#fffff#|.#fff#.|..#f#..|...#...', { '#': '#1a1209', f: P.bone }));
  set('--px-tail-foe', sprite('#######|#fffff#|.#fff#.|..#f#..|...#...', { '#': P.ink, f: '#2c0b0e' }));
  set('--px-spin', sprite('##..|##..|....|....', { '#': P.brass }, 4));

  // A vignette in a few hard steps, stretched over the whole view.
  const w = 128, h = 72, v = canvas(w, h), vc = v.getContext('2d'), img = vc.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5) / w - 0.5, dy = ((y + 0.5) / h - 0.47) * 1.15;
      const r = Math.sqrt(dx * dx + dy * dy) * 1.9;
      const step = Math.min(4, Math.max(0, Math.floor((r - 0.62) * 8)));
      const i = (y * w + x) * 4;
      img.data[i + 3] = [0, 45, 90, 140, 190][step];
    }
  }
  vc.putImageData(img, 0, 0);
  set('--px-vignette', v);
}
