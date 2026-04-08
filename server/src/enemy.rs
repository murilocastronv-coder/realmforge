use rand::Rng;
use uuid::Uuid;

use crate::protocol::{EnemyData, EnemyState};

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

/// Generate a procedural enemy at given position and zone level
pub fn generate_enemy(x: f64, y: f64, zone_level: u32) -> EnemyData {
    let mut rng = rand::thread_rng();

    // Random name
    let prefix = if rng.gen_bool(0.3) {
        format!("{} ", ENEMY_PREFIXES[rng.gen_range(0..ENEMY_PREFIXES.len())])
    } else {
        String::new()
    };
    let base_type = ENEMY_TYPES[rng.gen_range(0..ENEMY_TYPES.len())];
    let suffix = ENEMY_SUFFIXES[rng.gen_range(0..ENEMY_SUFFIXES.len())];
    let name = if suffix.is_empty() {
        format!("{}{}", prefix, base_type)
    } else {
        format!("{}{} {}", prefix, base_type, suffix)
    };

    // Enemy level: zone_level ± random
    let level_offset: i32 = rng.gen_range(-1..=3);
    let enemy_level = (zone_level as i32 + level_offset).max(1) as u32;

    // Stats scale with level
    let level_mult = 1.0 + enemy_level as f64 * 0.15;
    let base_hp = 50.0;
    let base_atk = 8.0;
    let base_def = 3.0;

    let hp = (base_hp * level_mult * rng.gen_range(0.9..1.1)) as i32;
    let atk = (base_atk * level_mult * rng.gen_range(0.9..1.1)) as i32;
    let def = (base_def * level_mult * rng.gen_range(0.9..1.1)) as i32;

    // XP reward scales with level^1.5
    let xp_reward = (20.0 * (enemy_level as f64).powf(1.5)) as u64;

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
        aggro_range: 6.0 + rng.gen_range(0.0..4.0),
        state: EnemyState::Idle,
        target_player: None,
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

    let speed = 1.5 * dt;
    let mut moved = false;

    match enemy.state {
        EnemyState::Idle => {
            // Check for nearby players to aggro
            for &(pid, px, py) in players {
                let dist = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
                if dist < enemy.aggro_range {
                    enemy.state = EnemyState::Chase;
                    enemy.target_player = Some(pid);
                    break;
                }
            }

            // Random chance to start patrolling
            if enemy.state == EnemyState::Idle && rand::thread_rng().gen_bool(0.01) {
                enemy.state = EnemyState::Patrol;
            }
        }
        EnemyState::Patrol => {
            // Move toward patrol point
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

            // Check for aggro
            for &(pid, px, py) in players {
                let pdist = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
                if pdist < enemy.aggro_range {
                    enemy.state = EnemyState::Chase;
                    enemy.target_player = Some(pid);
                    break;
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
                        // Lost target
                        enemy.state = EnemyState::Idle;
                        enemy.target_player = None;
                    } else {
                        let chase_speed = speed * 1.2;
                        enemy.x += (dx / dist) * chase_speed;
                        enemy.y += (dy / dist) * chase_speed;
                        moved = true;
                    }
                } else {
                    // Target player disconnected
                    enemy.state = EnemyState::Idle;
                    enemy.target_player = None;
                }
            }
        }
        EnemyState::Attack => {
            // Attack logic handled by combat system
            // Return to chase if target moved away
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
