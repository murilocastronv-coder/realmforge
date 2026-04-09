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
  channel: 'global' | 'local' | 'trade' | 'system' | 'combat' | 'whisper';
  sender: string;
  text: string;
  timestamp: number;
}

// ─── Panel State ─────────────────────────────────────────────
export type PanelId = 'inventory' | 'equipment' | 'bank' | 'crafting' | 'marketplace' | 'stats' | 'settings' | 'character' | 'achievements' | 'combatlog' | 'social' | 'worldmap' | 'leaderboard' | 'skilltree';

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

export function triggerWorldEvent(title: string, icon: string, subtitle?: string): void {
  worldEvent.value = { title, subtitle, icon, timestamp: Date.now() };
  setTimeout(() => {
    if (worldEvent.value?.timestamp === worldEvent.peek()?.timestamp) {
      worldEvent.value = null;
    }
  }, 5000);
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
