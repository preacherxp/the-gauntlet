// The Gauntlet's controller: it walks a Run from screen to screen, runs each
// battle (your cards and move, then the enemy), feeds the Battle's events to
// the 3D arena, and lets the pieces speak.

import * as THREE from 'three';
import { Run, updateMeta } from './run.js';
import { Arena } from './arena.js';
import { RogueUI, fullName } from './screens.js';
import { CARDS } from './cards.js';
import { ACTS, PERSONAS, EVENTS, NAMES } from './content.js';
import { YOU, FOE, PAWN, ROOK, KNIGHT, BISHOP, QUEEN, KING, PIECE_NAMES } from './rules.js';
import { personaIcons, LOOK_IDS } from './looks.js';

const RUN_KEY = 'aether-chess.run.v1', META_KEY = 'aether-chess.meta.v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, v) => { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* private mode */ } };

export class Gauntlet {
  // host: { stage, fx, tweens, audio, textures, root, applyTheme(id), icons(), toast(text, kind), confirm(title, text, yes, no),
  //         openSettings(), toggleMute(), muted(), toTitle(), layout() }
  constructor(host) {
    this.host = host;
    this.arena = new Arena(host.stage.scene, host.tweens, host.fx, host.textures);
    this.arena.onBeat = (kind, data) => this.beat(kind, data);
    this.ui = new RogueUI(host.root, {
      card: (i) => this.cardClicked(i), button: (act) => this.button(act),
      map: () => this.run && this.ui.map(this.run, { close: () => this.reopen() }),
      army: () => this.run && this.ui.army(this.run, () => this.reopen()),
      deck: () => this.run && this.ui.deck(this.run, { close: () => this.reopen() }),
      settings: () => host.openSettings(), mute: () => { host.toggleMute(); this.ui.setMuted(host.muted()); },
      leave: () => this.leave(),
    });
    this.active = false;
    this.run = null; this.battle = null; this.setup = null;
    this.phase = 'idle';          // idle | screen | deploy | player | casting | busy | enemy
    this.selected = -1; this.targets = []; this.casting = null; this.zone = [];
    this.who = new Map();         // battle piece id -> { name, perk, side, type }
    this.talk = [];               // live speech bubbles
    this.lastBark = 0;
    this.token = 0;
    this.down = null;
  }

  // ------------------------------------------------------------- run on disk
  meta() { return { runs: 0, wins: 0, bestFloor: 0, unlocked: ['vanguard'], ...(read(META_KEY) || {}) }; }
  hasSave() { const r = Run.load(read(RUN_KEY)); return !!r && r.s.phase !== 'over' && r.s.phase !== 'won'; }
  save() { if (this.run) write(RUN_KEY, this.run.save()); }
  settle() { const out = updateMeta(this.meta(), this.run); write(META_KEY, out.meta); return out.news; }

  // ---------------------------------------------------------- coming and going
  show() {
    this.active = true;
    this.host.root.hidden = false;
    this.ui.setIcons(this.host.icons());
    this.ui.setMuted(this.host.muted());
  }

  hide() {
    this.token++;
    this.active = false;
    this.host.root.hidden = true;
    this.arena.show(false);
    this.ui.closeScreen(); this.ui.hideBattle();
    this.clearTalk();
    this.host.stage.span = 8;
    this.host.stage.board = null;
    this.phase = 'idle';
  }

  open() {
    this.show();
    this.phase = 'screen';
    this.battle = null;
    this.ui.hideBattle();
    this.ui.hud(null);
    this.ui.warbands(this.meta().unlocked, (id) => this.begin(id), () => this.host.toTitle());
  }

  // Behind the title: a parade of every temper, waiting on a small board.
  title() {
    this.token++;
    this.hide();
    this.active = true;          // keep the arena animating
    this.phase = 'title';
    this.battle = null; this.run = null;
    this.host.applyTheme(this.host.titleTheme);
    const w = 6, h = 4, cells = new Array(w * h).fill(null);
    let id = 1;
    LOOK_IDS.forEach((perk, i) => { cells[(i < 6 ? 0 : 1) * w + (i % 6)] = { id: id++, type: PAWN, side: YOU, perk, name: NAMES[i], shield: false, frozen: 0, queen: false }; });
    [ROOK, KNIGHT, KING, QUEEN, BISHOP, ROOK].forEach((type, x) => { cells[(h - 1) * w + x] = { id: id++, type, side: FOE, shield: false, frozen: 0, queen: false }; });
    this.arena.show(true);
    this.arena.build({ w, h, cells, rock: new Uint8Array(w * h), well: new Uint8Array(w * h) }, { intro: false });
    this.host.stage.span = 7;
    this.host.stage.board = null;
    this.host.stage.setAutoRotate(true);
    this.host.stage.flyTo({ phi: 1.02, radius: this.host.stage.fitDistance() * 1.12 }, 1.2);
  }

