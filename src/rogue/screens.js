// The Gauntlet's HTML: the run bar, the hand of cards, speech bubbles, and the
// screens between fights (path, rewards, shop, camp, events, the army roll).
// It draws what the controller hands it and calls back on clicks.

import { CARDS } from './cards.js';
import { RELICS, PERSONAS, ENCOUNTERS, CHAR_TYPE, WARBANDS, ACTS, STEPS_PER_ACT, REMOVE_PRICE, HEAL_PRICE } from './content.js';
import { TRAITS } from './battle.js';
import { PIECE_NAMES, PAWN, BISHOP, KNIGHT, FOE, YOU } from './rules.js';
import { cardArt, badge, KIND_COLOR, mapTexture, MAP_GLYPH } from './glyphs.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  e.append(...kids.flat().filter(Boolean));
  return e;
};

const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'on') e.addEventListener('click', v);
    else if (k.startsWith('data-') || k === 'title' || k === 'style') e.setAttribute(k, v); else e[k] = v;
  }
  e.append(...kids.flat().filter((x) => x != null && x !== false));
  return e;
};
const KIND_LABEL = { battle: 'Battle', elite: 'Elite', boss: 'Boss', shop: 'Merchant', camp: 'Camp', event: 'Unknown' };
const KIND_HINT = {
  battle: 'Gold and a new card', elite: 'A harder fight. Gold, a card and a relic', boss: 'The end of the act',
  shop: 'Spend gold on cards, recruits and relics', camp: 'Heal, train a pawn or forget a card', event: 'Something on the road',
};
export const fullName = (p) => (PERSONAS[p.persona] && PERSONAS[p.persona].title ? `${p.name} ${PERSONAS[p.persona].title}` : p.name);

export class RogueUI {
  constructor(root, on) {
    this.root = root; this.on = on; this.icons = {};
    root.replaceChildren(
      h('header', { id: 'r-top' },
        h('div', { class: 'brand' }, h('span', { class: 'mark' }), h('span', { text: 'THE GAUNTLET' })),
        (this.runBox = h('div', { id: 'r-run' })),
        (this.relicBox = h('div', { id: 'r-relics' })),
        h('nav', {},
          (this.mapBtn = h('button', { text: 'Map', on: () => on.map() })),
          h('button', { text: 'Army', on: () => on.army() }), h('button', { text: 'Deck', on: () => on.deck() }),
          h('button', { text: 'Settings', on: () => on.settings() }), (this.muteBtn = h('button', { text: 'Sound on', on: () => on.mute() })),
          h('button', { text: 'Leave', title: 'Back to the title. The run is kept', on: () => on.leave() }))),
      (this.foeBox = h('aside', { id: 'r-foe', hidden: true })),
      (this.promptBox = h('div', { id: 'r-prompt', hidden: true })),
      (this.bottom = h('footer', { id: 'r-bottom', hidden: true },
        (this.aetherBox = h('div', { id: 'r-aether' })),
        (this.handBox = h('div', { id: 'r-hand' })),
        (this.pileBox = h('div', { id: 'r-piles' })))),
      (this.bubbles = h('div', { id: 'r-bubbles' })),
      (this.tipBox = h('div', { id: 'r-tip', hidden: true })),
      (this.screenBox = h('div', { id: 'r-screen', hidden: true })),
    );
  }

  setIcons(icons) { this.icons = icons; }
  setMuted(m) { this.muteBtn.textContent = m ? 'Sound off' : 'Sound on'; }
  icon(type, side, cls = '') { return h('img', { class: 'pc ' + cls, src: this.icons[type | (side << 3)] || '', alt: PIECE_NAMES[type] }); }

