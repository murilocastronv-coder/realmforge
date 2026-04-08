mod enemy;
mod protocol;
mod world;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use rand::Rng;

use axum::{
    Router,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::{broadcast, mpsc};
use tracing::{info, warn};
use uuid::Uuid;

use crate::enemy::{generate_enemy, update_enemy_ai};
use crate::protocol::*;
use crate::world::WorldGenerator;

// ─── Spatial Hash Grid ───────────────────────────────────────

const SPATIAL_CELL_SIZE: f64 = 16.0; // 16x16 tiles per cell

fn spatial_key(x: f64, y: f64) -> (i32, i32) {
    ((x / SPATIAL_CELL_SIZE).floor() as i32, (y / SPATIAL_CELL_SIZE).floor() as i32)
}

/// Returns the 9 cells around (and including) the cell at (x, y)
fn nearby_cells(x: f64, y: f64) -> Vec<(i32, i32)> {
    let (cx, cy) = spatial_key(x, y);
    let mut cells = Vec::with_capacity(9);
    for dx in -1..=1 {
        for dy in -1..=1 {
            cells.push((cx + dx, cy + dy));
        }
    }
    cells
}

/// Extended nearby cells for a given range (in cells)
fn nearby_cells_range(x: f64, y: f64, range: f64) -> Vec<(i32, i32)> {
    let (cx, cy) = spatial_key(x, y);
    let cell_range = (range / SPATIAL_CELL_SIZE).ceil() as i32;
    let mut cells = Vec::with_capacity(((2 * cell_range + 1) * (2 * cell_range + 1)) as usize);
    for dx in -cell_range..=cell_range {
        for dy in -cell_range..=cell_range {
            cells.push((cx + dx, cy + dy));
        }
    }
    cells
}

// ─── Server State ────────────────────────────────────────────

struct AppState {
    /// All connected players (id -> player data)
    players: DashMap<Uuid, PlayerData>,
    /// WebSocket senders for each player
    senders: DashMap<Uuid, mpsc::UnboundedSender<String>>,
    /// Registered accounts (username -> password hash) - in-memory for now
    accounts: DashMap<String, String>,
    /// Saved player data for offline players (username -> player data)
    saved_players: DashMap<String, PlayerData>,
    /// World generator
    world: WorldGenerator,
    /// Active enemies
    enemies: DashMap<Uuid, EnemyData>,
    /// Generated chunks cache
    chunk_cache: DashMap<(i32, i32), ChunkData>,
    /// Items on the ground
    ground_items: DashMap<Uuid, GroundItem>,
    /// Game tick counter
    tick_count: std::sync::atomic::AtomicU64,
    /// Broadcast channel for global messages
    broadcast_tx: broadcast::Sender<String>,
    /// Spatial hash: cell -> set of player IDs in that cell
    player_grid: DashMap<(i32, i32), Vec<Uuid>>,
    /// Spatial hash: cell -> set of enemy IDs in that cell
    enemy_grid: DashMap<(i32, i32), Vec<Uuid>>,
}

impl AppState {
    fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(1024);
        Self {
            players: DashMap::new(),
            senders: DashMap::new(),
            accounts: DashMap::new(),
            saved_players: DashMap::new(),
            world: WorldGenerator::new(42),
            enemies: DashMap::new(),
            chunk_cache: DashMap::new(),
            ground_items: DashMap::new(),
            tick_count: std::sync::atomic::AtomicU64::new(0),
            broadcast_tx,
            player_grid: DashMap::new(),
            enemy_grid: DashMap::new(),
        }
    }

    fn broadcast(&self, msg: &str) {
        let _ = self.broadcast_tx.send(msg.to_string());
    }

    fn send_to(&self, player_id: &Uuid, msg: &str) {
        if let Some(sender) = self.senders.get(player_id) {
            let _ = sender.send(msg.to_string());
        }
    }

    fn send_to_all_near(&self, x: f64, y: f64, range: f64, msg: &str) {
        // Use spatial grid for efficient proximity lookup
        let cells = nearby_cells_range(x, y, range);
        let range_sq = range * range;
        let mut sent = HashSet::new();

        for cell in cells {
            if let Some(pids) = self.player_grid.get(&cell) {
                for pid in pids.value() {
                    if sent.contains(pid) { continue; }
                    if let Some(player) = self.players.get(pid) {
                        let dx = player.x - x;
                        let dy = player.y - y;
                        if dx * dx + dy * dy <= range_sq {
                            self.send_to(pid, msg);
                            sent.insert(*pid);
                        }
                    }
                }
            }
        }
    }

    /// Rebuild spatial grids from current entity positions
    fn update_spatial_grids(&self) {
        // Clear and rebuild player grid
        self.player_grid.clear();
        for entry in self.players.iter() {
            let player = entry.value();
            if player.dead { continue; }
            let key = spatial_key(player.x, player.y);
            self.player_grid.entry(key).or_insert_with(Vec::new).push(player.id);
        }

        // Clear and rebuild enemy grid
        self.enemy_grid.clear();
        for entry in self.enemies.iter() {
            let enemy = entry.value();
            if enemy.state == EnemyState::Dead { continue; }
            let key = spatial_key(enemy.x, enemy.y);
            self.enemy_grid.entry(key).or_insert_with(Vec::new).push(enemy.id);
        }
    }
}

