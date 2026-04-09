use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::collections::HashMap;
use std::collections::HashSet;
use rand::Rng;

// ─── Message Types ───────────────────────────────────────────
// Client → Server
pub const MSG_AUTH: u8 = 1;
pub const MSG_MOVE: u8 = 2;
pub const MSG_CHAT: u8 = 3;
pub const MSG_ATTACK: u8 = 4;
pub const MSG_PICKUP_ITEM: u8 = 5;
pub const MSG_USE_ITEM: u8 = 6;
pub const MSG_EQUIP_ITEM: u8 = 7;
pub const MSG_UNEQUIP_ITEM: u8 = 8;
pub const MSG_BANK_DEPOSIT: u8 = 9;
pub const MSG_BANK_WITHDRAW: u8 = 10;
pub const MSG_ATTACK_PLAYER: u8 = 11;
pub const MSG_REQUEST_CHUNK: u8 = 12;
pub const MSG_ALLOCATE_STATS: u8 = 13;
pub const MSG_SELECT_CLASS: u8 = 14;
pub const MSG_USE_SKILL: u8 = 15;
pub const MSG_PARTY_ACTION: u8 = 16;
pub const MSG_CHAT_COMMAND: u8 = 17;
pub const MSG_TRADE_ACTION: u8 = 18;
pub const MSG_QUEST_ACCEPT: u8 = 20;   // Client → Server: accept a quest
pub const MSG_QUEST_TURN_IN: u8 = 21;  // Client → Server: turn in a completed quest
pub const MSG_QUEST_LIST_REQUEST: u8 = 22; // Client → Server: request quest list
pub const MSG_NPC_INTERACT: u8 = 23;   // Client → Server: interact with NPC
pub const MSG_SKILL_TREE_UNLOCK: u8 = 24;  // Client → Server: unlock a skill tree node
pub const MSG_SKILL_TREE_REQUEST: u8 = 25;  // Client → Server: request skill tree data
pub const MSG_GUILD_ACTION: u8 = 26;        // Client → Server: guild actions (create, invite, etc.)
pub const MSG_ENCHANT_ITEM: u8 = 27;        // Client → Server: enchant an item
pub const MSG_FISHING_ACTION: u8 = 28;      // Client → Server: start/reel fishing
pub const MSG_FACTION_ACTION: u8 = 29;      // Client → Server: faction join/leave/info

// Server → Client
pub const MSG_AUTH_RESULT: u8 = 50;
pub const MSG_PLAYER_JOINED: u8 = 51;
pub const MSG_PLAYER_LEFT: u8 = 52;
pub const MSG_ENTITY_UPDATE: u8 = 53;
pub const MSG_CHUNK_DATA: u8 = 54;
pub const MSG_CHAT_MESSAGE: u8 = 55;
pub const MSG_COMBAT_EVENT: u8 = 56;
pub const MSG_ITEM_DROP: u8 = 57;
pub const MSG_INVENTORY_UPDATE: u8 = 58;
pub const MSG_STATS_UPDATE: u8 = 59;
pub const MSG_LEVEL_UP: u8 = 60;
pub const MSG_DEATH: u8 = 61;
pub const MSG_RESPAWN: u8 = 62;
pub const MSG_GROUND_ITEMS: u8 = 63;
pub const MSG_BANK_UPDATE: u8 = 64;
pub const MSG_XP_ORB_PICKUP: u8 = 65;
pub const MSG_EFFECT_APPLIED: u8 = 66;
pub const MSG_EFFECT_REMOVED: u8 = 67;
pub const MSG_EFFECT_TICK: u8 = 68;
pub const MSG_SKILL_RESULT: u8 = 69;
pub const MSG_PARTY_UPDATE: u8 = 70;
pub const MSG_PARTY_INVITE: u8 = 71;
pub const MSG_TRADE_REQUEST: u8 = 72;
pub const MSG_TRADE_UPDATE: u8 = 73;
pub const MSG_QUEST_UPDATE: u8 = 80;   // Server → Client: quest progress update
pub const MSG_QUEST_LIST: u8 = 81;     // Server → Client: available/active/completed quests
pub const MSG_ACHIEVEMENT_UNLOCK: u8 = 82; // Server → Client: achievement unlocked
pub const MSG_WORLD_BOSS_SPAWN: u8 = 83;   // Server → Client: world boss spawned
pub const MSG_WORLD_BOSS_DEATH: u8 = 84;   // Server → Client: world boss defeated
pub const MSG_NPC_DIALOGUE: u8 = 85;       // Server → Client: NPC dialogue data
pub const MSG_SKILL_TREE_DATA: u8 = 86;    // Server → Client: skill tree state
pub const MSG_GUILD_DATA: u8 = 87;         // Server → Client: guild info update
pub const MSG_GUILD_CHAT: u8 = 88;         // Server → Client: guild chat message
pub const MSG_ENCHANT_RESULT: u8 = 89;      // Server → Client: enchant result
pub const MSG_FISHING_RESULT: u8 = 90;      // Server → Client: fishing catch result
pub const MSG_FACTION_DATA: u8 = 91;        // Server → Client: faction rep/info

// ─── Message Envelope ────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameMessage {
    #[serde(rename = "type")]
    pub msg_type: u8,
    pub payload: serde_json::Value,
}

// ─── Auth ────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct AuthPayload {
    pub username: String,
    pub password: String,
    #[serde(rename = "isRegister")]
    pub is_register: bool,
    #[serde(default)]
    pub class: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthResult {
    pub success: bool,
    #[serde(rename = "playerId")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ─── Movement ────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct MovePayload {
    #[serde(rename = "targetX")]
    pub target_x: f64,
    #[serde(rename = "targetY")]
    pub target_y: f64,
    pub seq: u32,
}

// ─── Chat ────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct ChatPayload {
    pub text: String,
    #[serde(default = "default_channel")]
    pub channel: String,
}

fn default_channel() -> String {
    "global".to_string()
}

// ─── Stat Allocation ─────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct AllocateStatsPayload {
    pub allocations: HashMap<String, u32>, // e.g. {"vitality": 2, "strength": 1}
}

// Stat allocation constants — points per allocation
pub const STAT_VITALITY_HP: i32 = 12;   // +12 maxHP per point
pub const STAT_ENDURANCE_MP: i32 = 8;   // +8 maxMP per point
pub const STAT_STRENGTH_ATK: i32 = 3;   // +3 ATK per point
pub const STAT_FORTITUDE_DEF: i32 = 3;  // +3 DEF per point
pub const STAT_AGILITY_SPD: i32 = 2;    // +2 SPD per point
pub const STAT_FORTUNE_LCK: i32 = 2;    // +2 LCK per point

pub const VALID_STATS: &[&str] = &["vitality", "endurance", "strength", "fortitude", "agility", "fortune"];

#[derive(Debug, Serialize)]
pub struct ChatMessageOut {
    pub sender: String,
    pub text: String,
    pub channel: String,
}

// ─── Entity State (broadcast to clients) ─────────────────────
#[derive(Debug, Serialize, Clone)]
pub struct EntityState {
    pub id: String,
    #[serde(rename = "entityType")]
    pub entity_type: String,
    pub x: f64,
    pub y: f64,
    #[serde(rename = "targetX")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_x: Option<f64>,
    #[serde(rename = "targetY")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hp: Option<i32>,
    #[serde(rename = "maxHp")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_hp: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<u8>,
}

// ─── Chunk Data ──────────────────────────────────────────────
#[derive(Debug, Serialize, Clone)]
pub struct ChunkData {
    #[serde(rename = "chunkX")]
    pub chunk_x: i32,
    #[serde(rename = "chunkY")]
    pub chunk_y: i32,
    pub tiles: Vec<Vec<u8>>,
    pub biome: String,
}

// ─── Quest System ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveQuest {
    pub quest_id: String,
    pub objectives_progress: Vec<u32>, // current count per objective
    pub status: String,                // "active", "turnIn", "completed"
}

#[derive(Debug, Clone, Default)]
pub struct StatsTracker {
    pub enemies_killed: u32,
    pub enemies_killed_by_type: HashMap<String, u32>, // lowercase keyword -> count
    pub items_crafted: u32,
    pub items_collected: u32,
    pub gold_earned: u64,
    pub gold_spent: u64,
    pub deaths: u32,
    pub biomes_visited: HashSet<String>,
    pub quests_completed: u32,
    pub boss_kills: u32,
    pub champion_kills: u32,
    pub elite_kills: u32,
    pub pvp_kills: u32,
    pub trades_completed: u32,
    pub highest_hit: i32,
}

// ─── Guild Data ──────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuildData {
    pub id: Uuid,
    pub name: String,
    pub tag: String, // 2-4 char tag like [RF]
    pub leader_id: Uuid,
    pub officers: Vec<Uuid>,
    pub members: Vec<Uuid>, // all members including leader and officers
    pub created_at: u64,
    pub level: u32,
    pub xp: u64,
    pub motd: String,
    pub bank_gold: u64,
}

// ─── Player Data ─────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct PlayerData {
    pub id: Uuid,
    pub username: String,
    pub x: f64,
    pub y: f64,
    pub target_x: f64,
    pub target_y: f64,
    pub hp: i32,
    pub max_hp: i32,
    pub mp: i32,
    pub max_mp: i32,
    pub level: u32,
    pub xp: u64,
    pub atk: i32,
    pub def: i32,
    pub spd: i32,
    pub lck: i32,
    pub gold: u64,
    pub inventory: Vec<Option<Item>>,
    pub equipment: HashMap<String, Item>,
    pub bank: Vec<Option<Item>>,
    pub dead: bool,
    pub respawn_timer: f64,
    pub pvp_protection: bool, // true if level < 10
    pub stat_points: u32,     // unspent stat points
    pub class: String,        // warrior, mage, ranger, rogue
    pub active_effects: Vec<ActiveEffect>,
    // Quest & Achievement tracking
    pub active_quests: Vec<ActiveQuest>,
    pub completed_quests: Vec<String>,
    pub achievements: Vec<String>,   // unlocked achievement IDs
    pub achievement_progress: HashMap<String, u32>, // achievement_id -> progress count
    pub stats_tracker: StatsTracker, // lifetime stats for achievements/quests
    pub skill_tree_unlocked: Vec<String>,  // unlocked skill tree node IDs
    pub skill_points: u32,                 // available skill tree points (1 per level)
    // Guild
    pub guild_id: Option<Uuid>,
    pub guild_name: Option<String>,
    pub guild_rank: String,  // "leader", "officer", "member", ""
    // Factions/Reputation
    pub faction_rep: HashMap<String, i32>, // faction_id -> reputation points
    // Titles
    pub active_title: String,
    pub unlocked_titles: Vec<String>,
    // Fishing stats
    pub fish_caught: u32,
    // Daily login
    pub last_login_day: u32,  // day counter for daily rewards
    pub login_streak: u32,
}

impl PlayerData {
    pub fn new(username: String) -> Self {
        Self::new_with_class(username, "warrior".to_string())
    }

