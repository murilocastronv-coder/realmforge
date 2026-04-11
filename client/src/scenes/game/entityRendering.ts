import Phaser from 'phaser';
import type { EntityState } from '../../network/WebSocketClient';
import { HealthBars } from '../../ui/HealthBars';
import { worldToScreen } from '../../utils/IsoMath';
import { ISOMETRIC_THEME, hexColor } from '../../theme/isometricTheme';
import {
  ENEMY_SPRITES,
  NPC_SPRITES,
  PLAYER_SPRITES,
  SHEET_DUNGEON,
} from '../../theme/spriteMapping';

// Maps enemy name keywords to sprite mapping keys
const ENEMY_TEXTURE_MAP: Record<string, string> = {
  wolf: 'enemy_wolf',
  spider: 'enemy_spider',
  skeleton: 'enemy_skeleton',
  goblin: 'enemy_goblin',
  demon: 'enemy_demon',
  frost: 'enemy_frost',
  ice: 'enemy_frost',
  shadow: 'enemy_shadow',
  wraith: 'enemy_shadow',
  phantom: 'enemy_shadow',
  drake: 'enemy_demon',
  dragon: 'enemy_demon',
  ogre: 'enemy_goblin',
  troll: 'enemy_goblin',
  bear: 'enemy_wolf',
  serpent: 'enemy_spider',
  scorpion: 'enemy_spider',
  bat: 'enemy_shadow',
  zombie: 'enemy_skeleton',
  ghost: 'enemy_frost',
  elemental: 'enemy_frost',
  imp: 'enemy_demon',
  orc: 'enemy_goblin',
  basilisk: 'enemy_spider',
  harpy: 'enemy_frost',
  minotaur: 'enemy_wolf',
  lich: 'enemy_shadow',
  wyvern: 'enemy_demon',
  chimera: 'enemy_demon',
  gargoyle: 'enemy_skeleton',
  revenant: 'enemy_shadow',
  banshee: 'enemy_frost',
  rat: 'enemy_goblin',
  snake: 'enemy_spider',
  slime: 'enemy_slime',
  golem: 'enemy_skeleton',
  fire: 'enemy_demon',
  storm: 'enemy_frost',
  blood: 'enemy_demon',
  crystal: 'enemy_frost',
  toxic: 'enemy_spider',
  dark: 'enemy_shadow',
  cursed: 'enemy_shadow',
  ancient: 'enemy_skeleton',
};

/** Resolve the sprite info for an enemy based on its name. */
function resolveEnemySprite(name?: string): { sheet: string; frame: number } {
  const fallback = ENEMY_SPRITES['enemy_slime'];
  if (!name) return fallback;
  const lower = name.toLowerCase();
  for (const [keyword, spriteKey] of Object.entries(ENEMY_TEXTURE_MAP)) {
    if (lower.includes(keyword)) {
      return ENEMY_SPRITES[spriteKey] ?? fallback;
    }
  }
  // Hash-based deterministic selection for unknown types
  const variants = Object.values(ENEMY_SPRITES);
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = ((hash << 5) - hash + lower.charCodeAt(i)) | 0;
  }
  return variants[Math.abs(hash) % variants.length];
}

export interface RemoteEntity {
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  marker?: Phaser.GameObjects.Text;
  mountText?: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  entityType: string;
  level?: number;
  hp?: number;
  maxHp?: number;
  gridX: number;
  gridY: number;
}

export type RemoteEntityMap = Map<string, RemoteEntity>;

export interface MinimapEntityMarker {
  x: number;
  y: number;
  type: string;
}

