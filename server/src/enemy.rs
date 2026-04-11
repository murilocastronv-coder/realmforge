use rand::Rng;
use uuid::Uuid;

use crate::protocol::{EnemyData, EnemyModifier, EnemyRank, EnemyState, ALL_MODIFIERS};
use crate::world::TOWNS;

/// Biome-specific enemy types for thematic variety
const GRASSLAND_ENEMIES: &[&str] = &["Wolf", "Boar", "Bandit", "Slime", "Rat", "Snake", "Goblin", "Spider", "Deer", "Fox", "Highwayman", "Wild Horse", "Beetle", "Crow"];
const FOREST_ENEMIES: &[&str] = &["Treant", "Spider", "Wolf", "Bear", "Dryad", "Shade", "Ranger", "Sprite", "Owlbear", "Mushroom Golem", "Forest Troll", "Wild Boar", "Fairy", "Ent"];
const DESERT_ENEMIES: &[&str] = &["Scorpion", "Mummy", "Sand Worm", "Djinn", "Basilisk", "Vulture", "Scarab", "Sphinx", "Dust Devil", "Sand Golem", "Desert Raider", "Cobra King"];
const MOUNTAIN_ENEMIES: &[&str] = &["Golem", "Gargoyle", "Harpy", "Wyvern", "Troll", "Yeti", "Griffin", "Mountain Giant", "Rock Elemental", "Cave Drake", "Thunder Hawk", "Stone Sentinel"];
const TUNDRA_ENEMIES: &[&str] = &["Frost Wolf", "Ice Elemental", "Yeti", "Frozen Wraith", "Wendigo", "Frost Spider", "Polar Bear", "Ice Troll", "Snow Serpent", "Frost Giant", "Glacial Golem"];
const SWAMP_ENEMIES: &[&str] = &["Zombie", "Naga", "Bog Beast", "Leech", "Plague Rat", "Toxic Slime", "Revenant", "Swamp Hag", "Mud Golem", "Crocodile", "Will-o-Wisp", "Bog Lurker"];
const VOLCANIC_ENEMIES: &[&str] = &["Fire Elemental", "Lava Golem", "Magma Worm", "Infernal Imp", "Flame Drake", "Ash Wraith", "Molten Spider", "Ember Wolf", "Pyroclast", "Cinder Hound", "Obsidian Guardian", "Salamander", "Magma Crawler", "Phoenix Hatchling"];
const DEEP_OCEAN_ENEMIES: &[&str] = &["Kraken Spawn", "Deep Sea Naga", "Coral Golem", "Abyssal Leviathan", "Siren", "Ghost Ship Wraith", "Sea Serpent", "Drowned Sailor", "Anglerfish Beast", "Tidal Elemental", "Barnacle Hulk", "Jellyfish Swarm", "Merfolk Raider", "Abyssal Watcher"];
const UNDEAD_ENEMIES: &[&str] = &["Skeleton Knight", "Lich", "Bone Dragon", "Banshee", "Death Knight", "Wraith Lord", "Ghoul", "Vampire", "Plague Bearer", "Soul Eater", "Grave Warden", "Corpse Weaver", "Shadow Fiend", "Bone Colossus"];
const CELESTIAL_ENEMIES: &[&str] = &["Astral Sentinel", "Star Wisp", "Void Walker", "Celestial Drake", "Light Weaver", "Moon Shade", "Cosmic Horror", "Ethereal Knight", "Plasma Djinn", "Constellation Beast", "Nebula Wraith", "Starfall Golem"];

fn biome_enemy_types(biome: &str) -> &'static [&'static str] {
    match biome {
        "forest" => FOREST_ENEMIES,
        "desert" => DESERT_ENEMIES,
        "mountain" => MOUNTAIN_ENEMIES,
        "tundra" => TUNDRA_ENEMIES,
        "swamp" => SWAMP_ENEMIES,
        "volcanic" => VOLCANIC_ENEMIES,
        "deep_ocean" => DEEP_OCEAN_ENEMIES,
        "undead" => UNDEAD_ENEMIES,
        "celestial" => CELESTIAL_ENEMIES,
        _ => GRASSLAND_ENEMIES,
    }
}

