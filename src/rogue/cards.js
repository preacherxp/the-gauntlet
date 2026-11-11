// The spell cards. A card names the squares it needs, one step at a time, and
// then acts on the battle. `steps[i](b, chosen)` returns the squares that are
// valid for target i given the ones already chosen; `play(b, chosen, ev)`
// carries it out and appends what happened to `ev` for the board to animate.

import { PAWN, KNIGHT, QUEEN, KING, YOU, FOE } from './rules.js';

const KNIGHT_D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const free = (p) => !(p.frozen > 0);

export const CARDS = {
  quickstep: {
    name: 'Quickstep', cost: 1, rarity: 'common', kind: 'move', glyph: 'step',
    text: 'Step one of yours to an empty square next to it. Keeps your move.',
    steps: [
      (b) => b.ownIdx((p, i) => free(p) && b.neighbors(i).some((n) => b.isEmpty(n) && b.pawnMayStand(p, n))),
      (b, [from]) => b.neighbors(from).filter((n) => b.isEmpty(n) && b.pawnMayStand(b.cells[from], n)),
    ],
    play: (b, [from, to], ev) => b.shift(from, to, 'step', ev),
  },
  aegis: {
    name: 'Aegis', cost: 1, rarity: 'common', kind: 'guard', glyph: 'shield',
    text: 'Shield one of yours. The next capture on it fails.',
    steps: [(b) => b.ownIdx((p) => !p.shield)],
    play: (b, [at], ev) => b.setShield(at, true, ev),
  },
  frost: {
    name: 'Frost', cost: 1, rarity: 'common', kind: 'control', glyph: 'snow',
    text: 'Freeze an enemy that is not a king. It skips a turn.',
    steps: [(b) => b.foeIdx((p) => p.type !== KING && !(p.frozen > 0))],
    play: (b, [at], ev) => b.freeze(at, 1, ev),
  },
  bolt: {
    name: 'Bolt', cost: 2, rarity: 'common', kind: 'attack', glyph: 'bolt',
    text: 'Destroy an enemy pawn. A shield absorbs it.',
    steps: [(b) => b.foeIdx((p) => p.type === PAWN)],
    play: (b, [at], ev) => b.smite(at, ev),
  },
  insight: {
    name: 'Insight', cost: 0, rarity: 'common', kind: 'utility', glyph: 'eye',
    text: 'Draw 2 cards.',
    steps: [],
    play: (b, _, ev) => b.draw(2, ev),
  },
  conscript: {
    name: 'Conscript', cost: 1, rarity: 'common', kind: 'summon', glyph: 'pawn',
    text: 'Summon a pawn in your home rows for this fight.',
    steps: [(b) => b.emptyIdx((i) => b.y(i) < 2)],
    play: (b, [at], ev) => b.summon(PAWN, YOU, at, ev),
  },
  transpose: {
    name: 'Transpose', cost: 1, rarity: 'common', kind: 'move', glyph: 'swap',
    text: 'Swap two of your pieces.',
    steps: [
      (b) => (b.ownIdx(() => true).length > 1 ? b.ownIdx(() => true) : []),
      (b, [a]) => b.ownIdx((p, i) => i !== a && b.pawnMayStand(p, a) && b.pawnMayStand(b.cells[a], i)),
    ],
    play: (b, [a, c], ev) => b.swap(a, c, ev),
  },
  barricade: {
    name: 'Barricade', cost: 1, rarity: 'common', kind: 'guard', glyph: 'wall',
    text: 'Raise a rock on an empty square for 3 rounds.',
    steps: [(b) => b.emptyIdx(() => true)],
    play: (b, [at], ev) => b.raiseRock(at, 3, ev),
  },
  recall: {
    name: 'Recall', cost: 0, rarity: 'common', kind: 'move', glyph: 'home',
    text: 'Send one of yours to your home row. Draw a card.',
    steps: [
      (b) => (b.emptyIdx((i) => b.y(i) === 0).length ? b.ownIdx((p, i) => free(p) && b.y(i) > 0) : []),
      (b) => b.emptyIdx((i) => b.y(i) === 0),
    ],
    play: (b, [from, to], ev) => { b.shift(from, to, 'blink', ev); b.draw(1, ev); },
  },
  leap: {
    name: "Knight's Leap", cost: 1, rarity: 'uncommon', kind: 'attack', glyph: 'leap',
    text: 'One of yours leaps like a knight and may capture. Keeps your move.',
    steps: [
      (b) => b.ownIdx((p, i) => free(p) && leapSquares(b, i).length > 0),
      (b, [from]) => leapSquares(b, from),
    ],
    play: (b, [from, to], ev) => b.strike(from, to, ev, 'leap'),
  },
  doubletime: {
    name: 'Double Time', cost: 2, rarity: 'uncommon', kind: 'move', glyph: 'clock',
    text: 'Move twice this turn.',
    steps: [],
    play: (b, _, ev) => { b.extraMoves++; ev.push({ t: 'again', pending: true }); },
  },
  royalhour: {
    name: "Queen's Hour", cost: 2, rarity: 'uncommon', kind: 'move', glyph: 'crown',
    text: 'One of yours moves like a queen this turn.',
    steps: [(b) => b.ownIdx((p) => free(p) && p.type !== QUEEN && !p.queen)],
    play: (b, [at], ev) => b.setQueen(at, true, ev),
  },
  blink: {
    name: 'Blink', cost: 2, rarity: 'uncommon', kind: 'move', glyph: 'portal',
    text: 'Move one of yours to any empty square.',
    steps: [
      (b) => b.ownIdx((p) => free(p)),
      (b, [from]) => b.emptyIdx((i) => b.pawnMayStand(b.cells[from], i)),
    ],
    play: (b, [from, to], ev) => b.shift(from, to, 'blink', ev),
  },
  rally: {
    name: 'Rally', cost: 1, rarity: 'uncommon', kind: 'move', glyph: 'flag',
    text: 'Every pawn of yours steps forward if it can.',
    steps: [],
    can: (b) => b.ownIdx((p, i) => p.type === PAWN && free(p) && b.isEmpty(i + b.w)).length > 0,
    play: (b, _, ev) => {
      // far pawns first, so one pawn does not block the one behind it
      const pawns = b.ownIdx((p) => p.type === PAWN && free(p)).sort((a, c) => c - a);
      for (const i of pawns) if (b.y(i) < b.h - 1 && b.isEmpty(i + b.w)) b.strike(i, i + b.w, ev, 'step');
    },
  },
  bloodprice: {
    name: 'Blood Price', cost: 0, rarity: 'uncommon', kind: 'utility', glyph: 'drop',
    text: 'Destroy a pawn of yours. Gain 2 aether, draw 2.',
    steps: [(b) => b.ownIdx((p) => p.type === PAWN)],
    play: (b, [at], ev) => { b.remove(at, ev, true); b.gain(2, ev); b.draw(2, ev); },
  },
  deepfreeze: {
    name: 'Deep Freeze', cost: 2, rarity: 'uncommon', kind: 'control', glyph: 'snow',
    text: 'Freeze every enemy pawn for a turn.',
    steps: [],
    can: (b) => b.foeIdx((p) => p.type === PAWN).length > 0,
    play: (b, _, ev) => { for (const i of b.foeIdx((p) => p.type === PAWN)) b.freeze(i, 1, ev); },
  },
  phalanx: {
    name: 'Phalanx', cost: 2, rarity: 'uncommon', kind: 'guard', glyph: 'shield',
    text: 'Shield every pawn of yours.',
    steps: [],
    can: (b) => b.ownIdx((p) => p.type === PAWN && !p.shield).length > 0,
    play: (b, _, ev) => { for (const i of b.ownIdx((p) => p.type === PAWN && !p.shield)) b.setShield(i, true, ev); },
  },
  knighting: {
    name: 'Knighting', cost: 2, rarity: 'uncommon', kind: 'summon', glyph: 'star', exhaust: true,
    text: 'A pawn of yours becomes a knight this fight. Once.',
    steps: [(b) => b.ownIdx((p) => p.type === PAWN)],
    play: (b, [at], ev) => b.morph(at, KNIGHT, ev),
  },
  surge: {
    name: 'Aether Surge', cost: 0, rarity: 'uncommon', kind: 'utility', glyph: 'spark', exhaust: true,
    text: 'Gain 2 aether. Once per fight.',
    steps: [],
    play: (b, _, ev) => b.gain(2, ev),
  },
  turncoat: {
    name: 'Turncoat', cost: 3, rarity: 'rare', kind: 'control', glyph: 'turn', exhaust: true,
    text: 'An enemy pawn joins you for this fight. Once.',
    steps: [(b) => b.foeIdx((p, i) => p.type === PAWN && b.y(i) < b.h - 1)],
    play: (b, [at], ev) => b.convert(at, ev),
  },
  meteor: {
    name: 'Meteor', cost: 3, rarity: 'rare', kind: 'attack', glyph: 'meteor', exhaust: true,
    text: 'Destroy any enemy but the king. Shields absorb it. Once.',
    steps: [(b) => b.foeIdx((p) => p.type !== KING)],
    play: (b, [at], ev) => b.smite(at, ev),
  },
  bastion: {
    name: 'Royal Bastion', cost: 1, rarity: 'rare', kind: 'guard', glyph: 'crown',
    text: 'Shield your king. Draw a card.',
    steps: [],
    play: (b, _, ev) => { const k = b.ownIdx((p) => p.type === KING)[0]; if (k !== undefined && !b.cells[k].shield) b.setShield(k, true, ev); b.draw(1, ev); },
  },
};
// What the player is asked for at each target step.
const ASK = {
  quickstep: ['Choose one of your pieces', 'Choose the square it steps to'],
  aegis: ['Choose a piece to shield'],
  frost: ['Choose an enemy piece to freeze'],
  bolt: ['Choose an enemy pawn'],
  conscript: ['Choose a square in your home rows'],
  transpose: ['Choose the first piece', 'Choose the piece to swap it with'],
  barricade: ['Choose an empty square'],
  recall: ['Choose a piece to call back', 'Choose a square on your home row'],
  leap: ['Choose a piece to leap', 'Choose where it lands'],
  royalhour: ['Choose a piece to empower'],
  blink: ['Choose a piece to move', 'Choose any empty square'],
  bloodprice: ['Choose a pawn to give up'],
  knighting: ['Choose a pawn to knight'],
  turncoat: ['Choose an enemy pawn'],
  meteor: ['Choose an enemy piece'],
};
for (const [id, c] of Object.entries(CARDS)) { c.id = id; c.ask = ASK[id] || []; }

function leapSquares(b, from) {
  const p = b.cells[from], out = [];
  const x = from % b.w, y = (from / b.w) | 0;
  for (const [dx, dy] of KNIGHT_D) {
    const tx = x + dx, ty = y + dy;
    if (tx < 0 || ty < 0 || tx >= b.w || ty >= b.h) continue;
    const t = ty * b.w + tx;
    if (b.rock[t]) continue;
    const q = b.cells[t];
    if (q ? q.side === FOE : b.pawnMayStand(p, t)) out.push(t);
  }
  return out;
}

export const RARITY_WEIGHT = { common: 60, uncommon: 32, rare: 8 };
export const CARD_IDS = Object.keys(CARDS);
