use rand::Rng;
use uuid::Uuid;

use crate::protocol::{EnemyData, EnemyModifier, EnemyRank, EnemyState, ALL_MODIFIERS};

/// Names for procedurally generated enemies
const ENEMY_PREFIXES: &[&str] = &[
    "Shadow", "Dire", "Feral", "Savage", "Dark", "Cursed", "Ancient", "Vile",
    "Rabid", "Toxic", "Frost", "Fire", "Storm", "Blood", "Iron", "Crystal",
];

const ENEMY_TYPES: &[&str] = &[
    "Slime", "Wolf", "Spider", "Skeleton", "Goblin", "Rat", "Bat", "Snake",
    "Zombie", "Ghost", "Golem", "Troll", "Orc", "Imp", "Wraith", "Scorpion",
];

const ENEMY_SUFFIXES: &[&str] = &[
    "", "", "", "", // mostly no suffix
    "Alpha", "Elder", "Brute", "Fiend", "Horror",
];

const BOSS_TITLES: &[&str] = &[
    "the Destroyer", "the Eternal", "the Devourer", "the Corrupted",
    "the Unstoppable", "the Ancient One", "the Nightmare",
];

/// Generate a procedural enemy at given position and zone level
pub fn generate_enemy(x: f64, y: f64, zone_level: u32) -> EnemyData {
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

    // Random name
    let prefix = if rng.gen_bool(0.3) {
        format!("{} ", ENEMY_PREFIXES[rng.gen_range(0..ENEMY_PREFIXES.len())])
    } else {
        String::new()
    };
    let base_type = ENEMY_TYPES[rng.gen_range(0..ENEMY_TYPES.len())];
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
    }
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

    // Town safe zone: enemies within 20 tiles of origin lose aggro
    const SAFE_ZONE_RADIUS: f64 = 20.0;
    let enemy_dist_from_origin = (enemy.x * enemy.x + enemy.y * enemy.y).sqrt();
    if enemy_dist_from_origin < SAFE_ZONE_RADIUS {
        if enemy.state == EnemyState::Chase || enemy.state == EnemyState::Attack {
            enemy.state = EnemyState::Idle;
            enemy.target_player = None;
        }
    }

    let speed = 1.5 * dt;
    let mut moved = false;

    match enemy.state {
        EnemyState::Idle => {
            // Only aggro if not in safe zone
            if enemy_dist_from_origin >= SAFE_ZONE_RADIUS {
                for &(pid, px, py) in players {
                    // Don't aggro players inside safe zone
                    let player_dist_origin = (px * px + py * py).sqrt();
                    if player_dist_origin < SAFE_ZONE_RADIUS { continue; }

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

            // Check aggro (only outside safe zone)
            if enemy_dist_from_origin >= SAFE_ZONE_RADIUS {
                for &(pid, px, py) in players {
                    let player_dist_origin = (px * px + py * py).sqrt();
                    if player_dist_origin < SAFE_ZONE_RADIUS { continue; }

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
                } else {
                    enemy.state = EnemyState::Idle;
                    enemy.target_player = None;
                }
            }
        }
        EnemyState::Attack => {
            if let Some(target_id) = enemy.target_player {
                if let Some(&(_, px, py)) = players.iter().find(|(id, _, _)| *id == target_id) {
                    let dist =
                        ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
                    if dist > 2.0 {
                        enemy.state = EnemyState::Chase;
                    }
                } else {
                    enemy.state = EnemyState::Idle;
                    enemy.target_player = None;
                }
            }
        }
        EnemyState::Dead => {}
    }

    moved
}
