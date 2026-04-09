/** Rarity-related Tailwind class mappings and helpers */

export const RARITY_TEXT_CLASS = [
  'text-rf-rarity-common',
  'text-rf-rarity-uncommon',
  'text-rf-rarity-rare',
  'text-rf-rarity-epic',
  'text-rf-rarity-legendary',
  'text-rf-rarity-mythic',
] as const;

export const RARITY_BORDER_CLASS = [
  'border-rf-rarity-common',
  'border-rf-rarity-uncommon',
  'border-rf-rarity-rare',
  'border-rf-rarity-epic',
  'border-rf-rarity-legendary',
  'border-rf-rarity-mythic',
] as const;

export const RARITY_BG_CLASS = [
  'bg-rf-rarity-common/10',
  'bg-rf-rarity-uncommon/10',
  'bg-rf-rarity-rare/10',
  'bg-rf-rarity-epic/10',
  'bg-rf-rarity-legendary/10',
  'bg-rf-rarity-mythic/10',
] as const;

export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;

export function rarityTextClass(rarity: number): string {
  return RARITY_TEXT_CLASS[rarity] ?? RARITY_TEXT_CLASS[0];
}

export function rarityBorderClass(rarity: number): string {
  return RARITY_BORDER_CLASS[rarity] ?? RARITY_BORDER_CLASS[0];
}

export function rarityBgClass(rarity: number): string {
  return RARITY_BG_CLASS[rarity] ?? RARITY_BG_CLASS[0];
}

export function rarityName(rarity: number): string {
  return RARITY_NAMES[rarity] ?? 'Common';
}

export const CHANNEL_TEXT_CLASS: Record<string, string> = {
  global: 'text-rf-chat-global',
  local: 'text-rf-chat-local',
  trade: 'text-rf-chat-trade',
  system: 'text-rf-chat-system',
  combat: 'text-rf-chat-combat',
  whisper: 'text-rf-chat-whisper',
  guild: 'text-emerald-400',
};

export function channelTextClass(channel: string): string {
  return CHANNEL_TEXT_CLASS[channel] ?? 'text-rf-text';
}
