// A small tween runner. Everything animated in the scene goes through one of
// these so the animation-speed setting and "skip everything" work in one place.

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
};

export class Tweens {
  constructor() {
    this.items = [];
    this.speed = 1;      // Infinity means "instant"
  }

  // Calls update(k) with k eased from 0 to 1 over `duration` seconds.
  run(duration, update, easing = ease.inOutCubic, delay = 0) {
    return new Promise((resolve) => {
      if (!isFinite(this.speed) || duration + delay <= 0) { update(1); resolve(); return; }
      this.items.push({ t: -delay, duration: Math.max(duration, 1e-4), update, easing, resolve });
    });
  }

  wait(seconds) { return this.run(seconds, () => {}, ease.linear); }

  update(dt) {
    const step = dt * this.speed;
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.t += step;
      if (it.t < 0) continue;
      const k = Math.min(1, it.t / it.duration);
      it.update(it.easing(k));
      if (k >= 1) { it.done = true; it.resolve(); }
    }
    if (items.some((it) => it.done)) this.items = this.items.filter((it) => !it.done);
  }

  // Jump every running tween to its end.
  finishAll() {
    const items = this.items;
    this.items = [];
    for (const it of items) { it.update(1); it.resolve(); }
  }
}
