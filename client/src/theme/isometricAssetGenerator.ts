import Phaser from 'phaser';
import { TILE_HEIGHT, TILE_WIDTH } from '../utils/IsoMath';
import { ISOMETRIC_THEME } from './isometricTheme';

// Terrain tile depth edge for 3D isometric look
export const TILE_DEPTH = 8;
export const TERRAIN_TEX_H = TILE_HEIGHT + TILE_DEPTH;
export const TERRAIN_ORIGIN_Y = (TILE_HEIGHT / 2) / TERRAIN_TEX_H;

type Point = readonly [number, number];
type TerrainKey = keyof typeof ISOMETRIC_THEME.terrain;
type TextureGraphics = Phaser.GameObjects.Graphics;
type TextureDrawCallback = (graphics: TextureGraphics) => void;

const TERRAIN_TEXTURE_KEYS = [
  ['grass', 'tile_grass'],
  ['water', 'tile_water'],
  ['sand', 'tile_sand'],
  ['stone', 'tile_stone'],
  ['snow', 'tile_snow'],
  ['forest', 'tile_forest'],
  ['swamp', 'tile_swamp'],
  ['town', 'tile_town'],
] as const satisfies ReadonlyArray<readonly [TerrainKey, string]>;

const XP_ORB_TEXTURES = [
  { key: 'xp_orb_green', ...ISOMETRIC_THEME.textures.xpOrbs.green },
  { key: 'xp_orb_blue', ...ISOMETRIC_THEME.textures.xpOrbs.blue },
  { key: 'xp_orb_purple', ...ISOMETRIC_THEME.textures.xpOrbs.purple },
] as const;

export function generateIsometricTextures(scene: Phaser.Scene): void {
  generateTerrainTextures(scene);
  generatePlayerTexture(scene);
  generateEnemyTexture(scene);
  generateGroundItemTextures(scene);
  generateTownTouchpointTextures(scene);
  generateParticleTextures(scene);
}

function generateTerrainTextures(scene: Phaser.Scene): void {
  for (const [terrainKey, textureKey] of TERRAIN_TEXTURE_KEYS) {
    createTexture(scene, textureKey, TILE_WIDTH, TERRAIN_TEX_H, (graphics) => {
      drawTerrainTile(graphics, terrainKey);
    });
  }
  // Water animation frames with phase-shifted wave patterns
  for (let frame = 0; frame < 4; frame++) {
    createTexture(scene, `tile_water_${frame}`, TILE_WIDTH, TERRAIN_TEX_H, (graphics) => {
      drawTerrainTile(graphics, 'water', frame);
    });
  }
}

function generatePlayerTexture(scene: Phaser.Scene): void {
  createTexture(scene, 'player', 48, 54, (graphics) => {
    const playerTheme = ISOMETRIC_THEME.textures.player;
    const outline = darken(playerTheme.legs, 0.48);
    const bodyShade = darken(playerTheme.body, 0.3);
    const bodyHighlight = lighten(playerTheme.body, 0.2);
    const legShade = darken(playerTheme.legs, 0.18);
    const boots = darken(playerTheme.legs, 0.28);
    const skinShade = darken(playerTheme.skin, 0.18);
    const hairHighlight = lighten(playerTheme.hair, 0.12);

    graphics.fillStyle(ISOMETRIC_THEME.palette.shadow, 0.22);
    graphics.fillEllipse(24, 50, 20, 6);

    const leftLeg = [
      [16, 34],
      [22, 34],
      [21, 46],
      [15, 46],
    ] as const satisfies ReadonlyArray<Point>;
    const rightLeg = [
      [26, 34],
      [32, 34],
      [33, 46],
      [27, 46],
    ] as const satisfies ReadonlyArray<Point>;
    const leftBoot = [
      [14, 46],
      [20, 46],
      [21, 52],
      [13, 52],
    ] as const satisfies ReadonlyArray<Point>;
    const rightBoot = [
      [28, 46],
      [34, 46],
      [35, 52],
      [27, 52],
    ] as const satisfies ReadonlyArray<Point>;
    const torso = [
      [24, 16],
      [35, 23],
      [32, 39],
      [24, 44],
      [16, 39],
      [13, 23],
    ] as const satisfies ReadonlyArray<Point>;
    const head = [
      [24, 4],
      [31, 8],
      [31, 17],
      [24, 21],
      [17, 17],
      [17, 8],
    ] as const satisfies ReadonlyArray<Point>;

    fillPolygon(graphics, leftLeg, playerTheme.legs);
    fillPolygon(graphics, rightLeg, legShade);
    fillPolygon(graphics, leftBoot, boots);
    fillPolygon(graphics, rightBoot, boots);
    strokePolygon(graphics, leftLeg, outline, 0.35);
    strokePolygon(graphics, rightLeg, outline, 0.35);

    fillPolygon(graphics, torso, playerTheme.body);
    fillPolygon(graphics, [
      [24, 16],
      [24, 44],
      [16, 39],
      [13, 23],
    ], bodyShade, 0.95);
    fillPolygon(graphics, [
      [24, 16],
      [35, 23],
      [32, 39],
      [24, 44],
    ], bodyHighlight, 0.82);
    fillPolygon(graphics, [
      [13, 23],
      [10, 31],
      [15, 35],
      [18, 28],
    ], bodyShade, 0.85);
    fillPolygon(graphics, [
      [35, 23],
      [30, 28],
      [33, 35],
      [38, 31],
    ], bodyHighlight, 0.85);
    fillPolygon(graphics, [
      [17, 32],
      [31, 32],
      [30, 36],
      [18, 36],
    ], playerTheme.belt);
    fillPolygon(graphics, diamond(24, 26, 6, 8), lighten(playerTheme.body, 0.36), 0.62);
    strokePolygon(graphics, torso, outline, 0.5);

    fillPolygon(graphics, head, playerTheme.skin);
    fillPolygon(graphics, [
      [24, 4],
      [24, 21],
      [17, 17],
      [17, 8],
    ], skinShade, 0.9);
    fillPolygon(graphics, [
      [24, 2],
      [31, 6],
      [29, 10],
      [24, 8],
      [19, 10],
      [17, 6],
    ], playerTheme.hair);
    fillPolygon(graphics, [
      [24, 2],
      [31, 6],
      [29, 10],
      [24, 8],
    ], hairHighlight, 0.72);
    fillPolygon(graphics, diamond(21, 12, 2, 3), playerTheme.eyes);
    fillPolygon(graphics, diamond(27, 12, 2, 3), playerTheme.eyes);
    fillPolygon(graphics, diamond(24, 16, 3, 2), playerTheme.mouth, 0.75);
    strokePolygon(graphics, head, outline, 0.4);
  });
}