  begin(warband) {
    this.run = Run.start(warband);
    this.save();
    this.show();
    this.enter();
  }

  resume() {
    this.run = Run.load(read(RUN_KEY));
    if (!this.run) { this.open(); return; }
    this.show();
    this.enter();
  }

  leave() { this.save(); this.host.toTitle(); }

  setTheme(theme, mats) {
    this.arena.setTheme(theme, mats);
    this.ui.setIcons(this.host.icons());
    try { this.ui.personaIcons = personaIcons(this.host.stage, mats); } catch (err) { console.warn('persona portraits failed', err); }
  }
  // After a resize or a turn of the phone, pull the camera in or out to fit the board again.
  refit() {
    const stage = this.host.stage;
    if (!this.battle || stage.cameraBusy) return;
    const s = stage.spherical();
    stage.flyTo({ theta: s.theta, phi: s.phi, radius: stage.fitDistance() }, 0.3);
  }

  // How much of the view the interface covers, so the board can be framed in what is left.
  inset() {
    const b = this.ui.placeOverlays(), W = window.innerWidth, H = window.innerHeight;
    if (this.ui.bottom.hidden) return { right: 0, bottom: 0, top: 0 };
    // A tall phone stacks the top bar and the foe's panel above the board; on its side they head
    // the hand's column, leaving the board the whole height. Wide screens have room to spare.
    const top = this.ui.compact ? b.start : 0;
    return { right: b.sidebar ? W - b.right : 0, bottom: Math.max(0, H - b.bottom), top };
  }

  // Show whatever the run's phase calls for.
  enter() {
    const run = this.run, s = run.s;
    this.token++;
    this.host.applyTheme(ACTS[Math.min(s.act, ACTS.length - 1)].theme);
    this.ui.setIcons(this.host.icons());
    this.ui.hud(run);
    if (s.phase === 'battle') { this.startBattle(); return; }
    this.battle = null;
    this.host.stage.board = null;
    this.phase = 'screen';
    this.arena.show(false);
    this.ui.hideBattle();
    this.clearTalk();
    this.host.stage.setAutoRotate(true);
    this.host.layout();
    this.screen();
  }

  screen() {
    const run = this.run, s = run.s, ui = this.ui, audio = this.host.audio;
    const next = () => { this.save(); this.enter(); };
    if (s.phase === 'path') ui.map(run, { pick: (i) => { audio.play('march'); run.choose(i); next(); }, hover: () => audio.play('click') });
    else if (s.phase === 'reward') {
      ui.reward(run, s.reward, {
        card: (i) => { run.takeCard(i); audio.play(i >= 0 ? 'card' : 'click'); this.save(); },
        recruit: (i) => { run.takeRecruit(i); audio.play('summon'); this.save(); ui.hud(run); },
        done: () => { run.advance(); next(); },
      });
    } else if (s.phase === 'shop') {
      ui.shop(run, {
        buy: (kind, i) => { const ok = run.buy(kind, i); audio.play(ok ? 'coin' : 'illegal'); if (ok) { this.save(); ui.hud(run); } return ok; },
        remove: () => ui.deck(run, { title: 'Forget which card?', pick: (i) => { if (run.buy('remove', i)) { audio.play('coin'); this.save(); ui.hud(run); } this.screen(); }, close: () => this.screen() }),
        leave: () => { run.advance(); next(); },
      });
    } else if (s.phase === 'camp') {
      ui.camp(run, {
        rest: () => { audio.play('heal'); run.camp('rest'); next(); },
        train: (type) => { audio.play('promote'); run.camp('train', type); next(); },
        forget: () => ui.deck(run, { title: 'Forget which card?', pick: (i) => { run.camp('forget', i); next(); }, close: () => this.screen() }),
      });
    } else if (s.phase === 'event') {
      const ev = EVENTS[s.event.id];
      const done = () => { run.advance(); next(); };
      const result = (res) => {
        ui.hud(run);
        if (res.removeCard) ui.deck(run, { title: 'Forget which card?', pick: (i) => { run.removeCard(i); done(); }, close: done });
        else ui.eventResult(ev, res, done);
      };
      if (s.event.done) result(s.event.result);
      else ui.event(ev, run.eventChoices(), (i) => { audio.play('click'); const res = run.eventChoose(i); this.save(); if (res) result(res); });
    } else if (s.phase === 'won' || s.phase === 'over') {
      const won = s.phase === 'won';
      if (!s.settled) {            // once: this screen can be reopened after looking at the army
        s.settled = true;
        this.news = this.settle();
        write(RUN_KEY, null);
        audio.play(won ? 'win' : 'lose');
        if (won) this.host.fx.startFireworks(8, [0xffc45e, 0x7fe9ff, 0xff7ad0, 0xffffff]);
      }
      ui.end(run, won, this.news || [], { again: () => this.open(), title: () => this.host.toTitle() });
    }
  }

