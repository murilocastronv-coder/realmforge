import { useComputed, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { activeEffects, type ActiveEffect } from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';

/**
 * BuffBar — shows active status effects with countdown timers.
 * Displayed below the StatsBar HUD.
 */
export function BuffBar() {
  const effects = useComputed(() => activeEffects.value);
  const now = useSignal(Date.now());

  // Tick timer for countdown
  useEffect(() => {
    const interval = setInterval(() => { now.value = Date.now(); }, 250);
    return () => clearInterval(interval);
  }, []);

  if (effects.value.size === 0) return null;

  const sorted = Array.from(effects.value.values()).sort((a, b) => {
    if (a.isBuff !== b.isBuff) return a.isBuff ? 1 : -1; // debuffs first
    return a.appliedAt - b.appliedAt;
  });

  return (
    <div
      data-interactive
      class="fixed top-[140px] left-4 flex flex-wrap gap-1 max-w-[184px]"
      onMouseEnter={() => InputGate.claimPointer('buff-bar')}
      onMouseLeave={() => InputGate.releasePointer('buff-bar')}
    >
      {sorted.map(effect => (
        <EffectIcon key={effect.type} effect={effect} now={now.value} />
      ))}
    </div>
  );
}

function EffectIcon({ effect, now }: { effect: ActiveEffect; now: number }) {
  const elapsed = now - effect.appliedAt;
  const remaining = Math.max(0, effect.remainingMs - elapsed);
  const secs = Math.ceil(remaining / 1000);
  const progress = effect.remainingMs > 0 ? remaining / effect.remainingMs : 1;

  const borderColor = effect.isBuff ? 'border-rf-success/60' : 'border-rf-danger/60';
  const bgColor = effect.isBuff ? 'bg-rf-success/10' : 'bg-rf-danger/10';

  return (
    <div
      class={`relative w-8 h-8 rounded border ${borderColor} ${bgColor} flex items-center justify-center cursor-default`}
      title={`${effect.type} — ${secs}s remaining`}
    >
      <span class="text-sm">{effect.icon}</span>
      {/* Countdown overlay */}
      <span class="absolute bottom-0 left-0 right-0 text-center text-[8px] font-bold text-rf-text leading-none pb-px">
        {secs}s
      </span>
      {/* Progress ring (bottom border) */}
      <div
        class={`absolute bottom-0 left-0 h-[2px] rounded-b ${effect.isBuff ? 'bg-rf-success' : 'bg-rf-danger'} transition-all duration-250`}
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
