import { useComputed } from '@preact/signals';
import { worldEvent } from '../../store/GameStore';

/**
 * WorldEventBanner — dramatic top-center slide-in for world events.
 * "Boss spawned!", "Invasion begins!", "Treasure discovered!" etc.
 */
export function WorldEventBanner() {
  const event = useComputed(() => worldEvent.value);

  if (!event.value) return null;

  return (
    <div class="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-world-event">
      <div class="bg-gradient-to-r from-rf-bg/0 via-rf-surface/95 to-rf-bg/0 border-y border-rf-accent/40 px-12 py-3 text-center min-w-[300px]">
        <div class="flex items-center justify-center gap-3">
          <span class="text-3xl">{event.value.icon}</span>
          <div>
            <div class="text-lg font-bold text-rf-warning tracking-wider uppercase">
              {event.value.title}
            </div>
            {event.value.subtitle && (
              <div class="text-xs text-rf-muted mt-0.5">{event.value.subtitle}</div>
            )}
          </div>
          <span class="text-3xl">{event.value.icon}</span>
        </div>
      </div>
    </div>
  );
}
