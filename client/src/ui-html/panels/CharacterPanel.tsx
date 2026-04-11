import { useComputed } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { gameStore, titleState } from '../../store/GameStore';

// ─── Character Stats Panel ──────────────────────────────────

interface CharacterPanelProps {
  onClose: () => void;
}

export function CharacterPanel({ onClose }: CharacterPanelProps) {
  const stats = useComputed(() => gameStore.playerStats.value);
  const equip = useComputed(() => gameStore.equipment.value);

  // Derived combat stats
  const derived = useComputed(() => {
    const s = stats.value;
    if (!s) return null;

    const str = s.strength || 0;
    const agi = s.agility || 0;
    const int = s.intelligence || 0;
    const vit = s.vitality || 0;
    const wis = s.wisdom || 0;
    const luk = s.luck || 0;

    // Equipment bonus aggregation
    let bonusStr = 0, bonusAgi = 0, bonusInt = 0, bonusVit = 0, bonusDef = 0, bonusAtk = 0;
    const slots = equip.value;
    if (slots) {
      for (const item of Object.values(slots)) {
        if (item?.stats) {
          bonusStr += item.stats.strength || 0;
          bonusAgi += item.stats.agility || 0;
          bonusInt += item.stats.intelligence || 0;
          bonusVit += item.stats.vitality || 0;
          bonusDef += item.stats.defense || 0;
          bonusAtk += item.stats.attack || 0;
        }
      }
    }

    const totalStr = str + bonusStr;
    const totalAgi = agi + bonusAgi;
    const totalInt = int + bonusInt;

    return {
      physicalDamage: Math.round(totalStr * 1.5 + bonusAtk),
      magicDamage: Math.round(totalInt * 1.8),
      attackSpeed: +(1 + totalAgi * 0.02).toFixed(2),
      critChance: Math.min(+(totalAgi * 0.3 + luk * 0.5).toFixed(1), 60),
      critDamage: +(150 + luk * 0.8).toFixed(1),
      defense: Math.round(vit * 0.8 + bonusDef),
      dmgReduction: Math.min(+(bonusDef * 0.15 + vit * 0.1).toFixed(1), 75),
      maxHp: s.maxHp || 100,
      maxMp: s.maxMp || 50,
      hpRegen: +(vit * 0.3).toFixed(1),
      mpRegen: +(wis * 0.5).toFixed(1),
      evasion: Math.min(+(totalAgi * 0.2 + luk * 0.1).toFixed(1), 40),
      moveSpeed: +(1 + totalAgi * 0.01).toFixed(2),
    };
  });

  if (!stats.value) return null;

  const s = stats.value;
  const d = derived.value;

  return (
    <PanelShell title={`📊 ${s.name || 'Character'}`} onClose={onClose} width="w-[380px] max-w-[calc(100vw-2rem)]">
      {/* Header */}
      <div class="flex items-center gap-3 mb-3 pb-3 border-b border-rf-border/20">
        <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-rf-accent/30 to-rf-accent/10 border border-rf-accent/30 flex items-center justify-center text-2xl">
          {s.playerClass === 'warrior' ? '⚔️' : s.playerClass === 'mage' ? '🧙' : s.playerClass === 'rogue' ? '🗡️' : '👤'}
        </div>
        <div>
          <div class="text-sm font-bold text-rf-text">{s.name}</div>
          <div class="text-[10px] text-rf-muted capitalize">Level {s.level} {s.playerClass || 'Adventurer'}</div>
          {titleState.value.active && (
            <div class="text-[10px] text-rf-gold">🏅 {titleState.value.catalog.find(t => t.id === titleState.value.active)?.name || titleState.value.active}</div>
          )}
          <div class="text-[10px] text-rf-accent">{s.experience || 0} / {(s.level || 1) * 100} XP</div>
        </div>
      </div>

      {/* Base Stats */}
      <div class="grid grid-cols-3 gap-1.5 mb-3">
        <BaseStat label="STR" value={s.strength || 0} color="text-red-400" icon="💪" />
        <BaseStat label="AGI" value={s.agility || 0} color="text-green-400" icon="🏃" />
        <BaseStat label="INT" value={s.intelligence || 0} color="text-blue-400" icon="🧠" />
        <BaseStat label="VIT" value={s.vitality || 0} color="text-orange-400" icon="❤️" />
        <BaseStat label="WIS" value={s.wisdom || 0} color="text-purple-400" icon="📖" />
        <BaseStat label="LUK" value={s.luck || 0} color="text-yellow-400" icon="🍀" />
      </div>

      {d && (
        <>
          {/* Combat Stats */}
          <div class="text-[9px] text-rf-muted uppercase font-bold tracking-wider mb-1.5">⚔️ Offense</div>
          <div class="grid grid-cols-2 gap-1 mb-3">
            <DerivedStat label="Physical DMG" value={`${d.physicalDamage}`} />
            <DerivedStat label="Magic DMG" value={`${d.magicDamage}`} />
            <DerivedStat label="Atk Speed" value={`${d.attackSpeed}x`} />
            <DerivedStat label="Crit Chance" value={`${d.critChance}%`} />
            <DerivedStat label="Crit DMG" value={`${d.critDamage}%`} />
            <DerivedStat label="Move Speed" value={`${d.moveSpeed}x`} />
          </div>

          <div class="text-[9px] text-rf-muted uppercase font-bold tracking-wider mb-1.5">🛡️ Defense</div>
          <div class="grid grid-cols-2 gap-1 mb-3">
            <DerivedStat label="Defense" value={`${d.defense}`} />
            <DerivedStat label="DMG Reduction" value={`${d.dmgReduction}%`} />
            <DerivedStat label="Evasion" value={`${d.evasion}%`} />
            <DerivedStat label="Max HP" value={`${d.maxHp}`} />
            <DerivedStat label="Max MP" value={`${d.maxMp}`} />
            <DerivedStat label="HP Regen" value={`${d.hpRegen}/s`} />
          </div>
        </>
      )}

      {/* Stat points available */}
      {(s.statPoints || 0) > 0 && (
        <div class="bg-rf-accent/10 border border-rf-accent/30 rounded-lg px-3 py-2 text-center">
          <div class="text-xs text-rf-accent font-bold">✨ {s.statPoints} stat points available!</div>
          <div class="text-[9px] text-rf-muted">Press P to allocate</div>
        </div>
      )}
    </PanelShell>
  );
}

function BaseStat({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div class="bg-rf-surface-inset/30 rounded px-2 py-1.5 text-center border border-rf-border/10">
      <div class="text-[8px] text-rf-muted uppercase">{icon} {label}</div>
      <div class={`text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}

function DerivedStat({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex justify-between items-center bg-rf-surface-inset/20 rounded px-2 py-1">
      <span class="text-[10px] text-rf-muted">{label}</span>
      <span class="text-[10px] text-rf-text font-mono">{value}</span>
    </div>
  );
}
