// All sound is synthesised with the Web Audio API: oscillators, filtered
// noise, a generated reverb impulse. The music is composed as it plays from
// the current theme's chords and scale.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.45;
    this.muted = false;
    this.theme = null;
    this.musicOn = false;
    this.timer = null;
    this.intensity = 0;
    this.lastDrop = 0;
  }

  // Must be called from a user gesture the first time.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.music = ctx.createGain();
    this.sfx.connect(this.master); this.music.connect(this.master);

    // reverb: decaying stereo noise as the impulse response
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain(); this.reverbGain.gain.value = 0.5;
    this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.master);
    this.sfxSend = ctx.createGain(); this.sfxSend.gain.value = 0.22;
    this.sfx.connect(this.sfxSend); this.sfxSend.connect(this.reverb);
    this.musicSend = ctx.createGain(); this.musicSend.gain.value = 0.7;
    this.music.connect(this.musicSend); this.musicSend.connect(this.reverb);

    // echo for the plucked notes
    this.delay = ctx.createDelay(1.5); this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400;
    this.delay.connect(tone); tone.connect(fb); fb.connect(this.delay); tone.connect(this.music);

    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = n.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuffer = n;
    this.applyVolumes();
    if (this.musicOn) this.startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(this.muted ? 0 : this.sfxVolume, t, 0.03);
    this.music.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume * 0.55, t, 0.2);
  }
  setVolumes(sfx, music) { this.sfxVolume = sfx; this.musicVolume = music; this.applyVolumes(); }
  setMuted(m) { this.muted = m; this.applyVolumes(); }

  // ---------------------------------------------------------------- building blocks
  tone({ freq, to = null, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.004, when = 0, dest = null, detune = 0 }) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.1, type = 'bandpass', freq = 1000, to = null, q = 1, vol = 0.3, attack = 0.002, when = 0, dest = null }) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuffer; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------------- effects
  play(name) {
    if (!this.ctx || this.muted) return;
    const r = () => 0.94 + Math.random() * 0.12;
    switch (name) {
      case 'select': this.tone({ freq: 720 * r(), to: 980, dur: 0.07, vol: 0.12, type: 'triangle' }); break;
      case 'deselect': this.tone({ freq: 620, to: 420, dur: 0.07, vol: 0.08, type: 'triangle' }); break;
      case 'click': this.tone({ freq: 1200, dur: 0.035, vol: 0.08, type: 'square' }); break;
      case 'move':
        this.noise({ dur: 0.06, freq: 950 * r(), q: 2.5, vol: 0.5 });
        this.tone({ freq: 190 * r(), to: 85, dur: 0.11, vol: 0.45 });
        break;
      case 'drop': {
        const now = performance.now();
        if (now - this.lastDrop < 45) return;
        this.lastDrop = now;
        this.noise({ dur: 0.05, freq: 700 * r(), q: 2, vol: 0.22 });
        this.tone({ freq: 150 * r(), to: 70, dur: 0.1, vol: 0.25 });
        break;
      }
      case 'whoosh': this.noise({ dur: 0.28, freq: 500, to: 2600, q: 1.2, vol: 0.14, attack: 0.08 }); break;
      case 'capture':
        this.noise({ dur: 0.22, type: 'lowpass', freq: 3200, to: 300, vol: 0.6 });
        this.tone({ freq: 150, to: 42, dur: 0.3, vol: 0.7 });
        for (let i = 0; i < 7; i++) this.tone({ freq: 1800 + Math.random() * 4200, dur: 0.12 + Math.random() * 0.25, vol: 0.07, when: 0.02 + Math.random() * 0.22 });
        break;
      case 'castle':
        this.play('move');
        this.noise({ dur: 0.06, freq: 800, q: 2.5, vol: 0.45, when: 0.16 });
        this.tone({ freq: 160, to: 80, dur: 0.11, vol: 0.4, when: 0.16 });
        break;
      case 'check':
        this.tone({ freq: 660, dur: 0.16, vol: 0.2, type: 'sawtooth' });
        this.tone({ freq: 990, dur: 0.3, vol: 0.2, type: 'sawtooth', when: 0.1 });
        this.tone({ freq: 1320, dur: 0.4, vol: 0.1, type: 'sine', when: 0.1 });
        break;
      case 'promote':
        [72, 76, 79, 84, 88].forEach((n, i) => {
          this.tone({ freq: midi(n), dur: 0.5, vol: 0.2, type: 'triangle', when: i * 0.07 });
          this.tone({ freq: midi(n + 12), dur: 0.4, vol: 0.06, when: i * 0.07 });
        });
        this.noise({ dur: 0.6, freq: 3000, to: 9000, q: 0.8, vol: 0.08, attack: 0.2 });
        break;
      case 'start':
        [50, 57, 62, 66, 69].forEach((n, i) => this.tone({ freq: midi(n), dur: 1.6, vol: 0.12, type: 'triangle', when: i * 0.09, attack: 0.05 }));
        break;
      case 'win':
        [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone({ freq: midi(n), dur: 0.5, vol: 0.2, type: 'triangle', when: i * 0.11 }));
        [60, 64, 67, 72].forEach((n) => this.tone({ freq: midi(n), dur: 2.2, vol: 0.12, type: 'sawtooth', when: 0.8, attack: 0.05 }));
        break;
      case 'lose':
        [67, 63, 60, 55, 51, 48].forEach((n, i) => this.tone({ freq: midi(n), dur: 0.7, vol: 0.18, type: 'triangle', when: i * 0.2 }));
        break;
      case 'draw':
        [64, 62, 64].forEach((n, i) => this.tone({ freq: midi(n), dur: 0.6, vol: 0.18, type: 'triangle', when: i * 0.22 }));
        break;
      case 'illegal': this.tone({ freq: 130, to: 95, dur: 0.16, vol: 0.2, type: 'sawtooth' }); break;
      case 'hint':
        this.tone({ freq: midi(81), dur: 0.5, vol: 0.14 });
        this.tone({ freq: midi(88), dur: 0.7, vol: 0.12, when: 0.1 });
        break;
      case 'tick': this.tone({ freq: 1500, dur: 0.03, vol: 0.14, type: 'square' }); break;
      // ---- the Gauntlet's cards and effects
      case 'card':
        this.noise({ dur: 0.16, freq: 1800, to: 5200, q: 1.4, vol: 0.12, attack: 0.03 });
        this.tone({ freq: midi(79), dur: 0.22, vol: 0.12, type: 'triangle', when: 0.04 });
        this.tone({ freq: midi(86), dur: 0.3, vol: 0.09, type: 'sine', when: 0.1 });
        break;
      case 'draw': this.noise({ dur: 0.07, freq: 3200 * r(), q: 1.5, vol: 0.08, attack: 0.01 }); break;
      case 'shield':
        this.tone({ freq: 520, to: 1040, dur: 0.28, vol: 0.14, type: 'sine' });
        this.tone({ freq: 1560, dur: 0.4, vol: 0.06, type: 'sine', when: 0.08 });
        break;
      case 'shieldbreak':
        this.noise({ dur: 0.2, type: 'highpass', freq: 2600, vol: 0.3 });
        for (let i = 0; i < 5; i++) this.tone({ freq: 2200 + Math.random() * 3200, dur: 0.1 + Math.random() * 0.2, vol: 0.07, when: Math.random() * 0.12 });
        break;
      case 'freeze':
        this.noise({ dur: 0.35, type: 'highpass', freq: 5200, to: 1800, vol: 0.14, attack: 0.02 });
        [91, 95, 98].forEach((n, i) => this.tone({ freq: midi(n), dur: 0.35, vol: 0.06, when: i * 0.05 }));
        break;
      case 'zap':
        this.tone({ freq: 1400, to: 90, dur: 0.22, vol: 0.3, type: 'sawtooth' });
        this.noise({ dur: 0.18, type: 'bandpass', freq: 3000, to: 500, q: 0.8, vol: 0.3 });
        break;
      case 'summon':
        this.tone({ freq: 220, to: 660, dur: 0.3, vol: 0.18, type: 'triangle' });
        this.noise({ dur: 0.25, freq: 900, to: 2600, q: 1.2, vol: 0.08, attack: 0.08 });
        break;
      case 'blink':
        this.tone({ freq: 1200, to: 300, dur: 0.14, vol: 0.16, type: 'sine' });
        this.tone({ freq: 300, to: 1400, dur: 0.18, vol: 0.16, type: 'sine', when: 0.14 });
        break;
      case 'rock':
        this.noise({ dur: 0.3, type: 'lowpass', freq: 500, to: 160, vol: 0.5 });
        this.tone({ freq: 80, to: 45, dur: 0.3, vol: 0.4 });
        break;
      case 'coin':
        this.tone({ freq: midi(88), dur: 0.09, vol: 0.14, type: 'square' });
        this.tone({ freq: midi(93), dur: 0.3, vol: 0.14, type: 'square', when: 0.07 });
        break;
      case 'heal': [72, 76, 79, 84].forEach((n, i) => this.tone({ freq: midi(n), dur: 0.7, vol: 0.12, type: 'sine', when: i * 0.12, attack: 0.04 })); break;
      case 'bark': this.tone({ freq: 480 * r(), to: 620, dur: 0.06, vol: 0.07, type: 'triangle' }); break;
      // ---- how each temper sounds as it moves, fights and falls
      case 'step':
        this.noise({ dur: 0.04, type: 'lowpass', freq: 650 * r(), vol: 0.12 });
        this.tone({ freq: 120 * r(), to: 70, dur: 0.05, vol: 0.1 });
        break;
      case 'boing':
        this.tone({ freq: 180 * r(), to: 540, dur: 0.16, vol: 0.13, type: 'sine' });
        this.tone({ freq: 360 * r(), to: 900, dur: 0.12, vol: 0.04, type: 'triangle' });
        break;
      case 'pop':
        this.noise({ dur: 0.08, freq: 1500, q: 0.8, vol: 0.32 });
        this.tone({ freq: 620, to: 180, dur: 0.08, vol: 0.18 });
        break;
      case 'poof': this.noise({ dur: 0.35, type: 'lowpass', freq: 1800, to: 280, vol: 0.22, attack: 0.02 }); break;
      case 'thud':
        this.tone({ freq: 95 * r(), to: 40, dur: 0.25, vol: 0.5 });
        this.noise({ dur: 0.12, type: 'lowpass', freq: 420, vol: 0.32 });
        break;
      case 'coins':
        for (let i = 0; i < 8; i++) this.tone({ freq: 2200 + Math.random() * 1800, dur: 0.08 + Math.random() * 0.12, vol: 0.05, type: 'square', when: i * 0.035 + Math.random() * 0.02 });
        break;
      case 'pages': for (let i = 0; i < 4; i++) this.noise({ dur: 0.07, type: 'highpass', freq: 3000 + Math.random() * 2000, vol: 0.09, when: i * 0.06 }); break;
      case 'growl':
        this.tone({ freq: 70 * r(), to: 52, dur: 0.42, vol: 0.2, type: 'sawtooth' });
        this.tone({ freq: 73 * r(), to: 50, dur: 0.42, vol: 0.14, type: 'sawtooth', detune: 30 });
        this.noise({ dur: 0.38, type: 'lowpass', freq: 320, vol: 0.14 });
        break;
      case 'boom':
        this.noise({ dur: 0.65, type: 'lowpass', freq: 900, to: 70, vol: 0.7 });
        this.tone({ freq: 72, to: 28, dur: 0.6, vol: 0.6 });
        break;
      case 'chime': [84, 88, 91].forEach((n, i) => this.tone({ freq: midi(n), dur: 0.6, vol: 0.08, when: i * 0.06 })); break;
      case 'shout':
        this.tone({ freq: 250 * r(), to: 390, dur: 0.36, vol: 0.15, type: 'sawtooth' });
        this.tone({ freq: 375 * r(), to: 560, dur: 0.36, vol: 0.06, type: 'square' });
        this.noise({ dur: 0.32, freq: 1200, q: 2, vol: 0.1 });
        break;
      case 'squash':
        this.tone({ freq: 300, to: 55, dur: 0.25, vol: 0.2, type: 'triangle' });
        this.noise({ dur: 0.2, type: 'lowpass', freq: 800, to: 180, vol: 0.15 });
        break;
      case 'squeak':
        this.tone({ freq: 900 * r(), to: 1500, dur: 0.08, vol: 0.09 });
        this.tone({ freq: 1500, to: 1100, dur: 0.08, vol: 0.09, when: 0.08 });
        break;
      case 'slam':
        this.tone({ freq: 140, to: 42, dur: 0.36, vol: 0.6 });
        this.noise({ dur: 0.3, type: 'lowpass', freq: 2400, to: 180, vol: 0.5 });
        break;
      case 'creak':
        this.tone({ freq: 112, to: 78, dur: 0.48, vol: 0.06, type: 'sawtooth' });
        this.noise({ dur: 0.45, freq: 700, q: 8, vol: 0.08 });
        break;
      case 'sparkle': for (let i = 0; i < 6; i++) this.tone({ freq: midi(84 + i * 3), dur: 0.25, vol: 0.05, when: i * 0.05 }); break;
      case 'march':
        this.tone({ freq: 98, to: 60, dur: 0.18, vol: 0.35 });
        this.tone({ freq: 98, to: 60, dur: 0.18, vol: 0.3, when: 0.22 });
        this.noise({ dur: 0.5, type: 'lowpass', freq: 600, vol: 0.06, attack: 0.1 });
        break;
      case 'firework':
        this.noise({ dur: 0.5, type: 'lowpass', freq: 2400, to: 200, vol: 0.2 });
        this.tone({ freq: 90, to: 40, dur: 0.35, vol: 0.3 });
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------------------ music
  setTheme(spec) {
    this.theme = spec;
    this.bar = 0; this.step = 0;
  }

  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  startMusic() {
    this.musicOn = true;
    if (!this.ctx || this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.bar = 0; this.step = 0;
    this.timer = setInterval(() => this.schedule(), 80);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // Look a little ahead and queue the notes that fall in that window. A bar is
  // eight steps; each chord lasts two bars.
  schedule() {
    const ctx = this.ctx, th = this.theme;
    if (!ctx || !th) return;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;   // tab was asleep
    const stepLen = 60 / th.tempo / 2;
    while (this.nextTime < ctx.currentTime + 0.25) {
      const when = this.nextTime - ctx.currentTime;
      const chord = th.chords[Math.floor(this.bar / 2) % th.chords.length];
      if (this.step === 0 && this.bar % 2 === 0) this.pad(chord, stepLen * 16, when);
      if (th.drive) {
        if (this.step % 4 === 0) this.tone({ freq: 110, to: 38, dur: 0.22, vol: 0.34, when, dest: this.music });
        if (this.step % 4 === 2) this.noise({ dur: 0.05, type: 'highpass', freq: 6000, vol: 0.05, when, dest: this.music });
        const note = th.root + chord[this.step % chord.length] + 12;
        this.pluck(note, when, 0.1 + this.intensity * 0.06, stepLen * 0.9);
        if (this.step % 2 === 0) this.tone({ freq: midi(th.root + chord[0] - 12), dur: stepLen * 1.8, vol: 0.16, type: 'sawtooth', when, dest: this.music });
      } else if (Math.random() < th.density * (0.6 + this.intensity * 0.9)) {
        const pool = Math.random() < 0.65 ? chord : th.scale;
        const note = th.root + pool[(Math.random() * pool.length) | 0] + 12 * (1 + ((Math.random() * 2) | 0));
        this.pluck(note, when, 0.1 + Math.random() * 0.08, 1.4);
      }
      this.nextTime += stepLen;
      if (++this.step === 8) { this.step = 0; this.bar++; }
    }
  }

  pad(chord, dur, when) {
    const ctx = this.ctx, th = this.theme, t = ctx.currentTime + when;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(380, t);
    f.frequency.linearRampToValueAtTime(900 + this.intensity * 900, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(380, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.08);
    f.connect(g); g.connect(this.music);
    chord.forEach((semi, i) => {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = th.pad; o.frequency.value = midi(th.root + semi); o.detune.value = det + i * 2;
        o.connect(f); o.start(t); o.stop(t + dur * 1.1);
      }
    });
    const b = ctx.createOscillator(), bg = ctx.createGain();
    b.type = 'sine'; b.frequency.value = midi(th.root + chord[0] - 12);
    bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.2, t + 0.6); bg.gain.linearRampToValueAtTime(0.0001, t + dur);
    b.connect(bg); bg.connect(this.music); b.start(t); b.stop(t + dur + 0.1);
  }

  pluck(note, when, vol, dur) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = this.theme.pluck; o.frequency.value = midi(note);
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.music); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
