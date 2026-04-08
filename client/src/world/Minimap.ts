import Phaser from 'phaser';

/**
 * Minimap — renders a small overview of the world around the player.
 */
export class Minimap {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private mapTexture: Phaser.GameObjects.Graphics;
  private playerDot: Phaser.GameObjects.Graphics;
  private bg: Phaser.GameObjects.Rectangle;
  private border: Phaser.GameObjects.Rectangle;
  private size: number;
  private scale: number;

  constructor(scene: Phaser.Scene, x: number, y: number, size = 140) {
    this.scene = scene;
    this.size = size;
    this.scale = 2; // 1 pixel = 2 tiles

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(3000);

    // Background
    this.bg = scene.add.rectangle(0, 0, size, size, 0x000000, 0.7);
    this.bg.setOrigin(0, 0);
    this.container.add(this.bg);

    // Border
    this.border = scene.add.rectangle(0, 0, size, size);
    this.border.setOrigin(0, 0);
    this.border.setStrokeStyle(1, 0x444444);
    this.border.setFillStyle(0x000000, 0);
    this.container.add(this.border);

    // Map graphics
    this.mapTexture = scene.add.graphics();
    this.container.add(this.mapTexture);

    // Player dot
    this.playerDot = scene.add.graphics();
    this.playerDot.fillStyle(0x00ff00, 1);
    this.playerDot.fillCircle(size / 2, size / 2, 2);
    this.container.add(this.playerDot);

    // Label
    const label = scene.add.text(2, 2, 'MAP', {
      fontSize: '8px',
      color: '#888',
    });
    this.container.add(label);
  }

  /** Update minimap centered on player position */
  update(playerX: number, playerY: number, entities?: Array<{ x: number; y: number; type: string }>): void {
    this.mapTexture.clear();
    const half = this.size / 2;
    const range = half * this.scale;

    // Draw terrain
    const step = this.scale * 2;
    for (let dy = -range; dy < range; dy += step) {
      for (let dx = -range; dx < range; dx += step) {
        const wx = Math.round(playerX + dx);
        const wy = Math.round(playerY + dy);
        const color = this.getTileColor(wx, wy);

        const px = half + dx / this.scale;
        const py = half + dy / this.scale;

        if (px >= 0 && px < this.size && py >= 0 && py < this.size) {
          this.mapTexture.fillStyle(color, 0.8);
          this.mapTexture.fillRect(px, py, 2, 2);
        }
      }
    }

    // Draw entities
    if (entities) {
      for (const e of entities) {
        const px = half + (e.x - playerX) / this.scale;
        const py = half + (e.y - playerY) / this.scale;

        if (px >= 2 && px < this.size - 2 && py >= 2 && py < this.size - 2) {
          const color = e.type === 'player' ? 0x4488ff : 0xff4444;
          this.mapTexture.fillStyle(color, 1);
          this.mapTexture.fillCircle(px, py, 1.5);
        }
      }
    }
  }

  private getTileColor(x: number, y: number): number {
    const dist = Math.sqrt(x * x + y * y);
    if (dist < 15) return 0x9a8a7a; // town

    let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    h = (h ^ (h >> 16)) >>> 0;
    const n = h / 4294967296;

    let wh = ((x * 3) * 374761393 + (y * 3 + 1000) * 668265263 + 1013904223) | 0;
    wh = (wh ^ (wh >> 13)) * 1274126177;
    wh = wh ^ (wh >> 16);
    if ((wh >>> 0) / 4294967296 < 0.08) return 0x2266aa;

    const angle = Math.atan2(y, x);
    if (dist > 60) {
      if (n < 0.3) return 0xddddee; // snow
      if (n < 0.5) return 0x888888; // stone
    }
    if (angle > 0 && angle < Math.PI / 2 && n < 0.4) return 0x2d6b26; // forest
    if (angle > Math.PI / 2 && n < 0.3) return 0xc2a645; // sand
    if (angle < -Math.PI / 2 && n < 0.25) return 0x4a5a30; // swamp

    return 0x4a8c3f; // grass
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  destroy(): void {
    this.container.destroy();
  }
}