// ─── Main ────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("realmforge_server=info,tower_http=info")
        .init();

    let state = Arc::new(AppState::new());

    // Start game loop
    let game_state = state.clone();
    tokio::spawn(async move {
        game_loop(game_state).await;
    });

    // Spawn initial enemies around the world
    spawn_initial_enemies(&state);

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(|| async { "OK" }))
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        )
        .with_state(state);

    let addr = "0.0.0.0:8080";
    info!("🏰 RealmForge server starting on {}", addr);
    info!("   WebSocket endpoint: ws://{}/ws", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn spawn_initial_enemies(state: &Arc<AppState>) {
    // Spawn enemies in chunks around the center (expanded to -6..=6)
    for cx in -6..=6_i32 {
        for cy in -6..=6_i32 {
            let spawns = state.world.get_enemy_spawns(cx, cy);
            for (x, y, zone_level) in spawns {
                let enemy = generate_enemy(x, y, zone_level);
                state.enemies.insert(enemy.id, enemy);
            }
        }
    }
    info!("Spawned {} initial enemies", state.enemies.len());
}

// ─── WebSocket Handler ───────────────────────────────────────

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let player_id: Arc<tokio::sync::Mutex<Option<Uuid>>> = Arc::new(tokio::sync::Mutex::new(None));

    // Task: forward messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Task: receive messages from WebSocket
    let state_clone = state.clone();
    let tx_clone = tx.clone();
    let player_id_clone = player_id.clone();

    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Text(text) => {
                let text_str: &str = &text;
                if let Ok(game_msg) = serde_json::from_str::<GameMessage>(text_str) {
                    let pid = *player_id_clone.lock().await;
                    handle_message(
                        &state_clone,
                        &game_msg,
                        pid,
                        &player_id_clone,
                        &tx_clone,
                    )
                    .await;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup on disconnect — save player data before removing
    let pid = *player_id.lock().await;
    if let Some(id) = pid {
        if let Some((_, player_data)) = state.players.remove(&id) {
            state.saved_players.insert(player_data.username.clone(), player_data);
        }
        state.senders.remove(&id);

        // Notify others
        let leave_msg = json!({
            "type": MSG_PLAYER_LEFT,
            "payload": { "id": id.to_string() }
        })
        .to_string();
        state.broadcast(&leave_msg);
        info!("Player {} disconnected (data saved)", id);
    }

    send_task.abort();
}

async fn handle_message(
    state: &Arc<AppState>,
    msg: &GameMessage,
    player_id: Option<Uuid>,
    player_id_lock: &Arc<tokio::sync::Mutex<Option<Uuid>>>,
    sender: &mpsc::UnboundedSender<String>,
) {
    match msg.msg_type {
        MSG_AUTH => {
            if let Ok(auth) = serde_json::from_value::<AuthPayload>(msg.payload.clone()) {
                handle_auth(state, &auth, player_id_lock, sender).await;
            }
        }
        MSG_MOVE => {
            if let (Some(pid), Ok(move_payload)) = (
                player_id,
                serde_json::from_value::<MovePayload>(msg.payload.clone()),
            ) {
                handle_move(state, pid, &move_payload);
            }
        }
        MSG_CHAT => {
            if let (Some(pid), Ok(chat)) = (
                player_id,
                serde_json::from_value::<ChatPayload>(msg.payload.clone()),
            ) {
                handle_chat(state, pid, &chat);
            }
        }
        MSG_ATTACK => {
            if let Some(pid) = player_id {
                if let Some(target_id_str) = msg.payload.get("targetId").and_then(|v| v.as_str()) {
                    if let Ok(target_id) = Uuid::parse_str(target_id_str) {
                        handle_attack(state, pid, target_id);
                    }
                }
            }
        }
        MSG_ATTACK_PLAYER => {
            if let Some(pid) = player_id {
                if let Some(target_id_str) = msg.payload.get("targetId").and_then(|v| v.as_str()) {
                    if let Ok(target_id) = Uuid::parse_str(target_id_str) {
                        handle_pvp_attack(state, pid, target_id);
                    }
                }
            }
        }
        MSG_PICKUP_ITEM => {
            if let Some(pid) = player_id {
                if let Some(item_id_str) = msg.payload.get("itemId").and_then(|v| v.as_str()) {
                    if let Ok(item_id) = Uuid::parse_str(item_id_str) {
                        handle_pickup_item(state, pid, item_id);
                    }
                }
            }
        }
        MSG_EQUIP_ITEM => {
            if let Some(pid) = player_id {
                if let Some(slot_index) = msg.payload.get("slotIndex").and_then(|v| v.as_u64()) {
                    handle_equip_item(state, pid, slot_index as usize);
                }
            }
        }
        MSG_UNEQUIP_ITEM => {
            if let Some(pid) = player_id {
                if let Some(slot) = msg.payload.get("slot").and_then(|v| v.as_str()) {
                    handle_unequip_item(state, pid, slot);
                }
            }
        }
        MSG_BANK_DEPOSIT => {
            if let Some(pid) = player_id {
                if let Some(inv_slot) = msg.payload.get("inventorySlot").and_then(|v| v.as_u64()) {
                    handle_bank_deposit(state, pid, inv_slot as usize);
                }
            }
        }
        MSG_BANK_WITHDRAW => {
            if let Some(pid) = player_id {
                if let Some(bank_slot) = msg.payload.get("bankSlot").and_then(|v| v.as_u64()) {
                    handle_bank_withdraw(state, pid, bank_slot as usize);
                }
            }
        }
        MSG_USE_ITEM => {
            if let Some(pid) = player_id {
                handle_use_item(state, pid, &msg.payload);
            }
        }
        MSG_REQUEST_CHUNK => {
            if let Some(_pid) = player_id {
                if let (Some(cx), Some(cy)) = (
                    msg.payload.get("chunkX").and_then(|v| v.as_i64()),
                    msg.payload.get("chunkY").and_then(|v| v.as_i64()),
                ) {
                    let chunk = get_or_generate_chunk(state, cx as i32, cy as i32);
                    let chunk_msg = json!({
                        "type": MSG_CHUNK_DATA,
                        "payload": {
                            "chunkX": chunk.chunk_x,
                            "chunkY": chunk.chunk_y,
                            "tiles": chunk.tiles,
                            "biome": chunk.biome,
                        }
                    }).to_string();
                    let _ = sender.send(chunk_msg);
                }
            }
        }
        _ => {
            warn!("Unknown message type: {}", msg.msg_type);
        }
    }
}

// ─── Auth Handler ────────────────────────────────────────────

async fn handle_auth(
    state: &Arc<AppState>,
    auth: &AuthPayload,
    player_id_lock: &Arc<tokio::sync::Mutex<Option<Uuid>>>,
    sender: &mpsc::UnboundedSender<String>,
) {
    if auth.username.len() < 3 || auth.username.len() > 20 {
        let result = AuthResult {
            success: false,
            player_id: None,
            error: Some("Username must be 3-20 characters".into()),
        };
        let msg = json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string();
        let _ = sender.send(msg);
        return;
    }

    if auth.is_register {
        if state.accounts.contains_key(&auth.username) {
            let result = AuthResult {
                success: false,
                player_id: None,
                error: Some("Username already exists".into()),
            };
            let msg = json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string();
            let _ = sender.send(msg);
            return;
        }
        state
            .accounts
            .insert(auth.username.clone(), auth.password.clone());
        info!("New account registered: {}", auth.username);
    } else {
        // Login check
        match state.accounts.get(&auth.username) {
            Some(pass) if *pass == auth.password => {}
            Some(_) => {
                let result = AuthResult {
                    success: false,
                    player_id: None,
                    error: Some("Invalid password".into()),
                };
                let msg = json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string();
                let _ = sender.send(msg);
                return;
            }
            None => {
                // Auto-register if account doesn't exist
                state
                    .accounts
                    .insert(auth.username.clone(), auth.password.clone());
                info!("Auto-registered: {}", auth.username);
            }
        }
    }

    // Kick existing session for same username (prevent duplicate logins)
    let existing_pid: Option<Uuid> = state.players.iter()
        .find(|entry| entry.value().username == auth.username)
        .map(|entry| *entry.key());
    if let Some(old_pid) = existing_pid {
        // Save their data before removing
        if let Some((_, old_player)) = state.players.remove(&old_pid) {
            state.saved_players.insert(auth.username.clone(), old_player);
        }
        state.senders.remove(&old_pid);
        let kick_msg = json!({
            "type": MSG_PLAYER_LEFT,
            "payload": { "id": old_pid.to_string() }
        }).to_string();
        state.broadcast(&kick_msg);
    }

    // Restore saved character or create new one
    let player = if let Some((_, mut saved)) = state.saved_players.remove(&auth.username) {
        // Restore saved character with a new session ID
        saved.id = Uuid::new_v4();
        saved.dead = false;
        saved.respawn_timer = 0.0;
        // Respawn at town if they were dead
        if saved.hp <= 0 {
            saved.hp = saved.max_hp;
            saved.x = 0.0;
            saved.y = 0.0;
            saved.target_x = 0.0;
            saved.target_y = 0.0;
        }
        info!("Restored saved character for: {}", auth.username);
        saved
    } else {
        info!("New character created for: {}", auth.username);
        PlayerData::new(auth.username.clone())
    };
    let pid = player.id;

    state.players.insert(pid, player);
    state.senders.insert(pid, sender.clone());
    *player_id_lock.lock().await = Some(pid);

    // Send auth result
    let result = AuthResult {
        success: true,
        player_id: Some(pid.to_string()),
        error: None,
    };
    let msg = json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string();
    let _ = sender.send(msg);

    // Send initial chunks around player's actual position (not always origin)
    let player_ref = state.players.get(&pid).unwrap();
    let pcx = (player_ref.x / 32.0).floor() as i32;
    let pcy = (player_ref.y / 32.0).floor() as i32;
    let px = player_ref.x;
    let py = player_ref.y;
    drop(player_ref);

    for cx in (pcx - 2)..=(pcx + 2) {
        for cy in (pcy - 2)..=(pcy + 2) {
            let chunk = get_or_generate_chunk(state, cx, cy);
            let chunk_msg = json!({ "type": MSG_CHUNK_DATA, "payload": chunk }).to_string();
            let _ = sender.send(chunk_msg);
        }
    }

    // Notify others
    let join_msg = json!({
        "type": MSG_PLAYER_JOINED,
        "payload": { "id": pid.to_string(), "username": auth.username }
    })
    .to_string();
    state.broadcast(&join_msg);

    info!(
        "Player {} ({}) joined. Total players: {}",
        auth.username,
        pid,
        state.players.len()
    );

    // Send initial state to player
    send_stats_update_by_id(state, &pid);
    send_inventory_update(state, &pid);
    send_bank_update(state, &pid);

    // Send nearby ground items
    let items: Vec<serde_json::Value> = state.ground_items.iter()
        .filter(|gi| {
            let dist_sq = (gi.x - px).powi(2) + (gi.y - py).powi(2);
            dist_sq < 900.0
        })
        .map(|gi| json!({
            "id": gi.id.to_string(),
            "name": gi.item.name,
            "rarity": gi.item.rarity,
            "x": gi.x,
            "y": gi.y,
        }))
        .collect();
    if !items.is_empty() {
        let gi_msg = json!({
            "type": MSG_GROUND_ITEMS,
            "payload": { "items": items }
        }).to_string();
        state.send_to(&pid, &gi_msg);
    }
}

fn get_or_generate_chunk(state: &Arc<AppState>, chunk_x: i32, chunk_y: i32) -> ChunkData {
    let key = (chunk_x, chunk_y);
    if let Some(cached) = state.chunk_cache.get(&key) {
        return cached.clone();
    }
    let chunk = state.world.generate_chunk(chunk_x, chunk_y);
    state.chunk_cache.insert(key, chunk.clone());
    chunk
}

// ─── Movement Handler ────────────────────────────────────────

fn handle_move(state: &Arc<AppState>, player_id: Uuid, payload: &MovePayload) {
    if let Some(mut player) = state.players.get_mut(&player_id) {
        if player.dead { return; }

        // Anti-cheat: limit move distance per request (max 30 tiles from current pos)
        let dx = payload.target_x - player.x;
        let dy = payload.target_y - player.y;
        let dist = (dx * dx + dy * dy).sqrt();
        if dist > 30.0 {
            warn!("Player {} attempted move too far ({:.1} tiles)", player.username, dist);
            return;
        }

        player.target_x = payload.target_x;
        player.target_y = payload.target_y;
    }
}

// ─── Chat Handler ────────────────────────────────────────────

fn handle_chat(state: &Arc<AppState>, player_id: Uuid, payload: &ChatPayload) {
    if let Some(player) = state.players.get(&player_id) {
        let chat_msg = ChatMessageOut {
            sender: player.username.clone(),
            text: payload.text.clone(),
            channel: payload.channel.clone(),
        };
        let msg = json!({ "type": MSG_CHAT_MESSAGE, "payload": chat_msg }).to_string();

        match payload.channel.as_str() {
            "global" => state.broadcast(&msg),
            "local" => state.send_to_all_near(player.x, player.y, 30.0, &msg),
            _ => state.broadcast(&msg),
        }
    }
}

// ─── Attack Handler (PvE) ────────────────────────────────────

fn handle_attack(state: &Arc<AppState>, attacker_id: Uuid, target_id: Uuid) {
    let attacker_stats = {
        let player = match state.players.get(&attacker_id) {
            Some(p) => p,
            None => return,
        };
        if player.dead { return; }
        (player.total_atk(), player.level, player.x, player.y, player.total_lck())
    };

    let (atk, level, ax, ay, lck) = attacker_stats;

    if let Some(mut enemy) = state.enemies.get_mut(&target_id) {
        // Guard: if enemy is already dead, skip (prevents double-kill race condition)
        if enemy.hp <= 0 || matches!(enemy.state, EnemyState::Dead) { return; }

        let dist = ((enemy.x - ax).powi(2) + (enemy.y - ay).powi(2)).sqrt();
        if dist > 3.0 { return; }

        // Damage formula with crit
        let mut rng = rand::thread_rng();
        let raw_damage = atk as f64 * (0.9 + rng.r#gen::<f64>() * 0.2);
        let def_reduction = enemy.def as f64 / (enemy.def as f64 + 100.0 + level as f64 * 2.0);

        let crit_chance = 0.05 + lck as f64 * 0.001;
        let is_crit = rng.r#gen::<f64>() < crit_chance;
        let crit_mult = if is_crit { 1.5 + lck as f64 * 0.005 } else { 1.0 };

        let final_damage = (raw_damage * (1.0 - def_reduction) * crit_mult).max(1.0) as i32;
        enemy.hp -= final_damage;

        let combat_msg = json!({
            "type": MSG_COMBAT_EVENT,
            "payload": {
                "attackerId": attacker_id.to_string(),
                "targetId": target_id.to_string(),
                "damage": final_damage,
                "isCrit": is_crit,
                "targetHp": enemy.hp.max(0),
            }
        }).to_string();
        state.send_to_all_near(enemy.x, enemy.y, 40.0, &combat_msg);

        if enemy.hp <= 0 {
            enemy.state = EnemyState::Dead;
            let xp_reward = enemy.xp_reward;
            let ex = enemy.x;
            let ey = enemy.y;
            let enemy_name = enemy.name.clone();
            let enemy_level = enemy.level;
            let enemy_rank = enemy.rank.clone();
            let zone_level = state.world.get_zone_level(ex, ey);
            drop(enemy);

            // Generate loot — ranked enemies drop more
            let extra_luck = match &enemy_rank {
                protocol::EnemyRank::Champion => 50,
                protocol::EnemyRank::Elite => 150,
                protocol::EnemyRank::Boss => 500,
                _ => 0,
            };
            let loot = generate_loot(zone_level, enemy_level, lck + extra_luck);
            let gold_mult = match &enemy_rank {
                protocol::EnemyRank::Champion => 2.0,
                protocol::EnemyRank::Elite => 5.0,
                protocol::EnemyRank::Boss => 15.0,
                _ => 1.0,
            };
            let gold = (enemy_gold_reward(zone_level, enemy_level) as f64 * gold_mult) as u64;
            let tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed) as f64;

            // Drop items on ground
            for item in &loot {
                let ground_item = GroundItem {
                    id: Uuid::new_v4(),
                    item: item.clone(),
                    x: ex + rng.gen_range(-1.0..1.0),
                    y: ey + rng.gen_range(-1.0..1.0),
                    owner_id: Some(attacker_id),
                    drop_time: tick,
                    protection_duration: 600.0, // 30 seconds at 20 tps
                };
                state.ground_items.insert(ground_item.id, ground_item);
            }

            // Award XP and gold
            if let Some(mut player) = state.players.get_mut(&attacker_id) {
                player.xp += xp_reward;
                player.gold += gold;

                // Check level up
                let xp_needed = player.xp_to_next_level();
                if player.xp >= xp_needed {
                    player.level += 1;
                    player.xp -= xp_needed;
                    player.pvp_protection = player.level < 10;

                    let dim_factor = if player.level <= 50 {
                        1.0 - player.level as f64 * 0.005
                    } else {
                        0.75 * (50.0 / player.level as f64).powf(0.6)
                    };

                    player.max_hp += (10.0 * dim_factor) as i32;
                    player.hp = player.max_hp;
                    player.max_mp += (5.0 * dim_factor) as i32;
                    player.mp = player.max_mp;
                    player.atk += (5.0 * dim_factor) as i32;
                    player.def += (3.0 * dim_factor) as i32;
                    player.spd += (2.0 * dim_factor) as i32;
                    player.lck += (1.0 * dim_factor) as i32;

                    let level_msg = json!({
                        "type": MSG_LEVEL_UP,
                        "payload": { "level": player.level }
                    }).to_string();
                    state.send_to(&attacker_id, &level_msg);

                    info!("Player {} leveled up to {}!", player.username, player.level);
                }

                send_stats_update(state, &player);
            }

            // Notify about kill and loot
            let loot_names: Vec<String> = loot.iter().map(|i| i.name.clone()).collect();
            let kill_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": {
                    "sender": "System",
                    "text": format!("You defeated {}! (+{} XP, +{}g) Loot: {}", enemy_name, xp_reward, gold, loot_names.join(", ")),
                    "channel": "combat"
                }
            }).to_string();
            state.send_to(&attacker_id, &kill_msg);

            // Notify nearby about ground items
            broadcast_ground_items(state, ex, ey);

            state.enemies.remove(&target_id);
        }
    }
}

