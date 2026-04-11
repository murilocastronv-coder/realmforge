import { signal, useComputed, useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { rarityTextClass, rarityBorderClass } from '../lib/rarity';

// ─── Tooltip State ───────────────────────────────────────────

export interface TooltipItem {
  id?: number;
  name: string;
  rarity: number;
  type?: string;
  slot?: string;
  level?: number;
  stats?: Record<string, number>;
  description?: string;
  quantity?: number;
}

export interface TooltipData {
  item: TooltipItem;
  compareItem?: TooltipItem | null; // equipped item in same slot
  x: number;
  y: number;
}

export const itemTooltip = signal<TooltipData | null>(null);

export function showItemTooltip(item: TooltipItem, compareItem: TooltipItem | null, x: number, y: number): void {
  itemTooltip.value = { item, compareItem, x, y };
}

export function hideItemTooltip(): void {
  itemTooltip.value = null;
}

// ─── Component ──────────────────────────────────────────────

export function ItemTooltipOverlay() {
  const tooltip = useComputed(() => itemTooltip.value);
  const tooltipRef = useRef<HTMLDivElement>(null);

  if (!tooltip.value) return null;

  const { item, compareItem, x, y } = tooltip.value;
  const textClass = rarityTextClass(item.rarity);
  const borderClass = rarityBorderClass(item.rarity);

  const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  const rarityName = RARITY_NAMES[item.rarity] || 'Common';

  const statEntries = item.stats ? Object.entries(item.stats) : [];
  const compareStats = compareItem?.stats || {};

  // Position tooltip to avoid overflow
  const style: Record<string, string> = {};
  const tooltipWidth = 240;
  const tooltipHeight = 300;

  if (x + tooltipWidth + 20 > window.innerWidth) {
    style.right = `${window.innerWidth - x + 8}px`;
  } else {
    style.left = `${x + 16}px`;
  }

  if (y + tooltipHeight > window.innerHeight) {
    style.bottom = `${window.innerHeight - y + 8}px`;
  } else {
    style.top = `${y}px`;
  }

  return (
    <div class="fixed inset-0 z-[70] pointer-events-none">
      <div
        ref={tooltipRef}
        class={`absolute w-[240px] bg-rf-surface/95 border ${borderClass} rounded-lg shadow-2xl backdrop-blur-sm p-3 pointer-events-none`}
        style={style}
      >
        {/* Item name */}
        <div class={`text-sm font-bold ${textClass}`}>{item.name}</div>

        {/* Type + slot */}
        <div class="flex justify-between text-[9px] text-rf-muted mt-0.5">
          <span>{rarityName}{item.type ? ` ${item.type}` : ''}</span>
          {item.slot && <span class="capitalize">{item.slot}</span>}
        </div>

        {item.level && (
          <div class="text-[9px] text-rf-muted">Required Level: {item.level}</div>
        )}

        {/* Stats */}
        {statEntries.length > 0 && (
          <div class="mt-2 space-y-0.5 border-t border-rf-border/20 pt-2">
            {statEntries.map(([stat, value]) => {
              const compValue = compareStats[stat] || 0;
              const diff = value - compValue;
              const showDiff = compareItem != null && diff !== 0;

              return (
                <div key={stat} class="flex items-center justify-between text-[10px]">
                  <span class="text-rf-muted capitalize">{formatStatName(stat)}</span>
                  <div class="flex items-center gap-1">
                    <span class="text-rf-text font-mono">+{value}</span>
                    {showDiff && (
                      <span class={`font-mono text-[9px] ${diff > 0 ? 'text-rf-success' : 'text-rf-danger'}`}>
                        ({diff > 0 ? '+' : ''}{diff})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Stats only on equipped */}
            {compareItem && compareStats && Object.entries(compareStats).filter(([s]) => !item.stats?.[s]).map(([stat, value]) => (
              <div key={stat} class="flex items-center justify-between text-[10px]">
                <span class="text-rf-muted capitalize">{formatStatName(stat)}</span>
                <div class="flex items-center gap-1">
                  <span class="text-rf-text/40 font-mono line-through">+{value}</span>
                  <span class="font-mono text-[9px] text-rf-danger">(-{value})</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Description */}
        {item.description && (
          <div class="mt-2 text-[10px] text-rf-muted italic border-t border-rf-border/10 pt-1.5">
            "{item.description}"
          </div>
        )}

        {/* Quantity */}
        {item.quantity && item.quantity > 1 && (
          <div class="text-[9px] text-rf-muted mt-1">Quantity: {item.quantity}</div>
        )}

        {/* Compare label */}
        {compareItem && (
          <div class="mt-2 pt-1 border-t border-rf-border/10 text-[8px] text-rf-muted text-center">
            Compared to equipped: <span class={textClass}>{compareItem.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatStatName(stat: string): string {
  return stat
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
}
