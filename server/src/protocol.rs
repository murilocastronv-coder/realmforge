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
pub const MSG_SET_TITLE: u8 = 30;           // Client → Server: set active title
pub const MSG_GATHER_ACTION: u8 = 32;       // Client → Server: mine/gather a node
pub const MSG_LEADERBOARD_REQUEST: u8 = 33;  // Client → Server: request leaderboard data
pub const MSG_AUCTION_ACTION: u8 = 34;       // Client → Server: auction house actions (list/buy/cancel/search)
pub const MSG_MOUNT_ACTION: u8 = 35;        // Client → Server: mount/dismount
pub const MSG_MAIL_ACTION: u8 = 36;         // Client → Server: send/read/delete mail
pub const MSG_ARENA_ACTION: u8 = 37;        // Client → Server: join/leave arena queue
pub const MSG_DAILY_QUEST_CLAIM: u8 = 38;   // Client → Server: claim daily quest reward
pub const MSG_BUY_BLESSING: u8 = 40;        // Client → Server: buy a specific blessing (bitmask)
pub const MSG_BESTIARY_REQUEST: u8 = 41;     // Client → Server: request bestiary data
pub const MSG_BOUNTY_ACTION: u8 = 42;       // Client → Server: place bounty / list bounties
pub const MSG_RUNE_CRAFT: u8 = 43;          // Client → Server: craft a rune from Blank Rune

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
pub const MSG_WEATHER_UPDATE: u8 = 92;      // Server → Client: weather change
pub const MSG_TITLE_UPDATE: u8 = 93;       // Server → Client: title unlocks/active title
pub const MSG_GATHER_RESULT: u8 = 95;      // Server → Client: gather/mine result
pub const MSG_PET_ACTION: u8 = 31;         // Client → Server: pet actions (summon, dismiss, rename, feed, hatch)
pub const MSG_PET_UPDATE: u8 = 94;         // Server → Client: pet data update
pub const MSG_LEADERBOARD_DATA: u8 = 96;    // Server → Client: leaderboard rankings
pub const MSG_AUCTION_DATA: u8 = 97;         // Server → Client: auction listings/results
pub const MSG_MOUNT_UPDATE: u8 = 98;         // Server → Client: mount state change
pub const MSG_MAIL_DATA: u8 = 99;            // Server → Client: mailbox data
pub const MSG_ARENA_UPDATE: u8 = 100;        // Server → Client: arena match/result
pub const MSG_DAILY_QUEST_DATA: u8 = 101;    // Server → Client: daily quest list/progress
pub const MSG_WORLD_EVENT_ACTIVE: u8 = 102;  // Server → Client: active world event info
pub const MSG_BLESSING_UPDATE: u8 = 104;     // Server → Client: blessings bitmask update
pub const MSG_BESTIARY_DATA: u8 = 105;       // Server → Client: bestiary entries
pub const MSG_BOUNTY_UPDATE: u8 = 106;      // Server → Client: bounty update / bounty list
pub const MSG_RUNE_RESULT: u8 = 107;        // Server → Client: rune craft result

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skull: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mounted: Option<bool>,
    #[serde(rename = "mountName")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mount_name: Option<String>,
    #[serde(rename = "arenaRating")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arena_rating: Option<i32>,
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

// ─── Auction House ──────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct AuctionListing {
    pub id: Uuid,
    pub seller_id: Uuid,
    pub seller_name: String,
    pub item: Item,
    pub price: u64,
    pub listed_at: u64, // tick when listed
    pub duration: u64,  // ticks until expiry (default 24000 = ~20 min at 20tps)
}

pub const AUCTION_TAX_RATE: f64 = 0.05; // 5% listing fee
pub const AUCTION_DURATION_TICKS: u64 = 24000; // ~20 min at 20 tps
pub const AUCTION_MAX_LISTINGS: usize = 10; // max per player
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
    // Crafting stats
    pub crafts_count: u32,
    // Daily login
    pub last_login_day: u32,
    pub login_streak: u32,
    // Achievement trackers
    pub items_enchanted: u32,
    pub guilds_joined: u32,
    pub guilds_created: u32,
    pub bosses_killed: u32,
    pub max_login_streak: u32,
    pub faction_friendly_count: u32,
    pub faction_honored_count: u32,
    pub faction_exalted_count: u32,
    // Pet / Companion system
    pub active_pet: Option<PetData>,
    pub pet_collection: Vec<PetData>,
    // Mining/Gathering
    pub mining_level: u32,
    pub mining_xp: u64,
    pub gathering_level: u32,
    pub gathering_xp: u64,
    pub last_gather_tick: u64,
    // PvP Skull System (Tibia-style)
    pub skull_type: u8,        // 0=none, 1=white, 2=red, 3=black
    pub skull_timer: u64,      // ticks remaining on skull
    pub pvp_kills_today: u32,  // kills in current "day" cycle
    pub pvp_day_tick: u64,     // tick when day counter resets
    // Blessings (death penalty reduction, bitmask)
    pub blessings: u8,         // bitmask: bit0=Adventurer, bit1=Spiritual, bit2=Phoenix, bit3=Embrace, bit4=Twist of Fate
    // Stamina (Tibia-style)
    pub stamina_minutes: u32,  // Max 2520 (42h). > 2400 = bonus XP zone
    pub last_stamina_tick: u64,
    // Bestiary
    pub bestiary: HashMap<String, u32>, // enemy_type → kill_count
    // Party stat buffs (recalculated periodically)
    pub party_bonus_atk: i32,
    pub party_bonus_def: i32,
    pub party_bonus_hp: i32,
    // Combat combo system
    pub combo_count: u32,
    pub combo_timer: f64,  // ticks until combo resets
    // Mount system
    pub mounted: bool,
    pub mount_speed_bonus: f64, // 0.0 = no mount, 0.3-1.0 = horse-dragon
    pub mount_name: String,
    // Daily quests
    pub daily_quests: Vec<DailyQuest>,
    pub daily_reset_tick: u64, // tick when dailies reset
    // Mail system
    pub mailbox: Vec<MailMessage>,
    // Arena PvP
    pub arena_rating: i32,
    pub arena_wins: u32,
    pub arena_losses: u32,
    pub arena_queue: bool,  // waiting for match
    // Trade
    pub trade_partner: Option<uuid::Uuid>,
    pub trade_offer_items: Vec<usize>,  // inventory slot indices
    pub trade_offer_gold: u64,
    pub trade_confirmed: bool,
    // Bounty
    pub bounty_gold: u64,  // total bounty on this player's head
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DailyQuest {
    pub quest_id: String,
    pub title: String,
    pub description: String,
    pub objective: String,     // "kill_enemies", "gather_resources", "craft_items", "earn_gold", "complete_dungeon"
    pub target: u32,
    pub progress: u32,
    pub completed: bool,
    pub reward_xp: u64,
    pub reward_gold: u64,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct MailMessage {
    pub id: String,
    pub from: String,
    pub subject: String,
    pub body: String,
    pub gold: u64,
    pub item: Option<Item>,
    pub read: bool,
    pub tick: u64,
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
            crafts_count: 0,
            last_login_day: 0,
            login_streak: 0,
            items_enchanted: 0,
            guilds_joined: 0,
            guilds_created: 0,
            bosses_killed: 0,
            max_login_streak: 0,
            faction_friendly_count: 0,
            faction_honored_count: 0,
            faction_exalted_count: 0,
            active_pet: None,
            pet_collection: Vec::new(),
            mining_level: 1,
            mining_xp: 0,
            gathering_level: 1,
            gathering_xp: 0,
            last_gather_tick: 0,
            skull_type: 0,
            skull_timer: 0,
            pvp_kills_today: 0,
            pvp_day_tick: 0,
            blessings: 0,
            stamina_minutes: 2520,
            last_stamina_tick: 0,
            bestiary: HashMap::new(),
            party_bonus_atk: 0,
            party_bonus_def: 0,
            party_bonus_hp: 0,
            combo_count: 0,
            combo_timer: 0.0,
            mounted: false,
            mount_speed_bonus: 0.0,
            mount_name: String::new(),
            daily_quests: Vec::new(),
            daily_reset_tick: 0,
            mailbox: Vec::new(),
            arena_rating: 1000,
            arena_wins: 0,
            arena_losses: 0,
            arena_queue: false,
            trade_partner: None,
            trade_offer_items: Vec::new(),
            trade_offer_gold: 0,
            trade_confirmed: false,
            bounty_gold: 0,
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
            skull: if self.skull_type > 0 { Some(self.skull_type) } else { None },
            mounted: if self.mounted { Some(true) } else { None },
            mount_name: if self.mounted { Some(self.mount_name.clone()) } else { None },
            arena_rating: if self.arena_rating != 1000 { Some(self.arena_rating) } else { None },
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
        let pet_bonus = self.pet_bonus("ATK");
        self.atk + equip_bonus + set_bonus + pet_bonus + self.party_bonus_atk
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
        let pet_bonus = self.pet_bonus("DEF");
        self.def + equip_bonus + set_bonus + pet_bonus + self.party_bonus_def
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
        let pet_bonus = self.pet_bonus("LCK");
        self.lck + equip_bonus + set_bonus + pet_bonus
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
        let pet_bonus = self.pet_bonus("HP");
        equip_bonus + set_bonus + pet_bonus + self.party_bonus_hp
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
        let pet_bonus = self.pet_bonus("MP");
        equip_bonus + set_bonus + pet_bonus
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
        let pet_bonus = self.pet_bonus("SPD");
        equip_bonus + set_bonus + pet_bonus
    }

    /// Returns the bonus value from the active pet for a given stat key.
    fn pet_bonus(&self, stat: &str) -> i32 {
        match &self.active_pet {
            Some(pet) if pet.bonus_stat == stat => pet.bonus_value,
            _ => 0,
        }
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
    pub stun_ticks: u32,    // CC: cannot move or attack while > 0
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

// ─── Pet / Companion System ──────────────────────────────────

#[derive(Clone, Debug)]
pub struct PetData {
    pub id: String,
    pub name: String,
    pub pet_type: String,  // "wolf", "cat", "phoenix", etc.
    pub icon: String,      // emoji
    pub level: u32,
    pub xp: u64,
    pub xp_to_next: u64,
    pub bonus_stat: String, // "ATK", "DEF", "LCK", "HP", "SPD", "MP"
    pub bonus_value: i32,
    pub rarity: u8,        // 0-5
}

impl PetData {
    pub fn to_payload(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "name": self.name,
            "petType": self.pet_type,
            "icon": self.icon,
            "level": self.level,
            "xp": self.xp,
            "xpToNext": self.xp_to_next,
            "bonusStat": self.bonus_stat,
            "bonusValue": self.bonus_value,
            "rarity": self.rarity,
        })
    }
}

