import Phaser from 'phaser';

/**
 * HealthBars — renders floating HP bars above entities.
 */
export class HealthBars {
  private scene: Phaser.Scene;
  private bars: Map<string, { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Update or create a health bar for an entity */
  update(entityId: string, x: number, y: number, hp: number, maxHp: number, depth = 0): void {
    const ratio = Math.max(0, hp / maxHp);
    const barW = 28;
    const barH = 3;

    if (this.bars.has(entityId)) {
      const bar = this.bars.get(entityId)!;
      bar.bg.setPosition(x, y);
      bar.fill.setPosition(x - barW / 2, y);
      bar.fill.width = barW * ratio;
      bar.fill.fillColor = ratio > 0.5 ? 0x00cc00 : ratio > 0.25 ? 0xcccc00 : 0xcc0000;
      bar.bg.setDepth(depth + 1);
      bar.fill.setDepth(depth + 2);
    } else {
      const bg = this.scene.add.rectangle(x, y, barW + 2, barH + 2, 0x000000, 0.7);
      bg.setDepth(depth + 1);
      const fill = this.scene.add.rectangle(x - barW / 2, y, barW * ratio, barH, 0x00cc00);
      fill.setOrigin(0, 0.5);
      fill.setDepth(depth + 2);
      this.bars.set(entityId, { bg, fill });
    }
  }

  /** Remove a specific health bar */
  remove(entityId: string): void {
    const bar = this.bars.get(entityId);
    if (bar) {
      bar.bg.destroy();
      bar.fill.destroy();
      this.bars.delete(entityId);
    }
  }

  /** Remove all health bars */
  clear(): void {
    for (const [id] of this.bars) {
      this.remove(id);
    }
  }

  destroy(): void {
    this.clear();
  }
}
