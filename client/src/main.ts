import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { GameScene } from './scenes/GameScene';
import { GAME_WIDTH, GAME_HEIGHT } from './utils/Constants';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: false,
  roundPixels: false,
  antialias: true,
  backgroundColor: '#111111',
  scene: [BootScene, LoginScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
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

// NOTE: No blur/focus pause — WebSocket messages continue while tab is hidden,
// and pausing scenes causes desync (combat events fire while game is frozen).
// The game keeps running normally when tab loses focus.

export default game;