    pub fn new_with_class(username: String, class: String) -> Self {
        let id = Uuid::new_v4();
        // Give starter items
        let mut inventory = vec![None; 40]; // 8x5 grid
        inventory[0] = Some(Item::new_weapon("Wooden Sword", 0, 1, 3));
        inventory[1] = Some(Item::new_armor("Cloth Shirt", "armor", 0, 1, 2));
        inventory[2] = Some(Item::new_consumable("Health Potion", 0, 5));
        inventory[3] = Some(Item::new_consumable("Health Potion", 0, 5));

        // Base stats
        let (mut hp, mut mp, mut atk, mut def, mut spd, mut lck) = (200, 80, 15, 10, 12, 5);

        // Class bonuses
        match class.as_str() {
            "warrior" => { hp += 40; atk += 5; def += 8; }
            "mage"    => { mp += 40; lck += 5; spd += 3; hp -= 20; }
            "ranger"  => { hp += 10; atk += 3; spd += 6; lck += 3; }
            "rogue"   => { atk += 5; spd += 5; lck += 6; def -= 2; }
            _         => {} // default/unknown = no bonus
        }

        Self {
            id,
            username,
            x: 0.0, y: 0.0,
            target_x: 0.0, target_y: 0.0,
            hp, max_hp: hp,
            mp, max_mp: mp,
            level: 1, xp: 0,
            atk, def, spd, lck,
            gold: 100,
            inventory,
            equipment: HashMap::new(),
            bank: vec![None; 80],
            dead: false,
            respawn_timer: 0.0,
            pvp_protection: true,
            stat_points: 5, // starting stat points for customization
            class,
            active_effects: Vec::new(),
            active_quests: Vec::new(),
            completed_quests: Vec::new(),
            achievements: Vec::new(),
            achievement_progress: HashMap::new(),
            stats_tracker: StatsTracker::default(),
            skill_tree_unlocked: Vec::new(),
            skill_points: 0,
            guild_id: None,
            guild_name: None,
            guild_rank: String::new(),
            faction_rep: HashMap::new(),
            active_title: String::new(),
            unlocked_titles: Vec::new(),
            fish_caught: 0,
            last_login_day: 0,
            login_streak: 0,
        }
    }

    pub fn to_entity_state(&self) -> EntityState {
        EntityState {
            id: self.id.to_string(),
            entity_type: "player".to_string(),
            x: self.x, y: self.y,
            target_x: Some(self.target_x),
            target_y: Some(self.target_y),
            hp: Some(self.hp),
            max_hp: Some(self.max_hp),
            level: Some(self.level),
            name: Some(self.username.clone()),
            direction: None,
        }
    }

    pub fn xp_to_next_level(&self) -> u64 {
        let level = self.level as f64;
        // Infinite scaling: base * level^2.5 * (1 + level/100) * log(level+1)
        let base_xp = 100.0 * level.powf(2.5);
        let linear_scaling = 1.0 + level / 100.0;
        let log_scaling = (level + 1.0).ln().max(1.0);
        (base_xp * linear_scaling * log_scaling) as u64
    }

    /// Total ATK including equipment bonuses
    pub fn total_atk(&self) -> i32 {
        let equip_bonus: i32 = self.equipment.values()
            .filter_map(|item| item.stats.get("ATK"))
            .sum();
        let set_bonus: i32 = calculate_set_bonuses(&self.equipment).iter()
            .flat_map(|(_, _, bonuses)| bonuses.iter())
            .filter(|(_, stat, _)| *stat == "ATK")
            .map(|(_, _, val)| val)
            .sum();
        self.atk + equip_bonus + set_bonus
    }

    /// Total DEF including equipment bonuses
    pub fn total_def(&self) -> i32 {
        let equip_bonus: i32 = self.equipment.values()
            .filter_map(|item| item.stats.get("DEF"))
            .sum();
        let set_bonus: i32 = calculate_set_bonuses(&self.equipment).iter()
            .flat_map(|(_, _, bonuses)| bonuses.iter())
            .filter(|(_, stat, _)| *stat == "DEF")
            .map(|(_, _, val)| val)
            .sum();
        self.def + equip_bonus + set_bonus
    }

    pub fn total_lck(&self) -> i32 {
        let equip_bonus: i32 = self.equipment.values()
            .filter_map(|item| item.stats.get("LCK"))
            .sum();
        let set_bonus: i32 = calculate_set_bonuses(&self.equipment).iter()
            .flat_map(|(_, _, bonuses)| bonuses.iter())
            .filter(|(_, stat, _)| *stat == "LCK")
            .map(|(_, _, val)| val)
            .sum();
        self.lck + equip_bonus + set_bonus
    }

    pub fn total_hp_bonus(&self) -> i32 {
        let equip_bonus: i32 = self.equipment.values()
            .filter_map(|item| item.stats.get("HP"))
            .sum();
        let set_bonus: i32 = calculate_set_bonuses(&self.equipment).iter()
            .flat_map(|(_, _, bonuses)| bonuses.iter())
            .filter(|(_, stat, _)| *stat == "HP")
            .map(|(_, _, val)| val)
            .sum();
        equip_bonus + set_bonus
    }

    pub fn total_mp_bonus(&self) -> i32 {
        let equip_bonus: i32 = self.equipment.values()
            .filter_map(|item| item.stats.get("MP"))
            .sum();
        let set_bonus: i32 = calculate_set_bonuses(&self.equipment).iter()
            .flat_map(|(_, _, bonuses)| bonuses.iter())
            .filter(|(_, stat, _)| *stat == "MP")
            .map(|(_, _, val)| val)
            .sum();
        equip_bonus + set_bonus
    }

    pub fn total_spd_bonus(&self) -> i32 {
        let equip_bonus: i32 = self.equipment.values()
            .filter_map(|item| item.stats.get("SPD"))
            .sum();
        let set_bonus: i32 = calculate_set_bonuses(&self.equipment).iter()
            .flat_map(|(_, _, bonuses)| bonuses.iter())
            .filter(|(_, stat, _)| *stat == "SPD")
            .map(|(_, _, val)| val)
            .sum();
        equip_bonus + set_bonus
    }

    /// Try to add item to first free inventory slot. Returns false if full.
    pub fn add_item(&mut self, item: Item) -> bool {
        // Try to stack with existing item if stackable
        if item.stackable {
            for slot in self.inventory.iter_mut().flatten() {
                if slot.template_id == item.template_id && slot.stackable {
                    slot.quantity += item.quantity;
                    return true;
                }
            }
        }
        // Find first empty slot
        for slot in self.inventory.iter_mut() {
            if slot.is_none() {
                *slot = Some(item);
                return true;
            }
        }
        false // inventory full
    }

    /// Get serializable inventory for client
    pub fn inventory_payload(&self) -> Vec<serde_json::Value> {
        self.inventory.iter().enumerate().filter_map(|(i, slot)| {
            slot.as_ref().map(|item| item.to_slotted_payload(i))
        }).collect()
    }

    /// Get serializable bank for client
    pub fn bank_payload(&self) -> Vec<serde_json::Value> {
        self.bank.iter().enumerate().filter_map(|(i, slot)| {
            slot.as_ref().map(|item| item.to_slotted_payload(i))
        }).collect()
    }

    /// Apply a status effect, replacing existing effect of same type if new one is stronger
    pub fn apply_effect(&mut self, effect: ActiveEffect) {
        // Replace existing effect of same type if new duration/value is greater
        if let Some(existing) = self.active_effects.iter_mut().find(|e| e.effect_type == effect.effect_type) {
            if effect.remaining_ticks >= existing.remaining_ticks || effect.value.abs() > existing.value.abs() {
                *existing = effect;
            }
            return;
        }
        self.active_effects.push(effect);
    }

    /// Remove all effects of a given type
    pub fn remove_effect(&mut self, effect_type: &StatusEffectType) {
        self.active_effects.retain(|e| &e.effect_type != effect_type);
    }

    /// Check if player has a specific effect
    pub fn has_effect(&self, effect_type: &StatusEffectType) -> bool {
        self.active_effects.iter().any(|e| e.effect_type == *effect_type)
    }

    /// Get total ATK modifier from active effects
    pub fn effect_atk_modifier(&self) -> i32 {
        let mut modifier = 0;
        for effect in &self.active_effects {
            match effect.effect_type {
                StatusEffectType::Strength => modifier += effect.value,
                StatusEffectType::Weakness => modifier -= effect.value,
                _ => {}
            }
        }
        modifier
    }

    /// Get total DEF modifier from active effects
    pub fn effect_def_modifier(&self) -> i32 {
        let mut modifier = 0;
        for effect in &self.active_effects {
            match effect.effect_type {
                StatusEffectType::ArmorBreak => modifier -= effect.value,
                _ => {}
            }
        }
        modifier
    }

    /// Get movement speed multiplier from effects (1.0 = normal)
    pub fn effect_speed_multiplier(&self) -> f64 {
        let mut mult = 1.0;
        for effect in &self.active_effects {
            match effect.effect_type {
                StatusEffectType::Freeze => mult *= 0.4,
                StatusEffectType::Haste => mult *= 1.5,
                StatusEffectType::Stun => mult *= 0.0,
                _ => {}
            }
        }
        mult
    }

    /// Get active effects as payload for client
    pub fn effects_payload(&self) -> Vec<serde_json::Value> {
        self.active_effects.iter().map(|e| e.to_payload()).collect()
    }
}

// ─── Enemy Data ──────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum EnemyRank {
    Normal,    // No modifiers (70%)
    Champion,  // 1 modifier (20%)
    Elite,     // 2-3 modifiers (8%)
    Boss,      // Unique modifiers + extra loot (2%)
}

#[derive(Debug, Clone, PartialEq)]
pub enum EnemyModifier {
    Enraged,     // +50% ATK, +30% SPD, -20% DEF
    Armored,     // +80% DEF, -20% SPD
    Vampiric,    // Heals 15% of damage dealt
    Explosive,   // AOE damage on death
    Summoner,    // Spawns minions (unused for now)
    Regenerator, // +5% HP/s
    Reflector,   // 20% damage reflected
    Swift,       // +60% SPD
    Thorns,      // Deals flat damage back
    Freezing,    // Slows players
    Burning,     // DoT fire damage
    Teleporter,  // Blinks around
    Shielded,    // Periodic invulnerability
    Berserker,   // Gets stronger at low HP
    Draining,    // Steals MP
    Poisonous,   // Applies poison DoT
    Undying,     // Revives once
}

pub const ALL_MODIFIERS: &[EnemyModifier] = &[
    EnemyModifier::Enraged,
    EnemyModifier::Armored,
    EnemyModifier::Vampiric,
    EnemyModifier::Explosive,
    EnemyModifier::Summoner,
    EnemyModifier::Regenerator,
    EnemyModifier::Reflector,
    EnemyModifier::Swift,
    EnemyModifier::Thorns,
    EnemyModifier::Freezing,
    EnemyModifier::Burning,
    EnemyModifier::Teleporter,
    EnemyModifier::Shielded,
    EnemyModifier::Berserker,
    EnemyModifier::Draining,
    EnemyModifier::Poisonous,
    EnemyModifier::Undying,
];

#[derive(Debug, Clone)]
pub struct EnemyData {
    pub id: Uuid,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub hp: i32,
    pub max_hp: i32,
    pub level: u32,
    pub atk: i32,
    pub def: i32,
    pub xp_reward: u64,
    pub patrol_center_x: f64,
    pub patrol_center_y: f64,
    pub patrol_radius: f64,
    pub aggro_range: f64,
    pub state: EnemyState,
    pub target_player: Option<Uuid>,
    pub rank: EnemyRank,
    pub modifiers: Vec<EnemyModifier>,
    pub attack_cooldown: f64,
    pub flee_cooldown: f64, // ticks before enemy can re-aggro after fleeing
}

#[derive(Debug, Clone, PartialEq)]
pub enum EnemyState {
    Idle,
    Patrol,
    Chase,
    Attack,
    Dead,
    Flee,   // retreating away from town safe zone
}

// ─── Status Effects ──────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum StatusEffectType {
    Poison,       // DoT damage over time (green)
    Burn,         // DoT fire damage (orange)
    Bleed,        // DoT physical damage (red)
    Freeze,       // Slow movement speed (ice blue)
    Stun,         // Cannot move or attack (yellow)
    Weakness,     // Reduced ATK (purple)
    ArmorBreak,   // Reduced DEF (brown)
    Regen,        // Heal over time (green glow)
    Strength,     // Increased ATK (red glow)
    Shield,       // Damage absorption (blue glow)
    Haste,        // Increased movement speed (cyan)
    Lifesteal,    // Heal % of damage dealt (crimson)
    Thorns,       // Reflect damage back (gold)
    Invulnerable, // Cannot take damage (white glow)
}

