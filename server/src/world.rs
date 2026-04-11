use noise::{NoiseFn, Perlin};

use crate::protocol::ChunkData;

pub const CHUNK_SIZE: usize = 32;

/// Town definitions: (center_x, center_y, radius, name)
pub const TOWNS: &[(f64, f64, f64, &str)] = &[
    (0.0,    0.0,    15.0, "Starfall Haven"),      // Starting town (center)
    (80.0,   80.0,   10.0, "Ironforge Outpost"),    // NE — near mountains
    (-85.0,  70.0,   10.0, "Frostwind Village"),     // NW — near tundra/crypt
    (-75.0,  -80.0,  10.0, "Shadowmere"),            // SW — near shadow dungeon
    (90.0,   -75.0,  10.0, "Dusthaven"),             // SE — near desert/mines
    (0.0,    120.0,  8.0,  "Northwatch Keep"),       // Far north
    (0.0,    -130.0, 8.0,  "Voidgate Citadel"),      // Far south — near void rift
    (130.0,  0.0,    8.0,  "Sunspire"),              // Far east
    (-130.0, 0.0,    8.0,  "Grimhollow"),            // Far west
    // Outposts for better world coverage
    (50.0,   -50.0,  7.0,  "Riverside Camp"),        // Mid-SE
    (-50.0,  50.0,   7.0,  "Wildwood Hamlet"),       // Mid-NW
    (110.0,  -90.0,  7.0,  "Abyssal Outpost"),       // Near Abyssal Depths
    (-110.0, 70.0,   7.0,  "Temple Landing"),         // Near Sunken Temple
    (60.0,   110.0,  7.0,  "Eagle's Perch"),          // NE outskirts
    // Frontier settlements
    (-40.0, -130.0,  6.0,  "Demonwatch Garrison"),   // Near Demon's Throne
    (130.0,  100.0,  6.0,  "Skyreach Monastery"),    // Near Sky Citadel  
    (140.0, -50.0,   6.0,  "Ashfall Settlement"),    // East volcanic region
    (-140.0, -70.0,  6.0,  "Twilight Refuge"),       // Far SW wilderness
];

/// Buffer around towns where enemies don't spawn (safe zone extends beyond town tiles)
const TOWN_SAFE_BUFFER: f64 = 15.0;

pub struct WorldGenerator {
    elevation_noise: Perlin,
    moisture_noise: Perlin,
    detail_noise: Perlin,
    seed: u32,
}

impl WorldGenerator {
    pub fn new(seed: u32) -> Self {
        Self {
            elevation_noise: Perlin::new(seed),
            moisture_noise: Perlin::new(seed.wrapping_add(1000)),
            detail_noise: Perlin::new(seed.wrapping_add(2000)),
            seed,
        }
    }

    /// Generate a chunk at (chunk_x, chunk_y).
    /// Returns tile types as a 2D array and the dominant biome.
    pub fn generate_chunk(&self, chunk_x: i32, chunk_y: i32) -> ChunkData {
        let mut tiles = vec![vec![0u8; CHUNK_SIZE]; CHUNK_SIZE];
        let mut biome_counts = [0u32; 8];

        let base_x = chunk_x as f64 * CHUNK_SIZE as f64;
        let base_y = chunk_y as f64 * CHUNK_SIZE as f64;

        for y in 0..CHUNK_SIZE {
            for x in 0..CHUNK_SIZE {
                let wx = base_x + x as f64;
                let wy = base_y + y as f64;
                let tile = self.get_tile(wx, wy);
                tiles[y][x] = tile;
                biome_counts[tile as usize] += 1;
            }
        }

        // Find dominant biome
        let dominant = biome_counts
            .iter()
            .enumerate()
            .max_by_key(|&(_, count)| *count)
            .map(|(idx, _)| idx)
            .unwrap_or(0);

        let biome = match dominant {
            0 => "grassland",
            1 => "ocean",
            2 => "desert",
            3 => "mountain",
            4 => "tundra",
            5 => "forest",
            6 => "swamp",
            7 => "town",
            _ => "grassland",
        };

        ChunkData {
            chunk_x,
            chunk_y,
            tiles,
            biome: biome.to_string(),
        }
    }

    /// Check if a position is within any town radius
    pub fn is_in_town(&self, wx: f64, wy: f64) -> bool {
        for &(tx, ty, radius, _) in TOWNS {
            let dx = wx - tx;
            let dy = wy - ty;
            if (dx * dx + dy * dy).sqrt() < radius {
                return true;
            }
        }
        false
    }

    /// Get town info if position is inside a town
    pub fn get_town_info(&self, wx: f64, wy: f64) -> Option<(&'static str, f64, f64)> {
        for &(tx, ty, radius, name) in TOWNS {
            let dx = wx - tx;
            let dy = wy - ty;
            if (dx * dx + dy * dy).sqrt() < radius {
                return Some((name, tx, ty));
            }
        }
        None
    }

