import Phaser from 'phaser';
import { generateIsometricTextures } from '../theme/isometricAssetGenerator';
import { ISOMETRIC_THEME, hexColor } from '../theme/isometricTheme';
import { SHEET_DUNGEON, SHEET_TOWN } from '../theme/spriteMapping';

const TIPS = [
  'Store valuables in the bank — items there are never lost on death!',
  'Higher zones drop better loot. Venture far from town for riches!',
  'Press B near the town center to access your bank.',
  'Press M near the market stalls to trade with Merchant Kael.',
  'Boss enemies (👑) drop the best loot but are extremely dangerous.',
  'Your first 50 levels give the biggest stat boosts — plan wisely!',
  'Press I for Inventory, E for Equipment, C for Crafting.',
  'Mythic items have special abilities — look for the red glow!',
  'Dropped items have 30s owner priority before anyone can pick them up.',
  'The healing fountain in town restores your HP over time.',
  'Different enemy types have different strengths — watch the colors!',
  'Craft higher-tier gear at the Forge with rare materials.',
  'Sell unwanted loot at the marketplace to earn gold.',
  'Materials can be bought from Merchant Kael if you need them for crafting.',
  'Blue enemies are wolves — fast and aggressive!',
  'Purple enemies are spiders — watch for their poison!',
  'Skeleton enemies glow green — undead are weak to holy damage.',
  'Elite and Champion enemies drop much better loot than normal ones.',
  'Enemies flee when they get too close to town — use this to your advantage!',
  'Gold ore and gem shards are needed for advanced crafting recipes.',
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
    const bootTheme = ISOMETRIC_THEME.scenes.boot;

    // Background
    this.cameras.main.setBackgroundColor(ISOMETRIC_THEME.palette.canvas);

    // Title
    this.add.text(width / 2, height / 2 - 100, '🏰 RealmForge', {
      fontSize: '40px', fontFamily: 'monospace', color: hexColor(bootTheme.title), stroke: hexColor(ISOMETRIC_THEME.palette.shadow), strokeThickness: 4,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 65, 'Infinite Worlds · Endless Adventure', {
      fontSize: '15px', fontFamily: 'monospace', color: hexColor(bootTheme.subtitle),
    }).setOrigin(0.5);

    // Loading bar
    const barW = 360;
    const barH = 16;
    const barY = height / 2;
    const barX = (width - barW) / 2;

    this.add.rectangle(barX + barW / 2, barY, barW + 4, barH + 4, bootTheme.loadFrame);
    const bg = this.add.rectangle(barX + barW / 2, barY, barW, barH, bootTheme.loadTrack);
    const fill = this.add.rectangle(barX + 2, barY, 0, barH - 4, bootTheme.loadFill);
    fill.setOrigin(0, 0.5);

    const pctLabel = this.add.text(width / 2, barY, '0%', {
      fontSize: '12px', color: hexColor(ISOMETRIC_THEME.text.primary),
    }).setOrigin(0.5);

    // Random tip
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const tipText = this.add.text(width / 2, height / 2 + 50, `💡 ${tip}`, {
      fontSize: '13px', color: hexColor(bootTheme.tip), wordWrap: { width: 450 },
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

    // Load Kenney spritesheets (16×16 tiles, no spacing, 12 cols × 11 rows)
    this.load.spritesheet(SHEET_DUNGEON, 'assets/spritesheets/tiny-dungeon.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.spritesheet(SHEET_TOWN, 'assets/spritesheets/tiny-town.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.spritesheet('sheet_rpg_urban', 'assets/spritesheets/rpg-urban.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });

    generateIsometricTextures(this);
  }

  create(): void {
    // Brief fade before transitioning
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(350, () => this.scene.start('LoginScene'));
  }
}