#[derive(Debug, Clone)]
pub struct ActiveEffect {
    pub effect_type: StatusEffectType,
    pub value: i32,            // damage per tick, heal per tick, stat modifier amount, etc
    pub remaining_ticks: u32,  // ticks remaining (20 ticks = 1 second)
    pub tick_interval: u32,    // apply value every N ticks (e.g., 20 = once per second)
    pub ticks_since_last: u32, // counter for tick_interval
    pub source: String,        // "enemy", "potion", "aura", etc
}

impl ActiveEffect {
    pub fn new(effect_type: StatusEffectType, value: i32, duration_ticks: u32, tick_interval: u32, source: &str) -> Self {
        Self {
            effect_type,
            value,
            remaining_ticks: duration_ticks,
            tick_interval,
            ticks_since_last: 0,
            source: source.to_string(),
        }
    }

    /// Returns true if this effect should apply its value this tick
    pub fn should_tick(&self) -> bool {
        self.ticks_since_last >= self.tick_interval
    }

    /// Advance the effect by one game tick. Returns true if expired.
    pub fn advance(&mut self) -> bool {
        if self.remaining_ticks == 0 {
            return true;
        }
        self.remaining_ticks -= 1;
        self.ticks_since_last += 1;
        if self.ticks_since_last >= self.tick_interval {
            self.ticks_since_last = 0;
        }
        self.remaining_ticks == 0
    }

    pub fn to_payload(&self) -> serde_json::Value {
        serde_json::json!({
            "effectType": format!("{:?}", self.effect_type),
            "value": self.value,
            "remainingMs": self.remaining_ticks * 50, // 50ms per tick
            "source": self.source,
        })
    }
}

impl EnemyData {
    pub fn to_entity_state(&self) -> EntityState {
        let rank_prefix = match self.rank {
            EnemyRank::Normal => String::new(),
            EnemyRank::Champion => "⭐ ".to_string(),
            EnemyRank::Elite => "💎 ".to_string(),
            EnemyRank::Boss => "👑 ".to_string(),
        };
        EntityState {
            id: self.id.to_string(),
            entity_type: "enemy".to_string(),
            x: self.x,
            y: self.y,
            target_x: None,
            target_y: None,
            hp: Some(self.hp),
            max_hp: Some(self.max_hp),
            level: Some(self.level),
            name: Some(format!("{}{}", rank_prefix, self.name)),
            direction: None,
        }
    }
}

// ─── Item System ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id: String,           // unique instance id
    pub template_id: String,  // e.g. "iron_sword"
    pub name: String,
    pub rarity: u8,           // 0-5
    pub item_type: ItemType,
    pub slot: Option<String>, // equipment slot
    pub stackable: bool,
    pub quantity: u32,
    pub level: u32,
    pub stats: HashMap<String, i32>,
    pub description: String,
    pub affixes: Vec<String>,
    #[serde(default)]
    pub enchant_level: u8,    // 0-10, enchantment upgrade level
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ItemType {
    Weapon,
    Armor,
    Consumable,
    Material,
    Misc,
}

impl Item {
    pub fn new_weapon(name: &str, rarity: u8, level: u32, atk: i32) -> Self {
        let mut stats = HashMap::new();
        stats.insert("ATK".into(), atk);
        Self {
            id: Uuid::new_v4().to_string(),
            template_id: name.to_lowercase().replace(' ', "_"),
            name: name.into(),
            rarity,
            item_type: ItemType::Weapon,
            slot: Some("weapon".into()),
            stackable: false,
            quantity: 1,
            level,
            stats,
            description: format!("A level {} weapon", level),
            affixes: vec![],
            enchant_level: 0,
        }
    }

    pub fn new_armor(name: &str, slot: &str, rarity: u8, level: u32, def: i32) -> Self {
        let mut stats = HashMap::new();
        stats.insert("DEF".into(), def);
        Self {
            id: Uuid::new_v4().to_string(),
            template_id: name.to_lowercase().replace(' ', "_"),
            name: name.into(),
            rarity,
            item_type: ItemType::Armor,
            slot: Some(slot.into()),
            stackable: false,
            quantity: 1,
            level,
            stats,
            description: format!("A level {} armor piece", level),
            affixes: vec![],
            enchant_level: 0,
        }
    }

    pub fn new_consumable(name: &str, rarity: u8, quantity: u32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            template_id: name.to_lowercase().replace(' ', "_"),
            name: name.into(),
            rarity,
            item_type: ItemType::Consumable,
            slot: None,
            stackable: true,
            quantity,
            level: 0,
            stats: HashMap::new(),
            description: "Consumable item".into(),
            affixes: vec![],
            enchant_level: 0,
        }
    }

    pub fn new_material(name: &str, rarity: u8, quantity: u32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            template_id: name.to_lowercase().replace(' ', "_"),
            name: name.into(),
            rarity,
            item_type: ItemType::Material,
            slot: None,
            stackable: true,
            quantity,
            level: 0,
            stats: HashMap::new(),
            description: "Crafting material".into(),
            affixes: vec![],
            enchant_level: 0,
        }
    }

    pub fn to_payload(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "templateId": self.template_id,
            "name": self.name,
            "rarity": self.rarity,
            "itemType": format!("{:?}", self.item_type),
            "slot": self.slot,
            "stackable": self.stackable,
            "quantity": self.quantity,
            "level": self.level,
            "stats": self.stats,
            "description": self.description,
            "affixes": self.affixes,
            "enchantLevel": self.enchant_level,
        })
    }

    pub fn to_slotted_payload(&self, slot_index: usize) -> serde_json::Value {
        let mut payload = self.to_payload();

        if let Some(object) = payload.as_object_mut() {
            object.insert("slotIndex".to_string(), serde_json::json!(slot_index));
        }

        payload
    }
}

// ─── Ground Items (dropped on death or from enemies) ─────────

#[derive(Debug, Clone)]
pub struct GroundItem {
    pub id: Uuid,
    pub item: Item,
    pub x: f64,
    pub y: f64,
    pub owner_id: Option<Uuid>, // original owner (pickup priority)
    pub drop_time: f64,          // game tick when dropped
    pub protection_duration: f64, // ticks of owner-only pickup
}

// ─── Loot Table ──────────────────────────────────────────────

const RARITY_WEIGHTS: [f64; 6] = [0.60, 0.25, 0.10, 0.04, 0.009, 0.001];
const RARITY_STAT_MULT: [f64; 6] = [1.0, 1.3, 1.7, 2.2, 3.0, 5.0];

const WEAPON_TEMPLATES: &[(&str, &str)] = &[
    ("Wooden Sword", "weapon"),
    ("Iron Sword", "weapon"),
    ("Steel Blade", "weapon"),
    ("War Axe", "weapon"),
    ("Magic Staff", "weapon"),
    ("Crystal Dagger", "weapon"),
    ("Shadow Bow", "weapon"),
    ("Flame Mace", "weapon"),
    ("Mithril Rapier", "weapon"),
    ("Dragon Fang", "weapon"),
    ("Thunder Hammer", "weapon"),
    ("Void Scythe", "weapon"),
    ("Blessed Spear", "weapon"),
    ("Frost Wand", "weapon"),
    ("Adamantite Claymore", "weapon"),
    ("Void Dagger", "weapon"),
    ("Celestial Bow", "weapon"),
    ("Runic Battleaxe", "weapon"),
    ("Obsidian Katana", "weapon"),
    ("Arcane Scepter", "weapon"),
    ("Phoenix Lance", "weapon"),
    ("Abyssal Trident", "weapon"),
    ("Storm Halberd", "weapon"),
    ("Infernal Greatsword", "weapon"),
    ("Frost Glaive", "weapon"),
    ("Divine Blade", "weapon"),
    ("Chaos Maul", "weapon"),
    ("Eldritch Tome", "weapon"),
    ("Primordial Staff", "weapon"),
    ("Doom Crossbow", "weapon"),
    ("Spectral Katars", "weapon"),
    ("Mythic Warhammer", "weapon"),
];

const ARMOR_TEMPLATES: &[(&str, &str)] = &[
    ("Leather Cap", "helmet"),
    ("Iron Helm", "helmet"),
    ("Mithril Crown", "helmet"),
    ("Dragon Helm", "helmet"),
    ("Cloth Shirt", "armor"),
    ("Chain Mail", "armor"),
    ("Plate Armor", "armor"),
    ("Mithril Armor", "armor"),
    ("Dragon Plate", "armor"),
    ("Leather Pants", "legs"),
    ("Iron Greaves", "legs"),
    ("Mithril Greaves", "legs"),
    ("Leather Boots", "boots"),
    ("Iron Boots", "boots"),
    ("Winged Boots", "boots"),
    ("Wooden Shield", "shield"),
    ("Iron Shield", "shield"),
    ("Tower Shield", "shield"),
    ("Silver Ring", "ring1"),
    ("Gold Ring", "ring2"),
    ("Emerald Ring", "ring1"),
    ("Ruby Ring", "ring2"),
    ("Bone Amulet", "amulet"),
    ("Phoenix Amulet", "amulet"),
    ("Silk Cape", "cape"),
    ("Shadow Cloak", "cape"),
    // Helmets
    ("Steel Helm", "helmet"),
    ("Adamantite Crown", "helmet"),
    ("Void Mask", "helmet"),
    ("Celestial Circlet", "helmet"),
    // Armor
    ("Adamantite Plate", "armor"),
    ("Shadow Vestments", "armor"),
    ("Celestial Robe", "armor"),
    ("Void Cuirass", "armor"),
    ("Runic Chainmail", "armor"),
    // Legs
    ("Adamantite Greaves", "legs"),
    ("Shadow Leggings", "legs"),
    ("Celestial Cuisses", "legs"),
    ("Void Tassets", "legs"),
    // Boots
    ("Adamantite Sabatons", "boots"),
    ("Shadow Treads", "boots"),
    ("Celestial Sandals", "boots"),
    ("Void Boots", "boots"),
    // Shields
    ("Adamantite Bulwark", "shield"),
    ("Void Aegis", "shield"),
    ("Celestial Ward", "shield"),
    // Rings
    ("Sapphire Ring", "ring1"),
    ("Diamond Ring", "ring2"),
    ("Void Band", "ring1"),
    ("Celestial Loop", "ring2"),
    // Amulets
    ("Diamond Amulet", "amulet"),
    ("Void Pendant", "amulet"),
    ("Celestial Talisman", "amulet"),
    // Capes
    ("Void Mantle", "cape"),
    ("Celestial Wings", "cape"),
    ("Dragon Cloak", "cape"),
];

const MATERIAL_NAMES: &[&str] = &[
    "Wood", "Iron Ore", "Leather", "Thread", "Herb",
    "Steel Ingot", "Gold Dust", "Crystal Shard", "Dragon Scale",
    "Monster Fang", "Spider Silk", "Ancient Bone",
    "Mithril Ore", "Gem Shard", "Phoenix Feather", "Dark Essence",
    "Enchanted Cloth", "Sapphire Fragment", "Volcanic Ash",
    "Adamantite Ore", "Void Shard", "Celestial Dust", "Shadow Essence",
    "Runic Fragment", "Primordial Core", "Chaos Crystal", "Abyssal Pearl",
    "Phoenix Ash", "Frost Crystal", "Thunder Stone", "Mythic Ingot",
    "Soul Fragment", "Ancient Relic", "Titan Bone", "Ethereal Thread",
    "Demon Horn", "Angel Feather", "Obsidian Shard", "Star Fragment",
];

