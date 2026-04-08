use noise::{NoiseFn, Perlin};

use crate::protocol::ChunkData;

pub const CHUNK_SIZE: usize = 32;

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

    fn get_tile(&self, wx: f64, wy: f64) -> u8 {
        let dist = (wx * wx + wy * wy).sqrt();

        // Town area near center
        if dist < 8.0 {
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

    /// Get the zone level (difficulty) based on distance from center
    pub fn get_zone_level(&self, wx: f64, wy: f64) -> u32 {
        let dist = (wx * wx + wy * wy).sqrt();
        let zone_radius = 20.0;
        (dist / zone_radius).floor() as u32
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

        let num_enemies = 2 + (hash_base % 4) as usize; // 2-5 enemies per chunk

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
