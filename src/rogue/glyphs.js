// Card and relic pictures, drawn with canvas paths when first needed. Each
// glyph is a few strokes in a 100x100 box; the card art puts one on a painted
// background in the colour of the card's kind.

import { makeNoise } from '../gfx/noise.js';
import { pixelate } from '../gfx/pixelui.js';

export const KIND_COLOR = {
  move: '#1f9a8a', guard: '#3f72c8', control: '#5aa8d0', attack: '#c8443e', utility: '#7e58c8', summon: '#3f9a54', relic: '#c8963a',
};

const P = Math.PI;
const GLYPHS = {
  step: (c) => { c.moveTo(50, 82); c.lineTo(50, 24); c.moveTo(28, 46); c.lineTo(50, 22); c.lineTo(72, 46); },
  shield: (c) => { c.moveTo(50, 14); c.lineTo(82, 26); c.lineTo(78, 58); c.quadraticCurveTo(70, 80, 50, 88); c.quadraticCurveTo(30, 80, 22, 58); c.lineTo(18, 26); c.closePath(); c.moveTo(50, 30); c.lineTo(50, 72); },
  snow: (c) => { for (let i = 0; i < 6; i++) { const a = (i * P) / 3, x = Math.cos(a), y = Math.sin(a); c.moveTo(50, 50); c.lineTo(50 + x * 36, 50 + y * 36); const bx = 50 + x * 24, by = 50 + y * 24; c.moveTo(bx, by); c.lineTo(bx + Math.cos(a + 1) * 10, by + Math.sin(a + 1) * 10); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a - 1) * 10, by + Math.sin(a - 1) * 10); } },
  bolt: (c) => { c.moveTo(58, 10); c.lineTo(30, 54); c.lineTo(50, 54); c.lineTo(40, 90); c.lineTo(72, 42); c.lineTo(52, 42); c.closePath(); },
  eye: (c) => { c.moveTo(12, 50); c.quadraticCurveTo(50, 12, 88, 50); c.quadraticCurveTo(50, 88, 12, 50); c.moveTo(62, 50); c.arc(50, 50, 12, 0, P * 2); },
  pawn: (c) => { c.arc(50, 30, 13, 0, P * 2); c.moveTo(38, 46); c.lineTo(62, 46); c.moveTo(42, 46); c.quadraticCurveTo(44, 66, 30, 80); c.lineTo(70, 80); c.quadraticCurveTo(56, 66, 58, 46); },
  swap: (c) => { c.moveTo(20, 36); c.lineTo(76, 36); c.moveTo(62, 22); c.lineTo(78, 36); c.lineTo(62, 50); c.moveTo(80, 66); c.lineTo(24, 66); c.moveTo(38, 52); c.lineTo(22, 66); c.lineTo(38, 80); },
  wall: (c) => { c.rect(16, 28, 68, 48); c.moveTo(16, 44); c.lineTo(84, 44); c.moveTo(16, 60); c.lineTo(84, 60); c.moveTo(38, 28); c.lineTo(38, 44); c.moveTo(62, 28); c.lineTo(62, 44); c.moveTo(50, 44); c.lineTo(50, 60); c.moveTo(30, 60); c.lineTo(30, 76); c.moveTo(70, 60); c.lineTo(70, 76); },
  home: (c) => { c.moveTo(18, 50); c.lineTo(50, 20); c.lineTo(82, 50); c.moveTo(28, 44); c.lineTo(28, 82); c.lineTo(72, 82); c.lineTo(72, 44); c.moveTo(44, 82); c.lineTo(44, 62); c.lineTo(56, 62); c.lineTo(56, 82); },
  leap: (c) => { c.moveTo(18, 78); c.quadraticCurveTo(34, 10, 74, 34); c.moveTo(58, 22); c.lineTo(76, 34); c.lineTo(62, 50); c.moveTo(18, 78); c.arc(18, 78, 3, 0, P * 2); },
  clock: (c) => { c.arc(50, 50, 34, 0, P * 2); c.moveTo(50, 50); c.lineTo(50, 28); c.moveTo(50, 50); c.lineTo(66, 58); },
  crown: (c) => { c.moveTo(18, 74); c.lineTo(14, 34); c.lineTo(34, 52); c.lineTo(50, 24); c.lineTo(66, 52); c.lineTo(86, 34); c.lineTo(82, 74); c.closePath(); c.moveTo(18, 84); c.lineTo(82, 84); },
  portal: (c) => { c.ellipse(50, 50, 20, 34, 0, 0, P * 2); c.moveTo(50, 20); c.ellipse(50, 50, 9, 22, 0, -P / 2, P * 1.2); c.moveTo(16, 50); c.lineTo(24, 50); c.moveTo(76, 50); c.lineTo(84, 50); },
  flag: (c) => { c.moveTo(26, 88); c.lineTo(26, 14); c.lineTo(78, 26); c.lineTo(26, 46); },
  drop: (c) => { c.moveTo(50, 12); c.quadraticCurveTo(82, 54, 70, 72); c.quadraticCurveTo(50, 94, 30, 72); c.quadraticCurveTo(18, 54, 50, 12); },
  star: (c) => { for (let i = 0; i < 10; i++) { const a = -P / 2 + (i * P) / 5, r = i % 2 ? 16 : 38; c[i ? 'lineTo' : 'moveTo'](50 + Math.cos(a) * r, 50 + Math.sin(a) * r); } c.closePath(); },
  spark: (c) => { for (let i = 0; i < 8; i++) { const a = (i * P) / 4, r0 = i % 2 ? 14 : 10, r1 = i % 2 ? 26 : 40; c.moveTo(50 + Math.cos(a) * r0, 50 + Math.sin(a) * r0); c.lineTo(50 + Math.cos(a) * r1, 50 + Math.sin(a) * r1); } c.moveTo(56, 50); c.arc(50, 50, 6, 0, P * 2); },
  turn: (c) => { c.arc(50, 50, 30, P * 0.15, P * 0.95); c.moveTo(80, 50); c.arc(50, 50, 30, P * 1.15, P * 1.95); c.moveTo(14, 44); c.lineTo(22, 60); c.lineTo(36, 50); c.moveTo(86, 56); c.lineTo(78, 40); c.lineTo(64, 50); },
  meteor: (c) => { c.arc(36, 66, 18, 0, P * 2); c.moveTo(50, 54); c.lineTo(86, 14); c.moveTo(54, 64); c.lineTo(88, 38); c.moveTo(44, 48); c.lineTo(66, 12); },
  coin: (c) => { c.arc(50, 50, 32, 0, P * 2); c.moveTo(58, 38); c.quadraticCurveTo(40, 30, 40, 44); c.quadraticCurveTo(40, 52, 50, 52); c.quadraticCurveTo(62, 52, 60, 62); c.quadraticCurveTo(56, 72, 40, 64); c.moveTo(50, 28); c.lineTo(50, 72); },
};

