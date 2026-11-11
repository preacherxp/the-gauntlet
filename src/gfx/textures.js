// Every texture in the game is painted here at startup, pixel by pixel, from
// seeded noise. Nothing is loaded from disk. All of them tile.

import * as THREE from 'three';
import { makeNoise } from './noise.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

// paint(u, v, out) fills out[0..2] with 0-255 colour and may set out[3] (height 0-1).
function paintCanvas(size, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const out = [0, 0, 0, 0];
  let i = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[3] = 0;
      paint(x / size, y / size, out);
      img.data[i * 4] = out[0]; img.data[i * 4 + 1] = out[1]; img.data[i * 4 + 2] = out[2]; img.data[i * 4 + 3] = 255;
      height[i++] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, height, size };
}

function texture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

function normalFromHeight({ height, size }, strength = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength * size / 256;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength * size / 256;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return texture(canvas, false);
}

// ---------------------------------------------------------------------- stone
function marble({ seed, base, vein, vein2 = vein, cloud = 0.1, veins = 1, size = 512 }) {
  const N = makeNoise(seed), A = rgb(base), B = rgb(vein), C = rgb(vein2);
  const p = paintCanvas(size, (u, v, out) => {
    const warp = N.fbm2(u * 4, v * 4, 5, 4);
    const warp2 = N.fbm2(u * 8 + 3.3, v * 8 + 1.7, 4, 8);
    const m1 = Math.abs(Math.sin(Math.PI * (u * 3 + v * 2 + warp * 3.2)));
    const m2 = Math.abs(Math.sin(Math.PI * (u * 5 - v * 4 + warp2 * 2.6 + warp * 1.5)));
    const v1 = Math.pow(1 - m1, 9) * veins, v2 = Math.pow(1 - m2, 16) * 0.6 * veins;
    const shade = 1 - cloud + cloud * 2 * N.fbm2(u * 6 + 9, v * 6 + 4, 4, 6);
    for (let k = 0; k < 3; k++) {
      let c = A[k] * shade;
      c = mix(c, B[k], clamp01(v1));
      c = mix(c, C[k], clamp01(v2));
      out[k] = c;
    }
  });
  return { map: texture(p.canvas) };
}

function wood({ seed, light, dark, rings = 7, size = 512 }) {
  const N = makeNoise(seed), A = rgb(light), B = rgb(dark);
  const p = paintCanvas(size, (u, v, out) => {
    const warp = N.fbm2(u * 2, v * 6, 4, 2, 6);
    const r = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * rings + warp * 1.6));
    const grain = N.n2(u * 6, v * 180, 6, 180);
    const pores = N.n2(u * 24, v * 256, 24, 256);
    const t = clamp01(smooth(0.15, 0.95, r) * 0.75 + grain * 0.25);
    const shade = 0.9 + 0.1 * pores;
    for (let k = 0; k < 3; k++) out[k] = mix(A[k], B[k], t) * shade;
    out[3] = grain * 0.6 + pores * 0.4;
  });
  return { map: texture(p.canvas), normalMap: normalFromHeight(p, 0.6) };
}

function basalt({ seed, base, tint, size = 512 }) {
  const N = makeNoise(seed), A = rgb(base), B = rgb(tint);
  const p = paintCanvas(size, (u, v, out) => {
    const n = N.fbm2(u * 6, v * 6, 5, 6);
    const speck = N.n2(u * 96, v * 96, 96);
    const pit = Math.pow(N.fbm2(u * 16 + 5, v * 16 + 2, 3, 16), 3);
    const t = clamp01(n * 1.2 - 0.1);
    for (let k = 0; k < 3; k++) out[k] = mix(A[k], B[k], t) * (0.85 + speck * 0.3) * (1 - pit * 0.6);
    out[3] = n * 0.7 + speck * 0.15 - pit * 0.6;
  });
  return { map: texture(p.canvas), normalMap: normalFromHeight(p, 2.5) };
}

// Glowing cracks: a dark colour map plus an emissive map to pair with it.
function lava({ seed, rock, size = 512 }) {
  const N = makeNoise(seed), A = rgb(rock);
  const glow = document.createElement('canvas');
  glow.width = glow.height = size;
  const gctx = glow.getContext('2d');
  const gimg = gctx.createImageData(size, size);
  let i = 0;
  const p = paintCanvas(size, (u, v, out) => {
    const warp = N.fbm2(u * 4 + 7, v * 4 + 2, 4, 4);
    const a = N.fbm2(u * 5 + warp * 1.2, v * 5 + warp * 1.2, 4, 5);
    const b = N.fbm2(u * 5, v * 5, 4, 5);
    const ridge = 1 - Math.abs(2 * mix(a, b, 0.65) - 1);
    const crack = Math.pow(clamp01(ridge), 46);
    const heat = clamp01(crack * 2.4 + Math.pow(clamp01(ridge), 16) * 0.3);
    const n = N.fbm2(u * 12, v * 12, 3, 12);
    for (let k = 0; k < 3; k++) out[k] = A[k] * (0.6 + n * 0.7) * (1 - heat * 0.5);
    out[3] = n * 0.5 - crack;
    gimg.data[i * 4] = 255 * clamp01(heat * 1.4);
    gimg.data[i * 4 + 1] = 255 * clamp01(Math.pow(heat, 1.7) * 0.75);
    gimg.data[i * 4 + 2] = 255 * clamp01(Math.pow(heat, 4) * 0.35);
    gimg.data[i * 4 + 3] = 255;
    i++;
  });
  gctx.putImageData(gimg, 0, 0);
  return { map: texture(p.canvas), emissiveMap: texture(glow), normalMap: normalFromHeight(p, 2.5) };
}

