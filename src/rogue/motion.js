// How each temper moves, attacks and dies. Every function animates one piece
// through the arena's tweens and resolves when it is done.
//
//   move(a, pc, from, to, { dir, dist })          ends standing on `to`
//   attack(a, pc, from, to, strike, { dir, dist }) calls strike() at the blow, ends on `to`
//   die(a, pc, away, room)                         `away`: the way to fall, chosen by the arena where there is space;
//                                                  `room`: how far from its square it may reach that way before it
//                                                  meets another piece. Return 'keep' to leave the body.
//
// `a` is the arena: a.tweens, a.fx, a.sfx(name), a.beat(kind, data), a.dust(pos, n).
// Animations may move pc.group and pc.model freely; the arena settles the piece afterwards.

import * as THREE from 'three';
import { ease } from '../gfx/tween.js';
import { PERSONA_COLOR as C } from './looks.js';

const PI = Math.PI, sin = Math.sin, abs = Math.abs;
const UP = new THREE.Vector3(0, 1, 0), AXIS = new THREE.Vector3();
const FIRE = [0xff5a14, 0xffb000, 0xff2a00], GOLD = [0xffd24a, 0xfff2a0, 0xffb000], PAPER = [0xffffff, 0xf2ead8, 0xe0d4b8];

const run = (a, dur, fn, e = ease.linear, delay = 0) => a.tweens.run(dur, fn, e, delay);
const wait = (a, s) => a.tweens.wait(s);
const at = (pc, y = 0) => pc.group.position.clone().setY(y);
const perp = (d) => new THREE.Vector3(-d.z, 0, d.x);

function slide(pc, from, to, k) {
  pc.group.position.x = from.x + (to.x - from.x) * k;
  pc.group.position.z = from.z + (to.z - from.z) * k;
}
// Lean the top of the piece toward `dir` (negative leans back).
function lean(pc, dir, amt) { pc.group.rotation.set(dir.z * amt, 0, -dir.x * amt); }
// Tip over toward `dir`, pivoting on the foot.
function tip(pc, dir, angle) { AXIS.crossVectors(UP, dir).normalize(); pc.group.quaternion.setFromAxisAngle(AXIS, angle); }
// Turn toward `dir` about the piece's middle, with its foot `y` above the board.
function roll(pc, dir, angle, y = 0) {
  const h = pc.height / 2;
  tip(pc, dir, angle);
  pc.model.position.y = -h;
  pc.group.position.y = y + h;
}
function upright(pc) {
  pc.group.quaternion.identity();
  pc.group.position.y = 0;
  pc.model.position.y = 0;
  pc.model.scale.setScalar(1);
}
// Squash and stretch that keeps the volume.
function squash(pc, sy) { const sx = 1 / Math.sqrt(Math.max(0.05, sy)); pc.model.scale.set(sx, sy, sx); }
const shrink = (pc, k) => pc.model.scale.setScalar(Math.max(0.001, 1 - k));
// The furthest a falling piece may tip, so its head stays within `room` of its foot.
function tipTo(pc, room, full) {
  const tall = (pc.top || pc.height) + 0.05;
  return room === undefined || room >= tall ? full : Math.min(full, Math.asin(Math.max(0, room) / tall));
}
// How far a piece may travel from its square, its own width included.
const roomFor = (pc, room, want) => (room === undefined ? want : Math.max(0, Math.min(want, room - (pc.reach || pc.radius))));

