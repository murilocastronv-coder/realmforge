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
use sqlx::PgPool;

use crate::enemy::{generate_enemy, update_enemy_ai, compute_pack_aggro};
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
    db: PgPool,
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
    /// Party system: party_id -> set of member player IDs
    parties: DashMap<Uuid, Vec<Uuid>>,
    /// Player -> party mapping
    player_party: DashMap<Uuid, Uuid>,
    /// Pending party invites: invited_player_id -> (party_leader_id, invite_time)
    party_invites: DashMap<Uuid, (Uuid, std::time::Instant)>,
    /// Active trades: trade_id -> TradeSession
    active_trades: DashMap<Uuid, TradeSession>,
    /// Player -> active trade mapping
    player_trade: DashMap<Uuid, Uuid>,
    /// Pending trade requests: target_player_id -> (requester_id, time)
    trade_requests: DashMap<Uuid, (Uuid, std::time::Instant)>,
    /// Guild data: guild_id -> GuildData
    guilds: DashMap<Uuid, GuildData>,
    /// Guild name uniqueness index: lowercase name -> guild_id
    guild_names: DashMap<String, Uuid>,
    /// Pending guild invites: invited_player_id -> (guild_id, inviter_name, time)
    guild_invites: DashMap<Uuid, (Uuid, String, std::time::Instant)>,
    /// Auction house listings: listing_id -> AuctionListing
    auction_listings: DashMap<Uuid, AuctionListing>,
    /// Active world event: (event_type, expire_tick)
    active_world_event: std::sync::RwLock<Option<(&'static str, u64)>>,
}

impl AppState {
    fn new(db: PgPool) -> Self {
        let (broadcast_tx, _) = broadcast::channel(1024);
        Self {
            db,
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
            parties: DashMap::new(),
            player_party: DashMap::new(),
            party_invites: DashMap::new(),
            active_trades: DashMap::new(),
            player_trade: DashMap::new(),
            trade_requests: DashMap::new(),
            guilds: DashMap::new(),
            guild_names: DashMap::new(),
            guild_invites: DashMap::new(),
            auction_listings: DashMap::new(),
            active_world_event: std::sync::RwLock::new(None),
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

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be configured on Render");
    let db = PgPool::connect(&database_url).await
        .expect("Could not connect to PostgreSQL");
    sqlx::query("CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, password TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())")
        .execute(&db).await.expect("Could not create accounts table");
    let stored_accounts = sqlx::query_as::<_, (String, String)>("SELECT username, password FROM accounts")
        .fetch_all(&db).await.expect("Could not load accounts from PostgreSQL");
    let state = Arc::new(AppState::new(db));
    for (username, password) in stored_accounts {
        state.accounts.insert(username, password);
    }
    info!("Loaded {} accounts from PostgreSQL", state.accounts.len());

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
        .route("/stats", get({ let stats_state = state.clone(); move || async move {
            axum::Json(serde_json::json!({
                "online": stats_state.players.len(),
                "registered": stats_state.accounts.len()
            }))
        }}))
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        )
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);
    info!("🏰 RealmForge server starting on {}", addr);
    info!("   WebSocket endpoint: ws://{}/ws", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn spawn_initial_enemies(state: &Arc<AppState>) {
    // Spawn enemies in chunks around the center (expanded to -6..=6)
    for cx in -6..=6_i32 {
        for cy in -6..=6_i32 {
            let spawns = state.world.get_enemy_spawns(cx, cy);
            for (x, y, zone_level) in spawns {
                let biome = state.world.get_biome(x, y);
                let enemy = generate_enemy(x, y, zone_level, biome);
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
            if let Some(pid) = player_id {
                if let (Some(cx), Some(cy)) = (
                    msg.payload.get("chunkX").and_then(|v| v.as_i64()),
                    msg.payload.get("chunkY").and_then(|v| v.as_i64()),
                ) {
                    let chunk = get_or_generate_chunk(state, cx as i32, cy as i32);
                    let biome = chunk.biome.clone();
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

                    // Track biome visit for quest progress
                    let is_new_biome = if let Some(mut player) = state.players.get_mut(&pid) {
                        player.stats_tracker.biomes_visited.insert(biome)
                    } else {
                        false
                    };
                    if is_new_biome {
                        check_quest_progress(state, pid, "visit_biome", "", 0);
                    }
                }
            }
        }
        MSG_ALLOCATE_STATS => {
            if let Some(pid) = player_id {
                handle_allocate_stats(state, pid, &msg.payload);
            }
        }
        MSG_USE_SKILL => {
            if let Some(pid) = player_id {
                handle_use_skill(state, pid, &msg.payload);
            }
        }
        MSG_PARTY_ACTION => {
            if let Some(pid) = player_id {
                handle_party_action(state, pid, &msg.payload);
            }
        }
        MSG_TRADE_ACTION => {
            if let Some(pid) = player_id {
                handle_trade_action(state, pid, &msg.payload);
            }
        }
        MSG_QUEST_ACCEPT => {
            if let Some(pid) = player_id {
                if let Some(quest_id) = msg.payload.get("questId").and_then(|v| v.as_str()) {
                    handle_quest_accept(state, pid, quest_id);
                }
            }
        }
        MSG_QUEST_TURN_IN => {
            if let Some(pid) = player_id {
                if let Some(quest_id) = msg.payload.get("questId").and_then(|v| v.as_str()) {
                    handle_quest_turn_in(state, pid, quest_id);
                }
            }
        }
        MSG_QUEST_LIST_REQUEST => {
            if let Some(pid) = player_id {
                handle_quest_list_request(state, pid, sender);
            }
        }
        MSG_NPC_INTERACT => {
            if let Some(pid) = player_id {
                if let Some(npc_id) = msg.payload.get("npcId").and_then(|v| v.as_str()) {
                    handle_npc_interact(state, pid, npc_id);
                }
            }
        }
        MSG_SKILL_TREE_UNLOCK => {
            if let Some(pid) = player_id {
                handle_skill_tree_unlock(state, pid, &msg.payload);
            }
        }
        MSG_SKILL_TREE_REQUEST => {
            if let Some(pid) = player_id {
                handle_skill_tree_request(state, pid);
            }
        }
        MSG_GUILD_ACTION => {
            if let Some(pid) = player_id {
                handle_guild_action(state, pid, &msg.payload);
            }
        }
        MSG_FISHING_ACTION => {
            if let Some(pid) = player_id {
                handle_fishing_action(state, pid, &msg.payload);
            }
        }
        MSG_FACTION_ACTION => {
            if let Some(pid) = player_id {
                handle_faction_action(state, pid, &msg.payload);
            }
        }
        MSG_ENCHANT_ITEM => {
            if let Some(pid) = player_id {
                handle_enchant_item(state, pid, &msg.payload);
            }
        }
        MSG_SET_TITLE => {
            if let Some(pid) = player_id {
                handle_set_title(state, pid, &msg.payload);
            }
        }
        MSG_GATHER_ACTION => {
            if let Some(pid) = player_id {
                handle_gather_action(state, pid, &msg.payload);
            }
        }
        MSG_LEADERBOARD_REQUEST => {
            if let Some(pid) = player_id {
                handle_leaderboard_request(state, pid);
            }
        }
        MSG_PET_ACTION => {
            if let Some(pid) = player_id {
                handle_pet_action(state, pid, &msg.payload);
            }
        }
        MSG_AUCTION_ACTION => {
            if let Some(pid) = player_id {
                handle_auction_action(state, pid, &msg.payload);
            }
        }
        MSG_MOUNT_ACTION => {
            if let Some(pid) = player_id {
                handle_mount_action(state, pid, &msg.payload);
            }
        }
        MSG_MAIL_ACTION => {
            if let Some(pid) = player_id {
                handle_mail_action(state, pid, &msg.payload);
            }
        }
        MSG_ARENA_ACTION => {
            if let Some(pid) = player_id {
                handle_arena_action(state, pid, &msg.payload);
            }
        }
        MSG_DAILY_QUEST_CLAIM => {
            if let Some(pid) = player_id {
                handle_daily_quest_claim(state, pid, &msg.payload);
            }
        }
        MSG_BOUNTY_ACTION => {
            if let Some(pid) = player_id {
                handle_bounty_action(state, pid, &msg.payload);
            }
        }
        MSG_RUNE_CRAFT => {
            if let Some(pid) = player_id {
                handle_rune_craft(state, pid, &msg.payload);
            }
        }
        MSG_BUY_BLESSING => {
            if let Some(pid) = player_id {
                handle_buy_blessing(state, pid, &msg.payload);
            }
        }
        MSG_BESTIARY_REQUEST => {
            if let Some(pid) = player_id {
                handle_bestiary_request(state, pid, &msg.payload);
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

    let existing_password = match sqlx::query_scalar::<_, String>(
        "SELECT password FROM accounts WHERE username = $1"
    ).bind(&auth.username).fetch_optional(&state.db).await {
        Ok(value) => value,
        Err(err) => {
            warn!("PostgreSQL account lookup failed: {}", err);
            let result = AuthResult { success: false, player_id: None, error: Some("Database unavailable. Please try again.".into()) };
            let _ = sender.send(json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string());
            return;
        }
    };

    if auth.is_register {
        if existing_password.is_some() {
            let result = AuthResult { success: false, player_id: None, error: Some("Username already exists".into()) };
            let _ = sender.send(json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string());
            return;
        }
        if let Err(err) = sqlx::query("INSERT INTO accounts (username, password) VALUES ($1, $2)")
            .bind(&auth.username).bind(&auth.password).execute(&state.db).await {
            warn!("PostgreSQL account registration failed: {}", err);
            let result = AuthResult { success: false, player_id: None, error: Some("Could not create account. Please try again.".into()) };
            let _ = sender.send(json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string());
            return;
        }
        state.accounts.insert(auth.username.clone(), auth.password.clone());
        info!("New PostgreSQL account registered: {}", auth.username);
    } else {
        match existing_password {
            Some(pass) if pass == auth.password => {}
            Some(_) => {
                let result = AuthResult { success: false, player_id: None, error: Some("Invalid password".into()) };
                let _ = sender.send(json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string());
                return;
            }
            None => {
                // Keep the game's existing first-login auto-registration behavior, but persist it.
                if let Err(err) = sqlx::query("INSERT INTO accounts (username, password) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING")
                    .bind(&auth.username).bind(&auth.password).execute(&state.db).await {
                    warn!("PostgreSQL auto-registration failed: {}", err);
                    let result = AuthResult { success: false, player_id: None, error: Some("Database unavailable. Please try again.".into()) };
                    let _ = sender.send(json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string());
                    return;
                }
                let password_now = sqlx::query_scalar::<_, String>("SELECT password FROM accounts WHERE username = $1")
                    .bind(&auth.username).fetch_optional(&state.db).await.ok().flatten();
                if password_now.as_deref() != Some(auth.password.as_str()) {
                    let result = AuthResult { success: false, player_id: None, error: Some("Invalid password".into()) };
                    let _ = sender.send(json!({ "type": MSG_AUTH_RESULT, "payload": result }).to_string());
                    return;
                }
                state.accounts.insert(auth.username.clone(), auth.password.clone());
                info!("Auto-registered PostgreSQL account: {}", auth.username);
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
        let class = auth.class.clone().unwrap_or_else(|| "warrior".to_string());
        PlayerData::new_with_class(auth.username.clone(), class)
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
    send_quest_update(state, pid);

    // Run initial title check and send title data
    if let Some(mut p) = state.players.get_mut(&pid) {
        check_title_unlocks(&mut p);
    }
    send_title_update(state, &pid);

    // Send guild data if player is in a guild
    {
        let guild_id = state.players.get(&pid).and_then(|p| p.guild_id);
        if let Some(gid) = guild_id {
            send_guild_data_to_members(state, &gid);
        }
    }

    // Daily login rewards
    {
        let today = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() / 86400; // day number since epoch
        let today_u32 = today as u32;

        let mut reward_msg = None;
        if let Some(mut p) = state.players.get_mut(&pid) {
            if p.last_login_day != today_u32 {
                // Update streak
                if p.last_login_day == today_u32 - 1 {
                    p.login_streak += 1;
                } else {
                    p.login_streak = 1;
                }
                p.last_login_day = today_u32;
                if p.login_streak > p.max_login_streak {
                    p.max_login_streak = p.login_streak;
                }

                // Find reward for this streak day
                let streak = p.login_streak;
                let day_reward = protocol::DAILY_REWARDS
                    .iter()
                    .rev()
                    .find(|(day, _, _, _)| streak >= *day);

                if let Some((_, item_name, qty, gold)) = day_reward {
                    p.gold += gold;
                    // Add item reward
                    if !item_name.is_empty() {
                        let reward_item = protocol::Item {
                            id: Uuid::new_v4().to_string(),
                            template_id: item_name.to_string(),
                            name: item_name.to_string(),
                            rarity: 1,
                            item_type: protocol::ItemType::Consumable,
                            slot: None,
                            stackable: true,
                            quantity: *qty,
                            level: 1,
                            stats: std::collections::HashMap::new(),
                            description: format!("Daily login reward item."),
                            affixes: vec![],
                            enchant_level: 0,
                        };
                        p.inventory.push(Some(reward_item));
                    }
                    reward_msg = Some(format!(
                        "🎁 Daily Login Reward (Day {})! +{}g{}",
                        streak, gold,
                        if !item_name.is_empty() { format!(" + {}x {}", qty, item_name) } else { String::new() },
                    ));
                }
            }
        }
        if let Some(msg_text) = reward_msg {
            let chat_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": {
                    "sender": "System",
                    "text": msg_text,
                    "channel": "system"
                }
            }).to_string();
            state.send_to(&pid, &chat_msg);
            send_inventory_update(state, &pid);
            send_stats_update_by_id(state, &pid);
        }
    }

    // Send nearby ground items
    let items: Vec<serde_json::Value> = state.ground_items.iter()
        .filter(|gi| {
            let dist_sq = (gi.x - px).powi(2) + (gi.y - py).powi(2);
            dist_sq < 900.0
        })
        .map(|gi| ground_item_payload(gi.value()))
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
        let text = payload.text.trim();

        // Slash command handling
        if text.starts_with('/') {
            let parts: Vec<&str> = text.splitn(3, ' ').collect();
            let cmd = parts[0].to_lowercase();
            drop(player);

            match cmd.as_str() {
                "/whisper" | "/w" | "/tell" => {
                    if parts.len() < 3 {
                        let err = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": "Usage: /whisper <player> <message>", "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &err);
                        return;
                    }
                    let target_name = parts[1];
                    let msg_text = parts[2];
                    let sender_name = state.players.get(&player_id)
                        .map(|p| p.username.clone()).unwrap_or_default();
                    // Find target
                    let target = state.players.iter().find(|e| {
                        e.value().username.eq_ignore_ascii_case(target_name)
                    });
                    if let Some(entry) = target {
                        let tid = entry.value().id;
                        drop(entry);
                        let whisper_to = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": format!("[To {}]", target_name), "text": msg_text, "channel": "whisper" }
                        }).to_string();
                        state.send_to(&player_id, &whisper_to);
                        let whisper_from = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": format!("[From {}]", sender_name), "text": msg_text, "channel": "whisper" }
                        }).to_string();
                        state.send_to(&tid, &whisper_from);
                    } else {
                        let err = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": format!("Player '{}' not found.", target_name), "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &err);
                    }
                }
                "/party" | "/p" => {
                    if parts.len() < 2 {
                        let err = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": "Usage: /party <invite|accept|leave|kick> [player]", "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &err);
                        return;
                    }
                    let sub = parts[1].to_lowercase();
                    let target = if parts.len() > 2 { Some(parts[2]) } else { None };
                    let action_payload = match sub.as_str() {
                        "invite" => json!({ "action": "invite", "target": target.unwrap_or("") }),
                        "accept" => json!({ "action": "accept" }),
                        "leave" => json!({ "action": "leave" }),
                        "kick" => json!({ "action": "kick", "target": target.unwrap_or("") }),
                        _ => {
                            let err = json!({
                                "type": MSG_CHAT_MESSAGE,
                                "payload": { "sender": "System", "text": "Unknown party command. Use: invite, accept, leave, kick", "channel": "system" }
                            }).to_string();
                            state.send_to(&player_id, &err);
                            return;
                        }
                    };
                    handle_party_action(state, player_id, &action_payload);
                }
                "/emote" | "/e" | "/me" => {
                    let emote_text = if parts.len() > 1 { parts[1..].join(" ") } else { "waves".to_string() };
                    let name = state.players.get(&player_id)
                        .map(|p| p.username.clone()).unwrap_or_default();
                    let (px, py) = state.players.get(&player_id)
                        .map(|p| (p.x, p.y)).unwrap_or((0.0, 0.0));
                    let emote_msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "", "text": format!("* {} {}", name, emote_text), "channel": "emote" }
                    }).to_string();
                    state.send_to_all_near(px, py, 30.0, &emote_msg);
                }
                "/help" | "/?" => {
                    let help_text = "Commands: /whisper <player> <msg>, /party <invite|accept|leave|kick> [player], /emote <text>, /trade <player>, /who, /help";
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "System", "text": help_text, "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                }
                "/who" => {
                    let count = state.players.len();
                    let names: Vec<String> = state.players.iter()
                        .take(20)
                        .map(|e| format!("{} (Lv{})", e.value().username, e.value().level))
                        .collect();
                    let text = format!("{} players online: {}", count, names.join(", "));
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "System", "text": text, "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                }
                "/trade" => {
                    // /trade <message> sends to trade channel
                    if parts.len() < 2 {
                        let msg = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": "Usage: /trade <message>", "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &msg);
                        return;
                    }
                    let sender_name = state.players.get(&player_id)
                        .map(|p| p.username.clone()).unwrap_or_default();
                    let trade_text = parts[1..].join(" ");
                    let trade_msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": format!("[Trade] {}", sender_name), "text": trade_text, "channel": "trade" }
                    }).to_string();
                    state.broadcast(&trade_msg);
                }
                _ => {
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "System", "text": format!("Unknown command: {}. Type /help for a list.", cmd), "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                }
            }
            return;
        }

        // Normal chat message
        let chat_msg = ChatMessageOut {
            sender: player.username.clone(),
            text: payload.text.clone(),
            channel: payload.channel.clone(),
        };
        let msg = json!({ "type": MSG_CHAT_MESSAGE, "payload": chat_msg }).to_string();
        let px = player.x;
        let py = player.y;
        let guild_id = player.guild_id.clone();
        let sender_name = player.username.clone();
        drop(player);

        match payload.channel.as_str() {
            "global" => state.broadcast(&msg),
            "local" => state.send_to_all_near(px, py, 30.0, &msg),
            "trade" => {
                // Trade channel: broadcast globally with [Trade] prefix
                let trade_msg = json!({ "type": MSG_CHAT_MESSAGE, "payload": {
                    "sender": format!("[Trade] {}", sender_name),
                    "text": payload.text.clone(),
                    "channel": "trade"
                }}).to_string();
                state.broadcast(&trade_msg);
            }
            "guild" => {
                // Guild chat: send to guild members only
                if let Some(gid) = guild_id {
                    if let Some(guild) = state.guilds.get(&gid) {
                        let guild_msg = json!({ "type": MSG_CHAT_MESSAGE, "payload": {
                            "sender": format!("[Guild] {}", sender_name),
                            "text": payload.text.clone(),
                            "channel": "guild"
                        }}).to_string();
                        for member_id in &guild.members {
                            state.send_to(member_id, &guild_msg);
                        }
                    }
                }
            }
            _ => state.broadcast(&msg),
        }
        update_daily_quest_progress(state, &player_id, "send_chat", 1);
    }
}

// ─── Attack Handler (PvE) ────────────────────────────────────

fn handle_attack(state: &Arc<AppState>, attacker_id: Uuid, target_id: Uuid) {
    // Auto-dismount when attacking
    auto_dismount_on_combat(state, &attacker_id);

    let attacker_stats = {
        let mut player = match state.players.get_mut(&attacker_id) {
            Some(p) => p,
            None => return,
        };
        if player.dead { return; }
        // Combo system: increment combo, reset timer
        if player.combo_timer > 0.0 {
            player.combo_count += 1;
        } else {
            player.combo_count = 1;
        }
        player.combo_timer = 60.0; // 3 seconds at 20 tps
        let combo = player.combo_count;
        (player.total_atk(), player.level, player.x, player.y, player.total_lck(), combo)
    };

    let (atk, level, ax, ay, lck, combo) = attacker_stats;
    // Combo bonus: +2% damage per combo hit (caps at 25 combo = +50%)
    let combo_mult = 1.0 + (combo.min(25) as f64 * 0.02);

    // Daily quest: combo hits
    if combo == 15 {
        update_daily_quest_progress(state, &attacker_id, "combo_hits", 15);
    }

    if let Some(mut enemy) = state.enemies.get_mut(&target_id) {
        // Guard: if enemy is already dead, skip (prevents double-kill race condition)
        if enemy.hp <= 0 || matches!(enemy.state, EnemyState::Dead) { return; }

        let dist = ((enemy.x - ax).powi(2) + (enemy.y - ay).powi(2)).sqrt();
        if dist > 3.0 { return; }

        // Damage formula with crit + combo
        let mut rng = rand::thread_rng();
        let raw_damage = atk as f64 * (0.9 + rng.r#gen::<f64>() * 0.2);
        let def_reduction = enemy.def as f64 / (enemy.def as f64 + 100.0 + level as f64 * 2.0);

        let crit_chance = 0.05 + lck as f64 * 0.001;
        let is_crit = rng.r#gen::<f64>() < crit_chance;
        let crit_mult = if is_crit { 1.5 + lck as f64 * 0.005 } else { 1.0 };

        let final_damage = (raw_damage * (1.0 - def_reduction) * crit_mult * combo_mult).max(1.0) as i32;
        enemy.hp -= final_damage;

        let combat_msg = json!({
            "type": MSG_COMBAT_EVENT,
            "payload": {
                "attackerId": attacker_id.to_string(),
                "targetId": target_id.to_string(),
                "damage": final_damage,
                "isCrit": is_crit,
                "targetHp": enemy.hp.max(0),
                "combo": combo,
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
            
            // Boss legendary drop chance
            let mut boss_loot: Vec<protocol::Item> = Vec::new();
            if matches!(enemy_rank, protocol::EnemyRank::Boss) {
                let mut brng = rand::thread_rng();
                if brng.gen_bool(0.25) {
                    let eligible: Vec<_> = protocol::LEGENDARY_UNIQUES.iter()
                        .filter(|(_, _, _, _, _, lvl, _)| *lvl <= enemy_level + 5)
                        .collect();
                    if !eligible.is_empty() {
                        let pick = eligible[brng.gen_range(0..eligible.len())];
                        let (name, slot, stat_key, stat_val, rarity, level, desc) = *pick;
                        let mut stats = std::collections::HashMap::new();
                        stats.insert(stat_key.to_string(), stat_val);
                        boss_loot.push(protocol::Item {
                            id: Uuid::new_v4().to_string(),
                            template_id: name.to_lowercase().replace(' ', "_"),
                            name: name.to_string(),
                            rarity,
                            item_type: if slot == "weapon" { protocol::ItemType::Weapon } else { protocol::ItemType::Armor },
                            slot: Some(slot.to_string()),
                            stackable: false,
                            quantity: 1,
                            level,
                            stats,
                            description: desc.to_string(),
                            affixes: vec!["Legendary".to_string()],
                            enchant_level: 0,
                        });
                    }
                }
                if brng.gen_bool(0.15) {
                    let mounts = ["Riding Horse Whistle", "War Horse Whistle", "Griffin Feather"];
                    let mount_name = mounts[brng.gen_range(0..mounts.len())];
                    boss_loot.push(protocol::Item {
                        id: Uuid::new_v4().to_string(),
                        template_id: mount_name.to_lowercase().replace(' ', "_"),
                        name: mount_name.to_string(),
                        rarity: 3,
                        item_type: protocol::ItemType::Consumable,
                        slot: None,
                        stackable: true,
                        quantity: 1,
                        level: 1,
                        stats: std::collections::HashMap::new(),
                        description: "A rare mount whistle. Use to gain speed!".to_string(),
                        affixes: vec![],
                        enchant_level: 0,
                    });
                }
            }

            // Dungeon-specific rare drops
            let mut dungeon_loot: Vec<protocol::Item> = Vec::new();
            if let Some((dung_name, _)) = state.world.get_dungeon_info(ex, ey) {
                let mut drng = rand::thread_rng();
                for &(dname, item_name, slot, stat_key, stat_val, rarity, req_level, desc, chance) in protocol::DUNGEON_LOOT {
                    if dname != dung_name { continue; }
                    // Higher rank enemies have better drop chances
                    let rank_mult = match &enemy_rank {
                        protocol::EnemyRank::Champion => 1.5,
                        protocol::EnemyRank::Elite => 2.5,
                        protocol::EnemyRank::Boss => 5.0,
                        _ => 1.0,
                    };
                    if drng.gen_bool((chance * rank_mult).min(1.0)) {
                        let mut stats = std::collections::HashMap::new();
                        stats.insert(stat_key.to_string(), stat_val);
                        dungeon_loot.push(protocol::Item {
                            id: Uuid::new_v4().to_string(),
                            template_id: item_name.to_lowercase().replace(' ', "_"),
                            name: item_name.to_string(),
                            rarity,
                            item_type: if slot == "weapon" { protocol::ItemType::Weapon } else { protocol::ItemType::Armor },
                            slot: Some(slot.to_string()),
                            stackable: false,
                            quantity: 1,
                            level: req_level,
                            stats,
                            description: desc.to_string(),
                            affixes: vec![format!("{} Drop", dung_name)],
                            enchant_level: 0,
                        });
                    }
                }
            }

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
            // Drop boss legendary loot
            for item in &boss_loot {
                let ground_item = GroundItem {
                    id: Uuid::new_v4(),
                    item: item.clone(),
                    x: ex + rng.gen_range(-0.5..0.5),
                    y: ey + rng.gen_range(-0.5..0.5),
                    owner_id: Some(attacker_id),
                    drop_time: tick,
                    protection_duration: 1200.0, // 60 seconds protection for legendaries
                };
                state.ground_items.insert(ground_item.id, ground_item);
            }
            // Drop dungeon-specific loot
            for item in &dungeon_loot {
                let ground_item = GroundItem {
                    id: Uuid::new_v4(),
                    item: item.clone(),
                    x: ex + rng.gen_range(-0.5..0.5),
                    y: ey + rng.gen_range(-0.5..0.5),
                    owner_id: Some(attacker_id),
                    drop_time: tick,
                    protection_duration: 900.0, // 45 seconds protection
                };
                state.ground_items.insert(ground_item.id, ground_item);
            }

            // Award XP and gold — shared with nearby party members
            let party_share_range = 20.0_f64;
            let mut xp_recipients: Vec<(Uuid, u64, u64)> = Vec::new(); // (id, xp, gold)
            
            // Check if attacker is in a party
            let party_members_nearby: Vec<Uuid> = if let Some(party_id) = state.player_party.get(&attacker_id) {
                let pid = *party_id.value();
                drop(party_id);
                if let Some(members) = state.parties.get(&pid) {
                    members.iter().filter(|mid| {
                        if **mid == attacker_id { return true; }
                        // Check if member is nearby
                        if let Some(p) = state.players.get(mid) {
                            let dx = p.x - ex;
                            let dy = p.y - ey;
                            (dx * dx + dy * dy).sqrt() < party_share_range && !p.dead
                        } else { false }
                    }).copied().collect()
                } else { vec![attacker_id] }
            } else { vec![attacker_id] };

            let share_count = party_members_nearby.len().max(1) as u64;
            // Bonus XP for party play: 10% per extra member
            let party_xp_bonus = 1.0 + (share_count - 1) as f64 * 0.10;
            
            // World event multipliers
            let (xp_mult, gold_mult_event) = {
                let we = state.active_world_event.read().unwrap_or_else(|e| e.into_inner());
                let current_tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed);
                match *we {
                    Some((evt, expire)) if current_tick < expire => match evt {
                        "double_xp" => (2.0, 1.0),
                        "gold_rush" => (1.0, 2.0),
                        "lucky_hour" => (1.2, 1.2),
                        "elemental_surge" => (1.0, 1.5),
                        "star_blessing" => (1.5, 1.5),
                        "blood_moon" => (3.0, 1.0),
                        "treasure_rain" => (1.0, 2.5),
                        _ => (1.0, 1.0),
                    },
                    _ => (1.0, 1.0),
                }
            };
            
            let total_xp = (xp_reward as f64 * party_xp_bonus * xp_mult) as u64;
            let total_gold = (gold as f64 * gold_mult_event) as u64;
            let xp_per_member = total_xp / share_count;
            let gold_per_member = total_gold / share_count;

            for mid in &party_members_nearby {
                xp_recipients.push((*mid, xp_per_member, gold_per_member));
            }

            for (pid, xp_share, gold_share) in &xp_recipients {
                if let Some(mut player) = state.players.get_mut(pid) {
                    // Stamina XP multiplier (per-recipient)
                    let stamina_mult = if player.stamina_minutes > 2400 {
                        1.5
                    } else if player.stamina_minutes >= 840 {
                        1.0
                    } else {
                        0.5
                    };
                    let stamina_xp = (*xp_share as f64 * stamina_mult) as u64;
                    player.xp += stamina_xp;
                    player.gold += gold_share;

                    // Bestiary tracking for killer
                    if *pid == attacker_id {
                        *player.bestiary.entry(enemy_name.clone()).or_insert(0) += 1;
                        // Stats tracking only for killer
                        player.stats_tracker.enemies_killed += 1;
                        player.stats_tracker.gold_earned += gold;
                        let name_lower = enemy_name.to_lowercase();
                        *player.stats_tracker.enemies_killed_by_type.entry(name_lower).or_insert(0) += 1;
                        match &enemy_rank {
                            protocol::EnemyRank::Boss => {
                                player.stats_tracker.boss_kills += 1;
                                player.bosses_killed += 1;
                            }
                            protocol::EnemyRank::Elite => player.stats_tracker.elite_kills += 1,
                            protocol::EnemyRank::Champion => player.stats_tracker.champion_kills += 1,
                            _ => {}
                        }
                        if final_damage > player.stats_tracker.highest_hit {
                            player.stats_tracker.highest_hit = final_damage;
                        }
                    }

                    check_and_apply_level_up(&mut player, state);
                    let new_titles = check_title_unlocks(&mut player);
                    send_stats_update(state, &player);
                    let member_id = player.id;
                    drop(player);

                    if !new_titles.is_empty() {
                        send_title_update(state, &member_id);
                        for t in &new_titles {
                            if let Some((_, display, _)) = protocol::TITLES.iter().find(|(id, _, _)| id == t) {
                                let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text": format!("🏆 Title unlocked: {}!", display),"channel":"system"}}).to_string();
                                state.send_to(&member_id, &msg);
                            }
                        }
                    }

                    // Notify party members about shared XP
                    if *pid != attacker_id {
                        let share_msg = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": {
                                "sender": "System",
                                "text": format!("Party member killed {}! (+{} XP, +{}g shared)", enemy_name, xp_share, gold_share),
                                "channel": "system"
                            }
                        }).to_string();
                        state.send_to(pid, &share_msg);
                    }
                }
            }

            // Notify about kill and loot
            let loot_names: Vec<String> = loot.iter().map(|i| i.name.clone()).collect();
            let shared_text = if share_count > 1 { format!(" (shared with {} members)", share_count) } else { String::new() };
            let kill_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": {
                    "sender": "System",
                    "text": format!("You defeated {}! (+{} XP, +{}g){} Loot: {}", enemy_name, xp_per_member, gold_per_member, shared_text, loot_names.join(", ")),
                    "channel": "combat"
                }
            }).to_string();
            state.send_to(&attacker_id, &kill_msg);

            // Daily quest progress: kill enemies
            update_daily_quest_progress(state, &attacker_id, "kill_enemies", 1);
            if matches!(enemy_rank, protocol::EnemyRank::Boss) {
                update_daily_quest_progress(state, &attacker_id, "kill_boss", 1);
            }
            update_daily_quest_progress(state, &attacker_id, "earn_gold", gold_per_member as u32);

            // Notify nearby about ground items
            broadcast_ground_items(state, ex, ey);

            state.enemies.remove(&target_id);

            // World boss death broadcast
            if matches!(enemy_rank, protocol::EnemyRank::Boss) {
                let death_msg = json!({
                    "type": MSG_WORLD_BOSS_DEATH,
                    "payload": {
                        "name": enemy_name,
                        "killerName": "a brave hero",
                    }
                }).to_string();
                state.broadcast(&death_msg);
            }

            // Quest & Achievement hooks (no DashMap guards held)
            let rank_str = match &enemy_rank {
                protocol::EnemyRank::Boss => "boss",
                protocol::EnemyRank::Elite => "elite",
                protocol::EnemyRank::Champion => "champion",
                protocol::EnemyRank::Normal => "normal",
            };
            check_quest_progress(state, attacker_id, "kill", &enemy_name, 1);
            check_quest_progress(state, attacker_id, "kill_type", &enemy_name, 1);
            check_quest_progress(state, attacker_id, "kill_rank", rank_str, 1);
            check_quest_progress(state, attacker_id, "gold", "", 0);
            check_quest_progress(state, attacker_id, "level", "", 0);
            check_achievements(state, attacker_id);

            // Faction reputation for kills
            {
                let rep_gain = match &enemy_rank {
                    protocol::EnemyRank::Boss => 50,
                    protocol::EnemyRank::Elite => 20,
                    protocol::EnemyRank::Champion => 10,
                    protocol::EnemyRank::Normal => 2,
                };
                // Wild Hunters gain rep on any kill, Starfall Guard on boss kills
                if let Some(mut p) = state.players.get_mut(&attacker_id) {
                    *p.faction_rep.entry("wild_hunters".to_string()).or_insert(0) += rep_gain;
                    if matches!(enemy_rank, protocol::EnemyRank::Boss | protocol::EnemyRank::Elite) {
                        *p.faction_rep.entry("starfall_guard".to_string()).or_insert(0) += rep_gain * 2;
                    }
                }
            }
        }
    }
}

// ─── Skill System ───────────────────────────────────────────