const AFFIX_PREFIXES: &[(&str, &str, f64)] = &[
    ("Furious", "ATK", 0.15),
    ("Armored", "DEF", 0.15),
    ("Swift", "SPD", 0.10),
    ("Lucky", "LCK", 0.10),
    ("Vital", "HP", 0.12),
    ("Arcane", "MP", 0.12),
    ("Heavy", "ATK", 0.20),
    ("Sturdy", "DEF", 0.20),
    ("Brutal", "ATK", 0.25),
    ("Titanium", "DEF", 0.22),
    ("Blazing", "ATK", 0.18),
    ("Frozen", "DEF", 0.16),
    ("Ancient", "HP", 0.18),
    ("Mystic", "MP", 0.20),
    ("Relentless", "SPD", 0.15),
    ("Blessed", "LCK", 0.18),
    ("Chaotic", "ATK", 0.30),
    ("Vampiric", "HP", 0.15),
    ("Ethereal", "SPD", 0.12),
    ("Void-touched", "ATK", 0.22),
];

const AFFIX_SUFFIXES: &[(&str, &str, f64)] = &[
    ("of the Dragon", "ATK", 0.18),
    ("of the Frost", "DEF", 0.12),
    ("of Life", "HP", 0.20),
    ("of Speed", "SPD", 0.15),
    ("of Fortune", "LCK", 0.15),
    ("of Power", "ATK", 0.25),
    ("of the Guardian", "DEF", 0.25),
    ("of Mana", "MP", 0.18),
    ("of the Phoenix", "HP", 0.22),
    ("of the Void", "ATK", 0.28),
    ("of the Ancients", "DEF", 0.22),
    ("of Thunder", "SPD", 0.18),
    ("of the Titan", "HP", 0.30),
    ("of Chaos", "ATK", 0.35),
    ("of the Stars", "LCK", 0.25),
    ("of Eternity", "DEF", 0.30),
    ("of the Abyss", "ATK", 0.20),
    ("of Wisdom", "MP", 0.22),
    ("of the Celestial", "LCK", 0.20),
    ("of Annihilation", "ATK", 0.40),
];

pub fn generate_loot(zone_level: u32, enemy_level: u32, luck_bonus: i32) -> Vec<Item> {
    let mut rng = rand::thread_rng();
    let mut loot = Vec::new();

    // Number of drops (1-3 items + materials)
    let num_drops = rng.gen_range(1..=3);

    for _ in 0..num_drops {
        // Determine rarity with luck bonus
        let luck_mult = 1.0 + luck_bonus as f64 * 0.001;
        let roll: f64 = rng.r#gen::<f64>() / luck_mult;
        let rarity = determine_rarity(roll);

        // 40% chance weapon, 40% armor, 20% material
        let item_roll: f64 = rng.r#gen();
        if item_roll < 0.20 {
            // Material drop
            let mat_name = MATERIAL_NAMES[rng.gen_range(0..MATERIAL_NAMES.len())];
            let qty = rng.gen_range(1..=3);
            loot.push(Item::new_material(mat_name, 0, qty));
        } else {
            let item_level = (enemy_level as i32 + rng.gen_range(-2..=2)).max(1) as u32;
            let stat_mult = RARITY_STAT_MULT[rarity as usize];

            if item_roll < 0.60 {
                // Weapon
                let (name, slot) = WEAPON_TEMPLATES[rng.gen_range(0..WEAPON_TEMPLATES.len())];
                let base_atk = (5.0 + item_level as f64 * 2.5) * stat_mult * rng.gen_range(0.85..1.15);
                let mut item = Item::new_weapon(name, rarity, item_level, base_atk as i32);
                apply_affixes(&mut item, rarity, &mut rng);
                loot.push(item);
            } else {
                // Armor
                let (name, slot) = ARMOR_TEMPLATES[rng.gen_range(0..ARMOR_TEMPLATES.len())];
                let base_def = (3.0 + item_level as f64 * 1.8) * stat_mult * rng.gen_range(0.85..1.15);
                let mut item = Item::new_armor(name, slot, rarity, item_level, base_def as i32);
                apply_affixes(&mut item, rarity, &mut rng);
                loot.push(item);
            }
        }
    }

    // Always drop gold
    let gold_amount = (10 + zone_level * 5 + enemy_level * 3) as u64;
    // Gold is not an item, handled separately

    // 5% chance to drop Enchanting Stone
    if rng.gen_bool(0.05) {
        loot.push(Item::new_material("Enchanting Stone", 1, 1));
    }

    loot
}

fn determine_rarity(roll: f64) -> u8 {
    let mut cumulative = 0.0;
    for (i, &weight) in RARITY_WEIGHTS.iter().enumerate() {
        cumulative += weight;
        if roll < cumulative {
            return i as u8;
        }
    }
    0
}

fn apply_affixes(item: &mut Item, rarity: u8, rng: &mut impl rand::Rng) {
    let (num_prefixes, num_suffixes) = match rarity {
        2 => (1, 1),     // Rare
        3 => (2, 1),     // Epic
        4 => (2, 2),     // Legendary
        5 => (3, 2),     // Mythic
        _ => return,     // Common/Uncommon: no affixes
    };

    let mut used_stats: Vec<String> = Vec::new();
    let mut name_parts: Vec<String> = Vec::new();

    // Prefixes
    for _ in 0..num_prefixes {
        let idx = rng.gen_range(0..AFFIX_PREFIXES.len());
        let (affix_name, stat, bonus_pct) = AFFIX_PREFIXES[idx];
        if !used_stats.contains(&stat.to_string()) {
            let base = *item.stats.get(stat).unwrap_or(&0) as f64;
            let bonus = ((base.max(5.0)) * bonus_pct) as i32 + 1;
            *item.stats.entry(stat.to_string()).or_insert(0) += bonus;
            item.affixes.push(affix_name.to_string());
            used_stats.push(stat.to_string());
            name_parts.insert(0, affix_name.to_string());
        }
    }

    // Suffixes
    for _ in 0..num_suffixes {
        let idx = rng.gen_range(0..AFFIX_SUFFIXES.len());
        let (affix_name, stat, bonus_pct) = AFFIX_SUFFIXES[idx];
        if !used_stats.contains(&stat.to_string()) {
            let base = *item.stats.get(stat).unwrap_or(&0) as f64;
            let bonus = ((base.max(5.0)) * bonus_pct) as i32 + 1;
            *item.stats.entry(stat.to_string()).or_insert(0) += bonus;
            item.affixes.push(affix_name.to_string());
            used_stats.push(stat.to_string());
            name_parts.push(affix_name.to_string());
        }
    }

    // Build final name with affixes
    if !name_parts.is_empty() {
        let prefixes: Vec<&str> = item.affixes.iter()
            .filter(|a| AFFIX_PREFIXES.iter().any(|(n, _, _)| *n == a.as_str()))
            .map(|a| a.as_str())
            .collect();
        let suffixes: Vec<&str> = item.affixes.iter()
            .filter(|a| AFFIX_SUFFIXES.iter().any(|(n, _, _)| *n == a.as_str()))
            .map(|a| a.as_str())
            .collect();

        let mut full_name = String::new();
        for p in &prefixes {
            full_name.push_str(p);
            full_name.push(' ');
        }
        full_name.push_str(&item.name);
        for s in &suffixes {
            full_name.push(' ');
            full_name.push_str(s);
        }
        item.name = full_name;
    }
}

/// Calculate gold dropped from enemy
pub fn enemy_gold_reward(zone_level: u32, enemy_level: u32) -> u64 {
    let base = 10 + zone_level * 5 + enemy_level * 3;
    let variance = rand::thread_rng().gen_range(0.8..1.2_f64);
    (base as f64 * variance) as u64
}

/// Calculate items dropped on PvP death (30% chance per inventory item)
pub fn pvp_death_drops(player: &mut PlayerData) -> (Vec<Item>, u64) {
    let mut rng = rand::thread_rng();
    let mut dropped = Vec::new();

    // Don't drop anything for protected players (level < 10)
    if player.pvp_protection {
        return (dropped, 0);
    }

    // Drop 30% of inventory items
    for slot in player.inventory.iter_mut() {
        if let Some(item) = slot {
            if rng.gen_bool(0.30) {
                dropped.push(item.clone());
                *slot = None;
            }
        }
    }

    // Drop 10% of gold
    let gold_drop = player.gold / 10;
    player.gold -= gold_drop;

    (dropped, gold_drop)
}

// ─── Quest Catalog ───────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct QuestDef {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
    pub min_level: u32,
    pub prerequisites: &'static [&'static str],
    pub objectives: &'static [QuestObjDef],
    pub reward_xp: u64,
    pub reward_gold: u64,
    pub reward_items: &'static [(&'static str, u32, u32)], // (name, rarity, level)
}

#[derive(Debug, Clone)]
pub struct QuestObjDef {
    pub description: &'static str,
    pub obj_type: &'static str, // "kill", "kill_type", "collect", "craft", "level", "gold", "equip", "visit_biome", "kill_rank"
    pub target: &'static str,   // enemy keyword, item name, level num, biome name, rank name
    pub count: u32,
}

