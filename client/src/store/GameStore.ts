import { signal, computed, batch, type Signal, type ReadonlySignal } from '@preact/signals';
import type {
  GameItem,
  SlottedGameItem,
  EquipmentSlotId,
  CraftingRecipe,
} from '../types/gameData';
import { WebSocketClient, MessageType } from '../network/WebSocketClient';
import { playSFX } from '../systems/AudioSystem';

// ─── Player Stats ────────────────────────────────────────────
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
  statPoints: number;
  playerClass: string;
  name?: string;
  strength?: number;
  agility?: number;
  intelligence?: number;
  vitality?: number;
  wisdom?: number;
  luck?: number;
  experience?: number;
}

const DEFAULT_STATS: PlayerStats = {
  hp: 100, maxHp: 100, mp: 50, maxMp: 50,
  level: 1, xp: 0, xpNeeded: 100,
  atk: 10, def: 5, spd: 5, lck: 1,
  statPoints: 0, playerClass: 'warrior',
};

// ─── Chat ────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  channel: 'global' | 'local' | 'trade' | 'system' | 'combat' | 'whisper' | 'guild';
  sender: string;
  text: string;
  timestamp: number;
}

// ─── Panel State ─────────────────────────────────────────────
export type PanelId = 'inventory' | 'equipment' | 'bank' | 'crafting' | 'marketplace' | 'stats' | 'settings' | 'character' | 'achievements' | 'combatlog' | 'social' | 'worldmap' | 'leaderboard' | 'skilltree' | 'guild' | 'enchant' | 'fishing' | 'factions' | 'mining' | 'pets' | 'mail' | 'arena' | 'dailyquests' | 'dungeonFinder' | 'bestiary' | 'bounty' | 'blessings' | 'runes';

// ─── Signals (reactive state) ────────────────────────────────
export const playerStats = signal<PlayerStats>({ ...DEFAULT_STATS });
export const inventory = signal<(SlottedGameItem | null)[]>(new Array(40).fill(null));
export const equipment = signal<Map<EquipmentSlotId, GameItem>>(new Map());
export const bankItems = signal<(SlottedGameItem | null)[]>(new Array(80).fill(null));
export const gold = signal<number>(0);

export const chatMessages = signal<ChatMessage[]>([]);
export const openPanels = signal<Set<PanelId>>(new Set());

export const isDead = signal<boolean>(false);
export const deathInfo = signal<{ killedBy?: string; respawnIn: number }>({ respawnIn: 0 });

export const showTutorial = signal<boolean>(false);
export const tutorialStep = signal<number>(0);

export const showStatAllocation = signal<boolean>(false);

// Connection state
export const connectionStatus = signal<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

// Auth state
export const isAuthenticated = signal<boolean>(false);
export const playerId = signal<string>('');
export const username = signal<string>('');

// Coords (from Phaser camera)
export const playerCoords = signal<{ x: number; y: number }>({ x: 0, y: 0 });

// Selected combat target — set by GameScene when clicking an enemy
export const selectedTargetId = signal<string | null>(null);

// ─── Guild ───────────────────────────────────────────────────
export interface GuildMember {
  id: string;
  name: string;
  level: number;
  class: string;
  rank: 'leader' | 'officer' | 'member';
  online: boolean;
}

export interface GuildInfo {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  level: number;
  xp: number;
  motd: string;
  bankGold: number;
  members: GuildMember[];
}

export const guildData = signal<GuildInfo | null>(null);
export const guildInvite = signal<{ guildName: string; fromPlayer: string } | null>(null);

// Entity tooltip (hovered entity info from Phaser)
export interface EntityTooltipData {
  name: string;
  level?: number;
  hp?: number;
  maxHp?: number;
  type: 'enemy' | 'player' | 'npc';
  screenX: number;
  screenY: number;
}
export const entityTooltip = signal<EntityTooltipData | null>(null);