function generateEnemyTexture(scene: Phaser.Scene): void {
  const ENEMY_VARIANTS: Array<{ key: string; themeKey: keyof typeof ISOMETRIC_THEME.textures }> = [
    { key: 'enemy_slime', themeKey: 'enemySlime' },
    { key: 'enemy_wolf', themeKey: 'enemyWolf' },
    { key: 'enemy_spider', themeKey: 'enemySpider' },
    { key: 'enemy_skeleton', themeKey: 'enemySkeleton' },
    { key: 'enemy_goblin', themeKey: 'enemyGoblin' },
    { key: 'enemy_demon', themeKey: 'enemyDemon' },
    { key: 'enemy_frost', themeKey: 'enemyFrost' },
    { key: 'enemy_shadow', themeKey: 'enemyShadow' },
  ];

  for (const variant of ENEMY_VARIANTS) {
    const enemyTheme = ISOMETRIC_THEME.textures[variant.themeKey] as {
      shadow: number; body: number; highlight: number; eyeGlow: number; mouth: number;
    };
    createTexture(scene, variant.key, 48, 48, (graphics) => {
      const bodyShade = darken(enemyTheme.body, 0.26);
      const outline = darken(enemyTheme.body, 0.55);
      const shell = [
        [24, 7],
        [35, 12],
        [40, 24],
        [36, 36],
        [24, 42],
        [12, 36],
        [8, 24],
        [13, 12],
      ] as const satisfies ReadonlyArray<Point>;

      graphics.fillStyle(enemyTheme.shadow, 0.18);
      graphics.fillEllipse(24, 42, 24, 8);

      fillPolygon(graphics, shell, enemyTheme.body);
      fillPolygon(graphics, [
        [24, 7],
        [24, 42],
        [12, 36],
        [8, 24],
        [13, 12],
      ], bodyShade, 0.95);
      fillPolygon(graphics, [
        [24, 7],
        [35, 12],
        [40, 24],
        [36, 36],
        [24, 42],
      ], enemyTheme.highlight, 0.82);
      fillPolygon(graphics, diamond(24, 9, 10, 10), lighten(enemyTheme.highlight, 0.2), 0.78);
      fillPolygon(graphics, [
        [18, 31],
        [24, 35],
        [30, 31],
        [24, 33],
      ], enemyTheme.mouth, 0.85);
      strokePolygon(graphics, shell, outline, 0.55);

      drawDiamondEye(graphics, 17, 24, 6, enemyTheme.eyeGlow, enemyTheme.shadow);
      drawDiamondEye(graphics, 31, 24, 6, enemyTheme.eyeGlow, enemyTheme.shadow);
      fillPolygon(graphics, diamond(29, 17, 8, 5), lighten(enemyTheme.highlight, 0.5), 0.24);
    });
  }
}

function generateGroundItemTextures(scene: Phaser.Scene): void {
  createTexture(scene, 'item_drop', 24, 24, (graphics) => {
    const itemTheme = ISOMETRIC_THEME.textures.itemDrop;
    const bagBase = mixColors(itemTheme.bag, ISOMETRIC_THEME.palette.white, 0.55);
    const bagShade = darken(bagBase, 0.22);
    const bagHighlight = lighten(bagBase, 0.14);
    const outline = darken(itemTheme.tie, 0.25);
    const bag = [
      [12, 5],
      [18, 9],
      [18, 18],
      [12, 22],
      [6, 18],
      [6, 9],
    ] as const satisfies ReadonlyArray<Point>;

    graphics.fillStyle(itemTheme.shadow, 0.18);
    graphics.fillEllipse(12, 20, 12, 4);

    fillPolygon(graphics, bag, bagBase);
    fillPolygon(graphics, [
      [12, 5],
      [12, 22],
      [6, 18],
      [6, 9],
    ], bagShade, 0.95);
    fillPolygon(graphics, [
      [12, 5],
      [18, 9],
      [18, 18],
      [12, 22],
    ], bagHighlight, 0.84);
    fillPolygon(graphics, diamond(12, 6, 8, 7), itemTheme.tie);
    fillPolygon(graphics, diamond(12, 11, 4, 5), itemTheme.shine, 0.72);
    strokePolygon(graphics, bag, outline, 0.48);
    strokePolygon(graphics, diamond(12, 6, 8, 7), outline, 0.42);
  });

  for (const orb of XP_ORB_TEXTURES) {
    createTexture(scene, orb.key, 20, 20, (graphics) => {
      const orbShade = darken(orb.fill, 0.25);
      const orbHighlight = lighten(orb.fill, 0.2);
      const orbOutline = darken(orb.fill, 0.42);
      const gem = diamond(10, 10, 12, 16);

      graphics.fillStyle(orb.glow, 0.24);
      graphics.fillCircle(10, 10, 8);
      fillPolygon(graphics, gem, orb.fill);
      fillPolygon(graphics, [
        [10, 2],
        [10, 18],
        [4, 8],
      ], orbShade, 0.95);
      fillPolygon(graphics, [
        [10, 2],
        [16, 8],
        [10, 18],
      ], orbHighlight, 0.84);
      fillPolygon(graphics, diamond(10, 7, 5, 5), ISOMETRIC_THEME.palette.white, 0.7);
      strokePolygon(graphics, gem, orbOutline, 0.42);
    });
  }
}

type SupportNpcPalette = {
  robe: number;
  trim: number;
  skin: number;
  hair: number;
  accessory: number;
};