    /// Check if position is in a safe zone (any town + buffer)
    pub fn is_safe_zone(&self, wx: f64, wy: f64) -> bool {
        for &(tx, ty, radius, _) in TOWNS {
            let dx = wx - tx;
            let dy = wy - ty;
            if (dx * dx + dy * dy).sqrt() < radius + TOWN_SAFE_BUFFER {
                return true;
            }
        }
        false
    }

    /// Get the biome name at a world position
    pub fn get_biome(&self, wx: f64, wy: f64) -> &'static str {
        // Dungeon zones override biome for thematic enemies
        if let Some((name, _)) = self.get_dungeon_info(wx, wy) {
            return match name {
                "Necropolis" => "undead",
                "Volcanic Forge" | "Infernal Pit" => "volcanic",
                "Abyssal Depths" | "Sunken Temple" => "deep_ocean",
                "Frozen Crypt" | "Frostbite Cavern" => "tundra",
                "Shadow Dungeon" | "Void Rift" => "undead",
                "Sky Citadel" => "celestial",
                "Ashfall Furnace" => "volcanic",
                "Twilight Sanctum" => "undead",
                "Celestial Spire" => "celestial",
                "Demon's Throne" => "volcanic",
                "Crystal Caverns" => "mountain",
                _ => {
                    // Fall through to normal biome
                    match self.get_tile(wx, wy) {
                        0 => "grassland", 1 => "ocean", 2 => "desert",
                        3 => "mountain", 4 => "tundra", 5 => "forest",
                        6 => "swamp", 7 => "town", _ => "grassland",
                    }
                }
            };
        }
        match self.get_tile(wx, wy) {
            0 => "grassland",
            1 => "ocean",
            2 => "desert",
            3 => "mountain",
            4 => "tundra",
            5 => "forest",
            6 => "swamp",
            7 => "town",
            _ => "grassland",
        }
    }

    fn get_tile(&self, wx: f64, wy: f64) -> u8 {
        let dist = (wx * wx + wy * wy).sqrt();

        // Check all towns
        if self.is_in_town(wx, wy) {
            return 7; // town
        }

        let scale = 0.02;
        let detail_scale = 0.08;

        let elevation = self.elevation_noise.get([wx * scale, wy * scale]);
        let moisture = self.moisture_noise.get([wx * scale * 0.7, wy * scale * 0.7]);
        let detail = self.detail_noise.get([wx * detail_scale, wy * detail_scale]);

        // Water: low elevation
        if elevation < -0.3 {
            return 1; // water
        }

        // Mountain: high elevation
        if elevation > 0.6 {
            return 3; // stone/mountain
        }

        // Biome selection based on moisture + distance
        let zone_factor = (dist / 100.0).min(1.0);

        if zone_factor > 0.7 {
            // Far zones
            if moisture < -0.2 {
                return 4; // snow/tundra
            }
            if elevation > 0.3 {
                return 3; // stone
            }
        }

        if moisture > 0.3 {
            if detail > 0.0 {
                return 5; // forest
            }
            return 6; // swamp
        }

        if moisture < -0.3 {
            return 2; // desert/sand
        }

        // Default: grassland
        if detail > 0.4 {
            return 5; // scattered trees → forest
        }

        0 // grass
    }

    /// Get the zone level (difficulty) based on distance from nearest town
    pub fn get_zone_level(&self, wx: f64, wy: f64) -> u32 {
        let dungeon_boost = self.get_dungeon_boost(wx, wy);

        // Safe zone around any town
        if self.is_safe_zone(wx, wy) {
            return 0;
        }

        // Distance from center determines base difficulty
        let dist = (wx * wx + wy * wy).sqrt();
        let zone_radius = 25.0;
        let base = ((dist.max(30.0) - 30.0) / zone_radius).floor() as u32 + 1;
        base + dungeon_boost
    }

    /// Returns bonus level if position is inside a dungeon zone
    pub fn get_dungeon_boost(&self, wx: f64, wy: f64) -> u32 {
        // Static dungeon zone definitions: (center_x, center_y, radius, level_boost)
        const DUNGEONS: &[(f64, f64, f64, u32, &str)] = &[
            (60.0,  60.0,  12.0, 5,  "Goblin Warren"),
            (-65.0, 55.0,  10.0, 8,  "Frozen Crypt"),
            (-55.0, -70.0, 14.0, 10, "Shadow Dungeon"),
            (75.0,  -60.0, 11.0, 7,  "Stone Mines"),
            (0.0,   -100.0, 15.0, 15, "Void Rift"),
            (90.0,  30.0,  10.0, 12, "Dragon's Lair"),
            (-90.0, -40.0, 11.0, 9,  "Necropolis"),
            (40.0,  -85.0, 13.0, 11, "Infernal Pit"),
            (-30.0, 90.0,  10.0, 6,  "Crystal Caverns"),
            (100.0, -90.0, 14.0, 18, "Abyssal Depths"),
            (-110.0, 70.0,  12.0, 13, "Sunken Temple"),
            (120.0,  0.0,   11.0, 16, "Volcanic Forge"),
            (0.0,    120.0, 13.0, 14, "Frostbite Cavern"),
            (-40.0, -120.0, 12.0, 20, "Demon's Throne"),
            (80.0,   100.0, 10.0, 17, "Sky Citadel"),
            // New endgame dungeons
            (140.0,  -50.0, 11.0, 22, "Ashfall Furnace"),
            (-140.0, -70.0, 12.0, 19, "Twilight Sanctum"),
            (130.0,  100.0, 13.0, 25, "Celestial Spire"),
        ];

        for &(cx, cy, radius, boost, _name) in DUNGEONS {
            let dx = wx - cx;
            let dy = wy - cy;
            if (dx * dx + dy * dy).sqrt() <= radius {
                return boost;
            }
        }
        0
    }

    /// Check if a position is in a dungeon zone, returns (name, bonus_level) if so
    pub fn get_dungeon_info(&self, wx: f64, wy: f64) -> Option<(&'static str, u32)> {
        const DUNGEONS: &[(f64, f64, f64, u32, &str)] = &[
            (60.0,  60.0,  12.0, 5,  "Goblin Warren"),
            (-65.0, 55.0,  10.0, 8,  "Frozen Crypt"),
            (-55.0, -70.0, 14.0, 10, "Shadow Dungeon"),
            (75.0,  -60.0, 11.0, 7,  "Stone Mines"),
            (0.0,   -100.0, 15.0, 15, "Void Rift"),
            (90.0,  30.0,  10.0, 12, "Dragon's Lair"),
            (-90.0, -40.0, 11.0, 9,  "Necropolis"),
            (40.0,  -85.0, 13.0, 11, "Infernal Pit"),
            (-30.0, 90.0,  10.0, 6,  "Crystal Caverns"),
            (100.0, -90.0, 14.0, 18, "Abyssal Depths"),
            (-110.0, 70.0,  12.0, 13, "Sunken Temple"),
            (120.0,  0.0,   11.0, 16, "Volcanic Forge"),
            (0.0,    120.0, 13.0, 14, "Frostbite Cavern"),
            (-40.0, -120.0, 12.0, 20, "Demon's Throne"),
            (80.0,   100.0, 10.0, 17, "Sky Citadel"),
            // New endgame dungeons
            (140.0,  -50.0, 11.0, 22, "Ashfall Furnace"),
            (-140.0, -70.0, 12.0, 19, "Twilight Sanctum"),
            (130.0,  100.0, 13.0, 25, "Celestial Spire"),
        ];

        for &(cx, cy, radius, boost, name) in DUNGEONS {
            let dx = wx - cx;
            let dy = wy - cy;
            if (dx * dx + dy * dy).sqrt() <= radius {
                return Some((name, boost));
            }
        }
        None
    }

    /// Get spawn points for enemies in a chunk
    pub fn get_enemy_spawns(&self, chunk_x: i32, chunk_y: i32) -> Vec<(f64, f64, u32)> {
        let mut spawns = Vec::new();
        let base_x = chunk_x as f64 * CHUNK_SIZE as f64;
        let base_y = chunk_y as f64 * CHUNK_SIZE as f64;
        let center_x = base_x + CHUNK_SIZE as f64 / 2.0;
        let center_y = base_y + CHUNK_SIZE as f64 / 2.0;

        let zone_level = self.get_zone_level(center_x, center_y);

        // No enemies in town area
        if zone_level == 0 {
            return spawns;
        }

        // Use deterministic hash for spawn positions
        let seed = self.seed as i64;
        let hash_base = (chunk_x as i64 * 374761393 + chunk_y as i64 * 668265263 + seed) as u64;

        let num_enemies = if self.get_dungeon_boost(center_x, center_y) > 0 {
            4 + (hash_base % 5) as usize // 4-8 enemies in dungeons
        } else {
            2 + (hash_base % 4) as usize // 2-5 enemies normally
        };

        for i in 0..num_enemies {
            let h = hash_base.wrapping_mul(i as u64 + 1).wrapping_add(1013904223);
            let fx = (h % CHUNK_SIZE as u64) as f64 + base_x;
            let fy = ((h / CHUNK_SIZE as u64) % CHUNK_SIZE as u64) as f64 + base_y;

            // Check the tile is walkable (not water)
            let tile = self.get_tile(fx, fy);
            if tile != 1 && tile != 7 {
                // not water, not town
                spawns.push((fx, fy, zone_level));
            }
        }

        spawns
    }
}
