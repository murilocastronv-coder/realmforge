import Phaser from 'phaser';
import { GameItem } from './Inventory';
import { RARITY_COLORS } from '../utils/Constants';

const BANK_COLS = 10;
const BANK_ROWS = 8;
const SLOT_SIZE = 36;
const PADDING = 3;

/**
 * BankUI — safe storage panel (items here are never dropped on death).
 */
export class BankUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private items: (GameItem | null)[];
  private slotRects: Phaser.GameObjects.Rectangle[] = [];
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private visible = false;
  private onDeposit?: (item: GameItem, bankIndex: number) => void;
  private onWithdraw?: (item: GameItem, bankIndex: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.items = new Array(BANK_COLS * BANK_ROWS).fill(null);

    const totalW = BANK_COLS * (SLOT_SIZE + PADDING) + PADDING;
    const totalH = BANK_ROWS * (SLOT_SIZE + PADDING) + PADDING + 30;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(4500);
    this.container.setVisible(false);

    const bg = scene.add.rectangle(0, 0, totalW, totalH, 0x1e1e30, 0.95);
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, 0x666688);
    this.container.add(bg);

    const title = scene.add.text(totalW / 2, 6, '🏦 BANK (Safe Storage)', {
      fontSize: '11px', color: '#ffcc44',
    }).setOrigin(0.5, 0);
    this.container.add(title);

    const closeBtn = scene.add.text(totalW - 14, 3, '✕', {
      fontSize: '14px', color: '#ff4444',
    }).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggle());
    this.container.add(closeBtn);

    for (let row = 0; row < BANK_ROWS; row++) {
      for (let col = 0; col < BANK_COLS; col++) {
        const sx = PADDING + col * (SLOT_SIZE + PADDING);
        const sy = 26 + row * (SLOT_SIZE + PADDING);
        const idx = row * BANK_COLS + col;

        const rect = scene.add.rectangle(sx, sy, SLOT_SIZE, SLOT_SIZE, 0x2a2a4e, 0.9);
        rect.setOrigin(0, 0);
        rect.setStrokeStyle(1, 0x444466);
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => this.handleSlotClick(idx));
        this.container.add(rect);
        this.slotRects.push(rect);

        const txt = scene.add.text(sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2, '', {
          fontSize: '7px', color: '#ffffff',
        }).setOrigin(0.5);
        this.container.add(txt);
        this.slotTexts.push(txt);
      }
    }
  }

  setItems(items: (GameItem | null)[]): void {
    this.items = new Array(BANK_COLS * BANK_ROWS).fill(null);
    for (const item of items) {
      if (item) {
        const idx = (item as any).slotIndex;
        if (typeof idx === 'number' && idx >= 0 && idx < this.items.length) {
          this.items[idx] = item;
        }
      }
    }
    this.refreshDisplay();
  }

  deposit(item: GameItem): boolean {
    if (item.stackable) {
      const existing = this.items.findIndex(i => i && i.id === item.id);
      if (existing !== -1) {
        this.items[existing]!.quantity += item.quantity;
        this.refreshDisplay();
        return true;
      }
    }
    const empty = this.items.indexOf(null);
    if (empty === -1) return false;
    this.items[empty] = { ...item };
    this.refreshDisplay();
    return true;
  }

  withdraw(index: number): GameItem | null {
    const item = this.items[index];
    this.items[index] = null;
    this.refreshDisplay();
    return item;
  }

  setOnWithdraw(handler: (item: GameItem, index: number) => void): void {
    this.onWithdraw = handler;
  }

  private handleSlotClick(index: number): void {
    const item = this.items[index];
    if (item && this.onWithdraw) {
      this.onWithdraw(item, index);
    }
  }

  private refreshDisplay(): void {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item) {
        const rc = RARITY_COLORS[item.rarity] || 0xffffff;
        this.slotRects[i].setStrokeStyle(1, rc);
        this.slotTexts[i].setText(item.name.substring(0, 5));
        this.slotTexts[i].setColor('#' + rc.toString(16).padStart(6, '0'));
      } else {
        this.slotRects[i].setStrokeStyle(1, 0x444466);
        this.slotTexts[i].setText('');
      }
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.setVisible(this.visible);
  }

  isVisible(): boolean { return this.visible; }
  destroy(): void { this.container.destroy(); }
}
