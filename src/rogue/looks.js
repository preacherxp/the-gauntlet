// What makes each piece in your army look like itself. Every temper has its
// own headgear and kit, built from primitives, and every individual is a
// little taller or broader than the next. Pieces with a temper also stand on
// a ring of its colour, so a crowded board still reads at a glance.

import * as THREE from 'three';
import { createPiece } from '../gfx/pieces.js';
import { PAWN, YOU } from './rules.js';

export const PERSONA_COLOR = {
  bold: 0xd8452f, cautious: 0xe8cf6a, restless: 0x9be23a, sly: 0x7a48d8, ambitious: 0xffc83a, stubborn: 0x9a9aa6,
  greedy: 0x2f9cff, bookish: 0xb0743e, furious: 0xff5a14, lucky: 0x3ccf5a, gentle: 0xff9ccf, loud: 0xff4fd8, regal: 0xffd27a,
};

// The pawn's head after pieces.js scales it: centre height, radius, top, collar.
const HY = 0.614, HR = 0.152, TOP = 0.742, COLLAR = 0.465;
const PI = Math.PI;

const cache = new Map();
function mat(color, { metal = 0, rough = 0.6, glow = 0.12, double = false } = {}) {
  const key = [color, metal, rough, glow, double].join('|');
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color, metalness: metal, roughness: rough, emissive: color, emissiveIntensity: glow, side: double ? THREE.DoubleSide : THREE.FrontSide,
    }));
  }
  return cache.get(key);
}

function part(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}
const group = (...kids) => { const g = new THREE.Group(); g.add(...kids); return g; };

// A cape hanging from the collar down the back (+z, the side the camera sees).
const cape = (material, radius = 0.27, height = 0.44) =>
  part(new THREE.ConeGeometry(radius, height, 20, 1, true, -PI / 2, PI), material, 0, COLLAR + 0.02 - height / 2, 0);

