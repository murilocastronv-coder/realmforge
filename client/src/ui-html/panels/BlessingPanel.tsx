import { useComputed } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { openPanels, blessings, gold, getNetwork } from '../../store/GameStore';
import { MessageType } from '../../network/WebSocketClient';

const BLESSING_DEFS = [
  { id: 0, name: 'Adventurer\'s Blessing', icon: '🛡️', cost: 10000, desc: 'Reduces item loss on death by 8%' },
  { id: 1, name: 'Spiritual Shielding', icon: '🔮', cost: 15000, desc: 'Reduces item loss on death by 8%' },
  { id: 2, name: 'Phoenix Blessing', icon: '🔥', cost: 20000, desc: 'Reduces item loss on death by 8%' },
  { id: 3, name: 'Embrace of Tibia', icon: '✨', cost: 25000, desc: 'Reduces item loss on death by 8%' },
  { id: 4, name: 'Twist of Fate', icon: '🌀', cost: 50000, desc: 'Preserves other blessings on death' },
];

export function BlessingPanel() {
  const isOpen = useComputed(() => openPanels.value.has('blessings'));

  if (!isOpen.value) return null;

  const playerBlessings = blessings.value;
  const playerGold = gold.value;
  const activeCount = countBits(playerBlessings);
  const reductionPct = activeCount * 8;

  function countBits(n: number): number {
    let count = 0;
    while (n) { count += n & 1; n >>= 1; }
    return count;
  }

  function hasBit(mask: number, bit: number): boolean {
    return (mask & (1 << bit)) !== 0;
  }

  function buyBlessing(id: number) {
    try {
      getNetwork().send(MessageType.BuyBlessing, { action: 'buy', blessing_id: id });
    } catch {}
  }

  return (
    <PanelShell title="Blessings" onClose={() => openPanels.value = new Set([...openPanels.value].filter(p => p !== 'blessings'))} width="w-80">
      <div class="flex flex-col gap-3 p-2">
        <div class="text-center">
          <h2 class="text-lg font-bold text-amber-400">⛪ Temple Blessings</h2>
          <p class="text-xs text-gray-400 mt-1">Reduce death penalty. Consumed on death.</p>
        </div>

        <div class="bg-gray-800/80 rounded p-2 text-center">
          <div class="text-sm text-amber-300">{activeCount}/5 Blessings Active</div>
          <div class="text-xs text-gray-400">Death item loss reduced by {reductionPct}%</div>
          <div class="w-full bg-gray-700 rounded-full h-2 mt-1">
            <div class="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${(activeCount / 5) * 100}%` }} />
          </div>
        </div>

        <div class="space-y-2">
          {BLESSING_DEFS.map(b => {
            const owned = hasBit(playerBlessings, b.id);
            const canAfford = playerGold >= b.cost;
            return (
              <div key={b.id} class={`flex items-center justify-between p-2 rounded border ${owned ? 'bg-amber-900/30 border-amber-600/50' : 'bg-gray-800/60 border-gray-700/50'}`}>
                <div class="flex items-center gap-2">
                  <span class="text-xl">{b.icon}</span>
                  <div>
                    <div class={`text-sm font-medium ${owned ? 'text-amber-300' : 'text-white'}`}>{b.name}</div>
                    <div class="text-[10px] text-gray-400">{b.desc}</div>
                  </div>
                </div>
                {owned ? (
                  <span class="text-xs text-green-400 font-bold">✓ Active</span>
                ) : (
                  <button
                    class={`px-2 py-1 text-xs rounded font-bold ${canAfford ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    disabled={!canAfford}
                    onClick={() => buyBlessing(b.id)}
                  >
                    {(b.cost / 1000).toFixed(0)}K 💰
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PanelShell>
  );
}