export function upsertRemoteEntity(
  scene: Phaser.Scene,
  entities: RemoteEntityMap,
  entity: EntityState,
): void {
  const screenPos = worldToScreen(entity.x, entity.y);
  const targetX = screenPos.x;
  const targetY = screenPos.y - 27;

  const existing = entities.get(entity.id);
  if (existing) {
    existing.targetX = targetX;
    existing.targetY = targetY;
    existing.level = entity.level;
    existing.gridX = entity.x;
    existing.gridY = entity.y;
    if (entity.hp !== undefined) existing.hp = entity.hp;
    if (entity.maxHp !== undefined) existing.maxHp = entity.maxHp;
    return;
  }

  // Resolve sprite: use Kenney spritesheet frames
  let sheet: string;
  let frame: number;

  if (entity.entityType === 'player') {
    const playerClass = (entity.name || '').toLowerCase();
    const pSprite = PLAYER_SPRITES[playerClass] ?? PLAYER_SPRITES['default'];
    sheet = pSprite.sheet;
    frame = pSprite.frame;
  } else if (entity.entityType === 'npc') {
    const npcKey = entity.name?.toLowerCase().includes('bank') ? 'npc_banker'
      : entity.name?.toLowerCase().includes('craft') ? 'npc_crafter'
      : entity.name?.toLowerCase().includes('market') ? 'npc_market'
      : 'npc_banker';
    const nSprite = NPC_SPRITES[npcKey] ?? NPC_SPRITES['npc_banker'];
    sheet = nSprite.sheet;
    frame = nSprite.frame;
  } else {
    const eSprite = resolveEnemySprite(entity.name);
    sheet = eSprite.sheet;
    frame = eSprite.frame;
  }

  const sprite = scene.add.sprite(targetX, targetY, sheet, frame);
  sprite.setOrigin(0.5, 1);
  sprite.setInteractive({ useHandCursor: true });

  // Scale 16px sprites to ~48px (3x), then additional scale by level for enemies
  const baseScale = 3.0;
  if (entity.entityType === 'enemy') {
    const level = entity.level || 1;
    const levelScale = 1.0 + Math.min(level - 1, 20) * 0.04;
    sprite.setScale(baseScale * levelScale);
  } else if (entity.entityType === 'player') {
    // Player scale with small level growth
    const level = entity.level || 1;
    const playerScale = 1.0 + Math.min(level - 1, 50) * 0.005;
    sprite.setScale(baseScale * playerScale);
  } else {
    sprite.setScale(baseScale);
  }

  // Mount visual for mounted players
  let mountText: Phaser.GameObjects.Text | undefined;
  if (entity.entityType === 'player' && entity.mounted) {
    const mountIcon = entity.mountName?.includes('Dragon') ? '🐉'
      : entity.mountName?.includes('Griffin') ? '🦅'
      : entity.mountName?.includes('War') ? '🐴'
      : '🏇';
    mountText = scene.add.text(targetX, targetY - 8, mountIcon, {
      fontSize: '14px',
    }).setOrigin(0.5);
    mountText.setDepth(targetY + 901);
  }

  const skullPrefix = entity.entityType === 'player' && entity.skull
    ? entity.skull === 3 ? '☠️ ' : entity.skull === 2 ? '💀 ' : entity.skull === 1 ? '🤍 ' : ''
    : '';
  const nameColor = entity.entityType === 'player'
    ? (entity.skull === 3 ? '#ff0000' : entity.skull === 2 ? '#ff4444' : entity.skull === 1 ? '#ffcc00' : hexColor(ISOMETRIC_THEME.scenes.game.playerLabel))
    : entity.entityType === 'npc'
      ? hexColor(ISOMETRIC_THEME.ui.accents.highlight)
      : hexColor(ISOMETRIC_THEME.scenes.game.enemyLabel);
  const displayName = entity.entityType === 'enemy'
    ? `${entity.name || 'Enemy'} [Lv.${entity.level || 1}]`
    : `${skullPrefix}${entity.name || (entity.entityType === 'npc' ? 'Townsfolk' : 'Unknown')}`;

  const nameText = scene.add.text(targetX, targetY - 38, displayName, {
    fontSize: '11px',
    color: nameColor,
    stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
    strokeThickness: 2,
  }).setOrigin(0.5);

  const depthBase = entity.entityType === 'player' ? 900 : entity.entityType === 'npc' ? 760 : 500;
  sprite.setDepth(targetY + depthBase);
  nameText.setDepth(targetY + depthBase + 1);

  // Floating marker for NPCs (! for quest givers, ⚒ for services)
  let marker: Phaser.GameObjects.Text | undefined;
  if (entity.entityType === 'npc') {
    const markerChar = entity.name?.toLowerCase().includes('bank') ? '🏦'
      : entity.name?.toLowerCase().includes('craft') ? '⚒️'
      : entity.name?.toLowerCase().includes('market') ? '🛒'
      : '❗';
    marker = scene.add.text(targetX, targetY - 56, markerChar, {
      fontSize: '16px',
    }).setOrigin(0.5);
    marker.setDepth(targetY + depthBase + 2);
    // Floating bounce animation
    scene.tweens.add({
      targets: marker,
      y: targetY - 62,
      duration: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  entities.set(entity.id, {
    sprite,
    nameText,
    marker,
    mountText,
    targetX,
    targetY,
    entityType: entity.entityType,
    level: entity.level,
    hp: entity.hp,
    maxHp: entity.maxHp,
    gridX: entity.x,
    gridY: entity.y,
  });
}

export function removeRemoteEntity(
  entities: RemoteEntityMap,
  healthBars: HealthBars,
  id: string,
): boolean {
  const entity = entities.get(id);
  if (!entity) return false;

  entity.sprite.destroy();
  entity.nameText.destroy();
  if (entity.marker) entity.marker.destroy();
  if (entity.mountText) entity.mountText.destroy();
  healthBars.remove(id);
  entities.delete(id);
  return true;
}

export function removeMissingRemoteEntities(
  entities: RemoteEntityMap,
  healthBars: HealthBars,
  seenIds: Set<string>,
): string[] {
  const removedIds: string[] = [];

  for (const id of Array.from(entities.keys())) {
    if (!seenIds.has(id) && removeRemoteEntity(entities, healthBars, id)) {
      removedIds.push(id);
    }
  }

  return removedIds;
}

export function findEntityAtPosition(
  entities: RemoteEntityMap,
  worldX: number,
  worldY: number,
): string | null {
  for (const [id, entity] of entities) {
    const dx = Math.abs(entity.sprite.x - worldX);
    const dy = Math.abs(entity.sprite.y - worldY);
    if (dx < 24 && dy < 36) {
      return id;
    }
  }

  return null;
}

export function interpolateRemoteEntities(
  entities: RemoteEntityMap,
  remoteLerp: number,
  healthBars: HealthBars,
): MinimapEntityMarker[] {
  const minimapEntities: MinimapEntityMarker[] = [];

  entities.forEach((entity, id) => {
    const ex = Phaser.Math.Linear(entity.sprite.x, entity.targetX, remoteLerp);
    const ey = Phaser.Math.Linear(entity.sprite.y, entity.targetY, remoteLerp);

    // Walking bob: if entity is moving, add a subtle vertical bob
    const dx = Math.abs(entity.sprite.x - entity.targetX);
    const dy = Math.abs(entity.sprite.y - entity.targetY);
    const isMoving = dx > 0.5 || dy > 0.5;
    if (isMoving) {
      const bobAmount = Math.sin(Date.now() * 0.01) * 2;
      entity.sprite.setPosition(ex, ey + bobAmount);
      // Flip sprite based on movement direction
      if (entity.targetX < entity.sprite.x) {
        entity.sprite.setFlipX(true);
      } else if (entity.targetX > entity.sprite.x) {
        entity.sprite.setFlipX(false);
      }
    } else {
      entity.sprite.setPosition(ex, ey);
    }
    entity.nameText.setPosition(ex, ey - 38);
    if (entity.marker) {
      entity.marker.setX(ex);
    }

    const depthBase = entity.entityType === 'player' ? 900 : entity.entityType === 'npc' ? 760 : 500;
    entity.sprite.setDepth(ey + depthBase);
    entity.nameText.setDepth(ey + depthBase + 1);

    if (entity.hp !== undefined && entity.maxHp !== undefined && entity.entityType === 'enemy') {
      healthBars.update(id, ex, ey - 42, entity.hp, entity.maxHp, ey + depthBase + 2);
    }

    minimapEntities.push({ x: entity.gridX, y: entity.gridY, type: entity.entityType });
  });

  return minimapEntities;
}