pub const PET_CATALOG: &[(&str, &str, &str, &str, i32, u8)] = &[
    // (pet_type, name, icon, bonus_stat, bonus_value_per_level, rarity)
    ("wolf",        "Wolf Pup",         "🐺", "ATK", 2, 0),
    ("cat",         "Shadow Cat",       "🐱", "LCK", 3, 0),
    ("owl",         "Wise Owl",         "🦉", "MP",  2, 1),
    ("bear",        "Bear Cub",         "🐻", "HP",  5, 1),
    ("hawk",        "Battle Hawk",      "🦅", "SPD", 2, 1),
    ("fox",         "Mystic Fox",       "🦊", "LCK", 4, 2),
    ("dragon",      "Baby Dragon",      "🐉", "ATK", 4, 2),
    ("phoenix",     "Phoenix Hatchling","🔥", "HP",  8, 3),
    ("unicorn",     "Unicorn Foal",     "🦄", "MP",  5, 3),
    ("cerberus",    "Cerberus Pup",     "👹", "DEF", 5, 3),
    ("fairy",       "Fairy Companion",  "🧚", "LCK", 6, 4),
    ("golem",       "Stone Golem",      "🪨", "DEF", 7, 4),
    ("void_spirit", "Void Spirit",      "👻", "ATK", 8, 5),
];

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
            skull: None,
            mounted: None,
            mount_name: None,
            arena_rating: None,
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

    // 18% chance to drop a consumable (potions, food, elixirs, scrolls)
    if rng.gen_bool(0.18) {
        let potion_roll: f64 = rng.r#gen();
        let (consumable_name, rarity) = if zone_level >= 20 && potion_roll < 0.05 {
            ("Divine Health Potion", 3)
        } else if zone_level >= 15 && potion_roll < 0.12 {
            ("Supreme Health Potion", 2)
        } else if zone_level >= 8 && potion_roll < 0.25 {
            ("Greater Health Potion", 1)
        } else if potion_roll < 0.38 {
            ("Health Potion", 0)
        } else if potion_roll < 0.48 {
            ("Mana Potion", 0)
        } else if zone_level >= 10 && potion_roll < 0.52 {
            ("Greater Mana Potion", 1)
        } else if potion_roll < 0.58 {
            ("Bread", 0)
        } else if potion_roll < 0.64 {
            ("Cooked Meat", 0)
        } else if zone_level >= 5 && potion_roll < 0.69 {
            ("Grilled Fish", 0)
        } else if potion_roll < 0.74 {
            ("Strength Elixir", 2)
        } else if potion_roll < 0.78 {
            ("Fortune Elixir", 2)
        } else if zone_level >= 10 && potion_roll < 0.82 {
            ("Speed Elixir", 2)
        } else if zone_level >= 12 && potion_roll < 0.86 {
            ("Defense Elixir", 2)
        } else if zone_level >= 15 && potion_roll < 0.89 {
            ("Berserker Draught", 3)
        } else if zone_level >= 8 && potion_roll < 0.92 {
            ("Scroll of Town Portal", 1)
        } else if zone_level >= 15 && potion_roll < 0.95 {
            ("Scroll of Identify", 1)
        } else if zone_level >= 20 && potion_roll < 0.97 {
            ("Elixir of Experience", 3)
        } else {
            ("Antidote", 0)
        };
        loot.push(Item::new_consumable(consumable_name, rarity, 1));
    }

    // 2% chance to drop a Pet Egg
    if rng.gen_bool(0.02) {
        let catalog_entry = PET_CATALOG[rng.gen_range(0..PET_CATALOG.len())];
        let (pet_type, pet_name, pet_icon, _, _, egg_rarity) = catalog_entry;
        let egg_name = format!("Pet Egg ({})", pet_name);
        let template_id = format!("pet_egg_{}", pet_type);
        let mut egg = Item::new_material(&egg_name, egg_rarity, 1);
        egg.template_id = template_id;
        egg.stackable = false; // each egg is unique
        egg.description = format!("{} Hatch to summon a {} companion!", pet_icon, pet_name);
        loot.push(egg);
    }

    // 5% chance to drop a Blank Rune
    if rng.gen_bool(0.05) {
        loot.push(Item::new_material("Blank Rune", 1, 1));
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

/// Calculate items dropped on PvP death — skull-based drop rates
pub fn pvp_death_drops(player: &mut PlayerData) -> (Vec<Item>, u64) {
    let mut rng = rand::thread_rng();
    let mut dropped = Vec::new();

    // Don't drop anything for protected players (level < 10)
    if player.pvp_protection {
        return (dropped, 0);
    }

    // Drop chance based on skull type of the DYING player
    // Blessings (bitmask) reduce drop chance by 8% each (up to 40% with 5)
    let base_drop_chance: f64 = match player.skull_type {
        3 => 0.80, // Black skull: drop 80%
        2 => 0.50, // Red skull: drop 50%
        _ => 0.30, // Normal/white: drop 30%
    };
    let blessing_count = player.blessings.count_ones() as f64;
    let blessing_reduction = blessing_count * 0.08;
    let drop_chance = (base_drop_chance - blessing_reduction).max(0.05);

    // Drop inventory items
    for slot in player.inventory.iter_mut() {
        if let Some(item) = slot {
            if rng.gen_bool(drop_chance) {
                dropped.push(item.clone());
                *slot = None;
            }
        }
    }

    // Gold drop scales with skull too
    let gold_pct = match player.skull_type {
        3 => 50, // Black: lose 50%
        2 => 30, // Red: lose 30%
        _ => 10, // Normal: lose 10%
    };
    let gold_drop = player.gold * gold_pct / 100;
    player.gold -= gold_drop;

    // Consume blessings on death: Twist of Fate (bit4) preserves other blessings
    if player.blessings > 0 {
        if player.blessings & (1 << 4) != 0 {
            // Has Twist of Fate: only consume bit4, keep rest
            player.blessings &= !(1 << 4);
        } else {
            player.blessings = 0;
        }
    }

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
    // === Class Trials (Lv 15-25) ===
    QuestDef {
        id: "warrior_trial", title: "Trial of the Warrior", icon: "🗡️",
        description: "Face the toughest enemies to prove your strength.",
        min_level: 15, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 20 Elite enemies", obj_type: "kill_rank", target: "elite", count: 20 },
            QuestObjDef { description: "Reach 50 ATK", obj_type: "stat_min", target: "atk", count: 50 },
        ],
        reward_xp: 3000, reward_gold: 2000, reward_items: &[("Gladiator's Blade", 3, 20)],
    },
    QuestDef {
        id: "mage_trial", title: "Trial of the Arcane", icon: "🔮",
        description: "Demonstrate mastery over the magical arts.",
        min_level: 15, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Craft 10 runes", obj_type: "craft", target: "rune", count: 10 },
            QuestObjDef { description: "Kill 15 enemies with spells", obj_type: "kill", target: "", count: 15 },
        ],
        reward_xp: 3000, reward_gold: 2000, reward_items: &[("Archmage's Staff", 3, 20)],
    },
    QuestDef {
        id: "rogue_trial", title: "Trial of Shadows", icon: "🗡️",
        description: "Prove you can strike unseen and escape unharmed.",
        min_level: 15, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 30 enemies", obj_type: "kill", target: "", count: 30 },
            QuestObjDef { description: "Collect 5000 gold", obj_type: "gold", target: "", count: 5000 },
        ],
        reward_xp: 3000, reward_gold: 2000, reward_items: &[("Shadow Dagger", 3, 20)],
    },
    QuestDef {
        id: "ranger_trial", title: "Trial of the Wild", icon: "🏹",
        description: "Master the wilds and hunt the most dangerous beasts.",
        min_level: 15, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 10 different enemy types", obj_type: "kill", target: "", count: 10 },
            QuestObjDef { description: "Catch 20 fish", obj_type: "craft", target: "fish", count: 20 },
        ],
        reward_xp: 3000, reward_gold: 2000, reward_items: &[("Elven Longbow", 3, 20)],
    },
    // === Story Arc: The Corruption (Lv 10-30) ===
    QuestDef {
        id: "corruption_1", title: "Whispers in the Dark", icon: "🌑",
        description: "Strange creatures have been spotted near the towns. Investigate the source.",
        min_level: 10, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 15 Undead enemies", obj_type: "kill_type", target: "skeleton", count: 15 },
            QuestObjDef { description: "Visit the Swamp biome", obj_type: "visit_biome", target: "swamp", count: 1 },
        ],
        reward_xp: 2000, reward_gold: 1000, reward_items: &[],
    },
    QuestDef {
        id: "corruption_2", title: "The Plagued Lands", icon: "☠️",
        description: "The corruption spreads. Push deeper into the infected zones.",
        min_level: 15, prerequisites: &["corruption_1"],
        objectives: &[
            QuestObjDef { description: "Kill 25 Swamp enemies", obj_type: "kill_type", target: "swamp", count: 25 },
            QuestObjDef { description: "Collect 10 materials", obj_type: "collect", target: "material", count: 10 },
        ],
        reward_xp: 3500, reward_gold: 1500, reward_items: &[("Purification Amulet", 2, 15)],
    },
    QuestDef {
        id: "corruption_3", title: "Heart of Darkness", icon: "💀",
        description: "A powerful necromancer controls the corruption. End this threat.",
        min_level: 25, prerequisites: &["corruption_2"],
        objectives: &[
            QuestObjDef { description: "Kill 5 Boss enemies", obj_type: "kill_rank", target: "boss", count: 5 },
            QuestObjDef { description: "Reach level 25", obj_type: "level", target: "", count: 25 },
        ],
        reward_xp: 8000, reward_gold: 5000, reward_items: &[("Crown of the Undying", 4, 25)],
    },
    // === Endgame Challenges (Lv 30+) ===
    QuestDef {
        id: "dragon_slayer", title: "Dragon Slayer", icon: "🐉",
        description: "The great dragon terrorizes the realm. Only the bravest dare challenge it.",
        min_level: 35, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 3 World Bosses", obj_type: "kill_rank", target: "boss", count: 3 },
            QuestObjDef { description: "Reach level 35", obj_type: "level", target: "", count: 35 },
        ],
        reward_xp: 15000, reward_gold: 10000, reward_items: &[("Dragonscale Armor", 4, 35)],
    },
    QuestDef {
        id: "pvp_champion", title: "Champion of the Arena", icon: "🏆",
        description: "Prove your might against other players in the arena.",
        min_level: 20, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Win 25 Arena matches", obj_type: "kill", target: "arena_wins", count: 25 },
        ],
        reward_xp: 5000, reward_gold: 3000, reward_items: &[("Champion's Ring", 3, 20)],
    },
    QuestDef {
        id: "master_crafter", title: "Master of the Forge", icon: "🔨",
        description: "Achieve true mastery of the crafting arts.",
        min_level: 20, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Craft 50 items", obj_type: "craft", target: "", count: 50 },
            QuestObjDef { description: "Mine 100 ore", obj_type: "craft", target: "mine", count: 100 },
        ],
        reward_xp: 4000, reward_gold: 3000, reward_items: &[("Artisan's Hammer", 3, 20)],
    },
    QuestDef {
        id: "wealth_collector", title: "The Treasure Hoarder", icon: "💰",
        description: "Amass an incredible fortune through any means necessary.",
        min_level: 15, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Accumulate 50000 gold", obj_type: "gold", target: "", count: 50000 },
        ],
        reward_xp: 3000, reward_gold: 10000, reward_items: &[],
    },
    QuestDef {
        id: "explorer_supreme", title: "Explorer Supreme", icon: "🗺️",
        description: "Visit every biome in the realm and uncover its secrets.",
        min_level: 10, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Visit the Desert biome", obj_type: "visit_biome", target: "desert", count: 1 },
            QuestObjDef { description: "Visit the Tundra biome", obj_type: "visit_biome", target: "tundra", count: 1 },
            QuestObjDef { description: "Visit the Mountain biome", obj_type: "visit_biome", target: "mountain", count: 1 },
            QuestObjDef { description: "Visit the Swamp biome", obj_type: "visit_biome", target: "swamp", count: 1 },
        ],
        reward_xp: 2500, reward_gold: 1500, reward_items: &[("Explorer's Boots", 2, 10)],
    },
    QuestDef {
        id: "bounty_hunter", title: "Bounty Hunter", icon: "🏴‍☠️",
        description: "Track down and eliminate wanted criminals.",
        min_level: 20, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 10 players with bounties", obj_type: "kill", target: "pvp_kills", count: 10 },
        ],
        reward_xp: 5000, reward_gold: 5000, reward_items: &[],
    },
    QuestDef {
        id: "guild_hero", title: "Guild Hero", icon: "🏰",
        description: "Lead your guild to greatness through dedicated service.",
        min_level: 15, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 200 enemies while in a guild", obj_type: "kill", target: "", count: 200 },
        ],
        reward_xp: 4000, reward_gold: 3000, reward_items: &[("Guild Banner", 2, 15)],
    },
    QuestDef {
        id: "legendary_quest", title: "The Legendary Path", icon: "⭐",
        description: "Only the greatest heroes can walk this path. Reach the pinnacle of power.",
        min_level: 40, prerequisites: &["dragon_slayer", "corruption_3"],
        objectives: &[
            QuestObjDef { description: "Reach level 45", obj_type: "level", target: "", count: 45 },
            QuestObjDef { description: "Kill 500 enemies", obj_type: "kill", target: "", count: 500 },
            QuestObjDef { description: "Craft 100 items", obj_type: "craft", target: "", count: 100 },
        ],
        reward_xp: 50000, reward_gold: 25000, reward_items: &[("Godly Amulet of Kings", 5, 45)],
    },
    // === Dungeon Expedition Quests ===
    QuestDef {
        id: "ashfall_expedition", title: "Into the Furnace", icon: "🔥",
        description: "The Ashfall Furnace has awoken. Brave its molten depths.",
        min_level: 30, prerequisites: &["corruption_3"],
        objectives: &[
            QuestObjDef { description: "Kill 40 enemies in Ashfall Furnace", obj_type: "kill", target: "", count: 40 },
            QuestObjDef { description: "Reach level 35", obj_type: "level", target: "", count: 35 },
        ],
        reward_xp: 20000, reward_gold: 12000, reward_items: &[("Obsidian Shard", 3, 30)],
    },
    QuestDef {
        id: "twilight_expedition", title: "Shadows of Twilight", icon: "🌙",
        description: "An ancient evil stirs in the Twilight Sanctum. Investigate the darkness.",
        min_level: 25, prerequisites: &["undead_purge"],
        objectives: &[
            QuestObjDef { description: "Kill 35 enemies in Twilight Sanctum", obj_type: "kill", target: "", count: 35 },
        ],
        reward_xp: 15000, reward_gold: 8000, reward_items: &[("Shadow Essence", 3, 25)],
    },
    QuestDef {
        id: "celestial_ascent", title: "Celestial Ascension", icon: "⭐",
        description: "The Celestial Spire calls only the worthy. Ascend and prove yourself.",
        min_level: 40, prerequisites: &["legendary_quest"],
        objectives: &[
            QuestObjDef { description: "Kill 50 enemies in Celestial Spire", obj_type: "kill", target: "", count: 50 },
            QuestObjDef { description: "Reach level 48", obj_type: "level", target: "", count: 48 },
        ],
        reward_xp: 60000, reward_gold: 30000, reward_items: &[("Crown of Constellations", 5, 45)],
    },
    // === Daily/Repeatable Style Quests ===
    QuestDef {
        id: "bounty_hunter", title: "The Bounty Hunter", icon: "🏴‍☠️",
        description: "Prove yourself as a hunter of men. Track down bounty targets.",
        min_level: 15, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 5 players with bounties", obj_type: "kill", target: "", count: 5 },
        ],
        reward_xp: 8000, reward_gold: 5000, reward_items: &[("Hunter's Badge", 3, 15)],
    },
    QuestDef {
        id: "rune_scholar", title: "The Rune Scholar", icon: "🔮",
        description: "Master the ancient art of rune crafting.",
        min_level: 10, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Craft 10 runes", obj_type: "craft", target: "", count: 10 },
        ],
        reward_xp: 5000, reward_gold: 3000, reward_items: &[("Blank Rune", 2, 10)],
    },
    QuestDef {
        id: "explorer_frontier", title: "Frontier Explorer", icon: "🗺️",
        description: "Venture to the farthest reaches of the world.",
        min_level: 20, prerequisites: &[],
        objectives: &[
            QuestObjDef { description: "Kill 20 enemies level 25+", obj_type: "kill", target: "", count: 20 },
            QuestObjDef { description: "Kill 10 elite enemies", obj_type: "kill", target: "", count: 10 },
        ],
        reward_xp: 10000, reward_gold: 6000, reward_items: &[("Explorer's Compass", 3, 20)],
    },
    QuestDef {
        id: "master_crafter", title: "Master Artisan", icon: "🔨",
        description: "Become a master of all crafts.",
        min_level: 25, prerequisites: &["rune_scholar"],
        objectives: &[
            QuestObjDef { description: "Craft 50 items total", obj_type: "craft", target: "", count: 50 },
        ],
        reward_xp: 12000, reward_gold: 8000, reward_items: &[("Master Crafter's Hammer", 4, 25)],
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
    // Fishing
    AchievementDef { id: "fish_1", title: "Gone Fishin'", description: "Catch your first fish.", icon: "🎣", category: "exploration", tracker: "fish_caught", target: 1 },
    AchievementDef { id: "fish_10", title: "Fisherman", description: "Catch 10 fish.", icon: "🐟", category: "exploration", tracker: "fish_caught", target: 10 },
    AchievementDef { id: "fish_50", title: "Master Angler", description: "Catch 50 fish.", icon: "🐠", category: "exploration", tracker: "fish_caught", target: 50 },
    AchievementDef { id: "fish_100", title: "Legendary Fisher", description: "Catch 100 fish.", icon: "🦈", category: "exploration", tracker: "fish_caught", target: 100 },
    // Enchanting
    AchievementDef { id: "enchant_1", title: "Apprentice Enchanter", description: "Enchant your first item.", icon: "✨", category: "crafting", tracker: "items_enchanted", target: 1 },
    AchievementDef { id: "enchant_10", title: "Enchanter", description: "Enchant 10 items.", icon: "🔮", category: "crafting", tracker: "items_enchanted", target: 10 },
    AchievementDef { id: "enchant_50", title: "Arcane Master", description: "Enchant 50 items.", icon: "💎", category: "crafting", tracker: "items_enchanted", target: 50 },
    // Guilds
    AchievementDef { id: "guild_join", title: "Team Player", description: "Join a guild.", icon: "🏰", category: "social", tracker: "guilds_joined", target: 1 },
    AchievementDef { id: "guild_create", title: "Guild Founder", description: "Create a guild.", icon: "🏴", category: "social", tracker: "guilds_created", target: 1 },
    // Factions
    AchievementDef { id: "faction_friendly", title: "Friendly Face", description: "Reach Friendly with any faction.", icon: "😊", category: "social", tracker: "faction_friendly_count", target: 1 },
    AchievementDef { id: "faction_honored", title: "Honored", description: "Reach Honored with any faction.", icon: "🎖️", category: "social", tracker: "faction_honored_count", target: 1 },
    AchievementDef { id: "faction_exalted", title: "Exalted Champion", description: "Reach Exalted with any faction.", icon: "👑", category: "social", tracker: "faction_exalted_count", target: 1 },
    // Login streaks
    AchievementDef { id: "login_7", title: "Dedicated", description: "Log in 7 days in a row.", icon: "📅", category: "social", tracker: "max_login_streak", target: 7 },
    AchievementDef { id: "login_30", title: "Devoted", description: "Log in 30 days in a row.", icon: "🗓️", category: "social", tracker: "max_login_streak", target: 30 },
    // Boss kills
    AchievementDef { id: "boss_1", title: "Boss Slayer", description: "Defeat your first boss.", icon: "💀", category: "combat", tracker: "bosses_killed", target: 1 },
    AchievementDef { id: "boss_5", title: "Boss Hunter", description: "Defeat 5 bosses.", icon: "☠️", category: "combat", tracker: "bosses_killed", target: 5 },
    AchievementDef { id: "boss_25", title: "Boss Destroyer", description: "Defeat 25 bosses.", icon: "🔥", category: "combat", tracker: "bosses_killed", target: 25 },
    // High-level combat
    AchievementDef { id: "killer_500", title: "Exterminator", description: "Defeat 500 enemies.", icon: "💥", category: "combat", tracker: "enemies_killed", target: 500 },
    AchievementDef { id: "killer_1000", title: "Legendary Warrior", description: "Defeat 1,000 enemies.", icon: "⚡", category: "combat", tracker: "enemies_killed", target: 1000 },
    // Crafting milestones
    AchievementDef { id: "craft_100", title: "Grand Artisan", description: "Craft 100 items.", icon: "🏗️", category: "crafting", tracker: "items_crafted", target: 100 },
    AchievementDef { id: "gold_100k", title: "Mogul", description: "Earn 100,000 gold total.", icon: "🏦", category: "social", tracker: "gold_earned", target: 100000 },
    // ─── Phase 11: New Achievements ───
    // PvP achievements
    AchievementDef { id: "pvp_10", title: "PvP Veteran", description: "Win 10 PvP battles.", icon: "⚔️", category: "combat", tracker: "pvp_kills", target: 10 },
    AchievementDef { id: "pvp_50", title: "PvP Legend", description: "Win 50 PvP battles.", icon: "🏆", category: "combat", tracker: "pvp_kills", target: 50 },
    AchievementDef { id: "pvp_100", title: "Gladiator", description: "Win 100 PvP battles.", icon: "👑", category: "combat", tracker: "pvp_kills", target: 100 },
    // Arena achievements
    AchievementDef { id: "arena_10", title: "Arena Fighter", description: "Win 10 arena matches.", icon: "🏟️", category: "combat", tracker: "arena_wins", target: 10 },
    AchievementDef { id: "arena_50", title: "Arena Champion", description: "Win 50 arena matches.", icon: "🏟️", category: "combat", tracker: "arena_wins", target: 50 },
    // Extreme kill counts
    AchievementDef { id: "killer_5000", title: "Apocalypse Bringer", description: "Defeat 5,000 enemies.", icon: "🌋", category: "combat", tracker: "enemies_killed", target: 5000 },
    AchievementDef { id: "killer_10000", title: "God of War", description: "Defeat 10,000 enemies.", icon: "⚡", category: "combat", tracker: "enemies_killed", target: 10000 },
    // Mining achievements
    AchievementDef { id: "mine_50", title: "Prospector", description: "Mine 50 nodes.", icon: "⛏️", category: "crafting", tracker: "nodes_mined", target: 50 },
    AchievementDef { id: "mine_200", title: "Master Miner", description: "Mine 200 nodes.", icon: "⛏️", category: "crafting", tracker: "nodes_mined", target: 200 },
    // Crafting extreme
    AchievementDef { id: "craft_500", title: "Legendary Crafter", description: "Craft 500 items.", icon: "🔨", category: "crafting", tracker: "items_crafted", target: 500 },
    // Gold extreme
    AchievementDef { id: "gold_1m", title: "Tycoon", description: "Earn 1,000,000 gold total.", icon: "💰", category: "social", tracker: "gold_earned", target: 1000000 },
    // Boss killing
    AchievementDef { id: "boss_50", title: "Boss Annihilator", description: "Defeat 50 bosses.", icon: "💀", category: "combat", tracker: "bosses_killed", target: 50 },
    AchievementDef { id: "boss_100", title: "Raid Master", description: "Defeat 100 bosses.", icon: "👑", category: "combat", tracker: "bosses_killed", target: 100 },
    // Enchanting
    AchievementDef { id: "enchant_50", title: "Master Enchanter", description: "Enchant 50 items.", icon: "✨", category: "crafting", tracker: "items_enchanted", target: 50 },
    // Fishing
    AchievementDef { id: "fish_100", title: "Master Angler", description: "Catch 100 fish.", icon: "🎣", category: "crafting", tracker: "fish_caught", target: 100 },
    AchievementDef { id: "fish_500", title: "Legendary Angler", description: "Catch 500 fish.", icon: "🐟", category: "crafting", tracker: "fish_caught", target: 500 },
    // Level milestones
    AchievementDef { id: "level_25", title: "Rising Hero", description: "Reach level 25.", icon: "⭐", category: "exploration", tracker: "level", target: 25 },
    AchievementDef { id: "level_40", title: "Legendary Hero", description: "Reach level 40.", icon: "🌟", category: "exploration", tracker: "level", target: 40 },
    AchievementDef { id: "level_50", title: "Transcendent", description: "Reach level 50.", icon: "💫", category: "exploration", tracker: "level", target: 50 },
    // === Dungeon Explorer ===
    AchievementDef { id: "dungeon_10", title: "Dungeon Crawler", description: "Kill 10 dungeon enemies.", icon: "🏚️", category: "exploration", tracker: "dungeon_kills", target: 10 },
    AchievementDef { id: "dungeon_50", title: "Dungeon Delver", description: "Kill 50 dungeon enemies.", icon: "🗝️", category: "exploration", tracker: "dungeon_kills", target: 50 },
    AchievementDef { id: "dungeon_200", title: "Dungeon Master", description: "Kill 200 dungeon enemies.", icon: "🏛️", category: "exploration", tracker: "dungeon_kills", target: 200 },
    // === Bounty Hunting ===
    AchievementDef { id: "bounty_claim_1", title: "Bounty Novice", description: "Claim your first bounty.", icon: "🏴‍☠️", category: "combat", tracker: "bounties_claimed", target: 1 },
    AchievementDef { id: "bounty_claim_10", title: "Bounty Expert", description: "Claim 10 bounties.", icon: "💀", category: "combat", tracker: "bounties_claimed", target: 10 },
    // === Rune Crafting ===
    AchievementDef { id: "runes_5", title: "Rune Initiate", description: "Craft 5 runes.", icon: "🔮", category: "crafting", tracker: "runes_crafted", target: 5 },
    AchievementDef { id: "runes_25", title: "Rune Adept", description: "Craft 25 runes.", icon: "✨", category: "crafting", tracker: "runes_crafted", target: 25 },
    AchievementDef { id: "runes_100", title: "Rune Master", description: "Craft 100 runes.", icon: "🌟", category: "crafting", tracker: "runes_crafted", target: 100 },
    // === Economy ===
    AchievementDef { id: "auction_sell_10", title: "Merchant", description: "Sell 10 items at auction.", icon: "🏪", category: "social", tracker: "auction_sales", target: 10 },
    AchievementDef { id: "auction_sell_100", title: "Trade Mogul", description: "Sell 100 items at auction.", icon: "💰", category: "social", tracker: "auction_sales", target: 100 },
    // === Survival ===
    AchievementDef { id: "deaths_0", title: "Untouchable", description: "Reach level 10 without dying.", icon: "🛡️", category: "progression", tracker: "deathless_to_10", target: 1 },
    AchievementDef { id: "deaths_50", title: "Persistent", description: "Die 50 times and keep going.", icon: "💪", category: "progression", tracker: "total_deaths", target: 50 },
    // === Bestiary ===
    AchievementDef { id: "bestiary_10", title: "Naturalist", description: "Discover 10 enemy species.", icon: "📖", category: "exploration", tracker: "bestiary_entries", target: 10 },
    AchievementDef { id: "bestiary_30", title: "Zoologist", description: "Discover 30 enemy species.", icon: "📚", category: "exploration", tracker: "bestiary_entries", target: 30 },
    AchievementDef { id: "bestiary_50", title: "Encyclopedist", description: "Discover 50 enemy species.", icon: "🏆", category: "exploration", tracker: "bestiary_entries", target: 50 },
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
    WorldBossDef {
        id: "crystal_queen", name: "Crystalia", title: "the Crystal Queen",
        spawn_x: -30.0, spawn_y: 95.0, base_level: 22,
        hp_mult: 14.0, atk_mult: 5.5, def_mult: 4.5,
        modifiers: &[EnemyModifier::Shielded, EnemyModifier::Reflector, EnemyModifier::Regenerator],
        phase_thresholds: &[0.70, 0.40],
        summon_count: 4,
    },
    WorldBossDef {
        id: "necro_lord", name: "Malachar", title: "the Necro Lord",
        spawn_x: -95.0, spawn_y: -45.0, base_level: 28,
        hp_mult: 16.0, atk_mult: 6.5, def_mult: 3.5,
        modifiers: &[EnemyModifier::Summoner, EnemyModifier::Vampiric, EnemyModifier::Undying, EnemyModifier::Poisonous],
        phase_thresholds: &[0.80, 0.60, 0.40, 0.20],
        summon_count: 8,
    },
    WorldBossDef {
        id: "storm_dragon", name: "Voltharion", title: "the Storm Dragon",
        spawn_x: 130.0, spawn_y: 10.0, base_level: 35,
        hp_mult: 22.0, atk_mult: 8.0, def_mult: 5.0,
        modifiers: &[EnemyModifier::Swift, EnemyModifier::Burning, EnemyModifier::Explosive, EnemyModifier::Enraged],
        phase_thresholds: &[0.75, 0.50, 0.25, 0.10],
        summon_count: 5,
    },
    WorldBossDef {
        id: "abyssal_horror", name: "Xal'Theron", title: "the Abyssal Horror",
        spawn_x: 105.0, spawn_y: -95.0, base_level: 40,
        hp_mult: 25.0, atk_mult: 9.0, def_mult: 6.0,
        modifiers: &[EnemyModifier::Draining, EnemyModifier::Teleporter, EnemyModifier::Berserker, EnemyModifier::Shielded, EnemyModifier::Poisonous],
        phase_thresholds: &[0.80, 0.60, 0.40, 0.20, 0.05],
        summon_count: 7,
    },
    WorldBossDef {
        id: "plague_titan", name: "Pestilux", title: "the Plague Titan",
        spawn_x: -50.0, spawn_y: -130.0, base_level: 35,
        hp_mult: 20.0, atk_mult: 7.0, def_mult: 4.0,
        modifiers: &[EnemyModifier::Poisonous, EnemyModifier::Regenerator, EnemyModifier::Summoner, EnemyModifier::Explosive],
        phase_thresholds: &[0.75, 0.50, 0.25],
        summon_count: 6,
    },
    WorldBossDef {
        id: "sand_emperor", name: "Kha'Zarak", title: "the Sand Emperor",
        spawn_x: 140.0, spawn_y: 80.0, base_level: 32,
        hp_mult: 18.0, atk_mult: 6.0, def_mult: 5.5,
        modifiers: &[EnemyModifier::Armored, EnemyModifier::Swift, EnemyModifier::Burning, EnemyModifier::Reflector],
        phase_thresholds: &[0.70, 0.40, 0.10],
        summon_count: 5,
    },
    WorldBossDef {
        id: "moon_dragon", name: "Lunaris", title: "the Moon Dragon",
        spawn_x: -120.0, spawn_y: 110.0, base_level: 38,
        hp_mult: 24.0, atk_mult: 8.5, def_mult: 5.5,
        modifiers: &[EnemyModifier::Freezing, EnemyModifier::Teleporter, EnemyModifier::Shielded, EnemyModifier::Swift],
        phase_thresholds: &[0.80, 0.55, 0.30, 0.10],
        summon_count: 6,
    },
    WorldBossDef {
        id: "demon_king", name: "Azmodan", title: "the Demon King",
        spawn_x: 0.0, spawn_y: 150.0, base_level: 45,
        hp_mult: 30.0, atk_mult: 10.0, def_mult: 7.0,
        modifiers: &[EnemyModifier::Burning, EnemyModifier::Vampiric, EnemyModifier::Berserker, EnemyModifier::Explosive, EnemyModifier::Enraged, EnemyModifier::Undying],
        phase_thresholds: &[0.90, 0.75, 0.50, 0.25, 0.10, 0.05],
        summon_count: 10,
    },
    WorldBossDef {
        id: "world_serpent", name: "Jormungandr", title: "the World Serpent",
        spawn_x: -140.0, spawn_y: -110.0, base_level: 50,
        hp_mult: 35.0, atk_mult: 12.0, def_mult: 8.0,
        modifiers: &[EnemyModifier::Poisonous, EnemyModifier::Swift, EnemyModifier::Draining, EnemyModifier::Berserker, EnemyModifier::Armored, EnemyModifier::Regenerator],
        phase_thresholds: &[0.90, 0.80, 0.60, 0.40, 0.20, 0.05],
        summon_count: 12,
    },
    // === Endgame Raid Bosses ===
    WorldBossDef {
        id: "celestial_arbiter", name: "Aethon", title: "the Celestial Arbiter",
        spawn_x: 135.0, spawn_y: 105.0, base_level: 50,
        hp_mult: 40.0, atk_mult: 14.0, def_mult: 10.0,
        modifiers: &[EnemyModifier::Shielded, EnemyModifier::Swift, EnemyModifier::Draining, EnemyModifier::Berserker, EnemyModifier::Reflector, EnemyModifier::Regenerator],
        phase_thresholds: &[0.85, 0.70, 0.50, 0.30, 0.15, 0.05],
        summon_count: 15,
    },
    WorldBossDef {
        id: "ash_titan", name: "Pyrotharax", title: "the Ash Titan",
        spawn_x: 145.0, spawn_y: -55.0, base_level: 48,
        hp_mult: 32.0, atk_mult: 16.0, def_mult: 7.0,
        modifiers: &[EnemyModifier::Burning, EnemyModifier::Explosive, EnemyModifier::Berserker, EnemyModifier::Thorns, EnemyModifier::Armored],
        phase_thresholds: &[0.80, 0.60, 0.40, 0.20, 0.05],
        summon_count: 10,
    },
    WorldBossDef {
        id: "void_emperor", name: "Nul'Gathoth", title: "the Void Emperor",
        spawn_x: 0.0, spawn_y: -140.0, base_level: 50,
        hp_mult: 45.0, atk_mult: 13.0, def_mult: 9.0,
        modifiers: &[EnemyModifier::Draining, EnemyModifier::Shielded, EnemyModifier::Swift, EnemyModifier::Poisonous, EnemyModifier::Berserker, EnemyModifier::Vampiric, EnemyModifier::Reflector],
        phase_thresholds: &[0.90, 0.75, 0.60, 0.45, 0.30, 0.15, 0.05],
        summon_count: 18,
    },
    WorldBossDef {
        id: "twilight_queen", name: "Morvaine", title: "the Twilight Queen",
        spawn_x: -145.0, spawn_y: -75.0, base_level: 47,
        hp_mult: 28.0, atk_mult: 15.0, def_mult: 6.0,
        modifiers: &[EnemyModifier::Vampiric, EnemyModifier::Swift, EnemyModifier::Poisonous, EnemyModifier::Draining, EnemyModifier::Regenerator],
        phase_thresholds: &[0.80, 0.60, 0.40, 0.20, 0.05],
        summon_count: 12,
    },
    WorldBossDef {
        id: "storm_warden", name: "Zephyrion", title: "the Storm Warden",
        spawn_x: 85.0, spawn_y: 105.0, base_level: 45,
        hp_mult: 25.0, atk_mult: 18.0, def_mult: 5.0,
        modifiers: &[EnemyModifier::Swift, EnemyModifier::Berserker, EnemyModifier::Explosive, EnemyModifier::Thorns],
        phase_thresholds: &[0.75, 0.50, 0.25, 0.05],
        summon_count: 8,
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
    // === New Endgame Sets ===
    ItemSetDef {
        id: "ashfall_set", name: "Ashfall Forgemaster", icon: "🌋",
        pieces: &["Magma Core", "Obsidian Plate", "Cinder Heart", "Pyroclast Helm", "Ashfall Greaves"],
        bonuses: &[(2, "ATK", 25), (3, "DEF", 15), (4, "HP", 200), (5, "ATK", 50)],
    },
    ItemSetDef {
        id: "twilight_set", name: "Twilight Phantom", icon: "🌙",
        pieces: &["Umbral", "Shadowweave", "Veil of Twilight", "Nightshade", "Phantom"],
        bonuses: &[(2, "SPD", 15), (3, "LCK", 20), (4, "ATK", 30), (5, "SPD", 25)],
    },
    ItemSetDef {
        id: "celestial_set", name: "Celestial Ascendant", icon: "⭐",
        pieces: &["Starforged", "Astral Vestments", "Crown of Constellations", "Celestial Wings", "Star Ring"],
        bonuses: &[(2, "MP", 80), (3, "ATK", 35), (4, "HP", 250), (5, "MP", 120)],
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
    // Mount items (long-duration speed buffs)
    ("Riding Horse Whistle", "🐴", "mount_speed", "SPD", 30),
    ("War Horse Whistle",    "🏇", "mount_speed", "SPD", 50),
    ("Griffin Feather",      "🦅", "mount_speed", "SPD", 70),
    ("Dragon Saddle",        "🐲", "mount_speed", "SPD", 100),
    // Combat consumables
    ("Smoke Bomb",           "💨", "escape",      "",    0),
    ("War Horn",             "📯", "buff_all",    "ATK", 10),
    ("Berserker Draught",    "🫗", "buff_atk",    "ATK", 30),
    ("Diamond Skin Potion",  "🛡️", "buff_def",   "DEF", 30),
    ("XP Scroll",            "📜", "buff_xp",     "XP",  50),
    ("Gold Scroll",          "📜", "buff_gold",   "GOLD", 50),
    // Rare utility
    ("Recall Stone",         "🔮", "town_recall", "",    0),
    ("Resurrection Scroll",  "📜", "self_res",    "",    0),
    // Advanced Potions
    ("Supreme Mana Potion",  "💎", "instant_mana", "MP", 300),
    ("Full Restore Elixir",  "🌟", "full_restore", "HP", 9999),
    ("Antidote",             "🧴", "cure_poison",  "",   0),
    ("Fire Resistance Potion","🔥", "buff_fire_res","DEF", 20),
    ("Ice Resistance Potion", "❄️", "buff_ice_res", "DEF", 20),
    // Advanced Buffs
    ("Titan's Brew",         "🫗", "buff_all",     "ATK", 25),
    ("Arcane Intellect Scroll","📜","buff_mp",     "MP",  50),
    ("Experience Tome",      "📕", "buff_xp",      "XP",  100),
    ("Luck Charm",           "🎲", "buff_lck",     "LCK", 40),
    ("Shield of Faith Scroll","📜", "buff_def",    "DEF", 25),
    // Party Items
    ("Group Heal Scroll",    "📜", "party_heal",   "HP",  100),
    ("War Drums",            "🥁", "party_buff",   "ATK", 15),
    ("Banner of Courage",    "🚩", "party_buff",   "DEF", 15),
    // Endgame Consumables
    ("Celestial Nectar",     "✨", "heal_over_time","HP",  200),
    ("Void Essence Flask",   "🕳️", "buff_all",     "ATK", 40),
    ("Phoenix Down",         "🔥", "revive",       "HP",  500),
    ("Elixir of Immortality","⭐", "invuln",       "HP",  0),
    ("Stamina Potion",       "⚡", "restore_stam", "",    120),
    ("Rune of Return",       "🏠", "teleport_town","",    0),
    ("Smoke Bomb",           "💨", "escape_combat","",    0),
    ("Whetstone",            "🪨", "buff_atk",     "ATK", 15),
    ("Enchanted Scroll",     "📜", "random_buff",  "",    0),
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
    // Rare endgame fishing
    ("Abyssal Anglerfish",  "🐟", 4, 30, 1,  800, "ATK"),
    ("Celestial Koi",       "🎏", 5, 35, 1,  1200,"MP"),
    ("Void Eel",            "🐍", 4, 28, 1,  600, "SPD"),
    ("Phoenix Carp",        "🔥", 5, 40, 1,  1500,"HP"),
    ("Ancient Treasure Chest","🎁", 3, 25, 1, 2000,""),
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

// ─── Mining / Gathering Nodes ────────────────────────────────
// (node_type, icon, rarity, min_level, resource_name, base_yield)
pub const MINING_NODES: &[(&str, &str, u8, u32, &str, u32)] = &[
    ("copper_vein",    "🪨", 0, 1,  "Copper Ore",    3),
    ("iron_deposit",   "⛏️", 0, 3,  "Iron Ore",      2),
    ("silver_vein",    "🥈", 1, 8,  "Silver Ore",    2),
    ("gold_vein",      "🥇", 2, 15, "Gold Ore",      1),
    ("mithril_deposit","💠", 2, 20, "Mithril Ore",   1),
    ("adamantite_vein","💎", 3, 25, "Adamantite Ore", 1),
    ("herb_patch",     "🌿", 0, 1,  "Herb",          3),
    ("silk_bloom",     "🌸", 1, 10, "Silk",          2),
    ("gem_cluster",    "💎", 2, 15, "Gem Shard",     1),
    ("crystal_node",   "🔮", 3, 20, "Star Fragment", 1),
    ("soul_wellspring","👻", 4, 30, "Soul Fragment", 1),
    ("celestial_bloom","✨", 3, 25, "Celestial Dust", 1),
    ("dragon_fossil",  "🦴", 4, 30, "Dragon Scale",  1),
    ("primordial_core_node","🌀", 5, 35, "Primordial Core", 1),
    // Endgame gathering nodes
    ("obsidian_vein",  "🌑", 4, 30, "Obsidian Shard",    1),
    ("phoenix_nest",   "🔥", 5, 35, "Phoenix Ash",       1),
    ("void_fissure",   "🕳️", 5, 40, "Void Shard",        1),
    ("astral_crystal",  "⭐", 5, 40, "Star Fragment",     2),
];

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

// ─── Legendary Unique Items ──────────────────────────────────
// (name, slot, stat_key, stat_val, rarity, level, special_desc)
pub const LEGENDARY_UNIQUES: &[(&str, &str, &str, i32, u8, u32, &str)] = &[
    ("Ignaroth's Fang",       "weapon",  "ATK", 35, 4, 15, "Burns enemies on hit"),
    ("Frostbite Crown",       "head",    "DEF", 25, 4, 20, "Slows attackers"),
    ("Shadow King's Mantle",  "cape",    "LCK", 20, 4, 25, "Increased crit chance"),
    ("Terragor's Heart",      "amulet",  "HP",  80, 4, 18, "Massive HP boost"),
    ("Nihilax Voidfang",      "weapon",  "ATK", 42, 5, 30, "Drains enemy life"),
    ("Crystal Queen's Scepter","weapon", "ATK", 38, 4, 22, "Chance to stun"),
    ("Malachar's Grimoire",   "offhand", "MP",  50, 4, 28, "Increases spell power"),
    ("Voltharion's Talon",    "weapon",  "ATK", 48, 5, 35, "Chain lightning on hit"),
    ("Abyssal Dread Plate",   "armor",   "DEF", 40, 5, 40, "Reduces all damage taken"),
    ("Eye of Xal'Theron",     "ring",    "LCK", 25, 5, 40, "See hidden enemies"),
    ("Dragonfire Gauntlets",  "gloves",  "ATK", 22, 3, 15, "Fire damage bonus"),
    ("Boots of the Wind",     "boots",   "SPD", 18, 3, 12, "Increased movement speed"),
    ("Ring of Endless Gold",  "ring",    "LCK", 15, 3, 10, "Increased gold drops"),
    ("Amulet of Resurrection","amulet",  "HP",  50, 4, 20, "Auto-revive once per hour"),
    ("Blade of a Thousand Cuts","weapon","ATK", 30, 4, 18, "Multi-hit chance"),
    ("Shield of the Ancients","shield",  "DEF", 35, 4, 22, "Reflects 10% damage"),
    ("Crown of the Conqueror","head",    "ATK", 18, 5, 35, "All stats +5"),
    ("Celestial Wings",       "cape",    "SPD", 15, 5, 30, "Fly over obstacles"),
    ("Soul Harvester",        "weapon",  "ATK", 55, 5, 40, "Heals on kill"),
    ("Eternal Flame Ring",    "ring",    "ATK", 20, 4, 25, "Burns nearby enemies"),
    // Phase 10 legendaries
    ("Frostmourne",           "weapon",  "ATK", 60, 5, 45, "Freezes on critical hit"),
    ("Staff of the Archmage", "weapon",  "ATK", 45, 5, 35, "Doubles spell damage"),
    ("Assassin's Mark",       "ring",    "LCK", 30, 5, 40, "Triple backstab damage"),
    ("Titan's Grasp",         "gloves",  "ATK", 28, 4, 30, "Crushing blows stun"),
    ("Leviathan Scale",       "armor",   "DEF", 50, 5, 45, "Immune to knockback"),
    ("Phoenix Plume",         "cape",    "HP",  60, 5, 35, "Auto-revive with 50% HP"),
    ("Thundergod's Helm",     "head",    "DEF", 30, 4, 28, "Lightning strikes attackers"),
    ("Voidwalker Boots",      "boots",   "SPD", 22, 5, 35, "Phase through enemies"),
    ("Band of the Infinite",  "ring",    "MP",  40, 5, 40, "Unlimited mana for 5s on kill"),
    ("Warbringer's Plate",    "armor",   "DEF", 45, 4, 32, "Thorns damage +25%"),
    // Phase 11 legendaries — class-specific
    ("Excalibur",              "weapon",  "ATK", 65, 5, 50, "Holy damage ignores all defense"),
    ("Shadowfang",             "weapon",  "ATK", 50, 5, 40, "Poisons target on every hit"),
    ("Stormbreaker",           "weapon",  "ATK", 58, 5, 45, "Chain lightning on crit"),
    ("Lunar Eclipse",          "weapon",  "ATK", 52, 5, 38, "Chance to blind target"),
    ("Crown of Ages",          "head",    "DEF", 40, 5, 45, "All resistances +50%"),
    ("Heart of the Mountain",  "amulet",  "HP",  100, 5, 50, "Cannot be one-shot"),
    ("Infinity Band",          "ring",    "MP",  50, 5, 45, "Skills cost 30% less mana"),
    ("Enigma Plate",           "armor",   "DEF", 55, 5, 50, "Teleport on dodge"),
    ("Windforce Longbow",      "weapon",  "ATK", 48, 5, 42, "Knockback on every hit"),
    ("Grief Blade",            "weapon",  "ATK", 70, 5, 50, "Ignores target defense"),
    ("Chains of Honor",        "armor",   "DEF", 48, 5, 45, "+5 all stats, leech life"),
    ("Harlequin Crest",        "head",    "DEF", 35, 5, 40, "+2 all skills, magic find"),
    ("War Traveler Boots",     "boots",   "SPD", 25, 4, 35, "+50% gold find"),
    ("Chance Guards",          "gloves",  "LCK", 22, 3, 30, "+200% magic find"),
    ("Godly Amulet of Kings",  "amulet",  "ATK", 25, 5, 45, "+All stats, lifesteal 3%"),
    // === Celestial Legendaries ===
    ("Astral Annihilator",     "weapon",  "ATK", 72, 5, 48, "Star damage that pierces all defenses"),
    ("Cosmic Bulwark",         "armor",   "DEF", 60, 5, 50, "Absorbs 25% damage as mana"),
    ("Nebula Circlet",         "head",    "MP",  70, 5, 45, "Spells echo with 30% power"),
    ("Void Siphon Ring",       "ring",    "HP",  60, 5, 42, "Drains 5% max HP from enemies"),
    ("Ethereal Mantle",        "cape",    "SPD", 30, 5, 40, "Phase through enemies briefly"),
    // === Volcanic Legendaries ===
    ("Inferno's Wrath",        "weapon",  "ATK", 68, 5, 46, "Eruption AoE on every 5th hit"),
    ("Magma Heart Shield",     "shield",  "DEF", 55, 5, 44, "Thorns fire damage to attackers"),
    ("Pyroclast Gauntlets",    "gloves",  "ATK", 30, 4, 38, "Attacks leave burning ground"),
    // === Twilight Legendaries ===
    ("Morvaine's Embrace",     "armor",   "DEF", 50, 5, 47, "Lifesteal 8% of all damage"),
    ("Duskbringer",            "weapon",  "ATK", 62, 5, 44, "Critical hits cause fear"),
    ("Shadow Crown",           "head",    "LCK", 35, 5, 42, "20% chance to evade all damage"),
    // === Crafted Legendaries ===
    ("Adamantite Destroyer",   "weapon",  "ATK", 58, 5, 40, "Armor penetration +50%"),
    ("Phoenix Feather Robe",   "armor",   "HP",  80, 5, 38, "Auto-revive once per battle"),
    ("Dragon Scale Aegis",     "shield",  "DEF", 65, 5, 50, "Elemental damage immunity"),
];

/// Rune recipes: (rune_name, required_material_template_id, min_magic_level(max_mp), mana_cost)
pub const RUNE_RECIPES: &[(&str, &str, u32, u32)] = &[
    ("Rune of Healing",       "blank_rune", 10, 20),
    ("Rune of Fire",          "blank_rune", 15, 30),
    ("Rune of Ice",           "blank_rune", 15, 30),
    ("Rune of Lightning",     "blank_rune", 20, 40),
    ("Rune of Great Healing", "blank_rune", 25, 50),
    ("Rune of Sudden Death",  "blank_rune", 35, 80),
    ("Rune of Explosion",     "blank_rune", 30, 60),
    ("Rune of Paralyze",      "blank_rune", 40, 100),
    ("Rune of Wall of Fire",  "blank_rune", 20, 40),
    ("Rune of Magic Shield",  "blank_rune", 30, 60),
];

/// Dungeon-specific loot tables: (dungeon_name, item_name, slot, stat, stat_val, rarity, level, description, drop_chance)
pub const DUNGEON_LOOT: &[(&str, &str, &str, &str, i32, u8, u32, &str, f64)] = &[
    // Goblin Warren (level 5+)
    ("Goblin Warren", "Goblin King's Crown",     "head",   "LCK", 12,  3, 8,  "Glows with stolen treasure",     0.08),
    ("Goblin Warren", "Sharpened Shiv",           "weapon", "ATK", 15,  2, 6,  "Quick, dirty, effective",        0.15),
    ("Goblin Warren", "Bag of Goblin Gold",       "ring",   "LCK", 8,   2, 5,  "+10% gold from kills",          0.12),
    // Frozen Crypt (level 8+)
    ("Frozen Crypt",  "Permafrost Blade",         "weapon", "ATK", 22,  3, 12, "Freezes enemies on crit",       0.07),
    ("Frozen Crypt",  "Crypt Warden's Shield",    "shield", "DEF", 20,  3, 10, "Blocks ice damage",             0.10),
    ("Frozen Crypt",  "Frozen Heart Amulet",      "amulet", "HP",  40,  3, 11, "Slows attacker on hit",         0.08),
    // Shadow Dungeon (level 10+)
    ("Shadow Dungeon","Shadowmeld Cloak",         "cape",   "SPD", 14,  3, 14, "Stealth for 3 seconds",         0.06),
    ("Shadow Dungeon","Dagger of Shadows",        "weapon", "ATK", 28,  4, 15, "Backstab deals 2x damage",      0.05),
    ("Shadow Dungeon","Shadow Bindings",          "gloves", "ATK", 12,  3, 13, "Drain life on hit",             0.08),
    // Stone Mines (level 7+)
    ("Stone Mines",   "Pickaxe of the Depths",    "weapon", "ATK", 20,  2, 9,  "+25% mining XP",                0.12),
    ("Stone Mines",   "Earthen Plate",            "armor",  "DEF", 18,  3, 10, "Immune to knockback",           0.09),
    ("Stone Mines",   "Gem-Encrusted Ring",       "ring",   "LCK", 14,  3, 8,  "Chance to find rare gems",      0.10),
    // Void Rift (level 15+)
    ("Void Rift",     "Void Shard Blade",         "weapon", "ATK", 38,  4, 20, "Ignores 30% defense",           0.04),
    ("Void Rift",     "Rift Walker Boots",        "boots",  "SPD", 16,  4, 18, "Teleport short distance",       0.05),
    ("Void Rift",     "Void Barrier",             "shield", "DEF", 30,  4, 19, "Absorbs void damage",           0.04),
    // Dragon's Lair (level 12+)
    ("Dragon's Lair", "Dragonscale Mail",         "armor",  "DEF", 32,  4, 16, "Fire resistance +50%",          0.05),
    ("Dragon's Lair", "Dragon Fang Dagger",       "weapon", "ATK", 34,  4, 15, "Pierces through armor",         0.06),
    ("Dragon's Lair", "Dragon's Eye",             "ring",   "ATK", 15,  3, 14, "See hidden enemies",            0.08),
    // Necropolis (level 9+)
    ("Necropolis",    "Bonecrusher Mace",         "weapon", "ATK", 24,  3, 12, "Shatters undead easily",        0.08),
    ("Necropolis",    "Lich Phylactery",          "amulet", "MP",  35,  4, 14, "Revive once when killed",       0.04),
    ("Necropolis",    "Death Knight's Helm",      "head",   "DEF", 22,  3, 11, "Fear resistance",               0.07),
    // Infernal Pit (level 11+)
    ("Infernal Pit",  "Infernal Greatsword",      "weapon", "ATK", 30,  3, 14, "Burns enemies over time",       0.06),
    ("Infernal Pit",  "Molten Shield",            "shield", "DEF", 25,  3, 13, "Reflects fire damage",          0.07),
    ("Infernal Pit",  "Hellfire Ring",            "ring",   "ATK", 18,  4, 15, "AoE fire burst on crit",        0.05),
    // Crystal Caverns (level 6+)
    ("Crystal Caverns","Crystal Staff",           "weapon", "ATK", 18,  3, 9,  "Amplifies magic by 15%",        0.08),
    ("Crystal Caverns","Prism Shield",            "shield", "DEF", 16,  2, 7,  "Reflects projectiles",          0.10),
    ("Crystal Caverns","Crystal Pendant",         "amulet", "LCK", 10,  2, 7,  "Reveals hidden paths",          0.12),
    // Abyssal Depths (level 18+)
    ("Abyssal Depths","Leviathan's Trident",      "weapon", "ATK", 45,  5, 22, "Summons water tendrils",        0.03),
    ("Abyssal Depths","Abyssal Plate",            "armor",  "DEF", 38,  5, 20, "Immune to drowning effects",    0.03),
    ("Abyssal Depths","Eye of the Deep",          "amulet", "HP",  65,  5, 21, "See in complete darkness",      0.04),
    // Sunken Temple (level 13+)
    ("Sunken Temple", "Tidecaller's Staff",       "weapon", "ATK", 32,  3, 16, "Summons tidal waves",           0.06),
    ("Sunken Temple", "Coral Armor",              "armor",  "DEF", 28,  3, 15, "Regenerate HP in water zones",  0.07),
    ("Sunken Temple", "Pearl of Wisdom",          "amulet", "MP",  40,  3, 14, "+20% XP from quests",           0.08),
    // Volcanic Forge (level 16+)
    ("Volcanic Forge","Magma Blade",              "weapon", "ATK", 40,  4, 19, "Melts armor on crit",           0.05),
    ("Volcanic Forge","Obsidian Plate",           "armor",  "DEF", 35,  4, 18, "Immune to fire damage",         0.05),
    ("Volcanic Forge","Forge Master's Hammer",    "weapon", "ATK", 36,  4, 17, "+30% crafting success rate",    0.06),
    // Frostbite Cavern (level 14+)
    ("Frostbite Cavern","Glacial Greatsword",     "weapon", "ATK", 35,  4, 17, "Slows enemies by 40%",         0.06),
    ("Frostbite Cavern","Frostbite Gauntlets",    "gloves", "DEF", 18,  3, 15, "Freeze attacker on block",     0.07),
    ("Frostbite Cavern","Ice Queen's Tiara",      "head",   "MP",  30,  4, 16, "Ice spells cost 20% less",     0.05),
    // Demon's Throne (level 20+)
    ("Demon's Throne","Demon Lord's Glaive",      "weapon", "ATK", 52,  5, 24, "Life steal on every hit",      0.03),
    ("Demon's Throne","Hellforged Plate",         "armor",  "DEF", 45,  5, 23, "Thorns damage to attackers",   0.03),
    ("Demon's Throne","Soul Gem",                 "ring",   "HP",  80,  5, 22, "Absorbs souls for power",      0.03),
    // Sky Citadel (level 17+)
    ("Sky Citadel",   "Thunderbolt Javelin",      "weapon", "ATK", 42,  4, 20, "Chain lightning on hit",       0.05),
    ("Sky Citadel",   "Stormcloud Mantle",        "cape",   "SPD", 18,  4, 19, "Dodge chance +15%",            0.05),
    ("Sky Citadel",   "Wings of the Archon",      "boots",  "SPD", 20,  5, 21, "Brief flight on dodge",        0.03),
    // Ashfall Furnace (level 22+)
    ("Ashfall Furnace","Magma Core Hammer",       "weapon", "ATK", 55,  5, 26, "Eruption on critical hit",     0.03),
    ("Ashfall Furnace","Obsidian Plate Mail",     "armor",  "DEF", 48,  5, 25, "Fire immunity, thorns damage", 0.03),
    ("Ashfall Furnace","Cinder Heart Amulet",     "amulet", "HP", 100,  5, 24, "Revive once per hour",         0.02),
    // Twilight Sanctum (level 19+)
    ("Twilight Sanctum","Umbral Dagger",          "weapon", "ATK", 40,  4, 22, "Strikes from shadows",         0.04),
    ("Twilight Sanctum","Shadowweave Robe",       "armor",  "MP",  50,  4, 21, "Dark magic amplified",         0.04),
    ("Twilight Sanctum","Veil of Twilight",       "head",   "LCK", 20,  5, 22, "Become invisible briefly",     0.03),
    // Celestial Spire (level 25+ — hardest dungeon)
    ("Celestial Spire","Starforged Blade",        "weapon", "ATK", 65,  5, 30, "Holy damage ignores armor",    0.02),
    ("Celestial Spire","Astral Vestments",        "armor",  "DEF", 55,  5, 28, "Celestial shield on low HP",   0.02),
    ("Celestial Spire","Crown of Constellations", "head",   "MP", 120,  5, 30, "All skills cost 30% less",     0.01),
];

// ─── Mount Data ──────────────────────────────────────────────
// (item_name, mount_name, speed_bonus, emoji)
pub const MOUNT_DATA: &[(&str, &str, f64, &str)] = &[
    ("Riding Horse Whistle", "Riding Horse",   0.30, "🐴"),
    ("War Horse Whistle",    "War Horse",      0.50, "🏇"),
    ("Griffin Feather",      "Griffin",        0.70, "🦅"),
    ("Dragon Saddle",        "Dragon",         1.00, "🐲"),
];

// ─── Daily Quest Templates ───────────────────────────────────
// (title, description, objective_type, target_count, reward_xp, reward_gold)
pub const DAILY_QUEST_TEMPLATES: &[(&str, &str, &str, u32, u64, u64)] = &[
    ("Monster Hunter",       "Defeat 10 enemies",             "kill_enemies",    10,  200,  50),
    ("Slaughter Spree",      "Defeat 25 enemies",             "kill_enemies",    25,  500,  120),
    ("Boss Slayer",          "Defeat a boss-rank enemy",       "kill_boss",       1,   600,  200),
    ("Gatherer's Duty",      "Mine 5 ore nodes",              "mine_nodes",      5,   150,  40),
    ("Angler's Task",        "Catch 3 fish",                  "catch_fish",      3,   150,  40),
    ("Master Angler",        "Catch 8 fish",                  "catch_fish",      8,   400,  100),
    ("Craftsman's Work",     "Craft 3 items",                 "craft_items",     3,   200,  60),
    ("Gold Rush",            "Earn 500 gold",                 "earn_gold",       500, 300,  0),
    ("Dungeon Delver",       "Clear any dungeon zone",         "enter_dungeon",   1,   500,  150),
    ("Social Butterfly",     "Send a message in chat",         "send_chat",       1,   50,   20),
    ("Market Mogul",         "List an item on the auction",    "auction_list",    1,   100,  30),
    ("Enchanter's Task",     "Enchant an item",               "enchant_item",    1,   200,  50),
    ("Explorer's Journey",   "Visit 3 different towns",        "visit_towns",     3,   400,  80),
    ("Party Player",         "Join or create a party",         "join_party",      1,   150,  30),
    ("Combo Master",         "Reach a 15-hit combo",           "combo_hits",      15,  300,  60),
];

impl DailyQuest {
    pub fn from_template(idx: usize) -> Self {
        let t = DAILY_QUEST_TEMPLATES[idx];
        DailyQuest {
            quest_id: format!("daily-{}", idx),
            title: t.0.to_string(),
            description: t.1.to_string(),
            objective: t.2.to_string(),
            target: t.3,
            progress: 0,
            completed: false,
            reward_xp: t.4,
            reward_gold: t.5,
        }
    }
}