struct SkillDef {
    id: &'static str,
    name: &'static str,
    mana_cost: i32,
    cooldown_ticks: u64,  // at 20 TPS
    damage_mult: f64,
    range: f64,
    is_aoe: bool,
    aoe_radius: f64,
    class: &'static str,
    heal_amount: f64,  // 0 = no heal, fraction of max_hp for heals
    // CC / status effect on hit
    effect: Option<(&'static str, i32, u32)>, // (effect_type, value, duration_ticks)
}

const SKILLS: &[SkillDef] = &[
    // Warrior skills
    SkillDef { id: "slash",        name: "Slash",         mana_cost: 5,  cooldown_ticks: 20,  damage_mult: 1.5,  range: 3.0, is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.0, effect: None },
    SkillDef { id: "shield_bash",  name: "Shield Bash",   mana_cost: 12, cooldown_ticks: 60,  damage_mult: 1.2,  range: 2.5, is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.0, effect: Some(("stun", 0, 40)) },
    SkillDef { id: "whirlwind",    name: "Whirlwind",     mana_cost: 20, cooldown_ticks: 100, damage_mult: 1.0,  range: 3.5, is_aoe: true,  aoe_radius: 4.0, class: "warrior", heal_amount: 0.0, effect: None },
    SkillDef { id: "battle_cry",   name: "Battle Cry",    mana_cost: 15, cooldown_ticks: 200, damage_mult: 0.0,  range: 0.0, is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.15, effect: None },
    SkillDef { id: "execute",      name: "Execute",       mana_cost: 25, cooldown_ticks: 120, damage_mult: 3.0,  range: 2.5, is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.0, effect: Some(("bleed", 5, 100)) },
    SkillDef { id: "taunt",        name: "Taunt",         mana_cost: 8,  cooldown_ticks: 80,  damage_mult: 0.2,  range: 5.0, is_aoe: true,  aoe_radius: 5.0, class: "warrior", heal_amount: 0.0, effect: Some(("weakness", 5, 80)) },
    // Mage skills
    SkillDef { id: "fireball",     name: "Fireball",      mana_cost: 15, cooldown_ticks: 30,  damage_mult: 2.0,  range: 8.0, is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.0, effect: Some(("burn", 8, 80)) },
    SkillDef { id: "ice_shard",    name: "Ice Shard",     mana_cost: 10, cooldown_ticks: 20,  damage_mult: 1.3,  range: 7.0, is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.0, effect: Some(("freeze", 0, 40)) },
    SkillDef { id: "lightning",    name: "Lightning Bolt", mana_cost: 25, cooldown_ticks: 60,  damage_mult: 2.5,  range: 9.0, is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.0, effect: Some(("stun", 0, 20)) },
    SkillDef { id: "blizzard",     name: "Blizzard",      mana_cost: 35, cooldown_ticks: 120, damage_mult: 1.5,  range: 7.0, is_aoe: true,  aoe_radius: 5.0, class: "mage", heal_amount: 0.0, effect: Some(("freeze", 0, 60)) },
    SkillDef { id: "arcane_shield",name: "Arcane Shield",  mana_cost: 20, cooldown_ticks: 200, damage_mult: 0.0,  range: 0.0, is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.2, effect: None },
    SkillDef { id: "meteor",       name: "Meteor",        mana_cost: 50, cooldown_ticks: 200, damage_mult: 4.0,  range: 8.0, is_aoe: true,  aoe_radius: 6.0, class: "mage", heal_amount: 0.0, effect: Some(("burn", 12, 100)) },
    // Rogue skills
    SkillDef { id: "backstab",     name: "Backstab",      mana_cost: 10, cooldown_ticks: 25,  damage_mult: 2.2,  range: 2.5, is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0, effect: Some(("bleed", 6, 80)) },
    SkillDef { id: "poison_strike",name: "Poison Strike",  mana_cost: 12, cooldown_ticks: 40,  damage_mult: 1.3,  range: 2.5, is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0, effect: Some(("poison", 4, 100)) },
    SkillDef { id: "fan_of_knives",name: "Fan of Knives",  mana_cost: 20, cooldown_ticks: 80,  damage_mult: 1.0,  range: 4.0, is_aoe: true,  aoe_radius: 4.0, class: "rogue", heal_amount: 0.0, effect: Some(("bleed", 3, 60)) },
    SkillDef { id: "shadow_step",  name: "Shadow Step",   mana_cost: 15, cooldown_ticks: 100, damage_mult: 0.0,  range: 0.0, is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.1, effect: None },
    SkillDef { id: "eviscerate",   name: "Eviscerate",    mana_cost: 30, cooldown_ticks: 120, damage_mult: 3.5,  range: 2.5, is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0, effect: Some(("armor_break", 10, 100)) },
    SkillDef { id: "smoke_bomb",   name: "Smoke Bomb",    mana_cost: 18, cooldown_ticks: 160, damage_mult: 0.3,  range: 3.0, is_aoe: true,  aoe_radius: 4.0, class: "rogue", heal_amount: 0.0, effect: Some(("weakness", 8, 80)) },
    // Ranger skills
    SkillDef { id: "power_shot",   name: "Power Shot",    mana_cost: 10, cooldown_ticks: 25,  damage_mult: 1.8,  range: 10.0, is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.0, effect: None },
    SkillDef { id: "multi_shot",   name: "Multi Shot",    mana_cost: 18, cooldown_ticks: 60,  damage_mult: 1.0,  range: 8.0,  is_aoe: true,  aoe_radius: 5.0, class: "ranger", heal_amount: 0.0, effect: None },
    SkillDef { id: "trap",         name: "Bear Trap",     mana_cost: 15, cooldown_ticks: 100, damage_mult: 1.5,  range: 6.0,  is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.0, effect: Some(("stun", 0, 60)) },
    SkillDef { id: "heal_arrow",   name: "Heal Arrow",    mana_cost: 20, cooldown_ticks: 120, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.2, effect: None },
    SkillDef { id: "rain_arrows",  name: "Rain of Arrows", mana_cost: 35, cooldown_ticks: 160, damage_mult: 1.2,  range: 9.0, is_aoe: true,  aoe_radius: 6.0, class: "ranger", heal_amount: 0.0, effect: Some(("bleed", 4, 60)) },
    SkillDef { id: "eagle_eye",    name: "Eagle Eye",     mana_cost: 12, cooldown_ticks: 200, damage_mult: 4.0,  range: 12.0, is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.0, effect: None },
    // Warrior advanced
    SkillDef { id: "berserk",       name: "Berserk",        mana_cost: 30, cooldown_ticks: 200, damage_mult: 2.5,  range: 2.5,  is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.0, effect: None },
    SkillDef { id: "ground_slam",   name: "Ground Slam",    mana_cost: 25, cooldown_ticks: 100, damage_mult: 1.8,  range: 4.0,  is_aoe: true,  aoe_radius: 4.0, class: "warrior", heal_amount: 0.0, effect: Some(("stun", 0, 30)) },
    SkillDef { id: "fortify",       name: "Fortify",        mana_cost: 15, cooldown_ticks: 160, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.15, effect: None },
    // Mage advanced
    SkillDef { id: "chain_lightning", name: "Chain Lightning", mana_cost: 30, cooldown_ticks: 80, damage_mult: 1.6, range: 8.0, is_aoe: true,  aoe_radius: 5.0, class: "mage", heal_amount: 0.0, effect: Some(("stun", 0, 15)) },
    SkillDef { id: "mana_shield",    name: "Mana Shield",     mana_cost: 40, cooldown_ticks: 200, damage_mult: 0.0, range: 0.0, is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.25, effect: None },
    SkillDef { id: "fire_wall",      name: "Fire Wall",       mana_cost: 35, cooldown_ticks: 120, damage_mult: 2.0, range: 7.0, is_aoe: true,  aoe_radius: 5.0, class: "mage", heal_amount: 0.0, effect: Some(("burn", 10, 120)) },
    // Rogue advanced
    SkillDef { id: "assassinate",    name: "Assassinate",     mana_cost: 40, cooldown_ticks: 160, damage_mult: 4.0, range: 2.5, is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0, effect: Some(("bleed", 10, 100)) },
    SkillDef { id: "blade_dance",    name: "Blade Dance",     mana_cost: 25, cooldown_ticks: 80,  damage_mult: 1.5, range: 3.0, is_aoe: true,  aoe_radius: 3.5, class: "rogue", heal_amount: 0.0, effect: Some(("bleed", 5, 60)) },
    SkillDef { id: "vanish",         name: "Vanish",          mana_cost: 30, cooldown_ticks: 200, damage_mult: 0.0, range: 0.0, is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.1, effect: None },
    // Ranger advanced
    SkillDef { id: "piercing_shot",  name: "Piercing Shot",   mana_cost: 20, cooldown_ticks: 60,  damage_mult: 2.5, range: 10.0, is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.0, effect: Some(("armor_break", 8, 80)) },
    SkillDef { id: "nature_call",    name: "Nature's Call",   mana_cost: 35, cooldown_ticks: 160, damage_mult: 0.0, range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.3, effect: None },
    SkillDef { id: "barrage",        name: "Barrage",         mana_cost: 45, cooldown_ticks: 140, damage_mult: 1.4, range: 8.0,  is_aoe: true,  aoe_radius: 5.0, class: "ranger", heal_amount: 0.0, effect: Some(("poison", 3, 80)) },
    // ─── Ultimate Abilities (high cost, high cooldown, devastating) ───
    SkillDef { id: "avatar_of_war",   name: "Avatar of War",     mana_cost: 80, cooldown_ticks: 600, damage_mult: 5.0,  range: 4.0,  is_aoe: true,  aoe_radius: 5.0, class: "warrior", heal_amount: 0.2, effect: Some(("stun", 0, 60)) },
    SkillDef { id: "apocalypse",      name: "Apocalypse",        mana_cost: 100, cooldown_ticks: 600, damage_mult: 6.0, range: 10.0, is_aoe: true,  aoe_radius: 8.0, class: "mage", heal_amount: 0.0, effect: Some(("burn", 15, 120)) },
    SkillDef { id: "death_sentence",  name: "Death Sentence",    mana_cost: 70, cooldown_ticks: 600, damage_mult: 8.0,  range: 2.5,  is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0, effect: Some(("poison", 20, 200)) },
    SkillDef { id: "arrow_storm",     name: "Arrow Storm",       mana_cost: 75, cooldown_ticks: 600, damage_mult: 3.0,  range: 12.0, is_aoe: true,  aoe_radius: 8.0, class: "ranger", heal_amount: 0.0, effect: Some(("bleed", 8, 100)) },
    // ─── Warrior Tier 3 ───
    SkillDef { id: "enrage",          name: "Enrage",            mana_cost: 20, cooldown_ticks: 240, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.0, effect: Some(("buff_atk", 20, 200)) },
    SkillDef { id: "charge",          name: "Charge",            mana_cost: 15, cooldown_ticks: 100, damage_mult: 2.0,  range: 8.0,  is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.0, effect: Some(("stun", 0, 30)) },
    SkillDef { id: "iron_will",       name: "Iron Will",         mana_cost: 25, cooldown_ticks: 300, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.3, effect: None },
    // ─── Mage Tier 3 ───
    SkillDef { id: "frost_nova",      name: "Frost Nova",        mana_cost: 30, cooldown_ticks: 80,  damage_mult: 1.5,  range: 4.0,  is_aoe: true,  aoe_radius: 5.0, class: "mage", heal_amount: 0.0, effect: Some(("freeze", 0, 50)) },
    SkillDef { id: "arcane_missiles", name: "Arcane Missiles",   mana_cost: 22, cooldown_ticks: 40,  damage_mult: 1.8,  range: 8.0,  is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.0, effect: None },
    SkillDef { id: "polymorph",       name: "Polymorph",         mana_cost: 40, cooldown_ticks: 200, damage_mult: 0.0,  range: 6.0,  is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.0, effect: Some(("stun", 0, 80)) },
    SkillDef { id: "time_warp",       name: "Time Warp",         mana_cost: 60, cooldown_ticks: 400, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.0, effect: Some(("buff_spd", 15, 200)) },
    // ─── Rogue Tier 3 ───
    SkillDef { id: "ambush",          name: "Ambush",            mana_cost: 20, cooldown_ticks: 60,  damage_mult: 3.0,  range: 3.0,  is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0, effect: Some(("stun", 0, 20)) },
    SkillDef { id: "crippling_strike",name: "Crippling Strike",  mana_cost: 15, cooldown_ticks: 50,  damage_mult: 1.6,  range: 2.5,  is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0, effect: Some(("slow", 10, 120)) },
    SkillDef { id: "shadow_cloak",    name: "Shadow Cloak",      mana_cost: 35, cooldown_ticks: 240, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.15, effect: Some(("buff_spd", 10, 160)) },
    SkillDef { id: "venom_splash",    name: "Venom Splash",      mana_cost: 25, cooldown_ticks: 80,  damage_mult: 1.2,  range: 4.0,  is_aoe: true,  aoe_radius: 4.0, class: "rogue", heal_amount: 0.0, effect: Some(("poison", 8, 120)) },
    // ─── Ranger Tier 3 ───
    SkillDef { id: "snipe",           name: "Snipe",             mana_cost: 30, cooldown_ticks: 100, damage_mult: 5.0,  range: 15.0, is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.0, effect: None },
    SkillDef { id: "explosive_arrow", name: "Explosive Arrow",   mana_cost: 25, cooldown_ticks: 80,  damage_mult: 2.0,  range: 9.0,  is_aoe: true,  aoe_radius: 4.0, class: "ranger", heal_amount: 0.0, effect: Some(("burn", 6, 60)) },
    SkillDef { id: "wind_walk",       name: "Wind Walk",         mana_cost: 20, cooldown_ticks: 180, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.0, effect: Some(("buff_spd", 12, 160)) },
    SkillDef { id: "entangle",        name: "Entangle",          mana_cost: 18, cooldown_ticks: 100, damage_mult: 0.5,  range: 7.0,  is_aoe: true,  aoe_radius: 3.5, class: "ranger", heal_amount: 0.0, effect: Some(("slow", 15, 100)) },
    // ─── Warrior Tier 4 (Ultimate & Utility) ───
    SkillDef { id: "shield_wall",     name: "Shield Wall",       mana_cost: 40, cooldown_ticks: 480, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.5,  effect: Some(("buff_atk", 10, 300)) },
    SkillDef { id: "warcry",          name: "War Cry",           mana_cost: 35, cooldown_ticks: 360, damage_mult: 0.0,  range: 0.0,  is_aoe: true,  aoe_radius: 6.0, class: "warrior", heal_amount: 0.0,  effect: Some(("weakness", 12, 120)) },
    SkillDef { id: "cleave",          name: "Cleave",            mana_cost: 18, cooldown_ticks: 45,  damage_mult: 1.8,  range: 3.0,  is_aoe: true,  aoe_radius: 3.5, class: "warrior", heal_amount: 0.0,  effect: Some(("armor_break", 8, 80)) },
    SkillDef { id: "titan_grip",      name: "Titan's Grip",      mana_cost: 50, cooldown_ticks: 600, damage_mult: 4.5,  range: 2.5,  is_aoe: false, aoe_radius: 0.0, class: "warrior", heal_amount: 0.0,  effect: Some(("stun", 0, 50)) },
    // ─── Mage Tier 4 (Ultimate & Utility) ───
    SkillDef { id: "arcane_barrier",  name: "Arcane Barrier",    mana_cost: 45, cooldown_ticks: 400, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "mage", heal_amount: 0.4,  effect: None },
    SkillDef { id: "gravity_well",    name: "Gravity Well",      mana_cost: 55, cooldown_ticks: 300, damage_mult: 2.5,  range: 8.0,  is_aoe: true,  aoe_radius: 6.0, class: "mage", heal_amount: 0.0,  effect: Some(("slow", 20, 140)) },
    SkillDef { id: "mana_burst",      name: "Mana Burst",        mana_cost: 80, cooldown_ticks: 500, damage_mult: 5.0,  range: 6.0,  is_aoe: true,  aoe_radius: 5.0, class: "mage", heal_amount: 0.0,  effect: Some(("freeze", 0, 60)) },
    SkillDef { id: "dimension_rift",  name: "Dimension Rift",    mana_cost: 90, cooldown_ticks: 700, damage_mult: 7.0,  range: 10.0, is_aoe: true,  aoe_radius: 7.0, class: "mage", heal_amount: 0.0,  effect: Some(("burn", 20, 160)) },
    // ─── Rogue Tier 4 (Ultimate & Utility) ───
    SkillDef { id: "shadow_dance",    name: "Shadow Dance",      mana_cost: 45, cooldown_ticks: 360, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.2,  effect: Some(("buff_spd", 20, 240)) },
    SkillDef { id: "throat_slash",    name: "Throat Slash",      mana_cost: 30, cooldown_ticks: 120, damage_mult: 3.5,  range: 2.0,  is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0,  effect: Some(("bleed", 15, 160)) },
    SkillDef { id: "shuriken_storm",  name: "Shuriken Storm",    mana_cost: 40, cooldown_ticks: 160, damage_mult: 2.0,  range: 6.0,  is_aoe: true,  aoe_radius: 5.0, class: "rogue", heal_amount: 0.0,  effect: Some(("slow", 10, 80)) },
    SkillDef { id: "phantom_strike",  name: "Phantom Strike",    mana_cost: 70, cooldown_ticks: 600, damage_mult: 10.0, range: 3.0,  is_aoe: false, aoe_radius: 0.0, class: "rogue", heal_amount: 0.0,  effect: Some(("poison", 25, 200)) },
    // ─── Ranger Tier 4 (Ultimate & Utility) ───
    SkillDef { id: "natures_blessing",name: "Nature's Blessing", mana_cost: 40, cooldown_ticks: 360, damage_mult: 0.0,  range: 0.0,  is_aoe: false, aoe_radius: 0.0, class: "ranger", heal_amount: 0.35, effect: Some(("buff_atk", 8, 200)) },
    SkillDef { id: "volley",          name: "Volley",            mana_cost: 35, cooldown_ticks: 140, damage_mult: 1.5,  range: 10.0, is_aoe: true,  aoe_radius: 6.0, class: "ranger", heal_amount: 0.0,  effect: Some(("bleed", 6, 80)) },
    SkillDef { id: "ice_trap",        name: "Ice Trap",          mana_cost: 22, cooldown_ticks: 120, damage_mult: 1.0,  range: 6.0,  is_aoe: true,  aoe_radius: 3.0, class: "ranger", heal_amount: 0.0,  effect: Some(("freeze", 0, 60)) },
    SkillDef { id: "hawk_fury",       name: "Hawk's Fury",       mana_cost: 80, cooldown_ticks: 600, damage_mult: 4.0,  range: 12.0, is_aoe: true,  aoe_radius: 8.0, class: "ranger", heal_amount: 0.0,  effect: Some(("bleed", 12, 120)) },
];

fn find_skill(skill_id: &str) -> Option<&'static SkillDef> {
    SKILLS.iter().find(|s| s.id == skill_id)
}

fn skill_effect_to_status(name: &str) -> Option<protocol::StatusEffectType> {
    match name {
        "stun" => Some(protocol::StatusEffectType::Stun),
        "freeze" => Some(protocol::StatusEffectType::Freeze),
        "burn" => Some(protocol::StatusEffectType::Burn),
        "poison" => Some(protocol::StatusEffectType::Poison),
        "bleed" => Some(protocol::StatusEffectType::Bleed),
        "weakness" => Some(protocol::StatusEffectType::Weakness),
        "armor_break" => Some(protocol::StatusEffectType::ArmorBreak),
        _ => None,
    }
}

fn handle_use_skill(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let skill_id = match payload.get("skillId").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return,
    };
    let target_id_str = payload.get("targetId").and_then(|v| v.as_str());

    let skill = match find_skill(skill_id) {
        Some(s) => s,
        None => {
            warn!("Unknown skill: {}", skill_id);
            return;
        }
    };

    // Get player data
    let (atk, lck, px, py, mp, max_hp, player_class) = {
        let player = match state.players.get(&player_id) {
            Some(p) => p,
            None => return,
        };
        if player.dead { return; }
        (player.total_atk(), player.total_lck(), player.x, player.y, player.mp, player.max_hp, player.class.clone())
    };

    // Mana check
    if mp < skill.mana_cost {
        let msg = json!({
            "type": MSG_CHAT_MESSAGE,
            "payload": { "sender": "System", "text": "Not enough mana!", "channel": "system" }
        }).to_string();
        state.send_to(&player_id, &msg);
        return;
    }

    // Deduct mana
    if let Some(mut player) = state.players.get_mut(&player_id) {
        player.mp -= skill.mana_cost;
    }

    // Self-heal skills (battle_cry, arcane_shield, shadow_step, heal_arrow)
    if skill.heal_amount > 0.0 {
        let heal = (max_hp as f64 * skill.heal_amount) as i32;
        if let Some(mut player) = state.players.get_mut(&player_id) {
            player.hp = (player.hp + heal).min(player.max_hp);
            send_stats_update(state, &player);
        }
        let heal_msg = json!({
            "type": MSG_COMBAT_EVENT,
            "payload": {
                "attackerId": player_id.to_string(),
                "targetId": player_id.to_string(),
                "damage": -heal,
                "isCrit": false,
                "targetHp": mp - skill.mana_cost,
                "skillId": skill_id,
                "skillName": skill.name,
            }
        }).to_string();
        state.send_to_all_near(px, py, 40.0, &heal_msg);
        return;
    }

    // Damage skills need a target or are AoE
    let mut rng = rand::thread_rng();

    if skill.is_aoe {
        // AoE: hit all enemies in radius around player (or around target)
        let (cx, cy) = if let Some(tid) = target_id_str {
            if let Ok(tid_uuid) = Uuid::parse_str(tid) {
                if let Some(enemy) = state.enemies.get(&tid_uuid) {
                    (enemy.x, enemy.y)
                } else { (px, py) }
            } else { (px, py) }
        } else { (px, py) };

        let cells = nearby_cells_range(cx, cy, skill.aoe_radius);
        let radius_sq = skill.aoe_radius * skill.aoe_radius;
        let mut hit_count = 0;
        let mut aoe_kills: Vec<(String, protocol::EnemyRank)> = Vec::new();

        for cell in cells {
            if let Some(eids) = state.enemy_grid.get(&cell) {
                for eid in eids.value().clone() {
                    if let Some(mut enemy) = state.enemies.get_mut(&eid) {
                        if enemy.hp <= 0 { continue; }
                        let dx = enemy.x - cx;
                        let dy = enemy.y - cy;
                        if dx * dx + dy * dy > radius_sq { continue; }

                        let raw = atk as f64 * skill.damage_mult * (0.9 + rng.r#gen::<f64>() * 0.2);
                        let def_red = enemy.def as f64 / (enemy.def as f64 + 100.0);
                        let crit_chance = 0.05 + lck as f64 * 0.001;
                        let is_crit = rng.r#gen::<f64>() < crit_chance;
                        let crit_mult = if is_crit { 1.5 } else { 1.0 };
                        let dmg = (raw * (1.0 - def_red) * crit_mult).max(1.0) as i32;
                        enemy.hp -= dmg;
                        hit_count += 1;

                        // Apply skill CC/DoT effects to enemy
                        if let Some((eff_name, eff_val, eff_dur)) = &skill.effect {
                            match *eff_name {
                                "stun" | "freeze" => { enemy.stun_ticks = enemy.stun_ticks.max(*eff_dur); }
                                "burn" | "poison" | "bleed" => {
                                    // DoT: apply total damage as bonus (simplified for enemies)
                                    let dot_total = *eff_val * (*eff_dur as i32 / 20).max(1);
                                    enemy.hp -= dot_total;
                                }
                                "armor_break" => { enemy.def = (enemy.def - *eff_val).max(0); }
                                "weakness" => { enemy.atk = (enemy.atk - *eff_val).max(1); }
                                _ => {}
                            }
                        }

                        let combat_msg = json!({
                            "type": MSG_COMBAT_EVENT,
                            "payload": {
                                "attackerId": player_id.to_string(),
                                "targetId": eid.to_string(),
                                "damage": dmg,
                                "isCrit": is_crit,
                                "targetHp": enemy.hp.max(0),
                                "skillId": skill_id,
                                "skillName": skill.name,
                            }
                        }).to_string();
                        state.send_to_all_near(enemy.x, enemy.y, 40.0, &combat_msg);

                        if enemy.hp <= 0 {
                            let ex = enemy.x;
                            let ey = enemy.y;
                            let xp_reward = enemy.xp_reward;
                            let enemy_name = enemy.name.clone();
                            let enemy_level = enemy.level;
                            let enemy_rank = enemy.rank.clone();
                            let zone_level = state.world.get_zone_level(ex, ey);
                            enemy.state = EnemyState::Dead;
                            drop(enemy);

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

                            for item in &loot {
                                let ground_item = GroundItem {
                                    id: Uuid::new_v4(),
                                    item: item.clone(),
                                    x: ex + rng.gen_range(-1.0..1.0),
                                    y: ey + rng.gen_range(-1.0..1.0),
                                    owner_id: Some(player_id),
                                    drop_time: tick,
                                    protection_duration: 600.0,
                                };
                                state.ground_items.insert(ground_item.id, ground_item);
                            }

                            if let Some(mut player) = state.players.get_mut(&player_id) {
                                // Stamina XP multiplier
                                let stamina_mult = if player.stamina_minutes > 2400 { 1.5 } else if player.stamina_minutes >= 840 { 1.0 } else { 0.5 };
                                let stamina_xp = (xp_reward as f64 * stamina_mult) as u64;
                                player.xp += stamina_xp;
                                player.gold += gold;
                                // Bestiary tracking
                                *player.bestiary.entry(enemy_name.clone()).or_insert(0) += 1;
                                player.stats_tracker.enemies_killed += 1;
                                player.stats_tracker.gold_earned += gold;
                                let name_lower = enemy_name.to_lowercase();
                                *player.stats_tracker.enemies_killed_by_type.entry(name_lower).or_insert(0) += 1;
                                match &enemy_rank {
                                    protocol::EnemyRank::Boss => {
                                        player.stats_tracker.boss_kills += 1;
                                        player.bosses_killed += 1;
                                    }
                                    protocol::EnemyRank::Elite => player.stats_tracker.elite_kills += 1,
                                    protocol::EnemyRank::Champion => player.stats_tracker.champion_kills += 1,
                                    _ => {}
                                }
                                check_and_apply_level_up(&mut player, state);
                                check_title_unlocks(&mut player);
                                send_stats_update(state, &player);
                            }
                            aoe_kills.push((enemy_name, enemy_rank));
                            broadcast_ground_items(state, ex, ey);
                            state.enemies.remove(&eid);
                        }
                    }
                }
            }
        }

        // Send title update after AoE kills (no DashMap guards held)
        if !aoe_kills.is_empty() {
            send_title_update(state, &player_id);
        }

        // Quest hooks for all AoE kills (no DashMap guards held)
        for (enemy_name, enemy_rank) in &aoe_kills {
            let rank_str = match enemy_rank {
                protocol::EnemyRank::Boss => "boss",
                protocol::EnemyRank::Elite => "elite",
                protocol::EnemyRank::Champion => "champion",
                protocol::EnemyRank::Normal => "normal",
            };
            check_quest_progress(state, player_id, "kill", enemy_name, 1);
            check_quest_progress(state, player_id, "kill_type", enemy_name, 1);
            check_quest_progress(state, player_id, "kill_rank", rank_str, 1);
        }
        if !aoe_kills.is_empty() {
            check_quest_progress(state, player_id, "gold", "", 0);
            check_quest_progress(state, player_id, "level", "", 0);
            check_achievements(state, player_id);
        }

        if hit_count == 0 {
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": format!("{} hit no targets!", skill.name), "channel": "combat" }
            }).to_string();
            state.send_to(&player_id, &msg);
        }
    } else {
        // Single target skill
        let target_uuid = match target_id_str.and_then(|s| Uuid::parse_str(s).ok()) {
            Some(id) => id,
            None => {
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": "No target selected!", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
                return;
            }
        };

        if let Some(mut enemy) = state.enemies.get_mut(&target_uuid) {
            if enemy.hp <= 0 { return; }
            let dist = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
            if dist > skill.range {
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": "Target out of range!", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
                return;
            }

            let raw = atk as f64 * skill.damage_mult * (0.9 + rng.r#gen::<f64>() * 0.2);
            let def_red = enemy.def as f64 / (enemy.def as f64 + 100.0);
            let crit_chance = 0.05 + lck as f64 * 0.001;
            let is_crit = rng.r#gen::<f64>() < crit_chance;
            let crit_mult = if is_crit { 1.5 } else { 1.0 };
            let dmg = (raw * (1.0 - def_red) * crit_mult).max(1.0) as i32;
            enemy.hp -= dmg;

            // Apply skill CC/DoT effects to enemy
            if let Some((eff_name, eff_val, eff_dur)) = &skill.effect {
                match *eff_name {
                    "stun" | "freeze" => { enemy.stun_ticks = enemy.stun_ticks.max(*eff_dur); }
                    "burn" | "poison" | "bleed" => {
                        let dot_total = *eff_val * (*eff_dur as i32 / 20).max(1);
                        enemy.hp -= dot_total;
                    }
                    "armor_break" => { enemy.def = (enemy.def - *eff_val).max(0); }
                    "weakness" => { enemy.atk = (enemy.atk - *eff_val).max(1); }
                    _ => {}
                }
            }

            let combat_msg = json!({
                "type": MSG_COMBAT_EVENT,
                "payload": {
                    "attackerId": player_id.to_string(),
                    "targetId": target_uuid.to_string(),
                    "damage": dmg,
                    "isCrit": is_crit,
                    "targetHp": enemy.hp.max(0),
                    "skillId": skill_id,
                    "skillName": skill.name,
                }
            }).to_string();
            state.send_to_all_near(enemy.x, enemy.y, 40.0, &combat_msg);

            if enemy.hp <= 0 {
                let ex = enemy.x;
                let ey = enemy.y;
                let xp_reward = enemy.xp_reward;
                let enemy_name = enemy.name.clone();
                let enemy_level = enemy.level;
                let enemy_rank = enemy.rank.clone();
                let zone_level = state.world.get_zone_level(ex, ey);
                enemy.state = EnemyState::Dead;
                drop(enemy);

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

                for item in &loot {
                    let ground_item = GroundItem {
                        id: Uuid::new_v4(),
                        item: item.clone(),
                        x: ex + rng.gen_range(-1.0..1.0),
                        y: ey + rng.gen_range(-1.0..1.0),
                        owner_id: Some(player_id),
                        drop_time: tick,
                        protection_duration: 600.0,
                    };
                    state.ground_items.insert(ground_item.id, ground_item);
                }

                if let Some(mut player) = state.players.get_mut(&player_id) {
                    // Stamina XP multiplier
                    let stamina_mult = if player.stamina_minutes > 2400 { 1.5 } else if player.stamina_minutes >= 840 { 1.0 } else { 0.5 };
                    let stamina_xp = (xp_reward as f64 * stamina_mult) as u64;
                    player.xp += stamina_xp;
                    player.gold += gold;
                    // Bestiary tracking
                    *player.bestiary.entry(enemy_name.clone()).or_insert(0) += 1;
                    check_and_apply_level_up(&mut player, state);
                    check_title_unlocks(&mut player);
                    send_stats_update(state, &player);
                }
                send_title_update(state, &player_id);

                let loot_names: Vec<String> = loot.iter().map(|i| i.name.clone()).collect();
                let kill_msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": {
                        "sender": "System",
                        "text": format!("You defeated {}! (+{} XP, +{}g) Loot: {}", enemy_name, xp_reward, gold, loot_names.join(", ")),
                        "channel": "combat"
                    }
                }).to_string();
                state.send_to(&player_id, &kill_msg);
                broadcast_ground_items(state, ex, ey);
                state.enemies.remove(&target_uuid);

                // Quest & Achievement hooks (no DashMap guards held)
                let rank_str = match &enemy_rank {
                    protocol::EnemyRank::Boss => "boss",
                    protocol::EnemyRank::Elite => "elite",
                    protocol::EnemyRank::Champion => "champion",
                    protocol::EnemyRank::Normal => "normal",
                };
                check_quest_progress(state, player_id, "kill", &enemy_name, 1);
                check_quest_progress(state, player_id, "kill_type", &enemy_name, 1);
                check_quest_progress(state, player_id, "kill_rank", rank_str, 1);
                check_quest_progress(state, player_id, "gold", "", 0);
                check_quest_progress(state, player_id, "level", "", 0);
                check_achievements(state, player_id);
            }
        }
    }

    // Send updated stats (mana deducted)
    if let Some(player) = state.players.get(&player_id) {
        send_stats_update(state, &player);
    }
}

// ─── Party System ───────────────────────────────────────────

fn handle_party_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = match payload.get("action").and_then(|v| v.as_str()) {
        Some(a) => a,
        None => return,
    };

    let sys_msg = |state: &Arc<AppState>, pid: &Uuid, text: String| {
        let m = json!({
            "type": MSG_CHAT_MESSAGE,
            "payload": { "sender": "System", "text": text, "channel": "system" }
        }).to_string();
        state.send_to(pid, &m);
    };

    let send_party_update = |state: &Arc<AppState>, party_id: &Uuid| {
        if let Some(members) = state.parties.get(party_id) {
            let member_data: Vec<serde_json::Value> = members.iter().filter_map(|mid| {
                state.players.get(mid).map(|p| json!({
                    "id": mid.to_string(),
                    "name": p.username.clone(),
                    "hp": p.hp,
                    "maxHp": p.max_hp,
                    "level": p.level,
                    "class": p.class,
                }))
            }).collect();
            let update = json!({
                "type": MSG_PARTY_UPDATE,
                "payload": { "members": member_data }
            }).to_string();
            for mid in members.value() {
                state.send_to(mid, &update);
            }
        }
    };

    match action {
        "invite" => {
            if let Some(target_name) = payload.get("target").and_then(|v| v.as_str()) {
                // Find target player
                let target_entry = state.players.iter().find(|e| {
                    e.value().username.eq_ignore_ascii_case(target_name) && e.value().id != player_id
                });
                if let Some(entry) = target_entry {
                    let target_id = entry.value().id;
                    // Check if target is already in a party
                    if state.player_party.contains_key(&target_id) {
                        sys_msg(state, &player_id, format!("{} is already in a party.", target_name));
                        return;
                    }
                    let inviter_name = state.players.get(&player_id)
                        .map(|p| p.username.clone())
                        .unwrap_or_default();
                    // Store the invite
                    state.party_invites.insert(target_id, (player_id, std::time::Instant::now()));
                    let invite_msg = json!({
                        "type": MSG_PARTY_INVITE,
                        "payload": { "from": inviter_name }
                    }).to_string();
                    state.send_to(&target_id, &invite_msg);
                    sys_msg(state, &player_id, format!("Party invite sent to {}.", target_name));
                } else {
                    sys_msg(state, &player_id, format!("Player '{}' not found.", target_name));
                }
            }
        }
        "accept" => {
            // Accept pending invite
            if let Some((_, (leader_id, invite_time))) = state.party_invites.remove(&player_id) {
                // Check invite isn't expired (60s)
                if invite_time.elapsed() > Duration::from_secs(60) {
                    sys_msg(state, &player_id, "Party invite has expired.".to_string());
                    return;
                }
                // Get or create party for leader
                let party_id = if let Some(pid) = state.player_party.get(&leader_id) {
                    *pid.value()
                } else {
                    // Create new party with leader
                    let pid = Uuid::new_v4();
                    state.parties.insert(pid, vec![leader_id]);
                    state.player_party.insert(leader_id, pid);
                    pid
                };
                // Add player to party
                if let Some(mut members) = state.parties.get_mut(&party_id) {
                    if members.len() < 5 {
                        members.push(player_id);
                        state.player_party.insert(player_id, party_id);
                        let name = state.players.get(&player_id)
                            .map(|p| p.username.clone()).unwrap_or_default();
                        // Notify all members
                        for mid in members.iter() {
                            sys_msg(state, mid, format!("{} joined the party.", name));
                        }
                        drop(members);
                        send_party_update(state, &party_id);
                        update_daily_quest_progress(state, &player_id, "join_party", 1);
                    } else {
                        sys_msg(state, &player_id, "Party is full (max 5).".to_string());
                    }
                }
            } else {
                sys_msg(state, &player_id, "No pending party invite.".to_string());
            }
        }
        "leave" => {
            if let Some((_, party_id)) = state.player_party.remove(&player_id) {
                let name = state.players.get(&player_id)
                    .map(|p| p.username.clone()).unwrap_or_default();
                if let Some(mut members) = state.parties.get_mut(&party_id) {
                    members.retain(|id| *id != player_id);
                    // Notify remaining members
                    for mid in members.iter() {
                        sys_msg(state, mid, format!("{} left the party.", name));
                    }
                    if members.len() <= 1 {
                        // Disband party if only 1 left
                        if let Some(last) = members.first().copied() {
                            state.player_party.remove(&last);
                            sys_msg(state, &last, "Party disbanded.".to_string());
                        }
                        drop(members);
                        state.parties.remove(&party_id);
                    } else {
                        drop(members);
                        send_party_update(state, &party_id);
                    }
                }
                // Send empty party update to the leaving player
                let empty = json!({
                    "type": MSG_PARTY_UPDATE,
                    "payload": { "members": [] }
                }).to_string();
                state.send_to(&player_id, &empty);
            }
        }
        "kick" => {
            if let Some(target_name) = payload.get("target").and_then(|v| v.as_str()) {
                // Only party leader (first member) can kick
                if let Some(party_id) = state.player_party.get(&player_id) {
                    let pid = *party_id.value();
                    if let Some(members) = state.parties.get(&pid) {
                        if members.first() != Some(&player_id) {
                            sys_msg(state, &player_id, "Only the party leader can kick.".to_string());
                            return;
                        }
                    }
                    drop(party_id);
                    // Find target
                    let target_id = state.players.iter().find(|e| {
                        e.value().username.eq_ignore_ascii_case(target_name)
                    }).map(|e| e.value().id);
                    if let Some(tid) = target_id {
                        state.player_party.remove(&tid);
                        if let Some(mut members) = state.parties.get_mut(&pid) {
                            members.retain(|id| *id != tid);
                            for mid in members.iter() {
                                sys_msg(state, mid, format!("{} was kicked from the party.", target_name));
                            }
                            if members.len() <= 1 {
                                if let Some(last) = members.first().copied() {
                                    state.player_party.remove(&last);
                                    sys_msg(state, &last, "Party disbanded.".to_string());
                                }
                                drop(members);
                                state.parties.remove(&pid);
                            } else {
                                drop(members);
                                send_party_update(state, &pid);
                            }
                        }
                        let empty = json!({
                            "type": MSG_PARTY_UPDATE,
                            "payload": { "members": [] }
                        }).to_string();
                        state.send_to(&tid, &empty);
                        sys_msg(state, &tid, "You were kicked from the party.".to_string());
                    }
                }
            }
        }
        _ => {}
    }
}

/// Recalculate party buffs for all players in parties.
/// Bonuses: +3% ATK, +3% DEF, +5% max HP per party member (excluding self).
/// Class synergy: diverse classes grant +2% extra per unique class.
fn update_party_buffs(state: &Arc<AppState>) {
    // Collect party member info first
    let mut party_members: HashMap<Uuid, Vec<(Uuid, String, i32, i32, i32)>> = HashMap::new();
    for entry in state.parties.iter() {
        let party_id = *entry.key();
        let members = entry.value();
        let mut member_info = Vec::new();
        for mid in members {
            if let Some(p) = state.players.get(mid) {
                member_info.push((*mid, p.class.clone(), p.atk, p.def, p.max_hp));
            }
        }
        party_members.insert(party_id, member_info);
    }

    // Reset all solo players' buffs
    let players_in_parties: std::collections::HashSet<Uuid> = state.player_party.iter()
        .map(|e| *e.key())
        .collect();

    for mut entry in state.players.iter_mut() {
        let p = entry.value_mut();
        if !players_in_parties.contains(&p.id) {
            p.party_bonus_atk = 0;
            p.party_bonus_def = 0;
            p.party_bonus_hp = 0;
        }
    }

    // Apply party buffs
    for (_party_id, members) in &party_members {
        let count = members.len() as i32;
        if count < 2 { continue; }
        let other_count = count - 1;
        let unique_classes: std::collections::HashSet<&str> = members.iter().map(|m| m.1.as_str()).collect();
        let class_bonus_pct = (unique_classes.len() as i32 - 1).max(0) * 2; // +2% per unique class beyond first

        for (mid, _, base_atk, base_def, base_hp) in members {
            let atk_bonus = ((*base_atk as f64) * (other_count as f64 * 0.03 + class_bonus_pct as f64 * 0.01)) as i32;
            let def_bonus = ((*base_def as f64) * (other_count as f64 * 0.03 + class_bonus_pct as f64 * 0.01)) as i32;
            let hp_bonus = ((*base_hp as f64) * (other_count as f64 * 0.05 + class_bonus_pct as f64 * 0.01)) as i32;
            if let Some(mut player) = state.players.get_mut(mid) {
                player.party_bonus_atk = atk_bonus;
                player.party_bonus_def = def_bonus;
                player.party_bonus_hp = hp_bonus;
            }
        }
    }
}

// ─── Trade System ───────────────────────────────────────────

struct TradeSession {
    player_a: Uuid,
    player_b: Uuid,
    items_a: Vec<usize>, // inventory slot indices offered by A
    items_b: Vec<usize>, // inventory slot indices offered by B
    gold_a: u64,
    gold_b: u64,
    confirmed_a: bool,
    confirmed_b: bool,
}

fn handle_trade_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = match payload.get("action").and_then(|v| v.as_str()) {
        Some(a) => a,
        None => return,
    };

    let sys_msg = |text: String| {
        let m = json!({
            "type": MSG_CHAT_MESSAGE,
            "payload": { "sender": "System", "text": text, "channel": "system" }
        }).to_string();
        state.send_to(&player_id, &m);
    };

    let send_trade_update = |trade_id: &Uuid| {
        if let Some(trade) = state.active_trades.get(trade_id) {
            let update = json!({
                "type": MSG_TRADE_UPDATE,
                "payload": {
                    "tradeId": trade_id.to_string(),
                    "itemsA": trade.items_a,
                    "itemsB": trade.items_b,
                    "goldA": trade.gold_a,
                    "goldB": trade.gold_b,
                    "confirmedA": trade.confirmed_a,
                    "confirmedB": trade.confirmed_b,
                    "playerA": trade.player_a.to_string(),
                    "playerB": trade.player_b.to_string(),
                }
            }).to_string();
            state.send_to(&trade.player_a, &update);
            state.send_to(&trade.player_b, &update);
        }
    };

    match action {
        "request" => {
            if let Some(target_name) = payload.get("target").and_then(|v| v.as_str()) {
                // Check not already trading
                if state.player_trade.contains_key(&player_id) {
                    sys_msg("You are already in a trade.".to_string());
                    return;
                }
                let target = state.players.iter().find(|e| {
                    e.value().username.eq_ignore_ascii_case(target_name) && e.value().id != player_id
                });
                if let Some(entry) = target {
                    let tid = entry.value().id;
                    drop(entry);
                    // Check proximity
                    let (px, py) = state.players.get(&player_id).map(|p| (p.x, p.y)).unwrap_or((0.0, 0.0));
                    let (tx, ty) = state.players.get(&tid).map(|p| (p.x, p.y)).unwrap_or((999.0, 999.0));
                    if ((px - tx).powi(2) + (py - ty).powi(2)).sqrt() > 10.0 {
                        sys_msg("Player is too far away to trade.".to_string());
                        return;
                    }
                    state.trade_requests.insert(tid, (player_id, std::time::Instant::now()));
                    let name = state.players.get(&player_id).map(|p| p.username.clone()).unwrap_or_default();
                    let req_msg = json!({
                        "type": MSG_TRADE_REQUEST,
                        "payload": { "from": name }
                    }).to_string();
                    state.send_to(&tid, &req_msg);
                    sys_msg(format!("Trade request sent to {}.", target_name));
                } else {
                    sys_msg(format!("Player '{}' not found.", target_name));
                }
            }
        }
        "accept" => {
            if let Some((_, (requester_id, time))) = state.trade_requests.remove(&player_id) {
                if time.elapsed() > Duration::from_secs(30) {
                    sys_msg("Trade request expired.".to_string());
                    return;
                }
                let trade_id = Uuid::new_v4();
                state.active_trades.insert(trade_id, TradeSession {
                    player_a: requester_id,
                    player_b: player_id,
                    items_a: Vec::new(),
                    items_b: Vec::new(),
                    gold_a: 0,
                    gold_b: 0,
                    confirmed_a: false,
                    confirmed_b: false,
                });
                state.player_trade.insert(requester_id, trade_id);
                state.player_trade.insert(player_id, trade_id);
                send_trade_update(&trade_id);
                let name_a = state.players.get(&requester_id).map(|p| p.username.clone()).unwrap_or_default();
                let name_b = state.players.get(&player_id).map(|p| p.username.clone()).unwrap_or_default();
                let m1 = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": format!("Trade started with {}.", name_b), "channel": "system" }
                }).to_string();
                state.send_to(&requester_id, &m1);
                let m2 = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": format!("Trade started with {}.", name_a), "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &m2);
            } else {
                sys_msg("No pending trade request.".to_string());
            }
        }
        "offer" => {
            // Offer items and/or gold
            if let Some(trade_id) = state.player_trade.get(&player_id).map(|v| *v.value()) {
                if let Some(mut trade) = state.active_trades.get_mut(&trade_id) {
                    let items: Vec<usize> = payload.get("items")
                        .and_then(|v| serde_json::from_value(v.clone()).ok())
                        .unwrap_or_default();
                    let gold_offered = payload.get("gold").and_then(|v| v.as_u64()).unwrap_or(0);
                    // Reset confirmations when offer changes
                    trade.confirmed_a = false;
                    trade.confirmed_b = false;
                    if player_id == trade.player_a {
                        trade.items_a = items;
                        trade.gold_a = gold_offered;
                    } else {
                        trade.items_b = items;
                        trade.gold_b = gold_offered;
                    }
                    drop(trade);
                    send_trade_update(&trade_id);
                }
            }
        }
        "confirm" => {
            if let Some(trade_id) = state.player_trade.get(&player_id).map(|v| *v.value()) {
                let should_execute = {
                    if let Some(mut trade) = state.active_trades.get_mut(&trade_id) {
                        if player_id == trade.player_a {
                            trade.confirmed_a = true;
                        } else {
                            trade.confirmed_b = true;
                        }
                        let both = trade.confirmed_a && trade.confirmed_b;
                        drop(trade);
                        if !both { send_trade_update(&trade_id); }
                        both
                    } else {
                        false
                    }
                };
                if should_execute {
                    execute_trade(state, &trade_id);
                }
            }
        }
        "cancel" => {
            if let Some((_, trade_id)) = state.player_trade.remove(&player_id) {
                if let Some((_, trade)) = state.active_trades.remove(&trade_id) {
                    state.player_trade.remove(&trade.player_a);
                    state.player_trade.remove(&trade.player_b);
                    let cancel_msg = json!({
                        "type": MSG_TRADE_UPDATE,
                        "payload": { "cancelled": true }
                    }).to_string();
                    state.send_to(&trade.player_a, &cancel_msg);
                    state.send_to(&trade.player_b, &cancel_msg);
                }
            }
        }
        _ => {}
    }
}

