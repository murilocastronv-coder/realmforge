import Phaser from 'phaser';

export interface PlayerStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  xp: number;
  xpNeeded: number;
  atk: number;
  def: number;
  spd: number;
  lck: number;
}

/**
 * StatsUI — HUD showing HP/MP bars, level, and expandable stats panel.
 */
export class StatsUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private mpBar!: Phaser.GameObjects.Rectangle;
  private mpBarBg!: Phaser.GameObjects.Rectangle;
  private xpBar!: Phaser.GameObjects.Rectangle;
  private xpBarBg!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private mpText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private xpText!: Phaser.GameObjects.Text;

  // Expanded panel
  private expandedPanel!: Phaser.GameObjects.Container;
  private statsDetailText!: Phaser.GameObjects.Text;
  private expanded = false;

  private stats: PlayerStats = {
    hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    level: 1, xp: 0, xpNeeded: 100,
    atk: 10, def: 5, spd: 10, lck: 5,
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(3500);

    const barW = 160;
    const barH = 10;

    // Level display
    this.levelText = scene.add.text(0, 0, 'Lv.1', {
      fontSize: '12px', color: '#ffcc00', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 2,
    });
    this.container.add(this.levelText);

    // HP bar
    this.hpBarBg = scene.add.rectangle(0, 18, barW, barH, 0x440000);
    this.hpBarBg.setOrigin(0, 0);
    this.hpBar = scene.add.rectangle(0, 18, barW, barH, 0xcc0000);
    this.hpBar.setOrigin(0, 0);
    this.hpText = scene.add.text(barW / 2, 18 + barH / 2, '100/100', {
      fontSize: '8px', color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add([this.hpBarBg, this.hpBar, this.hpText]);

    // MP bar
    this.mpBarBg = scene.add.rectangle(0, 30, barW, barH, 0x000044);
    this.mpBarBg.setOrigin(0, 0);
    this.mpBar = scene.add.rectangle(0, 30, barW, barH, 0x0044cc);
    this.mpBar.setOrigin(0, 0);
    this.mpText = scene.add.text(barW / 2, 30 + barH / 2, '50/50', {
      fontSize: '8px', color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add([this.mpBarBg, this.mpBar, this.mpText]);

    // XP bar
    this.xpBarBg = scene.add.rectangle(0, 42, barW, 6, 0x333300);
    this.xpBarBg.setOrigin(0, 0);
    this.xpBar = scene.add.rectangle(0, 42, 0, 6, 0xaaaa00);
    this.xpBar.setOrigin(0, 0);
    this.xpText = scene.add.text(barW / 2, 42 + 3, 'XP: 0/100', {
      fontSize: '7px', color: '#cccc88',
    }).setOrigin(0.5);
    this.container.add([this.xpBarBg, this.xpBar, this.xpText]);

    // Click to expand
    const clickArea = scene.add.rectangle(0, 0, barW, 52, 0x000000, 0);
    clickArea.setOrigin(0, 0);
    clickArea.setInteractive({ useHandCursor: true });
    clickArea.on('pointerdown', () => this.toggleExpanded());
    this.container.add(clickArea);

    // Expanded stats panel
    this.expandedPanel = scene.add.container(0, 54);
    this.expandedPanel.setVisible(false);

    const panelBg = scene.add.rectangle(0, 0, barW, 80, 0x1a1a2e, 0.95);
    panelBg.setOrigin(0, 0);
    panelBg.setStrokeStyle(1, 0x444466);
    this.expandedPanel.add(panelBg);

    this.statsDetailText = scene.add.text(8, 6, '', {
      fontSize: '9px', color: '#aaaacc', lineSpacing: 3,
    });
    this.expandedPanel.add(this.statsDetailText);
    this.container.add(this.expandedPanel);

    this.refresh();
  }

  updateStats(stats: Partial<PlayerStats>, equipBonus?: Record<string, number>): void {
    Object.assign(this.stats, stats);
    this.refresh(equipBonus);
  }

  private refresh(equipBonus?: Record<string, number>): void {
    const s = this.stats;
    const barW = 160;

    // HP
    const hpRatio = Math.max(0, s.hp / s.maxHp);
    this.hpBar.width = barW * hpRatio;
    this.hpBar.fillColor = hpRatio > 0.5 ? 0xcc0000 : hpRatio > 0.25 ? 0xcc6600 : 0xff0000;
    this.hpText.setText(`${s.hp}/${s.maxHp}`);

    // MP
    const mpRatio = Math.max(0, s.mp / s.maxMp);
    this.mpBar.width = barW * mpRatio;
    this.mpText.setText(`${s.mp}/${s.maxMp}`);

    // XP
    const xpRatio = s.xpNeeded > 0 ? Math.min(1, s.xp / s.xpNeeded) : 0;
    this.xpBar.width = barW * xpRatio;
    this.xpText.setText(`XP: ${s.xp.toLocaleString()}/${s.xpNeeded.toLocaleString()}`);

    // Level
    this.levelText.setText(`⭐ Lv.${s.level}`);

    // Detail panel
    const lines = [
      `ATK: ${s.atk}${equipBonus?.ATK ? ` (+${equipBonus.ATK})` : ''}`,
      `DEF: ${s.def}${equipBonus?.DEF ? ` (+${equipBonus.DEF})` : ''}`,
      `SPD: ${s.spd}${equipBonus?.SPD ? ` (+${equipBonus.SPD})` : ''}`,
      `LCK: ${s.lck}${equipBonus?.LCK ? ` (+${equipBonus.LCK})` : ''}`,
      `Crit: ${(5 + s.lck * 0.1).toFixed(1)}%`,
    ];
    this.statsDetailText.setText(lines.join('\n'));
  }

  private toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.expandedPanel.setVisible(this.expanded);
  }

  destroy(): void { this.container.destroy(); }
}