// ─── PvP Attack Handler ─────────────────────────────────────

fn handle_pvp_attack(state: &Arc<AppState>, attacker_id: Uuid, target_id: Uuid) {
    if attacker_id == target_id { return; }

    let attacker_stats = {
        let player = match state.players.get(&attacker_id) {
            Some(p) => p,
            None => return,
        };
        if player.dead { return; }
        (player.total_atk(), player.level, player.x, player.y, player.total_lck(), player.username.clone())
    };

    let (atk, level, ax, ay, lck, attacker_name) = attacker_stats;

    // Check target exists and is in range
    let target_info = {
        let target = match state.players.get(&target_id) {
            Some(p) => p,
            None => return,
        };
        if target.dead { return; }
        if target.pvp_protection {
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": "That player is under PvP protection (level < 10).", "channel": "system" }
            }).to_string();
            state.send_to(&attacker_id, &msg);
            return;
        }
        let dist = ((target.x - ax).powi(2) + (target.y - ay).powi(2)).sqrt();
        if dist > 3.0 { return; }
        (target.total_def(), target.x, target.y, target.username.clone())
    };

    let (target_def, tx, ty, target_name) = target_info;

    let mut rng = rand::thread_rng();

    let raw_damage = atk as f64 * (0.9 + rng.r#gen::<f64>() * 0.2);
    let def_reduction = target_def as f64 / (target_def as f64 + 100.0 + level as f64 * 2.0);
    let crit_chance = 0.05 + lck as f64 * 0.001;
    let is_crit = rng.r#gen::<f64>() < crit_chance;
    let crit_mult = if is_crit { 1.5 } else { 1.0 };
    let final_damage = (raw_damage * (1.0 - def_reduction) * crit_mult).max(1.0) as i32;

    // Apply damage
    let killed = {
        let mut target = state.players.get_mut(&target_id).unwrap();
        target.hp -= final_damage;
        target.hp <= 0
    };

    let combat_msg = json!({
        "type": MSG_COMBAT_EVENT,
        "payload": {
            "attackerId": attacker_id.to_string(),
            "targetId": target_id.to_string(),
            "damage": final_damage,
            "isCrit": is_crit,
        }
    }).to_string();
    state.send_to_all_near(tx, ty, 40.0, &combat_msg);

    if killed {
        // Handle PvP death
        let (dropped_items, dropped_gold) = {
            let mut target = state.players.get_mut(&target_id).unwrap();
            target.dead = true;
            target.hp = 0;
            target.respawn_timer = 100.0; // 5 seconds at 20 tps
            pvp_death_drops(&mut target)
        };

        let tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed) as f64;

        // Drop items on ground
        for item in &dropped_items {
            let ground_item = GroundItem {
                id: Uuid::new_v4(),
                item: item.clone(),
                x: tx + rng.gen_range(-1.5..1.5),
                y: ty + rng.gen_range(-1.5..1.5),
                owner_id: Some(target_id), // original owner has priority
                drop_time: tick,
                protection_duration: 600.0,
            };
            state.ground_items.insert(ground_item.id, ground_item);
        }

        // Give gold to killer
        if let Some(mut attacker) = state.players.get_mut(&attacker_id) {
            attacker.gold += dropped_gold;
        }

        // Death notification
        let death_msg = json!({
            "type": MSG_DEATH,
            "payload": { "killedBy": attacker_name }
        }).to_string();
        state.send_to(&target_id, &death_msg);

        // Kill feed
        let kill_feed = json!({
            "type": MSG_CHAT_MESSAGE,
            "payload": {
                "sender": "PvP",
                "text": format!("{} killed {}! ({} items dropped)", attacker_name, target_name, dropped_items.len()),
                "channel": "combat"
            }
        }).to_string();
        state.send_to_all_near(tx, ty, 50.0, &kill_feed);

        broadcast_ground_items(state, tx, ty);
        send_inventory_update(state, &target_id);
    }
}