fn execute_trade(state: &Arc<AppState>, trade_id: &Uuid) {
    let trade = match state.active_trades.remove(trade_id) {
        Some((_, t)) => t,
        None => return,
    };
    state.player_trade.remove(&trade.player_a);
    state.player_trade.remove(&trade.player_b);

    // Swap items between inventories
    let mut items_from_a = Vec::new();
    let mut items_from_b = Vec::new();

    // Collect items from A's inventory
    if let Some(mut pa) = state.players.get_mut(&trade.player_a) {
        for &slot in &trade.items_a {
            if slot < pa.inventory.len() {
                if let Some(item) = pa.inventory[slot].take() {
                    items_from_a.push(item);
                }
            }
        }
        // Gold transfer
        let gold_give = trade.gold_a.min(pa.gold);
        pa.gold -= gold_give;
        pa.gold += trade.gold_b;
    }

    // Collect items from B's inventory
    if let Some(mut pb) = state.players.get_mut(&trade.player_b) {
        for &slot in &trade.items_b {
            if slot < pb.inventory.len() {
                if let Some(item) = pb.inventory[slot].take() {
                    items_from_b.push(item);
                }
            }
        }
        let gold_give = trade.gold_b.min(pb.gold + trade.gold_a); // already received gold_a above
        pb.gold -= gold_give.min(pb.gold);
        pb.gold += trade.gold_a;
    }

    // Give A's items to B
    if let Some(mut pb) = state.players.get_mut(&trade.player_b) {
        for item in items_from_a {
            if let Some(empty) = pb.inventory.iter_mut().find(|s| s.is_none()) {
                *empty = Some(item);
            }
        }
    }

    // Give B's items to A
    if let Some(mut pa) = state.players.get_mut(&trade.player_a) {
        for item in items_from_b {
            if let Some(empty) = pa.inventory.iter_mut().find(|s| s.is_none()) {
                *empty = Some(item);
            }
        }
    }

    // Send inventory updates
    send_inventory_update(state, &trade.player_a);
    send_inventory_update(state, &trade.player_b);
    send_stats_update_by_id(state, &trade.player_a);
    send_stats_update_by_id(state, &trade.player_b);

    let complete = json!({
        "type": MSG_TRADE_UPDATE,
        "payload": { "completed": true }
    }).to_string();
    state.send_to(&trade.player_a, &complete);
    state.send_to(&trade.player_b, &complete);
}

// ─── Stat Allocation Handler ────────────────────────────────

fn handle_allocate_stats(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    // Parse allocations: {"allocations": {"vitality": 2, "strength": 1}}
    let allocations = match payload.get("allocations").and_then(|v| v.as_object()) {
        Some(a) => a,
        None => return,
    };

    let mut total_requested: u32 = 0;
    let mut valid_allocs: Vec<(&str, u32)> = Vec::new();

    for (stat_name, count_val) in allocations {
        let count = match count_val.as_u64() {
            Some(c) if c > 0 => c as u32,
            _ => continue,
        };
        if !VALID_STATS.contains(&stat_name.as_str()) {
            continue;
        }
        total_requested += count;
        valid_allocs.push((stat_name.as_str(), count));
    }

    if total_requested == 0 { return; }

    if let Some(mut player) = state.players.get_mut(&player_id) {
        if player.stat_points < total_requested {
            // Not enough points — reject
            let err_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": {
                    "sender": "System",
                    "text": format!("Not enough stat points! You have {} but tried to spend {}.", player.stat_points, total_requested),
                    "channel": "system"
                }
            }).to_string();
            state.send_to(&player_id, &err_msg);
            return;
        }

        player.stat_points -= total_requested;

        for (stat, count) in &valid_allocs {
            let c = *count as i32;
            match *stat {
                "vitality"  => { player.max_hp += STAT_VITALITY_HP * c; player.hp = player.hp.min(player.max_hp); }
                "endurance" => { player.max_mp += STAT_ENDURANCE_MP * c; player.mp = player.mp.min(player.max_mp); }
                "strength"  => { player.atk += STAT_STRENGTH_ATK * c; }
                "fortitude" => { player.def += STAT_FORTITUDE_DEF * c; }
                "agility"   => { player.spd += STAT_AGILITY_SPD * c; }
                "fortune"   => { player.lck += STAT_FORTUNE_LCK * c; }
                _ => {}
            }
        }

        // Confirm with chat message
        let alloc_strs: Vec<String> = valid_allocs.iter()
            .map(|(s, c)| format!("{}: +{}", s, c))
            .collect();
        let confirm_msg = json!({
            "type": MSG_CHAT_MESSAGE,
            "payload": {
                "sender": "System",
                "text": format!("📊 Stats allocated! {} ({} points remaining)", alloc_strs.join(", "), player.stat_points),
                "channel": "system"
            }
        }).to_string();
        state.send_to(&player_id, &confirm_msg);

        send_stats_update(state, &player);
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
        // Handle PvP death — apply skull to attacker
        {
            let mut attacker = state.players.get_mut(&attacker_id).unwrap();
            attacker.stats_tracker.pvp_kills += 1;
            attacker.pvp_kills_today += 1;

            // Skull escalation: white → red → black
            if attacker.pvp_kills_today >= 10 {
                attacker.skull_type = 3; // Black skull
                attacker.skull_timer = 12000; // 10 min
            } else if attacker.pvp_kills_today >= 3 {
                attacker.skull_type = 2; // Red skull
                attacker.skull_timer = 6000; // 5 min
            } else if attacker.skull_type == 0 {
                attacker.skull_type = 1; // White skull
                attacker.skull_timer = 2400; // 2 min
            }
        }

        let (dropped_items, dropped_gold) = {
            let mut target = state.players.get_mut(&target_id).unwrap();
            target.dead = true;
            target.hp = 0;
            target.respawn_timer = 100.0; // 5 seconds at 20 tps

            // XP penalty: lose 10% of xp needed for next level, reduced by blessings (20% each)
            let blessing_count = target.blessings.count_ones() as f64;
            let xp_loss_base = target.xp_to_next_level() / 10;
            let xp_loss = (xp_loss_base as f64 * (1.0 - blessing_count * 0.20).max(0.0)) as u64;
            if target.xp >= xp_loss && target.level >= 10 {
                target.xp -= xp_loss;
            }

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
        send_stats_update_by_id(state, &attacker_id);

        // Bounty claim — if victim had a bounty, award it to killer
        let bounty_amount = if let Some(mut target) = state.players.get_mut(&target_id) {
            std::mem::take(&mut target.bounty_gold)
        } else {
            0
        };
        if bounty_amount > 0 {
            if let Some(mut attacker) = state.players.get_mut(&attacker_id) {
                attacker.gold += bounty_amount;
            }
            let bounty_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": {
                    "sender": "Bounty",
                    "text": format!("{} claimed the {}g bounty on {}!", attacker_name, bounty_amount, target_name),
                    "channel": "combat"
                }
            }).to_string();
            state.broadcast(&bounty_msg);
            send_inventory_update(state, &attacker_id);
            let bounty_update = json!({
                "type": MSG_BOUNTY_UPDATE,
                "payload": { "target": target_name, "bounty": 0 }
            }).to_string();
            state.send_to(&target_id, &bounty_update);
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

        // Arena match resolution — if kill happened in arena zone
        resolve_arena_kill(state, attacker_id, target_id);
    }
}

fn resolve_arena_kill(state: &Arc<AppState>, winner_id: Uuid, loser_id: Uuid) {
    let in_arena = {
        match state.players.get(&loser_id) {
            Some(p) => p.x >= 140.0 && p.x <= 165.0 && p.y >= 140.0 && p.y <= 165.0,
            None => false,
        }
    };
    if !in_arena { return; }

    let (winner_name, loser_name, winner_new_rating, loser_new_rating);
    {
        let mut winner = match state.players.get_mut(&winner_id) { Some(p) => p, None => return };
        winner.arena_wins += 1;
        winner.arena_rating = (winner.arena_rating + 25).min(3000);
        winner_new_rating = winner.arena_rating;
        winner_name = winner.username.clone();
    }
    {
        let mut loser = match state.players.get_mut(&loser_id) { Some(p) => p, None => return };
        loser.arena_losses += 1;
        loser.arena_rating = loser.arena_rating.saturating_sub(20).max(100);
        loser_new_rating = loser.arena_rating;
        loser_name = loser.username.clone();
    }

    // Send arena update to both
    let win_msg = json!({
        "type": crate::protocol::MSG_ARENA_UPDATE,
        "payload": { "action": "match_end", "result": "win", "ratingChange": 25, "newRating": winner_new_rating, "opponent": loser_name }
    }).to_string();
    state.send_to(&winner_id, &win_msg);

    let lose_msg = json!({
        "type": crate::protocol::MSG_ARENA_UPDATE,
        "payload": { "action": "match_end", "result": "loss", "ratingChange": -20, "newRating": loser_new_rating, "opponent": winner_name }
    }).to_string();
    state.send_to(&loser_id, &lose_msg);

    // Global announcement for high-rated matches
    if winner_new_rating >= 1500 || loser_new_rating >= 1500 {
        let announce = json!({
            "type": crate::protocol::MSG_CHAT_MESSAGE,
            "payload": { "channel": "global", "sender": "Arena", "text": format!("⚔️ {} ({}) defeated {} ({}) in the arena!", winner_name, winner_new_rating, loser_name, loser_new_rating) }
        }).to_string();
        state.broadcast(&announce);
    }
}

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

        if item.template_id.starts_with("xp_orb") {
            return;
        }

        // Try to add to inventory
        if let Some(mut player) = state.players.get_mut(&player_id) {
            if player.add_item(item.clone()) {
                state.ground_items.remove(&item_id);
                // Release the DashMap guard before helpers that re-enter `players`.
                drop(player);

                let pickup_msg = json!({
                    "type": MSG_ITEM_DROP,
                    "payload": { "itemName": item.name, "rarity": item.rarity }
                }).to_string();
                state.send_to(&player_id, &pickup_msg);

                send_inventory_update(state, &player_id);
                broadcast_ground_items(state, player_pos.0, player_pos.1);

                // Quest/achievement hooks for item pickup
                if let Some(mut p) = state.players.get_mut(&player_id) {
                    p.stats_tracker.items_collected += 1;
                    drop(p);
                }
                check_quest_progress(state, player_id, "collect", &item.name, 1);
                check_achievements(state, player_id);
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
                // Quest hook for equip objectives
                check_quest_progress(state, player_id, "equip", "", 1);
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
            if item.stackable {
                if let Some(existing) = player.bank.iter_mut().flatten()
                    .find(|bank_item| bank_item.stackable && bank_item.template_id == item.template_id)
                {
                    existing.quantity += item.quantity;
                    drop(player);
                    send_inventory_update(state, &player_id);
                    send_bank_update(state, &player_id);
                    return;
                }
            }

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
            // Shop buy from NPC merchant
            let listing_id = payload.get("listingId").and_then(|v| v.as_str()).unwrap_or("");
            if listing_id.is_empty() { return; }

            // NPC shop catalog (prices and items)
            // Format: (listing_id, display_name, price_gold, Item)
            let shop_items: Vec<(&str, &str, u64, Item)> = vec![
                // ── Weapons: Tier 1 (Lv 1-5, Common) ──
                ("shop_wooden_sword", "Wooden Sword", 50, Item::new_weapon("Wooden Sword", 0, 1, 5)),
                ("shop_rusty_dagger", "Rusty Dagger", 35, Item::new_weapon("Rusty Dagger", 0, 1, 4)),
                ("shop_apprentice_staff", "Apprentice Staff", 60, Item::new_weapon("Apprentice Staff", 0, 1, 5)),
                ("shop_short_bow", "Short Bow", 45, Item::new_weapon("Short Bow", 0, 1, 4)),
                // ── Weapons: Tier 2 (Lv 5-10, Common) ──
                ("shop_iron_sword", "Iron Sword", 150, Item::new_weapon("Iron Sword", 0, 5, 13)),
                ("shop_steel_dagger", "Steel Dagger", 120, Item::new_weapon("Steel Dagger", 0, 5, 12)),
                ("shop_oak_staff", "Oak Staff", 180, Item::new_weapon("Oak Staff", 0, 5, 14)),
                ("shop_hunting_bow", "Hunting Bow", 140, Item::new_weapon("Hunting Bow", 0, 5, 12)),
                // ── Weapons: Tier 3 (Lv 10-20, Uncommon) ──
                ("shop_steel_blade", "Steel Blade", 400, Item::new_weapon("Steel Blade", 1, 10, 23)),
                ("shop_shadow_dagger", "Shadow Dagger", 350, Item::new_weapon("Shadow Dagger", 1, 10, 22)),
                ("shop_crystal_staff", "Crystal Staff", 450, Item::new_weapon("Crystal Staff", 1, 10, 25)),
                ("shop_longbow", "Longbow", 380, Item::new_weapon("Longbow", 1, 10, 22)),
                // ── Weapons: Tier 4 (Lv 20+, Rare) ──
                ("shop_mithril_sword", "Mithril Sword", 1200, Item::new_weapon("Mithril Sword", 2, 20, 45)),
                ("shop_assassin_blade", "Assassin Blade", 1000, Item::new_weapon("Assassin Blade", 2, 20, 42)),
                ("shop_arcane_staff", "Arcane Staff", 1400, Item::new_weapon("Arcane Staff", 2, 20, 48)),
                ("shop_war_bow", "War Bow", 1100, Item::new_weapon("War Bow", 2, 20, 43)),

                // ── Armor: Helmets ──
                ("shop_leather_cap", "Leather Cap", 40, Item::new_armor("Leather Cap", "helmet", 0, 1, 3)),
                ("shop_iron_helm", "Iron Helm", 120, Item::new_armor("Iron Helm", "helmet", 0, 5, 10)),
                ("shop_steel_helm", "Steel Helm", 350, Item::new_armor("Steel Helm", "helmet", 1, 10, 18)),
                ("shop_mithril_helm", "Mithril Helm", 900, Item::new_armor("Mithril Helm", "helmet", 2, 20, 35)),
                // ── Armor: Body ──
                ("shop_cloth_robe", "Cloth Robe", 60, Item::new_armor("Cloth Robe", "armor", 0, 1, 2)),
                ("shop_leather_armor", "Leather Armor", 100, Item::new_armor("Leather Armor", "armor", 0, 3, 6)),
                ("shop_chainmail", "Chainmail", 300, Item::new_armor("Chainmail", "armor", 1, 8, 15)),
                ("shop_plate_armor", "Plate Armor", 800, Item::new_armor("Plate Armor", "armor", 2, 18, 32)),
                // ── Armor: Boots ──
                ("shop_sandals", "Sandals", 30, Item::new_armor("Sandals", "boots", 0, 1, 2)),
                ("shop_leather_boots", "Leather Boots", 80, Item::new_armor("Leather Boots", "boots", 0, 3, 6)),
                ("shop_iron_boots", "Iron Boots", 250, Item::new_armor("Iron Boots", "boots", 1, 8, 14)),
                ("shop_steel_greaves", "Steel Greaves", 700, Item::new_armor("Steel Greaves", "boots", 2, 16, 28)),
                // ── Armor: Shields ──
                ("shop_wooden_shield", "Wooden Shield", 40, Item::new_armor("Wooden Shield", "shield", 0, 1, 3)),
                ("shop_iron_shield", "Iron Shield", 130, Item::new_armor("Iron Shield", "shield", 0, 5, 10)),
                ("shop_steel_shield", "Steel Shield", 400, Item::new_armor("Steel Shield", "shield", 1, 10, 18)),
                ("shop_tower_shield", "Tower Shield", 1000, Item::new_armor("Tower Shield", "shield", 2, 20, 35)),
                // ── Armor: Legs ──
                ("shop_cloth_pants", "Cloth Pants", 35, Item::new_armor("Cloth Pants", "legs", 0, 1, 2)),
                ("shop_leather_leggings", "Leather Leggings", 90, Item::new_armor("Leather Leggings", "legs", 0, 3, 6)),
                ("shop_chain_leggings", "Chain Leggings", 280, Item::new_armor("Chain Leggings", "legs", 1, 8, 14)),
                ("shop_plate_legs", "Plate Legs", 750, Item::new_armor("Plate Legs", "legs", 2, 16, 28)),

                // ── Consumables: Health Potions ──
                ("shop_minor_health_potion", "Minor Health Potion", 15, {
                    let mut p = Item::new_consumable("Minor Health Potion", 0, 1);
                    p.stats.insert("HP".into(), 30);
                    p.description = "Restores 30 HP.".into();
                    p
                }),
                ("shop_health_potion", "Health Potion", 25, {
                    let mut p = Item::new_consumable("Health Potion", 0, 1);
                    p.stats.insert("HP".into(), 50);
                    p.description = "Restores 50 HP.".into();
                    p
                }),
                ("shop_greater_health_potion", "Greater Health Potion", 80, {
                    let mut p = Item::new_consumable("Greater Health Potion", 1, 1);
                    p.stats.insert("HP".into(), 150);
                    p.description = "Restores 150 HP.".into();
                    p
                }),
                ("shop_supreme_health_potion", "Supreme Health Potion", 250, {
                    let mut p = Item::new_consumable("Supreme Health Potion", 2, 1);
                    p.stats.insert("HP".into(), 500);
                    p.description = "Restores 500 HP.".into();
                    p
                }),
                // ── Consumables: Mana Potions ──
                ("shop_minor_mana_potion", "Minor Mana Potion", 15, {
                    let mut p = Item::new_consumable("Minor Mana Potion", 0, 1);
                    p.stats.insert("MP".into(), 20);
                    p.description = "Restores 20 MP.".into();
                    p
                }),
                ("shop_mana_potion", "Mana Potion", 25, {
                    let mut p = Item::new_consumable("Mana Potion", 0, 1);
                    p.stats.insert("MP".into(), 40);
                    p.description = "Restores 40 MP.".into();
                    p
                }),
                ("shop_greater_mana_potion", "Greater Mana Potion", 80, {
                    let mut p = Item::new_consumable("Greater Mana Potion", 1, 1);
                    p.stats.insert("MP".into(), 120);
                    p.description = "Restores 120 MP.".into();
                    p
                }),
                ("shop_supreme_mana_potion", "Supreme Mana Potion", 250, {
                    let mut p = Item::new_consumable("Supreme Mana Potion", 2, 1);
                    p.stats.insert("MP".into(), 400);
                    p.description = "Restores 400 MP.".into();
                    p
                }),
                // ── Consumables: Status Cures ──
                ("shop_antidote", "Antidote", 30, {
                    let mut p = Item::new_consumable("Antidote", 0, 1);
                    p.stats.insert("CURE_POISON".into(), 1);
                    p.description = "Cures poison.".into();
                    p
                }),
                ("shop_burn_salve", "Burn Salve", 35, {
                    let mut p = Item::new_consumable("Burn Salve", 0, 1);
                    p.stats.insert("CURE_BURN".into(), 1);
                    p.description = "Cures burn.".into();
                    p
                }),
                ("shop_freeze_ward", "Freeze Ward", 40, {
                    let mut p = Item::new_consumable("Freeze Ward", 0, 1);
                    p.stats.insert("CURE_FREEZE".into(), 1);
                    p.description = "Cures freeze.".into();
                    p
                }),

                // ── Materials ──
                ("shop_iron_ore", "Iron Ore", 15, Item::new_material("Iron Ore", 0, 1)),
                ("shop_wood", "Wood", 10, Item::new_material("Wood", 0, 1)),
                ("shop_leather", "Leather", 12, Item::new_material("Leather", 0, 1)),
                ("shop_herb", "Herb", 8, Item::new_material("Herb", 0, 1)),
                ("shop_coal", "Coal", 20, Item::new_material("Coal", 0, 1)),
                ("shop_silver_ore", "Silver Ore", 50, Item::new_material("Silver Ore", 1, 1)),
                ("shop_gold_ore", "Gold Ore", 150, Item::new_material("Gold Ore", 2, 1)),
                ("shop_dragon_scale", "Dragon Scale", 500, Item::new_material("Dragon Scale", 3, 1)),

                // ── Consumables: Buff Elixirs ──
                ("shop_str_elixir", "Strength Elixir", 120, {
                    let mut p = Item::new_consumable("Strength Elixir", 1, 1);
                    p.stats.insert("BUFF_ATK".into(), 15);
                    p.stats.insert("BUFF_DURATION".into(), 600);
                    p.description = "Boosts ATK by 15 for 30s.".into();
                    p
                }),
                ("shop_def_elixir", "Iron Skin Elixir", 120, {
                    let mut p = Item::new_consumable("Iron Skin Elixir", 1, 1);
                    p.stats.insert("BUFF_DEF".into(), 15);
                    p.stats.insert("BUFF_DURATION".into(), 600);
                    p.description = "Boosts DEF by 15 for 30s.".into();
                    p
                }),
                ("shop_spd_elixir", "Swiftness Elixir", 100, {
                    let mut p = Item::new_consumable("Swiftness Elixir", 1, 1);
                    p.stats.insert("BUFF_SPD".into(), 10);
                    p.stats.insert("BUFF_DURATION".into(), 600);
                    p.description = "Boosts SPD by 10 for 30s.".into();
                    p
                }),
                ("shop_lck_elixir", "Fortune Elixir", 150, {
                    let mut p = Item::new_consumable("Fortune Elixir", 1, 1);
                    p.stats.insert("BUFF_LCK".into(), 20);
                    p.stats.insert("BUFF_DURATION".into(), 600);
                    p.description = "Boosts LCK by 20 for 30s.".into();
                    p
                }),
                // ── Consumables: Food (HP/MP regen over time) ──
                ("shop_bread", "Bread", 10, {
                    let mut p = Item::new_consumable("Bread", 0, 5);
                    p.stats.insert("REGEN_HP".into(), 5);
                    p.stats.insert("REGEN_DURATION".into(), 200);
                    p.description = "Restores 5 HP/tick for 10s.".into();
                    p
                }),
                ("shop_cooked_meat", "Cooked Meat", 25, {
                    let mut p = Item::new_consumable("Cooked Meat", 0, 5);
                    p.stats.insert("REGEN_HP".into(), 10);
                    p.stats.insert("REGEN_DURATION".into(), 200);
                    p.description = "Restores 10 HP/tick for 10s.".into();
                    p
                }),
                ("shop_feast", "Feast Plate", 100, {
                    let mut p = Item::new_consumable("Feast Plate", 1, 3);
                    p.stats.insert("REGEN_HP".into(), 15);
                    p.stats.insert("REGEN_MP".into(), 10);
                    p.stats.insert("REGEN_DURATION".into(), 400);
                    p.description = "Restores HP and MP over 20s.".into();
                    p
                }),
                // ── Consumables: Scrolls ──
                ("shop_scroll_teleport", "Scroll of Teleport", 200, {
                    let mut p = Item::new_consumable("Scroll of Teleport", 1, 1);
                    p.stats.insert("TELEPORT".into(), 1);
                    p.description = "Teleports to nearest town.".into();
                    p
                }),
                // ── Materials: Enchanting ──
                ("shop_enchant_stone", "Enchanting Stone", 300, Item::new_material("Enchanting Stone", 1, 1)),
            ];

            let found = shop_items.into_iter().find(|(id, _, _, _)| *id == listing_id);
            if let Some((_id, item_name, price, mut item)) = found {
                if let Some(mut player) = state.players.get_mut(&player_id) {
                    if player.gold < price {
                        drop(player);
                        let msg = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": "Not enough gold!", "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &msg);
                        return;
                    }
                    // Find empty inventory slot
                    let empty_slot = player.inventory.iter().position(|s| s.is_none());
                    if let Some(slot_idx) = empty_slot {
                        player.gold -= price;
                        item.id = Uuid::new_v4().to_string();
                        player.inventory[slot_idx] = Some(item);
                        drop(player);
                        let msg = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": format!("Bought {} for {}g.", item_name, price), "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &msg);
                        send_inventory_update(state, &player_id);
                        send_stats_update_by_id(state, &player_id);
                    } else {
                        drop(player);
                        let msg = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "System", "text": "Inventory full!", "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &msg);
                    }
                }
            } else {
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": "Item not found in shop.", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
            }
        }
        "sell" => {
            // Sell an inventory item for 40% of base price
            let slot_index = match payload.get("slotIndex").and_then(|v| v.as_u64()) {
                Some(idx) => idx as usize,
                None => return,
            };
            if let Some(mut player) = state.players.get_mut(&player_id) {
                if slot_index >= player.inventory.len() { return; }
                let item = match player.inventory[slot_index].clone() {
                    Some(item) => item,
                    None => return,
                };
                // Calculate sell price using item_gold_value helper
                let base_price = item_gold_value(&item);
                let sell_price = (base_price as f64 * 0.4).max(1.0) as u64;
                let item_name = item.name.clone();
                let qty = item.quantity;

                if qty > 1 {
                    if let Some(slot_item) = player.inventory[slot_index].as_mut() {
                        slot_item.quantity -= 1;
                    }
                    player.gold += sell_price;
                } else {
                    player.inventory[slot_index] = None;
                    player.gold += sell_price;
                }

                check_title_unlocks(&mut player);
                drop(player);
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "System", "text": format!("Sold {} for {}g.", item_name, sell_price), "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
                send_inventory_update(state, &player_id);
                send_stats_update_by_id(state, &player_id);
                send_title_update(state, &player_id);
                // Faction rep: Merchant League gains from selling
                if let Some(mut p) = state.players.get_mut(&player_id) {
                    *p.faction_rep.entry("merchant_league".to_string()).or_insert(0) += 3;
                }
            }
        }
        "use" => {
            // Use a consumable item from inventory
            let slot_index = match payload.get("slotIndex").and_then(|v| v.as_u64()) {
                Some(idx) => idx as usize,
                None => return,
            };
            if let Some(mut player) = state.players.get_mut(&player_id) {
                if slot_index >= player.inventory.len() { return; }
                let item = match player.inventory[slot_index].clone() {
                    Some(item) => item,
                    None => return,
                };
                if item.item_type == ItemType::Consumable {
                    let heal = item.stats.get("HP").copied().unwrap_or(0);
                    let mp_heal = item.stats.get("MP").copied().unwrap_or(0);
                    let item_name = item.name.clone();
                    let item_stats = item.stats.clone();

                    if item.quantity > 1 {
                        if let Some(slot_item) = player.inventory[slot_index].as_mut() {
                            slot_item.quantity -= 1;
                        }
                    } else {
                        player.inventory[slot_index] = None;
                    }

                    if heal > 0 {
                        player.hp = (player.hp + heal).min(player.max_hp);
                    }
                    if mp_heal > 0 {
                        player.mp = (player.mp + mp_heal).min(player.max_mp);
                    }

                    // Apply status effects from special consumables
                    if item_stats.contains_key("CURE_POISON") {
                        player.remove_effect(&crate::protocol::StatusEffectType::Poison);
                    }
                    if item_stats.contains_key("CURE_BURN") {
                        player.remove_effect(&crate::protocol::StatusEffectType::Burn);
                    }
                    if item_stats.contains_key("CURE_FREEZE") {
                        player.remove_effect(&crate::protocol::StatusEffectType::Freeze);
                    }
                    if item_stats.contains_key("CURE_BLEED") {
                        player.remove_effect(&crate::protocol::StatusEffectType::Bleed);
                    }
                    if item_stats.contains_key("CURE_STUN") {
                        player.remove_effect(&crate::protocol::StatusEffectType::Stun);
                    }
                    if let Some(&regen_val) = item_stats.get("REGEN") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Regen,
                            regen_val, 200, 20, "potion", // 10 seconds, tick every 1s
                        ));
                    }
                    if let Some(&str_val) = item_stats.get("STRENGTH") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Strength,
                            str_val, 400, 400, "potion", // 20 seconds
                        ));
                    }
                    if item_stats.contains_key("HASTE") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Haste,
                            0, 300, 300, "potion", // 15 seconds
                        ));
                    }
                    if let Some(&shield_val) = item_stats.get("SHIELD") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Shield,
                            shield_val, 400, 400, "potion", // 20 seconds
                        ));
                    }
                    if item_stats.contains_key("INVULN") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Invulnerable,
                            0, 100, 100, "potion", // 5 seconds
                        ));
                    }
                    if let Some(&thorns_val) = item_stats.get("THORNS") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Thorns,
                            thorns_val, 300, 300, "potion", // 15 seconds
                        ));
                    }
                    if let Some(&ls_val) = item_stats.get("LIFESTEAL") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Lifesteal,
                            ls_val, 400, 400, "potion", // 20 seconds
                        ));
                    }
                    // Buff elixirs — apply Strength for ATK, Shield for DEF, Haste for SPD
                    if let Some(&atk_buff) = item_stats.get("BUFF_ATK") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Strength,
                            atk_buff, 600, 600, "elixir",
                        ));
                    }
                    if let Some(&def_buff) = item_stats.get("BUFF_DEF") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Shield,
                            def_buff, 600, 600, "elixir",
                        ));
                    }
                    if let Some(&spd_buff) = item_stats.get("BUFF_SPD") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Haste,
                            spd_buff, 600, 600, "elixir",
                        ));
                    }
                    if let Some(&lck_buff) = item_stats.get("BUFF_LCK") {
                        // Use Regen type with LCK tag as a luck boost
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Regen,
                            lck_buff, 600, 600, "luck_elixir",
                        ));
                    }
                    // Regen food (HP/MP regen over time)
                    if let Some(&regen_hp) = item_stats.get("REGEN_HP") {
                        let dur = item_stats.get("REGEN_DURATION").copied().unwrap_or(200) as u32;
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Regen,
                            regen_hp, dur, 20, "food",
                        ));
                    }
                    // Mount speed buff — long-duration haste
                    if let Some(&mount_spd) = item_stats.get("MOUNT_SPEED") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Haste,
                            mount_spd, 6000, 6000, "mount", // 5 minutes
                        ));
                    }
                    // XP boost buff
                    if let Some(&xp_val) = item_stats.get("XP_BOOST") {
                        player.apply_effect(crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Strength,
                            xp_val, 6000, 6000, "xp_boost", // 5 minutes
                        ));
                    }
                    // Teleport scroll — save px/py for teleport after drop
                    let do_teleport = item_stats.contains_key("TELEPORT");
                    let player_id_copy = player.id;

                    drop(player);

                    // Handle teleport outside the guard
                    if do_teleport {
                        // Find nearest town
                        let px;
                        let py;
                        if let Some(p) = state.players.get(&player_id_copy) {
                            px = p.x;
                            py = p.y;
                        } else { return; }
                        drop(state.players.get(&player_id_copy));

                        let (tx, ty) = crate::world::TOWNS.iter()
                            .map(|(x, y, _, _)| {
                                let dx = px - *x;
                                let dy = py - *y;
                                ((*x, *y), dx*dx + dy*dy)
                            })
                            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
                            .map(|(pos, _)| pos)
                            .unwrap_or((0.0, 0.0));

                        if let Some(mut p) = state.players.get_mut(&player_id_copy) {
                            p.x = tx;
                            p.y = ty;
                        }
                    }

                    let mut used_text = format!("Used {}.", item_name);
                    if heal > 0 { used_text += &format!(" Healed {} HP.", heal); }
                    if mp_heal > 0 { used_text += &format!(" Restored {} MP.", mp_heal); }
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "System", "text": used_text, "channel": "system" }
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
        _ => {
            warn!("Unknown UseItem action: {}", action);
        }
    }
}

/// Calculate the gold value of an item based on type, level, and rarity.
fn item_gold_value(item: &Item) -> u64 {
    let base: u64 = match item.item_type {
        ItemType::Weapon => 15,
        ItemType::Armor => 12,
        ItemType::Consumable => 5,
        ItemType::Material => 3,
        ItemType::Misc => 2,
    };
    let level_mult = 1 + item.level as u64 * 3;
    let rarity_mult: u64 = match item.rarity {
        0 => 1,
        1 => 2,
        2 => 4,
        3 => 8,
        4 => 16,
        _ => 1,
    };
    (base * level_mult * rarity_mult).max(1)
}

