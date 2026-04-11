export const INVENTORY_SLOT_COUNT = 40;
export const BANK_SLOT_COUNT = 80;

export const EQUIPMENT_SLOT_IDS = [
  'helmet',
  'amulet',
  'cape',
  'armor',
  'shield',
  'weapon',
  'legs',
  'ring1',
  'boots',
  'ring2',
] as const;

export type EquipmentSlotId = (typeof EQUIPMENT_SLOT_IDS)[number];
export type ItemType = 'Weapon' | 'Armor' | 'Consumable' | 'Material' | 'Misc';
export type ItemStats = Record<string, number>;

const EMPTY_ITEM_STATS: ItemStats = Object.freeze({}) as ItemStats;
const EMPTY_AFFIXES: string[] = [];

export interface GameItem {
  id: string;
  templateId: string;
  name: string;
  rarity: number;
  itemType: ItemType;
  slot: EquipmentSlotId | null;
  stackable: boolean;
  quantity: number;
  level: number;
  stats: ItemStats;
  description: string;
  affixes: string[];
  enchantLevel?: number;
}

export interface SlottedGameItem extends GameItem {
  slotIndex: number;
}

export interface EquippedItemPayload {
  slot: EquipmentSlotId;
  item: GameItem;
}

export interface InventoryUpdatePayload {
  items: SlottedGameItem[];
  equipment?: EquippedItemPayload[];
  gold?: number;
}

export interface BankUpdatePayload {
  items: SlottedGameItem[];
}

export interface GroundItemPayload {
  id: string;
  templateId: string;
  itemType: ItemType;
  name: string;
  rarity: number;
  x: number;
  y: number;
}

export interface GroundItemsPayload {
  items: GroundItemPayload[];
}

export interface BankDepositPayload {
  inventorySlot: number;
}

export interface BankWithdrawPayload {
  bankSlot: number;
}

export interface EquipItemPayload {
  slotIndex: number;
}

export interface UnequipItemPayload {
  slot: EquipmentSlotId;
}

export type UseItemRequestPayload =
  | { action: 'use'; slotIndex: number }
  | { action: 'craft'; recipeId: string }
  | { action: 'buy'; listingId: string };

export interface CraftingMaterialRequirement {
  templateId: string;
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  materials: CraftingMaterialRequirement[];
  result: GameItem;
  levelRequired: number;
}

export function getItemStats(item: { stats?: ItemStats | null }): ItemStats {
  return item.stats ?? EMPTY_ITEM_STATS;
}

export function normalizeGameItem<T extends GameItem>(item: T): T {
  return {
    ...item,
    stats: getItemStats(item),
    description: item.description ?? '',
    affixes: item.affixes ?? EMPTY_AFFIXES,
  } as T;
}

export function buildSlottedItemGrid<T extends SlottedGameItem>(
  items: readonly T[],
  slotCount: number,
): Array<T | null> {
  const grid: Array<T | null> = new Array(slotCount).fill(null);

  for (const item of items) {
    if (item.slotIndex >= 0 && item.slotIndex < slotCount) {
      grid[item.slotIndex] = normalizeGameItem(item);
    }
  }

  return grid;
}
