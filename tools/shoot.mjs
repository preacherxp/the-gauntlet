// Drives the game in headless Chrome, plays it with real mouse clicks, and
// saves screenshots, plus frame sheets of every temper's move, attack and death.
//   node tools/shoot.mjs [out_dir] [--only=title,run,bosses,motion,misc]
// Exits 1 if the page logged an error or a check failed.

import puppeteer from 'puppeteer-core';
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { serve } from './serve.mjs';

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) || 'shots');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (name) => !only.length || only.includes(name);

async function findChrome() {
  const guesses = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const g of guesses) { if (!g) continue; try { await access(g); return g; } catch { /* next */ } }
  throw new Error('No Chrome found. Set CHROME to its path.');
}

await mkdir(outDir, { recursive: true });
const { server, port } = await serve(0);
const browser = await puppeteer.launch({
  executablePath: await findChrome(), headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1600,900'],
});
const problems = [];
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); else if (m.type() === 'warn') console.log('  warn:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => problems.push('page error: ' + e.message));
page.on('requestfailed', (r) => problems.push('request failed: ' + r.url()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await page.screenshot({ path: path.join(outDir, name + '.png') }); console.log('  saved', name + '.png'); };
const expect = (cond, text) => { if (!cond) { problems.push('check failed: ' + text); console.log('  FAILED:', text); } else console.log('  ok:', text); };
const g = (fn, ...a) => page.evaluate(fn, ...a);
const rstate = () => g(() => {
  const G = window.aether.gauntlet, b = G.battle, s = G.run ? G.run.s : null;
  return {
    phase: G.phase,
    run: s && { phase: s.phase, gold: s.gold, crowns: s.crowns, deck: s.deck.length, roster: s.roster.length, act: s.act, step: s.step, path: s.path.length },
    battle: b && { turn: b.turn, round: b.round, aether: b.aether, hand: [...b.hand], result: b.result, w: b.w, h: b.h },
  };
});
const until = (phase, timeout = 20000) => page.waitForFunction((p) => window.aether.gauntlet.phase === p && window.aether.tweens.items.length === 0, { timeout, polling: 80 }, phase);
const cellXY = (x, y, high = false) => g((cx, cy, hi) => {
  const { stage, gauntlet } = window.aether, A = gauntlet.arena;
  const idx = cy * A.w + cx, pc = A.pieceAt(idx);
  const v = A.world(idx).setY(pc && hi ? pc.height * 0.8 : 0.03).project(stage.camera);
  const r = stage.canvas.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}, x, y, high);
const tap = async (x, y, high = true) => { const p = await cellXY(x, y, high); await page.mouse.click(p.x, p.y); await sleep(90); };
const raf = () => g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

try {
  console.log('loading…');
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.aether && window.aether.ready, { timeout: 60000 });
  await g(() => { localStorage.removeItem('aether-chess.run.v1'); localStorage.removeItem('aether-chess.meta.v1'); });
  await sleep(1800);

  if (want('title')) {
    console.log('title');
    await shot('01_title');
    expect(await g(() => window.aether.gauntlet.arena.pieces.size === 18), 'the title shows twelve tempered pawns facing six enemies');
    await g(() => { document.getElementById('title').hidden = true; const S = window.aether.stage; S.setAutoRotate(false); S.flyTo({ theta: 0.25, phi: 1.12, radius: 6.2 }, 0.01); });
    await sleep(1200);
    await shot('02_lineup');
    await g(() => { const S = window.aether.stage; S.flyTo({ theta: Math.PI - 0.3, phi: 1.05, radius: 6.2 }, 0.01); });
    await sleep(1000);
    await shot('03_lineup_from_the_enemy_side');
    await g(() => { document.getElementById('title').hidden = false; window.aether.showTitle(); });
    await sleep(600);
  }

  if (want('run')) {
    console.log('a run, by mouse');
    await page.click('[data-act="title-new"]');
    await sleep(500);
    await shot('10_warbands');
    expect(await page.$$eval('#r-screen .choice.locked', (n) => n.length) === 2, 'two warbands start locked');
    await page.click('#r-screen .choice:not(.locked)');
    await sleep(600);
    let s = await rstate();
    expect(s.run && s.run.phase === 'path' && s.run.crowns === 3, 'a run begins on the map with three crowns');
    expect(await page.$$eval('#r-screen .chart .node', (n) => n.length) >= 11, 'the map shows the whole act');
    await shot('11_map_start');
    // choose a battle on the map: click its node, then March
    const live = await page.$$eval('#r-screen .chart .node.live', (n) => n.map((e) => e.getAttribute('class')));
    expect(live.length === 2 && live.every((c) => c.includes('battle')), 'the first step offers two battles');
    // even tempers for the checks below, so no perk changes the hand size or shields a pawn
    await g(() => { const G = window.aether.gauntlet; G.run.s.roster.forEach((p) => { if (p.type !== 6) p.persona = 'lucky'; }); });
    await page.click('#r-screen .chart .node.live');
    await sleep(250);
    await shot('12_map_choice');
    expect(await page.$eval('#r-screen .map-info .name', (e) => e.textContent.length > 2), 'choosing a node shows what waits there');
    await page.click('#r-screen .foot button.primary');
    await until('deploy');
    await sleep(500);
    await shot('13_deploy');
    s = await rstate();
    expect(s.run.path === 1, 'the step is marked on the map');
    const spot = await g(() => { const b = window.aether.gauntlet.battle; const i = b.cells.findIndex((p) => p && p.side === 0 && p.type === 4); return { x: i % b.w, y: Math.floor(i / b.w) }; });
    await tap(spot.x, spot.y); await tap(0, 0, false);
    await until('deploy');
    expect(await g(() => { const b = window.aether.gauntlet.battle; return !!b.cells[0] && b.cells[0].type === 4; }), 'clicking rearranges the army before the fight');
    await page.click('#r-piles button.primary');
    await until('player');
    s = await rstate();
    expect(s.battle.hand.length === 3 && s.battle.aether === 2, 'the fight opens with three cards and two aether');
    await sleep(900);
    await shot('14_battle');
    await g(() => { const b = window.aether.gauntlet.battle; b.hand[0] = 'aegis'; b.hand[1] = 'frost'; b.hand[2] = 'bolt'; b.aether = 4; window.aether.gauntlet.ui.handKey = null; window.aether.gauntlet.refresh(); });
    const pawn = await g(() => { const b = window.aether.gauntlet.battle; const i = b.cells.findIndex((p) => p && p.side === 0 && p.type === 1); return { x: i % b.w, y: Math.floor(i / b.w), name: b.cells[i].name }; });
    const hp = await cellXY(pawn.x, pawn.y, true);
    await page.mouse.move(hp.x, hp.y); await sleep(250);
    const tipText = await page.$eval('#r-tip', (e) => (e.hidden ? '' : e.textContent));
    expect(tipText.includes(pawn.name), `hovering a pawn shows who it is (${tipText.slice(0, 50)})`);
    await page.click('#r-hand .card:nth-child(1)');
    await sleep(200);
    expect((await rstate()).phase === 'casting', 'clicking a card that needs a target asks for one');
    await shot('15_casting');
    await tap(pawn.x, pawn.y);
    await until('player');
    expect(await g((x, y) => { const b = window.aether.gauntlet.battle; return b.cells[y * b.w + x].shield; }, pawn.x, pawn.y), 'Aegis shields the chosen pawn');
    const foes = await g(() => { const b = window.aether.gauntlet.battle; return b.cells.map((p, i) => (p && p.side === 1 && p.type === 1 ? { x: i % b.w, y: Math.floor(i / b.w) } : null)).filter(Boolean); });
    await page.click('#r-hand .card:nth-child(1)'); await sleep(200);
    await tap(foes[0].x, foes[0].y); await until('player');
    await page.click('#r-hand .card:nth-child(1)'); await sleep(200);
    await tap(foes[1].x, foes[1].y);
    await until('player');
    s = await rstate();
    expect(s.battle.hand.length === 0 && s.battle.aether === 0, 'three cards played, four aether spent');
    expect(await g(() => window.aether.gauntlet.battle.foeIdx((p) => p.type === 1).length) === 3, 'Bolt removed an enemy pawn');
    await tap(pawn.x, pawn.y); await sleep(200);
    await tap(pawn.x, pawn.y + 1, false);
    await page.waitForFunction(() => { const G = window.aether.gauntlet; return G.phase === 'player' && G.battle.round === 2; }, { timeout: 20000 });
    s = await rstate();
    expect(s.battle.round === 2 && s.battle.hand.length === 1, 'the enemy moved, and round two brings one card');
    await sleep(500);
    await shot('16_round_two');
    // end the fight with a win and take the reward
    await g(() => { const G = window.aether.gauntlet, b = G.battle; const k = b.foeIdx((p) => p.type === 6)[0]; G.phase = 'busy'; b.cells[k] = null; b.result = 'win'; G.finish(); });
    await page.waitForFunction(() => window.aether.gauntlet.run.s.phase === 'reward', { timeout: 15000 });
    await sleep(500);
    await shot('17_reward');
    expect((await rstate()).run.gold > 20, 'winning pays gold');
    await page.click('#r-screen .cards .card');
    await sleep(200);
    await page.click('#r-screen .foot button.primary');
    await sleep(500);
    s = await rstate();
    expect(s.run.deck === 9 && s.run.phase === 'path' && s.run.step === 1, 'the chosen card joins the deck and the road goes on');
    expect(await page.$$eval('#r-screen .chart .ln.taken', (n) => n.length) === 1, 'the map draws the road taken');
    await shot('18_map_after_one_step');
    // the merchant, the army roll, camp and an event: set up by hand
    await g(() => { const G = window.aether.gauntlet; G.run.s.options = [{ kind: 'shop' }]; G.run.s.gold = 400; G.ui.hud(G.run); G.screen(); });
    await sleep(200);
    await page.click('#r-screen .choice');
    await sleep(400);
    await shot('19_shop');
    const before = (await rstate()).run.roster;
    await page.click('#r-screen .people .pick');
    await sleep(250);
    expect((await rstate()).run.roster === before + 1, 'the merchant sells a recruit');
    await page.click('#r-top nav button:nth-child(2)');   // Army
    await sleep(300);
    await shot('20_army');
    expect(await page.$$eval('#r-screen .person .perk', (n) => n.length) >= 7, 'the army roll lists everyone with a perk');
    await page.click('#r-screen .foot button');
    await sleep(200);
    await page.click('#r-screen .foot button.primary');   // leave the shop
    await sleep(300);
    await g(() => { const G = window.aether.gauntlet; G.run.s.options = [{ kind: 'camp' }]; G.screen(); });
    await sleep(200);
    await page.click('#r-screen .choice');
    await sleep(300);
    await shot('21_camp');
    const knights = await g(() => window.aether.gauntlet.run.s.roster.filter((p) => p.type === 2).length);
    await page.click('#r-screen .choice:nth-child(2)');
    await sleep(300);
    expect(await g(() => window.aether.gauntlet.run.s.roster.filter((p) => p.type === 2).length) === knights + 1, 'training at camp makes a knight');
    await g(() => { const G = window.aether.gauntlet; G.run.s.options = [{ kind: 'event', event: 'gambler' }]; G.screen(); });
    await sleep(200);
    await page.click('#r-screen .choice');
    await sleep(300);
    await shot('22_event');
    await page.click('#r-screen .choice');
    await sleep(300);
    expect(await page.$eval('#r-screen .story', (e) => e.textContent.length > 5), 'an event choice tells you what happened');
    await page.click('#r-screen .foot button.primary');
    await sleep(400);
    await page.click('#r-top nav button:nth-child(1)');   // Map, read-only
    await sleep(300);
    await shot('23_map_midway');
    await page.click('#r-screen .foot button');
    await sleep(300);
  }

  if (want('bosses')) {
    console.log('the later acts');
    if (!(await g(() => !!window.aether.gauntlet.run))) { await g(() => window.aether.rogue('vanguard')); await sleep(600); }
    for (const [act, name] of [[1, '30_act2_boss'], [2, '31_act3_boss']]) {
      await g((a) => { const G = window.aether.gauntlet, s = G.run.s; s.act = a; s.step = 4; s.options = null; s.phase = 'path'; s.path.push({ act: a, step: 3, i: 0 }); G.enter(); }, act);
      await sleep(900);
      await shot(name + '_map');
      await page.click('#r-screen .chart .node.live');
      await sleep(200);
      await page.click('#r-screen .foot button.primary');
      await until('deploy');
      await page.click('#r-piles button.primary');
      await until('player');
      await sleep(1700);
      await shot(name);
    }
    expect((await rstate()).battle.h === 7, 'the last boss is fought on a taller board');
    await page.click('#r-piles button:not(.primary)');
    await page.waitForSelector('#dlg-confirm:not([hidden])', { timeout: 3000 });
    await sleep(200);
    await page.click('#dlg-confirm button[data-act="ok"]');
    await page.waitForFunction(() => !window.aether.gauntlet.battle, { timeout: 15000 });
    await sleep(400);
    expect((await rstate()).run.crowns === 2, 'retreating costs a crown');
    await shot('32_defeat');
    await page.click('#r-screen .foot button.primary');
    await sleep(400);
    await page.click('#r-top nav button:last-child');   // Leave
    await sleep(800);
    expect(await page.$eval('[data-act="title-run"]', (e) => !e.hidden), 'the title offers to continue the run');
    await page.click('[data-act="title-run"]');
    await sleep(800);
    const s = await rstate();
    expect(s.run && s.run.crowns === 2 && s.run.act === 2, 'and it resumes where it was');
    await g(() => window.aether.showTitle());
    await sleep(600);
  }

  if (want('motion')) {
    console.log('every temper: move, attack, death');
    const ids = ['bold', 'cautious', 'restless', 'sly', 'ambitious', 'stubborn', 'greedy', 'bookish', 'furious', 'lucky', 'gentle', 'loud', 'regal'];
    await g(() => { document.getElementById('title').hidden = true; window.aether.gauntlet.hide(); window.aether.gauntlet.active = true; window.aether.gauntlet.arena.show(true); });
    const TIMES = [0.1, 0.22, 0.4, 0.62, 0.9, 1.3];
    const sheets = { move: [], attack: [], die: [] };
    for (const perk of ids) {
      for (const kind of ['move', 'attack', 'die']) {
        // a small board: the piece at c2, an enemy pawn at d3 to take
        const center = await g(async (p, k) => {
          const { gauntlet, stage, tweens } = window.aether, A = gauntlet.arena;
          tweens.speed = 1; tweens.finishAll();
          const w = 5, h = 5, cells = new Array(w * h).fill(null);
          cells[1 * w + 2] = { id: 1, type: p === 'regal' ? 6 : 1, side: 0, perk: p, name: 'Sheet', shield: false, frozen: 0, queen: false };
          cells[2 * w + 3] = { id: 2, type: 1, side: 1, shield: false, frozen: 0, queen: false };
          await A.build({ w, h, cells, rock: new Uint8Array(w * h), well: new Uint8Array(w * h) }, { intro: false });
          stage.setAutoRotate(false);
          stage.flyTo({ theta: 0.55, phi: 0.98, radius: 7.2 }, 0.001);
          tweens.finishAll();
          stage.cameraBusy = true;            // hold the camera still while filming
          stage.camera.updateMatrixWorld();
          const target = k === 'move' ? A.world(2 * w + 2) : k === 'attack' ? A.world(2 * w + 3) : A.world(1 * w + 2);
          const mid = A.world(1 * w + 2).add(target).multiplyScalar(0.5).setY(0.55);
          const v = mid.project(stage.camera), r = stage.canvas.getBoundingClientRect();
          return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
        }, perk, kind);
        await raf();
        await g((k) => {
          const { gauntlet, tweens } = window.aether, A = gauntlet.arena, THREE_V = A.world(0).constructor;
          tweens.speed = 0;
          if (k === 'move') window.__anim = A.play([{ t: 'move', id: 1, from: 7, to: 12, style: 'move', victim: 0 }]);
          else if (k === 'attack') window.__anim = A.play([{ t: 'move', id: 1, from: 7, to: 13, style: 'move', victim: 2 }]);
          else window.__anim = A.kill(A.pieces.get(1), new THREE_V(0, 0, -1));
        }, kind);
        const frames = [];
        let t = 0;
        for (const at of TIMES) {
          await g((dt) => { const T = window.aether.tweens; T.speed = 1; for (let i = 0; i < Math.round(dt * 60); i++) T.update(1 / 60); T.speed = 0; }, at - t);
          t = at;
          await raf();
          frames.push(await page.screenshot({ clip: { x: center.x - 150, y: center.y - 200, width: 300, height: 320 }, encoding: 'base64' }));
        }
        await g(async () => { const T = window.aether.tweens; T.speed = 1; T.finishAll(); await window.__anim; });
        sheets[kind].push({ perk, frames });
      }
    }
    // lay each set out on one page and photograph it
    const sheetPage = await browser.newPage();
    for (const kind of ['move', 'attack', 'die']) {
      const label = { move: 'Move', attack: 'Attack', die: 'Death' }[kind];
      const rows = sheets[kind].map(({ perk, frames }) => `<tr><th>${perk}</th>${frames.map((f) => `<td><img src="data:image/png;base64,${f}"></td>`).join('')}</tr>`).join('');
      await sheetPage.setViewport({ width: 1180, height: 400 });
      await sheetPage.setContent(`<html><body style="margin:0;background:#0a090c;color:#e4dccd;font:14px Georgia,serif">
        <h1 style="font-weight:400;letter-spacing:.2em;margin:14px 18px">${label.toUpperCase()} · every temper · ${TIMES.map((x) => x + ' s').join(', ')}</h1>
        <table style="border-collapse:collapse">${rows}</table>
        <style>th{width:90px;text-align:right;padding-right:10px;text-transform:capitalize;font-weight:400}td{padding:2px;border:1px solid #3b342c}img{width:176px;height:190px;display:block}</style></body></html>`);
      await sheetPage.screenshot({ path: path.join(outDir, `40_${kind}_sheet.png`), fullPage: true });
      console.log(`  saved 40_${kind}_sheet.png`);
    }
    await sheetPage.close();
    expect(sheets.move.length === 13 && sheets.attack.length === 13 && sheets.die.length === 13, 'every temper was filmed moving, attacking and dying');
    await g(() => { window.aether.tweens.speed = 1; window.aether.stage.cameraBusy = false; window.aether.stage.syncControls(); document.getElementById('title').hidden = false; window.aether.showTitle(); });
    await sleep(500);
  }

  if (want('mobile')) {
    console.log('a phone, by touch');
    const mp = await browser.newPage();
    mp.on('pageerror', (e) => problems.push('phone page error: ' + e.message));
    mp.on('console', (m) => { if (m.type() === 'error') problems.push('phone console: ' + m.text()); });
    await mp.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: '' });
    await mp.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await mp.waitForFunction(() => window.aether && window.aether.ready, { timeout: 60000 });
    await mp.evaluate(() => { localStorage.removeItem('aether-chess.run.v1'); });
    await sleep(1500);
    const ms = (name) => mp.screenshot({ path: path.join(outDir, name + '.png') }).then(() => console.log('  saved', name + '.png'));
    const mUntil = (phase) => mp.waitForFunction((p) => window.aether.gauntlet.phase === p && window.aether.tweens.items.length === 0, { timeout: 20000, polling: 80 }, phase);
    const mCell = (x, y, high) => mp.evaluate((cx, cy, hi) => {
      const { stage, gauntlet } = window.aether, A = gauntlet.arena, idx = cy * A.w + cx, pc = A.pieceAt(idx);
      const v = A.world(idx).setY(pc && hi ? pc.height * 0.7 : 0.03).project(stage.camera), r = stage.canvas.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    }, x, y, high);
    const mTap = async (x, y, high = true) => { const p = await mCell(x, y, high); await mp.touchscreen.tap(p.x, p.y); await sleep(150); };
    await ms('70_phone_title');
    await mp.tap('[data-act="title-new"]');
    await sleep(500);
    await mp.tap('#r-screen .choice:not(.locked)');
    await sleep(600);
    await mp.evaluate(() => { window.aether.gauntlet.run.s.roster.forEach((p) => { if (p.type !== 6) p.persona = 'lucky'; }); });
    await ms('71_phone_map');
    await mp.tap('#r-screen .chart .node.live');
    await sleep(250);
    await mp.tap('#r-screen .foot button.primary');
    await mUntil('deploy');
    await sleep(400);
    await ms('72_phone_deploy');
    await mp.tap('#r-piles button.primary');
    await mUntil('player');
    await sleep(800);
    await ms('73_phone_battle');
    await mp.evaluate(() => { const G = window.aether.gauntlet, b = G.battle; b.hand = ['aegis', 'frost', 'insight']; b.aether = 4; G.ui.handKey = null; G.refresh(); });
    // a phone's cards show their whole description, so one tap plays the card
    expect(await mp.$eval('#r-hand .card:nth-child(1) .tx', (e) => e.getBoundingClientRect().bottom <= window.innerHeight && e.offsetHeight > 0),
      'phone: a card shows its description');
    await mp.tap('#r-hand .card:nth-child(1)');
    await sleep(250);
    expect((await mp.evaluate(() => window.aether.gauntlet.phase)) === 'casting', 'phone: a tap on a card plays it');
    await ms('74_phone_card_cast');
    const pawn = await mp.evaluate(() => { const b = window.aether.gauntlet.battle; const i = b.cells.findIndex((p) => p && p.side === 0 && p.type === 1); return { x: i % b.w, y: Math.floor(i / b.w) }; });
    await mTap(pawn.x, pawn.y);
    await mUntil('player');
    expect(await mp.evaluate((x, y) => { const b = window.aether.gauntlet.battle; return b.cells[y * b.w + x].shield; }, pawn.x, pawn.y), 'phone: tapping the target casts the card');
    // press and hold an enemy piece to read it
    const foe = await mp.evaluate(() => { const b = window.aether.gauntlet.battle; const i = b.cells.findIndex((p) => p && p.side === 1 && p.type === 6); return { x: i % b.w, y: Math.floor(i / b.w) }; });
    const fp = await mCell(foe.x, foe.y, true);
    await mp.touchscreen.touchStart(fp.x, fp.y);
    await sleep(650);
    const held = await mp.$eval('#r-tip', (e) => (e.hidden ? '' : e.textContent));
    await ms('75_phone_hold');
    await mp.touchscreen.touchEnd();
    expect(held.includes('king'), `phone: pressing and holding a piece says what it is (${held.slice(0, 30)})`);
    expect((await mp.evaluate(() => window.aether.gauntlet.battle.round)) === 1, 'phone: holding does not act');
    // tap a pawn, tap the square ahead
    await sleep(300);
    await mTap(pawn.x, pawn.y);
    expect((await mp.evaluate(() => window.aether.gauntlet.selected)) >= 0, 'phone: a tap selects a piece');
    await mTap(pawn.x, pawn.y + 1, false);
    await mp.waitForFunction(() => { const G = window.aether.gauntlet; return G.phase === 'player' && G.battle.round === 2; }, { timeout: 20000 });
    expect(true, 'phone: a tap on a square moves there, and the enemy answers');
    await sleep(600);
    await ms('76_phone_round_two');
    await mp.tap('#r-top .menu');
    await sleep(200);
    expect(await mp.$eval('#r-top nav', (e) => e.classList.contains('open')), 'phone: the menu button opens the menu');
    await ms('77_phone_menu');
    await mp.tap('#r-top nav button:nth-child(1)');
    await sleep(400);
    expect(await mp.$eval('#r-screen', (e) => !e.hidden), 'phone: the map opens from the menu');
    await ms('78_phone_map_in_fight');
    await mp.tap('#r-screen .foot button');
    await sleep(300);
    await mp.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: '' });
    await sleep(900);
    await ms('79_phone_sideways');
    const fits = await mp.evaluate(() => { const r = document.getElementById('r-hand').getBoundingClientRect(); return r.bottom <= window.innerHeight + 2 && r.top > 120; });
    expect(fits, 'phone sideways: the hand fits on screen, in a column beside the board');
    await mp.close();
  }

  if (want('misc')) {
    console.log('settings, phone, frame rate');
    await page.click('[data-act="title-settings"]');
    await sleep(300);
    await shot('50_settings');
    for (const q of ['low', 'medium', 'ultra', 'high']) {
      await page.click(`#dlg-settings [data-field="quality"] button[data-v="${q}"]`);
      await sleep(400);
    }
    await page.click('#dlg-settings button[data-act="ok"]');
    await sleep(300);
    await page.click('[data-act="title-help"]');
    await sleep(300);
    await shot('51_help');
    await page.click('#dlg-help button[data-act="ok"]');
    const sounds = await g(async () => {
      const a = window.aether.audio;
      a.init();
      for (const n of ['step', 'boing', 'pop', 'poof', 'thud', 'coins', 'pages', 'growl', 'boom', 'chime', 'shout', 'squash', 'squeak', 'slam', 'creak', 'sparkle', 'march',
        'card', 'draw', 'shield', 'shieldbreak', 'freeze', 'zap', 'summon', 'blink', 'rock', 'coin', 'heal', 'bark', 'capture', 'move', 'whoosh', 'promote', 'win', 'lose']) a.play(n);
      await new Promise((r) => setTimeout(r, 400));
      return a.ctx ? a.ctx.state : 'none';
    });
    expect(sounds === 'running', `every sound plays without error (audio ${sounds})`);
    await g(() => window.aether.rogue('vanguard'));
    await sleep(800);
    await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
    await sleep(700);
    await shot('52_phone_map');
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    await sleep(300);
    await page.click('#r-screen .chart .node.live');
    await sleep(150);
    await page.click('#r-screen .foot button.primary');
    await until('deploy');
    await page.click('#r-piles button.primary');
    await until('player');
    const fps = await g(() => new Promise((resolve) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(n / 2); };
      requestAnimationFrame(tick);
    }));
    console.log(`  frame rate in a fight at High, 1600x900: ${fps.toFixed(0)} fps`);
    expect(fps > 30, 'holds above 30 fps');
  }
} catch (err) {
  problems.push('script: ' + err.message);
  try { await shot('99_failure'); } catch { /* ignore */ }
}

await browser.close();
server.close();
if (problems.length) { console.log('\nPROBLEMS'); for (const p of problems) console.log(' -', p); process.exit(1); }
console.log('\nAll checks passed. Screenshots are in', outDir);
