import { useComputed } from '@preact/signals';
import { isDead, deathInfo } from '../../store/GameStore';
import { useEffect, useState } from 'preact/hooks';
import { DeathRecapWidget } from '../hud/DeathRecapWidget';

/**
 * DeathOverlay — Full-screen death screen with respawn countdown + death recap.
 */
export function DeathOverlay() {
  const info = useComputed(() => deathInfo.value);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const seconds = Math.ceil((info.value.respawnIn || 5000) / 1000);
    setCountdown(seconds);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [info.value.respawnIn]);

  return (
    <div
      data-interactive
      class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 animate-overlay-fade animate-death-vignette"
    >
      <div class="text-center">
        <div class="text-4xl font-black text-rf-danger mb-3 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]" style="animation: float 2s ease-in-out infinite">
          ☠ YOU DIED
        </div>

        {info.value.killedBy && (
          <div class="text-sm text-rf-text-muted mb-4">
            Killed by <span class="text-rf-coral font-semibold">{info.value.killedBy}</span>
          </div>
        )}

        <div class="text-lg text-rf-gold mb-2">
          Respawning in <span class="font-bold text-rf-warning">{countdown}</span>s
        </div>

        <div class="w-48 h-1.5 mx-auto rounded-full bg-rf-surface overflow-hidden">
          <div
            class="h-full bg-rf-danger rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / 5) * 100}%` }}
          />
        </div>

        <DeathRecapWidget />

        <div class="mt-4 text-xs text-rf-text-dim">
          Items dropped on the ground can be recovered
        </div>
      </div>
    </div>
  );
}
