import { useComputed, useSignal } from '@preact/signals';
import {
  openPanels,
  togglePanel,
  getNetwork,
  lastGatherResult,
  isGathering,
  miningLevel,
  gatheringLevel,
  miningXp,
  gatheringXp,
} from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';
import { MessageType } from '../../network/WebSocketClient';
import { rarityTextClass, rarityName, rarityBorderClass } from '../lib/rarity';

// Client-side catalog matching server MINING_NODES
const MINING_NODES = [
  { nodeType: 'copper_vein',     icon: '🪨', rarity: 0, minLevel: 1,  name: 'Copper Ore',     action: 'mine' },
  { nodeType: 'iron_deposit',    icon: '⛏️', rarity: 0, minLevel: 3,  name: 'Iron Ore',       action: 'mine' },
  { nodeType: 'silver_vein',     icon: '🥈', rarity: 1, minLevel: 8,  name: 'Silver Ore',     action: 'mine' },
  { nodeType: 'gold_vein',       icon: '🥇', rarity: 2, minLevel: 15, name: 'Gold Ore',       action: 'mine' },
  { nodeType: 'mithril_deposit', icon: '💠', rarity: 2, minLevel: 20, name: 'Mithril Ore',    action: 'mine' },
  { nodeType: 'adamantite_vein', icon: '💎', rarity: 3, minLevel: 25, name: 'Adamantite Ore', action: 'mine' },
  { nodeType: 'herb_patch',      icon: '🌿', rarity: 0, minLevel: 1,  name: 'Herb',           action: 'gather' },
  { nodeType: 'silk_bloom',      icon: '🌸', rarity: 1, minLevel: 10, name: 'Silk',           action: 'gather' },
  { nodeType: 'gem_cluster',     icon: '💎', rarity: 2, minLevel: 15, name: 'Gem Shard',      action: 'gather' },
  { nodeType: 'crystal_node',    icon: '🔮', rarity: 3, minLevel: 20, name: 'Star Fragment',  action: 'gather' },
  { nodeType: 'soul_wellspring', icon: '👻', rarity: 4, minLevel: 30, name: 'Soul Fragment',  action: 'gather' },
  { nodeType: 'celestial_bloom', icon: '✨', rarity: 3, minLevel: 25, name: 'Celestial Dust', action: 'gather' },
  { nodeType: 'dragon_fossil',   icon: '🦴', rarity: 4, minLevel: 30, name: 'Dragon Scale',   action: 'gather' },
  { nodeType: 'primordial_core_node', icon: '🌀', rarity: 5, minLevel: 35, name: 'Primordial Core', action: 'gather' },
] as const;

const MINING_CATALOG = MINING_NODES.filter(n => n.action === 'mine');
const GATHERING_CATALOG = MINING_NODES.filter(n => n.action === 'gather');

