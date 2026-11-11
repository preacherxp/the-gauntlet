// One fight: the board, both armies, your hand and aether, and the enemy's
// turn. Pure logic. Every change is reported as an event so the 3D board can
// play it back; nothing here knows how it looks.
//
// Events: move, block, revive, spawn, destroy, shield, freeze, queen, shift,
// swap, convert, morph, rock, draw, aether, again, pass, turn, end.

import { PAWN, QUEEN, KING, YOU, FOE, pieceMoves, allMoves, chooseMove, promotes, mvFrom, mvTo } from './rules.js';
import { CARDS } from './cards.js';

export const HAND_LIMIT = 5;

export const TRAITS = {
  reinforce: { name: 'Reinforcements', text: 'A new pawn arrives on its back row every third turn.' },
  frenzy: { name: 'Frenzy', text: 'Moves twice on every third turn.' },
  shieldPawns: { name: 'Shield Wall', text: 'Its pawns start shielded.' },
  kingShield: { name: 'Warded King', text: 'Its king starts shielded, and is shielded again every fourth turn.' },
};

export class Battle {
  // cfg: { w, h, rocks, wells, player: [{ rosterId, type, x, y }], enemy: [{ type, x, y }],
  //        deck: [cardId], relics: [id], traits: [id], depth, rnd }
  constructor(cfg) {
    this.w = cfg.w; this.h = cfg.h;
    const n = this.w * this.h;
    this.cells = new Array(n).fill(null);
    this.rock = new Uint8Array(n);        // 1 = blocked
    this.rockTimer = new Int8Array(n);    // rounds left for a raised rock, 0 = permanent or none
    this.well = new Uint8Array(n);
    for (const [x, y] of cfg.rocks || []) this.rock[y * this.w + x] = 1;
    for (const [x, y] of cfg.wells || []) this.well[y * this.w + x] = 1;
    this.rnd = cfg.rnd || Math.random;
    this.relics = new Set(cfg.relics || []);
    this.traits = cfg.traits || [];
    this.depth = cfg.depth || 2;
    this.opts = { pikes: this.relics.has('pikes'), sidestep: this.relics.has('sidestep'), spurs: this.relics.has('spurs') };
    this.nextId = 1;
    for (const p of cfg.player) this.cells[p.y * this.w + p.x] = this.make(p.type, YOU, p.rosterId, p.perk, p.name);
    for (const p of cfg.enemy) this.cells[p.y * this.w + p.x] = this.make(p.type, FOE);
    this.deck = shuffle([...(cfg.deck || [])], this.rnd);
    this.hand = []; this.discard = []; this.exhausted = [];
    this.maxAether = 2 + (this.relics.has('hourglass') ? 1 : 0);
    this.aether = 0;
    this.turn = YOU; this.round = 0; this.enemyTurns = 0;
    this.extraMoves = 0;
    this.result = null;           // 'win' | 'lose'
    this.lost = [];               // roster ids of your pieces that fell
    this.captures = 0;
    this.phoenixUsed = false;
    this.moved = false;           // has the player made a board move this turn
    this.loot = 0;                // gold picked up by magpies
  }

  // `perk` is the piece's personality (see PERSONAS); it changes a rule or two.
  make(type, side, rosterId = null, perk = null, name = null) {
    return { id: this.nextId++, type, side, shield: false, frozen: 0, queen: false, moved: false, rosterId, perk, name };
  }

