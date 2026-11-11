// The four worlds. A theme is data (sky, lights, colours, music) plus a
// build() that makes the materials from the procedural texture library.

import * as THREE from 'three';

// Adds a view-angle glow to a lit material: bright at grazing angles.
function rim(material, color, power = 2.5, strength = 1) {
  const uniforms = { uRimColor: { value: new THREE.Color(color) }, uRimPower: { value: power }, uRimStrength: { value: strength } };
  material.userData.rim = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimTerm = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
        totalEmissiveRadiance += uRimColor * rimTerm * uRimStrength;`);
  };
  material.customProgramCacheKey = () => 'rim';
  return material;
}

const turned = (tex, repeatU = 1, repeatV = 1, rotate = false) => {
  const t = tex.clone();
  t.repeat.set(repeatU, repeatV);
  if (rotate) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  t.userData = { clone: true };
  t.needsUpdate = true;
  return t;
};

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);

export const THEMES = {
  marble: {
    name: 'Celestial Marble',
    blurb: 'Polished stone and gold, adrift in a nebula',
    swatch: ['#f4efe6', '#1b1a22', '#ffc45e', '#3b1c7a'],
    sky: {
      top: 0x02030a, horizon: 0x1a1240, bottom: 0x04020c, sharp: 0.55,
      nebA: 0x7a35d0, nebB: 0x1f7fd8, nebula: 1.0, stars: 1.0,
      sunDir: [0.55, 0.42, -0.75], sunColor: 0xfff0d0, sunSize: 0.03, sunGlow: 0.7, clouds: 0, cloudColor: 0, bands: 0,
    },
    lights: {
      hemi: [0x8f9dff, 0x2a1a40, 0.35], key: [0xfff2dd, 2.3, [5, 11, 6]],
      rimA: [0x8a5cff, 14, [-9, 5, -8]], rimB: [0x39a0ff, 12, [9, 4, -9]], under: [0x6a3cff, 30],
    },
    exposure: 0.8, bloom: [0.5, 0.6, 1.3], env: 0.85,
    accent: 0xffc45e, last: 0xf5d76e, check: 0xff3344, hint: 0x55ddff, target: 0xffe08a,
    island: { show: true, top: 0x2b2746, side: 0x221d36, deep: 0x100c18 }, rocks: { color: 0x3a3352, wire: false, crystal: 0xa77bff },
    grid: false, motes: { color: 0xcdb8ff, size: 0.09, rise: 0.12, opacity: 0.8 },
    sparks: { white: [0xfff3d0, 0xffc45e, 0xffffff], black: [0xb08cff, 0x6a3cff, 0xffc45e] },
    tileUV: 'random',
    music: { root: 50, tempo: 62, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -3, 0, 5], [-2, 2, 5, 9]], scale: [0, 2, 3, 5, 7, 8, 10], pad: 'sawtooth', pluck: 'triangle', density: 0.3, drive: false },
    build(tex) {
      const w = tex.get('marbleWhite'), b = tex.get('marbleBlack'), cream = tex.get('marbleCream'), green = tex.get('marbleGreen');
      const gold = () => std({ color: 0xffc56a, metalness: 1, roughness: 0.22, envMapIntensity: 1.8, emissive: 0x3a2200, emissiveIntensity: 1 });
      return {
        white: { body: phys({ map: turned(w.map, 1, 1), color: 0xffffff, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 0.3, sheenColor: 0xfff0dd }), trim: gold() },
        black: { body: phys({ map: turned(b.map, 1, 1), color: 0xffffff, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08 }), trim: gold() },
        tileLight: phys({ map: cream.map, roughness: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
        tileDark: phys({ map: green.map, roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
        frame: phys({ map: turned(b.map, 0.25, 0.25), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }),
        plinth: std({ map: turned(tex.get('slate').map, 0.5, 0.5), normalMap: turned(tex.get('slate').normalMap, 0.5, 0.5), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.75, color: 0x8a86a8 }),
        label: 0xffc56a,
      };
    },
  },

  neon: {
    name: 'Neon Horizon',
    blurb: 'Glass armies on a glowing grid',
    swatch: ['#25e6ff', '#ff2fd0', '#0b0612', '#ff9a3c'],
    sky: {
      top: 0x03010f, horizon: 0x6b0f6e, bottom: 0x02010a, sharp: 0.32,
      nebA: 0x3b1cff, nebB: 0xff2bd0, nebula: 0.3, stars: 0.9,
      sunDir: [0, 0.13, -1], sunColor: 0xff5aa8, sunSize: 0.2, sunGlow: 0.45, clouds: 0, cloudColor: 0, bands: 9,
    },
    lights: {
      hemi: [0x6a5cff, 0x1a0a2a, 0.32], key: [0xd8c8ff, 1.3, [-4, 10, 7]],
      rimA: [0x25e6ff, 26, [-8, 3, 4]], rimB: [0xff2fd0, 26, [8, 3, -4]], under: [0xff2fd0, 16],
    },
    exposure: 0.82, bloom: [0.5, 0.6, 1.05], env: 0.75,
    accent: 0xffffff, last: 0xffe66b, check: 0xff2244, hint: 0x7dff6b, target: 0xffffff,
    island: { show: false, top: 0, side: 0, deep: 0 }, rocks: { color: 0xff2fd0, wire: true, crystal: 0x25e6ff },
    grid: true, motes: { color: 0x7af0ff, size: 0.07, rise: 0.5, opacity: 0.7 },
    sparks: { white: [0x25e6ff, 0xbdf8ff, 0xffffff], black: [0xff2fd0, 0xff9ae8, 0xffffff] },
    tileUV: 'full',
    music: { root: 45, tempo: 96, chords: [[0, 3, 7, 12], [-4, 0, 3, 8], [-9, -5, -2, 3], [-2, 2, 5, 10]], scale: [0, 2, 3, 5, 7, 8, 10], pad: 'sawtooth', pluck: 'sawtooth', density: 0.75, drive: true },
    build(tex) {
      const c = tex.get('neonCyan'), m = tex.get('neonMagenta');
      const glass = (tint, glow) => rim(phys({ color: tint, roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, emissive: glow, emissiveIntensity: 0.12 }), glow, 2.6, 1.25);
      const tube = (glow) => std({ color: 0x111111, emissive: glow, emissiveIntensity: 2.4, roughness: 0.4 });
      return {
        white: { body: glass(0x0c2a36, 0x25e6ff), trim: tube(0x25e6ff) },
        black: { body: glass(0x2e0a2a, 0xff2fd0), trim: tube(0xff2fd0) },
        tileLight: std({ map: c.map, emissiveMap: c.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.25, metalness: 0.6 }),
        tileDark: std({ map: m.map, emissiveMap: m.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.25, metalness: 0.6 }),
        frame: std({ color: 0x0a0812, roughness: 0.3, metalness: 0.8 }),
        plinth: std({ color: 0x05040a, roughness: 0.5, metalness: 0.6, emissive: 0x3a0f8a, emissiveIntensity: 0.12 }),
        label: 0x8ff3ff,
      };
    },
  },

  elemental: {
    name: 'Fire & Ice',
    blurb: 'Clear ice against cracked, burning basalt',
    swatch: ['#bfe6ff', '#ff5a1a', '#14110f', '#19d6c2'],
    sky: {
      top: 0x041226, horizon: 0x1d1426, bottom: 0x4a0d02, sharp: 0.5,
      nebA: 0x19d6c2, nebB: 0x2a6bff, nebula: 0.75, stars: 0.8,
      sunDir: [-0.5, 0.5, -0.7], sunColor: 0xcfe8ff, sunSize: 0.035, sunGlow: 0.5, clouds: 0, cloudColor: 0, bands: 0,
    },
    lights: {
      hemi: [0x8fc4ff, 0x5a1a08, 0.4], key: [0xeaf4ff, 2.0, [-5, 11, 5]],
      rimA: [0x5ab8ff, 44, [-8, 4, 7]], rimB: [0xff5a1a, 60, [8, 3, -7]], under: [0xff4a10, 120],
    },
    exposure: 0.8, bloom: [0.7, 0.65, 1.15], env: 0.9,
    accent: 0xffffff, last: 0xffd27a, check: 0xff2a2a, hint: 0x6bffd8, target: 0xffffff,
    island: { show: true, top: 0x1c1816, side: 0x241a16, deep: 0x5a1606 }, rocks: { color: 0x241c1a, wire: false, crystal: 0xff5a1a },
    grid: false, motes: { color: 0xff8a3c, size: 0.1, rise: 0.9, opacity: 0.9 },
    sparks: { white: [0xbfe6ff, 0xffffff, 0x5ab8ff], black: [0xff5a1a, 0xffc04a, 0xff2a00] },
    tileUV: 'random',
    music: { root: 40, tempo: 54, chords: [[0, 7, 12, 15], [1, 8, 13, 17], [0, 7, 12, 15], [-2, 5, 10, 14]], scale: [0, 1, 3, 5, 7, 8, 10], pad: 'sawtooth', pluck: 'sine', density: 0.22, drive: false },
    build(tex) {
      const iceT = tex.get('ice'), frost = tex.get('frost'), lavaT = tex.get('lava'), bas = tex.get('basalt');
      const iceBody = rim(phys({
        color: 0xd6efff, roughness: 0.07, transmission: 0.92, thickness: 0.7, ior: 1.31, attenuationColor: 0x6fc0ff, attenuationDistance: 0.9,
        normalMap: turned(iceT.normalMap, 2, 2), normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4,
      }), 0x9fdcff, 3, 0.4);
      const magma = std({
        map: turned(lavaT.map, 2, 2), emissiveMap: turned(lavaT.emissiveMap, 2, 2), emissive: 0xffffff, emissiveIntensity: 2.6,
        normalMap: turned(lavaT.normalMap, 2, 2), roughness: 0.75, metalness: 0.1,
      });
      magma.userData.pulse = [2.2, 0.7, 1.3];
      return {
        white: { body: iceBody, trim: std({ color: 0xeaf6ff, emissive: 0x8fd4ff, emissiveIntensity: 0.45, roughness: 0.3 }) },
        black: { body: magma, trim: std({ color: 0x331100, emissive: 0xff7a1a, emissiveIntensity: 3.0, roughness: 0.5 }) },
        tileLight: phys({ map: frost.map, normalMap: frost.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 }),
        tileDark: (() => { const m = std({ map: lavaT.map, emissiveMap: lavaT.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.2, normalMap: lavaT.normalMap, roughness: 0.6 }); m.userData.pulse = [1.2, 0.4, 0.9]; return m; })(),
        frame: std({ map: turned(bas.map, 0.25, 0.25), normalMap: turned(bas.normalMap, 0.25, 0.25), roughness: 0.6, metalness: 0.2 }),
        plinth: std({ map: turned(bas.map, 0.5, 0.5), normalMap: turned(bas.normalMap, 0.5, 0.5), roughness: 0.85 }),
        label: 0xffb061,
      };
    },
  },

  wood: {
    name: 'Golden Hour',
    blurb: 'Maple and walnut under a long sunset',
    swatch: ['#f0d2a0', '#4a2a16', '#ffa55c', '#23406e'],
    sky: {
      top: 0x0c1428, horizon: 0xa4472a, bottom: 0x1a0e1c, sharp: 0.38,
      nebA: 0, nebB: 0, nebula: 0, stars: 0.6,
      sunDir: [-0.62, 0.06, -0.78], sunColor: 0xff9a58, sunSize: 0.05, sunGlow: 1.1, clouds: 1, cloudColor: 0x8a3a30, bands: 0,
    },
    lights: {
      hemi: [0x8aa0d8, 0x4a2a22, 0.42], key: [0xffb070, 2.6, [-8, 6, -4]],
      rimA: [0xff7a3a, 36, [-9, 3, -6]], rimB: [0x5a74d8, 26, [8, 5, 8]], under: [0xff8a4a, 8],
    },
    exposure: 0.8, bloom: [0.45, 0.55, 1.35], env: 0.85,
    accent: 0xfff2c8, last: 0xffe08a, check: 0xff3a2a, hint: 0x7ad0ff, target: 0xfff2c8,
    island: { show: true, top: 0x3a4a2c, side: 0x4a3c34, deep: 0x22181c }, rocks: { color: 0x5a4c44, wire: false, crystal: 0xffa04a },
    grid: false, motes: { color: 0xffe9a0, size: 0.08, rise: 0.08, opacity: 0.9 },
    sparks: { white: [0xfff2c8, 0xffd27a, 0xffffff], black: [0xffa55c, 0xff7a3c, 0xffe08a] },
    tileUV: 'random',
    music: { root: 55, tempo: 70, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 7]], scale: [0, 2, 4, 7, 9], pad: 'triangle', pluck: 'triangle', density: 0.4, drive: false },
    build(tex) {
      const maple = tex.get('maple'), walnut = tex.get('walnut'), mah = tex.get('mahogany');
      const brass = () => std({ color: 0xd9a04a, metalness: 1, roughness: 0.32 });
      const n = new THREE.Vector2(0.5, 0.5);
      return {
        white: { body: phys({ map: turned(maple.map, 1, 1, true), normalMap: turned(maple.normalMap, 1, 1, true), normalScale: n, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }), trim: brass() },
        black: { body: phys({ map: turned(walnut.map, 1, 1, true), normalMap: turned(walnut.normalMap, 1, 1, true), normalScale: n, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.3 }), trim: brass() },
        tileLight: phys({ map: maple.map, normalMap: maple.normalMap, normalScale: n, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
        tileDark: phys({ map: walnut.map, normalMap: walnut.normalMap, normalScale: n, roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
        frame: phys({ map: turned(mah.map, 0.3, 0.3), normalMap: turned(mah.normalMap, 0.3, 0.3), roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
        plinth: std({ map: turned(tex.get('slate').map, 0.5, 0.5), normalMap: turned(tex.get('slate').normalMap, 0.5, 0.5), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.9, color: 0xb9a48c }),
        label: 0xf3cf8a,
      };
    },
  },
};

export const THEME_IDS = Object.keys(THEMES);

export function disposeMaterials(set) {
  if (!set) return;
  const all = [set.white.body, set.white.trim, set.black.body, set.black.trim, set.tileLight, set.tileDark, set.frame, set.plinth];
  for (const m of all) {
    for (const k of ['map', 'normalMap', 'emissiveMap']) if (m[k] && m[k].userData.clone) m[k].dispose();
    m.dispose();
  }
}