/// Simple crafting: match recipe ID, check materials in inventory, consume, produce result.
fn handle_craft(state: &Arc<AppState>, player_id: Uuid, recipe_id: &str) {
    // Authoritative server-side recipe definitions.
    struct Recipe {
        id: &'static str,
        name: &'static str,
        materials: &'static [(&'static str, u32)], // (template_id, quantity)
        level_required: u32,
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
            level_required: 1,
            result_name: "Iron Sword", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 0, result_level: 1, result_stat_key: "ATK", result_stat_val: 8 },
        Recipe { id: "iron_shield", name: "Iron Shield", materials: &[("iron_ore", 4)],
            level_required: 1,
            result_name: "Iron Shield", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 0, result_level: 1, result_stat_key: "DEF", result_stat_val: 6 },
        Recipe { id: "health_potion", name: "Health Potion", materials: &[("herb", 2)],
            level_required: 1,
            result_name: "Health Potion", result_type: "consumable", result_slot: None,
            result_rarity: 0, result_level: 1, result_stat_key: "HP", result_stat_val: 50 },
        Recipe { id: "leather_armor", name: "Leather Armor", materials: &[("leather", 3), ("iron_ore", 1)],
            level_required: 3,
            result_name: "Leather Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 0, result_level: 3, result_stat_key: "DEF", result_stat_val: 10 },
        Recipe { id: "steel_sword", name: "Steel Sword", materials: &[("iron_ore", 5), ("coal", 2)],
            level_required: 5,
            result_name: "Steel Sword", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 1, result_level: 5, result_stat_key: "ATK", result_stat_val: 18 },
        Recipe { id: "gold_ring", name: "Gold Ring", materials: &[("gold_ore", 2)],
            level_required: 5,
            result_name: "Gold Ring", result_type: "armor", result_slot: Some("ring1"),
            result_rarity: 1, result_level: 5, result_stat_key: "LCK", result_stat_val: 5 },
        // --- Tier 1 extras ---
        Recipe { id: "wooden_bow", name: "Wooden Bow", materials: &[("wood", 4), ("leather", 1)],
            level_required: 1,
            result_name: "Wooden Bow", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 0, result_level: 1, result_stat_key: "ATK", result_stat_val: 6 },
        Recipe { id: "leather_boots", name: "Leather Boots", materials: &[("leather", 2)],
            level_required: 1,
            result_name: "Leather Boots", result_type: "armor", result_slot: Some("boots"),
            result_rarity: 0, result_level: 1, result_stat_key: "DEF", result_stat_val: 3 },
        Recipe { id: "leather_cap", name: "Leather Cap", materials: &[("leather", 2)],
            level_required: 1,
            result_name: "Leather Cap", result_type: "armor", result_slot: Some("helmet"),
            result_rarity: 0, result_level: 1, result_stat_key: "DEF", result_stat_val: 4 },
        Recipe { id: "herb_salve", name: "Herb Salve", materials: &[("herb", 3), ("leather", 1)],
            level_required: 2,
            result_name: "Herb Salve", result_type: "consumable", result_slot: None,
            result_rarity: 0, result_level: 2, result_stat_key: "HP", result_stat_val: 80 },
        // --- Tier 2 extras ---
        Recipe { id: "steel_armor", name: "Steel Armor", materials: &[("iron_ore", 6), ("coal", 3), ("leather", 2)],
            level_required: 5,
            result_name: "Steel Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 1, result_level: 5, result_stat_key: "DEF", result_stat_val: 22 },
        Recipe { id: "steel_shield", name: "Steel Shield", materials: &[("iron_ore", 5), ("coal", 2)],
            level_required: 5,
            result_name: "Steel Shield", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 1, result_level: 5, result_stat_key: "DEF", result_stat_val: 14 },
        Recipe { id: "hunter_legs", name: "Hunter Leggings", materials: &[("leather", 4), ("iron_ore", 2)],
            level_required: 5,
            result_name: "Hunter Leggings", result_type: "armor", result_slot: Some("legs"),
            result_rarity: 1, result_level: 5, result_stat_key: "DEF", result_stat_val: 10 },
        Recipe { id: "silver_amulet", name: "Silver Amulet", materials: &[("gold_ore", 1), ("iron_ore", 2), ("gem_shard", 1)],
            level_required: 5,
            result_name: "Silver Amulet", result_type: "armor", result_slot: Some("amulet"),
            result_rarity: 1, result_level: 5, result_stat_key: "DEF", result_stat_val: 4 },
        Recipe { id: "greater_health_potion", name: "Greater Health Potion", materials: &[("herb", 4), ("gem_shard", 1)],
            level_required: 5,
            result_name: "Greater Health Potion", result_type: "consumable", result_slot: None,
            result_rarity: 1, result_level: 5, result_stat_key: "HP", result_stat_val: 150 },
        Recipe { id: "iron_helm", name: "Iron Helm", materials: &[("iron_ore", 4), ("coal", 1)],
            level_required: 5,
            result_name: "Iron Helm", result_type: "armor", result_slot: Some("helmet"),
            result_rarity: 1, result_level: 5, result_stat_key: "DEF", result_stat_val: 9 },
        // --- Tier 3: Advanced (Level 10) ---
        Recipe { id: "mithril_blade", name: "Mithril Blade", materials: &[("mithril_ore", 4), ("coal", 3), ("gold_ore", 1)],
            level_required: 10,
            result_name: "Mithril Blade", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 2, result_level: 10, result_stat_key: "ATK", result_stat_val: 32 },
        Recipe { id: "mithril_armor", name: "Mithril Armor", materials: &[("mithril_ore", 6), ("leather", 3), ("coal", 4)],
            level_required: 10,
            result_name: "Mithril Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 2, result_level: 10, result_stat_key: "DEF", result_stat_val: 38 },
        Recipe { id: "enchanted_cape", name: "Enchanted Cape", materials: &[("silk", 3), ("gem_shard", 2), ("gold_ore", 1)],
            level_required: 10,
            result_name: "Enchanted Cape", result_type: "armor", result_slot: Some("cape"),
            result_rarity: 2, result_level: 10, result_stat_key: "DEF", result_stat_val: 8 },
        Recipe { id: "gold_amulet", name: "Gold Amulet", materials: &[("gold_ore", 4), ("gem_shard", 2)],
            level_required: 10,
            result_name: "Gold Amulet", result_type: "armor", result_slot: Some("amulet"),
            result_rarity: 2, result_level: 10, result_stat_key: "LCK", result_stat_val: 8 },
        Recipe { id: "elixir_of_vitality", name: "Elixir of Vitality", materials: &[("herb", 6), ("gem_shard", 2), ("mithril_ore", 1)],
            level_required: 10,
            result_name: "Elixir of Vitality", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 10, result_stat_key: "HP", result_stat_val: 300 },
        Recipe { id: "emerald_ring", name: "Emerald Ring", materials: &[("gold_ore", 2), ("gem_shard", 3)],
            level_required: 10,
            result_name: "Emerald Ring", result_type: "armor", result_slot: Some("ring1"),
            result_rarity: 2, result_level: 10, result_stat_key: "LCK", result_stat_val: 10 },
        Recipe { id: "mithril_boots", name: "Mithril Boots", materials: &[("mithril_ore", 3), ("leather", 2)],
            level_required: 10,
            result_name: "Mithril Boots", result_type: "armor", result_slot: Some("boots"),
            result_rarity: 2, result_level: 10, result_stat_key: "DEF", result_stat_val: 12 },
        // --- Tier 4: Expert (Level 15) ---
        Recipe { id: "dragon_sword", name: "Dragon Sword", materials: &[("dragon_scale", 3), ("mithril_ore", 4), ("coal", 5)],
            level_required: 15,
            result_name: "Dragon Sword", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 3, result_level: 15, result_stat_key: "ATK", result_stat_val: 52 },
        Recipe { id: "dragon_armor", name: "Dragon Armor", materials: &[("dragon_scale", 5), ("mithril_ore", 3), ("silk", 2)],
            level_required: 15,
            result_name: "Dragon Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 3, result_level: 15, result_stat_key: "DEF", result_stat_val: 55 },
        Recipe { id: "phoenix_ring", name: "Phoenix Ring", materials: &[("dragon_scale", 2), ("gem_shard", 4), ("gold_ore", 3)],
            level_required: 15,
            result_name: "Phoenix Ring", result_type: "armor", result_slot: Some("ring1"),
            result_rarity: 3, result_level: 15, result_stat_key: "LCK", result_stat_val: 15 },
        Recipe { id: "supreme_elixir", name: "Supreme Elixir", materials: &[("herb", 8), ("dragon_scale", 1), ("gem_shard", 3)],
            level_required: 15,
            result_name: "Supreme Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 15, result_stat_key: "HP", result_stat_val: 500 },
        // --- Tier 5: Adamantite (Level 20) ---
        Recipe { id: "adamantite_sword", name: "Adamantite Sword", materials: &[("adamantite_ore", 5), ("coal", 4)],
            level_required: 20,
            result_name: "Adamantite Sword", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 2, result_level: 20, result_stat_key: "ATK", result_stat_val: 75 },
        Recipe { id: "adamantite_armor", name: "Adamantite Armor", materials: &[("adamantite_ore", 7), ("leather", 3), ("coal", 4)],
            level_required: 20,
            result_name: "Adamantite Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 2, result_level: 20, result_stat_key: "DEF", result_stat_val: 68 },
        Recipe { id: "adamantite_shield", name: "Adamantite Shield", materials: &[("adamantite_ore", 5), ("iron_ore", 3)],
            level_required: 20,
            result_name: "Adamantite Shield", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 2, result_level: 20, result_stat_key: "DEF", result_stat_val: 42 },
        Recipe { id: "adamantite_helm", name: "Adamantite Helm", materials: &[("adamantite_ore", 4), ("coal", 2)],
            level_required: 20,
            result_name: "Adamantite Helm", result_type: "armor", result_slot: Some("helmet"),
            result_rarity: 2, result_level: 20, result_stat_key: "DEF", result_stat_val: 30 },
        Recipe { id: "adamantite_greaves", name: "Adamantite Greaves", materials: &[("adamantite_ore", 4), ("leather", 3)],
            level_required: 20,
            result_name: "Adamantite Greaves", result_type: "armor", result_slot: Some("legs"),
            result_rarity: 2, result_level: 20, result_stat_key: "DEF", result_stat_val: 35 },
        Recipe { id: "adamantite_boots", name: "Adamantite Boots", materials: &[("adamantite_ore", 3), ("leather", 2)],
            level_required: 20,
            result_name: "Adamantite Boots", result_type: "armor", result_slot: Some("boots"),
            result_rarity: 2, result_level: 20, result_stat_key: "DEF", result_stat_val: 22 },
        Recipe { id: "shadow_dagger", name: "Shadow Dagger", materials: &[("shadow_essence", 3), ("mithril_ore", 4)],
            level_required: 20,
            result_name: "Shadow Dagger", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 3, result_level: 20, result_stat_key: "ATK", result_stat_val: 65 },
        Recipe { id: "shadow_ring", name: "Shadow Ring", materials: &[("shadow_essence", 2), ("gem_shard", 4), ("gold_ore", 2)],
            level_required: 20,
            result_name: "Shadow Ring", result_type: "armor", result_slot: Some("ring1"),
            result_rarity: 3, result_level: 20, result_stat_key: "LCK", result_stat_val: 18 },
        Recipe { id: "void_amulet", name: "Void Amulet", materials: &[("void_shard", 2), ("gem_shard", 3), ("gold_ore", 2)],
            level_required: 20,
            result_name: "Void Amulet", result_type: "armor", result_slot: Some("amulet"),
            result_rarity: 3, result_level: 20, result_stat_key: "DEF", result_stat_val: 15 },
        Recipe { id: "mega_elixir", name: "Mega Elixir", materials: &[("herb", 10), ("dragon_scale", 2), ("gem_shard", 4)],
            level_required: 20,
            result_name: "Mega Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 20, result_stat_key: "HP", result_stat_val: 800 },
        Recipe { id: "mana_potion", name: "Mana Potion", materials: &[("herb", 5), ("gem_shard", 3)],
            level_required: 20,
            result_name: "Mana Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 20, result_stat_key: "MP", result_stat_val: 100 },
        Recipe { id: "shadow_cape", name: "Shadow Cape", materials: &[("shadow_essence", 3), ("silk", 4), ("gem_shard", 2)],
            level_required: 20,
            result_name: "Shadow Cape", result_type: "armor", result_slot: Some("cape"),
            result_rarity: 3, result_level: 20, result_stat_key: "DEF", result_stat_val: 18 },
        // --- Tier 6: Void (Level 30) ---
        Recipe { id: "void_blade", name: "Void Blade", materials: &[("void_shard", 6), ("adamantite_ore", 4), ("chaos_crystal", 2)],
            level_required: 30,
            result_name: "Void Blade", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 3, result_level: 30, result_stat_key: "ATK", result_stat_val: 110 },
        Recipe { id: "void_plate", name: "Void Plate Armor", materials: &[("void_shard", 8), ("adamantite_ore", 5), ("shadow_essence", 3)],
            level_required: 30,
            result_name: "Void Plate Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 3, result_level: 30, result_stat_key: "DEF", result_stat_val: 98 },
        Recipe { id: "void_helm", name: "Void Helm", materials: &[("void_shard", 4), ("adamantite_ore", 3)],
            level_required: 30,
            result_name: "Void Helm", result_type: "armor", result_slot: Some("helmet"),
            result_rarity: 3, result_level: 30, result_stat_key: "DEF", result_stat_val: 48 },
        Recipe { id: "void_greaves", name: "Void Greaves", materials: &[("void_shard", 5), ("shadow_essence", 3)],
            level_required: 30,
            result_name: "Void Greaves", result_type: "armor", result_slot: Some("legs"),
            result_rarity: 3, result_level: 30, result_stat_key: "DEF", result_stat_val: 55 },
        Recipe { id: "void_boots", name: "Void Boots", materials: &[("void_shard", 3), ("shadow_essence", 2), ("leather", 3)],
            level_required: 30,
            result_name: "Void Boots", result_type: "armor", result_slot: Some("boots"),
            result_rarity: 3, result_level: 30, result_stat_key: "DEF", result_stat_val: 35 },
        Recipe { id: "void_aegis", name: "Void Aegis", materials: &[("void_shard", 6), ("adamantite_ore", 4)],
            level_required: 30,
            result_name: "Void Aegis", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 3, result_level: 30, result_stat_key: "DEF", result_stat_val: 65 },
        Recipe { id: "chaos_scepter", name: "Chaos Scepter", materials: &[("chaos_crystal", 4), ("void_shard", 3), ("gem_shard", 5)],
            level_required: 30,
            result_name: "Chaos Scepter", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 3, result_level: 30, result_stat_key: "ATK", result_stat_val: 95 },
        Recipe { id: "phoenix_ring_t6", name: "Rebirth Ring", materials: &[("phoenix_ash", 3), ("gold_ore", 5), ("gem_shard", 4)],
            level_required: 30,
            result_name: "Rebirth Ring", result_type: "armor", result_slot: Some("ring1"),
            result_rarity: 3, result_level: 30, result_stat_key: "LCK", result_stat_val: 25 },
        Recipe { id: "primordial_amulet", name: "Primordial Amulet", materials: &[("primordial_core", 2), ("void_shard", 3), ("gold_ore", 4)],
            level_required: 30,
            result_name: "Primordial Amulet", result_type: "armor", result_slot: Some("amulet"),
            result_rarity: 3, result_level: 30, result_stat_key: "DEF", result_stat_val: 25 },
        Recipe { id: "void_cape", name: "Void Mantle", materials: &[("void_shard", 4), ("shadow_essence", 4), ("silk", 3)],
            level_required: 30,
            result_name: "Void Mantle", result_type: "armor", result_slot: Some("cape"),
            result_rarity: 3, result_level: 30, result_stat_key: "DEF", result_stat_val: 30 },
        Recipe { id: "divine_elixir", name: "Divine Elixir", materials: &[("herb", 12), ("phoenix_ash", 2), ("primordial_core", 1)],
            level_required: 30,
            result_name: "Divine Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 30, result_stat_key: "HP", result_stat_val: 1200 },
        Recipe { id: "arcane_draught", name: "Arcane Draught", materials: &[("herb", 8), ("chaos_crystal", 1), ("gem_shard", 5)],
            level_required: 30,
            result_name: "Arcane Draught", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 30, result_stat_key: "MP", result_stat_val: 250 },
        // --- Tier 7: Celestial (Level 40) ---
        Recipe { id: "celestial_blade", name: "Celestial Blade", materials: &[("celestial_dust", 6), ("star_fragment", 3), ("adamantite_ore", 5)],
            level_required: 40,
            result_name: "Celestial Blade", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 4, result_level: 40, result_stat_key: "ATK", result_stat_val: 165 },
        Recipe { id: "celestial_armor", name: "Celestial Armor", materials: &[("celestial_dust", 8), ("star_fragment", 4), ("void_shard", 4)],
            level_required: 40,
            result_name: "Celestial Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 4, result_level: 40, result_stat_key: "DEF", result_stat_val: 145 },
        Recipe { id: "celestial_crown", name: "Celestial Crown", materials: &[("celestial_dust", 4), ("star_fragment", 2), ("gold_ore", 4)],
            level_required: 40,
            result_name: "Celestial Crown", result_type: "armor", result_slot: Some("helmet"),
            result_rarity: 4, result_level: 40, result_stat_key: "DEF", result_stat_val: 72 },
        Recipe { id: "celestial_greaves", name: "Celestial Greaves", materials: &[("celestial_dust", 5), ("star_fragment", 3)],
            level_required: 40,
            result_name: "Celestial Greaves", result_type: "armor", result_slot: Some("legs"),
            result_rarity: 4, result_level: 40, result_stat_key: "DEF", result_stat_val: 85 },
        Recipe { id: "celestial_sandals", name: "Celestial Sandals", materials: &[("celestial_dust", 3), ("star_fragment", 2), ("silk", 3)],
            level_required: 40,
            result_name: "Celestial Sandals", result_type: "armor", result_slot: Some("boots"),
            result_rarity: 4, result_level: 40, result_stat_key: "DEF", result_stat_val: 50 },
        Recipe { id: "celestial_ward", name: "Celestial Ward", materials: &[("celestial_dust", 6), ("star_fragment", 4)],
            level_required: 40,
            result_name: "Celestial Ward", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 4, result_level: 40, result_stat_key: "DEF", result_stat_val: 95 },
        Recipe { id: "ancient_warhammer", name: "Ancient Warhammer", materials: &[("ancient_relic", 4), ("adamantite_ore", 6), ("primordial_core", 2)],
            level_required: 40,
            result_name: "Ancient Warhammer", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 4, result_level: 40, result_stat_key: "ATK", result_stat_val: 185 },
        Recipe { id: "star_ring", name: "Star Ring", materials: &[("star_fragment", 3), ("celestial_dust", 2), ("gem_shard", 6)],
            level_required: 40,
            result_name: "Star Ring", result_type: "armor", result_slot: Some("ring1"),
            result_rarity: 4, result_level: 40, result_stat_key: "LCK", result_stat_val: 35 },
        Recipe { id: "celestial_talisman", name: "Celestial Talisman", materials: &[("celestial_dust", 3), ("star_fragment", 3), ("gold_ore", 6)],
            level_required: 40,
            result_name: "Celestial Talisman", result_type: "armor", result_slot: Some("amulet"),
            result_rarity: 4, result_level: 40, result_stat_key: "DEF", result_stat_val: 35 },
        Recipe { id: "celestial_wings", name: "Celestial Wings", materials: &[("celestial_dust", 5), ("star_fragment", 3), ("silk", 4)],
            level_required: 40,
            result_name: "Celestial Wings", result_type: "armor", result_slot: Some("cape"),
            result_rarity: 4, result_level: 40, result_stat_key: "DEF", result_stat_val: 40 },
        Recipe { id: "nectar_of_gods", name: "Nectar of the Gods", materials: &[("herb", 15), ("celestial_dust", 2), ("star_fragment", 1), ("phoenix_ash", 2)],
            level_required: 40,
            result_name: "Nectar of the Gods", result_type: "consumable", result_slot: None,
            result_rarity: 4, result_level: 40, result_stat_key: "HP", result_stat_val: 2000 },
        Recipe { id: "astral_essence", name: "Astral Essence", materials: &[("celestial_dust", 2), ("gem_shard", 6), ("primordial_core", 1)],
            level_required: 40,
            result_name: "Astral Essence", result_type: "consumable", result_slot: None,
            result_rarity: 4, result_level: 40, result_stat_key: "MP", result_stat_val: 500 },
        Recipe { id: "diamond_ring", name: "Diamond Ring", materials: &[("star_fragment", 2), ("gold_ore", 5), ("gem_shard", 8)],
            level_required: 40,
            result_name: "Diamond Ring", result_type: "armor", result_slot: Some("ring2"),
            result_rarity: 4, result_level: 40, result_stat_key: "LCK", result_stat_val: 28 },
        // --- Tier 8: Mythic (Level 50) ---
        Recipe { id: "godslayer", name: "Godslayer", materials: &[("mythic_ingot", 8), ("soul_fragment", 4), ("star_fragment", 5)],
            level_required: 50,
            result_name: "Godslayer", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 5, result_level: 50, result_stat_key: "ATK", result_stat_val: 250 },
        Recipe { id: "titan_armor", name: "Titan Armor", materials: &[("titan_bone", 8), ("mythic_ingot", 6), ("celestial_dust", 4)],
            level_required: 50,
            result_name: "Titan Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 5, result_level: 50, result_stat_key: "DEF", result_stat_val: 220 },
        Recipe { id: "titan_helm", name: "Titan Helm", materials: &[("titan_bone", 5), ("mythic_ingot", 3)],
            level_required: 50,
            result_name: "Titan Helm", result_type: "armor", result_slot: Some("helmet"),
            result_rarity: 5, result_level: 50, result_stat_key: "DEF", result_stat_val: 110 },
        Recipe { id: "titan_greaves", name: "Titan Greaves", materials: &[("titan_bone", 6), ("mythic_ingot", 4)],
            level_required: 50,
            result_name: "Titan Greaves", result_type: "armor", result_slot: Some("legs"),
            result_rarity: 5, result_level: 50, result_stat_key: "DEF", result_stat_val: 130 },
        Recipe { id: "titan_boots", name: "Titan Boots", materials: &[("titan_bone", 4), ("mythic_ingot", 3), ("celestial_dust", 2)],
            level_required: 50,
            result_name: "Titan Boots", result_type: "armor", result_slot: Some("boots"),
            result_rarity: 5, result_level: 50, result_stat_key: "DEF", result_stat_val: 75 },
        Recipe { id: "titan_bulwark", name: "Titan Bulwark", materials: &[("titan_bone", 7), ("mythic_ingot", 5)],
            level_required: 50,
            result_name: "Titan Bulwark", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 5, result_level: 50, result_stat_key: "DEF", result_stat_val: 150 },
        Recipe { id: "soul_reaper", name: "Soul Reaper", materials: &[("soul_fragment", 6), ("mythic_ingot", 4), ("void_shard", 5)],
            level_required: 50,
            result_name: "Soul Reaper", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 5, result_level: 50, result_stat_key: "ATK", result_stat_val: 230 },
        Recipe { id: "eternity_ring", name: "Ring of Eternity", materials: &[("soul_fragment", 3), ("star_fragment", 4), ("mythic_ingot", 2)],
            level_required: 50,
            result_name: "Ring of Eternity", result_type: "armor", result_slot: Some("ring1"),
            result_rarity: 5, result_level: 50, result_stat_key: "LCK", result_stat_val: 50 },
        Recipe { id: "worlds_heart", name: "Heart of the World", materials: &[("soul_fragment", 4), ("titan_bone", 3), ("celestial_dust", 4)],
            level_required: 50,
            result_name: "Heart of the World", result_type: "armor", result_slot: Some("amulet"),
            result_rarity: 5, result_level: 50, result_stat_key: "DEF", result_stat_val: 50 },
        Recipe { id: "dragon_god_cape", name: "Dragon God Cape", materials: &[("dragon_scale", 8), ("mythic_ingot", 4), ("soul_fragment", 3)],
            level_required: 50,
            result_name: "Dragon God Cape", result_type: "armor", result_slot: Some("cape"),
            result_rarity: 5, result_level: 50, result_stat_key: "DEF", result_stat_val: 60 },
        Recipe { id: "ambrosia", name: "Ambrosia", materials: &[("herb", 20), ("soul_fragment", 2), ("celestial_dust", 3), ("mythic_ingot", 1)],
            level_required: 50,
            result_name: "Ambrosia", result_type: "consumable", result_slot: None,
            result_rarity: 5, result_level: 50, result_stat_key: "HP", result_stat_val: 5000 },
        Recipe { id: "philosophers_draught", name: "Philosopher's Draught", materials: &[("soul_fragment", 2), ("star_fragment", 2), ("primordial_core", 2)],
            level_required: 50,
            result_name: "Philosopher's Draught", result_type: "consumable", result_slot: None,
            result_rarity: 5, result_level: 50, result_stat_key: "MP", result_stat_val: 1000 },
        Recipe { id: "infinity_band", name: "Infinity Band", materials: &[("mythic_ingot", 3), ("soul_fragment", 3), ("star_fragment", 3)],
            level_required: 50,
            result_name: "Infinity Band", result_type: "armor", result_slot: Some("ring2"),
            result_rarity: 5, result_level: 50, result_stat_key: "LCK", result_stat_val: 45 },
        // --- Effect Potions ---
        Recipe { id: "antidote", name: "Antidote", materials: &[("herb", 3), ("leather", 1)],
            level_required: 3,
            result_name: "Antidote", result_type: "consumable", result_slot: None,
            result_rarity: 0, result_level: 3, result_stat_key: "CURE_POISON", result_stat_val: 1 },
        Recipe { id: "fire_ward_potion", name: "Fire Ward Potion", materials: &[("herb", 4), ("iron_ore", 2)],
            level_required: 5,
            result_name: "Fire Ward Potion", result_type: "consumable", result_slot: None,
            result_rarity: 1, result_level: 5, result_stat_key: "CURE_BURN", result_stat_val: 1 },
        Recipe { id: "regen_potion", name: "Regeneration Potion", materials: &[("herb", 5), ("gem_shard", 1)],
            level_required: 8,
            result_name: "Regeneration Potion", result_type: "consumable", result_slot: None,
            result_rarity: 1, result_level: 8, result_stat_key: "REGEN", result_stat_val: 10 },
        Recipe { id: "strength_potion", name: "Strength Potion", materials: &[("herb", 4), ("iron_ore", 3), ("coal", 1)],
            level_required: 10,
            result_name: "Strength Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 10, result_stat_key: "STRENGTH", result_stat_val: 15 },
        Recipe { id: "haste_potion", name: "Haste Potion", materials: &[("herb", 4), ("silk", 2)],
            level_required: 10,
            result_name: "Haste Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 10, result_stat_key: "HASTE", result_stat_val: 1 },
        Recipe { id: "shield_potion", name: "Shield Potion", materials: &[("herb", 6), ("mithril_ore", 2), ("gem_shard", 2)],
            level_required: 15,
            result_name: "Shield Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 15, result_stat_key: "SHIELD", result_stat_val: 100 },
        Recipe { id: "greater_regen_potion", name: "Greater Regen Potion", materials: &[("herb", 8), ("gem_shard", 3), ("mithril_ore", 1)],
            level_required: 15,
            result_name: "Greater Regen Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 15, result_stat_key: "REGEN", result_stat_val: 25 },
        Recipe { id: "titans_draught", name: "Titan's Draught", materials: &[("herb", 10), ("dragon_scale", 2), ("primordial_core", 1)],
            level_required: 25,
            result_name: "Titan's Draught", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 25, result_stat_key: "STRENGTH", result_stat_val: 35 },
        Recipe { id: "invulnerability_elixir", name: "Invulnerability Elixir", materials: &[("celestial_dust", 3), ("star_fragment", 2), ("soul_fragment", 1)],
            level_required: 45,
            result_name: "Invulnerability Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 4, result_level: 45, result_stat_key: "INVULN", result_stat_val: 1 },
        Recipe { id: "frost_resistance_elixir", name: "Frost Resistance Elixir", materials: &[("herb", 5), ("mithril_ore", 1)],
            level_required: 8,
            result_name: "Frost Resistance Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 1, result_level: 8, result_stat_key: "CURE_FREEZE", result_stat_val: 1 },
        Recipe { id: "bandage", name: "Bandage", materials: &[("leather", 2), ("herb", 1)],
            level_required: 2,
            result_name: "Bandage", result_type: "consumable", result_slot: None,
            result_rarity: 0, result_level: 2, result_stat_key: "CURE_BLEED", result_stat_val: 1 },
        Recipe { id: "smelling_salts", name: "Smelling Salts", materials: &[("herb", 6), ("gem_shard", 1)],
            level_required: 10,
            result_name: "Smelling Salts", result_type: "consumable", result_slot: None,
            result_rarity: 1, result_level: 10, result_stat_key: "CURE_STUN", result_stat_val: 1 },
        Recipe { id: "thorns_potion", name: "Thorns Potion", materials: &[("herb", 6), ("iron_ore", 4), ("gem_shard", 2)],
            level_required: 12,
            result_name: "Thorns Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 12, result_stat_key: "THORNS", result_stat_val: 20 },
        Recipe { id: "lifesteal_elixir", name: "Lifesteal Elixir", materials: &[("herb", 8), ("blood_ruby", 2), ("mithril_ore", 1)],
            level_required: 20,
            result_name: "Lifesteal Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 20, result_stat_key: "LIFESTEAL", result_stat_val: 15 },
        Recipe { id: "greater_shield_potion", name: "Greater Shield Potion", materials: &[("adamantite_ore", 3), ("gem_shard", 4), ("dragon_scale", 1)],
            level_required: 25,
            result_name: "Greater Shield Potion", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 25, result_stat_key: "SHIELD", result_stat_val: 250 },
        Recipe { id: "greater_haste_potion", name: "Greater Haste Potion", materials: &[("silk", 4), ("mithril_ore", 2), ("gem_shard", 2)],
            level_required: 15,
            result_name: "Greater Haste Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 15, result_stat_key: "HASTE", result_stat_val: 1 },
        // ─── Void Set Recipes (End-game) ───
        Recipe { id: "void_mask", name: "Void Mask", materials: &[("primordial_core", 3), ("soul_fragment", 4), ("adamantite_ore", 5)],
            level_required: 30,
            result_name: "Void Mask", result_type: "armor", result_slot: Some("head"),
            result_rarity: 4, result_level: 30, result_stat_key: "DEF", result_stat_val: 28 },
        Recipe { id: "void_cuirass", name: "Void Cuirass", materials: &[("primordial_core", 4), ("soul_fragment", 5), ("adamantite_ore", 8)],
            level_required: 30,
            result_name: "Void Cuirass", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 4, result_level: 30, result_stat_key: "DEF", result_stat_val: 35 },
        Recipe { id: "void_tassets", name: "Void Tassets", materials: &[("primordial_core", 2), ("soul_fragment", 3), ("adamantite_ore", 6)],
            level_required: 30,
            result_name: "Void Tassets", result_type: "armor", result_slot: Some("legs"),
            result_rarity: 4, result_level: 30, result_stat_key: "DEF", result_stat_val: 25 },
        Recipe { id: "void_boots", name: "Void Boots", materials: &[("primordial_core", 2), ("soul_fragment", 2), ("adamantite_ore", 4)],
            level_required: 30,
            result_name: "Void Boots", result_type: "armor", result_slot: Some("boots"),
            result_rarity: 4, result_level: 30, result_stat_key: "SPD", result_stat_val: 15 },
        Recipe { id: "void_aegis", name: "Void Aegis", materials: &[("primordial_core", 5), ("soul_fragment", 6), ("dragon_scale", 4)],
            level_required: 30,
            result_name: "Void Aegis", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 4, result_level: 30, result_stat_key: "DEF", result_stat_val: 30 },
        // ─── Celestial Set Recipes (Mage) ───
        Recipe { id: "celestial_circlet", name: "Celestial Circlet", materials: &[("celestial_dust", 4), ("star_fragment", 3), ("gem_shard", 5)],
            level_required: 25,
            result_name: "Celestial Circlet", result_type: "armor", result_slot: Some("head"),
            result_rarity: 3, result_level: 25, result_stat_key: "MP", result_stat_val: 30 },
        Recipe { id: "celestial_robe", name: "Celestial Robe", materials: &[("celestial_dust", 6), ("silk", 5), ("star_fragment", 4)],
            level_required: 25,
            result_name: "Celestial Robe", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 3, result_level: 25, result_stat_key: "MP", result_stat_val: 40 },
        Recipe { id: "celestial_ward", name: "Celestial Ward", materials: &[("celestial_dust", 3), ("star_fragment", 5), ("gem_shard", 4)],
            level_required: 25,
            result_name: "Celestial Ward", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 3, result_level: 25, result_stat_key: "DEF", result_stat_val: 20 },
        // ─── Shadow Set Recipes (Rogue) ───
        Recipe { id: "shadow_vestments", name: "Shadow Vestments", materials: &[("silk", 8), ("leather", 5), ("soul_fragment", 2)],
            level_required: 25,
            result_name: "Shadow Vestments", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 3, result_level: 25, result_stat_key: "SPD", result_stat_val: 12 },
        Recipe { id: "shadow_cloak", name: "Shadow Cloak", materials: &[("silk", 6), ("soul_fragment", 3), ("leather", 4)],
            level_required: 25,
            result_name: "Shadow Cloak", result_type: "armor", result_slot: Some("cape"),
            result_rarity: 3, result_level: 25, result_stat_key: "LCK", result_stat_val: 15 },
        // ─── Legendary Weapons ───
        Recipe { id: "worldbreaker", name: "Worldbreaker", materials: &[("primordial_core", 6), ("dragon_scale", 8), ("adamantite_ore", 10)],
            level_required: 35,
            result_name: "Worldbreaker", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 5, result_level: 35, result_stat_key: "ATK", result_stat_val: 50 },
        Recipe { id: "soulreaver", name: "Soulreaver", materials: &[("soul_fragment", 8), ("primordial_core", 4), ("blood_ruby", 5)],
            level_required: 35,
            result_name: "Soulreaver", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 5, result_level: 35, result_stat_key: "ATK", result_stat_val: 45 },
        Recipe { id: "starfall_staff", name: "Starfall Staff", materials: &[("star_fragment", 8), ("celestial_dust", 6), ("primordial_core", 3)],
            level_required: 35,
            result_name: "Starfall Staff", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 5, result_level: 35, result_stat_key: "ATK", result_stat_val: 42 },
        // ─── Accessories ───
        Recipe { id: "ring_of_power", name: "Ring of Power", materials: &[("gem_shard", 8), ("blood_ruby", 3), ("mithril_ore", 4)],
            level_required: 20,
            result_name: "Ring of Power", result_type: "accessory", result_slot: Some("ring"),
            result_rarity: 3, result_level: 20, result_stat_key: "ATK", result_stat_val: 12 },
        Recipe { id: "amulet_of_protection", name: "Amulet of Protection", materials: &[("gem_shard", 6), ("adamantite_ore", 3), ("celestial_dust", 2)],
            level_required: 20,
            result_name: "Amulet of Protection", result_type: "accessory", result_slot: Some("amulet"),
            result_rarity: 3, result_level: 20, result_stat_key: "DEF", result_stat_val: 15 },
        Recipe { id: "lucky_charm", name: "Lucky Charm", materials: &[("gem_shard", 10), ("star_fragment", 2)],
            level_required: 15,
            result_name: "Lucky Charm", result_type: "accessory", result_slot: Some("ring"),
            result_rarity: 2, result_level: 15, result_stat_key: "LCK", result_stat_val: 10 },
        // ─── Enchanting Stones from materials ───
        Recipe { id: "craft_enchanting_stone", name: "Enchanting Stone", materials: &[("gem_shard", 5), ("mithril_ore", 2)],
            level_required: 10,
            result_name: "Enchanting Stone", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 10, result_stat_key: "ENCHANT", result_stat_val: 1 },
        // ─── New Elixirs & Buff Potions ───
        Recipe { id: "speed_elixir", name: "Speed Elixir", materials: &[("herb", 4), ("silk", 2), ("gem_shard", 1)],
            level_required: 10,
            result_name: "Speed Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 10, result_stat_key: "HASTE", result_stat_val: 1 },
        Recipe { id: "defense_elixir", name: "Defense Elixir", materials: &[("herb", 5), ("iron_ore", 3), ("gem_shard", 1)],
            level_required: 12,
            result_name: "Defense Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 12, result_stat_key: "SHIELD", result_stat_val: 80 },
        Recipe { id: "berserker_draught", name: "Berserker Draught", materials: &[("herb", 6), ("dragon_scale", 1), ("gem_shard", 2)],
            level_required: 15,
            result_name: "Berserker Draught", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 15, result_stat_key: "STRENGTH", result_stat_val: 25 },
        Recipe { id: "scroll_town_portal", name: "Scroll of Town Portal", materials: &[("herb", 3), ("gem_shard", 2)],
            level_required: 8,
            result_name: "Scroll of Town Portal", result_type: "consumable", result_slot: None,
            result_rarity: 1, result_level: 8, result_stat_key: "TELEPORT", result_stat_val: 1 },
        Recipe { id: "grilled_fish", name: "Grilled Fish", materials: &[("raw_fish", 1), ("wood", 1)],
            level_required: 1,
            result_name: "Grilled Fish", result_type: "consumable", result_slot: None,
            result_rarity: 0, result_level: 1, result_stat_key: "HP", result_stat_val: 40 },
        Recipe { id: "greater_mana_potion", name: "Greater Mana Potion", materials: &[("herb", 5), ("gem_shard", 2)],
            level_required: 10,
            result_name: "Greater Mana Potion", result_type: "consumable", result_slot: None,
            result_rarity: 1, result_level: 10, result_stat_key: "MP", result_stat_val: 75 },
        Recipe { id: "divine_health_potion", name: "Divine Health Potion", materials: &[("herb", 10), ("dragon_scale", 1), ("gem_shard", 3)],
            level_required: 20,
            result_name: "Divine Health Potion", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 20, result_stat_key: "HP", result_stat_val: 400 },
        Recipe { id: "elixir_of_experience", name: "Elixir of Experience", materials: &[("herb", 8), ("star_fragment", 1), ("celestial_dust", 1)],
            level_required: 20,
            result_name: "Elixir of Experience", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 20, result_stat_key: "XP_BOOST", result_stat_val: 1 },
        // ─── Phase 11: Advanced crafting recipes ───
        Recipe { id: "dragonscale_armor", name: "Dragonscale Armor", materials: &[("dragon_scale", 8), ("steel_bar", 5), ("gem_shard", 3)],
            level_required: 25,
            result_name: "Dragonscale Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 4, result_level: 25, result_stat_key: "DEF", result_stat_val: 35 },
        Recipe { id: "phoenix_feather_cape", name: "Phoenix Feather Cape", materials: &[("phoenix_feather", 3), ("silk_thread", 5), ("enchanting_stone", 2)],
            level_required: 22,
            result_name: "Phoenix Feather Cape", result_type: "armor", result_slot: Some("cape"),
            result_rarity: 4, result_level: 22, result_stat_key: "SPD", result_stat_val: 12 },
        Recipe { id: "titan_gauntlets", name: "Titan Gauntlets", materials: &[("steel_bar", 6), ("titan_shard", 2), ("enchanting_stone", 3)],
            level_required: 28,
            result_name: "Titan Gauntlets", result_type: "armor", result_slot: Some("gloves"),
            result_rarity: 4, result_level: 28, result_stat_key: "ATK", result_stat_val: 20 },
        Recipe { id: "archmage_staff", name: "Archmage Staff", materials: &[("arcane_crystal", 4), ("dragon_scale", 3), ("enchanting_stone", 5)],
            level_required: 30,
            result_name: "Archmage Staff", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 4, result_level: 30, result_stat_key: "ATK", result_stat_val: 32 },
        Recipe { id: "void_blade", name: "Void Blade", materials: &[("void_shard", 5), ("steel_bar", 4), ("enchanting_stone", 4)],
            level_required: 30,
            result_name: "Void Blade", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 4, result_level: 30, result_stat_key: "ATK", result_stat_val: 38 },
        Recipe { id: "guardian_shield", name: "Guardian Shield", materials: &[("steel_bar", 8), ("gem_shard", 5), ("dragon_scale", 2)],
            level_required: 20,
            result_name: "Guardian Shield", result_type: "armor", result_slot: Some("shield"),
            result_rarity: 3, result_level: 20, result_stat_key: "DEF", result_stat_val: 25 },
        Recipe { id: "moonstone_amulet", name: "Moonstone Amulet", materials: &[("gem_shard", 6), ("silk_thread", 3), ("star_fragment", 2)],
            level_required: 18,
            result_name: "Moonstone Amulet", result_type: "armor", result_slot: Some("amulet"),
            result_rarity: 3, result_level: 18, result_stat_key: "MP", result_stat_val: 35 },
        Recipe { id: "shadow_dagger", name: "Shadow Dagger", materials: &[("steel_bar", 3), ("shadow_essence", 4), ("enchanting_stone", 2)],
            level_required: 22,
            result_name: "Shadow Dagger", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 3, result_level: 22, result_stat_key: "ATK", result_stat_val: 25 },
        Recipe { id: "scroll_mass_heal", name: "Scroll of Mass Heal", materials: &[("herb", 10), ("holy_water", 2), ("blank_scroll", 3)],
            level_required: 20,
            result_name: "Scroll of Mass Heal", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 20, result_stat_key: "HP", result_stat_val: 200 },
        Recipe { id: "mithril_armor", name: "Mithril Armor", materials: &[("mithril_bar", 8), ("gem_shard", 4), ("enchanting_stone", 3)],
            level_required: 35,
            result_name: "Mithril Armor", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 4, result_level: 35, result_stat_key: "DEF", result_stat_val: 42 },
        Recipe { id: "mithril_sword", name: "Mithril Sword", materials: &[("mithril_bar", 6), ("gem_shard", 3), ("enchanting_stone", 2)],
            level_required: 35,
            result_name: "Mithril Sword", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 4, result_level: 35, result_stat_key: "ATK", result_stat_val: 40 },
        Recipe { id: "elven_longbow", name: "Elven Longbow", materials: &[("wood", 8), ("silk_thread", 4), ("enchanting_stone", 2)],
            level_required: 20,
            result_name: "Elven Longbow", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 3, result_level: 20, result_stat_key: "ATK", result_stat_val: 22 },
        Recipe { id: "thunder_hammer", name: "Thunder Hammer", materials: &[("steel_bar", 6), ("thunder_crystal", 3), ("enchanting_stone", 3)],
            level_required: 28,
            result_name: "Thunder Hammer", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 4, result_level: 28, result_stat_key: "ATK", result_stat_val: 30 },
        Recipe { id: "frost_ring", name: "Frost Ring", materials: &[("ice_crystal", 3), ("gem_shard", 4), ("enchanting_stone", 1)],
            level_required: 15,
            result_name: "Frost Ring", result_type: "armor", result_slot: Some("ring"),
            result_rarity: 2, result_level: 15, result_stat_key: "DEF", result_stat_val: 10 },
        Recipe { id: "fire_ring", name: "Fire Ring", materials: &[("fire_crystal", 3), ("gem_shard", 4), ("enchanting_stone", 1)],
            level_required: 15,
            result_name: "Fire Ring", result_type: "armor", result_slot: Some("ring"),
            result_rarity: 2, result_level: 15, result_stat_key: "ATK", result_stat_val: 12 },

        // === Advanced Consumables ===
        Recipe { id: "supreme_health_potion", name: "Supreme Health Potion", materials: &[("herb", 5), ("mana_crystal", 2), ("gem_shard", 1)],
            level_required: 20,
            result_name: "Supreme Health Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 20, result_stat_key: "HP", result_stat_val: 400 },
        Recipe { id: "supreme_mana_potion", name: "Supreme Mana Potion", materials: &[("mana_crystal", 5), ("herb", 2), ("gem_shard", 1)],
            level_required: 20,
            result_name: "Supreme Mana Potion", result_type: "consumable", result_slot: None,
            result_rarity: 2, result_level: 20, result_stat_key: "MP", result_stat_val: 300 },
        Recipe { id: "full_restore_elixir", name: "Full Restore Elixir", materials: &[("herb", 8), ("mana_crystal", 4), ("enchanting_stone", 2)],
            level_required: 30,
            result_name: "Full Restore Elixir", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 30, result_stat_key: "HP", result_stat_val: 9999 },
        Recipe { id: "titans_brew", name: "Titan's Brew", materials: &[("herb", 4), ("fire_crystal", 2), ("dragon_scale", 1)],
            level_required: 25,
            result_name: "Titan's Brew", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 25, result_stat_key: "ATK", result_stat_val: 25 },
        Recipe { id: "experience_tome", name: "Experience Tome", materials: &[("ancient_scroll", 3), ("enchanting_stone", 3), ("gem_shard", 2)],
            level_required: 25,
            result_name: "Experience Tome", result_type: "consumable", result_slot: None,
            result_rarity: 3, result_level: 25, result_stat_key: "XP", result_stat_val: 100 },

        // === Endgame Equipment (Lv 35-50) ===
        Recipe { id: "void_armor", name: "Void Armor", materials: &[("void_shard", 5), ("mithril_bar", 4), ("enchanting_stone", 4)],
            level_required: 35,
            result_name: "Void Armor", result_type: "armor", result_slot: Some("chest"),
            result_rarity: 4, result_level: 35, result_stat_key: "DEF", result_stat_val: 55 },
        Recipe { id: "celestial_helm", name: "Celestial Helm", materials: &[("star_fragment", 3), ("mithril_bar", 3), ("gem_shard", 5)],
            level_required: 35,
            result_name: "Celestial Helm", result_type: "armor", result_slot: Some("head"),
            result_rarity: 4, result_level: 35, result_stat_key: "DEF", result_stat_val: 38 },
        Recipe { id: "abyssal_greaves", name: "Abyssal Greaves", materials: &[("void_shard", 3), ("dragon_scale", 2), ("mithril_bar", 3)],
            level_required: 35,
            result_name: "Abyssal Greaves", result_type: "armor", result_slot: Some("legs"),
            result_rarity: 4, result_level: 35, result_stat_key: "DEF", result_stat_val: 42 },
        Recipe { id: "titan_gauntlets_mk2", name: "Titan Gauntlets MK2", materials: &[("dragon_scale", 3), ("mithril_bar", 4), ("enchanting_stone", 3)],
            level_required: 35,
            result_name: "Titan Gauntlets MK2", result_type: "armor", result_slot: Some("gloves"),
            result_rarity: 4, result_level: 35, result_stat_key: "ATK", result_stat_val: 30 },
        Recipe { id: "demons_edge", name: "Demon's Edge", materials: &[("fire_crystal", 5), ("void_shard", 3), ("enchanting_stone", 4)],
            level_required: 40,
            result_name: "Demon's Edge", result_type: "weapon", result_slot: None,
            result_rarity: 4, result_level: 40, result_stat_key: "ATK", result_stat_val: 65 },
        Recipe { id: "holy_avenger", name: "Holy Avenger", materials: &[("star_fragment", 4), ("mithril_bar", 5), ("enchanting_stone", 5)],
            level_required: 40,
            result_name: "Holy Avenger", result_type: "weapon", result_slot: None,
            result_rarity: 4, result_level: 40, result_stat_key: "ATK", result_stat_val: 60 },
        Recipe { id: "blank_rune_craft", name: "Blank Rune", materials: &[("mana_crystal", 2), ("gem_shard", 1)],
            level_required: 10,
            result_name: "Blank Rune", result_type: "material", result_slot: None,
            result_rarity: 1, result_level: 10, result_stat_key: "", result_stat_val: 0 },
        // === Ashfall Furnace Recipes ===
        Recipe { id: "magma_core_hammer", name: "Magma Core Hammer", materials: &[("obsidian_shard", 5), ("fire_crystal", 4), ("mithril_bar", 6)],
            level_required: 35,
            result_name: "Magma Core Hammer", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 5, result_level: 35, result_stat_key: "ATK", result_stat_val: 55 },
        Recipe { id: "obsidian_plate_mail", name: "Obsidian Plate Mail", materials: &[("obsidian_shard", 8), ("dragon_scale", 4), ("mithril_bar", 5)],
            level_required: 35,
            result_name: "Obsidian Plate Mail", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 5, result_level: 35, result_stat_key: "DEF", result_stat_val: 48 },
        // === Celestial Spire Recipes ===
        Recipe { id: "astral_vestments", name: "Astral Vestments", materials: &[("celestial_dust", 10), ("star_fragment", 5), ("silk", 6)],
            level_required: 40,
            result_name: "Astral Vestments", result_type: "armor", result_slot: Some("armor"),
            result_rarity: 5, result_level: 40, result_stat_key: "DEF", result_stat_val: 55 },
        Recipe { id: "starforged_blade_craft", name: "Starforged Blade", materials: &[("star_fragment", 8), ("celestial_dust", 6), ("adamantite_ore", 8)],
            level_required: 42,
            result_name: "Starforged Blade", result_type: "weapon", result_slot: Some("weapon"),
            result_rarity: 5, result_level: 42, result_stat_key: "ATK", result_stat_val: 65 },
        // === Advanced Potions ===
        Recipe { id: "phoenix_down_craft", name: "Phoenix Down", materials: &[("phoenix_ash", 3), ("herb", 10), ("star_fragment", 1)],
            level_required: 25,
            result_name: "Phoenix Down", result_type: "consumable", result_slot: None,
            result_rarity: 4, result_level: 25, result_stat_key: "HP", result_stat_val: 500 },
        Recipe { id: "celestial_nectar_craft", name: "Celestial Nectar", materials: &[("celestial_dust", 2), ("herb", 8), ("honey", 3)],
            level_required: 30,
            result_name: "Celestial Nectar", result_type: "consumable", result_slot: None,
            result_rarity: 4, result_level: 30, result_stat_key: "HP", result_stat_val: 200 },
        Recipe { id: "void_essence_flask", name: "Void Essence Flask", materials: &[("void_shard", 2), ("mana_crystal", 3), ("herb", 5)],
            level_required: 30,
            result_name: "Void Essence Flask", result_type: "consumable", result_slot: None,
            result_rarity: 4, result_level: 30, result_stat_key: "ATK", result_stat_val: 40 },
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

    let consume_materials = |inventory: &mut Vec<Option<Item>>| {
        for &(template_id, mut qty_needed) in recipe.materials {
            for slot in inventory.iter_mut() {
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
    };

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
        enchant_level: 0,
    };

    if let Some(mut player) = state.players.get_mut(&player_id) {
        if player.level < recipe.level_required {
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": {
                    "sender": "System",
                    "text": format!("You need to be level {} to craft {}.", recipe.level_required, recipe.name),
                    "channel": "system"
                }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }

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

        let mut simulated_player = player.clone();
        consume_materials(&mut simulated_player.inventory);
        if !simulated_player.add_item(result_item.clone()) {
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": "Inventory full! Cannot craft.", "channel": "system" }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }

        consume_materials(&mut player.inventory);
        if player.add_item(result_item) {
            let craft_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": format!("✅ Crafted {}!", recipe.name), "channel": "system" }
            }).to_string();
            drop(player);
            state.send_to(&player_id, &craft_msg);
            send_inventory_update(state, &player_id);
            // Quest/achievement hooks for crafting
            if let Some(mut p) = state.players.get_mut(&player_id) {
                p.stats_tracker.items_crafted += 1;
                p.crafts_count += 1;
                check_title_unlocks(&mut p);
                drop(p);
            }
            check_quest_progress(state, player_id, "craft", "", 1);
            check_achievements(state, player_id);
            send_title_update(state, &player_id);
            update_daily_quest_progress(state, &player_id, "craft_items", 1);
            // Faction rep: Arcane Circle gains from crafting
            if let Some(mut p) = state.players.get_mut(&player_id) {
                *p.faction_rep.entry("arcane_circle".to_string()).or_insert(0) += 5;
            }
        } else {
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": "Inventory full! Cannot craft.", "channel": "system" }
            }).to_string();
            state.send_to(&player_id, &msg);
        }
    }
}

// ─── Skill Tree Handlers ────────────────────────────────────

fn handle_skill_tree_unlock(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let node_id = match payload.get("nodeId").and_then(|v| v.as_str()) {
        Some(n) => n,
        None => return,
    };

    let node = match SKILL_TREES.iter().find(|n| n.id == node_id) {
        Some(n) => n,
        None => return,
    };

    let result_msg = {
        let mut player = match state.players.get_mut(&player_id) {
            Some(p) => p,
            None => return,
        };

        // Check class matches
        if player.class != node.class {
            return;
        }

        // Check not already unlocked
        if player.skill_tree_unlocked.iter().any(|id| id == node_id) {
            return;
        }

        // Check prerequisites
        for req in node.requires {
            if !player.skill_tree_unlocked.iter().any(|id| id == *req) {
                return;
            }
        }

        // Check skill points
        if player.skill_points < node.skill_point_cost {
            return;
        }

        // Apply unlock
        player.skill_points -= node.skill_point_cost;
        player.skill_tree_unlocked.push(node_id.to_string());

        // Apply stat bonuses
        match node.bonus_type {
            "hp" => { player.max_hp += node.bonus_value; player.hp += node.bonus_value; }
            "mp" => { player.max_mp += node.bonus_value; player.mp += node.bonus_value; }
            "atk" => { player.atk += node.bonus_value; }
            "def" => { player.def += node.bonus_value; }
            "spd" => { player.spd += node.bonus_value; }
            "lck" => { player.lck += node.bonus_value; }
            _ => {} // gold_mult, xp_mult, lifesteal, crit handled in combat calculations
        }

        // Send stats update
        send_stats_update(state, &player);

        json!({
            "type": MSG_SKILL_TREE_DATA,
            "payload": {
                "unlocked": player.skill_tree_unlocked.clone(),
                "skillPoints": player.skill_points,
                "message": format!("Unlocked: {}!", node.name),
            }
        }).to_string()
    };

    state.send_to(&player_id, &result_msg);
}

fn handle_skill_tree_request(state: &Arc<AppState>, player_id: Uuid) {
    let player = match state.players.get(&player_id) {
        Some(p) => p,
        None => return,
    };

    let class = player.class.clone();
    let class_nodes: Vec<serde_json::Value> = SKILL_TREES.iter()
        .filter(|n| n.class == class)
        .map(|n| json!({
            "id": n.id,
            "name": n.name,
            "description": n.description,
            "icon": n.icon,
            "tree": n.tree,
            "tier": n.tier,
            "requires": n.requires,
            "bonusType": n.bonus_type,
            "bonusValue": n.bonus_value,
            "cost": n.skill_point_cost,
            "unlocked": player.skill_tree_unlocked.contains(&n.id.to_string()),
        }))
        .collect();

    let msg = json!({
        "type": MSG_SKILL_TREE_DATA,
        "payload": {
            "class": class,
            "nodes": class_nodes,
            "unlocked": player.skill_tree_unlocked.clone(),
            "skillPoints": player.skill_points,
        }
    }).to_string();
    drop(player);
    state.send_to(&player_id, &msg);
}

// ─── Enchanting System ──────────────────────────────────────

/// Compute the flat enchant stat bonus for a given enchant level and item type.
fn compute_enchant_bonus(enchant_level: u8, item_type: &ItemType) -> HashMap<String, i32> {
    let mut bonus = HashMap::new();
    if enchant_level == 0 {
        return bonus;
    }
    let lvl = enchant_level as i32;
    match item_type {
        ItemType::Weapon => {
            bonus.insert("ATK".into(), lvl * 3);
        }
        ItemType::Armor => {
            bonus.insert("DEF".into(), lvl * 2);
        }
        _ => {}
    }
    // Milestone bonuses
    if enchant_level >= 5 {
        *bonus.entry("HP".into()).or_insert(0) += 5;
    }
    if enchant_level >= 10 {
        *bonus.entry("HP".into()).or_insert(0) += 10;
        *bonus.entry("SPD".into()).or_insert(0) += 3;
    }
    bonus
}

/// Derive the display name for an enchanted item.
fn enchanted_item_name(base_name: &str, enchant_level: u8) -> String {
    // Strip any existing "+N " prefix
    let stripped = if base_name.starts_with('+') {
        if let Some(idx) = base_name.find(' ') {
            &base_name[idx + 1..]
        } else {
            base_name
        }
    } else {
        base_name
    };
    if enchant_level > 0 {
        format!("+{} {}", enchant_level, stripped)
    } else {
        stripped.to_string()
    }
}

fn handle_enchant_item(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let slot_index = match payload.get("slotIndex").and_then(|v| v.as_u64()) {
        Some(idx) => idx as usize,
        None => return,
    };
    let item_id = match payload.get("itemId").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return,
    };

    // Reject if player is in an active trade
    if state.player_trade.contains_key(&player_id) {
        let msg = json!({
            "type": MSG_ENCHANT_RESULT,
            "payload": {
                "success": false,
                "newLevel": 0,
                "itemName": "",
                "message": "Cannot enchant while trading!"
            }
        }).to_string();
        state.send_to(&player_id, &msg);
        return;
    }

    // Single mutable guard: validate, charge, mutate, then drop
    let (success, new_level, result_name, result_msg) = {
        let mut player = match state.players.get_mut(&player_id) {
            Some(p) => p,
            None => return,
        };

        // Validate slot and item identity
        let item = match player.inventory.get(slot_index).and_then(|i| i.as_ref()) {
            Some(i) => i,
            None => {
                drop(player);
                let msg = json!({
                    "type": MSG_ENCHANT_RESULT,
                    "payload": {
                        "success": false, "newLevel": 0, "itemName": "",
                        "message": "No item in that slot!"
                    }
                }).to_string();
                state.send_to(&player_id, &msg);
                return;
            }
        };

        if item.id != item_id {
            drop(player);
            let msg = json!({
                "type": MSG_ENCHANT_RESULT,
                "payload": {
                    "success": false, "newLevel": 0, "itemName": "",
                    "message": "Item has changed!"
                }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }

        // Only weapons and armor can be enchanted
        if item.item_type != ItemType::Weapon && item.item_type != ItemType::Armor {
            drop(player);
            let msg = json!({
                "type": MSG_ENCHANT_RESULT,
                "payload": {
                    "success": false, "newLevel": 0, "itemName": "",
                    "message": "Only weapons and armor can be enchanted!"
                }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }

        let current_level = item.enchant_level;
        if current_level >= 10 {
            let name = item.name.clone();
            drop(player);
            let msg = json!({
                "type": MSG_ENCHANT_RESULT,
                "payload": {
                    "success": false, "newLevel": current_level, "itemName": name,
                    "message": "Item is already at maximum enchant level (+10)!"
                }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }

        let item_type = item.item_type.clone();

        // Cost calculation
        let gold_cost = 100u64 * (current_level as u64 + 1) * (current_level as u64 + 1);
        let stones_needed = (current_level as u32) + 1;

        // Check gold
        if player.gold < gold_cost {
            drop(player);
            let msg = json!({
                "type": MSG_ENCHANT_RESULT,
                "payload": {
                    "success": false, "newLevel": current_level, "itemName": "",
                    "message": format!("Not enough gold! Need {} gold.", gold_cost)
                }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }

        // Count enchanting stones
        let stone_count: u32 = player.inventory.iter()
            .filter_map(|s| s.as_ref())
            .filter(|i| i.template_id == "enchanting_stone")
            .map(|i| i.quantity)
            .sum();

        if stone_count < stones_needed {
            drop(player);
            let msg = json!({
                "type": MSG_ENCHANT_RESULT,
                "payload": {
                    "success": false, "newLevel": current_level, "itemName": "",
                    "message": format!("Not enough Enchanting Stones! Need {} (have {}).", stones_needed, stone_count)
                }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }

        // --- All checks passed. Consume resources. ---
        player.gold -= gold_cost;

        // Consume enchanting stones
        let mut stones_to_consume = stones_needed;
        for slot in player.inventory.iter_mut() {
            if stones_to_consume == 0 { break; }
            if let Some(stack) = slot {
                if stack.template_id == "enchanting_stone" {
                    let take = stack.quantity.min(stones_to_consume);
                    stack.quantity -= take;
                    stones_to_consume -= take;
                    if stack.quantity == 0 {
                        *slot = None;
                    }
                }
            }
        }

        // Roll for success
        let success_rate: f64 = match current_level {
            0..=2 => 1.0,
            3..=5 => 0.85,
            6..=7 => 0.70,
            8 => 0.55,
            9 => 0.40,
            _ => 0.0,
        };
        let mut rng = rand::thread_rng();
        let success = rng.gen_bool(success_rate.min(1.0));

        // Compute old enchant bonus to remove
        let old_bonus = compute_enchant_bonus(current_level, &item_type);

        let new_level;
        let result_msg;
        if success {
            new_level = current_level + 1;
            result_msg = if new_level == 10 {
                "✨ PERFECT ENCHANT! Your item radiates with legendary power! (+10)".to_string()
            } else if new_level >= 7 {
                format!("🔥 Enchantment successful! Your item surges with power! (+{})", new_level)
            } else {
                format!("✨ Enchantment successful! Your item glows with power! (+{})", new_level)
            };
        } else {
            new_level = if current_level > 0 { current_level - 1 } else { 0 };
            result_msg = if current_level > 0 {
                format!("💥 Enchantment failed! Your item's power fades... (dropped to +{})", new_level)
            } else {
                "💥 Enchantment failed! The materials were consumed.".to_string()
            };
        }

        // Compute new enchant bonus
        let new_bonus = compute_enchant_bonus(new_level, &item_type);

        // Apply stat changes to item
        let item = player.inventory[slot_index].as_mut().unwrap();
        // Remove old bonus
        for (stat, val) in &old_bonus {
            if let Some(s) = item.stats.get_mut(stat) {
                *s -= val;
                if *s <= 0 {
                    item.stats.remove(stat);
                }
            }
        }
        // Add new bonus
        for (stat, val) in &new_bonus {
            *item.stats.entry(stat.clone()).or_insert(0) += val;
        }
        item.enchant_level = new_level;
        item.name = enchanted_item_name(&item.name, new_level);
        let result_name = item.name.clone();

        if success {
            player.items_enchanted += 1;
        }

        (success, new_level, result_name, result_msg)
    }; // player guard dropped

    // Send enchant result
    let result = json!({
        "type": MSG_ENCHANT_RESULT,
        "payload": {
            "success": success,
            "newLevel": new_level,
            "itemName": result_name,
            "message": result_msg,
        }
    }).to_string();
    state.send_to(&player_id, &result);

    // Send updated inventory
    send_inventory_update(state, &player_id);
    if success {
        update_daily_quest_progress(state, &player_id, "enchant_item", 1);
    }
}

// ─── Guild System ────────────────────────────────────────────

fn guild_sys_msg(state: &Arc<AppState>, pid: &Uuid, text: String) {
    let m = json!({
        "type": MSG_CHAT_MESSAGE,
        "payload": { "sender": "System", "text": text, "channel": "system" }
    }).to_string();
    state.send_to(pid, &m);
}

fn send_guild_data_to_members(state: &Arc<AppState>, guild_id: &Uuid) {
    let guild = match state.guilds.get(guild_id) {
        Some(g) => g.clone(),
        None => return,
    };
    // guard dropped ^

    let member_info: Vec<serde_json::Value> = guild.members.iter().map(|mid| {
        let (name, level, class, online) = if let Some(p) = state.players.get(mid) {
            (p.username.clone(), p.level, p.class.clone(), true)
        } else if let Some(p) = state.saved_players.iter().find(|e| e.value().id == *mid) {
            (p.value().username.clone(), p.value().level, p.value().class.clone(), false)
        } else {
            ("Unknown".to_string(), 0, "unknown".to_string(), false)
        };
        let rank = if *mid == guild.leader_id {
            "leader"
        } else if guild.officers.contains(mid) {
            "officer"
        } else {
            "member"
        };
        json!({
            "id": mid.to_string(),
            "name": name,
            "level": level,
            "class": class,
            "rank": rank,
            "online": online,
        })
    }).collect();

    let msg = json!({
        "type": MSG_GUILD_DATA,
        "payload": {
            "id": guild.id.to_string(),
            "name": guild.name,
            "tag": guild.tag,
            "leaderId": guild.leader_id.to_string(),
            "level": guild.level,
            "xp": guild.xp,
            "motd": guild.motd,
            "bankGold": guild.bank_gold,
            "members": member_info,
        }
    }).to_string();

    for mid in &guild.members {
        state.send_to(mid, &msg);
    }
}

fn send_guild_cleared(state: &Arc<AppState>, player_id: &Uuid) {
    let msg = json!({
        "type": MSG_GUILD_DATA,
        "payload": null
    }).to_string();
    state.send_to(player_id, &msg);
}

fn handle_guild_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = match payload.get("action").and_then(|v| v.as_str()) {
        Some(a) => a,
        None => return,
    };

    match action {
        "create" => {
            let name = match payload.get("name").and_then(|v| v.as_str()) {
                Some(n) if n.len() >= 3 && n.len() <= 24 => n.to_string(),
                _ => {
                    guild_sys_msg(state, &player_id, "Guild name must be 3-24 characters.".into());
                    return;
                }
            };
            let tag = match payload.get("tag").and_then(|v| v.as_str()) {
                Some(t) if t.len() >= 2 && t.len() <= 4 => t.to_uppercase(),
                _ => {
                    guild_sys_msg(state, &player_id, "Guild tag must be 2-4 characters.".into());
                    return;
                }
            };

            let (player_gold, player_guild_id) = {
                match state.players.get(&player_id) {
                    Some(p) => (p.gold, p.guild_id),
                    None => return,
                }
            };

            if player_guild_id.is_some() {
                guild_sys_msg(state, &player_id, "You are already in a guild.".into());
                return;
            }
            if player_gold < 500 {
                guild_sys_msg(state, &player_id, "You need 500 gold to create a guild.".into());
                return;
            }

            let name_lower = name.to_lowercase();
            if state.guild_names.contains_key(&name_lower) {
                guild_sys_msg(state, &player_id, "A guild with that name already exists.".into());
                return;
            }

            let guild_id = Uuid::new_v4();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let guild = GuildData {
                id: guild_id,
                name: name.clone(),
                tag: tag.clone(),
                leader_id: player_id,
                officers: Vec::new(),
                members: vec![player_id],
                created_at: now,
                level: 1,
                xp: 0,
                motd: String::new(),
                bank_gold: 0,
            };

            state.guilds.insert(guild_id, guild);
            state.guild_names.insert(name_lower, guild_id);

            if let Some(mut p) = state.players.get_mut(&player_id) {
                p.gold -= 500;
                p.guild_id = Some(guild_id);
                p.guild_name = Some(name.clone());
                p.guild_rank = "leader".to_string();
            }

            guild_sys_msg(state, &player_id, format!("🏰 Guild [{}] {} created!", tag, name));
            send_guild_data_to_members(state, &guild_id);
            send_stats_update_by_id(state, &player_id);
        }

        "invite" => {
            let target_name = match payload.get("target").and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => return,
            };

            let (guild_id, inviter_name, inviter_rank) = {
                match state.players.get(&player_id) {
                    Some(p) => match p.guild_id {
                        Some(gid) => (gid, p.username.clone(), p.guild_rank.clone()),
                        None => {
                            drop(p);
                            guild_sys_msg(state, &player_id, "You are not in a guild.".into());
                            return;
                        }
                    },
                    None => return,
                }
            };

            if inviter_rank != "leader" && inviter_rank != "officer" {
                guild_sys_msg(state, &player_id, "Only leaders and officers can invite.".into());
                return;
            }

            let target_id = {
                state.players.iter()
                    .find(|e| e.value().username.eq_ignore_ascii_case(&target_name) && e.value().id != player_id)
                    .map(|e| e.value().id)
            };

            let target_id = match target_id {
                Some(id) => id,
                None => {
                    guild_sys_msg(state, &player_id, format!("Player '{}' not found.", target_name));
                    return;
                }
            };

            let target_has_guild = state.players.get(&target_id)
                .map(|p| p.guild_id.is_some())
                .unwrap_or(false);
            if target_has_guild {
                guild_sys_msg(state, &player_id, format!("{} is already in a guild.", target_name));
                return;
            }

            let guild_name = state.guilds.get(&guild_id)
                .map(|g| g.name.clone())
                .unwrap_or_default();

            state.guild_invites.insert(target_id, (guild_id, inviter_name.clone(), std::time::Instant::now()));
            guild_sys_msg(state, &player_id, format!("Guild invite sent to {}.", target_name));
            guild_sys_msg(state, &target_id,
                format!("🏰 {} invited you to join [{}]. Use the Guild panel (G key) or type /guild accept.", inviter_name, guild_name));
        }

        "accept" | "accept_invite" => {
            let (guild_id, _inviter, invite_time) = match state.guild_invites.remove(&player_id) {
                Some((_, data)) => data,
                None => {
                    guild_sys_msg(state, &player_id, "You have no pending guild invite.".into());
                    return;
                }
            };

            if invite_time.elapsed() > Duration::from_secs(300) {
                guild_sys_msg(state, &player_id, "Guild invite has expired.".into());
                return;
            }

            let already_in_guild = state.players.get(&player_id)
                .map(|p| p.guild_id.is_some())
                .unwrap_or(false);
            if already_in_guild {
                guild_sys_msg(state, &player_id, "You are already in a guild.".into());
                return;
            }

            let guild_name = {
                match state.guilds.get_mut(&guild_id) {
                    Some(mut g) => {
                        g.members.push(player_id);
                        g.name.clone()
                    },
                    None => {
                        guild_sys_msg(state, &player_id, "That guild no longer exists.".into());
                        return;
                    }
                }
            };

            let player_name = {
                if let Some(mut p) = state.players.get_mut(&player_id) {
                    p.guild_id = Some(guild_id);
                    p.guild_name = Some(guild_name.clone());
                    p.guild_rank = "member".to_string();
                    p.username.clone()
                } else {
                    return;
                }
            };

            let members: Vec<Uuid> = state.guilds.get(&guild_id)
                .map(|g| g.members.clone())
                .unwrap_or_default();
            for mid in &members {
                guild_sys_msg(state, mid, format!("🏰 {} has joined the guild!", player_name));
            }
            send_guild_data_to_members(state, &guild_id);
        }

        "leave" => {
            let (guild_id, player_name, player_rank) = {
                match state.players.get(&player_id) {
                    Some(p) => match p.guild_id {
                        Some(gid) => (gid, p.username.clone(), p.guild_rank.clone()),
                        None => {
                            drop(p);
                            guild_sys_msg(state, &player_id, "You are not in a guild.".into());
                            return;
                        }
                    },
                    None => return,
                }
            };

            let (should_disband, remaining_members) = {
                match state.guilds.get_mut(&guild_id) {
                    Some(mut g) => {
                        g.members.retain(|m| *m != player_id);
                        g.officers.retain(|m| *m != player_id);

                        if g.members.is_empty() {
                            (true, Vec::new())
                        } else if player_rank == "leader" {
                            let new_leader = if let Some(&officer) = g.officers.first() {
                                g.officers.retain(|o| *o != officer);
                                officer
                            } else {
                                g.members[0]
                            };
                            g.leader_id = new_leader;
                            (false, g.members.clone())
                        } else {
                            (false, g.members.clone())
                        }
                    },
                    None => (true, Vec::new()),
                }
            };

            if let Some(mut p) = state.players.get_mut(&player_id) {
                p.guild_id = None;
                p.guild_name = None;
                p.guild_rank = String::new();
            }
            send_guild_cleared(state, &player_id);

            if should_disband {
                let guild_name_lower = state.guilds.get(&guild_id)
                    .map(|g| g.name.to_lowercase());
                state.guilds.remove(&guild_id);
                if let Some(name) = guild_name_lower {
                    state.guild_names.remove(&name);
                }
                guild_sys_msg(state, &player_id, "🏰 Guild has been disbanded.".into());
            } else {
                if player_rank == "leader" {
                    let new_leader_id = state.guilds.get(&guild_id).map(|g| g.leader_id);
                    if let Some(nlid) = new_leader_id {
                        if let Some(mut p) = state.players.get_mut(&nlid) {
                            p.guild_rank = "leader".to_string();
                        }
                    }
                }
                for mid in &remaining_members {
                    guild_sys_msg(state, mid, format!("🏰 {} has left the guild.", player_name));
                }
                send_guild_data_to_members(state, &guild_id);
            }
        }

        "kick" => {
            let target_name = match payload.get("target").and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => return,
            };

            let (guild_id, kicker_rank) = {
                match state.players.get(&player_id) {
                    Some(p) => match p.guild_id {
                        Some(gid) => (gid, p.guild_rank.clone()),
                        None => return,
                    },
                    None => return,
                }
            };

            if kicker_rank != "leader" && kicker_rank != "officer" {
                guild_sys_msg(state, &player_id, "Only leaders and officers can kick members.".into());
                return;
            }

            let target_id = {
                let guild = match state.guilds.get(&guild_id) {
                    Some(g) => g,
                    None => return,
                };
                guild.members.iter().find(|mid| {
                    state.players.get(mid)
                        .map(|p| p.username.eq_ignore_ascii_case(&target_name))
                        .unwrap_or(false)
                }).copied()
            };

            let target_id = match target_id {
                Some(id) => id,
                None => {
                    guild_sys_msg(state, &player_id, format!("'{}' is not in your guild.", target_name));
                    return;
                }
            };

            if target_id == player_id {
                guild_sys_msg(state, &player_id, "You cannot kick yourself. Use 'leave' instead.".into());
                return;
            }

            let target_rank = state.players.get(&target_id)
                .map(|p| p.guild_rank.clone())
                .unwrap_or_default();
            if target_rank == "leader" || (target_rank == "officer" && kicker_rank != "leader") {
                guild_sys_msg(state, &player_id, "You cannot kick someone of equal or higher rank.".into());
                return;
            }

            if let Some(mut g) = state.guilds.get_mut(&guild_id) {
                g.members.retain(|m| *m != target_id);
                g.officers.retain(|m| *m != target_id);
            }

            if let Some(mut p) = state.players.get_mut(&target_id) {
                p.guild_id = None;
                p.guild_name = None;
                p.guild_rank = String::new();
            }

            let members: Vec<Uuid> = state.guilds.get(&guild_id)
                .map(|g| g.members.clone())
                .unwrap_or_default();
            for mid in &members {
                guild_sys_msg(state, mid, format!("🏰 {} has been kicked from the guild.", target_name));
            }
            guild_sys_msg(state, &target_id, "🏰 You have been kicked from the guild.".into());
            send_guild_cleared(state, &target_id);
            send_guild_data_to_members(state, &guild_id);
        }

        "promote" => {
            let target_name = match payload.get("target").and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => return,
            };

            let (guild_id, promoter_rank) = {
                match state.players.get(&player_id) {
                    Some(p) => match p.guild_id {
                        Some(gid) => (gid, p.guild_rank.clone()),
                        None => return,
                    },
                    None => return,
                }
            };

            if promoter_rank != "leader" {
                guild_sys_msg(state, &player_id, "Only the guild leader can promote members.".into());
                return;
            }

            let target_id = {
                let guild = match state.guilds.get(&guild_id) {
                    Some(g) => g,
                    None => return,
                };
                guild.members.iter().find(|mid| {
                    state.players.get(mid)
                        .map(|p| p.username.eq_ignore_ascii_case(&target_name))
                        .unwrap_or(false)
                }).copied()
            };

            let target_id = match target_id {
                Some(id) if id != player_id => id,
                _ => {
                    guild_sys_msg(state, &player_id, format!("'{}' is not in your guild.", target_name));
                    return;
                }
            };

            let target_rank = state.players.get(&target_id)
                .map(|p| p.guild_rank.clone())
                .unwrap_or_default();

            if target_rank == "officer" || target_rank == "leader" {
                guild_sys_msg(state, &player_id, format!("{} is already an officer or higher.", target_name));
                return;
            }

            if let Some(mut g) = state.guilds.get_mut(&guild_id) {
                if !g.officers.contains(&target_id) {
                    g.officers.push(target_id);
                }
            }

            if let Some(mut p) = state.players.get_mut(&target_id) {
                p.guild_rank = "officer".to_string();
            }

            let members: Vec<Uuid> = state.guilds.get(&guild_id)
                .map(|g| g.members.clone())
                .unwrap_or_default();
            for mid in &members {
                guild_sys_msg(state, mid, format!("🏰 {} has been promoted to Officer!", target_name));
            }
            send_guild_data_to_members(state, &guild_id);
        }

        "demote" => {
            let target_name = match payload.get("target").and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => return,
            };

            let (guild_id, demoter_rank) = {
                match state.players.get(&player_id) {
                    Some(p) => match p.guild_id {
                        Some(gid) => (gid, p.guild_rank.clone()),
                        None => return,
                    },
                    None => return,
                }
            };

            if demoter_rank != "leader" {
                guild_sys_msg(state, &player_id, "Only the guild leader can demote officers.".into());
                return;
            }

            let target_id = {
                let guild = match state.guilds.get(&guild_id) {
                    Some(g) => g,
                    None => return,
                };
                guild.officers.iter().find(|mid| {
                    state.players.get(mid)
                        .map(|p| p.username.eq_ignore_ascii_case(&target_name))
                        .unwrap_or(false)
                }).copied()
            };

            let target_id = match target_id {
                Some(id) => id,
                None => {
                    guild_sys_msg(state, &player_id, format!("'{}' is not an officer.", target_name));
                    return;
                }
            };

            if let Some(mut g) = state.guilds.get_mut(&guild_id) {
                g.officers.retain(|o| *o != target_id);
            }

            if let Some(mut p) = state.players.get_mut(&target_id) {
                p.guild_rank = "member".to_string();
            }

            let members: Vec<Uuid> = state.guilds.get(&guild_id)
                .map(|g| g.members.clone())
                .unwrap_or_default();
            for mid in &members {
                guild_sys_msg(state, mid, format!("🏰 {} has been demoted to Member.", target_name));
            }
            send_guild_data_to_members(state, &guild_id);
        }

        "set_motd" => {
            let motd = match payload.get("motd").and_then(|v| v.as_str()) {
                Some(m) => m.to_string(),
                None => return,
            };

            let (guild_id, player_rank) = {
                match state.players.get(&player_id) {
                    Some(p) => match p.guild_id {
                        Some(gid) => (gid, p.guild_rank.clone()),
                        None => return,
                    },
                    None => return,
                }
            };

            if player_rank != "leader" && player_rank != "officer" {
                guild_sys_msg(state, &player_id, "Only leaders and officers can set the MOTD.".into());
                return;
            }

            if let Some(mut g) = state.guilds.get_mut(&guild_id) {
                g.motd = motd.chars().take(200).collect();
            }

            send_guild_data_to_members(state, &guild_id);
        }

        "deposit_gold" => {
            let amount = match payload.get("amount").and_then(|v| v.as_u64()) {
                Some(a) if a > 0 => a,
                _ => {
                    guild_sys_msg(state, &player_id, "Invalid amount.".into());
                    return;
                }
            };

            let guild_id = {
                match state.players.get(&player_id) {
                    Some(p) => match p.guild_id {
                        Some(gid) => gid,
                        None => {
                            drop(p);
                            guild_sys_msg(state, &player_id, "You are not in a guild.".into());
                            return;
                        }
                    },
                    None => return,
                }
            };

            let success = {
                if let Some(mut p) = state.players.get_mut(&player_id) {
                    if p.gold >= amount {
                        p.gold -= amount;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            };

            if !success {
                guild_sys_msg(state, &player_id, "Not enough gold.".into());
                return;
            }

            if let Some(mut g) = state.guilds.get_mut(&guild_id) {
                g.bank_gold += amount;
            }

            let player_name = state.players.get(&player_id)
                .map(|p| p.username.clone())
                .unwrap_or_default();
            let members: Vec<Uuid> = state.guilds.get(&guild_id)
                .map(|g| g.members.clone())
                .unwrap_or_default();
            for mid in &members {
                guild_sys_msg(state, mid, format!("🏰 {} deposited {} gold into the guild bank.", player_name, amount));
            }
            send_guild_data_to_members(state, &guild_id);
            send_stats_update_by_id(state, &player_id);
        }

        "chat" => {
            let text = match payload.get("text").and_then(|v| v.as_str()) {
                Some(t) if !t.is_empty() => t.to_string(),
                _ => return,
            };

            let (guild_id, player_name) = {
                match state.players.get(&player_id) {
                    Some(p) => match p.guild_id {
                        Some(gid) => (gid, p.username.clone()),
                        None => {
                            drop(p);
                            guild_sys_msg(state, &player_id, "You are not in a guild.".into());
                            return;
                        }
                    },
                    None => return,
                }
            };

            let members: Vec<Uuid> = state.guilds.get(&guild_id)
                .map(|g| g.members.clone())
                .unwrap_or_default();

            let msg = json!({
                "type": MSG_GUILD_CHAT,
                "payload": {
                    "sender": player_name,
                    "text": text,
                }
            }).to_string();

            for mid in &members {
                state.send_to(mid, &msg);
            }
        }

        "info" => {
            let guild_id = state.players.get(&player_id).and_then(|p| p.guild_id);
            if let Some(gid) = guild_id {
                send_guild_data_to_members(state, &gid);
            } else {
                send_guild_cleared(state, &player_id);
            }
        }

        _ => {}
    }
}

// ─── Fishing Handler ────────────────────────────────────────

fn handle_fishing_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");
    match action {
        "cast" => {
            // Check if player is near water (simplification: check if in certain zones)
            let (px, py, lck) = match state.players.get(&player_id) {
                Some(p) => (p.x, p.y, p.total_lck()),
                None => return,
            };
            let zone_level = state.world.get_zone_level(px, py);

            // Roll catch with 3-second simulated wait
            let (name, icon, rarity, sell_value, special) = protocol::roll_fishing_catch(zone_level, lck);

            // Create fish item and add to inventory
            let mut fish_item = Item {
                id: Uuid::new_v4().to_string(),
                template_id: format!("fish_{}", name.to_lowercase().replace(' ', "_")),
                name: name.to_string(),
                item_type: ItemType::Material,
                slot: None,
                rarity,
                level: zone_level,
                stats: HashMap::new(),
                affixes: vec![icon.to_string()],
                quantity: 1,
                description: format!("{} A {} caught while fishing. Sells for {}g.", icon, name, sell_value),
                stackable: true,
                enchant_level: 0,
            };
            if !special.is_empty() {
                fish_item.stats.insert(special.to_string(), (zone_level as i32 / 5).max(1));
            }

            let rarity_name = match rarity { 0 => "Common", 1 => "Uncommon", 2 => "Rare", 3 => "Epic", _ => "Common" };
            let added = if let Some(mut player) = state.players.get_mut(&player_id) {
                player.add_item(fish_item)
            } else { false };

            if added {
                let msg = json!({
                    "type": MSG_FISHING_RESULT,
                    "payload": {
                        "success": true,
                        "catch": name,
                        "icon": icon,
                        "rarity": rarity_name,
                        "value": sell_value,
                    }
                }).to_string();
                state.send_to(&player_id, &msg);
                let chat_msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text": format!("{} You caught a {} {}! ({}g)", icon, rarity_name, name, sell_value),"channel":"system"}}).to_string();
                state.send_to(&player_id, &chat_msg);
                send_inventory_update(state, &player_id);
                // Faction rep: Wild Hunters gain from fishing
                if let Some(mut p) = state.players.get_mut(&player_id) {
                    p.fish_caught += 1;
                    *p.faction_rep.entry("wild_hunters".to_string()).or_insert(0) += 3;
                    check_title_unlocks(&mut p);
                }
                send_title_update(state, &player_id);
                update_daily_quest_progress(state, &player_id, "catch_fish", 1);
            } else {
                let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Inventory full! Can't keep the catch.","channel":"system"}}).to_string();
                state.send_to(&player_id, &msg);
            }
        }
        _ => {}
    }
}

// ─── Mining/Gathering Handler ────────────────────────────────

fn handle_gather_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let node_type = payload.get("node_type").and_then(|v| v.as_str()).unwrap_or("");

    // Look up node definition
    let node = match MINING_NODES.iter().find(|(nt, _, _, _, _, _)| *nt == node_type) {
        Some(n) => n,
        None => {
            let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Unknown node type.","channel":"system"}}).to_string();
            state.send_to(&player_id, &msg);
            return;
        }
    };
    let (_node_type, icon, rarity, min_level, resource_name, base_yield) = *node;

    // Cooldown check (3 seconds = 3000ms)
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    {
        let player = match state.players.get(&player_id) {
            Some(p) => p,
            None => return,
        };
        if now_ms.saturating_sub(player.last_gather_tick) < 3000 {
            let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"⏳ You must wait before gathering again.","channel":"system"}}).to_string();
            drop(player);
            state.send_to(&player_id, &msg);
            return;
        }
    }

    // Determine which skill to use
    let is_mining = action == "mine";

    // Check player level requirement
    let (player_skill_level,) = {
        let player = match state.players.get(&player_id) {
            Some(p) => p,
            None => return,
        };
        let lvl = if is_mining { player.mining_level } else { player.gathering_level };
        (lvl,)
    };

    if player_skill_level < min_level {
        let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text": format!("⛔ Requires {} level {} (yours: {}).", if is_mining { "mining" } else { "gathering" }, min_level, player_skill_level),"channel":"system"}}).to_string();
        state.send_to(&player_id, &msg);
        return;
    }

    // Calculate yield
    let mut rng = rand::thread_rng();
    let level_bonus = (player_skill_level as f64 / 10.0).floor() as u32;
    let quantity = (base_yield + rng.gen_range(0..=2) + level_bonus).max(1);

    // Create main resource item
    let item = Item::new_material(resource_name, rarity, quantity);
    let mut gathered_items = vec![json!({
        "name": resource_name,
        "icon": icon,
        "quantity": quantity,
        "rarity": rarity,
    })];

    // 10% chance for bonus rare drop (one rarity tier higher)
    let bonus_drop: Option<Item> = if rng.gen_range(0..100) < 10 {
        let bonus_rarity = (rarity + 1).min(5);
        // Find a resource with that rarity
        let bonus_node = MINING_NODES.iter()
            .find(|(_, _, r, _, _, _)| *r == bonus_rarity);
        if let Some((_, bonus_icon, br, _, bonus_name, _)) = bonus_node {
            gathered_items.push(json!({
                "name": bonus_name,
                "icon": bonus_icon,
                "quantity": 1,
                "rarity": br,
            }));
            Some(Item::new_material(bonus_name, *br, 1))
        } else {
            None
        }
    } else {
        None
    };

    // Grant XP
    let xp_gained = 10 * (rarity as u64 + 1);

    // Apply to player
    let (new_level, leveled_up) = {
        let mut player = match state.players.get_mut(&player_id) {
            Some(p) => p,
            None => return,
        };

        // Update cooldown
        player.last_gather_tick = now_ms;

        // Add items to inventory
        let added = player.add_item(item);
        if !added {
            let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"❌ Inventory full!","channel":"system"}}).to_string();
            drop(player);
            state.send_to(&player_id, &msg);
            return;
        }
        if let Some(bonus) = bonus_drop {
            player.add_item(bonus);
        }

        // Grant XP and check level up
        let max_level: u32 = 30;
        let old_level;
        if is_mining {
            player.mining_xp += xp_gained;
            old_level = player.mining_level;
            let xp_needed = 100 * player.mining_level as u64;
            while player.mining_xp >= xp_needed && player.mining_level < max_level {
                player.mining_xp -= 100 * player.mining_level as u64;
                player.mining_level += 1;
            }
            (player.mining_level, player.mining_level > old_level)
        } else {
            player.gathering_xp += xp_gained;
            old_level = player.gathering_level;
            let xp_needed = 100 * player.gathering_level as u64;
            while player.gathering_xp >= xp_needed && player.gathering_level < max_level {
                player.gathering_xp -= 100 * player.gathering_level as u64;
                player.gathering_level += 1;
            }
            (player.gathering_level, player.gathering_level > old_level)
        }
    };

    // Send gather result
    let (mining_lvl, gathering_lvl, mining_xp_val, gathering_xp_val) = {
        let player = match state.players.get(&player_id) {
            Some(p) => p,
            None => return,
        };
        (player.mining_level, player.gathering_level, player.mining_xp, player.gathering_xp)
    };

    let result_msg = json!({
        "type": MSG_GATHER_RESULT,
        "payload": {
            "items": gathered_items,
            "xpGained": xp_gained,
            "miningLevel": mining_lvl,
            "gatheringLevel": gathering_lvl,
            "miningXp": mining_xp_val,
            "gatheringXp": gathering_xp_val,
        }
    }).to_string();
    state.send_to(&player_id, &result_msg);

    // Send inventory update
    send_inventory_update(state, &player_id);
    update_daily_quest_progress(state, &player_id, "mine_nodes", 1);

    if leveled_up {
        let skill_name = if is_mining { "Mining" } else { "Gathering" };
        let chat_msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text": format!("⬆️ {} leveled up to {}!", skill_name, new_level),"channel":"system"}}).to_string();
        state.send_to(&player_id, &chat_msg);
    }
}

// ─── Faction/Reputation Handler ─────────────────────────────

fn handle_faction_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");
    match action {
        "info" => {
            // Send all faction rep data to player
            if let Some(player) = state.players.get(&player_id) {
                let factions: Vec<serde_json::Value> = protocol::FACTIONS.iter().map(|(id, name, icon, desc)| {
                    let rep = player.faction_rep.get(*id).copied().unwrap_or(0);
                    let rank = protocol::rep_rank_name(rep);
                    json!({
                        "id": id,
                        "name": name,
                        "icon": icon,
                        "description": desc,
                        "rep": rep,
                        "rank": rank,
                    })
                }).collect();
                let msg = json!({
                    "type": MSG_FACTION_DATA,
                    "payload": { "factions": factions }
                }).to_string();
                drop(player);
                state.send_to(&player_id, &msg);
            }
        }
        _ => {}
    }
}

fn send_stats_update(state: &Arc<AppState>, player: &PlayerData) {
    // Calculate active set bonuses
    let set_bonuses = protocol::calculate_set_bonuses(&player.equipment);
    let active_sets: Vec<serde_json::Value> = set_bonuses.iter().map(|(name, icon, bonuses)| {
        json!({
            "name": name,
            "icon": icon,
            "bonuses": bonuses.iter().map(|(pieces, stat, val)| {
                json!({"pieces": pieces, "stat": stat, "value": val})
            }).collect::<Vec<_>>()
        })
    }).collect();

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
            "spd": player.spd + player.total_spd_bonus(),
            "lck": player.total_lck(),
            "gold": player.gold,
            "statPoints": player.stat_points,
            "class": player.class,
            "setBonuses": active_sets,
            "miningLevel": player.mining_level,
            "miningXp": player.mining_xp,
            "gatheringLevel": player.gathering_level,
            "gatheringXp": player.gathering_xp,
            "stamina": player.stamina_minutes,
            "blessings": player.blessings,
        }
    }).to_string();
    state.send_to(&player.id, &stats_msg);
}

fn send_stats_update_by_id(state: &Arc<AppState>, player_id: &Uuid) {
    if let Some(player) = state.players.get(player_id) {
        send_stats_update(state, &player);
    }
}

/// Award XP to a player and their party members (shared XP).
/// Party members get 80% of the XP (bonus for grouping), killer gets full.
fn award_xp_with_party(state: &Arc<AppState>, killer_id: &Uuid, xp: u64) {
    // Check if killer is in a party
    if let Some(party_id) = state.player_party.get(killer_id) {
        let pid = *party_id.value();
        drop(party_id);
        if let Some(members) = state.parties.get(&pid) {
            let member_count = members.len() as u64;
            // Bonus XP for party: each member gets xp * 0.8 / member_count (minimum 1)
            let share = (xp * 80 / (member_count * 100)).max(1);
            for mid in members.value() {
                let amount = if *mid == *killer_id { xp } else { share };
                if let Some(mut player) = state.players.get_mut(mid) {
                    player.xp += amount;
                    let leveled = check_and_apply_level_up(&mut player, state);
                    drop(player);
                    send_stats_update_by_id(state, mid);
                    if leveled {
                        let msg = json!({
                            "type": MSG_LEVEL_UP,
                            "payload": {}
                        }).to_string();
                        state.send_to(mid, &msg);
                    }
                }
            }
            return;
        }
    }
    // Solo player — give full XP
    if let Some(mut player) = state.players.get_mut(killer_id) {
        player.xp += xp;
        let leveled = check_and_apply_level_up(&mut player, state);
        drop(player);
        send_stats_update_by_id(state, killer_id);
        if leveled {
            let msg = json!({
                "type": MSG_LEVEL_UP,
                "payload": {}
            }).to_string();
            state.send_to(killer_id, &msg);
        }
    }
}

/// Centralized level-up handler. Grants stat points instead of auto-allocating.
/// Returns true if the player leveled up.
fn check_and_apply_level_up(player: &mut PlayerData, state: &Arc<AppState>) -> bool {
    let mut leveled = false;

    while player.xp >= player.xp_to_next_level() {
        let xp_needed = player.xp_to_next_level();
        player.level += 1;
        player.xp -= xp_needed;
        player.pvp_protection = player.level < 10;

        // Small base gains per level (diminishing) — the bulk comes from stat point allocation
        let dim_factor = if player.level <= 50 {
            1.0 - player.level as f64 * 0.005
        } else {
            0.75 * (50.0 / player.level as f64).powf(0.6)
        };
        player.max_hp += (5.0 * dim_factor) as i32;
        player.max_mp += (3.0 * dim_factor) as i32;

        // Grant stat points (3 per level, +1 bonus every 5 levels)
        let bonus = if player.level % 5 == 0 { 1 } else { 0 };
        player.stat_points += 3 + bonus;
        player.skill_points += 1;

        leveled = true;
        info!("Player {} leveled up to {}! ({} stat points available)", player.username, player.level, player.stat_points);
    }

    if leveled {
        // Full heal on level up
        player.hp = player.max_hp;
        player.mp = player.max_mp;
        check_title_unlocks(player);

        let level_msg = json!({
            "type": MSG_LEVEL_UP,
            "payload": {
                "level": player.level,
                "statPoints": player.stat_points,
            }
        }).to_string();
        state.send_to(&player.id, &level_msg);
    }

    leveled
}

/// Check and unlock titles based on player stats. Mutates PlayerData directly —
/// safe to call while holding a DashMap get_mut guard (does no DashMap access).
fn check_title_unlocks(player: &mut PlayerData) -> Vec<String> {
    let mut newly_unlocked = Vec::new();

    let checks: &[(&str, bool)] = &[
        ("novice",     player.level >= 5),
        ("adventurer", player.level >= 10),
        ("veteran",    player.level >= 25),
        ("champion",   player.level >= 50),
        ("legend",     player.level >= 100),
        ("artisan",    player.crafts_count >= 100),
        ("merchant",   player.gold >= 100_000),
        ("angler",     player.fish_caught >= 50),
        ("collector",  {
            let unique_count = player.inventory.iter()
                .filter_map(|slot| slot.as_ref())
                .map(|item| item.template_id.as_str())
                .collect::<HashSet<&str>>()
                .len();
            unique_count >= 50
        }),
    ];

    for &(title_id, condition) in checks {
        if condition && !player.unlocked_titles.iter().any(|t| t == title_id) {
            player.unlocked_titles.push(title_id.to_string());
            newly_unlocked.push(title_id.to_string());
        }
    }

    newly_unlocked
}

/// Send a MSG_TITLE_UPDATE to the player with their current title state.
fn send_title_update(state: &Arc<AppState>, player_id: &Uuid) {
    if let Some(player) = state.players.get(player_id) {
        let titles_info: Vec<serde_json::Value> = protocol::TITLES.iter().map(|(id, display, desc)| {
            json!({
                "id": id,
                "name": display,
                "description": desc,
                "unlocked": player.unlocked_titles.iter().any(|t| t == id),
            })
        }).collect();
        let msg = json!({
            "type": MSG_TITLE_UPDATE,
            "payload": {
                "activeTitle": player.active_title,
                "unlockedTitles": player.unlocked_titles,
                "titles": titles_info,
            }
        }).to_string();
        state.send_to(player_id, &msg);
    }
}

fn handle_set_title(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let title_id = match payload.get("titleId").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return,
    };

    // Allow clearing the active title by passing ""
    if title_id.is_empty() {
        if let Some(mut player) = state.players.get_mut(&player_id) {
            player.active_title = String::new();
        }
        send_title_update(state, &player_id);
        return;
    }

    // Validate title exists in the catalog
    if !protocol::TITLES.iter().any(|(id, _, _)| *id == title_id) {
        let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Unknown title.","channel":"system"}}).to_string();
        state.send_to(&player_id, &msg);
        return;
    }

    if let Some(mut player) = state.players.get_mut(&player_id) {
        if player.unlocked_titles.iter().any(|t| t == title_id) {
            player.active_title = title_id.to_string();
        } else {
            drop(player);
            let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"You haven't unlocked that title yet.","channel":"system"}}).to_string();
            state.send_to(&player_id, &msg);
            return;
        }
    }

    send_title_update(state, &player_id);
}

fn handle_leaderboard_request(state: &Arc<AppState>, player_id: Uuid) {
    // Collect all online players' stats for leaderboard
    let mut level_entries = Vec::new();
    let mut kill_entries = Vec::new();
    let mut gold_entries = Vec::new();
    let mut achievement_entries = Vec::new();

    for entry in state.players.iter() {
        let p = entry.value();
        let name = p.username.clone();
        let class_name = p.class.clone();
        level_entries.push(json!({"name": name, "class": class_name, "value": p.level}));
        kill_entries.push(json!({"name": name, "class": class_name, "value": p.stats_tracker.enemies_killed}));
        gold_entries.push(json!({"name": name, "class": class_name, "value": p.gold}));
        let ach_count = p.achievements.len();
        achievement_entries.push(json!({"name": name, "class": class_name, "value": ach_count}));
    }

    // Sort descending by value
    level_entries.sort_by(|a, b| b["value"].as_u64().unwrap_or(0).cmp(&a["value"].as_u64().unwrap_or(0)));
    kill_entries.sort_by(|a, b| b["value"].as_u64().unwrap_or(0).cmp(&a["value"].as_u64().unwrap_or(0)));
    gold_entries.sort_by(|a, b| b["value"].as_u64().unwrap_or(0).cmp(&a["value"].as_u64().unwrap_or(0)));
    achievement_entries.sort_by(|a, b| b["value"].as_u64().unwrap_or(0).cmp(&a["value"].as_u64().unwrap_or(0)));

    // Top 20
    level_entries.truncate(20);
    kill_entries.truncate(20);
    gold_entries.truncate(20);
    achievement_entries.truncate(20);

    let msg = json!({
        "type": MSG_LEADERBOARD_DATA,
        "payload": {
            "level": level_entries,
            "kills": kill_entries,
            "gold": gold_entries,
            "achievements": achievement_entries,
        }
    }).to_string();
    state.send_to(&player_id, &msg);
}

// ─── Auction House Handler ──────────────────────────────────

fn handle_auction_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "list" => {
            // List an item from inventory for sale
            let slot_index = match payload.get("slotIndex").and_then(|v| v.as_u64()) {
                Some(i) => i as usize,
                None => return,
            };
            let price = match payload.get("price").and_then(|v| v.as_u64()) {
                Some(p) if p > 0 => p,
                _ => return,
            };

            // Check listing limit
            let player_listings: usize = state.auction_listings.iter()
                .filter(|e| e.value().seller_id == player_id)
                .count();
            if player_listings >= AUCTION_MAX_LISTINGS {
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "Auction", "text": format!("Max {} active listings!", AUCTION_MAX_LISTINGS), "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
                return;
            }

            // Calculate listing fee (5% of price, minimum 1 gold)
            let fee = ((price as f64 * AUCTION_TAX_RATE).ceil() as u64).max(1);

            // Extract item and deduct fee
            let (item, seller_name) = {
                let mut player = match state.players.get_mut(&player_id) {
                    Some(p) => p,
                    None => return,
                };
                if player.gold < fee {
                    drop(player);
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "Auction", "text": format!("Need {}g listing fee!", fee), "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
                if slot_index >= player.inventory.len() { return; }
                let item = match player.inventory[slot_index].take() {
                    Some(i) => i,
                    None => return,
                };
                player.gold -= fee;
                (item, player.username.clone())
            };

            let tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed);
            let listing = AuctionListing {
                id: Uuid::new_v4(),
                seller_id: player_id,
                seller_name: seller_name.clone(),
                item: item.clone(),
                price,
                listed_at: tick,
                duration: AUCTION_DURATION_TICKS,
            };
            let listing_id = listing.id;
            state.auction_listings.insert(listing_id, listing);

            // Update inventory
            send_inventory_update(state, &player_id);

            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "Auction", "text": format!("Listed {} for {}g ({}g fee)", item.name, price, fee), "channel": "system" }
            }).to_string();
            state.send_to(&player_id, &msg);

            // Broadcast to trade channel
            let trade_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "Trade", "text": format!("{} listed {} for {}g on the Auction House!", seller_name, item.name, price), "channel": "trade" }
            }).to_string();
            state.broadcast(&trade_msg);

            // Send updated listings to player
            send_auction_listings(state, &player_id, None);
            update_daily_quest_progress(state, &player_id, "auction_list", 1);
        }

        "buy" => {
            let listing_id = match payload.get("listingId").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok()) {
                Some(id) => id,
                None => return,
            };

            // Remove listing atomically
            let listing = match state.auction_listings.remove(&listing_id) {
                Some((_, l)) => l,
                None => {
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "Auction", "text": "Item no longer available!", "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
            };

            // Can't buy your own listing
            if listing.seller_id == player_id {
                state.auction_listings.insert(listing_id, listing);
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "Auction", "text": "Can't buy your own listing!", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
                return;
            }

            // Check gold
            {
                let buyer = match state.players.get(&player_id) {
                    Some(p) => p,
                    None => { state.auction_listings.insert(listing_id, listing); return; }
                };
                if buyer.gold < listing.price {
                    drop(buyer);
                    state.auction_listings.insert(listing_id, listing);
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "Auction", "text": "Not enough gold!", "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
            }

            // Transfer: deduct gold from buyer, add item
            {
                let mut buyer = state.players.get_mut(&player_id).unwrap();
                buyer.gold -= listing.price;
                // Find free inventory slot
                let free_slot = buyer.inventory.iter().position(|s| s.is_none());
                if let Some(idx) = free_slot {
                    buyer.inventory[idx] = Some(listing.item.clone());
                } else {
                    // Inventory full — refund
                    buyer.gold += listing.price;
                    drop(buyer);
                    state.auction_listings.insert(listing_id, listing);
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "Auction", "text": "Inventory full!", "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
            }

            // Give gold to seller (if online)
            if let Some(mut seller) = state.players.get_mut(&listing.seller_id) {
                seller.gold += listing.price;
                drop(seller);
                send_stats_update_by_id(state, &listing.seller_id);
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "Auction", "text": format!("Your {} sold for {}g!", listing.item.name, listing.price), "channel": "system" }
                }).to_string();
                state.send_to(&listing.seller_id, &msg);
            }

            send_inventory_update(state, &player_id);

            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "Auction", "text": format!("Bought {} for {}g!", listing.item.name, listing.price), "channel": "system" }
            }).to_string();
            state.send_to(&player_id, &msg);

            send_auction_listings(state, &player_id, None);
        }

        "cancel" => {
            let listing_id = match payload.get("listingId").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok()) {
                Some(id) => id,
                None => return,
            };

            // Only owner can cancel
            let listing = match state.auction_listings.remove(&listing_id) {
                Some((_, l)) if l.seller_id == player_id => l,
                Some((_, l)) => {
                    state.auction_listings.insert(listing_id, l);
                    return;
                }
                None => return,
            };

            // Return item to inventory
            {
                let mut player = match state.players.get_mut(&player_id) {
                    Some(p) => p,
                    None => return,
                };
                let free_slot = player.inventory.iter().position(|s| s.is_none());
                if let Some(idx) = free_slot {
                    player.inventory[idx] = Some(listing.item.clone());
                } else {
                    drop(player);
                    state.auction_listings.insert(listing_id, listing);
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "Auction", "text": "Inventory full! Can't cancel.", "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
            }

            send_inventory_update(state, &player_id);
            let msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "Auction", "text": format!("Cancelled listing: {}", listing.item.name), "channel": "system" }
            }).to_string();
            state.send_to(&player_id, &msg);
            send_auction_listings(state, &player_id, None);
        }

        "search" | "browse" => {
            let category = payload.get("category").and_then(|v| v.as_str());
            send_auction_listings(state, &player_id, category);
        }

        _ => {}
    }
}

