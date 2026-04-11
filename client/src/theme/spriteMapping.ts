/**
 * Sprite mapping for Kenney Tiny Dungeon + Tiny Town asset packs.
 * Both spritesheets are 192×176 = 12 columns × 11 rows of 16×16 tiles (no spacing).
 *
 * Kenney.nl — CC0 Licensed (public domain, free for any use).
 */

// === Spritesheet Keys ===
export const SHEET_DUNGEON = 'sheet_dungeon';
export const SHEET_TOWN = 'sheet_town';

// === TINY DUNGEON frame indices (12 cols × 11 rows) ===

// Player class sprites (Row 7 = frames 84–95)
export const PLAYER_SPRITES: Record<string, { sheet: string; frame: number }> = {
  mage:    { sheet: SHEET_DUNGEON, frame: 84 },   // purple hooded wizard
  warrior: { sheet: SHEET_DUNGEON, frame: 87 },   // armored knight w/ cross
  ranger:  { sheet: SHEET_DUNGEON, frame: 86 },   // red-haired ranger
  rogue:   { sheet: SHEET_DUNGEON, frame: 88 },   // dark-skinned rogue
  default: { sheet: SHEET_DUNGEON, frame: 85 },   // brown-haired human
};

// Enemy sprites
export const ENEMY_SPRITES: Record<string, { sheet: string; frame: number }> = {
  enemy_slime:    { sheet: SHEET_DUNGEON, frame: 108 }, // green slime blob
  enemy_skeleton: { sheet: SHEET_DUNGEON, frame: 96 },  // bone skeleton
  enemy_wolf:     { sheet: SHEET_DUNGEON, frame: 109 }, // brown wolf/beast
  enemy_spider:   { sheet: SHEET_DUNGEON, frame: 111 }, // dark spider/creature
  enemy_goblin:   { sheet: SHEET_DUNGEON, frame: 112 }, // small goblin
  enemy_demon:    { sheet: SHEET_DUNGEON, frame: 110 }, // red demon
  enemy_frost:    { sheet: SHEET_DUNGEON, frame: 100 }, // blue/ice knight
  enemy_shadow:   { sheet: SHEET_DUNGEON, frame: 97 },  // dark skeleton/wraith
};

// NPC sprites
export const NPC_SPRITES: Record<string, { sheet: string; frame: number }> = {
  npc_banker:  { sheet: SHEET_DUNGEON, frame: 85 },  // human NPC (banker)
  npc_crafter: { sheet: SHEET_DUNGEON, frame: 99 },  // NPC (crafter)
  npc_market:  { sheet: SHEET_DUNGEON, frame: 98 },  // NPC (merchant)
};

// Item/weapon sprites (Row 10 = frames 120–131, plus potions from row 9)
export const ITEM_SPRITES: Record<string, { sheet: string; frame: number }> = {
  chest:     { sheet: SHEET_DUNGEON, frame: 120 },  // golden chest
  skull:     { sheet: SHEET_DUNGEON, frame: 121 },  // skull
  shield:    { sheet: SHEET_DUNGEON, frame: 122 },  // blue shield
  gem_fire:  { sheet: SHEET_DUNGEON, frame: 123 },  // orange gem
  gem_ice:   { sheet: SHEET_DUNGEON, frame: 124 },  // purple gem
  staff:     { sheet: SHEET_DUNGEON, frame: 125 },  // brown staff/wand
  weapon:    { sheet: SHEET_DUNGEON, frame: 126 },  // red weapon
  potion_hp: { sheet: SHEET_DUNGEON, frame: 127 },  // red potion
  potion_dk: { sheet: SHEET_DUNGEON, frame: 128 },  // dark potion
  potion_rd: { sheet: SHEET_DUNGEON, frame: 129 },  // crimson potion
  potion_mp: { sheet: SHEET_DUNGEON, frame: 114 },  // green potion
  potion_gr: { sheet: SHEET_DUNGEON, frame: 115 },  // red-green potion
  item_drop: { sheet: SHEET_DUNGEON, frame: 120 },  // generic = chest
};

// Dungeon prop sprites
export const DUNGEON_PROPS: Record<string, { sheet: string; frame: number }> = {
  chest:       { sheet: SHEET_DUNGEON, frame: 72 },
  chest_open:  { sheet: SHEET_DUNGEON, frame: 73 },
  barrel:      { sheet: SHEET_DUNGEON, frame: 74 },
  crate:       { sheet: SHEET_DUNGEON, frame: 75 },
  torch:       { sheet: SHEET_DUNGEON, frame: 76 },
};

// === TINY TOWN frame indices (12 cols × 11 rows) ===

