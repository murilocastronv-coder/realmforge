use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ─── Message Types ───────────────────────────────────────────
// Client → Server
pub const MSG_AUTH: u8 = 1;
pub const MSG_MOVE: u8 = 2;
pub const MSG_CHAT: u8 = 3;
pub const MSG_ATTACK: u8 = 4;
pub const MSG_PICKUP_ITEM: u8 = 5;

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
}

impl PlayerData {
    pub fn new(username: String) -> Self {
        let id = Uuid::new_v4();
        Self {
            id,
            username,
            x: 0.0,
            y: 0.0,
            target_x: 0.0,
            target_y: 0.0,
            hp: 100,
            max_hp: 100,
            mp: 50,
            max_mp: 50,
            level: 1,
            xp: 0,
            atk: 10,
            def: 5,
            spd: 10,
            lck: 5,
        }
    }

    pub fn to_entity_state(&self) -> EntityState {
        EntityState {
            id: self.id.to_string(),
            entity_type: "player".to_string(),
            x: self.x,
            y: self.y,
            hp: Some(self.hp),
            max_hp: Some(self.max_hp),
            level: Some(self.level),
            name: Some(self.username.clone()),
            direction: None,
        }
    }

    pub fn xp_to_next_level(&self) -> u64 {
        let level = self.level as f64;
        let base = 100.0;
        let scaling = 1.0 + level / 100.0;
        (base * level.powf(2.5) * scaling) as u64
    }
}

// ─── Enemy Data ──────────────────────────────────────────────
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
        EntityState {
            id: self.id.to_string(),
            entity_type: "enemy".to_string(),
            x: self.x,
            y: self.y,
            hp: Some(self.hp),
            max_hp: Some(self.max_hp),
            level: Some(self.level),
            name: Some(self.name.clone()),
            direction: None,
        }
    }
}
