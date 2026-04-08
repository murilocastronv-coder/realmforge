import Phaser from 'phaser';
import { WebSocketClient, MessageType } from '../network/WebSocketClient';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';

/**
 * LoginScene — Polished login/register UI with RealmForge branding.
 */
export class LoginScene extends Phaser.Scene {
  private network!: WebSocketClient;

  constructor() {
    super({ key: 'LoginScene' });
  }

  init(): void {
    this.network = this.registry.get('network') as WebSocketClient;
    if (!this.network) {
      this.network = new WebSocketClient();
      this.registry.set('network', this.network);
    }
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.cameras.main.setBackgroundColor(0x0a0e17);
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // Decorative background stars
    for (let i = 0; i < 40; i++) {
      const sx = Math.random() * GAME_WIDTH;
      const sy = Math.random() * GAME_HEIGHT;
      const star = this.add.circle(sx, sy, Math.random() * 1.5 + 0.5, 0xffffff, Math.random() * 0.4 + 0.1);
      this.tweens.add({
        targets: star, alpha: Math.random() * 0.2,
        duration: 2000 + Math.random() * 3000,
        yoyo: true, repeat: -1,
      });
    }

    // Title with glow
    this.add.text(cx, cy - 150, '🏰 REALMFORGE', {
      fontSize: '36px', color: '#f0c040', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 112, 'Infinite Worlds. Endless Adventure.', {
      fontSize: '11px', color: '#6688aa', fontStyle: 'italic',
    }).setOrigin(0.5);

    // Login panel background
    const panelBg = this.add.rectangle(cx, cy + 10, 320, 200, 0x111822, 0.85);
    panelBg.setStrokeStyle(1, 0x334455);

    // Labels
    this.add.text(cx - 130, cy - 52, 'Username', { fontSize: '11px', color: '#8899aa' });
    this.add.text(cx - 130, cy + 2, 'Password', { fontSize: '11px', color: '#8899aa' });

    const usernameInput = this.createInput(cx, cy - 35, 'username');
    const passwordInput = this.createInput(cx, cy + 20, 'password', true);

    // Buttons
    const loginBtn = this.add.text(cx - 65, cy + 60, '▶  LOGIN', {
      fontSize: '14px', color: '#00cc66', fontStyle: 'bold',
    }).setInteractive({ useHandCursor: true });

    const registerBtn = this.add.text(cx + 25, cy + 60, 'REGISTER', {
      fontSize: '14px', color: '#4488ff',
    }).setInteractive({ useHandCursor: true });

    // Hover effects
    [loginBtn, registerBtn].forEach(btn => {
      btn.on('pointerover', () => btn.setScale(1.05));
      btn.on('pointerout', () => btn.setScale(1));
    });

    const statusText = this.add.text(cx, cy + 95, '', {
      fontSize: '11px', color: '#ff4444',
    }).setOrigin(0.5);

    // Version tag
    this.add.text(cx, GAME_HEIGHT - 20, 'RealmForge v0.1.0 — Open Source MMORPG', {
      fontSize: '9px', color: '#334455',
    }).setOrigin(0.5);

    const doAuth = (isRegister: boolean) => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!username || !password) {
        statusText.setText('Please enter username and password');
        statusText.setColor('#ff6644');
        return;
      }
      if (username.length < 3) {
        statusText.setText('Username must be at least 3 characters');
        statusText.setColor('#ff6644');
        return;
      }

      statusText.setText('⟳ Connecting...');
      statusText.setColor('#ffdd44');

      if (!this.network.connected) {
        this.network.connect();
      }

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

    // Allow Enter key to login
    passwordInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') doAuth(false);
    });

    this.network.on(MessageType.AuthResult, (msg) => {
      const result = msg.payload as { success: boolean; playerId?: string; error?: string };
      if (result.success) {
        statusText.setText('✅ Success! Entering world...');
        statusText.setColor('#00cc66');
        this.registry.set('playerId', result.playerId);
        this.registry.set('username', usernameInput.value.trim());
        usernameInput.remove();
        passwordInput.remove();
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.time.delayedCall(450, () => this.scene.start('GameScene'));
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
    input.placeholder = isPassword ? '••••••••' : 'Enter username';
    input.style.cssText = `
      position: absolute;
      left: ${x - 120}px;
      top: ${y + 10}px;
      width: 240px;
      height: 28px;
      background: #0d1220;
      color: #ddeeff;
      border: 1px solid #334455;
      border-radius: 4px;
      padding: 2px 10px;
      font-size: 13px;
      font-family: monospace;
      outline: none;
      transition: border-color 0.2s;
    `;
    input.onfocus = () => { input.style.borderColor = '#4488ff'; };
    input.onblur = () => { input.style.borderColor = '#334455'; };
    document.getElementById('game-container')!.appendChild(input);
    return input;
  }
}
