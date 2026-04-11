import { useComputed, useSignal } from '@preact/signals';
import { activeQuests, showQuestPanel, type Quest } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';
import { MessageType } from '../../network/WebSocketClient';
import { getNetwork } from '../../store/GameStore';

interface AvailableQuest {
  id: string; title: string; description: string; icon: string; minLevel: number;
  objectives: Array<{ description: string; count: number }>;
  rewardXp: number; rewardGold: number;
}

/**
 * QuestPanel — full quest log with available/active/completed quests.
 * Toggle with Q key or from QuestTracker.
 */
export function QuestPanel() {
  const visible = useComputed(() => showQuestPanel.value);
  const quests = useComputed(() => activeQuests.value);
  const tab = useSignal<'active' | 'available'>('active');
  const availableQuests = useSignal<AvailableQuest[]>([]);

  if (!visible.value) return null;

  // Request quest list on render
  const ws = getNetwork();
  if (ws) {
    ws.send(MessageType.QuestListRequest, {});
    // Read available quests from global (set by networkHandler)
    const data = (window as any).__questListData;
    if (data?.available) {
      availableQuests.value = data.available;
    }
  }

  const active = quests.value.filter(q => q.status === 'active' || q.status === 'turnIn');
  const completed = quests.value.filter(q => q.status === 'completed');

  function acceptQuest(questId: string) {
    const ws = getNetwork();
    if (ws) ws.send(MessageType.QuestAccept, { questId });
    availableQuests.value = availableQuests.value.filter(q => q.id !== questId);
  }

  function turnInQuest(questId: string) {
    const ws = getNetwork();
    if (ws) ws.send(MessageType.QuestTurnIn, { questId });
  }

  return (
    <PanelShell
      title="📜 Quest Log"
      onClose={() => { showQuestPanel.value = false; }}
      className="fixed top-20 right-4 w-96"
    >
      {/* Tabs */}
      <div class="flex gap-1 mb-3">
        <button
          class={`flex-1 py-1.5 text-xs font-bold rounded ${tab.value === 'active' ? 'bg-rf-accent/20 text-rf-accent' : 'bg-rf-surface-inset text-rf-muted hover:text-rf-text'}`}
          onClick={() => { tab.value = 'active'; }}
        >
          Active ({active.length})
        </button>
        <button
          class={`flex-1 py-1.5 text-xs font-bold rounded ${tab.value === 'available' ? 'bg-rf-accent/20 text-rf-accent' : 'bg-rf-surface-inset text-rf-muted hover:text-rf-text'}`}
          onClick={() => {
            tab.value = 'available';
            const ws = getNetwork();
            if (ws) ws.send(MessageType.QuestListRequest, {});
            setTimeout(() => {
              const data = (window as any).__questListData;
              if (data?.available) availableQuests.value = [...data.available];
            }, 200);
          }}
        >
          Available ({availableQuests.value.length})
        </button>
      </div>

      <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {tab.value === 'active' && (
          <>
            {active.length === 0 && completed.length === 0 && (
              <div class="text-center text-rf-muted py-8">
                No quests yet. Check the Available tab for quests!
              </div>
            )}

            {active.map(q => <QuestEntry key={q.id} quest={q} onTurnIn={turnInQuest} />)}

            {completed.length > 0 && (
              <div>
                <h3 class="text-xs font-bold text-rf-muted uppercase tracking-wider mb-2 mt-4">Completed ({completed.length})</h3>
                {completed.map(q => <QuestEntry key={q.id} quest={q} />)}
              </div>
            )}
          </>
        )}

        {tab.value === 'available' && (
          <>
            {availableQuests.value.length === 0 && (
              <div class="text-center text-rf-muted py-8">
                No quests available right now. Level up or complete prerequisite quests!
              </div>
            )}
            {availableQuests.value.map(q => (
              <div key={q.id} class="p-2.5 rounded-lg border border-rf-accent/30 bg-rf-accent/5">
                <div class="flex items-center gap-2">
                  <span class="text-base">{q.icon}</span>
                  <span class="font-semibold text-sm text-rf-accent">{q.title}</span>
                  <span class="text-[10px] text-rf-muted ml-auto">Lv.{q.minLevel}+</span>
                </div>
                <p class="text-xs text-rf-muted mt-1">{q.description}</p>
                <div class="mt-2 space-y-1">
                  {q.objectives.map((obj, i) => (
                    <div key={i} class="flex items-center gap-1.5 text-xs text-rf-text">
                      <span>⬜</span> {obj.description} <span class="text-rf-muted ml-auto">0/{obj.count}</span>
                    </div>
                  ))}
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <div class="flex gap-2 text-[10px] text-rf-muted">
                    {q.rewardXp > 0 && <span>⭐ {q.rewardXp} XP</span>}
                    {q.rewardGold > 0 && <span>💰 {q.rewardGold}g</span>}
                  </div>
                  <button
                    class="ml-auto px-3 py-1 text-xs font-bold bg-rf-accent/20 text-rf-accent rounded hover:bg-rf-accent/40 transition-colors"
                    onClick={() => acceptQuest(q.id)}
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </PanelShell>
  );
}

function QuestEntry({ quest, onTurnIn }: { quest: Quest; onTurnIn?: (id: string) => void }) {
  const isReady = quest.status === 'turnIn';
  const isDone = quest.status === 'completed';

  return (
    <div class={`p-2.5 rounded-lg border ${isReady ? 'border-rf-warning/40 bg-rf-warning/5' : isDone ? 'border-rf-success/30 bg-rf-success/5 opacity-60' : 'border-rf-border/30 bg-rf-surface-inset/50'}`}>
      <div class="flex items-center gap-2">
        <span class="text-base">{quest.icon}</span>
        <span class={`font-semibold text-sm ${isReady ? 'text-rf-warning' : isDone ? 'text-rf-success' : 'text-rf-text'}`}>
          {quest.title}
        </span>
        {isReady && <span class="text-[10px] bg-rf-warning/20 text-rf-warning px-1.5 rounded ml-auto">READY</span>}
      </div>

      {/* Objectives */}
      <div class="mt-2 space-y-1">
        {quest.objectives.map((obj, i) => (
          <div key={i} class="flex items-center gap-1.5 text-xs">
            <span class={obj.completed ? 'text-rf-success' : 'text-rf-muted'}>{obj.completed ? '✅' : '⬜'}</span>
            <span class={obj.completed ? 'text-rf-muted line-through' : 'text-rf-text'}>
              {obj.description}
            </span>
            <span class="text-rf-muted ml-auto">{obj.current}/{obj.target}</span>
          </div>
        ))}
      </div>

      {/* Rewards */}
      <div class="mt-2 flex items-center gap-2">
        <div class="flex gap-2 text-[10px] text-rf-muted">
          {quest.rewards.xp ? <span>⭐ {quest.rewards.xp} XP</span> : null}
          {quest.rewards.gold ? <span>💰 {quest.rewards.gold}g</span> : null}
          {quest.rewards.items?.map((item, i) => <span key={i}>🎁 {item}</span>)}
        </div>
        {isReady && onTurnIn && (
          <button
            class="ml-auto px-3 py-1 text-xs font-bold bg-rf-warning/20 text-rf-warning rounded hover:bg-rf-warning/40 transition-colors animate-pulse"
            onClick={() => onTurnIn(quest.id)}
          >
            Turn In
          </button>
        )}
      </div>
    </div>
  );
}