  // Close a viewer (army, deck) and return to what was showing.
  reopen() { if (this.battle) this.ui.closeScreen(); else this.screen(); }

  // ------------------------------------------------------------------ battle
  async startBattle() {
    const { host, arena, run } = this;
    const token = this.token;
    const setup = (this.setup = run.setup());
    const battle = (this.battle = run.makeBattle(setup));
    this.who = new Map();
    battle.cells.forEach((p) => { if (p) this.who.set(p.id, { name: p.name, perk: p.perk, side: p.side, type: p.type }); });
    this.selected = -1; this.targets = []; this.casting = null;
    this.zone = [];
    for (let i = 0; i < setup.w * 2; i++) if (!battle.rock[i]) this.zone.push(i);
    this.phase = 'busy';
    this.ui.closeScreen();
    this.clearTalk();
    arena.show(true);
    host.stage.span = Math.max(setup.w, setup.h) + 0.1;
    host.stage.board = { w: setup.w, h: setup.h };
    host.stage.setAutoRotate(false);
    this.refresh();
    host.layout();
    host.stage.viewFrom(0, 1.3);
    host.audio.play('whoosh');
    await arena.build(battle, { onDrop: () => host.audio.play('drop') });
    if (token !== this.token) return;
    this.phase = 'deploy';
    arena.mark({ zone: this.zone });
    this.refresh();
    if (setup.benched.length) host.toast(`${setup.benched.length} wounded ${setup.benched.length === 1 ? 'piece sits' : 'pieces sit'} this one out`);
  }

  async fight() {
    if (this.phase !== 'deploy') return;
    const token = this.token;
    this.phase = 'busy';
    this.selected = -1;
    this.arena.mark({ zone: [], selected: -1, targets: [] });
    this.host.audio.play('start');
    await this.play(this.battle.begin());
    if (token !== this.token) return;
    const foeKing = [...this.who.entries()].find(([, w]) => w.side === FOE && w.type === KING);
    if (this.setup.taunt && foeKing) this.say(foeKing[0], this.setup.taunt, 'foe', 3600);
    const mine = [...this.who.entries()].filter(([, w]) => w.side === YOU && w.perk);
    if (mine.length) { const [id] = mine[Math.floor(Math.random() * mine.length)]; setTimeout(() => this.bark(id, 'start', 1, true), this.setup.taunt ? 1500 : 200); }
    this.after();
  }

  async play(events) {
    await this.arena.play(events, (e) => this.onEvent(e));
    this.refresh();
  }

  // What comes after the player has done something.
  after() {
    const b = this.battle;
    if (b.result) { this.finish(); return; }
    if (b.turn === FOE) { this.enemyPhase(); return; }
    this.phase = 'player';
    this.refresh();
  }