function ice({ seed, base, frost, size = 512 }) {
  const N = makeNoise(seed), A = rgb(base), B = rgb(frost);
  const p = paintCanvas(size, (u, v, out) => {
    const warp = N.fbm2(u * 3, v * 3, 4, 3);
    const ridge = 1 - Math.abs(2 * N.fbm2(u * 6 + warp, v * 6 - warp, 4, 6) - 1);
    const b = 1 - Math.abs(2 * N.fbm2(u * 6, v * 6, 4, 6) - 1);
    const crack = Math.pow(clamp01(mix(ridge, b, 0.7)), 50);
    const cloud = N.fbm2(u * 5 + 2, v * 5 + 8, 5, 5);
    const t = clamp01(crack * 1.5 + smooth(0.5, 0.8, cloud) * 0.5);
    for (let k = 0; k < 3; k++) out[k] = mix(A[k], B[k], t);
    out[3] = cloud * 0.4 + crack;
  });
  return { map: texture(p.canvas), normalMap: normalFromHeight(p, 1.2) };
}

// ----------------------------------------------------------------- neon tiles
function neonTile({ seed, glow, bg, fill, size = 512 }) {
  const N = makeNoise(seed);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const base = mk(), em = mk();
  const b = base.getContext('2d'), e = em.getContext('2d');
  const hex = (h) => '#' + h.toString(16).padStart(6, '0');
  b.fillStyle = hex(bg); b.fillRect(0, 0, size, size);
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  // faint inner fill
  e.globalAlpha = fill; e.fillStyle = hex(glow); e.fillRect(0, 0, size, size); e.globalAlpha = 1;
  // fine grid
  e.strokeStyle = hex(glow); e.globalAlpha = 0.22; e.lineWidth = 1.5;
  for (let i = 1; i < 8; i++) {
    const q = (i / 8) * size;
    e.beginPath(); e.moveTo(q, 0); e.lineTo(q, size); e.moveTo(0, q); e.lineTo(size, q); e.stroke();
  }
  // circuit traces
  e.globalAlpha = 0.55; e.lineWidth = 3; e.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    let x = Math.floor(N.rnd() * 8) * size / 8, y = Math.floor(N.rnd() * 8) * size / 8;
    e.beginPath(); e.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      const len = (1 + Math.floor(N.rnd() * 3)) * size / 8 * (N.rnd() < 0.5 ? -1 : 1);
      if (s % 2) y += len; else x += len;
      e.lineTo(x, y);
    }
    e.stroke();
    e.beginPath(); e.arc(x, y, 6, 0, Math.PI * 2); e.fillStyle = hex(glow); e.fill();
  }
  // bright frame
  e.globalAlpha = 1; e.lineWidth = size * 0.03; e.strokeStyle = hex(glow);
  e.strokeRect(size * 0.03, size * 0.03, size * 0.94, size * 0.94);
  return { map: texture(base), emissiveMap: texture(em) };
}

// --------------------------------------------------------------------- library
// Textures are painted the first time a theme asks for them, then kept.
export class TextureLibrary {
  constructor() { this.cache = new Map(); }

  get(name) {
    if (!this.cache.has(name)) this.cache.set(name, RECIPES[name]());
    return this.cache.get(name);
  }

}

const RECIPES = {
  marbleWhite: () => marble({ seed: 11, base: 0xf4efe6, vein: 0x8d8791, vein2: 0xc9b089, cloud: 0.06 }),
  marbleBlack: () => marble({ seed: 23, base: 0x1b1a22, vein: 0xc9a25a, vein2: 0x6c6a78, cloud: 0.25, veins: 0.8 }),
  marbleCream: () => marble({ seed: 31, base: 0xe9dfcc, vein: 0xa58f6f, vein2: 0xffffff, cloud: 0.08 }),
  marbleGreen: () => marble({ seed: 47, base: 0x16332d, vein: 0x8fc9b0, vein2: 0x0a1614, cloud: 0.3, veins: 0.7 }),
  maple: () => wood({ seed: 5, light: 0xf0d2a0, dark: 0xcf9f62, rings: 5 }),
  walnut: () => wood({ seed: 9, light: 0x6b4226, dark: 0x2e1a0e, rings: 6 }),
  mahogany: () => wood({ seed: 13, light: 0x7a2f1c, dark: 0x3a120a, rings: 9 }),
  basalt: () => basalt({ seed: 3, base: 0x14110f, tint: 0x3a322e }),
  slate: () => basalt({ seed: 17, base: 0x2a2f3a, tint: 0x596274 }),
  lava: () => lava({ seed: 29, rock: 0x241812 }),
  ice: () => ice({ seed: 37, base: 0xa9d8f5, frost: 0xf4fbff }),
  frost: () => ice({ seed: 41, base: 0x6fa9d0, frost: 0xdff2ff }),
  neonCyan: () => neonTile({ seed: 2, glow: 0x25e6ff, bg: 0x071018, fill: 0.24 }),
  neonMagenta: () => neonTile({ seed: 6, glow: 0xff2fd0, bg: 0x0b0612, fill: 0 }),
};
