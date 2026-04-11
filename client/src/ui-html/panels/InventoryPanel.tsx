import { useComputed, useSignal } from '@preact/signals';
import { inventory, gold, equipment, openPanels, togglePanel, commands } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';
import { ItemSlot } from '../components/ItemSlot';
import { showItemTooltip, hideItemTooltip } from '../hud/ItemTooltipOverlay';
import type { SlottedGameItem, GameItem, EquipmentSlotId } from '../../types/gameData';

const COLS = 8;
const ROWS = 5;

type SortMode = 'none' | 'rarity' | 'type' | 'name';

/**
 * InventoryPanel — grid-based inventory with sorting, filtering, and item comparison.
 */
export function InventoryPanel() {
  const isOpen = useComputed(() => openPanels.value.has('inventory'));
  const items = useComputed(() => inventory.value);
  const goldAmount = useComputed(() => gold.value);
  const equip = useComputed(() => equipment.value);
  const sortMode = useSignal<SortMode>('none');
  const searchFilter = useSignal('');

  if (!isOpen.value) return null;

  // Sort items (non-null first, maintain slot awareness)
  const sortedItems = useComputed(() => {
    const raw = [...items.value];
    if (sortMode.value === 'none' && !searchFilter.value) return raw;

    const nonNull = raw.filter(Boolean) as SlottedGameItem[];
    const nullCount = raw.length - nonNull.length;

    // Filter
    let filtered = nonNull;
    if (searchFilter.value) {
      const q = searchFilter.value.toLowerCase();
      filtered = nonNull.filter(item => item.name?.toLowerCase().includes(q));
    }

    // Sort
    if (sortMode.value === 'rarity') {
      filtered.sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0));
    } else if (sortMode.value === 'type') {
      filtered.sort((a, b) => (a.itemType || '').localeCompare(b.itemType || ''));
    } else if (sortMode.value === 'name') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    // Rebuild slotted grid
    const result: (SlottedGameItem | null)[] = filtered.map((item, i) => ({ ...item, slotIndex: i }));
    while (result.length < COLS * ROWS) result.push(null);
    return result;
  });

  const handleSlotClick = (index: number) => {
    const item = sortedItems.value[index];
    if (!item) return;

    if (openPanels.value.has('bank')) {
      commands.bankDeposit(item.slotIndex);
    } else if (item.slot) {
      commands.equipItem(item.slotIndex);
    } else if (item.itemType === 'Consumable') {
      commands.useItem(item.slotIndex);
    }
  };

  const handleItemHover = (index: number, event: MouseEvent) => {
    const item = sortedItems.value[index];
    if (!item) { hideItemTooltip(); return; }

    // Find equipped item in same slot for comparison
    let compareItem: GameItem | null = null;
    if (item.slot && equip.value) {
      compareItem = equip.value.get(item.slot as EquipmentSlotId) || null;
    }

    showItemTooltip(
      {
        name: item.name || 'Unknown',
        rarity: item.rarity ?? 0,
        type: item.itemType,
        slot: item.slot || undefined,
        stats: item.stats,
        description: item.description,
        quantity: item.quantity,
      },
      compareItem ? {
        name: compareItem.name || 'Unknown',
        rarity: compareItem.rarity ?? 0,
        stats: compareItem.stats,
      } : null,
      event.clientX,
      event.clientY,
    );
  };

  return (
    <div class="fixed top-20 right-4">
      <PanelShell
        title="🎒 Inventory"
        onClose={() => togglePanel('inventory')}
        width="w-auto"
      >
        {/* Sort & filter bar */}
        <div class="flex items-center gap-1 mb-2">
          <input
            type="text"
            placeholder="🔍 Search..."
            class="flex-1 bg-rf-surface-inset/50 border border-rf-border/20 rounded px-2 py-0.5 text-[10px] text-rf-text placeholder:text-rf-muted/40 outline-none focus:border-rf-accent/40"
            value={searchFilter.value}
            onInput={(e) => { searchFilter.value = (e.target as HTMLInputElement).value; }}
          />
          {(['none', 'rarity', 'type', 'name'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              class={`px-1.5 py-0.5 text-[8px] rounded ${
                sortMode.value === mode
                  ? 'bg-rf-accent/20 text-rf-accent border border-rf-accent/30'
                  : 'text-rf-muted hover:text-rf-text border border-transparent'
              }`}
              onClick={() => { sortMode.value = mode; }}
            >
              {mode === 'none' ? '⟳' : mode === 'rarity' ? '💎' : mode === 'type' ? '📦' : '🔤'}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div
          class="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${COLS}, 40px)` }}
        >
          {Array.from({ length: COLS * ROWS }, (_, i) => (
            <ItemSlot
              key={i}
              item={sortedItems.value[i] ?? null}
              onClick={() => handleSlotClick(i)}
              onMouseMove={(e: MouseEvent) => handleItemHover(i, e)}
              onMouseLeave={hideItemTooltip}
            />
          ))}
        </div>

        {/* Gold footer */}
        <div class="mt-1.5 px-1 py-1 rounded bg-rf-surface-muted/60 border border-rf-chrome-trim/40 flex justify-between items-center">
          <span class="text-[11px] text-rf-gold font-bold">
            💰 {goldAmount.value.toLocaleString()} Gold
          </span>
          <span class="text-[9px] text-rf-muted">
            {items.value.filter(Boolean).length}/{COLS * ROWS}
          </span>
        </div>
      </PanelShell>
    </div>
  );
}