// Context menu (right-click)
export interface ContextMenuItem {
  label: string;
  icon: string;
  action: () => void;
  disabled?: boolean;
}
export interface ContextMenuData {
  x: number;
  y: number;
  items: ContextMenuItem[];
}
export const contextMenu = signal<ContextMenuData | null>(null);

// World event banner
export interface WorldEventData {
  title: string;
  subtitle?: string;
  icon: string;
  timestamp: number;
}
export const worldEvent = signal<WorldEventData | null>(null);

// Persistent active world event (with timer)
export interface ActiveWorldEvent {
  type: string;
  title: string;
  icon: string;
  description: string;
  expiresAt: number; // Date.now() + remaining ms
}
export const activeWorldEvent = signal<ActiveWorldEvent | null>(null);

export function triggerWorldEvent(title: string, icon: string, subtitle?: string): void {
  worldEvent.value = { title, subtitle, icon, timestamp: Date.now() };
  setTimeout(() => {
    if (worldEvent.value?.timestamp === worldEvent.peek()?.timestamp) {
      worldEvent.value = null;
    }
  }, 5000);
}

export function setActiveWorldEvent(type: string, durationMs: number): void {
  const EVENT_INFO: Record<string, { title: string; icon: string; description: string }> = {
    double_xp: { title: 'Double XP', icon: '⭐', description: '2× Experience from kills!' },
    gold_rush: { title: 'Gold Rush', icon: '💰', description: '2× Gold from kills!' },
    lucky_hour: { title: 'Lucky Hour', icon: '🍀', description: '1.2× XP & Gold!' },
    invasion: { title: 'Monster Invasion', icon: '👹', description: 'Elite enemies roam the land!' },
    defense_buff: { title: 'Defense Aura', icon: '🛡️', description: 'All players shielded!' },
    rare_spawn: { title: 'Rare Spawns', icon: '✨', description: 'Rare enemies appearing!' },
    merchant_sale: { title: 'Merchant Sale', icon: '🏪', description: 'NPC prices reduced!' },
    elemental_surge: { title: 'Elemental Surge', icon: '⚡', description: '1.5× Gold & elemental power!' },
  };
  const info = EVENT_INFO[type] || { title: type, icon: '🌍', description: 'A world event is active!' };
  activeWorldEvent.value = {
    type,
    title: info.title,
    icon: info.icon,
    description: info.description,
    expiresAt: Date.now() + durationMs,
  };
  // Clear when expires
  setTimeout(() => {
    if (activeWorldEvent.value?.type === type) {
      activeWorldEvent.value = null;
    }
  }, durationMs);
}

// ─── Quests ──────────────────────────────────────────────────
export interface QuestObjective {
  description: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  giver: string;
  icon: string;
  objectives: QuestObjective[];
  rewards: { xp?: number; gold?: number; items?: string[] };
  status: 'active' | 'completed' | 'turnIn';
}

export const activeQuests = signal<Quest[]>([]);
export const showQuestPanel = signal<boolean>(false);

export function addQuest(quest: Quest): void {
  activeQuests.value = [...activeQuests.value, quest];
}

export function updateQuestObjective(questId: string, objIndex: number, current: number): void {
  const quests = activeQuests.value.map(q => {
    if (q.id !== questId) return q;
    const objectives = q.objectives.map((obj, i) => {
      if (i !== objIndex) return obj;
      const completed = current >= obj.target;
      return { ...obj, current, completed };
    });
    const allDone = objectives.every(o => o.completed);
    return { ...q, objectives, status: allDone ? 'turnIn' as const : q.status };
  });
  activeQuests.value = quests;
}

export function completeQuest(questId: string): void {
  activeQuests.value = activeQuests.value.map(q =>
    q.id === questId ? { ...q, status: 'completed' as const } : q,
  );
}

export function removeQuest(questId: string): void {
  activeQuests.value = activeQuests.value.filter(q => q.id !== questId);
}

// ─── NPC Dialogue ────────────────────────────────────────────
export interface DialogueChoice {
  text: string;
  nextNodeId: string | null; // null = end conversation
  action?: string; // e.g. 'accept_quest', 'open_shop'
}