  // ------------------------------------------------------------------ run bar
  hud(run) {
    for (const b of this.root.querySelectorAll('#r-top nav button')) if (b.textContent === 'Map' || b.textContent === 'Army' || b.textContent === 'Deck') b.hidden = !run;
    if (!run) { this.runBox.replaceChildren(); this.relicBox.replaceChildren(); return; }
    const s = run.s, act = ACTS[Math.min(s.act, ACTS.length - 1)];
    const pips = [];
    for (let i = 0; i < STEPS_PER_ACT; i++) pips.push(h('i', { class: (i < s.step ? 'done ' : i === s.step ? 'here ' : '') + (i === STEPS_PER_ACT - 1 ? 'boss' : '') }));
    this.runBox.replaceChildren(
      h('span', { class: 'act', text: `Act ${Math.min(s.act, ACTS.length - 1) + 1} · ${act.name}` }),
      h('span', { class: 'track' }, pips),
      h('span', { class: 'crowns', title: 'Crowns. Lose a battle and you lose one. At none, the run ends' }, [0, 1, 2].map((i) => h('i', { class: i < s.crowns ? 'on' : '' }))),
      h('span', { class: 'gold', title: 'Gold' }, h('i'), String(s.gold)),
    );
    this.relicBox.replaceChildren(...s.relics.map((id) => h('img', { class: 'relic', src: badge(RELICS[id].glyph), title: `${RELICS[id].name}: ${RELICS[id].text}` })));
  }

  // ------------------------------------------------------------------- battle
  // view: { foe, turnText, prompt, aether, hand: [{ id, playable, active }], deck, discard, buttons: [{ label, act, primary, title }] }
  battle(view) {
    this.bottom.hidden = false; this.foeBox.hidden = false;
    this.foeBox.replaceChildren(
      h('div', { class: 'kind ' + view.foe.kind, text: KIND_LABEL[view.foe.kind] }),
      h('div', { class: 'name', text: view.foe.name }),
      ...view.foe.traits.map((t) => h('div', { class: 'trait' }, h('b', { text: TRAITS[t].name }), ' ' + TRAITS[t].text)),
      h('div', { class: 'turn', text: view.turnText }),
    );
    this.promptBox.hidden = !view.prompt;
    this.promptBox.textContent = view.prompt || '';
    const orbs = [];
    for (let i = 0; i < Math.max(view.aether, view.aetherMax); i++) orbs.push(h('i', { class: i < view.aether ? 'on' : '' }));
    this.aetherBox.replaceChildren(h('div', { class: 'orbs' }, orbs), h('div', { class: 'lbl', text: `${view.aether} aether` }));
    const key = view.hand.map((c) => c.id).join(',');
    if (key !== this.handKey) {
      this.handKey = key;
      this.handBox.replaceChildren(...view.hand.map((c, i) => this.card(c.id, { 'data-i': String(i), on: () => this.on.card(i) })));
    }
    [...this.handBox.children].forEach((node, i) => {
      node.classList.toggle('off', !view.hand[i].playable);
      node.classList.toggle('active', !!view.hand[i].active);
    });
    this.pileBox.replaceChildren(
      h('div', { class: 'counts' }, h('span', { title: 'Cards left to draw', text: `Draw ${view.deck}` }), h('span', { title: 'Cards played. They come back when the draw pile runs out', text: `Used ${view.discard}` })),
      ...view.buttons.map((b) => h('button', { class: b.primary ? 'primary' : '', text: b.label, title: b.title, on: () => this.on.button(b.act) })),
    );
  }

  hideBattle() { this.bottom.hidden = true; this.foeBox.hidden = true; this.promptBox.hidden = true; this.handKey = null; this.bubbles.replaceChildren(); this.hideTip(); }

  card(id, props = {}, price = null) {
    const c = CARDS[id];
    return h('div', { class: `card ${c.rarity}`, style: `--kind:${KIND_COLOR[c.kind]}`, ...props },
      h('span', { class: 'cost', text: String(c.cost) }),
      h('img', { class: 'art', src: cardArt(c), alt: '' }),
      h('div', { class: 'nm', text: c.name }),
      h('div', { class: 'tx', text: c.text }),
      price != null && h('div', { class: 'price' }, h('i'), String(price)),
    );
  }

  bubble(text, kind = '') {
    const b = h('div', { class: 'bubble ' + kind, text });
    this.bubbles.append(b);
    return b;
  }

