import Phaser from 'phaser';
import { WebSocketClient, MessageType, EntityState, ChunkDataPayload } from '../network/WebSocketClient';
import { worldToScreen, screenToWorld, TILE_WIDTH, TILE_HEIGHT } from '../utils/IsoMath';
import { CHUNK_SIZE, INTERPOLATION_SPEED, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { InventoryUI, GameItem } from '../ui/Inventory';
import { EquipmentUI } from '../ui/Equipment';
import { StatsUI, PlayerStats } from '../ui/Stats';
import { BankUI } from '../ui/Bank';
import { ChatBox } from '../ui/ChatBox';
import { CraftingUI } from '../ui/Crafting';
import { MarketplaceUI } from '../ui/Marketplace';
import { HealthBars } from '../ui/HealthBars';
import { Minimap } from '../world/Minimap';

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
  targetX: number;
  targetY: number;
  entityType: string;
  level?: number;
  hp?: number;
  maxHp?: number;
  gridX: number;
  gridY: number;
}

/**
 * GameScene — Main game world with isometric rendering,
 * entity management, movement, combat, and all UI panels.
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
  private lastChunkX = 0;
  private lastChunkY = 0;

  // Remote entities
  private entities: Map<string, RemoteEntity> = new Map();

  // UI panels
  private inventoryUI!: InventoryUI;
  private equipmentUI!: EquipmentUI;
  private statsUI!: StatsUI;
  private bankUI!: BankUI;
  private chatBox!: ChatBox;
  private craftingUI!: CraftingUI;
  private marketplaceUI!: MarketplaceUI;
  private healthBars!: HealthBars;
  private minimap!: Minimap;
  private coordsText!: Phaser.GameObjects.Text;
  private moveSeq = 0;

  // Cursor tile highlight
  private cursorHighlight!: Phaser.GameObjects.Graphics;

  // Player stats cache
  private playerStats: PlayerStats = {
    hp: 200, maxHp: 200,
    mp: 80, maxMp: 80,
    level: 1, xp: 0, xpNeeded: 100,
    atk: 15, def: 10, spd: 12, lck: 5,
  };

  // Combat targeting
  private selectedEntityId: string | null = null;
  private attackCooldown = 0;
  private isDead = false;

  // Death overlay
  private deathOverlay!: Phaser.GameObjects.Rectangle;
  private deathText!: Phaser.GameObjects.Text;
  private respawnTimer = 0;

  // Ground items
  private groundItems: Map<string, { sprite: Phaser.GameObjects.Sprite; text: Phaser.GameObjects.Text }> = new Map();

  constructor() {
    super({ key: 'GameScene' });
  }

  init(): void {
    this.network = this.registry.get('network') as WebSocketClient;
    this.playerId = this.registry.get('playerId') as string;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x111111);

    // Player sprite
    const screenPos = worldToScreen(0, 0);
    this.playerSprite = this.add.sprite(screenPos.x, screenPos.y - 18, 'player');
    this.playerSprite.setDepth(1000);
    this.playerSprite.setOrigin(0.5, 1);

    const username = this.registry.get('username') as string || 'Player';
    this.playerNameText = this.add.text(screenPos.x, screenPos.y - 44, username, {
      fontSize: '10px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1001);

    // Cursor highlight
    this.cursorHighlight = this.add.graphics();
    this.cursorHighlight.setDepth(999);
    this.drawCursorHighlight(0, 0);

    // Camera
    this.cameras.main.startFollow(this.playerSprite, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.5);

    // Death overlay (hidden initially)
    const cam = this.cameras.main;
    this.deathOverlay = this.add.rectangle(cam.width / 2, cam.height / 2, cam.width + 200, cam.height + 200, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(9000).setVisible(false);
    this.deathText = this.add.text(cam.width / 2, cam.height / 2 - 20, '', {
      fontSize: '20px', color: '#ff4444', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(9001).setOrigin(0.5).setVisible(false);

    // --- Initialize all UI panels ---
    this.coordsText = this.add.text(10, 10, 'Pos: 0, 0', {
      fontSize: '11px', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(2000);

    // Stats HUD (top-left, below coords)
    this.statsUI = new StatsUI(this, 10, 28);
    this.statsUI.updateStats(this.playerStats);

    // Minimap (top-right)
    this.minimap = new Minimap(this, GAME_WIDTH / 1.5 - 150, 10);

    // Health bars (floating over entities)
    this.healthBars = new HealthBars(this);

    // Chat (bottom-left)
    this.chatBox = new ChatBox(this, this.network, 10, GAME_HEIGHT / 1.5 - 210);

    // Inventory (center-right, toggled)
    this.inventoryUI = new InventoryUI(this, GAME_WIDTH / 1.5 - 200, 180);
    this.inventoryUI.setOnItemClick((_item, index) => {
      // Double-click/right-click to equip — send equip request
      this.network.send(MessageType.EquipItem, { slot: index });
    });

    // Equipment (center-left of inventory, toggled)
    this.equipmentUI = new EquipmentUI(this, GAME_WIDTH / 1.5 - 380, 180);
    this.equipmentUI.setOnUnequip((slotId) => {
      this.network.send(MessageType.UnequipItem, { slot: slotId });
    });

    // Bank (center, toggled)
    this.bankUI = new BankUI(this, GAME_WIDTH / 3 - 200, 120);
    this.bankUI.setOnWithdraw((_item, index) => {
      this.network.send(MessageType.BankWithdraw, { slot: index });
    });

    // Crafting (center, toggled)
    this.craftingUI = new CraftingUI(this, GAME_WIDTH / 3 - 150, 120);
    this.craftingUI.setOnCraft((recipe) => {
      this.chatBox.addSystemMessage(`Crafting ${recipe.name}...`);
      this.network.send(MessageType.UseItem, { action: 'craft', recipeId: recipe.id });
    });

    // Marketplace (center, toggled)
    this.marketplaceUI = new MarketplaceUI(this, GAME_WIDTH / 3 - 200, 80);
    this.marketplaceUI.setOnBuy((listing) => {
      this.chatBox.addSystemMessage(`Buying ${listing.item.name} for ${listing.price}g...`);
      this.network.send(MessageType.UseItem, { action: 'buy', listingId: listing.id });
    });

    // --- Input handling ---
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || this.isDead) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gridPos = screenToWorld(worldPoint.x, worldPoint.y);
      const tileX = Math.round(gridPos.x);
      const tileY = Math.round(gridPos.y);

      // Check if clicking on an entity (attack/interact)
      const clickedEntity = this.findEntityAt(worldPoint.x, worldPoint.y);
      if (clickedEntity) {
        this.handleEntityClick(clickedEntity);
        return;
      }

      // Move to clicked tile
      this.targetGridX = tileX;
      this.targetGridY = tileY;
      this.moveSeq++;
      this.network.send(MessageType.Move, {
        targetX: tileX, targetY: tileY, seq: this.moveSeq,
      });
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gridPos = screenToWorld(worldPoint.x, worldPoint.y);
      this.drawCursorHighlight(Math.round(gridPos.x), Math.round(gridPos.y));
    });

    // Keyboard shortcuts
    const keys = this.input.keyboard!;
    keys.on('keydown-I', () => this.inventoryUI.toggle());
    keys.on('keydown-E', () => this.equipmentUI.toggle());
    keys.on('keydown-B', () => this.bankUI.toggle());
    keys.on('keydown-C', () => this.craftingUI.toggle());
    keys.on('keydown-M', () => this.marketplaceUI.toggle());
    keys.on('keydown-ESC', () => this.closeAllPanels());

    // Camera zoom
    this.input.on('wheel', (_pointer: unknown, _gos: unknown, _dx: number, dy: number) => {
      const zoom = this.cameras.main.zoom;
      this.cameras.main.setZoom(Phaser.Math.Clamp(zoom - dy * 0.001, 0.5, 3));
    });

    // Network handlers
    this.setupNetworkHandlers();

    // Generate initial chunks
    this.requestChunksAround(0, 0);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        this.generateLocalChunk(dx, dy);
      }
    }

    // Welcome messages
    this.chatBox.addSystemMessage('Welcome to RealmForge! Click to move.');
    this.chatBox.addSystemMessage('Keys: I=Inventory E=Equipment B=Bank C=Craft M=Market');
    this.chatBox.addSystemMessage('Click enemies to attack. ENTER to chat.');

    // Connection status overlay
    this.setupConnectionOverlay();
  }

  update(_time: number, delta: number): void {
    const speed = INTERPOLATION_SPEED * (delta / 16.67);

    // Death timer countdown
    if (this.isDead) {
      this.respawnTimer -= delta / 1000;
      const secs = Math.max(0, Math.ceil(this.respawnTimer));
      this.deathText.setText(`💀 YOU DIED\nRespawning in ${secs}s...`);
    }

    // Interpolate player
    this.playerGridX = Phaser.Math.Linear(this.playerGridX, this.targetGridX, speed);
    this.playerGridY = Phaser.Math.Linear(this.playerGridY, this.targetGridY, speed);
    const screenPos = worldToScreen(this.playerGridX, this.playerGridY);
    this.playerSprite.setPosition(screenPos.x, screenPos.y - 18);
    this.playerNameText.setPosition(screenPos.x, screenPos.y - 44);
    this.playerSprite.setDepth(screenPos.y + 1000);
    this.playerNameText.setDepth(screenPos.y + 1001);

    // Coords display
    this.coordsText.setText(
      `Pos: ${Math.round(this.playerGridX)}, ${Math.round(this.playerGridY)} | Zoom: ${this.cameras.main.zoom.toFixed(1)}x`
    );

    // Interpolate remote entities + update health bars
    const minimapEntities: Array<{ x: number; y: number; type: string }> = [];

    this.entities.forEach((entity, id) => {
      const ex = Phaser.Math.Linear(entity.sprite.x, entity.targetX, speed);
      const ey = Phaser.Math.Linear(entity.sprite.y, entity.targetY, speed);
      entity.sprite.setPosition(ex, ey);
      entity.nameText.setPosition(ex, ey - 26);

      const depthBase = entity.entityType === 'player' ? 900 : 500;
      entity.sprite.setDepth(ey + depthBase);
      entity.nameText.setDepth(ey + depthBase + 1);

      // Update floating health bars for enemies
      if (entity.hp !== undefined && entity.maxHp !== undefined && entity.entityType === 'enemy') {
        this.healthBars.update(id, ex, ey - 30, entity.hp, entity.maxHp, ey + depthBase + 2);
      }

      // Collect for minimap
      minimapEntities.push({ x: entity.gridX, y: entity.gridY, type: entity.entityType });
    });

    // Update minimap
    this.minimap.update(this.playerGridX, this.playerGridY, minimapEntities);

    // Attack cooldown
    if (this.attackCooldown > 0) this.attackCooldown -= delta;

    // Auto-attack selected target (skip while dead)
    if (this.selectedEntityId && this.attackCooldown <= 0 && !this.isDead) {
      const target = this.entities.get(this.selectedEntityId);
      if (target) {
        const dist = Math.sqrt(
          Math.pow(this.playerGridX - target.gridX, 2) +
          Math.pow(this.playerGridY - target.gridY, 2)
        );
        if (dist < 2) {
          if (target.entityType === 'enemy') {
            this.network.send(MessageType.Attack, { targetId: this.selectedEntityId });
          } else if (target.entityType === 'player') {
            this.network.send(MessageType.AttackPlayer, { targetId: this.selectedEntityId });
          }
          this.attackCooldown = 1000;
          this.showAttackEffect(target.sprite.x, target.sprite.y);
        }
      }
    }

    // Chunk loading
    const chunkX = Math.floor(this.playerGridX / CHUNK_SIZE);
    const chunkY = Math.floor(this.playerGridY / CHUNK_SIZE);
    if (chunkX !== this.lastChunkX || chunkY !== this.lastChunkY) {
      this.lastChunkX = chunkX;
      this.lastChunkY = chunkY;
      this.requestChunksAround(chunkX, chunkY);
      this.evictDistantChunks(chunkX, chunkY);
    }
  }

  // --- Network Handlers ---
  private setupNetworkHandlers(): void {
    this.network.on(MessageType.EntityUpdate, (msg) => {
      const payload = msg.payload as { entities: EntityState[] };
      const seenIds = new Set<string>();

      for (const entity of payload.entities) {
        seenIds.add(entity.id);
        if (entity.id === this.playerId) {
          this.targetGridX = entity.x;
          this.targetGridY = entity.y;
          if (entity.hp !== undefined) {
            this.playerStats.hp = entity.hp;
            this.playerStats.maxHp = entity.maxHp || 100;
            this.statsUI.updateStats(this.playerStats);
          }
          continue;
        }
        this.updateRemoteEntity(entity);
      }

      // Remove entities no longer visible from server
      for (const [id] of this.entities) {
        if (!seenIds.has(id)) {
          this.removeEntity(id);
        }
      }
    });

    this.network.on(MessageType.PlayerLeft, (msg) => {
      const { id } = msg.payload as { id: string };
      this.removeEntity(id);
    });

    this.network.on(MessageType.ChunkData, (msg) => {
      this.renderChunk(msg.payload as ChunkDataPayload);
    });

    this.network.on(MessageType.StatsUpdate, (msg) => {
      const stats = msg.payload as Partial<PlayerStats>;
      Object.assign(this.playerStats, stats);
      this.statsUI.updateStats(this.playerStats);
    });

    this.network.on(MessageType.LevelUp, (msg) => {
      const { level } = msg.payload as { level: number };
      this.playerStats.level = level;
      this.statsUI.updateStats(this.playerStats);
      this.chatBox.addMessage('System', `⭐ Level Up! You are now level ${level}!`, 'system');
      this.showLevelUpEffect();
    });

    this.network.on(MessageType.CombatEvent, (msg) => {
      const { attackerId, targetId, damage, isCrit } = msg.payload as {
        attackerId: string; targetId: string; damage: number; isCrit: boolean;
      };
      const target = this.entities.get(targetId);
      if (target) {
        this.showDamageNumber(target.sprite.x, target.sprite.y - 20, damage, isCrit);
        if (target.hp !== undefined) {
          target.hp = Math.max(0, target.hp - damage);
        }
      }
      if (targetId === this.playerId) {
        this.showDamageNumber(this.playerSprite.x, this.playerSprite.y - 40, damage, isCrit);
      }
    });

    this.network.on(MessageType.Death, (_msg) => {
      this.isDead = true;
      this.respawnTimer = 5;
      this.selectedEntityId = null;
      this.deathOverlay.setVisible(true);
      this.deathText.setVisible(true);
      this.deathText.setText('💀 YOU DIED\nRespawning in 5s...');
      this.showDeathEffect(this.playerSprite.x, this.playerSprite.y);
      this.chatBox.addMessage('System', '💀 You died! Respawning at town...', 'combat');
    });

    this.network.on(MessageType.ItemDrop, (msg) => {
      const { itemName, rarity } = msg.payload as { itemName: string; rarity: number };
      const rarityNames = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
      this.chatBox.addMessage('Loot', `Picked up ${rarityNames[rarity] || ''} ${itemName}`, 'system');
    });

    this.network.on(MessageType.InventoryUpdate, (msg) => {
      const payload = msg.payload as {
        items: GameItem[];
        equipment?: Array<{ slot: string; item: GameItem }>;
        gold?: number;
      };
      // Sync inventory grid
      const paddedItems: (GameItem | null)[] = new Array(40).fill(null);
      for (let i = 0; i < payload.items.length && i < 40; i++) {
        paddedItems[i] = payload.items[i];
      }
      this.inventoryUI.setItems(paddedItems);
      // Sync equipment
      if (payload.equipment) {
        this.equipmentUI.setAllEquipment(payload.equipment);
      }
      // Sync gold
      if (payload.gold !== undefined) {
        this.inventoryUI.setGold(payload.gold);
      }
    });

    this.network.on(MessageType.Respawn, (msg) => {
      const { x, y } = msg.payload as { x: number; y: number };
      this.targetGridX = x;
      this.targetGridY = y;
      this.playerGridX = x;
      this.playerGridY = y;
      this.isDead = false;
      this.deathOverlay.setVisible(false);
      this.deathText.setVisible(false);
      this.chatBox.addSystemMessage('✅ You have respawned at town.');
    });

    // Ground items nearby
    this.network.on(MessageType.GroundItems, (msg) => {
      const { items } = msg.payload as { items: Array<{ id: string; name: string; rarity: number; x: number; y: number }> };
      this.updateGroundItems(items);
    });

    // Bank contents update
    this.network.on(MessageType.BankUpdate, (msg) => {
      const { items } = msg.payload as { items: GameItem[] };
      this.bankUI.setItems(items);
    });

    // Chat messages
    this.network.on(MessageType.ChatMessage, (msg) => {
      const { sender, text, channel } = msg.payload as { sender: string; text: string; channel?: string };
      this.chatBox.addMessage(sender, text, channel || 'global');
    });
  }

  // --- Entity Management ---
  private updateRemoteEntity(entity: EntityState): void {
    const screenPos = worldToScreen(entity.x, entity.y);
    const targetX = screenPos.x;
    const targetY = screenPos.y - 18;

    if (this.entities.has(entity.id)) {
      const remote = this.entities.get(entity.id)!;
      remote.targetX = targetX;
      remote.targetY = targetY;
      remote.level = entity.level;
      remote.gridX = entity.x;
      remote.gridY = entity.y;
      if (entity.hp !== undefined) remote.hp = entity.hp;
      if (entity.maxHp !== undefined) remote.maxHp = entity.maxHp;
      return;
    }

    const textureKey = entity.entityType === 'player' ? 'player' : 'enemy_slime';
    const sprite = this.add.sprite(targetX, targetY, textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setInteractive({ useHandCursor: true });

    const nameColor = entity.entityType === 'player' ? '#88ccff' : '#ff6666';
    const displayName = entity.entityType === 'enemy'
      ? `${entity.name || 'Enemy'} [Lv.${entity.level || 1}]`
      : entity.name || 'Unknown';

    const nameText = this.add.text(targetX, targetY - 26, displayName, {
      fontSize: '9px', color: nameColor,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.entities.set(entity.id, {
      sprite, nameText, targetX, targetY,
      entityType: entity.entityType,
      level: entity.level,
      hp: entity.hp,
      maxHp: entity.maxHp,
      gridX: entity.x,
      gridY: entity.y,
    });
  }

  private removeEntity(id: string): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.sprite.destroy();
      entity.nameText.destroy();
      this.healthBars.remove(id);
      this.entities.delete(id);
      if (this.selectedEntityId === id) this.selectedEntityId = null;
    }
  }

  private findEntityAt(worldX: number, worldY: number): string | null {
    for (const [id, entity] of this.entities) {
      const dx = Math.abs(entity.sprite.x - worldX);
      const dy = Math.abs(entity.sprite.y - worldY);
      if (dx < 16 && dy < 24) return id;
    }
    return null;
  }

  private handleEntityClick(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    if (entity.entityType === 'enemy') {
      this.selectedEntityId = entityId;
      this.chatBox.addMessage('Target', `Targeting: ${entity.nameText.text}`, 'combat');
      // Immediate attack if in range
      const dist = Math.sqrt(
        Math.pow(this.playerGridX - entity.gridX, 2) +
        Math.pow(this.playerGridY - entity.gridY, 2)
      );
      if (dist < 2 && this.attackCooldown <= 0) {
        this.network.send(MessageType.Attack, { targetId: entityId });
        this.attackCooldown = 1000;
        this.showAttackEffect(entity.sprite.x, entity.sprite.y);
      } else if (dist >= 2) {
        // Move toward enemy
        this.targetGridX = entity.gridX;
        this.targetGridY = entity.gridY;
        this.moveSeq++;
        this.network.send(MessageType.Move, {
          targetX: entity.gridX, targetY: entity.gridY, seq: this.moveSeq,
        });
      }
    } else if (entity.entityType === 'player') {
      // Shift+click = PvP attack
      if (this.input.keyboard && this.input.keyboard.addKey('SHIFT').isDown) {
        this.selectedEntityId = entityId;
        this.chatBox.addMessage('PvP', `⚔️ Attacking player: ${entity.nameText.text}`, 'combat');
        const dist = Math.sqrt(
          Math.pow(this.playerGridX - entity.gridX, 2) +
          Math.pow(this.playerGridY - entity.gridY, 2)
        );
        if (dist < 2 && this.attackCooldown <= 0) {
          this.network.send(MessageType.AttackPlayer, { targetId: entityId });
          this.attackCooldown = 1000;
          this.showAttackEffect(entity.sprite.x, entity.sprite.y);
        } else if (dist >= 2) {
          this.targetGridX = entity.gridX;
          this.targetGridY = entity.gridY;
          this.moveSeq++;
          this.network.send(MessageType.Move, {
            targetX: entity.gridX, targetY: entity.gridY, seq: this.moveSeq,
          });
        }
      } else {
        this.chatBox.addMessage('Info', `Player: ${entity.nameText.text} [Lv.${entity.level || '?'}] (Shift+click to attack)`, 'system');
      }
    }
  }

  // --- Ground Items ---
  private readonly RARITY_COLORS: Record<number, number> = {
    0: 0xffffff, // Common - White
    1: 0x00ff00, // Uncommon - Green
    2: 0x4488ff, // Rare - Blue
    3: 0xaa44ff, // Epic - Purple
    4: 0xff8800, // Legendary - Orange
    5: 0xff0044, // Mythic - Red
  };

  private updateGroundItems(items: Array<{ id: string; name: string; rarity: number; x: number; y: number }>): void {
    const currentIds = new Set(items.map(i => i.id));

    // Remove items no longer present
    for (const [id, gfx] of this.groundItems.entries()) {
      if (!currentIds.has(id)) {
        gfx.sprite.destroy();
        gfx.text.destroy();
        this.groundItems.delete(id);
      }
    }

    // Add/update items
    for (const item of items) {
      if (!this.groundItems.has(item.id)) {
        const pos = worldToScreen(item.x, item.y);
        const color = this.RARITY_COLORS[item.rarity] ?? 0xffffff;

        const sprite = this.add.sprite(pos.x, pos.y, 'item_drop')
          .setDepth(500)
          .setTint(color)
          .setInteractive({ useHandCursor: true });

        const text = this.add.text(pos.x, pos.y - 14, item.name, {
          fontSize: '8px', color: `#${color.toString(16).padStart(6, '0')}`,
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(501);

        // Click to pick up
        sprite.on('pointerdown', () => {
          this.network.send(MessageType.PickupItem, { itemId: item.id });
        });

        this.groundItems.set(item.id, { sprite, text });
      }
    }
  }

  // --- Chunk Management ---
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

  private evictDistantChunks(cx: number, cy: number): void {
    const maxDist = 4;
    for (const [key, tiles] of this.chunkTiles) {
      const [ckx, cky] = key.split(',').map(Number);
      if (Math.abs(ckx - cx) > maxDist || Math.abs(cky - cy) > maxDist) {
        tiles.forEach(t => t.destroy());
        this.chunkTiles.delete(key);
        this.loadedChunks.delete(key);
      }
    }
  }

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
        const tileType = this.getProceduralTile(wx, wy);
        const tileKey = TILE_KEYS[tileType] || 'tile_grass';
        const screenPos = worldToScreen(wx, wy);
        const tile = this.add.image(screenPos.x, screenPos.y, tileKey);
        tile.setOrigin(0.5, 0.5);
        tile.setDepth(screenPos.y - 10000);
        tiles.push(tile);
      }
    }
    this.chunkTiles.set(key, tiles);
  }

  private renderChunk(chunk: ChunkDataPayload): void {
    const key = `${chunk.chunkX},${chunk.chunkY}`;
    const existing = this.chunkTiles.get(key);
    if (existing) existing.forEach(t => t.destroy());

    const tiles: Phaser.GameObjects.Image[] = [];
    const baseX = chunk.chunkX * CHUNK_SIZE;
    const baseY = chunk.chunkY * CHUNK_SIZE;

    for (let y = 0; y < chunk.tiles.length; y++) {
      for (let x = 0; x < chunk.tiles[y].length; x++) {
        const wx = baseX + x;
        const wy = baseY + y;
        const tileKey = TILE_KEYS[chunk.tiles[y][x]] || 'tile_grass';
        const screenPos = worldToScreen(wx, wy);
        const tile = this.add.image(screenPos.x, screenPos.y, tileKey);
        tile.setOrigin(0.5, 0.5);
        tile.setDepth(screenPos.y - 10000);
        tiles.push(tile);
      }
    }
    this.chunkTiles.set(key, tiles);
  }

  // --- Visual Effects ---
  private showLevelUpEffect(): void {
    const { x, y } = this.playerSprite;

    // Text banner
    const text = this.add.text(x, y - 60, '⭐ LEVEL UP! ⭐', {
      fontSize: '18px', color: '#ffdd00', stroke: '#000', strokeThickness: 4,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(5000);

    this.tweens.add({
      targets: text, y: y - 130, alpha: 0,
      duration: 2500, ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    // Star particle burst
    this.spawnParticleBurst(x, y - 20, 'particle_star', 0xffdd00, 18, 80, 1500);

    // Golden ring expanding outward
    const ring = this.add.circle(x, y, 5, 0xffdd00, 0.6).setDepth(4999);
    this.tweens.add({
      targets: ring, scaleX: 8, scaleY: 4, alpha: 0,
      duration: 800, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private showDamageNumber(x: number, y: number, damage: number, isCrit: boolean): void {
    const color = isCrit ? '#ff4444' : '#ffffff';
    const prefix = isCrit ? '💥 CRIT! ' : '';
    const size = isCrit ? '16px' : '11px';
    const text = this.add.text(x + Phaser.Math.Between(-10, 10), y, `${prefix}-${damage}`, {
      fontSize: size, color, stroke: '#000', strokeThickness: 2,
      fontStyle: isCrit ? 'bold' : 'normal',
    }).setOrigin(0.5).setDepth(6000);

    // Bounce up then fall
    this.tweens.add({
      targets: text,
      y: y - (isCrit ? 55 : 35),
      alpha: 0,
      duration: isCrit ? 1500 : 1000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    // Blood splat for big hits
    if (isCrit) {
      this.spawnParticleBurst(x, y, 'particle_blood', 0xcc0000, 8, 30, 600);
    }
  }

  private showAttackEffect(x: number, y: number): void {
    const slash = this.add.text(x, y - 12, '⚔️', {
      fontSize: '18px',
    }).setOrigin(0.5).setDepth(5500);

    this.tweens.add({
      targets: slash, alpha: 0, scale: 1.8, rotation: 0.3,
      duration: 350,
      onComplete: () => slash.destroy(),
    });

    // Combat sparks
    this.spawnParticleBurst(x, y - 8, 'particle_spark', 0xffffaa, 6, 25, 400);
  }

  private showLootPickupEffect(x: number, y: number, rarityColor: number): void {
    this.spawnParticleBurst(x, y, 'particle_glow', rarityColor, 10, 40, 800);
  }

  private showDeathEffect(x: number, y: number): void {
    // Skull emoji
    const skull = this.add.text(x, y - 20, '💀', { fontSize: '24px' })
      .setOrigin(0.5).setDepth(5500);
    this.tweens.add({
      targets: skull, y: y - 80, alpha: 0, scale: 1.5,
      duration: 2000, ease: 'Power2',
      onComplete: () => skull.destroy(),
    });
    // Red flash
    this.spawnParticleBurst(x, y, 'particle_blood', 0xcc0000, 20, 50, 1000);
  }

  /** Spawn a burst of particles that fly outward and fade */
  private spawnParticleBurst(
    cx: number, cy: number, texture: string,
    tint: number, count: number, radius: number, duration: number
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = radius * (0.5 + Math.random() * 0.5);
      const p = this.add.image(cx, cy, texture)
        .setTint(tint).setAlpha(0.9).setScale(0.5 + Math.random() * 0.5)
        .setDepth(5800);
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist * 0.5, // flatten for iso
        alpha: 0,
        scale: 0.1,
        duration: duration * (0.7 + Math.random() * 0.6),
        ease: 'Power2',
        onComplete: () => p.destroy(),
      });
    }
  }

  // --- Utility ---
  private closeAllPanels(): void {
    if (this.inventoryUI.isVisible()) this.inventoryUI.toggle();
    if (this.equipmentUI.isVisible()) this.equipmentUI.toggle();
    if (this.bankUI.isVisible()) this.bankUI.toggle();
    if (this.craftingUI.isVisible()) this.craftingUI.toggle();
    if (this.marketplaceUI.isVisible()) this.marketplaceUI.toggle();
  }

  private getProceduralTile(x: number, y: number): number {
    const hash = this.simpleHash(x, y);
    const distFromCenter = Math.sqrt(x * x + y * y);

    if (distFromCenter < 8) return 7; // town
    const waterNoise = this.simpleHash(x * 3, y * 3 + 1000) / 4294967296;
    if (waterNoise < 0.08) return 1; // water

    const angle = Math.atan2(y, x);
    const biomeNoise = this.simpleHash(Math.floor(x / 10), Math.floor(y / 10) + 5000) / 4294967296;

    if (distFromCenter > 60) {
      if (biomeNoise < 0.3) return 4; // snow
      if (biomeNoise < 0.5) return 3; // stone
    }

    if (angle > 0 && angle < Math.PI / 2) {
      if (hash / 4294967296 < 0.4) return 5; // forest
    } else if (angle > Math.PI / 2) {
      if (hash / 4294967296 < 0.3) return 2; // sand
    } else if (angle < -Math.PI / 2) {
      if (hash / 4294967296 < 0.25) return 6; // swamp
    }

    return 0; // grass
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

  private setupConnectionOverlay(): void {
    const { width } = this.cameras.main;
    const overlay = this.add.rectangle(width / 2, 0, 260, 28, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(10000).setOrigin(0.5, 0).setVisible(false);
    const label = this.add.text(width / 2, 6, '', {
      fontSize: '12px', color: '#ff6644', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(10001).setOrigin(0.5, 0).setVisible(false);

    this.network.onStatusChange((status) => {
      if (status === 'connected') {
        overlay.setVisible(false);
        label.setVisible(false);
        this.chatBox.addSystemMessage('✅ Reconnected to server.');
      } else if (status === 'reconnecting') {
        overlay.setVisible(true);
        label.setVisible(true);
        label.setText('⟳ Reconnecting to server...');
        label.setColor('#ffaa44');
      } else {
        overlay.setVisible(true);
        label.setVisible(true);
        label.setText('⚠ Disconnected from server');
        label.setColor('#ff4444');
      }
    });
  }
}
