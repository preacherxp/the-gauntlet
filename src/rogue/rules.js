// Movement rules for the Gauntlet's small boards, and the enemy's search.
// Pure JavaScript: no DOM, so it runs under Node for the tests.
//
// A board is `geo` = { w, h, rock: Uint8Array, opts } plus `cells`, an array of
// w*h pieces or nulls. A piece is { id, type, side, shield, frozen, queen }.
// YOU move up the board (toward higher y), the FOE moves down. There is no
// check: a side loses when its king is captured.

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const YOU = 0, FOE = 1;
export const PIECE_NAMES = ['', 'Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];
export const PIECE_VALUE = [0, 1, 3, 3.2, 5, 9, 0];

const KNIGHT_D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ALL8 = [...ORTH, ...DIAG];

export const mvFrom = (m) => m & 255;
export const mvTo = (m) => m >> 8;

// Pushes the moves of the piece on `idx` into `out` as from | to << 8.
// `ply` is how deep in a search this is: a freeze only holds for the first turn.
export function pieceMoves(geo, cells, idx, out, ply = 0) {
  const p = cells[idx];
  if (!p || (p.frozen > 0 && ply < 2)) return out;
  const { w, h, rock } = geo;
  const x = idx % w, y = (idx / w) | 0;
  // mode 0: move or capture, 1: move only, 2: capture only. Returns true if the square was empty.
  const add = (tx, ty, mode) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
    const t = ty * w + tx;
    if (rock[t]) return false;
    const q = cells[t];
    if (!q) { if (mode !== 2) out.push(idx | (t << 8)); return true; }
    if (q.side !== p.side && mode !== 1) out.push(idx | (t << 8));
    return false;
  };
  const slide = (dirs) => { for (const [dx, dy] of dirs) for (let k = 1; add(x + dx * k, y + dy * k, 0); k++); };
  const mine = p.side === YOU ? geo.opts : null;   // relic rules only bend for the player
  const type = p.queen ? QUEEN : p.type;
  if (type === PAWN) {
    const d = p.side === YOU ? 1 : -1;
    const perk = p.side === YOU ? p.perk : null;        // a pawn's personality can bend its moves
    const open = add(x, y + d, (mine && mine.pikes) || perk === 'bold' ? 0 : 1);
    if (open && perk === 'restless' && !p.moved) add(x, y + 2 * d, 1);
    add(x - 1, y + d, 2); add(x + 1, y + d, 2);
    if ((mine && mine.sidestep) || perk === 'sly') { add(x - 1, y, 1); add(x + 1, y, 1); }
    if (perk === 'cautious') add(x, y - d, 1);
  } else if (type === KNIGHT) {
    for (const [dx, dy] of KNIGHT_D) add(x + dx, y + dy, 0);
    if (mine && mine.spurs) for (const [dx, dy] of ORTH) add(x + dx, y + dy, 1);
  } else if (type === BISHOP) slide(DIAG);
  else if (type === ROOK) slide(ORTH);
  else if (type === QUEEN) slide(ALL8);
  else if (type === KING) for (const [dx, dy] of ALL8) add(x + dx, y + dy, 0);
  return out;
}

export function allMoves(geo, cells, side, ply = 0) {
  const out = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] && cells[i].side === side) pieceMoves(geo, cells, i, out, ply);
  return out;
}

// Does pawn `p` promote on reaching square `to`? An ambitious pawn does so a row early.
export function promotes(geo, p, to) {
  if (p.type !== PAWN) return false;
  const y = (to / geo.w) | 0;
  return p.side === YOU ? y >= geo.h - 1 - (p.perk === 'ambitious' ? 1 : 0) : y === 0;
}

// The position after a move, without touching the original. Returns
// [cells, sideWhoseKingFell or -1].
export function simulate(geo, cells, m) {
  const from = m & 255, to = m >> 8;
  const next = cells.slice();
  let p = cells[from];
  const q = cells[to];
  if (q && q.shield) { next[to] = { ...q, shield: false }; return [next, -1]; }   // the blow is absorbed
  next[from] = null;
  if (p.type === PAWN) {
    if (promotes(geo, p, to)) p = { ...p, type: QUEEN };
    else if (p.perk === 'restless' && !p.moved) p = { ...p, moved: true };
  }
  next[to] = p;
  return [next, q && q.type === KING ? q.side : -1];
}

// Material and position, from `side`'s point of view.
export function evaluate(geo, cells, side) {
  const { w, h } = geo;
  let s = 0;
  for (let i = 0; i < cells.length; i++) {
    const p = cells[i];
    if (!p) continue;
    const x = i % w, y = (i / w) | 0;
    let v = PIECE_VALUE[p.type];
    if (p.type === PAWN) {
      const adv = p.side === YOU ? y : h - 1 - y;
      v += adv * 0.12 + (adv >= h - 2 ? 1.5 : 0);         // a pawn about to queen is worth a lot
    } else if (p.type !== KING) {
      v += 0.06 * (Math.min(x, w - 1 - x) + Math.min(y, h - 1 - y));   // pieces like the middle
    }
    if (p.shield) v += p.type === KING ? 0.8 : 0.5;
    if (p.frozen > 0) v -= 0.3;
    s += p.side === side ? v : -v;
  }
  return s;
}

const WIN = 1000;

function search(geo, cells, side, depth, alpha, beta, ply) {
  const moves = allMoves(geo, cells, side, ply);
  if (!moves.length) return depth <= 1 ? evaluate(geo, cells, side) : -search(geo, cells, side ^ 1, depth - 1, -beta, -alpha, ply + 1);
  // captures first, biggest prize first: it is most of what alpha-beta needs
  moves.sort((a, b) => (cells[b >> 8] ? PIECE_VALUE[cells[b >> 8].type] + 10 * (cells[b >> 8].type === KING) : -1)
    - (cells[a >> 8] ? PIECE_VALUE[cells[a >> 8].type] + 10 * (cells[a >> 8].type === KING) : -1));
  let best = -Infinity;
  for (const m of moves) {
    const [next, fell] = simulate(geo, cells, m);
    let score;
    if (fell >= 0) score = WIN - ply;
    else if (depth <= 1) score = evaluate(geo, next, side);
    else score = -search(geo, next, side ^ 1, depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

// The move `side` should play, looking `depth` half-moves ahead. Moves that
// score nearly the same are chosen between at random so games differ.
export function chooseMove(geo, cells, side, depth, rnd = Math.random) {
  const moves = allMoves(geo, cells, side, 0);
  if (!moves.length) return 0;
  const prize = (m) => (cells[m >> 8] ? PIECE_VALUE[cells[m >> 8].type] + 10 * (cells[m >> 8].type === KING) : -1);
  moves.sort((a, b) => prize(b) - prize(a));
  const scored = [];
  let best = -Infinity;
  for (const m of moves) {
    const [next, fell] = simulate(geo, cells, m);
    // Only moves within a whisker of the best matter, so the rest may be cut off early.
    const floor = best - 0.13;
    const score = fell >= 0 ? WIN : depth <= 1 ? evaluate(geo, next, side) : -search(geo, next, side ^ 1, depth - 1, -Infinity, -floor, 1);
    scored.push([m, score]);
    if (score > best) best = score;
  }
  const good = scored.filter(([, s]) => s >= best - 0.12);
  return good[Math.floor(rnd() * good.length)][0];
}