// ------------------------------------------------------------------ the looks
const LOOKS = {
  // A crested helmet with a red plume running front to back.
  bold() {
    const steel = mat(0xc4c8d2, { metal: 0.85, rough: 0.3 }), plume = mat(PERSONA_COLOR.bold, { rough: 0.85, glow: 0.18 });
    const crest = part(new THREE.TorusGeometry(HR * 1.02, 0.05, 8, 22, PI), plume, 0, HY + 0.03, 0, 0, PI / 2, 0);
    crest.scale.set(1, 1.5, 0.5);
    return group(
      part(new THREE.SphereGeometry(HR * 1.1, 24, 12, 0, PI * 2, 0, PI / 2), steel, 0, HY - 0.005, 0),
      part(new THREE.TorusGeometry(HR * 1.1, 0.014, 6, 28), steel, 0, HY, 0, PI / 2),
      crest,
      part(new THREE.ConeGeometry(0.05, 0.24, 10), plume, 0, HY + 0.06, HR * 1.1 + 0.07, PI / 2 + 0.45),
    );
  },

  // A saucepan for a helmet, and a round shield held close.
  cautious() {
    const steel = mat(0x9fa4ae, { metal: 0.7, rough: 0.4 }), paint = mat(PERSONA_COLOR.cautious, { rough: 0.7, glow: 0.1 });
    const shield = group(
      part(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 26), paint, 0, 0, 0, 0, 0, PI / 2),
      part(new THREE.TorusGeometry(0.15, 0.014, 6, 30), steel, 0, 0, 0, 0, PI / 2, 0),
      part(new THREE.SphereGeometry(0.038, 12, 8), steel, -0.018, 0, 0),
    );
    shield.position.set(-0.22, 0.3, 0.02);
    shield.rotation.y = -0.35;
    return group(
      part(new THREE.CylinderGeometry(HR * 1.08, HR * 1.02, 0.12, 22), steel, 0, HY + 0.07, 0),
      part(new THREE.CylinderGeometry(HR * 1.32, HR * 1.32, 0.016, 26), steel, 0, HY + 0.015, 0),
      part(new THREE.BoxGeometry(0.19, 0.028, 0.036), steel, HR * 1.08 + 0.085, HY + 0.1, 0, 0, 0, -0.18),
      shield,
    );
  },

  // A headband whose long tails stream out behind.
  restless() {
    const lime = mat(PERSONA_COLOR.restless, { rough: 0.6, glow: 0.3 });
    const tail = (side, i) => {
      const geo = new THREE.BoxGeometry(0.042, 0.012, 0.24).translate(0, 0, 0.12);
      const m = part(geo, lime, side * 0.035, HY + 0.02, HR * 0.92, 0.6, side * 0.28, 0);
      m.userData = { anim: 'flap', base: 0.6, ph: i * 1.7 };
      return m;
    };
    return group(part(new THREE.TorusGeometry(HR * 1.0, 0.026, 8, 28), lime, 0, HY + 0.02, 0, PI / 2), tail(-1, 0), tail(1, 1));
  },

  // A tall pointed hood and a cape, with two eyes glinting in the dark.
  sly() {
    const cloth = mat(0x3a2366, { rough: 0.9, glow: 0.1, double: true }), dark = mat(0x050308, { glow: 0 });
    const eye = mat(0xc8a0ff, { glow: 2.4 });
    return group(
      part(new THREE.ConeGeometry(HR * 1.5, 0.46, 22), cloth, 0, HY + 0.1, 0.02, 0.32),
      part(new THREE.CircleGeometry(0.1, 20), dark, 0, HY, -HR * 1.12, 0, PI, 0),
      part(new THREE.SphereGeometry(0.016, 8, 6), eye, -0.04, HY + 0.01, -HR * 1.14),
      part(new THREE.SphereGeometry(0.016, 8, 6), eye, 0.04, HY + 0.01, -HR * 1.14),
      cape(cloth),
    );
  },

  // A crown worn at an angle, and a red cape.
  ambitious() {
    const gold = mat(PERSONA_COLOR.ambitious, { metal: 1, rough: 0.25, glow: 0.22, double: true });
    const red = mat(0xb0162a, { rough: 0.7, glow: 0.12, double: true }), gem = mat(0xff2a50, { glow: 0.9 });
    const crown = group(part(new THREE.CylinderGeometry(HR * 0.8, HR * 0.74, 0.07, 22, 1, true), gold));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      crown.add(part(new THREE.ConeGeometry(0.024, 0.08, 6), gold, Math.sin(a) * HR * 0.8, 0.07, Math.cos(a) * HR * 0.8));
      if (i % 2 === 0) crown.add(part(new THREE.SphereGeometry(0.016, 8, 6), gem, Math.sin(a) * HR * 0.82, 0, Math.cos(a) * HR * 0.82));
    }
    crown.position.set(0, TOP - 0.035, 0);
    crown.rotation.z = 0.24;
    return group(crown, cape(red, 0.26, 0.42));
  },

  // A flat-topped bucket helm with a slit, and a pair of horns.
  stubborn() {
    const iron = mat(0x8e9098, { metal: 0.8, rough: 0.45 }), bone = mat(0xeee3c8, { rough: 0.5, glow: 0.08 }), dark = mat(0x08080a, { glow: 0 });
    return group(
      part(new THREE.CylinderGeometry(HR * 1.14, HR * 1.14, 0.27, 22), iron, 0, HY + 0.02, 0),
      part(new THREE.CylinderGeometry(HR * 1.2, HR * 1.2, 0.022, 22), iron, 0, HY + 0.16, 0),
      part(new THREE.TorusGeometry(HR * 1.15, 0.013, 6, 28), iron, 0, HY - 0.08, 0, PI / 2),
      part(new THREE.BoxGeometry(HR * 1.5, 0.024, 0.02), dark, 0, HY + 0.03, -HR * 1.14),
      part(new THREE.ConeGeometry(0.042, 0.17, 10), bone, HR * 1.14 + 0.06, HY + 0.09, 0, 0, 0, -1.1),
      part(new THREE.ConeGeometry(0.042, 0.17, 10), bone, -HR * 1.14 - 0.06, HY + 0.09, 0, 0, 0, 1.1),
    );
  },

  // A beret with a blue feather, and a sack of loot slung on its back.
  greedy() {
    const burlap = mat(0xcfae78, { rough: 0.95, glow: 0.06 }), coin = mat(0xffd24a, { metal: 1, rough: 0.25, glow: 0.3 });
    const navy = mat(0x1e2a4a, { rough: 0.8, glow: 0.08 }), feather = mat(PERSONA_COLOR.greedy, { rough: 0.6, glow: 0.4 });
    const sack = part(new THREE.SphereGeometry(0.12, 16, 12), burlap, 0.03, 0.36, 0.2);
    sack.scale.set(1, 1.12, 0.85);
    const beret = part(new THREE.SphereGeometry(HR * 1.1, 18, 8), navy, 0.02, TOP - 0.02, 0, 0, 0, 0.2);
    beret.scale.set(1.15, 0.38, 1.15);
    const plume = part(new THREE.BoxGeometry(0.024, 0.24, 0.055).translate(0, 0.12, 0), feather, -0.07, TOP, 0.03, 0.35, 0, 0.55);
    plume.userData = { anim: 'sway', base: 0.55, ph: 0.4 };
    return group(
      sack, beret, plume,
      part(new THREE.ConeGeometry(0.05, 0.08, 10), burlap, 0.03, 0.51, 0.2),
      part(new THREE.CylinderGeometry(0.034, 0.034, 0.011, 14), coin, 0.0, 0.5, 0.15, 0.5, 0, 0.3),
      part(new THREE.CylinderGeometry(0.034, 0.034, 0.011, 14), coin, 0.07, 0.49, 0.22, -0.3, 0, -0.5),
    );
  },

  // A mortarboard with a tassel, spectacles, and a book under one arm.
  bookish() {
    const black = mat(0x1a1a22, { rough: 0.6, glow: 0.05 }), gold = mat(0xffd24a, { metal: 0.8, rough: 0.3, glow: 0.25 });
    const leather = mat(PERSONA_COLOR.bookish, { rough: 0.7, glow: 0.08 }), paper = mat(0xf2ead8, { rough: 0.9, glow: 0.1 });
    const wire = mat(0xd8d8e0, { metal: 0.9, rough: 0.2 });
    const tassel = part(new THREE.BoxGeometry(0.012, 0.14, 0.012).translate(0, -0.07, 0), gold, 0.25, TOP + 0.03, 0);
    tassel.userData = { anim: 'sway', base: 0, ph: 1.1 };
    const book = group(part(new THREE.BoxGeometry(0.15, 0.19, 0.045), leather), part(new THREE.BoxGeometry(0.135, 0.175, 0.05), paper, 0.01, 0, 0));
    book.position.set(0.22, 0.32, 0.03);
    book.rotation.z = -0.2;
    return group(
      part(new THREE.CylinderGeometry(HR * 0.9, HR * 0.95, 0.07, 20), black, 0, TOP - 0.025, 0),
      part(new THREE.BoxGeometry(0.36, 0.022, 0.36), black, 0, TOP + 0.02, 0, 0, PI / 4, 0),
      part(new THREE.SphereGeometry(0.022, 10, 8), gold, 0, TOP + 0.036, 0),
      tassel, book,
      part(new THREE.TorusGeometry(0.036, 0.007, 6, 18), wire, -0.046, HY + 0.005, -HR * 0.97),
      part(new THREE.TorusGeometry(0.036, 0.007, 6, 18), wire, 0.046, HY + 0.005, -HR * 0.97),
    );
  },

  // Hair that is actually fire.
  furious() {
    const fire = [mat(0xff5a14, { glow: 1.7, rough: 0.5 }), mat(0xffb000, { glow: 1.7, rough: 0.5 }), mat(0xff2a00, { glow: 1.7, rough: 0.5 })];
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.7, h = 0.13 + 0.11 * (1 - Math.abs(a) / 0.85);
      const flame = part(new THREE.ConeGeometry(0.046, h, 8).translate(0, h / 2, 0), fire[i % 3],
        Math.sin(a) * HR * 0.8, HY + Math.cos(a) * HR * 0.72, (i % 2) * 0.04 - 0.02, 0, 0, -a);
      flame.userData = { anim: 'flame', ph: i * 1.3 };
      g.add(flame);
    }
    return g;
  },

  // A green top hat with a four-leaf clover in its band.
  lucky() {
    const green = mat(0x1d7a3c, { rough: 0.6, glow: 0.08 }), gold = mat(0xffd24a, { metal: 0.8, rough: 0.3, glow: 0.2 });
    const leaf = mat(PERSONA_COLOR.lucky, { rough: 0.5, glow: 0.45 });
    const hat = group(
      part(new THREE.CylinderGeometry(HR * 1.45, HR * 1.45, 0.018, 26), green),
      part(new THREE.CylinderGeometry(HR * 0.85, HR * 0.95, 0.22, 22), green, 0, 0.11, 0),
      part(new THREE.CylinderGeometry(HR * 0.97, HR * 0.97, 0.04, 22), gold, 0, 0.03, 0),
    );
    const clover = group(part(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), leaf, 0, -0.04, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      const l = part(new THREE.SphereGeometry(0.03, 10, 8), leaf, 0, Math.cos(a) * 0.03, Math.sin(a) * 0.03);
      l.scale.set(0.35, 1, 1);
      clover.add(l);
    }
    clover.position.set(HR * 0.98, 0.07, 0.02);
    hat.add(clover);
    hat.position.set(0, TOP - 0.035, 0);
    hat.rotation.z = -0.16;
    return hat;
  },

  // A floating halo, a flower behind one ear, and a satchel of bandages.
  gentle() {
    const halo = part(new THREE.TorusGeometry(HR * 0.8, 0.02, 8, 32), mat(0xffe6f2, { glow: 2.4 }), 0, TOP + 0.11, 0, PI / 2);
    halo.userData = { anim: 'halo', base: TOP + 0.11, ph: 0 };
    const white = mat(0xf4f0ea, { rough: 0.8, glow: 0.1 }), pink = mat(PERSONA_COLOR.gentle, { rough: 0.6, glow: 0.35 });
    const satchel = group(
      part(new THREE.BoxGeometry(0.13, 0.12, 0.06), white),
      part(new THREE.BoxGeometry(0.065, 0.02, 0.006), pink, 0, 0, 0.033),
      part(new THREE.BoxGeometry(0.02, 0.065, 0.006), pink, 0, 0, 0.033),
    );
    satchel.position.set(-0.18, 0.27, 0.05);
    satchel.rotation.z = 0.15;
    const flower = group(part(new THREE.SphereGeometry(0.018, 8, 6), mat(0xffe066, { glow: 0.5 })));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      flower.add(part(new THREE.SphereGeometry(0.02, 8, 6), pink, 0, Math.cos(a) * 0.028, Math.sin(a) * 0.028));
    }
    flower.position.set(HR * 0.95, HY + 0.05, 0.03);
    return group(halo, satchel, flower);
  },

  // A beanie with a bobble, and a megaphone raised to the mouth.
  loud() {
    const mag = mat(PERSONA_COLOR.loud, { rough: 0.5, glow: 0.35, double: true }), white = mat(0xf4f0ea, { rough: 0.6, glow: 0.12 });
    // The cone's wide end points up and out, its narrow end at the side of the head.
    return group(
      part(new THREE.ConeGeometry(0.1, 0.24, 18, 1, true), mag, HR * 0.9 + 0.085, HY - 0.02 + 0.085, -0.02, 0, 0, (3 * PI) / 4),
      part(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 10), white, HR * 0.9, HY - 0.02, -0.02, 0, 0, (3 * PI) / 4),
      part(new THREE.SphereGeometry(HR * 1.08, 18, 10, 0, PI * 2, 0, PI / 2), mag, 0, HY + 0.01, 0),
      part(new THREE.TorusGeometry(HR * 1.08, 0.02, 6, 26), white, 0, HY + 0.012, 0, PI / 2),
      part(new THREE.SphereGeometry(0.04, 12, 8), white, 0, TOP + 0.035, 0),
    );
  },
};
export const LOOK_IDS = Object.keys(LOOKS);

