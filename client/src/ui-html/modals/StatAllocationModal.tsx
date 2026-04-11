import { useSignal, useComputed } from '@preact/signals';
import { showStatAllocation, playerStats, commands } from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';

interface StatDef {
  key: string;
  label: string;
  icon: string;
  desc: string;
  perPoint: string;
}

const STATS: StatDef[] = [
  { key: 'vitality',  label: 'VIT', icon: '❤️', desc: 'Max HP',      perPoint: '+12 HP' },
  { key: 'endurance', label: 'END', icon: '💙', desc: 'Max MP',      perPoint: '+8 MP' },
  { key: 'strength',  label: 'STR', icon: '⚔️', desc: 'Attack',     perPoint: '+3 ATK' },
  { key: 'fortitude', label: 'FOR', icon: '🛡️', desc: 'Defense',    perPoint: '+3 DEF' },
  { key: 'agility',   label: 'AGI', icon: '💨', desc: 'Speed',      perPoint: '+2 SPD' },
  { key: 'fortune',   label: 'LCK', icon: '🍀', desc: 'Luck/Crit',  perPoint: '+2 LCK' },
];

/**
 * StatAllocationModal — full-screen modal for distributing stat points.
 * Replaces Phaser StatAllocation.ts (242 LOC).
 */
export function StatAllocationModal() {
  const visible = useComputed(() => showStatAllocation.value);
  const available = useComputed(() => playerStats.value.statPoints);

  // Local allocation tracking
  const allocations = useSignal<Record<string, number>>({});

  if (!visible.value || available.value <= 0) return null;

  const spent = Object.values(allocations.value).reduce((a, b) => a + b, 0);
  const remaining = available.value - spent;

  const adjust = (key: string, delta: number) => {
    const current = allocations.value[key] || 0;
    if (delta > 0 && remaining <= 0) return;
    if (delta < 0 && current <= 0) return;

    allocations.value = { ...allocations.value, [key]: current + delta };
  };

  const reset = () => {
    allocations.value = {};
  };

  const confirm = () => {
    const toSend: Record<string, number> = {};
    let total = 0;
    for (const [key, val] of Object.entries(allocations.value)) {
      if (val > 0) {
        toSend[key] = val;
        total += val;
      }
    }
    if (total === 0) return;

    commands.allocateStats(toSend);
    allocations.value = {};
    showStatAllocation.value = false;
  };

  const close = () => {
    allocations.value = {};
    showStatAllocation.value = false;
  };

  return (
    <div
      data-interactive
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60"
      onMouseEnter={() => InputGate.claimPointer('stat-allocation')}
      onMouseLeave={() => InputGate.releasePointer('stat-allocation')}
    >
      <div class="w-[320px] max-w-[calc(100vw-2rem)] rounded-lg border border-rf-border-muted bg-rf-surface/95 shadow-2xl shadow-rf-shadow/60 backdrop-blur-sm animate-panel-in">
        {/* Header */}
        <div class="flex items-center justify-between px-3 py-2 bg-rf-chrome-header rounded-t-lg border-b border-rf-chrome-trim">
          <span class="text-[12px] font-bold text-rf-gold">📊 ALLOCATE STAT POINTS</span>
          <button
            class="text-rf-text-dim hover:text-rf-danger text-sm leading-none"
            onClick={close}
          >
            ✕
          </button>
        </div>

        {/* Points available */}
        <div class="text-center py-2 text-[13px] font-bold text-rf-gold">
          🔵 Points Available: {remaining} / {available.value}
        </div>

        {/* Stat rows */}
        <div class="px-3 pb-2 space-y-0.5">
          {STATS.map((stat, i) => {
            const count = allocations.value[stat.key] || 0;
            return (
              <div
                key={stat.key}
                class={`flex items-center gap-2 px-2 py-1.5 rounded ${
                  i % 2 === 0 ? 'bg-rf-surface-muted/40' : 'bg-rf-surface-inset/30'
                }`}
              >
                {/* Icon + label */}
                <span class="text-[12px] font-bold text-rf-text w-16">
                  {stat.icon} {stat.label}
                </span>

                {/* Per-point info */}
                <span class="text-[10px] text-rf-text-dim flex-1">{stat.perPoint}</span>

                {/* Minus button */}
                <button
                  class={`w-6 h-6 flex items-center justify-center rounded border text-[14px] font-bold transition-colors ${
                    count > 0
                      ? 'text-rf-danger border-rf-danger/30 bg-rf-danger/10 hover:bg-rf-danger/20 cursor-pointer'
                      : 'text-rf-text-dim/30 border-rf-border-muted/30 cursor-not-allowed'
                  }`}
                  onClick={() => adjust(stat.key, -1)}
                  disabled={count <= 0}
                >
                  −
                </button>

                {/* Count */}
                <span class={`w-6 text-center text-[13px] font-bold ${
                  count > 0 ? 'text-rf-success' : 'text-rf-text-dim'
                }`}>
                  {count}
                </span>

                {/* Plus button */}
                <button
                  class={`w-6 h-6 flex items-center justify-center rounded border text-[14px] font-bold transition-colors ${
                    remaining > 0
                      ? 'text-rf-success border-rf-success/30 bg-rf-success/10 hover:bg-rf-success/20 cursor-pointer'
                      : 'text-rf-text-dim/30 border-rf-border-muted/30 cursor-not-allowed'
                  }`}
                  onClick={() => adjust(stat.key, 1)}
                  disabled={remaining <= 0}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        <div class="flex gap-2 px-3 py-2 border-t border-rf-chrome-trim bg-rf-chrome-header/50 rounded-b-lg">
          <button
            class={`flex-1 py-1.5 text-[11px] font-bold rounded border transition-colors ${
              spent > 0
                ? 'text-rf-success bg-rf-success/10 border-rf-success/30 hover:bg-rf-success/20'
                : 'text-rf-text-dim bg-rf-surface-muted border-rf-border-muted opacity-50 cursor-not-allowed'
            }`}
            onClick={confirm}
            disabled={spent <= 0}
          >
            ✅ CONFIRM
          </button>
          <button
            class="flex-1 py-1.5 text-[11px] font-bold text-rf-warning bg-rf-warning/10 border border-rf-warning/30 rounded hover:bg-rf-warning/20 transition-colors"
            onClick={reset}
          >
            ↩ RESET
          </button>
        </div>
      </div>
    </div>
  );
}