  async enemyPhase() {
    const token = this.token, b = this.battle;
    this.phase = 'enemy';
    this.refresh();
    let guard = 0;
    while (!b.result && b.turn === FOE && guard++ < 4) {
      await sleep(420);
      if (token !== this.token) return;
      const ev = b.enemyTurn();
      const moved = ev.filter((e) => e.t === 'move' || e.t === 'block');
      if (moved.length) this.arena.mark({ last: [moved[moved.length - 1].from, moved[moved.length - 1].to ?? moved[moved.length - 1].at] });
      await this.play(ev);
      if (token !== this.token) return;
    }
    this.after();
  }

  async finish() {
    const { host, run, battle, arena } = this;
    const token = this.token, won = battle.result === 'win', boss = this.setup.kind === 'boss';
    this.phase = 'busy';
    this.casting = null; this.selected = -1;
    arena.mark({ selected: -1, targets: [], spell: [], hover: -1 });
    this.refresh();
    arena.celebrate(won ? YOU : FOE);
    host.audio.play(won ? 'win' : 'lose');
    if (won && boss) host.fx.startFireworks(4, [0xffc45e, 0x7fe9ff, 0xffffff]);
    if (won) { const mine = [...this.who.entries()].filter(([id, w]) => w.side === YOU && w.perk && arena.pieces.has(id)); if (mine.length) this.bark(mine[Math.floor(Math.random() * mine.length)][0], 'cheer', 1, true); }
    await sleep(won ? 2100 : 1700);
    if (token !== this.token) return;
    const out = run.finishBattle(battle);
    if (run.s.phase !== 'over' && run.s.phase !== 'won') this.settle();   // unlocks earned along the way
    this.save();
    this.battle = null;
    if (!out.won && !out.over) {
      this.ui.hud(run);
      this.ui.hideBattle();
      this.phase = 'screen';
      this.ui.defeat(out.retry
        ? 'Your king is taken. It costs you a crown. Your army regroups, healed, but the way is still barred: you must face this enemy again.'
        : 'Your king is taken. It costs you a crown. Your army regroups, healed, and slips past with nothing to show for it.', () => this.enter());
      return;
    }
    this.enter();
  }

  // The panel around the board.
  refresh() {
    const b = this.battle, setup = this.setup;
    if (!b) return;
    const mine = b.turn === YOU && !b.result;
    const live = this.phase === 'player' || this.phase === 'casting';
    let prompt = '';
    if (this.phase === 'deploy') prompt = 'Arrange your army on the lit squares: click a piece, then where it should stand. Then press Fight.';
    else if (this.phase === 'casting') { const c = CARDS[b.hand[this.casting.i]]; prompt = `${c.name}: ${c.ask[this.casting.chosen.length] || 'choose a target'}. Esc cancels.`; }
    else if (this.phase === 'player') prompt = !b.canMove(YOU) ? 'You have no move. Play a card or end your turn.' : b.extraMoves > 0 ? 'Play any cards, then move. You get a second move this turn.' : 'Play any cards you like, then move a piece.';
    else if (this.phase === 'enemy') prompt = 'The enemy is moving…';
    const buttons = [];
    if (this.phase === 'deploy') buttons.push({ label: 'Fight', act: 'fight', primary: true });
    else if (!b.result) {
      if (this.phase === 'player' && !b.canMove(YOU)) buttons.push({ label: 'End turn', act: 'skip', primary: true });
      buttons.push({ label: 'Retreat', act: 'retreat', title: 'Give up this battle. It costs a crown' });
    }
    this.ui.battle({
      foe: { name: setup.name, kind: setup.kind, traits: setup.traits },
      turnText: this.phase === 'deploy' ? 'Before the battle' : b.result ? (b.result === 'win' ? 'Victory' : 'Defeat') : mine ? `Your turn · round ${b.round}` : 'Enemy turn',
      prompt, minorPrompt: this.phase === 'player' && b.canMove(YOU) || this.phase === 'enemy', aether: b.aether, aetherMax: b.maxAether,
      hand: b.hand.map((id, i) => ({ id, playable: live && b.canPlay(i), active: !!this.casting && this.casting.i === i })),
      deck: b.deck.length, discard: b.discard.length, buttons,
    });
  }