  // ---------------------------------------------------------------- queries
  x(i) { return i % this.w; }
  y(i) { return (i / this.w) | 0; }
  isEmpty(i) { return i >= 0 && i < this.cells.length && !this.cells[i] && !this.rock[i]; }
  ownIdx(fn) { return this.pick(YOU, fn); }
  foeIdx(fn) { return this.pick(FOE, fn); }
  pick(side, fn) { const out = []; this.cells.forEach((p, i) => { if (p && p.side === side && fn(p, i)) out.push(i); }); return out; }
  emptyIdx(fn) { const out = []; for (let i = 0; i < this.cells.length; i++) if (this.isEmpty(i) && fn(i)) out.push(i); return out; }
  neighbors(i) {
    const out = [], x = this.x(i), y = this.y(i);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const tx = x + dx, ty = y + dy;
      if (tx >= 0 && ty >= 0 && tx < this.w && ty < this.h) out.push(ty * this.w + tx);
    }
    return out;
  }
  // Spells may not drop a pawn on its promotion row: it has to walk there.
  pawnMayStand(p, i) { return p.type !== PAWN || this.y(i) !== (p.side === YOU ? this.h - 1 : 0); }
  idxOf(id) { return this.cells.findIndex((p) => p && p.id === id); }
  movesFrom(i) { return pieceMoves(this, this.cells, i, []).map(mvTo); }
  canMove(side) { return allMoves(this, this.cells, side).length > 0; }

  // ------------------------------------------------------------------ setup
  begin() {
    const ev = [];
    if (this.relics.has('crownguard')) { const k = this.ownIdx((p) => p.type === KING)[0]; if (k !== undefined) this.setShield(k, true, ev); }
    for (const i of this.ownIdx((p) => p.perk === 'stubborn' && !p.shield)) this.setShield(i, true, ev);
    if (this.traits.includes('shieldPawns')) for (const i of this.foeIdx((p) => p.type === PAWN)) this.setShield(i, true, ev);
    if (this.traits.includes('kingShield')) for (const i of this.foeIdx((p) => p.type === KING)) this.setShield(i, true, ev);
    if (this.relics.has('lodestone')) {
      const foes = shuffle(this.foeIdx((p) => p.type !== KING), this.rnd).slice(0, 2);
      for (const i of foes) this.freeze(i, 1, ev);
    }
    this.startTurn(ev);
    return ev;
  }

  startTurn(ev) {
    this.turn = YOU; this.round++; this.moved = false;
    const wells = this.ownIdx((p, i) => this.well[i] === 1).length;
    this.aether = this.maxAether + wells + (this.round === 1 && this.relics.has('banner') ? 1 : 0);
    this.extraMoves = this.round === 1 && this.relics.has('wardrum') ? 1 : 0;
    ev.push({ t: 'turn', side: YOU, round: this.round, wells });
    ev.push({ t: 'aether', value: this.aether });
    const loud = Math.min(2, this.ownIdx((p) => p.perk === 'loud').length);
    // Three to open, then one a turn: cards are meant to be scarce, chosen, and spent.
    const n = this.round === 1 ? 3 + (this.relics.has('banner') ? 1 : 0) + loud : 1 + (this.relics.has('tome') ? 1 : 0);
    this.draw(n, ev);
    if (!this.canMove(YOU) && !this.playable()) { ev.push({ t: 'pass', side: YOU }); this.endPlayerTurn(ev); }
  }

  // With no legal move left, the player may end the turn without moving.
  skipTurn() {
    if (this.result || this.turn !== YOU || this.canMove(YOU)) throw new Error('You still have a move to make');
    const ev = [{ t: 'pass', side: YOU }];
    this.endPlayerTurn(ev);
    return ev;
  }

  // ------------------------------------------------------------------ cards
  draw(n, ev) {
    const got = [];
    for (let k = 0; k < n; k++) {
      if (this.hand.length >= HAND_LIMIT) break;
      if (!this.deck.length) {
        if (!this.discard.length) break;
        this.deck = shuffle(this.discard, this.rnd); this.discard = [];
      }
      const c = this.deck.pop();
      this.hand.push(c); got.push(c);
    }
    if (got.length) ev.push({ t: 'draw', cards: got });
  }

  gain(n, ev) { this.aether += n; ev.push({ t: 'aether', value: this.aether, gained: n }); }

  canPlay(handIndex) {
    const c = CARDS[this.hand[handIndex]];
    if (!c || this.result || this.turn !== YOU || c.cost > this.aether) return false;
    if (c.steps.length) return c.steps[0](this, []).length > 0;
    return c.can ? c.can(this) : true;
  }

  // Squares valid for the next target of a card, or null when it has them all.
  cardTargets(handIndex, chosen) {
    const c = CARDS[this.hand[handIndex]];
    return chosen.length < c.steps.length ? c.steps[chosen.length](this, chosen) : null;
  }

  playCard(handIndex, chosen = []) {
    const id = this.hand[handIndex], c = CARDS[id];
    if (!this.canPlay(handIndex)) throw new Error('That card cannot be played now');
    if (chosen.length !== c.steps.length) throw new Error('Wrong number of targets');
    chosen.forEach((sq, i) => { if (!c.steps[i](this, chosen.slice(0, i)).includes(sq)) throw new Error('Not a valid target'); });
    const ev = [{ t: 'card', id, exhaust: !!c.exhaust }];
    this.aether -= c.cost;
    this.hand.splice(handIndex, 1);
    (c.exhaust ? this.exhausted : this.discard).push(id);
    ev.push({ t: 'aether', value: this.aether });
    c.play(this, chosen, ev);
    this.checkEnd(ev);
    // a card can leave you with no move to make
    if (!this.result && this.turn === YOU && !this.canMove(YOU) && !this.playable()) { ev.push({ t: 'pass', side: YOU }); this.endPlayerTurn(ev); }
    return ev;
  }

  playable() { return this.hand.some((_, i) => this.canPlay(i)); }

  // ------------------------------------------------------- effects on pieces
  setShield(i, on, ev) { const p = this.cells[i]; p.shield = on; ev.push({ t: 'shield', id: p.id, on }); }
  freeze(i, turns, ev) { const p = this.cells[i]; p.frozen = turns; ev.push({ t: 'freeze', id: p.id, on: true }); }
  setQueen(i, on, ev) { const p = this.cells[i]; p.queen = on; ev.push({ t: 'queen', id: p.id, on }); }
  morph(i, type, ev) { const p = this.cells[i]; p.type = type; ev.push({ t: 'morph', id: p.id, type }); }
  convert(i, ev) { const p = this.cells[i]; p.side = YOU; p.frozen = 0; ev.push({ t: 'convert', id: p.id, side: YOU, at: i }); }
  summon(type, side, i, ev) { const p = this.make(type, side); this.cells[i] = p; ev.push({ t: 'spawn', piece: { ...p }, at: i }); return p; }

  // A spell's kill: a shield soaks it up.
  smite(i, ev) {
    const p = this.cells[i];
    if (p.shield) { p.shield = false; ev.push({ t: 'shield', id: p.id, on: false, broken: true }); return; }
    this.remove(i, ev, false);
  }

  remove(i, ev, sacrifice) {
    const p = this.cells[i];
    this.cells[i] = null;
    ev.push({ t: 'destroy', id: p.id, at: i, sacrifice });
    this.fell(p, ev);
  }

  // Bookkeeping when a piece leaves the board for any reason.
  fell(p, ev) {
    if (p.type === KING) { this.result = p.side === YOU ? 'lose' : 'win'; return; }
    if (p.side === FOE) { this.captures++; return; }
    if (!p.rosterId) return;                                  // a summoned pawn just goes
    if (this.relics.has('phoenix') && !this.phoenixUsed) {
      const home = this.emptyIdx((i) => this.y(i) === 0 && this.pawnMayStand(p, i));
      if (home.length) {
        this.phoenixUsed = true;
        const at = home[Math.floor(this.rnd() * home.length)];
        const back = this.make(p.type === QUEEN && p.promoted ? PAWN : p.type, YOU, p.rosterId, p.perk, p.name);
        this.cells[at] = back;
        ev.push({ t: 'revive', piece: { ...back }, at });
        return;
      }
    }
    this.lost.push(p.rosterId);
  }

  shift(from, to, style, ev) {
    const p = this.cells[from];
    this.cells[from] = null; this.cells[to] = p;
    p.moved = true;
    ev.push({ t: 'shift', id: p.id, from, to, style });
  }

  swap(a, c, ev) {
    const p = this.cells[a], q = this.cells[c];
    this.cells[a] = q; this.cells[c] = p;
    p.moved = q.moved = true;
    ev.push({ t: 'swap', a: p.id, b: q.id, from: a, to: c });
  }

  raiseRock(i, rounds, ev) { this.rock[i] = 1; this.rockTimer[i] = rounds; ev.push({ t: 'rock', at: i, on: true }); }

  // A real chess move of a piece: captures, shields, promotion.
  strike(from, to, ev, style = 'move') {
    const p = this.cells[from], q = this.cells[to];
    if (q && q.shield) {
      q.shield = false;
      ev.push({ t: 'block', id: q.id, by: p.id, from, at: to });
      return;
    }
    this.cells[from] = null; this.cells[to] = p;
    const e = { t: 'move', id: p.id, from, to, style, victim: q ? q.id : 0 };
    ev.push(e);
    if (promotes(this, p, to)) { p.type = QUEEN; p.promoted = true; e.promo = true; }
    p.moved = true;
    if (q) {
      if (p.side === YOU) {
        if (this.relics.has('bloodstone')) this.gain(1, ev);
        if (p.perk === 'furious') this.gain(1, ev);
        if (p.perk === 'bookish') this.draw(1, ev);
        if (p.perk === 'greedy') { this.loot += 5; ev.push({ t: 'gold', id: p.id, amount: 5 }); }
      }
      this.fell(q, ev);
    }
  }

  checkEnd(ev) {
    if (this.result && !this.ended) { this.ended = true; ev.push({ t: 'end', result: this.result }); }
  }

  // ------------------------------------------------------------ taking turns
  playerMove(from, to) {
    if (this.result || this.turn !== YOU) throw new Error('Not your move');
    if (!this.cells[from] || this.cells[from].side !== YOU || !this.movesFrom(from).includes(to)) throw new Error('Illegal move');
    const ev = [];
    this.strike(from, to, ev);
    this.moved = true;
    this.checkEnd(ev);
    if (this.result) return ev;
    if (this.extraMoves > 0 && this.canMove(YOU)) { this.extraMoves--; ev.push({ t: 'again' }); return ev; }
    this.endPlayerTurn(ev);
    return ev;
  }

  endPlayerTurn(ev) {
    this.extraMoves = 0;
    for (const i of this.ownIdx(() => true)) {
      const p = this.cells[i];
      if (p.queen) this.setQueen(i, false, ev);
      if (p.frozen > 0 && --p.frozen === 0) ev.push({ t: 'freeze', id: p.id, on: false });
    }
    this.turn = FOE;
    ev.push({ t: 'turn', side: FOE, round: this.round });
  }

  // The enemy's whole turn. Afterwards it is the player's turn again.
  enemyTurn() {
    if (this.result || this.turn !== FOE) return [];
    const ev = [];
    this.enemyTurns++;
    if (this.traits.includes('reinforce') && this.enemyTurns % 3 === 0) {
      const spots = this.emptyIdx((i) => this.y(i) === this.h - 1);
      if (spots.length) this.summon(PAWN, FOE, spots[Math.floor(this.rnd() * spots.length)], ev);
    }
    if (this.traits.includes('kingShield') && this.enemyTurns % 4 === 0) {
      for (const i of this.foeIdx((p) => p.type === KING && !p.shield)) this.setShield(i, true, ev);
    }
    const moves = this.traits.includes('frenzy') && this.enemyTurns % 3 === 0 ? 2 : 1;
    for (let k = 0; k < moves && !this.result; k++) {
      const t0 = performance.now();
      const m = chooseMove(this, this.cells, FOE, this.depth, this.rnd);
      this.slowest = Math.max(this.slowest || 0, performance.now() - t0);
      if (!m) { if (k === 0) ev.push({ t: 'pass', side: FOE }); break; }
      this.strike(mvFrom(m), mvTo(m), ev);
      this.checkEnd(ev);
    }
    if (this.result) return ev;
    for (const i of this.foeIdx((p) => p.frozen > 0)) {
      const p = this.cells[i];
      if (--p.frozen === 0) ev.push({ t: 'freeze', id: p.id, on: false });
    }
    for (let i = 0; i < this.rock.length; i++) {
      if (this.rockTimer[i] > 0 && --this.rockTimer[i] === 0) { this.rock[i] = 0; ev.push({ t: 'rock', at: i, on: false }); }
    }
    this.startTurn(ev);
    // if the player was passed over as well, keep the game moving
    let guard = 0;
    while (!this.result && this.turn === FOE && guard++ < 3) ev.push(...this.enemyTurn());
    return ev;
  }

  // Giving up: the battle is lost.
  concede() {
    if (this.result) return [];
    this.result = 'lose';
    const ev = [];
    this.checkEnd(ev);
    return ev;
  }
}

export function shuffle(list, rnd) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
