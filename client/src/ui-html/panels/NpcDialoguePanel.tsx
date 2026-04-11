import { useComputed } from '@preact/signals';
import { npcDialogue } from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';

/**
 * NpcDialoguePanel — dialogue tree with portrait, text, and choices.
 * Driven by npcDialogue signal.
 */
export function NpcDialoguePanel() {
  const dialogue = useComputed(() => npcDialogue.value);

  if (!dialogue.value) return null;

  const { speaker, portrait, text, choices } = dialogue.value;

  return (
    <div
      data-interactive
      class="fixed bottom-20 left-1/2 -translate-x-1/2 w-[min(600px,calc(100vw-2rem))] z-40 animate-panel-in"
      onMouseEnter={() => InputGate.claimPointer('npc-dialogue')}
      onMouseLeave={() => InputGate.releasePointer('npc-dialogue')}
    >
      <div class="bg-rf-surface/95 border border-rf-border/60 rounded-xl shadow-2xl overflow-hidden">
        {/* Speaker header */}
        <div class="flex items-center gap-3 px-4 py-2 bg-rf-surface-inset/80 border-b border-rf-border/30">
          <span class="text-3xl">{portrait}</span>
          <span class="font-bold text-rf-accent text-sm">{speaker}</span>
          <button
            type="button"
            class="ml-auto text-rf-muted hover:text-rf-danger text-xs transition-colors"
            onClick={() => { npcDialogue.value = null; }}
          >
            ✕ Leave
          </button>
        </div>

        {/* Dialogue text */}
        <div class="px-4 py-3">
          <p class="text-sm text-rf-text leading-relaxed">{text}</p>
        </div>

        {/* Choices */}
        {choices.length > 0 && (
          <div class="px-4 pb-3 space-y-1.5">
            {choices.map((choice, i) => (
              <button
                key={i}
                type="button"
                class="w-full text-left px-3 py-2 rounded-lg bg-rf-surface-inset/60 border border-rf-border/30 text-sm text-rf-text
                       hover:border-rf-accent/50 hover:bg-rf-accent/10 hover:text-rf-accent
                       transition-all duration-150 cursor-pointer"
                onClick={() => handleChoice(choice.nextNodeId, choice.action)}
              >
                <span class="text-rf-accent mr-1.5">{i + 1}.</span>
                {choice.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function handleChoice(nextNodeId: string | null, _action?: string): void {
  if (!nextNodeId) {
    npcDialogue.value = null;
    return;
  }
  // In a full implementation, this would load the next dialogue node from server
  // For now, close dialogue (server will send next node if applicable)
  npcDialogue.value = null;
}
