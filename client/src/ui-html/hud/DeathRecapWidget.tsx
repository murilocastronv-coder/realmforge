import { signal, useComputed } from '@preact/signals';

// ─── Death Recap State ───────────────────────────────────────

export interface DamageSource {
  name: string;
  damage: number;
  type: string; // 'melee' | 'ranged' | 'magic' | 'poison' | 'fire' | etc
  isFinalBlow: boolean;
  timestamp: number;
}

export const deathRecap = signal<DamageSource[]>([]);
export const deathTimestamp = signal<number>(0);

const MAX_RECENT_SOURCES = 10;
const recentDamageSources: DamageSource[] = [];

/** Call when player takes damage (during gameplay). */
export function recordDamageSource(name: string, damage: number, type: string = 'melee'): void {
  recentDamageSources.push({ name, damage, type, isFinalBlow: false, timestamp: Date.now() });
  if (recentDamageSources.length > MAX_RECENT_SOURCES) recentDamageSources.shift();
}

/** Call when player dies — freezes the recap. */
export function freezeDeathRecap(): void {
  if (recentDamageSources.length > 0) {
    recentDamageSources[recentDamageSources.length - 1].isFinalBlow = true;
  }
  deathRecap.value = [...recentDamageSources];
  deathTimestamp.value = Date.now();
}

/** Clear on respawn. */
export function clearDeathRecap(): void {
  recentDamageSources.length = 0;
  deathRecap.value = [];
  deathTimestamp.value = 0;
}

// ─── Death Recap Widget (embedded in DeathOverlay) ───────────

export function DeathRecapWidget() {
  const recap = useComputed(() => deathRecap.value);

  if (recap.value.length === 0) return null;

  const totalDamage = recap.value.reduce((sum, s) => sum + s.damage, 0);
  const killer = recap.value.find(s => s.isFinalBlow);

  const TYPE_ICONS: Record<string, string> = {
    melee: '⚔️',
    ranged: '🏹',
    magic: '✨',
    poison: '🧪',
    fire: '🔥',
    ice: '❄️',
    lightning: '⚡',
    bleed: '🩸',
  };

  return (
    <div class="mt-4 bg-black/40 rounded-xl border border-red-500/20 px-4 py-3 max-w-[320px] mx-auto">
      <div class="text-[10px] text-red-400/80 uppercase font-bold tracking-widest text-center mb-2">
        Death Recap
      </div>

      {killer && (
        <div class="text-center mb-3">
          <div class="text-xs text-rf-muted">Killed by</div>
          <div class="text-base font-bold text-red-300">{killer.name}</div>
          <div class="text-[10px] text-rf-muted">
            {TYPE_ICONS[killer.type] || '💀'} {killer.damage} {killer.type} damage (final blow)
          </div>
        </div>
      )}

      <div class="space-y-1 max-h-[150px] overflow-y-auto">
        {recap.value.map((source, i) => {
          const pct = totalDamage > 0 ? Math.round((source.damage / totalDamage) * 100) : 0;
          return (
            <div key={i} class={`flex items-center gap-2 text-[10px] ${source.isFinalBlow ? 'text-red-300' : 'text-rf-text/80'}`}>
              <span class="w-4 text-center">{TYPE_ICONS[source.type] || '💀'}</span>
              <span class="flex-1 truncate">{source.name}</span>
              <span class="font-mono">{source.damage}</span>
              <div class="w-12 h-1 bg-rf-surface-inset rounded-full overflow-hidden">
                <div class="h-full bg-red-500/60" style={{ width: `${pct}%` }} />
              </div>
              <span class="w-8 text-right text-rf-muted">{pct}%</span>
            </div>
          );
        })}
      </div>

      <div class="mt-2 pt-2 border-t border-red-500/10 text-center">
        <span class="text-[10px] text-rf-muted">Total damage: </span>
        <span class="text-xs font-bold text-red-300">{totalDamage.toLocaleString()}</span>
      </div>
    </div>
  );
}