function generateTownTouchpointTextures(scene: Phaser.Scene): void {
  createTexture(scene, 'npc_banker', 48, 56, (graphics) => {
    drawSupportNpc(graphics, {
      robe: mixColors(ISOMETRIC_THEME.palette.sky, ISOMETRIC_THEME.palette.surfaceInsetWarm, 0.58),
      trim: ISOMETRIC_THEME.palette.gold,
      skin: ISOMETRIC_THEME.text.gold,
      hair: ISOMETRIC_THEME.palette.surfaceInsetWarm,
      accessory: ISOMETRIC_THEME.palette.gold,
    }, 'ledger');
  });

  createTexture(scene, 'npc_crafter', 48, 56, (graphics) => {
    drawSupportNpc(graphics, {
      robe: mixColors(ISOMETRIC_THEME.palette.amber, ISOMETRIC_THEME.palette.surfaceMuted, 0.38),
      trim: ISOMETRIC_THEME.text.magic,
      skin: 0xf0c7a1,
      hair: 0x5f4630,
      accessory: ISOMETRIC_THEME.palette.amber,
    }, 'hammer');
  });

  createTexture(scene, 'landmark_market_closed', 56, 52, (graphics) => {
    const roofBase = mixColors(ISOMETRIC_THEME.text.danger, ISOMETRIC_THEME.palette.surfaceMuted, 0.25);
    const roofShade = darken(roofBase, 0.28);
    const post = mixColors(ISOMETRIC_THEME.palette.surfaceInsetWarm, ISOMETRIC_THEME.palette.white, 0.18);
    const postShade = darken(post, 0.25);
    const cloth = mixColors(ISOMETRIC_THEME.palette.surfaceMuted, ISOMETRIC_THEME.palette.shadow, 0.08);

    graphics.fillStyle(ISOMETRIC_THEME.palette.shadow, 0.22);
    graphics.fillEllipse(28, 45, 28, 8);

    graphics.fillStyle(postShade, 0.95);
    graphics.fillRect(12, 22, 4, 20);
    graphics.fillRect(40, 22, 4, 20);
    graphics.fillStyle(post, 0.95);
    graphics.fillRect(16, 22, 2, 20);
    graphics.fillRect(38, 22, 2, 20);

    fillPolygon(graphics, [
      [28, 6],
      [46, 16],
      [28, 26],
      [10, 16],
    ], roofBase);
    fillPolygon(graphics, [
      [28, 6],
      [28, 26],
      [10, 16],
    ], roofShade, 0.96);
    strokePolygon(graphics, [
      [28, 6],
      [46, 16],
      [28, 26],
      [10, 16],
    ], darken(roofBase, 0.4), 0.72);

    graphics.fillStyle(cloth, 0.96);
    graphics.fillRect(14, 26, 28, 12);
    graphics.fillStyle(lighten(cloth, 0.08), 0.96);
    graphics.fillRect(14, 26, 28, 3);
    graphics.lineStyle(1, darken(cloth, 0.18), 0.78);
    graphics.strokeRect(14, 26, 28, 12);

    fillPolygon(graphics, diamond(28, 32, 12, 14), ISOMETRIC_THEME.text.danger, 0.92);
    fillPolygon(graphics, diamond(24, 32, 2, 6), ISOMETRIC_THEME.palette.white, 0.9);
    fillPolygon(graphics, diamond(32, 32, 2, 6), ISOMETRIC_THEME.palette.white, 0.9);
    fillPolygon(graphics, diamond(28, 32, 8, 2), ISOMETRIC_THEME.palette.white, 0.9);
  });

  // Open marketplace stall texture
  createTexture(scene, 'landmark_market_open', 56, 52, (graphics) => {
    const roofBase = mixColors(ISOMETRIC_THEME.ui.accents.success, ISOMETRIC_THEME.palette.surfaceMuted, 0.25);
    const roofShade = darken(roofBase, 0.28);
    const post = mixColors(ISOMETRIC_THEME.palette.surfaceInsetWarm, ISOMETRIC_THEME.palette.white, 0.18);
    const postShade = darken(post, 0.25);
    const cloth = mixColors(ISOMETRIC_THEME.palette.surfaceMuted, ISOMETRIC_THEME.palette.shadow, 0.08);

    graphics.fillStyle(ISOMETRIC_THEME.palette.shadow, 0.22);
    graphics.fillEllipse(28, 45, 28, 8);

    graphics.fillStyle(postShade, 0.95);
    graphics.fillRect(12, 22, 4, 20);
    graphics.fillRect(40, 22, 4, 20);
    graphics.fillStyle(post, 0.95);
    graphics.fillRect(16, 22, 2, 20);
    graphics.fillRect(38, 22, 2, 20);

    fillPolygon(graphics, [[28, 6], [46, 16], [28, 26], [10, 16]], roofBase);
    fillPolygon(graphics, [[28, 6], [28, 26], [10, 16]], roofShade, 0.96);
    strokePolygon(graphics, [[28, 6], [46, 16], [28, 26], [10, 16]], darken(roofBase, 0.4), 0.72);

    graphics.fillStyle(cloth, 0.96);
    graphics.fillRect(14, 26, 28, 12);
    graphics.fillStyle(lighten(cloth, 0.08), 0.96);
    graphics.fillRect(14, 26, 28, 3);
    graphics.lineStyle(1, darken(cloth, 0.18), 0.78);
    graphics.strokeRect(14, 26, 28, 12);

    // Gold coin icon instead of X
    graphics.fillStyle(ISOMETRIC_THEME.palette.gold, 0.95);
    graphics.fillCircle(28, 32, 5);
    graphics.fillStyle(lighten(ISOMETRIC_THEME.palette.gold, 0.3), 0.8);
    graphics.fillCircle(27, 31, 2);
    graphics.lineStyle(1, darken(ISOMETRIC_THEME.palette.gold, 0.3), 0.8);
    graphics.strokeCircle(28, 32, 5);
  });

  // Health fountain texture
  createTexture(scene, 'landmark_fountain', 56, 56, (graphics) => {
    const ft = ISOMETRIC_THEME.textures.fountain;
    const baseShade = darken(ft.base, 0.25);
    const pillarShade = darken(ft.pillar, 0.2);

    // Shadow
    graphics.fillStyle(ISOMETRIC_THEME.palette.shadow, 0.22);
    graphics.fillEllipse(28, 48, 32, 10);

    // Basin (octagonal base)
    const basin = [
      [28, 28], [40, 32], [44, 40], [40, 48],
      [28, 52], [16, 48], [12, 40], [16, 32],
    ] as const satisfies ReadonlyArray<Point>;
    fillPolygon(graphics, basin, ft.basin);
    fillPolygon(graphics, [
      [28, 28], [28, 52], [16, 48], [12, 40], [16, 32],
    ], baseShade, 0.9);
    strokePolygon(graphics, basin, darken(ft.basin, 0.4), 0.6);

    // Water surface
    const waterSurface = [
      [28, 32], [38, 35], [40, 42], [38, 46],
      [28, 48], [18, 46], [16, 42], [18, 35],
    ] as const satisfies ReadonlyArray<Point>;
    fillPolygon(graphics, waterSurface, ft.water, 0.8);
    fillPolygon(graphics, diamond(28, 40, 14, 8), ft.waterGlow, 0.4);

    // Central pillar
    fillPolygon(graphics, [[24, 8], [32, 8], [34, 32], [22, 32]], ft.pillar);
    fillPolygon(graphics, [[24, 8], [28, 32], [22, 32]], pillarShade, 0.9);
    strokePolygon(graphics, [[24, 8], [32, 8], [34, 32], [22, 32]], darken(ft.pillar, 0.4), 0.5);

    // Pillar cap
    fillPolygon(graphics, diamond(28, 6, 12, 6), lighten(ft.pillar, 0.2));
    strokePolygon(graphics, diamond(28, 6, 12, 6), darken(ft.pillar, 0.3), 0.5);

    // Water spout glow
    graphics.fillStyle(ft.waterGlow, 0.6);
    graphics.fillCircle(28, 14, 3);
    graphics.fillStyle(ISOMETRIC_THEME.palette.white, 0.4);
    graphics.fillCircle(27, 13, 1.5);
  });
}