// ─── Item Pickup Handler ─────────────────────────────────────

fn handle_pickup_item(state: &Arc<AppState>, player_id: Uuid, item_id: Uuid) {
    let player_pos = {
        let p = match state.players.get(&player_id) {
            Some(p) => p,
            None => return,
        };
        (p.x, p.y)
    };

    let tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed) as f64;

    if let Some(ground_item) = state.ground_items.get(&item_id) {
        let dist = ((ground_item.x - player_pos.0).powi(2) + (ground_item.y - player_pos.1).powi(2)).sqrt();
        if dist > 2.0 { return; }

        // Check ownership protection
        if let Some(owner_id) = ground_item.owner_id {
            if owner_id != player_id && (tick - ground_item.drop_time) < ground_item.protection_duration {
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": "This item is protected. Wait for protection to expire.", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
                return;
            }
        }

        let item = ground_item.item.clone();
        drop(ground_item);

        // Try to add to inventory
        if let Some(mut player) = state.players.get_mut(&player_id) {
            if player.add_item(item.clone()) {
                state.ground_items.remove(&item_id);

                let pickup_msg = json!({
                    "type": MSG_ITEM_DROP,
                    "payload": { "itemName": item.name, "rarity": item.rarity }
                }).to_string();
                state.send_to(&player_id, &pickup_msg);

                send_inventory_update(state, &player_id);
                broadcast_ground_items(state, player_pos.0, player_pos.1);
            } else {
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": "Inventory is full!", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
            }
        }
    }
}

