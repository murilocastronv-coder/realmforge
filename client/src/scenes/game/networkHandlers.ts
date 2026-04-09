import Phaser from 'phaser';
import {
  MessageType,
  type ChunkDataPayload,
  type EntityState,
  type MessageHandler,
} from '../../network/WebSocketClient';
import type {
  BankUpdatePayload,
  EquipmentSlotId,
  GameItem,
  GroundItemPayload,
  GroundItemsPayload,
  InventoryUpdatePayload,
} from '../../types/gameData';
import {
  INVENTORY_SLOT_COUNT,
  buildSlottedItemGrid,
  normalizeGameItem,
} from '../../types/gameData';
import {
  playerStats,
  inventory,
  equipment,
  bankItems,
  gold,
  isDead,
  deathInfo,
  addChatMessage,
  addActiveEffect,
  removeActiveEffect,
  initHotbarForClass,
  tradeState,
  tradeRequest,
  activeQuests,
  npcDialogue,
  guildInfo,
  lastFishingResult,
  isFishing,
  factions,
  activeSets,
  type Quest,
  type PlayerStats,
} from '../../store/GameStore';
import { showToast } from '../../ui-html/hud/ToastStack';
import { addCombatLog } from '../../ui-html/panels/CombatLogPanel';
import { recordDamageSource, freezeDeathRecap, clearDeathRecap } from '../../ui-html/hud/DeathRecapWidget';
import { updateAchievement, setAchievementProgress } from '../../ui-html/panels/AchievementPanel';
import { setLoadingProgress } from '../../ui-html/screens/LoadingScreen';
import { playSFX } from '../../systems/AudioSystem';
import type { RemoteEntityMap } from './entityRendering';

type PlayerPositionUpdate = {
  x?: number;
  y?: number;
  targetX?: number;
  targetY?: number;
};

interface GameScenePlayerDeps {
  getId(): string;
  setId(id: string): void;
  sprite: Phaser.GameObjects.Sprite;
  getPosition(): { x: number; y: number };
  setPosition(update: PlayerPositionUpdate): void;
  setSelectedEntityId(id: string | null): void;
  movementInputActive(): boolean;
}

interface GameSceneWorldDeps {
  entities: RemoteEntityMap;
  updateRemoteEntity(entity: EntityState): void;
  removeEntity(id: string): void;
  removeMissingEntities(seenIds: Set<string>): void;
  renderChunk(chunk: ChunkDataPayload): void;
  updateGroundItems(items: GroundItemPayload[]): void;
  clearGroundItems(): void;
}

interface GameSceneEffectDeps {
  showLevelUpEffect(): void;
  showDamageNumber(x: number, y: number, damage: number, isCrit: boolean): void;
  showMissText(x: number, y: number): void;
  showDeathEffect(x: number, y: number): void;
  showXpOrbPickup(x: number, y: number, xp: number): void;
  showEffectApplied(effectType: string): void;
  showEffectRemoved(effectType: string): void;
  showEffectTick(effectType: string, value: number): void;
  shakeCamera(intensity?: number, duration?: number): void;
  showHealNumber(x: number, y: number, amount: number): void;
}

export interface GameSceneNetworkDeps {
  register(type: MessageType, handler: MessageHandler): void;
  registry: Phaser.Data.DataManager;
  player: GameScenePlayerDeps;
  world: GameSceneWorldDeps;
  effects: GameSceneEffectDeps;
}

function withErrorLogging(label: string, handler: MessageHandler): MessageHandler {
  return (msg) => {
    try {
      handler(msg);
    } catch (error) {
      console.error(`[GameScene] ${label} error:`, error);
    }
  };
}

