use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::collections::HashMap;
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
}

impl PlayerData {
    pub fn new(username: String) -> Self {
        let id = Uuid::new_v4();
        // Give starter items
        let mut inventory = vec![None; 40]; // 8x5 grid
        inventory[0] = Some(Item::new_weapon("Wooden Sword", 0, 1, 3));
        inventory[1] = Some(Item::new_armor("Cloth Shirt", "armor", 0, 1, 2));
        inventory[2] = Some(Item::new_consumable("Health Potion", 0, 5));
        inventory[3] = Some(Item::new_consumable("Health Potion", 0, 5));

        Self {
            id,
            username,
            x: 0.0, y: 0.0,
            target_x: 0.0, target_y: 0.0,
            hp: 200, max_hp: 200,
            mp: 80, max_mp: 80,
            level: 1, xp: 0,
            atk: 15, def: 10, spd: 12, lck: 5,
            gold: 100,
            inventory,
            equipment: HashMap::new(),
            bank: vec![None; 80],
            dead: false,
            respawn_timer: 0.0,
            pvp_protection: true,
        }
    }

    pub fn to_entity_state(&self) -> EntityState {
        EntityState {
            id: self.id.to_string(),
            entity_type: "player".to_string(),
            x: self.x, y: self.y,
            hp: Some(self.hp),
            max_hp: Some(self.max_hp),
            level: Some(self.level),
            name: Some(self.username.clone()),
            direction: None,
        }
    }

    pub fn xp_to_next_level(&self) -> u64 {
        let level = self.level as f64;
        let scaling = 1.0 + level / 100.0;
        (100.0 * level.powf(2.5) * scaling) as u64
    }

    /// Total ATK including equipment bonuses
    pub fn total_atk(&self) -> i32 {
        self.atk + self.equipment.values()
            .filter_map(|item| item.stats.get("ATK"))
            .sum::<i32>()
    }

    /// Total DEF including equipment bonuses
    pub fn total_def(&self) -> i32 {
        self.def + self.equipment.values()
            .filter_map(|item| item.stats.get("DEF"))
            .sum::<i32>()
    }

    pub fn total_lck(&self) -> i32 {
        self.lck + self.equipment.values()
            .filter_map(|item| item.stats.get("LCK"))
            .sum::<i32>()
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
            slot.as_ref().map(|item| item.to_json(i))
        }).collect()
    }

    /// Get serializable bank for client
    pub fn bank_payload(&self) -> Vec<serde_json::Value> {
        self.bank.iter().enumerate().filter_map(|(i, slot)| {
            slot.as_ref().map(|item| item.to_json(i))
        }).collect()
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
}

#[derive(Debug, Clone, PartialEq)]
pub enum EnemyState {
    Idle,
    Patrol,
    Chase,
    Attack,
    Dead,
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
        }
    }

    pub fn to_json(&self, slot_index: usize) -> serde_json::Value {
        serde_json::json!({
            "slotIndex": slot_index,
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
        })
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
];

const ARMOR_TEMPLATES: &[(&str, &str)] = &[
    ("Leather Cap", "helmet"),
    ("Iron Helm", "helmet"),
    ("Cloth Shirt", "armor"),
    ("Chain Mail", "armor"),
    ("Plate Armor", "armor"),
    ("Leather Pants", "legs"),
    ("Iron Greaves", "legs"),
    ("Leather Boots", "boots"),
    ("Iron Boots", "boots"),
    ("Wooden Shield", "shield"),
    ("Iron Shield", "shield"),
    ("Silver Ring", "ring1"),
    ("Gold Ring", "ring2"),
    ("Bone Amulet", "amulet"),
    ("Silk Cape", "cape"),
];

const MATERIAL_NAMES: &[&str] = &[
    "Wood", "Iron Ore", "Leather", "Thread", "Herb",
    "Steel Ingot", "Gold Dust", "Crystal Shard", "Dragon Scale",
    "Monster Fang", "Spider Silk", "Ancient Bone",
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
