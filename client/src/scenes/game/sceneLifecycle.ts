import Phaser from 'phaser';
import {
  MessageType,
  type MessageHandler,
  type WebSocketClient,
} from '../../network/WebSocketClient';

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export class GameSceneLifecycle {
  private keyboardShortcuts: Array<{
    keyboard: Phaser.Input.Keyboard.KeyboardPlugin;
    eventName: string;
    handler: () => void;
  }> = [];
  private networkHandlers: Array<{
    network: WebSocketClient;
    type: MessageType;
    handler: MessageHandler;
  }> = [];
  private statusHandlers: Array<{
    network: WebSocketClient;
    handler: (status: ConnectionStatus) => void;
  }> = [];
  private cleanupFns: Array<() => void> = [];
  private cleaned = false;

  reset(): void {
    this.keyboardShortcuts = [];
    this.networkHandlers = [];
    this.statusHandlers = [];
    this.cleanupFns = [];
    this.cleaned = false;
  }

  registerKeyboardShortcut(
    keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null | undefined,
    eventName: string,
    handler: () => void,
  ): void {
    if (!keyboard) return;
    keyboard.on(eventName, handler);
    this.keyboardShortcuts.push({ keyboard, eventName, handler });
  }

  registerNetworkHandler(
    network: WebSocketClient,
    type: MessageType,
    handler: MessageHandler,
  ): void {
    network.on(type, handler);
    this.networkHandlers.push({ network, type, handler });
  }

  registerStatusHandler(
    network: WebSocketClient,
    handler: (status: ConnectionStatus) => void,
  ): void {
    network.onStatusChange(handler);
    this.statusHandlers.push({ network, handler });
  }

  onCleanup(cleanup: () => void): void {
    this.cleanupFns.push(cleanup);
  }

  cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;

    for (const { keyboard, eventName, handler } of this.keyboardShortcuts) {
      keyboard.off(eventName, handler);
    }
    this.keyboardShortcuts = [];

    for (const { network, type, handler } of this.networkHandlers) {
      network.off(type, handler);
    }
    this.networkHandlers = [];

    for (const { network, handler } of this.statusHandlers) {
      network.offStatusChange(handler);
    }
    this.statusHandlers = [];

    const cleanupFns = [...this.cleanupFns].reverse();
    this.cleanupFns = [];

    for (const cleanup of cleanupFns) {
      try {
        cleanup();
      } catch (error) {
        console.error('[GameSceneLifecycle] Cleanup error:', error);
      }
    }
  }
}
