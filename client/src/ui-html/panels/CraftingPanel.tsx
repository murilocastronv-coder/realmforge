import { useSignal, useComputed } from '@preact/signals';
import { openPanels, togglePanel, commands, inventory, playerStats } from '../../store/GameStore';
import { CRAFTING_RECIPES } from '../../data/craftingRecipes';
import { getItemStats, type CraftingRecipe } from '../../types/gameData';
import { PanelShell } from '../components/PanelShell';
import { rarityTextClass, rarityName } from '../lib/rarity';

/**
 * CraftingPanel — recipe browser with material requirements.
 * Replaces Phaser Crafting.ts (245 LOC).
 */
export function CraftingPanel() {
  const isOpen = useComputed(() => openPanels.value.has('crafting'));
  const selectedIndex = useSignal(-1);
  const items = useComputed(() => inventory.value);
  const level = useComputed(() => playerStats.value.level);

  if (!isOpen.value) return null;

  const recipes = CRAFTING_RECIPES;
  const selected: CraftingRecipe | null = selectedIndex.value >= 0 ? recipes[selectedIndex.value] : null;

  const canCraft = (recipe: CraftingRecipe): boolean => {
    if (level.value < recipe.levelRequired) return false;
    for (const mat of recipe.materials) {
      const have = items.value
        .filter((i): i is NonNullable<typeof i> => i !== null && i.templateId === mat.templateId)
        .reduce((sum, i) => sum + i.quantity, 0);
      if (have < mat.quantity) return false;
    }
    return true;
  };

  const handleCraft = () => {
    if (selected) {
      commands.craftItem(selected.id);
    }
  };

  return (
    <div class="fixed top-20 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)]">
      <PanelShell
        title="Crafting"
        onClose={() => togglePanel('crafting')}
        width="w-[324px] max-w-full"
      >
        <div class="flex gap-1.5 h-[220px]">
          {/* Recipe list */}
          <div class="w-[128px] flex flex-col rounded bg-rf-surface-inset/50 border border-rf-chrome-trim/40 overflow-hidden">
            <div class="px-2 py-1 text-[10px] font-bold text-rf-gold uppercase border-b border-rf-chrome-trim/30">
              Recipes
            </div>
            <div class="flex-1 overflow-y-auto">
              {recipes.map((recipe, i) => (
                <button
                  key={recipe.id}
                  class={`w-full text-left px-2 py-0.5 text-[11px] transition-colors ${
                    selectedIndex.value === i
                      ? 'bg-rf-surface-inset-warm border-l-2 border-rf-accent'
                      : 'hover:bg-rf-surface-muted/40 border-l-2 border-transparent'
                  } ${rarityTextClass(recipe.result.rarity)}`}
                  onClick={() => { selectedIndex.value = i; }}
                >
                  {recipe.name}
                </button>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          <div class="flex-1 flex flex-col rounded bg-rf-surface-muted/40 border border-rf-chrome-trim/40 overflow-hidden">
            <div class="px-2 py-1 text-[10px] font-bold text-rf-gold uppercase border-b border-rf-chrome-trim/30">
              Details
            </div>
            <div class="flex-1 overflow-y-auto px-2 py-1.5">
              {selected ? (
                <div class="space-y-1.5">
                  <div class={`text-[12px] font-bold ${rarityTextClass(selected.result.rarity)}`}>
                    {selected.result.name}
                  </div>
                  <div class="text-[10px] text-rf-text-dim">
                    Rarity: {rarityName(selected.result.rarity)} · Req Level: {selected.levelRequired}
                  </div>

                  <div class="text-[10px] font-bold text-rf-text-muted mt-2">Materials:</div>
                  {selected.materials.map((mat) => {
                    const have = items.value
                      .filter((i): i is NonNullable<typeof i> => i !== null && i.templateId === mat.templateId)
                      .reduce((sum, i) => sum + i.quantity, 0);
                    const enough = have >= mat.quantity;
                    return (
                      <div key={mat.templateId} class={`text-[11px] ${enough ? 'text-rf-success' : 'text-rf-danger'}`}>
                        {mat.templateId} {have}/{mat.quantity}
                      </div>
                    );
                  })}

                  {Object.keys(getItemStats(selected.result)).length > 0 && (
                    <>
                      <div class="text-[10px] font-bold text-rf-text-muted mt-2">Stats:</div>
                      {Object.entries(getItemStats(selected.result)).map(([key, val]) => (
                        <div key={key} class="text-[11px] text-rf-text-secondary">
                          {key}: <span class="text-rf-success">+{val}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div class="text-[11px] text-rf-text-dim italic mt-2">
                  Select a recipe to inspect its requirements.
                </div>
              )}
            </div>

            {selected && (
              <div class="p-2 border-t border-rf-chrome-trim/30">
                <button
                  class={`w-full py-1 text-[11px] font-bold rounded border transition-colors ${
                    canCraft(selected)
                      ? 'text-rf-success bg-rf-success/10 border-rf-success/30 hover:bg-rf-success/20 cursor-pointer'
                      : 'text-rf-text-dim bg-rf-surface-muted border-rf-border-muted cursor-not-allowed opacity-50'
                  }`}
                  onClick={handleCraft}
                  disabled={!canCraft(selected)}
                >
                  CRAFT ITEM
                </button>
              </div>
            )}
          </div>
        </div>
      </PanelShell>
    </div>
  );
}
