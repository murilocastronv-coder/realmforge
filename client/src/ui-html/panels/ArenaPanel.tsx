import { h } from 'preact';
import { useComputed } from '@preact/signals';
import { arenaState, commands, playerStats, togglePanel, openPanels } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';

export function ArenaPanel() {
  const isOpen = useComputed(() => openPanels.value.has('arena'));
  if (!isOpen.value) return null;
  const arena = arenaState.value;
  const stats = playerStats.value;

  const winRate = arena.wins + arena.losses > 0
    ? ((arena.wins / (arena.wins + arena.losses)) * 100).toFixed(1)
    : '0.0';

  const ratingTier =
    arena.rating >= 2000 ? { name: 'Gladiator', color: 'text-red-400', icon: '🏆' } :
    arena.rating >= 1600 ? { name: 'Champion', color: 'text-purple-400', icon: '💎' } :
    arena.rating >= 1200 ? { name: 'Challenger', color: 'text-blue-400', icon: '⚔️' } :
    arena.rating >= 800 ? { name: 'Contender', color: 'text-green-400', icon: '🗡️' } :
    { name: 'Initiate', color: 'text-gray-400', icon: '🛡️' };

  return (
    <PanelShell title="⚔️ Arena PvP" onClose={() => togglePanel('arena')} width="w-[350px]">
      <div class="flex flex-col gap-3 p-3">
        {/* Rating Display */}
        <div class="bg-gray-800/60 rounded-lg p-3 text-center">
          <div class="text-3xl font-bold text-white">{arena.rating}</div>
          <div class={`text-sm font-semibold ${ratingTier.color}`}>
            {ratingTier.icon} {ratingTier.name}
          </div>
        </div>

        {/* Stats */}
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-gray-800/40 rounded p-2">
            <div class="text-lg font-bold text-green-400">{arena.wins}</div>
            <div class="text-xs text-gray-400">Wins</div>
          </div>
          <div class="bg-gray-800/40 rounded p-2">
            <div class="text-lg font-bold text-red-400">{arena.losses}</div>
            <div class="text-xs text-gray-400">Losses</div>
          </div>
          <div class="bg-gray-800/40 rounded p-2">
            <div class="text-lg font-bold text-cyan-400">{winRate}%</div>
            <div class="text-xs text-gray-400">Win Rate</div>
          </div>
        </div>

        {/* Match Status */}
        {arena.inMatch ? (
          <div class="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-center">
            <div class="text-amber-400 font-bold">⚔️ IN MATCH</div>
            <div class="text-sm text-white mt-1">vs. <span class="text-cyan-400">{arena.opponent}</span></div>
            <div class="text-xs text-gray-400 mt-1">Defeat your opponent to win!</div>
          </div>
        ) : arena.queued ? (
          <div class="flex flex-col gap-2">
            <div class="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 text-center">
              <div class="text-blue-400 font-bold animate-pulse">🔍 Searching for opponent...</div>
              <div class="text-xs text-gray-400 mt-1">Rating range: {Math.max(0, arena.rating - 300)} - {arena.rating + 300}</div>
            </div>
            <button
              class="bg-gray-700 hover:bg-gray-600 text-white text-sm rounded py-2 transition"
              onClick={() => commands.arenaLeave()}
            >
              Leave Queue
            </button>
          </div>
        ) : (
          <button
            class="bg-gradient-to-r from-red-700 to-orange-600 hover:from-red-600 hover:to-orange-500 text-white font-bold rounded-lg py-3 transition shadow-lg"
            onClick={() => commands.arenaQueue()}
          >
            ⚔️ Join Arena Queue
          </button>
        )}

        {/* Info */}
        <div class="text-xs text-gray-500 border-t border-gray-700/50 pt-2">
          <div>• Matched with players within ±300 rating</div>
          <div>• Win: +25 rating, Lose: -20 rating</div>
          <div>• Both players are healed before match</div>
          <div>• Rewards scale with rating tier</div>
        </div>
      </div>
    </PanelShell>
  );
}
