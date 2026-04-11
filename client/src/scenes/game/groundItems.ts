import Phaser from 'phaser';
import type { GroundItemPayload } from '../../types/gameData';
import { worldToScreen } from '../../utils/IsoMath';
import { ISOMETRIC_THEME, getRarityColor, getRarityHex, hexColor } from '../../theme/isometricTheme';
import { ITEM_SPRITES, SHEET_DUNGEON } from '../../theme/spriteMapping';

export interface GroundItemView {
  sprite: Phaser.GameObjects.Sprite;
  text: Phaser.GameObjects.Text;
  gridX: number;
  gridY: number;
  templateId: string;
  rarity: number;
  beam?: Phaser.GameObjects.Graphics;
  glow?: Phaser.GameObjects.Graphics;
}

export type GroundItemViewMap = Map<string, GroundItemView>;

// Pickup prompt (shared single instance)
let pickupPrompt: Phaser.GameObjects.Text | null = null;
let pickupPromptTarget: string | null = null;

/** Resolve a spritesheet frame for a ground item based on its templateId */
function resolveGroundItemSprite(templateId: string): { sheet: string; frame: number } {
  const lower = String(templateId ?? '').toLowerCase();
  if (lower.includes('sword') || lower.includes('blade') || lower.includes('axe') || lower.includes('hatchet'))
    return ITEM_SPRITES['weapon'];
  if (lower.includes('shield') || lower.includes('buckler')) return ITEM_SPRITES['shield'];
  if (lower.includes('staff') || lower.includes('wand')) return ITEM_SPRITES['staff'];
  if (lower.includes('potion') && (lower.includes('hp') || lower.includes('health'))) return ITEM_SPRITES['potion_hp'];
  if (lower.includes('potion') && (lower.includes('mp') || lower.includes('mana'))) return ITEM_SPRITES['potion_mp'];
  if (lower.includes('potion')) return ITEM_SPRITES['potion_hp'];
  if (lower.includes('gem') || lower.includes('crystal')) return ITEM_SPRITES['gem_fire'];
  if (lower.includes('ore') || lower.includes('shard')) return ITEM_SPRITES['gem_ice'];
  if (lower.includes('skull') || lower.includes('bone')) return ITEM_SPRITES['skull'];
  if (lower.includes('chest') || lower.includes('box')) return ITEM_SPRITES['chest'];
  return ITEM_SPRITES['item_drop'];
}

function destroyGroundItem(view: GroundItemView): void {
  view.sprite.destroy();
  view.text.destroy();
  view.beam?.destroy();
  view.glow?.destroy();
}

