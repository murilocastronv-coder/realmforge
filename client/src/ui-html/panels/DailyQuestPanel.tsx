import { h } from 'preact';
import { useComputed } from '@preact/signals';
import { dailyQuests, commands, togglePanel, openPanels } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';

const objectiveIcons: Record<string, string> = {
  kill_enemies: '⚔️',
  kill_boss: '👑',
  mine_nodes: '⛏️',
  catch_fish: '🎣',
  craft_items: '🔨',
  earn_gold: '💰',
  enter_dungeon: '🏰',
  send_chat: '💬',
  auction_list: '🏪',
  enchant_item: '✨',
  visit_towns: '🗺️',
  join_party: '👥',
  combo_hits: '🔥',
};

export function DailyQuestPanel() {
  const isOpen = useComputed(() => openPanels.value.has('dailyquests'));
  if (!isOpen.value) return null;
  const quests = dailyQuests.value;
  const completedCount = quests.filter(q => q.completed).length;
  const claimableCount = quests.filter(q => q.progress >= q.target && !q.completed).length;

  return (
    <PanelShell title={`🎯 Daily Quests ${claimableCount > 0 ? `(${claimableCount} ready!)` : ''}`} onClose={() => togglePanel('dailyquests')} width="w-96">
      <div class="flex flex-col gap-2 p-2">
        {/* Header */}
        <div class="flex justify-between items-center">
          <span class="text-xs text-gray-400">Completed: {completedCount}/{quests.length}</span>
          {completedCount === quests.length && (
            <span class="text-xs text-green-400 font-bold">✅ All done!</span>
          )}
        </div>

        {/* Progress bar */}
        <div class="w-full bg-gray-800 rounded-full h-2">
          <div
            class="bg-gradient-to-r from-amber-500 to-yellow-400 h-2 rounded-full transition-all duration-500"
            style={{ width: `${quests.length > 0 ? (completedCount / quests.length) * 100 : 0}%` }}
          />
        </div>

        {/* Quest list */}
        {quests.length === 0 ? (
          <div class="text-center text-gray-500 text-sm py-4">Loading daily quests...</div>
        ) : (
          <div class="flex flex-col gap-2">
            {quests.map(quest => {
              const progress = Math.min(quest.progress, quest.target);
              const pct = quest.target > 0 ? (progress / quest.target) * 100 : 0;
              const canClaim = progress >= quest.target && !quest.completed;
              const icon = objectiveIcons[quest.objective] ?? '📋';

              return (
                <div
                  key={quest.questId}
                  class={`rounded-lg p-3 border transition ${
                    quest.completed
                      ? 'bg-gray-800/30 border-gray-700/30 opacity-60'
                      : canClaim
                        ? 'bg-green-900/20 border-green-600/40 animate-pulse'
                        : 'bg-gray-800/50 border-gray-700/50'
                  }`}
                >
                  <div class="flex items-start gap-2">
                    <span class="text-xl">{icon}</span>
                    <div class="flex-1">
                      <div class="flex justify-between items-center">
                        <span class={`text-sm font-semibold ${quest.completed ? 'text-gray-500 line-through' : 'text-white'}`}>
                          {quest.title}
                        </span>
                        {quest.completed && <span class="text-green-400 text-xs">✅</span>}
                      </div>
                      <div class="text-xs text-gray-400 mt-0.5">{quest.description}</div>

                      {/* Progress bar */}
                      <div class="mt-2 flex items-center gap-2">
                        <div class="flex-1 bg-gray-700 rounded-full h-1.5">
                          <div
                            class={`h-1.5 rounded-full transition-all duration-300 ${
                              quest.completed ? 'bg-gray-500' : canClaim ? 'bg-green-500' : 'bg-cyan-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span class="text-xs text-gray-400 min-w-[48px] text-right">
                          {progress}/{quest.target}
                        </span>
                      </div>

                      {/* Rewards */}
                      <div class="flex items-center gap-3 mt-1.5">
                        {quest.rewardXp > 0 && (
                          <span class="text-xs text-cyan-400">⭐ {quest.rewardXp} XP</span>
                        )}
                        {quest.rewardGold > 0 && (
                          <span class="text-xs text-yellow-400">💰 {quest.rewardGold}g</span>
                        )}
                        {canClaim && (
                          <button
                            class="ml-auto bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded px-3 py-1 transition"
                            onClick={() => commands.claimDailyQuest(quest.questId)}
                          >
                            Claim!
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info footer */}
        <div class="text-xs text-gray-500 border-t border-gray-700/50 pt-2 mt-1">
          Daily quests reset periodically. Complete all 3 for bonus rewards!
        </div>
      </div>
    </PanelShell>
  );
}
