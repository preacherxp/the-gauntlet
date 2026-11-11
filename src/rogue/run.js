// A whole run: where you are on the road, your army, deck, relics, gold and
// crowns. Pure logic over one plain object (`s`) so it can be saved as JSON.

import { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, PIECE_VALUE } from './rules.js';
import { CARDS, CARD_IDS, RARITY_WEIGHT } from './cards.js';
import { Battle } from './battle.js';
import {
  ACTS, STEPS_PER_ACT, ENCOUNTERS, CHAR_TYPE, RELICS, WARBANDS, EVENTS, PERSONAS, NAMES, KING_NAMES,
  PIECE_PRICE, CARD_PRICE, RELIC_PRICE, REMOVE_PRICE, HEAL_PRICE, ROSTER_LIMIT,
} from './content.js';

export const START_CROWNS = 3;

export class Run {
  constructor(state) { this.s = state; }

  static start(warbandId, seed = (Math.random() * 2 ** 31) | 0) {
    const w = WARBANDS[warbandId] || WARBANDS.vanguard;
    const run = new Run({
      v: 1, seed, rng: seed >>> 0, warband: w.id, act: 0, step: 0, crowns: START_CROWNS, gold: 20,
      roster: [], nextId: 1, names: [], deck: [...w.deck], relics: [...w.relics],
      phase: 'path', options: null, node: null, reward: null, shop: null, event: null,
      seen: [], seenEvents: [], map: [], path: [],
      stats: { battles: 0, wins: 0, captures: 0, rounds: 0, flawless: 0 },
    });
    for (const t of w.pieces) run.addPiece(t);
    return run;
  }

  static load(json) {
    try {
      const s = typeof json === 'string' ? JSON.parse(json) : json;
      if (!s || s.v !== 1) return null;
      s.map = s.map || []; s.path = s.path || [];
      return new Run(s);
    } catch { return null; }
  }
  save() { return JSON.stringify(this.s); }

