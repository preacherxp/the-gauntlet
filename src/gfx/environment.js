// Everything around the board: the shader sky, stars, the floating island,
// drifting rocks, dust in the air, the lights, and the reflection map that is
// rendered from the sky itself.

import * as THREE from 'three';
import { makeNoise, makeRng } from './noise.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uBottom, uNebA, uNebB, uSunDir, uSunColor, uCloudColor;
uniform float uNebula, uSunSize, uSunGlow, uClouds, uBands, uTime, uSharp;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(h, uSharp)) : mix(uHorizon, uBottom, pow(-h, 0.45));

  if (uNebula > 0.001) {
    vec3 q = d * 2.2;
    float w = fbm(q + uTime * 0.004);
    float n1 = fbm(q * 1.3 + w * 1.5 + vec3(3.1, 0.0, 1.2));
    float n2 = fbm(q * 1.9 - w * 1.2 + vec3(-4.0, 2.2, 0.7));
    col += uNebA * pow(smoothstep(0.38, 0.85, n1), 2.0) * uNebula * 0.85;
    col += uNebB * pow(smoothstep(0.42, 0.9, n2), 2.0) * uNebula * 0.7;
  }

  vec3 s = normalize(uSunDir);
  float sd = dot(d, s);

  if (uClouds > 0.001) {
    vec2 cp = d.xz / (abs(h) + 0.22);
    float c = fbm(vec3(cp * 1.3 + uTime * 0.008, 1.0));
    float m = smoothstep(0.46, 0.74, c) * smoothstep(-0.03, 0.18, h);
    vec3 lit = uCloudColor * (0.55 + 1.1 * pow(max(sd, 0.0), 3.0));
    col = mix(col, lit, m * uClouds * 0.85);
  }

  float ang = acos(clamp(sd, -1.0, 1.0));
  float disc = smoothstep(uSunSize, uSunSize * 0.94, ang);
  if (uBands > 0.5) {
    float yy = (d.y - s.y) / uSunSize;
    float cut = yy > 0.05 ? 1.0 : step(0.42 + 0.3 * clamp(-yy, 0.0, 1.0), fract(yy * uBands * 0.5));
    vec3 grad = mix(vec3(1.0, 0.18, 0.55), vec3(1.0, 0.85, 0.25), clamp(yy * 0.5 + 0.5, 0.0, 1.0));
    col = mix(col, grad * 1.6, disc * cut);
  } else {
    col += uSunColor * disc * 5.0;
  }
  col += uSunColor * (pow(max(sd, 0.0), 10.0) * 0.22 + pow(max(sd, 0.0), 160.0) * 0.9) * uSunGlow;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */`
attribute float aSize; attribute float aPhase;
uniform float uTime, uPixelRatio;
varying float vTwinkle;
void main() {
  vTwinkle = 0.7 + 0.3 * sin(uTime * (1.0 + aPhase * 0.4) + aPhase * 20.0);
  gl_PointSize = aSize * uPixelRatio * vTwinkle;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const STAR_FRAG = /* glsl */`
uniform float uOpacity; varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a * a * uOpacity * vTwinkle * 1.6, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const MOTE_VERT = /* glsl */`
attribute vec3 aSeed;
uniform float uTime, uRise, uSize, uScale;
varying float vFade;
void main() {
  vec3 p = position;
  p.y = mod(position.y + uTime * uRise * (0.5 + aSeed.x), 16.0) - 5.0;
  p.x += sin(uTime * 0.31 + aSeed.y * 6.283) * 0.7;
  p.z += cos(uTime * 0.27 + aSeed.z * 6.283) * 0.7;
  vFade = smoothstep(-5.0, -3.0, p.y) * smoothstep(11.0, 8.0, p.y) * (0.55 + 0.45 * sin(uTime * 1.7 + aSeed.y * 40.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = min(uSize * (0.5 + aSeed.z) * uScale / -mv.z, 26.0);   // a mote right at the lens stays a mote
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uOpacity; varying float vFade;
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(uColor * a * a * vFade * uOpacity * 2.0, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GRID_FRAG = /* glsl */`
varying vec3 vWorld;
uniform float uTime; uniform vec3 uColorA, uColorB;
void main() {
  vec2 p = vWorld.xz / 4.0;
  p.y += uTime * 0.35;
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  float lineV = 1.0 - min(min(g.x, g.y), 1.0);
  float dist = length(vWorld.xz);
  float fade = smoothstep(190.0, 20.0, dist);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 90.0, dist)) * lineV * fade * 1.1;
  col += uColorB * 0.02 * fade;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// A lump of floating rock: a sphere with a flattened top, a long ragged