// ─── Equipment Handlers ─────────────────────────────────────

fn handle_equip_item(state: &Arc<AppState>, player_id: Uuid, slot_index: usize) {
    if let Some(mut player) = state.players.get_mut(&player_id) {
        if slot_index >= player.inventory.len() { return; }

        if let Some(item) = player.inventory[slot_index].take() {
            if let Some(ref slot) = item.slot {
                // Unequip existing item in that slot
                if let Some(old_item) = player.equipment.remove(slot) {
                    player.inventory[slot_index] = Some(old_item);
                }
                player.equipment.insert(slot.clone(), item);

                drop(player);
                send_stats_update_by_id(state, &player_id);
                send_inventory_update(state, &player_id);
            } else {
                // Item is not equippable, put it back
                player.inventory[slot_index] = Some(item);
            }
        }
    }
}

fn handle_unequip_item(state: &Arc<AppState>, player_id: Uuid, slot: &str) {
    if let Some(mut player) = state.players.get_mut(&player_id) {
        if let Some(item) = player.equipment.remove(slot) {
            if !player.add_item(item.clone()) {
                // Inventory full, put it back
                player.equipment.insert(slot.to_string(), item);
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": "Inventory full! Cannot unequip.", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
            } else {
                drop(player);
                send_stats_update_by_id(state, &player_id);
                send_inventory_update(state, &player_id);
            }
        }
    }
}

// ─── Bank Handlers ──────────────────────────────────────────

fn handle_bank_deposit(state: &Arc<AppState>, player_id: Uuid, inv_slot: usize) {
    // Check if player is near town center (bank NPC)
    let near_bank = {
        let p = match state.players.get(&player_id) {
            Some(p) => p,
            None => return,
        };
        let dist = (p.x * p.x + p.y * p.y).sqrt();
        dist < 15.0 // Near town center
    };

    if !near_bank {
        let msg = json!({
            "type": MSG_CHAT_MESSAGE,
            "payload": { "sender": "System", "text": "You must be near the bank to deposit items.", "channel": "system" }
        }).to_string();
        state.send_to(&player_id, &msg);
        return;
    }

    if let Some(mut player) = state.players.get_mut(&player_id) {
        if inv_slot >= player.inventory.len() { return; }

        if let Some(item) = player.inventory[inv_slot].take() {
            // Find empty bank slot
            let bank_slot = player.bank.iter().position(|s| s.is_none());
            if let Some(bank_idx) = bank_slot {
                player.bank[bank_idx] = Some(item);
                drop(player);
                send_inventory_update(state, &player_id);
                send_bank_update(state, &player_id);
            } else {
                // Bank full, put item back
                player.inventory[inv_slot] = Some(item);
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": "Bank is full!", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
            }
        }
    }
}

fn handle_bank_withdraw(state: &Arc<AppState>, player_id: Uuid, bank_slot: usize) {
    let near_bank = {
        let p = match state.players.get(&player_id) {
            Some(p) => p,
            None => return,
        };
        (p.x * p.x + p.y * p.y).sqrt() < 15.0
    };

    if !near_bank {
        let msg = json!({
            "type": MSG_CHAT_MESSAGE,
            "payload": { "sender": "System", "text": "You must be near the bank to withdraw items.", "channel": "system" }
        }).to_string();
        state.send_to(&player_id, &msg);
        return;
    }

    if let Some(mut player) = state.players.get_mut(&player_id) {
        if bank_slot >= player.bank.len() { return; }

        if let Some(item) = player.bank[bank_slot].take() {
            if player.add_item(item.clone()) {
                drop(player);
                send_inventory_update(state, &player_id);
                send_bank_update(state, &player_id);
            } else {
                // Inventory full, put back
                player.bank[bank_slot] = Some(item);
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": "Inventory is full!", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
            }
        }
    }
}

// ─── UseItem / Crafting Handler ─────────────────────────────

fn handle_use_item(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "craft" => {
            let recipe_id = match payload.get("recipeId").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return,
            };
            handle_craft(state, player_id, &recipe_id);
        }
        "buy" => {
            // Marketplace buy — placeholder: send feedback
            let listing_id = payload.get("listingId").and_then(|v| v.as_str()).unwrap_or("unknown");
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": format!("Marketplace buying is not yet implemented (listing: {}).", listing_id), "channel": "system" }
            }).to_string();
            state.send_to(&player_id, &msg);
        }
        "use" => {
            // Use a consumable item from inventory
            let slot_index = match payload.get("slotIndex").and_then(|v| v.as_u64()) {
                Some(idx) => idx as usize,
                None => return,
            };
            if let Some(mut player) = state.players.get_mut(&player_id) {
                if slot_index >= player.inventory.len() { return; }
                if let Some(ref item) = player.inventory[slot_index] {
                    if item.item_type == ItemType::Consumable {
                        // Apply consumable effect
                        let heal = item.stats.get("HP").copied().unwrap_or(0);
                        let item_name = item.name.clone();
                        player.inventory[slot_index] = None;
                        if heal > 0 {
                            player.hp = (player.hp + heal).min(player.max_hp);
                        }
                        drop(player);
                        // Send feedback
                        let msg = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": format!("Used {}. Healed {} HP.", item_name, heal), "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &msg);
                        send_inventory_update(state, &player_id);
                        send_stats_update_by_id(state, &player_id);
                    } else {
                        let msg = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": "This item cannot be used.", "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &msg);
                    }
                }
            }
        }
        _ => {
            warn!("Unknown UseItem action: {}", action);
        }
    }
}

