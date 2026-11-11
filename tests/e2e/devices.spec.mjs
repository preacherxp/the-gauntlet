// Every screen of the game on every device in playwright.config.mjs: a
// screenshot of each, and the layout audit in audit.mjs, which must find
// nothing. A second test plays a fight by touch.

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { audit } from './audit.mjs';

const SHOTS = process.env.SHOTS || 'shots/devices';
const LONG_CARDS = ['leap', 'quickstep', 'meteor', 'knighting', 'recall'];   // the five longest descriptions

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.aether && window.aether.ready, null, { timeout: 90000 });
  await page.evaluate(() => { localStorage.removeItem('aether-chess.run.v1'); localStorage.removeItem('aether-chess.meta.v1'); });
  await page.waitForTimeout(800);
}
const phase = (page, p) => page.waitForFunction((x) => window.aether.gauntlet.phase === x && window.aether.tweens.items.length === 0, p, { timeout: 40000 });
const runPhase = (page, p) => page.waitForFunction((x) => window.aether.gauntlet.run && window.aether.gauntlet.run.s.phase === x, p, { timeout: 40000 });
const G = (page, fn, arg) => page.evaluate(fn, arg);

// Where a square of the board is on the screen.
const cell = (page, x, y, high = true) => page.evaluate(([cx, cy, hi]) => {
  const { stage, gauntlet } = window.aether, A = gauntlet.arena, idx = cy * A.w + cx, pc = A.pieceAt(idx);
  const v = A.world(idx).setY(pc && hi ? pc.height * 0.6 : 0.03).project(stage.camera), r = stage.canvas.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}, [x, y, high]);

class Sweep {
  constructor(page, info) { this.page = page; this.dir = path.join(SHOTS, info.project.name); this.problems = []; this.n = 0; }
  async check(name) {
    await this.page.waitForTimeout(300);
    for (const f of await this.page.evaluate(audit)) this.problems.push(`${name}: ${f}`);
    await this.page.screenshot({ path: path.join(this.dir, `${String(++this.n).padStart(2, '0')}_${name}.jpg`), type: 'jpeg', quality: 72 });
  }
}

// Starts a fight against `enc` from the road, by tapping, and waits until it is the player's turn.
async function fight(page, enc, kind = 'battle', act = 0) {
  await G(page, ([e, k, a]) => {
    const g = window.aether.gauntlet, s = g.run.s;
    s.act = a; s.phase = 'path'; s.options = [{ kind: k, enc: e }];
    g.enter();
  }, [enc, kind, act]);
  await page.waitForTimeout(400);
  await page.tap('#r-screen .choice');
  await phase(page, 'deploy');
  await page.tap('#r-piles button.primary');
  await phase(page, 'player');
}

