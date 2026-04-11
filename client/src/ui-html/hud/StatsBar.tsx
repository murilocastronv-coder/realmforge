import { useComputed, useSignal } from '@preact/signals';
import { playerStats, hpRatio, mpRatio, xpRatio, equipment, openPanels, togglePanel, hasStatPoints, currentWeather } from '../../store/GameStore';
import { getItemStats } from '../../types/gameData';
import { InputGate } from '../../services/InputGate';

/**
 * StatsBar — HUD showing HP/MP/XP bars, level, and expandable attributes.
 * Replaces Phaser Stats.ts (204 LOC).
 */
export function StatsBar() {
  const stats = useComputed(() => playerStats.value);
  const hp = useComputed(() => hpRatio.value);
  const mp = useComputed(() => mpRatio.value);
  const xp = useComputed(() => xpRatio.value);
  const showStats = useComputed(() => openPanels.value.has('stats'));
  const statPoints = useComputed(() => hasStatPoints.value);

  const hpBarColor = hp.value > 0.5 ? 'bg-rf-health-high' : hp.value > 0.25 ? 'bg-rf-health-mid' : 'bg-rf-health-low';
  const hpLow = hp.value <= 0.25;
  const mpLow = mp.value <= 0.15;

  const equipBonuses = useComputed(() => {
    const totals: Record<string, number> = {};
    for (const item of equipment.value.values()) {
      for (const [key, value] of Object.entries(getItemStats(item))) {
        totals[key] = (totals[key] || 0) + value;
      }
    }
    return totals;
  });

  return (
    <div
      data-interactive
      class="fixed top-4 left-4 w-[184px] flex flex-col gap-1"
      onMouseEnter={() => InputGate.claimPointer('stats-hud')}
      onMouseLeave={() => InputGate.releasePointer('stats-hud')}
    >
      {/* Vitals panel */}
      <div
        class="rounded border border-rf-border-muted bg-rf-surface/90 backdrop-blur-sm shadow shadow-rf-shadow/40 cursor-pointer"
        onClick={() => togglePanel('stats')}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-2 py-1 bg-rf-chrome-header rounded-t border-b border-rf-chrome-trim">
          <span class="text-[10px] font-bold tracking-wider text-rf-gold uppercase">Vitals</span>
          <span class="text-[11px] font-bold text-rf-gold level-badge">⭐ Lv.{stats.value.level}</span>
          <span class="text-[10px] text-slate-400" title={`Weather: ${currentWeather.value.weather}`}>{currentWeather.value.icon}</span>
        </div>

        {/* Bars */}
        <div class="px-2 py-1.5 space-y-1.5">
          {/* HP Bar */}
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] font-bold text-rf-text-secondary w-5">HP</span>
            <div class={`flex-1 h-2.5 bg-rf-hp-bg rounded-sm overflow-hidden border border-rf-chrome-trim/60 ${hpLow ? 'animate-bar-pulse' : ''}`}>
              <div
                class={`h-full ${hpBarColor} hp-bar-fill transition-all duration-500 ease-out`}
                style={{ width: `${hp.value * 100}%` }}
              />
            </div>
            <span class="text-[9px] font-mono text-rf-text-secondary min-w-[52px] text-right">
              {stats.value.hp}/{stats.value.maxHp}
            </span>
          </div>

          {/* MP Bar */}
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] font-bold text-rf-text-secondary w-5">MP</span>
            <div class={`flex-1 h-2.5 bg-rf-mp-bg rounded-sm overflow-hidden border border-rf-chrome-trim/60 ${mpLow ? 'animate-bar-pulse' : ''}`}>
              <div
                class="h-full bg-rf-mp mp-bar-fill transition-all duration-500 ease-out"
                style={{ width: `${mp.value * 100}%` }}
              />
            </div>
            <span class="text-[9px] font-mono text-rf-text-secondary min-w-[52px] text-right">
              {stats.value.mp}/{stats.value.maxMp}
            </span>
          </div>

          {/* XP Bar */}
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] font-bold text-rf-text-secondary w-5">XP</span>
            <div class="flex-1 h-2 bg-rf-xp-bg rounded-sm overflow-hidden border border-rf-chrome-trim/60">
              <div
                class="h-full bg-rf-xp transition-all duration-300"
                style={{ width: `${xp.value * 100}%` }}
              />
            </div>
            <span class="text-[8px] font-mono text-rf-text-dim min-w-[52px] text-right">
              {stats.value.xp.toLocaleString()}/{stats.value.xpNeeded.toLocaleString()}
            </span>
          </div>

          {statPoints.value && (
            <div class="text-[10px] text-rf-accent font-bold animate-pulse text-center">
              🔵 {stats.value.statPoints} stat points available!
            </div>
          )}
        </div>
      </div>

      {/* Expanded attributes panel */}
      {showStats.value && (
        <div class="rounded border border-rf-border-muted bg-rf-surface/90 backdrop-blur-sm shadow shadow-rf-shadow/40">
          <div class="flex items-center justify-between px-2 py-1 bg-rf-chrome-header rounded-t border-b border-rf-chrome-trim">
            <span class="text-[10px] font-bold tracking-wider text-rf-gold uppercase">Attributes</span>
            <button
              class="text-rf-text-dim hover:text-rf-danger text-[10px] leading-none"
              onClick={(e) => { e.stopPropagation(); togglePanel('stats'); }}
            >
              ✕
            </button>
          </div>
          <div class="px-2 py-1.5 space-y-0.5 text-[11px]">
            <div class="text-rf-text-muted">
              Class: <span class="text-rf-text font-semibold">
                {stats.value.playerClass.charAt(0).toUpperCase() + stats.value.playerClass.slice(1)}
              </span>
            </div>
            <div class="text-rf-text-muted">
              ATK: <span class="text-rf-text">{stats.value.atk}</span>
              {equipBonuses.value.ATK ? <span class="text-rf-success"> (+{equipBonuses.value.ATK})</span> : null}
            </div>
            <div class="text-rf-text-muted">
              DEF: <span class="text-rf-text">{stats.value.def}</span>
              {equipBonuses.value.DEF ? <span class="text-rf-success"> (+{equipBonuses.value.DEF})</span> : null}
            </div>
            <div class="text-rf-text-muted">
              SPD: <span class="text-rf-text">{stats.value.spd}</span>
              {equipBonuses.value.SPD ? <span class="text-rf-success"> (+{equipBonuses.value.SPD})</span> : null}
            </div>
            <div class="text-rf-text-muted">
              LCK: <span class="text-rf-text">{stats.value.lck}</span>
              {equipBonuses.value.LCK ? <span class="text-rf-success"> (+{equipBonuses.value.LCK})</span> : null}
            </div>
            <div class="text-rf-text-dim text-[10px]">
              Crit: {(5 + stats.value.lck * 0.1).toFixed(1)}%
            </div>
            {stats.value.statPoints > 0 && (
              <div class="text-rf-accent font-bold mt-1">
                🔵 Stat Points: {stats.value.statPoints}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
