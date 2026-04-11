import { useComputed, useSignal } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import { openPanels, playerStats, getNetwork } from '../../store/GameStore';
import { MessageType } from '../../network/WebSocketClient';

const RUNE_RECIPES = [
  { name: 'Rune of Healing', icon: '💚', minMagic: 10, manaCost: 20, desc: 'Heals the caster instantly', tier: 'basic' },
  { name: 'Rune of Fire', icon: '🔥', minMagic: 15, manaCost: 30, desc: 'Launches a fireball at target', tier: 'basic' },
  { name: 'Rune of Ice', icon: '❄️', minMagic: 15, manaCost: 30, desc: 'Freezes target briefly', tier: 'basic' },
  { name: 'Rune of Lightning', icon: '⚡', minMagic: 20, manaCost: 40, desc: 'Strikes target with lightning', tier: 'intermediate' },
  { name: 'Rune of Great Healing', icon: '💖', minMagic: 25, manaCost: 50, desc: 'Powerful group heal', tier: 'intermediate' },
  { name: 'Rune of Explosion', icon: '💥', minMagic: 30, manaCost: 60, desc: 'AoE explosion at target', tier: 'advanced' },
  { name: 'Rune of Wall of Fire', icon: '🧱', minMagic: 20, manaCost: 40, desc: 'Creates a wall of fire', tier: 'intermediate' },
  { name: 'Rune of Magic Shield', icon: '🛡️', minMagic: 30, manaCost: 60, desc: 'Absorbs damage with mana', tier: 'advanced' },
  { name: 'Rune of Paralyze', icon: '🕸️', minMagic: 40, manaCost: 100, desc: 'Paralyzes target completely', tier: 'master' },
  { name: 'Rune of Sudden Death', icon: '☠️', minMagic: 35, manaCost: 80, desc: 'Devastating single-target damage', tier: 'master' },
];

const TIER_COLORS: Record<string, string> = {
  basic: 'border-green-600/50',
  intermediate: 'border-blue-600/50',
  advanced: 'border-purple-600/50',
  master: 'border-red-600/50',
};

export function RuneCraftPanel() {
  const isOpen = useComputed(() => openPanels.value.has('runes'));

  if (!isOpen.value) return null;

  const stats = playerStats.value;
  const playerMp = stats.mp;
  const playerMaxMp = stats.maxMp;

  function craftRune(runeName: string) {
    try {
      getNetwork().send(MessageType.RuneCraft, { rune_name: runeName });
    } catch {}
  }

  return (
    <PanelShell title="Rune Crafting" onClose={() => openPanels.value = new Set([...openPanels.value].filter(p => p !== 'runes'))} width="w-96">
      <div class="flex flex-col gap-2 p-2 max-h-[500px]">
        <div class="text-center">
          <h2 class="text-lg font-bold text-purple-400">🔮 Rune Crafting</h2>
          <p class="text-xs text-gray-400 mt-1">Infuse Blank Runes with magical power</p>
          <p class="text-[10px] text-gray-500">Requires Blank Rune in inventory · MP: {playerMp}/{playerMaxMp}</p>
        </div>

        <div class="flex-1 overflow-y-auto space-y-1.5 max-h-[400px] pr-1">
          {RUNE_RECIPES.map(rune => {
            const canCast = playerMaxMp >= rune.minMagic && playerMp >= rune.manaCost;
            const meetsLevel = playerMaxMp >= rune.minMagic;
            return (
              <div key={rune.name} class={`flex items-center justify-between p-2 rounded border bg-gray-800/60 ${TIER_COLORS[rune.tier] || 'border-gray-700/50'} hover:bg-gray-700/60 transition-colors`}>
                <div class="flex items-center gap-2">
                  <span class="text-xl">{rune.icon}</span>
                  <div>
                    <div class={`text-sm font-medium ${meetsLevel ? 'text-white' : 'text-gray-500'}`}>{rune.name}</div>
                    <div class="text-[10px] text-gray-400">{rune.desc}</div>
                    <div class="text-[10px] text-gray-500">
                      Magic: {rune.minMagic} MP · Cost: {rune.manaCost} MP · 
                      <span class={`capitalize ${rune.tier === 'master' ? 'text-red-400' : rune.tier === 'advanced' ? 'text-purple-400' : rune.tier === 'intermediate' ? 'text-blue-400' : 'text-green-400'}`}>
                        {rune.tier}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  class={`px-2 py-1 text-xs rounded font-bold whitespace-nowrap ${canCast ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                  disabled={!canCast}
                  onClick={() => craftRune(rune.name)}
                >
                  Craft
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </PanelShell>
  );
}