fn send_auction_listings(state: &Arc<AppState>, player_id: &Uuid, category: Option<&str>) {
    let tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed);
    let mut listings: Vec<serde_json::Value> = Vec::new();
    let mut my_listings: Vec<serde_json::Value> = Vec::new();

    for entry in state.auction_listings.iter() {
        let l = entry.value();
        // Skip expired
        if tick - l.listed_at > l.duration { continue; }

        // Filter by category
        if let Some(cat) = category {
            let matches = match cat {
                "weapon" | "Weapon" => l.item.item_type == ItemType::Weapon,
                "armor" | "Armor" => l.item.item_type == ItemType::Armor,
                "consumable" | "Consumable" => l.item.item_type == ItemType::Consumable,
                "material" | "Material" => l.item.item_type == ItemType::Material,
                "all" => true,
                _ => true,
            };
            if !matches { continue; }
        }

        let entry_json = json!({
            "id": l.id.to_string(),
            "item": l.item.to_payload(),
            "price": l.price,
            "seller": l.seller_name,
            "timeLeft": ((l.duration as i64) - (tick as i64 - l.listed_at as i64)).max(0),
        });

        if l.seller_id == *player_id {
            my_listings.push(entry_json);
        } else {
            listings.push(entry_json);
        }
    }

    // Sort by price ascending
    listings.sort_by(|a, b| a["price"].as_u64().unwrap_or(0).cmp(&b["price"].as_u64().unwrap_or(0)));

    let msg = json!({
        "type": MSG_AUCTION_DATA,
        "payload": {
            "listings": listings,
            "myListings": my_listings,
        }
    }).to_string();
    state.send_to(player_id, &msg);
}