export interface DialogueNode {
  id: string;
  speaker: string;
  portrait: string;
  text: string;
  choices: DialogueChoice[];
}

export const npcDialogue = signal<DialogueNode | null>(null);

// Active status effects
export interface ActiveEffect {
  type: string;
  appliedAt: number;
  remainingMs: number;
  icon: string;
  isBuff: boolean;
}

export const activeEffects = signal<Map<string, ActiveEffect>>(new Map());

const EFFECT_META: Record<string, { icon: string; isBuff: boolean }> = {
  poison: { icon: '☠️', isBuff: false },
  burn: { icon: '🔥', isBuff: false },
  bleed: { icon: '🩸', isBuff: false },
  freeze: { icon: '🧊', isBuff: false },
  stun: { icon: '⭐', isBuff: false },
  slow: { icon: '🐌', isBuff: false },
  weakness: { icon: '💔', isBuff: false },
  regen: { icon: '💚', isBuff: true },
  shield: { icon: '🛡️', isBuff: true },
  haste: { icon: '⚡', isBuff: true },
  strength: { icon: '💪', isBuff: true },
  lifesteal: { icon: '🧛', isBuff: true },
  thorns: { icon: '🌹', isBuff: true },
  invulnerable: { icon: '✨', isBuff: true },
};

export function addActiveEffect(type: string, remainingMs: number): void {
  const meta = EFFECT_META[type.toLowerCase()] ?? { icon: '❓', isBuff: false };
  const next = new Map(activeEffects.value);
  next.set(type, { type, appliedAt: Date.now(), remainingMs, icon: meta.icon, isBuff: meta.isBuff });
  activeEffects.value = next;
}

export function removeActiveEffect(type: string): void {
  const next = new Map(activeEffects.value);
  next.delete(type);
  activeEffects.value = next;
}

// ─── Skills / Hotbar ─────────────────────────────────────────
export interface SkillDef {
  id: string;
  name: string;
  icon: string;
  cooldownMs: number;
  manaCost: number;
  description: string;
}

export interface HotbarSlot {
  skill: SkillDef | null;
  lastUsedAt: number; // timestamp of last activation (for cooldown ring)
}

// Pre-defined class skills (client-ready, will sync with server when implemented)
const CLASS_SKILLS: Record<string, SkillDef[]> = {
  warrior: [
    { id: 'slash', name: 'Slash', icon: '⚔️', cooldownMs: 2000, manaCost: 0, description: 'Basic melee attack' },
    { id: 'shield_bash', name: 'Shield Bash', icon: '🛡️', cooldownMs: 5000, manaCost: 10, description: 'Stun enemy for 2s' },
    { id: 'whirlwind', name: 'Whirlwind', icon: '🌪️', cooldownMs: 8000, manaCost: 20, description: 'AoE spin attack' },
    { id: 'battle_cry', name: 'Battle Cry', icon: '📣', cooldownMs: 15000, manaCost: 15, description: '+25% ATK for 10s' },
    { id: 'charge', name: 'Charge', icon: '🏃', cooldownMs: 10000, manaCost: 12, description: 'Dash to enemy' },
    { id: 'execute', name: 'Execute', icon: '💀', cooldownMs: 20000, manaCost: 30, description: '3x damage below 20% HP' },
  ],
  mage: [
    { id: 'fireball', name: 'Fireball', icon: '🔥', cooldownMs: 3000, manaCost: 15, description: 'Ranged fire damage' },
    { id: 'ice_shard', name: 'Ice Shard', icon: '🧊', cooldownMs: 2500, manaCost: 10, description: 'Slow enemy' },
    { id: 'lightning', name: 'Lightning', icon: '⚡', cooldownMs: 6000, manaCost: 25, description: 'Chain lightning' },
    { id: 'teleport', name: 'Teleport', icon: '✨', cooldownMs: 12000, manaCost: 20, description: 'Blink to cursor' },
    { id: 'mana_shield', name: 'Mana Shield', icon: '🔮', cooldownMs: 15000, manaCost: 30, description: 'Absorb damage with MP' },
    { id: 'meteor', name: 'Meteor', icon: '☄️', cooldownMs: 25000, manaCost: 50, description: 'Massive AoE damage' },
  ],
  rogue: [
    { id: 'backstab', name: 'Backstab', icon: '🗡️', cooldownMs: 2000, manaCost: 5, description: '2x damage from behind' },
    { id: 'poison_blade', name: 'Poison Blade', icon: '☠️', cooldownMs: 6000, manaCost: 10, description: 'Apply poison DoT' },
    { id: 'smoke_bomb', name: 'Smoke Bomb', icon: '💨', cooldownMs: 10000, manaCost: 15, description: 'AoE blind + stealth' },
    { id: 'shadow_step', name: 'Shadow Step', icon: '👤', cooldownMs: 8000, manaCost: 12, description: 'Teleport behind target' },
    { id: 'fan_of_knives', name: 'Fan of Knives', icon: '🔪', cooldownMs: 7000, manaCost: 18, description: 'AoE knife throw' },
    { id: 'assassinate', name: 'Assassinate', icon: '💀', cooldownMs: 20000, manaCost: 35, description: 'Massive single-target' },
  ],
};

