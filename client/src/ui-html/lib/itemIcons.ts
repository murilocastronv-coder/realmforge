import type { GameItem } from '../../types/gameData';

/**
 * Emoji icon mapping for game items based on itemType, slot, and name keywords.
 */

const WEAPON_ICONS: Record<string, string> = {
  sword: '⚔️',
  blade: '⚔️',
  axe: '🪓',
  staff: '🪄',
  wand: '🪄',
  bow: '🏹',
  dagger: '🗡️',
  mace: '🔨',
  hammer: '🔨',
  spear: '🔱',
  crossbow: '🏹',
  scythe: '⚔️',
};

const ARMOR_SLOT_ICONS: Record<string, string> = {
  helmet: '🪖',
  armor: '🛡️',
  shield: '🛡️',
  boots: '👢',
  legs: '🦿',
  cape: '🧣',
  amulet: '📿',
  ring1: '💍',
  ring2: '💍',
};

const CONSUMABLE_ICONS: Record<string, string> = {
  health: '❤️',
  mana: '💙',
  potion: '🧪',
  elixir: '🧪',
  scroll: '📜',
  food: '🍖',
  antidote: '💊',
};

const MATERIAL_ICONS: Record<string, string> = {
  ore: '⛏️',
  iron: '⛏️',
  wood: '🪵',
  leather: '🧶',
  herb: '🌿',
  gem: '💎',
  crystal: '💎',
  cloth: '🧵',
  bone: '🦴',
  scale: '🐉',
  stone: '🪨',
  gold: '🪙',
  feather: '🪶',
  essence: '✨',
  dust: '✨',
  fang: '🦷',
};

function matchKeyword(name: string, map: Record<string, string>): string | null {
  const lower = name.toLowerCase();
  for (const [keyword, icon] of Object.entries(map)) {
    if (lower.includes(keyword)) return icon;
  }
  return null;
}

export function getItemIcon(item: GameItem): string {
  const name = item.name;

  switch (item.itemType) {
    case 'Weapon':
      return matchKeyword(name, WEAPON_ICONS) ?? '⚔️';
    case 'Armor':
      if (item.slot) {
        const slotIcon = ARMOR_SLOT_ICONS[item.slot];
        if (slotIcon) return slotIcon;
      }
      return matchKeyword(name, ARMOR_SLOT_ICONS) ?? '🛡️';
    case 'Consumable':
      return matchKeyword(name, CONSUMABLE_ICONS) ?? '🧪';
    case 'Material':
      return matchKeyword(name, MATERIAL_ICONS) ?? '📦';
    case 'Misc':
    default:
      return '❓';
  }
}

/** Rarity glow CSS class for item backgrounds */
export function rarityGlowClass(rarity: number): string {
  switch (rarity) {
    case 1: return 'shadow-[0_0_6px_rgba(46,204,113,0.3)]';  // uncommon green
    case 2: return 'shadow-[0_0_8px_rgba(52,152,219,0.4)]';  // rare blue
    case 3: return 'shadow-[0_0_10px_rgba(155,89,182,0.5)]';  // epic purple
    case 4: return 'shadow-[0_0_12px_rgba(243,156,18,0.6)]';  // legendary orange
    case 5: return 'shadow-[0_0_14px_rgba(231,76,60,0.7)]';   // mythic red
    default: return '';
  }
}
