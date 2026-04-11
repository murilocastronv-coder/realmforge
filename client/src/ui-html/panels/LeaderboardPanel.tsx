import { signal, useComputed, useSignal } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { getNetwork } from '../../store/GameStore';

// ─── Leaderboard State ──────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  name: string;
  level: number;
  playerClass: string;
  value: number;
  isPlayer?: boolean;
}

export type LeaderboardCategory = 'level' | 'kills' | 'gold' | 'achievements';

export const leaderboardData = signal<Map<LeaderboardCategory, LeaderboardEntry[]>>(new Map());

export function requestLeaderboard(): void {
  const net = getNetwork();
  if (net) {
    net.send(33 as any, {});
  }
}

export function updateLeaderboardFromServer(payload: any): void {
  const map = new Map<LeaderboardCategory, LeaderboardEntry[]>();
  const categories: LeaderboardCategory[] = ['level', 'kills', 'gold', 'achievements'];
  for (const cat of categories) {
    const entries = payload[cat];
    if (Array.isArray(entries)) {
      map.set(cat, entries.map((e: any, i: number) => ({
        rank: i + 1,
        name: e.name || 'Unknown',
        level: e.value || 0,
        playerClass: e.class || 'warrior',
        value: e.value || 0,
      })));
    }
  }
  leaderboardData.value = map;
}

// ─── Leaderboard Panel ──────────────────────────────────────

interface LeaderboardPanelProps {
  onClose: () => void;
}

const CATEGORY_META: Record<LeaderboardCategory, { label: string; icon: string; unit: string }> = {
  level: { label: 'Level', icon: '⭐', unit: 'Lv.' },
  kills: { label: 'Kills', icon: '💀', unit: '' },
  gold: { label: 'Gold', icon: '💰', unit: '🪙' },
  achievements: { label: 'Achievements', icon: '🏆', unit: '' },
};

export function LeaderboardPanel({ onClose }: LeaderboardPanelProps) {
  const activeCategory = useSignal<LeaderboardCategory>('level');

  // Request leaderboard data from server on mount
  requestLeaderboard();

  const entries = useComputed(() => {
    return leaderboardData.value.get(activeCategory.value) || [];
  });

  const meta = CATEGORY_META[activeCategory.value];

  return (
    <PanelShell title="🏅 Leaderboard" onClose={onClose} width="w-[400px] max-w-[calc(100vw-2rem)]">
      {/* Category tabs */}
      <div class="flex gap-1 mb-3 border-b border-rf-border/20 pb-2">
        {(Object.entries(CATEGORY_META) as [LeaderboardCategory, typeof meta][]).map(([cat, m]) => (
          <button
            key={cat}
            type="button"
            class={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
              activeCategory.value === cat
                ? 'bg-rf-accent/20 text-rf-accent border border-rf-accent/30'
                : 'text-rf-muted hover:text-rf-text border border-transparent'
            }`}
            onClick={() => { activeCategory.value = cat; }}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div class="grid grid-cols-[40px_1fr_80px_60px] gap-1 text-[9px] text-rf-muted uppercase font-bold mb-1 px-2">
        <span>Rank</span>
        <span>Player</span>
        <span>Class</span>
        <span class="text-right">{meta.label}</span>
      </div>

      {/* Entries */}
      <div class="space-y-0.5 max-h-[50vh] overflow-y-auto pr-1">
        {entries.value.map(entry => (
          <LeaderboardRow key={entry.rank} entry={entry} unit={meta.unit} />
        ))}
      </div>
    </PanelShell>
  );
}

function LeaderboardRow({ entry, unit }: { entry: LeaderboardEntry; unit: string }) {
  const rankColors = ['', 'text-yellow-300', 'text-gray-300', 'text-amber-600'];
  const rankIcons = ['', '🥇', '🥈', '🥉'];
  const classIcons: Record<string, string> = { warrior: '⚔️', mage: '🧙', rogue: '🗡️' };

  return (
    <div class={`grid grid-cols-[40px_1fr_80px_60px] gap-1 items-center px-2 py-1 rounded ${
      entry.isPlayer ? 'bg-rf-accent/10 border border-rf-accent/20' : 'hover:bg-rf-surface-inset/20'
    } ${entry.rank <= 3 ? 'font-semibold' : ''}`}>
      <span class={`text-xs ${rankColors[entry.rank] || 'text-rf-muted'}`}>
        {rankIcons[entry.rank] || `#${entry.rank}`}
      </span>
      <span class={`text-[11px] truncate ${entry.isPlayer ? 'text-rf-accent' : 'text-rf-text'}`}>
        {entry.name} {entry.isPlayer && '(you)'}
      </span>
      <span class="text-[10px] text-rf-muted capitalize">
        {classIcons[entry.playerClass] || '👤'} {entry.playerClass}
      </span>
      <span class="text-[11px] text-rf-text font-mono text-right">
        {unit}{entry.value.toLocaleString()}
      </span>
    </div>
  );
}