  button(act) {
    if (act === 'fight') this.fight();
    else if (act === 'skip' && this.phase === 'player') { this.phase = 'busy'; this.play(this.battle.skipTurn()).then(() => this.after()); }
    else if (act === 'retreat' && (this.phase === 'player' || this.phase === 'casting')) {
      this.host.confirm('Retreat?', 'You give up this battle and lose a crown.', 'Retreat', 'Fight on').then((yes) => {
        if (!yes || !this.battle || this.battle.result) return;
        this.cancel();
        this.phase = 'busy';
        this.play(this.battle.concede()).then(() => this.finish());
      });
    }
  }

  // ------------------------------------------------------------ sound, speech
  // The arena calls this at the moments that matter inside an animation.
  beat(kind, d) {
    const { audio, stage } = this.host;
    if (kind === 'sfx') audio.play(d);
    else if (kind === 'strike') { audio.play('capture'); stage.shake(0.18); }
    else if (kind === 'land') { if (!d.captured) audio.play('move'); }
    else if (kind === 'shake') stage.shake(d);
  }

  onEvent(e) {
    const { audio, stage } = this.host, who = this.who;
    const later = (ms, name) => setTimeout(() => audio.play(name), ms);
    switch (e.t) {
      case 'move': {
        const p = who.get(e.id), v = e.victim ? who.get(e.victim) : null;
        if (v) { if (v.side === YOU) this.bark(e.victim, 'fall', 0.8, true); else if (p && p.side === YOU) this.bark(e.id, 'capture', 0.6); }
        else if (p && p.side === YOU) this.bark(e.id, 'move', 0.14);
        if (e.promo && p) p.type = QUEEN;
        break;
      }
      case 'block': later(200, 'shieldbreak'); break;
      case 'shield': audio.play(e.on ? 'shield' : 'shieldbreak'); break;
      case 'freeze': if (e.on) audio.play('freeze'); break;
      case 'queen': if (e.on) audio.play('hint'); break;
      case 'destroy': { const v = who.get(e.id); audio.play('zap'); later(120, 'capture'); stage.shake(0.25); if (v && v.side === YOU) this.bark(e.id, 'fall', 0.8, true); break; }
      case 'spawn': case 'revive': audio.play('summon'); who.set(e.piece.id, { name: e.piece.name, perk: e.piece.perk, side: e.piece.side, type: e.piece.type }); break;
      case 'shift': audio.play(e.style === 'blink' ? 'blink' : 'move'); break;
      case 'swap': audio.play('whoosh'); break;
      case 'convert': audio.play('blink'); if (who.get(e.id)) who.get(e.id).side = e.side; break;
      case 'morph': if (who.get(e.id)) who.get(e.id).type = e.type; break;
      case 'rock': audio.play('rock'); break;
      case 'gold': audio.play('coin'); break;
      case 'card': audio.play('card'); break;
      case 'draw': audio.play('draw'); this.refresh(); break;
      case 'aether': this.refresh(); break;
      case 'again': if (!e.pending) this.host.toast('Move again'); break;
      case 'pass': this.host.toast(e.side === YOU ? 'No move to make: your turn passes' : 'The enemy cannot move'); break;
      case 'turn': if (e.side === YOU && e.wells) this.host.toast(`+${e.wells} aether from the well${e.wells > 1 ? 's' : ''}`); break;
      default: break;
    }
  }

  // Let a piece say one of its lines. `force` skips the cooldown that keeps them from chattering.
  bark(id, key, chance = 1, force = false) {
    const w = this.who.get(id);
    if (!w || !w.perk || !PERSONAS[w.perk] || Math.random() > chance) return;
    const now = performance.now();
    if (!force && now - this.lastBark < 3500) return;
    this.lastBark = now;
    const lines = PERSONAS[w.perk].lines[key];
    this.say(id, lines[Math.floor(Math.random() * lines.length)], '', 2600, w.name);
  }

  say(id, text, kind = '', ms = 2600, name = '') {
    const pos = this.arena.headOf(id);
    if (!pos) return;
    while (this.talk.length > 2) this.talk.shift().el.remove();
    const el = this.ui.bubble(text, kind);
    if (name) el.dataset.name = name;
    el.style.visibility = 'hidden';            // until update() finds it a place
    this.talk.push({ el, id, pos: pos.clone(), until: performance.now() + ms });
    this.host.audio.play('bark');
  }

  clearTalk() { for (const t of this.talk) t.el.remove(); this.talk = []; }

