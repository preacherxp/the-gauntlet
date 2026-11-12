// A link with ?mute plays with no sound at all. Without it, the first tap
// starts the game's audio; with it, no audio is ever created, the menu says
// the sound is off, and the saved sound setting is left alone.

import { test, expect } from '@playwright/test';

// Counts every Web Audio context the page creates.
async function countAudio(page) {
  await page.addInitScript(() => {
    window.__audioContexts = 0;
    for (const name of ['AudioContext', 'webkitAudioContext']) {
      const Real = window[name];
      if (!Real) continue;
      window[name] = class extends Real { constructor(...a) { super(...a); window.__audioContexts++; } };
    }
  });
}

async function playABit(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.aether && window.aether.ready, null, { timeout: 90000 });
  await page.evaluate(() => { localStorage.removeItem('aether-chess.run.v1'); });
  await page.tap('[data-act="title-new"]');                     // the first tap would start the sound
  await page.tap('#r-screen .choice:not(.locked)');
  await page.waitForFunction(() => window.aether.gauntlet.run && window.aether.gauntlet.run.s.phase === 'path', null, { timeout: 40000 });
  await page.tap('#r-screen .chart .node.live .hit');
  await page.tap('#r-screen .foot button.primary');
  await page.waitForFunction(() => window.aether.gauntlet.phase === 'deploy', null, { timeout: 40000 });
  await page.waitForTimeout(500);
}

// Once in Chrome and once in WebKit is enough.
test.beforeEach(({}, info) => { test.skip(!['pixel-7', 'iphone-13'].includes(info.project.name), 'runs on one phone per browser engine'); });

// Playwright's WebKit on Windows has no Web Audio, so it can only show that ?mute stays silent.
const hasAudio = (page) => page.evaluate(() => !!(window.AudioContext || window.webkitAudioContext));

test('without ?mute the first tap starts the sound', async ({ page }) => {
  await countAudio(page);
  await page.goto('/');
  test.skip(!(await hasAudio(page)), 'this browser build has no Web Audio');
  await playABit(page, '/');
  expect(await page.evaluate(() => window.__audioContexts)).toBeGreaterThan(0);
});

test('?mute keeps the game silent', async ({ page }) => {
  await countAudio(page);
  await page.addInitScript(() => localStorage.setItem('aether-chess.settings.v3', JSON.stringify({ muted: false })));
  await playABit(page, '/?mute');
  expect(await page.evaluate(() => window.__audioContexts), 'no audio is ever created').toBe(0);
  // the menu says so, and pressing it explains why instead of turning the sound on
  if (await page.locator('#r-top .menu').isVisible()) await page.tap('#r-top .menu');
  const btn = page.locator('#r-top nav button', { hasText: /^Sound / });
  await expect(btn).toHaveText('Sound off');
  await btn.tap();
  await expect(page.locator('#toasts')).toContainText('?mute');
  expect(await page.evaluate(() => window.__audioContexts)).toBe(0);
  // the saved setting is untouched: the next visit without ?mute has sound
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aether-chess.settings.v3')).muted)).toBe(false);
});

test('?mute=0 is the same as no ?mute', async ({ page }) => {
  await countAudio(page);
  await page.goto('/');
  test.skip(!(await hasAudio(page)), 'this browser build has no Web Audio');
  await playABit(page, '/?mute=0');
  expect(await page.evaluate(() => window.__audioContexts)).toBeGreaterThan(0);
});