const templates = new Map();
function template(perk) {
  if (!templates.has(perk)) templates.set(perk, LOOKS[perk]());
  return templates.get(perk);
}

// Pieces that are not pawns carry a small pennant in their colour instead.
function pennant(perk, pc) {
  const color = PERSONA_COLOR[perk] || 0xffffff;
  const flag = new THREE.Shape();
  flag.moveTo(0, 0); flag.lineTo(0.16, -0.045); flag.lineTo(0, -0.09); flag.closePath();
  const top = Math.min(pc.height, 1.1) * 0.75;
  const g = group(
    part(new THREE.CylinderGeometry(0.008, 0.008, top, 6), mat(0xd8d0c0, { metal: 0.6, rough: 0.4 }), 0, top / 2, 0),
    part(new THREE.ShapeGeometry(flag), mat(color, { glow: 0.35, double: true }), 0, top, 0),
  );
  g.position.set(pc.radius * 0.82, 0, pc.radius * 0.45);
  g.children[1].userData = { anim: 'sway', base: 0, ph: 2 };
  return g;
}

const ringGeo = new THREE.RingGeometry(0.37, 0.43, 40).rotateX(-PI / 2);
const ringMats = new Map();
function ring(perk) {
  if (!ringMats.has(perk)) {
    ringMats.set(perk, new THREE.MeshBasicMaterial({ color: new THREE.Color(PERSONA_COLOR[perk] || 0xffffff).multiplyScalar(1.3), transparent: true, opacity: 0.85, depthWrite: false }));
  }
  const m = new THREE.Mesh(ringGeo, ringMats.get(perk));
  m.position.y = 0.009;
  m.renderOrder = 1;
  return m;
}

