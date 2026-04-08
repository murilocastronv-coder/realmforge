import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT, worldToScreen } from '../utils/IsoMath';
import { CHUNK_SIZE } from '../utils/Constants';

const TILE_KEYS: Record<number, string> = {
  0: 'tile_grass',
  1: 'tile_water',
  2: 'tile_sand',
  3: 'tile_stone',
  4: 'tile_snow',
  5: 'tile_forest',
  6: 'tile_swamp',
  7: 'tile_town',
};

interface ChunkEntry {
  tiles: Phaser.GameObjects.Image[];
  decorations: Phaser.GameObjects.Image[];
  lastAccess: number;
}

/**
 * IsometricMap — manages chunk-based isometric tile rendering.
 * Loads/unloads chunks dynamically as the player moves.
 */
export class IsometricMap {
  private scene: Phaser.Scene;
  private chunks: Map<string, ChunkEntry> = new Map();
  private maxCachedChunks = 50;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Render a chunk from server data */
  renderServerChunk(chunkX: number, chunkY: number, tiles: number[][]): void {
    const key = `${chunkX},${chunkY}`;
    this.removeChunk(key);

    const entry: ChunkEntry = { tiles: [], decorations: [], lastAccess: Date.now() };
    const baseX = chunkX * CHUNK_SIZE;
    const baseY = chunkY * CHUNK_SIZE;

    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < (tiles[y]?.length ?? 0); x++) {
        const wx = baseX + x;
        const wy = baseY + y;
        const tileType = tiles[y][x];
        const tileKey = TILE_KEYS[tileType] || 'tile_grass';

        const screenPos = worldToScreen(wx, wy);
        const tile = this.scene.add.image(screenPos.x, screenPos.y, tileKey);
        tile.setOrigin(0.5, 0.5);
        tile.setDepth(screenPos.y - 10000); // tiles behind entities
        entry.tiles.push(tile);

        // Add decorations (trees on forest tiles, etc.)
        if (tileType === 5 && this.hashNoise(wx, wy) < 0.3) {
          this.addTreeDecoration(wx, wy, entry);
        }
      }
    }

    this.chunks.set(key, entry);
    this.evictOldChunks();
  }

  /** Generate a chunk locally using simple procedural generation */
  generateLocalChunk(chunkX: number, chunkY: number): void {
    const key = `${chunkX},${chunkY}`;
    if (this.chunks.has(key)) return;

    const tiles: number[][] = [];
    const baseX = chunkX * CHUNK_SIZE;
    const baseY = chunkY * CHUNK_SIZE;

    for (let y = 0; y < CHUNK_SIZE; y++) {
      tiles[y] = [];
      for (let x = 0; x < CHUNK_SIZE; x++) {
        tiles[y][x] = this.getProceduralTile(baseX + x, baseY + y);
      }
    }

    this.renderServerChunk(chunkX, chunkY, tiles);
  }

  /** Ensure chunks are loaded around a grid position */
  ensureChunksAround(gridX: number, gridY: number, radius = 2): void {
    const cx = Math.floor(gridX / CHUNK_SIZE);
    const cy = Math.floor(gridY / CHUNK_SIZE);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        if (!this.chunks.has(key)) {
          this.generateLocalChunk(cx + dx, cy + dy);
        } else {
          this.chunks.get(key)!.lastAccess = Date.now();
        }
      }
    }
  }

  hasChunk(chunkX: number, chunkY: number): boolean {
    return this.chunks.has(`${chunkX},${chunkY}`);
  }

  /** Check if a tile is walkable */
  isWalkable(wx: number, wy: number): boolean {
    const tile = this.getProceduralTile(Math.round(wx), Math.round(wy));
    return tile !== 1; // water is not walkable
  }

  private addTreeDecoration(wx: number, wy: number, entry: ChunkEntry): void {
    const screenPos = worldToScreen(wx, wy);
    // Create a simple tree using graphics texture if available
    if (this.scene.textures.exists('deco_tree')) {
      const tree = this.scene.add.image(screenPos.x, screenPos.y - 20, 'deco_tree');
      tree.setOrigin(0.5, 1);
      tree.setDepth(screenPos.y);
      entry.decorations.push(tree);
    }
  }

  private removeChunk(key: string): void {
    const entry = this.chunks.get(key);
    if (entry) {
      entry.tiles.forEach(t => t.destroy());
      entry.decorations.forEach(d => d.destroy());
      this.chunks.delete(key);
    }
  }

  private evictOldChunks(): void {
    if (this.chunks.size <= this.maxCachedChunks) return;

    const sorted = Array.from(this.chunks.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    const toRemove = sorted.slice(0, this.chunks.size - this.maxCachedChunks);
    for (const [key] of toRemove) {
      this.removeChunk(key);
    }
  }

  private getProceduralTile(x: number, y: number): number {
    const dist = Math.sqrt(x * x + y * y);
    if (dist < 8) return 7; // town

    const hash = this.simpleHash(x, y);
    const n = hash / 4294967296;

    const waterNoise = this.simpleHash(x * 3, y * 3 + 1000) / 4294967296;
    if (waterNoise < 0.08) return 1;

    const angle = Math.atan2(y, x);
    const biomeNoise = this.simpleHash(Math.floor(x / 10), Math.floor(y / 10) + 5000) / 4294967296;

    if (dist > 60) {
      if (biomeNoise < 0.3) return 4;
      if (biomeNoise < 0.5) return 3;
    }

    if (angle > 0 && angle < Math.PI / 2) {
      if (n < 0.4) return 5;
    } else if (angle > Math.PI / 2) {
      if (n < 0.3) return 2;
    } else if (angle < -Math.PI / 2) {
      if (n < 0.25) return 6;
    }

    return 0;
  }

  private simpleHash(x: number, y: number): number {
    let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return h >>> 0;
  }

  private hashNoise(x: number, y: number): number {
    return this.simpleHash(x * 7 + 333, y * 13 + 777) / 4294967296;
  }

  destroy(): void {
    for (const [key] of this.chunks) {
      this.removeChunk(key);
    }
  }
}
