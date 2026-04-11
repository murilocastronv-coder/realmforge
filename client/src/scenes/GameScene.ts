import Phaser from 'phaser';
import {
  WebSocketClient,
  MessageType,
  EntityState,
  ChunkDataPayload,
  type MessageHandler,
} from '../network/WebSocketClient';
import { worldToScreen, screenToWorld, TILE_WIDTH, TILE_HEIGHT } from '../utils/IsoMath';
import { CHUNK_SIZE, PLAYER_SPEED } from '../utils/Constants';
import { HealthBars } from '../ui/HealthBars';
import { Minimap } from '../world/Minimap';
import type { GroundItemPayload } from '../types/gameData';
import { ISOMETRIC_THEME, hexColor } from '../theme/isometricTheme';
import { PLAYER_SPRITES } from '../theme/spriteMapping';
import {
  clearRenderedChunks as clearChunkTiles,
  evictDistantChunks as evictRenderedChunks,
  renderChunkData,
  requestChunksAround as requestChunkWindow,
  startWaterAnimation,
  stopWaterAnimation,
} from './game/chunkRendering';
import {
  findEntityAtPosition,
  interpolateRemoteEntities,
  removeMissingRemoteEntities,
  removeRemoteEntity,
  type RemoteEntity,
  upsertRemoteEntity,
} from './game/entityRendering';
import {
  clearGroundItemViews,
  findNearbyGroundItemId,
  type GroundItemView,
  updateGroundItemViews,
  updatePickupPrompt,
} from './game/groundItems';
import { registerGameSceneNetworkHandlers } from './game/networkHandlers';
import { GameSceneLifecycle } from './game/sceneLifecycle';
import {
  getTouchpointPromptBounds,
  TownTouchpoints,
} from './game/townTouchpoints';
import {
  playerStats,
  playerCoords,
  isDead,
  addChatMessage,
  togglePanel,
  closeAllPanels,
  openPanels,
  showStatAllocation,
  showTutorial,
  showQuestPanel,
  entityTooltip,
  selectedTargetId,
  commands,
} from '../store/GameStore';
import { InputGate } from '../services/InputGate';

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

  // Core rendering (stays in Phaser)
  private healthBars!: HealthBars;
  private minimap!: Minimap;
  private moveSeq = 0;

  // Cursor tile highlight
  private cursorHighlight!: Phaser.GameObjects.Graphics;

  // Combat targeting
  private _selectedEntityId: string | null = null;
  private get selectedEntityId() { return this._selectedEntityId; }
  private set selectedEntityId(id: string | null) {
    this._selectedEntityId = id;
    selectedTargetId.value = id;
  }
  private attackCooldown = 0;

  // Ground items
  private groundItems: Map<string, GroundItemView> = new Map();
  private lastAutoPickupTime = 0;
  private fountainHealTimer = 0;

  // Active status effects (visual tracking)
  private activeEffects: Map<string, {
    particle?: Phaser.GameObjects.Image;
    tween?: Phaser.Tweens.Tween;
    icon?: Phaser.GameObjects.Text;
    tintOverlay?: Phaser.GameObjects.Rectangle;
  }> = new Map();

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

  private lifecycle = new GameSceneLifecycle();
  private hasCleanedUp = false;
  private townTouchpoints!: TownTouchpoints;
  private hasShownCraftingLocationTip = false;

  // Zoom
  private targetZoom = 1.0;
  private static readonly MIN_ZOOM = 0.5;
  private static readonly MAX_ZOOM = 2.0;
  private static readonly ZOOM_STEP = 0.1;

  // Day/night cycle
  private dayNightOverlay!: Phaser.GameObjects.Rectangle;
  private static readonly DAY_CYCLE_MS = 600_000; // 10 min real-time = 1 game day

  constructor() {
    super({ key: 'GameScene' });
  }

  init(): void {
    this.network = this.registry.get('network') as WebSocketClient;
    this.playerId = this.registry.get('playerId') as string;
  }

  create(): void {
    this.hasCleanedUp = false;
    this.lifecycle.reset();
    this.chunkTiles.clear();
    this.loadedChunks.clear();
    this.entities.clear();
    this.groundItems.clear();
    this.playerGridX = 0;
    this.playerGridY = 0;
    this.targetGridX = 0;
    this.targetGridY = 0;
    this.lastChunkX = 0;
    this.lastChunkY = 0;
    this.moveSeq = 0;
    this.selectedEntityId = null;
    this.attackCooldown = 0;
    this.lastAutoPickupTime = 0;
    this.lastMoveSendTime = 0;
    this.hasShownCraftingLocationTip = false;
    this.activeEffects.forEach(eff => {
      eff.particle?.destroy();
      eff.tween?.destroy();
      eff.icon?.destroy();
      eff.tintOverlay?.destroy();
    });
    this.activeEffects.clear();

    this.cameras.main.setBackgroundColor(ISOMETRIC_THEME.palette.canvasAlt);

    // Player sprite — use Kenney spritesheet (16px scaled 3x = 48px)
    const screenPos = worldToScreen(0, 0);
    const playerClass = (playerStats.value.playerClass || 'default').toLowerCase();
    const pSprite = PLAYER_SPRITES[playerClass] ?? PLAYER_SPRITES['default'];
    this.playerSprite = this.add.sprite(screenPos.x, screenPos.y - 27, pSprite.sheet, pSprite.frame);
    this.playerSprite.setDepth(1000);
    this.playerSprite.setOrigin(0.5, 1);
    this.playerSprite.setScale(3.0);

    const username = this.registry.get('username') as string || 'Player';
    this.playerNameText = this.add.text(screenPos.x, screenPos.y - 60, username, {
      fontSize: '12px', color: hexColor(ISOMETRIC_THEME.scenes.game.playerName),
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow), strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1001);

    // Cursor highlight
    this.cursorHighlight = this.add.graphics();
    this.cursorHighlight.setDepth(999);
    this.drawCursorHighlight(0, 0);

    // Camera
    this.cameras.main.startFollow(this.playerSprite, true, 0.1, 0.1);

    // Water shimmer animation
    startWaterAnimation(this);

    // Minimap (top-right)
    this.minimap = new Minimap(this, this.scale.width - 150, 10);

    // Health bars (floating over entities)
    this.healthBars = new HealthBars(this);

    this.townTouchpoints = new TownTouchpoints(this);

    // --- Input handling ---
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('wheel', this.handleMouseWheel, this);
    this.lifecycle.onCleanup(() => {
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointermove', this.handlePointerMove, this);
      this.input.off('wheel', this.handleMouseWheel, this);
    });

    // Connect InputGate to Phaser keyboard
    InputGate.setPhaserKeyboard(this.input.keyboard!);

    // Keyboard shortcuts — InputGate auto-disables Phaser keyboard when HTML has focus
    this.registerKeyboardShortcut('keydown-I', () => togglePanel('inventory'));
    this.registerKeyboardShortcut('keydown-E', () => togglePanel('equipment'));
    this.registerKeyboardShortcut('keydown-B', () => {
      if (openPanels.value.has('bank')) { togglePanel('bank'); return; }
      if (!this.canUseBank()) {
        addChatMessage('system', 'System', '🏦 Return to the banker in town center to use the bank.');
        return;
      }
      togglePanel('bank');
    });
    this.registerKeyboardShortcut('keydown-C', () => {
      const opening = !openPanels.value.has('crafting');
      togglePanel('crafting');
      if (opening && !this.hasShownCraftingLocationTip
          && !this.townTouchpoints.isNearCraftingStation(this.playerGridX, this.playerGridY)) {
        this.hasShownCraftingLocationTip = true;
        addChatMessage('system', 'System', '⚒️ Forgekeeper Oren works the town forge just east of the square.');
      }
    });
    this.registerKeyboardShortcut('keydown-M', () => {
      if (openPanels.value.has('marketplace')) { togglePanel('marketplace'); return; }
      const dx = this.playerGridX - 0;
      const dy = this.playerGridY - (-7);
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        addChatMessage('system', 'System', '🛒 Visit Merchant Kael near the market stalls to trade.');
        return;
      }
      togglePanel('marketplace');
    });
    this.registerKeyboardShortcut('keydown-P', () => {
      if (playerStats.value.statPoints > 0) {
        showStatAllocation.value = !showStatAllocation.value;
      }
    });
    this.registerKeyboardShortcut('keydown-Q', () => {
      showQuestPanel.value = !showQuestPanel.value;
    });
    this.registerKeyboardShortcut('keydown-N', () => togglePanel('character'));
    this.registerKeyboardShortcut('keydown-O', () => togglePanel('settings'));
    this.registerKeyboardShortcut('keydown-Y', () => togglePanel('achievements'));
    this.registerKeyboardShortcut('keydown-L', () => togglePanel('combatlog'));
    this.registerKeyboardShortcut('keydown-G', () => togglePanel('guild'));
    this.registerKeyboardShortcut('keydown-H', () => togglePanel('social'));
    this.registerKeyboardShortcut('keydown-TAB', () => togglePanel('worldmap'));
    this.registerKeyboardShortcut('keydown-K', () => togglePanel('skilltree'));
    this.registerKeyboardShortcut('keydown-J', () => togglePanel('leaderboard'));
    this.registerKeyboardShortcut('keydown-U', () => togglePanel('enchant'));
    this.registerKeyboardShortcut('keydown-F', () => togglePanel('fishing'));
    this.registerKeyboardShortcut('keydown-R', () => togglePanel('factions'));
    this.registerKeyboardShortcut('keydown-V', () => togglePanel('mining'));
    this.registerKeyboardShortcut('keydown-T', () => togglePanel('pets'));
    this.registerKeyboardShortcut('keydown-Z', () => togglePanel('mail'));
    this.registerKeyboardShortcut('keydown-X', () => togglePanel('arena'));
    this.registerKeyboardShortcut('keydown-COMMA', () => togglePanel('dailyquests'));
    this.registerKeyboardShortcut('keydown-PERIOD', () => togglePanel('dungeonFinder'));
    this.registerKeyboardShortcut('keydown-SEMICOLON', () => togglePanel('bestiary'));
    this.registerKeyboardShortcut('keydown-QUOTES', () => togglePanel('blessings'));
    this.registerKeyboardShortcut('keydown-OPEN_BRACKET', () => togglePanel('bounty'));
    this.registerKeyboardShortcut('keydown-CLOSE_BRACKET', () => togglePanel('runes'));
    this.registerKeyboardShortcut('keydown-M', () => commands.toggleMount());
    this.registerKeyboardShortcut('keydown-ESC', () => {
      closeAllPanels();
      showStatAllocation.value = false;
      showQuestPanel.value = false;
    });

    // WASD + Arrow key references for movement polling
    const keys = this.input.keyboard!;
    this.keyW = keys.addKey(Phaser.Input.Keyboard.KeyCodes.W, false);
    this.keyA = keys.addKey(Phaser.Input.Keyboard.KeyCodes.A, false);
    this.keyS = keys.addKey(Phaser.Input.Keyboard.KeyCodes.S, false);
    this.keyD = keys.addKey(Phaser.Input.Keyboard.KeyCodes.D, false);
    this.cursors = keys.createCursorKeys();

    // Player auras (attack range + pickup range)
    this.attackAura = this.add.graphics().setDepth(998);
    this.pickupAura = this.add.graphics().setDepth(997);

    // Network handlers
    this.setupNetworkHandlers();

    // Generate initial chunks
    this.requestChunksAround(0, 0);

    // Welcome messages via GameStore
    addChatMessage('system', 'System', 'Welcome to RealmForge! Use WASD/Arrows or click to move. Auto-attack nearby enemies!');
    addChatMessage('system', 'System', 'Town is a safe zone — enemies will flee when approaching! Heal at the fountain.');
    addChatMessage('system', 'System', 'Keys: I=Inventory E=Equipment B=Bank C=Craft M=Market P=Stats');

    // Tutorial — show once for new players
    const tutorialKey = this.registry.get('username') as string || this.playerId;
    if (!localStorage.getItem(`tutorial_done_${tutorialKey}`)) {
      showTutorial.value = true;
    }

    // Connection status overlay (simplified — just Phaser text)
    this.setupConnectionOverlay();

    // Day/night cycle overlay
    this.dayNightOverlay = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x001133, 0,
    ).setScrollFactor(0).setDepth(8000).setBlendMode(Phaser.BlendModes.MULTIPLY);

    // Handle viewport resize — reposition minimap + touchpoints + day/night overlay
    const handleResize = (gameSize: Phaser.Structs.Size) => {
      this.minimap.reposition(gameSize.width - 150, 10);
      this.townTouchpoints.repositionPrompt(gameSize.width);
      this.dayNightOverlay.setPosition(gameSize.width / 2, gameSize.height / 2);
      this.dayNightOverlay.setSize(gameSize.width, gameSize.height);
    };
    this.scale.on('resize', handleResize);
    this.lifecycle.onCleanup(() => this.scale.off('resize', handleResize));
    // Run once immediately with current size
    handleResize(this.scale.gameSize);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupScene, this);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown() || isDead.value) return;
    if (!InputGate.shouldGameProcessClick()) return;
    if (this.isPointerOverUI(pointer)) return;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const gridPos = screenToWorld(worldPoint.x, worldPoint.y);
    const tileX = Math.round(gridPos.x);
    const tileY = Math.round(gridPos.y);

    const clickedEntity = this.findEntityAt(worldPoint.x, worldPoint.y);
    if (clickedEntity) {
      this.handleEntityClick(clickedEntity);
      return;
    }

    this.selectedEntityId = null;
    this.targetGridX = tileX;
    this.targetGridY = tileY;
    this.moveSeq++;
    this.network.send(MessageType.Move, {
      targetX: tileX, targetY: tileY, seq: this.moveSeq,
    });
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.isPointerOverUI(pointer)) {
      this.cursorHighlight.clear();
      entityTooltip.value = null;
      return;
    }
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const gridPos = screenToWorld(worldPoint.x, worldPoint.y);
    this.drawCursorHighlight(Math.round(gridPos.x), Math.round(gridPos.y));

    // Entity tooltip on hover — find closest entity within range
    let closestEntity: { name: string; level?: number; hp?: number; maxHp?: number; type: string } | null = null;
    let closestDist = 1.5;
    for (const [, entity] of this.entities) {
      const dx = entity.gridX - gridPos.x;
      const dy = entity.gridY - gridPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestEntity = {
          name: entity.nameText.text || entity.entityType,
          level: entity.level,
          hp: entity.hp,
          maxHp: entity.maxHp,
          type: entity.entityType,
        };
      }
    }

    if (closestEntity) {
      entityTooltip.value = {
        name: closestEntity.name,
        level: closestEntity.level,
        hp: closestEntity.hp,
        maxHp: closestEntity.maxHp,
        type: closestEntity.type as 'enemy' | 'player' | 'npc',
        screenX: pointer.x,
        screenY: pointer.y,
      };
      // Cursor feedback
      this.input.setDefaultCursor(
        closestEntity.type === 'enemy' ? 'crosshair'
        : closestEntity.type === 'npc' ? 'pointer'
        : 'default',
      );
    } else {
      entityTooltip.value = null;
      this.input.setDefaultCursor('default');
    }
  }

  private handleMouseWheel(
    _pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _dx: number,
    dy: number,
  ): void {
    // Don't zoom when pointer is over interactive UI (panels with scrollable content)
    if (!InputGate.shouldGameProcessClick()) return;

    const direction = dy > 0 ? -1 : 1; // scroll down = zoom out, up = zoom in
    this.targetZoom = Phaser.Math.Clamp(
      this.targetZoom + direction * GameScene.ZOOM_STEP,
      GameScene.MIN_ZOOM,
      GameScene.MAX_ZOOM,
    );

    // Zoom changes viewport coverage — re-request chunks at wider radius
    const zoomRadius = Math.ceil(2 / this.targetZoom);
    this.requestChunksAround(this.lastChunkX, this.lastChunkY, zoomRadius);
  }

  private registerKeyboardShortcut(eventName: string, handler: () => void): void {
    this.lifecycle.registerKeyboardShortcut(this.input.keyboard, eventName, handler);
  }

  private registerNetworkHandler(type: MessageType, handler: MessageHandler): void {
    this.lifecycle.registerNetworkHandler(this.network, type, handler);
  }

  private cleanupScene(): void {
    if (this.hasCleanedUp) return;
    this.hasCleanedUp = true;

    this.lifecycle.cleanup();

    for (const id of Array.from(this.entities.keys())) {
      this.removeEntity(id);
    }
    this.entities.clear();

    this.clearGroundItems();
    stopWaterAnimation();
    clearChunkTiles(this.chunkTiles, this.loadedChunks);

    this.townTouchpoints?.destroy();
    this.healthBars?.destroy();
    this.minimap?.destroy();

    this.attackAura?.destroy();
    this.pickupAura?.destroy();
    this.cursorHighlight?.destroy();
  }

  update(_time: number, delta: number): void {
    // Constant-speed movement: tiles per millisecond
    const moveStep = PLAYER_SPEED * (delta / 1000);
    // Remote entity interpolation uses proportional lerp (smoother for network entities)
    const remoteLerp = Math.min(0.15 * (delta / 16.67), 1.0);

    // --- Smooth zoom interpolation (south-pivot via follow offset) ---
    const cam = this.cameras.main;
    const zoomDiff = this.targetZoom - cam.zoom;
    if (Math.abs(zoomDiff) > 0.001) {
      const zoomLerp = Math.min(8 * (delta / 1000), 1.0);
      cam.zoom += zoomDiff * zoomLerp;

      // South-pivot: shift camera follow offset upward so the bottom of
      // the viewport stays anchored. At zoom 1 offset is 0; zooming in
      // pushes the view down (south), zooming out pulls it up.
      // Formula: offset = (viewportH / 2) * (1 - 1/zoom) in world pixels.
      const offsetY = (cam.height / 2) * (1 - 1 / cam.zoom);
      cam.setFollowOffset(0, -offsetY);
    }

    // --- Player size growth by level (3x base, grows to ~4.2x at lv50+) ---
    const lvl = playerStats.value.level || 1;
    const playerScale = 3.0 * (1.0 + Math.min(lvl - 1, 50) * 0.008);
    if (Math.abs(this.playerSprite.scaleX - playerScale) > 0.001) {
      this.playerSprite.setScale(playerScale);
    }

    // --- WASD / Arrow key movement ---
    if (!isDead.value) {
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
    } else if (!isDead.value) {
      const toTargetX = this.targetGridX - this.playerGridX;
      const toTargetY = this.targetGridY - this.playerGridY;
      const distToTarget = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
      if (distToTarget > 0.05) {
        const step = Math.min(moveStep, distToTarget);
        this.playerGridX += (toTargetX / distToTarget) * step;
        this.playerGridY += (toTargetY / distToTarget) * step;
      }
    }

    // Update player sprite position with walking bob
    const screenPos = worldToScreen(this.playerGridX, this.playerGridY);
    const pdx = Math.abs(this.playerGridX - this.targetGridX);
    const pdy = Math.abs(this.playerGridY - this.targetGridY);
    const playerMoving = pdx > 0.05 || pdy > 0.05;
    const bobOffset = playerMoving ? Math.sin(Date.now() * 0.01) * 2 : 0;
    this.playerSprite.setPosition(screenPos.x, screenPos.y - 27 + bobOffset);
    this.playerNameText.setPosition(screenPos.x, screenPos.y - 60);
    // Flip player sprite based on movement direction
    if (this.targetGridX < this.playerGridX - 0.1) {
      this.playerSprite.setFlipX(true);
    } else if (this.targetGridX > this.playerGridX + 0.1) {
      this.playerSprite.setFlipX(false);
    }
    this.playerSprite.setDepth(screenPos.y + 1000);
    this.playerNameText.setDepth(screenPos.y + 1001);
    this.townTouchpoints.update(this.playerGridX, this.playerGridY);

    // Fountain healing: passively regen HP when near the fountain
    if (!isDead.value && this.townTouchpoints.isNearFountain(this.playerGridX, this.playerGridY)) {
      this.fountainHealTimer += delta;
      if (this.fountainHealTimer >= 1500) { // heal every 1.5 seconds
        this.fountainHealTimer = 0;
        const stats = playerStats.value;
        if (stats.hp < stats.maxHp) {
          const healAmount = Math.min(
            Math.ceil(stats.maxHp * 0.08), // 8% max HP per tick
            stats.maxHp - stats.hp
          );
          playerStats.value = { ...stats, hp: stats.hp + healAmount };

          // Visual feedback — green float text
          const pos = worldToScreen(this.playerGridX, this.playerGridY);
          const healText = this.add.text(pos.x + 15, pos.y - 45, `+${healAmount}`, {
            fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold',
            color: hexColor(ISOMETRIC_THEME.ui.bars.healthHigh),
            stroke: hexColor(ISOMETRIC_THEME.palette.shadow), strokeThickness: 3,
          }).setOrigin(0.5).setDepth(9000);
          this.tweens.add({
            targets: healText, y: pos.y - 80, alpha: 0,
            duration: 1000, ease: 'Power2', onComplete: () => healText.destroy(),
          });
        }
      }
    } else {
      this.fountainHealTimer = 0;
    }

    // Draw player auras
    this.drawPlayerAuras(screenPos.x, screenPos.y);

    // Update coords in GameStore for StatsBar
    playerCoords.value = { x: Math.round(this.playerGridX), y: Math.round(this.playerGridY) };

    // Interpolate remote entities + update health bars
    const minimapEntities = interpolateRemoteEntities(this.entities, remoteLerp, this.healthBars);

    // Update minimap
    this.minimap.update(this.playerGridX, this.playerGridY, minimapEntities);

    // Update pickup prompt for nearby ground items
    updatePickupPrompt(this, this.groundItems, this.playerGridX, this.playerGridY, 1.8);

    // Attack cooldown
    if (this.attackCooldown > 0) this.attackCooldown -= delta;

    // Auto-attack: if no target selected, find nearest enemy in range
    if (!this.selectedEntityId && this.attackCooldown <= 0 && !isDead.value) {
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
    if (this.selectedEntityId && this.attackCooldown <= 0 && !isDead.value) {
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

    // Auto-pickup ground items when walking near them (throttled to 5/sec)
    if (!isDead.value && _time - this.lastAutoPickupTime > 200) {
      this.lastAutoPickupTime = _time;
      const nearbyItemId = findNearbyGroundItemId(this.groundItems, this.playerGridX, this.playerGridY, 1.8);
      if (nearbyItemId) {
        this.network.send(MessageType.PickupItem, { itemId: nearbyItemId });
      }
    }

    // Day/night cycle (sinusoidal: 0=midnight, 0.5=noon)
    const dayProgress = (_time % GameScene.DAY_CYCLE_MS) / GameScene.DAY_CYCLE_MS;
    const sunAngle = dayProgress * Math.PI * 2;
    // Night intensity: 0 at noon, peaks at midnight
    const nightAlpha = Math.max(0, -Math.cos(sunAngle)) * 0.35;
    // Dawn/dusk warm tint
    const isTransition = Math.abs(Math.sin(sunAngle)) > 0.85 && nightAlpha < 0.1;
    if (isTransition) {
      this.dayNightOverlay.fillColor = 0x331100; // warm orange tint
      this.dayNightOverlay.fillAlpha = 0.08;
    } else {
      this.dayNightOverlay.fillColor = 0x001133; // cool blue night
      this.dayNightOverlay.fillAlpha = nightAlpha;
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
    registerGameSceneNetworkHandlers({
      register: this.registerNetworkHandler.bind(this),
      registry: this.registry,
      player: {
        getId: () => this.playerId,
        setId: (id) => { this.playerId = id; },
        sprite: this.playerSprite,
        getPosition: () => ({ x: this.playerGridX, y: this.playerGridY }),
        setPosition: (update) => this.applyPlayerPosition(update),
        setSelectedEntityId: (id) => { this.selectedEntityId = id; },
        movementInputActive: () => this.isMovementInputActive(),
      },
      world: {
        entities: this.entities,
        updateRemoteEntity: (entity) => this.updateRemoteEntity(entity),
        removeEntity: (id) => this.removeEntity(id),
        removeMissingEntities: (seenIds) => this.removeMissingEntities(seenIds),
        renderChunk: (chunk) => this.renderChunk(chunk),
        updateGroundItems: (items) => this.updateGroundItems(items),
        clearGroundItems: () => this.clearGroundItems(),
      },
      effects: {
        showLevelUpEffect: () => this.showLevelUpEffect(),
        showDamageNumber: (x, y, damage, isCrit) => this.showDamageNumber(x, y, damage, isCrit),
        showMissText: (x, y) => this.showMissText(x, y),
        showDeathEffect: (x, y) => this.showDeathEffect(x, y),
        showXpOrbPickup: (x, y, xp) => this.showXpOrbPickup(x, y, xp),
        showEffectApplied: (effectType) => this.showEffectApplied(effectType),
        showEffectRemoved: (effectType) => this.showEffectRemoved(effectType),
        showEffectTick: (effectType, value) => this.showEffectTick(effectType, value),
        shakeCamera: (intensity, duration) => this.shakeCamera(intensity, duration),
        showHealNumber: (x, y, amount) => this.showHealNumber(x, y, amount),
        showComboText: (x, y, combo) => this.showComboText(x, y, combo),
      },
    });
  }

  // --- Entity Management ---
  private updateRemoteEntity(entity: EntityState): void {
    upsertRemoteEntity(this, this.entities, entity);
  }

  private removeEntity(id: string): void {
    if (removeRemoteEntity(this.entities, this.healthBars, id) && this.selectedEntityId === id) {
      this.selectedEntityId = null;
    }
  }

  private findEntityAt(worldX: number, worldY: number): string | null {
    return findEntityAtPosition(this.entities, worldX, worldY);
  }

  /** Draw isometric ellipse auras around the player (attack + pickup ranges). */
  private drawPlayerAuras(sx: number, sy: number): void {
    this.attackAura.clear();
    this.pickupAura.clear();
    if (isDead.value) return;

    // Isometric projection: x-radius = range * TILE_WIDTH/2, y-radius = range * TILE_HEIGHT/2
    const attackRange = 2.5;
    const pickupRange = 1.5;

    // Attack aura (red, subtle)
    this.attackAura.lineStyle(1, ISOMETRIC_THEME.scenes.game.auraAttack, 0.25);
    this.attackAura.strokeEllipse(sx, sy, attackRange * TILE_WIDTH, attackRange * TILE_HEIGHT);

    // Pickup/XP orb aura (green, subtle)
    this.pickupAura.lineStyle(1, ISOMETRIC_THEME.scenes.game.auraPickup, 0.3);
    this.pickupAura.strokeEllipse(sx, sy, pickupRange * TILE_WIDTH, pickupRange * TILE_HEIGHT);
  }

  /** Screen-space check: is pointer over the minimap? HTML panels handle their own clicks. */
  private isPointerOverUI(pointer: Phaser.Input.Pointer): boolean {
    const sx = pointer.x;
    const sy = pointer.y;

    const w = this.scale.width;
    // Minimap (top-right)
    if (sx >= w - 150 && sx <= w - 10 && sy >= 10 && sy <= 150) return true;

    // Town touchpoint prompts (dynamically centered)
    const bounds = getTouchpointPromptBounds(w);
    if (
      sx >= bounds.x &&
      sx <= bounds.x + bounds.width &&
      sy >= bounds.y &&
      sy <= bounds.y + bounds.height
    ) {
      return true;
    }

    return false;
  }

  private handleEntityClick(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    if (entity.entityType === 'enemy') {
      this.selectedEntityId = entityId;
      addChatMessage('combat', 'Target', `Targeting: ${entity.nameText.text}`);
      const dist = Math.sqrt(
        Math.pow(this.playerGridX - entity.gridX, 2) +
        Math.pow(this.playerGridY - entity.gridY, 2)
      );
      if (dist < 2.5 && this.attackCooldown <= 0) {
        this.network.send(MessageType.Attack, { targetId: entityId });
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
    } else if (entity.entityType === 'player') {
      if (this.input.keyboard && this.input.keyboard.addKey('SHIFT').isDown) {
        this.selectedEntityId = entityId;
        addChatMessage('combat', 'PvP', `⚔️ Attacking player: ${entity.nameText.text}`);
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
        addChatMessage('system', 'Info', `Player: ${entity.nameText.text} [Lv.${entity.level || '?'}] (Shift+click to attack)`);
      }
    }
  }

  private updateGroundItems(items: GroundItemPayload[]): void {
    updateGroundItemViews(this, this.groundItems, items);
  }

  private clearGroundItems(): void {
    clearGroundItemViews(this.groundItems);
  }

  // --- Chunk Management ---
  private requestChunksAround(cx: number, cy: number, radius?: number): void {
    const r = radius ?? Math.ceil(2 / this.cameras.main.zoom);
    requestChunkWindow(this.network, this.loadedChunks, cx, cy, r);
  }

  private evictDistantChunks(cx: number, cy: number): void {
    evictRenderedChunks(this.chunkTiles, this.loadedChunks, cx, cy);
  }

  private renderChunk(chunk: ChunkDataPayload): void {
    renderChunkData(this, this.chunkTiles, this.loadedChunks, chunk);
  }

  // --- Visual Effects ---
  private showLevelUpEffect(): void {
    const { x, y } = this.playerSprite;

    // Text banner
    const text = this.add.text(x, y - 60, '⭐ LEVEL UP! ⭐', {
      fontSize: '20px', color: hexColor(ISOMETRIC_THEME.scenes.game.levelUp), stroke: hexColor(ISOMETRIC_THEME.palette.shadow), strokeThickness: 4,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(5000);

    this.tweens.add({
      targets: text, y: y - 130, alpha: 0,
      duration: 2500, ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    // Star particle burst
    this.spawnParticleBurst(x, y - 20, 'particle_star', ISOMETRIC_THEME.scenes.game.levelUp, 18, 80, 1500);

    // Golden ring expanding outward
    const ring = this.add.circle(x, y, 5, ISOMETRIC_THEME.scenes.game.levelUp, 0.6).setDepth(4999);
    this.tweens.add({
      targets: ring, scaleX: 8, scaleY: 4, alpha: 0,
      duration: 800, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private showDamageNumber(x: number, y: number, damage: number, isCrit: boolean): void {
    const color = isCrit ? hexColor(ISOMETRIC_THEME.scenes.game.alert) : hexColor(ISOMETRIC_THEME.text.primary);
    const prefix = isCrit ? '💥 CRIT! ' : '';
    const size = isCrit ? '18px' : '13px';
    const text = this.add.text(x + Phaser.Math.Between(-10, 10), y, `${prefix}-${damage}`, {
      fontSize: size, color, stroke: hexColor(ISOMETRIC_THEME.palette.shadow), strokeThickness: 2,
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
      this.spawnParticleBurst(x, y, 'particle_blood', ISOMETRIC_THEME.text.danger, 8, 30, 600);
    }
  }

  private showAttackEffect(x: number, y: number): void {
    const slash = this.add.text(x, y - 12, '⚔️', {
      fontSize: '20px',
    }).setOrigin(0.5).setDepth(5500);

    this.tweens.add({
      targets: slash, alpha: 0, scale: 1.8, rotation: 0.3,
      duration: 350,
      onComplete: () => slash.destroy(),
    });

    // Combat sparks
    this.spawnParticleBurst(x, y - 8, 'particle_spark', ISOMETRIC_THEME.ui.accents.highlight, 6, 25, 400);
  }

  private showMissText(x: number, y: number): void {
    const text = this.add.text(x + Phaser.Math.Between(-8, 8), y, 'MISS', {
      fontSize: '12px',
      color: '#aaaaaa',
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
      strokeThickness: 2,
      fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(6000);

    this.tweens.add({
      targets: text,
      y: y - 25,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private shakeCamera(intensity = 0.005, duration = 150): void {
    this.cameras.main.shake(duration, intensity);
  }

  private showHealNumber(x: number, y: number, amount: number): void {
    const text = this.add.text(x + Phaser.Math.Between(-8, 8), y, `+${amount}`, {
      fontSize: '14px',
      color: hexColor(ISOMETRIC_THEME.ui.accents.success),
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
      strokeThickness: 2,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(6000);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    this.spawnParticleBurst(x, y, 'particle_regen', ISOMETRIC_THEME.ui.accents.success, 4, 20, 600);
  }

  private showComboText(x: number, y: number, combo: number): void {
    const color = combo >= 20 ? '#ff3333' : combo >= 10 ? '#ff8800' : combo >= 5 ? '#ffcc00' : '#ffffff';
    const size = combo >= 10 ? '14px' : '11px';
    const text = this.add.text(x, y, `${combo}x COMBO!`, {
      fontSize: size, color, fontStyle: 'bold',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(9999);

    this.tweens.add({
      targets: text, y: y - 15, alpha: 0, duration: 800,
      ease: 'Power2', onComplete: () => text.destroy(),
    });
  }

  private showLootPickupEffect(x: number, y: number, rarityColor: number): void {
    this.spawnParticleBurst(x, y, 'particle_glow', rarityColor, 10, 40, 800);
  }

  private showDeathEffect(x: number, y: number): void {
    // Skull emoji
    const skull = this.add.text(x, y - 20, '💀', { fontSize: '28px' })
      .setOrigin(0.5).setDepth(5500);
    this.tweens.add({
      targets: skull, y: y - 80, alpha: 0, scale: 1.5,
      duration: 2000, ease: 'Power2',
      onComplete: () => skull.destroy(),
    });
    // Red flash
    this.spawnParticleBurst(x, y, 'particle_blood', ISOMETRIC_THEME.text.danger, 20, 50, 1000);
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
  private canUseBank(): boolean {
    return this.townTouchpoints.canUseBank(this.playerGridX, this.playerGridY);
  }

  private drawCursorHighlight(wx: number, wy: number): void {
    this.cursorHighlight.clear();
    const pos = worldToScreen(wx, wy);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    this.cursorHighlight.lineStyle(2, ISOMETRIC_THEME.scenes.game.cursor, 0.6);
    this.cursorHighlight.beginPath();
    this.cursorHighlight.moveTo(pos.x, pos.y - hh);
    this.cursorHighlight.lineTo(pos.x + hw, pos.y);
    this.cursorHighlight.lineTo(pos.x, pos.y + hh);
    this.cursorHighlight.lineTo(pos.x - hw, pos.y);
    this.cursorHighlight.closePath();
    this.cursorHighlight.strokePath();
  }

  private setupConnectionOverlay(): void {
    const cx = this.scale.width / 2;
    const overlay = this.add.rectangle(cx, 0, 260, 28, ISOMETRIC_THEME.scenes.game.overlay, 0.75)
      .setScrollFactor(0).setDepth(10000).setOrigin(0.5, 0).setVisible(false);
    const label = this.add.text(cx, 6, '', {
      fontSize: '14px', color: hexColor(ISOMETRIC_THEME.scenes.game.alert), fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(10001).setOrigin(0.5, 0).setVisible(false);

    // Reposition on resize
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      const newCx = gameSize.width / 2;
      overlay.setX(newCx);
      label.setX(newCx);
    });

    const connectionStatusHandler = (status: 'connected' | 'disconnected' | 'reconnecting') => {
      if (status === 'connected') {
        overlay.setVisible(false);
        label.setVisible(false);
        addChatMessage('system', 'System', '✅ Reconnected to server.');
      } else if (status === 'reconnecting') {
        overlay.setVisible(true);
        label.setVisible(true);
        label.setText('⟳ Reconnecting to server...');
        label.setColor(hexColor(ISOMETRIC_THEME.scenes.game.warning));
      } else {
        overlay.setVisible(true);
        label.setVisible(true);
        label.setText('⚠ Disconnected from server');
        label.setColor(hexColor(ISOMETRIC_THEME.scenes.game.alert));
      }
    };

    this.lifecycle.registerStatusHandler(this.network, connectionStatusHandler);
    this.lifecycle.onCleanup(() => {
      overlay.destroy();
      label.destroy();
    });
  }

  private applyPlayerPosition(update: { x?: number; y?: number; targetX?: number; targetY?: number }): void {
    if (update.x !== undefined) this.playerGridX = update.x;
    if (update.y !== undefined) this.playerGridY = update.y;
    if (update.targetX !== undefined) this.targetGridX = update.targetX;
    if (update.targetY !== undefined) this.targetGridY = update.targetY;
  }

  private isMovementInputActive(): boolean {
    return (
      this.keyW.isDown || this.keyS.isDown || this.keyA.isDown || this.keyD.isDown ||
      this.cursors.up.isDown || this.cursors.down.isDown ||
      this.cursors.left.isDown || this.cursors.right.isDown
    );
  }

  private removeMissingEntities(seenIds: Set<string>): void {
    const removedIds = removeMissingRemoteEntities(this.entities, this.healthBars, seenIds);
    if (this.selectedEntityId && removedIds.includes(this.selectedEntityId)) {
      this.selectedEntityId = null;
    }
  }

  private showXpOrbPickup(x: number, y: number, xp: number): void {
    const pos = worldToScreen(x, y);
    const color = xp >= 60
      ? hexColor(ISOMETRIC_THEME.scenes.game.highXp)
      : xp >= 20
        ? hexColor(ISOMETRIC_THEME.scenes.game.midXp)
        : hexColor(ISOMETRIC_THEME.scenes.game.lowXp);
    const floatText = this.add.text(pos.x, pos.y - 10, `+${xp} XP`, {
      fontSize: '14px',
      color,
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
      strokeThickness: 3,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9000);
    this.tweens.add({
      targets: floatText,
      y: pos.y - 50,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => floatText.destroy(),
    });
  }

  // --- Status Effect Visuals ---

  private static readonly EFFECT_CONFIG: Record<string, {
    emoji: string;
    color: number;
    particle: string;
    label: string;
    isBuff: boolean;
  }> = {
    Poison: { emoji: '🧪', color: 0x44cc44, particle: 'particle_poison', label: 'POISONED', isBuff: false },
    Burn: { emoji: '🔥', color: 0xff6622, particle: 'particle_fire', label: 'BURNING', isBuff: false },
    Bleed: { emoji: '🩸', color: 0xcc2222, particle: 'particle_bleed', label: 'BLEEDING', isBuff: false },
    Freeze: { emoji: '❄️', color: 0x44bbff, particle: 'particle_ice', label: 'FROZEN', isBuff: false },
    Stun: { emoji: '💫', color: 0xffdd44, particle: 'particle_stun', label: 'STUNNED', isBuff: false },
    Weakness: { emoji: '⬇️', color: 0x9944cc, particle: 'particle_glow', label: 'WEAKENED', isBuff: false },
    ArmorBreak: { emoji: '🛡️', color: 0x8b6914, particle: 'particle_spark', label: 'ARMOR BROKEN', isBuff: false },
    Regen: { emoji: '💚', color: 0x44ee88, particle: 'particle_regen', label: 'REGEN', isBuff: true },
    Strength: { emoji: '💪', color: 0xff4444, particle: 'particle_strength', label: 'STRENGTHENED', isBuff: true },
    Shield: { emoji: '🛡️', color: 0x4488ff, particle: 'particle_shield', label: 'SHIELDED', isBuff: true },
    Haste: { emoji: '⚡', color: 0x44ffff, particle: 'particle_haste', label: 'HASTE', isBuff: true },
    Lifesteal: { emoji: '🧛', color: 0xcc2244, particle: 'particle_blood', label: 'LIFESTEAL', isBuff: true },
    Thorns: { emoji: '🌿', color: 0xddaa22, particle: 'particle_spark', label: 'THORNS', isBuff: true },
    Invulnerable: { emoji: '✨', color: 0xffffff, particle: 'particle_glow', label: 'INVULNERABLE', isBuff: true },
  };

  private showEffectApplied(effectType: string): void {
    const config = GameScene.EFFECT_CONFIG[effectType];
    if (!config) return;

    const { x, y } = this.playerSprite;

    // Flash announcement text
    const label = `${config.emoji} ${config.label}!`;
    const text = this.add.text(x, y - 70, label, {
      fontSize: '16px',
      color: hexColor(config.color),
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
      strokeThickness: 3,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(6500);

    this.tweens.add({
      targets: text,
      y: y - 120,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    // Particle burst
    const particleTex = this.textures.exists(config.particle) ? config.particle : 'particle_glow';
    this.spawnParticleBurst(x, y - 20, particleTex, config.color, 12, 50, 1000);

    // Screen tint flash for debuffs
    if (!config.isBuff) {
      const sw = this.scale.width;
      const sh = this.scale.height;
      const screenFlash = this.add.rectangle(
        sw / 2, sh / 2,
        sw, sh,
        config.color, 0.15
      ).setScrollFactor(0).setDepth(9500);

      this.tweens.add({
        targets: screenFlash,
        alpha: 0,
        duration: 500,
        ease: 'Power2',
        onComplete: () => screenFlash.destroy(),
      });
    }

    // Ongoing effect icon above player
    this.cleanupEffect(effectType);
    const iconOffsetX = this.activeEffects.size * 18;
    const icon = this.add.text(x - 30 + iconOffsetX, y - 75, config.emoji, {
      fontSize: '14px',
    }).setOrigin(0.5).setDepth(5200);

    // Pulsing animation on the icon
    const tween = this.tweens.add({
      targets: icon,
      scale: 1.3,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.activeEffects.set(effectType, { icon, tween });
    this.repositionEffectIcons();
  }

  private showEffectRemoved(effectType: string): void {
    const config = GameScene.EFFECT_CONFIG[effectType];
    if (!config) return;

    const { x, y } = this.playerSprite;

    // "Wore off" text
    const text = this.add.text(x, y - 60, `${config.emoji} ${config.label} wore off`, {
      fontSize: '12px',
      color: hexColor(ISOMETRIC_THEME.text.muted),
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(6500);

    this.tweens.add({
      targets: text,
      y: y - 100,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    this.cleanupEffect(effectType);
    this.repositionEffectIcons();
  }

  private showEffectTick(effectType: string, value: number): void {
    const config = GameScene.EFFECT_CONFIG[effectType];
    if (!config) return;

    const { x, y } = this.playerSprite;
    const offsetX = Phaser.Math.Between(-15, 15);

    if (config.isBuff) {
      // Buff ticks show as green healing numbers
      const tickText = this.add.text(x + offsetX, y - 40, `+${value}`, {
        fontSize: '12px',
        color: hexColor(config.color),
        stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(6000);

      this.tweens.add({
        targets: tickText,
        y: y - 70,
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => tickText.destroy(),
      });
    } else {
      // Debuff ticks show as colored damage numbers
      const tickText = this.add.text(x + offsetX, y - 40, `-${value}`, {
        fontSize: '11px',
        color: hexColor(config.color),
        stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
        strokeThickness: 2,
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6000);

      this.tweens.add({
        targets: tickText,
        y: y - 65,
        alpha: 0,
        duration: 700,
        ease: 'Power2',
        onComplete: () => tickText.destroy(),
      });
    }

    // Small particle burst per tick
    const particleTex = this.textures.exists(config.particle) ? config.particle : 'particle_glow';
    this.spawnParticleBurst(x, y - 20, particleTex, config.color, 3, 20, 400);
  }

  private cleanupEffect(effectType: string): void {
    const existing = this.activeEffects.get(effectType);
    if (existing) {
      existing.icon?.destroy();
      existing.tween?.destroy();
      existing.particle?.destroy();
      existing.tintOverlay?.destroy();
      this.activeEffects.delete(effectType);
    }
  }

  private repositionEffectIcons(): void {
    let idx = 0;
    for (const [, data] of this.activeEffects) {
      if (data.icon) {
        // Position icons in a row above the player
        const baseX = this.playerSprite.x - ((this.activeEffects.size - 1) * 9);
        data.icon.setX(baseX + idx * 18);
        data.icon.setY(this.playerSprite.y - 75);
      }
      idx++;
    }
  }
}
