import { useSignal, useComputed } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { petState, getNetwork, openPanels, togglePanel, type PetInfo } from '../../store/GameStore';

function sendPetAction(action: string, extra: Record<string, any> = {}) {
  const net = getNetwork();
  if (net) net.send(31 as any, { action, ...extra });
}

const RARITY_COLORS = ['text-gray-400', 'text-green-400', 'text-blue-400', 'text-purple-400', 'text-orange-400', 'text-red-400'];
const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];

export function PetPanel() {
  const panels = useComputed(() => openPanels.value);
  if (!panels.value.has('pets')) return null;

  const selectedPet = useSignal<PetInfo | null>(null);
  const renameInput = useSignal('');

  const active = useComputed(() => petState.value.active);
  const collection = useComputed(() => petState.value.collection);

  return (
    <PanelShell title="🐾 Pets" onClose={() => togglePanel('pets')} width="w-[420px] max-w-[calc(100vw-2rem)]">
      {/* Active Pet */}
      <div class="mb-3 p-2 bg-rf-surface-inset/30 rounded border border-rf-border/20">
        <div class="text-[10px] text-rf-muted uppercase font-bold mb-1">Active Pet</div>
        {active.value ? (
          <div class="flex items-center gap-2">
            <span class="text-2xl">{active.value.icon}</span>
            <div class="flex-1">
              <div class="text-[12px] font-bold text-rf-text">{active.value.name}</div>
              <div class={`text-[9px] ${RARITY_COLORS[active.value.rarity]}`}>
                {RARITY_NAMES[active.value.rarity]} • Lv.{active.value.level}
              </div>
              <div class="text-[9px] text-rf-muted">
                +{active.value.bonus_value} {active.value.bonus_stat} • XP: {active.value.xp}/{active.value.xp_to_next}
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <button
                type="button"
                class="px-2 py-0.5 text-[9px] bg-yellow-600/30 text-yellow-300 rounded hover:bg-yellow-600/50"
                onClick={() => sendPetAction('feed')}
              >🍖 Feed</button>
              <button
                type="button"
                class="px-2 py-0.5 text-[9px] bg-red-600/30 text-red-300 rounded hover:bg-red-600/50"
                onClick={() => sendPetAction('dismiss')}
              >❌ Dismiss</button>
            </div>
          </div>
        ) : (
          <div class="text-[10px] text-rf-muted italic">No pet summoned. Select one below!</div>
        )}
      </div>

      {/* Collection */}
      <div class="text-[10px] text-rf-muted uppercase font-bold mb-1">
        Collection ({collection.value.length} pets)
      </div>
      <div class="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
        {collection.value.length === 0 ? (
          <div class="text-[10px] text-rf-muted italic p-2">
            No pets yet! Defeat enemies to find pet eggs 🥚
          </div>
        ) : (
          collection.value.map(pet => (
            <div
              key={pet.id}
              class={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                selectedPet.value?.id === pet.id
                  ? 'bg-rf-accent/15 border border-rf-accent/30'
                  : 'hover:bg-rf-surface-inset/20 border border-transparent'
              }`}
              onClick={() => { selectedPet.value = pet; }}
            >
              <span class="text-lg">{pet.icon}</span>
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-bold text-rf-text truncate">{pet.name}</div>
                <div class={`text-[9px] ${RARITY_COLORS[pet.rarity]}`}>
                  {RARITY_NAMES[pet.rarity]} {pet.pet_type} • Lv.{pet.level}
                </div>
                <div class="text-[9px] text-rf-muted">+{pet.bonus_value} {pet.bonus_stat}</div>
              </div>
              {active.value?.id !== pet.id && (
                <button
                  type="button"
                  class="px-2 py-0.5 text-[9px] bg-green-600/30 text-green-300 rounded hover:bg-green-600/50"
                  onClick={(e) => { e.stopPropagation(); sendPetAction('summon', { petId: pet.id }); }}
                >Summon</button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Rename section */}
      {selectedPet.value && (
        <div class="mt-2 flex gap-1 items-center">
          <input
            type="text"
            class="flex-1 bg-rf-surface-inset/40 border border-rf-border/30 rounded px-2 py-1 text-[10px] text-rf-text"
            placeholder="New name..."
            value={renameInput.value}
            onInput={(e) => { renameInput.value = (e.target as HTMLInputElement).value; }}
          />
          <button
            type="button"
            class="px-2 py-1 text-[9px] bg-blue-600/30 text-blue-300 rounded hover:bg-blue-600/50"
            onClick={() => {
              if (renameInput.value.trim()) {
                sendPetAction('rename', { petId: selectedPet.value!.id, newName: renameInput.value.trim() });
                renameInput.value = '';
              }
            }}
          >✏️ Rename</button>
        </div>
      )}
    </PanelShell>
  );
}
