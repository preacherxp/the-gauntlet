// Start-up and the frame loop: builds the renderer, the world and the
// Gauntlet, keeps the settings, and routes input to the game.

import * as THREE from 'three';
import { Tweens } from './gfx/tween.js';
import { Stage, QUALITY } from './gfx/stage.js';
import { Environment } from './gfx/environment.js';
import { Effects } from './gfx/fx.js';
import { TextureLibrary } from './gfx/textures.js';
import { THEMES, disposeMaterials } from './gfx/themes.js';
import { createPiece, pieceGeometries } from './gfx/pieces.js';
import { AudioEngine } from './audio.js';
import { Shell } from './ui.js';
import { Gauntlet } from './rogue/game.js';
import { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './rogue/rules.js';
import { installPixelKit } from './gfx/pixelui.js';
import { loadPixelFont } from './gfx/pixelfont.js';

const SETTINGS_KEY = 'aether-chess.settings.v2';
const DEFAULTS = { quality: 'high', animSpeed: 1, sfx: 0.8, music: 0.45, muted: false, shake: true, particles: true };
const ALL_CODES = [0, 1].flatMap((c) => [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING].map((t) => t | (c << 3)));
const TITLE_THEME = 'marble';

const load = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULTS }; } };
const store = (v) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const frame = () => new Promise((r) => requestAnimationFrame(r));

const app = { settings: load(), themeNow: null, mats: null, icons: {} };
const shell = new Shell();
const audio = new AudioEngine();
const tweens = new Tweens();
let stage, env, fx, textures, gauntlet;

// ------------------------------------------------------------------- worlds
function applyTheme(id) {
  const theme = THEMES[id] || THEMES[TITLE_THEME];
  app.themeNow = THEMES[id] ? id : TITLE_THEME;
  const old = app.mats;
  app.mats = theme.build(textures);
  env.setTheme(theme);
  stage.setBloom(...theme.bloom);
  stage.renderer.toneMappingExposure = theme.exposure;
  audio.setTheme(theme.music);
  try { app.icons = stage.renderIcons((t, c) => createPiece(t, c, app.mats), ALL_CODES).urls; } catch (err) { console.warn('piece icons failed', err); }
  if (gauntlet) gauntlet.setTheme(theme, app.mats);
  disposeMaterials(old);
}

function applySettings(changed) {
  const s = app.settings;
  store(s);
  if (!changed || changed === 'quality') {
    const q = QUALITY[s.quality] || QUALITY.high;
    stage.setQuality(q);
    env.setShadowQuality(q.shadows);
    stage.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    layout();
  }
  tweens.speed = s.animSpeed > 0 ? s.animSpeed : Infinity;
  audio.setVolumes(s.sfx, s.music);
  audio.setMuted(s.muted);
  stage.shakeEnabled = s.shake;
  fx.enabled = s.particles;
  if (gauntlet) gauntlet.ui.setMuted(s.muted);
}

function layout() {
  // On the title the card sits on the left, so the board moves right.
  if (shell.titleShown && window.innerWidth > 900) stage.setInsets(-Math.min(660, window.innerWidth * 0.44), 0);
  else if (shell.titleShown) stage.setInsets(0, Math.min(window.innerHeight * 0.5, 330));
  else { const i = gauntlet ? gauntlet.inset() : { right: 0, bottom: 0, top: 0 }; stage.setInsets(i.right, i.bottom, i.top); }
  env.resize(stage.height, stage.renderer.getPixelRatio());
  fx.resize(stage.height, stage.renderer.getPixelRatio());
}

const openSettings = () => shell.settings(app.settings, (field) => applySettings(field));
const toggleMute = () => { app.settings.muted = !app.settings.muted; applySettings('muted'); };

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
function loop(last) {
  requestAnimationFrame((now) => {
    const dt = Math.min(0.05, Math.min(1000, now - last) / 1000);
    tweens.update(dt);
    gauntlet.update(dt);
    fx.update(dt);
    env.update(dt, stage.camera);
    stage.render(dt);
    loop(now);
  });
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
  pieceGeometries();
  shell.setLoading('Painting stone, wood and sky…');
  await frame();
  stage.setQuality(QUALITY[app.settings.quality] || QUALITY.high);
  env.setShadowQuality(stage.quality.shadows);
  applyTheme(TITLE_THEME);
  gauntlet = new Gauntlet({
    stage, fx, tweens, audio, textures, root: document.getElementById('rogue'), layout,
    applyTheme: (id) => { if (app.themeNow !== id) applyTheme(id); },
    icons: () => app.icons,
    toast: (text, kind) => shell.toast(text, kind),
    confirm: (...a) => shell.confirm(...a),
    openSettings, toggleMute,
    muted: () => app.settings.muted,
    toTitle: showTitle,
    titleTheme: TITLE_THEME,
  });
  gauntlet.setTheme(THEMES[app.themeNow], app.mats);
  applySettings();
  bindInput(canvas);
  stage.initControls();
  stage.camera.position.setFromSpherical(new THREE.Spherical(14, 1.0, 0.6)).add(new THREE.Vector3(0, 0.2, 0));
  showTitle();
  loop(performance.now());
  await frame(); await frame();
  shell.hideLoading();

  // A handle for automated checks and for poking at the game from the console.
  window.aether = {
    app, stage, fx, env, audio, tweens, THEMES, gauntlet, shell, showTitle, openSettings,
    rogue: (warband = 'vanguard') => startRun(() => gauntlet.begin(warband)),
    ready: true,
  };
}

boot().catch((err) => {
  console.error(err);
  shell.setLoading('Could not start: ' + (err && err.message ? err.message : err));
});
