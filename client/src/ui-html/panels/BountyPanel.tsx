import { useComputed, useSignal } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { openPanels, bountyBoard, myBounty, gold, getNetwork, type BountyEntry } from '../../store/GameStore';
import { MessageType } from '../../network/WebSocketClient';

export function BountyPanel() {
  const isOpen = useComputed(() => openPanels.value.has('bounty'));
  const targetName = useSignal('');
  const bountyAmount = useSignal(1000);

  if (!isOpen.value) return null;

  function placeBounty() {
    if (!targetName.value || bountyAmount.value < 1000) return;
    try {
      getNetwork().send(MessageType.BountyAction, {
        action: 'place',
        targetName: targetName.value,
        amount: bountyAmount.value,
      });
      targetName.value = '';
      bountyAmount.value = 1000;
    } catch {}
  }

  function refreshList() {
    try {
      getNetwork().send(MessageType.BountyAction, { action: 'list' });
    } catch {}
  }

  return (
    <PanelShell title="Bounty Board" onClose={() => openPanels.value = new Set([...openPanels.value].filter(p => p !== 'bounty'))} width="w-80">
      <div class="flex flex-col gap-3 p-2 max-h-[500px]">
        <div class="text-center">
          <h2 class="text-lg font-bold text-red-400">🏴‍☠️ Bounty Board</h2>
          {myBounty.value > 0 && (
            <div class="text-xs text-red-300 mt-1">⚠️ Your bounty: {myBounty.value.toLocaleString()}g</div>
          )}
        </div>

        {/* Place bounty */}
        <div class="bg-gray-800/80 rounded p-2 space-y-2">
          <div class="text-xs text-gray-400 font-bold">Place a Bounty</div>
          <input
            type="text"
            placeholder="Player name..."
            class="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-white"
            value={targetName.value}
            onInput={(e) => targetName.value = (e.target as HTMLInputElement).value}
          />
          <div class="flex items-center gap-2">
            <input
              type="number"
              min={1000}
              step={1000}
              class="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-white"
              value={bountyAmount.value}
              onInput={(e) => bountyAmount.value = parseInt((e.target as HTMLInputElement).value) || 1000}
            />
            <button
              class={`px-3 py-1 text-xs rounded font-bold ${gold.value >= bountyAmount.value ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
              disabled={gold.value < bountyAmount.value}
              onClick={placeBounty}
            >
              Place 💰
            </button>
          </div>
          <div class="text-[10px] text-gray-500">Min: 1,000g · Your gold: {gold.value.toLocaleString()}g</div>
        </div>

        {/* Bounty list */}
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400 font-bold">Most Wanted</span>
          <button class="text-[10px] text-blue-400 hover:text-blue-300" onClick={refreshList}>🔄 Refresh</button>
        </div>

        <div class="flex-1 overflow-y-auto space-y-1 max-h-[250px]">
          {bountyBoard.value.length === 0 ? (
            <div class="text-center text-gray-500 text-sm py-4">No active bounties</div>
          ) : (
            bountyBoard.value.map((entry: BountyEntry, i: number) => (
              <div key={entry.name} class={`flex items-center justify-between p-2 rounded border ${i === 0 ? 'bg-red-900/30 border-red-600/50' : 'bg-gray-800/60 border-gray-700/50'}`}>
                <div class="flex items-center gap-2">
                  <span class="text-lg">{i === 0 ? '💀' : i === 1 ? '☠️' : i === 2 ? '🗡️' : '⚔️'}</span>
                  <div>
                    <div class="text-sm font-medium text-white">{entry.name}</div>
                    <div class="text-[10px] text-gray-500">Level {entry.level}</div>
                  </div>
                </div>
                <div class="text-right">
                  <div class={`text-sm font-bold ${i === 0 ? 'text-red-400' : 'text-amber-400'}`}>{entry.bounty.toLocaleString()}g</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PanelShell>
  );
}
