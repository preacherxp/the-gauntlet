// Checks that no piece passes through another. Plays the real arena's moves,
// captures, blocked blows, swaps, shifts and deployment on the real piece
// meshes, in crowded and sparse positions, and at every frame tests each
// moving piece against every other: no vertex of one may be inside the solid
// of the other. Effects are stubbed out; randomness is seeded.
//   node tests/clip.test.mjs            (--verbose lists every clip)

import * as THREE from 'three';
import { Tweens } from '../src/gfx/tween.js';
import { Arena } from '../src/rogue/arena.js';
import { LOOK_IDS } from '../src/rogue/looks.js';
import { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, YOU, FOE } from '../src/rogue/rules.js';

const VERBOSE = process.argv.includes('--verbose');
const DEPTH = 0.02;          // how far one piece may sink into another before it counts (a fiftieth of a square)
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else { failed++; console.log(`FAIL ${name}${detail ? '\n   ' + detail : ''}`); }
}

// seeded randomness, so a failure can be replayed
let seed = 1;
Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const mat = new THREE.MeshStandardMaterial();
const mats = { white: { body: mat, trim: mat }, black: { body: mat, trim: mat } };
const noop = () => {};
const fx = { burst: noop, trail: noop, ring: noop, shatter: noop, flashAt: noop, beamAt: noop };