  update(dt) {
    if (!this.active) return;
    this.arena.update(dt);
    // Now and then, check whether the interface has changed size (a hand of longer cards, the
    // foe's panel opened) and, if the free space moved, frame the board in it again.
    if (this.battle && (this.frames = (this.frames || 0) + 1) % 15 === 0) {
      const i = this.inset(), was = this.host.stage.insets;
      if (Math.abs(i.right - was.right) > 6 || Math.abs(i.bottom - was.bottom) > 6 || Math.abs(i.top - was.top) > 6) { this.host.layout(); this.needsRefit = true; }
    }
    // A camera still flying in can't be reframed yet; keep asking until it lands.
    if (this.needsRefit && this.battle && !this.host.stage.cameraBusy) { this.needsRefit = false; this.refit(); }
    if (!this.talk.length) return;
    const now = performance.now(), cam = this.host.stage.camera, rect = this.host.stage.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    const band = this.ui.placeOverlays();       // measured afresh: the interface may have moved since
    this.talk = this.talk.filter((t) => { if (now > t.until) { t.el.remove(); return false; } return true; });
    // Each bubble sits above its speaker, but is kept inside the free band and off the other bubbles.
    const placed = [];
    for (const t of this.talk) {
      const head = this.arena.headOf(t.id, v);
      if (head) t.pos.copy(head); else v.copy(t.pos);
      v.project(cam);
      const x = rect.left + ((v.x + 1) / 2) * rect.width, y = rect.top + ((1 - v.y) / 2) * rect.height;
      const w = t.el.offsetWidth, h = t.el.offsetHeight;
      let left = Math.max(4, Math.min(band.right - w - 4, x - w / 2));
      let top = Math.max(band.top, Math.min(band.bottom - h, y - h - 14));
      for (const p of placed) {
        if (left < p.left + p.w && left + w > p.left && top < p.top + p.h && top + h > p.top) {
          const below = p.top + p.h + 6, above = p.top - h - 6;
          top = below + h <= band.bottom ? below : Math.max(band.top, above);
        }
      }
      // No room in the free band (a small phone, a prompt showing): say nothing rather than cover the interface.
      const fits = top >= band.top - 1 && top + h <= band.bottom + 1 && left + w <= band.right + 1
        && !placed.some((p) => left < p.left + p.w && left + w > p.left && top < p.top + p.h && top + h > p.top);
      t.el.style.visibility = fits ? '' : 'hidden';
      if (fits) placed.push({ left, top, w, h });
      t.el.style.left = left + 'px';
      t.el.style.top = top + 'px';
      t.el.style.setProperty('--tail', Math.max(10, Math.min(w - 10, x - left)) + 'px');
      t.el.classList.toggle('tail-off', Math.abs(top - (y - h - 14)) > 6);   // pushed away from the speaker: no pointer
      t.el.classList.toggle('fade', t.until - now < 400);
    }
  }

  // ------------------------------------------------------------------- input
  valid() {
    if (this.phase === 'deploy') return this.zone;
    if (this.phase === 'casting') return this.battle.cardTargets(this.casting.i, this.casting.chosen) || [];
    if (this.phase === 'player') return this.targets;
    return [];
  }

  // The square a click means: the piece under the pointer, unless only the
  // square behind it is something that can be chosen right now.
  resolve(hit) {
    const b = this.battle, valid = this.valid();
    const own = (i) => i >= 0 && b.cells[i] && b.cells[i].side === YOU;
    if (hit.pieceIdx >= 0 && (valid.includes(hit.pieceIdx) || (this.phase !== 'casting' && own(hit.pieceIdx)))) return hit.pieceIdx;
    if (hit.planeIdx >= 0 && valid.includes(hit.planeIdx)) return hit.planeIdx;
    return hit.pieceIdx >= 0 ? hit.pieceIdx : hit.planeIdx;
  }

  usable(idx) {
    if (idx < 0 || !this.battle) return false;
    const b = this.battle;
    if (this.phase === 'deploy') return this.zone.includes(idx);
    if (this.phase === 'casting') return this.valid().includes(idx);
    if (this.phase === 'player') return this.targets.includes(idx) || (!!b.cells[idx] && b.cells[idx].side === YOU);
    return false;
  }

