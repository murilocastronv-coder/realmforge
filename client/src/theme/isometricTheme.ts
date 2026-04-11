export const hexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;

const rarityEntries = {
  0: 0xc8d0dc,   // Common: soft silver-grey
  1: 0x2ecc71,   // Uncommon: vibrant emerald green
  2: 0x3498db,   // Rare: bright cerulean blue
  3: 0x9b59b6,   // Epic: rich amethyst purple
  4: 0xf39c12,   // Legendary: warm amber gold
  5: 0xe74c3c,   // Mythic: intense crimson red
} satisfies Record<number, number>;

export const RARITY_COLORS: Record<number, number> = { ...rarityEntries };

export const ISOMETRIC_THEME = {
  palette: {
    black: 0x000000,
    white: 0xffffff,
    canvas: 0x0a0f16,
    canvasAlt: 0x11161f,
    surface: 0x141b27,
    surfaceElevated: 0x171f2d,
    surfaceMuted: 0x1c2433,
    surfaceInset: 0x232d41,
    surfaceInsetWarm: 0x263247,
    surfaceTooltip: 0x101621,
    border: 0x526a89,
    borderMuted: 0x435872,
    borderStrong: 0x79a4cf,
    shadow: 0x05070c,
    gold: 0xf0c35b,
    emerald: 0x59d18c,
    sky: 0x73b6ff,
    violet: 0xbf8dff,
    amber: 0xf1ae55,
    coral: 0xe96b63,
    stone: 0x97a0af,
  },
  text: {
    primary: 0xf4f7fb,
    secondary: 0xc9d2de,
    muted: 0x9dacbf,
    dim: 0x6d8095,
    gold: 0xf0c35b,
    success: 0x59d18c,
    danger: 0xe96b63,
    warning: 0xf1ae55,
    info: 0x73b6ff,
    magic: 0xbf8dff,
  },
  ui: {
    panelAlpha: 0.95,
    backdropAlpha: 0.55,
    panels: {
      inventory: { fill: 0x141b27, stroke: 0x536d8c, title: 0xe8eef8 },
      equipment: { fill: 0x131a25, stroke: 0x5d7695, title: 0xe8eef8 },
      bank: { fill: 0x181f2a, stroke: 0x8b7248, title: 0xf0c35b },
      crafting: { fill: 0x171d29, stroke: 0x6d678a, title: 0xf0c35b },
      marketplace: { fill: 0x171d29, stroke: 0x7a7f8d, title: 0xf0c35b },
      stats: { fill: 0x141b27, stroke: 0x536d8c, title: 0xf0c35b },
      tutorial: { fill: 0x111926, stroke: 0x73b6ff, title: 0xf0c35b },
      login: { fill: 0x111926, stroke: 0x425974, title: 0xf0c35b },
      chat: { fill: 0x0e131b, stroke: 0x3e5169, title: 0x9dacbf },
      minimap: { fill: 0x0f151d, stroke: 0x485b73, title: 0x9dacbf },
    },
    slots: {
      fill: 0x232d41,
      bankFill: 0x263247,
      stroke: 0x435872,
      accentStroke: 0x5d7491,
      alpha: 0.92,
      label: 0x8194ab,
      text: 0xf4f7fb,
      tooltipFill: 0x101621,
      tooltipAlpha: 0.97,
      tooltipText: 0xdde6f2,
    },
    accents: {
      primary: 0x73b6ff,
      success: 0x59d18c,
      sell: 0xf1ae55,
      danger: 0xe96b63,
      highlight: 0xf0c35b,
      hint: 0x93adca,
      neutral: 0xf4f7fb,
    },
    bars: {
      hpBackdrop: 0x3a1117,
      hpHigh: 0xd34d44,
      hpMid: 0xe08b3b,
      hpLow: 0xff6f63,
      mpBackdrop: 0x10243e,
      mpFill: 0x4f86e3,
      xpBackdrop: 0x3a310e,
      xpFill: 0xf0c35b,
      healthBackdrop: 0x000000,
      healthHigh: 0x59d18c,
      healthMid: 0xf0c35b,
      healthLow: 0xd34d44,
    },
    chatChannels: {
      global: 0xf4f7fb,
      local: 0x7ce3a1,
      whisper: 0xbf8dff,
      trade: 0xf1ae55,
      system: 0xf0c35b,
      combat: 0xe96b63,
    },
    chrome: {
      shadow: 0x05070c,
      headerFill: 0x1b2637,
      headerEdge: 0x7d9cc0,
      trim: 0x32445c,
      insetFill: 0x0f1620,
      insetStroke: 0x34465c,
      buttonFill: 0x1b2737,
      buttonFillActive: 0x243449,
      buttonDangerFill: 0x2a161c,
    },
    layout: {
      panelPadding: 8,
      panelHeaderHeight: 24,
      sectionGap: 6,
      closeButtonSize: 16,
    },
    input: {
      background: 0x101722,
      border: 0x435872,
      focus: 0x73b6ff,
      text: 0xf4f7fb,
      placeholder: 0x8194ab,
    },
  },
  scenes: {
    boot: {
      title: 0xf0c35b,
      subtitle: 0x889fb9,
      loadFrame: 0x314257,
      loadTrack: 0x111926,
      loadFill: 0x59d18c,
      tip: 0x93adca,
    },
    login: {
      title: 0xf0c35b,
      subtitle: 0x7e97b4,
      star: 0xffffff,
      version: 0x526579,
      statusPending: 0xf0c35b,
      statusSuccess: 0x59d18c,
      statusError: 0xe96b63,
    },
    game: {
      playerName: 0xf4f7fb,
      playerLabel: 0x8cc4ff,
      enemyLabel: 0xff847a,
      coords: 0xa8b8c9,
      hints: 0x9cadc2,
      overlay: 0x000000,
      auraAttack: 0xe96b63,
      auraPickup: 0x59d18c,
      cursor: 0xf4f7fb,
      levelUp: 0xf0c35b,
      lowXp: 0x60e68b,
      midXp: 0x73b6ff,
      highXp: 0xbf8dff,
      alert: 0xe96b63,
      warning: 0xf1ae55,
    },
  },
  terrain: {
    grass: { fill: 0x6aa84f, edge: 0x325c36 },
    water: { fill: 0x5b8ee3, edge: 0x2d4e8a },
    sand: { fill: 0xd7c06d, edge: 0xa3803b },
    stone: { fill: 0x9ea8b7, edge: 0x5d6776 },
    snow: { fill: 0xe8eef7, edge: 0xb7c3d5 },
    forest: { fill: 0x3c7240, edge: 0x213d26 },
    swamp: { fill: 0x64703b, edge: 0x364021 },
    town: { fill: 0xb79f86, edge: 0x745f49 },
  },
  textures: {
    player: {
      legs: 0x2d3d60,
      body: 0x5da6ff,
      belt: 0x9c783f,
      skin: 0xf4cc99,
      hair: 0x6c5236,
      eyes: 0x1b2028,
      mouth: 0xd08a72,
    },
    enemySlime: {
      shadow: 0x000000,
      body: 0xd34d44,
      highlight: 0xf07d62,
      eyeGlow: 0xf7e38b,
      mouth: 0x7b2020,
    },
    enemyWolf: {
      shadow: 0x000000,
      body: 0x4a7abf,
      highlight: 0x6da0e0,
      eyeGlow: 0xff6b4a,
      mouth: 0x203860,
    },
    enemySpider: {
      shadow: 0x000000,
      body: 0x8b4abf,
      highlight: 0xb070e0,
      eyeGlow: 0xe0ff4a,
      mouth: 0x40205f,
    },
    enemySkeleton: {
      shadow: 0x000000,
      body: 0xd8d0c4,
      highlight: 0xf0ece4,
      eyeGlow: 0x44ee88,
      mouth: 0x5a5248,
    },
    enemyGoblin: {
      shadow: 0x000000,
      body: 0x4ab856,
      highlight: 0x6ed87a,
      eyeGlow: 0xff4444,
      mouth: 0x1a5020,
    },
    enemyDemon: {
      shadow: 0x000000,
      body: 0xbf2020,
      highlight: 0xe84040,
      eyeGlow: 0xffcc00,
      mouth: 0x600808,
    },
    enemyFrost: {
      shadow: 0x000000,
      body: 0x6ac4e8,
      highlight: 0x98e0ff,
      eyeGlow: 0xffffff,
      mouth: 0x2a6080,
    },
    enemyShadow: {
      shadow: 0x000000,
      body: 0x2a2040,
      highlight: 0x4a3868,
      eyeGlow: 0xcc44ff,
      mouth: 0x100818,
    },
    fountain: {
      base: 0x7a8da5,
      basin: 0x5a7090,
      water: 0x4a9ae8,
      waterGlow: 0x80c8ff,
      pillar: 0x9aacbe,
    },
    itemDrop: {
      shadow: 0x000000,
      bag: 0xd4b466,
      tie: 0xa27a36,
      shine: 0xffffff,
    },
    xpOrbs: {
      green: { fill: 0x60e68b, glow: 0x2c9b57 },
      blue: { fill: 0x73b6ff, glow: 0x366db6 },
      purple: { fill: 0xbf8dff, glow: 0x7c54c3 },
    },
    particles: {
      spark: 0xffffff,
      star: 0xf0c35b,
      glow: 0xffffff,
      blood: 0xb82c37,
    },
  },
  effects: {
    poison: { color: 0x44cc44, glow: 0x22aa22, particle: 0x66ee66, text: 0x44cc44 },
    burn: { color: 0xff6622, glow: 0xcc4400, particle: 0xff8844, text: 0xff6622 },
    bleed: { color: 0xcc2222, glow: 0x991111, particle: 0xee4444, text: 0xcc2222 },
    freeze: { color: 0x44bbff, glow: 0x2288cc, particle: 0x88ddff, text: 0x44bbff },
    stun: { color: 0xffdd44, glow: 0xccaa22, particle: 0xffee88, text: 0xffdd44 },
    weakness: { color: 0x9944cc, glow: 0x662299, particle: 0xbb66ee, text: 0x9944cc },
    armorBreak: { color: 0x8b6914, glow: 0x6b4912, particle: 0xab8934, text: 0x8b6914 },
    regen: { color: 0x44ee88, glow: 0x22cc66, particle: 0x66ffaa, text: 0x44ee88 },
    strength: { color: 0xff4444, glow: 0xcc2222, particle: 0xff6666, text: 0xff4444 },
    shield: { color: 0x4488ff, glow: 0x2266cc, particle: 0x66aaff, text: 0x4488ff },
    haste: { color: 0x44ffff, glow: 0x22cccc, particle: 0x88ffff, text: 0x44ffff },
    lifesteal: { color: 0xcc2244, glow: 0x991133, particle: 0xee4466, text: 0xcc2244 },
    thorns: { color: 0xddaa22, glow: 0xbb8811, particle: 0xffcc44, text: 0xddaa22 },
    invulnerable: { color: 0xffffff, glow: 0xccccff, particle: 0xffffff, text: 0xffffff },
  },
} as const;

export function getRarityColor(rarity: number): number {
  return RARITY_COLORS[rarity] ?? ISOMETRIC_THEME.text.primary;
}

export function getRarityHex(rarity: number): string {
  return hexColor(getRarityColor(rarity));
}

export function getRarityName(rarity: number): string {
  return RARITY_NAMES[rarity] ?? RARITY_NAMES[0];
}

export function getHealthFillColor(ratio: number): number {
  if (ratio > 0.5) return ISOMETRIC_THEME.ui.bars.healthHigh;
  if (ratio > 0.25) return ISOMETRIC_THEME.ui.bars.healthMid;
  return ISOMETRIC_THEME.ui.bars.healthLow;
}