// ------------------------------------------------------------- solids
// A piece's solid, in the frame of its model: for each slice of height and
// each sector of angle, how far from the axis it reaches. Built from the
// body, the trim and the temper's look; the coloured ring on the ground and
// the picking proxy are not solid.
const YS = 0.02, SECTORS = 24;
function solidOf(pc) {
  const pts = [];
  const v = new THREE.Vector3(), inv = new THREE.Matrix4().copy(pc.model.matrixWorld).invert();
  const meshes = [pc.body, pc.trim];
  if (pc.look) pc.look.traverse((o) => { if (o.isMesh) meshes.push(o); });
  pc.model.updateMatrixWorld(true);
  for (const m of meshes) {
    const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(rel); pts.push(v.x, v.y, v.z); }
  }
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < pts.length; i += 3) { y0 = Math.min(y0, pts[i]); y1 = Math.max(y1, pts[i]); }
  const rows = Math.ceil((y1 - y0) / YS) + 1, r = new Float32Array(rows * SECTORS).fill(-1);
  const seen = new Set(), keep = [];
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    const row = Math.floor((y - y0) / YS), sec = ((Math.floor((Math.atan2(z, x) / (2 * Math.PI) + 1) * SECTORS) % SECTORS) + SECTORS) % SECTORS;
    const k = row * SECTORS + sec;
    r[k] = Math.max(r[k], Math.hypot(x, z));
    const key = `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
    if (!seen.has(key)) { seen.add(key); keep.push(x, y, z); }
  }
  // fill the gaps: an empty sector takes its neighbours' reach, an empty slice the lesser of the slices around it
  for (let row = 0; row < rows; row++) {
    const base = row * SECTORS;
    let any = -1;
    for (let s = 0; s < SECTORS; s++) any = Math.max(any, r[base + s]);
    if (any < 0) continue;
    for (let pass = 0; pass < SECTORS; pass++) {
      let changed = false;
      for (let s = 0; s < SECTORS; s++) {
        if (r[base + s] >= 0) continue;
        const a = r[base + (s + 1) % SECTORS], b = r[base + (s + SECTORS - 1) % SECTORS];
        if (a >= 0 || b >= 0) { r[base + s] = Math.max(a, b); changed = true; }
      }
      if (!changed) break;
    }
  }
  for (let s = 0; s < SECTORS; s++) {
    for (let row = 0; row < rows; row++) {
      if (r[row * SECTORS + s] >= 0) continue;
      let lo = row - 1, hi = row + 1;
      while (lo >= 0 && r[lo * SECTORS + s] < 0) lo--;
      while (hi < rows && r[hi * SECTORS + s] < 0) hi++;
      const a = lo >= 0 ? r[lo * SECTORS + s] : 0, b = hi < rows ? r[hi * SECTORS + s] : 0;
      r[row * SECTORS + s] = Math.min(a, b);
    }
  }
  // at most 500 points to test against others, spread over the whole piece
  const n = keep.length / 3, step = Math.max(1, Math.floor(n / 500)), sample = [];
  for (let i = 0; i < n; i += step) sample.push(keep[i * 3], keep[i * 3 + 1], keep[i * 3 + 2]);
  let reach = 0;
  for (let i = 0; i < r.length; i++) reach = Math.max(reach, r[i]);
  return { y0, rows, r, pts: new Float32Array(sample), reach, top: y1 };
}

// How deep the points of B go into the solid of A, at this moment.
const T = new THREE.Matrix4(), P = new THREE.Vector3();
function depthInto(A, B) {
  const sa = A.solid, sb = B.solid;
  T.copy(A.model.matrixWorld).invert().multiply(B.model.matrixWorld);
  let worst = 0, n = 0;
  const pts = sb.pts;
  for (let i = 0; i < pts.length; i += 3) {
    P.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(T);
    const row = Math.floor((P.y - sa.y0) / YS);
    if (row < 0 || row >= sa.rows) continue;
    const ang = Math.atan2(P.z, P.x), sec = ((Math.floor((ang / (2 * Math.PI) + 1) * SECTORS) % SECTORS) + SECTORS) % SECTORS;
    const d = sa.r[row * SECTORS + sec] - Math.hypot(P.x, P.z);
    if (d > DEPTH) { n++; worst = Math.max(worst, d); }
  }
  return n >= 2 ? worst : 0;
}

const scaleOf = (m) => Math.cbrt(Math.abs(m.determinant()));
const ORIGIN = new THREE.Vector3();
function centre(pc, out) { return out.set(0, pc.solid.top / 2, 0).applyMatrix4(pc.model.matrixWorld); }
const CA = new THREE.Vector3(), CB = new THREE.Vector3();

// ------------------------------------------------------------- scenes
// A board laid out from a picture: rows top (far, the enemy's side) to bottom.
//   lower case: yours, upper case: the enemy's. p n b r q k; '.' empty.
// `perks` gives your pieces their tempers, in reading order.
const TYPE = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
function layout(rows, perks = []) {
  const h = rows.length, w = rows[0].length, cells = new Array(w * h).fill(null);
  let id = 1, pi = 0;
  const at = {};
  rows.forEach((line, r) => [...line].forEach((ch, x) => {
    const y = h - 1 - r, idx = y * w + x;
    if (ch === '.') return;
    if (/[A-Z]/.test(ch) || /[a-z]/.test(ch)) {
      const mine = ch === ch.toLowerCase();
      const p = { id: id++, type: TYPE[ch.toLowerCase()], side: mine ? YOU : FOE, perk: null, name: 'N' + id, shield: false, frozen: 0, queen: false };
      if (mine && (p.type === PAWN || p.type === KING)) p.perk = p.type === KING ? 'regal' : perks[pi++ % Math.max(1, perks.length)] || null;
      cells[idx] = p;
    }
  }));
  return { w, h, cells, rock: new Uint8Array(w * h), well: new Uint8Array(w * h), at };
}
const sq = (b, x, y) => y * b.w + x;

// Plays `events` (or calls `act(arena)`) and returns the deepest clip of the scene.
async function play(battle, act) {
  seed = 7;
  const tweens = new Tweens();
  const arena = new Arena(new THREE.Scene(), tweens, fx, null);
  arena.mats = mats;
  const all = [];
  const add = arena.addPiece.bind(arena);
  arena.addPiece = (p, idx) => { const pc = add(p, idx); all.push(pc); return pc; };
  const remodel = arena.remodel.bind(arena);
  arena.remodel = (pc, type, side) => { remodel(pc, type, side); pc.solid = null; };
  arena.build(battle, { intro: false });
  arena.theme = { sparks: { white: [0xffffff], black: [0x000000] } };
  arena.root.updateMatrixWorld(true);
  const still = new Map();
  for (const pc of all) { pc.solid = solidOf(pc); still.set(pc, pc.model.matrixWorld.clone()); pc.label = `${pc.perk || ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'][pc.type]}${pc.side === YOU ? '' : '(foe)'}`; }
  let done = false, error = null;
  Promise.resolve().then(() => act(arena)).then(() => { done = true; }, (e) => { error = e; done = true; });
  let worst = { depth: 0 }, t = 0;
  while (!done && t < 10) {
    tweens.update(1 / 60);
    arena.update(1 / 60);
    t += 1 / 60;
    arena.root.updateMatrixWorld(true);
    const live = all.filter((pc) => pc.group.parent === arena.root && pc.group.visible && scaleOf(pc.model.matrixWorld) > 0.08);
    for (const pc of live) if (!pc.solid) { pc.solid = solidOf(pc); still.set(pc, pc.model.matrixWorld.clone()); }
    const moving = live.filter((pc) => !pc.model.matrixWorld.equals(still.get(pc)));
    for (const A of moving) for (const B of live) {
      if (A === B || (moving.includes(B) && B.id < A.id)) continue;
      const sA = scaleOf(A.model.matrixWorld), sB = scaleOf(B.model.matrixWorld);
      const reachA = (Math.max(A.solid.reach, A.solid.top / 2)) * sA * 1.6, reachB = (Math.max(B.solid.reach, B.solid.top / 2)) * sB * 1.6;
      if (centre(A, CA).distanceTo(centre(B, CB)) > reachA + reachB) continue;
      const d = Math.max(depthInto(A, B), depthInto(B, A));
      if (d > worst.depth) worst = { depth: d, a: A.label, b: B.label, t };
    }
    for (let i = 0; i < 4; i++) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  }
  if (error) throw error;
  if (!done) worst.unfinished = true;
  // and it did what it was asked: the pieces are where the event says, the victim is gone
  const e = act.event;
  if (e) {
    const on = (pid, idx) => { const pc = all.find((p) => p.id === pid); return pc && pc.group.position.distanceTo(arena.world(idx)) < 1e-3 && pc.idx === idx; };
    if (e.t === 'move' || e.t === 'shift') {
      const victim = e.victim && all.find((p) => p.id === e.victim);
      const kept = victim && victim.perk === 'regal';
      if (!kept && !on(e.id, e.to)) worst.wrong = 'the piece did not end on its square';
      if (victim && !kept && victim.group.parent === arena.root) worst.wrong = 'the victim is still on the board';
    }
    if (e.t === 'swap' && !(on(e.a, e.to) && on(e.b, e.from))) worst.wrong = 'the two did not trade places';
    if (e.t === 'block' && !on(e.by, e.from)) worst.wrong = 'the attacker did not fall back';
  }
  return worst;
}