// underside, and flat-shaded facets.
function islandGeometry(noise) {
  const g = new THREE.IcosahedronGeometry(1, 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise.fbm3(x * 1.6 + 5, y * 1.6, z * 1.6 + 9, 4);
    const R = 10.2 * (0.92 + 0.22 * n);
    if (y >= 0) {
      // Flat under the board, rising into rough ground and boulders toward the rim.
      const flat = Math.hypot(x * R, z * R);
      const wild = THREE.MathUtils.smoothstep(flat, 7.4, 9.8);
      const bump = noise.fbm3(x * 7, 3.3, z * 7, 4) - 0.45;
      const edge = Math.pow(1 - y, 4);                       // 1 at the rim, 0 on top
      p.setXYZ(i, x * R, -0.58 + bump * (0.1 + wild * 1.5) - edge * 0.7, z * R);
    } else {
      const t = -y;
      const spike = Math.pow(noise.fbm3(x * 3.2 + 20, t * 1.5, z * 3.2 + 7, 4), 2) * 2.4;
      const pinch = 1 - 0.55 * Math.pow(t, 1.4);
      p.setXYZ(i, x * R * pinch, -1.28 - Math.pow(t, 0.75) * (5.2 + spike * 3.2), z * R * pinch);
    }
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3));
  return g;
}

