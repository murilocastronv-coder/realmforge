import { useComputed, useSignal } from '@preact/signals';
import { openPanels, togglePanel, lastFishingResult, isFishing, inventory } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';
import { getNetwork } from '../../store/GameStore';
import { MessageType } from '../../network/WebSocketClient';
import { rarityTextClass } from '../lib/rarity';

const RARITY_TO_NUM: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5,
};

const FISH_LORE: Record<string, string> = {
  '🐟': 'A common freshwater fish.',
  '🐠': 'A colorful tropical fish.',
  '🐡': 'A pufferfish — careful with those spines!',
  '🦐': 'A tasty shrimp from shallow waters.',
  '🦀': 'A snappy crab from the coast.',
  '🐙': 'A clever octopus from the deep.',
  '🦑': 'A mysterious squid from dark waters.',
  '🐚': 'A beautiful shell washed ashore.',
  '💎': 'A rare gem pulled from the deep!',
  '📜': 'An ancient scroll sealed in a bottle.',
  '🗝️': 'A rusty key — what does it open?',
  '🪸': 'A piece of vibrant coral reef.',
  '🎣': 'A master angler\'s lucky lure.',
};

export function FishingPanel() {
  const panels = useComputed(() => openPanels.value);
  const fishing = useComputed(() => isFishing.value);
  const result = useComputed(() => lastFishingResult.value);
  const catchLog = useSignal<Array<{ icon: string; name: string; rarity: string; time: number }>>([]);

  if (!panels.value.has('fishing')) return null;

  const castLine = () => {
    if (fishing.value) return;
    const net = getNetwork();
    if (!net) return;
    isFishing.value = true;
    net.send(MessageType.FishingAction, { action: 'cast' });
    // Auto-clear fishing state after timeout
    setTimeout(() => { isFishing.value = false; }, 8000);
  };

  // Track catches in local log
  if (result.value && result.value.success) {
    const r = result.value;
    const last = catchLog.value[0];
    if (!last || last.name !== r.catch || last.time < Date.now() - 500) {
      catchLog.value = [{ icon: r.icon, name: r.catch, rarity: r.rarity, time: Date.now() }, ...catchLog.value].slice(0, 20);
    }
  }

  // Count bait in inventory
  const baitCount = inventory.value
    .filter(i => i && i.name.toLowerCase().includes('bait'))
    .reduce((sum, i) => sum + (i?.quantity || 0), 0);

  const fishCaught = catchLog.value.length;

  return (
    <PanelShell title="🎣 Fishing" onClose={() => togglePanel('fishing')} width="w-80">
      <div class="space-y-3">
        {/* Status */}
        <div class="bg-slate-800/60 rounded-lg p-3 text-center">
          <div class="text-3xl mb-2">{fishing.value ? '🌊' : '🎣'}</div>
          <p class="text-sm text-slate-300">
            {fishing.value
              ? 'Waiting for a bite...'
              : 'Cast your line into the waters!'}
          </p>
          {baitCount > 0 && (
            <p class="text-xs text-amber-400 mt-1">🪱 Bait: {baitCount} (better catches!)</p>
          )}
        </div>

        {/* Cast Button */}
        <button
          onClick={castLine}
          disabled={fishing.value}
          class={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
            fishing.value
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed animate-pulse'
              : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-[1.02] active:scale-95'
          }`}
        >
          {fishing.value ? '🌊 Fishing...' : '🎣 Cast Line'}
        </button>

        {/* Latest Catch */}
        {result.value && (
          <div class={`rounded-lg p-3 border ${
            result.value.success
              ? 'bg-emerald-900/30 border-emerald-600/40'
              : 'bg-red-900/30 border-red-600/40'
          }`}>
            <p class="text-xs text-slate-400 mb-1">Last Catch</p>
            {result.value.success ? (
              <div class="flex items-center gap-2">
                <span class="text-2xl">{result.value.icon}</span>
                <div>
                  <p class={`font-semibold ${rarityTextClass(RARITY_TO_NUM[result.value.rarity] ?? 0)}`}>
                    {result.value.catch}
                  </p>
                  <p class="text-xs text-amber-400">💰 {result.value.value}g value</p>
                </div>
              </div>
            ) : (
              <p class="text-slate-400 text-sm">The fish got away... 🐟💨</p>
            )}
          </div>
        )}

        {/* Catch Log */}
        {catchLog.value.length > 0 && (
          <div>
            <p class="text-xs text-slate-400 mb-1 font-semibold">Recent Catches ({fishCaught})</p>
            <div class="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
              {catchLog.value.map((c, i) => (
                <div key={i} class="flex items-center gap-2 bg-slate-800/40 rounded px-2 py-1">
                  <span class="text-lg">{c.icon}</span>
                  <span class={`text-sm ${rarityTextClass(RARITY_TO_NUM[c.rarity] ?? 0)}`}>{c.name}</span>
                  <span class="text-xs text-slate-500 ml-auto">
                    {FISH_LORE[c.icon] ? '📖' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tips */}
        <div class="bg-slate-800/30 rounded p-2 text-xs text-slate-500">
          <p>💡 Fish near water for best results. Rare fish appear at night!</p>
          <p class="mt-1">🪱 Bait items increase catch quality.</p>
        </div>
      </div>
    </PanelShell>
  );
}
