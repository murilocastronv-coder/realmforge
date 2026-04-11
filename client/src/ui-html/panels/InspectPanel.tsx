import { signal, useComputed } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { ItemSlot } from '../components/ItemSlot';
import { InputGate } from '../../services/InputGate';
import type { GameItem, EquipmentSlotId } from '../../types/gameData';

// ─── Inspect State ───────────────────────────────────────────

export interface InspectedPlayer {
  id: string;
  name: string;
  level: number;
  playerClass: string;
  title?: string;
  guild?: string;
  equipment: Map<EquipmentSlotId, GameItem>;
  stats?: {
    strength?: number;
    agility?: number;
    intelligence?: number;
    vitality?: number;
    wisdom?: number;
    luck?: number;
  };
}

export const inspectedPlayer = signal<InspectedPlayer | null>(null);

export function inspectPlayer(player: InspectedPlayer): void {
  inspectedPlayer.value = player;
}

export function closeInspect(): void {
  inspectedPlayer.value = null;
}

// ─── Inspect Panel ──────────────────────────────────────────

const EQUIPMENT_LAYOUT: { slot: EquipmentSlotId; label: string; icon: string }[] = [
  { slot: 'helmet', label: 'Helmet', icon: '🪖' },
  { slot: 'armor', label: 'Armor', icon: '🦺' },
  { slot: 'legs', label: 'Legs', icon: '👖' },
  { slot: 'boots', label: 'Boots', icon: '👢' },
  { slot: 'weapon', label: 'Weapon', icon: '⚔️' },
  { slot: 'shield', label: 'Shield', icon: '🛡️' },
  { slot: 'ring1', label: 'Ring', icon: '💍' },
  { slot: 'amulet', label: 'Amulet', icon: '📿' },
];

export function InspectPanel() {
  const player = useComputed(() => inspectedPlayer.value);

  if (!player.value) return null;

  const p = player.value;
  const classIcon = p.playerClass === 'warrior' ? '⚔️' : p.playerClass === 'mage' ? '🧙' : p.playerClass === 'rogue' ? '🗡️' : '👤';

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <PanelShell title={`🔍 ${p.name}`} onClose={closeInspect} width="w-[360px] max-w-[calc(100vw-2rem)]">
        {/* Player header */}
        <div class="flex items-center gap-3 mb-3 pb-3 border-b border-rf-border/20">
          <div class="w-14 h-14 rounded-lg bg-gradient-to-br from-rf-accent/30 to-rf-accent/10 border border-rf-accent/30 flex items-center justify-center text-3xl">
            {classIcon}
          </div>
          <div>
            <div class="text-sm font-bold text-rf-text">{p.name}</div>
            {p.title && <div class="text-[9px] text-rf-accent italic">{p.title}</div>}
            <div class="text-[10px] text-rf-muted capitalize">Level {p.level} {p.playerClass}</div>
            {p.guild && <div class="text-[9px] text-rf-violet">&lt;{p.guild}&gt;</div>}
          </div>
        </div>

        {/* Equipment */}
        <div class="text-[9px] text-rf-muted uppercase font-bold tracking-wider mb-2">Equipment</div>
        <div class="grid grid-cols-4 gap-1.5 mb-3">
          {EQUIPMENT_LAYOUT.map(({ slot, label, icon }) => {
            const item = p.equipment.get(slot);
            return (
              <div key={slot} class="text-center">
                {item ? (
                  <ItemSlot item={item} />
                ) : (
                  <div class="w-10 h-10 mx-auto rounded bg-rf-surface-inset/30 border border-rf-border/10 flex items-center justify-center text-sm opacity-30">
                    {icon}
                  </div>
                )}
                <div class="text-[8px] text-rf-muted mt-0.5">{label}</div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        {p.stats && (
          <>
            <div class="text-[9px] text-rf-muted uppercase font-bold tracking-wider mb-1.5">Stats</div>
            <div class="grid grid-cols-3 gap-1">
              {p.stats.strength != null && <MiniStat label="STR" value={p.stats.strength} />}
              {p.stats.agility != null && <MiniStat label="AGI" value={p.stats.agility} />}
              {p.stats.intelligence != null && <MiniStat label="INT" value={p.stats.intelligence} />}
              {p.stats.vitality != null && <MiniStat label="VIT" value={p.stats.vitality} />}
              {p.stats.wisdom != null && <MiniStat label="WIS" value={p.stats.wisdom} />}
              {p.stats.luck != null && <MiniStat label="LUK" value={p.stats.luck} />}
            </div>
          </>
        )}

        {/* Actions */}
        <div class="flex gap-2 mt-3 pt-2 border-t border-rf-border/20 justify-center">
          <ActionButton icon="💬" label="Whisper" onClick={() => { /* TODO */ }} />
          <ActionButton icon="👥" label="Invite" onClick={() => { /* TODO */ }} />
          <ActionButton icon="🤝" label="Trade" onClick={() => { /* TODO */ }} />
          <ActionButton icon="⚔️" label="Duel" onClick={() => { /* TODO */ }} />
        </div>
      </PanelShell>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div class="bg-rf-surface-inset/20 rounded px-2 py-0.5 text-center">
      <div class="text-[8px] text-rf-muted">{label}</div>
      <div class="text-xs font-bold text-rf-text">{value}</div>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class="px-2 py-1 text-[10px] text-rf-text bg-rf-surface-inset/30 border border-rf-border/20 rounded hover:border-rf-accent/40 hover:bg-rf-accent/10 transition-colors"
      onClick={onClick}
    >
      {icon} {label}
    </button>
  );
}