function generateParticleTextures(scene: Phaser.Scene): void {
  const particleTheme = ISOMETRIC_THEME.textures.particles;
  const sparkBase = mixColors(particleTheme.spark, ISOMETRIC_THEME.palette.white, 0.1);
  const starBase = mixColors(particleTheme.star, ISOMETRIC_THEME.palette.white, 0.82);
  const glowBase = mixColors(particleTheme.glow, ISOMETRIC_THEME.palette.white, 0.12);
  const bloodBase = mixColors(particleTheme.blood, ISOMETRIC_THEME.palette.white, 0.88);

  createTexture(scene, 'particle_spark', 10, 10, (graphics) => {
    fillPolygon(graphics, buildStarPoints(5, 5, 4, 5, 2.1), sparkBase, 0.92);
    fillPolygon(graphics, diamond(5, 5, 4, 4), ISOMETRIC_THEME.palette.white, 0.85);
  });

  createTexture(scene, 'particle_star', 12, 12, (graphics) => {
    fillPolygon(graphics, buildStarPoints(6, 6, 5, 6, 2.5), starBase, 0.96);
    fillPolygon(graphics, diamond(6, 6, 4, 4), ISOMETRIC_THEME.palette.white, 0.82);
  });

  createTexture(scene, 'particle_glow', 12, 12, (graphics) => {
    graphics.fillStyle(glowBase, 0.28);
    graphics.fillCircle(6, 6, 6);
    fillPolygon(graphics, diamond(6, 6, 6, 8), ISOMETRIC_THEME.palette.white, 0.72);
    fillPolygon(graphics, diamond(6, 6, 3, 4), glowBase, 0.6);
  });

  createTexture(scene, 'particle_blood', 8, 8, (graphics) => {
    fillPolygon(graphics, [
      [4, 0],
      [7, 2],
      [6, 7],
      [2, 8],
      [0, 3],
    ], bloodBase, 0.9);
    fillPolygon(graphics, diamond(3, 4, 3, 4), ISOMETRIC_THEME.palette.white, 0.42);
  });

  // --- Effect Particles ---

  createTexture(scene, 'particle_poison', 12, 12, (graphics) => {
    graphics.fillStyle(ISOMETRIC_THEME.effects.poison.particle, 1);
    graphics.fillCircle(5, 5, 4);
    graphics.fillStyle(ISOMETRIC_THEME.effects.poison.glow, 0.5);
    graphics.fillCircle(5, 5, 6);
  });

  createTexture(scene, 'particle_fire', 12, 12, (graphics) => {
    fillPolygon(graphics, [
      [6, 0], [8, 4], [12, 5], [8, 8], [9, 12], [6, 9], [3, 12], [4, 8], [0, 5], [4, 4],
    ], ISOMETRIC_THEME.effects.burn.particle);
  });

  createTexture(scene, 'particle_ice', 12, 12, (graphics) => {
    fillPolygon(graphics, [
      [6, 0], [8, 4], [12, 6], [8, 8], [6, 12], [4, 8], [0, 6], [4, 4],
    ], ISOMETRIC_THEME.effects.freeze.particle);
    graphics.fillStyle(0xffffff, 0.4);
    graphics.fillCircle(6, 6, 2);
  });

  createTexture(scene, 'particle_bleed', 10, 10, (graphics) => {
    fillPolygon(graphics, [
      [5, 0], [9, 5], [8, 9], [5, 10], [2, 9], [1, 5],
    ], ISOMETRIC_THEME.effects.bleed.particle);
  });

  createTexture(scene, 'particle_shield', 12, 12, (graphics) => {
    graphics.fillStyle(ISOMETRIC_THEME.effects.shield.particle, 0.7);
    graphics.fillCircle(6, 6, 5);
    graphics.fillStyle(0xffffff, 0.3);
    graphics.fillCircle(4, 4, 2);
  });

  createTexture(scene, 'particle_regen', 12, 12, (graphics) => {
    fillPolygon(graphics, buildStarPoints(6, 6, 4, 5, 2), ISOMETRIC_THEME.effects.regen.particle);
    graphics.fillStyle(0xffffff, 0.5);
    graphics.fillCircle(6, 6, 2);
  });

  createTexture(scene, 'particle_stun', 12, 12, (graphics) => {
    fillPolygon(graphics, buildStarPoints(6, 6, 5, 5, 2), ISOMETRIC_THEME.effects.stun.particle);
  });

  createTexture(scene, 'particle_strength', 12, 12, (graphics) => {
    fillPolygon(graphics, [[6, 0], [12, 10], [0, 10]], ISOMETRIC_THEME.effects.strength.particle, 0.8);
  });

  createTexture(scene, 'particle_haste', 12, 12, (graphics) => {
    fillPolygon(graphics, [
      [0, 6], [4, 2], [8, 4], [12, 0], [10, 6], [12, 12], [8, 8], [4, 10],
    ], ISOMETRIC_THEME.effects.haste.particle, 0.8);
  });
}

