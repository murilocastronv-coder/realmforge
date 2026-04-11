import { signal, useComputed, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { PanelShell } from '../components/PanelShell';

// ─── Achievement Data ────────────────────────────────────────

export type AchievementCategory = 'combat' | 'exploration' | 'social' | 'collection' | 'progression';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  progress: number;
  maxProgress: number;
  reward?: string;
  unlockedAt?: number; // timestamp
}

export const achievements = signal<Achievement[]>([]);
export const achievementToast = signal<Achievement | null>(null);

const CATEGORY_ICONS: Record<AchievementCategory, string> = {
  combat: '⚔️',
  exploration: '🗺️',
  social: '👥',
  collection: '📦',
  progression: '📈',
};

/** Initialize default achievements (call once on load). */
export function initAchievements(): void {
  const saved = localStorage.getItem('rf_achievements');
  if (saved) {
    try { achievements.value = JSON.parse(saved); return; } catch { /* ignore */ }
  }

  achievements.value = [
    // Combat
    { id: 'first-blood', name: 'First Blood', description: 'Defeat your first enemy', icon: '🗡️', category: 'combat', progress: 0, maxProgress: 1 },
    { id: 'slayer-10', name: 'Slayer', description: 'Defeat 10 enemies', icon: '💀', category: 'combat', progress: 0, maxProgress: 10 },
    { id: 'slayer-100', name: 'Centurion', description: 'Defeat 100 enemies', icon: '🏛️', category: 'combat', progress: 0, maxProgress: 100 },
    { id: 'slayer-1000', name: 'Warlord', description: 'Defeat 1,000 enemies', icon: '👹', category: 'combat', progress: 0, maxProgress: 1000 },
    { id: 'pvp-first', name: 'Duelist', description: 'Win your first PvP fight', icon: '🤺', category: 'combat', progress: 0, maxProgress: 1 },
    { id: 'boss-kill', name: 'Boss Slayer', description: 'Defeat a boss enemy', icon: '🐉', category: 'combat', progress: 0, maxProgress: 1 },
    { id: 'crit-streak', name: 'Critical Eye', description: 'Land 5 critical hits in a row', icon: '🎯', category: 'combat', progress: 0, maxProgress: 1 },

    // Exploration
    { id: 'explorer-biomes', name: 'Cartographer', description: 'Visit all 8 biomes', icon: '🧭', category: 'exploration', progress: 0, maxProgress: 8 },
    { id: 'walk-1000', name: 'Wanderer', description: 'Walk 1,000 tiles', icon: '🚶', category: 'exploration', progress: 0, maxProgress: 1000 },
    { id: 'night-explorer', name: 'Nightwalker', description: 'Explore during nighttime for 5 minutes', icon: '🌙', category: 'exploration', progress: 0, maxProgress: 1 },

    // Social
    { id: 'first-chat', name: 'Hello World', description: 'Send your first chat message', icon: '💬', category: 'social', progress: 0, maxProgress: 1 },
    { id: 'trade-first', name: 'Merchant', description: 'Complete your first trade', icon: '🤝', category: 'social', progress: 0, maxProgress: 1 },
    { id: 'party-join', name: 'Teamwork', description: 'Join a party', icon: '👥', category: 'social', progress: 0, maxProgress: 1 },

    // Collection
    { id: 'loot-rare', name: 'Rare Find', description: 'Find a rare item', icon: '💎', category: 'collection', progress: 0, maxProgress: 1 },
    { id: 'loot-epic', name: 'Epic Discovery', description: 'Find an epic item', icon: '🌟', category: 'collection', progress: 0, maxProgress: 1 },
    { id: 'loot-legendary', name: 'Legendary!', description: 'Find a legendary item', icon: '👑', category: 'collection', progress: 0, maxProgress: 1 },
    { id: 'craft-10', name: 'Apprentice Smith', description: 'Craft 10 items', icon: '🔨', category: 'collection', progress: 0, maxProgress: 10 },
    { id: 'gold-1000', name: 'Wealthy', description: 'Accumulate 1,000 gold', icon: '💰', category: 'collection', progress: 0, maxProgress: 1000 },

    // Progression
    { id: 'level-5', name: 'Getting Started', description: 'Reach level 5', icon: '⭐', category: 'progression', progress: 0, maxProgress: 5 },
    { id: 'level-10', name: 'Adventurer', description: 'Reach level 10', icon: '🌟', category: 'progression', progress: 0, maxProgress: 10 },
    { id: 'level-25', name: 'Veteran', description: 'Reach level 25', icon: '💫', category: 'progression', progress: 0, maxProgress: 25 },
    { id: 'level-50', name: 'Champion', description: 'Reach level 50', icon: '🏆', category: 'progression', progress: 0, maxProgress: 50 },
    { id: 'all-stats', name: 'Balanced Build', description: 'Allocate stat points to all stats', icon: '📊', category: 'progression', progress: 0, maxProgress: 1 },
    { id: 'max-skill', name: 'Mastery', description: 'Max out a skill', icon: '🎓', category: 'progression', progress: 0, maxProgress: 1 },
  ];
  saveAchievements();
}

function saveAchievements(): void {
  localStorage.setItem('rf_achievements', JSON.stringify(achievements.value));
}

/** Update achievement progress — call from game logic. */
export function updateAchievement(id: string, amount: number = 1): void {
  const list = [...achievements.value];
  const idx = list.findIndex(a => a.id === id);
  if (idx === -1) return;

  const a = { ...list[idx] };
  if (a.unlockedAt) return; // already complete

  a.progress = Math.min(a.progress + amount, a.maxProgress);
  if (a.progress >= a.maxProgress) {
    a.unlockedAt = Date.now();
    achievementToast.value = a;
    setTimeout(() => { achievementToast.value = null; }, 5000);
  }

  list[idx] = a;
  achievements.value = list;
  saveAchievements();
}

