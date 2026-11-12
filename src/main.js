// Start-up and the frame loop: builds the renderer, the world and the
// Gauntlet, keeps the settings, and routes input to the game.

import * as THREE from 'three';
import { Tweens } from './gfx/tween.js';
import { Stage, QUALITY, LEVELS, guessQuality } from './gfx/stage.js';
import { Environment } from './gfx/environment.js';
import { Effects } from './gfx/fx.js';
import { TextureLibrary } from './gfx/textures.js';
import { THEMES } from './gfx/themes.js';
import { createPiece, pieceGeometries } from './gfx/pieces.js';
import { AudioEngine } from './audio.js';
import { Shell } from './ui.js';
import { Gauntlet } from './rogue/game.js';
import { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './rogue/rules.js';
import { ACTS } from './rogue/content.js';
import { installPixelKit } from './gfx/pixelui.js';
import { loadPixelFont } from './gfx/pixelfont.js';

// v3 brought the Auto quality and the frame-rate cap. Settings saved by v2 carry over. v2 saved
// "high" for everyone who never chose, so that one becomes Auto; any other level was a choice.
const SETTINGS_KEY = 'aether-chess.settings.v3', OLD_SETTINGS_KEY = 'aether-chess.settings.v2';
const DEFAULTS = { quality: 'auto', autoLevel: null, fps: 60, animSpeed: 1, sfx: 0.8, music: 0.45, muted: false, shake: true, particles: true };
const ALL_CODES = [0, 1].flatMap((c) => [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING].map((t) => t | (c << 3)));
const TITLE_THEME = 'marble';
const SCREEN_FRAME_MS = 50;      // behind a full-screen menu the world is dim: 20 frames a second will do

const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const load = () => {
  const now = read(SETTINGS_KEY);
  if (now) return { ...DEFAULTS, ...now };
  const { quality, ...old } = read(OLD_SETTINGS_KEY) || {};
  return { ...DEFAULTS, ...old, ...(quality && quality !== 'high' ? { quality } : {}) };
};
const store = (v) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const frame = () => new Promise((r) => requestAnimationFrame(r));

// A link with ?mute (or ?mute=1) plays with no sound at all: no audio is ever started, and the
// saved sound setting is left as it was. ?mute=0 or ?mute=false is the same as no ?mute.
const MUTE_PARAM = new URLSearchParams(location.search).get('mute');
const SILENT = MUTE_PARAM !== null && !/^(0|false|no|off)$/i.test(MUTE_PARAM);

const app = { settings: load(), themeNow: null, mats: null, level: 'high' };
const shell = new Shell();
const audio = new AudioEngine();
audio.disabled = SILENT;
const muted = () => SILENT || app.settings.muted;
const tweens = new Tweens();
let stage, env, fx, textures, gauntlet;

// The level actually drawn at: the one chosen, or on Auto the device's.
const levelFor = (s) => (s.quality === 'auto' ? (LEVELS.includes(s.autoLevel) ? s.autoLevel : guessQuality(stage.renderer)) : (QUALITY[s.quality] ? s.quality : 'high'));

// ------------------------------------------------------------------- worlds
// Materials and piece icons are made once per world (and per kind of ice), then kept: going back
// to a world reuses them, and its shaders, instead of building and compiling them again.
const matCache = new Map(), iconCache = new WeakMap();

function applyTheme(id) {
  const theme = THEMES[id] || THEMES[TITLE_THEME];
  app.themeNow = THEMES[id] ? id : TITLE_THEME;
  const glass = QUALITY[app.level].glass, key = app.themeNow + (glass ? ':glass' : '');
  if (!matCache.has(key)) matCache.set(key, theme.build(textures, { glass }));
  app.mats = matCache.get(key);
  env.setTheme(theme);
  stage.setBloom(...theme.bloom);
  stage.renderer.toneMappingExposure = theme.exposure;
  audio.setTheme(theme.music);
  if (gauntlet) gauntlet.setTheme(theme, app.mats);
  app.warm = true;               // compile what the new world needs before its first frame
}

// The twelve piece icons for the current world, drawn the first time a screen wants them.
function pieceIcons() {
  const mats = app.mats;
  if (!mats) return {};
  if (!iconCache.has(mats)) {
    try { iconCache.set(mats, stage.renderIcons((t, c) => createPiece(t, c, mats), ALL_CODES).urls); } catch (err) { console.warn('piece icons failed', err); iconCache.set(mats, {}); }
  }
  return iconCache.get(mats);
}

function applyQuality() {
  const was = app.level;
  app.level = levelFor(app.settings);
  const q = QUALITY[app.level];
  stage.setQuality(q);
  env.setShadowQuality(q.shadows);
  // shadows on or off change every lit shader, including those of worlds not showing now
  stage.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  for (const set of matCache.values()) for (const m of [set.white.body, set.white.trim, set.black.body, set.black.trim, set.tileLight, set.tileDark, set.frame, set.plinth]) m.needsUpdate = true;
  if (app.themeNow && QUALITY[was].glass !== q.glass) applyTheme(app.themeNow);    // the ice is made differently
  app.warm = true;
  watch.reset();
  const auto = document.querySelector('#dlg-settings [data-field="quality"] [data-v="auto"]');
  if (auto) auto.title = `Chosen for this device: ${q.label}`;
  layout();
}

function applySettings(changed) {
  const s = app.settings;
  store(s);
  if (!changed || changed === 'quality') applyQuality();
  tweens.speed = s.animSpeed > 0 ? s.animSpeed : Infinity;
  audio.setVolumes(s.sfx, s.music);
  audio.setMuted(muted());
  stage.shakeEnabled = s.shake;
  fx.enabled = s.particles;
  if (gauntlet) gauntlet.ui.setMuted(muted());
}

function layout() {
  // On the title the card sits on the left, so the board moves right.
  if (shell.titleShown && window.innerWidth > 900) stage.setInsets(-Math.min(660, window.innerWidth * 0.44), 0);
  else if (shell.titleShown) stage.setInsets(0, Math.min(window.innerHeight * 0.5, 330));
  else { const i = gauntlet ? gauntlet.inset() : { right: 0, bottom: 0, top: 0 }; stage.setInsets(i.right, i.bottom, i.top); }
  env.resize(stage.height, stage.renderer.getPixelRatio());
  fx.resize(stage.height, stage.renderer.getPixelRatio());
}

const openSettings = () => shell.settings(app.settings, (field, value) => {
  if (field === 'quality' && value === 'auto') app.settings.autoLevel = null;    // choosing Auto again guesses afresh
  applySettings(field);
});
const toggleMute = () => {
  if (SILENT) { shell.toast('Sound is off for this link. Remove ?mute from the address to hear it'); return; }
  app.settings.muted = !app.settings.muted; applySettings('muted');
};

// -------------------------------------------------------------------- title
function showTitle() {
  gauntlet.title();
  shell.showTitle(gauntlet.hasSave());
  layout();
}

function startRun(go) {
  audio.init();
  audio.startMusic();
  shell.hideTitle();
  go();
  layout();
}

// -------------------------------------------------------------------- input
function bindInput(canvas) {
  canvas.addEventListener('pointerdown', (e) => { audio.init(); if (!shell.titleShown) gauntlet.pointerDown(e); });
  canvas.addEventListener('pointermove', (e) => { if (!shell.titleShown) gauntlet.pointerMove(e); });
  // on the window, so a release outside the canvas still ends the gesture
  window.addEventListener('pointerup', (e) => { if (!shell.titleShown) gauntlet.pointerUp(e, false); });
  window.addEventListener('pointercancel', (e) => { if (!shell.titleShown) gauntlet.pointerUp(e, true); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (shell.modalOpen || e.target.matches('input, textarea')) return;
    if (e.key.toLowerCase() === 'm') { toggleMute(); return; }
    if (!shell.titleShown && gauntlet.key(e)) e.preventDefault();
  });
  window.addEventListener('resize', () => { layout(); gauntlet.refit(); });
  shell.on('click', () => { audio.init(); audio.play('click'); })
    .on('title-new', () => startRun(() => gauntlet.open()))
    .on('title-run', () => startRun(() => gauntlet.resume()))
    .on('title-help', () => shell.help())
    .on('title-settings', openSettings);
}

// --------------------------------------------------------------------- loop
// On Auto, watches how long frames really take, and steps the quality down
// when the device can't keep up. It never steps up, so it can't oscillate.
const watch = {
  gaps: [], skip: 90,
  reset() { this.gaps.length = 0; this.skip = 90; },        // ignore the frames right after a change
  check(gap, target) {
    if (app.settings.quality !== 'auto' || stage.holding || document.hidden) { this.reset(); return; }
    if (this.skip > 0) { this.skip--; return; }
    this.gaps.push(gap);
    if (this.gaps.length < 120) return;
    const median = [...this.gaps].sort((a, b) => a - b)[60];
    this.gaps.length = 0;
    const i = LEVELS.indexOf(app.level);
    if (median > Math.max(target, 1000 / 60) * 1.3 && i > 0) {
      app.settings.autoLevel = LEVELS[i - 1];
      store(app.settings);
      console.info(`frames take ${median.toFixed(1)} ms: graphics down to ${app.settings.autoLevel}`);
      applyQuality();
    }
  },
};

// Draws at most `fps` frames a second (0: as many as the screen shows). A frame
// is drawn once the next one would come later than the cap allows, so a 144 Hz
// screen capped at 60 draws 72, not 48.
function loop() {
  let lastDraw = performance.now(), lastTick = lastDraw, tickGap = 1000 / 60;
  const tick = (now) => {
    requestAnimationFrame(tick);
    tickGap += (Math.min(100, now - lastTick) - tickGap) * 0.1;
    lastTick = now;
    const screen = gauntlet.ui.screenOpen;
    const cap = screen ? SCREEN_FRAME_MS : app.settings.fps > 0 ? 1000 / app.settings.fps : 0;
    const since = now - lastDraw;
    if (cap && since + tickGap / 2 < cap) return;
    lastDraw = now;
    if (app.warm) { app.warm = false; stage.warm(); watch.reset(); }
    const dt = Math.min(0.05, Math.min(1000, since) / 1000);
    tweens.update(dt);
    gauntlet.update(dt);
    fx.update(dt);
    env.update(dt, stage.camera);
    stage.render(dt);
    if (screen) watch.reset(); else watch.check(since, cap);
  };
  requestAnimationFrame(tick);
}

async function boot() {
  await frame();
  installPixelKit();
  try { await loadPixelFont(); } catch (err) { console.warn('pixel font failed, using a fallback', err); }
  textures = new TextureLibrary();
  const canvas = document.getElementById('scene');
  stage = new Stage(canvas, tweens);
  fx = new Effects(stage.scene);
  env = new Environment(stage.scene, stage.renderer);
  const skyReady = env.prepare(stage.camera);     // compiles while the title's textures are painted
  pieceGeometries();
  shell.setLoading('Painting stone, wood and sky…');
  await frame();
  for (const name of THEMES[TITLE_THEME].textures) textures.get(name);
  await skyReady;
  app.level = levelFor(app.settings);
  stage.setQuality(QUALITY[app.level]);
  env.setShadowQuality(stage.quality.shadows);
  applyTheme(TITLE_THEME);
  gauntlet = new Gauntlet({
    stage, fx, tweens, audio, textures, root: document.getElementById('rogue'), layout,
    applyTheme: (id) => { if (app.themeNow !== id) applyTheme(id); },
    icons: pieceIcons,
    toast: (text, kind) => shell.toast(text, kind),
    confirm: (...a) => shell.confirm(...a),
    openSettings, toggleMute,
    muted,
    toTitle: showTitle,
    titleTheme: TITLE_THEME,
  });
  gauntlet.setTheme(THEMES[app.themeNow], app.mats);
  applySettings();
  bindInput(canvas);
  stage.initControls();
  stage.camera.position.setFromSpherical(new THREE.Spherical(14, 1.0, 0.6)).add(new THREE.Vector3(0, 0.2, 0));
  showTitle();
  // Compile the title's shaders off the main thread while the loading screen still shows.
  shell.setLoading('Lighting the lamps…');
  app.warm = false;
  await stage.warm(10);
  loop();
  await frame(); await frame();
  shell.hideLoading();
  // Paint the acts' textures, in order, in idle moments while the title shows.
  textures.prefetch(ACTS.flatMap((a) => THEMES[a.theme].textures));

  // A handle for automated checks and for poking at the game from the console.
  window.aether = {
    app, stage, fx, env, audio, tweens, THEMES, gauntlet, shell, showTitle, openSettings, applyTheme, applySettings,
    rogue: (warband = 'vanguard') => startRun(() => gauntlet.begin(warband)),
    ready: true,
  };
}

boot().catch((err) => {
  console.error(err);
  shell.setLoading('Could not start: ' + (err && err.message ? err.message : err));
});
