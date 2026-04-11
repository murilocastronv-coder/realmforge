import { useComputed } from '@preact/signals';
import { bankItems, openPanels, togglePanel, commands } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';
import { ItemSlot } from '../components/ItemSlot';

const COLS = 10;
const ROWS = 8;

/**
 * BankPanel — safe storage grid.
 * Replaces Phaser Bank.ts (183 LOC).
 */
export function BankPanel() {
  const isOpen = useComputed(() => openPanels.value.has('bank'));
  const items = useComputed(() => bankItems.value);

  if (!isOpen.value) return null;

  const handleSlotClick = (index: number) => {
    const item = items.value[index];
    if (item) {
      commands.bankWithdraw(index);
    }
  };

  return (
    <div class="fixed top-20 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)]">
      <PanelShell
        title="Bank"
        onClose={() => togglePanel('bank')}
        width="w-auto"
      >
        {/* Notice */}
        <div class="px-2 py-1 mb-1.5 rounded bg-rf-surface-muted/60 border border-rf-chrome-trim/40">
          <span class="text-[10px] text-rf-gold font-bold">
            Safe storage · items persist on death
          </span>
        </div>

        {/* Grid */}
        <div
          class="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${COLS}, 36px)` }}
        >
          {Array.from({ length: COLS * ROWS }, (_, i) => (
            <ItemSlot
              key={i}
              item={items.value[i] ?? null}
              size={36}
              onClick={() => handleSlotClick(i)}
            />
          ))}
        </div>
      </PanelShell>
    </div>
  );
}
