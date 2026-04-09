import { useComputed, useSignal } from '@preact/signals';
import { openPanels, togglePanel, inventory, gold, commands } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';
import { ItemSlot } from '../components/ItemSlot';
import { rarityTextClass, rarityName } from '../lib/rarity';
import type { SlottedGameItem } from '../../types/gameData';

const SUCCESS_RATES = [100, 100, 100, 85, 85, 85, 70, 70, 55, 40];

function getSuccessRate(level: number): number {
  return SUCCESS_RATES[level] ?? 0;
}

function getGoldCost(level: number): number {
  return 100 * (level + 1) * (level + 1);
}

function getStonesNeeded(level: number): number {
  return level + 1;
}

function getEnchantBonus(level: number, itemType: string): Record<string, number> {
  const bonus: Record<string, number> = {};
  if (level === 0) return bonus;
  if (itemType === 'Weapon') bonus['ATK'] = level * 3;
  if (itemType === 'Armor') bonus['DEF'] = level * 2;
  if (level >= 5) bonus['HP'] = (bonus['HP'] ?? 0) + 5;
  if (level >= 10) {
    bonus['HP'] = (bonus['HP'] ?? 0) + 10;
    bonus['SPD'] = (bonus['SPD'] ?? 0) + 3;
  }
  return bonus;
}

type EnchantState = 'idle' | 'success' | 'failure';