fn send_inventory_update(state: &Arc<AppState>, player_id: &Uuid) {
    if let Some(player) = state.players.get(player_id) {
        let inv_msg = json!({
            "type": MSG_INVENTORY_UPDATE,
            "payload": {
                "items": player.inventory_payload(),
                "equipment": player.equipment.iter().map(|(slot, item)| {
                    json!({ "slot": slot, "item": item.to_payload() })
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

fn ground_item_payload(ground_item: &GroundItem) -> serde_json::Value {
    json!({
        "id": ground_item.id.to_string(),
        "templateId": ground_item.item.template_id,
        "name": ground_item.item.name,
        "rarity": ground_item.item.rarity,
        "itemType": format!("{:?}", ground_item.item.item_type),
        "x": ground_item.x,
        "y": ground_item.y,
    })
}

fn broadcast_ground_items(state: &Arc<AppState>, x: f64, y: f64) {
    let items: Vec<serde_json::Value> = state.ground_items.iter()
        .filter(|gi| {
            let dist = ((gi.x - x).powi(2) + (gi.y - y).powi(2)).sqrt();
            dist < 30.0
        })
        .map(|gi| ground_item_payload(gi.value()))
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
    let current_tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed) as f64;
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
            enchant_level: 0,
        };

        let ground_item = GroundItem {
            id: Uuid::new_v4(),
            item,
            x: ox,
            y: oy,
            owner_id: None,
            drop_time: current_tick,
            protection_duration: 0.0,
        };
        state.ground_items.insert(ground_item.id, ground_item);
    }
}

/// Auto-pickup XP orbs within 1.5 tiles of a player during movement.
/// Auto-loot: automatically pick up ground items near players (within 1.5 tiles).
fn auto_loot_items(state: &Arc<AppState>) {
    let player_data: Vec<(Uuid, f64, f64, bool)> = state.players.iter()
        .map(|p| (p.id, p.x, p.y, p.dead))
        .collect();

    let tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed) as f64;

    for (player_id, px, py, dead) in &player_data {
        if *dead { continue; }

        let nearby_items: Vec<Uuid> = state.ground_items.iter()
            .filter(|gi| {
                if gi.item.template_id.starts_with("xp_orb") { return false; }
                let dist = ((gi.x - px).powi(2) + (gi.y - py).powi(2)).sqrt();
                if dist > 1.5 { return false; }
                // Respect ownership protection
                if let Some(owner_id) = gi.owner_id {
                    if owner_id != *player_id && (tick - gi.drop_time) < gi.protection_duration {
                        return false;
                    }
                }
                true
            })
            .map(|gi| gi.id)
            .collect();

        let had_items = !nearby_items.is_empty();
        for item_id in nearby_items {
            if let Some((_, ground_item)) = state.ground_items.remove(&item_id) {
                let item = ground_item.item.clone();
                let gx = ground_item.x;
                let gy = ground_item.y;
                let g_owner = ground_item.owner_id;
                let g_drop_time = ground_item.drop_time;
                let g_prot = ground_item.protection_duration;

                let added = {
                    if let Some(mut player) = state.players.get_mut(player_id) {
                        player.add_item(item.clone())
                    } else {
                        false
                    }
                };

                if added {
                    let pickup_msg = json!({
                        "type": MSG_ITEM_DROP,
                        "payload": { "itemName": item.name, "rarity": item.rarity }
                    }).to_string();
                    state.send_to(player_id, &pickup_msg);
                    send_inventory_update(state, player_id);

                    // Stats tracking
                    if let Some(mut p) = state.players.get_mut(player_id) {
                        p.stats_tracker.items_collected += 1;
                    }
                    check_quest_progress(state, *player_id, "collect", &item.name, 1);
                    check_achievements(state, *player_id);
                } else {
                    // Inventory full — put item back
                    state.ground_items.insert(item_id, GroundItem {
                        id: item_id,
                        item,
                        x: gx, y: gy,
                        owner_id: g_owner,
                        drop_time: g_drop_time,
                        protection_duration: g_prot,
                    });
                }
            }
        }

        // Broadcast ground items update if any picked up
        if had_items {
            broadcast_ground_items(state, *px, *py);
        }
    }
}

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

                    // Check level up (centralized)
                    check_and_apply_level_up(&mut player, state);

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

// ─── Effect Ticking ──────────────────────────────────────────

fn tick_player_effects(state: &Arc<AppState>) {
    let mut effect_events: Vec<(Uuid, String, i32, bool)> = Vec::new(); // (player_id, effect_type_str, value, is_removal)

    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.dead { continue; }

        let mut expired_indices = Vec::new();

        for (i, effect) in player.active_effects.iter_mut().enumerate() {
            let expired = effect.advance();

            // Apply tick effects
            if effect.should_tick() || expired {
                match &effect.effect_type {
                    crate::protocol::StatusEffectType::Poison => {
                        let dmg = effect.value;
                        player.hp = (player.hp - dmg).max(1); // Poison can't kill, leaves at 1 HP
                        effect_events.push((player.id, "Poison".to_string(), dmg, false));
                    }
                    crate::protocol::StatusEffectType::Burn => {
                        let dmg = effect.value;
                        player.hp = (player.hp - dmg).max(0);
                        effect_events.push((player.id, "Burn".to_string(), dmg, false));
                    }
                    crate::protocol::StatusEffectType::Bleed => {
                        let dmg = effect.value;
                        player.hp = (player.hp - dmg).max(0);
                        effect_events.push((player.id, "Bleed".to_string(), dmg, false));
                    }
                    crate::protocol::StatusEffectType::Regen => {
                        let heal = effect.value;
                        player.hp = (player.hp + heal).min(player.max_hp);
                        effect_events.push((player.id, "Regen".to_string(), heal, false));
                    }
                    _ => {} // Other effects are stat modifiers, applied via helper methods
                }
            }

            if expired {
                expired_indices.push(i);
                effect_events.push((player.id, format!("{:?}", effect.effect_type), 0, true));
            }
        }

        // Remove expired effects (reverse order to maintain indices)
        for i in expired_indices.into_iter().rev() {
            player.active_effects.remove(i);
        }

        // Check if burn killed the player
        if player.hp <= 0 && !player.dead {
            player.dead = true;
            player.respawn_timer = 100.0; // 5 seconds
        }

        // Combo timer decay
        if player.combo_timer > 0.0 {
            player.combo_timer -= 1.0;
            if player.combo_timer <= 0.0 {
                player.combo_count = 0;
            }
        }
    }

    // Send effect tick events to clients
    for (player_id, effect_type, value, is_removal) in effect_events {
        if is_removal {
            let msg = serde_json::json!({
                "type": crate::protocol::MSG_EFFECT_REMOVED,
                "payload": { "effectType": effect_type }
            }).to_string();
            state.send_to(&player_id, &msg);
        } else if value != 0 {
            let msg = serde_json::json!({
                "type": crate::protocol::MSG_EFFECT_TICK,
                "payload": { "effectType": effect_type, "value": value }
            }).to_string();
            state.send_to(&player_id, &msg);
        }
    }
}

// ─── Quest System ────────────────────────────────────────────

struct QuestObjectiveDef {
    description: &'static str,
    obj_type: &'static str,    // "kill", "kill_type", "kill_rank", "collect", "craft", "equip", "level", "gold", "visit_biome"
    target: &'static str,      // keyword for kill_type, rank for kill_rank, level number, gold amount, etc.
    count: u32,                // how many times / target amount
}

struct QuestDef {
    id: &'static str,
    title: &'static str,
    description: &'static str,
    icon: &'static str,
    min_level: u32,
    prerequisites: &'static [&'static str],
    objectives: &'static [QuestObjectiveDef],
    reward_xp: u64,
    reward_gold: u64,
    reward_items: &'static [(&'static str, u32, u32)], // (name, rarity, level)
}

// ── Objective arrays for each quest ──

static OBJ_FIRST_BLOOD: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 3 enemies", obj_type: "kill", target: "", count: 3 },
];
static OBJ_GATHERING_WOOD: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Collect 5 Wood materials", obj_type: "collect", target: "wood", count: 5 },
];
static OBJ_SLIME_HUNTER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 5 Slimes", obj_type: "kill_type", target: "slime", count: 5 },
];
static OBJ_LEVEL_UP: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Reach level 3", obj_type: "level", target: "3", count: 1 },
];
static OBJ_EQUIP_ARMOR: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Equip any armor piece", obj_type: "equip", target: "", count: 1 },
];
static OBJ_SKELETON_SCOURGE: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 10 Skeletons", obj_type: "kill_type", target: "skeleton", count: 10 },
];
static OBJ_CRAFT_FIRST: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Craft 3 items", obj_type: "craft", target: "", count: 3 },
];
static OBJ_GOLD_HOARDER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Accumulate 500 gold", obj_type: "gold", target: "500", count: 1 },
];
static OBJ_EXPLORER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Visit 3 different biomes", obj_type: "visit_biome", target: "", count: 3 },
];
static OBJ_DEMON_SLAYER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 5 Demons", obj_type: "kill_type", target: "demon", count: 5 },
];
static OBJ_CHAMPION_HUNTER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 10 champion-rank enemies", obj_type: "kill_rank", target: "champion", count: 10 },
];
static OBJ_MASTER_CRAFTER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Craft 10 items", obj_type: "craft", target: "", count: 10 },
];
static OBJ_ELITE_SLAYER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 5 elite-rank enemies", obj_type: "kill_rank", target: "elite", count: 5 },
];
static OBJ_REACH_20: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Reach level 20", obj_type: "level", target: "20", count: 1 },
];
static OBJ_BOSS_HUNTER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill a boss-rank enemy", obj_type: "kill_rank", target: "boss", count: 1 },
];

// ── New quest objectives ──
static OBJ_FISHERMAN: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Catch 5 fish", obj_type: "craft", target: "", count: 5 },
];
static OBJ_MASTER_ANGLER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Catch 25 fish", obj_type: "craft", target: "", count: 25 },
];
static OBJ_GOBLIN_MENACE: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 15 Goblins", obj_type: "kill_type", target: "goblin", count: 15 },
];
static OBJ_WOLF_PACK: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 10 Wolves", obj_type: "kill_type", target: "wolf", count: 10 },
];
static OBJ_SPIDER_NEST: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 20 Spiders", obj_type: "kill_type", target: "spider", count: 20 },
];
static OBJ_DRAGON_SLAYER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 3 Dragons", obj_type: "kill_type", target: "dragon", count: 3 },
];
static OBJ_COLLECT_IRON: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Collect 20 Iron Ore", obj_type: "collect", target: "iron", count: 20 },
];
static OBJ_COLLECT_GOLD_ORE: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Collect 10 Gold Ore", obj_type: "collect", target: "gold", count: 10 },
];
static OBJ_REACH_30: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Reach level 30", obj_type: "level", target: "30", count: 1 },
];
static OBJ_REACH_50: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Reach level 50", obj_type: "level", target: "50", count: 1 },
];
static OBJ_MASS_SLAYER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 100 enemies", obj_type: "kill", target: "", count: 100 },
];
static OBJ_CRAFT_MASTERY: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Craft 25 items", obj_type: "craft", target: "", count: 25 },
];
static OBJ_UNDEAD_PURGE: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 30 undead enemies", obj_type: "kill_type", target: "skeleton", count: 30 },
];
static OBJ_DEMON_HUNTER: &[QuestObjectiveDef] = &[
    QuestObjectiveDef { description: "Kill 10 Demons", obj_type: "kill_type", target: "demon", count: 10 },
];

static QUEST_CATALOG: &[QuestDef] = &[
    // ─── Starter Chain (level 1-5) ───
    QuestDef {
        id: "first_blood", title: "First Blood",
        description: "Prove yourself by defeating enemies in the wild.",
        icon: "⚔️", min_level: 1, prerequisites: &[],
        objectives: OBJ_FIRST_BLOOD,
        reward_xp: 50, reward_gold: 30, reward_items: &[],
    },
    QuestDef {
        id: "gathering_wood", title: "Gathering Supplies",
        description: "Collect wood materials for the village.",
        icon: "🪵", min_level: 1, prerequisites: &[],
        objectives: OBJ_GATHERING_WOOD,
        reward_xp: 75, reward_gold: 40, reward_items: &[],
    },
    QuestDef {
        id: "slime_hunter", title: "Slime Hunter",
        description: "The slime population is out of control. Thin their numbers.",
        icon: "🟢", min_level: 1, prerequisites: &[],
        objectives: OBJ_SLIME_HUNTER,
        reward_xp: 100, reward_gold: 60, reward_items: &[("Health Potion", 0, 1)],
    },
    QuestDef {
        id: "level_up", title: "Growing Stronger",
        description: "Train and grow stronger. Reach level 3.",
        icon: "⬆️", min_level: 1, prerequisites: &[],
        objectives: OBJ_LEVEL_UP,
        reward_xp: 150, reward_gold: 100, reward_items: &[],
    },
    QuestDef {
        id: "equip_armor", title: "Suit Up",
        description: "Equip an armor piece to improve your defenses.",
        icon: "🛡️", min_level: 1, prerequisites: &[],
        objectives: OBJ_EQUIP_ARMOR,
        reward_xp: 100, reward_gold: 50, reward_items: &[],
    },
    // ─── Mid Chain (level 5-15) ───
    QuestDef {
        id: "skeleton_scourge", title: "Skeleton Scourge",
        description: "An undead menace plagues the land. Destroy the skeletons.",
        icon: "💀", min_level: 5, prerequisites: &["first_blood"],
        objectives: OBJ_SKELETON_SCOURGE,
        reward_xp: 300, reward_gold: 200, reward_items: &[],
    },
    QuestDef {
        id: "craft_first", title: "Apprentice Crafter",
        description: "Learn the art of crafting by creating items.",
        icon: "🔨", min_level: 3, prerequisites: &[],
        objectives: OBJ_CRAFT_FIRST,
        reward_xp: 250, reward_gold: 150, reward_items: &[],
    },
    QuestDef {
        id: "gold_hoarder", title: "Gold Hoarder",
        description: "Amass a fortune of 500 gold pieces.",
        icon: "💰", min_level: 3, prerequisites: &[],
        objectives: OBJ_GOLD_HOARDER,
        reward_xp: 400, reward_gold: 100, reward_items: &[],
    },
    QuestDef {
        id: "explorer", title: "Explorer",
        description: "Venture into the unknown and discover different biomes.",
        icon: "🗺️", min_level: 3, prerequisites: &[],
        objectives: OBJ_EXPLORER,
        reward_xp: 350, reward_gold: 200, reward_items: &[],
    },
    QuestDef {
        id: "demon_slayer", title: "Demon Slayer",
        description: "Demons threaten the realm. Vanquish them.",
        icon: "👹", min_level: 8, prerequisites: &[],
        objectives: OBJ_DEMON_SLAYER,
        reward_xp: 500, reward_gold: 300, reward_items: &[("Iron Sword", 1, 5)],
    },
    // ─── Advanced Chain (level 15+) ───
    QuestDef {
        id: "champion_hunter", title: "Champion Hunter",
        description: "Seek out and defeat powerful champion-rank enemies.",
        icon: "⭐", min_level: 10, prerequisites: &[],
        objectives: OBJ_CHAMPION_HUNTER,
        reward_xp: 800, reward_gold: 500, reward_items: &[],
    },
    QuestDef {
        id: "master_crafter", title: "Master Crafter",
        description: "Hone your craft. Create many items to prove your mastery.",
        icon: "⚒️", min_level: 10, prerequisites: &["craft_first"],
        objectives: OBJ_MASTER_CRAFTER,
        reward_xp: 600, reward_gold: 400, reward_items: &[],
    },
    QuestDef {
        id: "elite_slayer", title: "Elite Slayer",
        description: "Only the bravest dare challenge elite enemies.",
        icon: "💎", min_level: 15, prerequisites: &[],
        objectives: OBJ_ELITE_SLAYER,
        reward_xp: 1200, reward_gold: 800, reward_items: &[],
    },
    QuestDef {
        id: "reach_20", title: "Veteran Adventurer",
        description: "Achieve the rank of veteran by reaching level 20.",
        icon: "🌟", min_level: 10, prerequisites: &[],
        objectives: OBJ_REACH_20,
        reward_xp: 2000, reward_gold: 1000, reward_items: &[],
    },
    QuestDef {
        id: "boss_hunter", title: "Boss Hunter",
        description: "Face the ultimate challenge: defeat a boss-rank enemy.",
        icon: "👑", min_level: 15, prerequisites: &["first_blood"],
        objectives: OBJ_BOSS_HUNTER,
        reward_xp: 3000, reward_gold: 2000, reward_items: &[("Dragon Sword", 3, 15)],
    },
    // ── New Quests ──
    QuestDef {
        id: "goblin_menace", title: "Goblin Menace",
        description: "The goblins are raiding trade routes. Thin their numbers!",
        icon: "👺", min_level: 5, prerequisites: &["first_blood"],
        objectives: OBJ_GOBLIN_MENACE,
        reward_xp: 800, reward_gold: 400, reward_items: &[("Goblin Dagger", 1, 5)],
    },
    QuestDef {
        id: "wolf_pack", title: "Wolf Pack",
        description: "Wolves terrorize travelers. Hunt them down.",
        icon: "🐺", min_level: 4, prerequisites: &["first_blood"],
        objectives: OBJ_WOLF_PACK,
        reward_xp: 600, reward_gold: 300, reward_items: &[("Wolf Pelt Cloak", 1, 4)],
    },
    QuestDef {
        id: "spider_nest", title: "Spider's Nest",
        description: "Clear the spider nest threatening the Eastern Outpost.",
        icon: "🕷️", min_level: 8, prerequisites: &["slime_hunter"],
        objectives: OBJ_SPIDER_NEST,
        reward_xp: 1200, reward_gold: 600, reward_items: &[("Spider Silk Robe", 2, 8)],
    },
    QuestDef {
        id: "fisherman", title: "Gone Fishin'",
        description: "Learn the art of fishing. Catch your first haul!",
        icon: "🎣", min_level: 1, prerequisites: &[],
        objectives: OBJ_FISHERMAN,
        reward_xp: 200, reward_gold: 100, reward_items: &[],
    },
    QuestDef {
        id: "master_angler", title: "Master Angler",
        description: "Become a legendary fisherman. The sea holds many treasures!",
        icon: "🐟", min_level: 5, prerequisites: &["fisherman"],
        objectives: OBJ_MASTER_ANGLER,
        reward_xp: 1500, reward_gold: 800, reward_items: &[("Golden Fishing Rod", 2, 10)],
    },
    QuestDef {
        id: "iron_collector", title: "Iron Will",
        description: "The blacksmiths need iron. Gather ore from the mines.",
        icon: "⛏️", min_level: 6, prerequisites: &["gathering_wood"],
        objectives: OBJ_COLLECT_IRON,
        reward_xp: 700, reward_gold: 350, reward_items: &[("Iron Helm", 1, 6)],
    },
    QuestDef {
        id: "gold_prospector", title: "Gold Prospector",
        description: "Rare gold veins have been spotted. Collect precious ore!",
        icon: "✨", min_level: 12, prerequisites: &["iron_collector"],
        objectives: OBJ_COLLECT_GOLD_ORE,
        reward_xp: 1500, reward_gold: 1000, reward_items: &[("Gold Ring", 2, 12)],
    },
    QuestDef {
        id: "dragon_slayer", title: "Dragon Slayer",
        description: "The ultimate warrior quest: face the dragons in their lair.",
        icon: "🐉", min_level: 20, prerequisites: &["boss_hunter"],
        objectives: OBJ_DRAGON_SLAYER,
        reward_xp: 5000, reward_gold: 3000, reward_items: &[("Dragon Scale Shield", 4, 25)],
    },
    QuestDef {
        id: "champion_hunter", title: "Champion of Champions",
        description: "Prove your worth by defeating 10 champion-rank foes.",
        icon: "🏆", min_level: 12, prerequisites: &["skeleton_scourge"],
        objectives: OBJ_CHAMPION_HUNTER,
        reward_xp: 2000, reward_gold: 1200, reward_items: &[("Champion's Amulet", 3, 15)],
    },
    QuestDef {
        id: "reach_30", title: "Veteran Adventurer",
        description: "Reach level 30 to become a seasoned veteran.",
        icon: "⭐", min_level: 20, prerequisites: &["reach_20"],
        objectives: OBJ_REACH_30,
        reward_xp: 3000, reward_gold: 2000, reward_items: &[("Veteran's Ring", 3, 30)],
    },
    QuestDef {
        id: "reach_50", title: "Legendary Hero",
        description: "Attain the legendary rank of level 50!",
        icon: "🌟", min_level: 30, prerequisites: &["reach_30"],
        objectives: OBJ_REACH_50,
        reward_xp: 10000, reward_gold: 5000, reward_items: &[("Hero's Crown", 4, 50)],
    },
    QuestDef {
        id: "mass_slayer", title: "One Hundred Foes",
        description: "A true warrior has defeated at least 100 enemies.",
        icon: "💀", min_level: 10, prerequisites: &["first_blood"],
        objectives: OBJ_MASS_SLAYER,
        reward_xp: 2500, reward_gold: 1500, reward_items: &[],
    },
    QuestDef {
        id: "gold_hoarder", title: "Gold Hoarder",
        description: "Accumulate wealth. A merchant's dream!",
        icon: "💰", min_level: 8, prerequisites: &[],
        objectives: OBJ_GOLD_HOARDER,
        reward_xp: 1000, reward_gold: 500, reward_items: &[("Lucky Coin", 2, 8)],
    },
    QuestDef {
        id: "craft_mastery", title: "Master Crafter",
        description: "Master the art of crafting by creating 25 items.",
        icon: "🔨", min_level: 5, prerequisites: &["craft_basics"],
        objectives: OBJ_CRAFT_MASTERY,
        reward_xp: 1500, reward_gold: 800, reward_items: &[("Artisan's Hammer", 2, 10)],
    },
    QuestDef {
        id: "undead_purge", title: "Undead Purge",
        description: "Cleanse the catacombs of the undead scourge.",
        icon: "☠️", min_level: 10, prerequisites: &["skeleton_scourge"],
        objectives: OBJ_UNDEAD_PURGE,
        reward_xp: 2000, reward_gold: 1000, reward_items: &[("Holy Water", 2, 10)],
    },
    QuestDef {
        id: "demon_hunter", title: "Demon Hunter",
        description: "Dark forces stir in the Infernal Wastes. Banish them!",
        icon: "😈", min_level: 18, prerequisites: &["elite_slayer"],
        objectives: OBJ_DEMON_HUNTER,
        reward_xp: 3000, reward_gold: 2000, reward_items: &[("Demon Fang Blade", 3, 20)],
    },
];