export function drawGlyph(ctx, name, x, y, size, color = '#fff', width = 6) {
  const g = GLYPHS[name] || GLYPHS.star;
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.beginPath(); g(ctx); ctx.stroke();
  ctx.restore();
}

const cache = new Map();

// The picture on a card, as a data URL.
export function cardArt(card) {
  const key = 'card:' + card.id;
  if (cache.has(key)) return cache.get(key);
  const w = 264, h = 150;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const color = KIND_COLOR[card.kind] || '#888';
  const grad = ctx.createRadialGradient(w / 2, h * 0.55, 8, w / 2, h / 2, w * 0.7);
  grad.addColorStop(0, color); grad.addColorStop(0.55, shade(color, 0.35)); grad.addColorStop(1, '#0a0a14');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  // drifting streaks, different for every card
  let seed = 7;
  for (const ch of card.id) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const N = makeNoise(Math.abs(seed) + 1);
  ctx.globalAlpha = 0.16; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    let x = N.rnd() * w, y = N.rnd() * h;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) { const a = N.n2(x * 0.012, y * 0.012) * P * 4; x += Math.cos(a) * 9; y += Math.sin(a) * 9; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawGlyph(ctx, card.glyph, w / 2 - 55, h / 2 - 55, 110, '#ffffff', 8);
  const url = pixelate(c, 84, 48, { levels: 5 }).toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// A square icon of a card, for the compact cards on phones: 32 by 32 pixels.
export function cardIcon(card) {
  const key = 'icon:' + card.id;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const color = KIND_COLOR[card.kind] || '#888';
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 90);
  grad.addColorStop(0, color); grad.addColorStop(0.6, shade(color, 0.35)); grad.addColorStop(1, '#0a0a14');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
  drawGlyph(ctx, card.glyph, 14, 14, 100, '#ffffff', 11);
  const url = pixelate(c, 32, 32, { levels: 5 }).toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// A small round badge for a relic.
export function badge(glyph, color = KIND_COLOR.relic) {
  const key = 'badge:' + glyph + color;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 72;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(36, 30, 4, 36, 36, 36);
  grad.addColorStop(0, shade(color, 0.9)); grad.addColorStop(1, shade(color, 0.25));
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(36, 36, 34, 0, P * 2); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.stroke();
  drawGlyph(ctx, glyph, 14, 14, 44, '#fff', 10);
  const url = pixelate(c, 18, 18, { levels: 5 }).toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// The parchment the run map is drawn on: dark, stained, with faint contour
// lines like an old survey.
export function mapTexture(w = 640, h = 720) {
  const key = `map:${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const N = makeNoise(913);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = N.fbm2(u * 3.2, v * 3.6, 5);
      const stain = N.fbm2(u * 9 + 4, v * 9 + 1, 3);
      const contour = Math.abs(((n * 14) % 1) - 0.5) < 0.035 ? 1 : 0;
      const edge = Math.min(u, v, 1 - u, 1 - v);
      const dark = 1 - Math.min(1, edge * 6) * 0.35;
      const base = 26 + n * 22 + stain * 10;
      const i = (y * w + x) * 4;
      img.data[i] = (base * 1.05 + contour * 26) * (1 - dark * 0.55);
      img.data[i + 1] = (base * 0.92 + contour * 20) * (1 - dark * 0.55);
      img.data[i + 2] = (base * 0.78 + contour * 12) * (1 - dark * 0.55);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // a faint survey grid
  ctx.strokeStyle = 'rgba(200,180,140,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
  const url = pixelate(c, Math.round(w / 4), Math.round(h / 4), { levels: 12, dither: false }).toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// A small film-grain tile laid over the whole screen.
export function grainTexture(size = 160) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.random() * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

// Node symbols for the map, as SVG path data in a 100 by 100 box.
export const MAP_GLYPH = {
  battle: 'M24 24 L76 76 M76 24 L24 76 M18 60 L40 82 M60 82 L82 60',
  elite: 'M30 56 A22 22 0 1 1 70 56 L66 72 L34 72 Z M38 52 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M52 52 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M44 72 L44 82 M56 72 L56 82',
  boss: 'M18 72 L14 30 L34 50 L50 20 L66 50 L86 30 L82 72 Z M18 84 L82 84',
  shop: 'M24 50 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0 M58 38 Q40 30 40 44 Q40 52 50 52 Q62 52 60 62 Q56 72 40 64 M50 26 L50 74',
  camp: 'M50 16 Q72 42 62 58 Q72 50 70 40 Q88 62 70 80 Q50 94 30 80 Q14 62 34 44 Q34 56 42 60 Q32 38 50 16 Z',
  event: 'M34 36 Q34 18 50 18 Q68 18 68 36 Q68 48 52 54 L50 66 M50 78 L50 84',
  start: 'M30 86 L30 14 L76 26 L30 44',
};

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, '0');
  return '#' + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255);
}