pub static QUEST_CATALOG: &[QuestDef] = &[
    // === Starter Chain (Lv 1-5) ===
    QuestDef {
        id: "first_blood", title: "First Blood", icon: "⚔️",
        description: "Prove your worth by defeating enemies in the wild.",
        min_level: 1, prerequisites: &[],
        objectives: &[QuestObjDef { description: "Kill 3 enemies", obj_type: "kill", target: "", count: 3 }],
        reward_xp: 50, reward_gold: 30, reward_items: &[],
    },
    QuestDef {
        id: "slime_hunter", title: "Slime Hunter", icon: "🟢",
        description: "The forest is overrun with slimes. Thin their numbers!",
        min_level: 1, prerequisites: &["first_blood"],
        objectives: &[QuestObjDef { description: "Kill 5 Slimes", obj_type: "kill_type", target: "slime", count: 5 }],
        reward_xp: 100, reward_gold: 60, reward_items: &[],
    },
    QuestDef {
        id: "growing_stronger", title: "Growing Stronger", icon: "⭐",
        description: "Train and grow your power. Reach level 3.",
        min_level: 1, prerequisites: &[],
        objectives: &[QuestObjDef { description: "Reach Level 3", obj_type: "level", target: "3", count: 1 }],
        reward_xp: 150, reward_gold: 100, reward_items: &[],
    },
    QuestDef {
        id: "suit_up", title: "Suit Up", icon: "🛡️",
        description: "Equip a piece of armor to protect yourself.",
        min_level: 1, prerequisites: &[],
        objectives: &[QuestObjDef { description: "Equip any armor", obj_type: "equip", target: "", count: 1 }],
        reward_xp: 75, reward_gold: 40, reward_items: &[],
    },
    QuestDef {
        id: "apprentice_crafter", title: "Apprentice Crafter", icon: "🔨",
        description: "Learn the art of crafting by creating items at the forge.",
        min_level: 2, prerequisites: &[],
        objectives: &[QuestObjDef { description: "Craft 3 items", obj_type: "craft", target: "", count: 3 }],
        reward_xp: 120, reward_gold: 80, reward_items: &[],
    },

    // === Mid Chain (Lv 5-15) ===
    QuestDef {
        id: "skeleton_scourge", title: "Skeleton Scourge", icon: "💀",
        description: "The undead grow restless. Destroy the skeletons plaguing the land.",
        min_level: 5, prerequisites: &["first_blood"],
        objectives: &[QuestObjDef { description: "Kill 10 Skeletons", obj_type: "kill_type", target: "skeleton", count: 10 }],
        reward_xp: 300, reward_gold: 200, reward_items: &[],
    },
    QuestDef {
        id: "wolf_pack", title: "Wolf Pack Menace", icon: "🐺",
        description: "Wolves are attacking travelers. Hunt them down.",
        min_level: 5, prerequisites: &["first_blood"],
        objectives: &[QuestObjDef { description: "Kill 8 Wolves", obj_type: "kill_type", target: "wolf", count: 8 }],
        reward_xp: 250, reward_gold: 180, reward_items: &[],
    },
    QuestDef {
        id: "gold_hoarder", title: "Gold Hoarder", icon: "💰",
        description: "Accumulate wealth to fund your adventures.",
        min_level: 3, prerequisites: &[],
        objectives: &[QuestObjDef { description: "Have 500 gold", obj_type: "gold", target: "500", count: 1 }],
        reward_xp: 200, reward_gold: 100, reward_items: &[],
    },
    QuestDef {
        id: "explorer", title: "Explorer", icon: "🗺️",
        description: "Venture into different biomes to discover the world.",
        min_level: 5, prerequisites: &[],
        objectives: &[QuestObjDef { description: "Visit 4 different biomes", obj_type: "visit_biome", target: "", count: 4 }],
        reward_xp: 350, reward_gold: 200, reward_items: &[],
    },
    QuestDef {
        id: "demon_slayer", title: "Demon Slayer", icon: "😈",
        description: "Dark forces have sent demons into the realm. Banish them!",
        min_level: 8, prerequisites: &["skeleton_scourge"],
        objectives: &[QuestObjDef { description: "Kill 5 Demons", obj_type: "kill_type", target: "demon", count: 5 }],
        reward_xp: 500, reward_gold: 300, reward_items: &[("Iron Sword", 1, 8)],
    },
    QuestDef {
        id: "seasoned_warrior", title: "Seasoned Warrior", icon: "⚔️",
        description: "Battle your way to level 10 and prove your dedication.",
        min_level: 5, prerequisites: &["growing_stronger"],
        objectives: &[QuestObjDef { description: "Reach Level 10", obj_type: "level", target: "10", count: 1 }],
        reward_xp: 500, reward_gold: 300, reward_items: &[],
    },

    // === Advanced Chain (Lv 15+) ===
    QuestDef {
        id: "champion_hunter", title: "Champion Hunter", icon: "🏆",
        description: "Seek out and destroy powerful champion-ranked enemies.",
        min_level: 10, prerequisites: &["seasoned_warrior"],
        objectives: &[QuestObjDef { description: "Kill 10 Champion enemies", obj_type: "kill_rank", target: "champion", count: 10 }],
        reward_xp: 800, reward_gold: 500, reward_items: &[],
    },
    QuestDef {
        id: "master_crafter", title: "Master Crafter", icon: "⚒️",
        description: "Your forging skills are growing. Create many more items.",
        min_level: 10, prerequisites: &["apprentice_crafter"],
        objectives: &[QuestObjDef { description: "Craft 15 items", obj_type: "craft", target: "", count: 15 }],
        reward_xp: 600, reward_gold: 400, reward_items: &[],
    },
    QuestDef {
        id: "elite_slayer", title: "Elite Slayer", icon: "💎",
        description: "Only the strongest can challenge elite enemies. Are you ready?",
        min_level: 15, prerequisites: &["champion_hunter"],
        objectives: &[QuestObjDef { description: "Kill 5 Elite enemies", obj_type: "kill_rank", target: "elite", count: 5 }],
        reward_xp: 1200, reward_gold: 800, reward_items: &[("Steel Blade", 2, 15)],
    },
    QuestDef {
        id: "veteran", title: "Veteran Adventurer", icon: "🌟",
        description: "Reach level 20 and cement your legacy in RealmForge.",
        min_level: 15, prerequisites: &["seasoned_warrior"],
        objectives: &[QuestObjDef { description: "Reach Level 20", obj_type: "level", target: "20", count: 1 }],
        reward_xp: 2000, reward_gold: 1000, reward_items: &[],
    },
    QuestDef {
        id: "boss_hunter", title: "Boss Hunter", icon: "👑",
        description: "Face the ultimate challenge. Defeat a boss-rank enemy!",
        min_level: 15, prerequisites: &["elite_slayer"],
        objectives: &[QuestObjDef { description: "Kill a Boss enemy", obj_type: "kill_rank", target: "boss", count: 1 }],
        reward_xp: 3000, reward_gold: 2000, reward_items: &[("Mithril Sword", 3, 20)],
    },
    QuestDef {
        id: "spider_nest", title: "Spider Nest", icon: "🕷️",
        description: "A nest of deadly spiders threatens the mountainside. Exterminate them!",
        min_level: 7, prerequisites: &["first_blood"],
        objectives: &[QuestObjDef { description: "Kill 8 Spiders", obj_type: "kill_type", target: "spider", count: 8 }],
        reward_xp: 280, reward_gold: 170, reward_items: &[],
    },
    QuestDef {
        id: "undead_purge", title: "Undead Purge", icon: "☠️",
        description: "Wraiths and zombies roam the swamplands. Purify the corrupted!",
        min_level: 10, prerequisites: &["skeleton_scourge"],
        objectives: &[
            QuestObjDef { description: "Kill 6 Wraiths", obj_type: "kill_type", target: "wraith", count: 6 },
            QuestObjDef { description: "Kill 6 Zombies", obj_type: "kill_type", target: "zombie", count: 6 },
        ],
        reward_xp: 600, reward_gold: 350, reward_items: &[],
    },
    QuestDef {
        id: "mass_slaughter", title: "Mass Slaughter", icon: "🔥",
        description: "Prove your combat mastery by slaying a hundred foes.",
        min_level: 10, prerequisites: &[],
        objectives: &[QuestObjDef { description: "Kill 100 enemies (total)", obj_type: "kill", target: "", count: 100 }],
        reward_xp: 1500, reward_gold: 800, reward_items: &[],
    },
];

// ─── Achievement Catalog ─────────────────────────────────────

#[derive(Debug, Clone)]
pub struct AchievementDef {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
    pub category: &'static str, // "combat", "exploration", "crafting", "social", "progression"
    pub tracker: &'static str,  // which stats_tracker field to check
    pub target: u32,
}

pub static ACHIEVEMENT_CATALOG: &[AchievementDef] = &[
    // === Combat ===
    AchievementDef { id: "first_kill", title: "First Kill", description: "Defeat your first enemy.", icon: "⚔️", category: "combat", tracker: "enemies_killed", target: 1 },
    AchievementDef { id: "killer_10", title: "Warrior", description: "Defeat 10 enemies.", icon: "⚔️", category: "combat", tracker: "enemies_killed", target: 10 },
    AchievementDef { id: "killer_50", title: "Slayer", description: "Defeat 50 enemies.", icon: "⚔️", category: "combat", tracker: "enemies_killed", target: 50 },
    AchievementDef { id: "killer_100", title: "Decimator", description: "Defeat 100 enemies.", icon: "💀", category: "combat", tracker: "enemies_killed", target: 100 },
    AchievementDef { id: "killer_500", title: "Annihilator", description: "Defeat 500 enemies.", icon: "☠️", category: "combat", tracker: "enemies_killed", target: 500 },
    AchievementDef { id: "killer_1000", title: "Legend of War", description: "Defeat 1000 enemies.", icon: "👑", category: "combat", tracker: "enemies_killed", target: 1000 },
    AchievementDef { id: "boss_kill_1", title: "Boss Slayer", description: "Defeat a boss-rank enemy.", icon: "👑", category: "combat", tracker: "boss_kills", target: 1 },
    AchievementDef { id: "boss_kill_5", title: "Boss Hunter", description: "Defeat 5 boss-rank enemies.", icon: "🏆", category: "combat", tracker: "boss_kills", target: 5 },
    AchievementDef { id: "champion_5", title: "Champion Crusher", description: "Defeat 5 champions.", icon: "🏅", category: "combat", tracker: "champion_kills", target: 5 },
    AchievementDef { id: "elite_5", title: "Elite Destroyer", description: "Defeat 5 elite enemies.", icon: "💎", category: "combat", tracker: "elite_kills", target: 5 },
    AchievementDef { id: "pvp_first", title: "PvP Initiate", description: "Win your first PvP battle.", icon: "🗡️", category: "combat", tracker: "pvp_kills", target: 1 },

    // === Progression ===
    AchievementDef { id: "level_5", title: "Apprentice", description: "Reach level 5.", icon: "⭐", category: "progression", tracker: "level", target: 5 },
    AchievementDef { id: "level_10", title: "Journeyman", description: "Reach level 10.", icon: "⭐", category: "progression", tracker: "level", target: 10 },
    AchievementDef { id: "level_20", title: "Veteran", description: "Reach level 20.", icon: "🌟", category: "progression", tracker: "level", target: 20 },
    AchievementDef { id: "level_30", title: "Master", description: "Reach level 30.", icon: "💫", category: "progression", tracker: "level", target: 30 },
    AchievementDef { id: "level_50", title: "Grandmaster", description: "Reach level 50.", icon: "👑", category: "progression", tracker: "level", target: 50 },
    AchievementDef { id: "quest_1", title: "Questor", description: "Complete your first quest.", icon: "📜", category: "progression", tracker: "quests_completed", target: 1 },
    AchievementDef { id: "quest_5", title: "Adventurer", description: "Complete 5 quests.", icon: "📜", category: "progression", tracker: "quests_completed", target: 5 },
    AchievementDef { id: "quest_10", title: "Hero", description: "Complete 10 quests.", icon: "🦸", category: "progression", tracker: "quests_completed", target: 10 },

    // === Crafting ===
    AchievementDef { id: "craft_1", title: "First Craft", description: "Craft your first item.", icon: "🔨", category: "crafting", tracker: "items_crafted", target: 1 },
    AchievementDef { id: "craft_10", title: "Craftsman", description: "Craft 10 items.", icon: "🔨", category: "crafting", tracker: "items_crafted", target: 10 },
    AchievementDef { id: "craft_50", title: "Master Smith", description: "Craft 50 items.", icon: "⚒️", category: "crafting", tracker: "items_crafted", target: 50 },

    // === Exploration ===
    AchievementDef { id: "biome_2", title: "Wanderer", description: "Visit 2 different biomes.", icon: "🗺️", category: "exploration", tracker: "biomes_visited", target: 2 },
    AchievementDef { id: "biome_4", title: "Explorer", description: "Visit 4 different biomes.", icon: "🧭", category: "exploration", tracker: "biomes_visited", target: 4 },
    AchievementDef { id: "biome_7", title: "World Traveler", description: "Visit all 7 biomes.", icon: "🌍", category: "exploration", tracker: "biomes_visited", target: 7 },
    AchievementDef { id: "death_1", title: "First Death", description: "Die for the first time.", icon: "💀", category: "exploration", tracker: "deaths", target: 1 },
    AchievementDef { id: "death_10", title: "Persistant Soul", description: "Die 10 times. Never give up!", icon: "👻", category: "exploration", tracker: "deaths", target: 10 },

    // === Economy/Social ===
    AchievementDef { id: "gold_1k", title: "Wealthy", description: "Earn 1,000 gold total.", icon: "💰", category: "social", tracker: "gold_earned", target: 1000 },
    AchievementDef { id: "gold_10k", title: "Rich", description: "Earn 10,000 gold total.", icon: "💎", category: "social", tracker: "gold_earned", target: 10000 },
    AchievementDef { id: "trade_1", title: "Trader", description: "Complete your first trade.", icon: "🤝", category: "social", tracker: "trades_completed", target: 1 },
    AchievementDef { id: "collect_50", title: "Collector", description: "Pick up 50 items.", icon: "🎒", category: "social", tracker: "items_collected", target: 50 },
];

// ─── World Boss Definitions ──────────────────────────────────

#[derive(Debug, Clone)]
pub struct WorldBossDef {
    pub id: &'static str,
    pub name: &'static str,
    pub title: &'static str,
    pub spawn_x: f64,
    pub spawn_y: f64,
    pub base_level: u32,
    pub hp_mult: f64,
    pub atk_mult: f64,
    pub def_mult: f64,
    pub modifiers: &'static [EnemyModifier],
    pub phase_thresholds: &'static [f64], // HP % thresholds for phase changes
    pub summon_count: u32,                // minions to summon per phase
}