const results = [];
async function scene(name, battle, act) {
  const w = await play(battle, act);
  results.push({ name, ...w });
  const ok = w.depth === 0 && !w.unfinished && !w.wrong;
  check(name, ok, ok ? '' : w.wrong ? w.wrong : w.unfinished && !w.depth ? 'did not finish' : `${w.a} went ${(w.depth * 100).toFixed(0)}% of a square into ${w.b}, ${w.t.toFixed(2)} s in${w.unfinished ? ' (and did not finish)' : ''}`);
}
const ev = (e) => Object.assign((arena) => arena.play([e]), { event: e });
const id = (b, x, y) => b.cells[sq(b, x, y)].id;

// ------------------------------------------------------------- the checks
const TEMPERS = [...LOOK_IDS];

// 0. The detector itself: a piece sliding up beside its neighbour does not touch it; one pushed into it does.
{
  const glide = (b, to) => (arena) => { const pc = arena.pieceAt(sq(b, 2, 2)); return arena.tweens.run(0.4, (k) => { pc.group.position.x = -to * k; }); };
  let b = layout(['.....', '.....', '.kp..', '.....', '.....'], ['loud']);
  let w = await play(b, glide(b, 0.2));
  check('the detector: pieces 0.8 of a square apart do not touch', w.depth === 0, `found ${(w.depth * 100).toFixed(0)}%`);
  b = layout(['.....', '.....', '.kp..', '.....', '.....'], ['loud']);
  w = await play(b, glide(b, 0.55));
  check('the detector: a piece pushed half a square into another is caught', w.depth > 0.05, `found ${(w.depth * 100).toFixed(0)}%`);
  b = layout(['.....', '.....', '.Kp..', '.....', '.....'], ['bold']);
  w = await play(b, (arena) => { const pc = arena.pieceAt(sq(b, 2, 2)); return arena.tweens.run(0.4, (k) => { pc.group.position.y = 1.8 * Math.min(1, k * 2); pc.group.position.x = -Math.max(0, k * 2 - 1); }); });
  check('the detector: a piece passing high over a king does not touch it', w.depth === 0, `found ${(w.depth * 100).toFixed(0)}%`);
}