/// Names for procedurally generated enemies
const ENEMY_PREFIXES: &[&str] = &[
    "Shadow", "Dire", "Feral", "Savage", "Dark", "Cursed", "Ancient", "Vile",
    "Rabid", "Toxic", "Frost", "Fire", "Storm", "Blood", "Iron", "Crystal",
    "Infernal", "Celestial", "Abyssal", "Spectral", "Venomous", "Corrupted", "Arcane", "Molten",
    "Frozen", "Thunder", "Plague", "Necrotic", "Ethereal", "Primordial", "Doom", "Chaos",
    "Blighted", "Eldritch", "Runic", "Void",
];

const ENEMY_TYPES: &[&str] = &[
    "Slime", "Wolf", "Spider", "Skeleton", "Goblin", "Rat", "Bat", "Snake",
    "Zombie", "Ghost", "Golem", "Troll", "Orc", "Imp", "Wraith", "Scorpion",
    "Dragon", "Ogre", "Basilisk", "Harpy", "Minotaur", "Demon", "Lich",
    "Wyvern", "Chimera", "Gargoyle", "Revenant", "Banshee",
    "Elemental", "Phoenix", "Hydra", "Cerberus", "Manticore", "Griffin", "Treant", "Shade",
    "Specter", "Djinn", "Naga", "Wendigo", "Kraken", "Cyclops", "Beholder", "Lich King",
    "Dread Knight", "Necromancer", "Warlock", "Berserker", "Assassin", "Sentinel", "Colossus",
    "Wyrm", "Abomination", "Revenant Lord", "Soul Eater", "Bone Dragon",
    "Behemoth", "Titan", "Leviathan", "Seraph", "Archon", "Juggernaut",
    "Mind Flayer", "Beholder Lord", "Pit Fiend", "Balrog", "Dracolich",
    "Sphinx", "Thunderbird", "Frost Giant", "Storm Colossus", "Plague Lord",
    "Blood Knight", "Void Stalker", "Shadow Fiend", "Crystal Golem", "Iron Dragon",
];

const ENEMY_SUFFIXES: &[&str] = &[
    "", "", "", "", // mostly no suffix
    "Alpha", "Elder", "Brute", "Fiend", "Horror",
    "Warden", "Destroyer", "Executioner", "Ravager", "Overlord", "Champion", "Annihilator",
    "Harbinger", "Devourer", "Sentinel",
];

const BOSS_TITLES: &[&str] = &[
    "the Destroyer", "the Eternal", "the Devourer", "the Corrupted",
    "the Unstoppable", "the Ancient One", "the Nightmare",
    "the Immortal", "Lord of Shadows", "the World Ender", "the Void Walker",
    "the Undying", "the Forsaken King", "the Soul Reaper", "the Abyssal Terror",
    "the Primordial One", "the Chaos Bringer", "the Death Weaver",
];

