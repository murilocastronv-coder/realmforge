import Phaser from 'phaser';
import { WebSocketClient, MessageType } from '../network/WebSocketClient';

interface ChatMsg {
  sender: string;
  text: string;
  channel: string;
  timestamp: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  global: '#ffffff',
  local: '#88ff88',
  whisper: '#ff88ff',
  trade: '#ffaa44',
  system: '#ffcc44',
  combat: '#ff6666',
};

/**
 * ChatBox — full chat system with channels, input, and history.
 */
export class ChatBox {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private messages: ChatMsg[] = [];
  private messageTexts: Phaser.GameObjects.Text[] = [];
  private network: WebSocketClient;
  private inputElement: HTMLInputElement | null = null;
  private inputActive = false;
  private currentChannel = 'global';
  private maxMessages = 12;
  private visible = true;
  private minimized = false;
  private channelText!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, network: WebSocketClient, x: number, y: number) {
    this.scene = scene;
    this.network = network;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(3000);

    const chatW = 360;
    const chatH = 200;

    // Background
    const bg = scene.add.rectangle(0, 0, chatW, chatH, 0x000000, 0.5);
    bg.setOrigin(0, 0);
    this.container.add(bg);

    // Channel tabs
    const channels = ['global', 'local', 'trade'];
    channels.forEach((ch, i) => {
      const btn = scene.add.text(8 + i * 60, 4, ch.toUpperCase(), {
        fontSize: '9px',
        color: CHANNEL_COLORS[ch] || '#ffffff',
      }).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.setChannel(ch));
      this.container.add(btn);
    });

    this.channelText = scene.add.text(chatW - 80, 4, '[global]', {
      fontSize: '8px', color: '#666666',
    });
    this.container.add(this.channelText);

    // Minimize button
    const minBtn = scene.add.text(chatW - 14, 2, '−', {
      fontSize: '14px', color: '#888888',
    }).setInteractive({ useHandCursor: true });
    minBtn.on('pointerdown', () => this.toggleMinimize());
    this.container.add(minBtn);

    // Create input element
    this.createInputElement(x, y + chatH - 24, chatW);

    // Listen for network chat messages
    this.network.on(MessageType.ChatMessage, (msg) => {
      const { sender, text, channel } = msg.payload as { sender: string; text: string; channel: string };
      this.addMessage(sender, text, channel);
    });

    // Keyboard handler
    scene.input.keyboard!.on('keydown-ENTER', () => {
      this.toggleInput();
    });

    scene.input.keyboard!.on('keydown-SLASH', () => {
      if (!this.inputActive) {
        this.activateInput('/');
      }
    });
  }

  addMessage(sender: string, text: string, channel = 'system'): void {
    this.messages.push({
      sender,
      text,
      channel,
      timestamp: Date.now(),
    });

    if (this.messages.length > 50) {
      this.messages = this.messages.slice(-50);
    }

    this.refreshDisplay();
  }

  addSystemMessage(text: string): void {
    this.addMessage('System', text, 'system');
  }

  private setChannel(channel: string): void {
    this.currentChannel = channel;
    this.channelText.setText(`[${channel}]`);
  }

  private toggleInput(): void {
    if (this.inputActive) {
      this.sendMessage();
      this.deactivateInput();
    } else {
      this.activateInput();
    }
  }

  private activateInput(prefix = ''): void {
    if (this.inputElement) {
      this.inputActive = true;
      this.inputElement.style.display = 'block';
      this.inputElement.value = prefix;
      this.inputElement.focus();
    }
  }

  private deactivateInput(): void {
    if (this.inputElement) {
      this.inputActive = false;
      this.inputElement.style.display = 'none';
      this.inputElement.value = '';
      this.scene.input.keyboard!.enabled = true;
    }
  }

  private sendMessage(): void {
    if (!this.inputElement) return;
    const text = this.inputElement.value.trim();
    if (!text) return;

    // Parse commands
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const cmd = parts[0].toLowerCase();
      switch (cmd) {
        case '/g':
        case '/global':
          this.currentChannel = 'global';
          this.channelText.setText('[global]');
          if (parts.length > 1) {
            this.network.send(MessageType.Chat, { text: parts.slice(1).join(' '), channel: 'global' });
          }
          return;
        case '/l':
        case '/local':
          this.currentChannel = 'local';
          this.channelText.setText('[local]');
          if (parts.length > 1) {
            this.network.send(MessageType.Chat, { text: parts.slice(1).join(' '), channel: 'local' });
          }
          return;
        case '/t':
        case '/trade':
          this.currentChannel = 'trade';
          this.channelText.setText('[trade]');
          if (parts.length > 1) {
            this.network.send(MessageType.Chat, { text: parts.slice(1).join(' '), channel: 'trade' });
          }
          return;
        case '/help':
          this.addSystemMessage('Commands: /g /l /t /w <player> <msg> /help');
          return;
        default:
          break;
      }
    }

    this.network.send(MessageType.Chat, {
      text,
      channel: this.currentChannel,
    });
  }

  private toggleMinimize(): void {
    this.minimized = !this.minimized;
    this.refreshDisplay();
  }

  private refreshDisplay(): void {
    // Clear old texts
    this.messageTexts.forEach(t => t.destroy());
    this.messageTexts = [];

    if (this.minimized) return;

    const startY = 18;
    const displayMsgs = this.messages.slice(-this.maxMessages);

    displayMsgs.forEach((msg, i) => {
      const color = CHANNEL_COLORS[msg.channel] || '#ffffff';
      const prefix = msg.channel === 'system' ? '⚙ ' : '';
      const displayText = `${prefix}[${msg.sender}]: ${msg.text}`;

      const text = this.scene.add.text(6, startY + i * 14, displayText, {
        fontSize: '9px',
        color,
        wordWrap: { width: 350 },
        stroke: '#000000',
        strokeThickness: 1,
      });
      this.container.add(text);
      this.messageTexts.push(text);
    });
  }

  private createInputElement(x: number, y: number, width: number): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'rf-chat-input';
    input.placeholder = 'Press ENTER to chat...';
    input.maxLength = 200;
    input.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: ${width - 4}px;
      height: 22px;
      background: #1a1a2e;
      color: #fff;
      border: 1px solid #444466;
      padding: 2px 8px;
      font-size: 11px;
      outline: none;
      display: none;
      z-index: 1000;
    `;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
        this.deactivateInput();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.deactivateInput();
        e.preventDefault();
      }
      e.stopPropagation();
    });

    input.addEventListener('focus', () => {
      this.scene.input.keyboard!.enabled = false;
    });

    input.addEventListener('blur', () => {
      this.scene.input.keyboard!.enabled = true;
    });

    document.getElementById('game-container')!.appendChild(input);
    this.inputElement = input;
  }

  destroy(): void {
    if (this.inputElement) {
      this.inputElement.remove();
    }
    this.container.destroy();
  }
}
