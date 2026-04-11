import Phaser from 'phaser';
import { createInsetPanel, createPanelLabel } from '../../ui/shell';
import { worldToScreen } from '../../utils/IsoMath';
import { ISOMETRIC_THEME, hexColor } from '../../theme/isometricTheme';

export const BANK_ACCESS_RADIUS = 15;

/** Returns the prompt bounds centered horizontally for the given viewport width. */
export function getTouchpointPromptBounds(viewportWidth: number) {
  return {
    x: Math.floor((viewportWidth - 408) / 2),
    y: 34,
    width: 408,
    height: 52,
  };
}

// Default constant used for static references (e.g. isPointerOverUI)
export const TOWN_TOUCHPOINT_PROMPT_BOUNDS = getTouchpointPromptBounds(1280);

type TownTouchpointId = 'town-square' | 'bank' | 'crafting' | 'marketplace' | 'fountain';
type TouchpointStatus = 'landmark' | 'available' | 'blocked';

interface TownTouchpointDefinition {
  id: TownTouchpointId;
  label: string;
  caption: string;
  title: string;
  prompt: string;
  badge: string;
  textureKey?: string;
  gridX: number;
  gridY: number;
  radius: number;
  accent: number;
  status: TouchpointStatus;
  depthOffset: number;
  shadowWidth: number;
  markerWidth: number;
}

interface TownTouchpointView {
  definition: TownTouchpointDefinition;
  container: Phaser.GameObjects.Container;
  marker: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Ellipse;
  labelBg: Phaser.GameObjects.Rectangle;
  labelText: Phaser.GameObjects.Text;
  captionText: Phaser.GameObjects.Text;
}

const TOUCHPOINTS: readonly TownTouchpointDefinition[] = [
  {
    id: 'town-square',
    label: 'TOWN',
    caption: 'safe hub',
    title: 'Town Square',
    prompt: 'Bank west · Forge east · Market north · Fountain northeast. All services available!',
    badge: 'SAFE HUB',
    gridX: 0,
    gridY: 0,
    radius: 8,
    accent: ISOMETRIC_THEME.ui.accents.primary,
    status: 'landmark',
    depthOffset: 780,
    shadowWidth: 28,
    markerWidth: 24,
  },
  {
    id: 'bank',
    label: 'BANK',
    caption: 'press B',
    title: 'Banker Brann',
    prompt: 'Press B to open safe storage. Bank access only works while you stay near town center.',
    badge: 'PRESS B',
    textureKey: 'npc_banker',
    gridX: -6,
    gridY: 2,
    radius: 5.75,
    accent: ISOMETRIC_THEME.ui.panels.bank.title,
    status: 'available',
    depthOffset: 920,
    shadowWidth: 30,
    markerWidth: 26,
  },
  {
    id: 'crafting',
    label: 'FORGE',
    caption: 'press C',
    title: 'Forgekeeper Oren',
    prompt: 'Press C to craft using materials already in your inventory. The forge marks the town workshop.',
    badge: 'PRESS C',
    textureKey: 'npc_crafter',
    gridX: 6,
    gridY: 2,
    radius: 5.75,
    accent: ISOMETRIC_THEME.text.magic,
    status: 'available',
    depthOffset: 920,
    shadowWidth: 30,
    markerWidth: 26,
  },
  {
    id: 'marketplace',
    label: 'MARKET',
    caption: 'press M',
    title: 'Merchant Kael',
    prompt: 'Press M to open the marketplace. Buy supplies and sell your loot for gold.',
    badge: 'PRESS M',
    textureKey: 'landmark_market_open',
    gridX: 0,
    gridY: -7,
    radius: 6.5,
    accent: ISOMETRIC_THEME.ui.accents.success,
    status: 'available',
    depthOffset: 860,
    shadowWidth: 38,
    markerWidth: 30,
  },
  {
    id: 'fountain',
    label: 'FOUNTAIN',
    caption: 'healing',
    title: 'Healing Fountain',
    prompt: 'Stand near the fountain to gradually restore your health. The ancient waters heal all who rest here.',
    badge: 'HEALING',
    textureKey: 'landmark_fountain',
    gridX: 4,
    gridY: -3,
    radius: 5,
    accent: ISOMETRIC_THEME.ui.bars.healthHigh,
    status: 'available',
    depthOffset: 860,
    shadowWidth: 32,
    markerWidth: 24,
  },
] as const;

function distanceBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));
}