// 1. Your tempered pawns capture, diagonally (as pawns do) and straight (cards), on a crowded board and an open one.
for (const perk of TEMPERS) {
  for (const [kind, rows] of [
    ['crowded', ['PKPKP', 'QPPPK', 'PK.KP', 'pk.kp', 'ppkpp']],
    ['open', ['.....', '..P..', '.....', '.....', '.....']],
  ]) {
    // diagonal: from (2,1) to (1,2) or (3,2); the victim stands at (3,2)
    const rd = rows.map((r) => r.split(''));
    rd[2][3] = 'P'; rd[3][2] = 'p';
    let b = layout(rd.map((r) => r.join('')), [perk]);
    const mine = sq(b, 2, 1);
    await scene(`${perk} captures diagonally, ${kind} board`, b, ev({ t: 'move', id: b.cells[mine].id, from: mine, to: sq(b, 3, 2), victim: id(b, 3, 2) }));
    // straight: the victim right ahead
    const rs = rows.map((r) => r.split(''));
    rs[2][2] = 'Q'; rs[3][2] = 'p';
    b = layout(rs.map((r) => r.join('')), [perk]);
    await scene(`${perk} captures straight ahead, ${kind} board`, b, ev({ t: 'move', id: b.cells[mine].id, from: mine, to: sq(b, 2, 2), victim: id(b, 2, 2) }));
  }
}

// 2. The enemy's pieces take each of your tempers (whose deaths play where they stood), crowded and open.
const TAKERS = [
  ['pawn', 'P', [3, 3], [2, 2]], ['rook', 'R', [2, 4], [2, 2]], ['bishop', 'B', [4, 4], [2, 2]],
  ['knight', 'N', [3, 4], [2, 2]], ['queen', 'Q', [2, 3], [2, 2]], ['king', 'K', [1, 3], [2, 2]],
];
for (const perk of [...TEMPERS, 'regal']) {
  for (const [who, ch, [fx0, fy0], [tx, ty]] of TAKERS) {
    for (const [kind, base] of [
      ['crowded', ['P.P.P', '.K.PP', 'pp.pp', 'pkppk', 'kppkp']],
      ['open', ['.....', '.....', '.....', '.....', '.....']],
    ]) {
      const rows = base.map((r) => r.split(''));
      const set = (x, y, c) => { rows[4 - y][x] = c; };
      // clear the attacker's path, then place attacker and victim
      const dx = Math.sign(tx - fx0), dy = Math.sign(ty - fy0);
      if (who !== 'knight') for (let x = fx0 + dx, y = fy0 + dy; x !== tx || y !== ty; x += dx, y += dy) set(x, y, '.');
      set(fx0, fy0, ch); set(tx, ty, perk === 'regal' ? 'k' : 'p');
      const b = layout(rows.map((r) => r.join('')), [perk]);
      const victim = b.cells[sq(b, tx, ty)];
      if (perk !== 'regal') victim.perk = perk;
      await scene(`a ${who} takes ${perk}, ${kind} board`, b, ev({ t: 'move', id: id(b, fx0, fy0), from: sq(b, fx0, fy0), to: sq(b, tx, ty), victim: victim.id }));
    }
  }
}

// 3. Plain moves past crowded neighbours: every temper one and two squares forward and one diagonally,
//    a knight's jump over tall pieces, a rook down an open file, the Knight's Leap card.
for (const perk of TEMPERS) {
  const rows = ['KQKQK', 'QKQKQ', 'KQ.QK', 'qk.kq', 'kqpqk'];
  let b = layout(rows, [perk]);
  const from = sq(b, 2, 0);
  await scene(`${perk} steps forward between neighbours`, b, ev({ t: 'move', id: id(b, 2, 0), from, to: sq(b, 2, 1), victim: 0 }));
  b = layout(rows, [perk]);
  await scene(`${perk} steps two squares forward`, b, ev({ t: 'move', id: id(b, 2, 0), from, to: sq(b, 2, 2), victim: 0 }));
  const rd = ['KQKQK', 'QKQKQ', 'K.Q.K', 'qkq.q', 'kqpqk'];
  b = layout(rd, [perk]);
  await scene(`${perk} steps diagonally between neighbours`, b, ev({ t: 'move', id: id(b, 2, 0), from, to: sq(b, 3, 1), victim: 0 }));
  b = layout(['KQKQK', 'QKQKQ', 'K.KQK', 'qkqkq', 'kqpqk'], [perk]);
  await scene(`${perk} takes the Knight's Leap over a crowd`, b, ev({ t: 'move', id: id(b, 2, 0), from, to: sq(b, 1, 2), victim: 0, style: 'leap' }));
}
{
  let b = layout(['KQKQK', 'QKQKQ', 'K.KQK', 'qkqkq', 'kqnqk']);
  await scene('a knight jumps over a crowd of kings and queens', b, ev({ t: 'move', id: id(b, 2, 0), from: sq(b, 2, 0), to: sq(b, 1, 2), victim: 0 }));
  b = layout(['KQ.QK', 'QK.KQ', 'KQ.QK', 'qk.kq', 'kqrqk']);
  await scene('a rook slides down an open file between tall pieces', b, ev({ t: 'move', id: id(b, 2, 0), from: sq(b, 2, 0), to: sq(b, 2, 4), victim: 0 }));
  b = layout(['K...K', '...Q.', '..B..', 'q..k.', '.q..K']);
  await scene('a bishop slides diagonally between neighbours', b, ev({ t: 'move', id: id(b, 2, 2), from: sq(b, 2, 2), to: sq(b, 0, 0), victim: 0 }));
}

