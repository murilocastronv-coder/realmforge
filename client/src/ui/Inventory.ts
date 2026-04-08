import Phaser from 'phaser';
import { RARITY_COLORS } from '../utils/Constants';

export interface GameItem {
  id: string;
  name: string;
  rarity: number;       // 0-5
  slot?: string;         // helmet, armor, legs, boots, weapon, shield, ring, amulet, cape
  stackable: boolean;
  quantity: number;
  stats?: Record<string, number>;
  level?: number;
  description?: string;
  icon?: string;
}

const SLOT_SIZE = 40;
const COLS = 8;
const ROWS = 5;
const PADDING = 4;

/**
 * Inventory — grid-based inventory panel.
 */
export class InventoryUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private items: (GameItem | null)[];
  private slotGraphics: Phaser.GameObjects.Rectangle[] = [];
  private itemTexts: Phaser.GameObjects.Text[] = [];
  private tooltipContainer: Phaser.GameObjects.Container | null = null;
  private visible = false;
  private gold = 0;
  private goldText!: Phaser.GameObjects.Text;
  private onItemClick?: (item: GameItem, index: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.items = new Array(COLS * ROWS).fill(null);

    const totalW = COLS * (SLOT_SIZE + PADDING) + PADDING;
    const totalH = ROWS * (SLOT_SIZE + PADDING) + PADDING + 30;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(4000);
    this.container.setVisible(false);

    // Background
    const bg = scene.add.rectangle(0, 0, totalW, totalH, 0x1a1a2e, 0.95);
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, 0x444466);
    this.container.add(bg);

    // Title
    const title = scene.add.text(totalW / 2, 8, 'INVENTORY', {
      fontSize: '11px', color: '#cccccc',
    }).setOrigin(0.5, 0);
    this.container.add(title);

    // Close button
    const closeBtn = scene.add.text(totalW - 14, 4, '✕', {
      fontSize: '14px', color: '#ff4444',
    });
    // Close handled via screen-space routing
    this.container.add(closeBtn);

    // Gold display
    this.goldText = scene.add.text(PADDING, totalH - 22, '💰 0 Gold', {
      fontSize: '10px', color: '#ffcc00',
    });
    this.container.add(this.goldText);

    // Create slot grid
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const sx = PADDING + col * (SLOT_SIZE + PADDING);
        const sy = 24 + row * (SLOT_SIZE + PADDING);

        const slot = scene.add.rectangle(sx, sy, SLOT_SIZE, SLOT_SIZE, 0x2a2a4a, 0.9);
        slot.setOrigin(0, 0);
        slot.setStrokeStyle(1, 0x444466);
        // NOTE: No setInteractive() — clicks are routed via screen-space in GameScene

        const idx = row * COLS + col;

        this.container.add(slot);
        this.slotGraphics.push(slot);

        // Item text placeholder
        const txt = scene.add.text(sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2, '', {
          fontSize: '8px', color: '#ffffff',
        }).setOrigin(0.5);
        this.container.add(txt);
        this.itemTexts.push(txt);
      }
    }
  }

  setItems(items: (GameItem | null)[]): void {
    this.items = items;
    this.refreshDisplay();
  }

  setGold(amount: number): void {
    this.gold = amount;
    this.goldText.setText(`💰 ${amount.toLocaleString()} Gold`);
  }

  addItem(item: GameItem): boolean {
    // Try to stack
    if (item.stackable) {
      const existing = this.items.findIndex(i => i && i.id === item.id);
      if (existing !== -1) {
        this.items[existing]!.quantity += item.quantity;
        this.refreshDisplay();
        return true;
      }
    }
    // Find empty slot
    const empty = this.items.indexOf(null);
    if (empty === -1) return false; // inventory full
    this.items[empty] = item;
    this.refreshDisplay();
    return true;
  }

  removeItem(index: number): GameItem | null {
    const item = this.items[index];
    this.items[index] = null;
    this.refreshDisplay();
    return item;
  }

  getItem(index: number): GameItem | null {
    return this.items[index];
  }

  getAllItems(): (GameItem | null)[] {
    return [...this.items];
  }

  setOnItemClick(handler: (item: GameItem, index: number) => void): void {
    this.onItemClick = handler;
  }

  private handleSlotClick(index: number): void {
    const item = this.items[index];
    console.log(`[Inventory] slot ${index} clicked, item:`, item?.name ?? 'empty');
    if (item && this.onItemClick) {
      this.onItemClick(item, index);
    }
  }

  private showTooltip(index: number, slotX: number, slotY: number): void {
    this.hideTooltip();
    const item = this.items[index];
    if (!item) return;

    const tipW = 140;
    // If tooltip would overflow right edge, flip to the left side
    const containerX = this.container.x;
    const tooltipRight = containerX + slotX + SLOT_SIZE + 8 + tipW;
    const flipLeft = tooltipRight > 1280; // GAME_WIDTH
    const tipX = flipLeft ? slotX - tipW - 8 : slotX + SLOT_SIZE + 8;

    this.tooltipContainer = this.scene.add.container(tipX, slotY);
    this.tooltipContainer.setScrollFactor(0);
    this.tooltipContainer.setDepth(5000);

    const lines: string[] = [item.name];
    if (item.level) lines.push(`Level: ${item.level}`);
    if (item.slot) lines.push(`Slot: ${item.slot}`);
    if (item.stats) {
      for (const [k, v] of Object.entries(item.stats)) {
        lines.push(`${k}: +${v}`);
      }
    }
    if (item.description) lines.push(item.description);

    const text = lines.join('\n');
    const rarityColor = '#' + (RARITY_COLORS[item.rarity] || 0xffffff).toString(16).padStart(6, '0');

    const tipBg = this.scene.add.rectangle(0, 0, 140, lines.length * 14 + 10, 0x111122, 0.95);
    tipBg.setOrigin(0, 0);
    tipBg.setStrokeStyle(1, RARITY_COLORS[item.rarity] || 0x444444);

    const tipText = this.scene.add.text(5, 5, text, {
      fontSize: '9px', color: rarityColor, lineSpacing: 4,
    });

    this.tooltipContainer.add([tipBg, tipText]);
    this.container.add(this.tooltipContainer);
  }

  private hideTooltip(): void {
    if (this.tooltipContainer) {
      this.tooltipContainer.destroy();
      this.tooltipContainer = null;
    }
  }

  private refreshDisplay(): void {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item) {
        const rarityColor = RARITY_COLORS[item.rarity] || 0xffffff;
        this.slotGraphics[i].setStrokeStyle(1, rarityColor);
        const label = item.quantity > 1 ? `${item.name.substring(0, 5)}\nx${item.quantity}` : item.name.substring(0, 6);
        this.itemTexts[i].setText(label);
        this.itemTexts[i].setColor('#' + rarityColor.toString(16).padStart(6, '0'));
      } else {
        this.slotGraphics[i].setStrokeStyle(1, 0x444466);
        this.itemTexts[i].setText('');
      }
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.setVisible(this.visible);
  }

  isVisible(): boolean { return this.visible; }
  destroy(): void { this.container.destroy(); }

  /** Handle a screen-space click routed from GameScene (bypasses broken Container hit testing). */
  handleScreenClick(relX: number, relY: number): boolean {
    // Close button: top-right area
    const totalW = COLS * (SLOT_SIZE + PADDING) + PADDING;
    if (relX >= totalW - 20 && relY <= 20) {
      this.toggle();
      return true;
    }
    // Slot grid
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const sx = PADDING + col * (SLOT_SIZE + PADDING);
        const sy = 24 + row * (SLOT_SIZE + PADDING);
        if (relX >= sx && relX <= sx + SLOT_SIZE && relY >= sy && relY <= sy + SLOT_SIZE) {
          this.handleSlotClick(row * COLS + col);
          return true;
        }
      }
    }
    return true; // consumed click even if no slot hit
  }
}