export const MOTION = {
  // ------------------------------------------------------------- the Bold
  bold: {
    // Marches in firm, stamping steps.
    async move(a, pc, from, to, { dir, dist }) {
      const steps = Math.max(2, Math.round(dist * 2));
      let last = 0;
      await run(a, 0.15 * steps + 0.06, (k) => {
        slide(pc, from, to, k);
        const s = Math.min(k * steps, steps), ph = s % 1;
        pc.model.position.y = sin(PI * ph) * 0.09;
        lean(pc, dir, 0.05 + sin(PI * ph) * 0.1);
        if (Math.floor(s) > last) { last = Math.floor(s); a.dust(pc.group.position, 5); a.sfx('step'); }
      });
    },
    // Rears back, then charges head first.
    async attack(a, pc, from, to, strike, { dir }) {
      await run(a, 0.2, (k) => { lean(pc, dir, -0.28 * k); squash(pc, 1 - 0.12 * k); }, ease.outQuad);
      a.sfx('whoosh');
      await run(a, 0.24, (k) => { slide(pc, from, to, k); lean(pc, dir, -0.28 + 0.78 * k); squash(pc, 0.88 + 0.2 * k); if (k > 0.85) strike(); }, ease.inQuad);
      strike();
      await run(a, 0.24, (k) => { pc.model.position.y = sin(PI * k) * 0.16; lean(pc, dir, 0.5 * (1 - k)); squash(pc, 1.08 - 0.08 * k); }, ease.outQuad);
    },
    // Falls like a tree, flat on its face, and sinks away.
    async die(a, pc, away, room) {
      const push = room === undefined ? 0.28 : Math.min(0.28, room * 0.2);
      const base = at(pc), end = base.clone().addScaledVector(away, push), fall = tipTo(pc, room === undefined ? room : room - push, 1.52);
      a.sfx('creak');
      await run(a, 0.7, (k) => { tip(pc, away, k * fall); slide(pc, base, end, k); }, ease.inQuad);
      a.dust(end.clone().addScaledVector(away, 0.4), 16); a.sfx('thud'); a.beat('shake', 0.12);
      await run(a, 0.16, (k) => tip(pc, away, fall * (1 - sin(PI * k) * 0.09)));
      await run(a, 0.5, (k) => { pc.group.position.y = -0.45 * k; shrink(pc, k * 0.5); }, ease.inQuad, 0.3);
    },
  },

  // --------------------------------------------------------- the Cautious
  cautious: {
    // Creeps along crouched, looking left and right.
    async move(a, pc, from, to, { dist }) {
      const base = pc.model.rotation.y;
      await run(a, 0.42 + 0.22 * dist, (k) => {
        slide(pc, from, to, ease.inOutQuad(k));
        squash(pc, 0.9);
        pc.model.rotation.y = base + sin(k * PI * 4) * 0.45;
        pc.group.rotation.z = sin(k * 70) * 0.025;
      });
    },
    // Edges halfway, trembles, then shuts its eyes and jumps.
    async attack(a, pc, from, to, strike, { dir }) {
      const mid = from.clone().lerp(to, 0.45);
      await run(a, 0.32, (k) => { slide(pc, from, mid, k); squash(pc, 0.9); }, ease.outQuad);
      a.sfx('squeak');
      await run(a, 0.3, (k) => { pc.group.rotation.set(0, 0, sin(k * 80) * 0.05); squash(pc, 0.9 - 0.08 * sin(PI * k)); });
      await run(a, 0.22, (k) => { slide(pc, mid, to, k); pc.model.position.y = sin(PI * k) * 0.32; lean(pc, dir, 0.3 * k); squash(pc, 1.06); if (k > 0.8) strike(); }, ease.inQuad);
      strike();
      await run(a, 0.35, (k) => { pc.group.rotation.set(0, 0, sin(k * 50) * 0.06 * (1 - k)); squash(pc, 1 - 0.06 * sin(PI * k)); });
    },
    // Wobbles, faints over backwards, and fades.
    async die(a, pc, away, room) {
      a.sfx('squeak');
      await run(a, 0.3, (k) => { pc.group.rotation.z = sin(k * 30) * 0.12; });
      const fall = tipTo(pc, room, 1.5);
      await run(a, 0.65, (k) => tip(pc, away, k * fall), ease.outBounce);
      a.sfx('thud'); a.dust(at(pc), 8);
      await run(a, 0.35, (k) => shrink(pc, k), ease.inQuad, 0.35);
    },
  },

  // --------------------------------------------------------- the Restless
  restless: {
    // Bounces there in quick little hops.
    async move(a, pc, from, to, { dist }) {
      const hops = Math.max(2, Math.ceil(dist * 1.6));
      let last = -1;
      await run(a, 0.13 * hops + 0.06, (k) => {
        slide(pc, from, to, k);
        const s = Math.min(k * hops, hops - 1e-6), ph = s % 1;
        pc.model.position.y = sin(PI * ph) * 0.3;
        squash(pc, 0.86 + 0.32 * sin(PI * ph));
        if (Math.floor(s) > last) { last = Math.floor(s); a.sfx('boing'); a.fx.trail(pc.group.position, [C.restless, 0xffffff], 3); }
      });
    },
    // Two hops in, then keeps bouncing on the spot.
    async attack(a, pc, from, to, strike) {
      await run(a, 0.3, (k) => { slide(pc, from, to, k); const ph = (k * 2) % 1; pc.model.position.y = sin(PI * ph) * 0.35; squash(pc, 0.86 + 0.32 * sin(PI * ph)); });
      strike();
      for (let i = 0; i < 3; i++) {
        a.sfx('boing');
        a.fx.burst(at(pc, 0.1), [C.restless, 0xffffff], { count: 12, speed: 1.6, up: 1, size: 0.08, life: 0.4 });
        await run(a, 0.16, (k) => { pc.model.position.y = sin(PI * k) * (0.24 - i * 0.06); squash(pc, 0.86 + 0.3 * sin(PI * k)); });
      }
    },
    // Ricochets about, spinning, and pops.
    async die(a, pc, away, room) {
      const base = at(pc), far = roomFor(pc, room, 0.6), side = perp(away);
      let spin = 0;
      for (let i = 0; i < 3; i++) {
        const from = pc.group.position.clone(), to = base.clone().addScaledVector(away, far * (i + 1) / 3).addScaledVector(side, (Math.random() - 0.5) * 0.16);
        a.sfx('boing');
        await run(a, 0.2 - i * 0.03, (k) => { slide(pc, from, to, k); pc.model.position.y = sin(PI * k) * (0.4 - i * 0.1); pc.group.rotation.y = spin + k * PI; });
        spin += PI;
      }
      a.sfx('pop');
      a.fx.burst(at(pc, 0.35), [C.restless, 0xffffff, 0xd8ffa0], { count: 60, speed: 3, up: 1.5, size: 0.12, life: 0.6, sphere: true });
      await run(a, 0.12, (k) => pc.model.scale.setScalar(Math.max(0.001, 1 + 0.4 * k - 1.4 * k * k)));
    },
  },

  // -------------------------------------------------------------- the Sly
  sly: {
    // Sinks into the board, slides along beneath it, and rises.
    async move(a, pc, from, to, { dist }) {
      await run(a, 0.18, (k) => { pc.model.scale.set(1 + 0.2 * k, Math.max(0.1, 1 - 0.9 * k), 1 + 0.2 * k); pc.model.position.y = -0.04 * k; }, ease.inQuad);
      a.sfx('poof');
      await run(a, 0.14 + 0.09 * dist, (k) => { slide(pc, from, to, k); if (Math.random() < 0.6) a.fx.trail(at(pc, 0.02), [C.sly, 0xb090ff], 1); }, ease.inOutQuad);
      await run(a, 0.22, (k) => { pc.model.scale.set(1.2 - 0.2 * k, Math.max(0.1, k), 1.2 - 0.2 * k); pc.model.position.y = -0.04 * (1 - k); }, ease.outBack);
    },
    // Vanishes, and bursts up from under its victim.
    async attack(a, pc, from, to, strike) {
      await run(a, 0.16, (k) => pc.model.scale.set(1 + 0.2 * k, Math.max(0.1, 1 - 0.9 * k), 1 + 0.2 * k), ease.inQuad);
      a.sfx('poof');
      await run(a, 0.22, (k) => { slide(pc, from, to, k); a.fx.trail(at(pc, 0.02), [C.sly, 0xb090ff], 1); }, ease.inOutQuad);
      strike();
      a.fx.burst(at(pc, 0.1), [C.sly, 0xc8a8ff, 0x5a3a90], { count: 50, speed: 2.6, up: 2.2, size: 0.13, life: 0.6 });
      a.fx.ring(pc.group.position, C.sly, 1.4, 0.4);
      a.sfx('whoosh');
      await run(a, 0.32, (k) => { pc.model.scale.set(1.2 - 0.2 * k, 0.1 + 0.9 * k, 1.2 - 0.2 * k); pc.model.position.y = sin(PI * k) * 0.3; pc.group.rotation.y = k * PI * 2; }, ease.outQuad);
    },
    // Spins away into a puff of smoke.
    async die(a, pc) {
      a.sfx('poof');
      await run(a, 0.45, (k) => { pc.group.rotation.y = k * PI * 3; shrink(pc, k); if (Math.random() < 0.7) a.fx.trail(at(pc, 0.2), [C.sly, 0xb090ff, 0x5a3a90], 2); }, ease.inQuad);
      a.fx.burst(at(pc, 0.3), [C.sly, 0x9a80d0, 0x5a3a90], { count: 60, speed: 1.2, up: 1.4, size: 0.26, life: 1.1, gravity: -0.6 });
      a.fx.ring(pc.group.position, C.sly, 1.3, 0.4);
    },
  },

  // -------------------------------------------------------- the Ambitious
  ambitious: {
    // Floats along in a slow, admiring twirl.
    async move(a, pc, from, to, { dist }) {
      await run(a, 0.55 + 0.08 * dist, (k) => {
        slide(pc, from, to, ease.inOutQuad(k));
        pc.model.position.y = sin(PI * k) * 0.42;
        pc.group.rotation.y = ease.inOutQuad(k) * PI * 2;
        if (Math.random() < 0.6) a.fx.trail(pc.group.position.clone().setY(pc.model.position.y), [0xffd24a, 0xfff2c0], 1);
      });
    },
    // Rises high, hangs there, and comes down like a verdict.
    async attack(a, pc, from, to, strike) {
      a.sfx('whoosh');
      await run(a, 0.42, (k) => { slide(pc, from, to, ease.inOutQuad(k)); pc.model.position.y = sin(PI * 0.5 * k) * 1.3; pc.group.rotation.y = k * PI * 2; squash(pc, 1 + 0.1 * k); }, ease.outQuad);
      await run(a, 0.14, (k) => { pc.model.position.y = 1.3 + sin(PI * k) * 0.06; });
      await run(a, 0.11, (k) => { pc.model.position.y = 1.3 * (1 - k); squash(pc, 1.1 + 0.15 * k); }, ease.inQuad);
      strike();
      a.sfx('slam'); a.beat('shake', 0.25);
      a.fx.ring(pc.group.position, 0xffd24a, 2.4, 0.5);
      a.fx.burst(at(pc, 0.1), [0xffd24a, 0xfff2c0, 0xffffff], { count: 70, speed: 3.2, up: 1.6, size: 0.14, life: 0.7 });
      await run(a, 0.22, (k) => squash(pc, 0.75 + 0.25 * k), ease.outBack);
    },
    // Rises toward the sky it always wanted, and shatters there.
    async die(a, pc) {
      a.sfx('sparkle');
      await run(a, 0.75, (k) => { pc.group.position.y = k * 1.1; pc.group.rotation.y = k * PI * 1.5; if (Math.random() < 0.7) a.fx.trail(pc.group.position, [0xffd24a, 0xfff2c0], 1); }, ease.outQuad);
      a.sfx('capture');
      a.fx.shatter(pc.group.position.clone(), pc.height, pc.body.material, 14);
      a.fx.burst(pc.group.position.clone().setY(pc.group.position.y + 0.4), [0xffd24a, 0xfff2c0, 0xffffff], { count: 90, speed: 3.4, up: 0.5, size: 0.15, life: 0.9, sphere: true });
      a.fx.flashAt(pc.group.position, 0xffd24a, 8);
      pc.group.visible = false;
    },
  },

  // --------------------------------------------------------- the Stubborn
  stubborn: {
    // Trudges, rocking side to side, and lands with a thud.
    async move(a, pc, from, to, { dir, dist }) {
      const steps = Math.max(2, Math.round(dist * 2)), side = perp(dir);
      await run(a, 0.45 + 0.17 * dist, (k) => { slide(pc, from, to, k); tip(pc, side, sin(k * PI * steps) * 0.1); });
      a.sfx('thud'); a.dust(pc.group.position, 10);
      await run(a, 0.12, (k) => squash(pc, 1 - 0.08 * sin(PI * k)));
    },
    // Plods up, braces, and rams.
    async attack(a, pc, from, to, strike, { dir }) {
      const near = from.clone().lerp(to, 0.62), side = perp(dir);
      await run(a, 0.4, (k) => { slide(pc, from, near, k); tip(pc, side, sin(k * PI * 3) * 0.08); });
      await run(a, 0.12, (k) => { lean(pc, dir, -0.18 * k); squash(pc, 1 - 0.1 * k); }, ease.outQuad);
      await run(a, 0.1, (k) => { slide(pc, near, to, k); lean(pc, dir, -0.18 + 0.4 * k); if (k > 0.7) strike(); }, ease.inCubic);
      strike();
      a.sfx('thud'); a.beat('shake', 0.22); a.dust(pc.group.position, 18);
      a.fx.ring(pc.group.position, 0xa89c8c, 1.6, 0.4);
      await run(a, 0.25, (k) => { lean(pc, dir, 0.22 * (1 - k)); squash(pc, 0.9 + 0.1 * k); }, ease.outQuad);
    },
    // Will not fall. Shudders, cracks, and is ground into the board.
    async die(a, pc) {
      const base = at(pc);
      a.sfx('rock');
      await run(a, 0.4, (k) => { pc.group.position.x = base.x + (Math.random() - 0.5) * 0.05 * k; pc.group.position.z = base.z + (Math.random() - 0.5) * 0.05 * k; });
      a.fx.shatter(base, 0.3, pc.body.material, 8);
      await run(a, 0.8, (k) => { pc.group.position.y = -pc.height * 1.05 * k; if (Math.random() < 0.4) a.dust(base, 2); }, ease.inQuad);
    },
  },

  // ----------------------------------------------------------- the Magpie
  greedy: {
    // Skips along, turning as it goes, shedding the odd coin.
    async move(a, pc, from, to, { dist }) {
      const hops = Math.max(2, Math.round(dist * 1.5));
      let last = -1;
      await run(a, 0.16 * hops + 0.06, (k) => {
        slide(pc, from, to, k);
        const s = Math.min(k * hops, hops - 1e-6), ph = s % 1;
        pc.model.position.y = sin(PI * ph) * 0.2;
        pc.group.rotation.y = k * PI * 2;
        if (Math.floor(s) > last) { last = Math.floor(s); a.sfx('step'); if (last % 2) a.fx.burst(at(pc, 0.4), GOLD, { count: 6, speed: 1, up: 1.5, size: 0.08, life: 0.5, gravity: 4 }); }
      });
    },
    // Swoops in from the side and comes away with the purse.
    async attack(a, pc, from, to, strike, { dir }) {
      const off = perp(dir);
      a.sfx('whoosh');
      await run(a, 0.42, (k) => {
        slide(pc, from, to, k);
        const bow = sin(PI * k);
        pc.group.position.addScaledVector(off, bow * 0.55);
        pc.model.position.y = bow * 0.45;
        lean(pc, dir, 0.25 * bow);
        if (k > 0.85) strike();
      }, ease.inOutQuad);
      strike();
      a.sfx('coins');
      a.fx.burst(at(pc, 0.5), GOLD, { count: 50, speed: 2.4, up: 3.5, size: 0.11, life: 1.0, gravity: 7 });
      await run(a, 0.35, (k) => { pc.group.rotation.set(0, k * PI * 2, 0); pc.model.position.y = sin(PI * k) * 0.18; }, ease.outQuad);
    },
    // Bursts into a shower of everything it ever pocketed.
    async die(a, pc) {
      await run(a, 0.25, (k) => { pc.group.rotation.z = sin(k * 60) * 0.08; squash(pc, 1 + 0.1 * k); });
      a.sfx('coins'); a.sfx('pop');
      a.fx.burst(at(pc, 0.4), [...GOLD, 0xffffff], { count: 140, speed: 3.6, up: 3.2, size: 0.12, life: 1.3, gravity: 8, sphere: true });
      await run(a, 0.14, (k) => pc.model.scale.setScalar(Math.max(0.001, 1.1 - 1.1 * k)), ease.inQuad);
    },
  },

  // ---------------------------------------------------------- the Bookish
  bookish: {
    // Strolls, leaning back as if reading, and nods on arrival.
    async move(a, pc, from, to, { dir, dist }) {
      const steps = Math.max(2, Math.round(dist * 2));
      await run(a, 0.34 + 0.14 * dist, (k) => { slide(pc, from, to, ease.inOutQuad(k)); lean(pc, dir, -0.1); pc.model.position.y = abs(sin(k * PI * steps)) * 0.03; });
      await run(a, 0.2, (k) => lean(pc, dir, -0.1 + 0.3 * sin(PI * k)));
    },
    // Takes a run-up and flips over onto its victim, book first.
    async attack(a, pc, from, to, strike, { dir }) {
      const near = from.clone().lerp(to, 0.35);
      await run(a, 0.2, (k) => { slide(pc, from, near, k); lean(pc, dir, -0.1); });
      upright(pc);
      a.sfx('pages');
      await run(a, 0.42, (k) => { slide(pc, near, to, k); roll(pc, dir, k * PI * 2, sin(PI * k) * 0.45); if (k > 0.88) strike(); }, ease.inOutQuad);
      strike();
      a.sfx('thud');
      a.fx.burst(at(pc, 0.4), PAPER, { count: 40, speed: 2, up: 1.6, size: 0.13, life: 1.1, gravity: 0.6 });
    },
    // Keels over in a flutter of loose pages.
    async die(a, pc, away, room) {
      const fall = tipTo(pc, room, 1.5);
      a.sfx('pages');
      await run(a, 0.55, (k) => tip(pc, away, k * fall), ease.inQuad);
      a.sfx('thud');
      for (let i = 0; i < 3; i++) a.fx.burst(at(pc, 0.3 + i * 0.2), PAPER, { count: 18, speed: 1.2, up: 1.2, size: 0.15, life: 1.6, gravity: -0.25 });
      await run(a, 0.45, (k) => shrink(pc, k), ease.inQuad, 0.3);
    },
  },

  // ---------------------------------------------------------- the Furious
  furious: {
    // Seethes, charges, and skids to a stop.
    async move(a, pc, from, to, { dir, dist }) {
      await run(a, 0.16, (k) => { pc.group.rotation.z = sin(k * 90) * 0.06; a.fx.trail(at(pc, 0.1), FIRE, 1); });
      a.sfx('growl');
      const over = to.clone().addScaledVector(dir, 0.14);
      await run(a, 0.1 + 0.06 * dist, (k) => { slide(pc, from, over, k); lean(pc, dir, 0.4); a.fx.trail(at(pc, 0.05), FIRE, 2); }, ease.inQuad);
      a.dust(pc.group.position, 6);
      await run(a, 0.16, (k) => { slide(pc, over, to, k); lean(pc, dir, 0.4 * (1 - k) - 0.15 * sin(PI * k)); }, ease.outQuad);
    },
    // Shakes with rage, rushes in, then stamps on the spot.
    async attack(a, pc, from, to, strike, { dir }) {
      a.sfx('growl');
      await run(a, 0.32, (k) => { pc.group.rotation.set(sin(k * 95) * 0.07, 0, sin(k * 80) * 0.07); squash(pc, 1 + 0.12 * k); a.fx.trail(at(pc, 0.2), FIRE, 2); });
      await run(a, 0.18, (k) => { slide(pc, from, to, k); lean(pc, dir, 0.45); a.fx.trail(at(pc, 0.05), FIRE, 2); if (k > 0.85) strike(); }, ease.inQuad);
      strike();
      a.fx.flashAt(pc.group.position, 0xff5a14, 8);
      for (let i = 0; i < 2; i++) {
        await run(a, 0.14, (k) => { pc.model.position.y = sin(PI * k) * 0.16; lean(pc, dir, 0); squash(pc, 1); });
        a.sfx('thud'); a.beat('shake', 0.12); a.fx.ring(pc.group.position, 0xff5a14, 1.3, 0.3);
      }
    },
    // Swells with fury until it explodes.
    async die(a, pc) {
      a.sfx('growl');
      await run(a, 0.38, (k) => { pc.model.scale.setScalar(1 + 0.15 * k); pc.group.rotation.set(sin(k * 100) * 0.06 * k, 0, sin(k * 120) * 0.06 * k); a.fx.trail(at(pc, 0.3), FIRE, 2); }, ease.inQuad);
      a.sfx('boom'); a.beat('shake', 0.3);
      a.fx.shatter(pc.group.position.clone(), pc.height, pc.body.material, 16);
      a.fx.burst(at(pc, 0.4), [...FIRE, 0xffe08a], { count: 150, speed: 4.2, up: 2.4, size: 0.2, life: 0.9, gravity: 2, sphere: true });
      a.fx.ring(pc.group.position, 0xff5a14, 2.6, 0.5);
      a.fx.flashAt(pc.group.position, 0xff5a14, 14);
      pc.group.visible = false;
    },
  },

  // ------------------------------------------------------------ the Lucky
  lucky: {
    // Cartwheels there, somehow.
    async move(a, pc, from, to, { dir, dist }) {
      a.sfx('whoosh');
      await run(a, 0.42 + 0.1 * dist, (k) => { slide(pc, from, to, k); roll(pc, dir, k * PI * 2, sin(PI * k) * 0.3); }, ease.inOutQuad);
      a.fx.burst(at(pc, 0.3), [C.lucky, 0xb8ffb0, 0xffd24a], { count: 14, speed: 1.4, up: 1.2, size: 0.09, life: 0.6 });
    },
    // Trips over its own feet and tumbles into the enemy.
    async attack(a, pc, from, to, strike, { dir }) {
      a.sfx('squeak');
      await run(a, 0.22, (k) => tip(pc, dir, sin(k * PI * 2) * 0.28));
      await run(a, 0.45, (k) => { slide(pc, from, to, k); roll(pc, dir, k * PI * 2, sin(PI * k) * 0.2); if (k > 0.75) strike(); }, ease.inQuad);
      strike();
      upright(pc);
      a.sfx('sparkle');
      a.fx.burst(at(pc, 0.6), [C.lucky, 0xb8ffb0, 0xffd24a], { count: 40, speed: 2, up: 2, size: 0.11, life: 0.8 });
      await run(a, 0.32, (k) => { pc.group.rotation.set(0, sin(k * PI * 3) * 0.4, 0); });
    },
    // Is knocked clean off the board, tumbling up and away until it twinkles out.
    async die(a, pc, away, room) {
      const base = at(pc), dest = base.clone().addScaledVector(away, roomFor(pc, room, 1.4));
      let twinkled = false;
      a.sfx('boing');
      await run(a, 1.0, (k) => {
        slide(pc, base, dest, ease.outQuad(k));
        roll(pc, away, k * PI * 5, 2.6 * (1 - (1 - k) * (1 - k)));
        pc.model.scale.setScalar(Math.max(0.001, 1 - Math.max(0, k - 0.5) * 2));
        if (!twinkled && k > 0.4) { twinkled = true; a.sfx('sparkle'); a.fx.burst(pc.group.position.clone(), [0xffffff, 0xffd24a], { count: 24, speed: 2, up: 0, size: 0.12, life: 0.5, gravity: 0, sphere: true }); }
      });
    },
  },

  // ----------------------------------------------------------- the Gentle
  gentle: {
    // Glides softly, trailing light.
    async move(a, pc, from, to, { dist }) {
      await run(a, 0.38 + 0.12 * dist, (k) => {
        slide(pc, from, to, ease.inOutQuad(k));
        pc.model.position.y = 0.1 * sin(PI * k);
        pc.group.rotation.z = sin(k * PI * 2) * 0.05;
        if (Math.random() < 0.4) a.fx.trail(at(pc, 0.1), [0xffffff, 0xffc8e4], 1);
      });
    },
    // Approaches, bows apologetically, and taps.
    async attack(a, pc, from, to, strike, { dir }) {
      const near = from.clone().lerp(to, 0.6);
      await run(a, 0.3, (k) => { slide(pc, from, near, ease.inOutQuad(k)); pc.model.position.y = 0.08 * sin(PI * k); });
      a.sfx('chime');
      await run(a, 0.32, (k) => { slide(pc, near, to, k); tip(pc, dir, k * 0.75); if (k > 0.85) strike(); }, ease.inOutQuad);
      strike();
      a.fx.burst(at(pc, 0.4), [0xffffff, 0xffc8e4], { count: 26, speed: 1.3, up: 1, size: 0.11, life: 0.8, gravity: 0.5 });
      await run(a, 0.32, (k) => tip(pc, dir, 0.75 * (1 - k)), ease.outQuad);
    },
    // Rises quietly away, like a soul.
    async die(a, pc) {
      a.sfx('heal');
      await run(a, 1.15, (k) => {
        pc.group.position.y = k * 1.7;
        pc.model.scale.set(Math.max(0.001, 1 - 0.7 * k), 1 + 0.25 * k, Math.max(0.001, 1 - 0.7 * k));
        pc.group.rotation.y = sin(k * PI * 2) * 0.3;
        if (Math.random() < 0.6) a.fx.trail(pc.group.position.clone().setY(pc.group.position.y + 0.3), [0xffffff, 0xffc8e4], 1);
      }, ease.outQuad);
      a.fx.burst(pc.group.position.clone().setY(pc.group.position.y + 0.5), [0xffffff, 0xffc8e4, 0xfff6b0], { count: 50, speed: 1.6, up: 0.5, size: 0.12, life: 0.9, gravity: -0.5, sphere: true });
      pc.group.visible = false;
    },
  },

  // ------------------------------------------------------------- the Loud
  loud: {
    // One big, showy jump, squashing on both ends.
    async move(a, pc, from, to, { dist }) {
      await run(a, 0.12, (k) => squash(pc, 1 - 0.3 * k), ease.outQuad);
      a.sfx('whoosh');
      await run(a, 0.3 + 0.07 * dist, (k) => { slide(pc, from, to, k); pc.model.position.y = sin(PI * k) * 0.65; squash(pc, 0.7 + 0.55 * sin(PI * k)); });
      a.sfx('thud'); a.fx.ring(pc.group.position, C.loud, 1.2, 0.35);
      await run(a, 0.16, (k) => squash(pc, 0.7 + 0.3 * k), ease.outBack);
    },
    // A war cry that shakes the air, then a leap.
    async attack(a, pc, from, to, strike) {
      await run(a, 0.14, (k) => squash(pc, 1 - 0.25 * k), ease.outQuad);
      a.sfx('shout');
      a.fx.ring(pc.group.position, C.loud, 2.8, 0.5);
      a.fx.burst(at(pc, pc.height), [C.loud, 0xffffff], { count: 40, speed: 3, up: 0.3, size: 0.1, life: 0.5, sphere: true });
      await run(a, 0.22, (k) => squash(pc, 0.75 + 0.5 * sin(PI * k)));
      await run(a, 0.3, (k) => { slide(pc, from, to, k); pc.model.position.y = sin(PI * k) * 0.55; squash(pc, 0.8 + 0.4 * sin(PI * k)); if (k > 0.85) strike(); });
      strike();
      a.fx.ring(pc.group.position, C.loud, 1.8, 0.4); a.beat('shake', 0.15);
      await run(a, 0.18, (k) => squash(pc, 0.72 + 0.28 * k), ease.outBack);
    },
    // Squashed flat as a pancake, then gone with a pop.
    async die(a, pc) {
      a.sfx('squash');
      // flattened no wider than its own square
      const wide = Math.min(1.75, 0.46 / (pc.reach || pc.radius));
      await run(a, 0.18, (k) => pc.model.scale.set(1 + (wide - 1) * k, Math.max(0.08, 1 - 0.92 * k), 1 + (wide - 1) * k), ease.outQuad);
      await wait(a, 0.4);
      a.sfx('pop');
      a.fx.burst(at(pc, 0.05), [C.loud, 0xffffff, 0xffa0f0], { count: 60, speed: 2.6, up: 1, size: 0.12, life: 0.6 });
      await run(a, 0.16, (k) => pc.model.scale.set(Math.max(0.001, wide * (1 - k)), 0.08, Math.max(0.001, wide * (1 - k))), ease.inQuad);
    },
  },

  // ------------------------------------------------------------- the king
  regal: {
    async move(a, pc, from, to, { dist }) {
      await run(a, 0.4 + 0.14 * dist, (k) => {
        slide(pc, from, to, ease.inOutQuad(k));
        pc.model.position.y = sin(PI * k) * 0.06;
        if (Math.random() < 0.3) a.fx.trail(at(pc, 0.2), [0xffd27a, 0xfff2c8], 1);
      });
    },
    async attack(a, pc, from, to, strike) {
      await run(a, 0.34, (k) => { slide(pc, from, to, ease.inOutQuad(k)); squash(pc, 1 + 0.12 * sin(PI * k)); pc.model.position.y = sin(PI * k) * 0.2; if (k > 0.85) strike(); });
      strike();
      a.sfx('slam'); a.fx.ring(pc.group.position, 0xffd27a, 2, 0.45);
    },
    // Topples slowly, and stays where it fell.
    async die(a, pc, away, room) {
      const fall = tipTo(pc, room, 1.5);
      a.sfx('creak');
      await run(a, 1.1, (k) => tip(pc, away, k * fall), ease.outBounce);
      a.sfx('thud');
      a.fx.burst(at(pc, 0.3).addScaledVector(away, 0.6), [0xffd27a, 0xffffff], { count: 50, speed: 1.6, up: 2, size: 0.12, life: 1 });
      return 'keep';
    },
  },
};

