mod enemy;
mod protocol;
mod world;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

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

// ─── Server State ────────────────────────────────────────────

struct AppState {
    /// All connected players (id -> player data)
    players: DashMap<Uuid, PlayerData>,
    /// WebSocket senders for each player
    senders: DashMap<Uuid, mpsc::UnboundedSender<String>>,
    /// Registered accounts (username -> password hash) - in-memory for now
    accounts: DashMap<String, String>,
    /// World generator
    world: WorldGenerator,
    /// Active enemies
    enemies: DashMap<Uuid, EnemyData>,
    /// Generated chunks cache
    chunk_cache: DashMap<(i32, i32), ChunkData>,
    /// Broadcast channel for global messages
    broadcast_tx: broadcast::Sender<String>,
}

impl AppState {
    fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(1024);
        Self {
            players: DashMap::new(),
            senders: DashMap::new(),
            accounts: DashMap::new(),
            world: WorldGenerator::new(42),
            enemies: DashMap::new(),
            chunk_cache: DashMap::new(),
            broadcast_tx,
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
        for entry in self.players.iter() {
            let player = entry.value();
            let dist = ((player.x - x).powi(2) + (player.y - y).powi(2)).sqrt();
            if dist <= range {
                self.send_to(&player.id, msg);
            }
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
    // Spawn enemies in chunks around the center
    for cx in -3..=3_i32 {
        for cy in -3..=3_i32 {
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

    // Cleanup on disconnect
    let pid = *player_id.lock().await;
    if let Some(id) = pid {
        state.players.remove(&id);
        state.senders.remove(&id);

        // Notify others
        let leave_msg = json!({
            "type": MSG_PLAYER_LEFT,
            "payload": { "id": id.to_string() }
        })
        .to_string();
        state.broadcast(&leave_msg);
        info!("Player {} disconnected", id);
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

    // Create player
    let player = PlayerData::new(auth.username.clone());
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

    // Send initial chunks
    for cx in -2..=2_i32 {
        for cy in -2..=2_i32 {
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

// ─── Attack Handler ──────────────────────────────────────────

fn handle_attack(state: &Arc<AppState>, attacker_id: Uuid, target_id: Uuid) {
    let attacker_stats = {
        let player = match state.players.get(&attacker_id) {
            Some(p) => p,
            None => return,
        };
        (player.atk, player.level, player.x, player.y)
    };

    let (atk, level, ax, ay) = attacker_stats;

    // Check if target is enemy
    if let Some(mut enemy) = state.enemies.get_mut(&target_id) {
        let dist = ((enemy.x - ax).powi(2) + (enemy.y - ay).powi(2)).sqrt();
        if dist > 3.0 {
            return; // Too far
        }

        // Damage formula
        let raw_damage = atk as f64 * 1.0 * (0.9 + rand::random::<f64>() * 0.2);
        let def_reduction = enemy.def as f64 / (enemy.def as f64 + 100.0 + level as f64 * 2.0);
        let final_damage = (raw_damage * (1.0 - def_reduction)).max(1.0) as i32;

        enemy.hp -= final_damage;

        // Broadcast combat event
        let combat_msg = json!({
            "type": MSG_COMBAT_EVENT,
            "payload": {
                "attackerId": attacker_id.to_string(),
                "targetId": target_id.to_string(),
                "damage": final_damage,
                "targetHp": enemy.hp.max(0),
            }
        })
        .to_string();
        state.send_to_all_near(enemy.x, enemy.y, 40.0, &combat_msg);

        if enemy.hp <= 0 {
            enemy.state = EnemyState::Dead;
            let xp_reward = enemy.xp_reward;
            let _ex = enemy.x;
            let _ey = enemy.y;
            let enemy_name = enemy.name.clone();
            drop(enemy);

            // Award XP
            if let Some(mut player) = state.players.get_mut(&attacker_id) {
                player.xp += xp_reward;

                // Check level up
                let xp_needed = player.xp_to_next_level();
                if player.xp >= xp_needed {
                    player.level += 1;
                    player.xp -= xp_needed;

                    // Apply stat gains with diminishing returns
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
                    })
                    .to_string();
                    state.send_to(&attacker_id, &level_msg);

                    info!(
                        "Player {} leveled up to {}!",
                        player.username, player.level
                    );
                }

                // Send stats update
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
                        "atk": player.atk,
                        "def": player.def,
                        "spd": player.spd,
                        "lck": player.lck,
                    }
                })
                .to_string();
                state.send_to(&attacker_id, &stats_msg);
            }

            // Notify about kill
            let kill_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": {
                    "sender": "System",
                    "text": format!("You defeated {}! (+{} XP)", enemy_name, xp_reward),
                    "channel": "system"
                }
            })
            .to_string();
            state.send_to(&attacker_id, &kill_msg);

            // Remove dead enemy, will respawn in game loop
            state.enemies.remove(&target_id);
        }
    }
}

// ─── Game Loop ───────────────────────────────────────────────

async fn game_loop(state: Arc<AppState>) {
    let tick_duration = Duration::from_millis(50); // 20 ticks/sec
    let mut tick_count: u64 = 0;

    loop {
        let tick_start = tokio::time::Instant::now();
        tick_count += 1;

        // 1. Move players toward their targets
        update_player_movement(&state);

        // 2. Update enemy AI (every 3 ticks for performance)
        if tick_count % 3 == 0 {
            update_enemies(&state);
        }

        // 3. Broadcast entity states (every 2 ticks)
        if tick_count % 2 == 0 {
            broadcast_entity_updates(&state);
        }

        // 4. Respawn enemies (every 200 ticks = 10 seconds)
        if tick_count % 200 == 0 {
            respawn_enemies(&state);
        }

        // Sleep until next tick
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
    // Collect all entity states
    let player_states: Vec<EntityState> = state
        .players
        .iter()
        .map(|entry| entry.value().to_entity_state())
        .collect();

    let enemy_states: Vec<EntityState> = state
        .enemies
        .iter()
        .filter(|e| e.value().state != EnemyState::Dead)
        .map(|entry| entry.value().to_entity_state())
        .collect();

    // For each player, send entities near them (AOI)
    for entry in state.players.iter() {
        let player = entry.value();
        let view_range = 50.0; // tiles

        let mut visible: Vec<EntityState> = Vec::new();

        // Other players in range
        for ps in &player_states {
            let dist = ((ps.x - player.x).powi(2) + (ps.y - player.y).powi(2)).sqrt();
            if dist <= view_range {
                visible.push(ps.clone());
            }
        }

        // Enemies in range
        for es in &enemy_states {
            let dist = ((es.x - player.x).powi(2) + (es.y - player.y).powi(2)).sqrt();
            if dist <= view_range {
                visible.push(es.clone());
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
    let target_count = 150; // Maintain minimum enemy count

    if current_count < target_count {
        let to_spawn = target_count - current_count;
        let mut rng = rand::thread_rng();
        use rand::Rng;

        for _ in 0..to_spawn {
            let cx: i32 = rng.gen_range(-3..=3);
            let cy: i32 = rng.gen_range(-3..=3);
            let spawns = state.world.get_enemy_spawns(cx, cy);
            if let Some(&(x, y, zone_level)) = spawns.first() {
                let enemy = generate_enemy(x, y, zone_level);
                state.enemies.insert(enemy.id, enemy);
            }
        }
    }
}