  // On a touch screen: a tap acts, and pressing and holding a piece shows what
  // it is without doing anything. Dragging anywhere else turns the camera.
  pointerDown(e) {
    this.ui.setPeek(-1);
    this.ui.nav.classList.remove('open');
    clearTimeout(this.tipTimer);
    if (e.pointerType === 'touch') this.ui.hideTip();
    if (e.button !== 0 || !this.battle || this.ui.screenOpen) { this.down = null; return; }
    const hit = this.arena.pick(this.host.stage.ndc(e), this.host.stage.camera);
    const idx = this.resolve(hit);
    const touch = e.pointerType === 'touch';
    this.down = { x: e.clientX, y: e.clientY, idx, touch, held: false };
    if (this.usable(idx)) this.host.stage.lockInput(true);
    if (touch) {
      const at = hit.pieceIdx >= 0 ? hit.pieceIdx : hit.planeIdx, d = this.down;
      this.holdTimer = setTimeout(() => {
        if (this.down !== d || at < 0) return;
        const lines = this.describe(at);
        if (!lines) return;
        d.held = true;
        this.host.audio.play('select');
        this.ui.tip(lines, d.x - 60, d.y - 30);
      }, 420);
    }
  }

  pointerMove(e) {
    if (this.down && this.down.touch && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 12) clearTimeout(this.holdTimer);
    if (!this.battle || this.ui.screenOpen || e.buttons || e.pointerType === 'touch') { if (e.pointerType !== 'touch') this.ui.hideTip(); return; }
    const hit = this.arena.pick(this.host.stage.ndc(e), this.host.stage.camera);
    const idx = this.resolve(hit);
    const hover = this.usable(idx) ? idx : -1;
    if (hover !== this.arena.marks.hover) this.arena.mark({ hover });
    this.host.stage.canvas.style.cursor = hover >= 0 ? 'pointer' : '';
    const at = hit.pieceIdx >= 0 ? hit.pieceIdx : hit.planeIdx;
    const lines = at >= 0 ? this.describe(at) : null;
    if (lines) this.ui.tip(lines, e.clientX, e.clientY); else this.ui.hideTip();
  }

  pointerUp(e, cancelled) {
    this.host.stage.lockInput(false);
    clearTimeout(this.holdTimer);
    const d = this.down;
    this.down = null;
    if (!d) return;
    if (d.held) { this.tipTimer = setTimeout(() => this.ui.hideTip(), 2600); return; }   // it was a look, not a move
    if (cancelled || Math.hypot(e.clientX - d.x, e.clientY - d.y) > (d.touch ? 14 : 7) || this.ui.screenOpen) return;
    const before = this.phase;
    this.click(d.idx);
    // A tap on a touch screen also says briefly what was tapped, since there is no hovering.
    if (d.touch && d.idx >= 0 && before !== 'casting') {
      const p = this.battle && this.battle.cells[d.idx];
      const lines = p ? this.describe(d.idx) : null;
      if (lines) {
        this.ui.tip(lines, d.x - 60, d.y - 40);
        this.tipTimer = setTimeout(() => this.ui.hideTip(), 2200);
      }
    }
  }

  key(e) {
    if (this.ui.screenOpen || !this.battle) return false;
    if (e.key === 'Escape') { this.cancel(); return true; }
    if (/^[1-6]$/.test(e.key)) { this.cardClicked(+e.key - 1); return true; }
    if (e.key === 'Enter' && this.phase === 'deploy') { this.fight(); return true; }
    return false;
  }

  describe(idx) {
    const b = this.battle, p = b.cells[idx];
    if (!p) {
      if (b.rock[idx]) return ['Rock', { text: b.rockTimer[idx] > 0 ? `Crumbles in ${b.rockTimer[idx]} round${b.rockTimer[idx] > 1 ? 's' : ''}.` : 'Nothing passes.', dim: true }];
      if (b.well[idx]) return ['Aether well', { text: 'One more aether each turn while your piece stands here.', dim: true }];
      return null;
    }
    const lines = [];
    if (p.side === YOU && p.name) {
      lines.push(fullName({ name: p.name, persona: p.perk }), PIECE_NAMES[p.type]);
      if (PERSONAS[p.perk]) lines.push({ text: PERSONAS[p.perk].perk, dim: true });
    } else lines.push((p.side === YOU ? 'Your ' : 'Enemy ') + PIECE_NAMES[p.type].toLowerCase());
    if (p.shield) lines.push('Shielded: the next capture against it fails');
    if (p.frozen > 0) lines.push('Frozen: cannot move this turn');
    if (p.queen) lines.push('Moves like a queen this turn');
    return lines;
  }