// Small movements while a piece waits for its turn.
export const IDLE = {
  bold: (t, p) => ({ s: 1 + sin(t * 2 + p) * 0.015 }),
  cautious: (t, p) => ({ rz: sin(t * 37 + p) * 0.012 }),
  restless: (t, p) => ({ y: Math.max(0, sin(t * 9 + p)) * 0.035 }),
  sly: (t, p) => ({ ry: sin(t * 0.7 + p) * 0.7 }),
  ambitious: (t, p) => ({ rz: sin(t * 1.1 + p) * 0.05 }),
  stubborn: (t, p) => ({ s: 1 + sin(t * 0.9 + p) * 0.01 }),   // planted; only breathes, slowly
  greedy: (t, p) => ({ y: Math.pow(Math.max(0, sin(t * 1.9 + p)), 14) * 0.12 }),
  bookish: (t, p) => ({ rx: 0.05 + sin(t * 0.9 + p) * 0.04 }),
  furious: (t, p) => ({ s: 1 + sin(t * 8 + p) * 0.025, rz: sin(t * 41 + p) * 0.006 }),
  lucky: (t, p) => ({ rz: sin(t * 2.1 + p) * 0.06 }),
  gentle: (t, p) => ({ y: 0.04 + sin(t * 1.6 + p) * 0.025 }),
  loud: (t, p) => ({ y: abs(sin(t * 3.3 + p)) * 0.03 }),
};