export const hotbar = signal<HotbarSlot[]>(
  Array.from({ length: 6 }, () => ({ skill: null, lastUsedAt: 0 })),
);

export function initHotbarForClass(playerClass: string): void {
  const skills = CLASS_SKILLS[playerClass.toLowerCase()] ?? CLASS_SKILLS.warrior;
  hotbar.value = skills.map(skill => ({ skill, lastUsedAt: 0 }));
}

// ─── Trade System ────────────────────────────────────────────

export interface TradeState {
  active: boolean;
  tradeId?: string;
  playerA?: string;
  playerB?: string;
  itemsA: number[];
  itemsB: number[];
  goldA: number;
  goldB: number;
  confirmedA: boolean;
  confirmedB: boolean;
}

export const tradeState = signal<TradeState>({
  active: false,
  itemsA: [],
  itemsB: [],
  goldA: 0,
  goldB: 0,
  confirmedA: false,
  confirmedB: false,
});

export const tradeRequest = signal<{ from: string } | null>(null);

// Guild alias (guildData defined above by guild system)
export const guildInfo = guildData;

// ─── Fishing ────────────────────────────────────────────────
export interface FishingResult {
  success: boolean;
  catch: string;
  icon: string;
  rarity: string;
  value: number;
}
export const lastFishingResult = signal<FishingResult | null>(null);
export const isFishing = signal<boolean>(false);

// ─── Mining / Gathering ─────────────────────────────────────
export interface GatherResultItem {
  name: string;
  icon: string;
  quantity: number;
  rarity: number;
}
export interface GatherResult {
  items: GatherResultItem[];
  xpGained: number;
  miningLevel: number;
  gatheringLevel: number;
  miningXp?: number;
  gatheringXp?: number;
}
export const lastGatherResult = signal<GatherResult | null>(null);
export const isGathering = signal<boolean>(false);
export const miningLevel = signal<number>(1);
export const gatheringLevel = signal<number>(1);
export const miningXp = signal<number>(0);
export const gatheringXp = signal<number>(0);

// ─── Factions ───────────────────────────────────────────────
export interface FactionInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  rep: number;
  rank: string;
}
export const factions = signal<FactionInfo[]>([]);

// ─── Set Bonuses ────────────────────────────────────────────
export interface SetBonus {
  name: string;
  icon: string;
  bonuses: { pieces: number; stat: string; value: number }[];
}
export const activeSets = signal<SetBonus[]>([]);

// ─── Weather ────────────────────────────────────────────────
export interface WeatherState {
  weather: string;
  icon: string;
  intensity: number;
}
export const currentWeather = signal<WeatherState>({ weather: 'clear', icon: '☀️', intensity: 0.3 });

