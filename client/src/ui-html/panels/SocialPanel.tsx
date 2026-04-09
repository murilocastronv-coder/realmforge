import { signal, useComputed, useSignal } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { InputGate } from '../../services/InputGate';
import { togglePanel } from '../../store/GameStore';

// ─── Social State ────────────────────────────────────────────

export interface Friend {
  id: string;
  name: string;
  level: number;
  playerClass: string;
  isOnline: boolean;
  zone?: string;
  lastSeen?: number;
}

export interface NearbyPlayer {
  id: string;
  name: string;
  level: number;
  playerClass: string;
  distance: number;
}

export const friendsList = signal<Friend[]>([]);
export const nearbyPlayers = signal<NearbyPlayer[]>([]);

export function addFriend(friend: Friend): void {
  if (friendsList.value.some(f => f.id === friend.id)) return;
  friendsList.value = [...friendsList.value, friend];
  saveFriends();
}

export function removeFriend(id: string): void {
  friendsList.value = friendsList.value.filter(f => f.id !== id);
  saveFriends();
}

function saveFriends(): void {
  localStorage.setItem('rf_friends', JSON.stringify(friendsList.value));
}

export function loadFriends(): void {
  try {
    const raw = localStorage.getItem('rf_friends');
    if (raw) friendsList.value = JSON.parse(raw);
  } catch { /* ignore */ }
}

// ─── Social Panel ───────────────────────────────────────────

interface SocialPanelProps {
  onClose: () => void;
}

export function SocialPanel({ onClose }: SocialPanelProps) {
  const activeTab = useSignal<'friends' | 'nearby' | 'guild'>('friends');

  const onlineFriends = useComputed(() => friendsList.value.filter(f => f.isOnline));
  const offlineFriends = useComputed(() => friendsList.value.filter(f => !f.isOnline));

  return (
    <PanelShell title="👥 Social" onClose={onClose} width="w-[360px] max-w-[calc(100vw-2rem)]">
      {/* Tabs */}
      <div class="flex gap-1 mb-3 border-b border-rf-border/20 pb-2">
        {(['friends', 'nearby', 'guild'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            class={`px-3 py-1 text-[10px] font-bold uppercase rounded ${
              activeTab.value === tab ? 'bg-rf-accent/20 text-rf-accent' : 'text-rf-muted hover:text-rf-text'
            }`}
            onClick={() => { activeTab.value = tab; }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div class="max-h-[50vh] overflow-y-auto pr-1">
        {activeTab.value === 'friends' && (
          <div class="space-y-2">
            {friendsList.value.length === 0 && (
              <div class="text-center py-8">
                <div class="text-2xl mb-2">🤝</div>
                <div class="text-xs text-rf-muted">No friends yet.</div>
                <div class="text-[10px] text-rf-muted">Click on a player and select "Add Friend"</div>
              </div>
            )}

            {onlineFriends.value.length > 0 && (
              <>
                <div class="text-[9px] text-rf-success uppercase font-bold tracking-wider">🟢 Online ({onlineFriends.value.length})</div>
                {onlineFriends.value.map(f => <FriendRow key={f.id} friend={f} />)}
              </>
            )}

            {offlineFriends.value.length > 0 && (
              <>
                <div class="text-[9px] text-rf-muted uppercase font-bold tracking-wider mt-2">⚫ Offline ({offlineFriends.value.length})</div>
                {offlineFriends.value.map(f => <FriendRow key={f.id} friend={f} />)}
              </>
            )}
          </div>
        )}

        {activeTab.value === 'nearby' && (
          <div class="space-y-1">
            {nearbyPlayers.value.length === 0 && (
              <div class="text-center py-8">
                <div class="text-2xl mb-2">👀</div>
                <div class="text-xs text-rf-muted">No players nearby.</div>
              </div>
            )}
            {nearbyPlayers.value
              .sort((a, b) => a.distance - b.distance)
              .map(p => (
                <div key={p.id} class="flex items-center justify-between bg-rf-surface-inset/30 rounded px-3 py-1.5 border border-rf-border/10">
                  <div>
                    <span class="text-xs text-rf-text font-semibold">{p.name}</span>
                    <span class="text-[9px] text-rf-muted ml-2">Lv.{p.level} {p.playerClass}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[9px] text-rf-muted">{p.distance}m</span>
                    <button
                      type="button"
                      class="text-[9px] text-rf-accent hover:text-rf-accent-bright"
                      onClick={() => addFriend({ id: p.id, name: p.name, level: p.level, playerClass: p.playerClass, isOnline: true })}
                    >
                      + Friend
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {activeTab.value === 'guild' && (
          <div class="text-center py-8">
            <div class="text-3xl mb-2">🏰</div>
            <div class="text-xs text-rf-muted mb-3">Guild management has moved!</div>
            <button
              type="button"
              class="px-4 py-2 text-[10px] font-bold uppercase bg-rf-accent/20 text-rf-accent rounded hover:bg-rf-accent/30"
              onClick={() => togglePanel('guild')}
            >
              Open Guild Panel (G)
            </button>
          </div>
        )}
      </div>
    </PanelShell>
  );
}

function FriendRow({ friend }: { friend: Friend }) {
  return (
    <div class={`flex items-center justify-between bg-rf-surface-inset/30 rounded px-3 py-1.5 border border-rf-border/10 ${!friend.isOnline ? 'opacity-50' : ''}`}>
      <div>
        <div class="flex items-center gap-1.5">
          <span class={`w-1.5 h-1.5 rounded-full ${friend.isOnline ? 'bg-rf-success' : 'bg-rf-muted'}`} />
          <span class="text-xs text-rf-text font-semibold">{friend.name}</span>
        </div>
        <div class="text-[9px] text-rf-muted ml-3">
          Lv.{friend.level} {friend.playerClass}
          {friend.isOnline && friend.zone && <span> — {friend.zone}</span>}
          {!friend.isOnline && friend.lastSeen && <span> — Last seen {timeAgo(friend.lastSeen)}</span>}
        </div>
      </div>
      <div class="flex gap-1">
        {friend.isOnline && (
          <>
            <button type="button" class="text-[9px] text-rf-accent hover:text-rf-accent-bright px-1" title="Whisper">💬</button>
            <button type="button" class="text-[9px] text-rf-accent hover:text-rf-accent-bright px-1" title="Invite to party">👥</button>
          </>
        )}
        <button
          type="button"
          class="text-[9px] text-rf-danger/60 hover:text-rf-danger px-1"
          title="Remove"
          onClick={() => removeFriend(friend.id)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