fn handle_quest_accept(state: &Arc<AppState>, player_id: Uuid, quest_id: &str) {
    let quest_def = match QUEST_CATALOG.iter().find(|q| q.id == quest_id) {
        Some(q) => q,
        None => return,
    };

    {
        let mut player = match state.players.get_mut(&player_id) {
            Some(p) => p,
            None => return,
        };

        // Check if already active or completed
        if player.active_quests.iter().any(|q| q.quest_id == quest_id) { return; }
        if player.completed_quests.contains(&quest_id.to_string()) { return; }
        if player.level < quest_def.min_level { return; }
        for prereq in quest_def.prerequisites {
            if !player.completed_quests.contains(&prereq.to_string()) { return; }
        }
        if player.active_quests.len() >= 5 { return; }

        let active_quest = ActiveQuest {
            quest_id: quest_id.to_string(),
            objectives_progress: vec![0; quest_def.objectives.len()],
            status: "active".to_string(),
        };
        player.active_quests.push(active_quest);
    } // DashMap guard dropped

    // Evaluate current state immediately (fixes "level quest stuck" bug)
    check_quest_progress(state, player_id, "level", "", 0);
    check_quest_progress(state, player_id, "gold", "", 0);
    check_quest_progress(state, player_id, "visit_biome", "", 0);

    send_quest_update(state, player_id);
}

fn handle_quest_turn_in(state: &Arc<AppState>, player_id: Uuid, quest_id: &str) {
    let quest_def = match QUEST_CATALOG.iter().find(|q| q.id == quest_id) {
        Some(q) => q,
        None => return,
    };

    {
        let mut player = match state.players.get_mut(&player_id) {
            Some(p) => p,
            None => return,
        };

        let quest_idx = match player.active_quests.iter().position(|q| q.quest_id == quest_id && q.status == "turnIn") {
            Some(idx) => idx,
            None => return,
        };

        player.active_quests.remove(quest_idx);
        player.completed_quests.push(quest_id.to_string());

        // Rewards
        player.xp += quest_def.reward_xp;
        player.gold += quest_def.reward_gold;
        player.stats_tracker.quests_completed += 1;
        player.stats_tracker.gold_earned += quest_def.reward_gold;

        for &(name, rarity, level) in quest_def.reward_items {
            if let Some(empty_slot) = player.inventory.iter().position(|s| s.is_none()) {
                let item = if name.to_lowercase().contains("potion") {
                    Item::new_consumable(name, rarity as u8, 1)
                } else {
                    Item::new_weapon(name, rarity as u8, level, (level as i32) * 3 + (rarity as i32) * 5)
                };
                player.inventory[empty_slot] = Some(item);
            }
        }

        check_and_apply_level_up(&mut player, state);
    } // DashMap guard dropped

    send_quest_update(state, player_id);
    send_stats_update_by_id(state, &player_id);
    send_inventory_update(state, &player_id);
    check_quest_progress(state, player_id, "level", "", 0);
    check_quest_progress(state, player_id, "gold", "", 0);
    check_achievements(state, player_id);
}

fn handle_quest_list_request(state: &Arc<AppState>, player_id: Uuid, sender: &mpsc::UnboundedSender<String>) {
    let player = match state.players.get(&player_id) {
        Some(p) => p,
        None => return,
    };

    let mut available = Vec::new();
    for quest_def in QUEST_CATALOG.iter() {
        if player.active_quests.iter().any(|q| q.quest_id == quest_def.id) { continue; }
        if player.completed_quests.contains(&quest_def.id.to_string()) { continue; }
        if player.level < quest_def.min_level { continue; }
        let prereqs_met = quest_def.prerequisites.iter().all(|p| player.completed_quests.contains(&p.to_string()));
        if !prereqs_met { continue; }

        available.push(json!({
            "id": quest_def.id,
            "title": quest_def.title,
            "description": quest_def.description,
            "icon": quest_def.icon,
            "minLevel": quest_def.min_level,
            "objectives": quest_def.objectives.iter().map(|o| json!({
                "description": o.description,
                "count": o.count,
            })).collect::<Vec<serde_json::Value>>(),
            "rewardXp": quest_def.reward_xp,
            "rewardGold": quest_def.reward_gold,
        }));
    }

    let active: Vec<serde_json::Value> = player.active_quests.iter().filter_map(|aq| {
        let def = QUEST_CATALOG.iter().find(|q| q.id == aq.quest_id)?;
        Some(json!({
            "id": aq.quest_id,
            "title": def.title,
            "description": def.description,
            "icon": def.icon,
            "status": aq.status,
            "objectives": def.objectives.iter().enumerate().map(|(i, o)| json!({
                "description": o.description,
                "current": aq.objectives_progress.get(i).unwrap_or(&0),
                "target": o.count,
            })).collect::<Vec<serde_json::Value>>(),
            "rewardXp": def.reward_xp,
            "rewardGold": def.reward_gold,
        }))
    }).collect();

    let completed: Vec<serde_json::Value> = player.completed_quests.iter().filter_map(|qid| {
        let def = QUEST_CATALOG.iter().find(|q| q.id == qid.as_str())?;
        Some(json!({ "id": qid, "title": def.title, "icon": def.icon }))
    }).collect();

    drop(player); // release DashMap Ref

    let msg = json!({
        "type": MSG_QUEST_LIST,
        "payload": {
            "available": available,
            "active": active,
            "completed": completed,
        }
    }).to_string();
    let _ = sender.send(msg);
}

fn send_quest_update(state: &Arc<AppState>, player_id: Uuid) {
    let active: Vec<serde_json::Value> = {
        let player = match state.players.get(&player_id) {
            Some(p) => p,
            None => return,
        };
        player.active_quests.iter().filter_map(|aq| {
            let def = QUEST_CATALOG.iter().find(|q| q.id == aq.quest_id)?;
            Some(json!({
                "id": aq.quest_id,
                "title": def.title,
                "icon": def.icon,
                "status": aq.status,
                "objectives": def.objectives.iter().enumerate().map(|(i, o)| json!({
                    "description": o.description,
                    "current": aq.objectives_progress.get(i).unwrap_or(&0),
                    "target": o.count,
                })).collect::<Vec<serde_json::Value>>(),
                "rewardXp": def.reward_xp,
                "rewardGold": def.reward_gold,
            }))
        }).collect()
    }; // DashMap Ref dropped

    let msg = json!({
        "type": MSG_QUEST_UPDATE,
        "payload": { "activeQuests": active }
    }).to_string();
    state.send_to(&player_id, &msg);
}

/// Check quest progress — MUST be called WITHOUT holding any DashMap guard on player_id
fn check_quest_progress(state: &Arc<AppState>, player_id: Uuid, event_type: &str, event_target: &str, count: u32) {
    let mut any_changed = false;

    {
        let mut player = match state.players.get_mut(&player_id) {
            Some(p) => p,
            None => return,
        };

        // Capture immutable state before mutable iteration
        let player_level = player.level;
        let player_gold = player.gold;
        let biomes_count = player.stats_tracker.biomes_visited.len() as u32;

        for aq in player.active_quests.iter_mut() {
            if aq.status != "active" { continue; }
            let def = match QUEST_CATALOG.iter().find(|q| q.id == aq.quest_id) {
                Some(d) => d,
                None => continue,
            };

            for (i, obj) in def.objectives.iter().enumerate() {
                if i >= aq.objectives_progress.len() { continue; }
                if aq.objectives_progress[i] >= obj.count { continue; }

                let matches = match obj.obj_type {
                    "kill" => event_type == "kill",
                    "kill_type" => event_type == "kill_type" && event_target.to_lowercase().contains(obj.target),
                    "kill_rank" => event_type == "kill_rank" && event_target == obj.target,
                    "craft" => event_type == "craft",
                    "collect" => event_type == "collect",
                    "equip" => event_type == "equip",
                    "level" => {
                        let target_level: u32 = obj.target.parse().unwrap_or(0);
                        player_level >= target_level
                    },
                    "gold" => {
                        let target_gold: u64 = obj.target.parse().unwrap_or(0);
                        player_gold >= target_gold
                    },
                    "visit_biome" => biomes_count >= obj.count,
                    _ => false,
                };

                if matches {
                    if obj.obj_type == "level" || obj.obj_type == "gold" {
                        aq.objectives_progress[i] = obj.count;
                    } else if obj.obj_type == "visit_biome" {
                        aq.objectives_progress[i] = biomes_count;
                    } else {
                        aq.objectives_progress[i] = (aq.objectives_progress[i] + count).min(obj.count);
                    }
                    any_changed = true;
                }
            }

            let all_complete = def.objectives.iter().enumerate().all(|(i, obj)| {
                aq.objectives_progress.get(i).unwrap_or(&0) >= &obj.count
            });
            if all_complete && aq.status == "active" {
                aq.status = "turnIn".to_string();
                any_changed = true;
            }
        }
    } // DashMap guard dropped

    if any_changed {
        send_quest_update(state, player_id);
    }
}

// ─── Achievement System ──────────────────────────────────────

/// Check achievements — MUST be called WITHOUT holding any DashMap guard on player_id
fn check_achievements(state: &Arc<AppState>, player_id: Uuid) {
    let newly_unlocked: Vec<serde_json::Value> = {
        let mut player = match state.players.get_mut(&player_id) {
            Some(p) => p,
            None => return,
        };

        let mut unlocked = Vec::new();
        for ach in ACHIEVEMENT_CATALOG.iter() {
            if player.achievements.contains(&ach.id.to_string()) { continue; }

            let current_value = match ach.tracker {
                "enemies_killed" => player.stats_tracker.enemies_killed,
                "boss_kills" => player.stats_tracker.boss_kills,
                "champion_kills" => player.stats_tracker.champion_kills,
                "elite_kills" => player.stats_tracker.elite_kills,
                "pvp_kills" => player.stats_tracker.pvp_kills,
                "items_crafted" => player.stats_tracker.items_crafted,
                "items_collected" => player.stats_tracker.items_collected,
                "deaths" => player.stats_tracker.deaths,
                "biomes_visited" => player.stats_tracker.biomes_visited.len() as u32,
                "quests_completed" => player.stats_tracker.quests_completed,
                "trades_completed" => player.stats_tracker.trades_completed,
                "gold_earned" => player.stats_tracker.gold_earned as u32,
                "level" => player.level,
                "fish_caught" => player.fish_caught,
                "items_enchanted" => player.items_enchanted,
                "guilds_joined" => player.guilds_joined,
                "guilds_created" => player.guilds_created,
                "bosses_killed" => player.bosses_killed,
                "max_login_streak" => player.max_login_streak,
                "faction_friendly_count" => player.faction_friendly_count,
                "faction_honored_count" => player.faction_honored_count,
                "faction_exalted_count" => player.faction_exalted_count,
                _ => 0,
            };

            if current_value >= ach.target {
                player.achievements.push(ach.id.to_string());
                unlocked.push(json!({
                    "id": ach.id,
                    "title": ach.title,
                    "description": ach.description,
                    "icon": ach.icon,
                    "category": ach.category,
                }));
            }
        }
        unlocked
    }; // DashMap guard dropped

    for achievement in &newly_unlocked {
        let msg = json!({
            "type": MSG_ACHIEVEMENT_UNLOCK,
            "payload": achievement
        }).to_string();
        state.send_to(&player_id, &msg);
    }
}

// ─── NPC Interaction ─────────────────────────────────────────

fn handle_npc_interact(state: &Arc<AppState>, player_id: Uuid, npc_id: &str) {
    // NPC definitions with their dialogue and roles
    let dialogue = match npc_id {
        "shopkeeper" => json!({
            "npcName": "Elara the Shopkeeper",
            "portrait": "🏪",
            "lines": [
                "Welcome, adventurer! Browse my wares.",
                "I buy and sell the finest goods in town.",
            ],
            "actions": [{ "label": "Open Shop", "action": "shop" }],
        }),
        "quest_giver" => json!({
            "npcName": "Captain Aldric",
            "portrait": "⚔️",
            "lines": [
                "Hail, brave soul! The realm needs your help.",
                "There are many tasks that need doing. Check the quest board!",
            ],
            "actions": [{ "label": "View Quests", "action": "quests" }],
        }),
        "blacksmith" => json!({
            "npcName": "Grimjaw the Blacksmith",
            "portrait": "🔨",
            "lines": [
                "Need something forged? I'm your dwarf.",
                "Bring me materials and I'll craft wonders.",
            ],
            "actions": [{ "label": "Open Crafting", "action": "craft" }],
        }),
        "banker" => json!({
            "npcName": "Theron the Banker",
            "portrait": "🏦",
            "lines": [
                "Your valuables are safe with me.",
                "Deposit items to keep them safe from death.",
            ],
            "actions": [{ "label": "Open Bank", "action": "bank" }],
        }),
        "healer" => json!({
            "npcName": "Sister Meridia",
            "portrait": "💚",
            "lines": [
                "Light bless you, traveler.",
                "Rest here and let me tend your wounds.",
            ],
            "actions": [{ "label": "Heal", "action": "heal" }],
        }),
        "arena_master" => json!({
            "npcName": "Brutus the Arena Master",
            "portrait": "🏟️",
            "lines": [
                "Think you're tough? Prove it in the arena!",
                "Fight waves of enemies for glory and loot.",
            ],
            "actions": [{ "label": "Enter Arena", "action": "arena" }],
        }),
        "temple_priest" | "priest" => {
            // Buy next available blessing (bitmask-based)
            let bless_cost = 500_u64;
            let current_blessings = state.players.get(&player_id).map(|p| p.blessings).unwrap_or(0);
            let blessing_count = current_blessings.count_ones();

            if blessing_count >= 5 {
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "Temple", "text": "You already have all 5 blessings.", "channel": "system" }
                }).to_string();
                state.send_to(&player_id, &msg);
            } else {
                let can_afford = state.players.get(&player_id).map(|p| p.gold >= bless_cost).unwrap_or(false);
                if can_afford {
                    if let Some(mut p) = state.players.get_mut(&player_id) {
                        // Find next unowned blessing bit
                        let mut next_bit = 0u8;
                        for i in 0..5u8 {
                            if p.blessings & (1 << i) == 0 {
                                next_bit = i;
                                break;
                            }
                        }
                        p.gold -= bless_cost;
                        p.blessings |= 1 << next_bit;
                        let b = p.blessings.count_ones();
                        drop(p);
                        send_stats_update_by_id(state, &player_id);
                        let msg = json!({
                            "type": MSG_CHAT_MESSAGE,
                            "payload": { "sender": "Temple", "text": format!("Blessing received ({}/5). Death penalty reduced.", b), "channel": "system" }
                        }).to_string();
                        state.send_to(&player_id, &msg);
                    }
                } else {
                    let msg = json!({
                        "type": MSG_CHAT_MESSAGE,
                        "payload": { "sender": "Temple", "text": format!("You need {}g for a blessing. ({}/5 blessings)", bless_cost, blessing_count), "channel": "system" }
                    }).to_string();
                    state.send_to(&player_id, &msg);
                }
            }

            json!({
                "npcName": "High Priest Auriel",
                "portrait": "⛪",
                "lines": [
                    format!("Blessings protect you from death's toll ({}/5).", blessing_count),
                    format!("Each blessing reduces death penalties. Cost: {}g.", bless_cost),
                ],
                "actions": [{ "label": "Buy Blessing", "action": "bless" }],
            })
        }
        _ => json!({
            "npcName": "Villager",
            "portrait": "👤",
            "lines": ["Nice weather we're having.", "Be careful out there, adventurer!"],
            "actions": [],
        }),
    };

    let msg = json!({
        "type": MSG_NPC_DIALOGUE,
        "payload": {
            "npcId": npc_id,
            "dialogue": dialogue,
        }
    }).to_string();
    state.send_to(&player_id, &msg);
}

// ─── World Boss System ────────────────────────────────────────

fn try_spawn_world_boss(state: &Arc<AppState>, _tick: u64) {
    use rand::Rng;
    let mut rng = rand::thread_rng();

    // Only spawn if no boss is currently alive
    let has_boss = state.enemies.iter().any(|e| matches!(e.rank, protocol::EnemyRank::Boss) && e.hp > 0);
    if has_boss { return; }

    // 30% chance per check to spawn a boss
    if rng.r#gen::<f64>() > 0.30 { return; }

    let boss_idx = rng.gen_range(0..WORLD_BOSSES.len());
    let boss_def = &WORLD_BOSSES[boss_idx];

    let base_hp = (200.0 * boss_def.hp_mult) as i32;
    let base_atk = (15.0 * boss_def.atk_mult) as i32;
    let base_def = (10.0 * boss_def.def_mult) as i32;

    let enemy_id = Uuid::new_v4();
    let full_name = format!("{} {}", boss_def.name, boss_def.title);

    let enemy = EnemyData {
        id: enemy_id,
        name: full_name.clone(),
        x: boss_def.spawn_x,
        y: boss_def.spawn_y,
        hp: base_hp,
        max_hp: base_hp,
        level: boss_def.base_level,
        atk: base_atk,
        def: base_def,
        xp_reward: (boss_def.base_level as u64) * 50 + 500,
        patrol_center_x: boss_def.spawn_x,
        patrol_center_y: boss_def.spawn_y,
        patrol_radius: 8.0,
        aggro_range: 15.0,
        state: EnemyState::Idle,
        target_player: None,
        rank: protocol::EnemyRank::Boss,
        modifiers: boss_def.modifiers.to_vec(),
        attack_cooldown: 0.0,
        flee_cooldown: 0.0,
        stun_ticks: 0,
    };

    state.enemies.insert(enemy_id, enemy);

    // Broadcast spawn to all players
    let spawn_msg = json!({
        "type": MSG_WORLD_BOSS_SPAWN,
        "payload": {
            "name": boss_def.name,
            "title": boss_def.title,
            "x": boss_def.spawn_x,
            "y": boss_def.spawn_y,
            "level": boss_def.base_level,
        }
    }).to_string();
    state.broadcast(&spawn_msg);

    info!("🌟 World Boss spawned: {} at ({}, {})", full_name, boss_def.spawn_x, boss_def.spawn_y);
}

// ─── Game Loop ───────────────────────────────────────────────

fn update_weather(state: &Arc<AppState>, tick: u64) {
    let weathers = ["clear", "cloudy", "rain", "storm", "fog", "snow"];
    let icons = ["☀️", "⛅", "🌧️", "⛈️", "🌫️", "❄️"];
    let idx = ((tick / 2400) % weathers.len() as u64) as usize;
    let weather = weathers[idx];
    let icon = icons[idx];

    let msg = json!({
        "type": protocol::MSG_WEATHER_UPDATE,
        "payload": {
            "weather": weather,
            "icon": icon,
            "intensity": if weather == "storm" { 0.8 } else if weather == "rain" || weather == "snow" { 0.5 } else { 0.3 },
        }
    }).to_string();
    state.broadcast(&msg);
}

fn trigger_world_event(state: &Arc<AppState>) {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let events = [
        ("⚔️ Double XP Event!", "All XP gains are doubled for the next 5 minutes!", "double_xp"),
        ("💰 Gold Rush!", "Enemies drop double gold for the next 5 minutes!", "gold_rush"),
        ("🌟 Rare Spawn Wave!", "Elite and boss enemies are spawning across the realm!", "rare_spawn"),
        ("🛡️ Defense Blessing!", "All heroes gain a temporary defense boost!", "defense_buff"),
        ("⚡ Monster Invasion!", "A wave of powerful monsters has appeared!", "invasion"),
        ("🎁 Lucky Hour!", "Drop rates increased for the next 5 minutes!", "lucky_hour"),
        ("🏰 Town Merchants Sale!", "All healing and shops give bonus effects!", "merchant_sale"),
        ("🔥 Elemental Surge!", "Elemental enemies grow stronger but drop better loot!", "elemental_surge"),
        ("⭐ Blessing of Stars!", "All XP and gold gains increased by 50%!", "star_blessing"),
        ("🎯 Hunter's Mark!", "Enemies have reduced HP for the next 5 minutes!", "hunters_mark"),
        ("💎 Treasure Rain!", "Enemies drop rare materials for the next 5 minutes!", "treasure_rain"),
        ("🌙 Blood Moon!", "Enemies deal more damage but give triple XP!", "blood_moon"),
    ];
    let event = events[rng.gen_range(0..events.len())];
    
    let tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed);
    let duration = 6000u64; // 5 minutes at 20 tps
    
    // Store active world event
    if let Ok(mut we) = state.active_world_event.write() {
        *we = Some((event.2, tick + duration));
    }
    
    // Broadcast event announcement
    let msg = json!({
        "type": protocol::MSG_CHAT_MESSAGE,
        "payload": {
            "sender": "🌍 World Event",
            "text": format!("{} {}", event.0, event.1),
            "channel": "system",
        }
    }).to_string();
    state.broadcast(&msg);
    
    // Broadcast active event info for HUD display
    let event_hud_msg = json!({
        "type": protocol::MSG_WORLD_EVENT_ACTIVE,
        "payload": {
            "event_type": event.2,
            "duration_ms": duration * 50,
        }
    }).to_string();
    state.broadcast(&event_hud_msg);
    
    // Apply immediate effects
    match event.2 {
        "defense_buff" => {
            for mut entry in state.players.iter_mut() {
                let p = entry.value_mut();
                p.apply_effect(crate::protocol::ActiveEffect::new(
                    crate::protocol::StatusEffectType::Shield,
                    15, 6000, 6000, "world_event",
                ));
            }
        }
        "rare_spawn" => {
            // Spawn elite + boss enemies near random players
            let player_positions: Vec<(f64, f64)> = state.players.iter()
                .filter(|p| !p.dead)
                .map(|p| (p.x, p.y))
                .collect();
            for (px, py) in player_positions.iter().take(8) {
                for _ in 0..2 {
                    let ex = px + rng.gen_range(-12.0..12.0);
                    let ey = py + rng.gen_range(-12.0..12.0);
                    let zone_level = rng.gen_range(20..45);
                    let biome = state.world.get_biome(ex, ey);
                    let mut enemy = crate::enemy::generate_enemy(ex, ey, zone_level, &biome);
                    if rng.gen_range(0..3) == 0 {
                        enemy.rank = crate::protocol::EnemyRank::Boss;
                        enemy.hp = (enemy.hp as f64 * 3.0) as i32;
                        enemy.atk = (enemy.atk as f64 * 2.0) as i32;
                    } else {
                        enemy.rank = crate::protocol::EnemyRank::Elite;
                        enemy.hp = (enemy.hp as f64 * 2.0) as i32;
                        enemy.atk = (enemy.atk as f64 * 1.5) as i32;
                    }
                    enemy.max_hp = enemy.hp;
                    enemy.name = format!("⭐ Rare {}", enemy.name);
                    state.enemies.insert(enemy.id, enemy);
                }
            }
        }
        "merchant_sale" => {
            // Heal all alive players to full + give a small buff
            for mut entry in state.players.iter_mut() {
                let p = entry.value_mut();
                if !p.dead {
                    p.hp = p.max_hp;
                    p.mp = p.max_mp;
                    p.apply_effect(crate::protocol::ActiveEffect::new(
                        crate::protocol::StatusEffectType::Regen,
                        5, 6000, 6000, "merchant_blessing",
                    ));
                }
            }
        }
        "hunters_mark" => {
            // Reduce HP of all alive enemies by 20%
            for mut entry in state.enemies.iter_mut() {
                let e = entry.value_mut();
                if e.hp > 0 {
                    let reduction = (e.hp as f64 * 0.2) as i32;
                    e.hp = (e.hp - reduction).max(1);
                }
            }
        }
        "blood_moon" => {
            // Buff all enemies' attack
            for mut entry in state.enemies.iter_mut() {
                let e = entry.value_mut();
                if e.hp > 0 {
                    e.atk = (e.atk as f64 * 1.5) as i32;
                }
            }
        }
        "invasion" => {
            // Spawn extra powerful enemies near random players
            let player_positions: Vec<(f64, f64)> = state.players.iter()
                .filter(|p| !p.dead)
                .map(|p| (p.x, p.y))
                .collect();
            for (px, py) in player_positions.iter().take(5) {
                for _ in 0..3 {
                    let ex = px + rng.gen_range(-10.0..10.0);
                    let ey = py + rng.gen_range(-10.0..10.0);
                    let zone_level = rng.gen_range(15..35);
                    let biome = state.world.get_biome(ex, ey);
                    let mut enemy = crate::enemy::generate_enemy(ex, ey, zone_level, &biome);
                    enemy.rank = crate::protocol::EnemyRank::Elite;
                    enemy.hp = (enemy.hp as f64 * 1.5) as i32;
                    enemy.max_hp = enemy.hp;
                    enemy.atk = (enemy.atk as f64 * 1.3) as i32;
                    enemy.name = format!("💎 Invader {}", enemy.name);
                    state.enemies.insert(enemy.id, enemy);
                }
            }
        }
        _ => {}
    }
}

// ─── Blessing System (Tibia-style bitmask) ──────────────────

fn handle_buy_blessing(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let blessing_id = match payload.get("blessing_id").and_then(|v| v.as_u64()) {
        Some(id) if id <= 4 => id as u8,
        _ => {
            let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Invalid blessing ID (0-4).","channel":"system"}}).to_string();
            state.send_to(&player_id, &msg);
            return;
        }
    };

    let costs: [u64; 5] = [10000, 15000, 20000, 25000, 50000];
    let names = ["Adventurer's Blessing", "Spiritual Shielding", "Phoenix Blessing", "Embrace of Tibia", "Twist of Fate"];
    let cost = costs[blessing_id as usize];
    let bit = 1u8 << blessing_id;

    let (already_owned, can_afford) = {
        match state.players.get(&player_id) {
            Some(p) => (p.blessings & bit != 0, p.gold >= cost),
            None => return,
        }
    };

    if already_owned {
        let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"Temple","text": format!("You already own {}.", names[blessing_id as usize]),"channel":"system"}}).to_string();
        state.send_to(&player_id, &msg);
        return;
    }

    if !can_afford {
        let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"Temple","text": format!("{} costs {} gold.", names[blessing_id as usize], cost),"channel":"system"}}).to_string();
        state.send_to(&player_id, &msg);
        return;
    }

    let new_blessings = {
        if let Some(mut p) = state.players.get_mut(&player_id) {
            p.gold -= cost;
            p.blessings |= bit;
            p.blessings
        } else {
            return;
        }
    };

    send_stats_update_by_id(state, &player_id);
    let update_msg = json!({
        "type": MSG_BLESSING_UPDATE,
        "payload": { "blessings": new_blessings }
    }).to_string();
    state.send_to(&player_id, &update_msg);

    let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"Temple","text": format!("You received {}! ({}/5 blessings active).", names[blessing_id as usize], new_blessings.count_ones()),"channel":"system"}}).to_string();
    state.send_to(&player_id, &msg);
}

// ─── Bestiary System (Tibia-style) ──────────────────────────

fn handle_bestiary_request(state: &Arc<AppState>, player_id: Uuid, _payload: &serde_json::Value) {
    let entries: Vec<serde_json::Value> = {
        match state.players.get(&player_id) {
            Some(p) => {
                p.bestiary.iter().map(|(name, kills)| {
                    let tier = match *kills {
                        0..=4 => "unknown",
                        5..=24 => "basic",
                        25..=99 => "detailed",
                        100..=499 => "advanced",
                        _ => "completed",
                    };
                    json!({ "name": name, "kills": kills, "tier": tier })
                }).collect()
            }
            None => return,
        }
    };

    let msg = json!({
        "type": MSG_BESTIARY_DATA,
        "payload": { "entries": entries }
    }).to_string();
    state.send_to(&player_id, &msg);
}

// ─── Stamina System (Tibia-style) ───────────────────────────

fn update_player_stamina(state: &Arc<AppState>, tick: u64) {
    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.dead { continue; }
        // Initialize last_stamina_tick on first call
        if player.last_stamina_tick == 0 {
            player.last_stamina_tick = tick;
            continue;
        }
        // Deduct 1 stamina minute per 1200 ticks (60 seconds at 20 tps)
        if tick >= player.last_stamina_tick + 1200 {
            let elapsed_intervals = (tick - player.last_stamina_tick) / 1200;
            player.stamina_minutes = player.stamina_minutes.saturating_sub(elapsed_intervals as u32);
            player.last_stamina_tick = tick;
        }
    }
}

async fn game_loop(state: Arc<AppState>) {
    let tick_duration = Duration::from_millis(50); // 20 ticks/sec

    loop {
        let tick_start = tokio::time::Instant::now();
        let tick = state.tick_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        // 0. Tick player status effects (every tick for smooth DoT)
        if tick % 1 == 0 {
            tick_player_effects(&state);
        }

        // 1. Move players toward their targets
        update_player_movement(&state);

        // 1b. Auto-pickup XP orbs near players
        pickup_xp_orbs(&state);

        // 1c. Auto-loot items near players (every 5 ticks = 0.25s)
        if tick % 5 == 0 {
            auto_loot_items(&state);
        }

        // 2. Handle dead player respawns
        update_dead_players(&state);

        // 2b. Safe-zone passive regen (every 20 ticks = 1 second)
        if tick % 20 == 0 {
            regen_safe_zone_players(&state);
        }

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

        // 5c. World boss spawn check (every 6000 ticks = 5 minutes)
        if tick % 6000 == 0 && tick > 0 {
            try_spawn_world_boss(&state, tick);
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

        // 8. Weather cycle (every 2400 ticks = 2 minutes)
        if tick % 2400 == 0 {
            update_weather(&state, tick);
        }

        // 9. Random world events (every 6000 ticks = 5 minutes)
        if tick % 6000 == 0 && tick > 0 {
            trigger_world_event(&state);
        }

        // 10. Expire auction listings (every 200 ticks = 10 sec)
        if tick % 200 == 0 {
            expire_auction_listings(&state, tick);
        }

        // 11. Update skull timers (every 20 ticks = 1 sec)
        if tick % 20 == 0 {
            update_skull_timers(&state, tick);
        }

        // 12. Update party buffs (every 40 ticks = 2 sec)
        if tick % 40 == 0 {
            update_party_buffs(&state);
        }

        // 13. Arena matchmaking (every 100 ticks = 5 sec)
        if tick % 100 == 0 {
            process_arena_matchmaking(&state);
        }

        // 14. Daily quest reset check (every 200 ticks = 10 sec)
        if tick % 200 == 0 {
            check_daily_reset(&state, tick);
        }

        // 15. Spawn treasure chests (every 1200 ticks = 60 sec)
        if tick % 1200 == 0 && tick > 0 {
            spawn_treasure_chests(&state, tick);
        }

        // 16. Stamina deduction (every 20 ticks = 1 sec, deduct 1 min per 60s of play via per-player tracking)
        if tick % 20 == 0 {
            update_player_stamina(&state, tick);
        }

        let elapsed = tick_start.elapsed();
        if elapsed < tick_duration {
            tokio::time::sleep(tick_duration - elapsed).await;
        }
    }
}

fn regen_safe_zone_players(state: &Arc<AppState>) {
    let mut healed: Vec<Uuid> = Vec::new();

    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.dead { continue; }
        // Use world's safe zone check (covers all towns)
        if state.world.is_safe_zone(player.x, player.y) && (player.hp < player.max_hp || player.mp < player.max_mp) {
            let hp_regen = (player.max_hp as f64 * 0.05).max(1.0) as i32;
            let mp_regen = (player.max_mp as f64 * 0.05).max(1.0) as i32;
            player.hp = (player.hp + hp_regen).min(player.max_hp);
            player.mp = (player.mp + mp_regen).min(player.max_mp);
            healed.push(player.id);
        }
    }

    for pid in healed {
        send_stats_update_by_id(state, &pid);
    }
}

fn expire_auction_listings(state: &Arc<AppState>, tick: u64) {
    let mut expired: Vec<(Uuid, AuctionListing)> = Vec::new();

    for entry in state.auction_listings.iter() {
        let l = entry.value();
        if tick - l.listed_at > l.duration {
            expired.push((*entry.key(), l.clone()));
        }
    }

    for (id, listing) in expired {
        state.auction_listings.remove(&id);
        // Return item to seller if online
        if let Some(mut seller) = state.players.get_mut(&listing.seller_id) {
            if let Some(idx) = seller.inventory.iter().position(|s| s.is_none()) {
                seller.inventory[idx] = Some(listing.item.clone());
                drop(seller);
                send_inventory_update(state, &listing.seller_id);
                let msg = json!({
                    "type": MSG_CHAT_MESSAGE,
                    "payload": { "sender": "Auction", "text": format!("Listing expired: {} returned to inventory.", listing.item.name), "channel": "system" }
                }).to_string();
                state.send_to(&listing.seller_id, &msg);
            }
        }
    }
}

fn update_skull_timers(state: &Arc<AppState>, tick: u64) {
    let mut cleared: Vec<Uuid> = Vec::new();

    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.skull_type > 0 {
            if player.skull_timer > 20 {
                player.skull_timer -= 20;
            } else {
                player.skull_type = 0;
                player.skull_timer = 0;
                cleared.push(player.id);
            }
        }
        // Reset daily PvP kill counter every 12000 ticks (~10 min)
        if tick > player.pvp_day_tick + 12000 {
            player.pvp_kills_today = 0;
            player.pvp_day_tick = tick;
        }
    }

    for pid in cleared {
        let msg = json!({
            "type": MSG_CHAT_MESSAGE,
            "payload": { "sender": "System", "text": "Your skull has cleared.", "channel": "system" }
        }).to_string();
        state.send_to(&pid, &msg);
    }
}

fn update_player_movement(state: &Arc<AppState>) {
    let speed: f64 = 3.0 / 20.0; // 3 tiles/sec at 20 tps

    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.dead { continue; }

        let speed_mult = player.effect_speed_multiplier();
        if speed_mult <= 0.0 { continue; } // Stunned - can't move
        let mount_mult = if player.mounted { 1.0 + player.mount_speed_bonus } else { 1.0 };
        let effective_speed = speed * speed_mult * mount_mult;

        let dx = player.target_x - player.x;
        let dy = player.target_y - player.y;
        let dist = (dx * dx + dy * dy).sqrt();

        if dist > 0.1 {
            let step = effective_speed.min(dist);
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
    use crate::world::TOWNS;

    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.dead {
            player.respawn_timer -= 1.0;
            if player.respawn_timer <= 0.0 {
                // Death penalty: lose XP, reduced by blessings (bitmask, each reduces by 20%, 5 = no loss)
                let blessing_count = player.blessings.count_ones() as f64;
                let xp_loss_rate = (0.05 * (1.0 - blessing_count * 0.20)).max(0.0);
                let xp_loss = (player.xp as f64 * xp_loss_rate) as u64;
                player.xp = player.xp.saturating_sub(xp_loss);

                // Find nearest town to death location
                let (spawn_x, spawn_y) = TOWNS.iter()
                    .min_by(|a, b| {
                        let da = (a.0 - player.x).powi(2) + (a.1 - player.y).powi(2);
                        let db = (b.0 - player.x).powi(2) + (b.1 - player.y).powi(2);
                        da.partial_cmp(&db).unwrap()
                    })
                    .map(|t| (t.0, t.1))
                    .unwrap_or((0.0, 0.0));

                to_respawn.push((player.id, xp_loss, spawn_x, spawn_y));
                player.dead = false;
                player.hp = player.max_hp;
                player.mp = player.max_mp;
                player.x = spawn_x;
                player.y = spawn_y;
                player.target_x = spawn_x;
                player.target_y = spawn_y;
            }
        }
    }

    for (pid, xp_loss, sx, sy) in to_respawn {
        let (hp, max_hp) = match state.players.get(&pid) {
            Some(player) => (player.hp, player.max_hp),
            None => continue,
        };
        let respawn_msg = json!({
            "type": MSG_RESPAWN,
            "payload": { "x": sx, "y": sy, "hp": hp, "maxHp": max_hp }
        }).to_string();
        state.send_to(&pid, &respawn_msg);

        if xp_loss > 0 {
            let penalty_msg = json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": { "sender": "System", "text": format!("You lost {} XP on death.", xp_loss), "channel": "system" }
            }).to_string();
            state.send_to(&pid, &penalty_msg);
        }

        send_stats_update_by_id(state, &pid);
    }
}