test('every screen fits, with nothing cut off or overlapping', async ({ page }, info) => {
  const sweep = new Sweep(page, info);
  await boot(page);
  await sweep.check('title');
  await page.tap('[data-act="title-help"]');
  await sweep.check('help');
  await page.tap('#dlg-help button[data-act="ok"]');
  await page.tap('[data-act="title-settings"]');
  await sweep.check('settings');
  await page.tap('#dlg-settings button[data-act="ok"]');

  await page.tap('[data-act="title-new"]');
  await page.waitForTimeout(400);
  await sweep.check('warbands');
  await page.tap('#r-screen .choice:not(.locked)');
  await runPhase(page, 'path');
  await sweep.check('map');
  await page.tap('#r-screen .chart .node.live .hit');
  await sweep.check('map_choice');
  await page.tap('#r-screen .foot button.primary');
  await phase(page, 'deploy');
  await sweep.check('deploy');
  await page.tap('#r-piles button.primary');
  await phase(page, 'player');
  await sweep.check('fight');

  // a full hand of the wordiest cards
  await G(page, (cards) => { const g = window.aether.gauntlet, b = g.battle; b.hand = cards; b.aether = 9; g.ui.handKey = null; g.refresh(); }, LONG_CARDS);
  await sweep.check('fight_full_hand');
  await G(page, () => { const h = document.getElementById('r-hand'); h.scrollLeft = h.scrollWidth; h.scrollTop = h.scrollHeight; });
  await sweep.check('fight_hand_scrolled');
  await G(page, () => { const h = document.getElementById('r-hand'); h.scrollLeft = 0; h.scrollTop = 0; });
  await page.tap('#r-hand .card:nth-child(2)');                  // Quickstep asks for a piece
  await expect.poll(() => G(page, () => window.aether.gauntlet.phase)).toBe('casting');
  await sweep.check('casting');
  await G(page, () => window.aether.gauntlet.cancel());

  // speech: the enemy king (top of the board) and one of ours (bottom), both at once
  await G(page, () => {
    const g = window.aether.gauntlet, b = g.battle;
    const king = b.cells.find((p) => p && p.side === 1 && p.type === 6), mine = b.cells.find((p) => p && p.side === 0 && p.type === 1);
    g.say(king.id, 'I have already played this game. You lose, little king.', 'foe', 20000);
    g.say(mine.id, 'I found a coin this morning. A good sign, surely?', '', 20000, mine.name);
  });
  await page.waitForTimeout(200);
  await sweep.check('speech');
  await G(page, () => window.aether.gauntlet.clearTalk());
  await G(page, () => { const g = window.aether.gauntlet, b = g.battle, i = b.cells.findIndex((p) => p && p.side === 1); g.ui.tip(g.describe(i), window.innerWidth - 10, 80); });
  await sweep.check('tooltip_at_the_edge');
  await G(page, () => window.aether.gauntlet.ui.hideTip());
  await G(page, () => window.aether.shell.toast('No move to make: your turn passes to the enemy'));
  await sweep.check('toast');
  await page.waitForTimeout(2600);
  if (await page.locator('#r-top .menu').isVisible()) {
    await page.tap('#r-top .menu');
    await sweep.check('menu_open');
    await page.tap('#r-top .menu');
  }
  await page.tap('#r-foe');
  await sweep.check('foe_panel_open');
  await page.tap('#r-foe');

  // the screens between fights
  await G(page, () => { const g = window.aether.gauntlet, b = g.battle; g.phase = 'busy'; b.cells[b.cells.findIndex((p) => p && p.side === 1 && p.type === 6)] = null; b.result = 'win'; g.finish(); });
  await runPhase(page, 'reward');
  await page.waitForTimeout(300);
  await sweep.check('reward');
  await page.tap('#r-screen .cards .card');
  await page.tap('#r-screen .foot button.primary');
  await runPhase(page, 'path');
  await sweep.check('map_after_a_step');
  await G(page, () => { const g = window.aether.gauntlet; g.run.s.options = [{ kind: 'shop' }]; g.run.s.gold = 500; g.ui.hud(g.run); g.screen(); });
  await page.tap('#r-screen .choice');
  await sweep.check('shop');
  await G(page, () => { const p = document.querySelector('#r-screen .panel'); p.scrollTop = p.scrollHeight; });
  await sweep.check('shop_scrolled');
  await page.tap('#r-screen .people .pick');
  await G(page, () => window.aether.gauntlet.ui.army(window.aether.gauntlet.run, () => window.aether.gauntlet.screen()));
  await sweep.check('army');
  await G(page, () => window.aether.gauntlet.ui.deck(window.aether.gauntlet.run, { close: () => window.aether.gauntlet.screen() }));
  await sweep.check('deck');
  await G(page, () => { const g = window.aether.gauntlet; g.run.advance(); g.run.s.options = [{ kind: 'camp' }]; g.enter(); });
  await page.tap('#r-screen .choice');
  await sweep.check('camp');
  await page.tap('#r-screen .choice');
  await G(page, () => { const g = window.aether.gauntlet; g.run.s.options = [{ kind: 'event', event: 'deserters' }]; g.run.s.gold = 100; g.run.s.crowns = 3; g.enter(); });
  await page.tap('#r-screen .choice');
  await sweep.check('event');
  await page.tap('#r-screen .choice');
  await sweep.check('event_result');
  await page.tap('#r-screen .foot button.primary');

  // a boss fight on the tall board, then a retreat
  await fight(page, 'mirrorking', 'boss', 2);
  await sweep.check('boss_fight');
  await page.locator('#r-piles button', { hasText: 'Retreat' }).tap();
  await page.waitForSelector('#dlg-confirm:not([hidden])');
  await sweep.check('retreat_confirm');
  await page.tap('#dlg-confirm button[data-act="ok"]');
  await page.waitForFunction(() => !window.aether.gauntlet.battle, null, { timeout: 30000 });
  await sweep.check('defeat');
  await G(page, () => { const g = window.aether.gauntlet; g.run.s.crowns = 0; g.run.s.phase = 'over'; g.enter(); });
  await page.waitForTimeout(400);
  await sweep.check('run_over');

  expect(sweep.problems, 'layout problems:\n' + sweep.problems.join('\n')).toEqual([]);
});