  tip(lines, x, y) {
    this.tipBox.hidden = false;
    this.tipBox.replaceChildren(...lines.map((l, i) => h('div', { class: i === 0 ? 'hd' : l.dim ? 'dim' : '', text: l.text || l })));
    const w = this.tipBox.offsetWidth, hh = this.tipBox.offsetHeight;
    this.tipBox.style.left = Math.min(window.innerWidth - w - 8, x + 16) + 'px';
    this.tipBox.style.top = Math.max(8, y - hh - 12) + 'px';
  }
  hideTip() { this.tipBox.hidden = true; }

  // ------------------------------------------------------------------ screens
  screen(cls, title, sub, body, foot = []) {
    this.screenBox.hidden = false;
    this.screenBox.replaceChildren(h('div', { class: 'panel ' + cls },
      h('h2', { text: title }), sub && h('p', { class: 'sub', text: sub }),
      h('div', { class: 'body' }, body), foot.length ? h('div', { class: 'foot' }, foot) : null));
  }
  closeScreen() { this.screenBox.hidden = true; this.screenBox.replaceChildren(); }
  get screenOpen() { return !this.screenBox.hidden; }

  person(p, side = YOU, extra = null) {
    const per = PERSONAS[p.persona];
    const portrait = p.type === PAWN && this.personaIcons && this.personaIcons[p.persona];
    return h('div', { class: 'person' + (p.wounded ? ' hurt' : '') },
      portrait ? h('img', { class: 'pc', src: portrait, alt: 'Pawn' }) : this.icon(p.type, side),
      h('div', {},
        h('div', { class: 'who', text: fullName(p) }),
        h('div', { class: 'what', text: PIECE_NAMES[p.type] + (p.wounded ? ' · wounded, sits out the next battle' : '') }),
        per && h('div', { class: 'perk', text: per.perk })),
      extra);
  }

  warbands(unlocked, pick, back) {
    this.screen('wide', 'Choose your warband', 'Three acts, fifteen steps, three crowns. Your king must not fall.',
      h('div', { class: 'choices' }, Object.values(WARBANDS).map((w) => {
        const open = unlocked.includes(w.id);
        return h('button', { class: 'choice' + (open ? '' : ' locked'), disabled: !open, on: () => pick(w.id) },
          h('div', { class: 'kind', text: open ? 'Warband' : 'Locked' }),
          h('div', { class: 'name', text: w.name }),
          h('div', { class: 'row' }, w.pieces.map((t) => this.icon(t, YOU, 'sm'))),
          h('div', { class: 'hint', text: open ? w.text : `${w.unlock} to unlock.` }),
          h('div', { class: 'dim', text: `${w.deck.length} cards` + (w.relics.length ? ` · starts with ${w.relics.map((r) => RELICS[r].name).join(', ')}` : '') }));
      })),
      [h('button', { text: 'Back', on: back })]);
  }

  // What a road node holds, as a block of HTML.
  nodeInfo(o) {
    const e = o.enc ? ENCOUNTERS[o.enc] : null;
    return [
      h('div', { class: 'kind ' + o.kind, text: KIND_LABEL[o.kind] }),
      h('div', { class: 'name', text: e ? e.name : o.kind === 'shop' ? 'A travelling merchant' : o.kind === 'camp' ? 'A quiet clearing' : 'Something on the road' }),
      e && this.formation(e),
      e && h('div', { class: 'dim', text: `${e.w} × ${e.h} board` + ((e.rocks || []).length ? ' · rocks' : '') + ((e.wells || []).length ? ' · aether wells' : '') }),
      e && (e.traits || []).map((t) => h('div', { class: 'trait' }, h('b', { text: TRAITS[t].name }), ' ' + TRAITS[t].text)),
      h('div', { class: 'hint', text: KIND_HINT[o.kind] }),
    ];
  }

