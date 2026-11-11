// Effects: sparks, the shards a captured piece breaks into, shockwave rings,
// the promotion beam, a flash light and fireworks.

import * as THREE from 'three';

const SPARK_VERT = /* glsl */`
attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
uniform float uScale;
varying vec3 vColor; varying float vAlpha;
void main() {
  vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor * a * a * vAlpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const MAX = 3200;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;

    // --- sparks: one Points object, updated on the CPU
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.span = new Float32Array(MAX);
    this.grav = new Float32Array(MAX); this.drag = new Float32Array(MAX); this.base = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.sparkUniforms = { uScale: { value: 900 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.sparkUniforms, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    // --- shards
    this.shardGeo = [new THREE.TetrahedronGeometry(0.11), new THREE.OctahedronGeometry(0.09), new THREE.BoxGeometry(0.12, 0.08, 0.1)];
    this.shards = [];

    // --- shockwave rings
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);

    // --- beam and flash
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 9, 24, 1, true).translate(0, 4.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.visible = false;
    this.beamLife = 0;
    scene.add(this.beam);
    this.flash = new THREE.PointLight(0xffffff, 0, 9, 2);
    scene.add(this.flash);

    this.fireworks = 0;      // seconds of show left
    this.fireworkTimer = 0;
    this.palette = [0xffffff];
    this.onFirework = null;
  }

  resize(heightPx, pixelRatio) { this.sparkUniforms.uScale.value = heightPx * pixelRatio * 1.3; }

  spark(x, y, z, vx, vy, vz, hex, size, life, gravity = 4, drag = 1.2) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const k = 2.6;   // well above 1 so the bloom picks sparks up
    this.col[i * 3] = ((hex >> 16) & 255) / 255 * k; this.col[i * 3 + 1] = ((hex >> 8) & 255) / 255 * k; this.col[i * 3 + 2] = (hex & 255) / 255 * k;
    this.base[i] = size; this.life[i] = life; this.span[i] = life; this.grav[i] = gravity; this.drag[i] = drag;
  }

  burst(at, colors, { count = 60, speed = 3, up = 2, size = 0.16, life = 0.9, gravity = 5, spread = 0.1, sphere = false } = {}) {
    if (!this.enabled) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spark(
        at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread,
        r * Math.cos(a) * s, (sphere ? u : Math.abs(u)) * s + up * Math.random(), r * Math.sin(a) * s,
        colors[(Math.random() * colors.length) | 0], size * (0.5 + Math.random()), life * (0.5 + Math.random() * 0.7), gravity,
      );
    }
  }

  // A few motes left behind a moving piece.
  trail(at, colors, n = 2) {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      this.spark(at.x + (Math.random() - 0.5) * 0.3, at.y + Math.random() * 0.5, at.z + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.4, Math.random() * 0.6, (Math.random() - 0.5) * 0.4,
        colors[(Math.random() * colors.length) | 0], 0.09, 0.5 + Math.random() * 0.3, -0.4, 2);
    }
  }

  // Break a piece into tumbling fragments of its own material.
  shatter(at, height, material, count = 16) {
    if (!this.enabled) count = 6;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.shardGeo[i % 3], material);
      mesh.castShadow = true;
      const s = 0.7 + Math.random() * 1.4;
      mesh.scale.set(s, s * (0.6 + Math.random()), s);
      mesh.position.set(at.x + (Math.random() - 0.5) * 0.3, at.y + Math.random() * height, at.z + (Math.random() - 0.5) * 0.3);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.6;
      this.scene.add(mesh);
      this.shards.push({
        mesh, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3.5, vz: Math.sin(a) * sp,
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14), life: 1.6 + Math.random() * 0.8, scale: mesh.scale.clone(),
      });
    }
  }

  ring(at, hex, radius = 2.2, life = 0.55) {
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(1.2), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.position.set(at.x, 0.03, at.z);
    this.scene.add(mesh);
    this.rings.push({ mesh, radius, life, span: life });
  }

  flashAt(at, hex, intensity = 40) {
    this.flash.position.set(at.x, at.y + 0.8, at.z);
    this.flash.color.setHex(hex);
    this.flash.intensity = intensity;
  }

  beamAt(at, hex) {
    this.beam.position.set(at.x, 0, at.z);
    this.beam.material.color.setHex(hex);
    this.beam.visible = true;
    this.beamLife = 1;
  }

  startFireworks(seconds, palette) { this.fireworks = seconds; this.palette = palette; this.fireworkTimer = 0; }
  stopFireworks() { this.fireworks = 0; }

  clear() {
    for (const s of this.shards) this.scene.remove(s.mesh);
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    this.shards.length = 0; this.rings.length = 0;
    this.life.fill(0); this.alpha.fill(0);
    this.fireworks = 0; this.beam.visible = false; this.flash.intensity = 0;
  }

  update(dt) {
    // sparks
    const { pos, vel, life, span, alpha, size, base, grav, drag } = this;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
      life[i] -= dt;
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const k = Math.max(0, life[i] / span[i]);
      alpha[i] = Math.min(1, k * 2.5);
      size[i] = base[i] * (0.4 + 0.6 * k);
    }
    const at = this.points.geometry.attributes;
    at.position.needsUpdate = at.aColor.needsUpdate = at.aSize.needsUpdate = at.aAlpha.needsUpdate = true;

    // shards: fall, bounce once on the board, then drop into the void
    for (const s of this.shards) {
      s.life -= dt;
      s.vy -= 12 * dt;
      const m = s.mesh;
      m.position.x += s.vx * dt; m.position.y += s.vy * dt; m.position.z += s.vz * dt;
      m.rotation.x += s.spin.x * dt; m.rotation.y += s.spin.y * dt; m.rotation.z += s.spin.z * dt;
      const onBoard = Math.abs(m.position.x) < 4.7 && Math.abs(m.position.z) < 4.7;
      if (onBoard && m.position.y < 0.06 && s.vy < 0) {
        m.position.y = 0.06; s.vy *= -0.42; s.vx *= 0.7; s.vz *= 0.7; s.spin.multiplyScalar(0.6);
      }
      const k = Math.min(1, Math.max(0, s.life / 0.5));
      m.scale.copy(s.scale).multiplyScalar(k);
      if (s.life <= 0 || m.position.y < -14) { this.scene.remove(m); s.dead = true; }
    }
    if (this.shards.some((s) => s.dead)) this.shards = this.shards.filter((s) => !s.dead);

    for (const r of this.rings) {
      r.life -= dt;
      const k = 1 - Math.max(0, r.life / r.span);
      r.mesh.scale.setScalar(0.3 + (r.radius - 0.3) * (1 - Math.pow(1 - k, 3)));
      r.mesh.material.opacity = (1 - k) * 0.7;
      if (r.life <= 0) { this.scene.remove(r.mesh); r.mesh.material.dispose(); r.dead = true; }
    }
    if (this.rings.some((r) => r.dead)) this.rings = this.rings.filter((r) => !r.dead);

    if (this.flash.intensity > 0.01) this.flash.intensity *= Math.pow(0.0008, dt); else this.flash.intensity = 0;

    if (this.beam.visible) {
      this.beamLife -= dt * 1.1;
      const k = Math.max(0, this.beamLife);
      this.beam.material.opacity = k * 0.45;
      this.beam.scale.set(0.3 + k, 1, 0.3 + k);
      if (k <= 0) this.beam.visible = false;
    }

    if (this.fireworks > 0) {
      this.fireworks -= dt;
      this.fireworkTimer -= dt;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 0.18 + Math.random() * 0.45;
        const at = new THREE.Vector3((Math.random() - 0.5) * 16, 4 + Math.random() * 6, (Math.random() - 0.5) * 12 - 2);
        const hex = this.palette[(Math.random() * this.palette.length) | 0];
        this.burst(at, [hex, 0xffffff, hex], { count: 110, speed: 5.5, up: 0, size: 0.3, life: 1.7, gravity: 1.6, spread: 0.2, sphere: true });
        if (this.onFirework) this.onFirework();
      }
    }
  }
}