pub static WORLD_BOSSES: &[WorldBossDef] = &[
    WorldBossDef {
        id: "infernal_drake", name: "Ignaroth", title: "the Infernal Drake",
        spawn_x: 80.0, spawn_y: 80.0, base_level: 15,
        hp_mult: 12.0, atk_mult: 4.0, def_mult: 3.0,
        modifiers: &[EnemyModifier::Burning, EnemyModifier::Enraged, EnemyModifier::Regenerator],
        phase_thresholds: &[0.75, 0.50, 0.25],
        summon_count: 3,
    },
    WorldBossDef {
        id: "frost_lich", name: "Cryomortis", title: "the Frost Lich",
        spawn_x: -90.0, spawn_y: 70.0, base_level: 20,
        hp_mult: 10.0, atk_mult: 5.0, def_mult: 2.5,
        modifiers: &[EnemyModifier::Freezing, EnemyModifier::Shielded, EnemyModifier::Teleporter],
        phase_thresholds: &[0.66, 0.33],
        summon_count: 4,
    },
    WorldBossDef {
        id: "shadow_king", name: "Umbrathor", title: "the Shadow King",
        spawn_x: -70.0, spawn_y: -85.0, base_level: 25,
        hp_mult: 15.0, atk_mult: 6.0, def_mult: 4.0,
        modifiers: &[EnemyModifier::Vampiric, EnemyModifier::Berserker, EnemyModifier::Undying, EnemyModifier::Swift],
        phase_thresholds: &[0.80, 0.60, 0.40, 0.20],
        summon_count: 5,
    },
    WorldBossDef {
        id: "stone_titan", name: "Terragor", title: "the Stone Titan",
        spawn_x: 95.0, spawn_y: -75.0, base_level: 18,
        hp_mult: 20.0, atk_mult: 3.5, def_mult: 6.0,
        modifiers: &[EnemyModifier::Armored, EnemyModifier::Thorns, EnemyModifier::Reflector],
        phase_thresholds: &[0.50],
        summon_count: 2,
    },
    WorldBossDef {
        id: "void_serpent", name: "Nihilax", title: "the Void Serpent",
        spawn_x: 0.0, spawn_y: -120.0, base_level: 30,
        hp_mult: 18.0, atk_mult: 7.0, def_mult: 5.0,
        modifiers: &[EnemyModifier::Poisonous, EnemyModifier::Draining, EnemyModifier::Explosive, EnemyModifier::Swift],
        phase_thresholds: &[0.75, 0.50, 0.25],
        summon_count: 6,
    },
];

// ─── Skill Trees ────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SkillTreeNode {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
    pub class: &'static str,       // warrior, mage, ranger, rogue
    pub tree: &'static str,        // tree name (e.g. "Arms", "Protection")
    pub tier: u32,                 // 1-5, determines position and cost
    pub requires: &'static [&'static str], // prerequisite node IDs
    pub bonus_type: &'static str,  // "hp", "mp", "atk", "def", "spd", "lck", "crit", "lifesteal", "xp_mult", "gold_mult", "skill_damage"
    pub bonus_value: i32,          // flat bonus amount
    pub skill_point_cost: u32,     // skill points needed to unlock
}

