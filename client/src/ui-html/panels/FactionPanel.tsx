import { useComputed } from '@preact/signals';
import { openPanels, togglePanel, factions, getNetwork } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';
import { MessageType } from '../../network/WebSocketClient';

const REP_TIERS = [
  { name: 'Hated', min: -3000, color: 'text-red-600', bg: 'bg-red-900/40' },
  { name: 'Hostile', min: -1000, color: 'text-red-400', bg: 'bg-red-800/30' },
  { name: 'Unfriendly', min: -200, color: 'text-orange-400', bg: 'bg-orange-800/20' },
  { name: 'Neutral', min: 0, color: 'text-slate-300', bg: 'bg-slate-700/30' },
  { name: 'Friendly', min: 500, color: 'text-green-400', bg: 'bg-green-800/30' },
  { name: 'Honored', min: 1500, color: 'text-blue-400', bg: 'bg-blue-800/30' },
  { name: 'Revered', min: 3000, color: 'text-purple-400', bg: 'bg-purple-800/30' },
  { name: 'Exalted', min: 6000, color: 'text-amber-400', bg: 'bg-amber-800/30' },
];

function getTier(rep: number) {
  let tier = REP_TIERS[0];
  for (const t of REP_TIERS) {
    if (rep >= t.min) tier = t;
  }
  return tier;
}

function getProgress(rep: number): number {
  const tier = getTier(rep);
  const idx = REP_TIERS.indexOf(tier);
  if (idx >= REP_TIERS.length - 1) return 100;
  const next = REP_TIERS[idx + 1];
  const range = next.min - tier.min;
  const progress = rep - tier.min;
  return Math.min(100, Math.max(0, (progress / range) * 100));
}

const FACTION_REWARDS: Record<string, string[]> = {
  'Starfall Guard':   ['Friendly: Guard armor set', 'Honored: Town portal scroll', 'Exalted: Starfall title'],
  'Shadow Syndicate': ['Friendly: Lockpick tools', 'Honored: Cloak of Shadows', 'Exalted: Shadow Master title'],
  'Arcane Circle':    ['Friendly: Minor enchant scrolls', 'Honored: Arcane robes', 'Exalted: Archmage title'],
  'Merchant League':  ['Friendly: 5% shop discount', 'Honored: 10% shop discount', 'Exalted: Trade Prince title'],
  'Wild Hunters':     ['Friendly: Tracking trinket', 'Honored: Beast companion', 'Exalted: Beastlord title'],
  'Dragon Keepers':   ['Friendly: Flame resist potion', 'Honored: Dragon scale armor', 'Exalted: Dragonkin title'],
};

export function FactionPanel() {
  const panels = useComputed(() => openPanels.value);
  const factionList = useComputed(() => factions.value);

  if (!panels.value.has('factions')) return null;

  // Request faction data when opening
  if (factionList.value.length === 0) {
    const net = getNetwork();
    if (net) {
      net.send(MessageType.FactionAction, { action: 'info' });
    }
  }

  return (
    <PanelShell title="⚔️ Factions" onClose={() => togglePanel('factions')} width="w-96">
      <div class="space-y-3">
        {factionList.value.length === 0 ? (
          <div class="text-center py-8 text-slate-400">
            <div class="text-3xl mb-2">⏳</div>
            <p class="text-sm">Loading faction data...</p>
          </div>
        ) : (
          factionList.value.map(faction => {
            const tier = getTier(faction.rep);
            const progress = getProgress(faction.rep);
            const rewards = FACTION_REWARDS[faction.name] || [];

            return (
              <div key={faction.id} class={`rounded-lg border border-slate-700/50 ${tier.bg} overflow-hidden`}>
                {/* Header */}
                <div class="flex items-center gap-3 p-3">
                  <span class="text-2xl">{faction.icon}</span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <h3 class="font-bold text-sm text-slate-100 truncate">{faction.name}</h3>
                      <span class={`text-xs font-semibold ${tier.color}`}>{faction.rank || tier.name}</span>
                    </div>
                    <p class="text-xs text-slate-400 truncate">{faction.description}</p>
                  </div>
                </div>

                {/* Rep Bar */}
                <div class="px-3 pb-2">
                  <div class="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Rep: {faction.rep}</span>
                    <span>{tier.name} → {
                      REP_TIERS[REP_TIERS.indexOf(tier) + 1]?.name || 'MAX'
                    }</span>
                  </div>
                  <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      class={`h-full rounded-full transition-all duration-500 ${
                        tier.color.includes('red') ? 'bg-red-500' :
                        tier.color.includes('orange') ? 'bg-orange-500' :
                        tier.color.includes('green') ? 'bg-green-500' :
                        tier.color.includes('blue') ? 'bg-blue-500' :
                        tier.color.includes('purple') ? 'bg-purple-500' :
                        tier.color.includes('amber') ? 'bg-amber-500' :
                        'bg-slate-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Rewards Preview */}
                {rewards.length > 0 && (
                  <div class="px-3 pb-2">
                    <details class="group">
                      <summary class="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">
                        🎁 Rewards ({rewards.length})
                      </summary>
                      <div class="mt-1 space-y-0.5">
                        {rewards.map((r, i) => {
                          const unlocked = faction.rep >= (REP_TIERS.find(t =>
                            r.startsWith(t.name))?.min || 99999);
                          return (
                            <p key={i} class={`text-xs pl-2 ${
                              unlocked ? 'text-emerald-400' : 'text-slate-500'
                            }`}>
                              {unlocked ? '✅' : '🔒'} {r}
                            </p>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Footer */}
        <div class="bg-slate-800/30 rounded p-2 text-xs text-slate-500">
          <p>💡 Earn reputation by completing quests, defeating enemies, and trading with faction NPCs.</p>
        </div>
      </div>
    </PanelShell>
  );
}
