import type { CraftingRecipe, EquipmentSlotId, GameItem, ItemType } from '../types/gameData';

function createRecipeResult(
  templateId: string,
  name: string,
  itemType: ItemType,
  slot: EquipmentSlotId | null,
  rarity: number,
  level: number,
  stats: Record<string, number>,
): GameItem {
  return {
    id: templateId,
    templateId,
    name,
    rarity,
    itemType,
    slot,
    stackable: itemType === 'Consumable' || itemType === 'Material',
    quantity: 1,
    level,
    stats,
    description: `Crafted ${name}`,
    affixes: [],
  };
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // --- Tier 1: Starter (Level 1) ---
  {
    id: 'iron_sword',
    name: 'Iron Sword',
    materials: [
      { templateId: 'iron_ore', quantity: 3 },
      { templateId: 'wood', quantity: 1 },
    ],
    result: createRecipeResult('iron_sword', 'Iron Sword', 'Weapon', 'weapon', 0, 1, { ATK: 8 }),
    levelRequired: 1,
  },
  {
    id: 'iron_shield',
    name: 'Iron Shield',
    materials: [{ templateId: 'iron_ore', quantity: 4 }],
    result: createRecipeResult('iron_shield', 'Iron Shield', 'Armor', 'shield', 0, 1, { DEF: 6 }),
    levelRequired: 1,
  },
  {
    id: 'health_potion',
    name: 'Health Potion',
    materials: [{ templateId: 'herb', quantity: 2 }],
    result: createRecipeResult('health_potion', 'Health Potion', 'Consumable', null, 0, 1, { HP: 50 }),
    levelRequired: 1,
  },
  {
    id: 'leather_armor',
    name: 'Leather Armor',
    materials: [
      { templateId: 'leather', quantity: 3 },
      { templateId: 'iron_ore', quantity: 1 },
    ],
    result: createRecipeResult('leather_armor', 'Leather Armor', 'Armor', 'armor', 0, 3, { DEF: 10 }),
    levelRequired: 3,
  },
  {
    id: 'wooden_bow',
    name: 'Wooden Bow',
    materials: [
      { templateId: 'wood', quantity: 4 },
      { templateId: 'leather', quantity: 1 },
    ],
    result: createRecipeResult('wooden_bow', 'Wooden Bow', 'Weapon', 'weapon', 0, 1, { ATK: 6, SPD: 2 }),
    levelRequired: 1,
  },
  {
    id: 'leather_boots',
    name: 'Leather Boots',
    materials: [{ templateId: 'leather', quantity: 2 }],
    result: createRecipeResult('leather_boots', 'Leather Boots', 'Armor', 'boots', 0, 1, { DEF: 3, SPD: 1 }),
    levelRequired: 1,
  },
  {
    id: 'leather_cap',
    name: 'Leather Cap',
    materials: [{ templateId: 'leather', quantity: 2 }],
    result: createRecipeResult('leather_cap', 'Leather Cap', 'Armor', 'helmet', 0, 1, { DEF: 4 }),
    levelRequired: 1,
  },
  {
    id: 'herb_salve',
    name: 'Herb Salve',
    materials: [
      { templateId: 'herb', quantity: 3 },
      { templateId: 'leather', quantity: 1 },
    ],
    result: createRecipeResult('herb_salve', 'Herb Salve', 'Consumable', null, 0, 2, { HP: 80 }),
    levelRequired: 2,
  },

  // --- Tier 2: Intermediate (Level 5) ---
  {
    id: 'steel_sword',
    name: 'Steel Sword',
    materials: [
      { templateId: 'iron_ore', quantity: 5 },
      { templateId: 'coal', quantity: 2 },
    ],
    result: createRecipeResult('steel_sword', 'Steel Sword', 'Weapon', 'weapon', 1, 5, { ATK: 18 }),
    levelRequired: 5,
  },
  {
    id: 'gold_ring',
    name: 'Gold Ring',
    materials: [{ templateId: 'gold_ore', quantity: 2 }],
    result: createRecipeResult('gold_ring', 'Gold Ring', 'Armor', 'ring1', 1, 5, { LCK: 5 }),
    levelRequired: 5,
  },
  {
    id: 'steel_armor',
    name: 'Steel Armor',
    materials: [
      { templateId: 'iron_ore', quantity: 6 },
      { templateId: 'coal', quantity: 3 },
      { templateId: 'leather', quantity: 2 },
    ],
    result: createRecipeResult('steel_armor', 'Steel Armor', 'Armor', 'armor', 1, 5, { DEF: 22 }),
    levelRequired: 5,
  },
  {
    id: 'steel_shield',
    name: 'Steel Shield',
    materials: [
      { templateId: 'iron_ore', quantity: 5 },
      { templateId: 'coal', quantity: 2 },
    ],
    result: createRecipeResult('steel_shield', 'Steel Shield', 'Armor', 'shield', 1, 5, { DEF: 14 }),
    levelRequired: 5,
  },
  {
    id: 'hunter_legs',
    name: 'Hunter Leggings',
    materials: [
      { templateId: 'leather', quantity: 4 },
      { templateId: 'iron_ore', quantity: 2 },
    ],
    result: createRecipeResult('hunter_legs', 'Hunter Leggings', 'Armor', 'legs', 1, 5, { DEF: 10, SPD: 3 }),
    levelRequired: 5,
  },
  {
    id: 'silver_amulet',
    name: 'Silver Amulet',
    materials: [
      { templateId: 'gold_ore', quantity: 1 },
      { templateId: 'iron_ore', quantity: 2 },
      { templateId: 'gem_shard', quantity: 1 },
    ],
    result: createRecipeResult('silver_amulet', 'Silver Amulet', 'Armor', 'amulet', 1, 5, { LCK: 3, DEF: 4 }),
    levelRequired: 5,
  },
  {
    id: 'greater_health_potion',
    name: 'Greater Health Potion',
    materials: [
      { templateId: 'herb', quantity: 4 },
      { templateId: 'gem_shard', quantity: 1 },
    ],
    result: createRecipeResult('greater_health_potion', 'Greater Health Potion', 'Consumable', null, 1, 5, { HP: 150 }),
    levelRequired: 5,
  },
  {
    id: 'iron_helm',
    name: 'Iron Helm',
    materials: [
      { templateId: 'iron_ore', quantity: 4 },
      { templateId: 'coal', quantity: 1 },
    ],
    result: createRecipeResult('iron_helm', 'Iron Helm', 'Armor', 'helmet', 1, 5, { DEF: 9 }),
    levelRequired: 5,
  },

  // --- Tier 3: Advanced (Level 10) ---
  {
    id: 'mithril_blade',
    name: 'Mithril Blade',
    materials: [
      { templateId: 'mithril_ore', quantity: 4 },
      { templateId: 'coal', quantity: 3 },
      { templateId: 'gold_ore', quantity: 1 },
    ],
    result: createRecipeResult('mithril_blade', 'Mithril Blade', 'Weapon', 'weapon', 2, 10, { ATK: 32, SPD: 4 }),
    levelRequired: 10,
  },
  {
    id: 'mithril_armor',
    name: 'Mithril Armor',
    materials: [
      { templateId: 'mithril_ore', quantity: 6 },
      { templateId: 'leather', quantity: 3 },
      { templateId: 'coal', quantity: 4 },
    ],
    result: createRecipeResult('mithril_armor', 'Mithril Armor', 'Armor', 'armor', 2, 10, { DEF: 38 }),
    levelRequired: 10,
  },
  {
    id: 'enchanted_cape',
    name: 'Enchanted Cape',
    materials: [
      { templateId: 'silk', quantity: 3 },
      { templateId: 'gem_shard', quantity: 2 },
      { templateId: 'gold_ore', quantity: 1 },
    ],
    result: createRecipeResult('enchanted_cape', 'Enchanted Cape', 'Armor', 'cape', 2, 10, { DEF: 8, LCK: 6, SPD: 5 }),
    levelRequired: 10,
  },
  {
    id: 'gold_amulet',
    name: 'Gold Amulet',
    materials: [
      { templateId: 'gold_ore', quantity: 4 },
      { templateId: 'gem_shard', quantity: 2 },
    ],
    result: createRecipeResult('gold_amulet', 'Gold Amulet', 'Armor', 'amulet', 2, 10, { LCK: 8, ATK: 5 }),
    levelRequired: 10,
  },
  {
    id: 'elixir_of_vitality',
    name: 'Elixir of Vitality',
    materials: [
      { templateId: 'herb', quantity: 6 },
      { templateId: 'gem_shard', quantity: 2 },
      { templateId: 'mithril_ore', quantity: 1 },
    ],
    result: createRecipeResult('elixir_of_vitality', 'Elixir of Vitality', 'Consumable', null, 2, 10, { HP: 300 }),
    levelRequired: 10,
  },
  {
    id: 'emerald_ring',
    name: 'Emerald Ring',
    materials: [
      { templateId: 'gold_ore', quantity: 2 },
      { templateId: 'gem_shard', quantity: 3 },
    ],
    result: createRecipeResult('emerald_ring', 'Emerald Ring', 'Armor', 'ring1', 2, 10, { LCK: 10, DEF: 3 }),
    levelRequired: 10,
  },
  {
    id: 'mithril_boots',
    name: 'Mithril Boots',
    materials: [
      { templateId: 'mithril_ore', quantity: 3 },
      { templateId: 'leather', quantity: 2 },
    ],
    result: createRecipeResult('mithril_boots', 'Mithril Boots', 'Armor', 'boots', 2, 10, { DEF: 12, SPD: 6 }),
    levelRequired: 10,
  },

  // --- Tier 4: Expert (Level 15) ---
  {
    id: 'dragon_sword',
    name: 'Dragon Sword',
    materials: [
      { templateId: 'dragon_scale', quantity: 3 },
      { templateId: 'mithril_ore', quantity: 4 },
      { templateId: 'coal', quantity: 5 },
    ],
    result: createRecipeResult('dragon_sword', 'Dragon Sword', 'Weapon', 'weapon', 3, 15, { ATK: 52, SPD: 6 }),
    levelRequired: 15,
  },
  {
    id: 'dragon_armor',
    name: 'Dragon Armor',
    materials: [
      { templateId: 'dragon_scale', quantity: 5 },
      { templateId: 'mithril_ore', quantity: 3 },
      { templateId: 'silk', quantity: 2 },
    ],
    result: createRecipeResult('dragon_armor', 'Dragon Armor', 'Armor', 'armor', 3, 15, { DEF: 55, ATK: 8 }),
    levelRequired: 15,
  },
  {
    id: 'phoenix_ring',
    name: 'Phoenix Ring',
    materials: [
      { templateId: 'dragon_scale', quantity: 2 },
      { templateId: 'gem_shard', quantity: 4 },
      { templateId: 'gold_ore', quantity: 3 },
    ],
    result: createRecipeResult('phoenix_ring', 'Phoenix Ring', 'Armor', 'ring1', 3, 15, { LCK: 15, ATK: 8, HP: 50 }),
    levelRequired: 15,
  },
  {
    id: 'supreme_elixir',
    name: 'Supreme Elixir',
    materials: [
      { templateId: 'herb', quantity: 8 },
      { templateId: 'dragon_scale', quantity: 1 },
      { templateId: 'gem_shard', quantity: 3 },
    ],
    result: createRecipeResult('supreme_elixir', 'Supreme Elixir', 'Consumable', null, 3, 15, { HP: 500 }),
    levelRequired: 15,
  },

  // --- Tier 5: Adamantite (Level 20) ---
  {
    id: 'adamantite_sword',
    name: 'Adamantite Sword',
    materials: [
      { templateId: 'adamantite_ore', quantity: 5 },
      { templateId: 'coal', quantity: 4 },
    ],
    result: createRecipeResult('adamantite_sword', 'Adamantite Sword', 'Weapon', 'weapon', 2, 20, { ATK: 75 }),
    levelRequired: 20,
  },
  {
    id: 'adamantite_armor',
    name: 'Adamantite Armor',
    materials: [
      { templateId: 'adamantite_ore', quantity: 7 },
      { templateId: 'leather', quantity: 3 },
      { templateId: 'coal', quantity: 4 },
    ],
    result: createRecipeResult('adamantite_armor', 'Adamantite Armor', 'Armor', 'armor', 2, 20, { DEF: 68 }),
    levelRequired: 20,
  },
  {
    id: 'adamantite_shield',
    name: 'Adamantite Shield',
    materials: [
      { templateId: 'adamantite_ore', quantity: 5 },
      { templateId: 'iron_ore', quantity: 3 },
    ],
    result: createRecipeResult('adamantite_shield', 'Adamantite Shield', 'Armor', 'shield', 2, 20, { DEF: 42 }),
    levelRequired: 20,
  },
  {
    id: 'adamantite_helm',
    name: 'Adamantite Helm',
    materials: [
      { templateId: 'adamantite_ore', quantity: 4 },
      { templateId: 'coal', quantity: 2 },
    ],
    result: createRecipeResult('adamantite_helm', 'Adamantite Helm', 'Armor', 'helmet', 2, 20, { DEF: 30 }),
    levelRequired: 20,
  },
  {
    id: 'adamantite_greaves',
    name: 'Adamantite Greaves',
    materials: [
      { templateId: 'adamantite_ore', quantity: 4 },
      { templateId: 'leather', quantity: 3 },
    ],
    result: createRecipeResult('adamantite_greaves', 'Adamantite Greaves', 'Armor', 'legs', 2, 20, { DEF: 35, SPD: 5 }),
    levelRequired: 20,
  },
  {
    id: 'adamantite_boots',
    name: 'Adamantite Boots',
    materials: [
      { templateId: 'adamantite_ore', quantity: 3 },
      { templateId: 'leather', quantity: 2 },
    ],
    result: createRecipeResult('adamantite_boots', 'Adamantite Boots', 'Armor', 'boots', 2, 20, { DEF: 22, SPD: 8 }),
    levelRequired: 20,
  },
  {
    id: 'shadow_dagger',
    name: 'Shadow Dagger',
    materials: [
      { templateId: 'shadow_essence', quantity: 3 },
      { templateId: 'mithril_ore', quantity: 4 },
    ],
    result: createRecipeResult('shadow_dagger', 'Shadow Dagger', 'Weapon', 'weapon', 3, 20, { ATK: 65, SPD: 12 }),
    levelRequired: 20,
  },
  {
    id: 'shadow_ring',
    name: 'Shadow Ring',
    materials: [
      { templateId: 'shadow_essence', quantity: 2 },
      { templateId: 'gem_shard', quantity: 4 },
      { templateId: 'gold_ore', quantity: 2 },
    ],
    result: createRecipeResult('shadow_ring', 'Shadow Ring', 'Armor', 'ring1', 3, 20, { LCK: 18, ATK: 10 }),
    levelRequired: 20,
  },
  {
    id: 'void_amulet',
    name: 'Void Amulet',
    materials: [
      { templateId: 'void_shard', quantity: 2 },
      { templateId: 'gem_shard', quantity: 3 },
      { templateId: 'gold_ore', quantity: 2 },
    ],
    result: createRecipeResult('void_amulet', 'Void Amulet', 'Armor', 'amulet', 3, 20, { LCK: 12, DEF: 15, ATK: 8 }),
    levelRequired: 20,
  },
  {
    id: 'mega_elixir',
    name: 'Mega Elixir',
    materials: [
      { templateId: 'herb', quantity: 10 },
      { templateId: 'dragon_scale', quantity: 2 },
      { templateId: 'gem_shard', quantity: 4 },
    ],
    result: createRecipeResult('mega_elixir', 'Mega Elixir', 'Consumable', null, 2, 20, { HP: 800 }),
    levelRequired: 20,
  },
  {
    id: 'mana_potion',
    name: 'Mana Potion',
    materials: [
      { templateId: 'herb', quantity: 5 },
      { templateId: 'gem_shard', quantity: 3 },
    ],
    result: createRecipeResult('mana_potion', 'Mana Potion', 'Consumable', null, 2, 20, { MP: 100 }),
    levelRequired: 20,
  },
  {
    id: 'shadow_cape',
    name: 'Shadow Cape',
    materials: [
      { templateId: 'shadow_essence', quantity: 3 },
      { templateId: 'silk', quantity: 4 },
      { templateId: 'gem_shard', quantity: 2 },
    ],
    result: createRecipeResult('shadow_cape', 'Shadow Cape', 'Armor', 'cape', 3, 20, { DEF: 18, SPD: 10, LCK: 8 }),
    levelRequired: 20,
  },

  // --- Tier 6: Void/Shadow (Level 30) ---
  {
    id: 'void_blade',
    name: 'Void Blade',
    materials: [
      { templateId: 'void_shard', quantity: 6 },
      { templateId: 'adamantite_ore', quantity: 4 },
      { templateId: 'chaos_crystal', quantity: 2 },
    ],
    result: createRecipeResult('void_blade', 'Void Blade', 'Weapon', 'weapon', 3, 30, { ATK: 110, SPD: 8 }),
    levelRequired: 30,
  },
  {
    id: 'void_plate',
    name: 'Void Plate Armor',
    materials: [
      { templateId: 'void_shard', quantity: 8 },
      { templateId: 'adamantite_ore', quantity: 5 },
      { templateId: 'shadow_essence', quantity: 3 },
    ],
    result: createRecipeResult('void_plate', 'Void Plate Armor', 'Armor', 'armor', 3, 30, { DEF: 98 }),
    levelRequired: 30,
  },
  {
    id: 'void_helm',
    name: 'Void Helm',
    materials: [
      { templateId: 'void_shard', quantity: 4 },
      { templateId: 'adamantite_ore', quantity: 3 },
    ],
    result: createRecipeResult('void_helm', 'Void Helm', 'Armor', 'helmet', 3, 30, { DEF: 48, ATK: 10 }),
    levelRequired: 30,
  },
  {
    id: 'void_greaves',
    name: 'Void Greaves',
    materials: [
      { templateId: 'void_shard', quantity: 5 },
      { templateId: 'shadow_essence', quantity: 3 },
    ],
    result: createRecipeResult('void_greaves', 'Void Greaves', 'Armor', 'legs', 3, 30, { DEF: 55, SPD: 10 }),
    levelRequired: 30,
  },
  {
    id: 'void_boots',
    name: 'Void Boots',
    materials: [
      { templateId: 'void_shard', quantity: 3 },
      { templateId: 'shadow_essence', quantity: 2 },
      { templateId: 'leather', quantity: 3 },
    ],
    result: createRecipeResult('void_boots', 'Void Boots', 'Armor', 'boots', 3, 30, { DEF: 35, SPD: 14 }),
    levelRequired: 30,
  },
  {
    id: 'void_aegis',
    name: 'Void Aegis',
    materials: [
      { templateId: 'void_shard', quantity: 6 },
      { templateId: 'adamantite_ore', quantity: 4 },
    ],
    result: createRecipeResult('void_aegis', 'Void Aegis', 'Armor', 'shield', 3, 30, { DEF: 65 }),
    levelRequired: 30,
  },
  {
    id: 'chaos_scepter',
    name: 'Chaos Scepter',
    materials: [
      { templateId: 'chaos_crystal', quantity: 4 },
      { templateId: 'void_shard', quantity: 3 },
      { templateId: 'gem_shard', quantity: 5 },
    ],
    result: createRecipeResult('chaos_scepter', 'Chaos Scepter', 'Weapon', 'weapon', 3, 30, { ATK: 95, LCK: 15 }),
    levelRequired: 30,
  },
  {
    id: 'phoenix_ring_t6',
    name: 'Rebirth Ring',
    materials: [
      { templateId: 'phoenix_ash', quantity: 3 },
      { templateId: 'gold_ore', quantity: 5 },
      { templateId: 'gem_shard', quantity: 4 },
    ],
    result: createRecipeResult('phoenix_ring_t6', 'Rebirth Ring', 'Armor', 'ring1', 3, 30, { LCK: 25, HP: 100, ATK: 12 }),
    levelRequired: 30,
  },
  {
    id: 'primordial_amulet',
    name: 'Primordial Amulet',
    materials: [
      { templateId: 'primordial_core', quantity: 2 },
      { templateId: 'void_shard', quantity: 3 },
      { templateId: 'gold_ore', quantity: 4 },
    ],
    result: createRecipeResult('primordial_amulet', 'Primordial Amulet', 'Armor', 'amulet', 3, 30, { LCK: 20, DEF: 25, ATK: 15 }),
    levelRequired: 30,
  },
  {
    id: 'void_cape',
    name: 'Void Mantle',
    materials: [
      { templateId: 'void_shard', quantity: 4 },
      { templateId: 'shadow_essence', quantity: 4 },
      { templateId: 'silk', quantity: 3 },
    ],
    result: createRecipeResult('void_cape', 'Void Mantle', 'Armor', 'cape', 3, 30, { DEF: 30, SPD: 15, LCK: 12 }),
    levelRequired: 30,
  },
  {
    id: 'divine_elixir',
    name: 'Divine Elixir',
    materials: [
      { templateId: 'herb', quantity: 12 },
      { templateId: 'phoenix_ash', quantity: 2 },
      { templateId: 'primordial_core', quantity: 1 },
    ],
    result: createRecipeResult('divine_elixir', 'Divine Elixir', 'Consumable', null, 3, 30, { HP: 1200 }),
    levelRequired: 30,
  },
  {
    id: 'arcane_draught',
    name: 'Arcane Draught',
    materials: [
      { templateId: 'herb', quantity: 8 },
      { templateId: 'chaos_crystal', quantity: 1 },
      { templateId: 'gem_shard', quantity: 5 },
    ],
    result: createRecipeResult('arcane_draught', 'Arcane Draught', 'Consumable', null, 3, 30, { MP: 250 }),
    levelRequired: 30,
  },

  // --- Tier 7: Celestial/Ancient (Level 40) ---
  {
    id: 'celestial_blade',
    name: 'Celestial Blade',
    materials: [
      { templateId: 'celestial_dust', quantity: 6 },
      { templateId: 'star_fragment', quantity: 3 },
      { templateId: 'adamantite_ore', quantity: 5 },
    ],
    result: createRecipeResult('celestial_blade', 'Celestial Blade', 'Weapon', 'weapon', 4, 40, { ATK: 165, SPD: 12 }),
    levelRequired: 40,
  },
  {
    id: 'celestial_armor',
    name: 'Celestial Armor',
    materials: [
      { templateId: 'celestial_dust', quantity: 8 },
      { templateId: 'star_fragment', quantity: 4 },
      { templateId: 'void_shard', quantity: 4 },
    ],
    result: createRecipeResult('celestial_armor', 'Celestial Armor', 'Armor', 'armor', 4, 40, { DEF: 145 }),
    levelRequired: 40,
  },
  {
    id: 'celestial_crown',
    name: 'Celestial Crown',
    materials: [
      { templateId: 'celestial_dust', quantity: 4 },
      { templateId: 'star_fragment', quantity: 2 },
      { templateId: 'gold_ore', quantity: 4 },
    ],
    result: createRecipeResult('celestial_crown', 'Celestial Crown', 'Armor', 'helmet', 4, 40, { DEF: 72, LCK: 15 }),
    levelRequired: 40,
  },
  {
    id: 'celestial_greaves',
    name: 'Celestial Greaves',
    materials: [
      { templateId: 'celestial_dust', quantity: 5 },
      { templateId: 'star_fragment', quantity: 3 },
    ],
    result: createRecipeResult('celestial_greaves', 'Celestial Greaves', 'Armor', 'legs', 4, 40, { DEF: 85, SPD: 15 }),
    levelRequired: 40,
  },
  {
    id: 'celestial_sandals',
    name: 'Celestial Sandals',
    materials: [
      { templateId: 'celestial_dust', quantity: 3 },
      { templateId: 'star_fragment', quantity: 2 },
      { templateId: 'silk', quantity: 3 },
    ],
    result: createRecipeResult('celestial_sandals', 'Celestial Sandals', 'Armor', 'boots', 4, 40, { DEF: 50, SPD: 20 }),
    levelRequired: 40,
  },
  {
    id: 'celestial_ward',
    name: 'Celestial Ward',
    materials: [
      { templateId: 'celestial_dust', quantity: 6 },
      { templateId: 'star_fragment', quantity: 4 },
    ],
    result: createRecipeResult('celestial_ward', 'Celestial Ward', 'Armor', 'shield', 4, 40, { DEF: 95 }),
    levelRequired: 40,
  },
  {
    id: 'ancient_warhammer',
    name: 'Ancient Warhammer',
    materials: [
      { templateId: 'ancient_relic', quantity: 4 },
      { templateId: 'adamantite_ore', quantity: 6 },
      { templateId: 'primordial_core', quantity: 2 },
    ],
    result: createRecipeResult('ancient_warhammer', 'Ancient Warhammer', 'Weapon', 'weapon', 4, 40, { ATK: 185 }),
    levelRequired: 40,
  },
  {
    id: 'star_ring',
    name: 'Star Ring',
    materials: [
      { templateId: 'star_fragment', quantity: 3 },
      { templateId: 'celestial_dust', quantity: 2 },
      { templateId: 'gem_shard', quantity: 6 },
    ],
    result: createRecipeResult('star_ring', 'Star Ring', 'Armor', 'ring1', 4, 40, { LCK: 35, ATK: 20, HP: 80 }),
    levelRequired: 40,
  },
  {
    id: 'celestial_talisman',
    name: 'Celestial Talisman',
    materials: [
      { templateId: 'celestial_dust', quantity: 3 },
      { templateId: 'star_fragment', quantity: 3 },
      { templateId: 'gold_ore', quantity: 6 },
    ],
    result: createRecipeResult('celestial_talisman', 'Celestial Talisman', 'Armor', 'amulet', 4, 40, { LCK: 30, DEF: 35, ATK: 20 }),
    levelRequired: 40,
  },
  {
    id: 'celestial_wings',
    name: 'Celestial Wings',
    materials: [
      { templateId: 'celestial_dust', quantity: 5 },
      { templateId: 'star_fragment', quantity: 3 },
      { templateId: 'silk', quantity: 4 },
    ],
    result: createRecipeResult('celestial_wings', 'Celestial Wings', 'Armor', 'cape', 4, 40, { DEF: 40, SPD: 22, LCK: 18 }),
    levelRequired: 40,
  },
  {
    id: 'nectar_of_gods',
    name: 'Nectar of the Gods',
    materials: [
      { templateId: 'herb', quantity: 15 },
      { templateId: 'celestial_dust', quantity: 2 },
      { templateId: 'star_fragment', quantity: 1 },
      { templateId: 'phoenix_ash', quantity: 2 },
    ],
    result: createRecipeResult('nectar_of_gods', 'Nectar of the Gods', 'Consumable', null, 4, 40, { HP: 2000 }),
    levelRequired: 40,
  },
  {
    id: 'astral_essence',
    name: 'Astral Essence',
    materials: [
      { templateId: 'celestial_dust', quantity: 2 },
      { templateId: 'gem_shard', quantity: 6 },
      { templateId: 'primordial_core', quantity: 1 },
    ],
    result: createRecipeResult('astral_essence', 'Astral Essence', 'Consumable', null, 4, 40, { MP: 500 }),
    levelRequired: 40,
  },
  {
    id: 'diamond_ring',
    name: 'Diamond Ring',
    materials: [
      { templateId: 'star_fragment', quantity: 2 },
      { templateId: 'gold_ore', quantity: 5 },
      { templateId: 'gem_shard', quantity: 8 },
    ],
    result: createRecipeResult('diamond_ring', 'Diamond Ring', 'Armor', 'ring2', 4, 40, { LCK: 28, DEF: 18 }),
    levelRequired: 40,
  },

  // --- Tier 8: Mythic/God-Tier (Level 50) ---
  {
    id: 'godslayer',
    name: 'Godslayer',
    materials: [
      { templateId: 'mythic_ingot', quantity: 8 },
      { templateId: 'soul_fragment', quantity: 4 },
      { templateId: 'star_fragment', quantity: 5 },
    ],
    result: createRecipeResult('godslayer', 'Godslayer', 'Weapon', 'weapon', 5, 50, { ATK: 250, SPD: 18, LCK: 10 }),
    levelRequired: 50,
  },
  {
    id: 'titan_armor',
    name: 'Titan Armor',
    materials: [
      { templateId: 'titan_bone', quantity: 8 },
      { templateId: 'mythic_ingot', quantity: 6 },
      { templateId: 'celestial_dust', quantity: 4 },
    ],
    result: createRecipeResult('titan_armor', 'Titan Armor', 'Armor', 'armor', 5, 50, { DEF: 220, HP: 200 }),
    levelRequired: 50,
  },
  {
    id: 'titan_helm',
    name: 'Titan Helm',
    materials: [
      { templateId: 'titan_bone', quantity: 5 },
      { templateId: 'mythic_ingot', quantity: 3 },
    ],
    result: createRecipeResult('titan_helm', 'Titan Helm', 'Armor', 'helmet', 5, 50, { DEF: 110, ATK: 20 }),
    levelRequired: 50,
  },
  {
    id: 'titan_greaves',
    name: 'Titan Greaves',
    materials: [
      { templateId: 'titan_bone', quantity: 6 },
      { templateId: 'mythic_ingot', quantity: 4 },
    ],
    result: createRecipeResult('titan_greaves', 'Titan Greaves', 'Armor', 'legs', 5, 50, { DEF: 130, SPD: 20 }),
    levelRequired: 50,
  },
  {
    id: 'titan_boots',
    name: 'Titan Boots',
    materials: [
      { templateId: 'titan_bone', quantity: 4 },
      { templateId: 'mythic_ingot', quantity: 3 },
      { templateId: 'celestial_dust', quantity: 2 },
    ],
    result: createRecipeResult('titan_boots', 'Titan Boots', 'Armor', 'boots', 5, 50, { DEF: 75, SPD: 28 }),
    levelRequired: 50,
  },
  {
    id: 'titan_bulwark',
    name: 'Titan Bulwark',
    materials: [
      { templateId: 'titan_bone', quantity: 7 },
      { templateId: 'mythic_ingot', quantity: 5 },
    ],
    result: createRecipeResult('titan_bulwark', 'Titan Bulwark', 'Armor', 'shield', 5, 50, { DEF: 150 }),
    levelRequired: 50,
  },
  {
    id: 'soul_reaper',
    name: 'Soul Reaper',
    materials: [
      { templateId: 'soul_fragment', quantity: 6 },
      { templateId: 'mythic_ingot', quantity: 4 },
      { templateId: 'void_shard', quantity: 5 },
    ],
    result: createRecipeResult('soul_reaper', 'Soul Reaper', 'Weapon', 'weapon', 5, 50, { ATK: 230, LCK: 25 }),
    levelRequired: 50,
  },
  {
    id: 'eternity_ring',
    name: 'Ring of Eternity',
    materials: [
      { templateId: 'soul_fragment', quantity: 3 },
      { templateId: 'star_fragment', quantity: 4 },
      { templateId: 'mythic_ingot', quantity: 2 },
    ],
    result: createRecipeResult('eternity_ring', 'Ring of Eternity', 'Armor', 'ring1', 5, 50, { LCK: 50, ATK: 30, HP: 150 }),
    levelRequired: 50,
  },
  {
    id: 'worlds_heart',
    name: 'Heart of the World',
    materials: [
      { templateId: 'soul_fragment', quantity: 4 },
      { templateId: 'titan_bone', quantity: 3 },
      { templateId: 'celestial_dust', quantity: 4 },
    ],
    result: createRecipeResult('worlds_heart', 'Heart of the World', 'Armor', 'amulet', 5, 50, { LCK: 40, DEF: 50, ATK: 35 }),
    levelRequired: 50,
  },
  {
    id: 'dragon_god_cape',
    name: 'Dragon God Cape',
    materials: [
      { templateId: 'dragon_scale', quantity: 8 },
      { templateId: 'mythic_ingot', quantity: 4 },
      { templateId: 'soul_fragment', quantity: 3 },
    ],
    result: createRecipeResult('dragon_god_cape', 'Dragon God Cape', 'Armor', 'cape', 5, 50, { DEF: 60, SPD: 30, LCK: 25 }),
    levelRequired: 50,
  },
  {
    id: 'ambrosia',
    name: 'Ambrosia',
    materials: [
      { templateId: 'herb', quantity: 20 },
      { templateId: 'soul_fragment', quantity: 2 },
      { templateId: 'celestial_dust', quantity: 3 },
      { templateId: 'mythic_ingot', quantity: 1 },
    ],
    result: createRecipeResult('ambrosia', 'Ambrosia', 'Consumable', null, 5, 50, { HP: 5000 }),
    levelRequired: 50,
  },
  {
    id: 'philosophers_draught',
    name: "Philosopher's Draught",
    materials: [
      { templateId: 'soul_fragment', quantity: 2 },
      { templateId: 'star_fragment', quantity: 2 },
      { templateId: 'primordial_core', quantity: 2 },
    ],
    result: createRecipeResult('philosophers_draught', "Philosopher's Draught", 'Consumable', null, 5, 50, { MP: 1000 }),
    levelRequired: 50,
  },
  {
    id: 'infinity_band',
    name: 'Infinity Band',
    materials: [
      { templateId: 'mythic_ingot', quantity: 3 },
      { templateId: 'soul_fragment', quantity: 3 },
      { templateId: 'star_fragment', quantity: 3 },
    ],
    result: createRecipeResult('infinity_band', 'Infinity Band', 'Armor', 'ring2', 5, 50, { LCK: 45, DEF: 30, ATK: 25 }),
    levelRequired: 50,
  },

  // --- Effect Potions ---
  {
    id: 'antidote',
    name: 'Antidote',
    materials: [
      { templateId: 'herb', quantity: 3 },
      { templateId: 'leather', quantity: 1 },
    ],
    result: createRecipeResult('antidote', 'Antidote', 'Consumable', null, 0, 3, { CURE_POISON: 1 }),
    levelRequired: 3,
  },
  {
    id: 'fire_ward_potion',
    name: 'Fire Ward Potion',
    materials: [
      { templateId: 'herb', quantity: 4 },
      { templateId: 'iron_ore', quantity: 2 },
    ],
    result: createRecipeResult('fire_ward_potion', 'Fire Ward Potion', 'Consumable', null, 1, 5, { CURE_BURN: 1 }),
    levelRequired: 5,
  },
  {
    id: 'regen_potion',
    name: 'Regeneration Potion',
    materials: [
      { templateId: 'herb', quantity: 5 },
      { templateId: 'gem_shard', quantity: 1 },
    ],
    result: createRecipeResult('regen_potion', 'Regeneration Potion', 'Consumable', null, 1, 8, { REGEN: 10 }),
    levelRequired: 8,
  },
  {
    id: 'strength_potion',
    name: 'Strength Potion',
    materials: [
      { templateId: 'herb', quantity: 4 },
      { templateId: 'iron_ore', quantity: 3 },
      { templateId: 'coal', quantity: 1 },
    ],
    result: createRecipeResult('strength_potion', 'Strength Potion', 'Consumable', null, 2, 10, { STRENGTH: 15 }),
    levelRequired: 10,
  },
  {
    id: 'haste_potion',
    name: 'Haste Potion',
    materials: [
      { templateId: 'herb', quantity: 4 },
      { templateId: 'silk', quantity: 2 },
    ],
    result: createRecipeResult('haste_potion', 'Haste Potion', 'Consumable', null, 2, 10, { HASTE: 1 }),
    levelRequired: 10,
  },
  {
    id: 'shield_potion',
    name: 'Shield Potion',
    materials: [
      { templateId: 'herb', quantity: 6 },
      { templateId: 'mithril_ore', quantity: 2 },
      { templateId: 'gem_shard', quantity: 2 },
    ],
    result: createRecipeResult('shield_potion', 'Shield Potion', 'Consumable', null, 2, 15, { SHIELD: 100 }),
    levelRequired: 15,
  },
  {
    id: 'greater_regen_potion',
    name: 'Greater Regen Potion',
    materials: [
      { templateId: 'herb', quantity: 8 },
      { templateId: 'gem_shard', quantity: 3 },
      { templateId: 'mithril_ore', quantity: 1 },
    ],
    result: createRecipeResult('greater_regen_potion', 'Greater Regen Potion', 'Consumable', null, 2, 15, { REGEN: 25 }),
    levelRequired: 15,
  },
  {
    id: 'titans_draught',
    name: "Titan's Draught",
    materials: [
      { templateId: 'herb', quantity: 10 },
      { templateId: 'dragon_scale', quantity: 2 },
      { templateId: 'primordial_core', quantity: 1 },
    ],
    result: createRecipeResult('titans_draught', "Titan's Draught", 'Consumable', null, 3, 25, { STRENGTH: 35 }),
    levelRequired: 25,
  },
  {
    id: 'invulnerability_elixir',
    name: 'Invulnerability Elixir',
    materials: [
      { templateId: 'celestial_dust', quantity: 3 },
      { templateId: 'star_fragment', quantity: 2 },
      { templateId: 'soul_fragment', quantity: 1 },
    ],
    result: createRecipeResult('invulnerability_elixir', 'Invulnerability Elixir', 'Consumable', null, 4, 45, { INVULN: 1 }),
    levelRequired: 45,
  },
  {
    id: 'frost_resistance_elixir',
    name: 'Frost Resistance Elixir',
    materials: [
      { templateId: 'herb', quantity: 5 },
      { templateId: 'mithril_ore', quantity: 1 },
    ],
    result: createRecipeResult('frost_resistance_elixir', 'Frost Resistance Elixir', 'Consumable', null, 1, 8, { CURE_FREEZE: 1 }),
    levelRequired: 8,
  },
  {
    id: 'bandage',
    name: 'Bandage',
    materials: [
      { templateId: 'leather', quantity: 2 },
      { templateId: 'herb', quantity: 1 },
    ],
    result: createRecipeResult('bandage', 'Bandage', 'Consumable', null, 0, 2, { CURE_BLEED: 1 }),
    levelRequired: 2,
  },
  {
    id: 'smelling_salts',
    name: 'Smelling Salts',
    materials: [
      { templateId: 'herb', quantity: 6 },
      { templateId: 'gem_shard', quantity: 1 },
    ],
    result: createRecipeResult('smelling_salts', 'Smelling Salts', 'Consumable', null, 1, 10, { CURE_STUN: 1 }),
    levelRequired: 10,
  },
  {
    id: 'thorns_potion',
    name: 'Thorns Potion',
    materials: [
      { templateId: 'herb', quantity: 6 },
      { templateId: 'iron_ore', quantity: 4 },
      { templateId: 'gem_shard', quantity: 2 },
    ],
    result: createRecipeResult('thorns_potion', 'Thorns Potion', 'Consumable', null, 2, 12, { THORNS: 20 }),
    levelRequired: 12,
  },
  {
    id: 'lifesteal_elixir',
    name: 'Lifesteal Elixir',
    materials: [
      { templateId: 'herb', quantity: 8 },
      { templateId: 'blood_ruby', quantity: 2 },
      { templateId: 'mithril_ore', quantity: 1 },
    ],
    result: createRecipeResult('lifesteal_elixir', 'Lifesteal Elixir', 'Consumable', null, 3, 20, { LIFESTEAL: 15 }),
    levelRequired: 20,
  },
  {
    id: 'greater_shield_potion',
    name: 'Greater Shield Potion',
    materials: [
      { templateId: 'adamantite_ore', quantity: 3 },
      { templateId: 'gem_shard', quantity: 4 },
      { templateId: 'dragon_scale', quantity: 1 },
    ],
    result: createRecipeResult('greater_shield_potion', 'Greater Shield Potion', 'Consumable', null, 3, 25, { SHIELD: 250 }),
    levelRequired: 25,
  },
  {
    id: 'greater_haste_potion',
    name: 'Greater Haste Potion',
    materials: [
      { templateId: 'silk', quantity: 4 },
      { templateId: 'mithril_ore', quantity: 2 },
      { templateId: 'gem_shard', quantity: 2 },
    ],
    result: createRecipeResult('greater_haste_potion', 'Greater Haste Potion', 'Consumable', null, 2, 15, { HASTE: 1 }),
    levelRequired: 15,
  },
];
