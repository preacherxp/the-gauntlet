// Loads the generated pixel font in headless Chrome and renders a proof sheet.
//   node tests/font.check.mjs [out.png]

import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { serve } from '../tools/serve.mjs';

const out = path.resolve(process.argv[2] || 'shots/font_proof.png');
const { server, port } = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/package.json`);   // any page on the server, so module imports are same-origin
await page.setContent(`<html><body style="margin:20px;background:#0a090c;color:#e4dccd"></body></html>`);
const result = await page.evaluate(async (base) => {
  const { loadPixelFont, FONT_NAME } = await import(base + '/src/gfx/pixelfont.js');
  let face;
  try { face = await loadPixelFont(); } catch (e) { return { error: String(e && e.message || e) }; }
  const text = 'THE GAUNTLET  The quick brown fox jumps over the lazy dog. 0123456789 !?.,:;\'"()[]{}+-*/=<>#$%&@ \u00b7 \u00d7 \u2026 \u2019 \u2014 R\u00e9ti';
  for (const size of [10, 20, 30, 40]) {
    const p = document.createElement('div');
    p.style.cssText = `font: ${size}px "${FONT_NAME}"; margin: 8px 0; white-space: nowrap`;
    p.textContent = text;
    document.body.append(p);
  }
  const c = document.createElement('canvas').getContext('2d');
  c.font = `20px "${FONT_NAME}"`;
  const w1 = c.measureText('iiii').width, w2 = c.measureText('MMMM').width;
  return { status: face.status, check: document.fonts.check(`20px "${FONT_NAME}"`), iiii: w1, MMMM: w2 };
}, `http://127.0.0.1:${port}`);
await page.setViewport({ width: 1900, height: 260 });
await page.screenshot({ path: out });
console.log(JSON.stringify(result), errors.length ? 'errors: ' + errors.join(' | ') : '');
await browser.close();
server.close();
process.exit(result.error || errors.length || result.MMMM <= result.iiii ? 1 : 0);