// ─── Title System ─────────────────────────────────────────────
export interface TitleDef {
  id: string;
  name: string;
  description: string;
}
export interface TitleState {
  catalog: TitleDef[];
  unlocked: string[];
  active: string;
}
export const titleState = signal<TitleState>({ catalog: [], unlocked: [], active: '' });

// ─── Pet State ───────────────────────────────────────────────
export interface PetInfo {
  id: string;
  name: string;
  pet_type: string;
  icon: string;
  level: number;
  xp: number;
  xp_to_next: number;
  bonus_stat: string;
  bonus_value: number;
  rarity: number;
}
export interface PetState {
  active: PetInfo | null;
  collection: PetInfo[];
}
export const petState = signal<PetState>({ active: null, collection: [] });

// ─── Auction House ──────────────────────────────────────────
export interface AuctionItem {
  id: string;
  item: GameItem;
  price: number;
  seller: string;
  timeLeft: number;
}
export interface AuctionState {
  listings: AuctionItem[];
  myListings: AuctionItem[];
}
export const auctionState = signal<AuctionState>({ listings: [], myListings: [] });

// ─── Mount State ─────────────────────────────────────────────
export interface MountState {
  mounted: boolean;
  mountName: string;
  speedBonus: number;
}
export const mountState = signal<MountState>({ mounted: false, mountName: '', speedBonus: 0 });

// ─── Mail State ──────────────────────────────────────────────
export interface MailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  gold: number;
  item: any;
  read: boolean;
  hasAttachment: boolean;
}
export const mailbox = signal<MailMessage[]>([]);

// ─── Arena State ─────────────────────────────────────────────
export interface ArenaState {
  queued: boolean;
  inMatch: boolean;
  opponent: string;
  opponentId: string;
  rating: number;
  wins: number;
  losses: number;
}
export const arenaState = signal<ArenaState>({ queued: false, inMatch: false, opponent: '', opponentId: '', rating: 1000, wins: 0, losses: 0 });

// ─── Daily Quest State ───────────────────────────────────────
export interface DailyQuest {
  questId: string;
  title: string;
  description: string;
  objective: string;
  target: number;
  progress: number;
  completed: boolean;
  rewardXp: number;
  rewardGold: number;
}
export const dailyQuests = signal<DailyQuest[]>([]);

// ─── Blessings ───────────────────────────────────────────────
export const blessings = signal<number>(0); // bitmask

// ─── Stamina ─────────────────────────────────────────────────
export const stamina = signal<number>(2520); // minutes

// ─── Bestiary ────────────────────────────────────────────────
export interface BestiaryEntry {
  name: string;
  kills: number;
  tier: string;
}
export const bestiary = signal<BestiaryEntry[]>([]);

// ─── Bounty ──────────────────────────────────────────────────
export interface BountyEntry {
  name: string;
  bounty: number;
  level: number;
}
export const bountyBoard = signal<BountyEntry[]>([]);
export const myBounty = signal<number>(0);

export function useSkill(slotIndex: number): void {
  const slots = hotbar.value;
  if (slotIndex < 0 || slotIndex >= slots.length) return;
  const slot = slots[slotIndex];
  if (!slot.skill) return;

  const now = Date.now();
  const elapsed = now - slot.lastUsedAt;
  if (elapsed < slot.skill.cooldownMs) return; // still on cooldown

  const stats = playerStats.value;
  if (stats.mp < slot.skill.manaCost) return; // not enough mana

  // Deduct mana locally (optimistic)
  playerStats.value = { ...stats, mp: stats.mp - slot.skill.manaCost };

  // Mark as used
  const next = [...slots];
  next[slotIndex] = { ...slot, lastUsedAt: now };
  hotbar.value = next;

  playSFX('skill_cast');

  // Send to server
  try {
    getNetwork().send(MessageType.UseSkill, {
      skillId: slot.skill.id,
      targetId: selectedTargetId.value,
    });
  } catch { /* network not ready */ }
}

