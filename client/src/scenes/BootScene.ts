import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '../utils/IsoMath';

/**
 * BootScene — loads all assets and shows a loading bar, then transitions to LoginScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Loading bar
    const { width, height } = this.cameras.main;
    const barW = 320;
    const barH = 20;
    const barX = (width - barW) / 2;
    const barY = height / 2;

    const bg = this.add.rectangle(barX + barW / 2, barY, barW, barH, 0x333333);
    const fill = this.add.rectangle(barX + 2, barY, 0, barH - 4, 0x00ff88);
    fill.setOrigin(0, 0.5);
    const label = this.add.text(width / 2, barY - 30, 'Loading...', {
      fontSize: '14px', color: '#aaa',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      fill.width = (barW - 4) * value;
    });
    this.load.on('complete', () => {
      bg.destroy();
      fill.destroy();
      label.destroy();
    });

    // Generate isometric tile textures procedurally
    this.generateTileTextures();
    this.generatePlayerTexture();
    this.generateEnemyTexture();
    this.generateItemDropTexture();
  }

  create(): void {
    this.scene.start('LoginScene');
  }

  private generateTileTextures(): void {
    // Grass tile (isometric diamond)
    const grassGfx = this.add.graphics();
    this.drawIsoDiamond(grassGfx, 0x4a8c3f, 0x3a7030);
    grassGfx.generateTexture('tile_grass', TILE_WIDTH, TILE_HEIGHT);
    grassGfx.destroy();

    // Water tile
    const waterGfx = this.add.graphics();
    this.drawIsoDiamond(waterGfx, 0x2266aa, 0x1a5590);
    waterGfx.generateTexture('tile_water', TILE_WIDTH, TILE_HEIGHT);
    waterGfx.destroy();

    // Sand tile
    const sandGfx = this.add.graphics();
    this.drawIsoDiamond(sandGfx, 0xc2a645, 0xb09535);
    sandGfx.generateTexture('tile_sand', TILE_WIDTH, TILE_HEIGHT);
    sandGfx.destroy();

    // Stone tile
    const stoneGfx = this.add.graphics();
    this.drawIsoDiamond(stoneGfx, 0x888888, 0x666666);
    stoneGfx.generateTexture('tile_stone', TILE_WIDTH, TILE_HEIGHT);
    stoneGfx.destroy();

    // Snow tile
    const snowGfx = this.add.graphics();
    this.drawIsoDiamond(snowGfx, 0xddddee, 0xccccdd);
    snowGfx.generateTexture('tile_snow', TILE_WIDTH, TILE_HEIGHT);
    snowGfx.destroy();

    // Forest tile (darker grass)
    const forestGfx = this.add.graphics();
    this.drawIsoDiamond(forestGfx, 0x2d6b26, 0x225520);
    forestGfx.generateTexture('tile_forest', TILE_WIDTH, TILE_HEIGHT);
    forestGfx.destroy();

    // Swamp tile
    const swampGfx = this.add.graphics();
    this.drawIsoDiamond(swampGfx, 0x4a5a30, 0x3a4a25);
    swampGfx.generateTexture('tile_swamp', TILE_WIDTH, TILE_HEIGHT);
    swampGfx.destroy();

    // Town tile (cobblestone)
    const townGfx = this.add.graphics();
    this.drawIsoDiamond(townGfx, 0x9a8a7a, 0x8a7a6a);
    townGfx.generateTexture('tile_town', TILE_WIDTH, TILE_HEIGHT);
    townGfx.destroy();
  }

  private generatePlayerTexture(): void {
    const gfx = this.add.graphics();
    // Simple character placeholder: isometric "person" shape
    // Body
    gfx.fillStyle(0x3388ff, 1);
    gfx.fillEllipse(16, 22, 14, 18);
    // Head
    gfx.fillStyle(0xffcc88, 1);
    gfx.fillCircle(16, 8, 7);
    // Eyes
    gfx.fillStyle(0x222222, 1);
    gfx.fillCircle(14, 7, 1.5);
    gfx.fillCircle(18, 7, 1.5);
    gfx.generateTexture('player', 32, 36);
    gfx.destroy();
  }

  private generateEnemyTexture(): void {
    const gfx = this.add.graphics();
    // Simple enemy: red slime-like blob
    gfx.fillStyle(0xcc2222, 1);
    gfx.fillEllipse(16, 20, 20, 16);
    // Highlight
    gfx.fillStyle(0xff4444, 0.6);
    gfx.fillEllipse(12, 16, 6, 4);
    // Eyes
    gfx.fillStyle(0xffff00, 1);
    gfx.fillCircle(11, 17, 3);
    gfx.fillCircle(21, 17, 3);
    gfx.fillStyle(0x000000, 1);
    gfx.fillCircle(11, 17, 1.5);
    gfx.fillCircle(21, 17, 1.5);
    gfx.generateTexture('enemy_slime', 32, 32);
    gfx.destroy();
  }

  private generateItemDropTexture(): void {
    const gfx = this.add.graphics();
    // Small glowing bag/pouch
    gfx.fillStyle(0xddaa44, 1);
    gfx.fillRoundedRect(4, 6, 8, 8, 2);
    // Tie at top
    gfx.fillStyle(0xbb8833, 1);
    gfx.fillRect(6, 4, 4, 3);
    // Shine
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(7, 8, 1.5);
    gfx.generateTexture('item_drop', 16, 16);
    gfx.destroy();
  }

  private drawIsoDiamond(gfx: Phaser.GameObjects.Graphics, fillColor: number, strokeColor: number): void {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    gfx.fillStyle(fillColor, 1);
    gfx.beginPath();
    gfx.moveTo(hw, 0);
    gfx.lineTo(TILE_WIDTH, hh);
    gfx.lineTo(hw, TILE_HEIGHT);
    gfx.lineTo(0, hh);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(1, strokeColor, 0.4);
    gfx.strokePath();
  }
}
