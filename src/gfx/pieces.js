// The six chess pieces, modelled in code. Five are turned on a lathe from a
// hand-written profile; the knight is an extruded, tapered silhouette. Each
// piece comes as two meshes, a body and a trim (collars, crown, eyes), so a
// theme can give them different materials.

import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, YOU as WHITE } from '../rogue/rules.js';

const V = (r, y) => new THREE.Vector2(r, y);
const line = (...pts) => ({ pts });
const curve = (n, ...pts) => ({ pts, n });
const arc = (cy, radius, fromDeg, toDeg, n = 10) => ({
  pts: Array.from({ length: n + 1 }, (_, i) => {
    const a = THREE.MathUtils.degToRad(fromDeg + (toDeg - fromDeg) * i / n);
    return [Math.max(0, radius * Math.cos(a)), cy + radius * Math.sin(a)];
  }),
});

// Joins profile parts. Where two parts meet the point is repeated, which the
// lathe turns into a crisp edge instead of a rounded one.
function lathe(parts, radial = 56) {
  const pts = [];
  for (const part of parts) {
    let p = part.pts.map(([r, y]) => V(r, y));
    if (part.n) p = new THREE.SplineCurve(p).getPoints(part.n).map((q) => V(Math.max(0, q.x), q.y));
    pts.push(...p);
  }
  return new THREE.LatheGeometry(pts, radial);
}

const foot = (R) => [
  line([0, 0], [R * 0.94, 0]),
  curve(6, [R * 0.94, 0], [R, 0.025], [R, 0.06], [R * 0.95, 0.085]),
  line([R * 0.95, 0.085], [R * 0.8, 0.11]),
  curve(4, [R * 0.8, 0.11], [R * 0.82, 0.13], [R * 0.78, 0.15]),
];

const collar = (rIn, rOut, y) => [
  line([rIn, y], [rOut * 0.92, y + 0.01]),
  curve(5, [rOut * 0.92, y + 0.01], [rOut, y + 0.03], [rOut * 0.92, y + 0.05]),
  line([rOut * 0.92, y + 0.05], [rIn * 1.06, y + 0.06]),
];

const ring = (r, y, tube = 0.014) => new THREE.TorusGeometry(r, tube, 8, 40).rotateX(Math.PI / 2).translate(0, y, 0);
const ball = (r, x, y, z) => new THREE.SphereGeometry(r, 16, 12).translate(x, y, z);

// A solid slice of a ring, for the rook's battlements.
function ringSector(rIn, rOut, y0, y1, a0, a1, steps = 5) {
  const pos = [];
  const P = (r, a, y) => [r * Math.sin(a), y, r * Math.cos(a)];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + (a1 - a0) * i / steps, t1 = a0 + (a1 - a0) * (i + 1) / steps;
    quad(P(rOut, t0, y0), P(rOut, t1, y0), P(rOut, t1, y1), P(rOut, t0, y1));
    quad(P(rIn, t1, y0), P(rIn, t0, y0), P(rIn, t0, y1), P(rIn, t1, y1));
    quad(P(rOut, t0, y1), P(rOut, t1, y1), P(rIn, t1, y1), P(rIn, t0, y1));
    quad(P(rOut, t1, y0), P(rOut, t0, y0), P(rIn, t0, y0), P(rIn, t1, y0));
  }
  quad(P(rIn, a0, y0), P(rOut, a0, y0), P(rOut, a0, y1), P(rIn, a0, y1));
  quad(P(rOut, a1, y0), P(rIn, a1, y0), P(rIn, a1, y1), P(rOut, a1, y1));
  // Make every triangle face away from the middle of the solid.
  const mid = P((rIn + rOut) / 2, (a0 + a1) / 2, (y0 + y1) / 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3(...mid);
  for (let i = 0; i < pos.length; i += 9) {
    a.fromArray(pos, i); b.fromArray(pos, i + 3); c.fromArray(pos, i + 6);
    n.subVectors(b, a).cross(c.clone().sub(a));
    if (n.dot(a.clone().add(b).add(c).divideScalar(3).sub(m)) < 0) {
      for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}

function merge(list) {
  const flat = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
    return n;
  });
  const out = mergeGeometries(flat, false);
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// ---------------------------------------------------------------- the pieces
function pawn() {
  const R = 0.27;
  const body = lathe([
    ...foot(R),
    curve(12, [R * 0.78, 0.15], [0.16, 0.2], [0.115, 0.3], [0.09, 0.42], [0.085, 0.47]),
    ...collar(0.085, 0.175, 0.47),
    line([0.09, 0.53], [0.082, 0.548]),
    arc(0.66, 0.138, -54, 90, 14),
  ]);
  return { body: merge([body]), trim: merge([ring(R * 0.88, 0.1), ring(0.166, 0.5, 0.012)]), height: 0.8, radius: R };
}

function rook() {
  const R = 0.3;
  const body = lathe([
    ...foot(R),
    curve(10, [R * 0.78, 0.15], [0.2, 0.19], [0.18, 0.26], [0.17, 0.45], [0.165, 0.6]),
    line([0.165, 0.6], [0.225, 0.64]),
    line([0.225, 0.64], [0.24, 0.66]),
    line([0.24, 0.66], [0.24, 0.84]),
    line([0.24, 0.84], [0.165, 0.84]),
    line([0.165, 0.84], [0.165, 0.77]),
    line([0.165, 0.77], [0, 0.77]),
  ]);
  const merlons = [];
  const n = 6, step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) merlons.push(ringSector(0.165, 0.24, 0.838, 0.94, i * step, i * step + step * 0.6));
  return { body: merge([body, ...merlons]), trim: merge([ring(R * 0.88, 0.1), ring(0.185, 0.605, 0.016)]), height: 0.95, radius: R };
}

