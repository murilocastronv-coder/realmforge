import Phaser from 'phaser';
import { GameItem } from './Inventory';
import { RARITY_COLORS } from '../utils/Constants';

export interface MarketListing {
  id: string;
  item: GameItem;
  price: number;
  seller: string;
  listedAt: number;
}

/**
 * MarketplaceUI — auction house / marketplace for buying and selling items.
 */
export class MarketplaceUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private listings: MarketListing[] = [];
  private listingTexts: Phaser.GameObjects.Text[] = [];
  private visible = false;
  private mode: 'buy' | 'sell' = 'buy';
  private modeText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private selectedListing = -1;
  private actionBtn!: Phaser.GameObjects.Text;
  private onBuy?: (listing: MarketListing) => void;
  private onSell?: (item: GameItem, price: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    const panelW = 400;
    const panelH = 300;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(4600);
    this.container.setVisible(false);

    const bg = scene.add.rectangle(0, 0, panelW, panelH, 0x1e1e30, 0.95);
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, 0x888888);
    this.container.add(bg);

    this.container.add(scene.add.text(panelW / 2, 6, '🏪 MARKETPLACE', {
      fontSize: '12px', color: '#ffcc44',
    }).setOrigin(0.5, 0));

    const closeBtn = scene.add.text(panelW - 14, 3, '✕', {
      fontSize: '14px', color: '#ff4444',
    });
    this.container.add(closeBtn);

    // Buy/Sell tabs
    const buyTab = scene.add.text(10, 24, '[ BUY ]', {
      fontSize: '10px', color: '#44ff44',
    });
    this.container.add(buyTab);

    const sellTab = scene.add.text(70, 24, '[ SELL ]', {
      fontSize: '10px', color: '#ff8844',
    });
    this.container.add(sellTab);

    this.modeText = scene.add.text(panelW - 60, 24, 'BUY MODE', {
      fontSize: '8px', color: '#666666',
    });
    this.container.add(this.modeText);

    // Headers
    this.container.add(scene.add.text(10, 42, 'Item', { fontSize: '9px', color: '#888' }));
    this.container.add(scene.add.text(150, 42, 'Price', { fontSize: '9px', color: '#888' }));
    this.container.add(scene.add.text(210, 42, 'Seller', { fontSize: '9px', color: '#888' }));

    // Separator
    const sep = scene.add.rectangle(10, 53, panelW - 20, 1, 0x444444);
    sep.setOrigin(0, 0);
    this.container.add(sep);

    // Detail text
    this.detailText = scene.add.text(10, panelH - 60, '', {
      fontSize: '9px', color: '#aaaacc', lineSpacing: 2,
    });
    this.container.add(this.detailText);

    // Action button
    this.actionBtn = scene.add.text(panelW - 80, panelH - 30, '[ BUY ]', {
      fontSize: '12px', color: '#44ff44',
    });
    this.actionBtn.setVisible(false);
    this.container.add(this.actionBtn);

    // Load sample listings
    this.loadSampleListings();
  }

  setOnBuy(handler: (listing: MarketListing) => void): void { this.onBuy = handler; }
  setOnSell(handler: (item: GameItem, price: number) => void): void { this.onSell = handler; }

  addListing(listing: MarketListing): void {
    this.listings.push(listing);
    this.refreshDisplay();
  }

  private setMode(mode: 'buy' | 'sell'): void {
    this.mode = mode;
    this.modeText.setText(`${mode.toUpperCase()} MODE`);
    this.actionBtn.setText(mode === 'buy' ? '[ BUY ]' : '[ LIST ]');
    this.actionBtn.setColor(mode === 'buy' ? '#44ff44' : '#ff8844');
    this.refreshDisplay();
  }

  private loadSampleListings(): void {
    this.listings = [
      {
        id: 'ml1', seller: 'NPC_Shop',
        item: { id: 'wooden_sword', name: 'Wooden Sword', rarity: 0, slot: 'weapon', stackable: false, quantity: 1, stats: { ATK: 3 } },
        price: 50, listedAt: Date.now(),
      },
      {
        id: 'ml2', seller: 'NPC_Shop',
        item: { id: 'leather_armor', name: 'Leather Armor', rarity: 0, slot: 'armor', stackable: false, quantity: 1, stats: { DEF: 3 } },
        price: 75, listedAt: Date.now(),
      },
      {
        id: 'ml3', seller: 'NPC_Shop',
        item: { id: 'health_potion', name: 'Health Potion', rarity: 0, stackable: true, quantity: 5, description: 'Restores 50 HP' },
        price: 25, listedAt: Date.now(),
      },
      {
        id: 'ml4', seller: 'NPC_Shop',
        item: { id: 'wooden_shield', name: 'Wooden Shield', rarity: 0, slot: 'shield', stackable: false, quantity: 1, stats: { DEF: 2 } },
        price: 40, listedAt: Date.now(),
      },
    ];
    this.refreshDisplay();
  }

  private refreshDisplay(): void {
    this.listingTexts.forEach(t => t.destroy());
    this.listingTexts = [];

    this.listings.forEach((listing, i) => {
      const y = 56 + i * 16;
      const rc = RARITY_COLORS[listing.item.rarity] || 0xffffff;
      const hexColor = '#' + rc.toString(16).padStart(6, '0');

      const nameText = this.scene.add.text(10, y, listing.item.name, {
        fontSize: '9px', color: hexColor,
      });
      // Interactions handled via screen-space routing

      const priceText = this.scene.add.text(150, y, `${listing.price}g`, {
        fontSize: '9px', color: '#ffcc00',
      });

      const sellerText = this.scene.add.text(210, y, listing.seller, {
        fontSize: '9px', color: '#888888',
      });

      this.container.add([nameText, priceText, sellerText]);
      this.listingTexts.push(nameText, priceText, sellerText);
    });
  }

  private selectListing(index: number): void {
    this.selectedListing = index;
    const listing = this.listings[index];

    const lines = [`${listing.item.name} - ${listing.price}g`];
    if (listing.item.stats) {
      for (const [k, v] of Object.entries(listing.item.stats)) {
        lines.push(`  ${k}: +${v}`);
      }
    }
    if (listing.item.description) lines.push(listing.item.description);

    this.detailText.setText(lines.join('\n'));
    this.actionBtn.setVisible(true);
  }

  private doAction(): void {
    if (this.mode === 'buy' && this.selectedListing >= 0 && this.onBuy) {
      this.onBuy(this.listings[this.selectedListing]);
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.setVisible(this.visible);
  }

  isVisible(): boolean { return this.visible; }
  destroy(): void { this.container.destroy(); }

  /** Handle a screen-space click routed from GameScene. */
  handleScreenClick(relX: number, relY: number): boolean {
    const panelW = 400;
    const panelH = 300;
    // Close button
    if (relX >= panelW - 20 && relY <= 20) {
      this.toggle();
      return true;
    }
    // Buy/Sell tabs
    if (relY >= 20 && relY <= 38) {
      if (relX >= 10 && relX <= 60) { this.setMode('buy'); return true; }
      if (relX >= 70 && relX <= 130) { this.setMode('sell'); return true; }
    }
    // Listing rows (y starts at 56, each 16px tall)
    if (relY >= 56 && relY < panelH - 65) {
      const idx = Math.floor((relY - 56) / 16);
      if (idx >= 0 && idx < this.listings.length) {
        this.selectListing(idx);
        return true;
      }
    }
    // Action button (bottom-right)
    if (relX >= panelW - 100 && relY >= panelH - 40) {
      this.doAction();
      return true;
    }
    return true;
  }
}