function rockGeometry(noise, seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.62 + 0.75 * noise.fbm3(x * 1.3 + seed * 7, y * 1.3 + seed * 3, z * 1.3 + seed, 3);
    p.setXYZ(i, x * k, y * k * (y < 0 ? 1.5 : 0.75), z * k);
  }
  g.computeVertexNormals();
  return g;
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.noise = makeNoise(77);
    this.time = 0;
    const rnd = makeRng(99);

    // --- sky
    this.skyUniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uNebA: { value: new THREE.Color() }, uNebB: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() }, uCloudColor: { value: new THREE.Color() },
      uNebula: { value: 0 }, uSunSize: { value: 0.03 }, uSunGlow: { value: 1 }, uClouds: { value: 0 }, uBands: { value: 0 },
      uTime: { value: 0 }, uSharp: { value: 0.5 },
    };
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), this.skyMaterial);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // --- stars
    const N = 2600, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(a) * 500, u * 500, r * Math.sin(a) * 500], i * 3);
      size[i] = 1.2 + Math.pow(rnd(), 6) * 5;
      phase[i] = rnd() * 6.283;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starUniforms = { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uOpacity: { value: 1 } };
    this.stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: this.starUniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // --- island
    this.islandMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    this.island = new THREE.Mesh(islandGeometry(this.noise), this.islandMaterial);
    this.island.receiveShadow = true;
    scene.add(this.island);

    // --- drifting rocks with crystals
    this.rockMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true, roughness: 0.9 });
    this.crystalMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.2, flatShading: true });
    const shapes = [rockGeometry(this.noise, 1), rockGeometry(this.noise, 2), rockGeometry(this.noise, 3, 1)];
    const crystalGeo = new THREE.OctahedronGeometry(1, 0).scale(0.22, 0.75, 0.22);
    this.rocks = [];
    this.rockGroup = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const holder = new THREE.Group();
      const mesh = new THREE.Mesh(shapes[i % 3], this.rockMaterial);
      const s = 0.5 + rnd() * rnd() * 2.6;
      mesh.scale.setScalar(s);
      holder.add(mesh);
      if (i % 3 === 0) {
        for (let c = 0; c < 3; c++) {
          const cr = new THREE.Mesh(crystalGeo, this.crystalMaterial);
          cr.position.set((rnd() - 0.5) * s * 0.8, s * 0.55, (rnd() - 0.5) * s * 0.8);
          cr.rotation.set((rnd() - 0.5) * 0.7, rnd() * 3, (rnd() - 0.5) * 0.7);
          cr.scale.setScalar(0.6 + rnd() * s * 0.6);
          holder.add(cr);
        }
      }
      const rock = {
        holder, angle: rnd() * Math.PI * 2, radius: 14 + rnd() * 16, y: -6 + rnd() * 13,
        speed: (0.012 + rnd() * 0.02) * (rnd() < 0.5 ? -1 : 1), spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.2), bob: rnd() * 6.283,
      };
      this.rocks.push(rock);
      this.rockGroup.add(holder);
    }
    scene.add(this.rockGroup);

    // --- the glowing floor grid (only some themes show it)
    this.gridUniforms = { uTime: { value: 0 }, uColorA: { value: new THREE.Color(0x25e6ff) }, uColorB: { value: new THREE.Color(0xff2fd0) } };
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(420, 420).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: this.gridUniforms,
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: GRID_FRAG,
    }));
    this.grid.position.y = -7;
    scene.add(this.grid);

    // --- dust, embers, fireflies
    const M = 420, mp = new Float32Array(M * 3), ms = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      mp.set([(rnd() - 0.5) * 34, rnd() * 16, (rnd() - 0.5) * 34], i * 3);
      ms.set([rnd(), rnd(), rnd()], i * 3);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 3));
    this.moteUniforms = { uTime: { value: 0 }, uRise: { value: 0.2 }, uSize: { value: 0.08 }, uScale: { value: 800 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } };
    this.motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: this.moteUniforms, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.motes.frustumCulled = false;
    scene.add(this.motes);

    // --- lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
    this.key = new THREE.DirectionalLight(0xffffff, 2.5);
    this.key.castShadow = true;
    const sc = this.key.shadow.camera;
    sc.left = -7.5; sc.right = 7.5; sc.top = 7.5; sc.bottom = -7.5; sc.near = 1; sc.far = 40;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.025;
    this.key.shadow.mapSize.set(2048, 2048);
    this.rimA = new THREE.PointLight(0xffffff, 30, 0, 2);
    this.rimB = new THREE.PointLight(0xffffff, 30, 0, 2);
    this.under = new THREE.PointLight(0xffffff, 20, 0, 2);
    this.under.position.set(0, -9, 0);
    scene.add(this.hemi, this.key, this.key.target, this.rimA, this.rimB, this.under);

    // --- a second, tiny scene used only to bake the reflection map
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMaterial));
    this.cards = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      this.envScene.add(m);
      return m;
    });
    this.envTarget = null;
  }

  setTheme(theme) {
    this.theme = theme;
    const s = theme.sky, u = this.skyUniforms;
    u.uTop.value.setHex(s.top); u.uHorizon.value.setHex(s.horizon); u.uBottom.value.setHex(s.bottom);
    u.uNebA.value.setHex(s.nebA); u.uNebB.value.setHex(s.nebB); u.uNebula.value = s.nebula;
    u.uSunDir.value.set(...s.sunDir).normalize(); u.uSunColor.value.setHex(s.sunColor);
    u.uSunSize.value = s.sunSize; u.uSunGlow.value = s.sunGlow; u.uClouds.value = s.clouds;
    u.uCloudColor.value.setHex(s.cloudColor); u.uBands.value = s.bands; u.uSharp.value = s.sharp;
    this.starUniforms.uOpacity.value = s.stars;

    const L = theme.lights;
    this.hemi.color.setHex(L.hemi[0]); this.hemi.groundColor.setHex(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.key.color.setHex(L.key[0]); this.key.intensity = L.key[1]; this.key.position.set(...L.key[2]);
    this.rimA.color.setHex(L.rimA[0]); this.rimA.intensity = L.rimA[1]; this.rimA.position.set(...L.rimA[2]);
    this.rimB.color.setHex(L.rimB[0]); this.rimB.intensity = L.rimB[1]; this.rimB.position.set(...L.rimB[2]);
    this.under.color.setHex(L.under[0]); this.under.intensity = L.under[1];

    // island colours: top surface, cliff, and the deep underside
    this.island.visible = theme.island.show;
    if (theme.island.show) {
      const g = this.island.geometry, p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
      const top = new THREE.Color(theme.island.top), side = new THREE.Color(theme.island.side), deep = new THREE.Color(theme.island.deep), tmp = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), up = n.getY(i);
        const v = 0.55 + 0.9 * this.noise.fbm3(p.getX(i) * 0.7, y * 0.7, p.getZ(i) * 0.7, 3);
        if (up > 0.8 && y > -1.6) tmp.copy(top);
        else tmp.copy(side).lerp(deep, THREE.MathUtils.smoothstep(-y, 1.5, 7));
        tmp.multiplyScalar(v);
        c.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      c.needsUpdate = true;
    }

    const r = theme.rocks;
    this.rockMaterial.wireframe = r.wire;
    this.rockMaterial.color.setHex(r.wire ? 0x000000 : r.color);
    this.rockMaterial.emissive.setHex(r.wire ? r.color : 0x000000);
    this.rockMaterial.emissiveIntensity = r.wire ? 1.6 : 0;
    this.crystalMaterial.emissive.setHex(r.crystal);
    this.grid.visible = theme.grid;

    const m = theme.motes, mu = this.moteUniforms;
    mu.uColor.value.setHex(m.color); mu.uSize.value = m.size; mu.uRise.value = m.rise; mu.uOpacity.value = m.opacity;

    this.bakeEnvironment();
  }

  // Renders the sky, plus three bright cards standing in for the lamps, into a
  // prefiltered cube map so every polished surface reflects its own world.
  bakeEnvironment() {
    const L = this.theme.lights;
    const place = (card, [color, , at], size, boost) => {
      const v = new THREE.Vector3(...at).normalize().multiplyScalar(60);
      card.position.copy(v);
      card.lookAt(0, 0, 0);
      card.scale.setScalar(size);
      card.material.color.setHex(color).multiplyScalar(boost);
    };
    place(this.cards[0], L.key, 34, 7);
    place(this.cards[1], L.rimA, 22, 4);
    place(this.cards[2], L.rimB, 22, 4);
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0.015, 1, 200);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = this.theme.env;
    if (old) old.dispose();
  }

  setShadowQuality(size) {
    this.key.castShadow = size > 0;
    if (size > 0 && this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.set(size, size);
      if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    }
  }

  resize(heightPx, pixelRatio) {
    this.starUniforms.uPixelRatio.value = pixelRatio;
    this.moteUniforms.uScale.value = heightPx * pixelRatio * 1.3;
  }

  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    this.skyUniforms.uTime.value = t;
    this.starUniforms.uTime.value = t;
    this.moteUniforms.uTime.value = t;
    this.gridUniforms.uTime.value = t;
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y = t * 0.004;
    for (const r of this.rocks) {
      r.angle += r.speed * dt;
      r.holder.position.set(Math.cos(r.angle) * r.radius, r.y + Math.sin(t * 0.4 + r.bob) * 0.5, Math.sin(r.angle) * r.radius);
      r.holder.rotation.x += r.spin.x * dt; r.holder.rotation.y += r.spin.y * dt; r.holder.rotation.z += r.spin.z * dt;
    }
    this.crystalMaterial.emissiveIntensity = 2.2 + Math.sin(t * 1.3) * 0.6;
  }
}
