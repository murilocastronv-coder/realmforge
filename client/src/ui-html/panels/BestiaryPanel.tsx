import { useComputed, useSignal } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { bestiary, openPanels, type BestiaryEntry } from '../../store/GameStore';
import { WebSocketClient, MessageType } from '../../network/WebSocketClient';

const TIER_COLORS: Record<string, string> = {
  unknown: 'text-gray-500',
  basic: 'text-green-400',
  detailed: 'text-blue-400',
  advanced: 'text-purple-400',
  completed: 'text-yellow-400',
};

const TIER_ICONS: Record<string, string> = {
  unknown: '❓',
  basic: '📖',
  detailed: '📚',
  advanced: '🔬',
  completed: '⭐',
};

export function BestiaryPanel() {
  const isOpen = useComputed(() => openPanels.value.has('bestiary'));
  const filter = useSignal('');
  const selectedTier = useSignal<string>('all');

  if (!isOpen.value) return null;

  const filtered = useComputed(() => {
    let entries = bestiary.value;
    if (filter.value) {
      const q = filter.value.toLowerCase();
      entries = entries.filter(e => e.name.toLowerCase().includes(q));
    }
    if (selectedTier.value !== 'all') {
      entries = entries.filter(e => e.tier === selectedTier.value);
    }
    return entries.sort((a, b) => b.kills - a.kills);
  });

  const totalKills = useComputed(() => bestiary.value.reduce((sum, e) => sum + e.kills, 0));
  const completedCount = useComputed(() => bestiary.value.filter(e => e.tier === 'completed').length);

  return (
    <PanelShell title="Bestiary" onClose={() => openPanels.value = new Set([...openPanels.value].filter(p => p !== 'bestiary'))} width="w-96">
      <div class="flex flex-col gap-2 p-2 max-h-[500px]">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-bold text-amber-400">📖 Bestiary</h2>
          <span class="text-xs text-gray-400">{bestiary.value.length} species · {totalKills.value} kills</span>
        </div>

        <div class="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Search..."
            class="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white"
            value={filter.value}
            onInput={(e) => filter.value = (e.target as HTMLInputElement).value}
          />
          <select
            class="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white"
            value={selectedTier.value}
            onChange={(e) => selectedTier.value = (e.target as HTMLSelectElement).value}
          >
            <option value="all">All</option>
            <option value="unknown">Unknown</option>
            <option value="basic">Basic</option>
            <option value="detailed">Detailed</option>
            <option value="advanced">Advanced</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div class="text-xs text-center text-amber-300">
          ⭐ Completed: {completedCount.value}/{bestiary.value.length}
        </div>

        <div class="flex-1 overflow-y-auto space-y-1 max-h-[380px] pr-1">
          {filtered.value.length === 0 ? (
            <div class="text-center text-gray-500 text-sm py-8">No bestiary entries yet. Go kill some monsters!</div>
          ) : (
            filtered.value.map((entry: BestiaryEntry) => (
              <div key={entry.name} class="flex items-center justify-between bg-gray-800/60 rounded px-2 py-1.5 border border-gray-700/50 hover:border-gray-600 transition-colors">
                <div class="flex items-center gap-2">
                  <span class="text-sm">{TIER_ICONS[entry.tier] || '❓'}</span>
                  <div>
                    <div class={`text-sm font-medium ${TIER_COLORS[entry.tier] || 'text-gray-400'}`}>{entry.name}</div>
                    <div class="text-[10px] text-gray-500 capitalize">{entry.tier}</div>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-sm font-mono text-white">{entry.kills}</div>
                  <div class="text-[10px] text-gray-500">kills</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PanelShell>
  );
}