/// Generate a procedural enemy at given position, zone level, and biome
pub fn generate_enemy(x: f64, y: f64, zone_level: u32, biome: &str) -> EnemyData {
    let mut rng = rand::thread_rng();

    // Determine rank
    let rank_roll: f64 = rng.r#gen();
    let rank = if rank_roll < 0.02 {
        EnemyRank::Boss
    } else if rank_roll < 0.10 {
        EnemyRank::Elite
    } else if rank_roll < 0.30 {
        EnemyRank::Champion
    } else {
        EnemyRank::Normal
    };

    // Determine modifiers based on rank
    let num_modifiers = match rank {
        EnemyRank::Normal => 0,
        EnemyRank::Champion => 1,
        EnemyRank::Elite => rng.gen_range(2..=3),
        EnemyRank::Boss => rng.gen_range(3..=4),
    };

    let mut modifiers = Vec::new();
    let mut available: Vec<usize> = (0..ALL_MODIFIERS.len()).collect();
    for _ in 0..num_modifiers {
        if available.is_empty() { break; }
        let idx = rng.gen_range(0..available.len());
        modifiers.push(ALL_MODIFIERS[available.remove(idx)].clone());
    }

    // Pick biome-appropriate base type
    let biome_types = biome_enemy_types(biome);
    let base_type = biome_types[rng.gen_range(0..biome_types.len())];

    // Random name with prefix and suffix
    let prefix = if rng.gen_bool(0.3) {
        format!("{} ", ENEMY_PREFIXES[rng.gen_range(0..ENEMY_PREFIXES.len())])
    } else {
        String::new()
    };
    let suffix = match rank {
        EnemyRank::Boss => BOSS_TITLES[rng.gen_range(0..BOSS_TITLES.len())].to_string(),
        _ => {
            let s = ENEMY_SUFFIXES[rng.gen_range(0..ENEMY_SUFFIXES.len())];
            if s.is_empty() { String::new() } else { s.to_string() }
        }
    };
    let name = if suffix.is_empty() {
        format!("{}{}", prefix, base_type)
    } else {
        format!("{}{} {}", prefix, base_type, suffix)
    };

    // Enemy level: zone_level ± random, bosses get bonus levels
    let level_offset: i32 = rng.gen_range(-1..=3);
    let rank_level_bonus = match rank {
        EnemyRank::Normal => 0,
        EnemyRank::Champion => 2,
        EnemyRank::Elite => 4,
        EnemyRank::Boss => 8,
    };
    let enemy_level = (zone_level as i32 + level_offset + rank_level_bonus).max(1) as u32;

    // Base stats scale with level
    let level_mult = 1.0 + enemy_level as f64 * 0.15;
    let rank_mult = match rank {
        EnemyRank::Normal => 1.0,
        EnemyRank::Champion => 1.5,
        EnemyRank::Elite => 2.5,
        EnemyRank::Boss => 5.0,
    };
    let base_hp = 50.0;
    let base_atk = 8.0;
    let base_def = 3.0;

    let mut hp = (base_hp * level_mult * rank_mult * rng.gen_range(0.9..1.1)) as i32;
    let mut atk = (base_atk * level_mult * rank_mult * rng.gen_range(0.9..1.1)) as i32;
    let mut def = (base_def * level_mult * rank_mult * rng.gen_range(0.9..1.1)) as i32;

    // Apply modifier stat bonuses
    for modifier in &modifiers {
        match modifier {
            EnemyModifier::Enraged => {
                atk = (atk as f64 * 1.5) as i32;
                def = (def as f64 * 0.8) as i32;
            }
            EnemyModifier::Armored => {
                def = (def as f64 * 1.8) as i32;
            }
            EnemyModifier::Swift => {
                // Speed handled in AI, but give slight HP nerf
                hp = (hp as f64 * 0.85) as i32;
            }
            EnemyModifier::Regenerator => {
                hp = (hp as f64 * 1.3) as i32; // More HP to compensate
            }
            EnemyModifier::Teleporter => {
                hp = (hp as f64 * 0.9) as i32; // Less HP to compensate blink
            }
            EnemyModifier::Shielded => {
                hp = (hp as f64 * 1.4) as i32;
            }
            EnemyModifier::Berserker => {
                atk = (atk as f64 * 1.3) as i32;
                hp = (hp as f64 * 0.85) as i32;
            }
            EnemyModifier::Undying => {
                hp = (hp as f64 * 0.7) as i32; // Less HP since revives
            }
            _ => {} // Other modifiers are behavioral, handled in combat
        }
    }

    // XP reward scales with level and rank
    let rank_xp_mult = match rank {
        EnemyRank::Normal => 1.0,
        EnemyRank::Champion => 2.0,
        EnemyRank::Elite => 4.0,
        EnemyRank::Boss => 10.0,
    };
    let xp_reward = (20.0 * (enemy_level as f64).powf(1.5) * rank_xp_mult) as u64;

    EnemyData {
        id: Uuid::new_v4(),
        name,
        x,
        y,
        hp,
        max_hp: hp,
        level: enemy_level,
        atk,
        def,
        xp_reward,
        patrol_center_x: x,
        patrol_center_y: y,
        patrol_radius: 5.0 + rng.gen_range(0.0..5.0),
        aggro_range: match rank {
            EnemyRank::Boss => 12.0 + rng.gen_range(0.0..4.0),
            EnemyRank::Elite => 9.0 + rng.gen_range(0.0..3.0),
            _ => 6.0 + rng.gen_range(0.0..4.0),
        },
        state: EnemyState::Idle,
        target_player: None,
        rank,
        modifiers,
        attack_cooldown: 0.0,
        flee_cooldown: 0.0,
        stun_ticks: 0,
    }
}

/// Check if a position is in any town's safe zone
fn is_near_any_town(x: f64, y: f64, radius: f64) -> bool {
    for &(tx, ty, tr, _) in TOWNS {
        let dx = x - tx;
        let dy = y - ty;
        if (dx * dx + dy * dy).sqrt() < tr + radius {
            return true;
        }
    }
    false
}