pub static SKILL_TREES: &[SkillTreeNode] = &[
    // ═══ WARRIOR ═══
    // -- Arms (offensive) --
    SkillTreeNode { id: "w_arms_1", name: "Weapon Training", description: "+5 ATK from mastering weapon techniques", icon: "⚔️", class: "warrior", tree: "Arms", tier: 1, requires: &[], bonus_type: "atk", bonus_value: 5, skill_point_cost: 1 },
    SkillTreeNode { id: "w_arms_2", name: "Heavy Strikes", description: "+8 ATK with powerful overhead swings", icon: "💥", class: "warrior", tree: "Arms", tier: 2, requires: &["w_arms_1"], bonus_type: "atk", bonus_value: 8, skill_point_cost: 2 },
    SkillTreeNode { id: "w_arms_3", name: "Critical Edge", description: "+10 LCK for critical hit chance", icon: "🎯", class: "warrior", tree: "Arms", tier: 3, requires: &["w_arms_2"], bonus_type: "lck", bonus_value: 10, skill_point_cost: 3 },
    SkillTreeNode { id: "w_arms_4", name: "Bloodthirst", description: "Lifesteal 5% of damage dealt", icon: "🩸", class: "warrior", tree: "Arms", tier: 4, requires: &["w_arms_3"], bonus_type: "lifesteal", bonus_value: 5, skill_point_cost: 4 },
    SkillTreeNode { id: "w_arms_5", name: "Warlord's Fury", description: "+15 ATK and +5 SPD battle rage", icon: "🔥", class: "warrior", tree: "Arms", tier: 5, requires: &["w_arms_4"], bonus_type: "atk", bonus_value: 15, skill_point_cost: 5 },
    // -- Protection (defensive) --
    SkillTreeNode { id: "w_prot_1", name: "Shield Wall", description: "+5 DEF from shield mastery", icon: "🛡️", class: "warrior", tree: "Protection", tier: 1, requires: &[], bonus_type: "def", bonus_value: 5, skill_point_cost: 1 },
    SkillTreeNode { id: "w_prot_2", name: "Iron Skin", description: "+8 DEF from hardened resolve", icon: "🪨", class: "warrior", tree: "Protection", tier: 2, requires: &["w_prot_1"], bonus_type: "def", bonus_value: 8, skill_point_cost: 2 },
    SkillTreeNode { id: "w_prot_3", name: "Vitality Surge", description: "+50 HP from constitution training", icon: "❤️", class: "warrior", tree: "Protection", tier: 3, requires: &["w_prot_2"], bonus_type: "hp", bonus_value: 50, skill_point_cost: 3 },
    SkillTreeNode { id: "w_prot_4", name: "Fortification", description: "+12 DEF from unbreakable stance", icon: "🏰", class: "warrior", tree: "Protection", tier: 4, requires: &["w_prot_3"], bonus_type: "def", bonus_value: 12, skill_point_cost: 4 },
    SkillTreeNode { id: "w_prot_5", name: "Immortal Guard", description: "+80 HP and +10 DEF fortress defense", icon: "⭐", class: "warrior", tree: "Protection", tier: 5, requires: &["w_prot_4"], bonus_type: "hp", bonus_value: 80, skill_point_cost: 5 },
    // -- Tactics (utility) --
    SkillTreeNode { id: "w_tact_1", name: "Swift March", description: "+3 SPD from tactical movement", icon: "👢", class: "warrior", tree: "Tactics", tier: 1, requires: &[], bonus_type: "spd", bonus_value: 3, skill_point_cost: 1 },
    SkillTreeNode { id: "w_tact_2", name: "Battle Sense", description: "+5 LCK from battlefield awareness", icon: "👁️", class: "warrior", tree: "Tactics", tier: 2, requires: &["w_tact_1"], bonus_type: "lck", bonus_value: 5, skill_point_cost: 2 },
    SkillTreeNode { id: "w_tact_3", name: "War Cry", description: "+5 ATK from intimidating presence", icon: "📢", class: "warrior", tree: "Tactics", tier: 3, requires: &["w_tact_2"], bonus_type: "atk", bonus_value: 5, skill_point_cost: 3 },
    SkillTreeNode { id: "w_tact_4", name: "Bounty Hunter", description: "+15% gold from kills", icon: "💰", class: "warrior", tree: "Tactics", tier: 4, requires: &["w_tact_3"], bonus_type: "gold_mult", bonus_value: 15, skill_point_cost: 4 },
    SkillTreeNode { id: "w_tact_5", name: "Commander", description: "+10% XP from leadership", icon: "👑", class: "warrior", tree: "Tactics", tier: 5, requires: &["w_tact_4"], bonus_type: "xp_mult", bonus_value: 10, skill_point_cost: 5 },

    // ═══ MAGE ═══
    // -- Arcane (raw power) --
    SkillTreeNode { id: "m_arc_1", name: "Arcane Focus", description: "+20 MP from mana attunement", icon: "🔮", class: "mage", tree: "Arcane", tier: 1, requires: &[], bonus_type: "mp", bonus_value: 20, skill_point_cost: 1 },
    SkillTreeNode { id: "m_arc_2", name: "Spell Power", description: "+8 ATK from magical amplification", icon: "✨", class: "mage", tree: "Arcane", tier: 2, requires: &["m_arc_1"], bonus_type: "atk", bonus_value: 8, skill_point_cost: 2 },
    SkillTreeNode { id: "m_arc_3", name: "Mana Storm", description: "+40 MP and +5 ATK from arcane mastery", icon: "🌀", class: "mage", tree: "Arcane", tier: 3, requires: &["m_arc_2"], bonus_type: "mp", bonus_value: 40, skill_point_cost: 3 },
    SkillTreeNode { id: "m_arc_4", name: "Arcane Barrier", description: "+30 HP from magical shield", icon: "🔵", class: "mage", tree: "Arcane", tier: 4, requires: &["m_arc_3"], bonus_type: "hp", bonus_value: 30, skill_point_cost: 4 },
    SkillTreeNode { id: "m_arc_5", name: "Archmage", description: "+15 ATK from supreme magical power", icon: "🌟", class: "mage", tree: "Arcane", tier: 5, requires: &["m_arc_4"], bonus_type: "atk", bonus_value: 15, skill_point_cost: 5 },
    // -- Elemental (damage) --
    SkillTreeNode { id: "m_elem_1", name: "Fire Attunement", description: "+5 ATK from fire magic basics", icon: "🔥", class: "mage", tree: "Elemental", tier: 1, requires: &[], bonus_type: "atk", bonus_value: 5, skill_point_cost: 1 },
    SkillTreeNode { id: "m_elem_2", name: "Frost Nova", description: "+3 DEF from frost armor", icon: "❄️", class: "mage", tree: "Elemental", tier: 2, requires: &["m_elem_1"], bonus_type: "def", bonus_value: 3, skill_point_cost: 2 },
    SkillTreeNode { id: "m_elem_3", name: "Lightning Mastery", description: "+10 ATK and +5 SPD from lightning", icon: "⚡", class: "mage", tree: "Elemental", tier: 3, requires: &["m_elem_2"], bonus_type: "atk", bonus_value: 10, skill_point_cost: 3 },
    SkillTreeNode { id: "m_elem_4", name: "Elemental Surge", description: "+10 LCK from elemental chaos", icon: "🌈", class: "mage", tree: "Elemental", tier: 4, requires: &["m_elem_3"], bonus_type: "lck", bonus_value: 10, skill_point_cost: 4 },
    SkillTreeNode { id: "m_elem_5", name: "Primordial Force", description: "+20 ATK from elemental mastery", icon: "💎", class: "mage", tree: "Elemental", tier: 5, requires: &["m_elem_4"], bonus_type: "atk", bonus_value: 20, skill_point_cost: 5 },
    // -- Mysticism (utility) --
    SkillTreeNode { id: "m_myst_1", name: "Meditation", description: "+30 MP from deep focus", icon: "🧘", class: "mage", tree: "Mysticism", tier: 1, requires: &[], bonus_type: "mp", bonus_value: 30, skill_point_cost: 1 },
    SkillTreeNode { id: "m_myst_2", name: "Enchant", description: "+5 LCK from magical luck", icon: "🪄", class: "mage", tree: "Mysticism", tier: 2, requires: &["m_myst_1"], bonus_type: "lck", bonus_value: 5, skill_point_cost: 2 },
    SkillTreeNode { id: "m_myst_3", name: "Blink", description: "+5 SPD from spatial magic", icon: "💨", class: "mage", tree: "Mysticism", tier: 3, requires: &["m_myst_2"], bonus_type: "spd", bonus_value: 5, skill_point_cost: 3 },
    SkillTreeNode { id: "m_myst_4", name: "Wisdom", description: "+15% XP from knowledge", icon: "📖", class: "mage", tree: "Mysticism", tier: 4, requires: &["m_myst_3"], bonus_type: "xp_mult", bonus_value: 15, skill_point_cost: 4 },
    SkillTreeNode { id: "m_myst_5", name: "Transcendence", description: "+60 MP and +10 ATK from enlightenment", icon: "🌠", class: "mage", tree: "Mysticism", tier: 5, requires: &["m_myst_4"], bonus_type: "mp", bonus_value: 60, skill_point_cost: 5 },

    // ═══ RANGER ═══
    // -- Marksmanship (damage) --
    SkillTreeNode { id: "r_mark_1", name: "Steady Aim", description: "+5 ATK from precise shooting", icon: "🏹", class: "ranger", tree: "Marksmanship", tier: 1, requires: &[], bonus_type: "atk", bonus_value: 5, skill_point_cost: 1 },
    SkillTreeNode { id: "r_mark_2", name: "Eagle Eye", description: "+8 LCK from keen sight", icon: "🦅", class: "ranger", tree: "Marksmanship", tier: 2, requires: &["r_mark_1"], bonus_type: "lck", bonus_value: 8, skill_point_cost: 2 },
    SkillTreeNode { id: "r_mark_3", name: "Rapid Fire", description: "+8 ATK from faster shooting", icon: "💫", class: "ranger", tree: "Marksmanship", tier: 3, requires: &["r_mark_2"], bonus_type: "atk", bonus_value: 8, skill_point_cost: 3 },
    SkillTreeNode { id: "r_mark_4", name: "Piercing Shot", description: "+12 ATK ignoring some armor", icon: "🎯", class: "ranger", tree: "Marksmanship", tier: 4, requires: &["r_mark_3"], bonus_type: "atk", bonus_value: 12, skill_point_cost: 4 },
    SkillTreeNode { id: "r_mark_5", name: "Sniper's Mark", description: "+15 LCK for devastating crits", icon: "⭐", class: "ranger", tree: "Marksmanship", tier: 5, requires: &["r_mark_4"], bonus_type: "lck", bonus_value: 15, skill_point_cost: 5 },
    // -- Survival (defense/utility) --
    SkillTreeNode { id: "r_surv_1", name: "Thick Hide", description: "+4 DEF from nature armor", icon: "🌿", class: "ranger", tree: "Survival", tier: 1, requires: &[], bonus_type: "def", bonus_value: 4, skill_point_cost: 1 },
    SkillTreeNode { id: "r_surv_2", name: "Evasion", description: "+5 SPD from agile dodging", icon: "💨", class: "ranger", tree: "Survival", tier: 2, requires: &["r_surv_1"], bonus_type: "spd", bonus_value: 5, skill_point_cost: 2 },
    SkillTreeNode { id: "r_surv_3", name: "Nature's Gift", description: "+40 HP from forest blessing", icon: "🌳", class: "ranger", tree: "Survival", tier: 3, requires: &["r_surv_2"], bonus_type: "hp", bonus_value: 40, skill_point_cost: 3 },
    SkillTreeNode { id: "r_surv_4", name: "Camouflage", description: "+8 DEF from natural concealment", icon: "🍃", class: "ranger", tree: "Survival", tier: 4, requires: &["r_surv_3"], bonus_type: "def", bonus_value: 8, skill_point_cost: 4 },
    SkillTreeNode { id: "r_surv_5", name: "Wild Spirit", description: "+60 HP and +5 SPD from nature bond", icon: "🐺", class: "ranger", tree: "Survival", tier: 5, requires: &["r_surv_4"], bonus_type: "hp", bonus_value: 60, skill_point_cost: 5 },
    // -- Trapping (utility/economy) --
    SkillTreeNode { id: "r_trap_1", name: "Scavenger", description: "+5 LCK for better loot", icon: "🔍", class: "ranger", tree: "Trapping", tier: 1, requires: &[], bonus_type: "lck", bonus_value: 5, skill_point_cost: 1 },
    SkillTreeNode { id: "r_trap_2", name: "Trap Master", description: "+3 ATK from trap damage", icon: "🪤", class: "ranger", tree: "Trapping", tier: 2, requires: &["r_trap_1"], bonus_type: "atk", bonus_value: 3, skill_point_cost: 2 },
    SkillTreeNode { id: "r_trap_3", name: "Tracker", description: "+3 SPD from pathfinding", icon: "🐾", class: "ranger", tree: "Trapping", tier: 3, requires: &["r_trap_2"], bonus_type: "spd", bonus_value: 3, skill_point_cost: 3 },
    SkillTreeNode { id: "r_trap_4", name: "Fortune Finder", description: "+20% gold from kills", icon: "💰", class: "ranger", tree: "Trapping", tier: 4, requires: &["r_trap_3"], bonus_type: "gold_mult", bonus_value: 20, skill_point_cost: 4 },
    SkillTreeNode { id: "r_trap_5", name: "Master Trapper", description: "+10 ATK and +10 LCK from mastery", icon: "🏆", class: "ranger", tree: "Trapping", tier: 5, requires: &["r_trap_4"], bonus_type: "lck", bonus_value: 10, skill_point_cost: 5 },

    // ═══ ROGUE ═══
    // -- Assassination (burst damage) --
    SkillTreeNode { id: "ro_assa_1", name: "Backstab", description: "+5 ATK from surprise attacks", icon: "🗡️", class: "rogue", tree: "Assassination", tier: 1, requires: &[], bonus_type: "atk", bonus_value: 5, skill_point_cost: 1 },
    SkillTreeNode { id: "ro_assa_2", name: "Poison Blade", description: "+8 ATK from venomous weapons", icon: "☠️", class: "rogue", tree: "Assassination", tier: 2, requires: &["ro_assa_1"], bonus_type: "atk", bonus_value: 8, skill_point_cost: 2 },
    SkillTreeNode { id: "ro_assa_3", name: "Expose Weakness", description: "+12 LCK for critical openings", icon: "💀", class: "rogue", tree: "Assassination", tier: 3, requires: &["ro_assa_2"], bonus_type: "lck", bonus_value: 12, skill_point_cost: 3 },
    SkillTreeNode { id: "ro_assa_4", name: "Execute", description: "+12 ATK for finishing blows", icon: "⚰️", class: "rogue", tree: "Assassination", tier: 4, requires: &["ro_assa_3"], bonus_type: "atk", bonus_value: 12, skill_point_cost: 4 },
    SkillTreeNode { id: "ro_assa_5", name: "Death's Embrace", description: "+20 ATK and lifesteal 8%", icon: "💀", class: "rogue", tree: "Assassination", tier: 5, requires: &["ro_assa_4"], bonus_type: "atk", bonus_value: 20, skill_point_cost: 5 },
    // -- Shadow (evasion) --
    SkillTreeNode { id: "ro_shad_1", name: "Shadow Step", description: "+5 SPD from shadow movement", icon: "🌑", class: "rogue", tree: "Shadow", tier: 1, requires: &[], bonus_type: "spd", bonus_value: 5, skill_point_cost: 1 },
    SkillTreeNode { id: "ro_shad_2", name: "Smoke Screen", description: "+5 DEF from obscured form", icon: "💨", class: "rogue", tree: "Shadow", tier: 2, requires: &["ro_shad_1"], bonus_type: "def", bonus_value: 5, skill_point_cost: 2 },
    SkillTreeNode { id: "ro_shad_3", name: "Fade", description: "+8 SPD from becoming invisible", icon: "👻", class: "rogue", tree: "Shadow", tier: 3, requires: &["ro_shad_2"], bonus_type: "spd", bonus_value: 8, skill_point_cost: 3 },
    SkillTreeNode { id: "ro_shad_4", name: "Shadow Armor", description: "+10 DEF from dark protection", icon: "🌚", class: "rogue", tree: "Shadow", tier: 4, requires: &["ro_shad_3"], bonus_type: "def", bonus_value: 10, skill_point_cost: 4 },
    SkillTreeNode { id: "ro_shad_5", name: "Phantom", description: "+12 SPD and +8 DEF from phase shift", icon: "⭐", class: "rogue", tree: "Shadow", tier: 5, requires: &["ro_shad_4"], bonus_type: "spd", bonus_value: 12, skill_point_cost: 5 },
    // -- Subtlety (utility/economy) --
    SkillTreeNode { id: "ro_subt_1", name: "Pickpocket", description: "+10% gold from kills", icon: "👛", class: "rogue", tree: "Subtlety", tier: 1, requires: &[], bonus_type: "gold_mult", bonus_value: 10, skill_point_cost: 1 },
    SkillTreeNode { id: "ro_subt_2", name: "Lucky Strike", description: "+8 LCK from fortune favoring", icon: "🍀", class: "rogue", tree: "Subtlety", tier: 2, requires: &["ro_subt_1"], bonus_type: "lck", bonus_value: 8, skill_point_cost: 2 },
    SkillTreeNode { id: "ro_subt_3", name: "Nimble Fingers", description: "+3 SPD from dexterity", icon: "🤏", class: "rogue", tree: "Subtlety", tier: 3, requires: &["ro_subt_2"], bonus_type: "spd", bonus_value: 3, skill_point_cost: 3 },
    SkillTreeNode { id: "ro_subt_4", name: "Treasure Hunter", description: "+15% XP from exploration", icon: "🗺️", class: "rogue", tree: "Subtlety", tier: 4, requires: &["ro_subt_3"], bonus_type: "xp_mult", bonus_value: 15, skill_point_cost: 4 },
    SkillTreeNode { id: "ro_subt_5", name: "Master Thief", description: "+15 LCK and +25% gold", icon: "👑", class: "rogue", tree: "Subtlety", tier: 5, requires: &["ro_subt_4"], bonus_type: "lck", bonus_value: 15, skill_point_cost: 5 },
];

// ─── Item Set Bonuses ────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ItemSetDef {
    pub id: &'static str,
    pub name: &'static str,
    pub icon: &'static str,
    pub pieces: &'static [&'static str],  // item name keywords to match
    pub bonuses: &'static [(u32, &'static str, i32)], // (pieces_needed, stat, bonus)
}

pub static ITEM_SETS: &[ItemSetDef] = &[
    // --- Tier 1: Leather Set (Lv 1-5) ---
    ItemSetDef {
        id: "leather_set", name: "Leather Ranger", icon: "🦌",
        pieces: &["Leather Cap", "Leather Armor", "Leather Pants", "Leather Boots"],
        bonuses: &[(2, "DEF", 5), (3, "SPD", 3), (4, "HP", 30)],
    },
    // --- Tier 2: Iron Set (Lv 5-10) ---
    ItemSetDef {
        id: "iron_set", name: "Iron Guardian", icon: "🛡️",
        pieces: &["Iron Helm", "Chain Mail", "Iron Greaves", "Iron Boots", "Iron Shield"],
        bonuses: &[(2, "DEF", 8), (3, "HP", 40), (4, "DEF", 12), (5, "HP", 80)],
    },
    // --- Tier 3: Steel Set (Lv 10-15) ---
    ItemSetDef {
        id: "steel_set", name: "Steel Warden", icon: "⚔️",
        pieces: &["Steel Helm", "Plate Armor", "Mithril Greaves", "Winged Boots", "Tower Shield"],
        bonuses: &[(2, "DEF", 12), (3, "ATK", 8), (4, "HP", 60), (5, "DEF", 20)],
    },
    // --- Tier 4: Mithril Set (Lv 15-20) ---
    ItemSetDef {
        id: "mithril_set", name: "Mithril Champion", icon: "💠",
        pieces: &["Mithril Crown", "Mithril Armor", "Mithril Greaves", "Winged Boots"],
        bonuses: &[(2, "DEF", 15), (3, "ATK", 12), (4, "HP", 100)],
    },
    // --- Tier 5: Dragon Set (Lv 20+) ---
    ItemSetDef {
        id: "dragon_set", name: "Dragonslayer", icon: "🐉",
        pieces: &["Dragon Helm", "Dragon Plate", "Adamantite Greaves", "Adamantite Sabatons", "Adamantite Bulwark"],
        bonuses: &[(2, "ATK", 15), (3, "DEF", 18), (4, "HP", 120), (5, "ATK", 30)],
    },
    // --- Tier 6: Shadow Set (Rogue-focused) ---
    ItemSetDef {
        id: "shadow_set", name: "Shadow Assassin", icon: "🌑",
        pieces: &["Shadow Vestments", "Shadow Leggings", "Shadow Treads", "Shadow Cloak"],
        bonuses: &[(2, "SPD", 8), (3, "ATK", 15), (4, "LCK", 20)],
    },
    // --- Tier 6: Celestial Set (Mage-focused) ---
    ItemSetDef {
        id: "celestial_set", name: "Celestial Sage", icon: "✨",
        pieces: &["Celestial Circlet", "Celestial Robe", "Celestial Cuisses", "Celestial Sandals", "Celestial Ward"],
        bonuses: &[(2, "MP", 40), (3, "ATK", 12), (4, "HP", 80), (5, "MP", 80)],
    },
    // --- Tier 6: Void Set (End-game) ---
    ItemSetDef {
        id: "void_set", name: "Void Conqueror", icon: "🕳️",
        pieces: &["Void Mask", "Void Cuirass", "Void Tassets", "Void Boots", "Void Aegis"],
        bonuses: &[(2, "ATK", 20), (3, "DEF", 20), (4, "HP", 150), (5, "ATK", 40)],
    },
];