function drawSupportNpc(
  graphics: TextureGraphics,
  palette: SupportNpcPalette,
  accessory: 'ledger' | 'hammer',
): void {
  const robeShade = darken(palette.robe, 0.24);
  const robeHighlight = lighten(palette.robe, 0.14);
  const trimShade = darken(palette.trim, 0.16);
  const skinShade = darken(palette.skin, 0.16);
  const hairHighlight = lighten(palette.hair, 0.14);
  const outline = darken(palette.robe, 0.52);
  const boots = darken(palette.robe, 0.32);

  graphics.fillStyle(ISOMETRIC_THEME.palette.shadow, 0.22);
  graphics.fillEllipse(24, 52, 20, 6);

  const robe = [
    [24, 18],
    [35, 24],
    [34, 47],
    [24, 54],
    [14, 47],
    [13, 24],
  ] as const satisfies ReadonlyArray<Point>;
  const head = [
    [24, 4],
    [31, 8],
    [31, 17],
    [24, 21],
    [17, 17],
    [17, 8],
  ] as const satisfies ReadonlyArray<Point>;

  fillPolygon(graphics, robe, palette.robe);
  fillPolygon(graphics, [
    [24, 18],
    [24, 54],
    [14, 47],
    [13, 24],
  ], robeShade, 0.96);
  fillPolygon(graphics, [
    [24, 18],
    [35, 24],
    [34, 47],
    [24, 54],
  ], robeHighlight, 0.82);
  fillPolygon(graphics, [
    [18, 45],
    [30, 45],
    [28, 49],
    [20, 49],
  ], palette.trim, 0.92);
  fillPolygon(graphics, [
    [19, 49],
    [23, 49],
    [23, 55],
    [17, 55],
  ], boots);
  fillPolygon(graphics, [
    [25, 49],
    [29, 49],
    [31, 55],
    [25, 55],
  ], boots);
  fillPolygon(graphics, diamond(24, 30, 10, 12), trimShade, 0.55);
  strokePolygon(graphics, robe, outline, 0.52);

  fillPolygon(graphics, head, palette.skin);
  fillPolygon(graphics, [
    [24, 4],
    [24, 21],
    [17, 17],
    [17, 8],
  ], skinShade, 0.9);
  fillPolygon(graphics, [
    [24, 2],
    [31, 6],
    [29, 10],
    [24, 8],
    [19, 10],
    [17, 6],
  ], palette.hair);
  fillPolygon(graphics, [
    [24, 2],
    [31, 6],
    [29, 10],
    [24, 8],
  ], hairHighlight, 0.72);
  fillPolygon(graphics, diamond(21, 12, 2, 3), ISOMETRIC_THEME.palette.shadow);
  fillPolygon(graphics, diamond(27, 12, 2, 3), ISOMETRIC_THEME.palette.shadow);
  fillPolygon(graphics, diamond(24, 16, 3, 2), 0xd08a72, 0.78);
  strokePolygon(graphics, head, darken(palette.hair, 0.24), 0.4);

  if (accessory === 'ledger') {
    fillPolygon(graphics, [
      [31, 28],
      [36, 31],
      [34, 40],
      [29, 37],
    ], palette.accessory, 0.95);
    fillPolygon(graphics, [
      [30, 29],
      [33, 31],
      [32, 37],
      [29, 35],
    ], lighten(palette.accessory, 0.18), 0.82);
    strokePolygon(graphics, [
      [31, 28],
      [36, 31],
      [34, 40],
      [29, 37],
    ], darken(palette.accessory, 0.35), 0.7);
  } else {
    fillPolygon(graphics, [
      [13, 25],
      [17, 27],
      [24, 21],
      [22, 19],
    ], palette.accessory, 0.92);
    fillPolygon(graphics, [
      [10, 29],
      [15, 31],
      [15, 37],
      [10, 35],
    ], lighten(palette.accessory, 0.12), 0.9);
    fillPolygon(graphics, [
      [15, 28],
      [18, 29],
      [18, 39],
      [15, 38],
    ], darken(palette.accessory, 0.28), 0.95);
    strokePolygon(graphics, [
      [10, 29],
      [15, 31],
      [15, 37],
      [10, 35],
    ], darken(palette.accessory, 0.42), 0.74);
  }
}

// ============================================
// Enhanced Terrain Tile Rendering
// ============================================

const DIA_CX = TILE_WIDTH / 2;
const DIA_CY = TILE_HEIGHT / 2;
const DIA_HW = (TILE_WIDTH - 4) / 2;
const DIA_HH = (TILE_HEIGHT - 4) / 2;

function detailHash(a: number, b: number, seed: number): number {
  let h = (a * 374761393 + b * 668265263 + seed * 1013904223) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967296;
}

function inDiamond(px: number, py: number): boolean {
  return Math.abs(px - DIA_CX) / DIA_HW + Math.abs(py - DIA_CY) / DIA_HH <= 1;
}

function scatterPixels(
  graphics: TextureGraphics,
  count: number,
  seed: number,
  size: number,
  color: number,
  alpha: number,
): void {
  graphics.fillStyle(color, alpha);
  for (let i = 0; i < count; i++) {
    const px = 6 + Math.floor(detailHash(i, 0, seed) * (TILE_WIDTH - 12));
    const py = 4 + Math.floor(detailHash(0, i, seed) * (TILE_HEIGHT - 8));
    if (inDiamond(px, py)) {
      graphics.fillRect(px, py, size, size);
    }
  }
}

