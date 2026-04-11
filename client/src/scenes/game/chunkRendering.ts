import Phaser from 'phaser';
import {
  MessageType,
  type ChunkDataPayload,
  type WebSocketClient,
} from '../../network/WebSocketClient';
import { worldToScreen } from '../../utils/IsoMath';
import { CHUNK_SIZE } from '../../utils/Constants';
import { pickPropForTile, propHash } from '../../theme/spriteMapping';
import { TERRAIN_ORIGIN_Y } from '../../theme/isometricAssetGenerator';

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

const WATER_FRAME_COUNT = 4;
const WATER_ANIM_INTERVAL = 220; // ms per frame (~4.5 fps)

export type RenderedChunkMap = Map<string, Phaser.GameObjects.Image[]>;
export type LoadedChunkSet = Set<string>;

// Track water tiles for animation
const waterTiles: { img: Phaser.GameObjects.Image; phase: number }[] = [];
let waterFrame = 0;
let waterTimer: Phaser.Time.TimerEvent | null = null;

function destroyChunkTiles(tiles: Phaser.GameObjects.Image[]): void {
  const tileSet = new Set(tiles);
  // Remove water tiles that belong to this chunk
  for (let i = waterTiles.length - 1; i >= 0; i--) {
    if (tileSet.has(waterTiles[i].img)) {
      waterTiles.splice(i, 1);
    }
  }
  tiles.forEach((tile) => tile.destroy());
}

function buildChunkTiles(
  scene: Phaser.Scene,
  baseX: number,
  baseY: number,
  tiles: number[][],
): Phaser.GameObjects.Image[] {
  const renderedTiles: Phaser.GameObjects.Image[] = [];

  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < (tiles[y]?.length ?? 0); x++) {
      const wx = baseX + x;
      const wy = baseY + y;
      const tileType = tiles[y][x];
      const screenPos = worldToScreen(wx, wy);

      // Water tiles use phase-offset animated frames
      const isWater = tileType === 1;
      const phase = isWater ? Math.floor(propHash(wx, wy, 77) * WATER_FRAME_COUNT) : 0;
      const tileKey = isWater ? `tile_water_${phase}` : (TILE_KEYS[tileType] || 'tile_grass');

      const tile = scene.add.image(screenPos.x, screenPos.y, tileKey);
      tile.setOrigin(0.5, TERRAIN_ORIGIN_Y);
      tile.setDepth(screenPos.y - 10000);
      renderedTiles.push(tile);

      if (isWater) {
        waterTiles.push({ img: tile, phase });
      }
      const propInfo = pickPropForTile(tileType, wx, wy);
      if (propInfo) {
        const prop = scene.add.image(screenPos.x, screenPos.y - 12, propInfo.sheet, propInfo.frame);
        prop.setOrigin(0.5, 1);
        prop.setScale(2.5);
        prop.setDepth(screenPos.y - 5000);
        prop.setAlpha(0.92);
        renderedTiles.push(prop);
      }
    }
  }

  return renderedTiles;
}

export function requestChunksAround(
  network: Pick<WebSocketClient, 'send'>,
  loadedChunks: LoadedChunkSet,
  cx: number,
  cy: number,
  radius = 2,
): void {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const key = `${cx + dx},${cy + dy}`;
      if (loadedChunks.has(key)) {
        continue;
      }

      loadedChunks.add(key);
      network.send(MessageType.RequestChunk, { chunkX: cx + dx, chunkY: cy + dy });
    }
  }
}

export function evictDistantChunks(
  chunkTiles: RenderedChunkMap,
  loadedChunks: LoadedChunkSet,
  cx: number,
  cy: number,
  maxDist = 4,
): void {
  for (const [key, tiles] of Array.from(chunkTiles.entries())) {
    const [chunkX, chunkY] = key.split(',').map(Number);
    if (Math.abs(chunkX - cx) <= maxDist && Math.abs(chunkY - cy) <= maxDist) {
      continue;
    }

    destroyChunkTiles(tiles);
    chunkTiles.delete(key);
    loadedChunks.delete(key);
  }
}

export function renderChunkData(
  scene: Phaser.Scene,
  chunkTiles: RenderedChunkMap,
  loadedChunks: LoadedChunkSet,
  chunk: ChunkDataPayload,
): void {
  const key = `${chunk.chunkX},${chunk.chunkY}`;
  const existing = chunkTiles.get(key);
  if (existing) {
    destroyChunkTiles(existing);
  }

  loadedChunks.add(key);
  const baseX = chunk.chunkX * CHUNK_SIZE;
  const baseY = chunk.chunkY * CHUNK_SIZE;
  const renderedTiles = buildChunkTiles(scene, baseX, baseY, chunk.tiles);
  chunkTiles.set(key, renderedTiles);
}

export function clearRenderedChunks(
  chunkTiles: RenderedChunkMap,
  loadedChunks: LoadedChunkSet,
): void {
  for (const tiles of chunkTiles.values()) {
    destroyChunkTiles(tiles);
  }

  chunkTiles.clear();
  loadedChunks.clear();
  waterTiles.length = 0;
}

/** Start cycling water tile textures. Call once from the game scene. */
export function startWaterAnimation(scene: Phaser.Scene): void {
  if (waterTimer) return;
  waterTimer = scene.time.addEvent({
    delay: WATER_ANIM_INTERVAL,
    loop: true,
    callback: () => {
      waterFrame = (waterFrame + 1) % WATER_FRAME_COUNT;
      for (const wt of waterTiles) {
        const frame = (wt.phase + waterFrame) % WATER_FRAME_COUNT;
        wt.img.setTexture(`tile_water_${frame}`);
      }
    },
  });
}

/** Stop water animation (on scene shutdown). */
export function stopWaterAnimation(): void {
  if (waterTimer) {
    waterTimer.destroy();
    waterTimer = null;
  }
  waterTiles.length = 0;
  waterFrame = 0;
}
