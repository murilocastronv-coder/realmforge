import { useComputed, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { activeWorldEvent } from '../../store/GameStore';

export function ActiveWorldEventBar() {
  const event = useComputed(() => activeWorldEvent.value);
  const timeLeft = useSignal('');

  useEffect(() => {
    const interval = setInterval(() => {
      const e = activeWorldEvent.value;
      if (!e) { timeLeft.value = ''; return; }
      const remaining = Math.max(0, e.expiresAt - Date.now());
      if (remaining <= 0) {
        activeWorldEvent.value = null;
        timeLeft.value = '';
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      timeLeft.value = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!event.value) return null;

  return (
    <div class="fixed top-1 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
      <div class="flex items-center gap-2 bg-gradient-to-r from-amber-900/80 via-amber-800/90 to-amber-900/80 border border-amber-500/50 rounded-full px-4 py-1.5 shadow-lg shadow-amber-500/20">
        <span class="text-lg animate-pulse">{event.value.icon}</span>
        <span class="text-amber-200 font-bold text-sm tracking-wide uppercase">{event.value.title}</span>
        <span class="text-amber-400/70 text-xs">—</span>
        <span class="text-amber-300/80 text-xs">{event.value.description}</span>
        <span class="text-amber-400/70 text-xs">—</span>
        <span class="text-amber-100 font-mono text-sm font-bold">{timeLeft.value}</span>
      </div>
    </div>
  );
}