function knight() {
  const R = 0.3;
  const base = lathe([
    ...foot(R),
    curve(6, [R * 0.78, 0.15], [0.205, 0.18], [0.195, 0.22]),
    line([0.195, 0.22], [0.215, 0.235]),
    curve(4, [0.215, 0.235], [0.228, 0.255], [0.215, 0.275]),
    line([0.215, 0.275], [0, 0.285]),
  ]);

  // Side view of the head and neck, facing +x.
  const s = new THREE.Shape();
  const v = (x, y) => new THREE.Vector2(x, y);
  s.moveTo(-0.17, 0.26);
  s.splineThru([v(-0.205, 0.42), v(-0.195, 0.6), v(-0.14, 0.78), v(-0.06, 0.9), v(-0.005, 0.965)]);
  s.lineTo(0.012, 1.07);
  s.lineTo(0.065, 0.96);
  s.splineThru([v(0.115, 0.925), v(0.195, 0.83), v(0.27, 0.71), v(0.305, 0.64)]);
  s.splineThru([v(0.315, 0.6), v(0.3, 0.56), v(0.262, 0.545)]);
  s.splineThru([v(0.2, 0.555), v(0.135, 0.6), v(0.088, 0.6)]);
  s.splineThru([v(0.075, 0.52), v(0.105, 0.42), v(0.16, 0.33), v(0.185, 0.26)]);
  s.closePath();
  const depth = 0.18, bevel = 0.05;
  let head = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.032, bevelOffset: -0.032, bevelSegments: 4, curveSegments: 10,
  });
  head.translate(0, 0, -depth / 2);
  const sm = THREE.MathUtils.smoothstep;
  const p = head.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    let k = 1 - 0.42 * sm(x, 0.04, 0.31);            // narrow muzzle
    k *= 1 - 0.45 * sm(y, 0.9, 1.07);                // thin ears
    k *= 1 + 0.3 * (1 - sm(y, 0.26, 0.62));          // broad chest
    p.setZ(i, p.getZ(i) * k);
  }
  head = toCreasedNormals(head, THREE.MathUtils.degToRad(40));

  const eyeZ = 0.118;
  const trim = [
    ring(R * 0.88, 0.1), ring(0.222, 0.255, 0.012),
    ball(0.024, 0.15, 0.815, eyeZ), ball(0.024, 0.15, 0.815, -eyeZ),
  ];
  // a mane of small studs down the back of the neck
  const mane = [[-0.2, 0.46], [-0.2, 0.56], [-0.185, 0.66], [-0.15, 0.76], [-0.1, 0.85]];
  for (const [x, y] of mane) trim.push(ball(0.03, x, y, 0));
  return { body: merge([base, head]), trim: merge(trim), height: 1.08, radius: R };
}

function bishop() {
  const R = 0.3;
  const body = lathe([
    ...foot(R),
    curve(14, [R * 0.78, 0.15], [0.17, 0.21], [0.11, 0.34], [0.085, 0.52], [0.08, 0.66]),
    ...collar(0.08, 0.185, 0.66),
    curve(16, [0.085, 0.72], [0.14, 0.8], [0.158, 0.88], [0.132, 0.98], [0.075, 1.07], [0.036, 1.112]),
    arc(1.148, 0.05, -45, 90, 8),
  ]);
  const slash = new THREE.CylinderGeometry(0.168, 0.168, 0.026, 32).rotateZ(THREE.MathUtils.degToRad(38)).translate(0.012, 0.925, 0);
  return { body: merge([body]), trim: merge([ring(R * 0.88, 0.1), ring(0.176, 0.69, 0.012), slash]), height: 1.2, radius: R };
}

