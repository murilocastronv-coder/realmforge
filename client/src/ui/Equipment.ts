import Phaser from 'phaser';
import { GameItem } from './Inventory';
import { RARITY_COLORS } from '../utils/Constants';

const EQUIP_SLOTS = [
  { id: 'helmet', label: 'Head', x: 70, y: 10 },
  { id: 'amulet', label: 'Amul', x: 120, y: 10 },
  { id: 'cape', label: 'Cape', x: 20, y: 50 },
  { id: 'armor', label: 'Chest', x: 70, y: 50 },
  { id: 'shield', label: 'Off', x: 120, y: 50 },
  { id: 'weapon', label: 'Wpn', x: 20, y: 90 },
  { id: 'legs', label: 'Legs', x: 70, y: 90 },
  { id: 'ring1', label: 'Ring', x: 120, y: 90 },
  { id: 'boots', label: 'Boots', x: 70, y: 130 },
  { id: 'ring2', label: 'Ring', x: 120, y: 130 },
];

const SLOT_SIZE = 38;

/**
 * EquipmentUI — character equipment panel with slots.
 */
export class EquipmentUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private equipped: Map<string, GameItem> = new Map();
  private slotRects: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private slotTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private visible = false;
  private statsText!: Phaser.GameObjects.Text;
  private onUnequip?: (slotId: string, item: GameItem) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(4000);
    this.container.setVisible(false);

    const panelW = 165;
    const panelH = 280;

    // Background
    const bg = scene.add.rectangle(0, 0, panelW, panelH, 0x1a1a2e, 0.95);
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, 0x444466);
    this.container.add(bg);

    // Title
    this.container.add(scene.add.text(panelW / 2, 4, 'EQUIPMENT', {
      fontSize: '10px', color: '#cccccc',
    }).setOrigin(0.5, 0));

    // Close
    const closeBtn = scene.add.text(panelW - 14, 2, '✕', {
      fontSize: '14px', color: '#ff4444',
    });
    // Close handled via screen-space routing
    this.container.add(closeBtn);

    // Create equipment slots
    for (const slot of EQUIP_SLOTS) {
      const rect = scene.add.rectangle(slot.x, slot.y + 20, SLOT_SIZE, SLOT_SIZE, 0x2a2a4a, 0.9);
      rect.setOrigin(0, 0);
      rect.setStrokeStyle(1, 0x555577);
      // NOTE: No setInteractive() here — clicks are routed via screen-space in GameScene.handleScreenClick
      this.container.add(rect);
      this.slotRects.set(slot.id, rect);

      const label = scene.add.text(slot.x + SLOT_SIZE / 2, slot.y + 18, slot.label, {
        fontSize: '7px', color: '#666688',
      }).setOrigin(0.5, 1);
      this.container.add(label);

      const itemText = scene.add.text(slot.x + SLOT_SIZE / 2, slot.y + 20 + SLOT_SIZE / 2, '', {
        fontSize: '8px', color: '#ffffff',
      }).setOrigin(0.5);
      this.container.add(itemText);
      this.slotTexts.set(slot.id, itemText);
    }

    // Stats summary
    this.statsText = scene.add.text(8, 180, '', {
      fontSize: '9px', color: '#aaaacc', lineSpacing: 3,
    });
    this.container.add(this.statsText);
  }

  setAllEquipment(slots: Array<{ slot: string; item: GameItem }>): void {
    this.equipped.clear();
    for (const { slot, item } of slots) {
      this.equipped.set(slot, item);
      this.refreshSlot(slot);
    }
    this.updateStats();
  }

  equip(slotId: string, item: GameItem): GameItem | null {
    const old = this.equipped.get(slotId) || null;
    this.equipped.set(slotId, item);
    this.refreshSlot(slotId);
    this.updateStats();
    return old;
  }

  unequip(slotId: string): GameItem | null {
    const item = this.equipped.get(slotId) || null;
    this.equipped.delete(slotId);
    this.refreshSlot(slotId);
    this.updateStats();
    return item;
  }

  getEquipped(slotId: string): GameItem | null {
    return this.equipped.get(slotId) || null;
  }

  getTotalStats(): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const item of this.equipped.values()) {
      if (item.stats) {
        for (const [k, v] of Object.entries(item.stats)) {
          totals[k] = (totals[k] || 0) + v;
        }
      }
    }
    return totals;
  }

  setOnUnequip(handler: (slotId: string, item: GameItem) => void): void {
    this.onUnequip = handler;
  }

  private handleSlotClick(slotId: string): void {
    const item = this.equipped.get(slotId);
    if (item && this.onUnequip) {
      this.onUnequip(slotId, item);
    }
  }

  private refreshSlot(slotId: string): void {
    const item = this.equipped.get(slotId);
    const rect = this.slotRects.get(slotId);
    const text = this.slotTexts.get(slotId);
    if (!rect || !text) return;

    if (item) {
      const rarityColor = RARITY_COLORS[item.rarity] || 0xffffff;
      rect.setStrokeStyle(2, rarityColor);
      text.setText(item.name.substring(0, 5));
      text.setColor('#' + rarityColor.toString(16).padStart(6, '0'));
    } else {
      rect.setStrokeStyle(1, 0x555577);
      text.setText('');
    }
  }

  private updateStats(): void {
    const totals = this.getTotalStats();
    const lines: string[] = ['── Equip Bonus ──'];
    for (const [k, v] of Object.entries(totals)) {
      lines.push(`  ${k}: +${v}`);
    }
    if (Object.keys(totals).length === 0) {
      lines.push('  (none)');
    }
    this.statsText.setText(lines.join('\n'));
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.setVisible(this.visible);
  }

  isVisible(): boolean { return this.visible; }
  destroy(): void { this.container.destroy(); }

  /** Handle a screen-space click routed from GameScene (bypasses broken Container hit testing). */
  handleScreenClick(relX: number, relY: number): boolean {
    const panelW = 165;
    // Close button: top-right
    if (relX >= panelW - 20 && relY <= 18) {
      this.toggle();
      return true;
    }
    // Equipment slots
    for (const slot of EQUIP_SLOTS) {
      const sx = slot.x;
      const sy = slot.y + 20;
      if (relX >= sx && relX <= sx + SLOT_SIZE && relY >= sy && relY <= sy + SLOT_SIZE) {
        this.handleSlotClick(slot.id);
        return true;
      }
    }
    return true; // consumed
  }
}