/** Create a glowing halo under a rare+ item */
function createGlow(scene: Phaser.Scene, x: number, y: number, rarity: number, depth: number): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  const color = getRarityColor(rarity);
  const radius = 12 + rarity * 3;
  gfx.fillStyle(color, 0.15 + rarity * 0.05);
  gfx.fillEllipse(x, y + 4, radius * 2, radius);
  gfx.setDepth(depth - 2);
  scene.tweens.add({
    targets: gfx,
    alpha: { from: 0.4, to: 0.8 },
    duration: 800 + Math.random() * 400,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return gfx;
}

/** Create a vertical loot beam for epic+ items */
function createLootBeam(scene: Phaser.Scene, x: number, y: number, rarity: number, depth: number): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  const color = getRarityColor(rarity);
  const beamWidth = 3 + rarity;
  const beamHeight = 50 + rarity * 15;
  // Gradient beam effect (multiple semi-transparent rects)
  for (let i = 0; i < beamHeight; i += 2) {
    const alpha = (1 - i / beamHeight) * (0.2 + rarity * 0.05);
    gfx.fillStyle(color, alpha);
    gfx.fillRect(x - beamWidth / 2, y - i - 20, beamWidth, 2);
  }
  // Top sparkle
  gfx.fillStyle(0xffffff, 0.6);
  gfx.fillCircle(x, y - beamHeight - 15, 2);
  gfx.setDepth(depth - 1);
  scene.tweens.add({
    targets: gfx,
    alpha: { from: 0.5, to: 1.0 },
    duration: 1200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return gfx;
}

export function updateGroundItemViews(
  scene: Phaser.Scene,
  groundItems: GroundItemViewMap,
  items: GroundItemPayload[],
): void {
  const currentIds = new Set(items.map((item) => item.id));

  for (const [id, view] of Array.from(groundItems.entries())) {
    if (!currentIds.has(id)) {
      destroyGroundItem(view);
      groundItems.delete(id);
      if (pickupPromptTarget === id) {
        pickupPrompt?.setVisible(false);
        pickupPromptTarget = null;
      }
    }
  }

  for (const item of items) {
    if (groundItems.has(item.id)) {
      continue;
    }

    const pos = worldToScreen(item.x, item.y);
    const isXpOrb = item.templateId.startsWith('xp_orb');

    if (isXpOrb) {
      const orbKey = item.rarity >= 3 ? 'xp_orb_purple' : item.rarity >= 2 ? 'xp_orb_blue' : 'xp_orb_green';
      const sprite = scene.add.sprite(pos.x, pos.y, orbKey)
        .setDepth(pos.y - 5000)
        .setAlpha(0.85);

      scene.tweens.add({
        targets: sprite,
        y: pos.y - 4,
        duration: 800 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      const text = scene.add.text(0, 0, '').setVisible(false);
      groundItems.set(item.id, { sprite, text, gridX: item.x, gridY: item.y, templateId: item.templateId, rarity: item.rarity });
      continue;
    }

    const color = getRarityColor(item.rarity);
    const depth = pos.y - 5000;

    // Resolve ground item sprite from Kenney spritesheet
    const itemInfo = resolveGroundItemSprite(item.templateId);
    const sprite = scene.add.sprite(pos.x, pos.y, itemInfo.sheet, itemInfo.frame)
      .setDepth(depth)
      .setTint(color)
      .setScale(2.5);

    const text = scene.add.text(pos.x, pos.y - 20, item.name, {
      fontSize: item.rarity >= 3 ? '12px' : '11px',
      color: getRarityHex(item.rarity),
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
      strokeThickness: 3,
      fontStyle: item.rarity >= 3 ? 'bold' : 'normal',
    }).setOrigin(0.5).setDepth(depth + 1);

    // Bounce animation for all items
    scene.tweens.add({
      targets: sprite,
      y: pos.y - 3,
      duration: 600 + Math.random() * 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Rarity glow for uncommon+
    let glow: Phaser.GameObjects.Graphics | undefined;
    if (item.rarity >= 1) {
      glow = createGlow(scene, pos.x, pos.y, item.rarity, depth);
    }

    // Loot beam for epic+ (rarity >= 3)
    let beam: Phaser.GameObjects.Graphics | undefined;
    if (item.rarity >= 3) {
      beam = createLootBeam(scene, pos.x, pos.y, item.rarity, depth);
    }

    groundItems.set(item.id, { sprite, text, gridX: item.x, gridY: item.y, templateId: item.templateId, rarity: item.rarity, beam, glow });
  }
}

/** Update pickup prompt near player */
export function updatePickupPrompt(
  scene: Phaser.Scene,
  groundItems: GroundItemViewMap,
  playerGridX: number,
  playerGridY: number,
  maxDistance: number,
): void {
  let closestId: string | null = null;
  let closestDist = Infinity;
  let closestView: GroundItemView | null = null;

  for (const [id, item] of groundItems) {
    if (item.templateId.startsWith('xp_orb')) continue;
    const dx = playerGridX - item.gridX;
    const dy = playerGridY - item.gridY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < maxDistance && dist < closestDist) {
      closestDist = dist;
      closestId = id;
      closestView = item;
    }
  }

  if (closestId && closestView) {
    if (!pickupPrompt) {
      pickupPrompt = scene.add.text(0, 0, '', {
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(50000);
    }
    pickupPrompt.setText('Press E to pick up');
    pickupPrompt.setPosition(closestView.sprite.x, closestView.sprite.y + 16);
    pickupPrompt.setVisible(true);
    pickupPrompt.setScrollFactor(1);
    pickupPromptTarget = closestId;
  } else {
    pickupPrompt?.setVisible(false);
    pickupPromptTarget = null;
  }
}

export function clearGroundItemViews(groundItems: GroundItemViewMap): void {
  for (const view of groundItems.values()) {
    destroyGroundItem(view);
  }
  groundItems.clear();
  pickupPrompt?.destroy();
  pickupPrompt = null;
  pickupPromptTarget = null;
}

export function findNearbyGroundItemId(
  groundItems: GroundItemViewMap,
  playerGridX: number,
  playerGridY: number,
  maxDistance: number,
): string | null {
  for (const [id, item] of groundItems) {
    // XP orbs are handled by the dedicated server-side orb pickup flow.
    if (item.templateId.startsWith('xp_orb')) {
      continue;
    }
    const dx = playerGridX - item.gridX;
    const dy = playerGridY - item.gridY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < maxDistance) {
      return id;
    }
  }

  return null;
}
