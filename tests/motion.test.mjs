// Checks that every temper has its own look and its own move, attack and
// death, that each one runs to the end, and that no two are the same.
// Runs the real animation code in Node against the real piece meshes, with
// the effects stubbed out.   node tests/motion.test.mjs

import * as THREE from 'three';
import { Tweens } from '../src/gfx/tween.js';
import { createPiece } from '../src/gfx/pieces.js';
import { MOTION, IDLE } from '../src/rogue/motion.js';
import { dressPersona, animateLook, LOOK_IDS, PERSONA_COLOR } from '../src/rogue/looks.js';
import { PERSONAS } from '../src/rogue/content.js';
import { PAWN, KING, YOU } from '../src/rogue/rules.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else { failed++; console.log(`FAIL ${name}${detail ? '\n   ' + detail : ''}`); }
}

const m = new THREE.MeshStandardMaterial();
const mats = { white: { body: m, trim: m }, black: { body: m, trim: m } };
const noop = () => {};
const fx = { burst: noop, trail: noop, ring: noop, shatter: noop, flashAt: noop, beamAt: noop };

// Runs one animation to the end at 60 frames a second, sampling the piece as it goes.
async function play(start, pc) {
  const tweens = new Tweens();
  const sounds = [], beats = [];
  const arena = { tweens, fx, sfx: (n) => sounds.push(n), beat: (k) => beats.push(k), dust: noop };
  let done = false, result;
  const p = Promise.resolve(start(arena)).then((r) => { done = true; result = r; });
  const trace = [];
  let t = 0;
  const box = new THREE.Box3();
  while (!done && t < 6) {
    tweens.update(1 / 60);
    t += 1 / 60;
    pc.group.updateMatrixWorld(true);
    box.setFromObject(pc.group);
    trace.push([box.min.y, box.max.y, (box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, box.max.x - box.min.x]);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  }
  await Promise.race([p, new Promise((r) => setTimeout(r, 50))]);
  return { done, t, sounds, beats, trace, result };
}

function makePawn(perk) {
  const pc = createPiece(perk === 'regal' ? KING : PAWN, YOU, mats);
  pc.side = YOU;
  dressPersona(pc, perk, 'Testa');
  return pc;
}

// A fingerprint of a motion: where the piece's bounds were at twelve moments.
function fingerprint(trace) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const f = trace[Math.min(trace.length - 1, Math.floor((i / 11) * (trace.length - 1)))];
    out.push(...f.map((v) => Math.round(v * 20) / 20));
  }
  return out.join(',');
}

const perks = Object.keys(PERSONAS);
check('every temper has a colour', perks.every((p) => PERSONA_COLOR[p] !== undefined), perks.filter((p) => PERSONA_COLOR[p] === undefined).join(', '));
check('every temper has move, attack and die', perks.every((p) => MOTION[p] && ['move', 'attack', 'die'].every((k) => typeof MOTION[p][k] === 'function')));
check('every pawn temper has a look of its own', LOOK_IDS.length === perks.filter((p) => p !== 'regal').length);

// ---- each look is different
{
  const shapes = new Map();
  for (const perk of LOOK_IDS) {
    const pc = makePawn(perk);
    pc.look.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(pc.look), size = b.getSize(new THREE.Vector3());
    let meshes = 0;
    pc.look.traverse((o) => { if (o.isMesh) meshes++; });
    const key = [size.x, size.y, size.z].map((v) => v.toFixed(2)).join('x') + ':' + meshes;
    if (shapes.has(key)) check(`${perk} looks different from ${shapes.get(key)}`, false, key);
    shapes.set(key, perk);
    check(`${perk} has headgear above the shoulders`, b.max.y > 0.6, `top at ${b.max.y.toFixed(2)}`);
  }
  check(`twelve different silhouettes (${shapes.size})`, shapes.size === LOOK_IDS.length);
  const a = makePawn('bold'), b = createPiece(PAWN, YOU, mats);
  dressPersona(b, 'bold', 'Brin');
  check('two pawns of the same temper still differ in build', Math.abs(a.height - b.height) > 1e-4 || Math.abs(a.body.scale.x - b.body.scale.x) > 1e-4);
  const plain = createPiece(PAWN, YOU, mats);
  dressPersona(plain, null);
  check('a pawn without a temper wears nothing', !plain.look && plain.flutter.length === 0);
  for (const perk of LOOK_IDS) { const pc = makePawn(perk); animateLook(pc, 1.234); }
  check('moving parts animate without error', true);
  check('idle movements exist for every pawn temper', LOOK_IDS.every((p) => typeof IDLE[p] === 'function'));
}

