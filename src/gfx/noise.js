// Seeded value noise. The 2D version can tile, which the textures rely on.

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed = 1) {
  const rnd = makeRng(seed);
  const perm = new Uint8Array(512), val = new Float32Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) val[i] = rnd();
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  // px, py: tile period in lattice cells (0 = no tiling)
  function n2(x, y, px = 0, py = px) {
    let ix = Math.floor(x), iy = Math.floor(y);
    const fx = fade(x - ix), fy = fade(y - iy);
    let ix1 = ix + 1, iy1 = iy + 1;
    if (px) { ix = ((ix % px) + px) % px; ix1 = ((ix1 % px) + px) % px; }
    if (py) { iy = ((iy % py) + py) % py; iy1 = ((iy1 % py) + py) % py; }
    ix &= 255; ix1 &= 255; iy &= 255; iy1 &= 255;
    const a = val[perm[perm[ix] + iy]], b = val[perm[perm[ix1] + iy]];
    const c = val[perm[perm[ix] + iy1]], d = val[perm[perm[ix1] + iy1]];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  function fbm2(x, y, octaves = 5, px = 0, py = px) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n2(x, y, px, py);
      norm += amp;
      x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
    }
    return sum / norm;
  }

  function n3(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
    const X = ix & 255, Y = iy & 255, Z = iz & 255;
    const h = (i, j, k) => val[perm[perm[perm[(X + i) & 255] + ((Y + j) & 255)] + ((Z + k) & 255)]];
    const x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * fx, x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * fx;
    const x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * fx, x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * fx;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  }

  function fbm3(x, y, z, octaves = 4) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n3(x, y, z);
      norm += amp;
      x = x * 2 + 11.3; y = y * 2 + 5.7; z = z * 2 + 3.1; amp *= 0.5;
    }
    return sum / norm;
  }

  return { n2, fbm2, n3, fbm3, rnd };
}