  // The act laid out as a chart. With `pick`, the nodes you can reach next are
  // live: choosing one shows what it holds, and "March" goes there.
  map(run, { pick = null, close = null, hover = null } = {}) {
    const st = run.s, actNo = Math.min(st.act, ACTS.length - 1), act = ACTS[actNo];
    const rows = run.map(actNo);
    const opts = pick ? run.options() : [];
    // Choices that are not on the chart (set up by hand): offer them as a plain list.
    if (pick && opts.some((o) => o.i === undefined)) { this.plainChoices(run, opts, pick); return; }
    const reach = new Set(opts.map((o) => o.i));
    const visited = new Map(st.path.filter((p) => p.act === actNo).map((p) => [p.step, p.i]));
    const here = run.position();
    const W = 560, H = 660, top = 100, bottom = 92;
    const rowY = (r) => H - bottom - r * ((H - top - bottom) / (STEPS_PER_ACT - 1));
    const pos = (r, i) => { const n = rows[r][i]; return [70 + (n.x + n.jx) * (W - 140), rowY(r) + n.jy * 30]; };
    const start = [W / 2, H - 34];

    const lines = [], nodes = [];
    const link = (a, b, cls) => {
      const mx = (a[0] + b[0]) / 2 + (a[1] - b[1]) * 0.08, my = (a[1] + b[1]) / 2;
      lines.push(s('path', { d: `M${a[0]} ${a[1]} Q${mx} ${my} ${b[0]} ${b[1]}`, class: 'ln ' + cls }));
    };
    rows[0].forEach((n, i) => link(start, pos(0, i), visited.get(0) === i ? 'taken' : !here && reach.has(i) ? 'open' : 'dim'));
    for (let r = 0; r < rows.length - 1; r++) {
      rows[r].forEach((n, i) => n.links.forEach((j) => {
        const taken = visited.get(r) === i && visited.get(r + 1) === j;
        const open = here && here.step === r && here.i === i && reach.has(j);
        link(pos(r, i), pos(r + 1, j), taken ? 'taken' : open ? 'open' : 'dim');
      }));
    }
    let chosen = null;
    const info = h('div', { class: 'map-info' });
    const go = h('button', { class: 'primary', text: 'March', disabled: true, on: () => { if (chosen != null) pick(opts.findIndex((o) => o.i === chosen)); } });
    const show = (r, i, live) => {
      const note = live ? [] : [h('div', { class: 'dim', text: visited.get(r) === i ? 'You passed this way.' : r < (here ? here.step + 1 : 0) ? 'The road went elsewhere.' : 'Not reachable from here.' })];
      info.replaceChildren(...this.nodeInfo(rows[r][i]).flat().filter(Boolean), ...note);
    };
    rows.forEach((row, r) => row.forEach((n, i) => {
      const [x, y] = pos(r, i);
      const live = !!pick && st.step === r && reach.has(i);
      const cls = ['node', n.kind, visited.get(r) === i ? 'visited' : '', live ? 'live' : '', here && here.step === r && here.i === i ? 'here' : '',
        !live && visited.get(r) !== i && (r < st.step || (here && r <= here.step)) ? 'past' : ''].join(' ');
      const size = n.kind === 'boss' ? 30 : 21;
      const g = s('g', { class: cls, transform: `translate(${x} ${y})`, 'data-step': r, 'data-i': i },
        live ? s('rect', { class: 'halo', x: -size - 7, y: -size - 7, width: (size + 7) * 2, height: (size + 7) * 2, transform: 'rotate(45)' }) : null,
        s('rect', { class: 'disc', x: -size, y: -size, width: size * 2, height: size * 2, transform: 'rotate(45)' }),
        s('path', { class: 'glyph', d: MAP_GLYPH[n.kind], transform: `translate(${-size * 0.62} ${-size * 0.62}) scale(${size * 0.0124})` }));
      g.addEventListener('mouseenter', () => { show(r, i, live); if (live && hover) hover(); });
      g.addEventListener('click', () => {
        show(r, i, live);
        if (!live) return;
        chosen = i;
        go.disabled = false;
        for (const el of svg.querySelectorAll('.node.sel')) el.classList.remove('sel');
        g.classList.add('sel');
      });
      nodes.push(g);
    }));
    // You are here: the king's portrait over your last node, or at the start.
    const at = here ? pos(here.step, here.i) : start;
    const king = s('image', { href: this.icons[6] || '', x: at[0] - 22, y: at[1] - 74, width: 44, height: 44, class: 'you' });
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' },
      s('image', { href: mapTexture(W, H), x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }),
      s('g', { class: 'start', transform: `translate(${start[0]} ${start[1]})` },
        s('path', { class: 'glyph', d: MAP_GLYPH.start, transform: 'translate(-12 -12) scale(0.24)' })),
      ...lines, ...nodes, king,
      s('text', { x: W / 2, y: 40, class: 'act-title' }, `ACT ${['I', 'II', 'III'][actNo]} · ${act.name.toUpperCase()}`));

