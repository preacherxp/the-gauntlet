// Renderer, camera, orbit controls and post-processing.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ease } from './tween.js';
import { YOU as WHITE, KNIGHT } from '../rogue/rules.js';
import { pixelate } from './pixelui.js';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 1, bloom: false, shadows: 0, msaa: 0 },
  medium: { label: 'Medium', pixelRatio: 1.25, bloom: true, shadows: 1024, msaa: 0 },
  high: { label: 'High', pixelRatio: 2, bloom: true, shadows: 2048, msaa: 4 },
  ultra: { label: 'Ultra', pixelRatio: 3, bloom: true, shadows: 4096, msaa: 8 },
};

const TARGET = new THREE.Vector3(0, 0.2, 0);

export class Stage {
  constructor(canvas, tweens) {
    this.canvas = canvas;
    this.tweens = tweens;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
    this.camera.position.set(0, 12, 14);
    this.camera.lookAt(TARGET);
    this.insets = { right: 0, bottom: 0, top: 0 };
    this.width = 1; this.height = 1;
    this.quality = QUALITY.high;
    this.composer = null;
    this.bloom = null;
    this.bloomSettings = [0.6, 0.6, 0.9];
    this.shakeAmount = 0;
    this.shakeEnabled = true;
    this.cameraBusy = false;
    this.inputLock = false;
    this.controls = null;
    this.side = WHITE;
  }

  // Called after the game's own pointer handlers are attached, so those see a
  // press first and can keep the camera still while a piece is dragged.
  initControls() {
    const c = new OrbitControls(this.camera, this.canvas);
    c.target.copy(TARGET);
    c.enablePan = false;
    c.enableDamping = true; c.dampingFactor = 0.09;
    c.rotateSpeed = 0.55; c.zoomSpeed = 0.8;
    c.minPolarAngle = 0.02; c.maxPolarAngle = 1.46;
    c.minDistance = 6; c.maxDistance = 46;
    c.autoRotateSpeed = 0.9;
    this.controls = c;
  }

