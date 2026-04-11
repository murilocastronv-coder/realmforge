import { h } from 'preact';
import { useState } from 'preact/hooks';
import { togglePanel, playerStats } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';

interface DungeonInfo {
  id: string;
  name: string;
  icon: string;
  minLevel: number;
  maxLevel: number;
  players: string;
  difficulty: 'Normal' | 'Hard' | 'Nightmare';
  rewards: string;
  description: string;
}

const DUNGEONS: DungeonInfo[] = [
  { id: 'goblin_caves', name: 'Goblin Caves', icon: '🕳️', minLevel: 5, maxLevel: 15, players: '1-3', difficulty: 'Normal', rewards: 'Goblin Gear, Gold', description: 'Infested caverns beneath the hills.' },
  { id: 'shadow_crypt', name: 'Shadow Crypt', icon: '⚰️', minLevel: 10, maxLevel: 25, players: '2-4', difficulty: 'Normal', rewards: 'Shadow Set, Runes', description: 'Ancient burial ground with undead horrors.' },
  { id: 'fire_temple', name: 'Fire Temple', icon: '🔥', minLevel: 15, maxLevel: 30, players: '2-4', difficulty: 'Hard', rewards: 'Inferno Weapons, Gems', description: 'A temple consumed by eternal flame.' },
  { id: 'frost_citadel', name: 'Frost Citadel', icon: '❄️', minLevel: 20, maxLevel: 35, players: '3-5', difficulty: 'Hard', rewards: 'Frost Set, Ice Crystals', description: 'Frozen fortress atop the northern peaks.' },
  { id: 'dragon_lair', name: 'Dragon\'s Lair', icon: '🐉', minLevel: 25, maxLevel: 40, players: '3-5', difficulty: 'Hard', rewards: 'Dragon Scale Armor, Legendaries', description: 'Home of the elder dragon.' },
  { id: 'void_abyss', name: 'Void Abyss', icon: '🌀', minLevel: 30, maxLevel: 50, players: '4-5', difficulty: 'Nightmare', rewards: 'Void Set, Mythic Items', description: 'A tear in reality leading to the abyss.' },
  { id: 'crystal_mines', name: 'Crystal Mines', icon: '💎', minLevel: 8, maxLevel: 20, players: '1-3', difficulty: 'Normal', rewards: 'Crystal Gear, Mining XP', description: 'Sparkling mines rich with rare crystals.' },
  { id: 'sunken_temple', name: 'Sunken Temple', icon: '🏛️', minLevel: 18, maxLevel: 35, players: '2-4', difficulty: 'Hard', rewards: 'Aqua Set, Trident', description: 'Submerged ruins of an ancient civilization.' },
  { id: 'demon_pit', name: 'Demon Pit', icon: '👿', minLevel: 35, maxLevel: 50, players: '4-5', difficulty: 'Nightmare', rewards: 'Demonic Weapons, Infernal Gems', description: 'Gateway to the demonic realm.' },
  { id: 'sky_fortress', name: 'Sky Fortress', icon: '🏰', minLevel: 40, maxLevel: 50, players: '5', difficulty: 'Nightmare', rewards: 'Celestial Set, Wings', description: 'Floating citadel above the clouds.' },
];

const difficultyColors: Record<string, string> = {
  Normal: 'text-green-400',
  Hard: 'text-orange-400',
  Nightmare: 'text-red-400',
};

export function DungeonFinderPanel() {
  const [selectedDungeon, setSelectedDungeon] = useState<string | null>(null);
  const [queuing, setQueuing] = useState<string | null>(null);
  const level = playerStats.value.level;
  const selected = DUNGEONS.find(d => d.id === selectedDungeon);

  return (
    <PanelShell title="🏰 Dungeon Finder" onClose={() => togglePanel('dungeonFinder')} width="w-[460px]">
      <div class="flex flex-col gap-2 p-2">
        <div class="text-xs text-gray-400 mb-1">Find a group and enter dungeons. Your level: <span class="text-white font-bold">{level}</span></div>

        <div class="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto pr-1">
          {DUNGEONS.map(d => {
            const eligible = level >= d.minLevel;
            const isQueuing = queuing === d.id;
            return (
              <div
                key={d.id}
                class={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                  selectedDungeon === d.id ? 'bg-amber-900/40 border border-amber-500/50' :
                  eligible ? 'bg-gray-800/60 hover:bg-gray-700/60' : 'bg-gray-900/40 opacity-50'
                }`}
                onClick={() => eligible && setSelectedDungeon(d.id)}
              >
                <span class="text-lg">{d.icon}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-white truncate">{d.name}</span>
                    <span class={`text-[10px] font-semibold ${difficultyColors[d.difficulty]}`}>{d.difficulty}</span>
                  </div>
                  <div class="text-[10px] text-gray-400">Lv.{d.minLevel}-{d.maxLevel} • {d.players} players</div>
                </div>
                {isQueuing && (
                  <span class="text-xs text-amber-400 animate-pulse">Queuing...</span>
                )}
                {!eligible && (
                  <span class="text-[10px] text-red-400">🔒 Lv.{d.minLevel}</span>
                )}
              </div>
            );
          })}
        </div>

        {selected && (
          <div class="bg-gray-800/80 rounded-lg p-3 border border-gray-600/50">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xl">{selected.icon}</span>
              <div>
                <div class="text-sm font-bold text-white">{selected.name}</div>
                <div class={`text-[10px] font-semibold ${difficultyColors[selected.difficulty]}`}>{selected.difficulty}</div>
              </div>
            </div>
            <p class="text-xs text-gray-300 mb-2">{selected.description}</p>
            <div class="flex gap-4 text-[10px] text-gray-400 mb-3">
              <span>📊 Lv.{selected.minLevel}-{selected.maxLevel}</span>
              <span>👥 {selected.players} players</span>
            </div>
            <div class="text-[10px] text-amber-300 mb-3">🎁 Rewards: {selected.rewards}</div>

            {queuing === selected.id ? (
              <button
                class="w-full py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors"
                onClick={() => setQueuing(null)}
              >
                ✕ Leave Queue
              </button>
            ) : (
              <button
                class="w-full py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                disabled={level < selected.minLevel}
                onClick={() => setQueuing(selected.id)}
              >
                🔍 Find Group
              </button>
            )}
          </div>
        )}
      </div>
    </PanelShell>
  );
}
