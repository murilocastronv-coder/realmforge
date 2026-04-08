import { SERVER_URL } from '../utils/Constants';

export enum MessageType {
  // Client → Server
  Auth = 1,
  Move = 2,
  Chat = 3,
  Attack = 4,
  PickupItem = 5,
  UseItem = 6,
  EquipItem = 7,
  UnequipItem = 8,
  BankDeposit = 9,
  BankWithdraw = 10,
  AttackPlayer = 11,

  // Server → Client
  AuthResult = 50,
  PlayerJoined = 51,
  PlayerLeft = 52,
  EntityUpdate = 53,
  ChunkData = 54,
  ChatMessage = 55,
  CombatEvent = 56,
  ItemDrop = 57,
  InventoryUpdate = 58,
  StatsUpdate = 59,
  LevelUp = 60,
  Death = 61,
  Respawn = 62,
  GroundItems = 63,
  BankUpdate = 64,
}

export interface GameMessage {
  type: MessageType;
  payload: unknown;
}

export interface MovePayload {
  targetX: number;
  targetY: number;
  seq: number; // Sequence number for reconciliation
}

export interface AuthPayload {
  username: string;
  password: string;
  isRegister: boolean;
}

export interface EntityUpdatePayload {
  entities: EntityState[];
}

export interface EntityState {
  id: string;
  entityType: 'player' | 'enemy' | 'npc' | 'item';
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
  level?: number;
  name?: string;
  spriteKey?: string;
  direction?: number;
  action?: string;
}

export interface ChunkDataPayload {
  chunkX: number;
  chunkY: number;
  tiles: number[][];
  biome: string;
}

type MessageHandler = (msg: GameMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<MessageType, MessageHandler[]> = new Map();
  private statusListeners: Array<(status: 'connected' | 'disconnected' | 'reconnecting') => void> = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelay = 1000;
  private _connected = false;
  private messageQueue: GameMessage[] = [];
  private lastAuthPayload: unknown = null;

  get connected(): boolean {
    return this._connected;
  }

  onStatusChange(listener: (status: 'connected' | 'disconnected' | 'reconnecting') => void): void {
    this.statusListeners.push(listener);
  }

  private emitStatus(status: 'connected' | 'disconnected' | 'reconnecting'): void {
    for (const l of this.statusListeners) l(status);
  }

  connect(): void {
    try {
      this.ws = new WebSocket(SERVER_URL);

      this.ws.onopen = () => {
        console.log('[WS] Connected to server');
        this._connected = true;
        this.reconnectAttempts = 0;
        this.emitStatus('connected');

        // Re-auth on reconnect
        if (this.lastAuthPayload) {
          this.send(MessageType.Auth, this.lastAuthPayload);
        }

        // Flush queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift()!;
          this.send(msg.type, msg.payload);
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: GameMessage = JSON.parse(event.data as string);
          this.dispatch(msg);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this._connected = false;
        this.emitStatus('disconnected');
        this.tryReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      this.tryReconnect();
    }
  }

  send(type: MessageType, payload: unknown): void {
    // Cache auth payload for reconnection
    if (type === MessageType.Auth) {
      this.lastAuthPayload = payload;
    }
    if (!this._connected || !this.ws) {
      this.messageQueue.push({ type, payload });
      return;
    }
    const msg: GameMessage = { type, payload };
    this.ws.send(JSON.stringify(msg));
  }

  on(type: MessageType, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: MessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  private dispatch(msg: GameMessage): void {
    const handlers = this.handlers.get(msg.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(msg);
      }
    }
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      this.emitStatus('disconnected');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 15000);
    console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.emitStatus('reconnecting');
    setTimeout(() => this.connect(), delay);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}
