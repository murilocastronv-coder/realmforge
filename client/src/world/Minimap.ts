import Phaser from 'phaser';
import { ISOMETRIC_THEME } from '../theme/isometricTheme';
import { createInsetPanel, createPanelLabel } from '../ui/shell';

/**
 * Minimap — renders a small overview of the world around the player.
 */
export class Minimap {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private mapTexture: Phaser.GameObjects.Graphics;
  private playerDot: Phaser.GameObjects.Graphics;
  private bg: Phaser.GameObjects.Graphics;
  private border: Phaser.GameObjects.Graphics;
  private size: number;
  private mapSize: number;
  private mapOrigin = 8;
  private scale: number;

  constructor(scene: Phaser.Scene, x: number, y: number, size = 140) {
    this.scene = scene;
    this.size = size;
    this.mapSize = size - this.mapOrigin * 2;
    this.scale = 2;
    const minimapTheme = ISOMETRIC_THEME.ui.panels.minimap;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(3000);

    this.bg = createInsetPanel(scene, {
      parent: this.container,
      x: 0,
      y: 0,
      width: size,
      height: size,
      fill: minimapTheme.fill,
      stroke: minimapTheme.stroke,
      alpha: 0.84,
    });

    createInsetPanel(scene, {
      parent: this.container,
      x: this.mapOrigin,
      y: this.mapOrigin,
      width: this.mapSize,
      height: this.mapSize,
      fill: ISOMETRIC_THEME.palette.black,
      stroke: minimapTheme.stroke,
      alpha: 0,
      highlight: false,
    });

    this.border = createInsetPanel(scene, {
      parent: this.container,
      x: 6,
      y: 6,
      width: size - 12,
      height: 14,
      fill: ISOMETRIC_THEME.palette.surfaceMuted,
      stroke: minimapTheme.stroke,
      alpha: 0.72,
    });

    createPanelLabel(scene, {
      parent: this.container,
      x: 12,
      y: 9,
      text: 'MINIMAP',
      fontSize: '8px',
      fontStyle: 'bold',
      color: minimapTheme.title,
    });

    this.mapTexture = scene.add.graphics();
    this.container.add(this.mapTexture);

    this.playerDot = scene.add.graphics();
    this.playerDot.fillStyle(ISOMETRIC_THEME.ui.accents.success, 1);
    this.playerDot.fillCircle(this.mapOrigin + this.mapSize / 2, this.mapOrigin + this.mapSize / 2, 2);
    this.container.add(this.playerDot);
  }

  /** Update minimap centered on player position */
  update(playerX: number, playerY: number, entities?: Array<{ x: number; y: number; type: string; rank?: string }>): void {
    this.mapTexture.clear();
    const half = this.mapSize / 2;
    const range = half * this.scale;

    const step = this.scale * 2;
    for (let dy = -range; dy < range; dy += step) {
      for (let dx = -range; dx < range; dx += step) {
        const wx = Math.round(playerX + dx);
        const wy = Math.round(playerY + dy);
        const color = this.getTileColor(wx, wy);

        const px = this.mapOrigin + half + dx / this.scale;
        const py = this.mapOrigin + half + dy / this.scale;

        if (px >= this.mapOrigin && px < this.mapOrigin + this.mapSize && py >= this.mapOrigin && py < this.mapOrigin + this.mapSize) {
          this.mapTexture.fillStyle(color, 0.8);
          this.mapTexture.fillRect(px, py, 2, 2);
        }
      }
    }

    if (entities) {
      for (const entity of entities) {
        const px = this.mapOrigin + half + (entity.x - playerX) / this.scale;
        const py = this.mapOrigin + half + (entity.y - playerY) / this.scale;

        if (
          px >= this.mapOrigin + 2 &&
          px < this.mapOrigin + this.mapSize - 2 &&
          py >= this.mapOrigin + 2 &&
          py < this.mapOrigin + this.mapSize - 2
        ) {
          let color: number;
          let dotSize = 1.5;
          switch (entity.type) {
            case 'player':
              color = ISOMETRIC_THEME.scenes.game.playerLabel;
              dotSize = 2;
              break;
            case 'npc':
              color = ISOMETRIC_THEME.ui.accents.highlight;
              dotSize = 2;
              break;
            case 'resource':
              color = 0x00ccff; // cyan for resource nodes
              dotSize = 1.5;
              break;
            default: // enemy
              color = ISOMETRIC_THEME.scenes.game.enemyLabel;
              dotSize = entity.rank === 'boss' ? 3 : entity.rank === 'elite' ? 2.5 : 1.5;
              break;
          }
          this.mapTexture.fillStyle(color, 1);
          this.mapTexture.fillCircle(px, py, dotSize);
        }
      }
    }
  }

  private getTileColor(x: number, y: number): number {
    const dist = Math.sqrt(x * x + y * y);
    if (dist < 15) return ISOMETRIC_THEME.terrain.town.fill;

    let hash = (x * 374761393 + y * 668265263 + 1013904223) | 0;
    hash = (hash ^ (hash >> 13)) * 1274126177;
    hash = (hash ^ (hash >> 16)) >>> 0;
    const n = hash / 4294967296;

    let waterHash = ((x * 3) * 374761393 + (y * 3 + 1000) * 668265263 + 1013904223) | 0;
    waterHash = (waterHash ^ (waterHash >> 13)) * 1274126177;
    waterHash = waterHash ^ (waterHash >> 16);
    if ((waterHash >>> 0) / 4294967296 < 0.08) return ISOMETRIC_THEME.terrain.water.fill;

    const angle = Math.atan2(y, x);
    if (dist > 60) {
      if (n < 0.3) return ISOMETRIC_THEME.terrain.snow.fill;
      if (n < 0.5) return ISOMETRIC_THEME.terrain.stone.fill;
    }
    if (angle > 0 && angle < Math.PI / 2 && n < 0.4) return ISOMETRIC_THEME.terrain.forest.fill;
    if (angle > Math.PI / 2 && n < 0.3) return ISOMETRIC_THEME.terrain.sand.fill;
    if (angle < -Math.PI / 2 && n < 0.25) return ISOMETRIC_THEME.terrain.swamp.fill;

    return ISOMETRIC_THEME.terrain.grass.fill;
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  reposition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  destroy(): void {
    this.container.destroy();
  }
}
