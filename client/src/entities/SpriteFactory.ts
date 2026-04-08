import Phaser from 'phaser';

export interface CharacterAppearance {
  bodyColor: number;
  hairStyle: number;
  hairColor: number;
  shirtColor: number;
  pantsColor: number;
  gender: 'male' | 'female';
}

const HAIR_COLORS = [0x222222, 0x8B4513, 0xDAA520, 0xCC0000, 0xFFFFFF, 0xFF6600, 0x4444AA];
const BODY_COLORS = [0xFFCC88, 0xDEB887, 0xD2A679, 0x8D6E4C, 0x5C3A1E, 0xFADBC8];
const SHIRT_COLORS = [0x3388ff, 0xff3333, 0x33cc33, 0xffcc00, 0xaa44ff, 0xff8800, 0x888888, 0xffffff];
const PANTS_COLORS = [0x334488, 0x553322, 0x444444, 0x666666, 0x223322, 0x882222];

/**
 * SpriteFactory — creates character sprites procedurally based on appearance options.
 * In future phases this will use LPC spritesheets.
 */
export class SpriteFactory {
  private scene: Phaser.Scene;
  private textureCache: Map<string, string> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Generate a character texture key for given appearance */
  getOrCreateTexture(appearance: CharacterAppearance): string {
    const key = this.appearanceKey(appearance);
    if (this.textureCache.has(key)) return this.textureCache.get(key)!;

    const texKey = `char_${key}`;
    this.generateCharacterTexture(texKey, appearance);
    this.textureCache.set(key, texKey);
    return texKey;
  }

  private generateCharacterTexture(key: string, app: CharacterAppearance): void {
    const gfx = this.scene.add.graphics();
    const w = 32;
    const h = 48;

    // Legs/pants
    gfx.fillStyle(app.pantsColor, 1);
    gfx.fillRect(10, 32, 5, 14);
    gfx.fillRect(17, 32, 5, 14);

    // Body/shirt
    gfx.fillStyle(app.shirtColor, 1);
    gfx.fillRoundedRect(8, 18, 16, 16, 2);

    // Arms
    gfx.fillStyle(app.shirtColor, 1);
    gfx.fillRect(4, 20, 5, 10);
    gfx.fillRect(23, 20, 5, 10);

    // Hands
    gfx.fillStyle(app.bodyColor, 1);
    gfx.fillCircle(6, 31, 2.5);
    gfx.fillCircle(26, 31, 2.5);

    // Head
    gfx.fillStyle(app.bodyColor, 1);
    gfx.fillCircle(16, 12, 8);

    // Eyes
    gfx.fillStyle(0x222222, 1);
    gfx.fillCircle(13, 11, 1.5);
    gfx.fillCircle(19, 11, 1.5);

    // Eye highlights
    gfx.fillStyle(0xffffff, 0.8);
    gfx.fillCircle(13.5, 10.5, 0.7);
    gfx.fillCircle(19.5, 10.5, 0.7);

    // Hair
    gfx.fillStyle(app.hairColor, 1);
    switch (app.hairStyle) {
      case 0: // Short
        gfx.fillEllipse(16, 7, 18, 10);
        break;
      case 1: // Medium
        gfx.fillEllipse(16, 6, 20, 12);
        gfx.fillRect(7, 6, 3, 10);
        gfx.fillRect(22, 6, 3, 10);
        break;
      case 2: // Long
        gfx.fillEllipse(16, 6, 20, 12);
        gfx.fillRect(6, 6, 3, 18);
        gfx.fillRect(23, 6, 3, 18);
        break;
      case 3: // Mohawk
        gfx.fillRect(13, 0, 6, 10);
        break;
      case 4: // Bald
        break;
      case 5: // Ponytail
        gfx.fillEllipse(16, 6, 18, 10);
        gfx.fillRect(22, 6, 4, 16);
        break;
      default:
        gfx.fillEllipse(16, 7, 18, 10);
    }

    // Feet
    gfx.fillStyle(0x553322, 1);
    gfx.fillRoundedRect(8, 44, 7, 4, 1);
    gfx.fillRoundedRect(17, 44, 7, 4, 1);

    gfx.generateTexture(key, w, h);
    gfx.destroy();
  }

  private appearanceKey(app: CharacterAppearance): string {
    return `${app.gender}_${app.bodyColor.toString(16)}_${app.hairStyle}_${app.hairColor.toString(16)}_${app.shirtColor.toString(16)}_${app.pantsColor.toString(16)}`;
  }

  /** Get default appearance */
  static defaultAppearance(): CharacterAppearance {
    return {
      bodyColor: BODY_COLORS[0],
      hairStyle: 0,
      hairColor: HAIR_COLORS[0],
      shirtColor: SHIRT_COLORS[0],
      pantsColor: PANTS_COLORS[0],
      gender: 'male',
    };
  }

  static getBodyColors(): number[] { return [...BODY_COLORS]; }
  static getHairColors(): number[] { return [...HAIR_COLORS]; }
  static getShirtColors(): number[] { return [...SHIRT_COLORS]; }
  static getPantsColors(): number[] { return [...PANTS_COLORS]; }
  static getHairStyleCount(): number { return 6; }
}