function XpBar({ level, xp, maxLevel }: { level: number; xp: number; maxLevel: number }) {
  const xpNeeded = 100 * level;
  const pct = level >= maxLevel ? 100 : Math.min(100, (xp / xpNeeded) * 100);
  return (
    <div class="w-full">
      <div class="flex justify-between text-[10px] text-slate-400 mb-0.5">
        <span>Lv {level}{level >= maxLevel ? ' (MAX)' : ''}</span>
        <span>{level >= maxLevel ? 'MAX' : `${xp} / ${xpNeeded} XP`}</span>
      </div>
      <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function MiningPanel() {
  const panels = useComputed(() => openPanels.value);
  const gathering = useComputed(() => isGathering.value);
  const result = useComputed(() => lastGatherResult.value);
  const mLvl = useComputed(() => miningLevel.value);
  const gLvl = useComputed(() => gatheringLevel.value);
  const mXp = useComputed(() => miningXp.value);
  const gXp = useComputed(() => gatheringXp.value);
  const activeTab = useSignal<'mine' | 'gather'>('mine');

  if (!panels.value.has('mining')) return null;

  const gatherNode = (nodeType: string, action: string) => {
    if (gathering.value) return;
    const net = getNetwork();
    if (!net) return;
    isGathering.value = true;
    net.send(MessageType.GatherAction, { action, node_type: nodeType });
    setTimeout(() => { isGathering.value = false; }, 3500);
  };

  const catalog = activeTab.value === 'mine' ? MINING_CATALOG : GATHERING_CATALOG;
  const currentLevel = activeTab.value === 'mine' ? mLvl.value : gLvl.value;
  const currentXp = activeTab.value === 'mine' ? mXp.value : gXp.value;

  return (
    <PanelShell title="⛏️ Mining & Gathering" onClose={() => togglePanel('mining')} width="w-80">
      <div class="space-y-3">
        {/* Tab Switcher */}
        <div class="flex gap-1">
          <button
            onClick={() => { activeTab.value = 'mine'; }}
            class={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${
              activeTab.value === 'mine'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            ⛏️ Mining
          </button>
          <button
            onClick={() => { activeTab.value = 'gather'; }}
            class={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${
              activeTab.value === 'gather'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            🌿 Gathering
          </button>
        </div>

        {/* Level & XP */}
        <div class="bg-slate-800/60 rounded-lg p-2">
          <XpBar level={currentLevel} xp={currentXp} maxLevel={30} />
        </div>

        {/* Gathering animation */}
        {gathering.value && (
          <div class="bg-slate-800/60 rounded-lg p-3 text-center animate-pulse">
            <div class="text-3xl mb-1">{activeTab.value === 'mine' ? '⛏️' : '🌿'}</div>
            <p class="text-sm text-slate-300">
              {activeTab.value === 'mine' ? 'Mining...' : 'Gathering...'}
            </p>
          </div>
        )}

        {/* Node Grid */}
        <div class="grid grid-cols-2 gap-1.5">
          {catalog.map(node => {
            const locked = currentLevel < node.minLevel;
            return (
              <button
                key={node.nodeType}
                disabled={gathering.value || locked}
                onClick={() => gatherNode(node.nodeType, node.action)}
                class={`flex items-center gap-2 p-2 rounded border transition-all text-left ${
                  locked
                    ? 'bg-slate-900/60 border-slate-700/40 opacity-50 cursor-not-allowed'
                    : gathering.value
                    ? 'bg-slate-800/40 border-slate-700/40 cursor-not-allowed'
                    : `bg-slate-800/60 border-slate-700/60 hover:border-amber-500/40 hover:bg-slate-700/60 active:scale-95`
                }`}
              >
                <span class="text-xl">{node.icon}</span>
                <div class="min-w-0 flex-1">
                  <p class={`text-xs font-semibold truncate ${locked ? 'text-slate-500' : rarityTextClass(node.rarity)}`}>
                    {node.name}
                  </p>
                  <p class="text-[10px] text-slate-500">
                    {locked ? `🔒 Lv ${node.minLevel}` : `Lv ${node.minLevel} · ${rarityName(node.rarity)}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Last Result */}
        {result.value && result.value.items.length > 0 && (
          <div class="bg-emerald-900/20 border border-emerald-700/30 rounded-lg p-2">
            <p class="text-[10px] text-slate-400 mb-1 font-semibold">Last Gather</p>
            <div class="space-y-1">
              {result.value.items.map((item, i) => (
                <div key={i} class="flex items-center gap-2">
                  <span class="text-lg">{item.icon}</span>
                  <span class={`text-xs font-semibold ${rarityTextClass(item.rarity)}`}>
                    {item.name}
                  </span>
                  <span class="text-xs text-slate-400 ml-auto">x{item.quantity}</span>
                </div>
              ))}
            </div>
            <p class="text-[10px] text-amber-400 mt-1">+{result.value.xpGained} XP</p>
          </div>
        )}

        {/* Tips */}
        <div class="bg-slate-800/30 rounded p-2 text-[10px] text-slate-500">
          <p>💡 Higher levels unlock rarer nodes and increase yield.</p>
          <p class="mt-0.5">✨ 10% chance for bonus rare drops!</p>
        </div>
      </div>
    </PanelShell>
  );
}