// ─── Computed ────────────────────────────────────────────────
export const hpRatio: ReadonlySignal<number> = computed(() => {
  const s = playerStats.value;
  return s.maxHp > 0 ? s.hp / s.maxHp : 0;
});

export const mpRatio: ReadonlySignal<number> = computed(() => {
  const s = playerStats.value;
  return s.maxMp > 0 ? s.mp / s.maxMp : 0;
});

export const xpRatio: ReadonlySignal<number> = computed(() => {
  const s = playerStats.value;
  return s.xpNeeded > 0 ? s.xp / s.xpNeeded : 0;
});

export const hasStatPoints: ReadonlySignal<boolean> = computed(() => {
  return playerStats.value.statPoints > 0;
});

// ─── Panel Toggle ────────────────────────────────────────────
export function togglePanel(panel: PanelId): void {
  const next = new Set(openPanels.value);
  if (next.has(panel)) next.delete(panel);
  else next.add(panel);
  openPanels.value = next;
}

export function isPanelOpen(panel: PanelId): boolean {
  return openPanels.value.has(panel);
}

export function closeAllPanels(): void {
  openPanels.value = new Set();
}

// ─── Chat ────────────────────────────────────────────────────
let chatIdCounter = 0;

export function addChatMessage(
  channel: ChatMessage['channel'],
  sender: string,
  text: string,
): void {
  const msg: ChatMessage = {
    id: `chat-${++chatIdCounter}`,
    channel,
    sender,
    text,
    timestamp: Date.now(),
  };
  // Keep last 100 messages
  const msgs = [...chatMessages.value, msg];
  chatMessages.value = msgs.length > 100 ? msgs.slice(-100) : msgs;
}

// ─── Network Reference ──────────────────────────────────────
// Held here so UI components can dispatch commands without importing network directly
let _network: WebSocketClient | null = null;

export function setNetwork(net: WebSocketClient): void {
  _network = net;
}

export function getNetwork(): WebSocketClient {
  if (!_network) throw new Error('GameStore: network not initialized');
  return _network;
}