function drawDepthEdge(graphics: TextureGraphics, terrain: { fill: number; edge: number }): void {
  const bottom: Point = [DIA_CX, TILE_HEIGHT - 2];
  const right: Point = [TILE_WIDTH - 2, DIA_CY];
  const left: Point = [2, DIA_CY];
  const bottomD: Point = [DIA_CX, TILE_HEIGHT - 2 + TILE_DEPTH];
  const rightD: Point = [TILE_WIDTH - 2, DIA_CY + TILE_DEPTH];
  const leftD: Point = [2, DIA_CY + TILE_DEPTH];

  // Left face (shadow side)
  fillPolygon(graphics, [left, bottom, bottomD, leftD], darken(terrain.edge, 0.3));
  // Right face (lit side)
  fillPolygon(graphics, [bottom, right, rightD, bottomD], darken(terrain.edge, 0.1));
  // Outline
  strokePolygon(graphics, [left, bottom, bottomD, leftD], darken(terrain.edge, 0.5), 0.45);
  strokePolygon(graphics, [bottom, right, rightD, bottomD], darken(terrain.edge, 0.4), 0.45);
}

function drawBaseDiamond(graphics: TextureGraphics, terrain: { fill: number; edge: number }): void {
  const top: Point = [DIA_CX, 2];
  const right: Point = [TILE_WIDTH - 2, DIA_CY];
  const bottom: Point = [DIA_CX, TILE_HEIGHT - 2];
  const left: Point = [2, DIA_CY];
  const face = [top, right, bottom, left] as const satisfies ReadonlyArray<Point>;

  fillPolygon(graphics, face, terrain.fill);
  fillPolygon(graphics, [top, bottom, left], darken(terrain.fill, 0.16), 0.5);
  fillPolygon(graphics, [top, right, bottom], lighten(terrain.fill, 0.1), 0.3);
  fillPolygon(graphics, diamond(DIA_CX, DIA_CY, 38, 18), lighten(terrain.fill, 0.12), 0.16);
}

function drawTerrainTile(graphics: TextureGraphics, terrainKey: TerrainKey, waterFrame = 0): void {
  const terrain = ISOMETRIC_THEME.terrain[terrainKey];

  drawDepthEdge(graphics, terrain);
  drawBaseDiamond(graphics, terrain);

  switch (terrainKey) {
    case 'grass': drawGrassDetail(graphics, terrain); break;
    case 'water': drawWaterDetail(graphics, terrain, waterFrame); break;
    case 'sand': drawSandDetail(graphics, terrain); break;
    case 'stone': drawStoneDetail(graphics, terrain); break;
    case 'snow': drawSnowDetail(graphics, terrain); break;
    case 'forest': drawForestDetail(graphics, terrain); break;
    case 'swamp': drawSwampDetail(graphics, terrain); break;
    case 'town': drawTownDetail(graphics, terrain); break;
  }

  const top: Point = [DIA_CX, 2];
  const right: Point = [TILE_WIDTH - 2, DIA_CY];
  const bottom: Point = [DIA_CX, TILE_HEIGHT - 2];
  const left: Point = [2, DIA_CY];
  strokePolygon(graphics, [top, right, bottom, left], terrain.edge, 0.6);
}

// ---- Per-biome detail functions ----

function drawGrassDetail(graphics: TextureGraphics, t: { fill: number; edge: number }): void {
  // Scattered lighter grass patches
  scatterPixels(graphics, 14, 101, 2, lighten(t.fill, 0.2), 0.55);
  scatterPixels(graphics, 8, 202, 3, lighten(t.fill, 0.1), 0.3);
  scatterPixels(graphics, 6, 303, 2, darken(t.fill, 0.15), 0.4);

  // Grass blade tufts
  const bladeA = lighten(t.fill, 0.26);
  const bladeB = darken(t.fill, 0.04);
  graphics.lineStyle(1, bladeA, 0.65);
  graphics.beginPath(); graphics.moveTo(22, 18); graphics.lineTo(24, 11); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(24, 11); graphics.lineTo(26, 18); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(36, 15); graphics.lineTo(38, 9); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(38, 9); graphics.lineTo(40, 15); graphics.strokePath();
  graphics.lineStyle(1, bladeB, 0.5);
  graphics.beginPath(); graphics.moveTo(18, 14); graphics.lineTo(20, 9); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(20, 9); graphics.lineTo(22, 14); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(30, 20); graphics.lineTo(32, 14); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(32, 14); graphics.lineTo(34, 20); graphics.strokePath();

  // Tiny wildflower dots
  graphics.fillStyle(0xf0e050, 0.7); graphics.fillRect(28, 12, 1, 1); graphics.fillRect(42, 14, 1, 1);
  graphics.fillStyle(0xffffff, 0.55); graphics.fillRect(16, 16, 1, 1); graphics.fillRect(46, 15, 1, 1);
  graphics.fillStyle(0xe87070, 0.5); graphics.fillRect(35, 18, 1, 1);
}

function drawWaterDetail(graphics: TextureGraphics, t: { fill: number; edge: number }, frame: number): void {
  // Depth gradient
  fillPolygon(graphics, [[DIA_CX, 2], [DIA_CX, DIA_CY], [2, DIA_CY]], lighten(t.fill, 0.1), 0.22);
  fillPolygon(graphics, [[DIA_CX, TILE_HEIGHT - 2], [DIA_CX, DIA_CY], [TILE_WIDTH - 2, DIA_CY]], darken(t.fill, 0.1), 0.18);

  // Wave crests (shift position per frame for animation)
  const ph = frame * 3;
  const waveHi = lighten(t.fill, 0.3);
  const waveLo = darken(t.fill, 0.06);

  graphics.lineStyle(1, waveHi, 0.5);
  graphics.beginPath();
  graphics.moveTo(14 + ph, 11); graphics.lineTo(22 + ph, 9); graphics.lineTo(30 + ph, 11);
  graphics.strokePath();
  graphics.lineStyle(1, waveHi, 0.38);
  graphics.beginPath();
  graphics.moveTo(10 + (ph * 0.7 | 0), 17); graphics.lineTo(20 + (ph * 0.7 | 0), 15); graphics.lineTo(30 + (ph * 0.7 | 0), 17);
  graphics.strokePath();
  graphics.lineStyle(1, waveLo, 0.28);
  graphics.beginPath();
  graphics.moveTo(18 + (ph * 0.5 | 0), 22); graphics.lineTo(26 + (ph * 0.5 | 0), 20); graphics.lineTo(34 + (ph * 0.5 | 0), 22);
  graphics.strokePath();

  // Foam highlights
  graphics.fillStyle(0xffffff, 0.3);
  graphics.fillRect(20 + (ph & 7), 10, 2, 1);
  graphics.fillRect(32 + ((ph + 3) & 7), 14, 3, 1);
  graphics.fillRect(24 + ((ph + 5) & 7), 19, 2, 1);

  // Deep water spots
  graphics.fillStyle(darken(t.fill, 0.18), 0.25);
  graphics.fillRect(26, 16, 4, 3);
  graphics.fillRect(14, 12, 3, 2);
}

