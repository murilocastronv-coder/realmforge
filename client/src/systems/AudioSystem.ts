/**
 * AudioSystem — Web Audio API procedural sound effects + music volume management.
 * No external audio files needed: generates SFX procedurally using oscillators and noise.
 */

type SFXType =
  | 'hit_melee'
  | 'hit_crit'
  | 'miss'
  | 'death'
  | 'level_up'
  | 'loot_pickup'
  | 'loot_rare'
  | 'heal'
  | 'skill_cast'
  | 'equip'
  | 'gold'
  | 'ui_open'
  | 'ui_close'
  | 'quest_complete'
  | 'achievement'
  | 'error';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;

let _masterVol = 0.8;
let _sfxVol = 0.7;
let _musicVol = 0.5;

function ensureContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = _masterVol;
    masterGain.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = _sfxVol;
    sfxGain.connect(masterGain);

    musicGain = ctx.createGain();
    musicGain.gain.value = _musicVol;
    musicGain.connect(masterGain);
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/** Set master volume (0-1) */
export function setMasterVolume(v: number): void {
  _masterVol = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = _masterVol;
}

/** Set SFX volume (0-1) */
export function setSfxVolume(v: number): void {
  _sfxVol = Math.max(0, Math.min(1, v));
  if (sfxGain) sfxGain.gain.value = _sfxVol;
}

/** Set music volume (0-1) */
export function setMusicVolume(v: number): void {
  _musicVol = Math.max(0, Math.min(1, v));
  if (musicGain) musicGain.gain.value = _musicVol;
}

// ── Procedural SFX generators ──────────────────────────────

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', fadeOut = true): void {
  const ac = ensureContext();
  if (!sfxGain) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0.3;
  if (fadeOut) gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
}

function playNoise(duration: number, volume = 0.15): void {
  const ac = ensureContext();
  if (!sfxGain) return;
  const bufferSize = ac.sampleRate * duration;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * volume;
  }
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.value = 1;
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  source.connect(gain);
  gain.connect(sfxGain!);
  source.start(ac.currentTime);
}

function playChirp(startFreq: number, endFreq: number, duration: number, type: OscillatorType = 'sine'): void {
  const ac = ensureContext();
  if (!sfxGain) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, ac.currentTime + duration);
  gain.gain.value = 0.25;
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
}

// ── Public SFX API ─────────────────────────────────────────

const SFX_GENERATORS: Record<SFXType, () => void> = {
  hit_melee() {
    playNoise(0.08, 0.2);
    playTone(200, 0.1, 'sawtooth');
  },
  hit_crit() {
    playNoise(0.1, 0.3);
    playTone(400, 0.15, 'sawtooth');
    playTone(600, 0.1, 'square');
  },
  miss() {
    playChirp(300, 150, 0.15, 'sine');
  },
  death() {
    playChirp(400, 80, 0.6, 'sawtooth');
    playNoise(0.4, 0.15);
  },
  level_up() {
    const ac = ensureContext();
    const t = ac.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.2;
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15 * (i + 1) + 0.3);
      osc.connect(gain);
      gain.connect(sfxGain!);
      osc.start(t + 0.15 * i);
      osc.stop(t + 0.15 * (i + 1) + 0.3);
    });
  },
  loot_pickup() {
    playChirp(400, 800, 0.12, 'sine');
  },
  loot_rare() {
    playChirp(600, 1200, 0.2, 'sine');
    setTimeout(() => playChirp(800, 1400, 0.15, 'sine'), 100);
  },
  heal() {
    playChirp(300, 600, 0.2, 'sine');
    playTone(500, 0.15, 'sine');
  },
  skill_cast() {
    playChirp(200, 500, 0.15, 'square');
    playNoise(0.05, 0.1);
  },
  equip() {
    playNoise(0.04, 0.15);
    playTone(350, 0.08, 'triangle');
  },
  gold() {
    playTone(1200, 0.06, 'sine');
    setTimeout(() => playTone(1500, 0.06, 'sine'), 60);
  },
  ui_open() {
    playChirp(300, 500, 0.08, 'sine');
  },
  ui_close() {
    playChirp(500, 300, 0.08, 'sine');
  },
  quest_complete() {
    const ac = ensureContext();
    const t = ac.currentTime;
    [392, 494, 587, 784].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.2;
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12 * (i + 1) + 0.2);
      osc.connect(gain);
      gain.connect(sfxGain!);
      osc.start(t + 0.12 * i);
      osc.stop(t + 0.12 * (i + 1) + 0.2);
    });
  },
  achievement() {
    playChirp(500, 1000, 0.15, 'sine');
    setTimeout(() => playChirp(700, 1200, 0.2, 'triangle'), 150);
  },
  error() {
    playTone(200, 0.15, 'square');
    setTimeout(() => playTone(150, 0.2, 'square'), 150);
  },
};

// Throttle: prevent SFX spam (max 1 per type per 50ms)
const _lastPlayTime: Partial<Record<SFXType, number>> = {};
const SFX_THROTTLE_MS = 50;

/**
 * Play a sound effect by name.
 * Procedurally generated — no audio files required.
 */
export function playSFX(type: SFXType): void {
  const now = performance.now();
  const last = _lastPlayTime[type] ?? 0;
  if (now - last < SFX_THROTTLE_MS) return;
  _lastPlayTime[type] = now;

  try {
    SFX_GENERATORS[type]();
  } catch {
    // AudioContext may not be available
  }
}

/** Initialize audio on first user interaction (required by browsers) */
export function initAudio(): void {
  const unlock = () => {
    ensureContext();
    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}
