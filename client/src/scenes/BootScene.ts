import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '../utils/IsoMath';

const TIPS = [
  'Store valuables in the bank — items there are never lost on death!',
  'Higher zones drop better loot. Venture far from town for riches!',
  'Hold Shift and click a player to attack them (PvP).',
  'Press B near the town center to access your bank.',
  'Boss enemies (👑) drop the best loot but are extremely dangerous.',
  'Your first 50 levels give the biggest stat boosts — plan wisely!',
  'Players below level 10 are protected from PvP item drops.',
  'Press I for Inventory, E for Equipment, C for Crafting.',
  'Mythic items have special abilities — look for the red glow!',
  'Dropped items have 30s owner priority before anyone can pick them up.',
];

/**
 * BootScene — loads all assets, shows a polished loading screen with tips,
 * then transitions to LoginScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.cameras.main;

    // Background
    this.cameras.main.setBackgroundColor(0x0a0e17);

    // Title
    this.add.text(width / 2, height / 2 - 100, '🏰 RealmForge', {
      fontSize: '32px', color: '#f0c040', stroke: '#000', strokeThickness: 4,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 65, 'Infinite Worlds. Endless Adventure.', {
      fontSize: '12px', color: '#8899aa', fontStyle: 'italic',
    }).setOrigin(0.5);

    // Loading bar
    const barW = 360;
    const barH = 16;
    const barY = height / 2;
    const barX = (width - barW) / 2;

    this.add.rectangle(barX + barW / 2, barY, barW + 4, barH + 4, 0x223344);
    const bg = this.add.rectangle(barX + barW / 2, barY, barW, barH, 0x111822);
    const fill = this.add.rectangle(barX + 2, barY, 0, barH - 4, 0x00cc66);
    fill.setOrigin(0, 0.5);

    const pctLabel = this.add.text(width / 2, barY, '0%', {
      fontSize: '10px', color: '#ffffff',
    }).setOrigin(0.5);

    // Random tip
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const tipText = this.add.text(width / 2, height / 2 + 50, `💡 ${tip}`, {
      fontSize: '11px', color: '#7799bb', wordWrap: { width: 450 },
      align: 'center',
    }).setOrigin(0.5);

    // Cycle tips every 3 seconds
    this.time.addEvent({
      delay: 3000, loop: true,
      callback: () => {
        const newTip = TIPS[Math.floor(Math.random() * TIPS.length)];
        tipText.setText(`💡 ${newTip}`);
      },
    });

    this.load.on('progress', (value: number) => {
      fill.width = (barW - 4) * value;
      pctLabel.setText(`${Math.floor(value * 100)}%`);
    });
    this.load.on('complete', () => {
      [bg, fill, pctLabel].forEach(o => o.destroy());
    });

    // Generate all procedural textures
    this.generateTileTextures();
    this.generatePlayerTexture();
    this.generateEnemyTexture();
    this.generateItemDropTexture();
    this.generateParticleTextures();
  }

  create(): void {
    // Brief fade before transitioning
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(350, () => this.scene.start('LoginScene'));
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
    // Larger character: 48×54 for better visibility
    // Legs
    gfx.fillStyle(0x334466, 1);
    gfx.fillRoundedRect(14, 38, 8, 14, 2);
    gfx.fillRoundedRect(26, 38, 8, 14, 2);
    // Body
    gfx.fillStyle(0x3388ff, 1);
    gfx.fillEllipse(24, 32, 22, 24);
    // Belt
    gfx.fillStyle(0x886633, 1);
    gfx.fillRect(13, 36, 22, 3);
    // Head
    gfx.fillStyle(0xffcc88, 1);
    gfx.fillCircle(24, 14, 10);
    // Hair
    gfx.fillStyle(0x664422, 1);
    gfx.fillEllipse(24, 8, 16, 8);
    // Eyes
    gfx.fillStyle(0x222222, 1);
    gfx.fillCircle(21, 13, 2);
    gfx.fillCircle(27, 13, 2);
    // Mouth
    gfx.fillStyle(0xcc8866, 1);
    gfx.fillRect(22, 18, 4, 1);
    gfx.generateTexture('player', 48, 54);
    gfx.destroy();
  }

  private generateEnemyTexture(): void {
    const gfx = this.add.graphics();
    // Larger enemy slime: 48×48
    // Shadow
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(24, 42, 32, 8);
    // Body
    gfx.fillStyle(0xcc2222, 1);
    gfx.fillEllipse(24, 30, 32, 24);
    // Top bump
    gfx.fillStyle(0xcc2222, 1);
    gfx.fillEllipse(24, 20, 20, 16);
    // Highlight
    gfx.fillStyle(0xff4444, 0.6);
    gfx.fillEllipse(17, 22, 10, 6);
    // Eyes
    gfx.fillStyle(0xffff00, 1);
    gfx.fillCircle(17, 26, 5);
    gfx.fillCircle(31, 26, 5);
    gfx.fillStyle(0x000000, 1);
    gfx.fillCircle(17, 26, 2.5);
    gfx.fillCircle(31, 26, 2.5);
    // Mouth
    gfx.lineStyle(2, 0x880000, 0.8);
    gfx.beginPath();
    gfx.arc(24, 33, 6, 0, Math.PI, false);
    gfx.strokePath();
    gfx.generateTexture('enemy_slime', 48, 48);
    gfx.destroy();
  }

  private generateItemDropTexture(): void {
    const gfx = this.add.graphics();
    // Larger item bag: 24×24
    // Shadow
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(12, 21, 16, 4);
    // Bag body
    gfx.fillStyle(0xddaa44, 1);
    gfx.fillRoundedRect(4, 8, 16, 14, 3);
    // Tie at top
    gfx.fillStyle(0xbb8833, 1);
    gfx.fillRect(8, 4, 8, 5);
    gfx.fillCircle(12, 4, 3);
    // Shine
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(9, 12, 2);
    gfx.generateTexture('item_drop', 24, 24);
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

  private generateParticleTextures(): void {
    // Spark particle (for combat)
    const sparkGfx = this.add.graphics();
    sparkGfx.fillStyle(0xffffff, 1);
    sparkGfx.fillCircle(4, 4, 4);
    sparkGfx.fillStyle(0xffffff, 0.5);
    sparkGfx.fillCircle(4, 4, 2);
    sparkGfx.generateTexture('particle_spark', 8, 8);
    sparkGfx.destroy();

    // Star particle (for level up)
    const starGfx = this.add.graphics();
    starGfx.fillStyle(0xffdd00, 1);
    this.drawStar(starGfx, 6, 6, 5, 6, 3);
    starGfx.generateTexture('particle_star', 12, 12);
    starGfx.destroy();

    // Glow particle (for loot)
    const glowGfx = this.add.graphics();
    glowGfx.fillStyle(0xffffff, 0.8);
    glowGfx.fillCircle(6, 6, 6);
    glowGfx.fillStyle(0xffffff, 0.3);
    glowGfx.fillCircle(6, 6, 3);
    glowGfx.generateTexture('particle_glow', 12, 12);
    glowGfx.destroy();

    // Blood particle (for damage)
    const bloodGfx = this.add.graphics();
    bloodGfx.fillStyle(0xcc0000, 1);
    bloodGfx.fillCircle(3, 3, 3);
    bloodGfx.generateTexture('particle_blood', 6, 6);
    bloodGfx.destroy();
  }

  private drawStar(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, spikes: number, outerR: number, innerR: number): void {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    gfx.beginPath();
    gfx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      gfx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      gfx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    gfx.closePath();
    gfx.fillPath();
  }
}
