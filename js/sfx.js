const DEFAULTS = Object.freeze({
  // Raised ~2x from previous 0.35 baseline.
  masterVolume: 0.7,
  // Keep category gains closer for a more consistent mix.
  weaponsVolume: 0.9,
  impactsVolume: 0.9,
  uiVolume: 0.9,
  worldVolume: 0.9,
  cooldowns: {
    laserImpact: 0.03,
    playerBlaster: 0.03,
    enemyShot: 0.04,
    collision: 0.08,
    pickup: 0.04,
    genericUi: 0.05
  }
});

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

class SpaceJamSfx {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterCompressor = null;
    this.groups = null;
    this.cooldowns = new Map();
    this.started = false;
    this.laserLoop = null;
    this.droneLaserLoop = null;
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = DEFAULTS.masterVolume;
    // Output compressor smooths loudness differences and reduces clipping spikes.
    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-20, this.ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(18, this.ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.006, this.ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.18, this.ctx.currentTime);

    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.ctx.destination);

    this.groups = {
      weapons: this.createGroup(DEFAULTS.weaponsVolume),
      impacts: this.createGroup(DEFAULTS.impactsVolume),
      ui: this.createGroup(DEFAULTS.uiVolume),
      world: this.createGroup(DEFAULTS.worldVolume)
    };
    return this.ctx;
  }

  createGroup(initialGain) {
    const gain = this.ctx.createGain();
    gain.gain.value = initialGain;
    gain.connect(this.masterGain);
    return gain;
  }

  async unlock() {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      if (ctx.state !== 'running') await ctx.resume();
      this.started = ctx.state === 'running';
    } catch (_) {
      this.started = false;
    }
    return this.started;
  }

  async resumeIfNeeded() {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    try {
      await ctx.resume();
      this.started = ctx.state === 'running';
    } catch (_) {
      this.started = false;
    }
    return this.started;
  }

  canPlay() {
    return !!(this.ctx && this.ctx.state === 'running' && this.groups);
  }

  now() {
    return this.ctx.currentTime;
  }

  passCooldown(key, seconds) {
    const ctx = this.ctx;
    if (!ctx) return false;
    const now = ctx.currentTime;
    const until = this.cooldowns.get(key) || 0;
    if (now < until) return false;
    this.cooldowns.set(key, now + seconds);
    return true;
  }

  envelope(gainNode, attack, decay, sustain, release, now, hold = 0) {
    const g = gainNode.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0.0001, now);
    g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), now + attack);
    const decayTarget = Math.max(0.0001, sustain * 0.65);
    g.exponentialRampToValueAtTime(decayTarget, now + attack + decay);
    const relStart = now + attack + decay + hold;
    g.setValueAtTime(decayTarget, relStart);
    g.exponentialRampToValueAtTime(0.0001, relStart + release);
    return relStart + release;
  }

  tone({
    group = 'world',
    type = 'sine',
    freqStart = 440,
    freqEnd = 440,
    duration = 0.2,
    gain = 0.2,
    attack = 0.003,
    decay = 0.03,
    release = 0.08,
    hold = 0
  }) {
    if (!this.canPlay()) return;
    const now = this.now();
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(10, freqStart), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), now + duration);
    const stopAt = this.envelope(amp, attack, decay, gain, release, now, hold);
    osc.connect(amp);
    amp.connect(this.groups[group] || this.groups.world);
    osc.start(now);
    osc.stop(stopAt + 0.02);
  }

  noiseBurst({
    group = 'impacts',
    duration = 0.12,
    gain = 0.12,
    filterType = 'bandpass',
    filterFreq = 1000,
    q = 1,
    release = 0.08
  }) {
    if (!this.canPlay()) return;
    const now = this.now();
    const len = Math.max(0.01, duration);
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const amp = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = q;

    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.groups[group] || this.groups.impacts);

    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + len + release);

    src.start(now);
    src.stop(now + len + release + 0.01);
  }

  playPlayerBlaster(heat01 = 1) {
    if (!this.canPlay() || !this.passCooldown('playerBlaster', DEFAULTS.cooldowns.playerBlaster)) return;
    const h = Math.max(0, Math.min(1, heat01));
    const pitchScale = 0.55 + 0.2 * h; // cold: 55%, hot: 75% (25% less high)
    this.tone({ group: 'weapons', type: 'triangle', freqStart: rand(1200, 1450) * pitchScale, freqEnd: rand(500, 650) * pitchScale, duration: 0.09, gain: 0.1, release: 0.06 });
    this.tone({ group: 'weapons', type: 'square', freqStart: rand(1800, 2200) * pitchScale, freqEnd: rand(700, 900) * pitchScale, duration: 0.06, gain: 0.045, release: 0.04 });
  }

  playEnemyShot(archetype = 'standard') {
    if (!this.canPlay() || !this.passCooldown('enemyShot', DEFAULTS.cooldowns.enemyShot)) return;
    let start = 620;
    let end = 300;
    if (archetype === 'shotgun') {
      start = 500;
      end = 195;
      this.noiseBurst({ group: 'weapons', duration: 0.05, gain: 0.028, filterType: 'highpass', filterFreq: 1000, q: 0.8, release: 0.03 });
    } else if (archetype === 'slowing') {
      start = 665;
      end = 230;
    } else if (archetype === 'drone') {
      start = 860;
      end = 420;
    }
    this.tone({ group: 'weapons', type: 'sawtooth', freqStart: start, freqEnd: end, duration: 0.1, gain: 0.08, release: 0.08 });
  }

  startLaserLoop() {
    if (!this.canPlay() || this.laserLoop) return;
    const now = this.now();
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.setValueAtTime(0.8, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.067, now + 0.04);

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.groups.weapons);
    osc.start(now);

    this.laserLoop = { osc, filter, amp };
  }

  updateLaserHeat(heat01 = 0) {
    if (!this.canPlay() || !this.laserLoop) return;
    const h = clamp(heat01, 0, 1);
    const now = this.now();
    const targetFreq = 55 + h * 20; // 55–75 Hz range
    const targetCutoff = 700 + h * 1600;
    const targetGain = (0.08 + h * 0.08) * (2 / 3);
    this.laserLoop.osc.frequency.setTargetAtTime(targetFreq, now, 0.02);
    this.laserLoop.filter.frequency.setTargetAtTime(targetCutoff, now, 0.03);
    this.laserLoop.amp.gain.setTargetAtTime(targetGain, now, 0.02);
  }

  stopLaserLoop() {
    if (!this.laserLoop) return;
    const now = this.now();
    const { osc, amp } = this.laserLoop;
    amp.gain.cancelScheduledValues(now);
    amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value || 0.01), now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    try { osc.stop(now + 0.08); } catch (_) {}
    this.laserLoop = null;
  }

  startDroneLaserLoop() {
    if (!this.canPlay() || this.droneLaserLoop) return;
    const now = this.now();
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, now);
    filter.Q.setValueAtTime(0.6, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.022, now + 0.03);

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.groups.weapons);
    osc.start(now);

    this.droneLaserLoop = { osc, filter, amp };
  }

  stopDroneLaserLoop() {
    if (!this.droneLaserLoop) return;
    const now = this.now();
    const { osc, amp } = this.droneLaserLoop;
    amp.gain.cancelScheduledValues(now);
    amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value || 0.01), now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    try { osc.stop(now + 0.06); } catch (_) {}
    this.droneLaserLoop = null;
  }

  playOverheat() {
    if (!this.canPlay() || !this.passCooldown('overheat', 0.5)) return;
    const now = this.now();
    this.noiseBurst({ group: 'weapons', duration: 0.12, gain: 0.11, filterType: 'bandpass', filterFreq: 320, q: 1.2, release: 0.08 });
    this.tone({ group: 'weapons', type: 'sawtooth', freqStart: 380, freqEnd: 90, duration: 0.14, gain: 0.06, release: 0.1 });
  }

  playImpact(kind = 'generic') {
    if (!this.canPlay()) return;
    const key = `impact:${kind}`;
    if (!this.passCooldown(key, DEFAULTS.cooldowns.laserImpact)) return;
    if (kind === 'playerHit') {
      // Similar to ship collision but a tad lower in pitch and volume
      this.noiseBurst({ group: 'impacts', duration: 0.12, gain: 0.11, filterType: 'lowpass', filterFreq: 520, q: 0.9, release: 0.1 });
      this.tone({ group: 'impacts', type: 'triangle', freqStart: 105, freqEnd: 42, duration: 0.15, gain: 0.07, release: 0.14 });
      return;
    }
    let f = 1300;
    if (kind === 'bullet') f = 1700;
    else if (kind === 'laser') f = 2200;
    this.noiseBurst({ group: 'impacts', duration: 0.05, gain: 0.08, filterType: 'bandpass', filterFreq: f, q: 1.5, release: 0.06 });
  }

  playShipCollision(intensity = 0.5) {
    if (!this.canPlay() || !this.passCooldown('collision', DEFAULTS.cooldowns.collision)) return;
    const t = clamp(intensity, 0, 1);
    this.noiseBurst({ group: 'impacts', duration: 0.1 + t * 0.08, gain: 0.09 + t * 0.1, filterType: 'lowpass', filterFreq: 750 - t * 250, q: 0.9, release: 0.12 });
    this.tone({ group: 'impacts', type: 'triangle', freqStart: 140 - t * 30, freqEnd: 55 - t * 12, duration: 0.18, gain: 0.08 + t * 0.04, release: 0.16 });
  }

  playExplosion(kind = 'asteroid') {
    if (!this.canPlay()) return;
    const key = `explosion:${kind}`;
    if (!this.passCooldown(key, 0.04)) return;
    let gain = 0.12;
    let low = 180;
    if (kind === 'pirate') {
      gain = 0.14;
      low = 220;
    } else if (kind === 'base') {
      gain = 0.2;
      low = 140;
    }
    this.noiseBurst({ group: 'world', duration: 0.22, gain, filterType: 'lowpass', filterFreq: low, q: 0.7, release: 0.18 });
    this.tone({ group: 'world', type: 'triangle', freqStart: low + 40, freqEnd: 45, duration: 0.25, gain: gain * 0.9, release: 0.2 });
  }

  playPickup(kind = 'generic') {
    if (!this.canPlay() || !this.passCooldown('pickup', DEFAULTS.cooldowns.pickup)) return;
    if (kind === 'ore') {
      this.tone({ group: 'world', type: 'sine', freqStart: 540, freqEnd: 760, duration: 0.04, gain: 0.08, release: 0.05 });
    } else {
      this.tone({ group: 'world', type: 'triangle', freqStart: 620, freqEnd: 980, duration: 0.05, gain: 0.1, release: 0.06 });
    }
  }

  playMenuOpen() { this.uiTick(720, 940, 0.06); }
  playMenuClose() { this.uiTick(860, 600, 0.06); }
  playConfirm() { this.uiTick(760, 1080, 0.08); }
  playCancel() { this.uiTick(680, 360, 0.07); }
  playBuy() { this.uiTick(760, 1180, 0.07); }
  playSell() { this.uiTick(980, 640, 0.08); }
  playCraft() { this.uiTick(620, 1020, 0.09); }
  playRefine() { this.uiTick(500, 920, 0.1); }
  playWarp() { this.uiTick(320, 1160, 0.15); }
  playJettison() { this.uiTick(430, 260, 0.09); }
  playDeath() { this.uiTick(260, 90, 0.35); }
  playRespawn() { this.uiTick(340, 860, 0.25); }
  playLevelChange() { this.uiTick(420, 980, 0.12); }
  playHotbarSelect() { this.uiTick(680, 760, 0.04); }
  playUseResource(kind = 'generic') {
    if (kind === 'health') this.uiTick(540, 900, 0.08);
    else if (kind === 'oxygen') this.uiTick(680, 1020, 0.08);
    else this.uiTick(460, 820, 0.08);
  }

  playCutsceneTypeTick() {
    if (!this.canPlay() || !this.passCooldown('cutsceneType', 0.025)) return;
    this.tone({ group: 'ui', type: 'square', freqStart: 1020, freqEnd: 860, duration: 0.025, gain: 0.03, release: 0.015 });
  }

  playCutsceneSkip() { this.uiTick(520, 300, 0.08); }
  playCutsceneBlendStart() { this.uiTick(340, 940, 0.2); }
  playCutsceneBlendComplete() { this.uiTick(560, 1180, 0.16); }

  uiTick(from, to, duration) {
    if (!this.canPlay() || !this.passCooldown(`ui:${from}:${to}`, DEFAULTS.cooldowns.genericUi)) return;
    this.tone({ group: 'ui', type: 'triangle', freqStart: from, freqEnd: to, duration, gain: 0.104, release: Math.max(0.03, duration * 0.65) });
  }
}

export const sfx = new SpaceJamSfx();
