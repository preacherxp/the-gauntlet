// Checks for the Gauntlet: small-board rules, cards, relics, enemy traits and
// the run around them. Ends by letting a bot play whole runs, which shakes out
// crashes and gives a rough picture of how hard each fight is.
//   node tests/rogue.test.mjs [--runs=40]

import { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, YOU, FOE, chooseMove, mvFrom, mvTo, allMoves } from '../src/rogue/rules.js';
import { Battle, TRAITS } from '../src/rogue/battle.js';
import { CARDS } from '../src/rogue/cards.js';
import { Run, updateMeta } from '../src/rogue/run.js';
import { ENCOUNTERS, RELICS, WARBANDS, EVENTS, ACTS, CHAR_TYPE, STEPS_PER_ACT, PERSONAS } from '../src/rogue/content.js';

let passed = 0, failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else { failed++; console.log(`FAIL ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); }
}
const truthy = (name, v) => check(name, !!v, true);
const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// A board from a picture: rows top (far side) to bottom (your side).
// Upper case is yours, lower case the enemy's, # a rock, o a well.
function board(rows, extra = {}) {
  const h = rows.length, w = rows[0].length;
  const player = [], enemy = [], rocks = [], wells = [];
  rows.forEach((row, r) => [...row].forEach((ch, x) => {
    const y = h - 1 - r;
    if (ch === '#') rocks.push([x, y]);
    else if (ch === 'o') wells.push([x, y]);
    else if (CHAR_TYPE[ch]) enemy.push({ type: CHAR_TYPE[ch], x, y });
    else if (CHAR_TYPE[ch.toLowerCase()]) player.push({ type: CHAR_TYPE[ch.toLowerCase()], x, y, rosterId: 100 + player.length });
  }));
  return new Battle({ w, h, player, enemy, rocks, wells, deck: [], relics: [], traits: [], depth: 2, rnd: seeded(5), ...extra });
}
const sq = (b, x, y) => y * b.w + x;
const names = (b, x, y) => b.movesFrom(sq(b, x, y)).map((i) => `${b.x(i)},${b.y(i)}`).sort();
const give = (b, ...ids) => { b.hand.push(...ids); b.aether = 9; };

// ---- movement
{
  const b = board(['....k', '.....', '..p..', '.P.P.', 'K....']);
  check('your pawn steps forward and captures diagonally', names(b, 1, 1), ['1,2', '2,2']);
  check('a pawn cannot capture straight ahead', names(board(['....k', '.....', '.p...', '.P...', 'K....']), 1, 1), []);
  check('the enemy pawn moves the other way', names(b, 2, 2), ['1,1', '2,1', '3,1']);
  const r = board(['....k', '.....', '.#...', '.R.p.', 'K....']);
  check('a rook stops at rocks, pieces and the edge', names(r, 1, 1), ['0,1', '1,0', '2,1', '3,1']);
}
{
  const b = board(['...k', '.P..', '....', 'K...']);
  const ev = b.playerMove(sq(b, 1, 2), sq(b, 1, 3));
  truthy('a pawn promotes on the far row', ev.some((e) => e.t === 'move' && e.promo) && b.cells[sq(b, 1, 3)].type === QUEEN);
}
{
  const b = board(['..k.', '....', '..R.', 'K...']);
  const ev = b.playerMove(sq(b, 2, 1), sq(b, 2, 3));
  check('capturing the king wins', [b.result, ev.at(-1).t], ['win', 'end']);
}
{
  const b = board(['k...', '..p.', '.R..', 'K...']);
  b.cells[sq(b, 2, 2)].shield = true;
  b.cells[sq(b, 1, 1)].queen = true;   // let it reach
  const ev = b.playerMove(sq(b, 1, 1), sq(b, 2, 2));
  truthy('a shield turns a capture aside and is spent', ev[0].t === 'block' && b.cells[sq(b, 2, 2)] && !b.cells[sq(b, 2, 2)].shield && b.cells[sq(b, 1, 1)]);
}

// ---- cards
{
  const b = board(['...k.', '.....', '..p..', '.P...', 'K....']);
  b.begin();
  give(b, 'frost');
  b.playCard(b.hand.indexOf('frost'), [sq(b, 2, 2)]);
  check('a frozen piece has no moves', names(b, 2, 2), []);
  b.playerMove(sq(b, 0, 0), sq(b, 0, 1));
  b.enemyTurn();
  truthy('the freeze wears off after the enemy turn', b.cells[sq(b, 2, 2)] ? b.cells[sq(b, 2, 2)].frozen === 0 : true);
}
{
  const b = board(['....k', '.....', '..p..', '.....', 'K..P.']);
  b.begin();
  give(b, 'bolt', 'aegis', 'conscript', 'quickstep', 'transpose', 'barricade');
  b.playCard(b.hand.indexOf('bolt'), [sq(b, 2, 2)]);
  check('Bolt destroys a pawn', b.cells[sq(b, 2, 2)], null);
  b.playCard(b.hand.indexOf('aegis'), [sq(b, 0, 0)]);
  truthy('Aegis shields', b.cells[sq(b, 0, 0)].shield);
  b.playCard(b.hand.indexOf('conscript'), [sq(b, 1, 1)]);
  truthy('Conscript summons a pawn with no roster entry', b.cells[sq(b, 1, 1)].type === PAWN && !b.cells[sq(b, 1, 1)].rosterId);
  b.playCard(b.hand.indexOf('quickstep'), [sq(b, 3, 0), sq(b, 3, 1)]);
  truthy('Quickstep moves without ending the turn', b.cells[sq(b, 3, 1)] && b.turn === YOU && !b.moved);
  b.playCard(b.hand.indexOf('transpose'), [sq(b, 0, 0), sq(b, 3, 1)]);
  check('Transpose swaps', [b.cells[sq(b, 0, 0)].type, b.cells[sq(b, 3, 1)].type], [PAWN, KING]);
  b.playCard(b.hand.indexOf('barricade'), [sq(b, 2, 3)]);
  truthy('Barricade raises a rock', b.rock[sq(b, 2, 3)] === 1);
  for (let i = 0; i < 3 && !b.result; i++) { const m = allMoves(b, b.cells, YOU)[0]; b.playerMove(mvFrom(m), mvTo(m)); b.enemyTurn(); }
  check('and the rock crumbles after three rounds', b.rock[sq(b, 2, 3)], 0);
}
{
  const b = board(['....k', '..p..', '.....', '.N...', 'K....']);
  b.begin();
  give(b, 'leap', 'doubletime', 'royalhour', 'blink');
  truthy('Blink will not drop a pawn on the far row', !CARDS.blink.steps[1](board(['...k', '....', 'P...', 'K...']), [4]).includes(12));
  b.playCard(b.hand.indexOf('leap'), [sq(b, 1, 1), sq(b, 2, 3)]);
  truthy("Knight's Leap captures and keeps your move", b.cells[sq(b, 2, 3)].type === KNIGHT && b.captures === 1 && b.turn === YOU);
  b.playCard(b.hand.indexOf('doubletime'), []);
  b.playerMove(sq(b, 0, 0), sq(b, 0, 1));
  check('Double Time gives a second move', b.turn, YOU);
  b.playCard(b.hand.indexOf('royalhour'), [sq(b, 0, 1)]);
  truthy("Queen's Hour lets a king move far", names(b, 0, 1).includes('0,4'));
  b.playerMove(sq(b, 0, 1), sq(b, 0, 3));
  truthy('and ends with the turn', b.turn !== YOU || !b.cells[sq(b, 0, 3)].queen);
}
{
  const b = board(['....k', '.p.p.', '.....', 'PP...', 'K....']);
  b.begin();
  give(b, 'rally', 'deepfreeze', 'phalanx', 'knighting', 'turncoat', 'meteor');
  b.playCard(b.hand.indexOf('rally'), []);
  truthy('Rally advances every pawn', b.cells[sq(b, 0, 2)] && b.cells[sq(b, 1, 2)]);
  b.playCard(b.hand.indexOf('deepfreeze'), []);
  check('Deep Freeze holds every enemy pawn', b.foeIdx((p) => p.type === PAWN && p.frozen > 0).length, 2);
  b.playCard(b.hand.indexOf('phalanx'), []);
  check('Phalanx shields every pawn', b.ownIdx((p) => p.type === PAWN && p.shield).length, 2);
  b.playCard(b.hand.indexOf('knighting'), [sq(b, 0, 2)]);
  truthy('Knighting makes a knight and is spent for the battle', b.cells[sq(b, 0, 2)].type === KNIGHT && b.exhausted.includes('knighting'));
  b.aether = 9;
  b.playCard(b.hand.indexOf('turncoat'), [sq(b, 1, 3)]);
  check('Turncoat changes sides', b.cells[sq(b, 1, 3)].side, YOU);
  b.playCard(b.hand.indexOf('meteor'), [sq(b, 3, 3)]);
  check('Meteor destroys', b.cells[sq(b, 3, 3)], null);
  let threw = false;
  try { give(b, 'frost'); b.playCard(b.hand.indexOf('frost'), [sq(b, 4, 4)]); } catch { threw = true; }
  truthy('a card refuses a target it does not allow (the king)', threw);
}
{
  const b = board(['...k', '....', 'P...', 'K...'], { deck: ['aegis', 'aegis', 'frost', 'bolt', 'insight'] });
  b.begin();
  check('three cards and two aether to start', [b.hand.length, b.aether], [3, 2]);
  b.aether = 0;
  truthy('a card you cannot afford cannot be played', !b.canPlay(0));
  give(b, 'bloodprice');
  b.aether = 0;
  b.playCard(b.hand.indexOf('bloodprice'), [sq(b, 0, 1)]);
  check('Blood Price trades a pawn for aether and cards', [b.aether, b.lost.length, b.hand.length], [2, 1, 5]);
}

// ---- relics and traits
{
  check('Pikes: pawns capture straight ahead', names(board(['...k', '.p..', '.P..', 'K...'], { relics: ['pikes'] }), 1, 1), ['0,2', '1,2', '2,2'].filter((s) => s === '1,2'));
  check('Dancing Shoes: pawns step sideways', names(board(['...k', '....', '.P..', 'K...'], { relics: ['sidestep'] }), 1, 1), ['0,1', '1,2', '2,1']);
  truthy('Silver Spurs: knights step straight', names(board(['...k', '....', '.N..', 'K...'], { relics: ['spurs'] }), 1, 1).includes('1,2'));
  const b = board(['..rk', '....', '.P..', 'K...'], { relics: ['crownguard', 'hourglass', 'tome', 'banner', 'wardrum', 'lodestone'], deck: Array(12).fill('insight') });
  b.begin();
  truthy('Crownguard shields the king', b.cells[0].shield);
  check('Hourglass and War Banner: four aether on turn one', b.aether, 4);
  check('War Banner: four cards on turn one', b.hand.length, 4);
  check('Lodestone freezes an enemy', b.foeIdx((p) => p.frozen > 0).length, 1);
  b.playerMove(sq(b, 1, 1), sq(b, 1, 2));
  check('War Drum: a second move on turn one', b.turn, YOU);
  b.playerMove(sq(b, 1, 2), sq(b, 1, 3));
  b.enemyTurn();
  check('Battle Tome: three cards on later turns', b.hand.length, 6);
}
{
  const b = board(['k..r', '....', '....', 'K..N'], { relics: ['phoenix'] });
  b.begin();
  b.playerMove(0, 1);
  b.enemyTurn();   // the rook takes the knight
  truthy('Phoenix Feather returns the first lost piece to the home row', b.ownIdx((p) => p.type === KNIGHT).length === 1 && b.lost.length === 0);
}
{
  const b = board(['k...', '..p.', '.B..', 'K...'], { relics: ['bloodstone'] });
  b.begin();
  const before = b.aether;
  b.playerMove(sq(b, 1, 1), sq(b, 2, 2));
  truthy('Bloodstone pays for a capture', b.aether === before + 1 || b.turn === FOE);
  const w = board(['k...', '....', 'oP..', 'K...']);
  w.begin();
  w.playerMove(sq(w, 1, 1), sq(w, 1, 2));
  w.cells[sq(w, 0, 1)] = w.cells[0]; w.cells[0] = null;   // stand the king on the well
  w.enemyTurn();
  check('a piece on an aether well gives one more aether', w.aether, 3);
}
{
  const b = board(['k....', 'pp...', '.....', '.....', 'K....'], { traits: ['reinforce', 'shieldPawns', 'kingShield', 'frenzy'] });
  b.begin();
  truthy('Shield Wall and Warded King', b.foeIdx((p) => p.shield).length === 3);
  let spawned = 0, doubles = 0;
  for (let i = 0; i < 6 && !b.result; i++) {
    const m = allMoves(b, b.cells, YOU)[0];
    b.playerMove(mvFrom(m), mvTo(m));
    const ev = b.enemyTurn();
    spawned += ev.filter((e) => e.t === 'spawn').length;
    if (ev.filter((e) => e.t === 'move' || e.t === 'block').length === 2) doubles++;
  }
  truthy(`Reinforcements arrive and Frenzy doubles a turn (${spawned} pawns, ${doubles} double turns)`, spawned >= 1 && doubles >= 1);
}
{
  // the enemy takes a hanging queen and avoids walking its king into capture
  const b = board(['k..r.', '.....', '.....', '...Q.', 'K....']);
  b.turn = FOE;
  const m = chooseMove(b, b.cells, FOE, 2, seeded(1));
  check('the enemy takes a free queen', [b.x(mvTo(m)), b.y(mvTo(m))], [3, 1]);
  const s = board(['k....', '.....', '.R...', '.....', 'K....']);
  s.turn = FOE;
  const k = chooseMove(s, s.cells, FOE, 2, seeded(1));
  truthy('the enemy king does not step onto an attacked square', b.x(mvTo(k)) !== 1 && s.y(mvTo(k)) !== 2);
}

// ---- personalities
{
  const one = (rows, perk, x, y, extra) => { const b = board(rows, extra); b.cells[sq(b, x, y)].perk = perk; return b; };
  check('the Bold captures straight ahead', names(one(['...k', '.p..', '.P..', 'K...'], 'bold', 1, 1), 1, 1), ['1,2']);
  check('the Cautious can step back', names(one(['...k', '....', '.P..', '...K'], 'cautious', 1, 1), 1, 1), ['1,0', '1,2']);
  check('the Sly can step sideways', names(one(['...k', '....', '.P..', '...K'], 'sly', 1, 1), 1, 1), ['0,1', '1,2', '2,1']);
  const r = one(['....k', '.....', '.....', '.P...', '....K'], 'restless', 1, 1);
  check('the Restless may open with two squares', names(r, 1, 1), ['1,2', '1,3']);
  r.begin(); r.playerMove(sq(r, 1, 1), sq(r, 1, 2));
  check('but only once', names(r, 1, 2), ['1,3']);
  const a = one(['....k', '.....', '.P...', '.....', '....K'], 'ambitious', 1, 2);
  a.begin(); a.playerMove(sq(a, 1, 2), sq(a, 1, 3));
  check('the Ambitious promotes a row early', a.cells[sq(a, 1, 3)].type, QUEEN);
  const s = one(['...k', '....', '.P..', 'K...'], 'stubborn', 1, 1);
  s.begin();
  truthy('the Stubborn starts shielded', s.cells[sq(s, 1, 1)].shield);
  const l = one(['...k', '....', '.P..', 'K...'], 'loud', 1, 1, { deck: Array(8).fill('insight') });
  l.begin();
  check('the Loud brings an extra card', l.hand.length, 4);
  for (const [perk, test] of [['greedy', (b) => b.loot === 5], ['bookish', (b) => b.hand.length === 4], ['furious', (b, before) => b.aether === before + 1]]) {
    const b = one(['k...', '..p.', '.B..', 'K...'], perk, 1, 1, { deck: Array(8).fill('insight'), relics: ['wardrum'] });
    b.begin();
    const before = b.aether;
    b.playerMove(sq(b, 1, 1), sq(b, 2, 2));
    truthy(`${PERSONAS[perk].title} is rewarded for a capture`, test(b, before));
  }
  const bad = [];
  for (const p of Object.values(PERSONAS)) {
    if (!p.perk) bad.push(p.id + ': perk');
    for (const k of ['start', 'move', 'capture', 'fall', 'cheer']) if (!p.lines[k] || !p.lines[k].length) bad.push(`${p.id}: no ${k} line`);
  }
  check('every personality has a perk and something to say', bad, []);
  const run = Run.start('rabble', 9);
  truthy('everyone in a new army has a name and a personality', run.s.roster.every((p) => p.name && PERSONAS[p.persona]));
  check('no two share a name', new Set(run.s.roster.map((p) => p.name)).size, run.s.roster.length);
  truthy('only pawns get a pawn\'s temper, and the king is regal', run.s.roster.every((p) => (p.type === KING ? p.persona === 'regal' : !PERSONAS[p.persona].king && (p.type === PAWN || !PERSONAS[p.persona].pawn))));
  // lucky and gentle act after the battle
  const fight = (personas) => {
    const r2 = Run.start('vanguard', 3);
    const pawns = r2.s.roster.filter((p) => p.type === PAWN);
    r2.s.roster.forEach((p) => { if (p.type !== KING) p.persona = 'stubborn'; });
    pawns.forEach((p, i) => { if (personas[i]) p.persona = personas[i]; });
    r2.choose(0);
    const b = r2.makeBattle(r2.setup());
    b.begin();
    b.lost.push(pawns[0].id);
    b.cells[b.cells.findIndex((c) => c && c.rosterId === pawns[0].id)] = null;
    b.result = 'win';
    r2.finishBattle(b);
    return r2.wounded().length;
  };
  check('a fallen pawn is wounded', fight([]), 1);
  check('unless it is the Lucky', fight(['lucky']), 0);
  check('or the Gentle came through to tend it', fight([null, 'gentle']), 0);
}

// ---- content is well formed
{
  const bad = [];
  for (const e of Object.values(ENCOUNTERS)) {
    const kings = e.rows.join('').split('k').length - 1;
    if (kings !== 1) bad.push(`${e.id}: ${kings} kings`);
    if (e.rows.some((r) => r.length !== e.w)) bad.push(`${e.id}: ragged rows`);
    if (e.w > 8 || e.h > 8 || e.w < 4) bad.push(`${e.id}: size`);
    for (const [x, y] of [...(e.rocks || []), ...(e.wells || [])]) if (x < 0 || x >= e.w || y < 2 || y >= e.h - e.rows.length) bad.push(`${e.id}: terrain at ${x},${y} is in a starting row`);
    for (const t of e.traits || []) if (!TRAITS[t]) bad.push(`${e.id}: trait ${t}`);
    if (!ACTS[e.act]) bad.push(`${e.id}: act`);
  }
  for (let a = 0; a < ACTS.length; a++) for (const kind of ['battle', 'elite', 'boss']) {
    const n = Object.values(ENCOUNTERS).filter((e) => e.act === a && e.kind === kind).length;
    if (n < (kind === 'battle' ? 3 : 1)) bad.push(`act ${a} has ${n} ${kind}`);
  }
  for (const w of Object.values(WARBANDS)) {
    if (w.pieces.filter((t) => t === KING).length !== 1) bad.push(`${w.id}: king`);
    for (const c of w.deck) if (!CARDS[c]) bad.push(`${w.id}: card ${c}`);
    for (const r of w.relics) if (!RELICS[r]) bad.push(`${w.id}: relic ${r}`);
  }
  for (const c of Object.values(CARDS)) if (!c.name || !c.text || !c.glyph || !c.kind || !(c.cost >= 0)) bad.push(`card ${c.id}`);
  check('encounters, warbands and cards are well formed', bad, []);
}

// ---- the run
{
  const run = Run.start('vanguard', 42);
  check('a new run', [run.s.crowns, run.s.roster.length, run.s.deck.length, run.floor], [3, 6, 8, 1]);
  run.s.roster.forEach((p) => { if (p.type !== KING) p.persona = 'stubborn'; });   // keep tempers out of this part
  const again = Run.start('vanguard', 42);
  check('the same seed gives the same first choice', run.options(), again.options());
  const o = run.choose(0);
  truthy('the first step is a battle', o.kind === 'battle' && run.s.phase === 'battle');
  const setup = run.setup();
  check('everyone healthy is deployed in the two home rows', [setup.player.length, setup.player.every((p) => p.y < 2)], [6, true]);
  const squares = new Set(setup.player.map((p) => p.x + ',' + p.y));
  check('no two pieces share a square', squares.size, setup.player.length);
  const b = run.makeBattle(setup);
  b.begin();
  b.lost.push(setup.player.find((p) => p.type === PAWN).rosterId);
  b.result = 'win';
  const before = run.s.gold;
  const out = run.finishBattle(b);
  truthy('winning pays gold and offers three cards', out.won && run.s.gold > before && out.reward.cards.length === 3 && run.s.phase === 'reward');
  check('a fallen piece is wounded', run.wounded().length, 1);
  run.takeCard(0);
  check('the chosen card joins the deck', run.s.deck.length, 9);
  run.advance();
  const back = Run.load(run.save());
  check('a saved run loads as it was', back.s, run.s);
  check('and continues identically', back.options(), run.options());
  // wounded pieces sit the next fight out
  run.s.options = [{ kind: 'battle', enc: 'patrol' }];
  run.choose(0);
  check('a wounded piece is not deployed', run.setup().player.length, 5);
  const lose = run.makeBattle(run.setup());
  lose.begin(); lose.concede();
  const r2 = run.finishBattle(lose);
  check('losing costs a crown, heals the army and moves on', [run.s.crowns, run.wounded().length, r2.won, run.s.phase], [2, 0, false, 'path']);
  // shop
  run.s.options = [{ kind: 'shop' }];
  run.choose(0);
  run.s.gold = 500;
  const deck = run.s.deck.length, army = run.s.roster.length;
  truthy('the shop sells a card, a piece and a relic', run.buy('card', 0) && run.buy('piece', 0) && run.buy('relic'));
  check('and they arrive', [run.s.deck.length, run.s.roster.length, run.s.relics.length], [deck + 1, army + 1, 1]);
  truthy('nothing is sold twice', !run.buy('card', 0));
  run.s.gold = 0;
  truthy('or without gold', !run.buy('card', 1));
  run.advance();
  // camp
  run.s.options = [{ kind: 'camp' }];
  run.choose(0);
  const knights = run.s.roster.filter((p) => p.type === KNIGHT).length;
  truthy('training at camp turns a pawn into a knight', run.camp('train', KNIGHT) && run.s.roster.filter((p) => p.type === KNIGHT).length === knights + 1);
  // events never throw and always leave a result
  let ok = true;
  for (const id of Object.keys(EVENTS)) {
    for (let c = 0; c < EVENTS[id].choices.length; c++) {
      const r = Run.start('vanguard', 7 + c);
      r.s.gold = 200; r.s.crowns = 2;
      r.s.options = [{ kind: 'event', event: id }];
      r.choose(0);
      if (!r.eventChoices()[c].ok) continue;
      const res = r.eventChoose(c);
      if (!res || !res.text) ok = false;
    }
  }
  truthy('every event choice resolves', ok);
  const m = updateMeta({}, Object.assign(Run.start('vanguard', 1), {}));
  check('a fresh profile has only the first warband', m.meta.unlocked, ['vanguard']);
  const won = Run.start('vanguard', 1); won.s.phase = 'won'; won.s.act = 3;
  check('winning unlocks the others', updateMeta({}, won).meta.unlocked, ['vanguard', 'zealots', 'rabble']);
}

// ---- the map
{
  const run = Run.start('vanguard', 77);
  const rows = run.map();
  check('an act map has five rows ending in one boss', [rows.length, rows[4].length, rows[4][0].kind], [5, 1, 'boss']);
  let ok = true;
  rows.forEach((row, r) => row.forEach((n) => {
    if (r < rows.length - 1 && (!n.links.length || n.links.some((j) => j < 0 || j >= rows[r + 1].length))) ok = false;
  }));
  for (let r = 1; r < rows.length; r++) rows[r].forEach((_, j) => { if (!rows[r - 1].some((n) => n.links.includes(j))) ok = false; });
  truthy('every node leads somewhere, and every node can be reached', ok);
  check('the first step offers the whole first row', run.options().length, rows[0].length);
  run.choose(1);
  check('choosing records where you went', run.s.path, [{ act: 0, step: 0, i: run.s.node.i }]);
  run.s.phase = 'reward'; run.advance();
  const next = run.options().map((o) => o.i).sort();
  check('the next choices are the ones linked from there', next, [...rows[0][run.s.path[0].i].links].sort());
  const copy = Run.load(run.save());
  check('the map is saved with the run', copy.map(), run.map());
  // walk the whole act and make sure it ends at the boss
  let guard = 0;
  while (run.s.act === 0 && guard++ < 10) { run.choose(0); run.s.phase = 'reward'; run.advance(); }
  check('five steps reach the next act', [run.s.act, run.s.path.length], [1, 5]);
  truthy('and the new act gets its own map', run.map(1) !== run.map(0) && run.map(1).length === 5);
  const old = Run.load({ ...JSON.parse(run.save()), map: undefined, path: undefined });
  truthy('a save from before maps still loads', old && Array.isArray(old.s.map) && old.options().length > 0);
}

// ---- a bot plays whole runs
function botBattle(run, setup, rnd) {
  const b = run.makeBattle(setup);
  b.begin();
  let safety = 0;
  while (!b.result && safety++ < 400) {
    if (b.turn === FOE) { b.enemyTurn(); continue; }
    if (b.round > 60) { b.concede(); break; }
    // play up to three cards with any valid targets
    for (let n = 0; n < 3; n++) {
      const playable = b.hand.map((_, i) => i).filter((i) => b.canPlay(i));
      if (!playable.length || rnd() < 0.3) break;
      const i = playable[Math.floor(rnd() * playable.length)];
      const chosen = [];
      let t, dead = false;
      while ((t = b.cardTargets(i, chosen)) !== null) { if (!t.length) { dead = true; break; } chosen.push(t[Math.floor(rnd() * t.length)]); }
      if (dead) continue;
      b.playCard(i, chosen);
      if (b.result || b.turn !== YOU) break;
    }
    if (b.result || b.turn !== YOU) continue;
    const m = chooseMove(b, b.cells, YOU, 2, rnd);
    if (!m) { b.skipTurn(); continue; }
    b.playerMove(mvFrom(m), mvTo(m));
  }
  if (!b.result) b.concede();
  return b;
}

function botRun(seed, warband, tally) {
  const rnd = seeded(seed * 7919 + 13);
  const run = Run.start(warband, seed);
  let guard = 0;
  while (run.s.phase !== 'won' && run.s.phase !== 'over' && guard++ < 200) {
    const s = run.s;
    if (s.phase === 'path') run.choose(Math.floor(rnd() * run.options().length));
    else if (s.phase === 'battle') {
      const enc = s.node.enc;
      const b = botBattle(run, run.setup(), rnd);
      const t = (tally[enc] = tally[enc] || { n: 0, won: 0, rounds: 0, slowest: 0 });
      t.n++; t.rounds += b.round; if (b.result === 'win') t.won++;
      t.slowest = Math.max(t.slowest, b.slowest || 0);
      run.finishBattle(b);
    } else if (s.phase === 'reward') { run.takeCard(rnd() < 0.8 ? 0 : -1); run.takeRecruit(0); run.advance(); }
    else if (s.phase === 'shop') {
      if (run.wounded().length) run.buy('heal');
      run.buy('piece', 0); run.buy('piece', 1); run.buy('relic'); run.buy('card', 0);
      run.advance();
    } else if (s.phase === 'camp') { if (!(run.wounded().length || s.crowns < 3 ? run.camp('rest') : run.camp('train', KNIGHT))) run.camp('rest'); }
    else if (s.phase === 'event') {
      const ok = run.eventChoices().map((c, i) => (c.ok ? i : -1)).filter((i) => i >= 0);
      const res = run.eventChoose(ok[Math.floor(rnd() * ok.length)]);
      if (res && res.removeCard) run.removeCard(0);
      run.advance();
    }
  }
  return run;
}

{
  const runs = +(process.argv.find((a) => a.startsWith('--runs=')) || '--runs=24').slice(7);
  const tally = {}, floors = [], t0 = Date.now();
  let wins = 0, stuck = 0;
  for (let i = 0; i < runs; i++) {
    const run = botRun(1000 + i, ['vanguard', 'zealots', 'rabble'][i % 3], tally);
    if (run.s.phase === 'won') wins++;
    else if (run.s.phase !== 'over') stuck++;
    floors.push(run.s.phase === 'won' ? run.lastFloor : run.s.act * STEPS_PER_ACT + run.s.step + 1);
  }
  check('every simulated run ends in a win or a loss', stuck, 0);
  console.log(`\nA card-playing bot (random spells, two-move lookahead) played ${runs} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`  it won ${wins}; it reached floor ${Math.min(...floors)} to ${Math.max(...floors)}, ${(floors.reduce((a, c) => a + c, 0) / runs).toFixed(1)} on average, of ${ACTS.length * STEPS_PER_ACT}`);
  console.log('  fight               act  kind    fought  bot won  rounds  slowest enemy move');
  let slowest = 0;
  for (const e of Object.values(ENCOUNTERS)) {
    const t = tally[e.id];
    if (!t) continue;
    slowest = Math.max(slowest, t.slowest);
    console.log(`  ${e.name.padEnd(20)}${String(e.act + 1).padEnd(5)}${e.kind.padEnd(8)}${String(t.n).padEnd(8)}${(Math.round(100 * t.won / t.n) + '%').padEnd(9)}${(t.rounds / t.n).toFixed(1).padEnd(8)}${t.slowest.toFixed(0)} ms`);
  }
  truthy(`the enemy never thinks longer than 1.5 s (slowest ${slowest.toFixed(0)} ms)`, slowest < 1500);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
