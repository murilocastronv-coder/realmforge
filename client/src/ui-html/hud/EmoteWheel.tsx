import { signal, useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { InputGate } from '../../services/InputGate';

// ─── Emote State ─────────────────────────────────────────────

export interface EmoteDefinition {
  id: string;
  name: string;
  icon: string;
  text: string; // what appears above player
  color: string;
}

export const EMOTES: EmoteDefinition[] = [
  { id: 'wave', name: 'Wave', icon: '👋', text: 'waves', color: 'text-yellow-300' },
  { id: 'dance', name: 'Dance', icon: '💃', text: 'dances', color: 'text-pink-300' },
  { id: 'laugh', name: 'Laugh', icon: '😂', text: 'laughs', color: 'text-yellow-200' },
  { id: 'salute', name: 'Salute', icon: '🫡', text: 'salutes', color: 'text-blue-300' },
  { id: 'cheer', name: 'Cheer', icon: '🎉', text: 'cheers', color: 'text-green-300' },
  { id: 'cry', name: 'Cry', icon: '😢', text: 'cries', color: 'text-blue-400' },
  { id: 'angry', name: 'Angry', icon: '😠', text: 'is angry', color: 'text-red-400' },
  { id: 'think', name: 'Think', icon: '🤔', text: 'thinks...', color: 'text-purple-300' },
];

export const showEmoteWheel = signal(false);

// callback for game code to react to emote
let _emoteCallback: ((emote: EmoteDefinition) => void) | null = null;
export function onEmoteUsed(cb: (emote: EmoteDefinition) => void): void { _emoteCallback = cb; }

function useEmote(emote: EmoteDefinition): void {
  showEmoteWheel.value = false;
  _emoteCallback?.(emote);
}

// ─── Emote Wheel Component ──────────────────────────────────

export function EmoteWheel() {
  const visible = useComputed(() => showEmoteWheel.value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible.value) return;
    InputGate.claimPointer('emote-wheel');
    return () => { InputGate.releasePointer('emote-wheel'); };
  }, [visible.value]);

  if (!visible.value) return null;

  const radius = 80;
  const angleStep = (2 * Math.PI) / EMOTES.length;

  return (
    <div
      data-interactive
      class="fixed inset-0 z-40"
      onClick={() => { showEmoteWheel.value = false; }}
    >
      <div
        ref={containerRef}
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Center label */}
        <div class="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] text-rf-muted font-bold bg-rf-surface/90 px-2 py-1 rounded-full border border-rf-border/30">
          Emotes
        </div>

        {/* Emote buttons in a circle */}
        {EMOTES.map((emote, i) => {
          const angle = angleStep * i - Math.PI / 2; // start from top
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          return (
            <button
              key={emote.id}
              type="button"
              class="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-rf-surface/90 border border-rf-border/40 hover:border-rf-accent/60 hover:bg-rf-accent/10 transition-all flex flex-col items-center justify-center group"
              style={{ left: `${x}px`, top: `${y}px` }}
              onClick={() => useEmote(emote)}
            >
              <span class="text-lg">{emote.icon}</span>
              <span class="text-[7px] text-rf-muted group-hover:text-rf-accent">{emote.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