/// Find the nearest town center to flee toward
fn nearest_town_center(x: f64, y: f64) -> (f64, f64) {
    TOWNS.iter()
        .min_by(|a, b| {
            let da = (a.0 - x).powi(2) + (a.1 - y).powi(2);
            let db = (b.0 - x).powi(2) + (b.1 - y).powi(2);
            da.partial_cmp(&db).unwrap()
        })
        .map(|t| (t.0, t.1))
        .unwrap_or((0.0, 0.0))
}

/// Update enemy AI - returns true if enemy moved
pub fn update_enemy_ai(
    enemy: &mut EnemyData,
    players: &[(Uuid, f64, f64)], // (id, x, y)
    dt: f64,
) -> bool {
    if enemy.state == EnemyState::Dead {
        return false;
    }

    // Tick down attack cooldown
    if enemy.attack_cooldown > 0.0 {
        enemy.attack_cooldown -= 1.0;
    }

    // Town safe zone: enemies near any town enter Flee state
    const SAFE_BUFFER: f64 = 5.0;       // how close to town edge before fleeing
    const FLEE_EXIT_BUFFER: f64 = 13.0;  // flee until this far from town edge
    let in_safe_zone = is_near_any_town(enemy.x, enemy.y, SAFE_BUFFER);

    // Tick down flee cooldown
    if enemy.flee_cooldown > 0.0 {
        enemy.flee_cooldown -= 1.0;
    }

    // Tick down stun — stunned enemies can't act
    if enemy.stun_ticks > 0 {
        enemy.stun_ticks -= 1;
        return false; // no movement/action while stunned
    }

    // If enemy enters safe zone while aggressive, start fleeing
    if in_safe_zone {
        if enemy.state == EnemyState::Chase || enemy.state == EnemyState::Attack {
            enemy.state = EnemyState::Flee;
            enemy.target_player = None;
            enemy.flee_cooldown = 200.0; // 10 seconds before can re-aggro
        }
    }

    let speed = 1.5 * dt;
    let mut moved = false;

    match enemy.state {
        EnemyState::Idle => {
            // Only aggro if not in safe zone and flee cooldown expired
            if !in_safe_zone && enemy.flee_cooldown <= 0.0 {
                for &(pid, px, py) in players {
                    if is_near_any_town(px, py, SAFE_BUFFER) { continue; }

                    let dist = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
                    if dist < enemy.aggro_range {
                        enemy.state = EnemyState::Chase;
                        enemy.target_player = Some(pid);
                        break;
                    }
                }
            }

            // Random patrol
            if enemy.state == EnemyState::Idle && rand::thread_rng().gen_bool(0.01) {
                enemy.state = EnemyState::Patrol;
            }
        }
        EnemyState::Patrol => {
            let mut rng = rand::thread_rng();
            let target_x =
                enemy.patrol_center_x + rng.gen_range(-enemy.patrol_radius..enemy.patrol_radius);
            let target_y =
                enemy.patrol_center_y + rng.gen_range(-enemy.patrol_radius..enemy.patrol_radius);

            let dx = target_x - enemy.x;
            let dy = target_y - enemy.y;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist > 0.5 {
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
                moved = true;
            } else {
                enemy.state = EnemyState::Idle;
            }

            // Check aggro (only outside safe zone and no flee cooldown)
            if !is_near_any_town(enemy.x, enemy.y, SAFE_BUFFER) && enemy.flee_cooldown <= 0.0 {
                for &(pid, px, py) in players {
                    if is_near_any_town(px, py, SAFE_BUFFER) { continue; }

                    let pdist = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
                    if pdist < enemy.aggro_range {
                        enemy.state = EnemyState::Chase;
                        enemy.target_player = Some(pid);
                        break;
                    }
                }
            }
        }
        EnemyState::Chase => {
            if let Some(target_id) = enemy.target_player {
                if let Some(&(_, px, py)) = players.iter().find(|(id, _, _)| *id == target_id) {
                    // Drop target if player entered safe zone
                    if is_near_any_town(px, py, SAFE_BUFFER) {
                        enemy.state = EnemyState::Flee;
                        enemy.target_player = None;
                        enemy.flee_cooldown = 200.0;
                    } else {
                        let dx = px - enemy.x;
                        let dy = py - enemy.y;
                        let dist = (dx * dx + dy * dy).sqrt();

                        if dist < 1.5 {
                            enemy.state = EnemyState::Attack;
                        } else if dist > enemy.aggro_range * 2.0 {
                            enemy.state = EnemyState::Idle;
                            enemy.target_player = None;
                        } else {
                            let chase_speed = speed * 1.2;
                            enemy.x += (dx / dist) * chase_speed;
                            enemy.y += (dy / dist) * chase_speed;
                            moved = true;
                        }
                    }
                } else {
                    enemy.state = EnemyState::Idle;
                    enemy.target_player = None;
                }
            }
        }
        EnemyState::Attack => {
            if let Some(target_id) = enemy.target_player {
                if let Some(&(_, px, py)) = players.iter().find(|(id, _, _)| *id == target_id) {
                    // Drop target if player entered safe zone
                    if is_near_any_town(px, py, SAFE_BUFFER) {
                        enemy.state = EnemyState::Flee;
                        enemy.target_player = None;
                        enemy.flee_cooldown = 200.0;
                    } else {
                        let dist =
                            ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
                        if dist > 2.0 {
                            enemy.state = EnemyState::Chase;
                        }
                    }
                } else {
                    enemy.state = EnemyState::Idle;
                    enemy.target_player = None;
                }
            }
        }
        EnemyState::Flee => {
            // Run AWAY from nearest town at increased speed
            let flee_speed = speed * 1.8;
            let (town_x, town_y) = nearest_town_center(enemy.x, enemy.y);
            let dist_to_town = ((enemy.x - town_x).powi(2) + (enemy.y - town_y).powi(2)).sqrt();

            if dist_to_town < 0.1 {
                // Directly on town center — flee toward patrol center
                let dx = enemy.patrol_center_x - enemy.x;
                let dy = enemy.patrol_center_y - enemy.y;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist > 0.1 {
                    enemy.x += (dx / dist) * flee_speed;
                    enemy.y += (dy / dist) * flee_speed;
                    moved = true;
                }
            } else {
                // Flee radially outward from nearest town
                let nx = (enemy.x - town_x) / dist_to_town;
                let ny = (enemy.y - town_y) / dist_to_town;
                enemy.x += nx * flee_speed;
                enemy.y += ny * flee_speed;
                moved = true;
            }

            // Once far enough from any town, head back toward patrol center
            if !is_near_any_town(enemy.x, enemy.y, FLEE_EXIT_BUFFER) {
                // Snap toward patrol center area
                let dx = enemy.patrol_center_x - enemy.x;
                let dy = enemy.patrol_center_y - enemy.y;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist > 3.0 {
                    enemy.x += (dx / dist) * flee_speed;
                    enemy.y += (dy / dist) * flee_speed;
                }
                enemy.state = EnemyState::Idle;
            }
        }
        EnemyState::Dead => {}
    }

    moved
}

