import { useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { effect as signalEffect } from '@preact/signals';
import { contextMenu } from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';

/**
 * ContextMenu — global right-click context menu.
 * Driven by contextMenu signal in GameStore.
 */
export function ContextMenu() {
  const menu = useComputed(() => contextMenu.value);
  const ref = useRef<HTMLDivElement>(null);

  // Close on any click outside or Escape
  useEffect(() => {
    const handleClick = () => { contextMenu.value = null; };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') contextMenu.value = null; };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Manage pointer claim
  useEffect(() => {
    return signalEffect(() => {
      if (contextMenu.value) {
        InputGate.claimPointer('context-menu');
      } else {
        InputGate.releasePointer('context-menu');
      }
    });
  }, []);

  if (!menu.value) return null;

  const { x, y, items } = menu.value;

  return (
    <div
      ref={ref}
      data-interactive
      class="fixed z-[100] animate-panel-in"
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div class="bg-rf-surface border border-rf-border/60 rounded-lg shadow-2xl py-1 min-w-[140px] overflow-hidden">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.action();
              contextMenu.value = null;
            }}
            class={`
              w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
              transition-colors duration-100
              ${item.disabled
                ? 'text-rf-muted/50 cursor-not-allowed'
                : 'text-rf-text hover:bg-rf-accent/20 hover:text-rf-accent cursor-pointer'
              }
            `}
          >
            <span class="text-base w-5 text-center">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