function drawSandDetail(graphics: TextureGraphics, t: { fill: number; edge: number }): void {
  fillPolygon(graphics, [[DIA_CX, 2], [TILE_WIDTH - 2, DIA_CY], [DIA_CX, DIA_CY]], lighten(t.fill, 0.08), 0.22);

  // Scattered stone specks
  scatterPixels(graphics, 12, 401, 1, darken(t.fill, 0.22), 0.45);
  scatterPixels(graphics, 6, 402, 1, darken(t.fill, 0.32), 0.3);

  // Wind ripple lines
  graphics.lineStyle(1, darken(t.fill, 0.1), 0.35);
  graphics.beginPath(); graphics.moveTo(18, 14); graphics.lineTo(28, 11); graphics.lineTo(38, 14); graphics.lineTo(46, 12); graphics.strokePath();
  graphics.lineStyle(1, darken(t.fill, 0.07), 0.28);
  graphics.beginPath(); graphics.moveTo(14, 18); graphics.lineTo(24, 16); graphics.lineTo(34, 18); graphics.lineTo(42, 16); graphics.strokePath();

  // Lighter dune patches
  scatterPixels(graphics, 5, 501, 3, lighten(t.fill, 0.14), 0.3);

  // Shell/pebble highlights
  graphics.fillStyle(0xfff8e0, 0.45); graphics.fillRect(22, 15, 2, 1); graphics.fillRect(38, 12, 1, 2);
}

function drawStoneDetail(graphics: TextureGraphics, t: { fill: number; edge: number }): void {
  // Crack lines
  const crack = darken(t.fill, 0.2);
  graphics.lineStyle(1, crack, 0.5);
  graphics.beginPath(); graphics.moveTo(12, 14); graphics.lineTo(24, 11); graphics.lineTo(36, 14); graphics.lineTo(50, 11); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(22, 8); graphics.lineTo(26, 18); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(38, 10); graphics.lineTo(42, 20); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(30, 16); graphics.lineTo(34, 24); graphics.strokePath();

  // Stone variation
  scatterPixels(graphics, 8, 601, 3, lighten(t.fill, 0.12), 0.35);
  scatterPixels(graphics, 6, 602, 2, darken(t.fill, 0.1), 0.3);

  // Moss specks
  graphics.fillStyle(0x667744, 0.4);
  graphics.fillRect(20, 16, 2, 1); graphics.fillRect(34, 12, 1, 2); graphics.fillRect(44, 16, 2, 1);
}

function drawSnowDetail(graphics: TextureGraphics, t: { fill: number; edge: number }): void {
  // Subtle blue shadow
  fillPolygon(graphics, [[DIA_CX, DIA_CY], [2, DIA_CY], [DIA_CX, TILE_HEIGHT - 2]], 0xc8d8f0, 0.18);

  // Sparkle dots
  graphics.fillStyle(0xffffff, 0.85);
  graphics.fillRect(20, 10, 1, 1); graphics.fillRect(30, 8, 1, 1); graphics.fillRect(42, 14, 1, 1);
  graphics.fillRect(16, 16, 1, 1); graphics.fillRect(36, 18, 1, 1); graphics.fillRect(26, 14, 1, 1);

  // Shadow depressions
  graphics.fillStyle(darken(t.fill, 0.07), 0.22);
  graphics.fillEllipse(24, 14, 4, 2); graphics.fillEllipse(36, 12, 3, 2);

  // Wind-blown snow streaks
  graphics.lineStyle(1, 0xffffff, 0.28);
  graphics.beginPath(); graphics.moveTo(18, 12); graphics.lineTo(28, 10); graphics.lineTo(38, 12); graphics.strokePath();
}

function drawForestDetail(graphics: TextureGraphics, t: { fill: number; edge: number }): void {
  const canopy = lighten(t.fill, 0.16);
  const dark = darken(t.fill, 0.18);

  scatterPixels(graphics, 12, 801, 3, canopy, 0.4);
  scatterPixels(graphics, 8, 802, 4, canopy, 0.28);
  scatterPixels(graphics, 6, 803, 2, dark, 0.35);

  // Undergrowth patches
  graphics.fillStyle(0x5a4030, 0.3);
  graphics.fillRect(18, 16, 3, 2); graphics.fillRect(34, 14, 2, 3); graphics.fillRect(42, 17, 3, 2);

  // Tree shadow circles
  graphics.fillStyle(darken(t.fill, 0.28), 0.22);
  graphics.fillCircle(24, 12, 3); graphics.fillCircle(38, 14, 2.5); graphics.fillCircle(30, 18, 2);

  // Mushroom dots
  graphics.fillStyle(0xd4a070, 0.5); graphics.fillRect(28, 20, 2, 1); graphics.fillRect(20, 14, 1, 2);
  graphics.fillStyle(0xcc4444, 0.4); graphics.fillRect(28, 19, 2, 1); graphics.fillRect(20, 13, 1, 1);
}