/// Pack aggro: returns list of (enemy_id, target_player_id) pairs
/// When an enemy of rank Champion+ enters Chase, nearby idle enemies of same
/// base type also aggro the same target (pack behavior).
pub fn compute_pack_aggro(
    enemies: &[(Uuid, f64, f64, EnemyState, Option<Uuid>, EnemyRank)],
) -> Vec<(Uuid, Uuid)> {
    let pack_range = 8.0_f64;
    let pack_range_sq = pack_range * pack_range;
    let mut aggro_pairs = Vec::new();

    for &(eid, ex, ey, ref state, target, ref rank) in enemies {
        // Only propagate from enemies actively chasing
        if *state != EnemyState::Chase { continue; }
        let target_id = match target {
            Some(t) => t,
            None => continue,
        };
        // Only champions, elites, bosses trigger pack aggro
        if matches!(rank, EnemyRank::Normal) { continue; }

        for &(other_id, ox, oy, ref other_state, _, _) in enemies {
            if other_id == eid { continue; }
            if *other_state != EnemyState::Idle && *other_state != EnemyState::Patrol { continue; }
            let dx = ex - ox;
            let dy = ey - oy;
            if dx * dx + dy * dy < pack_range_sq {
                aggro_pairs.push((other_id, target_id));
            }
        }
    }
    aggro_pairs
}