/** Set achievement progress to a specific value (for level checks etc). */
export function setAchievementProgress(id: string, current: number): void {
  const list = [...achievements.value];
  const idx = list.findIndex(a => a.id === id);
  if (idx === -1) return;

  const a = { ...list[idx] };
  if (a.unlockedAt) return;

  a.progress = Math.min(current, a.maxProgress);
  if (a.progress >= a.maxProgress) {
    a.unlockedAt = Date.now();
    achievementToast.value = a;
    setTimeout(() => { achievementToast.value = null; }, 5000);
  }

  list[idx] = a;
  achievements.value = list;
  saveAchievements();
}

// ─── Achievement Toast ──────────────────────────────────────

export function AchievementToast() {
  const toast = useComputed(() => achievementToast.value);
  if (!toast.value) return null;

  return (
    <div class="fixed top-24 left-1/2 -translate-x-1/2 z-[60] animate-toast-in pointer-events-none">
      <div class="bg-gradient-to-r from-yellow-900/90 to-amber-800/90 border border-yellow-400/50 rounded-xl px-6 py-3 shadow-2xl flex items-center gap-3 min-w-[280px]">
        <div class="text-3xl">{toast.value.icon}</div>
        <div>
          <div class="text-[10px] text-yellow-300/80 uppercase font-bold tracking-widest">Achievement Unlocked!</div>
          <div class="text-sm font-bold text-yellow-100">{toast.value.name}</div>
          <div class="text-[10px] text-yellow-200/60">{toast.value.description}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Achievement Panel ──────────────────────────────────────

interface AchievementPanelProps {
  onClose: () => void;
}

export function AchievementPanel({ onClose }: AchievementPanelProps) {
  const activeCategory = useSignal<AchievementCategory | 'all'>('all');

  useEffect(() => { initAchievements(); }, []);

  const filtered = useComputed(() => {
    const cat = activeCategory.value;
    if (cat === 'all') return achievements.value;
    return achievements.value.filter(a => a.category === cat);
  });

  const stats = useComputed(() => {
    const total = achievements.value.length;
    const unlocked = achievements.value.filter(a => a.unlockedAt).length;
    return { total, unlocked, pct: total > 0 ? Math.round((unlocked / total) * 100) : 0 };
  });

  return (
    <PanelShell title="🏆 Achievements" onClose={onClose} width="w-[480px] max-w-[calc(100vw-2rem)]">
      {/* Overall progress */}
      <div class="mb-3 bg-rf-surface-inset/50 rounded-lg px-3 py-2">
        <div class="flex justify-between text-[10px] text-rf-muted mb-1">
          <span>{stats.value.unlocked} / {stats.value.total} Unlocked</span>
          <span>{stats.value.pct}%</span>
        </div>
        <div class="h-2 bg-rf-surface-inset rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all duration-500" style={{ width: `${stats.value.pct}%` }} />
        </div>
      </div>

      {/* Category tabs */}
      <div class="flex gap-1 mb-3 flex-wrap">
        <CategoryTab active={activeCategory.value === 'all'} label="All" icon="📋" onClick={() => { activeCategory.value = 'all'; }} />
        {(Object.entries(CATEGORY_ICONS) as [AchievementCategory, string][]).map(([cat, icon]) => (
          <CategoryTab key={cat} active={activeCategory.value === cat} label={cat} icon={icon} onClick={() => { activeCategory.value = cat; }} />
        ))}
      </div>

      {/* Achievement list */}
      <div class="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
        {filtered.value.map(a => (
          <AchievementRow key={a.id} achievement={a} />
        ))}
      </div>
    </PanelShell>
  );
}

function CategoryTab({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class={`px-2 py-0.5 text-[10px] rounded transition-colors ${
        active ? 'bg-rf-accent/20 text-rf-accent border border-rf-accent/30' : 'text-rf-muted hover:text-rf-text border border-transparent'
      }`}
      onClick={onClick}
    >
      {icon} {label}
    </button>
  );
}

function AchievementRow({ achievement }: { achievement: Achievement }) {
  const unlocked = !!achievement.unlockedAt;
  const pct = achievement.maxProgress > 0 ? Math.round((achievement.progress / achievement.maxProgress) * 100) : 0;

  return (
    <div class={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
      unlocked
        ? 'bg-yellow-900/10 border-yellow-400/20'
        : 'bg-rf-surface-inset/30 border-rf-border/10 opacity-80'
    }`}>
      <div class="text-2xl">{achievement.icon}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class={`text-xs font-bold ${unlocked ? 'text-yellow-200' : 'text-rf-text'}`}>{achievement.name}</span>
          {unlocked && <span class="text-[8px] text-yellow-400">✓</span>}
        </div>
        <div class="text-[10px] text-rf-muted">{achievement.description}</div>
        {!unlocked && (
          <div class="mt-1 flex items-center gap-2">
            <div class="flex-1 h-1 bg-rf-surface-inset rounded-full overflow-hidden">
              <div class="h-full bg-rf-accent/60 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span class="text-[8px] text-rf-muted">{achievement.progress}/{achievement.maxProgress}</span>
          </div>
        )}
        {unlocked && achievement.unlockedAt && (
          <div class="text-[8px] text-yellow-400/50 mt-0.5">
            {new Date(achievement.unlockedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
