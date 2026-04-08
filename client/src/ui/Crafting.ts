import Phaser from 'phaser';
import { GameItem } from './Inventory';
import { RARITY_COLORS } from '../utils/Constants';

export interface CraftingRecipe {
  id: string;
  name: string;
  materials: { itemId: string; quantity: number }[];
  result: GameItem;
  levelRequired: number;
}

/**
 * CraftingUI — crafting panel with recipe list and material requirements.
 */
export class CraftingUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private recipes: CraftingRecipe[] = [];
  private selectedRecipe: number = -1;
  private recipeTexts: Phaser.GameObjects.Text[] = [];
  private detailText!: Phaser.GameObjects.Text;
  private craftBtn!: Phaser.GameObjects.Text;
  private visible = false;
  private onCraft?: (recipe: CraftingRecipe) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    const panelW = 300;
    const panelH = 260;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(4500);
    this.container.setVisible(false);

    const bg = scene.add.rectangle(0, 0, panelW, panelH, 0x1e1e30, 0.95);
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, 0x666688);
    this.container.add(bg);

    this.container.add(scene.add.text(panelW / 2, 6, '⚒ CRAFTING', {
      fontSize: '11px', color: '#ffcc44',
    }).setOrigin(0.5, 0));

    const closeBtn = scene.add.text(panelW - 14, 3, '✕', {
      fontSize: '14px', color: '#ff4444',
    }).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggle());
    this.container.add(closeBtn);

    // Recipe list area (left)
    this.container.add(scene.add.text(8, 24, 'Recipes:', {
      fontSize: '9px', color: '#888888',
    }));

    // Detail area (right)
    this.detailText = scene.add.text(150, 24, 'Select a recipe...', {
      fontSize: '9px', color: '#aaaacc', lineSpacing: 3,
      wordWrap: { width: 140 },
    });
    this.container.add(this.detailText);

    // Craft button
    this.craftBtn = scene.add.text(150, panelH - 30, '[ CRAFT ]', {
      fontSize: '12px', color: '#44ff44',
    }).setInteractive({ useHandCursor: true });
    this.craftBtn.on('pointerdown', () => this.doCraft());
    this.craftBtn.setVisible(false);
    this.container.add(this.craftBtn);

    // Load default recipes
    this.loadDefaultRecipes();
  }

  setOnCraft(handler: (recipe: CraftingRecipe) => void): void {
    this.onCraft = handler;
  }

  private loadDefaultRecipes(): void {
    this.recipes = [
      {
        id: 'wooden_sword',
        name: 'Wooden Sword',
        materials: [{ itemId: 'wood', quantity: 5 }],
        result: {
          id: 'wooden_sword', name: 'Wooden Sword', rarity: 0, slot: 'weapon',
          stackable: false, quantity: 1, stats: { ATK: 3 }, level: 1,
        },
        levelRequired: 1,
      },
      {
        id: 'leather_armor',
        name: 'Leather Armor',
        materials: [{ itemId: 'leather', quantity: 3 }, { itemId: 'thread', quantity: 2 }],
        result: {
          id: 'leather_armor', name: 'Leather Armor', rarity: 0, slot: 'armor',
          stackable: false, quantity: 1, stats: { DEF: 3 }, level: 1,
        },
        levelRequired: 1,
      },
      {
        id: 'iron_sword',
        name: 'Iron Sword',
        materials: [{ itemId: 'iron_ore', quantity: 5 }, { itemId: 'wood', quantity: 2 }],
        result: {
          id: 'iron_sword', name: 'Iron Sword', rarity: 1, slot: 'weapon',
          stackable: false, quantity: 1, stats: { ATK: 8 }, level: 5,
        },
        levelRequired: 5,
      },
      {
        id: 'iron_armor',
        name: 'Iron Armor',
        materials: [{ itemId: 'iron_ore', quantity: 8 }, { itemId: 'leather', quantity: 2 }],
        result: {
          id: 'iron_armor', name: 'Iron Armor', rarity: 1, slot: 'armor',
          stackable: false, quantity: 1, stats: { DEF: 8, HP: 10 }, level: 5,
        },
        levelRequired: 5,
      },
      {
        id: 'health_potion',
        name: 'Health Potion',
        materials: [{ itemId: 'herb', quantity: 3 }],
        result: {
          id: 'health_potion', name: 'Health Potion', rarity: 0,
          stackable: true, quantity: 1, description: 'Restores 50 HP',
        },
        levelRequired: 1,
      },
      {
        id: 'steel_sword',
        name: 'Steel Sword',
        materials: [{ itemId: 'steel_ingot', quantity: 5 }, { itemId: 'wood', quantity: 3 }],
        result: {
          id: 'steel_sword', name: 'Steel Sword', rarity: 2, slot: 'weapon',
          stackable: false, quantity: 1, stats: { ATK: 15, SPD: 2 }, level: 15,
        },
        levelRequired: 15,
      },
    ];
    this.refreshRecipeList();
  }

  private refreshRecipeList(): void {
    this.recipeTexts.forEach(t => t.destroy());
    this.recipeTexts = [];

    this.recipes.forEach((recipe, i) => {
      const color = RARITY_COLORS[recipe.result.rarity] || 0xffffff;
      const hexColor = '#' + color.toString(16).padStart(6, '0');
      const txt = this.scene.add.text(8, 36 + i * 16, recipe.name, {
        fontSize: '9px', color: hexColor,
      }).setInteractive({ useHandCursor: true });

      txt.on('pointerdown', () => this.selectRecipe(i));
      txt.on('pointerover', () => txt.setColor('#ffffff'));
      txt.on('pointerout', () => txt.setColor(hexColor));

      this.container.add(txt);
      this.recipeTexts.push(txt);
    });
  }

  private selectRecipe(index: number): void {
    this.selectedRecipe = index;
    const recipe = this.recipes[index];

    const lines: string[] = [
      recipe.result.name,
      `Rarity: ${['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'][recipe.result.rarity]}`,
      `Req Level: ${recipe.levelRequired}`,
      '',
      'Materials:',
      ...recipe.materials.map(m => `  ${m.itemId} x${m.quantity}`),
    ];

    if (recipe.result.stats) {
      lines.push('', 'Stats:');
      for (const [k, v] of Object.entries(recipe.result.stats)) {
        lines.push(`  ${k}: +${v}`);
      }
    }

    this.detailText.setText(lines.join('\n'));
    this.craftBtn.setVisible(true);
  }

  private doCraft(): void {
    if (this.selectedRecipe >= 0 && this.onCraft) {
      this.onCraft(this.recipes[this.selectedRecipe]);
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.setVisible(this.visible);
  }

  isVisible(): boolean { return this.visible; }
  destroy(): void { this.container.destroy(); }
}