// 4. A blow that meets a shield: the attacker lunges and falls back.
for (const perk of [...TEMPERS, null]) {
  const b = layout(['.....', '.....', '..P..', '.p...', '.....'], perk ? [perk] : []);
  b.cells[sq(b, 2, 2)].shield = true;
  if (!perk) b.cells[sq(b, 1, 1)].perk = null;
  await scene(`${perk || 'a plain pawn'} strikes a shield`, b, ev({ t: 'block', id: id(b, 2, 2), by: id(b, 1, 1), from: sq(b, 1, 1), at: sq(b, 2, 2) }));
}

// 5. Swaps and shifts from cards, and moves while deploying, across a crowded board.
{
  const crowd = ['KQKQK', 'QKQKQ', 'KQkQK', 'qkqkq', 'kqpqk'];
  let b = layout(crowd, ['bold']);
  await scene('two pieces swap across the board', b, ev({ t: 'swap', a: id(b, 2, 0), b: id(b, 2, 2), from: sq(b, 2, 0), to: sq(b, 2, 2) }));
  b = layout(crowd, ['bold']);
  await scene('two neighbours swap', b, ev({ t: 'swap', a: id(b, 2, 0), b: id(b, 2, 1), from: sq(b, 2, 0), to: sq(b, 2, 1) }));
  for (const perk of [...TEMPERS, null]) {
    b = layout(['KQKQK', 'QK.KQ', 'KQKQK', 'qkqkq', 'kqpqk'], perk ? [perk] : []);
    if (!perk) b.cells[sq(b, 2, 0)].perk = null;
    const p = b.cells[sq(b, 2, 0)];
    await scene(`${perk || 'a plain pawn'} is shifted over a crowd`, b, ev({ t: 'shift', id: p.id, from: sq(b, 2, 0), to: sq(b, 2, 3), style: 'step' }));
  }
  b = layout(['.....', '.....', '.....', 'qkqkq', 'kqpqk'], ['bold']);
  await scene('deploying: a piece is moved past its neighbours', b, (arena) => arena.relocate(arena.pieceAt(sq(b, 2, 0)), sq(b, 2, 2)));
  b = layout(['.....', '.....', '.....', 'qkqkq', 'kqpqk'], ['bold']);
  await scene('deploying: two pieces trade places over a third', b, (arena) => arena.exchange(arena.pieceAt(sq(b, 2, 0)), arena.pieceAt(sq(b, 0, 1))));
}

// 6. At rest: every temper beside every other, idling, for three seconds; shields and ice side by side.
{
  const looks = TEMPERS;
  const rows = ['pppppp', 'pppppp'];
  const b = layout(rows, looks);
  b.cells.forEach((p) => { if (p) { p.shield = p.id % 2 === 0; p.frozen = p.id % 3 === 0 ? 1 : 0; } });
  await scene('every temper idles beside the others', b, (arena) => arena.tweens.wait(3));
  const tweens = new Tweens(), arena = new Arena(new THREE.Scene(), tweens, fx, null);
  arena.mats = mats; arena.build(b, { intro: false });
  let widest = 0;
  for (const pc of arena.pieces.values()) for (const m of [pc.shield, pc.ice]) if (m) widest = Math.max(widest, m.scale.x * (m === pc.ice ? 1 : 1));
  check(`shields and ice stay inside their square (widest reaches ${widest.toFixed(2)} of the 0.5 to the edge)`, widest <= 0.48);
}

// ------------------------------------------------------------- report
const bad = results.filter((r) => r.depth > 0 || r.unfinished);
console.log(`\n${results.length} scenes, ${bad.length} with a piece passing through another`);
if (VERBOSE || bad.length) {
  const by = new Map();
  for (const r of bad) { const k = r.name.replace(/, (crowded|open) board/, ''); by.set(k, (by.get(k) || 0) + 1); }
  if (VERBOSE) for (const r of bad) console.log(`  ${r.name}: ${r.a} into ${r.b}, ${(r.depth * 100).toFixed(0)}%, at ${r.t.toFixed(2)} s`);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
