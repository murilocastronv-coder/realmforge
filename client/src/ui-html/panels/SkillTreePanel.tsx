import { useComputed, useSignal } from '@preact/signals';
import { openPanels, togglePanel, playerStats, getNetwork } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';
import { MessageType } from '../../network/WebSocketClient';

interface SkillNode {
  id: string;
  name: string;
  description: string;
  icon: string;
  tree: string;
  tier: number;
  requires: string[];
  bonusType: string;
  bonusValue: number;
  cost: number;
  unlocked: boolean;
}

interface SkillTreeData {
  class: string;
  nodes: SkillNode[];
  unlocked: string[];
  skillPoints: number;
  message?: string;
}

/**
 * SkillTreePanel — class specialization skill trees.
 * Toggle with K key. Shows 3 trees per class with 5 tiers each.
 */
export function SkillTreePanel() {
  const isOpen = useComputed(() => openPanels.value.has('skilltree'));
  const activeTree = useSignal<string | null>(null);
  const refreshKey = useSignal(0);

  if (!isOpen.value) return null;

  // Request skill tree data on open
  const ws = getNetwork();
  if (ws) {
    ws.send(MessageType.SkillTreeRequest, {});
  }

  const data = (window as any).__skillTreeData as SkillTreeData | undefined;
  if (!data?.nodes) {
    return (
      <PanelShell title="Skill Tree" onClose={() => togglePanel('skilltree')} width="w-[520px]">
        <div class="text-center text-rf-text-dim py-8">Loading skill tree…</div>
      </PanelShell>
    );
  }

  const trees = [...new Set(data.nodes.map(n => n.tree))];
  const currentTree = activeTree.value ?? trees[0];
  const treeNodes = data.nodes
    .filter(n => n.tree === currentTree)
    .sort((a, b) => a.tier - b.tier);

  const canUnlock = (node: SkillNode): boolean => {
    if (node.unlocked) return false;
    if (data.skillPoints < node.cost) return false;
    return node.requires.every(reqId => data.unlocked.includes(reqId));
  };

  const handleUnlock = (nodeId: string) => {
    if (ws) {
      ws.send(MessageType.SkillTreeUnlock, { nodeId });
      // Optimistic: re-request after short delay
      setTimeout(() => {
        ws.send(MessageType.SkillTreeRequest, {});
        refreshKey.value++;
      }, 200);
    }
  };

  const getNodeStyle = (node: SkillNode): string => {
    if (node.unlocked) return 'border-rf-gold bg-rf-gold/15 text-rf-gold';
    if (canUnlock(node)) return 'border-green-500 bg-green-500/10 text-green-400 cursor-pointer hover:bg-green-500/20';
    return 'border-rf-border-muted bg-rf-surface/50 text-rf-text-dim opacity-60';
  };

  const classLabel = data.class.charAt(0).toUpperCase() + data.class.slice(1);

  return (
    <PanelShell title={`${classLabel} Skills`} onClose={() => togglePanel('skilltree')} width="w-[520px]">
      {/* Skill points */}
      <div class="flex items-center justify-between px-1 pb-2 border-b border-rf-border-muted mb-2">
        <span class="text-[11px] text-rf-text-dim uppercase tracking-wide">Skill Points</span>
        <span class="text-sm font-bold text-rf-gold">{data.skillPoints}</span>
      </div>

      {/* Tree tabs */}
      <div class="flex gap-1 mb-3">
        {trees.map(tree => (
          <button
            key={tree}
            class={`flex-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide rounded transition-colors ${
              currentTree === tree
                ? 'bg-rf-gold/20 text-rf-gold border border-rf-gold/40'
                : 'bg-rf-surface text-rf-text-dim border border-rf-border-muted hover:text-rf-text'
            }`}
            onClick={() => { activeTree.value = tree; }}
          >
            {tree}
          </button>
        ))}
      </div>

      {/* Nodes list (tier 1 → 5, top to bottom) */}
      <div class="flex flex-col gap-2">
        {treeNodes.map((node, idx) => (
          <div key={node.id}>
            {/* Connection line */}
            {idx > 0 && (
              <div class="flex justify-center -mb-1 -mt-1">
                <div class={`w-px h-3 ${node.unlocked || treeNodes[idx - 1].unlocked ? 'bg-rf-gold/50' : 'bg-rf-border-muted/30'}`} />
              </div>
            )}
            <div
              class={`flex items-start gap-3 p-2.5 rounded border transition-all ${getNodeStyle(node)}`}
              onClick={() => canUnlock(node) && handleUnlock(node.id)}
              title={canUnlock(node) ? `Click to unlock (${node.cost} SP)` : node.unlocked ? 'Unlocked' : 'Locked'}
            >
              {/* Icon */}
              <div class="text-2xl flex-shrink-0 w-8 text-center">{node.icon}</div>

              {/* Info */}
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[12px] font-bold">{node.name}</span>
                  <span class="text-[10px] text-rf-text-dim">Tier {node.tier}</span>
                  {node.unlocked && <span class="text-[9px] text-rf-gold font-semibold">✓ UNLOCKED</span>}
                </div>
                <p class="text-[10px] text-rf-text-dim leading-tight mt-0.5">{node.description}</p>
              </div>

              {/* Cost badge */}
              {!node.unlocked && (
                <div class={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  canUnlock(node) ? 'bg-green-500/20 text-green-400' : 'bg-rf-surface text-rf-text-dim'
                }`}>
                  {node.cost} SP
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
