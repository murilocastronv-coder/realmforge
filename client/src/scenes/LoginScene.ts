import Phaser from 'phaser';
import { isAuthenticated, playerId, username } from '../store/GameStore';
import { getAuthService } from '../services/AuthService';

/**
 * LoginScene — Thin Phaser bridge that waits for HTML login.
 *
 * The actual login UI is rendered by Preact (LoginScreen.tsx).
 * This scene simply polls the `isAuthenticated` signal and,
 * once auth succeeds, sets Phaser registry values and transitions
 * to the GameScene.
 */
export class LoginScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoginScene' });
  }

  create(): void {
    // Nothing to render — the HTML overlay handles the login UI
  }

  update(): void {
    if (!isAuthenticated.value) return;

    // Auth succeeded — bridge to GameScene via registry
    const auth = getAuthService();
    this.registry.set('network', auth.getNetwork());
    this.registry.set('playerId', playerId.value);
    this.registry.set('username', username.value);

    this.scene.start('GameScene');
  }
}