export function registerGameSceneNetworkHandlers(deps: GameSceneNetworkDeps): void {
  deps.register(MessageType.AuthResult, withErrorLogging('AuthResult reconnect', (msg) => {
    const payload = msg.payload as { success: boolean; playerId?: string };
    if (!payload.success || !payload.playerId || payload.playerId === deps.player.getId()) {
      return;
    }

    const oldId = deps.player.getId();
    deps.player.setId(payload.playerId);
    deps.registry.set('playerId', payload.playerId);
    deps.world.removeEntity(oldId);
    addChatMessage('system', 'System', 'Reconnected successfully.');
  }));

  deps.register(MessageType.EntityUpdate, withErrorLogging('EntityUpdate', (msg) => {
    const payload = msg.payload as { entities: EntityState[] };
    const seenIds = new Set<string>();

    for (const entity of payload.entities) {
      seenIds.add(entity.id);

      if (entity.id === deps.player.getId()) {
        if (!deps.player.movementInputActive() && entity.targetX !== undefined && entity.targetY !== undefined) {
          deps.player.setPosition({ targetX: entity.targetX, targetY: entity.targetY });
        }

        const playerPos = deps.player.getPosition();
        const drift = Math.sqrt(
          Math.pow(playerPos.x - entity.x, 2) +
          Math.pow(playerPos.y - entity.y, 2),
        );

        if (drift > 5.0) {
          deps.player.setPosition({
            x: entity.x,
            y: entity.y,
            targetX: entity.targetX ?? entity.x,
            targetY: entity.targetY ?? entity.y,
          });
        } else if (drift > 2.0) {
          deps.player.setPosition({
            x: Phaser.Math.Linear(playerPos.x, entity.x, 0.05),
            y: Phaser.Math.Linear(playerPos.y, entity.y, 0.05),
          });
        }

        if (entity.hp !== undefined) {
          const current = playerStats.value;
          playerStats.value = { ...current, hp: entity.hp, maxHp: entity.maxHp || current.maxHp };
        }
        continue;
      }

      deps.world.updateRemoteEntity(entity);
    }

    deps.world.removeMissingEntities(seenIds);
  }));

  deps.register(MessageType.PlayerJoined, withErrorLogging('PlayerJoined', (msg) => {
    const { id, username } = msg.payload as { id: string; username: string };
    if (id !== deps.player.getId()) {
      addChatMessage('system', 'System', `${username} joined the world.`);
    }
  }));

  deps.register(MessageType.PlayerLeft, withErrorLogging('PlayerLeft', (msg) => {
    const { id } = msg.payload as { id: string };
    deps.world.removeEntity(id);
  }));

  deps.register(MessageType.ChunkData, withErrorLogging('ChunkData', (msg) => {
    deps.world.renderChunk(msg.payload as ChunkDataPayload);
    setLoadingProgress(100, 'Welcome to RealmForge!');
  }));

  deps.register(MessageType.StatsUpdate, withErrorLogging('StatsUpdate', (msg) => {
    const raw = msg.payload as Record<string, unknown>;
    const current = playerStats.value;
    const update: Partial<PlayerStats> = {};

    if (raw.hp !== undefined) update.hp = raw.hp as number;
    if (raw.maxHp !== undefined) update.maxHp = raw.maxHp as number;
    if (raw.mp !== undefined) update.mp = raw.mp as number;
    if (raw.maxMp !== undefined) update.maxMp = raw.maxMp as number;
    if (raw.level !== undefined) update.level = raw.level as number;
    if (raw.xp !== undefined) update.xp = raw.xp as number;
    if (raw.xpNeeded !== undefined) update.xpNeeded = raw.xpNeeded as number;
    if (raw.atk !== undefined) update.atk = raw.atk as number;
    if (raw.def !== undefined) update.def = raw.def as number;
    if (raw.spd !== undefined) update.spd = raw.spd as number;
    if (raw.lck !== undefined) update.lck = raw.lck as number;
    if (raw.statPoints !== undefined) update.statPoints = raw.statPoints as number;
    if (raw.class !== undefined) update.playerClass = raw.class as string;

    playerStats.value = { ...current, ...update };
    if (raw.gold !== undefined) gold.value = raw.gold as number;

    // Update active set bonuses
    if (raw.setBonuses !== undefined) {
      activeSets.value = raw.setBonuses as any[];
    }

    // Initialize hotbar when class is known
    if (raw.class !== undefined) initHotbarForClass(raw.class as string);
  }));

  deps.register(MessageType.LevelUp, withErrorLogging('LevelUp', (msg) => {
    const { level, statPoints: sp } = msg.payload as { level: number; statPoints?: number };
    const current = playerStats.value;
    const update: Partial<PlayerStats> = { level };
    if (sp !== undefined) update.statPoints = sp;
    playerStats.value = { ...current, ...update };

    const pointsMsg = sp ? ` You have ${sp} stat points! Press P to allocate.` : '';
    addChatMessage('system', 'System', `⭐ Level Up! You are now level ${level}!${pointsMsg}`);
    showToast(`Level Up! Now level ${level}`, 'success', '⭐');
    deps.effects.showLevelUpEffect();
    playSFX('level_up');
    // Achievement tracking
    setAchievementProgress('level-5', level);
    setAchievementProgress('level-10', level);
    setAchievementProgress('level-25', level);
    setAchievementProgress('level-50', level);
  }));

  deps.register(MessageType.CombatEvent, withErrorLogging('CombatEvent', (msg) => {
    const { attackerId, targetId, damage, isCrit, targetHp } = msg.payload as {
      attackerId: string;
      targetId: string;
      damage: number;
      isCrit: boolean;
      targetHp?: number;
    };
    const target = deps.world.entities.get(targetId);
    if (target) {
      if (damage === 0) {
        deps.effects.showMissText(target.sprite.x, target.sprite.y - 20);
        playSFX('miss');
      } else {
        deps.effects.showDamageNumber(target.sprite.x, target.sprite.y - 20, damage, isCrit);
        playSFX(isCrit ? 'hit_crit' : 'hit_melee');
      }
      if (target.hp !== undefined) {
        target.hp = Math.max(0, targetHp ?? (target.hp - damage));
      }
    }

    // Combat log + achievement tracking
    const isPlayerAttacker = attackerId === deps.player.getId();
    const isPlayerTarget = targetId === deps.player.getId();
    const targetName = target?.nameText?.text || targetId.slice(0, 8);
    const attackerName = isPlayerAttacker ? 'You' : attackerId.slice(0, 8);

    if (damage === 0) {
      addCombatLog('miss', `${attackerName} missed ${targetName}`);
    } else if (isPlayerAttacker) {
      addCombatLog(isCrit ? 'crit' : 'damage_dealt', `You ${isCrit ? 'critically' : ''} hit ${targetName} for ${damage}`, damage);
    } else if (isPlayerTarget) {
      addCombatLog('damage_taken', `${attackerName} hit you for ${damage}${isCrit ? ' (CRIT!)' : ''}`, damage);
      recordDamageSource(attackerName, damage, 'melee');
    }

    if (isPlayerTarget) {
      if (damage === 0) {
        deps.effects.showMissText(deps.player.sprite.x, deps.player.sprite.y - 55);
      } else {
        deps.effects.showDamageNumber(deps.player.sprite.x, deps.player.sprite.y - 55, damage, isCrit);
        deps.effects.shakeCamera(isCrit ? 0.008 : 0.004, isCrit ? 200 : 100);
      }
    }

    // Track kills
    if (targetHp !== undefined && targetHp <= 0 && isPlayerAttacker) {
      addCombatLog('kill', `You killed ${targetName}!`);
      updateAchievement('first-blood');
      updateAchievement('slayer-10');
      updateAchievement('slayer-100');
      updateAchievement('slayer-1000');
    }
  }));

  deps.register(MessageType.Death, withErrorLogging('Death', (msg) => {
    const { killedBy } = (msg.payload || {}) as { killedBy?: string };
    isDead.value = true;
    deathInfo.value = { killedBy, respawnIn: 5 };
    deps.player.setSelectedEntityId(null);
    deps.effects.showDeathEffect(deps.player.sprite.x, deps.player.sprite.y);
    freezeDeathRecap();
    playSFX('death');
    addCombatLog('death', `You were killed${killedBy ? ` by ${killedBy}` : ''}!`);
    const deathMsg = killedBy
      ? `💀 Killed by ${killedBy}! Respawning at town...`
      : '💀 You died! Respawning at town...';
    addChatMessage('combat', 'System', deathMsg);
  }));

  deps.register(MessageType.ItemDrop, withErrorLogging('ItemDrop', (msg) => {
    const { itemName, rarity } = msg.payload as { itemName: string; rarity: number };
    const rarityNames = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
    addChatMessage('system', 'Loot', `Picked up ${rarityNames[rarity] || ''} ${itemName}`);
    const toastType = rarity >= 3 ? 'warning' : rarity >= 1 ? 'success' : 'info';
    showToast(`${rarityNames[rarity] || ''} ${itemName}`, toastType, '🎒');
    playSFX(rarity >= 3 ? 'loot_rare' : 'loot_pickup');
    // Achievement tracking
    if (rarity >= 2) updateAchievement('loot-rare');
    if (rarity >= 3) updateAchievement('loot-epic');
    if (rarity >= 4) updateAchievement('loot-legendary');
  }));

  deps.register(MessageType.InventoryUpdate, withErrorLogging('InventoryUpdate', (msg) => {
    const payload = msg.payload as InventoryUpdatePayload;
    inventory.value = buildSlottedItemGrid(payload.items, INVENTORY_SLOT_COUNT);

    const equipMap = new Map<EquipmentSlotId, GameItem>();
    for (const { slot, item } of (payload.equipment ?? [])) {
      equipMap.set(slot as EquipmentSlotId, normalizeGameItem(item));
    }
    equipment.value = equipMap;

    if (payload.gold !== undefined) gold.value = payload.gold;
  }));

  deps.register(MessageType.Respawn, withErrorLogging('Respawn', (msg) => {
    const { x, y, hp, maxHp } = msg.payload as {
      x: number;
      y: number;
      hp?: number;
      maxHp?: number;
    };
    deps.player.setPosition({ x, y, targetX: x, targetY: y });
    isDead.value = false;
    deps.player.setSelectedEntityId(null);
    deps.world.clearGroundItems();
    clearDeathRecap();
    if (hp !== undefined) {
      const current = playerStats.value;
      playerStats.value = { ...current, hp, maxHp: maxHp ?? current.maxHp };
    }
    addChatMessage('system', 'System', '✅ You have respawned at town.');
  }));

  deps.register(MessageType.GroundItems, withErrorLogging('GroundItems', (msg) => {
    const { items } = msg.payload as GroundItemsPayload;
    deps.world.updateGroundItems(items);
  }));

  deps.register(MessageType.BankUpdate, withErrorLogging('BankUpdate', (msg) => {
    const { items } = msg.payload as BankUpdatePayload;
    // Convert sparse server array to slotted grid (80 slots)
    bankItems.value = buildSlottedItemGrid(items, 80);
  }));

  deps.register(MessageType.XpOrbPickup, withErrorLogging('XpOrbPickup', (msg) => {
    const { xp, x, y } = msg.payload as { xp: number; x: number; y: number };
    deps.effects.showXpOrbPickup(x, y, xp);
    playSFX('gold');
  }));

  deps.register(MessageType.EffectApplied, withErrorLogging('EffectApplied', (msg) => {
    const { effectType, remainingMs } = msg.payload as { effectType: string; value: number; remainingMs: number; source: string };
    deps.effects.showEffectApplied(effectType);
    addActiveEffect(effectType, remainingMs ?? 10000);
    addChatMessage('combat', 'System', `⚡ ${effectType} effect applied!`);
  }));

  deps.register(MessageType.EffectRemoved, withErrorLogging('EffectRemoved', (msg) => {
    const { effectType } = msg.payload as { effectType: string };
    deps.effects.showEffectRemoved(effectType);
    removeActiveEffect(effectType);
    addChatMessage('combat', 'System', `✅ ${effectType} effect wore off.`);
  }));

  deps.register(MessageType.EffectTick, withErrorLogging('EffectTick', (msg) => {
    const { effectType, value } = msg.payload as { effectType: string; value: number };
    deps.effects.showEffectTick(effectType, value);
  }));

  // ─── Skill result from server ─────────────────────────────
  deps.register(MessageType.SkillResult, withErrorLogging('SkillResult', (msg) => {
    const p = msg.payload as { ok: boolean; error?: string; mana?: number };
    if (!p.ok) {
      addCombatLog('system', `Skill failed: ${p.error ?? 'unknown'}`);
      // Restore mana if server rejected
      if (typeof p.mana === 'number') {
        playerStats.value = { ...playerStats.value, mp: p.mana };
      }
    }
  }));

  // ─── Party updates ────────────────────────────────────────
  deps.register(MessageType.PartyUpdate, withErrorLogging('PartyUpdate', (_msg) => {
    // TODO: wire party data to PartyHUD signals
  }));

  deps.register(MessageType.PartyInvite, withErrorLogging('PartyInvite', (msg) => {
    const { from } = msg.payload as { from: string };
    addChatMessage('system', '', `${from} invited you to a party. Type /party accept to join.`);
  }));

  // ─── Trade handlers ───────────────────────────────────────
  deps.register(MessageType.TradeRequest, withErrorLogging('TradeRequest', (msg) => {
    const { from } = msg.payload as { from: string };
    tradeRequest.value = { from };
    addChatMessage('system', '', `${from} wants to trade with you. Type /trade accept or use the trade notification.`);
    showToast(`💰 ${from} wants to trade!`, 'info');
  }));

  deps.register(MessageType.TradeUpdate, withErrorLogging('TradeUpdate', (msg) => {
    const p = msg.payload as Record<string, unknown>;
    if (p.cancelled) {
      tradeState.value = { active: false, itemsA: [], itemsB: [], goldA: 0, goldB: 0, confirmedA: false, confirmedB: false };
      showToast('Trade cancelled.', 'warning');
      return;
    }
    if (p.completed) {
      tradeState.value = { active: false, itemsA: [], itemsB: [], goldA: 0, goldB: 0, confirmedA: false, confirmedB: false };
      showToast('Trade completed!', 'success');
      playSFX('gold');
      return;
    }
    tradeState.value = {
      active: true,
      tradeId: p.tradeId as string,
      playerA: p.playerA as string,
      playerB: p.playerB as string,
      itemsA: p.itemsA as number[],
      itemsB: p.itemsB as number[],
      goldA: p.goldA as number,
      goldB: p.goldB as number,
      confirmedA: p.confirmedA as boolean,
      confirmedB: p.confirmedB as boolean,
    };
  }));

  // ─── Chat message handler ────────────────────────────────────
  deps.register(MessageType.ChatMessage, withErrorLogging('ChatMessage', (msg) => {
    const { sender, text, channel } = msg.payload as { sender: string; text: string; channel: string };
    addChatMessage((channel || 'global') as any, sender || '', text || '');
  }));

  // ─── Quest update handler ──────────────────────────────────
  deps.register(MessageType.QuestUpdate, withErrorLogging('QuestUpdate', (msg) => {
    const { activeQuests: quests } = msg.payload as {
      activeQuests: Array<{
        id: string; title: string; icon: string; status: string;
        objectives: Array<{ description: string; current: number; target: number }>;
        rewardXp: number; rewardGold: number;
      }>;
    };

    const mapped: Quest[] = (quests || []).map(q => ({
      id: q.id,
      title: q.title,
      description: '',
      giver: 'NPC',
      icon: q.icon || '📜',
      objectives: (q.objectives || []).map(o => ({
        description: o.description,
        current: o.current,
        target: o.target,
        completed: o.current >= o.target,
      })),
      rewards: { xp: q.rewardXp, gold: q.rewardGold },
      status: q.status as 'active' | 'completed' | 'turnIn',
    }));

    activeQuests.value = mapped;

    // Check for newly completeable quests
    for (const q of mapped) {
      if (q.status === 'turnIn') {
        showToast(`📜 Quest "${q.title}" ready to turn in!`, 'success');
      }
    }
  }));

  // ─── Quest list handler ────────────────────────────────────
  deps.register(MessageType.QuestList, withErrorLogging('QuestList', (msg) => {
    const p = msg.payload as {
      available: Array<{
        id: string; title: string; description: string; icon: string; minLevel: number;
        objectives: Array<{ description: string; count: number }>;
        rewardXp: number; rewardGold: number;
      }>;
      active: Array<{
        id: string; title: string; description: string; icon: string; status: string;
        objectives: Array<{ description: string; current: number; target: number }>;
        rewardXp: number; rewardGold: number;
      }>;
      completed: Array<{ id: string; title: string; icon: string }>;
    };

    // Store in a global for the QuestPanel to read
    (window as any).__questListData = p;
    // Also update active quests signal
    const mapped: Quest[] = (p.active || []).map(q => ({
      id: q.id,
      title: q.title,
      description: q.description || '',
      giver: 'NPC',
      icon: q.icon || '📜',
      objectives: (q.objectives || []).map(o => ({
        description: o.description,
        current: o.current,
        target: o.target,
        completed: o.current >= o.target,
      })),
      rewards: { xp: q.rewardXp, gold: q.rewardGold },
      status: q.status as 'active' | 'completed' | 'turnIn',
    }));
    activeQuests.value = mapped;
  }));

  // ─── Achievement unlock handler ────────────────────────────
  deps.register(MessageType.AchievementUnlock, withErrorLogging('AchievementUnlock', (msg) => {
    const p = msg.payload as { id: string; title: string; description: string; icon: string; category: string };
    showToast(`🏆 Achievement Unlocked: ${p.icon} ${p.title}`, 'warning');
    playSFX('achievement');
    // Update achievement panel state
    setAchievementProgress(p.id, 999); // Mark as complete
  }));

  // ─── World boss handlers ───────────────────────────────────
  deps.register(MessageType.WorldBossSpawn, withErrorLogging('WorldBossSpawn', (msg) => {
    const p = msg.payload as { name: string; title: string; x: number; y: number; level: number };
    showToast(`⚠️ WORLD BOSS: ${p.name} ${p.title} has appeared! (Lv.${p.level})`, 'warning');
    playSFX('achievement');
    addChatMessage('global', 'System', `⚠️ World Boss "${p.name} ${p.title}" has spawned at (${Math.round(p.x)}, ${Math.round(p.y)})!`);
  }));

  deps.register(MessageType.WorldBossDeath, withErrorLogging('WorldBossDeath', (msg) => {
    const p = msg.payload as { name: string; killerName: string };
    showToast(`👑 World Boss ${p.name} has been defeated!`, 'warning');
    addChatMessage('global', 'System', `👑 World Boss "${p.name}" has been defeated by ${p.killerName}!`);
  }));

  // ─── NPC Dialogue handler ─────────────────────────────────
  deps.register(MessageType.NpcDialogue, withErrorLogging('NpcDialogue', (msg) => {
    const p = msg.payload as { npcId: string; dialogue: { npcName: string; portrait: string; lines: string[]; actions: Array<{ label: string; action: string }> } };
    const d = p.dialogue;
    npcDialogue.value = {
      id: p.npcId,
      speaker: d.npcName,
      portrait: d.portrait,
      text: d.lines.join('\n'),
      choices: d.actions.map(a => ({
        text: a.label,
        nextNodeId: null,
        action: a.action,
      })),
    };
  }));

  // ─── Skill Tree Data handler ──────────────────────────────
  deps.register(MessageType.SkillTreeData, withErrorLogging('SkillTreeData', (msg) => {
    const p = msg.payload as { unlocked?: string[]; skillPoints?: number; message?: string; class?: string; nodes?: unknown[] };
    (window as any).__skillTreeData = p;
    console.log('[SkillTree] Data received:', p);
    if (p.message) {
      addChatMessage('system', 'System', p.message);
    }
  }));

  // ─── Guild Data handler ────────────────────────────────────
  deps.register(MessageType.GuildData, withErrorLogging('GuildData', (msg) => {
    const p = msg.payload as { guild?: any };
    guildInfo.value = p?.guild ?? null;
  }));

  // ─── Guild Chat handler ────────────────────────────────────
  deps.register(MessageType.GuildChat, withErrorLogging('GuildChat', (msg) => {
    const p = msg.payload as { sender: string; text: string };
    addChatMessage('guild', p.sender, p.text);
  }));

  // ─── Enchant Result handler ───────────────────────────────
  deps.register(MessageType.EnchantResult, withErrorLogging('EnchantResult', (msg) => {
    const p = msg.payload as { success: boolean; itemName?: string; newLevel?: number; message?: string };
    if (p.message) {
      addChatMessage('system', 'System', p.message);
    }
    if (p.success) {
      showToast(`✨ Enchant success! ${p.itemName} +${p.newLevel}`, 'success');
      playSFX('achievement');
    } else {
      showToast(`💥 Enchant failed!`, 'danger');
      playSFX('error');
    }
  }));

  // ─── Fishing Result handler ───────────────────────────────
  deps.register(MessageType.FishingResult, withErrorLogging('FishingResult', (msg) => {
    const p = msg.payload as import('../../store/GameStore').FishingResult;
    lastFishingResult.value = p;
    isFishing.value = false;
    if (p.success) {
      const rarityColors: Record<string, string> = { Common: '⚪', Uncommon: '🟢', Rare: '🔵', Epic: '🟣' };
      showToast(`${p.icon} Caught ${rarityColors[p.rarity] || ''} ${p.catch}! (${p.value}g)`, 'success');
      playSFX('loot_pickup');
    }
  }));

  // ─── Faction Data handler ─────────────────────────────────
  deps.register(MessageType.FactionData, withErrorLogging('FactionData', (msg) => {
    const p = msg.payload as { factions: import('../../store/GameStore').FactionInfo[] };
    factions.value = p.factions ?? [];
  }));
}