  cancel() {
    if (this.phase === 'casting') { this.casting = null; this.phase = 'player'; }
    if (this.selected >= 0 || this.arena.marks.spell.length) this.host.audio.play('deselect');
    this.selected = -1; this.targets = [];
    this.arena.mark({ selected: -1, targets: [], spell: [], zone: this.phase === 'deploy' ? this.zone : [] });
    this.refresh();
  }

  select(idx) {
    const b = this.battle;
    this.selected = idx;
    this.targets = this.phase === 'deploy' ? [] : b.movesFrom(idx);
    this.arena.mark({ selected: idx, targets: this.targets.map((t) => ({ idx: t, capture: !!b.cells[t] })) });
    this.host.audio.play('select');
    if (this.phase === 'player' && b.cells[idx].frozen > 0) this.host.toast('That piece is frozen');
  }

  async click(idx) {
    const b = this.battle, arena = this.arena, audio = this.host.audio;
    if (!b || idx < 0) { if (this.phase === 'player' || this.phase === 'casting' || this.phase === 'deploy') this.cancel(); return; }
    if (this.phase === 'deploy') {
      if (!this.zone.includes(idx)) { this.cancel(); return; }
      if (this.selected < 0) { if (b.cells[idx]) this.select(idx); return; }
      if (idx === this.selected) { this.cancel(); return; }
      const a = this.selected, pa = b.cells[a], pb = b.cells[idx];
      b.cells[a] = pb; b.cells[idx] = pa;
      this.selected = -1;
      arena.mark({ selected: -1 });
      this.phase = 'busy';
      audio.play('move');
      if (pb) await arena.exchange(arena.pieceAt(a), arena.pieceAt(idx)); else await arena.relocate(arena.pieceAt(a), idx);
      if (this.phase === 'busy') this.phase = 'deploy';
      return;
    }
    if (this.phase === 'casting') {
      const c = this.casting;
      if (!b.cardTargets(c.i, c.chosen).includes(idx)) { this.cancel(); return; }
      c.chosen.push(idx);
      const next = b.cardTargets(c.i, c.chosen);
      if (next === null) { this.cast(c.i, c.chosen); return; }
      if (!next.length) { this.cancel(); return; }
      audio.play('select');
      arena.mark({ spell: next, selected: c.chosen[0] });
      this.refresh();
      return;
    }
    if (this.phase !== 'player') return;
    if (this.selected >= 0 && this.targets.includes(idx)) {
      const from = this.selected;
      this.selected = -1; this.targets = [];
      this.phase = 'busy';
      arena.mark({ selected: -1, targets: [], hover: -1, last: [from, idx] });
      await this.play(b.playerMove(from, idx));
      this.after();
    } else if (b.cells[idx] && b.cells[idx].side === YOU) { if (idx === this.selected) this.cancel(); else this.select(idx); }
    else this.cancel();
  }

  cardClicked(i) {
    const b = this.battle;
    if (!b || (this.phase !== 'player' && this.phase !== 'casting') || i >= b.hand.length) return;
    if (this.casting && this.casting.i === i) { this.cancel(); return; }
    const c = CARDS[b.hand[i]];
    if (!b.canPlay(i)) {
      this.host.audio.play('illegal');
      this.host.toast(c.cost > b.aether ? 'Not enough aether' : 'Nothing to use that on');
      return;
    }
    if (!c.steps.length) { this.cast(i, []); return; }
    this.selected = -1; this.targets = [];
    this.casting = { i, chosen: [] };
    this.phase = 'casting';
    this.host.audio.play('select');
    this.arena.mark({ selected: -1, targets: [], spell: b.cardTargets(i, []) });
    this.refresh();
  }

  async cast(i, chosen) {
    this.casting = null;
    this.selected = -1; this.targets = [];
    this.phase = 'busy';
    this.arena.mark({ selected: -1, targets: [], spell: [], hover: -1 });
    await this.play(this.battle.playCard(i, chosen));
    this.after();
  }
}