// ─── Commands (UI → Game) ────────────────────────────────────
export const commands = {
  equipItem(slotIndex: number): void {
    getNetwork().send(MessageType.EquipItem, { slotIndex });
  },
  unequipItem(slot: EquipmentSlotId): void {
    getNetwork().send(MessageType.UnequipItem, { slot });
  },
  useItem(slotIndex: number): void {
    getNetwork().send(MessageType.UseItem, { action: 'use', slotIndex });
  },
  craftItem(recipeId: string): void {
    getNetwork().send(MessageType.UseItem, { action: 'craft', recipeId });
  },
  buyItem(listingId: string): void {
    getNetwork().send(MessageType.UseItem, { action: 'buy', listingId });
  },
  sellItem(slotIndex: number): void {
    getNetwork().send(MessageType.UseItem, { action: 'sell', slotIndex });
  },
  bankDeposit(inventorySlot: number): void {
    getNetwork().send(MessageType.BankDeposit, { inventorySlot });
  },
  bankWithdraw(bankSlot: number): void {
    getNetwork().send(MessageType.BankWithdraw, { bankSlot });
  },
  allocateStats(allocations: Record<string, number>): void {
    getNetwork().send(MessageType.AllocateStats, { allocations });
  },
  sendChat(channel: string, text: string): void {
    getNetwork().send(MessageType.Chat, { channel, text });
  },
  move(targetX: number, targetY: number, seq: number): void {
    getNetwork().send(MessageType.Move, { targetX, targetY, seq });
  },
  attack(targetId: string): void {
    getNetwork().send(MessageType.Attack, { targetId });
  },
  attackPlayer(targetId: string): void {
    getNetwork().send(MessageType.AttackPlayer, { targetId });
  },
  pickupItem(): void {
    getNetwork().send(MessageType.PickupItem, {});
  },
  tradeRequest(target: string): void {
    getNetwork().send(MessageType.TradeAction, { action: 'request', target });
  },
  tradeAccept(): void {
    getNetwork().send(MessageType.TradeAction, { action: 'accept' });
  },
  tradeOffer(items: number[], gold: number): void {
    getNetwork().send(MessageType.TradeAction, { action: 'offer', items, gold });
  },
  tradeConfirm(): void {
    getNetwork().send(MessageType.TradeAction, { action: 'confirm' });
  },
  tradeCancel(): void {
    getNetwork().send(MessageType.TradeAction, { action: 'cancel' });
    tradeState.value = { active: false, itemsA: [], itemsB: [], goldA: 0, goldB: 0, confirmedA: false, confirmedB: false };
  },
  enchantItem(slotIndex: number, itemId: string): void {
    getNetwork().send(MessageType.EnchantItem, { slotIndex, itemId });
  },
  // Auction house
  auctionList(slotIndex: number, price: number): void {
    getNetwork().send(MessageType.AuctionAction, { action: 'list', slotIndex, price });
  },
  auctionBuy(listingId: string): void {
    getNetwork().send(MessageType.AuctionAction, { action: 'buy', listingId });
  },
  auctionCancel(listingId: string): void {
    getNetwork().send(MessageType.AuctionAction, { action: 'cancel', listingId });
  },
  auctionBrowse(category?: string): void {
    getNetwork().send(MessageType.AuctionAction, { action: 'browse', category: category ?? 'all' });
  },
  // Mount system
  mount(): void {
    getNetwork().send(MessageType.MountAction, { action: 'mount' });
  },
  dismount(): void {
    getNetwork().send(MessageType.MountAction, { action: 'dismount' });
  },
  toggleMount(): void {
    if (mountState.value.mounted) {
      getNetwork().send(MessageType.MountAction, { action: 'dismount' });
    } else {
      getNetwork().send(MessageType.MountAction, { action: 'mount' });
    }
  },
  // Mail system
  sendMail(to: string, subject: string, body: string, gold: number = 0, itemSlot?: number): void {
    getNetwork().send(MessageType.MailAction, { action: 'send', to, subject, body, gold, itemSlot });
  },
  readMail(mailId: string): void {
    getNetwork().send(MessageType.MailAction, { action: 'read', mailId });
  },
  claimMail(mailId: string): void {
    getNetwork().send(MessageType.MailAction, { action: 'claim', mailId });
  },
  deleteMail(mailId: string): void {
    getNetwork().send(MessageType.MailAction, { action: 'delete', mailId });
  },
  listMail(): void {
    getNetwork().send(MessageType.MailAction, { action: 'list' });
  },
  // Arena
  arenaQueue(): void {
    getNetwork().send(MessageType.ArenaAction, { action: 'queue' });
  },
  arenaLeave(): void {
    getNetwork().send(MessageType.ArenaAction, { action: 'leave' });
  },
  // Daily quests
  claimDailyQuest(questId: string): void {
    getNetwork().send(MessageType.DailyQuestClaim, { questId });
  },
};

// ─── Namespace export for convenience ────────────────────────
export const gameStore = {
  playerStats,
  inventory,
  equipment,
  bankItems,
  gold,
  openPanels,
  chatMessages,
  isDead,
  deathInfo,
  playerCoords,
  hotbar,
  activeEffects,
  activeQuests,
  commands,
};

// ─── Reset ───────────────────────────────────────────────────
export function resetStore(): void {
  batch(() => {
    playerStats.value = { ...DEFAULT_STATS };
    inventory.value = new Array(40).fill(null);
    equipment.value = new Map();
    bankItems.value = new Array(80).fill(null);
    gold.value = 0;
    chatMessages.value = [];
    openPanels.value = new Set();
    isDead.value = false;
    showStatAllocation.value = false;
    showTutorial.value = false;
    tutorialStep.value = 0;
  });
}
