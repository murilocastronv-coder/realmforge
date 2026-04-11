import { signal, useComputed, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { PanelShell } from '../components/PanelShell';
import { InputGate } from '../../services/InputGate';

// ─── Combat Log State ────────────────────────────────────────

export type CombatLogType = 'damage_dealt' | 'damage_taken' | 'heal' | 'miss' | 'crit' | 'kill' | 'death' | 'effect' | 'system';

export interface CombatLogEntry {
  id: number;
  time: number;
  type: CombatLogType;
  message: string;
  amount?: number;
}

let nextLogId = 1;
const MAX_LOG_ENTRIES = 500;

export const combatLog = signal<CombatLogEntry[]>([]);

// DPS tracking
const combatStartTime = signal<number>(0);
const totalDamageDealt = signal<number>(0);
const totalDamageTaken = signal<number>(0);
const totalHealing = signal<number>(0);
const killCount = signal<number>(0);
const critCount = signal<number>(0);
const hitCount = signal<number>(0);

const LOG_COLORS: Record<CombatLogType, string> = {
  damage_dealt: 'text-orange-300',
  damage_taken: 'text-red-400',
  heal: 'text-green-400',
  miss: 'text-rf-muted',
  crit: 'text-yellow-300',
  kill: 'text-yellow-400',
  death: 'text-red-500',
  effect: 'text-purple-300',
  system: 'text-rf-accent',
};

/** Add a combat log entry. */
export function addCombatLog(type: CombatLogType, message: string, amount?: number): void {
  const entry: CombatLogEntry = { id: nextLogId++, time: Date.now(), type, message, amount };
  const list = [...combatLog.value, entry];
  if (list.length > MAX_LOG_ENTRIES) list.splice(0, list.length - MAX_LOG_ENTRIES);
  combatLog.value = list;

  // Track stats
  if (combatStartTime.value === 0) combatStartTime.value = Date.now();
  if (type === 'damage_dealt' && amount) { totalDamageDealt.value += amount; hitCount.value++; }
  if (type === 'damage_taken' && amount) totalDamageTaken.value += amount;
  if (type === 'heal' && amount) totalHealing.value += amount;
  if (type === 'kill') killCount.value++;
  if (type === 'crit') { critCount.value++; hitCount.value++; if (amount) totalDamageDealt.value += amount; }
}

export function resetCombatStats(): void {
  combatStartTime.value = 0;
  totalDamageDealt.value = 0;
  totalDamageTaken.value = 0;
  totalHealing.value = 0;
  killCount.value = 0;
  critCount.value = 0;
  hitCount.value = 0;
}

// ─── Combat Log Panel ───────────────────────────────────────

interface CombatLogPanelProps {
  onClose: () => void;
}

export function CombatLogPanel({ onClose }: CombatLogPanelProps) {
  const activeTab = useSignal<'log' | 'stats'>('log');
  const filter = useSignal<CombatLogType | 'all'>('all');

  const filtered = useComputed(() => {
    const f = filter.value;
    if (f === 'all') return combatLog.value;
    return combatLog.value.filter(e => e.type === f);
  });

  const dps = useComputed(() => {
    const elapsed = combatStartTime.value > 0 ? (Date.now() - combatStartTime.value) / 1000 : 0;
    return elapsed > 0 ? Math.round(totalDamageDealt.value / elapsed) : 0;
  });

  const critRate = useComputed(() => {
    return hitCount.value > 0 ? Math.round((critCount.value / hitCount.value) * 100) : 0;
  });

  return (
    <PanelShell title="📜 Combat Log" onClose={onClose} width="w-[400px] max-w-[calc(100vw-2rem)]">
      {/* Tabs */}
      <div class="flex gap-1 mb-2 border-b border-rf-border/20 pb-2">
        <button
          type="button"
          class={`px-3 py-1 text-[10px] font-bold uppercase rounded ${activeTab.value === 'log' ? 'bg-rf-accent/20 text-rf-accent' : 'text-rf-muted hover:text-rf-text'}`}
          onClick={() => { activeTab.value = 'log'; }}
        >
          Log
        </button>
        <button
          type="button"
          class={`px-3 py-1 text-[10px] font-bold uppercase rounded ${activeTab.value === 'stats' ? 'bg-rf-accent/20 text-rf-accent' : 'text-rf-muted hover:text-rf-text'}`}
          onClick={() => { activeTab.value = 'stats'; }}
        >
          Stats
        </button>
      </div>

      {activeTab.value === 'log' && (
        <>
          {/* Filters */}
          <div class="flex gap-1 mb-2 flex-wrap">
            {(['all', 'damage_dealt', 'damage_taken', 'heal', 'crit', 'kill', 'miss'] as const).map(f => (
              <button
                key={f}
                type="button"
                class={`px-2 py-0.5 text-[9px] rounded ${filter.value === f ? 'bg-rf-accent/20 text-rf-accent' : 'text-rf-muted hover:text-rf-text'}`}
                onClick={() => { filter.value = f; }}
              >
                {f === 'all' ? 'All' : f.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Log entries */}
          <div class="space-y-0.5 max-h-[40vh] overflow-y-auto pr-1 font-mono text-[10px]">
            {filtered.value.length === 0 && (
              <div class="text-rf-muted text-center py-8">No combat events yet.</div>
            )}
            {filtered.value.slice(-100).map(entry => (
              <div key={entry.id} class={`flex gap-2 py-0.5 ${LOG_COLORS[entry.type]}`}>
                <span class="text-rf-muted/50 flex-shrink-0">{formatTime(entry.time)}</span>
                <span>{entry.message}</span>
                {entry.amount != null && <span class="text-rf-muted ml-auto">({entry.amount})</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab.value === 'stats' && (
        <div class="space-y-3">
          {/* DPS Meter */}
          <div class="bg-rf-surface-inset/50 rounded-lg px-4 py-3 text-center">
            <div class="text-[10px] text-rf-muted uppercase">DPS</div>
            <div class="text-2xl font-bold text-orange-300">{dps.value}</div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <StatBox label="Damage Dealt" value={totalDamageDealt.value.toLocaleString()} color="text-orange-300" />
            <StatBox label="Damage Taken" value={totalDamageTaken.value.toLocaleString()} color="text-red-400" />
            <StatBox label="Healing Done" value={totalHealing.value.toLocaleString()} color="text-green-400" />
            <StatBox label="Kills" value={killCount.value.toString()} color="text-yellow-400" />
            <StatBox label="Crit Rate" value={`${critRate.value}%`} color="text-yellow-300" />
            <StatBox label="Total Hits" value={hitCount.value.toLocaleString()} color="text-rf-text" />
          </div>

          <div class="flex justify-center pt-2">
            <button
              type="button"
              class="px-3 py-1 text-[10px] text-rf-danger border border-rf-danger/30 rounded hover:bg-rf-danger/10 transition-colors"
              onClick={resetCombatStats}
            >
              Reset Stats
            </button>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div class="bg-rf-surface-inset/30 rounded px-3 py-2 text-center">
      <div class="text-[9px] text-rf-muted uppercase">{label}</div>
      <div class={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

// ─── Compact HUD Widget ─────────────────────────────────────

export function CombatLogMini() {
  const recent = useComputed(() => combatLog.value.slice(-3));

  if (recent.value.length === 0) return null;

  return (
    <div class="fixed bottom-[140px] left-4 w-[240px] pointer-events-none">
      <div class="space-y-0.5 font-mono text-[9px] opacity-60">
        {recent.value.map(entry => (
          <div key={entry.id} class={`${LOG_COLORS[entry.type]} truncate`}>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}
