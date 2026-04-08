// Isometric math utilities
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

/** Convert world (grid) coords to screen (pixel) coords */
export function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  return {
    x: (wx - wy) * (TILE_WIDTH / 2),
    y: (wx + wy) * (TILE_HEIGHT / 2),
  };
}

/** Convert screen (pixel) coords to world (grid) coords */
export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx / (TILE_WIDTH / 2) + sy / (TILE_HEIGHT / 2)) / 2,
    y: (sy / (TILE_HEIGHT / 2) - sx / (TILE_WIDTH / 2)) / 2,
  };
}

/** Snap screen coords to nearest tile center */
export function snapToTile(sx: number, sy: number): { wx: number; wy: number } {
  const w = screenToWorld(sx, sy);
  return { wx: Math.round(w.x), wy: Math.round(w.y) };
}

/** Get screen position of a tile center */
export function tileCenterScreen(wx: number, wy: number): { x: number; y: number } {
  return worldToScreen(wx, wy);
}

/** Manhattan distance in isometric grid */
export function isoDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/** Euclidean distance in grid space */
export function gridDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}