function drawDiamondMarker(
  graphics: Phaser.GameObjects.Graphics,
  color: number,
  width: number,
  fillAlpha: number,
  lineAlpha: number,
): void {
  const halfWidth = width / 2;
  const halfHeight = width / 3;

  graphics.clear();
  graphics.fillStyle(color, fillAlpha);
  graphics.lineStyle(2, color, lineAlpha);
  graphics.beginPath();
  graphics.moveTo(0, -halfHeight);
  graphics.lineTo(halfWidth, 0);
  graphics.lineTo(0, halfHeight);
  graphics.lineTo(-halfWidth, 0);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

function drawTownBeacon(graphics: Phaser.GameObjects.Graphics, color: number): void {
  graphics.clear();
  graphics.fillStyle(ISOMETRIC_THEME.palette.shadow, 0.2);
  graphics.fillEllipse(0, 20, 20, 8);

  graphics.fillStyle(color, 0.26);
  graphics.lineStyle(2, color, 0.92);
  graphics.beginPath();
  graphics.moveTo(0, -18);
  graphics.lineTo(8, -6);
  graphics.lineTo(0, 12);
  graphics.lineTo(-8, -6);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();

  graphics.fillStyle(ISOMETRIC_THEME.palette.white, 0.9);
  graphics.fillEllipse(0, -8, 4, 8);
  graphics.fillStyle(color, 0.85);
  graphics.fillEllipse(0, -28, 6, 6);
}

export class TownTouchpoints {
  private readonly scene: Phaser.Scene;
  private readonly views: TownTouchpointView[];
  private readonly promptContainer: Phaser.GameObjects.Container;
  private readonly promptAccent: Phaser.GameObjects.Rectangle;
  private readonly promptTitle: Phaser.GameObjects.Text;
  private readonly promptBody: Phaser.GameObjects.Text;
  private readonly promptBadgeBg: Phaser.GameObjects.Rectangle;
  private readonly promptBadgeText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.views = TOUCHPOINTS.map((definition) => this.createTouchpointView(definition));

    const bounds = getTouchpointPromptBounds(scene.scale.width);
    const { x, y, width, height } = bounds;
    const container = scene.add.container(x + width / 2, y + height / 2);
    container.setScrollFactor(0);
    container.setDepth(3300);
    container.setVisible(false);

    createInsetPanel(scene, {
      parent: container,
      x: -width / 2,
      y: -height / 2,
      width,
      height,
      fill: ISOMETRIC_THEME.palette.surface,
      stroke: ISOMETRIC_THEME.palette.borderStrong,
      alpha: 0.9,
    });

    this.promptAccent = scene.add.rectangle(-width / 2 + 4, 0, 4, height - 10, ISOMETRIC_THEME.ui.accents.primary, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    container.add(this.promptAccent);

    this.promptTitle = createPanelLabel(scene, {
      parent: container,
      x: -width / 2 + 18,
      y: -14,
      text: '',
      fontSize: '11px',
      fontStyle: 'bold',
      color: ISOMETRIC_THEME.text.primary,
    });
    this.promptBody = createPanelLabel(scene, {
      parent: container,
      x: -width / 2 + 18,
      y: 0,
      text: '',
      fontSize: '10px',
      color: ISOMETRIC_THEME.text.secondary,
      wordWrapWidth: width - 120,
    });

    this.promptBadgeBg = scene.add.rectangle(width / 2 - 52, 0, 78, 20, ISOMETRIC_THEME.palette.surfaceMuted, 0.94)
      .setScrollFactor(0)
      .setOrigin(0.5);
    this.promptBadgeBg.setStrokeStyle(1, ISOMETRIC_THEME.ui.accents.primary, 0.95);
    container.add(this.promptBadgeBg);

    this.promptBadgeText = createPanelLabel(scene, {
      parent: container,
      x: width / 2 - 52,
      y: -5,
      text: '',
      fontSize: '10px',
      fontStyle: 'bold',
      color: ISOMETRIC_THEME.text.primary,
      originX: 0.5,
    });

    this.promptContainer = container;
  }

  update(playerGridX: number, playerGridY: number): void {
    const activeTouchpoint = this.pickActiveTouchpoint(playerGridX, playerGridY);

    if (activeTouchpoint) {
      this.promptContainer.setVisible(true);
      this.promptAccent.setFillStyle(activeTouchpoint.accent, 1);
      this.promptTitle
        .setText(activeTouchpoint.title)
        .setColor(hexColor(activeTouchpoint.accent));
      this.promptBody.setText(activeTouchpoint.prompt);
      this.promptBadgeBg.setStrokeStyle(1, activeTouchpoint.accent, 0.95);
      this.promptBadgeText
        .setText(activeTouchpoint.badge)
        .setColor(hexColor(activeTouchpoint.accent));
    } else {
      this.promptContainer.setVisible(false);
    }

    for (const view of this.views) {
      const distance = distanceBetween(
        playerGridX,
        playerGridY,
        view.definition.gridX,
        view.definition.gridY,
      );
      const isActive = activeTouchpoint?.id === view.definition.id;
      const isNearby = distance <= view.definition.radius + 2.5;

      drawDiamondMarker(
        view.marker,
        view.definition.accent,
        isActive ? view.definition.markerWidth + 4 : view.definition.markerWidth,
        isActive ? 0.36 : isNearby ? 0.24 : 0.14,
        isActive ? 1 : 0.74,
      );
      view.glow.setFillStyle(view.definition.accent, isActive ? 0.28 : isNearby ? 0.18 : 0.1);
      view.glow.setScale(isActive ? 1.12 : 1);
      view.labelBg.setStrokeStyle(1, view.definition.accent, isActive ? 1 : 0.8);
      view.labelBg.setAlpha(isActive ? 0.98 : isNearby ? 0.9 : 0.78);
      view.labelText.setAlpha(isActive ? 1 : 0.9);
      view.captionText.setAlpha(isActive ? 0.95 : isNearby ? 0.85 : 0.72);
      view.container.setScale(isActive ? 1.04 : 1);
    }
  }

  canUseBank(playerGridX: number, playerGridY: number): boolean {
    return distanceBetween(playerGridX, playerGridY, 0, 0) < BANK_ACCESS_RADIUS;
  }

  isNearCraftingStation(playerGridX: number, playerGridY: number): boolean {
    const forge = TOUCHPOINTS.find((touchpoint) => touchpoint.id === 'crafting');
    return forge
      ? distanceBetween(playerGridX, playerGridY, forge.gridX, forge.gridY) <= forge.radius
      : false;
  }

  isNearFountain(playerGridX: number, playerGridY: number): boolean {
    const fountain = TOUCHPOINTS.find((touchpoint) => touchpoint.id === 'fountain');
    return fountain
      ? distanceBetween(playerGridX, playerGridY, fountain.gridX, fountain.gridY) <= fountain.radius
      : false;
  }

  /** Reposition the prompt panel when the viewport resizes. */
  repositionPrompt(viewportWidth: number): void {
    const bounds = getTouchpointPromptBounds(viewportWidth);
    this.promptContainer.setPosition(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }

  destroy(): void {
    this.promptContainer.destroy();
    for (const view of this.views) {
      view.container.destroy();
    }
  }

  private pickActiveTouchpoint(playerGridX: number, playerGridY: number): TownTouchpointDefinition | null {
    let bestMatch: { definition: TownTouchpointDefinition; rank: number } | null = null;

    for (const definition of TOUCHPOINTS) {
      const distance = distanceBetween(playerGridX, playerGridY, definition.gridX, definition.gridY);
      if (distance > definition.radius) {
        continue;
      }

      const rank = (definition.id === 'town-square' ? 100 : 0) + distance;
      if (!bestMatch || rank < bestMatch.rank) {
        bestMatch = { definition, rank };
      }
    }

    return bestMatch?.definition ?? null;
  }

  private createTouchpointView(definition: TownTouchpointDefinition): TownTouchpointView {
    const position = worldToScreen(definition.gridX, definition.gridY);
    const container = this.scene.add.container(position.x, position.y - 8);
    container.setDepth(position.y + definition.depthOffset);

    const shadow = this.scene.add.ellipse(0, 23, definition.shadowWidth, 10, ISOMETRIC_THEME.palette.black, 0.22);
    const glow = this.scene.add.ellipse(0, 24, definition.markerWidth + 14, 12, definition.accent, 0.16);
    const marker = this.scene.add.graphics();
    marker.setPosition(0, 24);

    container.add([shadow, glow, marker]);

    if (definition.textureKey) {
      const sprite = this.scene.add.sprite(0, 22, definition.textureKey).setOrigin(0.5, 1);
      container.add(sprite);
    } else {
      const beacon = this.scene.add.graphics();
      drawTownBeacon(beacon, definition.accent);
      beacon.setY(2);
      container.add(beacon);
    }

    const labelBg = this.scene.add.rectangle(0, -41, 70, 14, ISOMETRIC_THEME.palette.surface, 0.88)
      .setOrigin(0.5);
    labelBg.setStrokeStyle(1, definition.accent, 0.84);
    const labelText = this.scene.add.text(0, -44, definition.label, {
      fontFamily: 'monospace',
      fontSize: '10px',
      fontStyle: 'bold',
      color: hexColor(definition.accent),
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
      strokeThickness: 2,
    }).setOrigin(0.5, 0);
    const captionText = this.scene.add.text(0, -30, definition.caption, {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: hexColor(ISOMETRIC_THEME.text.secondary),
      stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
      strokeThickness: 2,
    }).setOrigin(0.5, 0);

    container.add([labelBg, labelText, captionText]);

    this.scene.tweens.add({
      targets: glow,
      alpha: 0.08,
      scaleX: 1.1,
      scaleY: 1.08,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    drawDiamondMarker(marker, definition.accent, definition.markerWidth, 0.18, 0.78);

    return {
      definition,
      container,
      marker,
      glow,
      labelBg,
      labelText,
      captionText,
    };
  }
}
