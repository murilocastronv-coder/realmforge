import Phaser from 'phaser';
import { WebSocketClient, MessageType, EntityState, ChunkDataPayload } from '../network/WebSocketClient';
import { worldToScreen, screenToWorld, TILE_WIDTH, TILE_HEIGHT } from '../utils/IsoMath';
import { CHUNK_SIZE, PLAYER_SPEED, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { InventoryUI, GameItem } from '../ui/Inventory';
import { EquipmentUI } from '../ui/Equipment';
import { StatsUI, PlayerStats } from '../ui/Stats';
import { BankUI } from '../ui/Bank';
import { ChatBox } from '../ui/ChatBox';
import { CraftingUI } from '../ui/Crafting';
import { MarketplaceUI } from '../ui/Marketplace';
import { HealthBars } from '../ui/HealthBars';
import { Minimap } from '../world/Minimap';
import { TutorialOverlay } from '../ui/Tutorial';

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

  // Tutorial overlay
  private tutorial!: TutorialOverlay;

  // WASD / Arrow key movement
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastMoveSendTime = 0;

  // Auras (visual range indicators)
  private attackAura!: Phaser.GameObjects.Graphics;
  private pickupAura!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(): void {
    this.network = this.registry.get('network') as WebSocketClient;
    this.playerId = this.registry.get('playerId') as string;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x111111);

    // Player sprite (48×54 texture, origin bottom-center)
    const screenPos = worldToScreen(0, 0);
    this.playerSprite = this.add.sprite(screenPos.x, screenPos.y - 27, 'player');
    this.playerSprite.setDepth(1000);
    this.playerSprite.setOrigin(0.5, 1);

    const username = this.registry.get('username') as string || 'Player';
    this.playerNameText = this.add.text(screenPos.x, screenPos.y - 60, username, {
      fontSize: '10px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1001);

    // Cursor highlight
    this.cursorHighlight = this.add.graphics();
    this.cursorHighlight.setDepth(999);
    this.drawCursorHighlight(0, 0);

    // Camera (no zoom — UI elements use GAME_WIDTH×GAME_HEIGHT coordinate space directly)
    this.cameras.main.startFollow(this.playerSprite, true, 0.1, 0.1);

    // Death overlay (hidden initially)
    this.deathOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH + 200, GAME_HEIGHT + 200, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(9000).setVisible(false);
    this.deathText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, '', {
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
    this.minimap = new Minimap(this, GAME_WIDTH - 150, 10);

    // Health bars (floating over entities)
    this.healthBars = new HealthBars(this);

    // Chat (bottom-left, above hints bar)
    this.chatBox = new ChatBox(this, this.network, 10, GAME_HEIGHT - 244);

    // Inventory (right side, toggled) — 356px wide
    this.inventoryUI = new InventoryUI(this, GAME_WIDTH - 370, 60);
    this.inventoryUI.setOnItemClick((item, index) => {
      if (this.bankUI.isVisible()) {
        // Bank is open — deposit item instead of equipping
        this.network.send(MessageType.BankDeposit, { inventorySlot: index });
      } else if (!item.slot) {
        // No equipment slot — it's a consumable, use it
        this.network.send(MessageType.UseItem, { action: 'use', slotIndex: index });
      } else {
        this.network.send(MessageType.EquipItem, { slotIndex: index });
      }
    });

    // Equipment (left of inventory, toggled) — 165px wide
    this.equipmentUI = new EquipmentUI(this, GAME_WIDTH - 550, 60);
    this.equipmentUI.setOnUnequip((slotId) => {
      this.network.send(MessageType.UnequipItem, { slot: slotId });
    });

    // Bank (centered, toggled) — ~393px wide
    this.bankUI = new BankUI(this, Math.floor((GAME_WIDTH - 400) / 2), 100);
    this.bankUI.setOnWithdraw((_item, index) => {
      this.network.send(MessageType.BankWithdraw, { bankSlot: index });
    });

    // Crafting (centered, toggled) — 300px wide
    this.craftingUI = new CraftingUI(this, Math.floor((GAME_WIDTH - 300) / 2), 100);
    this.craftingUI.setOnCraft((recipe) => {
      this.chatBox.addSystemMessage(`Crafting ${recipe.name}...`);
      this.network.send(MessageType.UseItem, { action: 'craft', recipeId: recipe.id });
    });

    // Marketplace (centered, toggled) — 400px wide
    this.marketplaceUI = new MarketplaceUI(this, Math.floor((GAME_WIDTH - 400) / 2), 80);
    this.marketplaceUI.setOnBuy((listing) => {
      this.chatBox.addSystemMessage(`Buying ${listing.item.name} for ${listing.price}g...`);
      this.network.send(MessageType.UseItem, { action: 'buy', listingId: listing.id });
    });

    // --- Input handling ---
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || this.isDead || this.tutorial?.isActive()) return;

      // Route clicks to UI panels if pointer is over one
      if (this.isPointerOverUI(pointer)) {
        this.handleUIClick(pointer.x, pointer.y);
        return;
      }

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

      // Clear auto-attack target when clicking to move
      this.selectedEntityId = null;

      // Move to clicked tile
      this.targetGridX = tileX;
      this.targetGridY = tileY;
      this.moveSeq++;
      this.network.send(MessageType.Move, {
        targetX: tileX, targetY: tileY, seq: this.moveSeq,
      });
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerOverUI(pointer)) {
        this.cursorHighlight.clear();
        return;
      }
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gridPos = screenToWorld(worldPoint.x, worldPoint.y);
      this.drawCursorHighlight(Math.round(gridPos.x), Math.round(gridPos.y));
    });

    // Keyboard shortcuts (only when chat not focused)
    const keys = this.input.keyboard!;
    keys.on('keydown-I', () => { if (!this.chatBox.isFocused()) this.inventoryUI.toggle(); });
    keys.on('keydown-E', () => { if (!this.chatBox.isFocused()) this.equipmentUI.toggle(); });
    keys.on('keydown-B', () => { if (!this.chatBox.isFocused()) this.bankUI.toggle(); });
    keys.on('keydown-C', () => { if (!this.chatBox.isFocused()) this.craftingUI.toggle(); });
    keys.on('keydown-M', () => { if (!this.chatBox.isFocused()) this.marketplaceUI.toggle(); });
    keys.on('keydown-ESC', () => this.closeAllPanels());

    // WASD + Arrow key references for movement polling
    this.keyW = keys.addKey(Phaser.Input.Keyboard.KeyCodes.W, false);
    this.keyA = keys.addKey(Phaser.Input.Keyboard.KeyCodes.A, false);
    this.keyS = keys.addKey(Phaser.Input.Keyboard.KeyCodes.S, false);
    this.keyD = keys.addKey(Phaser.Input.Keyboard.KeyCodes.D, false);
    this.cursors = keys.createCursorKeys();

    // Player auras (attack range + pickup range)
    this.attackAura = this.add.graphics().setDepth(998);
    this.pickupAura = this.add.graphics().setDepth(997);

    // Keyboard hints HUD bar (bottom of screen)
    const hintsText = '  WASD/Arrows: Move  |  I: Inventory  |  E: Equipment  |  B: Bank  |  C: Craft  |  M: Market  |  ENTER: Chat  |  ESC: Close  ';
    const hintsBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 12, GAME_WIDTH, 24, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(2500).setOrigin(0.5, 0.5);
    const hintsLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 12, hintsText, {
      fontSize: '11px', color: '#99aabb', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(2501).setOrigin(0.5, 0.5);

    // Network handlers
    this.setupNetworkHandlers();

    // Generate initial chunks — server sends initial 5×5 on auth,
    // and requestChunksAround handles requesting any missing
    this.requestChunksAround(0, 0);

    // Welcome messages
    this.chatBox.addSystemMessage('Welcome to RealmForge! Use WASD/Arrows or click to move. Auto-attack nearby enemies!');
    this.chatBox.addSystemMessage('Keys: I=Inventory E=Equipment B=Bank C=Craft M=Market');
    this.chatBox.addSystemMessage('Click enemies to attack. ENTER to chat. /tutorial to replay guide.');

    // Tutorial overlay (shows once for new players)
    this.tutorial = new TutorialOverlay(this, this.playerId);
    this.tutorial.startIfNew();

    // Register /tutorial chat command
    this.chatBox.registerCommand('/tutorial', () => {
      this.tutorial.start();
    });

    // Connection status overlay
    this.setupConnectionOverlay();
  }

  update(_time: number, delta: number): void {
    // Constant-speed movement: tiles per millisecond
    const moveStep = PLAYER_SPEED * (delta / 1000);
    // Remote entity interpolation uses proportional lerp (smoother for network entities)
    const remoteLerp = Math.min(0.15 * (delta / 16.67), 1.0);

    // Death timer countdown
    if (this.isDead) {
      this.respawnTimer -= delta / 1000;
      const secs = Math.max(0, Math.ceil(this.respawnTimer));
      this.deathText.setText(`💀 YOU DIED\nRespawning in ${secs}s...`);
    }

    // --- WASD / Arrow key movement ---
    if (!this.isDead && !this.chatBox.isFocused()) {
      let dx = 0;
      let dy = 0;
      if (this.keyW.isDown || this.cursors.up.isDown) dy -= 1;
      if (this.keyS.isDown || this.cursors.down.isDown) dy += 1;
      if (this.keyA.isDown || this.cursors.left.isDown) dx -= 1;
      if (this.keyD.isDown || this.cursors.right.isDown) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;

        // Move player directly at constant speed (matches server 3 tiles/sec)
        this.playerGridX += dx * moveStep;
        this.playerGridY += dy * moveStep;
        // Keep target ahead so click-to-move doesn't interfere
        this.targetGridX = this.playerGridX + dx * 2.0;
        this.targetGridY = this.playerGridY + dy * 2.0;

        // Throttle network sends to ~10/sec
        const now = _time;
        if (now - this.lastMoveSendTime > 100) {
          this.lastMoveSendTime = now;
          this.moveSeq++;
          this.network.send(MessageType.Move, {
            targetX: this.targetGridX, targetY: this.targetGridY, seq: this.moveSeq,
          });
        }
      } else {
        // No WASD held — move toward click target at constant speed
        const toTargetX = this.targetGridX - this.playerGridX;
        const toTargetY = this.targetGridY - this.playerGridY;
        const distToTarget = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
        if (distToTarget > 0.05) {
          const step = Math.min(moveStep, distToTarget);
          this.playerGridX += (toTargetX / distToTarget) * step;
          this.playerGridY += (toTargetY / distToTarget) * step;
        } else {
          this.playerGridX = this.targetGridX;
          this.playerGridY = this.targetGridY;
        }
      }
    } else if (!this.isDead) {
      // Chat focused or not moving — still interpolate toward target at constant speed
      const toTargetX = this.targetGridX - this.playerGridX;
      const toTargetY = this.targetGridY - this.playerGridY;
      const distToTarget = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
      if (distToTarget > 0.05) {
        const step = Math.min(moveStep, distToTarget);
        this.playerGridX += (toTargetX / distToTarget) * step;
        this.playerGridY += (toTargetY / distToTarget) * step;
      }
    }

    // Update player sprite position
    const screenPos = worldToScreen(this.playerGridX, this.playerGridY);
    this.playerSprite.setPosition(screenPos.x, screenPos.y - 27);
    this.playerNameText.setPosition(screenPos.x, screenPos.y - 60);
    this.playerSprite.setDepth(screenPos.y + 1000);
    this.playerNameText.setDepth(screenPos.y + 1001);

    // Draw player auras
    this.drawPlayerAuras(screenPos.x, screenPos.y);

    // Coords display
    this.coordsText.setText(
      `Pos: ${Math.round(this.playerGridX)}, ${Math.round(this.playerGridY)}`
    );

    // Interpolate remote entities + update health bars
    const minimapEntities: Array<{ x: number; y: number; type: string }> = [];

    this.entities.forEach((entity, id) => {
      const ex = Phaser.Math.Linear(entity.sprite.x, entity.targetX, remoteLerp);
      const ey = Phaser.Math.Linear(entity.sprite.y, entity.targetY, remoteLerp);
      entity.sprite.setPosition(ex, ey);
      entity.nameText.setPosition(ex, ey - 38);

      const depthBase = entity.entityType === 'player' ? 900 : 500;
      entity.sprite.setDepth(ey + depthBase);
      entity.nameText.setDepth(ey + depthBase + 1);

      // Update floating health bars for enemies
      if (entity.hp !== undefined && entity.maxHp !== undefined && entity.entityType === 'enemy') {
        this.healthBars.update(id, ex, ey - 42, entity.hp, entity.maxHp, ey + depthBase + 2);
      }

      // Collect for minimap
      minimapEntities.push({ x: entity.gridX, y: entity.gridY, type: entity.entityType });
    });

    // Update minimap
    this.minimap.update(this.playerGridX, this.playerGridY, minimapEntities);

    // Attack cooldown
    if (this.attackCooldown > 0) this.attackCooldown -= delta;

    // Auto-attack: if no target selected, find nearest enemy in range
    if (!this.selectedEntityId && this.attackCooldown <= 0 && !this.isDead) {
      let nearestId: string | null = null;
      let nearestDist = 2.5; // attack range (server uses 3.0, slightly less for latency margin)
      this.entities.forEach((entity, id) => {
        if (entity.entityType !== 'enemy') return;
        if (entity.hp !== undefined && entity.hp <= 0) return;
        const dist = Math.sqrt(
          Math.pow(this.playerGridX - entity.gridX, 2) +
          Math.pow(this.playerGridY - entity.gridY, 2)
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestId = id;
        }
      });
      if (nearestId) {
        this.selectedEntityId = nearestId;
      }
    }

    // Auto-attack selected target (skip while dead)
    if (this.selectedEntityId && this.attackCooldown <= 0 && !this.isDead) {
      const target = this.entities.get(this.selectedEntityId);
      if (target) {
        if (target.hp !== undefined && target.hp <= 0) {
          // Target is dead, clear selection
          this.selectedEntityId = null;
        } else {
          const dist = Math.sqrt(
            Math.pow(this.playerGridX - target.gridX, 2) +
            Math.pow(this.playerGridY - target.gridY, 2)
          );
          if (dist < 2.5) {
            if (target.entityType === 'enemy') {
              this.network.send(MessageType.Attack, { targetId: this.selectedEntityId });
            } else if (target.entityType === 'player') {
              this.network.send(MessageType.AttackPlayer, { targetId: this.selectedEntityId });
            }
            this.attackCooldown = 1000;
            this.showAttackEffect(target.sprite.x, target.sprite.y);
          }
        }
      } else {
        // Target entity no longer exists
        this.selectedEntityId = null;
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
    // Handle re-authentication (reconnect) — update playerId
    this.network.on(MessageType.AuthResult, (msg) => {
      try {
        const payload = msg.payload as { success: boolean; playerId?: string };
        if (payload.success && payload.playerId && payload.playerId !== this.playerId) {
          const oldId = this.playerId;
          this.playerId = payload.playerId;
          this.registry.set('playerId', payload.playerId);
          // Clean up old entity sprite if it exists
          const oldEntity = this.entities.get(oldId);
          if (oldEntity) {
            oldEntity.sprite.destroy();
            oldEntity.nameText.destroy();
            this.entities.delete(oldId);
          }
          this.chatBox.addSystemMessage('Reconnected successfully.');
        }
      } catch (e) {
        console.error('[GameScene] AuthResult reconnect error:', e);
      }
    });

    this.network.on(MessageType.EntityUpdate, (msg) => {
      try {
        const payload = msg.payload as { entities: EntityState[] };
        const seenIds = new Set<string>();

        for (const entity of payload.entities) {
          seenIds.add(entity.id);
          if (entity.id === this.playerId) {
            // Check if WASD keys are currently held — if so, client owns movement
            const wasdActive = !this.chatBox.isFocused() && (
              this.keyW.isDown || this.keyS.isDown || this.keyA.isDown || this.keyD.isDown ||
              this.cursors.up.isDown || this.cursors.down.isDown ||
              this.cursors.left.isDown || this.cursors.right.isDown
            );

            // Only accept server target if WASD is NOT active (click-to-move mode)
            if (!wasdActive && entity.targetX !== undefined && entity.targetY !== undefined) {
              this.targetGridX = entity.targetX;
              this.targetGridY = entity.targetY;
            }

            // Server position correction — only for large desync (>5 tiles = hard snap)
            // Moderate drift is expected since client predicts movement
            const drift = Math.sqrt(
              Math.pow(this.playerGridX - entity.x, 2) +
              Math.pow(this.playerGridY - entity.y, 2)
            );
            if (drift > 5.0) {
              // Extreme desync — hard snap
              this.playerGridX = entity.x;
              this.playerGridY = entity.y;
              this.targetGridX = entity.targetX ?? entity.x;
              this.targetGridY = entity.targetY ?? entity.y;
            } else if (drift > 2.0) {
              // Significant drift — gentle correction (5% pull)
              this.playerGridX = Phaser.Math.Linear(this.playerGridX, entity.x, 0.05);
              this.playerGridY = Phaser.Math.Linear(this.playerGridY, entity.y, 0.05);
            }
            // drift < 2.0: no correction — trust client prediction

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
      } catch (e) {
        console.error('[GameScene] EntityUpdate error:', e);
      }
    });

    this.network.on(MessageType.PlayerJoined, (msg) => {
      try {
        const { id, username } = msg.payload as { id: string; username: string };
        if (id !== this.playerId) {
          this.chatBox.addMessage('System', `${username} joined the world.`, 'system');
        }
      } catch (e) {
        console.error('[GameScene] PlayerJoined error:', e);
      }
    });

    this.network.on(MessageType.PlayerLeft, (msg) => {
      try {
        const { id } = msg.payload as { id: string };
        this.removeEntity(id);
      } catch (e) {
        console.error('[GameScene] PlayerLeft error:', e);
      }
    });

    this.network.on(MessageType.ChunkData, (msg) => {
      try {
        this.renderChunk(msg.payload as ChunkDataPayload);
      } catch (e) {
        console.error('[GameScene] ChunkData error:', e);
      }
    });

    this.network.on(MessageType.StatsUpdate, (msg) => {
      try {
        const stats = msg.payload as Partial<PlayerStats>;
        Object.assign(this.playerStats, stats);
        this.statsUI.updateStats(this.playerStats);
      } catch (e) {
        console.error('[GameScene] StatsUpdate error:', e);
      }
    });

    this.network.on(MessageType.LevelUp, (msg) => {
      try {
        const { level } = msg.payload as { level: number };
        this.playerStats.level = level;
        this.statsUI.updateStats(this.playerStats);
        this.chatBox.addMessage('System', `⭐ Level Up! You are now level ${level}!`, 'system');
        this.showLevelUpEffect();
      } catch (e) {
        console.error('[GameScene] LevelUp error:', e);
      }
    });

    this.network.on(MessageType.CombatEvent, (msg) => {
      try {
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
          this.showDamageNumber(this.playerSprite.x, this.playerSprite.y - 55, damage, isCrit);
        }
      } catch (e) {
        console.error('[GameScene] CombatEvent error:', e);
      }
    });

    this.network.on(MessageType.Death, (msg) => {
      try {
        const { killedBy } = (msg.payload || {}) as { killedBy?: string };
        this.isDead = true;
        this.respawnTimer = 5;
        this.selectedEntityId = null;
        this.deathOverlay.setVisible(true);
        this.deathText.setVisible(true);
        this.deathText.setText('💀 YOU DIED\nRespawning in 5s...');
        this.showDeathEffect(this.playerSprite.x, this.playerSprite.y);
        const deathMsg = killedBy
          ? `💀 Killed by ${killedBy}! Respawning at town...`
          : '💀 You died! Respawning at town...';
        this.chatBox.addMessage('System', deathMsg, 'combat');
      } catch (e) {
        console.error('[GameScene] Death error:', e);
      }
    });

    this.network.on(MessageType.ItemDrop, (msg) => {
      try {
        const { itemName, rarity } = msg.payload as { itemName: string; rarity: number };
        const rarityNames = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
        this.chatBox.addMessage('Loot', `Picked up ${rarityNames[rarity] || ''} ${itemName}`, 'system');
      } catch (e) {
        console.error('[GameScene] ItemDrop error:', e);
      }
    });

    this.network.on(MessageType.InventoryUpdate, (msg) => {
      try {
        const payload = msg.payload as {
          items: GameItem[];
          equipment?: Array<{ slot: string; item: GameItem }>;
          gold?: number;
        };
        // Sync inventory grid — place items at their correct slotIndex
        const paddedItems: (GameItem | null)[] = new Array(40).fill(null);
        for (const item of payload.items) {
          const idx = (item as any).slotIndex;
          if (typeof idx === 'number' && idx >= 0 && idx < 40) {
            paddedItems[idx] = item;
          }
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
      } catch (e) {
        console.error('[GameScene] InventoryUpdate error:', e);
      }
    });

    this.network.on(MessageType.Respawn, (msg) => {
      try {
        const { x, y } = msg.payload as { x: number; y: number };
        this.targetGridX = x;
        this.targetGridY = y;
        this.playerGridX = x;
        this.playerGridY = y;
        this.isDead = false;
        this.deathOverlay.setVisible(false);
        this.deathText.setVisible(false);
        this.chatBox.addSystemMessage('✅ You have respawned at town.');
      } catch (e) {
        console.error('[GameScene] Respawn error:', e);
      }
    });

    // Ground items nearby
    this.network.on(MessageType.GroundItems, (msg) => {
      try {
        const { items } = msg.payload as { items: Array<{ id: string; name: string; rarity: number; x: number; y: number }> };
        this.updateGroundItems(items);
      } catch (e) {
        console.error('[GameScene] GroundItems error:', e);
      }
    });

    // Bank contents update
    this.network.on(MessageType.BankUpdate, (msg) => {
      try {
        const { items } = msg.payload as { items: GameItem[] };
        this.bankUI.setItems(items);
      } catch (e) {
        console.error('[GameScene] BankUpdate error:', e);
      }
    });

    // XP Orb pickup — floating "+XP" text
    this.network.on(MessageType.XpOrbPickup, (msg) => {
      try {
        const { xp, x, y } = msg.payload as { xp: number; x: number; y: number };
        const pos = worldToScreen(x, y);
        const color = xp >= 60 ? '#cc66ff' : xp >= 20 ? '#44aaff' : '#44ff66';
        const floatText = this.add.text(pos.x, pos.y - 10, `+${xp} XP`, {
          fontSize: '12px', color, stroke: '#000000', strokeThickness: 3,
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(9000);
        this.tweens.add({
          targets: floatText, y: pos.y - 50, alpha: 0,
          duration: 1200, ease: 'Power2',
          onComplete: () => floatText.destroy(),
        });
      } catch (e) {
        console.error('[GameScene] XpOrbPickup error:', e);
      }
    });

    // NOTE: ChatMessage is handled directly by ChatBox (see ChatBox constructor).
    // No duplicate handler here to avoid double messages.
  }

  // --- Entity Management ---
  private updateRemoteEntity(entity: EntityState): void {
    const screenPos = worldToScreen(entity.x, entity.y);
    const targetX = screenPos.x;
    const targetY = screenPos.y - 27;

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

    const nameText = this.add.text(targetX, targetY - 38, displayName, {
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
      if (dx < 24 && dy < 36) return id;
    }
    return null;
  }

  /** Draw isometric ellipse auras around the player (attack + pickup ranges). */
  private drawPlayerAuras(sx: number, sy: number): void {
    this.attackAura.clear();
    this.pickupAura.clear();
    if (this.isDead) return;

    // Isometric projection: x-radius = range * TILE_WIDTH/2, y-radius = range * TILE_HEIGHT/2
    const attackRange = 2.5;
    const pickupRange = 1.5;

    // Attack aura (red, subtle)
    this.attackAura.lineStyle(1, 0xff4444, 0.25);
    this.attackAura.strokeEllipse(sx, sy, attackRange * TILE_WIDTH, attackRange * TILE_HEIGHT);

    // Pickup/XP orb aura (green, subtle)
    this.pickupAura.lineStyle(1, 0x44ff66, 0.3);
    this.pickupAura.strokeEllipse(sx, sy, pickupRange * TILE_WIDTH, pickupRange * TILE_HEIGHT);
  }

  /** Screen-space check: is pointer over any visible UI panel? */
  private isPointerOverUI(pointer: Phaser.Input.Pointer): boolean {
    const sx = pointer.x;
    const sy = pointer.y;
    // Define bounds for each panel: [x, y, w, h, visibleFn]
    const panels: [number, number, number, number, () => boolean][] = [
      [910, 60, 348, 255, () => this.inventoryUI.isVisible()],
      [730, 60, 165, 280, () => this.equipmentUI.isVisible()],
      [440, 100, 373, 341, () => this.bankUI.isVisible()],
      [490, 100, 300, 260, () => this.craftingUI.isVisible()],
      [440, 80, 400, 300, () => this.marketplaceUI.isVisible()],
      [10, 476, 360, 224, () => true], // chatBox always visible
      [10, 28, 160, 55, () => true],   // statsUI always visible
    ];
    for (const [px, py, pw, ph, vis] of panels) {
      if (vis() && sx >= px && sx <= px + pw && sy >= py && sy <= py + ph) {
        return true;
      }
    }
    return false;
  }

  /** Route a screen-space click to the correct UI panel's handleScreenClick. */
  private handleUIClick(screenX: number, screenY: number): void {
    // Check each panel in depth order (highest first for overlap)
    const panelMap: Array<{ x: number; y: number; w: number; h: number; vis: () => boolean; handler: (rx: number, ry: number) => boolean }> = [
      { x: 440, y: 80, w: 400, h: 300, vis: () => this.marketplaceUI.isVisible(), handler: (rx, ry) => this.marketplaceUI.handleScreenClick(rx, ry) },
      { x: 440, y: 100, w: 373, h: 341, vis: () => this.bankUI.isVisible(), handler: (rx, ry) => this.bankUI.handleScreenClick(rx, ry) },
      { x: 490, y: 100, w: 300, h: 260, vis: () => this.craftingUI.isVisible(), handler: (rx, ry) => this.craftingUI.handleScreenClick(rx, ry) },
      { x: 910, y: 60, w: 348, h: 255, vis: () => this.inventoryUI.isVisible(), handler: (rx, ry) => this.inventoryUI.handleScreenClick(rx, ry) },
      { x: 730, y: 60, w: 165, h: 280, vis: () => this.equipmentUI.isVisible(), handler: (rx, ry) => this.equipmentUI.handleScreenClick(rx, ry) },
    ];

    for (const panel of panelMap) {
      if (panel.vis() && screenX >= panel.x && screenX <= panel.x + panel.w && screenY >= panel.y && screenY <= panel.y + panel.h) {
        panel.handler(screenX - panel.x, screenY - panel.y);
        return;
      }
    }
    // Click was over chatbox or stats — just consume it (no routing needed)
  }

  private handleEntityClick(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    if (entity.entityType === 'enemy') {
      this.selectedEntityId = entityId;
      this.chatBox.addMessage('Target', `Targeting: ${entity.nameText.text}`, 'combat');
      const dist = Math.sqrt(
        Math.pow(this.playerGridX - entity.gridX, 2) +
        Math.pow(this.playerGridY - entity.gridY, 2)
      );
      if (dist < 2.5 && this.attackCooldown <= 0) {
        this.network.send(MessageType.Attack, { targetId: entityId });
        this.attackCooldown = 1000;
        this.showAttackEffect(entity.sprite.x, entity.sprite.y);
      } else if (dist >= 2.5) {
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
        if (dist < 2.5 && this.attackCooldown <= 0) {
          this.network.send(MessageType.AttackPlayer, { targetId: entityId });
          this.attackCooldown = 1000;
          this.showAttackEffect(entity.sprite.x, entity.sprite.y);
        } else if (dist >= 2.5) {
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
        const isXpOrb = item.name.startsWith('XP Orb');

        if (isXpOrb) {
          // XP orb — use glowing orb texture, no name label, floating bob animation
          const orbKey = item.rarity >= 3 ? 'xp_orb_purple' : item.rarity >= 2 ? 'xp_orb_blue' : 'xp_orb_green';
          const sprite = this.add.sprite(pos.x, pos.y, orbKey)
            .setDepth(pos.y - 5000)
            .setAlpha(0.85);

          // Gentle floating bob animation
          this.tweens.add({
            targets: sprite, y: pos.y - 4, duration: 800 + Math.random() * 400,
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });

          // Empty text placeholder (to keep the map structure consistent)
          const text = this.add.text(0, 0, '').setVisible(false);
          this.groundItems.set(item.id, { sprite, text });
        } else {
          // Normal item drop
          const color = this.RARITY_COLORS[item.rarity] ?? 0xffffff;

          const sprite = this.add.sprite(pos.x, pos.y, 'item_drop')
            .setDepth(pos.y - 5000)
            .setTint(color)
            .setInteractive({ useHandCursor: true });

          const text = this.add.text(pos.x, pos.y - 20, item.name, {
            fontSize: '8px', color: `#${color.toString(16).padStart(6, '0')}`,
            stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5).setDepth(pos.y - 4999);

          // Click to pick up
          sprite.on('pointerdown', () => {
            this.network.send(MessageType.PickupItem, { itemId: item.id });
          });

          this.groundItems.set(item.id, { sprite, text });
        }
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
          // Request chunk from server (authoritative terrain)
          this.network.send(MessageType.RequestChunk, { chunkX: cx + dx, chunkY: cy + dy });
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

    if (distFromCenter < 15) return 7; // town
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
    const overlay = this.add.rectangle(GAME_WIDTH / 2, 0, 260, 28, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(10000).setOrigin(0.5, 0).setVisible(false);
    const label = this.add.text(GAME_WIDTH / 2, 6, '', {
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
