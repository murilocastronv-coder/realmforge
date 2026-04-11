import { useComputed } from '@preact/signals';
import { entityTooltip } from '../../store/GameStore';

/**
 * EntityTooltip — floating tooltip near hovered entity.
 * Data is set by GameScene pointer-move handler.
 */
export function EntityTooltip() {
  const tooltip = useComputed(() => entityTooltip.value);

  if (!tooltip.value) return null;

  const { name, level, hp, maxHp, type, screenX, screenY } = tooltip.value;
  const hpPct = hp !== undefined && maxHp ? Math.round((hp / maxHp) * 100) : null;

  const typeColor = type === 'enemy' ? 'text-rf-danger' : type === 'player' ? 'text-blue-400' : 'text-rf-warning';
  const typeIcon = type === 'enemy' ? '⚔️' : type === 'player' ? '👤' : '💬';

  return (
    <div
      class="fixed z-50 pointer-events-none animate-panel-in"
      style={{ left: `${screenX + 16}px`, top: `${screenY - 10}px` }}
    >
      <div class="bg-rf-surface/95 border border-rf-border/60 rounded-lg px-3 py-2 shadow-lg min-w-[120px]">
        <div class="flex items-center gap-1.5">
          <span class="text-sm">{typeIcon}</span>
          <span class={`font-bold text-sm ${typeColor}`}>{name}</span>
          {level !== undefined && (
            <span class="text-[10px] text-rf-muted ml-auto">Lv.{level}</span>
          )}
        </div>
        {hpPct !== null && (
          <div class="mt-1">
            <div class="w-full h-1.5 bg-rf-bg rounded-full overflow-hidden">
              <div
                class={`h-full rounded-full transition-all duration-200 ${
                  hpPct > 50 ? 'bg-rf-success' : hpPct > 25 ? 'bg-rf-warning' : 'bg-rf-danger'
                }`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <div class="text-[9px] text-rf-muted mt-0.5 text-right">
              {hp}/{maxHp}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
