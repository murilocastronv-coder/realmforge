// Game constants
export const SERVER_URL = 'ws://localhost:8080/ws';
export const TICK_RATE = 20; // Server ticks per second
export const TICK_MS = 1000 / TICK_RATE;

// Map
export const CHUNK_SIZE = 32;
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const VIEW_DISTANCE_CHUNKS = 3; // Chunks visible around player

// Player
export const PLAYER_SPEED = 3; // Tiles per second
export const INTERPOLATION_SPEED = 0.15;

// Colors by rarity
export const RARITY_COLORS: Record<number, number> = {
  0: 0xffffff, // Common - White
  1: 0x00ff00, // Uncommon - Green
  2: 0x0088ff, // Rare - Blue
  3: 0xaa00ff, // Epic - Purple
  4: 0xff8800, // Legendary - Orange
  5: 0xff0000, // Mythic - Red
};

// UI
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Level system
export const BASE_XP = 100;
export const XP_EXPONENT = 2.5;

export function xpToLevel(level: number): number {
  const scalingFactor = 1 + level / 100;
  return Math.floor(BASE_XP * Math.pow(level, XP_EXPONENT) * scalingFactor);
}

export function statGain(level: number, baseGain: number): number {
  if (level <= 50) {
    return baseGain * (1.0 - level * 0.005);
  }
  return baseGain * 0.75 * Math.pow(50 / level, 0.6);
}
