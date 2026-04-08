import Phaser from 'phaser';
import { WebSocketClient, MessageType } from '../network/WebSocketClient';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';

/**
 * LoginScene — Simple login/register UI.
 * After successful auth, transitions to GameScene.
 */
export class LoginScene extends Phaser.Scene {
  private network!: WebSocketClient;

  constructor() {
    super({ key: 'LoginScene' });
  }

  init(): void {
    // Get or create shared network client
    this.network = this.registry.get('network') as WebSocketClient;
    if (!this.network) {
      this.network = new WebSocketClient();
      this.registry.set('network', this.network);
    }
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Title
    this.add.text(cx, cy - 140, '⚔️ REALMFORGE ⚔️', {
      fontSize: '32px',
      color: '#ffcc44',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 100, 'Browser MMORPG', {
      fontSize: '14px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Username label and input
    this.add.text(cx - 100, cy - 50, 'Username:', {
      fontSize: '14px', color: '#fff',
    });

    // Password label
    this.add.text(cx - 100, cy - 10, 'Password:', {
      fontSize: '14px', color: '#fff',
    });

    // Since Phaser doesn't have native text inputs, we'll use DOM elements
    const usernameInput = this.createInput(cx, cy - 45, 'username');
    const passwordInput = this.createInput(cx, cy - 5, 'password', true);

    // Login button
    const loginBtn = this.add.text(cx - 50, cy + 40, '[ LOGIN ]', {
      fontSize: '16px',
      color: '#00ff88',
    }).setInteractive({ useHandCursor: true });

    // Register button
    const registerBtn = this.add.text(cx + 30, cy + 40, '[ REGISTER ]', {
      fontSize: '16px',
      color: '#4488ff',
    }).setInteractive({ useHandCursor: true });

    const statusText = this.add.text(cx, cy + 80, '', {
      fontSize: '12px', color: '#ff4444',
    }).setOrigin(0.5);

    const doAuth = (isRegister: boolean) => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!username || !password) {
        statusText.setText('Please enter username and password');
        return;
      }

      if (username.length < 3) {
        statusText.setText('Username must be at least 3 characters');
        return;
      }

      statusText.setText('Connecting...');
      statusText.setColor('#ffff44');

      // Connect if not already
      if (!this.network.connected) {
        this.network.connect();
      }

      // Wait for connection then send auth
      const tryAuth = () => {
        if (this.network.connected) {
          this.network.send(MessageType.Auth, { username, password, isRegister });
        } else {
          setTimeout(tryAuth, 200);
        }
      };
      setTimeout(tryAuth, 300);
    };

    loginBtn.on('pointerdown', () => doAuth(false));
    registerBtn.on('pointerdown', () => doAuth(true));

    // Handle auth result
    this.network.on(MessageType.AuthResult, (msg) => {
      const result = msg.payload as { success: boolean; playerId?: string; error?: string };
      if (result.success) {
        statusText.setText('Success! Entering world...');
        statusText.setColor('#00ff88');
        this.registry.set('playerId', result.playerId);
        this.registry.set('username', usernameInput.value.trim());
        // Clean up DOM elements
        usernameInput.remove();
        passwordInput.remove();
        this.time.delayedCall(500, () => {
          this.scene.start('GameScene');
        });
      } else {
        statusText.setText(result.error || 'Authentication failed');
        statusText.setColor('#ff4444');
      }
    });
  }

  private createInput(x: number, y: number, id: string, isPassword = false): HTMLInputElement {
    const input = document.createElement('input');
    input.type = isPassword ? 'password' : 'text';
    input.id = `rf-${id}`;
    input.style.cssText = `
      position: absolute;
      left: ${x + 10}px;
      top: ${y + 10}px;
      width: 180px;
      height: 24px;
      background: #222;
      color: #fff;
      border: 1px solid #555;
      padding: 2px 6px;
      font-size: 13px;
      outline: none;
    `;
    document.getElementById('game-container')!.appendChild(input);
    return input;
  }
}
