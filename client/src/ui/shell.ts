import Phaser from 'phaser';
import { hexColor, ISOMETRIC_THEME } from '../theme/isometricTheme';

// ── Inset Panel (Phaser Graphics rectangle) ────────────────────────

export interface InsetPanelOptions {
  parent?: Phaser.GameObjects.Container;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: number;
  stroke?: number;
  alpha?: number;
  highlight?: boolean;
}

export function createInsetPanel(
  scene: Phaser.Scene,
  opts: InsetPanelOptions,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setScrollFactor(0);

  const a = opts.alpha ?? 1;
  g.fillStyle(opts.fill, a);
  g.fillRoundedRect(opts.x, opts.y, opts.width, opts.height, 4);

  if (opts.stroke !== undefined) {
    g.lineStyle(1, opts.stroke, a * 0.6);
    g.strokeRoundedRect(opts.x, opts.y, opts.width, opts.height, 4);
  }

  if (opts.highlight !== false) {
    g.lineStyle(1, ISOMETRIC_THEME.palette.borderMuted, a * 0.15);
    g.strokeRoundedRect(opts.x + 1, opts.y + 1, opts.width - 2, opts.height - 2, 3);
  }

  opts.parent?.add(g);
  return g;
}

// ── Panel Label (Phaser Text) ──────────────────────────────────────

export interface PanelLabelOptions {
  parent?: Phaser.GameObjects.Container;
  x: number;
  y: number;
  text: string;
  fontSize?: string;
  fontStyle?: string;
  color?: number;
  originX?: number;
  originY?: number;
  wordWrapWidth?: number;
}

export function createPanelLabel(
  scene: Phaser.Scene,
  opts: PanelLabelOptions,
): Phaser.GameObjects.Text {
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: opts.fontSize ?? '11px',
    fontStyle: opts.fontStyle,
    color: hexColor(opts.color ?? ISOMETRIC_THEME.text.primary),
    stroke: hexColor(ISOMETRIC_THEME.palette.shadow),
    strokeThickness: 1,
  };
  if (opts.wordWrapWidth) {
    style.wordWrap = { width: opts.wordWrapWidth };
  }
  const txt = scene.add.text(opts.x, opts.y, opts.text, style)
    .setScrollFactor(0)
    .setOrigin(opts.originX ?? 0, opts.originY ?? 0);
  opts.parent?.add(txt);
  return txt;
}
