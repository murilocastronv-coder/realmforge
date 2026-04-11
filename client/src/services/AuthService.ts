import { WebSocketClient, MessageType, type GameMessage } from '../network/WebSocketClient';
import {
  connectionStatus,
  isAuthenticated,
  playerId,
  username as usernameSignal,
  setNetwork,
} from '../store/GameStore';

export interface AuthCredentials {
  username: string;
  password: string;
  isRegister: boolean;
  playerClass?: string;
}

export interface AuthResult {
  success: boolean;
  playerId?: string;
  error?: string;
}

type AuthCallback = (result: AuthResult) => void;

/**
 * AuthService — Manages WebSocket connection and authentication lifecycle.
 * Decoupled from Phaser scenes so both LoginScene and HTML LoginScreen can use it.
 */
export class AuthService {
  private network: WebSocketClient;
  private authCallback: AuthCallback | null = null;
  private authHandler: ((msg: GameMessage) => void) | null = null;

  constructor(network?: WebSocketClient) {
    this.network = network ?? new WebSocketClient();
    setNetwork(this.network);

    // Track connection status in store
    this.network.onStatusChange((status) => {
      connectionStatus.value = status;
    });
  }

  getNetwork(): WebSocketClient {
    return this.network;
  }

  /**
   * Connect to the game server and attempt authentication.
   * Returns a Promise that resolves with the auth result.
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    return new Promise((resolve) => {
      // Clean up previous handler if any
      this.cleanup();

      this.authHandler = (msg: GameMessage) => {
        const result = msg.payload as AuthResult;
        this.cleanup();

        if (result.success && result.playerId) {
          isAuthenticated.value = true;
          playerId.value = result.playerId;
          usernameSignal.value = credentials.username;
        }

        resolve(result);
        if (this.authCallback) this.authCallback(result);
      };

      this.network.on(MessageType.AuthResult, this.authHandler);

      // Connect if not already connected
      if (!this.network.connected) {
        this.network.connect();
      }

      // Retry sending auth until connected
      const tryAuth = () => {
        if (this.network.connected) {
          const payload: Record<string, unknown> = {
            username: credentials.username,
            password: credentials.password,
            isRegister: credentials.isRegister,
          };
          if (credentials.isRegister && credentials.playerClass) {
            payload.class = credentials.playerClass;
          }
          this.network.send(MessageType.Auth, payload);
        } else {
          setTimeout(tryAuth, 200);
        }
      };
      setTimeout(tryAuth, 300);
    });
  }

  onAuthResult(callback: AuthCallback): void {
    this.authCallback = callback;
  }

  private cleanup(): void {
    if (this.authHandler) {
      this.network.off(MessageType.AuthResult, this.authHandler);
      this.authHandler = null;
    }
  }

  disconnect(): void {
    this.cleanup();
    this.network.disconnect();
    isAuthenticated.value = false;
    playerId.value = '';
    connectionStatus.value = 'disconnected';
  }
}

// Singleton instance
let _instance: AuthService | null = null;

export function getAuthService(network?: WebSocketClient): AuthService {
  if (!_instance) {
    _instance = new AuthService(network);
  }
  return _instance;
}