/// Simple crafting: match recipe ID, check materials in inventory, consume, produce result.
fn handle_craft(state: &Arc<AppState>, player_id: Uuid, recipe_id: &str) {
    // Server-side recipe definitions (mirroring client defaults)
    struct Recipe {
        id: &'static str,
        name: &'static str,
        materials: &'static [(&'static str, u32)], // (template_id, quantity)
        result_name: &'static str,
        result_type: &'static str,
        result_slot: Option<&'static str>,
        result_rarity: u8,
        result_level: u32,
        result_stat_key: &'static str,
        result_stat_val: i32,
    }

    let recipes: &[Recipe] = &[
        Recipe { id: "iron_sword", name: "Iron Sword", materials: &[("iron_ore", 3), ("wood", 1)],
            result_name: "Iron Sword", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 0, result_level: 1, result_stat_key: "ATK", result_stat_val: 8 },
        Recipe { id: "iron_shield", name: "Iron Shield", materials: &[("iron_ore", 4)],
            result_name: "Iron Shield", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 0, result_level: 1, result_stat_key: "DEF", result_stat_val: 6 },
        Recipe { id: "health_potion", name: "Health Potion", materials: &[("herb", 2)],
            result_name: "Health Potion", result_type: "consumable", result_slot: None,
            result_rarity: 0, result_level: 1, result_stat_key: "HP", result_stat_val: 50 },
        Recipe { id: "leather_armor", name: "Leather Armor", materials: &[("leather", 3), ("iron_ore", 1)],
            result_name: "Leather Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 0, result_level: 3, result_stat_key: "DEF", result_stat_val: 10 },
        Recipe { id: "steel_sword", name: "Steel Sword", materials: &[("iron_ore", 5), ("coal", 2)],
            result_name: "Steel Sword", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 1, result_level: 5, result_stat_key: "ATK", result_stat_val: 18 },
        Recipe { id: "gold_ring", name: "Gold Ring", materials: &[("gold_ore", 2)],
            result_name: "Gold Ring", result_type: "armor", result_slot: Some("ring1"),
            result_rarity: 1, result_level: 5, result_stat_key: "LCK", result_stat_val: 5 },
    ];

    let recipe = match recipes.iter().find(|r| r.id == recipe_id) {
        Some(r) => r,
        None => {
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": "Unknown recipe.", "channel": "system" }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }
    };

    if let Some(mut player) = state.players.get_mut(&player_id) {
        // Check if player has required materials
        for &(template_id, qty_needed) in recipe.materials {
            let has_qty: u32 = player.inventory.iter().flatten()
                .filter(|item| item.template_id == template_id)
                .map(|item| item.quantity)
                .sum();
            if has_qty < qty_needed {
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": format!("Not enough {}! Need {} but have {}.", template_id.replace('_', " "), qty_needed, has_qty), "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
                return;
            }
        }

        // Consume materials
        for &(template_id, mut qty_needed) in recipe.materials {
            for slot in player.inventory.iter_mut() {
                if qty_needed == 0 { break; }
                if let Some(item) = slot {
                    if item.template_id == template_id {
                        if item.quantity <= qty_needed {
                            qty_needed -= item.quantity;
                            *slot = None;
                        } else {
                            item.quantity -= qty_needed;
                            qty_needed = 0;
                        }
                    }
                }
            }
        }

        // Create result item
        let mut stats = std::collections::HashMap::new();
        stats.insert(recipe.result_stat_key.to_string(), recipe.result_stat_val);

        let result_item = Item {
            id: Uuid::new_v4().to_string(),
            template_id: recipe.id.to_string(),
            name: recipe.result_name.to_string(),
            rarity: recipe.result_rarity,
            item_type: match recipe.result_type {
                "weapon" => ItemType::Weapon,
                "armor" => ItemType::Armor,
                "consumable" => ItemType::Consumable,
                "material" => ItemType::Material,
                _ => ItemType::Misc,
            },
            slot: recipe.result_slot.map(|s| s.to_string()),
            stackable: recipe.result_type == "consumable" || recipe.result_type == "material",
            quantity: 1,
            level: recipe.result_level,
            stats,
            description: format!("Crafted {}", recipe.result_name),
            affixes: vec![],
        };

        if player.add_item(result_item) {
            let craft_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": format!("✅ Crafted {}!", recipe.name), "channel": "system" }
            }).to_string();
            drop(player);
            state.send_to(&player_id, &craft_msg);
            send_inventory_update(state, &player_id);
        } else {
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": "Inventory full! Cannot craft.", "channel": "system" }
            }).to_string();
            state.send_to(&player_id, &msg);
        }
    }
}

// ─── Helper Functions ───────────────────────────────────────

fn send_stats_update(state: &Arc<AppState>, player: &PlayerData) {
    let stats_msg = json!({
        "type": MSG_STATS_UPDATE,
        "payload": {
            "hp": player.hp,
            "maxHp": player.max_hp,
            "mp": player.mp,
            "maxMp": player.max_mp,
            "level": player.level,
            "xp": player.xp,
            "xpNeeded": player.xp_to_next_level(),
            "atk": player.total_atk(),
            "def": player.total_def(),
            "spd": player.spd,
            "lck": player.total_lck(),
            "gold": player.gold,
        }
    }).to_string();
    state.send_to(&player.id, &stats_msg);
}

fn send_stats_update_by_id(state: &Arc<AppState>, player_id: &Uuid) {
    if let Some(player) = state.players.get(player_id) {
        send_stats_update(state, &player);
    }
}

fn send_inventory_update(state: &Arc<AppState>, player_id: &Uuid) {
    if let Some(player) = state.players.get(player_id) {
        let inv_msg = json!({
            "type": MSG_INVENTORY_UPDATE,
            "payload": {
                "items": player.inventory_payload(),
                "equipment": player.equipment.iter().map(|(slot, item)| {
                    json!({ "slot": slot, "item": item.to_json(0) })
                }).collect::<Vec<_>>(),
                "gold": player.gold,
            }
        }).to_string();
        state.send_to(player_id, &inv_msg);
    }
}

fn send_bank_update(state: &Arc<AppState>, player_id: &Uuid) {
    if let Some(player) = state.players.get(player_id) {
        let bank_msg = json!({
            "type": MSG_BANK_UPDATE,
            "payload": { "items": player.bank_payload() }
        }).to_string();
        state.send_to(player_id, &bank_msg);
    }
}

fn broadcast_ground_items(state: &Arc<AppState>, x: f64, y: f64) {
    let items: Vec<serde_json::Value> = state.ground_items.iter()
        .filter(|gi| {
            let dist = ((gi.x - x).powi(2) + (gi.y - y).powi(2)).sqrt();
            dist < 30.0
        })
        .map(|gi| json!({
            "id": gi.id.to_string(),
            "name": gi.item.name,
            "rarity": gi.item.rarity,
            "x": gi.x,
            "y": gi.y,
        }))
        .collect();

    let msg = json!({
        "type": MSG_GROUND_ITEMS,
        "payload": { "items": items }
    }).to_string();
    state.send_to_all_near(x, y, 30.0, &msg);
}

// ─── XP Orb System ──────────────────────────────────────────