fn process_enemy_attacks(state: &Arc<AppState>) {
    let mut attacks: Vec<(Uuid, Uuid, i32, Vec<EnemyModifier>, i32)> = Vec::new(); // (enemy_id, player_id, damage, modifiers, enemy_atk)

    for mut entry in state.enemies.iter_mut() {
        let enemy = entry.value_mut();
        if enemy.state == EnemyState::Attack && enemy.attack_cooldown <= 0.0 {
            if let Some(target_id) = enemy.target_player {
                if let Some(player) = state.players.get(&target_id) {
                    // Don't attack if player is in safe zone
                    let player_dist = (player.x * player.x + player.y * player.y).sqrt();
                    if player_dist < 20.0 {
                        enemy.state = EnemyState::Flee;
                        enemy.target_player = None;
                        enemy.flee_cooldown = 200.0;
                        continue;
                    }
                    if !player.dead {
                        let raw_damage = enemy.atk as f64 * (0.9 + rand::random::<f64>() * 0.2);
                        let def = player.total_def();
                        let def_reduction = def as f64 / (def as f64 + 100.0 + enemy.level as f64 * 2.0);
                        let final_damage = (raw_damage * (1.0 - def_reduction)).max(1.0) as i32;
                        attacks.push((enemy.id, target_id, final_damage, enemy.modifiers.clone(), enemy.atk));
                        enemy.attack_cooldown = 30.0; // 1.5 seconds at 20 tps
                    }
                }
            }
        }
    }

    for (enemy_id, player_id, damage, modifiers, enemy_atk) in attacks {
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

        // Apply enemy modifier effects to player
        if !killed {
            for modifier in &modifiers {
                match modifier {
                    crate::protocol::EnemyModifier::Poisonous => {
                        let poison_dmg = (enemy_atk as f64 * 0.15).max(1.0) as i32;
                        let effect = crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Poison,
                            poison_dmg,
                            100, // 5 seconds
                            20,  // tick every 1 second
                            "enemy",
                        );
                        if let Some(mut player) = state.players.get_mut(&player_id) {
                            player.apply_effect(effect.clone());
                            let msg = serde_json::json!({
                                "type": crate::protocol::MSG_EFFECT_APPLIED,
                                "payload": effect.to_payload()
                            }).to_string();
                            drop(player);
                            state.send_to(&player_id, &msg);
                        }
                    }
                    crate::protocol::EnemyModifier::Burning => {
                        let burn_dmg = (enemy_atk as f64 * 0.20).max(2.0) as i32;
                        let effect = crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Burn,
                            burn_dmg,
                            60, // 3 seconds
                            20, // tick every 1 second
                            "enemy",
                        );
                        if let Some(mut player) = state.players.get_mut(&player_id) {
                            player.apply_effect(effect.clone());
                            let msg = serde_json::json!({
                                "type": crate::protocol::MSG_EFFECT_APPLIED,
                                "payload": effect.to_payload()
                            }).to_string();
                            drop(player);
                            state.send_to(&player_id, &msg);
                        }
                    }
                    crate::protocol::EnemyModifier::Freezing => {
                        let effect = crate::protocol::ActiveEffect::new(
                            crate::protocol::StatusEffectType::Freeze,
                            0,
                            60, // 3 seconds
                            60, // no ticking needed
                            "enemy",
                        );
                        if let Some(mut player) = state.players.get_mut(&player_id) {
                            player.apply_effect(effect.clone());
                            let msg = serde_json::json!({
                                "type": crate::protocol::MSG_EFFECT_APPLIED,
                                "payload": effect.to_payload()
                            }).to_string();
                            drop(player);
                            state.send_to(&player_id, &msg);
                        }
                    }
                    crate::protocol::EnemyModifier::Draining => {
                        let drain = (enemy_atk as f64 * 0.10).max(1.0) as i32;
                        if let Some(mut player) = state.players.get_mut(&player_id) {
                            player.mp = (player.mp - drain).max(0);
                        }
                    }
                    _ => {} // Other modifiers handled elsewhere
                }
            }
        }

        if killed {
            // Drop ~20% of non-equipped inventory items on death
            let (death_x, death_y) = if let Some(player) = state.players.get(&player_id) {
                (player.x, player.y)
            } else {
                (0.0, 0.0)
            };
            let tick = state.tick_count.load(std::sync::atomic::Ordering::Relaxed) as f64;
            let mut dropped_count = 0u32;

            if let Some(mut player) = state.players.get_mut(&player_id) {
                let mut rng = rand::thread_rng();
                // Blessings (bitmask) reduce item drop rate: base 20%, -8% per blessing (min 5%)
                let base_drop_rate = 0.20_f64;
                let blessing_count = player.blessings.count_ones() as f64;
                let blessing_reduction = blessing_count * 0.08;
                let drop_rate = (base_drop_rate - blessing_reduction).max(0.05);
                let item_count = player.inventory.iter().filter(|s| s.is_some()).count();
                let to_drop = ((item_count as f64 * drop_rate).ceil() as usize).max(0);

                if to_drop > 0 {
                    // Collect indices of occupied slots, shuffle, pick first `to_drop`
                    let mut occupied: Vec<usize> = player.inventory.iter().enumerate()
                        .filter(|(_, s)| s.is_some())
                        .map(|(i, _)| i)
                        .collect();
                    use rand::seq::SliceRandom;
                    occupied.shuffle(&mut rng);
                    occupied.truncate(to_drop);

                    for idx in occupied {
                        if let Some(item) = player.inventory[idx].take() {
                            let ground_item = GroundItem {
                                id: Uuid::new_v4(),
                                item: item,
                                x: death_x + rng.gen_range(-2.0..2.0),
                                y: death_y + rng.gen_range(-2.0..2.0),
                                owner_id: None, // Anyone can pick up death drops
                                drop_time: tick,
                                protection_duration: 0.0,
                            };
                            state.ground_items.insert(ground_item.id, ground_item);
                            dropped_count += 1;
                        }
                    }
                }

                // Gold loss reduced by blessings (bitmask): base 10%, -2% per blessing (min 2%)
                let gold_loss_rate = (0.10 - player.blessings.count_ones() as f64 * 0.02).max(0.02);
                let gold_loss = (player.gold as f64 * gold_loss_rate) as u64;
                player.gold = player.gold.saturating_sub(gold_loss);

                // Consume blessings on death: Twist of Fate (bit4) preserves other blessings
                if player.blessings > 0 {
                    if player.blessings & (1 << 4) != 0 {
                        player.blessings &= !(1 << 4);
                    } else {
                        player.blessings = 0;
                    }
                }

                player.dead = true;
                player.hp = 0;
                player.respawn_timer = 100.0;
            }

            let death_msg = json!({
                "type": MSG_DEATH,
                "payload": { "droppedItems": dropped_count }
            }).to_string();
            state.send_to(&player_id, &death_msg);

            // Send updated inventory to client
            send_inventory_update(state, &player_id);
            broadcast_ground_items(state, death_x, death_y);
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
            .map(|gi| ground_item_payload(gi.value()))
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

    // Pack aggro: champion+ enemies pulling nearby idle enemies into chase
    let enemy_snapshot: Vec<(Uuid, f64, f64, protocol::EnemyState, Option<Uuid>, protocol::EnemyRank)> =
        state.enemies.iter().map(|e| {
            let v = e.value();
            (*e.key(), v.x, v.y, v.state.clone(), v.target_player, v.rank.clone())
        }).collect();
    let pack_pairs = compute_pack_aggro(&enemy_snapshot);
    for (eid, target_id) in pack_pairs {
        if let Some(mut enemy) = state.enemies.get_mut(&eid) {
            if enemy.state == protocol::EnemyState::Idle || enemy.state == protocol::EnemyState::Patrol {
                enemy.state = protocol::EnemyState::Chase;
                enemy.target_player = Some(target_id);
            }
        }
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
                let biome = state.world.get_biome(x, y);
                let enemy = generate_enemy(x, y, zone_level, biome);
                state.enemies.insert(enemy.id, enemy);
            }
        }
    }
}

// ─── Pet / Companion System Handlers ─────────────────────────

fn handle_pet_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = match payload.get("action").and_then(|v| v.as_str()) {
        Some(a) => a.to_string(),
        None => return,
    };

    match action.as_str() {
        "summon" => {
            let pet_id = match payload.get("petId").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return,
            };
            if let Some(mut player) = state.players.get_mut(&player_id) {
                if let Some(pet) = player.pet_collection.iter().find(|p| p.id == pet_id) {
                    player.active_pet = Some(pet.clone());
                } else {
                    drop(player);
                    let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Pet not found in your collection.","channel":"system"}}).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
            }
            send_pet_update(state, &player_id);
            send_stats_update_by_id(state, &player_id);
        }
        "dismiss" => {
            if let Some(mut player) = state.players.get_mut(&player_id) {
                player.active_pet = None;
            }
            send_pet_update(state, &player_id);
            send_stats_update_by_id(state, &player_id);
        }
        "rename" => {
            let pet_id = match payload.get("petId").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return,
            };
            let new_name = match payload.get("name").and_then(|v| v.as_str()) {
                Some(n) => {
                    let trimmed = n.trim();
                    if trimmed.is_empty() || trimmed.len() > 24 { return; }
                    trimmed.to_string()
                }
                None => return,
            };
            if let Some(mut player) = state.players.get_mut(&player_id) {
                if let Some(pet) = player.pet_collection.iter_mut().find(|p| p.id == pet_id) {
                    pet.name = new_name.clone();
                }
                // Sync active pet if it matches
                if let Some(ref mut active) = player.active_pet {
                    if active.id == pet_id {
                        active.name = new_name;
                    }
                }
            }
            send_pet_update(state, &player_id);
        }
        "feed" => {
            let pet_id = match payload.get("petId").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return,
            };
            let mut leveled_up = false;
            if let Some(mut player) = state.players.get_mut(&player_id) {
                if player.gold < 50 {
                    drop(player);
                    let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Not enough gold! Feeding costs 50 gold.","channel":"system"}}).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
                let pet_idx = player.pet_collection.iter().position(|p| p.id == pet_id);
                match pet_idx {
                    None => {
                        drop(player);
                        let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Pet not found.","channel":"system"}}).to_string();
                        state.send_to(&player_id, &msg);
                        return;
                    }
                    Some(idx) => {
                        if player.pet_collection[idx].level >= 20 {
                            drop(player);
                            let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"This pet is already max level!","channel":"system"}}).to_string();
                            state.send_to(&player_id, &msg);
                            return;
                        }
                        player.gold -= 50;
                        player.pet_collection[idx].xp += 20;
                        // Check level up: threshold is 100 * current_level
                        while player.pet_collection[idx].xp >= player.pet_collection[idx].xp_to_next
                            && player.pet_collection[idx].level < 20
                        {
                            let xp_to_next = player.pet_collection[idx].xp_to_next;
                            player.pet_collection[idx].xp -= xp_to_next;
                            player.pet_collection[idx].level += 1;
                            player.pet_collection[idx].xp_to_next = 100 * player.pet_collection[idx].level as u64;
                            // Increase bonus_value by per-level amount from catalog
                            let pet_type = player.pet_collection[idx].pet_type.clone();
                            if let Some(entry) = PET_CATALOG.iter().find(|(t, _, _, _, _, _)| *t == pet_type.as_str()) {
                                player.pet_collection[idx].bonus_value += entry.4;
                            }
                            leveled_up = true;
                        }
                        // Sync active pet if it matches
                        let updated_pet = player.pet_collection[idx].clone();
                        if let Some(ref mut active) = player.active_pet {
                            if active.id == pet_id {
                                *active = updated_pet;
                            }
                        }
                    }
                }
            }
            send_pet_update(state, &player_id);
            send_inventory_update(state, &player_id); // gold changed
            if leveled_up {
                send_stats_update_by_id(state, &player_id);
                let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Your pet leveled up! 🎉","channel":"system"}}).to_string();
                state.send_to(&player_id, &msg);
            }
        }
        "hatch" => {
            let item_id = match payload.get("itemId").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return,
            };
            let mut new_pet: Option<PetData> = None;
            if let Some(mut player) = state.players.get_mut(&player_id) {
                // Find the pet egg in inventory
                let mut egg_slot = None;
                for (i, slot) in player.inventory.iter().enumerate() {
                    if let Some(item) = slot {
                        if item.id == item_id && item.template_id.starts_with("pet_egg_") {
                            egg_slot = Some(i);
                            break;
                        }
                    }
                }
                let slot_idx = match egg_slot {
                    Some(i) => i,
                    None => {
                        drop(player);
                        let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Pet egg not found in inventory.","channel":"system"}}).to_string();
                        state.send_to(&player_id, &msg);
                        return;
                    }
                };
                // Extract pet_type from template_id
                let pet_type = {
                    let item = player.inventory[slot_idx].as_ref().unwrap();
                    item.template_id.strip_prefix("pet_egg_").unwrap_or("wolf").to_string()
                };
                // Remove the egg (handle quantity/stacks)
                {
                    let item = player.inventory[slot_idx].as_mut().unwrap();
                    if item.quantity > 1 {
                        item.quantity -= 1;
                    } else {
                        player.inventory[slot_idx] = None;
                    }
                }
                // Look up catalog entry
                if let Some(&(_, name, icon, bonus_stat, bonus_per_level, rarity)) =
                    PET_CATALOG.iter().find(|(t, _, _, _, _, _)| *t == pet_type)
                {
                    let pet = PetData {
                        id: Uuid::new_v4().to_string(),
                        name: name.to_string(),
                        pet_type: pet_type.clone(),
                        icon: icon.to_string(),
                        level: 1,
                        xp: 0,
                        xp_to_next: 100,
                        bonus_stat: bonus_stat.to_string(),
                        bonus_value: bonus_per_level,
                        rarity,
                    };
                    new_pet = Some(pet.clone());
                    player.pet_collection.push(pet);
                }
            }
            if let Some(pet) = &new_pet {
                let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {
                    "sender": "System",
                    "text": format!("{} A {} hatched from the egg! Welcome, {}!", pet.icon, pet.pet_type, pet.name),
                    "channel": "system"
                }}).to_string();
                state.send_to(&player_id, &msg);
            }
            send_pet_update(state, &player_id);
            send_inventory_update(state, &player_id);
        }
        _ => {
            let msg = json!({"type": MSG_CHAT_MESSAGE, "payload": {"sender":"System","text":"Unknown pet action.","channel":"system"}}).to_string();
            state.send_to(&player_id, &msg);
        }
    }
}

fn send_pet_update(state: &Arc<AppState>, player_id: &Uuid) {
    if let Some(player) = state.players.get(player_id) {
        let active_payload = player.active_pet.as_ref().map(|p| p.to_payload());
        let collection_payload: Vec<serde_json::Value> = player.pet_collection.iter()
            .map(|p| p.to_payload())
            .collect();
        let msg = json!({
            "type": MSG_PET_UPDATE,
            "payload": {
                "activePet": active_payload,
                "petCollection": collection_payload,
            }
        }).to_string();
        drop(player);
        state.send_to(player_id, &msg);
    }
}

// ─── Mount System ────────────────────────────────────────────

fn handle_mount_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "mount" => {
            let mut player = match state.players.get_mut(&player_id) { Some(p) => p, None => return };
            if player.mounted { return; } // Already mounted
            if player.dead { return; }

            // Find mount item in inventory
            for mount_data in crate::protocol::MOUNT_DATA {
                let (item_name, mount_name, speed_bonus, _emoji) = *mount_data;
                if let Some(slot_idx) = player.inventory.iter().position(|s| {
                    s.as_ref().map_or(false, |i| i.name == item_name)
                }) {
                    player.mounted = true;
                    player.mount_speed_bonus = speed_bonus;
                    player.mount_name = mount_name.to_string();
                    // Don't consume the item — it's reusable

                    let msg = json!({
                        "type": crate::protocol::MSG_MOUNT_UPDATE,
                        "payload": {
                            "mounted": true,
                            "mountName": mount_name,
                            "speedBonus": speed_bonus,
                        }
                    }).to_string();
                    let pid = player_id;
                    drop(player);
                    state.send_to(&pid, &msg);

                    // Broadcast to nearby — they see mounted sprite
                    let chat = json!({
                        "type": crate::protocol::MSG_CHAT_MESSAGE,
                        "payload": { "channel": "system", "message": format!("You mounted your {}!", mount_name) }
                    }).to_string();
                    state.send_to(&pid, &chat);
                    return;
                }
            }

            // No mount item found
            let msg = json!({
                "type": crate::protocol::MSG_CHAT_MESSAGE,
                "payload": { "channel": "system", "message": "You don't have any mount items!" }
            }).to_string();
            drop(player);
            state.send_to(&player_id, &msg);
        }
        "dismount" => {
            let mut player = match state.players.get_mut(&player_id) { Some(p) => p, None => return };
            if !player.mounted { return; }
            player.mounted = false;
            player.mount_speed_bonus = 0.0;
            let old_name = std::mem::take(&mut player.mount_name);
            drop(player);

            let msg = json!({
                "type": crate::protocol::MSG_MOUNT_UPDATE,
                "payload": { "mounted": false, "mountName": "", "speedBonus": 0.0 }
            }).to_string();
            state.send_to(&player_id, &msg);

            let chat = json!({
                "type": crate::protocol::MSG_CHAT_MESSAGE,
                "payload": { "channel": "system", "message": format!("You dismounted your {}.", old_name) }
            }).to_string();
            state.send_to(&player_id, &chat);
        }
        _ => {}
    }
}

// Auto-dismount when entering combat
fn auto_dismount_on_combat(state: &Arc<AppState>, player_id: &Uuid) {
    if let Some(mut player) = state.players.get_mut(player_id) {
        if player.mounted {
            player.mounted = false;
            player.mount_speed_bonus = 0.0;
            player.mount_name.clear();
            drop(player);

            let msg = json!({
                "type": crate::protocol::MSG_MOUNT_UPDATE,
                "payload": { "mounted": false, "mountName": "", "speedBonus": 0.0 }
            }).to_string();
            state.send_to(player_id, &msg);

            let chat = json!({
                "type": crate::protocol::MSG_CHAT_MESSAGE,
                "payload": { "channel": "system", "message": "You were dismounted by entering combat!" }
            }).to_string();
            state.send_to(player_id, &chat);
        }
    }
}

// ─── Mail System ─────────────────────────────────────────────

fn handle_mail_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "send" => {
            let to_name = payload.get("to").and_then(|v| v.as_str()).unwrap_or("");
            let subject = payload.get("subject").and_then(|v| v.as_str()).unwrap_or("No Subject");
            let body = payload.get("body").and_then(|v| v.as_str()).unwrap_or("");
            let gold = payload.get("gold").and_then(|v| v.as_u64()).unwrap_or(0);
            let item_slot = payload.get("itemSlot").and_then(|v| v.as_u64());

            if to_name.is_empty() || body.is_empty() {
                let msg = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": "Invalid mail parameters" } }).to_string();
                state.send_to(&player_id, &msg);
                return;
            }

            // Find recipient
            let recipient_id = state.players.iter().find(|e| e.value().username == to_name).map(|e| *e.key());
            let recipient_id = match recipient_id {
                Some(id) => id,
                None => {
                    let msg = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": format!("Player '{}' not found", to_name) } }).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
            };

            // Deduct gold from sender
            let mut item_to_send: Option<crate::protocol::Item> = None;
            let sender_name;
            {
                let mut sender = match state.players.get_mut(&player_id) { Some(p) => p, None => return };
                if sender.gold < gold {
                    drop(sender);
                    let msg = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": "Not enough gold" } }).to_string();
                    state.send_to(&player_id, &msg);
                    return;
                }
                sender.gold -= gold;
                sender_name = sender.username.clone();

                // Remove item from sender inventory if specified
                if let Some(slot) = item_slot {
                    let idx = slot as usize;
                    if idx < sender.inventory.len() {
                        item_to_send = sender.inventory[idx].take();
                    }
                }
            }

            // Add to recipient mailbox
            let mail = crate::protocol::MailMessage {
                id: Uuid::new_v4().to_string(),
                from: sender_name.clone(),
                subject: subject[..subject.len().min(50)].to_string(),
                body: body[..body.len().min(500)].to_string(),
                gold,
                item: item_to_send,
                read: false,
                tick: 0,
            };

            if let Some(mut recipient) = state.players.get_mut(&recipient_id) {
                recipient.mailbox.push(mail);
            }

            // Notify sender
            let msg = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": format!("Mail sent to {}!", to_name) } }).to_string();
            state.send_to(&player_id, &msg);

            // Notify recipient
            let msg = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": format!("📬 You have new mail from {}!", sender_name) } }).to_string();
            state.send_to(&recipient_id, &msg);
            send_mail_data(state, &recipient_id);

            // Update sender inventory
            send_inventory_update(state, &player_id);
        }
        "read" => {
            let mail_id = payload.get("mailId").and_then(|v| v.as_str()).unwrap_or("");
            if let Some(mut player) = state.players.get_mut(&player_id) {
                if let Some(mail) = player.mailbox.iter_mut().find(|m| m.id == mail_id) {
                    mail.read = true;
                }
            }
            send_mail_data(state, &player_id);
        }
        "claim" => {
            let mail_id = payload.get("mailId").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut claimed_gold = 0u64;
            let mut claimed_item: Option<crate::protocol::Item> = None;

            if let Some(mut player) = state.players.get_mut(&player_id) {
                if let Some(mail) = player.mailbox.iter_mut().find(|m| m.id == mail_id) {
                    claimed_gold = mail.gold;
                    claimed_item = mail.item.take();
                    mail.gold = 0;
                    mail.read = true;
                }

                // Add gold
                player.gold += claimed_gold;

                // Add item to inventory
                if let Some(item) = claimed_item {
                    if let Some(empty) = player.inventory.iter_mut().find(|s| s.is_none()) {
                        *empty = Some(item);
                    }
                }
            }
            send_mail_data(state, &player_id);
            send_inventory_update(state, &player_id);
        }
        "delete" => {
            let mail_id = payload.get("mailId").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if let Some(mut player) = state.players.get_mut(&player_id) {
                player.mailbox.retain(|m| m.id != mail_id);
            }
            send_mail_data(state, &player_id);
        }
        "list" => {
            send_mail_data(state, &player_id);
        }
        _ => {}
    }
}

fn send_mail_data(state: &Arc<AppState>, player_id: &Uuid) {
    let player = match state.players.get(player_id) { Some(p) => p, None => return };
    let mails: Vec<serde_json::Value> = player.mailbox.iter().map(|m| {
        json!({
            "id": m.id,
            "from": m.from,
            "subject": m.subject,
            "body": m.body,
            "gold": m.gold,
            "item": m.item.as_ref().map(|i| i.to_payload()),
            "read": m.read,
            "hasAttachment": m.gold > 0 || m.item.is_some(),
        })
    }).collect();
    let msg = json!({ "type": crate::protocol::MSG_MAIL_DATA, "payload": { "mails": mails } }).to_string();
    drop(player);
    state.send_to(player_id, &msg);
}

// ─── Arena PvP System ────────────────────────────────────────

fn handle_arena_action(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "queue" => {
            if let Some(mut player) = state.players.get_mut(&player_id) {
                if player.dead { return; }
                player.arena_queue = true;
                drop(player);

                let msg = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": "⚔️ You joined the arena queue! Waiting for opponent..." } }).to_string();
                state.send_to(&player_id, &msg);

                let update = json!({ "type": crate::protocol::MSG_ARENA_UPDATE, "payload": { "action": "queued" } }).to_string();
                state.send_to(&player_id, &update);
            }
        }
        "leave" => {
            if let Some(mut player) = state.players.get_mut(&player_id) {
                player.arena_queue = false;
                drop(player);

                let msg = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": "You left the arena queue." } }).to_string();
                state.send_to(&player_id, &msg);

                let update = json!({ "type": crate::protocol::MSG_ARENA_UPDATE, "payload": { "action": "left_queue" } }).to_string();
                state.send_to(&player_id, &update);
            }
        }
        _ => {}
    }
}

fn process_arena_matchmaking(state: &Arc<AppState>) {
    // Collect queued players sorted by rating
    let mut queued: Vec<(Uuid, i32)> = Vec::new();
    for entry in state.players.iter() {
        if entry.arena_queue && !entry.dead {
            queued.push((*entry.key(), entry.arena_rating));
        }
    }
    queued.sort_by_key(|(_, r)| *r);

    // Match pairs with closest ratings
    let mut matched = std::collections::HashSet::new();
    for i in 0..queued.len() {
        if matched.contains(&i) { continue; }
        for j in (i + 1)..queued.len() {
            if matched.contains(&j) { continue; }
            let rating_diff = (queued[i].1 - queued[j].1).abs();
            if rating_diff <= 300 {
                matched.insert(i);
                matched.insert(j);
                start_arena_match(state, queued[i].0, queued[j].0);
                break;
            }
        }
    }
}

fn start_arena_match(state: &Arc<AppState>, p1: Uuid, p2: Uuid) {
    // Remove from queue, heal both to full, teleport to arena zone
    let (p1_name, p2_name);
    {
        let mut player1 = match state.players.get_mut(&p1) { Some(p) => p, None => return };
        player1.arena_queue = false;
        player1.hp = player1.max_hp + player1.party_bonus_hp;
        player1.mp = player1.max_mp;
        // Teleport to arena: north arena
        player1.x = 150.0;
        player1.y = 150.0;
        player1.target_x = 150.0;
        player1.target_y = 150.0;
        p1_name = player1.username.clone();
    }
    {
        let mut player2 = match state.players.get_mut(&p2) { Some(p) => p, None => return };
        player2.arena_queue = false;
        player2.hp = player2.max_hp + player2.party_bonus_hp;
        player2.mp = player2.max_mp;
        // Teleport to arena: south arena
        player2.x = 155.0;
        player2.y = 155.0;
        player2.target_x = 155.0;
        player2.target_y = 155.0;
        p2_name = player2.username.clone();
    }

    // Notify both players
    let msg1 = json!({
        "type": crate::protocol::MSG_ARENA_UPDATE,
        "payload": { "action": "match_start", "opponent": p2_name, "opponentId": p2.to_string() }
    }).to_string();
    state.send_to(&p1, &msg1);

    let msg2 = json!({
        "type": crate::protocol::MSG_ARENA_UPDATE,
        "payload": { "action": "match_start", "opponent": p1_name, "opponentId": p1.to_string() }
    }).to_string();
    state.send_to(&p2, &msg2);

    let chat1 = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": format!("⚔️ Arena match started! Your opponent: {}", p2_name) } }).to_string();
    state.send_to(&p1, &chat1);

    let chat2 = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": format!("⚔️ Arena match started! Your opponent: {}", p1_name) } }).to_string();
    state.send_to(&p2, &chat2);
}

// ─── Daily Quest System ──────────────────────────────────────

fn generate_daily_quests(player: &mut crate::protocol::PlayerData) {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let template_count = crate::protocol::DAILY_QUEST_TEMPLATES.len();

    // Pick 3 random non-duplicate daily quests
    let mut indices: Vec<usize> = Vec::new();
    while indices.len() < 3 {
        let idx = rng.gen_range(0..template_count);
        if !indices.contains(&idx) {
            indices.push(idx);
        }
    }

    player.daily_quests = indices.iter().map(|&idx| crate::protocol::DailyQuest::from_template(idx)).collect();
}

fn check_daily_reset(state: &Arc<AppState>, tick: u64) {
    // Reset dailies every 36000 ticks (~30 min for testing, would be 24h in prod)
    let daily_cycle = 36000u64;

    for mut entry in state.players.iter_mut() {
        let player = entry.value_mut();
        if player.daily_quests.is_empty() || tick >= player.daily_reset_tick {
            generate_daily_quests(player);
            player.daily_reset_tick = tick + daily_cycle;
        }
    }
}

fn handle_daily_quest_claim(state: &Arc<AppState>, player_id: Uuid, payload: &serde_json::Value) {
    let quest_id = payload.get("questId").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let (reward_xp, reward_gold, found);
    {
        let mut player = match state.players.get_mut(&player_id) { Some(p) => p, None => return };
        if let Some(dq) = player.daily_quests.iter_mut().find(|q| q.quest_id == quest_id) {
            if dq.completed || dq.progress < dq.target {
                found = false;
                reward_xp = 0;
                reward_gold = 0;
            } else {
                dq.completed = true;
                reward_xp = dq.reward_xp;
                reward_gold = dq.reward_gold;
                found = true;
                player.xp += reward_xp;
                player.gold += reward_gold;
            }
        } else {
            found = false;
            reward_xp = 0;
            reward_gold = 0;
        }
    }

    if found {
        let msg = json!({ "type": crate::protocol::MSG_CHAT_MESSAGE, "payload": { "channel": "system", "message": format!("🎯 Daily quest complete! +{} XP, +{} Gold", reward_xp, reward_gold) } }).to_string();
        state.send_to(&player_id, &msg);
    }
    send_daily_quest_data(state, &player_id);
}

fn update_daily_quest_progress(state: &Arc<AppState>, player_id: &Uuid, objective: &str, amount: u32) {
    if let Some(mut player) = state.players.get_mut(player_id) {
        let mut any_updated = false;
        for dq in player.daily_quests.iter_mut() {
            if !dq.completed && dq.objective == objective {
                dq.progress = (dq.progress + amount).min(dq.target);
                any_updated = true;
            }
        }
        if any_updated {
            // Must drop before sending
            let pid = *player_id;
            drop(player);
            send_daily_quest_data(state, &pid);
        }
    }
}

fn send_daily_quest_data(state: &Arc<AppState>, player_id: &Uuid) {
    let player = match state.players.get(player_id) { Some(p) => p, None => return };
    let quests: Vec<serde_json::Value> = player.daily_quests.iter().map(|dq| {
        json!({
            "questId": dq.quest_id,
            "title": dq.title,
            "description": dq.description,
            "objective": dq.objective,
            "target": dq.target,
            "progress": dq.progress,
            "completed": dq.completed,
            "rewardXp": dq.reward_xp,
            "rewardGold": dq.reward_gold,
        })
    }).collect();
    let msg = json!({ "type": crate::protocol::MSG_DAILY_QUEST_DATA, "payload": { "dailyQuests": quests } }).to_string();
    drop(player);
    state.send_to(player_id, &msg);
}

// ─── Treasure Chest Spawning ─────────────────────────────────
fn spawn_treasure_chests(state: &Arc<AppState>, tick: u64) {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    
    let player_positions: Vec<(f64, f64, u32)> = state.players.iter()
        .filter(|p| !p.dead)
        .map(|p| (p.x, p.y, p.level))
        .collect();
    
    if player_positions.is_empty() { return; }
    
    let chest_count = rng.gen_range(1..=3usize.min(player_positions.len()));
    for _ in 0..chest_count {
        let (px, py, plevel) = player_positions[rng.gen_range(0..player_positions.len())];
        let cx = px + rng.gen_range(-15.0..15.0);
        let cy = py + rng.gen_range(-15.0..15.0);
        let zone_level = plevel.max(1);
        
        let mut loot = crate::protocol::generate_loot(zone_level, zone_level, 0);
        let gold_amount = rng.gen_range(50..200) * zone_level as u64;
        loot.push(crate::protocol::Item::new_material(&format!("Gold Pouch ({}g)", gold_amount), 1, 1));
        
        if zone_level >= 15 && rng.gen_bool(0.15) {
            let legendaries = crate::protocol::LEGENDARY_UNIQUES;
            let eligible: Vec<_> = legendaries.iter()
                .filter(|(_, _, _, _, _, min_lv, _)| zone_level >= *min_lv)
                .collect();
            if !eligible.is_empty() {
                let leg = eligible[rng.gen_range(0..eligible.len())];
                // (name, slot, stat_key, stat_val, rarity, min_level, description)
                let item = if leg.1 == "weapon" {
                    let mut i = crate::protocol::Item::new_weapon(leg.0, leg.4, zone_level, leg.3);
                    i.description = leg.6.to_string();
                    i
                } else {
                    let mut i = crate::protocol::Item::new_armor(leg.0, leg.1, leg.4, zone_level, leg.3);
                    i.description = leg.6.to_string();
                    i
                };
                loot.push(item);
            }
        }
        
        for item in loot {
            let ground_item = crate::protocol::GroundItem {
                id: uuid::Uuid::new_v4(),
                item,
                x: cx + rng.gen_range(-0.5..0.5),
                y: cy + rng.gen_range(-0.5..0.5),
                owner_id: None,
                drop_time: tick as f64,
                protection_duration: 0.0,
            };
            state.ground_items.insert(ground_item.id, ground_item);
        }
        
        let announce = json!({
            "type": crate::protocol::MSG_CHAT_MESSAGE,
            "payload": {
                "sender": "🏴‍☠️ Treasure",
                "text": format!("A treasure chest has appeared nearby! ({:.0}, {:.0})", cx, cy),
                "channel": "system",
            }
        }).to_string();
        state.send_to_all_near(cx, cy, 25.0, &announce);
    }
}

// ─── Bounty Action Handler ──────────────────────────────────────
fn handle_bounty_action(state: &Arc<AppState>, player_id: uuid::Uuid, payload: &serde_json::Value) {
    use crate::protocol::*;
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "place" => {
            let target_name = payload.get("targetName").and_then(|v| v.as_str()).unwrap_or("");
            let amount = payload.get("amount").and_then(|v| v.as_u64()).unwrap_or(0);
            if target_name.is_empty() || amount < 1000 { return; }

            // Find target by name — collect ID only
            let target_id = state.players.iter()
                .find(|r| r.value().username.eq_ignore_ascii_case(target_name))
                .map(|r| *r.key());

            let target_id = match target_id {
                Some(id) if id != player_id => id,
                _ => {
                    let err = serde_json::json!({
                        "type": MSG_RUNE_RESULT,
                        "payload": { "success": false, "error": "Player not found" }
                    }).to_string();
                    state.send_to(&player_id, &err);
                    return;
                }
            };

            // Deduct gold from placer
            let deducted = {
                if let Some(mut p) = state.players.get_mut(&player_id) {
                    if p.gold >= amount {
                        p.gold -= amount;
                        true
                    } else { false }
                } else { false }
            };
            if !deducted { return; }

            // Credit bounty to target — if target gone, refund
            let credited = {
                if let Some(mut t) = state.players.get_mut(&target_id) {
                    t.bounty_gold += amount;
                    true
                } else { false }
            };
            if !credited {
                // Refund placer
                if let Some(mut p) = state.players.get_mut(&player_id) {
                    p.gold += amount;
                }
                return;
            }

            send_inventory_update(state, &player_id);

            // Broadcast bounty placement
            let placer_name = state.players.get(&player_id).map(|p| p.username.clone()).unwrap_or_default();
            let msg = serde_json::json!({
                "type": MSG_CHAT_MESSAGE,
                "payload": {
                    "sender": "Bounty",
                    "text": format!("💀 {} placed a {}g bounty on {}!", placer_name, amount, target_name),
                    "channel": "system"
                }
            }).to_string();
            state.broadcast(&msg);

            // Send updated bounty list to requester
            send_bounty_list(state, &player_id);
        }
        "list" => {
            send_bounty_list(state, &player_id);
        }
        _ => {}
    }
}

fn send_bounty_list(state: &Arc<AppState>, player_id: &uuid::Uuid) {
    use crate::protocol::*;
    let mut bounties: Vec<serde_json::Value> = Vec::new();
    for r in state.players.iter() {
        let p = r.value();
        if p.bounty_gold > 0 {
            bounties.push(serde_json::json!({
                "name": p.username,
                "bounty": p.bounty_gold,
                "level": p.level,
            }));
        }
    }
    bounties.sort_by(|a, b| b["bounty"].as_u64().cmp(&a["bounty"].as_u64()));

    let my_bounty = state.players.get(player_id).map(|p| p.bounty_gold).unwrap_or(0);

    let msg = serde_json::json!({
        "type": MSG_BOUNTY_UPDATE,
        "payload": {
            "bounties": bounties,
            "myBounty": my_bounty,
        }
    }).to_string();
    state.send_to(player_id, &msg);
}

// ─── Rune Craft Handler ──────────────────────────────────────
fn handle_rune_craft(state: &Arc<AppState>, player_id: uuid::Uuid, payload: &serde_json::Value) {
    use crate::protocol::*;
    let rune_name = payload.get("rune_name").and_then(|v| v.as_str()).unwrap_or("");

    // Look up recipe
    let recipe = RUNE_RECIPES.iter().find(|r| r.0 == rune_name);
    let (_, _mat_id, min_magic, mana_cost) = match recipe {
        Some(r) => *r,
        None => {
            let msg = serde_json::json!({
                "type": MSG_RUNE_RESULT,
                "payload": { "success": false, "error": "Unknown rune recipe" }
            }).to_string();
            state.send_to(&player_id, &msg);
            return;
        }
    };

    // Validate + mutate in one get_mut block (avoid stale-read race)
    let crafted = {
        if let Some(mut p) = state.players.get_mut(&player_id) {
            // Check magic level (max_mp)
            if (p.max_mp as u32) < min_magic {
                Some(Err("Your magic level is too low"))
            } else if (p.mp as u32) < mana_cost {
                Some(Err("Not enough mana"))
            } else {
                // Find blank rune by template_id, decrement stack
                let rune_slot = p.inventory.iter().position(|s| {
                    s.as_ref().map_or(false, |item| item.template_id == "blank_rune")
                });
                match rune_slot {
                    Some(idx) => {
                        // Decrement quantity, remove slot only if 0
                        let should_clear = {
                            let item = p.inventory[idx].as_mut().unwrap();
                            if item.quantity > 1 {
                                item.quantity -= 1;
                                false
                            } else {
                                true
                            }
                        };
                        if should_clear { p.inventory[idx] = None; }

                        // Consume mana
                        p.mp -= mana_cost as i32;

                        // Add crafted rune as consumable
                        let rune = Item::new_consumable(rune_name, 2, 1); // rarity 2 = uncommon
                        p.add_item(rune);

                        Some(Ok(()))
                    }
                    None => Some(Err("No Blank Rune in inventory"))
                }
            }
        } else { None }
    };

    // Send results (guard dropped)
    match crafted {
        Some(Ok(())) => {
            let msg = serde_json::json!({
                "type": MSG_RUNE_RESULT,
                "payload": { "success": true, "rune_name": rune_name }
            }).to_string();
            state.send_to(&player_id, &msg);
            send_inventory_update(state, &player_id);
            send_stats_update_by_id(state, &player_id);
        }
        Some(Err(err)) => {
            let msg = serde_json::json!({
                "type": MSG_RUNE_RESULT,
                "payload": { "success": false, "error": err }
            }).to_string();
            state.send_to(&player_id, &msg);
        }
        None => {}
    }
}