/// Check how many pieces of each set a player has equipped, return active set bonuses
pub fn calculate_set_bonuses(equipment: &std::collections::HashMap<String, Item>) -> Vec<(&'static str, &'static str, Vec<(u32, &'static str, i32)>)> {
    let mut result = Vec::new();
    let equipped_names: Vec<&str> = equipment.values().map(|item| item.name.as_str()).collect();

    for set in ITEM_SETS {
        let mut matched = 0u32;
        for &piece_keyword in set.pieces {
            if equipped_names.iter().any(|name| name.contains(piece_keyword)) {
                matched += 1;
            }
        }
        if matched >= 2 {
            let active: Vec<(u32, &str, i32)> = set.bonuses.iter()
                .filter(|(needed, _, _)| matched >= *needed)
                .cloned()
                .collect();
            if !active.is_empty() {
                result.push((set.name, set.icon, active));
            }
        }
    }
    result
}

// ─── Consumable Definitions ──────────────────────────────────

pub const CONSUMABLE_TYPES: &[(&str, &str, &str, &str, i32)] = &[
    // (name, icon, effect_type, stat, value)
    // Potions
    ("Health Potion",      "❤️",  "instant_heal", "HP", 50),
    ("Greater Health Potion", "💖", "instant_heal", "HP", 150),
    ("Supreme Health Potion", "💗", "instant_heal", "HP", 400),
    ("Mana Potion",        "💙",  "instant_mana", "MP", 40),
    ("Greater Mana Potion", "🔵", "instant_mana", "MP", 120),
    ("Elixir of Life",     "🧪",  "instant_heal", "HP", 999),
    // Buff Potions (temporary stat boost)
    ("Strength Elixir",    "💪",  "buff_atk",  "ATK", 15),
    ("Iron Skin Elixir",   "🛡️", "buff_def",  "DEF", 15),
    ("Swiftness Elixir",   "⚡",  "buff_spd",  "SPD", 10),
    ("Fortune Elixir",     "🍀",  "buff_lck",  "LCK", 20),
    // Scrolls
    ("Scroll of Teleport",  "📜", "teleport",   "",    0),
    ("Scroll of Identify",  "🔍", "identify",   "",    0),
    ("Scroll of Enchant",   "✨",  "enchant_boost", "", 0),
    // Food (regen over time)
    ("Bread",              "🍞",  "regen_hp",  "HP",  5),
    ("Cooked Meat",        "🍖",  "regen_hp",  "HP",  10),
    ("Feast Plate",        "🍽️", "regen_both", "HP",  15),
    ("Golden Apple",       "🍎",  "regen_both", "HP",  25),
];

// ─── Fishing Loot Table ───────────────────────────────────────
// (name, icon, rarity, min_level_zone, weight, sell_value, special_stat)
pub const FISHING_LOOT: &[(&str, &str, u8, u32, u32, u64, &str)] = &[
    // Common catches
    ("Small Bass",          "🐟", 0, 1,  30, 5,   ""),
    ("Perch",               "🐟", 0, 1,  25, 8,   ""),
    ("Trout",               "🐟", 0, 1,  20, 12,  ""),
    ("Catfish",             "🐟", 0, 5,  18, 15,  ""),
    ("Pike",                "🐟", 0, 5,  15, 20,  ""),
    ("Salmon",              "🐟", 0, 10, 15, 25,  ""),
    // Uncommon catches
    ("Rainbow Trout",       "🐠", 1, 5,  12, 35,  ""),
    ("Golden Carp",         "🐠", 1, 10, 10, 50,  ""),
    ("Electric Eel",        "🐠", 1, 15, 8,  65,  ""),
    ("Swordfish",           "🐠", 1, 20, 6,  80,  ""),
    // Rare catches
    ("Moonlit Koi",         "🐡", 2, 15, 4,  150, ""),
    ("Phantom Anglerfish",  "🐡", 2, 20, 3,  200, ""),
    ("Lava Eel",            "🐡", 2, 25, 2,  300, ""),
    // Epic catches (special items)
    ("Ancient Coelacanth",  "🎏", 3, 30, 1,  500, "ATK"),
    ("Void Kraken Tentacle","🎏", 3, 35, 1,  750, "DEF"),
    ("Crystal Starfish",    "🎏", 3, 25, 1,  600, "LCK"),
    // Junk (also catch junk items sometimes)
    ("Old Boot",            "👢", 0, 1,  8,  1,   ""),
    ("Seaweed",             "🌿", 0, 1,  10, 2,   ""),
    ("Driftwood",           "🪵", 0, 1,  8,  3,   ""),
    // Materials from fishing
    ("Pearl",               "🫧", 1, 10, 5,  40,  ""),
    ("Fish Bone",           "🦴", 0, 5,  8,  10,  ""),
    ("Enchanted Scale",     "✨", 2, 20, 2,  120, ""),
];

/// Pick a random fishing catch based on zone level and luck
pub fn roll_fishing_catch(zone_level: u32, luck: i32) -> (&'static str, &'static str, u8, u64, &'static str) {
    let mut rng = rand::thread_rng();
    // Filter to eligible items and build weighted pool
    let eligible: Vec<_> = FISHING_LOOT.iter()
        .filter(|(_, _, _, min_lv, _, _, _)| zone_level >= *min_lv)
        .collect();
    if eligible.is_empty() {
        return ("Small Bass", "🐟", 0, 5, "");
    }
    // Luck increases weight of rarer items
    let luck_bonus = (luck as f64 * 0.01).max(0.0);
    let total_weight: f64 = eligible.iter().map(|(_, _, rarity, _, weight, _, _)| {
        let rarity_mult = match rarity {
            0 => 1.0,
            1 => 1.0 + luck_bonus,
            2 => 1.0 + luck_bonus * 2.0,
            3 => 1.0 + luck_bonus * 3.0,
            _ => 1.0,
        };
        *weight as f64 * rarity_mult
    }).sum();

    let mut roll = rng.gen_range(0.0..total_weight);
    for (name, icon, rarity, _, weight, value, special) in eligible.iter() {
        let rarity_mult = match rarity {
            0 => 1.0,
            1 => 1.0 + luck_bonus,
            2 => 1.0 + luck_bonus * 2.0,
            3 => 1.0 + luck_bonus * 3.0,
            _ => 1.0,
        };
        roll -= *weight as f64 * rarity_mult;
        if roll <= 0.0 {
            return (name, icon, *rarity, *value, special);
        }
    }
    let last = eligible.last().unwrap();
    (last.0, last.1, last.2, last.5, last.6)
}

// ─── Faction / Reputation System ──────────────────────────────
// (faction_id, name, icon, description)
pub const FACTIONS: &[(&str, &str, &str, &str)] = &[
    ("starfall_guard",    "Starfall Guard",     "🛡️", "Protectors of Starfall Haven. Earn rep by slaying monsters near towns."),
    ("shadow_syndicate",  "Shadow Syndicate",   "🗡️", "The underground rogues network. Earn rep by PvP and dungeon runs."),
    ("arcane_circle",     "Arcane Circle",      "🔮", "Scholarly mages seeking knowledge. Earn rep by crafting and enchanting."),
    ("merchant_league",   "Merchant League",    "💰", "Master traders of the realm. Earn rep by trading and selling."),
    ("wild_hunters",      "Wild Hunters",       "🏹", "Rangers who roam the frontier. Earn rep by fishing and exploration."),
    ("dragon_keepers",    "Dragon Keepers",     "🐉", "Ancient order bound to dragonkin. Earn rep by defeating bosses."),
];

// Reputation thresholds and titles
pub const REP_RANKS: &[(i32, &str)] = &[
    (-3000, "Hated"),
    (-1000, "Hostile"),
    (-100,  "Unfriendly"),
    (0,     "Neutral"),
    (500,   "Friendly"),
    (3000,  "Honored"),
    (9000,  "Revered"),
    (21000, "Exalted"),
];

pub fn rep_rank_name(rep: i32) -> &'static str {
    let mut rank = "Neutral";
    for (threshold, name) in REP_RANKS.iter() {
        if rep >= *threshold {
            rank = name;
        }
    }
    rank
}

// ─── Title System ─────────────────────────────────────────────
// Titles earned through various achievements
pub const TITLES: &[(&str, &str, &str)] = &[
    // (title_id, display_name, requirement_description)
    ("novice",       "Novice",          "Reach level 5"),
    ("adventurer",   "Adventurer",      "Reach level 10"),
    ("veteran",      "Veteran",         "Reach level 25"),
    ("champion",     "Champion",        "Reach level 50"),
    ("legend",       "Legend",           "Reach level 100"),
    ("dragonslayer", "Dragonslayer",    "Defeat a world boss"),
    ("artisan",      "Master Artisan",  "Craft 100 items"),
    ("merchant",     "Merchant Prince", "Earn 100,000 gold total"),
    ("angler",       "Master Angler",   "Catch 50 fish"),
    ("explorer",     "Pathfinder",      "Visit all 9 towns"),
    ("pvp_warrior",  "Gladiator",       "Win 50 PvP battles"),
    ("guild_master", "Guild Master",    "Lead a guild with 10+ members"),
    ("enchanter",    "Arcane Smith",    "Enchant an item to +10"),
    ("collector",    "Collector",       "Own 50 unique items"),
    ("speedrunner",  "Speed Demon",     "Reach level 20 in under 2 hours"),
];

// ─── Daily Login Rewards ──────────────────────────────────────
// Day number → (item_name, quantity, gold_bonus)
pub const DAILY_REWARDS: &[(u32, &str, u32, u64)] = &[
    (1,  "Minor Health Potion", 5,  50),
    (2,  "Minor Mana Potion",   5,  75),
    (3,  "Iron Ore",            10, 100),
    (4,  "Strength Elixir",     2,  150),
    (5,  "Greater Health Potion", 3, 200),
    (6,  "Enchanting Stone",    1,  250),
    (7,  "Supreme Health Potion", 2, 500),  // Weekly bonus
    (14, "Fortune Elixir",      3,  750),   // 2-week bonus
    (21, "Scroll of Teleport",  5,  1000),  // 3-week bonus
    (28, "Golden Apple",        3,  2000),  // Monthly bonus
    (30, "Feast Plate",         5,  3000),  // Month-end mega bonus
];