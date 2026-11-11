// What a run is made of: the three acts, enemy formations, relics, starting
// warbands and roadside events. Data only, plus small functions on a run.

import { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './rules.js';

// Each act borrows one of the game's worlds.
export const ACTS = [
  { name: 'The Amber Road', theme: 'wood', depth: 2, bossDepth: 3, blurb: 'Quiet hills. The patrols here are careless.' },
  { name: 'Cinderfrost Pass', theme: 'elemental', depth: 4, bossDepth: 4, blurb: 'Rock and ice crowd the board, and aether wells rise through it.' },
  { name: 'The Neon Court', theme: 'neon', depth: 4, bossDepth: 5, blurb: 'Full armies, and a king who does not fall easily.' },
];
export const STEPS_PER_ACT = 5;

// Formations are written from the enemy's back row forward, one string per
// row: k q r b n p, and . for an empty square. Rocks and wells are [x, y].
export const ENCOUNTERS = {
  // ---- act 1
  patrol: { act: 0, kind: 'battle', name: 'Border Patrol', rows: ['.nkn..', '.pppp.'], h: 6 },
  lances: { act: 0, kind: 'battle', name: 'Twin Lances', rows: ['.bk.b.', '.pppp.'], h: 6 },
  stable: { act: 0, kind: 'battle', name: 'The Stable', rows: ['n.knn', '.ppp.'], h: 6 },
  watchtower: { act: 0, kind: 'battle', name: 'The Watchtower', rows: ['r.k.n', 'pppp.'], h: 6 },
  ironwall: { act: 0, kind: 'elite', name: 'The Iron Wall', rows: ['r.kn.r', '.pppp.'], h: 6, traits: ['shieldPawns'], taunt: 'Break yourselves on us.' },
  pawnbroker: { act: 0, kind: 'boss', name: 'The Pawnbroker', rows: ['rnk.n.', 'pppppp'], h: 6, traits: ['reinforce'], wells: [[1, 2], [4, 2]], taunt: 'Every soldier has a price. I have paid for many.' },
  // ---- act 2
  ashriders: { act: 1, kind: 'battle', name: 'Ash Riders', rows: ['n.kbrn', '.pppp.'], h: 6, rocks: [[1, 2], [4, 3]] },
  glacier: { act: 1, kind: 'battle', name: 'Glacier Guard', rows: ['rbk.br', '.pppp.'], h: 6, wells: [[2, 2], [3, 3]] },
  cinder: { act: 1, kind: 'battle', name: 'The Cinder Court', rows: ['.rkq..', 'ppppp.'], h: 6, rocks: [[0, 2], [5, 3]], wells: [[2, 2]] },
  phalanx: { act: 1, kind: 'battle', name: 'Frozen Phalanx', rows: ['rnkbr', 'ppppp'], h: 6, rocks: [[2, 2]] },
  twins: { act: 1, kind: 'elite', name: 'The Twin Towers', rows: ['rnkb.r', 'pppppp'], h: 6, traits: ['frenzy'], rocks: [[2, 3], [3, 2]], taunt: 'Two of us. One of you.' },
  emberqueen: { act: 1, kind: 'boss', name: 'The Ember Queen', rows: ['rbkqn.', 'pppppp'], h: 6, traits: ['frenzy'], rocks: [[0, 3], [5, 2]], wells: [[2, 2], [3, 3]], taunt: 'You will burn slowly, little king.' },
  // ---- act 3
  gridlock: { act: 2, kind: 'battle', name: 'Gridlock', rows: ['rnkqbr', 'pppppp'], h: 6, rocks: [[2, 2], [3, 3]] },
  overclock: { act: 2, kind: 'battle', name: 'Overclock', rows: ['rrkqbn', '.pppp.'], h: 6, traits: ['frenzy'], wells: [[0, 2], [5, 3]] },
  swarm: { act: 2, kind: 'battle', name: 'The Swarm', rows: ['nnkqnn', 'pppppp'], h: 6, traits: ['reinforce'] },
  prism: { act: 2, kind: 'battle', name: 'Prism Guard', rows: ['bbkqbb', 'pppppp'], h: 6, traits: ['shieldPawns'], rocks: [[1, 3], [4, 2]] },
  nullcourt: { act: 2, kind: 'elite', name: 'The Null Court', rows: ['rbkqbr', 'pppppp'], h: 6, traits: ['shieldPawns', 'frenzy'], taunt: 'Nothing you do here will count.' },
  mirrorking: { act: 2, kind: 'boss', name: 'The Mirror King', rows: ['rnkqbr', 'pppppp'], h: 7, traits: ['reinforce', 'kingShield', 'frenzy'], wells: [[1, 3], [4, 3]], taunt: 'I have already played this game. You lose.' },
};
for (const [id, e] of Object.entries(ENCOUNTERS)) { e.id = id; e.w = e.rows[0].length; }

export const CHAR_TYPE = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

export const RELICS = {
  hourglass: { name: 'Hourglass', glyph: 'clock', text: 'One more aether every turn.' },
  tome: { name: 'Battle Tome', glyph: 'eye', text: 'Draw one more card every turn.' },
  wardrum: { name: 'War Drum', glyph: 'flag', text: 'On the first turn of each battle, move twice.' },
  crownguard: { name: 'Crownguard', glyph: 'crown', text: 'Your king starts each battle shielded.' },
  pikes: { name: 'Pikes', glyph: 'step', text: 'Your pawns can also capture straight ahead.' },
  sidestep: { name: 'Dancing Shoes', glyph: 'swap', text: 'Your pawns can step sideways.' },
  spurs: { name: 'Silver Spurs', glyph: 'leap', text: 'Your knights can also step one square straight, without capturing.' },
  bloodstone: { name: 'Bloodstone', glyph: 'drop', text: 'Gain 1 aether whenever one of your pieces captures.' },
  purse: { name: 'Deep Purse', glyph: 'coin', text: 'Half again as much gold from battles.' },
  phoenix: { name: 'Phoenix Feather', glyph: 'star', text: 'The first piece you lose each battle returns to your home row.' },
  banner: { name: 'War Banner', glyph: 'flag', text: 'Start each battle with an extra card and an extra aether.' },
  lodestone: { name: 'Lodestone', glyph: 'snow', text: 'Two enemy pieces start each battle frozen.' },
};
for (const [id, r] of Object.entries(RELICS)) r.id = id;

export const WARBANDS = {
  vanguard: {
    name: 'The Vanguard', text: 'A rook, a knight and three pawns. A balanced deck.',
    pieces: [KING, ROOK, KNIGHT, PAWN, PAWN, PAWN],
    deck: ['quickstep', 'quickstep', 'aegis', 'aegis', 'frost', 'bolt', 'insight', 'conscript'],
    relics: [], unlock: null,
  },
  zealots: {
    name: 'The Zealots', text: 'Two bishops and a knight, few pawns, and a deck full of spells.',
    pieces: [KING, BISHOP, BISHOP, KNIGHT, PAWN, PAWN],
    deck: ['frost', 'frost', 'bolt', 'bolt', 'insight', 'leap', 'aegis', 'blink', 'surge'],
    relics: [], unlock: 'Beat the first boss',
  },
  rabble: {
    name: 'The Rabble', text: 'A king and seven pawns with pikes. Promote, or perish.',
    pieces: [KING, PAWN, PAWN, PAWN, PAWN, PAWN, PAWN, PAWN],
    deck: ['rally', 'rally', 'phalanx', 'knighting', 'conscript', 'conscript', 'quickstep', 'bloodprice', 'aegis'],
    relics: ['pikes'], unlock: 'Win a run',
  },
};
for (const [id, w] of Object.entries(WARBANDS)) w.id = id;

// ------------------------------------------------------------ personalities
// Every piece in your army is somebody: a name, a temper, a perk that bends a
// rule, and things to say. `pawn: true` perks only make sense for pawns.
const say = (start, move, capture, fall, cheer) => ({ start, move, capture, fall, cheer });
export const PERSONAS = {
  bold: {
    title: 'the Bold', pawn: true, perk: 'Captures straight ahead as well as diagonally.',
    lines: say(['Point me at them.', 'Front rank. Where else?'], ['Forward!', 'No sense waiting.'], ['Who is next?', 'Straight through!'], ['Worth it...', 'I regret nothing.'], ['Told you.']),
  },
  cautious: {
    title: 'the Cautious', pawn: true, perk: 'Can step one square backward.',
    lines: say(['Is it too late to go home?', 'I will be at the back.'], ['Carefully... carefully...', 'I do not like this square.'], ['Oh! I got one?', 'It attacked me first.'], ['I knew it. I knew it!', 'Should have stayed back.'], ['Are we alive? Good.']),
  },
  restless: {
    title: 'the Restless', pawn: true, perk: 'Its first move may be two squares.',
    lines: say(['Can we start? Can we start now?', 'I have been standing for hours.'], ['Finally!', 'Move, move, move.'], ['Out of my way!', 'Next!'], ['Too fast...', 'Did not see that one.'], ['Again! Let us go again!']),
  },
  sly: {
    title: 'the Sly', pawn: true, perk: 'Can step sideways.',
    lines: say(['Nobody watches the pawn.', 'I have a way around.'], ['Sideways is still forward.', 'Look over there.'], ['Never saw me.', 'Pockets, too.'], ['Clever of them.', 'Huh. Fair.'], ['As planned. Mostly.']),
  },
  ambitious: {
    title: 'the Ambitious', pawn: true, perk: 'Promotes one row early.',
    lines: say(['Today I become a queen.', 'Remember this face. It gets a crown.'], ['One step closer.', 'Up. Always up.'], ['Out of the way of history.', 'A stepping stone.'], ['I was so close...', 'Not like this.'], ['Bow, then.']),
  },
  stubborn: {
    title: 'the Stubborn', perk: 'Starts every battle shielded.',
    lines: say(['I am not moving for anyone.', 'Let them try.'], ['If I must.', 'Fine.'], ['Told them to go around.', 'Should have gone around.'], ['Still not sorry.', 'They got lucky.'], ['Did not budge.']),
  },
  greedy: {
    title: 'the Magpie', perk: 'Finds 5 gold whenever it captures.',
    lines: say(['That one has a nice helmet.', 'I count at least forty gold out there.'], ['Is there loot this way?', 'Shiny...'], ['Mine now.', 'Finders keepers.'], ['My purse... take my purse...', 'Bury me with the gold.'], ['Split it? No.']),
  },
  bookish: {
    title: 'the Bookish', perk: 'Draw a card whenever it captures.',
    lines: say(['I have read about this formation.', 'Chapter nine covers exactly this.'], ['As the manuals advise.', 'A textbook advance.'], ['Fascinating. Noted.', 'Just as written.'], ['That was not in the book...', 'A footnote, at least?'], ['I shall write this up.']),
  },
  furious: {
    title: 'the Furious', perk: 'Gain 1 aether whenever it captures.',
    lines: say(['WHICH ONE LOOKED AT ME?', 'I am already angry.'], ['RRRGH.', 'Out of my way.'], ['AND STAY DOWN!', 'MORE!'], ['THIS IS NOT OVER!', 'I will haunt you!'], ['Hm. I feel better.']),
  },
  lucky: {
    title: 'the Lucky', perk: 'Is never wounded.',
    lines: say(['I found a coin this morning. Good sign.', 'Never been hit yet.'], ['Feels like a good square.', 'Heads, I go.'], ['Ha! Tripped into it.', 'Lucky swing.'], ['It is only a scratch.', 'I will walk it off.'], ['Knew it would work out.']),
  },
  gentle: {
    title: 'the Gentle', perk: 'If it survives a battle, one fallen comrade is not wounded.',
    lines: say(['Everyone drink some water first.', 'Stay close. I have bandages.'], ['Mind your footing.', 'Excuse me.'], ['Sorry. So sorry.', 'I did warn you.'], ['Look after the others...', 'Oh. Oh dear.'], ['Is anyone hurt?']),
  },
  loud: {
    title: 'the Loud', perk: 'Draw an extra card on the first turn.',
    lines: say(['GOOD MORNING, EVERYONE!', 'CAN THEY HEAR US? HELLO!'], ['MOVING NOW!', 'COMING THROUGH!'], ['GOT ONE! DID YOU SEE?', 'HA HA!'], ['I AM FINE! I am not fine.', 'TELL MY STORY! LOUDLY!'], ['WE DID IT!']),
  },
  regal: {
    title: '', king: true, perk: 'If the king falls, the battle is lost.',
    lines: say(['Hold the line, and we all go home.', 'Steady. I am with you.'], ['A king walks when he must.', 'Onward.'], ['By my own hand, then.', 'Let that be a lesson.'], ['The crown... falls...', 'Forgive me.'], ['Well fought, all of you.']),
  },
};
for (const [id, p] of Object.entries(PERSONAS)) p.id = id;

export const NAMES = ['Odo', 'Brin', 'Tibb', 'Mave', 'Wenna', 'Hal', 'Pip', 'Rosk', 'Garrow', 'Fen', 'Alda', 'Ysa', 'Kit', 'Bex', 'Dorric',
  'Ludo', 'Nim', 'Quill', 'Hobb', 'Sorrel', 'Thane', 'Ulla', 'Vesper', 'Wick', 'Yarrow', 'Zed', 'Maud', 'Ansel', 'Berta', 'Cob',
  'Dill', 'Edda', 'Flint', 'Greta', 'Hugh', 'Ivo', 'Jory', 'Kester', 'Lark', 'Merrin', 'Nell', 'Osric', 'Perrin', 'Runa', 'Sable', 'Tam'];
export const KING_NAMES = ['King Aldous', 'Queen-Regent Isolde', 'King Corwin', 'King Emrys', 'Queen-Regent Maren'];

export const PIECE_PRICE = { [PAWN]: 35, [KNIGHT]: 90, [BISHOP]: 90, [ROOK]: 140, [QUEEN]: 240 };
export const CARD_PRICE = { common: 35, uncommon: 60, rare: 95 };
export const RELIC_PRICE = 110;
export const REMOVE_PRICE = 45;
export const HEAL_PRICE = 10;
export const ROSTER_LIMIT = 12;

// Roadside events. `can` gates a choice; `go` changes the run and returns what happened.
export const EVENTS = {
  smith: {
    title: 'The Wandering Smith',
    text: 'A smith with a portable forge looks over your pawns. "I can make something better of one of these. Not for free."',
    choices: [
      { label: 'Pay 40 gold', hint: 'A pawn becomes a knight', can: (r) => r.s.gold >= 40 && r.hasPawn(), go: (r) => { r.s.gold -= 40; r.promotePawn(KNIGHT); return 'The pawn rides out of the smoke on horseback.'; } },
      { label: 'Walk on', hint: 'Nothing happens', go: () => 'You keep your gold.' },
    ],
  },
  spring: {
    title: 'An Aether Spring',
    text: 'Light wells up between the stones. You could drink deep, or wash something away in it.',
    choices: [
      { label: 'Drink', hint: 'Gain a random uncommon card', go: (r) => { const c = r.randomCard('uncommon'); r.s.deck.push(c); return { text: 'A new spell settles into your mind.', card: c }; } },
      { label: 'Wash', hint: 'Remove a card from your deck', can: (r) => r.s.deck.length > 4, go: () => ({ text: 'Choose what to forget.', removeCard: true }) },
    ],
  },
  gambler: {
    title: 'The Gambler',
    text: 'A figure shuffles three cups on an upturned crate. "Thirty gold. Find the crown and I pay you back threefold."',
    choices: [
      { label: 'Bet 30 gold', hint: 'One chance in two to win 90', can: (r) => r.s.gold >= 30, go: (r) => { r.s.gold -= 30; if (r.rnd() < 0.5) { r.s.gold += 90; return 'The crown is under your cup. Ninety gold.'; } return 'Empty. The gambler shrugs.'; } },
      { label: 'Decline', hint: 'Nothing happens', go: () => 'You have seen this trick before.' },
    ],
  },
  deserters: {
    title: 'Deserters',
    text: 'Two soldiers who fled the other army ask to march with you. They want paying, or they want to see you bleed for them.',
    choices: [
      { label: 'Pay 25 gold', hint: 'Recruit two pawns', can: (r) => r.s.gold >= 25 && r.s.roster.length + 2 <= ROSTER_LIMIT, go: (r) => { r.s.gold -= 25; r.addPiece(PAWN); r.addPiece(PAWN); return 'Two pawns fall in behind you.'; } },
      { label: 'Swear an oath', hint: 'Recruit a knight, lose a crown', can: (r) => r.s.crowns > 1 && r.s.roster.length < ROSTER_LIMIT, go: (r) => { r.s.crowns--; r.addPiece(KNIGHT); return 'A knight kneels. The oath costs you a crown.'; } },
      { label: 'Send them away', hint: 'Nothing happens', go: () => 'They vanish back into the hills.' },
    ],
  },
  shrine: {
    title: 'A Broken Shrine',
    text: 'Something still hums in the rubble. It asks for an offering.',
    choices: [
      { label: 'Offer a pawn', hint: 'Lose a pawn, gain a relic', can: (r) => r.hasPawn() && r.freeRelics().length > 0, go: (r) => { r.losePawn(); const id = r.grantRelic(); return { text: 'The pawn is gone. Something better is left in its place.', relic: id }; } },
      { label: 'Offer 60 gold', hint: 'Restore a crown', can: (r) => r.s.gold >= 60 && r.s.crowns < 3, go: (r) => { r.s.gold -= 60; r.s.crowns++; return 'You feel steadier.'; } },
      { label: 'Leave it', hint: 'Nothing happens', go: () => 'The humming fades behind you.' },
    ],
  },
};
for (const [id, e] of Object.entries(EVENTS)) e.id = id;