function drawSwampDetail(graphics: TextureGraphics, t: { fill: number; edge: number }): void {
  // Puddle patches
  graphics.fillStyle(darken(t.fill, 0.28), 0.4);
  graphics.fillEllipse(24, 14, 8, 4); graphics.fillEllipse(38, 18, 6, 3); graphics.fillEllipse(18, 20, 5, 3);

  // Puddle reflections
  graphics.fillStyle(lighten(t.fill, 0.16), 0.22);
  graphics.fillRect(22, 13, 3, 1); graphics.fillRect(37, 17, 2, 1);

  // Moss patches
  scatterPixels(graphics, 6, 901, 2, lighten(t.fill, 0.18), 0.35);

  // Bubbles
  graphics.fillStyle(lighten(t.fill, 0.28), 0.4);
  graphics.fillCircle(26, 12, 1); graphics.fillCircle(34, 16, 0.8); graphics.fillCircle(40, 14, 1);

  // Vine lines
  graphics.lineStyle(1, darken(t.fill, 0.18), 0.35);
  graphics.beginPath(); graphics.moveTo(16, 12); graphics.lineTo(20, 16); graphics.lineTo(24, 14); graphics.lineTo(28, 18); graphics.lineTo(32, 16); graphics.strokePath();
}

function drawTownDetail(graphics: TextureGraphics, t: { fill: number; edge: number }): void {
  const mortar = darken(t.fill, 0.2);

  // Isometric cobblestone mortar grid
  graphics.lineStyle(1, mortar, 0.4);
  // NE-SW lines
  graphics.beginPath(); graphics.moveTo(10, 12); graphics.lineTo(22, 8); graphics.lineTo(32, 12); graphics.lineTo(42, 8); graphics.lineTo(52, 12); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(6, 16); graphics.lineTo(18, 12); graphics.lineTo(32, 16); graphics.lineTo(46, 12); graphics.lineTo(58, 16); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(10, 20); graphics.lineTo(22, 16); graphics.lineTo(32, 20); graphics.lineTo(42, 16); graphics.lineTo(52, 20); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(14, 24); graphics.lineTo(24, 20); graphics.lineTo(32, 24); graphics.lineTo(40, 20); graphics.lineTo(48, 24); graphics.strokePath();

  // Cross-cutting vertical mortar
  graphics.beginPath(); graphics.moveTo(22, 8); graphics.lineTo(18, 12); graphics.lineTo(22, 16); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(42, 8); graphics.lineTo(46, 12); graphics.lineTo(42, 16); graphics.strokePath();
  graphics.beginPath(); graphics.moveTo(32, 12); graphics.lineTo(32, 20); graphics.strokePath();

  // Stone variation
  scatterPixels(graphics, 6, 1001, 3, lighten(t.fill, 0.08), 0.25);
  scatterPixels(graphics, 4, 1002, 2, darken(t.fill, 0.07), 0.2);

  // Wear spot
  graphics.fillStyle(lighten(t.fill, 0.06), 0.18);
  graphics.fillEllipse(28, 14, 5, 3);
}

function drawDiamondEye(
  graphics: TextureGraphics,
  centerX: number,
  centerY: number,
  size: number,
  glowColor: number,
  coreColor: number,
): void {
  fillPolygon(graphics, diamond(centerX, centerY, size, size + 2), glowColor);
  fillPolygon(graphics, diamond(centerX, centerY, size - 3, size - 2), coreColor, 0.92);
  fillPolygon(graphics, diamond(centerX - 1, centerY - 1, 2, 2), ISOMETRIC_THEME.palette.white, 0.85);
}

function createTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: TextureDrawCallback,
): void {
  if (scene.textures.exists(key)) return;

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(graphics);
  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

function diamond(centerX: number, centerY: number, width: number, height = width): Point[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return [
    [centerX, centerY - halfHeight],
    [centerX + halfWidth, centerY],
    [centerX, centerY + halfHeight],
    [centerX - halfWidth, centerY],
  ];
}

function buildStarPoints(centerX: number, centerY: number, spikes: number, outerRadius: number, innerRadius: number): Point[] {
  const points: Point[] = [];
  let rotation = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  for (let index = 0; index < spikes; index++) {
    points.push([
      centerX + Math.cos(rotation) * outerRadius,
      centerY + Math.sin(rotation) * outerRadius,
    ]);
    rotation += step;
    points.push([
      centerX + Math.cos(rotation) * innerRadius,
      centerY + Math.sin(rotation) * innerRadius,
    ]);
    rotation += step;
  }

  return points;
}

function fillPolygon(graphics: TextureGraphics, points: ReadonlyArray<Point>, color: number, alpha = 1): void {
  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) {
    graphics.lineTo(points[index][0], points[index][1]);
  }
  graphics.closePath();
  graphics.fillPath();
}

function strokePolygon(
  graphics: TextureGraphics,
  points: ReadonlyArray<Point>,
  color: number,
  alpha = 1,
  lineWidth = 1,
): void {
  graphics.lineStyle(lineWidth, color, alpha);
  graphics.beginPath();
  graphics.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) {
    graphics.lineTo(points[index][0], points[index][1]);
  }
  graphics.closePath();
  graphics.strokePath();
}

function strokePolyline(
  graphics: TextureGraphics,
  points: ReadonlyArray<Point>,
  color: number,
  alpha = 1,
  lineWidth = 1,
): void {
  graphics.lineStyle(lineWidth, color, alpha);
  graphics.beginPath();
  graphics.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) {
    graphics.lineTo(points[index][0], points[index][1]);
  }
  graphics.strokePath();
}

function lighten(color: number, amount: number): number {
  return mixColors(color, ISOMETRIC_THEME.palette.white, amount);
}

function darken(color: number, amount: number): number {
  return mixColors(color, ISOMETRIC_THEME.palette.shadow, amount);
}

function mixColors(colorA: number, colorB: number, amount: number): number {
  const ratio = Phaser.Math.Clamp(amount, 0, 1);
  const aRed = (colorA >> 16) & 0xff;
  const aGreen = (colorA >> 8) & 0xff;
  const aBlue = colorA & 0xff;
  const bRed = (colorB >> 16) & 0xff;
  const bGreen = (colorB >> 8) & 0xff;
  const bBlue = colorB & 0xff;

  const red = Math.round(aRed + (bRed - aRed) * ratio);
  const green = Math.round(aGreen + (bGreen - aGreen) * ratio);
  const blue = Math.round(aBlue + (bBlue - aBlue) * ratio);

  return (red << 16) | (green << 8) | blue;
}
