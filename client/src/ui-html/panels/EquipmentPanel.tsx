import { useComputed } from '@preact/signals';
import { equipment, openPanels, togglePanel, commands } from '../../store/GameStore';
import { getItemStats, type EquipmentSlotId, type GameItem } from '../../types/gameData';
import { PanelShell } from '../components/PanelShell';
import { ItemSlot } from '../components/ItemSlot';

const EQUIP_SLOTS: ReadonlyArray<{ id: EquipmentSlotId; label: string; row: number; col: number }> = [
  { id: 'helmet',  label: 'Head',  row: 0, col: 1 },
  { id: 'amulet',  label: 'Amul',  row: 0, col: 2 },
  { id: 'cape',    label: 'Cape',  row: 1, col: 0 },
  { id: 'armor',   label: 'Chest', row: 1, col: 1 },
  { id: 'shield',  label: 'Off',   row: 1, col: 2 },
  { id: 'weapon',  label: 'Wpn',   row: 2, col: 0 },
  { id: 'legs',    label: 'Legs',  row: 2, col: 1 },
  { id: 'ring1',   label: 'Ring',  row: 2, col: 2 },
  { id: 'boots',   label: 'Boots', row: 3, col: 1 },
  { id: 'ring2',   label: 'Ring',  row: 3, col: 2 },
];

/**
 * EquipmentPanel — character equipment with 10 named slots.
 * Replaces Phaser Equipment.ts (224 LOC).
 */
export function EquipmentPanel() {
  const isOpen = useComputed(() => openPanels.value.has('equipment'));
  const equipped = useComputed(() => equipment.value);

  if (!isOpen.value) return null;

  const totalStats = (): Record<string, number> => {
    const totals: Record<string, number> = {};
    for (const item of equipped.value.values()) {
      for (const [key, value] of Object.entries(getItemStats(item))) {
        totals[key] = (totals[key] || 0) + value;
      }
    }
    return totals;
  };

  const stats = totalStats();
  const statEntries = Object.entries(stats);

  // Build a 4x3 grid (row x col), slots positioned accordingly
  const grid: (typeof EQUIP_SLOTS[number] | null)[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 3 }, () => null)
  );
  for (const slot of EQUIP_SLOTS) {
    grid[slot.row][slot.col] = slot;
  }

  return (
    <div class="fixed top-20 right-[380px] max-[800px]:right-4 max-[800px]:top-auto max-[800px]:bottom-20">
      <PanelShell
        title="Equipment"
        onClose={() => togglePanel('equipment')}
        width="w-auto"
      >
        {/* Slot grid */}
        <div class="grid grid-cols-3 gap-1 mb-2">
          {grid.flat().map((slot, i) => {
            if (!slot) {
              return <div key={i} class="w-10 h-10" />;
            }
            const item: GameItem | null = equipped.value.get(slot.id) ?? null;
            return (
              <ItemSlot
                key={slot.id}
                item={item}
                label={slot.label}
                onClick={() => {
                  if (item) commands.unequipItem(slot.id);
                }}
              />
            );
          })}
        </div>

        {/* Stat bonuses */}
        <div class="px-1 py-1.5 rounded bg-rf-surface-muted/60 border border-rf-chrome-trim/40">
          <div class="text-[10px] font-bold text-rf-gold uppercase mb-0.5">Bonuses</div>
          {statEntries.length > 0 ? (
            <div class="space-y-0 text-[11px]">
              {statEntries.map(([key, value]) => (
                <div key={key} class="text-rf-text-secondary">
                  {key}: <span class="text-rf-success">+{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div class="text-[10px] text-rf-text-dim">No equipment bonuses</div>
          )}
        </div>
      </PanelShell>
    </div>
  );
}