// Terrain/vegetation props for world decoration
export const WORLD_PROPS: Record<string, { sheet: string; frame: number }> = {
  // Trees
  tree_green_1:    { sheet: SHEET_TOWN, frame: 6 },   // big green tree
  tree_green_2:    { sheet: SHEET_TOWN, frame: 7 },   // small round green tree
  tree_green_3:    { sheet: SHEET_TOWN, frame: 16 },  // round broccoli tree
  tree_autumn_1:   { sheet: SHEET_TOWN, frame: 9 },   // orange autumn tree
  tree_autumn_2:   { sheet: SHEET_TOWN, frame: 11 },  // tall autumn tree
  tree_fruit:      { sheet: SHEET_TOWN, frame: 17 },  // green tree with red fruit
  tree_pine:       { sheet: SHEET_TOWN, frame: 10 },  // dark pine tree (snow/forest)
  // Bushes
  bush_1:          { sheet: SHEET_TOWN, frame: 8 },   // green bush/shrub
  bush_2:          { sheet: SHEET_TOWN, frame: 19 },  // cross-shaped bush
  bush_3:          { sheet: SHEET_TOWN, frame: 20 },  // round small bush
  autumn_bush:     { sheet: SHEET_TOWN, frame: 22 },  // autumn colored bush
  bush_round:      { sheet: SHEET_TOWN, frame: 23 },  // rounded hedge bush
  // Small vegetation
  flower_1:        { sheet: SHEET_TOWN, frame: 14 },  // orange tulip
  flower_2:        { sheet: SHEET_TOWN, frame: 15 },  // red/orange flower
  grass_tuft:      { sheet: SHEET_TOWN, frame: 18 },  // small grass tuft
  vine:            { sheet: SHEET_TOWN, frame: 21 },  // thin vine/twig
  // Structures/objects
  fence_h:         { sheet: SHEET_TOWN, frame: 3 },   // horizontal fence
  fence_v:         { sheet: SHEET_TOWN, frame: 4 },   // vertical fence
  sign_post:       { sheet: SHEET_TOWN, frame: 47 },  // signpost
  well:            { sheet: SHEET_TOWN, frame: 45 },  // well
  crate_town:      { sheet: SHEET_TOWN, frame: 44 },  // wooden crate
  lamp:            { sheet: SHEET_TOWN, frame: 46 },  // lamp post
  // Rocks/stones
  rock_1:          { sheet: SHEET_TOWN, frame: 29 },  // large rock
  rock_2:          { sheet: SHEET_TOWN, frame: 30 },  // medium rock
  rock_small:      { sheet: SHEET_TOWN, frame: 31 },  // small rock
  stump:           { sheet: SHEET_TOWN, frame: 34 },  // tree stump
  log:             { sheet: SHEET_TOWN, frame: 35 },  // fallen log
  // Dungeon props for world use
  barrel_world:    { sheet: SHEET_DUNGEON, frame: 74 },
  crate_world:     { sheet: SHEET_DUNGEON, frame: 75 },
};

// Town building props (to be verified with actual tile viewing)
export const TOWN_BUILDINGS: Record<string, { sheet: string; frame: number }> = {
  house_small:  { sheet: SHEET_TOWN, frame: 36 },
  house_medium: { sheet: SHEET_TOWN, frame: 37 },
  shop:         { sheet: SHEET_TOWN, frame: 38 },
};

// === Prop placement config per terrain type ===
export interface PropConfig {
  props: string[];      // keys into WORLD_PROPS
  density: number;      // 0-1, probability per tile
  scale?: number;       // base scale multiplier
}

export const TERRAIN_PROPS: Record<number, PropConfig> = {
  // 0 = grass
  0: {
    props: ['tree_green_1', 'tree_green_2', 'bush_1', 'bush_2', 'flower_1', 'flower_2', 'grass_tuft', 'rock_small'],
    density: 0.14,
  },
  // 2 = sand
  2: {
    props: ['grass_tuft', 'rock_1', 'rock_2', 'rock_small', 'bush_3'],
    density: 0.06,
  },
  // 3 = stone
  3: {
    props: ['rock_1', 'rock_2', 'rock_small', 'grass_tuft', 'vine', 'stump'],
    density: 0.1,
  },
  // 4 = snow
  4: {
    props: ['tree_pine', 'tree_green_3', 'bush_3', 'rock_1', 'rock_small', 'stump'],
    density: 0.1,
  },
  // 5 = forest
  5: {
    props: ['tree_green_1', 'tree_green_2', 'tree_green_3', 'tree_pine', 'tree_fruit', 'tree_autumn_1', 'tree_autumn_2', 'bush_1', 'bush_2', 'stump', 'log'],
    density: 0.3,
  },
  // 6 = swamp
  6: {
    props: ['tree_autumn_1', 'tree_autumn_2', 'autumn_bush', 'bush_2', 'vine', 'stump', 'log'],
    density: 0.2,
  },
  // 7 = town
  7: {
    props: ['flower_1', 'flower_2', 'fence_h', 'lamp', 'barrel_world', 'crate_world', 'sign_post'],
    density: 0.08,
  },
  // 1 = water — no props
};

/**
 * Deterministic hash for prop placement.
 * Given grid coords, returns a stable pseudo-random number 0-1.
 */
export function propHash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

/**
 * Pick which prop (if any) to place at a grid cell.
 * Returns null if no prop should be placed.
 */
export function pickPropForTile(
  tileType: number,
  gridX: number,
  gridY: number,
): { sheet: string; frame: number } | null {
  const config = TERRAIN_PROPS[tileType];
  if (!config) return null;

  const roll = propHash(gridX, gridY, 42);
  if (roll > config.density) return null;

  const propIndex = Math.floor(propHash(gridX, gridY, 137) * config.props.length);
  const propKey = config.props[propIndex];
  return WORLD_PROPS[propKey] ?? null;
}
