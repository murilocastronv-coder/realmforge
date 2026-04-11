import { useComputed } from '@preact/signals';
import { activeQuests, showQuestPanel, type Quest } from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';

/**
 * QuestTracker — compact HUD widget showing active quest objectives.
 * Clicking opens the full quest panel.
 */
export function QuestTracker() {
  const quests = useComputed(() => activeQuests.value);

  const tracked = quests.value.filter(q => q.status === 'active' || q.status === 'turnIn').slice(0, 3);
  if (tracked.length === 0) return null;

  return (
    <div
      data-interactive
      class="fixed top-4 right-4 w-56 space-y-1"
      onMouseEnter={() => InputGate.claimPointer('quest-tracker')}
      onMouseLeave={() => InputGate.releasePointer('quest-tracker')}
    >
      <button
        type="button"
        class="text-[10px] text-rf-muted hover:text-rf-accent transition-colors"
        onClick={() => { showQuestPanel.value = !showQuestPanel.value; }}
      >
        📜 QUESTS ({tracked.length})
      </button>
      {tracked.map(q => <TrackedQuest key={q.id} quest={q} />)}
    </div>
  );
}

function TrackedQuest({ quest }: { quest: Quest }) {
  const isReady = quest.status === 'turnIn';

  return (
    <div class={`bg-rf-surface/70 rounded px-2 py-1.5 border ${isReady ? 'border-rf-warning/30' : 'border-rf-border/20'}`}>
      <div class="text-xs font-semibold text-rf-text truncate">
        {quest.icon} {quest.title}
        {isReady && <span class="text-rf-warning ml-1">⮞</span>}
      </div>
      {quest.objectives.filter(o => !o.completed).slice(0, 2).map((obj, i) => (
        <div key={i} class="text-[10px] text-rf-muted mt-0.5 flex justify-between">
          <span class="truncate">{obj.description}</span>
          <span class="text-rf-accent ml-1 shrink-0">{obj.current}/{obj.target}</span>
        </div>
      ))}
    </div>
  );
}
