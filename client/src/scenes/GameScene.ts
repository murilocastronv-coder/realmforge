import Phaser from 'phaser';
import { WebSocketClient, MessageType, EntityState, ChunkDataPayload } from '../network/WebSocketClient';
import { worldToScreen, screenToWorld, TILE_WIDTH, TILE_HEIGHT } from '../utils/IsoMath';
import { CHUNK_SIZE, INTERPOLATION_SPEED, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';

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

interface RemoteEntity {
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  hpBar?: Phaser.GameObjects.Graphics;
  targetX: number;
  targetY: number;
  entityType: string;
  level?: number;
}

/**
 * GameScene — Main game world with isometric rendering,
 * entity management, movement, and camera.
 */
export class GameScene extends Phaser.Scene {
  private network!: WebSocketClient;
  private playerId!: string;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerNameText!: Phaser.GameObjects.Text;

  // World position (grid coords)
  private playerGridX = 0;
  private playerGridY = 0;
  private targetGridX = 0;
  private targetGridY = 0;

  // Loaded chunks
  private chunkTiles: Map<string, Phaser.GameObjects.Image[]> = new Map();
  private loadedChunks: Set<string> = new Set();

  // Remote entities
  private entities: Map<string, RemoteEntity> = new Map();

  // UI elements
  private coordsText!: Phaser.GameObjects.Text;
  private chatMessages: Phaser.GameObjects.Text[] = [];
  private chatContainer!: Phaser.GameObjects.Container;
  private moveSeq = 0;

  // Cursor tile highlight
  private cursorHighlight!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(): void {
    this.network = this.registry.get('network') as WebSocketClient;
    this.playerId = this.registry.get('playerId') as string;
  }

  create(): void {
    // Camera setup
    this.cameras.main.setBackgroundColor(0x111111);

    // Create player sprite at origin
    const screenPos = worldToScreen(0, 0);
    this.playerSprite = this.add.sprite(screenPos.x, screenPos.y - 18, 'player');
    this.playerSprite.setDepth(1000);
    this.playerSprite.setOrigin(0.5, 1);

    const username = this.registry.get('username') as string || 'Player';
    this.playerNameText = this.add.text(screenPos.x, screenPos.y - 44, username, {
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1001);

    // Cursor highlight
    this.cursorHighlight = this.add.graphics();
    this.cursorHighlight.setDepth(999);
    this.drawCursorHighlight(0, 0);

    // Camera follows player
    this.cameras.main.startFollow(this.playerSprite, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.5);

    // UI - coordinates display
    this.coordsText = this.add.text(10, 10, 'Pos: 0, 0', {
      fontSize: '11px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(2000);

    // Chat container (fixed on screen)
    this.chatContainer = this.add.container(10, GAME_HEIGHT / 1.5 - 100);
    this.chatContainer.setScrollFactor(0);
    this.chatContainer.setDepth(2000);

    // Input handling - click to move
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gridPos = screenToWorld(worldPoint.x, worldPoint.y);
      const tileX = Math.round(gridPos.x);
      const tileY = Math.round(gridPos.y);

      this.targetGridX = tileX;
      this.targetGridY = tileY;
      this.moveSeq++;

      this.network.send(MessageType.Move, {
        targetX: tileX,
        targetY: tileY,
        seq: this.moveSeq,
      });
    });

    // Hover to show cursor
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gridPos = screenToWorld(worldPoint.x, worldPoint.y);
      this.drawCursorHighlight(Math.round(gridPos.x), Math.round(gridPos.y));
    });

    // Keyboard shortcuts
    const keys = this.input.keyboard!;
    keys.on('keydown-ENTER', () => this.openChat());
    keys.on('keydown-I', () => this.toggleInventory());
    keys.on('keydown-B', () => this.toggleBank());

    // Camera zoom with scroll
    this.input.on('wheel', (_pointer: unknown, _gos: unknown, _dx: number, dy: number) => {
      const zoom = this.cameras.main.zoom;
      const newZoom = Phaser.Math.Clamp(zoom - dy * 0.001, 0.5, 3);
      this.cameras.main.setZoom(newZoom);
    });

    // Network handlers
    this.setupNetworkHandlers();

    // Request initial chunks around spawn
    this.requestChunksAround(0, 0);

    // Generate initial chunk locally as fallback
    this.generateLocalChunk(0, 0);
    this.generateLocalChunk(-1, 0);
    this.generateLocalChunk(0, -1);
    this.generateLocalChunk(-1, -1);
    this.generateLocalChunk(1, 0);
    this.generateLocalChunk(0, 1);
    this.generateLocalChunk(1, 1);
    this.generateLocalChunk(-1, 1);
    this.generateLocalChunk(1, -1);

    this.addChatMessage('[System] Welcome to RealmForge! Click to move.', '#ffcc44');
    this.addChatMessage('[System] Press ENTER to chat, I for inventory, B for bank.', '#888888');
  }

  update(_time: number, delta: number): void {
    // Smoothly interpolate player position toward target
    const speed = INTERPOLATION_SPEED * (delta / 16.67);
    this.playerGridX = Phaser.Math.Linear(this.playerGridX, this.targetGridX, speed);
    this.playerGridY = Phaser.Math.Linear(this.playerGridY, this.targetGridY, speed);

    const screenPos = worldToScreen(this.playerGridX, this.playerGridY);
    this.playerSprite.setPosition(screenPos.x, screenPos.y - 18);
    this.playerNameText.setPosition(screenPos.x, screenPos.y - 44);

    // Update depth sort based on Y position
    this.playerSprite.setDepth(screenPos.y + 1000);
    this.playerNameText.setDepth(screenPos.y + 1001);

    // Update coordinates display
    this.coordsText.setText(
      `Pos: ${Math.round(this.playerGridX)}, ${Math.round(this.playerGridY)} | Zoom: ${this.cameras.main.zoom.toFixed(1)}x`
    );

    // Interpolate remote entities
    this.entities.forEach((entity) => {
      const ex = Phaser.Math.Linear(entity.sprite.x, entity.targetX, speed);
      const ey = Phaser.Math.Linear(entity.sprite.y, entity.targetY, speed);
      entity.sprite.setPosition(ex, ey);
      entity.nameText.setPosition(ex, ey - 26);
      entity.sprite.setDepth(ey + (entity.entityType === 'player' ? 900 : 500));
      entity.nameText.setDepth(ey + (entity.entityType === 'player' ? 901 : 501));
    });

    // Check if we need to load new chunks
    const chunkX = Math.floor(this.playerGridX / CHUNK_SIZE);
    const chunkY = Math.floor(this.playerGridY / CHUNK_SIZE);
    this.requestChunksAround(chunkX, chunkY);
  }

  private setupNetworkHandlers(): void {
    this.network.on(MessageType.EntityUpdate, (msg) => {
      const payload = msg.payload as { entities: EntityState[] };
      for (const entity of payload.entities) {
        if (entity.id === this.playerId) {
          // Update local player from server (reconciliation)
          this.targetGridX = entity.x;
          this.targetGridY = entity.y;
          continue;
        }
        this.updateRemoteEntity(entity);
      }
    });

    this.network.on(MessageType.PlayerLeft, (msg) => {
      const { id } = msg.payload as { id: string };
      this.removeEntity(id);
    });

    this.network.on(MessageType.ChunkData, (msg) => {
      const chunk = msg.payload as ChunkDataPayload;
      this.renderChunk(chunk);
    });

    this.network.on(MessageType.ChatMessage, (msg) => {
      const { sender, text, channel } = msg.payload as { sender: string; text: string; channel: string };
      const color = channel === 'global' ? '#ffffff' : channel === 'system' ? '#ffcc44' : '#88ff88';
      this.addChatMessage(`[${sender}]: ${text}`, color);
    });

    this.network.on(MessageType.LevelUp, (msg) => {
      const { level } = msg.payload as { level: number };
      this.addChatMessage(`⭐ Level Up! You are now level ${level}!`, '#ffdd00');
      // Particle effect
      this.showLevelUpEffect();
    });

    this.network.on(MessageType.Death, (msg) => {
      const { killedBy } = msg.payload as { killedBy?: string };
      if (killedBy) {
        this.addChatMessage(`💀 You were killed by ${killedBy}!`, '#ff4444');
      } else {
        this.addChatMessage('💀 You died!', '#ff4444');
      }
    });
  }

  private updateRemoteEntity(entity: EntityState): void {
    const screenPos = worldToScreen(entity.x, entity.y);
    const targetX = screenPos.x;
    const targetY = screenPos.y - 18;

    if (this.entities.has(entity.id)) {
      const remote = this.entities.get(entity.id)!;
      remote.targetX = targetX;
      remote.targetY = targetY;
      remote.level = entity.level;
      return;
    }

    // Create new remote entity
    const textureKey = entity.entityType === 'player' ? 'player' : 'enemy_slime';
    const sprite = this.add.sprite(targetX, targetY, textureKey);
    sprite.setOrigin(0.5, 1);

    const nameColor = entity.entityType === 'player' ? '#88ccff' : '#ff6666';
    const displayName = entity.entityType === 'enemy'
      ? `${entity.name || 'Enemy'} [Lv.${entity.level || 1}]`
      : entity.name || 'Unknown';

    const nameText = this.add.text(targetX, targetY - 26, displayName, {
      fontSize: '9px',
      color: nameColor,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.entities.set(entity.id, {
      sprite,
      nameText,
      targetX,
      targetY,
      entityType: entity.entityType,
      level: entity.level,
    });
  }

  private removeEntity(id: string): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.sprite.destroy();
      entity.nameText.destroy();
      entity.hpBar?.destroy();
      this.entities.delete(id);
    }
  }

  private requestChunksAround(cx: number, cy: number): void {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        if (!this.loadedChunks.has(key)) {
          this.loadedChunks.add(key);
          this.generateLocalChunk(cx + dx, cy + dy);
        }
      }
    }
  }

  /**
   * Generate a chunk locally using simple noise.
   * In production, the server sends this data.
   */
  private generateLocalChunk(chunkX: number, chunkY: number): void {
    const key = `${chunkX},${chunkY}`;
    if (this.chunkTiles.has(key)) return;

    const tiles: Phaser.GameObjects.Image[] = [];
    const baseX = chunkX * CHUNK_SIZE;
    const baseY = chunkY * CHUNK_SIZE;

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wy = baseY + y;

        // Simple procedural terrain
        const tileType = this.getProceduralTile(wx, wy);
        const tileKey = TILE_KEYS[tileType] || 'tile_grass';

        const screenPos = worldToScreen(wx, wy);
        const tile = this.add.image(screenPos.x, screenPos.y, tileKey);
        tile.setOrigin(0.5, 0.5);
        tile.setDepth(screenPos.y);
        tiles.push(tile);
      }
    }

    this.chunkTiles.set(key, tiles);
  }

  private renderChunk(chunk: ChunkDataPayload): void {
    const key = `${chunk.chunkX},${chunk.chunkY}`;
    // Remove existing tiles if any
    const existing = this.chunkTiles.get(key);
    if (existing) {
      existing.forEach(t => t.destroy());
    }

    const tiles: Phaser.GameObjects.Image[] = [];
    const baseX = chunk.chunkX * CHUNK_SIZE;
    const baseY = chunk.chunkY * CHUNK_SIZE;

    for (let y = 0; y < chunk.tiles.length; y++) {
      for (let x = 0; x < chunk.tiles[y].length; x++) {
        const wx = baseX + x;
        const wy = baseY + y;
        const tileType = chunk.tiles[y][x];
        const tileKey = TILE_KEYS[tileType] || 'tile_grass';

        const screenPos = worldToScreen(wx, wy);
        const tile = this.add.image(screenPos.x, screenPos.y, tileKey);
        tile.setOrigin(0.5, 0.5);
        tile.setDepth(screenPos.y);
        tiles.push(tile);
      }
    }

    this.chunkTiles.set(key, tiles);
  }

  /**
   * Simple procedural tile generation using hash-based noise.
   * Real implementation uses Simplex noise on the server.
   */
  private getProceduralTile(x: number, y: number): number {
    // Simple hash-based pseudo-noise
    const hash = this.simpleHash(x, y);
    const distFromCenter = Math.sqrt(x * x + y * y);

    // Town area near center
    if (distFromCenter < 8) return 7; // town

    // Water bodies
    const waterNoise = this.simpleHash(x * 3, y * 3 + 1000) / 4294967296;
    if (waterNoise < 0.08) return 1; // water

    // Biome zones based on distance and direction
    const angle = Math.atan2(y, x);
    const biomeNoise = this.simpleHash(Math.floor(x / 10), Math.floor(y / 10) + 5000) / 4294967296;

    if (distFromCenter > 60) {
      // Far zones: snow and stone
      if (biomeNoise < 0.3) return 4; // snow
      if (biomeNoise < 0.5) return 3; // stone
    }

    if (angle > 0 && angle < Math.PI / 2) {
      // NE quadrant: forest
      if (hash / 4294967296 < 0.4) return 5; // forest
    } else if (angle > Math.PI / 2) {
      // NW quadrant: sand/desert
      if (hash / 4294967296 < 0.3) return 2; // sand
    } else if (angle < -Math.PI / 2) {
      // SW quadrant: swamp
      if (hash / 4294967296 < 0.25) return 6; // swamp
    }

    return 0; // grass (default)
  }

  private simpleHash(x: number, y: number): number {
    let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return h >>> 0;
  }

  private drawCursorHighlight(wx: number, wy: number): void {
    this.cursorHighlight.clear();
    const pos = worldToScreen(wx, wy);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;

    this.cursorHighlight.lineStyle(2, 0xffffff, 0.6);
    this.cursorHighlight.beginPath();
    this.cursorHighlight.moveTo(pos.x, pos.y - hh);
    this.cursorHighlight.lineTo(pos.x + hw, pos.y);
    this.cursorHighlight.lineTo(pos.x, pos.y + hh);
    this.cursorHighlight.lineTo(pos.x - hw, pos.y);
    this.cursorHighlight.closePath();
    this.cursorHighlight.strokePath();
  }

  private addChatMessage(text: string, color = '#ffffff'): void {
    const maxMessages = 8;

    // Shift existing messages up
    if (this.chatMessages.length >= maxMessages) {
      const oldest = this.chatMessages.shift()!;
      oldest.destroy();
    }

    const msg = this.add.text(0, 0, text, {
      fontSize: '10px',
      color,
      stroke: '#000000',
      strokeThickness: 2,
      wordWrap: { width: 350 },
    }).setScrollFactor(0).setDepth(2001);

    this.chatMessages.push(msg);

    // Reposition all messages
    this.chatMessages.forEach((m, i) => {
      m.setPosition(10, GAME_HEIGHT / 1.5 - 100 + i * 16);
    });
  }

  private showLevelUpEffect(): void {
    const { x, y } = this.playerSprite;
    const text = this.add.text(x, y - 60, '⭐ LEVEL UP! ⭐', {
      fontSize: '16px',
      color: '#ffdd00',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(5000);

    this.tweens.add({
      targets: text,
      y: y - 120,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private openChat(): void {
    this.addChatMessage('[System] Chat input coming in Phase 9.', '#888888');
  }

  private toggleInventory(): void {
    this.addChatMessage('[System] Inventory UI coming in Phase 5.', '#888888');
  }

  private toggleBank(): void {
    this.addChatMessage('[System] Bank UI coming in Phase 7.', '#888888');
  }
}