// ---- each animation finishes, ends in the right place and is its own
const from = new THREE.Vector3(0, 0, 0), to = new THREE.Vector3(0, 0, -1), dir = new THREE.Vector3(0, 0, -1);
const prints = { move: new Map(), attack: new Map(), die: new Map() };
const lengths = { move: [], attack: [], die: [] };
for (const perk of perks) {
  // move
  let pc = makePawn(perk);
  let r = await play((a) => MOTION[perk].move(a, pc, from.clone(), to.clone(), { dir, dist: 1 }), pc);
  check(`${perk}: move finishes`, r.done, `still running after ${r.t.toFixed(1)} s`);
  check(`${perk}: move ends on the target square`, Math.abs(pc.group.position.x - to.x) < 1e-3 && Math.abs(pc.group.position.z - to.z) < 1e-3,
    `ended at ${pc.group.position.x.toFixed(2)}, ${pc.group.position.z.toFixed(2)}`);
  lengths.move.push([perk, r.t]);
  prints.move.set(perk, fingerprint(r.trace));

  // attack
  pc = makePawn(perk);
  let strikes = 0;
  r = await play((a) => MOTION[perk].attack(a, pc, from.clone(), to.clone(), () => { strikes++; }, { dir, dist: 1 }), pc);
  check(`${perk}: attack finishes`, r.done);
  check(`${perk}: attack lands a blow`, strikes > 0);
  check(`${perk}: attack ends on the target square`, Math.abs(pc.group.position.x - to.x) < 1e-3 && Math.abs(pc.group.position.z - to.z) < 1e-3);
  lengths.attack.push([perk, r.t]);
  prints.attack.set(perk, fingerprint(r.trace));

  // die
  pc = makePawn(perk);
  r = await play((a) => MOTION[perk].die(a, pc, new THREE.Vector3(0, 0, -1)), pc);
  check(`${perk}: death finishes`, r.done);
  check(`${perk}: death makes a sound`, r.sounds.length > 0);
  lengths.die.push([perk, r.t]);
  prints.die.set(perk, fingerprint(r.trace));
  if (perk === 'regal') check('the king stays where he fell', r.result === 'keep');
}
for (const kind of ['move', 'attack', 'die']) {
  const seen = new Map();
  for (const [perk, f] of prints[kind]) {
    if (seen.has(f)) check(`${perk} ${kind} differs from ${seen.get(f)}`, false);
    seen.set(f, perk);
  }
  check(`every ${kind} is different (${seen.size} of ${prints[kind].size})`, seen.size === prints[kind].size);
  const ls = lengths[kind].map(([, t]) => t);
  check(`every ${kind} takes between 0.2 and 2.5 s (${Math.min(...ls).toFixed(2)} to ${Math.max(...ls).toFixed(2)})`, Math.min(...ls) >= 0.2 && Math.max(...ls) <= 2.5);
}
console.log('\nhow long each takes, in seconds');
console.log('  temper      move  attack  death');
for (let i = 0; i < perks.length; i++) {
  console.log(`  ${perks[i].padEnd(11)} ${lengths.move[i][1].toFixed(2).padStart(4)}  ${lengths.attack[i][1].toFixed(2).padStart(6)}  ${lengths.die[i][1].toFixed(2).padStart(5)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
