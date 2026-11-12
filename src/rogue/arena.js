// The Gauntlet's board in 3D. It is rebuilt for every fight at that fight's
// size, with its rocks and aether wells, and it plays back the events a Battle
// reports: moves, captures, blocked blows, and everything the cards do.

import * as THREE from 'three';
import { createPiece } from '../gfx/pieces.js';
import { ease } from '../gfx/tween.js';
import { MARK_FRAG, MARK_VERT, slab } from '../gfx/marks.js';
import { makeNoise, makeRng } from '../gfx/noise.js';
import { YOU, KNIGHT, QUEEN } from './rules.js';
import { dressPersona, animateLook } from './looks.js';
import { MOTION, IDLE } from './motion.js';

const BUBBLE_VERT = /* glsl */`
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BUBBLE_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime;
varying vec3 vN; varying vec3 vV;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float a = rim * 0.9 + 0.07 + 0.04 * sin(uTime * 3.0);
  gl_FragColor = vec4(uColor * (0.7 + rim * 1.8), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Arena {
  constructor(scene, tweens, fx, textures) {
    this.scene = scene; this.tweens = tweens; this.fx = fx; this.textures = textures;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.w = 6; this.h = 6;
    this.pieces = new Map();          // battle piece id -> piece
    this.tiles = []; this.baseMarks = []; this.topMarks = [];
    this.rocks = new Map(); this.wells = [];
    this.marks = { selected: -1, targets: [], spell: [], last: [], hover: -1, zone: [] };
    this.time = 0;
    this.onBeat = null;               // (kind, data): sounds and camera shake at the right moment
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmp = new THREE.Vector3();
    this.pulsing = [];

    const noise = makeNoise(31);
    this.rockGeo = new THREE.IcosahedronGeometry(0.44, 1);
    const rp = this.rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
      const k = 0.75 + 0.6 * noise.fbm3(x * 2.2 + 3, y * 2.2, z * 2.2 + 8, 3);
      rp.setXYZ(i, x * k, Math.max(-0.1, y * k * 1.35 + 0.34), z * k);
    }
    this.rockGeo.computeVertexNormals();
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true, roughness: 0.92 });

    this.bubbleGeo = new THREE.SphereGeometry(1, 28, 18);
    const bubble = (hex) => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(hex) }, uTime: { value: 0 } },
      vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, transparent: true, depthWrite: false,
    });
    this.bubbleMat = [bubble(0x7fe9ff), bubble(0xff7a5a)];
    this.iceGeo = new THREE.IcosahedronGeometry(1, 1);
    this.iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.52, roughness: 0.12, metalness: 0.1, emissive: 0x2a6fa8, emissiveIntensity: 0.6, flatShading: true, depthWrite: false });
    this.haloGeo = new THREE.TorusGeometry(0.17, 0.026, 8, 28).rotateX(Math.PI / 2);
    this.haloMat = new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffc44a, emissiveIntensity: 3 });
    this.ringGeo = new THREE.RingGeometry(0.36, 0.46, 36).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc44a).multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.wellGeo = new THREE.CylinderGeometry(0.3, 0.36, 1.5, 24, 1, true).translate(0, 0.75, 0);
    this.wellMat = new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.markGeo = new THREE.PlaneGeometry(0.985, 0.985).rotateX(-Math.PI / 2);
    this.markMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uMode: { value: 1 }, uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: MARK_VERT, fragmentShader: MARK_FRAG, transparent: true, depthWrite: false,
    });
    this.tileGeo = new THREE.BoxGeometry(0.985, 0.12, 0.985).translate(0, -0.06, 0);
  }

  show(v) { this.root.visible = v; }

  // ---------------------------------------------------------------- geometry
  world(idx, out = new THREE.Vector3()) { return out.set((idx % this.w) - (this.w - 1) / 2, 0, (this.h - 1) / 2 - Math.floor(idx / this.w)); }
  fromWorld(x, z) {
    const fx = Math.floor(x + this.w / 2), fy = Math.floor(this.h / 2 - z);
    return fx < 0 || fy < 0 || fx >= this.w || fy >= this.h ? -1 : fy * this.w + fx;
  }

  clear() {
    this.tweens.finishAll();
    for (const t of this.tiles) t.geometry.dispose();
    for (const m of [...this.baseMarks, ...this.topMarks]) m.material.dispose();
    for (const o of [this.frame, this.plinth]) if (o) o.geometry.dispose();
    this.root.clear();
    this.pieces.clear(); this.rocks.clear();
    this.tiles = []; this.baseMarks = []; this.topMarks = []; this.wells = [];
    this.marks = { selected: -1, targets: [], spell: [], last: [], hover: -1, zone: [] };
  }

  // Lay out the board for a battle and stand its pieces on it.
  build(battle, { intro = true, onDrop = null } = {}) {
    this.clear();
    const w = (this.w = battle.w), h = (this.h = battle.h);
    const rnd = makeRng(w * 97 + h * 13);
    for (let i = 0; i < w * h; i++) {
      const g = this.tileGeo.clone();
      const full = g.attributes.uv.clone(), patch = g.attributes.uv.clone();
      const ou = rnd(), ov = rnd(), flip = rnd() < 0.5;
      for (let k = 0; k < patch.count; k++) {
        const u = full.getX(k), v = full.getY(k);
        patch.setXY(k, (flip ? v : u) * 0.3 + ou, (flip ? u : v) * 0.3 + ov);
      }
      const mesh = new THREE.Mesh(g);
      this.world(i, mesh.position);
      mesh.receiveShadow = true;
      mesh.userData = { full, patch, dark: ((i % w) + Math.floor(i / w)) % 2 === 0 };
      this.root.add(mesh);
      this.tiles.push(mesh);
    }
    this.frame = new THREE.Mesh(slab(w + 1.1, 0.36, 0.22, 0.05, -0.02, h + 1.1));
    this.plinth = new THREE.Mesh(slab(w + 2.2, 0.34, 0.3, 0.06, -0.3, h + 2.2));
    this.frame.receiveShadow = this.plinth.receiveShadow = this.frame.castShadow = this.plinth.castShadow = true;
    this.root.add(this.frame, this.plinth);
    const layer = (y) => Array.from({ length: w * h }, (_, i) => {
      const m = new THREE.Mesh(this.markGeo, this.markMat.clone());
      this.world(i, m.position); m.position.y = y;
      m.visible = false; m.renderOrder = 2;
      this.root.add(m);
      return m;
    });
    this.baseMarks = layer(0.004);
    this.topMarks = layer(0.007);
    for (let i = 0; i < w * h; i++) {
      if (battle.rock[i]) this.addRock(i, false);
      if (battle.well[i]) {
        const col = new THREE.Mesh(this.wellGeo, this.wellMat);
        this.world(i, col.position);
        const disc = new THREE.Mesh(this.markGeo, this.markMat.clone());
        this.world(i, disc.position); disc.position.y = 0.003;
        disc.material.uniforms.uMode.value = 4; disc.material.uniforms.uColor.value.setHex(0x6fe8ff); disc.material.uniforms.uAlpha.value = 0.75;
        this.root.add(col, disc);
        this.wells.push({ col, disc, idx: i });
      }
    }
    if (this.theme) this.dress();
    const jobs = [];
    let n = 0;
    battle.cells.forEach((p, i) => {
      if (!p) return;
      const pc = this.addPiece(p, i);
      if (!intro) return;
      const y0 = 8 + Math.random() * 3, row = p.side === YOU ? Math.floor(i / w) : h - 1 - Math.floor(i / w);
      pc.group.position.y = y0; pc.busy = true;
      jobs.push(this.tweens.run(0.6, (k) => { pc.group.position.y = y0 * (1 - k); }, ease.outBounce, 0.1 + ((i % w) + row * w) * 0.045 + (p.side === YOU ? 0 : 0.08))
        .then(() => { pc.busy = false; if (onDrop) onDrop(pc, n++); }));
    });
    return Promise.all(jobs);
  }

  // ------------------------------------------------------------------ theming
  setTheme(theme, mats) { this.theme = theme; this.mats = mats; if (this.tiles.length) this.dress(); }

  dress() {
    const { theme, mats } = this;
    for (const t of this.tiles) {
      t.material = t.userData.dark ? mats.tileDark : mats.tileLight;
      t.geometry.setAttribute('uv', theme.tileUV === 'full' ? t.userData.full : t.userData.patch);
    }
    this.frame.material = mats.frame;
    this.plinth.material = mats.plinth;
    const neon = theme.rocks.wire;
    this.rockMat.color.setHex(neon ? 0x160c2a : theme.rocks.color);
    this.rockMat.emissive.setHex(neon ? theme.rocks.color : 0x000000);
    this.rockMat.emissiveIntensity = neon ? 0.35 : 0;
    for (const pc of this.pieces.values()) this.dressPiece(pc);
    this.pulsing = [mats.white.body, mats.black.body, mats.tileLight, mats.tileDark].filter((m) => m.userData.pulse);
    this.refreshMarks();
  }

  dressPiece(pc) {
    const side = pc.side === YOU ? this.mats.white : this.mats.black;
    pc.body.material = side.body; pc.trim.material = side.trim;
  }

  // ------------------------------------------------------------------- pieces
  addPiece(p, idx) {
    const pc = createPiece(p.type, p.side, this.mats);
    Object.assign(pc, { id: p.id, idx, side: p.side, lift: 0, busy: false, shield: null, ice: null, aura: null });
    dressPersona(pc, p.perk, p.name);
    this.measure(pc);
    pc.hit.userData.piece = pc;
    this.world(idx, pc.group.position);
    this.root.add(pc.group);
    this.pieces.set(p.id, pc);
    if (p.shield) this.setShield(pc, true, false);
    if (p.frozen > 0) this.setIce(pc, true, false);
    if (p.queen) this.setAura(pc, true);
    return pc;
  }

  pieceAt(idx) { for (const pc of this.pieces.values()) if (pc.idx === idx) return pc; return null; }

  // ------------------------------------------------------ room to move in
  // So that no piece passes through another, each knows how far it reaches
  // from its axis (`reach`, its temper's headgear included) and how tall it
  // stands (`top`). Measured once from its meshes, in the model's own frame.
  measure(pc) {
    pc.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(pc.model.matrixWorld).invert(), rel = new THREE.Matrix4(), v = new THREE.Vector3();
    let reach = pc.radius, top = pc.height;
    const meshes = [pc.body, pc.trim];
    if (pc.look) pc.look.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      rel.multiplyMatrices(inv, m.matrixWorld);
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(rel);
        reach = Math.max(reach, Math.hypot(v.x, v.z)); top = Math.max(top, v.y);
      }
    }
    pc.reach = reach; pc.top = top;
  }

  // The pieces standing near the straight line from `from` to `to` that `pc` would hit going along the
  // board: for each, the stretch of the way (0 to 1) where they overlap and how high `pc` must be there.
  obstacles(pc, from, to, ignore = []) {
    const d = new THREE.Vector3(to.x - from.x, 0, to.z - from.z), len = d.length(), out = [];
    if (len < 1e-3) return out;
    d.divideScalar(len);
    for (const q of this.pieces.values()) {
      if (q === pc || ignore.includes(q)) continue;
      const rx = q.group.position.x - from.x, rz = q.group.position.z - from.z;
      const along = rx * d.x + rz * d.z, lat = Math.abs(rx * d.z - rz * d.x);
      // the footprints decide whether they meet: a piece may pass between two neighbours on a diagonal
      const R = pc.radius + q.radius + 0.05;
      if (lat >= R) continue;
      const half = Math.sqrt(R * R - lat * lat);
      if (along + half <= 0 || along - half >= len) continue;
      out.push({ k0: (along - half) / len, k1: (along + half) / len, h: q.top + 0.12 });
    }
    return out;
  }

  // How high an arc of sin(πk) must peak to clear `obs`; Infinity if one stands at either end.
  arcFor(obs) {
    let hop = 0;
    for (const o of obs) {
      if (o.k0 <= 0.02 || o.k1 >= 0.98) return Infinity;
      hop = Math.max(hop, o.h / Math.min(Math.sin(Math.PI * o.k0), Math.sin(Math.PI * o.k1)));
    }
    return hop;
  }

  // Lift a piece straight up to `height`, carry it over, and set it down: for crossing a crowd.
  carry(pc, from, to, height, seconds = 0.5, lean = 0.12) {
    const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
    return this.tweens.run(seconds, (k) => {
      const up = Math.min(1, k / 0.3), across = Math.min(1, Math.max(0, (k - 0.3) / 0.4)), down = Math.max(0, (k - 0.7) / 0.3);
      pc.group.position.lerpVectors(from, to, ease.inOutQuad(across)).setY(0);
      pc.model.position.y = height * (ease.outQuad(up) - ease.inQuad(down));
      const tilt = Math.sin(Math.PI * across) * lean;
      pc.group.rotation.set(dir.z * tilt, 0, -dir.x * tilt);
    }, ease.linear);
  }

  // Which way a dying piece should fall, and how far it may reach that way before it meets
  // another piece. Tries the way the blow pushed it first, then turns aside, never back.
  fallRoom(pc, away) {
    let best = null;
    for (const turn of [0, 0.79, -0.79, 1.57, -1.57]) {
      const c = Math.cos(turn), s = Math.sin(turn);
      const dir = new THREE.Vector3(away.x * c - away.z * s, 0, away.x * s + away.z * c).normalize();
      let room = 3;
      for (const q of this.pieces.values()) {
        if (q === pc) continue;
        const rx = q.group.position.x - pc.group.position.x, rz = q.group.position.z - pc.group.position.z;
        const along = rx * dir.x + rz * dir.z, lat = Math.abs(rx * dir.z - rz * dir.x);
        const R = q.reach + pc.radius * 0.8;
        if (lat >= R || along <= 0) continue;
        room = Math.min(room, along - Math.sqrt(R * R - lat * lat) - 0.06);
      }
      room = Math.max(0, room);
      if (!best || room > best.room + 0.15) best = { dir, room };
      if (room >= (pc.top || pc.height) + 0.1) break;    // room enough to fall full length
    }
    return best;
  }

  settle(pc) {
    pc.group.rotation.set(0, 0, 0);
    pc.group.position.y = 0;
    pc.group.visible = true;
    pc.model.position.set(0, 0, 0);
    pc.model.rotation.set(0, pc.baseRotY || 0, 0);
    pc.model.scale.setScalar(1);
    pc.lift = 0; pc.busy = false;
  }

  // ------------------------------------------------- hooks the motions use
  sfx(name) { if (this.onBeat) this.onBeat('sfx', name); }
  beat(kind, data) { if (this.onBeat) this.onBeat(kind, data); }
  dust(pos, n = 8) {
    this.fx.burst(pos.clone().setY(0.05), [0xb8a890, 0x8a7a66, 0xd8ccb8], { count: n, speed: 1.1, up: 0.7, size: 0.1, life: 0.5, gravity: 2 });
  }

  // A piece leaves the board in its own way. `away` is the direction the blow travelled.
  // Resolves to 'keep' when the body stays on the board (a fallen king).
  kill(pc, away) {
    this.pieces.delete(pc.id);
    pc.busy = true;
    if (!away || away.lengthSq() < 1e-6) { const a = Math.random() * Math.PI * 2; away = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); }
    const kit = pc.perk && MOTION[pc.perk];
    if (!kit) { this.shatter(pc); return Promise.resolve(); }
    this.beat('death', pc);
    // it falls the way it was pushed if there is room, else aside, and no further than its neighbours
    const { dir, room } = this.fallRoom(pc, away.clone().setY(0).normalize());
    return Promise.resolve(kit.die(this, pc, dir, room)).then((r) => { if (r !== 'keep') this.root.remove(pc.group); return r; });
  }

  // Replace a piece's model: a pawn knighted, a pawn crowned, a turncoat.
  remodel(pc, type, side = pc.side) {
    const fresh = createPiece(type, side, this.mats);
    this.root.remove(pc.group);
    for (const k of ['group', 'model', 'body', 'trim', 'hit', 'type', 'color', 'height', 'radius']) pc[k] = fresh[k];
    pc.side = side;
    pc.hit.userData.piece = pc;
    dressPersona(pc, side === YOU ? pc.perk : null, pc.pname);
    this.measure(pc);
    this.world(pc.idx, pc.group.position);
    this.root.add(pc.group);
    for (const k of ['shield', 'ice', 'aura']) { const had = !!pc[k]; pc[k] = null; if (had) this[k === 'shield' ? 'setShield' : k === 'ice' ? 'setIce' : 'setAura'](pc, true, false); }
  }

  setShield(pc, on, animate = true) {
    if (on === !!pc.shield) return;
    if (on) {
      const m = new THREE.Mesh(this.bubbleGeo, this.bubbleMat[pc.side]);
      const r = Math.min(pc.radius * 1.75, 0.47);           // stays inside its own square, clear of a shielded neighbour's
      m.scale.set(r, pc.height * 0.62, r);
      m.position.y = pc.height * 0.52;
      m.renderOrder = 4;
      pc.group.add(m);
      pc.shield = m;
      if (animate) { const s = m.scale.clone(); this.tweens.run(0.3, (k) => m.scale.copy(s).multiplyScalar(Math.max(0.01, k)), ease.outBack); }
    } else { pc.group.remove(pc.shield); pc.shield = null; }
  }

  setIce(pc, on, animate = true) {
    if (on === !!pc.ice) return;
    if (on) {
      const m = new THREE.Mesh(this.iceGeo, this.iceMat);
      const r = Math.min(pc.radius * 1.6, 0.46);
      m.scale.set(r, pc.height * 0.6, r);
      m.position.y = pc.height * 0.5;
      m.rotation.y = Math.random() * 3;
      m.renderOrder = 3;
      pc.group.add(m);
      pc.ice = m;
      if (animate) { const s = m.scale.clone(); this.tweens.run(0.25, (k) => m.scale.copy(s).multiplyScalar(Math.max(0.01, k)), ease.outBack); }
    } else { pc.group.remove(pc.ice); pc.ice = null; }
  }

  setAura(pc, on) {
    if (on === !!pc.aura) return;
    if (on) {
      const g = new THREE.Group();
      const halo = new THREE.Mesh(this.haloGeo, this.haloMat);
      halo.position.y = pc.height + 0.2;
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
      ring.position.y = 0.02;
      g.add(halo, ring);
      pc.group.add(g);
      pc.aura = g;
    } else { pc.group.remove(pc.aura); pc.aura = null; }
  }

  addRock(idx, animate) {
    const m = new THREE.Mesh(this.rockGeo, this.rockMat);
    this.world(idx, m.position);
    m.rotation.y = idx * 1.7;
    m.scale.setScalar(0.9 + (idx % 3) * 0.08);
    m.castShadow = m.receiveShadow = true;
    this.root.add(m);
    this.rocks.set(idx, m);
    if (animate) return this.tweens.run(0.35, (k) => { m.position.y = -0.9 * (1 - k); }, ease.outBack);
    return null;
  }

  sparks(side) { return this.theme.sparks[side === YOU ? 'white' : 'black']; }

  shatter(pc) {
    const at = pc.group.position.clone(), col = this.sparks(pc.side);
    this.fx.shatter(at, pc.height, pc.body.material, 9 + Math.round(pc.height * 7));
    this.fx.burst(at.clone().setY(pc.height * 0.5), col, { count: 70, speed: 3.4, up: 2.2, size: 0.16, life: 0.9 });
    this.fx.ring(at, col[0], 2.0);
    this.fx.flashAt(at, col[0], 6);
    this.root.remove(pc.group);
    this.pieces.delete(pc.id);
  }

  // -------------------------------------------------------- playing events
  // Plays a batch from the battle in order. `on(event)` is called as each one
  // starts, for sound and for the panel.
  async play(events, on = () => {}) {
    for (const e of events) {
      on(e);
      const fn = this['ev_' + e.t];
      if (fn) await fn.call(this, e);
    }
  }

  // A move or a capture. A piece with a temper does it its own way; the rest
  // slide, and knights jump.
  async ev_move(e) {
    const pc = this.pieces.get(e.id);
    if (!pc) return;
    const victim = e.victim ? this.pieces.get(e.victim) : null;
    const from = pc.group.position.clone().setY(0), to = this.world(e.to);
    const dist = from.distanceTo(to);
    const dir = dist > 1e-3 ? to.clone().sub(from).divideScalar(dist) : new THREE.Vector3(0, 0, pc.side === YOU ? -1 : 1);
    // A capture plays out up to where the two first touch: the blow lands there, the victim dies on
    // its own square, and only once it has gone does the attacker step in.
    const gap = victim ? pc.reach + victim.reach + 0.12 : 0;
    const stop = victim && dist > gap ? to.clone().addScaledVector(dir, -gap) : to;
    const reach = from.distanceTo(stop);
    // Anything standing in the way is jumped: in a high arc, or lifted clean over a crowd.
    const obs = this.obstacles(pc, from, stop, victim ? [victim] : []);
    const jump = pc.type === KNIGHT || e.style === 'leap' || obs.length > 0;
    const hop = jump ? Math.max(1.0, this.arcFor(obs)) : 0;
    const kit = !jump && pc.perk ? MOTION[pc.perk] : null;
    let dying = null;
    const strike = () => {
      if (!victim || dying) return;
      dying = this.kill(victim, dir);
      this.beat('strike', { pc, victim });
    };
    pc.busy = true;
    if (kit) await (victim ? kit.attack(this, pc, from, stop, strike, { dir, dist: reach }) : kit.move(this, pc, from, stop, { dir, dist: reach }));
    else if (hop > 2.4) { this.sfx('whoosh'); await this.carry(pc, from, stop, Math.max(...obs.map((o) => o.h)), 0.6); }
    else await this.plainMove(pc, from, stop, dir, reach, jump, !!victim, strike, e.style, hop);
    strike();
    const kept = dying ? (await dying) === 'keep' : false;
    this.settle(pc);
    pc.group.position.copy(stop);
    if (stop !== to && !kept) {
      // the square is clear: step into it
      await this.tweens.run(0.2, (k) => { pc.group.position.lerpVectors(stop, to, k); pc.model.position.y = Math.sin(Math.PI * k) * 0.06; }, ease.inOutQuad);
      pc.model.position.y = 0;
    }
    if (!kept) pc.group.position.copy(to);     // a fallen king keeps his square; the fight is over anyway
    pc.idx = e.to;
    this.beat('land', { pc, captured: !!victim });
    if (!kit && (victim || jump)) this.fx.burst(to, this.sparks(pc.side), { count: victim ? 24 : 10, speed: 1.6, up: 0.6, size: 0.1, life: 0.5 });
    if (e.promo) await this.transform(pc, QUEEN);
  }

  plainMove(pc, from, to, dir, dist, jump, capture, strike, style, arc = 1.0) {
    const dur = style === 'step' ? 0.2 : jump ? 0.5 : 0.2 + dist * 0.07;
    const hop = jump ? arc : 0.1 + (capture ? 0.28 : 0);
    const col = this.sparks(pc.side);
    if (jump) this.sfx('whoosh');
    return this.tweens.run(dur, (k) => {
      pc.group.position.lerpVectors(from, to, k);
      const arc = Math.sin(Math.PI * k);
      pc.model.position.y = arc * hop;
      const lean = arc * (jump ? 0.26 : 0.12);
      pc.group.rotation.set(dir.z * lean, 0, -dir.x * lean);
      if (k > 0.72) strike();
      if (k < 0.97) this.fx.trail(pc.group.position, col, jump ? 2 : 1);
    }, jump ? ease.inOutQuad : ease.inOutCubic);
  }

  // A capture that meets a shield: the attacker lunges, the shield bursts, it falls back.
  async ev_block(e) {
    const pc = this.pieces.get(e.by), target = this.pieces.get(e.id);
    if (!pc || !target) return;
    const start = pc.group.position.clone(), to = target.group.position.clone();
    // lunge until the two all but touch, no further
    const dist = start.distanceTo(to), most = dist > 1e-3 ? Math.max(0, Math.min(0.62, (dist - pc.reach - target.reach - 0.08) / dist)) : 0;
    let popped = false;
    pc.busy = true;
    await this.tweens.run(0.42, (k) => {
      const reach = Math.sin(Math.PI * k) * most;
      pc.group.position.lerpVectors(start, to, reach);
      pc.model.position.y = Math.sin(Math.PI * k) * 0.25;
      if (k > 0.5 && !popped) { popped = true; this.popShield(target); }
    }, ease.linear);
    this.settle(pc);
    pc.group.position.copy(start);
  }

  popShield(pc) {
    if (!pc.shield) return;
    const at = pc.group.position.clone().setY(pc.height * 0.5);
    const hex = pc.side === YOU ? 0x7fe9ff : 0xff7a5a;
    this.fx.burst(at, [hex, 0xffffff], { count: 60, speed: 3, up: 1, size: 0.13, life: 0.6, sphere: true });
    this.fx.ring(pc.group.position, hex, 1.5, 0.4);
    this.setShield(pc, false);
  }

  async ev_shield(e) {
    const pc = this.pieces.get(e.id);
    if (!pc) return;
    if (e.on) { this.setShield(pc, true); this.fx.ring(pc.group.position, pc.side === YOU ? 0x7fe9ff : 0xff7a5a, 1.2, 0.4); await this.tweens.wait(0.12); }
    else if (e.broken) { this.popShield(pc); await this.tweens.wait(0.25); }
    else this.setShield(pc, false);
  }

  async ev_freeze(e) {
    const pc = this.pieces.get(e.id);
    if (!pc) return;
    const at = pc.group.position.clone().setY(pc.height * 0.5);
    if (e.on) { this.setIce(pc, true); this.fx.burst(at, [0xbfe8ff, 0xffffff, 0x6fc0ff], { count: 40, speed: 1.6, up: 0.4, size: 0.12, life: 0.7, gravity: 1 }); await this.tweens.wait(0.12); }
    else if (pc.ice) { this.setIce(pc, false); this.fx.burst(at, [0xbfe8ff, 0xffffff], { count: 24, speed: 2.4, up: 1, size: 0.1, life: 0.5 }); }
  }

  async ev_queen(e) {
    const pc = this.pieces.get(e.id);
    if (!pc) return;
    this.setAura(pc, e.on);
    if (e.on) { this.fx.burst(pc.group.position.clone().setY(pc.height), [0xffc44a, 0xfff2c8], { count: 50, speed: 2, up: 2, size: 0.14, life: 0.9, gravity: 2 }); await this.tweens.wait(0.15); }
  }

  async ev_destroy(e) {
    const pc = this.pieces.get(e.id);
    if (!pc) return;
    const at = pc.group.position.clone();
    if (!e.sacrifice) {
      // a bolt from above
      this.fx.beamAt(at, 0xffe9a0);
      this.fx.flashAt(at, 0xffe9a0, 12);
      await this.tweens.wait(0.12);
    } else this.fx.burst(at.clone().setY(0.4), [0xff3a4a, 0x8a0f1f], { count: 50, speed: 2.2, up: 2.5, size: 0.14, life: 0.9, gravity: 3 });
    await this.kill(pc, null);
    await this.tweens.wait(0.12);
  }

  async ev_spawn(e) {
    const pc = this.addPiece(e.piece, e.at);
    pc.model.scale.setScalar(0.001);
    this.fx.ring(pc.group.position, this.sparks(pc.side)[0], 1.4, 0.45);
    this.fx.burst(pc.group.position.clone().setY(0.3), this.sparks(pc.side), { count: 36, speed: 1.8, up: 2, size: 0.12, life: 0.7 });
    await this.tweens.run(0.32, (k) => pc.model.scale.setScalar(Math.max(0.001, k)), ease.outBack);
  }

  async ev_revive(e) {
    this.fx.beamAt(this.world(e.at), 0xffb347);
    await this.ev_spawn(e);
  }

  async ev_shift(e) {
    const pc = this.pieces.get(e.id);
    if (!pc) return;
    const from = pc.group.position.clone(), to = this.world(e.to), col = this.sparks(pc.side);
    pc.busy = true;
    if (e.style === 'blink') {
      this.fx.ring(from, col[0], 1.3, 0.4);
      await this.tweens.run(0.14, (k) => pc.model.scale.set(1 - k, 1 + k, 1 - k).multiplyScalar(Math.max(0.02, 1 - k * 0.6)), ease.inQuad);
      pc.group.position.copy(to);
      this.fx.ring(to, col[0], 1.3, 0.4);
      this.fx.burst(to.clone().setY(0.4), col, { count: 30, speed: 1.6, up: 1.5, size: 0.11, life: 0.6 });
      await this.tweens.run(0.22, (k) => pc.model.scale.setScalar(Math.max(0.02, k)), ease.outBack);
    } else {
      const obs = this.obstacles(pc, from.setY(0), to);
      if (obs.length) { this.sfx('whoosh'); await this.carry(pc, from, to, Math.max(...obs.map((o) => o.h)), 0.55); }   // lifted over whoever is in the way
      else if (pc.perk && MOTION[pc.perk] && pc.type !== KNIGHT) {
        const dist = from.distanceTo(to), dir = to.clone().sub(from).divideScalar(Math.max(dist, 1e-3));
        await MOTION[pc.perk].move(this, pc, from, to, { dir, dist });
      } else await this.tweens.run(0.22, (k) => { pc.group.position.lerpVectors(from, to, k); pc.model.position.y = Math.sin(Math.PI * k) * 0.18; }, ease.inOutCubic);
    }
    this.settle(pc);
    pc.group.position.copy(to);
    pc.idx = e.to;
  }

  async ev_swap(e) {
    const a = this.pieces.get(e.a), b = this.pieces.get(e.b);
    if (!a || !b) return;
    await this.exchange(a, b);
  }

  // Two pieces trade squares, one arcing over the other. Also used while deploying.
  // `b` slides along the board (lifted only if others are in its way), and `a` is carried over
  // the top of it: up, across, and down once `b` has left.
  async exchange(a, b) {
    const pa = this.world(a.idx), pb = this.world(b.idx);
    a.busy = b.busy = true;
    const high = (obs) => (obs.length ? Math.max(...obs.map((o) => o.h)) : 0);
    const hb = high(this.obstacles(b, pb, pa, [a]));
    const ha = Math.max(0.5, high(this.obstacles(a, pa, pb, [b])), hb + b.top + 0.15);
    await Promise.all([
      this.carry(a, pa, pb, ha, 0.5),
      hb > 0 ? this.carry(b, pb, pa, hb, 0.5, 0) : this.tweens.run(0.5, (k) => {
        const across = Math.min(1, Math.max(0, (k - 0.3) / 0.4));
        b.group.position.lerpVectors(pb, pa, ease.inOutQuad(across));
      }, ease.linear),
    ]);
    [a.idx, b.idx] = [b.idx, a.idx];
    this.settle(a); this.settle(b);
    a.group.position.copy(pb); b.group.position.copy(pa);
  }

  async relocate(pc, idx) {
    const from = pc.group.position.clone(), to = this.world(idx);
    pc.busy = true;
    const obs = this.obstacles(pc, from, to);
    if (obs.length) await this.carry(pc, from, to, Math.max(...obs.map((o) => o.h)), 0.42);
    else await this.tweens.run(0.26, (k) => { pc.group.position.lerpVectors(from, to, k); pc.model.position.y = Math.sin(Math.PI * k) * 0.5; }, ease.inOutCubic);
    this.settle(pc);
    pc.group.position.copy(to);
    pc.idx = idx;
  }

  async ev_convert(e) {
    const pc = this.pieces.get(e.id);
    if (!pc) return;
    pc.busy = true;
    await this.tweens.run(0.3, (k) => { pc.group.rotation.y = k * Math.PI * 2; pc.model.position.y = Math.sin(Math.PI * k) * 0.4; }, ease.inOutQuad);
    this.settle(pc);
    this.remodel(pc, pc.type, e.side);
    this.fx.burst(pc.group.position.clone().setY(0.5), this.sparks(e.side), { count: 50, speed: 2.2, up: 2, size: 0.13, life: 0.8 });
    this.fx.ring(pc.group.position, this.sparks(e.side)[0], 1.5, 0.45);
  }

  async ev_morph(e) {
    const pc = this.pieces.get(e.id);
    if (pc) await this.transform(pc, e.type);
  }

  async transform(pc, type) {
    const at = pc.group.position.clone(), col = this.sparks(pc.side);
    this.fx.beamAt(at, col[0]);
    this.fx.flashAt(at, col[0], 9);
    this.sfx('promote');
    pc.busy = true;
    await this.tweens.run(0.16, (k) => pc.model.scale.set(1 - k * 0.9, 1 + k * 1.5, 1 - k * 0.9), ease.inQuad);
    this.remodel(pc, type);
    pc.model.scale.setScalar(0.001);
    this.fx.burst(at.clone().setY(0.6), col, { count: 100, speed: 3, up: 3.2, size: 0.17, life: 1.1, gravity: 3 });
    this.fx.ring(at, col[1], 1.8);
    await this.tweens.run(0.38, (k) => pc.model.scale.setScalar(Math.max(0.001, k)), ease.outBack);
    this.settle(pc);
  }

  async ev_rock(e) {
    if (e.on) { await this.addRock(e.at, true); return; }
    const m = this.rocks.get(e.at);
    if (!m) return;
    this.rocks.delete(e.at);
    this.fx.burst(m.position.clone().setY(0.3), [0xb0a090, 0x6a5a4a], { count: 30, speed: 1.8, up: 1.5, size: 0.12, life: 0.6 });
    await this.tweens.run(0.3, (k) => { m.position.y = -0.9 * k; }, ease.inQuad);
    this.root.remove(m);
  }

  async ev_gold(e) {
    const pc = this.pieces.get(e.id);
    if (pc) this.fx.burst(pc.group.position.clone().setY(pc.height), [0xffd24a, 0xfff2a0], { count: 26, speed: 1.6, up: 2.4, size: 0.12, life: 0.8, gravity: 4 });
  }

  // The loser's king falls over and the winners hop.
  celebrate(winner) {
    let i = 0;
    for (const pc of this.pieces.values()) {
      if (pc.side !== winner) continue;
      pc.busy = true;
      const hgt = 0.3 + Math.random() * 0.35;
      this.tweens.run(0.42, (k) => { pc.model.position.y = Math.sin(Math.PI * k) * hgt; }, ease.linear, 0.2 + (i++) * 0.07)
        .then(() => this.tweens.run(0.42, (k) => { pc.model.position.y = Math.sin(Math.PI * k) * hgt * 0.6; }, ease.linear, 0.1))
        .then(() => { pc.model.position.y = 0; pc.busy = false; });
    }
  }

  // ------------------------------------------------------------------ marking
  mark(partial) { Object.assign(this.marks, partial); this.refreshMarks(); }

  refreshMarks() {
    if (!this.theme || !this.baseMarks.length) return;
    const m = this.marks, th = this.theme;
    const set = (mesh, mode, hex, alpha = 1) => {
      mesh.visible = mode > 0;
      if (!mode) return;
      const u = mesh.material.uniforms;
      u.uMode.value = mode; u.uColor.value.setHex(hex); u.uAlpha.value = alpha;
    };
    const targets = new Map(m.targets.map((t) => [t.idx, t]));
    for (let i = 0; i < this.baseMarks.length; i++) {
      if (m.spell.includes(i)) set(this.baseMarks[i], 1, th.hint, 0.95);
      else if (i === m.selected) set(this.baseMarks[i], 1, th.accent, 0.9);
      else if (m.zone.includes(i)) set(this.baseMarks[i], 1, th.hint, 0.4);
      else if (m.last.includes(i)) set(this.baseMarks[i], 1, th.last, 0.55);
      else set(this.baseMarks[i], 0);
      const t = targets.get(i);
      if (t) set(this.topMarks[i], t.capture ? 3 : 2, th.target);
      else if (i === m.hover) set(this.topMarks[i], 5, th.accent, 0.9);
      else set(this.topMarks[i], 0);
    }
  }

  // ------------------------------------------------------------------ picking
  pick(ndc, camera) {
    this.raycaster.setFromCamera(ndc, camera);
    let pieceIdx = -1;
    const proxies = [];
    for (const pc of this.pieces.values()) proxies.push(pc.hit);
    const hits = this.raycaster.intersectObjects(proxies, false);
    if (hits.length) pieceIdx = hits[0].object.userData.piece.idx;
    const pt = this.raycaster.ray.intersectPlane(this.plane, this.tmp);
    return { pieceIdx, planeIdx: pt ? this.fromWorld(pt.x, pt.z) : -1 };
  }

  // Where a piece's head is, for speech bubbles.
  headOf(id, out = new THREE.Vector3()) {
    const pc = this.pieces.get(id);
    if (!pc) return null;
    return out.copy(pc.group.position).setY(pc.group.position.y + pc.model.position.y + pc.height + 0.15);
  }

  update(dt) {
    this.time += dt;
    const t = this.time, m = this.marks;
    for (const pc of this.pieces.values()) {
      if (pc.aura) { pc.aura.children[0].rotation.y = t * 2; pc.aura.children[1].rotation.y = -t; pc.aura.children[0].position.y = pc.height + 0.2 + Math.sin(t * 3) * 0.03; }
      if (pc.flutter && pc.flutter.length) animateLook(pc, t);
      if (pc.busy) continue;
      let want = 0;
      if (pc.idx === m.selected) want = 0.2 + Math.sin(t * 3.2) * 0.04;
      else if (pc.idx === m.hover) want = 0.07;
      pc.lift += (want - pc.lift) * Math.min(1, dt * 14);
      const idle = pc.perk && IDLE[pc.perk] ? IDLE[pc.perk](t, pc.id * 1.7) : null;
      pc.model.position.y = pc.lift + (idle && idle.y ? idle.y : 0);
      if (idle) {
        pc.model.rotation.set(idle.rx || 0, (pc.baseRotY || 0) + (idle.ry || 0), idle.rz || 0);
        pc.model.scale.set(1, idle.s || 1, 1);
      }
    }
    for (let i = 0; i < this.baseMarks.length; i++) {
      if (this.baseMarks[i].visible) this.baseMarks[i].material.uniforms.uTime.value = t;
      if (this.topMarks[i].visible) this.topMarks[i].material.uniforms.uTime.value = t;
    }
    for (const mat of this.bubbleMat) mat.uniforms.uTime.value = t;
    for (const w of this.wells) { w.disc.material.uniforms.uTime.value = t * 0.5; w.col.material.opacity = 0.11 + 0.05 * Math.sin(t * 2 + w.idx); }
    for (const mat of this.pulsing) {
      const [base, amp, speed] = mat.userData.pulse;
      mat.emissiveIntensity = base + amp * Math.sin(t * speed);
    }
  }
}