    const acts = h('div', { class: 'acts' }, ACTS.map((a, i) => h('div', { class: 'act-row ' + (i < st.act ? 'done' : i === st.act ? 'now' : 'ahead') },
      h('span', { class: 'num', text: ['I', 'II', 'III'][i] }),
      h('span', { class: 'nm', text: i <= st.act ? a.name : 'Uncharted' }),
      h('span', { class: 'st', text: i < st.act ? 'Cleared' : i === st.act ? `Step ${Math.min(st.step + 1, STEPS_PER_ACT)} of ${STEPS_PER_ACT}` : '' }))));
    info.replaceChildren(h('div', { class: 'dim', text: pick ? 'Choose a lit square on the chart to see what waits there.' : 'Hover a square to see what it held or holds.' }));
    const side = h('div', { class: 'map-side' }, acts, h('p', { class: 'blurb', text: act.blurb }), info);
    const foot = [];
    if (pick) foot.push(go);
    if (close) foot.push(h('button', { text: 'Close', on: close }));
    this.screen('wide map', pick ? (st.step === STEPS_PER_ACT - 1 ? 'The way is barred' : 'Choose your road') : 'The road so far', null,
      h('div', { class: 'map-wrap' }, svg, side), foot);
  }

  // The old list of choices, for options that are not on the chart.
  plainChoices(run, options, pick) {
    const st = run.s, act = ACTS[st.act];
    this.screen('wide', 'Choose your road', `${act.name}, step ${st.step + 1} of ${STEPS_PER_ACT}.`,
      h('div', { class: 'choices' }, options.map((o, i) => h('button', { class: 'choice ' + o.kind, on: () => pick(i) }, ...this.nodeInfo(o)))));
  }

  formation(e) {
    return h('div', { class: 'formation', style: `grid-template-columns:repeat(${e.w},1fr)` },
      e.rows.flatMap((row) => [...row].map((ch) => h('i', {}, CHAR_TYPE[ch] ? this.icon(CHAR_TYPE[ch], FOE, 'sm') : null))));
  }

  // r: the reward from Run.finishBattle. Calls back as things are taken.
  reward(run, r, { card, recruit, done }) {
    const draw = () => {
      const body = [
        h('p', { class: 'gain' }, h('span', { class: 'gold' }, h('i'), `+${r.gold} gold`), r.flawless ? ' Nobody fell.' : '', r.loot ? ` (${r.loot} of it found by a magpie.)` : ''),
        ...r.notes.map((n) => h('p', { class: 'note', text: n })),
        r.wounded.length ? h('p', { class: 'note warn', text: `Wounded, and out of the next battle: ${r.wounded.join(', ')}.` }) : null,
        r.relic && h('div', { class: 'relic-gain' }, h('img', { src: badge(RELICS[r.relic].glyph) }), h('div', {}, h('b', { text: `Relic: ${RELICS[r.relic].name}` }), h('div', { text: RELICS[r.relic].text }))),
      ];
      if (r.recruits) {
        body.push(h('h3', { text: r.recruitTaken ? 'Recruit chosen' : 'Someone wants to join you. Choose one' }));
        if (!r.recruitTaken) body.push(h('div', { class: 'people' }, r.recruits.map((p, i) => h('button', { class: 'pick', on: () => { recruit(i); draw(); } }, this.person(p)))));
      }
      body.push(h('h3', { text: r.cardTaken ? 'Card chosen' : 'Add a card to your deck' }));
      if (!r.cardTaken) body.push(h('div', { class: 'cards' }, r.cards.map((id, i) => this.card(id, { on: () => { card(i); draw(); } }))));
      const waiting = !r.cardTaken || (r.recruits && !r.recruitTaken);
      this.screen('', 'Victory', null, body, [
        !r.cardTaken && h('button', { text: 'Take no card', on: () => { card(-1); draw(); } }),
        h('button', { class: 'primary', text: 'Onward', disabled: waiting, on: done }),
      ]);
    };
    draw();
  }

  shop(run, { buy, remove, leave }) {
    const draw = () => {
      const s = run.s, shop = s.shop, hurt = run.wounded().length;
      this.screen('wide', 'The merchant', `You have ${s.gold} gold.`, [
        h('h3', { text: 'Cards' }),
        h('div', { class: 'cards' }, shop.cards.map((c, i) => this.card(c.id, { class: `card ${CARDS[c.id].rarity}` + (c.sold ? ' sold' : s.gold < c.price ? ' off' : ''), on: () => { if (buy('card', i)) draw(); } }, c.sold ? 'sold' : c.price))),
        h('h3', { text: 'Recruits' }),
        h('div', { class: 'people' }, shop.pieces.map((p, i) => h('button', { class: 'pick' + (p.sold ? ' sold' : ''), disabled: p.sold || s.gold < p.price, on: () => { if (buy('piece', i)) draw(); } },
          this.person(p, YOU, h('div', { class: 'price' }, h('i'), p.sold ? 'hired' : String(p.price)))))),
        h('h3', { text: 'Relic and services' }),
        h('div', { class: 'people' },
          shop.relic && h('button', { class: 'pick' + (shop.relic.sold ? ' sold' : ''), disabled: shop.relic.sold || s.gold < shop.relic.price, on: () => { if (buy('relic')) draw(); } },
            h('div', { class: 'person' }, h('img', { class: 'pc', src: badge(RELICS[shop.relic.id].glyph) }), h('div', {}, h('div', { class: 'who', text: RELICS[shop.relic.id].name }), h('div', { class: 'perk', text: RELICS[shop.relic.id].text })),
              h('div', { class: 'price' }, h('i'), shop.relic.sold ? 'sold' : String(shop.relic.price)))),
          h('button', { class: 'pick', disabled: shop.removed || s.gold < REMOVE_PRICE || s.deck.length <= 4, on: () => remove(draw) },
            h('div', { class: 'person' }, h('div', {}, h('div', { class: 'who', text: 'Forget a card' }), h('div', { class: 'perk', text: 'Remove one card from your deck for good.' })), h('div', { class: 'price' }, h('i'), shop.removed ? 'done' : String(REMOVE_PRICE)))),
          h('button', { class: 'pick', disabled: !hurt || s.gold < hurt * HEAL_PRICE, on: () => { if (buy('heal')) draw(); } },
            h('div', { class: 'person' }, h('div', {}, h('div', { class: 'who', text: 'Tend the wounded' }), h('div', { class: 'perk', text: hurt ? `${hurt} wounded. They will fight in the next battle.` : 'Nobody is wounded.' })), h('div', { class: 'price' }, h('i'), String(hurt * HEAL_PRICE))))),
      ], [h('button', { class: 'primary', text: 'Leave', on: leave })]);
    };
    draw();
  }

  camp(run, { rest, train, forget }) {
    const s = run.s, hurt = run.wounded().length, pawn = run.hasPawn();
    const opt = (title, text, fn, ok = true) => h('button', { class: 'choice', disabled: !ok, on: fn }, h('div', { class: 'name', text: title }), h('div', { class: 'hint', text }));
    this.screen('wide', 'A quiet clearing', 'There is time for one thing.',
      h('div', { class: 'choices' },
        opt('Rest', (hurt ? `Heal ${hurt} wounded. ` : 'Nobody is wounded. ') + (s.crowns < 3 ? 'Restore a crown.' : 'Your crowns are whole.'), rest),
        opt('Train a knight', pawn ? 'One of your pawns becomes a knight for good.' : 'You have no pawn to train.', () => train(KNIGHT), pawn),
        opt('Train a bishop', pawn ? 'One of your pawns becomes a bishop for good.' : 'You have no pawn to train.', () => train(BISHOP), pawn),
        opt('Forget a card', s.deck.length > 4 ? 'Remove one card from your deck for good.' : 'Your deck is too small.', forget, s.deck.length > 4)));
  }

  event(ev, choices, choose) {
    this.screen('', ev.title, null, [h('p', { class: 'story', text: ev.text }),
      h('div', { class: 'choices col' }, choices.map((c, i) => h('button', { class: 'choice', disabled: !c.ok, on: () => choose(i) }, h('div', { class: 'name', text: c.label }), h('div', { class: 'hint', text: c.hint }))))]);
  }

  eventResult(ev, result, done) {
    this.screen('', ev.title, null, [
      h('p', { class: 'story', text: result.text }),
      result.card && h('div', { class: 'cards' }, this.card(result.card)),
      result.relic && h('div', { class: 'relic-gain' }, h('img', { src: badge(RELICS[result.relic].glyph) }), h('div', {}, h('b', { text: RELICS[result.relic].name }), h('div', { text: RELICS[result.relic].text }))),
    ], [h('button', { class: 'primary', text: 'Onward', on: done })]);
  }

  // The deck, either to look at or to pick one card from.
  deck(run, { pick = null, title = 'Your deck', close }) {
    const ids = run.s.deck.map((id, i) => [id, i]).sort((a, b) => CARDS[a[0]].cost - CARDS[b[0]].cost || CARDS[a[0]].name.localeCompare(CARDS[b[0]].name));
    this.screen('wide', title, `${ids.length} cards.` + (pick ? ' Choose one.' : ''),
      h('div', { class: 'cards wrap' }, ids.map(([id, i]) => this.card(id, pick ? { on: () => pick(i) } : {}))),
      [h('button', { text: pick ? 'Cancel' : 'Close', on: close })]);
  }

  army(run, close) {
    const s = run.s;
    this.screen('wide', 'Your army', `${s.roster.length} of 12. Those who fall in a won battle are wounded and miss the next one.`,
      [h('div', { class: 'people grid' }, s.roster.map((p) => this.person(p))),
        s.relics.length ? h('h3', { text: 'Relics' }) : null,
        h('div', { class: 'people grid' }, s.relics.map((id) => h('div', { class: 'person' }, h('img', { class: 'pc', src: badge(RELICS[id].glyph) }), h('div', {}, h('div', { class: 'who', text: RELICS[id].name }), h('div', { class: 'perk', text: RELICS[id].text })))))],
      [h('button', { text: 'Close', on: close })]);
  }

  // After a lost battle that did not end the run.
  defeat(text, done) {
    this.screen('', 'Defeat', null, [h('p', { class: 'story', text })], [h('button', { class: 'primary', text: 'Go on', on: done })]);
  }

  end(run, won, news, { again, title }) {
    const s = run.s, st = s.stats;
    this.screen('', won ? 'The Gauntlet is yours' : 'Your king has fallen', won ? 'All three acts, and the Mirror King with them.' : `The run ends in act ${Math.min(s.act, ACTS.length - 1) + 1}, at step ${s.step + 1}.`, [
      h('div', { class: 'stats' },
        h('div', {}, h('b', { text: String(st.wins) }), 'battles won'), h('div', {}, h('b', { text: String(st.captures) }), 'pieces taken'),
        h('div', {}, h('b', { text: String(st.flawless) }), 'without a loss'), h('div', {}, h('b', { text: String(s.gold) }), 'gold left')),
      ...news.map((id) => h('p', { class: 'note good', text: `Unlocked: ${WARBANDS[id].name}. ${WARBANDS[id].text}` })),
      h('h3', { text: 'Those who marched with you' }),
      h('div', { class: 'people grid' }, s.roster.map((p) => this.person(p))),
    ], [h('button', { text: 'Title', on: title }), h('button', { class: 'primary', text: 'New run', on: again })]);
  }
}
