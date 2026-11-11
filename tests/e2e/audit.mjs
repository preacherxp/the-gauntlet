// A layout audit that runs inside the page. It returns a list of plain-English
// problems: text that spills out of its frame, runs off the screen or is too
// small to read; boxes that cut off what they hold; solid parts of the
// interface that overlap; and things to tap that are smaller than a finger.
// It must be self-contained: Playwright sends it to the page as source.

export function audit() {
  const W = window.innerWidth, H = window.innerHeight, out = [];
  const visible = (el) => {
    if (!el || el.closest('[hidden]')) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) {
      const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      parts.unshift(e.id ? '#' + e.id : e.tagName.toLowerCase() + cls);
    }
    return parts.join(' > ');
  };
  const scroller = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowX + ' ' + s.overflowY)) return e;
    }
    return null;
  };
  // The part of an element that can be seen: clipped by whatever scrolls it, and by the screen.
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    let b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let sp = scroller(el); sp; sp = scroller(sp)) {
      const s = sp.getBoundingClientRect();
      b = { l: Math.max(b.l, s.left), t: Math.max(b.t, s.top), r: Math.min(b.r, s.right), b: Math.min(b.b, s.bottom) };
    }
    return { l: Math.max(b.l, 0), t: Math.max(b.t, 0), r: Math.min(b.r, W), b: Math.min(b.b, H) };
  };
  const add = (kind, el, extra = '') => out.push(`${kind}: ${label(el)}${extra ? ' (' + extra + ')' : ''}`);
  const FRAME = 'button, .card, .person, .panel, .sheet, .toast, .bubble, #r-tip, #r-foe, #r-prompt, #r-run, #r-aether, .map-info, .act-row, .choice, .tcard, .price, .cost, .relic-gain, .stats > div, kbd';
  const UI = '#rogue, #title, .modal, #toasts';

  // 1. Every piece of text: inside its frame, on the screen, and big enough to read.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const text = n.textContent.trim();
    const el = n.parentElement;
    if (!text || !el || !el.closest(UI) || !visible(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5);
    const frame = el.closest(FRAME), fr = frame ? frame.getBoundingClientRect() : null;
    // A frame that scrolls (a long panel) may hold text below its fold; only its sides are hard edges.
    const frameScrolls = frame && /(auto|scroll)/.test(getComputedStyle(frame).overflowY);
    // Text inside something that scrolls may be scrolled out of view; that is not cut off.
    const scrolled = !!scroller(el);
    const quote = `"${text.slice(0, 36)}"`;
    for (const r of rects) {
      if (fr && (r.left < fr.left - 1 || r.right > fr.right + 1 || (!frameScrolls && (r.top < fr.top - 1 || r.bottom > fr.bottom + 1)))) { add('text spills out of its frame', el, quote); break; }
      if (!scrolled && (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1)) { add('text runs off the screen', el, quote); break; }
    }
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 20) add('text too small to read', el, `${size}px ${quote}`);
  }

  // 2. Boxes that hide part of what they hold, and pages that scroll sideways.
  for (const el of document.querySelectorAll('#rogue *, #title *, .modal *, #toasts *')) {
    if (el.closest('svg') || !visible(el)) continue;
    const s = getComputedStyle(el);
    if (/hidden|clip/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2) add('cuts off its content sideways', el, `${el.scrollWidth} in ${el.clientWidth}`);
    if (/hidden|clip/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2) add('cuts off its content at the bottom', el, `${el.scrollHeight} in ${el.clientHeight}`);
  }
  if (document.documentElement.scrollWidth > W + 1) out.push('the page scrolls sideways');

  // 3. Solid parts of the interface must not overlap each other, nor leave the screen.
  // Only what is on top is checked: a dialog covers everything, a screen between fights covers the fight.
  const SOLID = [...document.querySelectorAll('.modal')].some(visible) ? ['.sheet', '.toast']
    : visible(document.getElementById('title')) ? ['.tcard', '.toast']
      : visible(document.getElementById('r-screen')) ? ['#r-top .brand', '#r-run', '#r-top .menu', '#r-top nav:not(.open) button', '.panel', '.toast']
        : ['#r-top .brand', '#r-run', '#r-top .menu', '#r-top nav:not(.open) button', '#r-foe', '#r-prompt', '#r-aether', '#r-piles button', '#r-hand', '#r-hand .card', '.toast', '.bubble'];
  const solids = [];
  for (const sel of SOLID) for (const el of document.querySelectorAll(sel)) if (visible(el) && !solids.includes(el)) solids.push(el);
  // An open menu drops down over things on purpose; its buttons only need to stay on screen.
  for (const el of document.querySelectorAll('#r-top nav.open button')) if (visible(el)) {
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) add('off the screen', el);
  }
  for (let i = 0; i < solids.length; i++) {
    const a = seen(solids[i]);
    if (a.r - a.l < 1 || a.b - a.t < 1) continue;
    for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i], B = solids[j];
      if (A.contains(B) || B.contains(A)) continue;
      const b = seen(B);
      const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (w > 2 && h > 2) out.push(`overlap: ${label(A)} and ${label(B)} (${Math.round(w)}x${Math.round(h)})`);
    }
    if (scroller(solids[i])) continue;
    const r = solids[i].getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || (r.bottom > H + 1 && !solids[i].matches('.panel, .sheet'))) add('off the screen', solids[i], `${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`);
  }

  // 4. Things to tap must be big enough for a finger.
  for (const el of document.querySelectorAll('#rogue button, #title button, .modal button, #r-hand .card, .panel .card, .chart .node.live .hit, .checks label, input[type="range"]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect(), min = el.matches('input, label') ? 32 : 40;
    if (r.width < min - 0.5 || r.height < min - 0.5) add('too small to tap', el, `${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  // 5. In a fight, the board itself must be big enough to play on and not hidden under the interface.
  const g = window.aether && window.aether.gauntlet;
  if (g && g.battle && g.arena.root.visible && !visible(document.getElementById('r-screen')) && ![...document.querySelectorAll('.modal')].some(visible)) {
    const A = g.arena, cam = window.aether.stage.camera, cr = window.aether.stage.canvas.getBoundingClientRect();
    const V = A.world(0).constructor;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const [x, z] of [[-A.w / 2, -A.h / 2], [A.w / 2, -A.h / 2], [-A.w / 2, A.h / 2], [A.w / 2, A.h / 2]]) {
      const v = new V(x, 0, z).project(cam);
      const px = cr.left + (v.x + 1) / 2 * cr.width, py = cr.top + (1 - v.y) / 2 * cr.height;
      l = Math.min(l, px); r = Math.max(r, px); t = Math.min(t, py); b = Math.max(b, py);
    }
    const bw = r - l, bh = b - t, need = Math.min(260, W * 0.6);
    if (bw < need) out.push(`the board is too small to play on (${Math.round(bw)}px wide, needs ${Math.round(need)})`);
    if (l < -2 || r > W + 2 || t < -2 || b > H + 2) out.push('the board runs off the screen');
    // how much of it the fixed interface covers (prompts, toasts and speech come and go, so they do not count)
    let covered = 0;
    for (const el of document.querySelectorAll('#r-top .brand, #r-run, #r-top .menu, #r-top nav:not(.open), #r-foe, #r-bottom')) {
      if (!visible(el)) continue;
      const q = el.getBoundingClientRect();
      const w = Math.min(r, q.right) - Math.max(l, q.left), h = Math.min(b, q.bottom) - Math.max(t, q.top);
      if (w > 0 && h > 0) covered += w * h;
    }
    const share = covered / Math.max(1, bw * bh);
    if (share > 0.12) out.push(`the interface covers ${Math.round(share * 100)}% of the board`);
    // Every square must be there to tap: at its centre, nothing but the board (or something that
    // comes and goes: speech, a prompt, a toast, a tooltip) may be on top.
    const passing = '#r-bubbles, #toasts, #r-prompt, #r-tip, #r-top nav.open';   // an open menu drops over the board on purpose
    for (let i = 0; i < A.w * A.h; i++) {
      const v = A.world(i).setY(0.03).project(cam);
      const x = cr.left + (v.x + 1) / 2 * cr.width, y = cr.top + (1 - v.y) / 2 * cr.height;
      if (x < 0 || y < 0 || x > W || y > H) { out.push(`square ${i % A.w},${Math.floor(i / A.w)} is off the screen`); continue; }
      const top = document.elementFromPoint(x, y);
      if (top && top !== window.aether.stage.canvas && !top.closest(passing)) out.push(`square ${i % A.w},${Math.floor(i / A.w)} is under ${label(top)}`);
    }
  }
  return [...new Set(out)];
}