test('a fight can be played by touch', async ({ page, browserName }, info) => {
  await boot(page);
  await page.tap('[data-act="title-new"]');
  await page.tap('#r-screen .choice:not(.locked)');
  await runPhase(page, 'path');
  await G(page, () => window.aether.gauntlet.run.s.roster.forEach((p) => { if (p.type !== 6) p.persona = 'lucky'; }));
  await page.tap('#r-screen .chart .node.live .hit');
  await page.tap('#r-screen .foot button.primary');
  await phase(page, 'deploy');
  await page.tap('#r-piles button.primary');
  await phase(page, 'player');

  // a card that needs a target: tap the card, then tap the piece
  await G(page, () => { const g = window.aether.gauntlet, b = g.battle; b.hand = ['aegis', 'frost', 'insight', 'bolt', 'leap']; b.aether = 9; g.ui.handKey = null; g.refresh(); });
  await page.tap('#r-hand .card:nth-child(1)');
  await expect.poll(() => G(page, () => window.aether.gauntlet.phase), { message: 'tapping a card starts it' }).toBe('casting');
  const pawn = await G(page, () => { const b = window.aether.gauntlet.battle, i = b.cells.findIndex((p) => p && p.side === 0 && p.type === 1); return { x: i % b.w, y: Math.floor(i / b.w) }; });
  let at = await cell(page, pawn.x, pawn.y);
  await page.touchscreen.tap(at.x, at.y);
  await expect.poll(() => G(page, ([x, y]) => { const b = window.aether.gauntlet.battle; return !!b.cells[y * b.w + x].shield; }, [pawn.x, pawn.y]), { message: 'tapping the piece casts the card' }).toBe(true);
  await phase(page, 'player');

  // the last card is reachable: scroll the hand and tap it
  const last = page.locator('#r-hand .card').last();
  await last.scrollIntoViewIfNeeded();
  const box = await last.boundingBox(), vp = page.viewportSize();
  expect(box.x >= -1 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1, 'the last card can be scrolled fully into view').toBe(true);
  await last.tap();
  await expect.poll(() => G(page, () => window.aether.gauntlet.phase)).toBe('casting');
  await G(page, () => window.aether.gauntlet.cancel());

  // tap a pawn, then the square in front of it
  at = await cell(page, pawn.x, pawn.y);
  await page.touchscreen.tap(at.x, at.y);
  await expect.poll(() => G(page, () => window.aether.gauntlet.selected), { message: 'a tap selects a piece' }).toBeGreaterThanOrEqual(0);
  const ahead = await cell(page, pawn.x, pawn.y + 1, false);
  await page.touchscreen.tap(ahead.x, ahead.y);
  await page.waitForFunction(() => { const g = window.aether.gauntlet; return g.phase === 'player' && g.battle.round === 2; }, null, { timeout: 40000 });

  // pressing and holding a piece reads it (Chrome only: Playwright has no long press for WebKit)
  if (browserName === 'chromium') {
    const foe = await G(page, () => { const b = window.aether.gauntlet.battle, i = b.cells.findIndex((p) => p && p.side === 1 && p.type === 6); return { x: i % b.w, y: Math.floor(i / b.w) }; });
    const p = await cell(page, foe.x, foe.y);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await page.waitForTimeout(700);
    const tip = await page.locator('#r-tip').textContent();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(tip, 'holding a piece shows what it is').toContain('king');
    expect(await G(page, () => window.aether.gauntlet.battle.round), 'holding does not act').toBe(2);
  }
  await page.screenshot({ path: path.join(SHOTS, info.project.name, '99_after_touch_fight.jpg'), type: 'jpeg', quality: 72 });
});