function queen() {
  const R = 0.32;
  const body = lathe([
    ...foot(R),
    curve(16, [R * 0.78, 0.15], [0.19, 0.22], [0.125, 0.38], [0.095, 0.6], [0.09, 0.82], [0.1, 0.9]),
    ...collar(0.1, 0.205, 0.9),
    curve(12, [0.106, 0.96], [0.12, 1.04], [0.17, 1.14], [0.218, 1.22]),
    line([0.218, 1.22], [0.19, 1.228]),
    curve(10, [0.19, 1.228], [0.15, 1.2], [0.1, 1.215], [0.05, 1.265], [0, 1.285]),
  ]);
  const trim = [ring(R * 0.88, 0.1), ring(0.195, 0.93, 0.013), ball(0.052, 0, 1.325, 0)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    trim.push(ball(0.034, Math.sin(a) * 0.207, 1.238, Math.cos(a) * 0.207));
  }
  return { body: merge([body]), trim: merge(trim), height: 1.38, radius: R };
}

function king() {
  const R = 0.33;
  const body = lathe([
    ...foot(R),
    curve(16, [R * 0.78, 0.15], [0.2, 0.22], [0.135, 0.4], [0.105, 0.65], [0.1, 0.92], [0.11, 1.0]),
    ...collar(0.11, 0.215, 1.0),
    curve(12, [0.1166, 1.06], [0.13, 1.14], [0.18, 1.24], [0.222, 1.3]),
    line([0.222, 1.3], [0.222, 1.33]),
    curve(10, [0.222, 1.33], [0.16, 1.372], [0.08, 1.4], [0, 1.41]),
  ]);
  const trim = [
    ring(R * 0.88, 0.1), ring(0.205, 1.03, 0.013), ring(0.224, 1.315, 0.012),
    new THREE.BoxGeometry(0.058, 0.27, 0.058).translate(0, 1.535, 0),
    new THREE.BoxGeometry(0.2, 0.058, 0.058).translate(0, 1.56, 0),
  ];
  return { body: merge([body]), trim: merge(trim), height: 1.68, radius: R };
}

const WIDE = 1.1, SHORT = 0.93;
let cache = null;
export function pieceGeometries() {
  if (!cache) {
    cache = { [PAWN]: pawn(), [KNIGHT]: knight(), [BISHOP]: bishop(), [ROOK]: rook(), [QUEEN]: queen(), [KING]: king() };
    // Stockier than drawn: wider bases fill the squares, and shorter pieces
    // hide less of the board behind them.
    for (const g of Object.values(cache)) {
      for (const part of [g.body, g.trim]) { part.scale(WIDE, SHORT, WIDE); part.computeBoundingSphere(); part.computeBoundingBox(); }
      g.height *= SHORT; g.radius *= WIDE;
    }
  }
  return cache;
}

// A piece ready for the scene: an outer group that sits on a square, an inner
// "model" group that animation tilts, lifts and scales, and an unseen cylinder
// used only for picking.
export function createPiece(type, color, materials) {
  const g = pieceGeometries()[type];
  const group = new THREE.Group();
  const model = new THREE.Group();
  const side = color === WHITE ? materials.white : materials.black;
  const body = new THREE.Mesh(g.body, side.body);
  const trim = new THREE.Mesh(g.trim, side.trim);
  body.castShadow = trim.castShadow = true;
  body.receiveShadow = true;
  model.add(body, trim);
  // Knights look across the board at an angle, so both players see a profile.
  if (type === KNIGHT) model.rotation.y = (color === WHITE ? Math.PI / 2 : -Math.PI / 2) - 0.95;
  group.add(model);
  const hit = new THREE.Mesh(HIT_GEOMETRY, HIT_MATERIAL);
  hit.scale.set(g.radius * 1.05, g.height, g.radius * 1.05);
  hit.position.y = g.height / 2;
  hit.visible = false;
  group.add(hit);
  return { group, model, body, trim, hit, type, color, height: g.height, radius: g.radius };
}

// Narrower at the top, so a tall piece does not steal clicks meant for the one behind it.
const HIT_GEOMETRY = new THREE.CylinderGeometry(0.5, 1, 1, 10);
const HIT_MATERIAL = new THREE.MeshBasicMaterial();