/// Spawn XP orbs near players periodically (agar.io style ground XP).
/// Each orb is a special GroundItem with template_id "xp_orb_*".
fn spawn_xp_orbs(state: &Arc<AppState>) {
    let mut rng = rand::thread_rng();
    let player_positions: Vec<(f64, f64)> = state.players.iter()
        .filter(|p| !p.dead)
        .map(|p| (p.x, p.y))
        .collect();

    if player_positions.is_empty() { return; }

    // Count existing XP orbs
    let xp_orb_count = state.ground_items.iter()
        .filter(|gi| gi.item.template_id.starts_with("xp_orb"))
        .count();

    // Cap total XP orbs in the world
    let max_orbs = (player_positions.len() * 30).min(500);
    if xp_orb_count >= max_orbs { return; }

    let orbs_to_spawn = ((max_orbs - xp_orb_count) as usize).min(player_positions.len() * 5);

    for _ in 0..orbs_to_spawn {
        // Pick a random player and spawn orb within 8-20 tiles of them
        let (px, py) = player_positions[rng.gen_range(0..player_positions.len())];
        let angle: f64 = rng.gen_range(0.0..std::f64::consts::TAU);
        let dist: f64 = rng.gen_range(4.0..18.0);
        let ox = px + angle.cos() * dist;
        let oy = py + angle.sin() * dist;

        // Tier: 70% small (green), 22% medium (blue), 8% large (purple)
        let roll: f64 = rng.r#gen::<f64>();
        let (tier_name, tier_rarity, xp_amount) = if roll < 0.70 {
            ("XP Orb", 1u8, rng.gen_range(5..15) as u32)       // green
        } else if roll < 0.92 {
            ("XP Orb+", 2u8, rng.gen_range(20..50) as u32)     // blue
        } else {
            ("XP Orb++", 3u8, rng.gen_range(60..150) as u32)   // purple
        };

        let mut stats = HashMap::new();
        stats.insert("XP".to_string(), xp_amount as i32);

        let item = Item {
            id: Uuid::new_v4().to_string(),
            template_id: format!("xp_orb_{}", xp_amount),
            name: tier_name.to_string(),
            rarity: tier_rarity,
            item_type: ItemType::Misc,
            slot: None,
            stackable: false,
            quantity: 1,
            level: 0,
            stats,
            description: format!("+{} XP", xp_amount),
            affixes: vec![],
        };

        let ground_item = GroundItem {
            id: Uuid::new_v4(),
            item,
            x: ox,
            y: oy,
            owner_id: None,
            drop_time: 0.0,
            protection_duration: 0.0,
        };
        state.ground_items.insert(ground_item.id, ground_item);
    }
}

/// Auto-pickup XP orbs within 1.5 tiles of a player during movement.
/// Returns list of (player_id, xp_gained, orb_x, orb_y) to send notifications.
fn pickup_xp_orbs(state: &Arc<AppState>) {
    let player_data: Vec<(Uuid, f64, f64, bool)> = state.players.iter()
        .map(|p| (p.id, p.x, p.y, p.dead))
        .collect();

    for (player_id, px, py, dead) in &player_data {
        if *dead { continue; }

        // Find XP orbs within pickup range
        let nearby_orbs: Vec<Uuid> = state.ground_items.iter()
            .filter(|gi| {
                gi.item.template_id.starts_with("xp_orb") &&
                ((gi.x - px).powi(2) + (gi.y - py).powi(2)).sqrt() < 1.5
            })
            .map(|gi| gi.id)
            .collect();

        for orb_id in nearby_orbs {
            if let Some((_, orb)) = state.ground_items.remove(&orb_id) {
                let xp_amount = orb.item.stats.get("XP").copied().unwrap_or(10) as u64;

                if let Some(mut player) = state.players.get_mut(player_id) {
                    player.xp += xp_amount;

                    // Check level up
                    let xp_needed = player.xp_to_next_level();
                    if player.xp >= xp_needed {
                        player.level += 1;
                        player.xp -= xp_needed;
                        player.pvp_protection = player.level < 10;

                        let dim_factor = if player.level <= 50 {
                            1.0 - player.level as f64 * 0.005
                        } else {
                            0.75 * (50.0 / player.level as f64).powf(0.6)
                        };

                        player.max_hp += (10.0 * dim_factor) as i32;
                        player.hp = player.max_hp;
                        player.max_mp += (5.0 * dim_factor) as i32;
                        player.mp = player.max_mp;
                        player.atk += (5.0 * dim_factor) as i32;
                        player.def += (3.0 * dim_factor) as i32;
                        player.spd += (2.0 * dim_factor) as i32;
                        player.lck += (1.0 * dim_factor) as i32;

                        let level_msg = json!({
                            "type": MSG_LEVEL_UP,
                            "payload": { "level": player.level }
                        }).to_string();
                        state.send_to(player_id, &level_msg);
                    }

                    send_stats_update(state, &player);
                }

                // Notify client with floating XP text
                let pickup_msg = json!({
                    "type": MSG_XP_ORB_PICKUP,
                    "payload": { "xp": xp_amount, "x": orb.x, "y": orb.y }
                }).to_string();
                state.send_to(player_id, &pickup_msg);
            }
        }
    }
}

// ─── Game Loop ───────────────────────────────────────────────

async fn game_loop(state: Arc<AppState>) {
    let tick_duration = Duration::from_millis(50); // 20 ticks/sec

    loop {
        let tick_start = tokio::time::Instant::now();
        let tick = state.tick_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        // 1. Move players toward their targets
        update_player_movement(&state);

        // 1b. Auto-pickup XP orbs near players
        pickup_xp_orbs(&state);

        // 2. Handle dead player respawns
        update_dead_players(&state);

        // 3. Enemy AI attacks players
        if tick % 3 == 0 {
            update_enemies(&state);
            process_enemy_attacks(&state);
        }

        // 4. Broadcast entity states (every 2 ticks)
        if tick % 2 == 0 {
            broadcast_entity_updates(&state);
        }

        // 5. Respawn enemies (every 200 ticks = 10 seconds)
        if tick % 200 == 0 {
            respawn_enemies(&state);
        }

        // 5b. Spawn XP orbs near players (every 60 ticks = 3 seconds)
        if tick % 60 == 0 {
            spawn_xp_orbs(&state);
        }

        // 6. Clean up old ground items (every 100 ticks = 5 seconds)
        if tick % 100 == 0 {
            cleanup_ground_items(&state, tick as f64);
        }

        // 7. Sync ground items to nearby players (every 10 ticks = 0.5 seconds)
        if tick % 10 == 0 {
            sync_ground_items_to_players(&state);
        }

        let elapsed = tick_start.elapsed();
        if elapsed < tick_duration {
            tokio::time::sleep(tick_duration - elapsed).await;
        }
    }
}

fn update_player_movement(state: &Arc<AppState>) {
    let speed: f64 = 3.0 / 20.0; // 3 tiles/sec at 20 tps

    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.dead { continue; }

        let dx = player.target_x - player.x;
        let dy = player.target_y - player.y;
        let dist = (dx * dx + dy * dy).sqrt();

        if dist > 0.1 {
            let step = speed.min(dist);
            player.x += (dx / dist) * step;
            player.y += (dy / dist) * step;
        } else {
            player.x = player.target_x;
            player.y = player.target_y;
        }
    }
}

