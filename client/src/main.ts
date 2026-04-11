import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { GameScene } from './scenes/GameScene';
import { ISOMETRIC_THEME, hexColor } from './theme/isometricTheme';
import { mountUI } from './ui-html/index';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  backgroundColor: hexColor(ISOMETRIC_THEME.palette.canvasAlt),
  scene: [BootScene, LoginScene, GameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  input: {
    keyboard: true,
    mouse: true,
  },
  dom: {
    createContainer: true,
  },
};

const game = new Phaser.Game(config);

// Mount HTML UI overlay (Preact)
mountUI();

// NOTE: No blur/focus pause — WebSocket messages continue while tab is hidden,
// and pausing scenes causes desync (combat events fire while game is frozen).
// The game keeps running normally when tab loses focus.

export default game;
