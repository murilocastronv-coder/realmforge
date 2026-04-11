import { useComputed } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { ItemSlot } from '../components/ItemSlot';
import {
  tradeState,
  inventory,
  playerId,
  commands,
  type TradeState,
} from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';
import { useState } from 'preact/hooks';

export function TradePanel() {
  const trade = useComputed(() => tradeState.value);
  const inv = useComputed(() => inventory.value);
  const myId = useComputed(() => playerId.value);
  const [goldOffer, setGoldOffer] = useState(0);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);

  if (!trade.value.active) return null;

  const isPlayerA = myId.value === trade.value.playerA;
  const myItems = isPlayerA ? trade.value.itemsA : trade.value.itemsB;
  const theirItems = isPlayerA ? trade.value.itemsB : trade.value.itemsA;
  const myGold = isPlayerA ? trade.value.goldA : trade.value.goldB;
  const theirGold = isPlayerA ? trade.value.goldB : trade.value.goldA;
  const myConfirmed = isPlayerA ? trade.value.confirmedA : trade.value.confirmedB;
  const theirConfirmed = isPlayerA ? trade.value.confirmedB : trade.value.confirmedA;

  const toggleSlot = (idx: number) => {
    const next = selectedSlots.includes(idx)
      ? selectedSlots.filter(s => s !== idx)
      : [...selectedSlots, idx];
    setSelectedSlots(next);
    commands.tradeOffer(next, goldOffer);
  };

  const updateGold = (g: number) => {
    const clamped = Math.max(0, g);
    setGoldOffer(clamped);
    commands.tradeOffer(selectedSlots, clamped);
  };

  return (
    <PanelShell title="⚖️ Trade" onClose={() => commands.tradeCancel()} width="w-[420px]">
      <div
        class="space-y-3 text-sm"
        onMouseEnter={() => InputGate.claimPointer('trade')}
        onMouseLeave={() => InputGate.releasePointer('trade')}
      >
        {/* My offer */}
        <div>
          <h3 class="text-yellow-300 font-bold mb-1">Your Offer</h3>
          <div class="grid grid-cols-8 gap-1">
            {inv.value.map((item, i) => (
              <div
                key={i}
                class={`cursor-pointer ${selectedSlots.includes(i) ? 'ring-2 ring-yellow-400 rounded' : ''}`}
                onClick={() => item && toggleSlot(i)}
              >
                <ItemSlot item={item} size={36} />
              </div>
            ))}
          </div>
          <div class="flex items-center gap-2 mt-2">
            <span class="text-yellow-400">💰 Gold:</span>
            <input
              type="number"
              value={goldOffer}
              onInput={(e) => updateGold(parseInt((e.target as HTMLInputElement).value) || 0)}
              onFocus={() => InputGate.claimFocus('trade-gold')}
              onBlur={() => InputGate.releaseFocus('trade-gold')}
              class="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
              min="0"
            />
          </div>
          <div class="text-xs text-slate-400 mt-1">
            Offering: {myItems.length} items, {myGold}g
            {myConfirmed && <span class="text-green-400 ml-2">✅ Confirmed</span>}
          </div>
        </div>

        {/* Divider */}
        <div class="border-t border-slate-600" />

        {/* Their offer */}
        <div>
          <h3 class="text-cyan-300 font-bold mb-1">Their Offer</h3>
          <div class="text-xs text-slate-300">
            {theirItems.length} items, {theirGold}g
            {theirConfirmed && <span class="text-green-400 ml-2">✅ Confirmed</span>}
          </div>
        </div>

        {/* Actions */}
        <div class="flex gap-2">
          <button
            onClick={() => commands.tradeConfirm()}
            class={`flex-1 py-2 rounded font-bold text-sm ${
              myConfirmed
                ? 'bg-green-700 text-green-200 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
            disabled={myConfirmed}
          >
            {myConfirmed ? '✅ Confirmed' : '✔ Confirm Trade'}
          </button>
          <button
            onClick={() => commands.tradeCancel()}
            class="flex-1 py-2 rounded font-bold text-sm bg-red-600 hover:bg-red-500 text-white"
          >
            ✖ Cancel
          </button>
        </div>
      </div>
    </PanelShell>
  );
}
