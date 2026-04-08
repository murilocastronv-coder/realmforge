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
  pixelArt: true,
  roundPixels: true,
  antialias: false,
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
};

const game = new Phaser.Game(config);

// Handle window focus
window.addEventListener('blur', () => {
  game.scene.scenes.forEach(scene => {
    if (scene.scene.isActive()) {
      scene.scene.pause();
    }
  });
});

window.addEventListener('focus', () => {
  game.scene.scenes.forEach(scene => {
    if (scene.scene.isPaused()) {
      scene.scene.resume();
    }
  });
});

export default game;