  syncControls() { if (this.controls) this.controls.enabled = !this.cameraBusy && !this.inputLock; }
  lockInput(v) { this.inputLock = v; this.syncControls(); }
  setAutoRotate(v) { if (this.controls) this.controls.autoRotate = v; }

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    r.shadowMap.enabled = q.shadows > 0;
    if (this.composer) { this.composer.dispose(); this.composer = null; this.bloom = null; }
    if (q.bloom) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
      this.composer = new EffectComposer(r, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), ...this.bloomSettings);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  setBloom(strength, radius, threshold) {
    this.bloomSettings = [strength, radius, threshold];
    if (this.bloom) { this.bloom.strength = strength; this.bloom.radius = radius; this.bloom.threshold = threshold; }
  }

  // `right` and `bottom`: pixels of the view covered by the interface, so the
  // board is centred in what is left.
  setInsets(right, bottom, top = 0) { this.insets = { right, bottom, top }; this.resize(); }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    // In a fight the picture is shifted so the board, as the camera actually sees it, sits in the
    // middle of the free space; elsewhere the middle of the board goes to the middle of that space.
    const f = this.board ? this.frame() : null;
    this.camera.setViewOffset(w, h, f ? f.x : this.insets.right / 2, f ? f.y : (this.insets.bottom - this.insets.top) / 2, w, h);
    this.camera.updateProjectionMatrix();
  }

  // For a fight (`this.board` = { w, h } squares): how far the camera must stand, at the tilt `phi`,
  // for the board to fill the free part of the view: its squares, a margin of its border, and the
  // pieces standing on its far row. Also returns the shift (x, y in pixels) that centres it there.
  // Perspective makes the near edge wider than the far one, so the corners are projected rather
  // than estimated.
  frame(phi = this.framePhi || 0.66) {
    const W = this.width, H = this.height, ins = this.insets;
    const fw = Math.max(120, W - ins.right), fh = Math.max(120, H - ins.bottom - ins.top);
    const hx = this.board.w / 2 + 0.5, hz = this.board.h / 2 + 0.5;   // half a square of border shows
    const cam = (this.fitCam = this.fitCam || new THREE.PerspectiveCamera());
    cam.fov = this.camera.fov; cam.aspect = W / H; cam.near = 0.1; cam.far = 2000;
    cam.clearViewOffset(); cam.updateProjectionMatrix();
    const s = new THREE.Spherical(), v = new THREE.Vector3();
    const box = (r) => {
      s.set(r, phi, 0); cam.position.setFromSpherical(s).add(TARGET); cam.lookAt(TARGET); cam.updateMatrixWorld();
      const b = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
      for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [0, 1.3]) {
        v.set(x, y, z).project(cam);
        const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H;
        b.l = Math.min(b.l, px); b.r = Math.max(b.r, px); b.t = Math.min(b.t, py); b.b = Math.max(b.b, py);
      }
      return b;
    };
    let r = 20, b;
    for (let i = 0; i < 10; i++) {
      b = box(r);
      const need = Math.max((b.r - b.l) / (fw * 0.97), (b.b - b.t) / (fh * 0.97));
      const next = THREE.MathUtils.clamp(r * need, 6, 44);
      if (Math.abs(next - r) < 0.01) break;
      r = next;
    }
    b = box(r);
    return { radius: r, x: (b.l + b.r) / 2 - fw / 2, y: (b.t + b.b) / 2 - (ins.top + fh / 2) };
  }

  // Distance at which the whole board fits the free part of the view.
  fitDistance() {
    if (this.board) return this.frame().radius;
    const w = Math.max(200, this.width - this.insets.right), h = Math.max(160, this.height - this.insets.bottom - this.insets.top);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const span = this.span || 8, k = span / 8;    // smaller boards let the camera come closer
    const byHeight = 5.3 * k / (tan * (h / this.height));
    // across, frame the squares and their border; the stone base may run off the sides of a narrow screen
    const byWidth = (span / 2 + 1.0) / (tan * this.camera.aspect * (w / this.width));
    return THREE.MathUtils.clamp(Math.max(byHeight, byWidth) * 1.02, 6, 44);
  }

  spherical() { return new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(TARGET)); }

  // Glide the camera to an orbit position. theta 0 looks from White's side.
  flyTo({ theta, phi, radius }, seconds = 1.1) {
    const from = this.spherical();
    const to = { theta: theta ?? from.theta, phi: phi ?? from.phi, radius: radius ?? from.radius };
    let d = to.theta - from.theta;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;   // shortest way round
    this.cameraBusy = true; this.syncControls();
    const s = new THREE.Spherical();
    const token = (this.flyToken = (this.flyToken || 0) + 1);
    return this.tweens.run(seconds, (k) => {
      if (token !== this.flyToken) return;
      s.set(from.radius + (to.radius - from.radius) * k, from.phi + (to.phi - from.phi) * k, from.theta + d * k);
      s.makeSafe();
      this.camera.position.setFromSpherical(s).add(TARGET);
      this.camera.lookAt(TARGET);
    }, ease.inOutCubic).then(() => {
      if (token === this.flyToken) { this.cameraBusy = false; this.syncControls(); }
    });
  }

  viewFrom(color, seconds = 1.1) {
    this.side = color;
    this.framePhi = 0.66; this.resize();
    return this.flyTo({ theta: color === WHITE ? 0 : Math.PI, phi: 0.66, radius: this.fitDistance() }, seconds);
  }

  topDown() {
    this.framePhi = 0.03; this.resize();
    return this.flyTo({ theta: this.side === WHITE ? 0 : Math.PI, phi: 0.03, radius: this.fitDistance() * 1.02 }, 0.9);
  }

  shake(amount) { if (this.shakeEnabled) this.shakeAmount = Math.max(this.shakeAmount, amount); }

  ndc(event) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
  }

  render(dt) {
    if (this.controls && !this.cameraBusy) this.controls.update(dt);
    let ox = 0, oy = 0;
    if (this.shakeAmount > 0.001) {
      ox = (Math.random() - 0.5) * this.shakeAmount; oy = (Math.random() - 0.5) * this.shakeAmount;
      this.camera.position.x += ox; this.camera.position.y += oy;
      this.shakeAmount *= Math.pow(0.002, dt);
    } else this.shakeAmount = 0;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.camera.position.x -= ox; this.camera.position.y -= oy;
  }

  // Small portraits of the twelve pieces, rendered from the same meshes and
  // materials the board uses. Returns { urls: { pieceCode: dataURL }, canvases }.
  renderIcons(makePiece, codes) {
    const size = 160, r = this.renderer;
    const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    const scene = new THREE.Scene();
    scene.environment = this.scene.environment;
    scene.environmentIntensity = 1.1;
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2, 4, 5);
    const fill = new THREE.DirectionalLight(0xbfd0ff, 1.2); fill.position.set(-4, 2, 2);
    scene.add(key, fill, new THREE.AmbientLight(0xffffff, 0.5));
    const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 50);
    const prev = { target: r.getRenderTarget(), color: r.getClearColor(new THREE.Color()), alpha: r.getClearAlpha() };
    const pixels = new Uint8Array(size * size * 4);
    const out = {}, canvases = {};
    r.setClearColor(0x000000, 0);
    for (const code of codes) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const p = makePiece(code & 7, code >> 3);
      if ((code & 7) === KNIGHT) p.group.rotation.y = ((code >> 3) === WHITE ? -1 : 1) * Math.PI / 2 + 0.5;
      scene.add(p.group);
      const span = Math.max(p.height, 0.95) * 1.12;
      const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(10)));
      cam.position.set(0, p.height * 0.5 + dist * 0.22, dist);
      cam.lookAt(0, p.height * 0.5, 0);
      r.setRenderTarget(target);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, 0, 0);
      // a pixel-art sprite to match the interface: 32 by 32, hard edges
      out[code] = pixelate(canvas, 32, 32, { levels: 10, dither: false }).toDataURL('image/png');
      canvases[code] = canvas;
      scene.remove(p.group);
    }
    r.setRenderTarget(prev.target);
    r.setClearColor(prev.color, prev.alpha);
    target.dispose();
    return { urls: out, canvases };
  }
}