function seeded(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

// Give a piece its temper's look. `name` makes each individual a little
// different; `plain` (for portraits) leaves out that and the floor ring.
export function dressPersona(pc, perk, name = '', { plain = false } = {}) {
  pc.perk = perk || null;
  pc.pname = name;
  pc.baseRotY = pc.model.rotation.y;
  pc.flutter = [];
  if (!perk || !PERSONA_COLOR[perk]) return pc;
  const rnd = seeded(name + ':' + perk);
  const sy = plain ? 1 : 0.92 + rnd() * 0.16, sx = plain ? 1 : 0.94 + rnd() * 0.12;
  for (const m of [pc.body, pc.trim]) m.scale.set(sx, sy, sx);
  pc.height *= sy;
  let look = null;
  if (pc.type === PAWN && LOOKS[perk]) look = template(perk).clone();
  else if (perk !== 'regal') look = pennant(perk, pc);
  if (look) {
    look.scale.set(sx, sy, sx);
    if (!plain && pc.type === PAWN) look.rotation.y = (rnd() - 0.5) * 0.5;
    pc.model.add(look);
    look.traverse((o) => { if (o.userData && o.userData.anim) pc.flutter.push(o); });
  }
  pc.look = look;
  if (!plain) pc.model.add(ring(perk));
  return pc;
}

// The small moving parts: ribbons, flames, halos, feathers.
export function animateLook(pc, t) {
  for (const o of pc.flutter) {
    const u = o.userData;
    if (u.anim === 'flap') o.rotation.x = u.base + Math.sin(t * 13 + u.ph) * 0.35;
    else if (u.anim === 'flame') o.scale.set(1, 1 + Math.sin(t * 17 + u.ph) * 0.2, 1);
    else if (u.anim === 'halo') o.position.y = u.base + Math.sin(t * 2.2) * 0.018;
    else if (u.anim === 'sway') o.rotation.z = u.base + Math.sin(t * 2.4 + u.ph) * 0.12;
  }
}

// Portraits of a pawn of every temper, for the army roll, shop and rewards.
export function personaIcons(stage, mats) {
  const out = {};
  for (const perk of LOOK_IDS) {
    const r = stage.renderIcons(() => { const p = createPiece(PAWN, YOU, mats); dressPersona(p, perk, '', { plain: true }); p.height = 1.02; return p; }, [PAWN]);
    out[perk] = r.urls[PAWN];
  }
  return out;
}