export function EnchantPanel() {
  const isOpen = useComputed(() => openPanels.value.has('enchant'));
  const items = useComputed(() => inventory.value);
  const goldAmount = useComputed(() => gold.value);
  const selectedSlot = useSignal<number>(-1);
  const animState = useSignal<EnchantState>('idle');

  if (!isOpen.value) return null;

  // Filter to enchantable items (weapons + armor)
  const enchantableItems = items.value
    .filter((i): i is SlottedGameItem => i !== null && (i.itemType === 'Weapon' || i.itemType === 'Armor'));

  // Count enchanting stones
  const stoneCount = items.value
    .filter((i): i is SlottedGameItem => i !== null && i.templateId === 'enchanting_stone')
    .reduce((sum, i) => sum + i.quantity, 0);

  const selected = selectedSlot.value >= 0
    ? enchantableItems.find(i => i.slotIndex === selectedSlot.value) ?? null
    : null;

  const currentLevel = selected?.enchantLevel ?? 0;
  const nextLevel = currentLevel + 1;
  const goldCost = selected ? getGoldCost(currentLevel) : 0;
  const stonesNeeded = selected ? getStonesNeeded(currentLevel) : 0;
  const successRate = selected ? getSuccessRate(currentLevel) : 0;
  const canEnchant = selected
    && currentLevel < 10
    && goldAmount.value >= goldCost
    && stoneCount >= stonesNeeded;

  const currentBonus = selected ? getEnchantBonus(currentLevel, selected.itemType) : {};
  const nextBonus = selected ? getEnchantBonus(nextLevel, selected.itemType) : {};

  const handleEnchant = () => {
    if (!selected || !canEnchant) return;
    commands.enchantItem(selected.slotIndex, selected.id);
    // Flash animation
    animState.value = 'idle';
    setTimeout(() => {
      // Will be updated by the server response via inventory update
    }, 100);
  };

  // Reset animation after a delay
  const flashClass = animState.value === 'success'
    ? 'animate-pulse ring-2 ring-green-400'
    : animState.value === 'failure'
    ? 'animate-shake ring-2 ring-red-500'
    : '';

  return (
    <div class="fixed top-20 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)] z-50">
      <PanelShell
        title="⚒️ Enchant"
        onClose={() => togglePanel('enchant')}
        width="w-[340px] max-w-full"
      >
        <div class="flex flex-col gap-2">
          {/* Item selector */}
          <div class="rounded bg-rf-surface-inset/50 border border-rf-chrome-trim/40 p-1.5">
            <div class="text-[10px] font-bold text-rf-gold uppercase mb-1">Select Item</div>
            <div class="flex flex-wrap gap-1 max-h-[88px] overflow-y-auto">
              {enchantableItems.length === 0 ? (
                <div class="text-[10px] text-rf-text-dim px-2 py-3 w-full text-center">
                  No weapons or armor in inventory
                </div>
              ) : (
                enchantableItems.map(item => (
                  <div
                    key={item.slotIndex}
                    class={`cursor-pointer rounded transition-all ${
                      selectedSlot.value === item.slotIndex
                        ? 'ring-2 ring-rf-accent scale-110'
                        : 'hover:scale-105'
                    }`}
                    onClick={() => selectedSlot.value = item.slotIndex}
                  >
                    <ItemSlot item={item} size={38} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Selected item details */}
          {selected && (
            <div class={`rounded bg-rf-surface-inset/50 border border-rf-chrome-trim/40 p-2 transition-all ${flashClass}`}>
              <div class="flex items-center gap-2 mb-1.5">
                <ItemSlot item={selected} size={36} />
                <div class="flex-1 min-w-0">
                  <div class={`text-[11px] font-bold truncate ${rarityTextClass(selected.rarity)}`}>
                    {selected.name}
                  </div>
                  <div class="text-[9px] text-rf-text-dim">
                    {rarityName(selected.rarity)} {selected.itemType} · Lv.{selected.level}
                  </div>
                  <div class="text-[10px] text-rf-accent font-bold">
                    Enchant Level: +{currentLevel}{currentLevel >= 10 ? ' (MAX)' : ''}
                  </div>
                </div>
              </div>

              {/* Stats preview */}
              {currentLevel < 10 && (
                <div class="rounded bg-rf-surface-muted/30 p-1.5 mb-1.5">
                  <div class="text-[9px] text-rf-text-dim uppercase font-bold mb-0.5">
                    +{currentLevel} → +{nextLevel} Bonus
                  </div>
                  <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {Object.keys({ ...currentBonus, ...nextBonus }).map(stat => {
                      const cur = currentBonus[stat] ?? 0;
                      const next = nextBonus[stat] ?? 0;
                      const diff = next - cur;
                      return (
                        <div key={stat} class="flex justify-between text-[10px]">
                          <span class="text-rf-text-dim">{stat}</span>
                          <span class={diff > 0 ? 'text-green-400' : 'text-rf-text'}>
                            {cur > 0 ? `+${cur}` : '0'} → <span class="font-bold">+{next}</span>
                            {diff > 0 && <span class="text-green-400 ml-0.5">(+{diff})</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cost & success rate */}
              {currentLevel < 10 && (
                <div class="flex items-center justify-between text-[10px] mb-1.5 px-0.5">
                  <div class="flex flex-col gap-0.5">
                    <span class={goldAmount.value >= goldCost ? 'text-rf-gold' : 'text-red-400'}>
                      💰 {goldCost.toLocaleString()} gold
                    </span>
                    <span class={stoneCount >= stonesNeeded ? 'text-blue-300' : 'text-red-400'}>
                      💎 {stonesNeeded} stone{stonesNeeded > 1 ? 's' : ''} (have {stoneCount})
                    </span>
                  </div>
                  <div class="text-right">
                    <div class={`text-[12px] font-bold ${
                      successRate >= 85 ? 'text-green-400' :
                      successRate >= 55 ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {successRate}%
                    </div>
                    <div class="text-rf-text-dim text-[8px]">success rate</div>
                  </div>
                </div>
              )}

              {/* Enchant button */}
              <button
                class={`w-full py-1.5 rounded text-[11px] font-bold uppercase tracking-wider transition-all ${
                  canEnchant
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-md hover:shadow-lg cursor-pointer'
                    : 'bg-rf-surface-muted text-rf-text-dim cursor-not-allowed'
                }`}
                onClick={handleEnchant}
                disabled={!canEnchant}
              >
                {currentLevel >= 10
                  ? '✨ MAX LEVEL'
                  : `⚒️ Enchant to +${nextLevel}`
                }
              </button>

              {/* Warning for risky enchants */}
              {currentLevel >= 3 && currentLevel < 10 && (
                <div class="text-[8px] text-yellow-400/80 text-center mt-1">
                  ⚠️ Failure drops enchant to +{Math.max(0, currentLevel - 1)} — materials are consumed!
                </div>
              )}
            </div>
          )}

          {/* Help text when no item selected */}
          {!selected && (
            <div class="text-[10px] text-rf-text-dim text-center py-3">
              Select a weapon or armor to enchant.<br />
              <span class="text-[9px]">Enchanting Stones drop from enemies (5% chance).</span>
            </div>
          )}
        </div>
      </PanelShell>
    </div>
  );
}