fn update_dead_players(state: &Arc<AppState>) {
    let mut to_respawn = Vec::new();

    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.dead {
            player.respawn_timer -= 1.0;
            if player.respawn_timer <= 0.0 {
                to_respawn.push(player.id);
                player.dead = false;
                player.hp = player.max_hp / 2; // Respawn with 50% HP
                player.mp = player.max_mp / 2;
                player.x = 0.0; // Respawn at town center
                player.y = 0.0;
                player.target_x = 0.0;
                player.target_y = 0.0;
            }
        }
    }

    for pid in to_respawn {
        let respawn_msg = json!({
            "type": MSG_RESPAWN,
            "payload": { "x": 0, "y": 0 }
        }).to_string();
        state.send_to(&pid, &respawn_msg);

        send_stats_update_by_id(state, &pid);
    }
}

fn process_enemy_attacks(state: &Arc<AppState>) {
    let mut attacks: Vec<(Uuid, Uuid, i32)> = Vec::new(); // (enemy_id, player_id, damage)

    for mut entry in state.enemies.iter_mut() {
        let enemy = entry.value_mut();
        if enemy.state == EnemyState::Attack && enemy.attack_cooldown <= 0.0 {
            if let Some(target_id) = enemy.target_player {
                if let Some(player) = state.players.get(&target_id) {
                    if !player.dead {
                        let raw_damage = enemy.atk as f64 * (0.9 + rand::random::<f64>() * 0.2);
                        let def = player.total_def();
                        let def_reduction = def as f64 / (def as f64 + 100.0 + enemy.level as f64 * 2.0);
                        let final_damage = (raw_damage * (1.0 - def_reduction)).max(1.0) as i32;
                        attacks.push((enemy.id, target_id, final_damage));
                        enemy.attack_cooldown = 30.0; // 1.5 seconds at 20 tps
                    }
                }
            }
        }
    }

    for (enemy_id, player_id, damage) in attacks {
        let killed = if let Some(mut player) = state.players.get_mut(&player_id) {
            player.hp -= damage;
            player.hp <= 0
        } else {
            false
        };

        let combat_msg = json!({
            "type": MSG_COMBAT_EVENT,
            "payload": {
                "attackerId": enemy_id.to_string(),
                "targetId": player_id.to_string(),
                "damage": damage,
                "isCrit": false,
            }
        }).to_string();
        state.send_to(&player_id, &combat_msg);

        if killed {
            if let Some(mut player) = state.players.get_mut(&player_id) {
                player.dead = true;
                player.hp = 0;
                player.respawn_timer = 100.0;
            }
            let death_msg = json!({
                "type": MSG_DEATH,
                "payload": {}
            }).to_string();
            state.send_to(&player_id, &death_msg);
        } else {
            send_stats_update_by_id(state, &player_id);
        }
    }
}

fn cleanup_ground_items(state: &Arc<AppState>, current_tick: f64) {
    let max_age = 6000.0; // 5 minutes at 20 tps
    let to_remove: Vec<Uuid> = state.ground_items.iter()
        .filter(|gi| (current_tick - gi.drop_time) > max_age)
        .map(|gi| gi.id)
        .collect();

    for id in to_remove {
        state.ground_items.remove(&id);
    }
}

fn sync_ground_items_to_players(state: &Arc<AppState>) {
    for entry in state.players.iter() {
        let player = entry.value();
        if player.dead { continue; }
        let px = player.x;
        let py = player.y;
        let pid = player.id;

        let items: Vec<serde_json::Value> = state.ground_items.iter()
            .filter(|gi| {
                let dist_sq = (gi.x - px).powi(2) + (gi.y - py).powi(2);
                dist_sq < 900.0 // 30.0^2
            })
            .map(|gi| json!({
                "id": gi.id.to_string(),
                "name": gi.item.name,
                "rarity": gi.item.rarity,
                "x": gi.x,
                "y": gi.y,
            }))
            .collect();

        let msg = json!({
            "type": MSG_GROUND_ITEMS,
            "payload": { "items": items }
        }).to_string();
        state.send_to(&pid, &msg);
    }
}

fn update_enemies(state: &Arc<AppState>) {
    let players: Vec<(Uuid, f64, f64)> = state
        .players
        .iter()
        .map(|entry| (entry.value().id, entry.value().x, entry.value().y))
        .collect();

    let dt = 3.0 / 20.0; // 3 ticks at 20 tps

    for mut entry in state.enemies.iter_mut() {
        update_enemy_ai(entry.value_mut(), &players, dt);
    }
}

fn broadcast_entity_updates(state: &Arc<AppState>) {
    // Update spatial grids first
    state.update_spatial_grids();

    let view_range = 50.0;
    let view_range_sq = view_range * view_range;

    // For each player, collect nearby entities using spatial grid
    for entry in state.players.iter() {
        let player = entry.value();
        let cells = nearby_cells_range(player.x, player.y, view_range);

        let mut visible: Vec<EntityState> = Vec::new();

        for cell in &cells {
            // Nearby players
            if let Some(pids) = state.player_grid.get(cell) {
                for pid in pids.value() {
                    if let Some(other) = state.players.get(pid) {
                        let dx = other.x - player.x;
                        let dy = other.y - player.y;
                        if dx * dx + dy * dy <= view_range_sq {
                            visible.push(other.to_entity_state());
                        }
                    }
                }
            }

            // Nearby enemies
            if let Some(eids) = state.enemy_grid.get(cell) {
                for eid in eids.value() {
                    if let Some(enemy) = state.enemies.get(eid) {
                        let dx = enemy.x - player.x;
                        let dy = enemy.y - player.y;
                        if dx * dx + dy * dy <= view_range_sq {
                            visible.push(enemy.to_entity_state());
                        }
                    }
                }
            }
        }

        let update_msg = json!({
            "type": MSG_ENTITY_UPDATE,
            "payload": { "entities": visible }
        })
        .to_string();

        state.send_to(&player.id, &update_msg);
    }
}

fn respawn_enemies(state: &Arc<AppState>) {
    let current_count = state.enemies.len();
    // Scale target with player count, minimum 200
    let player_count = state.players.len();
    let target_count = (200 + player_count * 30).max(200);

    if current_count < target_count {
        let to_spawn = (target_count - current_count).min(20); // cap per cycle
        let mut rng = rand::thread_rng();

        // Collect player chunk positions for spawning near them
        let player_chunks: Vec<(i32, i32)> = state.players.iter()
            .filter(|e| !e.value().dead)
            .map(|e| {
                let p = e.value();
                ((p.x / 32.0).floor() as i32, (p.y / 32.0).floor() as i32)
            })
            .collect();

        for _ in 0..to_spawn {
            // Pick a chunk near a random player, or random if no players
            let (bcx, bcy) = if !player_chunks.is_empty() {
                player_chunks[rng.gen_range(0..player_chunks.len())]
            } else {
                (0, 0)
            };
            let cx = bcx + rng.gen_range(-3..=3);
            let cy = bcy + rng.gen_range(-3..=3);
            let spawns = state.world.get_enemy_spawns(cx, cy);
            if let Some(&(x, y, zone_level)) = spawns.first() {
                let enemy = generate_enemy(x, y, zone_level);
                state.enemies.insert(enemy.id, enemy);
            }
        }
    }
}
