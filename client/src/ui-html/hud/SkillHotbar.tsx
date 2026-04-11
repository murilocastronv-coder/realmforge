import { useComputed, useSignal } from '@preact/signals';
import { useEffect, useCallback } from 'preact/hooks';
import { hotbar, useSkill, type HotbarSlot } from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';

const KEY_LABELS = ['1', '2', '3', '4', '5', '6'];

/**
 * SkillHotbar — 6 skill slots at bottom-center with key bindings 1-6.
 * Shows cooldown rings and mana cost on hover.
 */
export function SkillHotbar() {
  const slots = useComputed(() => hotbar.value);
  const now = useSignal(Date.now());

  // Tick for cooldown display
  useEffect(() => {
    const interval = setInterval(() => { now.value = Date.now(); }, 100);
    return () => clearInterval(interval);
  }, []);

  // Key bindings 1-6
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!InputGate.shouldGameProcessKey()) return;
    const idx = parseInt(e.key, 10) - 1;
    if (idx >= 0 && idx <= 5) {
      useSkill(idx);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      data-interactive
      class="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-1"
      onMouseEnter={() => InputGate.claimPointer('hotbar')}
      onMouseLeave={() => InputGate.releasePointer('hotbar')}
    >
      {slots.value.map((slot, i) => (
        <HotbarSlotUI key={i} slot={slot} index={i} now={now.value} />
      ))}
    </div>
  );
}

function HotbarSlotUI({ slot, index, now }: { slot: HotbarSlot; index: number; now: number }) {
  const skill = slot.skill;
  const elapsed = now - slot.lastUsedAt;
  const onCooldown = skill ? elapsed < skill.cooldownMs : false;
  const cooldownProgress = skill && onCooldown
    ? Math.min(1, elapsed / skill.cooldownMs)
    : 1;
  const remainingSec = skill && onCooldown
    ? Math.max(0, Math.ceil((skill.cooldownMs - elapsed) / 1000))
    : 0;

  return (
    <button
      type="button"
      onClick={() => useSkill(index)}
      disabled={!skill}
      class={`
        relative w-12 h-12 rounded-lg border-2 flex items-center justify-center
        transition-all duration-150
        ${skill ? 'border-rf-border/60 bg-rf-surface/80 hover:border-rf-accent hover:scale-105 cursor-pointer' : 'border-rf-border/30 bg-rf-bg/40 cursor-default'}
        ${onCooldown ? 'opacity-70' : ''}
      `}
      title={skill ? `${skill.name}\n${skill.description}\nMana: ${skill.manaCost}\nCD: ${skill.cooldownMs / 1000}s` : `Slot ${index + 1} (empty)`}
    >
      {/* Skill icon */}
      <span class="text-xl select-none">{skill?.icon ?? ''}</span>

      {/* Cooldown sweep overlay */}
      {onCooldown && (
        <div class="absolute inset-0 rounded-lg overflow-hidden">
          <div
            class="absolute inset-0 bg-black/50"
            style={{
              clipPath: `polygon(50% 50%, 50% 0%, ${getCooldownClipPath(1 - cooldownProgress)})`,
            }}
          />
          <span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-lg">
            {remainingSec}
          </span>
        </div>
      )}

      {/* Key binding label */}
      <span class="absolute -top-1 -left-1 bg-rf-bg/90 border border-rf-border/40 rounded text-[9px] font-bold text-rf-muted w-3.5 h-3.5 flex items-center justify-center">
        {KEY_LABELS[index]}
      </span>

      {/* Mana cost */}
      {skill && (
        <span class="absolute -bottom-0.5 right-0.5 text-[8px] font-bold text-blue-400">
          {skill.manaCost > 0 ? skill.manaCost : ''}
        </span>
      )}
    </button>
  );
}

/**
 * Convert cooldown fraction (0=full CD, 1=ready) into clip-path sweep.
 * Creates a circular sweep effect from top going clockwise.
 */
function getCooldownClipPath(fraction: number): string {
  if (fraction <= 0) return '50% 0%';
  if (fraction >= 1) return '50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 50% 0%';

  const angle = fraction * 360;
  const rad = (angle - 90) * (Math.PI / 180);
  const x = 50 + 70 * Math.cos(rad);
  const y = 50 + 70 * Math.sin(rad);

  const points: string[] = [];
  if (angle > 0) points.push('100% 0%');
  if (angle > 90) points.push('100% 100%');
  if (angle > 180) points.push('0% 100%');
  if (angle > 270) points.push('0% 0%');
  points.push(`${x}% ${y}%`);

  return points.join(', ');
}