  // Seeded, and the seed position is part of the save, so a reload cannot reroll.
  rnd = () => {
    let a = (this.s.rng = (this.s.rng + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  pickOne(list) { return list[Math.floor(this.rnd() * list.length)]; }
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = this.rnd() * total;
    for (const [v, w] of pairs) { r -= w; if (r < 0) return v; }
    return pairs[pairs.length - 1][0];
  }

  get act() { return ACTS[this.s.act]; }
  get floor() { return this.s.act * STEPS_PER_ACT + this.s.step + 1; }
  get lastFloor() { return ACTS.length * STEPS_PER_ACT; }

  // ------------------------------------------------------------------- army
  // Somebody who could join: a type, a name nobody else has, and a personality.
  candidate(type) {
    const s = this.s;
    if (type === KING) return { type, name: this.pickOne(KING_NAMES), persona: 'regal' };
    const free = NAMES.filter((n) => !s.names.includes(n));
    const name = this.pickOne(free.length ? free : NAMES);
    s.names.push(name);
    return { type, name, persona: this.persona(type) };
  }
  persona(type) {
    const all = Object.values(PERSONAS).filter((p) => !p.king);
    const own = all.filter((p) => !!p.pawn === (type === PAWN));
    // pawns mostly get a pawn's temper, but any of the common ones can turn up
    return this.pickOne(type === PAWN && this.rnd() < 0.35 ? all.filter((p) => !p.pawn) : own).id;
  }
  addPiece(type, who = this.candidate(type)) {
    const p = { id: this.s.nextId++, type, wounded: false, name: who.name, persona: who.persona };
    this.s.roster.push(p);
    return p;
  }
  hasPawn() { return this.s.roster.some((p) => p.type === PAWN); }
  // A lasting promotion. A pawn's temper that only suits a pawn gives way to a new one.
  promotePawn(type) {
    const pawns = this.s.roster.filter((p) => p.type === PAWN);
    const p = pawns.find((q) => !q.wounded) || pawns[0];
    if (!p) return null;
    p.type = type;
    if (PERSONAS[p.persona].pawn) p.persona = this.persona(type);
    return p;
  }
  losePawn() { const i = this.s.roster.findIndex((p) => p.type === PAWN); if (i >= 0) this.s.roster.splice(i, 1); }
  healAll() { for (const p of this.s.roster) p.wounded = false; }
  wounded() { return this.s.roster.filter((p) => p.wounded); }

  freeRelics() { return Object.keys(RELICS).filter((id) => !this.s.relics.includes(id)); }
  grantRelic(id = this.pickOne(this.freeRelics())) { if (id && !this.s.relics.includes(id)) this.s.relics.push(id); return id; }

  randomCard(rarity) {
    const pool = CARD_IDS.filter((id) => !rarity || CARDS[id].rarity === rarity);
    return this.pickOne(pool);
  }
  cardChoices(n, rareBoost = 1) {
    const out = [];
    while (out.length < n) {
      const rarity = this.weighted([['common', RARITY_WEIGHT.common], ['uncommon', RARITY_WEIGHT.uncommon], ['rare', RARITY_WEIGHT.rare * rareBoost]]);
      const id = this.randomCard(rarity);
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  // --------------------------------------------------------------- the road
  // Each act is laid out as a map the first time it is entered: five rows,
  // the last being the boss, each node linked to the nearer nodes of the next
  // row. You may only go where a link from your last node leads.
  map(act = this.s.act) {
    const s = this.s;
    if (!s.map[act]) s.map[act] = this.buildMap(act);
    return s.map[act];
  }

  buildMap(act) {
    const s = this.s, used = new Set(), usedEvents = new Set();
    const fresh = (kind) => {
      const pool = Object.values(ENCOUNTERS).filter((e) => e.act === act && e.kind === kind);
      const unseen = pool.filter((e) => !used.has(e.id) && !s.seen.includes(e.id));
      const id = this.pickOne(unseen.length ? unseen : pool).id;
      used.add(id);
      return id;
    };
    const battle = () => ({ kind: 'battle', enc: fresh('battle') });
    const elite = () => ({ kind: 'elite', enc: fresh('elite') });
    const event = () => {
      const pool = Object.keys(EVENTS).filter((id) => !s.seenEvents.includes(id) && !usedEvents.has(id));
      if (!pool.length) return battle();
      const id = this.pickOne(pool);
      usedEvents.add(id);
      return { kind: 'event', event: id };
    };
    const make = { battle, elite, event, shop: () => ({ kind: 'shop' }), camp: () => ({ kind: 'camp' }) };
    const rows = [];
    for (let step = 0; step < STEPS_PER_ACT; step++) {
      let out;
      if (step === STEPS_PER_ACT - 1) out = [{ kind: 'boss', enc: fresh('boss') }];
      else if (step === 0) out = [battle(), battle()];
      else if (step === STEPS_PER_ACT - 2) out = [make.camp(), make.shop(), this.rnd() < 0.5 ? battle() : elite()];
      else {
        const weights = step === 1
          ? [['battle', 4], ['event', 3], ['shop', 1.5], ['elite', 1]]
          : [['battle', 3], ['elite', 2.5], ['event', 2], ['shop', 2], ['camp', 1.5]];
        out = [battle()];
        for (let tries = 0; tries < 30 && out.length < 3; tries++) {
          const kind = this.weighted(weights);
          if (kind !== 'battle' && kind !== 'elite' && kind !== 'event' && out.some((p) => p.kind === kind)) continue;
          out.push(make[kind]());
        }
      }
      // shuffle so the plain battle is not always on the left
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      out.forEach((n, i) => {
        n.x = out.length === 1 ? 0.5 : i / (out.length - 1);
        n.jx = (this.rnd() - 0.5) * 0.12; n.jy = (this.rnd() - 0.5) * 0.3;   // so the map looks drawn, not printed
        n.links = [];
      });
      rows.push(out);
    }
    for (let r = 0; r < rows.length - 1; r++) {
      const A = rows[r], B = rows[r + 1];
      const nearest = (x, list) => list.reduce((best, n, i) => (Math.abs(n.x - x) < Math.abs(list[best].x - x) ? i : best), 0);
      for (const n of A) {
        B.forEach((m, j) => { if (Math.abs(n.x - m.x) <= 0.51) n.links.push(j); });
        if (!n.links.length) n.links.push(nearest(n.x, B));
      }
      B.forEach((m, j) => { if (!A.some((n) => n.links.includes(j))) A[nearest(m.x, A)].links.push(j); });
      for (const n of A) n.links.sort((a, b) => a - b);
    }
    return rows;
  }

  // Where the last step of this act left you, as a map index, or -1.
  position() {
    const s = this.s, last = s.path[s.path.length - 1];
    return last && last.act === s.act ? last : null;
  }

  options() {
    const s = this.s;
    if (s.options) return s.options;
    const rows = this.map(), row = rows[s.step];
    let idx = row.map((_, i) => i);
    const last = this.position();
    if (s.step > 0 && last && last.step === s.step - 1) idx = rows[s.step - 1][last.i].links;
    s.options = idx.map((i) => ({ ...row[i], i }));
    return s.options;
  }

  choose(i) {
    const s = this.s, o = this.options()[i];
    if (!o) throw new Error('No such path');
    s.node = o;
    const last = s.path[s.path.length - 1];
    if (o.i !== undefined && !(last && last.act === s.act && last.step === s.step)) s.path.push({ act: s.act, step: s.step, i: o.i });
    if (o.kind === 'shop') { s.shop = this.stock(); s.phase = 'shop'; }
    else if (o.kind === 'camp') s.phase = 'camp';
    else if (o.kind === 'event') { s.event = { id: o.event, done: false, result: null }; s.seenEvents.push(o.event); s.phase = 'event'; }
    else { s.phase = 'battle'; if (!s.seen.includes(o.enc)) s.seen.push(o.enc); }
    return o;
  }

  advance() {
    const s = this.s;
    s.options = null; s.node = null; s.reward = null; s.shop = null; s.event = null;
    s.step++;
    if (s.step >= STEPS_PER_ACT) { s.step = 0; s.act++; s.seen = []; }
    s.phase = s.act >= ACTS.length ? 'won' : 'path';
  }

  // ----------------------------------------------------------------- battle
  // The board for the chosen encounter, and where your pieces stand by default.
  setup() {
    const s = this.s, e = ENCOUNTERS[s.node.enc];
    const mirror = this.rnd() < 0.5;
    const mx = (x) => (mirror ? e.w - 1 - x : x);
    const enemy = [];
    e.rows.forEach((row, r) => [...row].forEach((ch, x) => { if (CHAR_TYPE[ch]) enemy.push({ type: CHAR_TYPE[ch], x: mx(x), y: e.h - 1 - r }); }));
    const fit = this.s.roster.filter((p) => !p.wounded);
    const order = (list) => [...list].sort((a, b) => (b.type === KING) - (a.type === KING) || PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
    const cols = [];
    for (let k = 0; k < e.w; k++) cols.push(Math.floor((e.w - 1) / 2) + (k % 2 ? (k + 1) / 2 : -k / 2));   // centre outwards
    const back = [], front = [];
    for (const p of order(fit.filter((q) => q.type !== PAWN))) (back.length < e.w ? back : front).push(p);
    for (const p of fit.filter((q) => q.type === PAWN)) (front.length < e.w ? front : back).push(p);
    const player = [];
    const place = (p, x, y) => player.push({ rosterId: p.id, type: p.type, x, y, perk: p.persona, name: p.name });
    back.slice(0, e.w).forEach((p, i) => place(p, cols[i], 0));
    front.slice(0, e.w).forEach((p, i) => place(p, cols[i], 1));
    return {
      id: e.id, name: e.name, kind: e.kind, w: e.w, h: e.h, taunt: e.taunt || '',
      rocks: (e.rocks || []).map(([x, y]) => [mx(x), y]), wells: (e.wells || []).map(([x, y]) => [mx(x), y]),
      enemy, player, traits: e.traits || [],
      depth: e.kind === 'boss' ? this.act.bossDepth : this.act.depth + (e.kind === 'elite' ? 1 : 0),
      benched: this.s.roster.filter((p) => p.wounded).map((p) => p.id),
    };
  }

  makeBattle(setup, player = setup.player) {
    return new Battle({ ...setup, player, deck: this.s.deck, relics: this.s.relics, rnd: this.rnd });
  }

  // Settle up after a fight. Returns what the player should be told.
  finishBattle(battle) {
    const s = this.s, kind = s.node.kind, won = battle.result === 'win';
    s.stats.battles++; s.stats.captures += battle.captures; s.stats.rounds += battle.round;
    for (const p of s.roster) p.wounded = false;                     // those who sat this one out are back
    if (!won) {
      s.crowns--;
      if (s.crowns <= 0) { s.phase = 'over'; return { won, over: true }; }
      if (kind === 'boss') { s.phase = 'path'; s.options = [s.node]; s.node = null; return { won, retry: true }; }
      this.advance();
      return { won };
    }
    s.stats.wins++;
    const byId = (id) => s.roster.find((q) => q.id === id);
    let fallen = [...new Set(battle.lost)].filter((id) => byId(id));
    const down = fallen.length;
    const notes = [];
    // the lucky shrug it off, and a gentle soul who came through patches up one more
    for (const id of fallen) if (byId(id).persona === 'lucky') notes.push(`${byId(id).name} the Lucky walks it off.`);
    fallen = fallen.filter((id) => byId(id).persona !== 'lucky');
    const medic = s.roster.find((p) => p.persona === 'gentle' && !p.wounded && !battle.lost.includes(p.id) && battle.cells.some((c) => c && c.rosterId === p.id));
    if (medic && fallen.length) { notes.push(`${medic.name} the Gentle tends to ${byId(fallen[0]).name}.`); fallen = fallen.slice(1); }
    for (const id of fallen) byId(id).wounded = true;
    if (!down) s.stats.flawless++;
    const mult = kind === 'boss' ? 2.4 : kind === 'elite' ? 1.6 : 1;
    let gold = Math.round((20 + s.act * 8 + Math.floor(this.rnd() * 8)) * mult * (s.relics.includes('purse') ? 1.5 : 1));
    if (!down) gold += 8;
    gold += battle.loot || 0;
    s.gold += gold;
    const reward = {
      gold, loot: battle.loot || 0, flawless: !down, wounded: fallen.map((id) => byId(id).name), notes,
      cards: this.cardChoices(3, kind === 'battle' ? 1 : 3), relic: null, recruits: null, cardTaken: false, recruitTaken: false,
    };
    if (kind !== 'battle' && this.freeRelics().length) reward.relic = this.grantRelic();
    if (kind === 'boss') {
      this.healAll();
      reward.wounded = [];
      if (s.act < ACTS.length - 1) reward.recruits = (s.act === 0 ? [KNIGHT, BISHOP, ROOK] : [ROOK, BISHOP, QUEEN]).map((t) => this.candidate(t));
    }
    s.reward = reward;
    s.phase = 'reward';
    return { won, reward };
  }

  takeCard(i) {
    const r = this.s.reward;
    if (!r || r.cardTaken) return;
    r.cardTaken = true;
    if (i >= 0 && r.cards[i]) this.s.deck.push(r.cards[i]);
  }

  takeRecruit(i) {
    const r = this.s.reward;
    if (!r || !r.recruits || r.recruitTaken) return;
    r.recruitTaken = true;
    if (i >= 0 && r.recruits[i] && this.s.roster.length < ROSTER_LIMIT) this.addPiece(r.recruits[i].type, r.recruits[i]);
  }

  // ------------------------------------------------------------------- shop
  stock() {
    const act = this.s.act;
    const pool = act === 0 ? [PAWN, PAWN, KNIGHT, BISHOP, ROOK] : act === 1 ? [KNIGHT, BISHOP, ROOK, ROOK, QUEEN] : [ROOK, QUEEN, BISHOP, KNIGHT];
    const a = this.pickOne(pool);
    let b = this.pickOne(pool);
    for (let i = 0; i < 6 && b === a; i++) b = this.pickOne(pool);
    const relics = this.freeRelics();
    return {
      cards: this.cardChoices(4, 1.5).map((id) => ({ id, price: CARD_PRICE[CARDS[id].rarity], sold: false })),
      pieces: [a, b].map((type) => ({ ...this.candidate(type), price: PIECE_PRICE[type], sold: false })),
      relic: relics.length ? { id: this.pickOne(relics), price: RELIC_PRICE, sold: false } : null,
      removed: false,
    };
  }

  buy(kind, i = 0) {
    const s = this.s, shop = s.shop;
    if (!shop) return false;
    if (kind === 'card') {
      const c = shop.cards[i];
      if (!c || c.sold || s.gold < c.price) return false;
      s.gold -= c.price; c.sold = true; s.deck.push(c.id);
    } else if (kind === 'piece') {
      const p = shop.pieces[i];
      if (!p || p.sold || s.gold < p.price || s.roster.length >= ROSTER_LIMIT) return false;
      s.gold -= p.price; p.sold = true; this.addPiece(p.type, p);
    } else if (kind === 'relic') {
      const r = shop.relic;
      if (!r || r.sold || s.gold < r.price) return false;
      s.gold -= r.price; r.sold = true; this.grantRelic(r.id);
    } else if (kind === 'remove') {
      if (shop.removed || s.gold < REMOVE_PRICE || s.deck.length <= 4 || !(i >= 0 && i < s.deck.length)) return false;
      s.gold -= REMOVE_PRICE; shop.removed = true; s.deck.splice(i, 1);
    } else if (kind === 'heal') {
      const cost = this.wounded().length * HEAL_PRICE;
      if (!cost || s.gold < cost) return false;
      s.gold -= cost; this.healAll();
    } else return false;
    return true;
  }

  // ------------------------------------------------------------------- camp
  camp(action, arg) {
    const s = this.s;
    if (s.phase !== 'camp') return false;
    if (action === 'rest') { this.healAll(); if (s.crowns < START_CROWNS) s.crowns++; }
    else if (action === 'train') { if (!this.hasPawn()) return false; this.promotePawn(arg === BISHOP ? BISHOP : KNIGHT); }
    else if (action === 'forget') { if (s.deck.length <= 4 || !(arg >= 0 && arg < s.deck.length)) return false; s.deck.splice(arg, 1); }
    else return false;
    this.advance();
    return true;
  }

  // ----------------------------------------------------------------- events
  eventChoices() {
    const e = EVENTS[this.s.event.id];
    return e.choices.map((c) => ({ label: c.label, hint: c.hint, ok: c.can ? !!c.can(this) : true }));
  }

  eventChoose(i) {
    const s = this.s, e = EVENTS[s.event.id], c = e.choices[i];
    if (s.event.done || !c || (c.can && !c.can(this))) return null;
    const out = c.go(this);
    s.event.done = true;
    s.event.result = typeof out === 'string' ? { text: out } : out;
    return s.event.result;
  }

  removeCard(i) { if (this.s.deck.length > 4 && i >= 0 && i < this.s.deck.length) this.s.deck.splice(i, 1); }
}

// What a finished or abandoned run unlocks for the next one.
export function updateMeta(meta, run) {
  const m = { runs: 0, wins: 0, bestFloor: 0, unlocked: ['vanguard'], ...meta };
  const s = run.s;
  const reached = s.phase === 'won' ? run.lastFloor : s.act * STEPS_PER_ACT + s.step;
  m.bestFloor = Math.max(m.bestFloor, reached);
  const news = [];
  const unlock = (id) => { if (!m.unlocked.includes(id)) { m.unlocked = [...m.unlocked, id]; news.push(id); } };
  if (s.act >= 1 || s.phase === 'won') unlock('zealots');
  if (s.phase === 'won') unlock('rabble');
  if (s.phase === 'won' || s.phase === 'over') { m.runs++; if (s.phase === 'won') m.wins++; }
  return { meta: m, news };
}
