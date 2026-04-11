import { useSignal, useComputed, useSignalEffect } from '@preact/signals';
import { openPanels, togglePanel, commands, gold, inventory, auctionState } from '../../store/GameStore';
import { getItemStats, type GameItem, type SlottedGameItem } from '../../types/gameData';
import { PanelShell } from '../components/PanelShell';
import { ItemSlot } from '../components/ItemSlot';
import { rarityTextClass, rarityName } from '../lib/rarity';

// ─── NPC Shop (kept as "Merchant" tab) ──────────────────────
const NPC_SHOP: { id: string; item: GameItem; price: number }[] = [
  { id: 'shop_health_potion', item: { id: 'health_potion', templateId: 'health_potion', name: 'Health Potion', rarity: 0, itemType: 'Consumable', slot: null, stackable: true, quantity: 1, level: 1, stats: { HP: 50 }, description: 'Restores 50 HP.', affixes: [] }, price: 25 },
  { id: 'shop_greater_health_potion', item: { id: 'greater_health_potion', templateId: 'greater_health_potion', name: 'Greater Health Potion', rarity: 1, itemType: 'Consumable', slot: null, stackable: true, quantity: 1, level: 5, stats: { HP: 150 }, description: 'Restores 150 HP.', affixes: [] }, price: 80 },
  { id: 'shop_wooden_sword', item: { id: 'wooden_sword', templateId: 'wooden_sword', name: 'Wooden Sword', rarity: 0, itemType: 'Weapon', slot: 'weapon', stackable: false, quantity: 1, level: 1, stats: { ATK: 3 }, description: 'A basic practice sword.', affixes: [] }, price: 50 },
  { id: 'shop_iron_sword', item: { id: 'iron_sword', templateId: 'iron_sword', name: 'Iron Sword', rarity: 0, itemType: 'Weapon', slot: 'weapon', stackable: false, quantity: 1, level: 3, stats: { ATK: 8 }, description: 'A sturdy iron blade.', affixes: [] }, price: 150 },
  { id: 'shop_leather_armor', item: { id: 'leather_armor', templateId: 'leather_armor', name: 'Leather Armor', rarity: 0, itemType: 'Armor', slot: 'armor', stackable: false, quantity: 1, level: 1, stats: { DEF: 3 }, description: 'Light armor.', affixes: [] }, price: 75 },
  { id: 'shop_iron_helm', item: { id: 'iron_helm', templateId: 'iron_helm', name: 'Iron Helm', rarity: 0, itemType: 'Armor', slot: 'helmet', stackable: false, quantity: 1, level: 3, stats: { DEF: 5 }, description: 'Sturdy headpiece.', affixes: [] }, price: 120 },
];

function getSellPrice(item: GameItem): number {
  const rarityMult = [10, 30, 100, 300, 1000, 5000];
  const levelMult = [5, 15, 40, 100, 300, 1000];
  const base = (rarityMult[item.rarity] ?? 5) + (item.level * (levelMult[item.rarity] ?? 5));
  return Math.max(1, Math.floor(base * 0.4));
}

const CATEGORIES = ['All', 'Weapon', 'Armor', 'Consumable', 'Material'] as const;

/**
 * MarketplacePanel — Auction House + NPC Merchant
 */
export function MarketplacePanel() {
  const isOpen = useComputed(() => openPanels.value.has('marketplace'));
  const tab = useSignal<'auction' | 'sell' | 'my' | 'merchant'>('auction');
  const selectedIdx = useSignal(-1);
  const priceInput = useSignal('');
  const category = useSignal('All');
  const playerGold = useComputed(() => gold.value);
  const auction = useComputed(() => auctionState.value);

  // Request listings when panel opens
  useSignalEffect(() => {
    if (isOpen.value) {
      try { commands.auctionBrowse('all'); } catch {}
    }
  });

  if (!isOpen.value) return null;

  const listings = auction.value.listings;
  const myListings = auction.value.myListings;
  const playerItems = inventory.value.filter((si): si is SlottedGameItem => si !== null);

  // Filter by category
  const filtered = category.value === 'All'
    ? listings
    : listings.filter(l => l.item.itemType?.toLowerCase() === category.value.toLowerCase());

  return (
    <div class="fixed top-16 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)]">
      <PanelShell
        title="⚔️ Auction House"
        onClose={() => togglePanel('marketplace')}
        width="w-[480px] max-w-full"
      >
        {/* Tabs */}
        <div class="flex items-center gap-1 mb-1.5">
          {(['auction', 'sell', 'my', 'merchant'] as const).map(t => (
            <button
              key={t}
              class={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded border transition-colors ${
                tab.value === t
                  ? 'text-rf-accent bg-rf-accent/10 border-rf-accent/30'
                  : 'text-rf-text-dim bg-rf-surface-muted border-rf-border-muted hover:text-rf-text-muted'
              }`}
              onClick={() => { tab.value = t; selectedIdx.value = -1; }}
            >
              {{ auction: '🏪 Browse', sell: '💰 Sell', my: '📋 My Listings', merchant: '🛒 NPC Shop' }[t]}
            </button>
          ))}
          <span class="flex-1" />
          <span class="text-[10px] text-rf-gold font-bold">💰 {playerGold.value.toLocaleString()}g</span>
        </div>

        {/* ─── BROWSE TAB ─── */}
        {tab.value === 'auction' && (
          <>
            {/* Category filter */}
            <div class="flex gap-1 mb-1.5">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  class={`px-2 py-0.5 text-[9px] rounded border ${
                    category.value === c
                      ? 'text-rf-text-primary bg-rf-surface-inset-warm border-rf-accent/40'
                      : 'text-rf-text-dim border-rf-border-muted hover:text-rf-text-muted'
                  }`}
                  onClick={() => { category.value = c; selectedIdx.value = -1; }}
                >
                  {c}
                </button>
              ))}
              <button
                class="ml-auto px-2 py-0.5 text-[9px] text-rf-text-dim border border-rf-border-muted rounded hover:text-rf-text-muted"
                onClick={() => commands.auctionBrowse(category.value === 'All' ? 'all' : category.value)}
              >
                🔄 Refresh
              </button>
            </div>

            {/* Listings table */}
            <div class="rounded bg-rf-surface-inset/50 border border-rf-chrome-trim/40 mb-1.5 overflow-hidden">
              <div class="grid grid-cols-[1fr_70px_90px] gap-1 px-2 py-1 border-b border-rf-chrome-trim/30">
                <span class="text-[10px] font-bold text-rf-text-dim uppercase">Item</span>
                <span class="text-[10px] font-bold text-rf-text-dim uppercase">Price</span>
                <span class="text-[10px] font-bold text-rf-text-dim uppercase">Seller</span>
              </div>
              <div class="max-h-[180px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <div class="text-[11px] text-rf-text-dim italic py-4 text-center">No listings found</div>
                ) : filtered.map((l, i) => (
                  <button
                    key={l.id}
                    class={`w-full grid grid-cols-[1fr_70px_90px] gap-1 px-2 py-0.5 text-left transition-colors ${
                      selectedIdx.value === i ? 'bg-rf-surface-inset-warm' : 'hover:bg-rf-surface-muted/30'
                    }`}
                    onClick={() => { selectedIdx.value = i; }}
                  >
                    <span class={`text-[11px] truncate ${rarityTextClass(l.item.rarity)}`}>
                      {l.item.name}
                    </span>
                    <span class="text-[11px] text-rf-gold">{l.price.toLocaleString()}g</span>
                    <span class="text-[11px] text-rf-text-dim truncate">{l.seller}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected detail + buy */}
            {selectedIdx.value >= 0 && selectedIdx.value < filtered.length && (() => {
              const sel = filtered[selectedIdx.value];
              return (
                <div class="rounded bg-rf-surface-muted/40 border border-rf-chrome-trim/40 p-2">
                  <div class="flex gap-3">
                    <div class="flex-1 space-y-0.5">
                      <div class={`text-[12px] font-bold ${rarityTextClass(sel.item.rarity)}`}>
                        {sel.item.name}
                      </div>
                      <div class="text-[10px] text-rf-text-dim">
                        {rarityName(sel.item.rarity)} · Lv.{sel.item.level} · {sel.item.itemType}
                      </div>
                      {Object.keys(getItemStats(sel.item)).length > 0 && (
                        <div class="text-[10px] text-rf-text-secondary">
                          {Object.entries(getItemStats(sel.item)).map(([k, v]) => `${k}: +${v}`).join(' · ')}
                        </div>
                      )}
                      {sel.item.description && (
                        <div class="text-[10px] text-rf-text-dim italic">{sel.item.description}</div>
                      )}
                      <div class="text-[11px] text-rf-gold font-bold mt-1">Price: {sel.price.toLocaleString()}g</div>
                    </div>
                    <button
                      class={`self-end px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                        playerGold.value >= sel.price
                          ? 'text-rf-success bg-rf-success/10 border-rf-success/30 hover:bg-rf-success/20'
                          : 'text-rf-text-dim bg-rf-surface-muted border-rf-border-muted opacity-50 cursor-not-allowed'
                      }`}
                      onClick={() => {
                        commands.auctionBuy(sel.id);
                        selectedIdx.value = -1;
                      }}
                      disabled={playerGold.value < sel.price}
                    >
                      BUY
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ─── SELL TAB ─── */}
        {tab.value === 'sell' && (
          <>
            <div class="rounded bg-rf-surface-inset/50 border border-rf-chrome-trim/40 mb-1.5 p-2">
              <div class="text-[10px] text-rf-text-dim mb-1.5 font-bold uppercase">Click an item to list on auction (5% fee)</div>
              {playerItems.length === 0 ? (
                <div class="text-[11px] text-rf-text-dim italic py-4 text-center">Inventory empty</div>
              ) : (
                <div class="grid grid-cols-8 gap-1 max-h-[140px] overflow-y-auto">
                  {playerItems.map((si, i) => (
                    <div
                      key={si.slotIndex}
                      class={`cursor-pointer rounded transition-all ${selectedIdx.value === i ? 'ring-2 ring-rf-gold scale-110' : ''}`}
                      onClick={() => { selectedIdx.value = i; }}
                    >
                      <ItemSlot item={si} size={38} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedIdx.value >= 0 && selectedIdx.value < playerItems.length && (() => {
              const si = playerItems[selectedIdx.value];
              const suggestedPrice = getSellPrice(si) * 3;
              const price = parseInt(priceInput.value) || suggestedPrice;
              const fee = Math.max(1, Math.ceil(price * 0.05));
              return (
                <div class="rounded bg-rf-surface-muted/40 border border-rf-chrome-trim/40 p-2 space-y-1">
                  <div class={`text-[12px] font-bold ${rarityTextClass(si.rarity)}`}>{si.name}</div>
                  <div class="text-[10px] text-rf-text-dim">{rarityName(si.rarity)} · Lv.{si.level}</div>
                  <div class="flex items-center gap-2 mt-1">
                    <label class="text-[10px] text-rf-text-dim">Price:</label>
                    <input
                      type="number"
                      class="w-24 px-2 py-0.5 text-[11px] bg-rf-surface-inset border border-rf-chrome-trim/40 rounded text-rf-gold"
                      placeholder={String(suggestedPrice)}
                      value={priceInput.value}
                      onInput={(e) => { priceInput.value = (e.target as HTMLInputElement).value; }}
                    />
                    <span class="text-[10px] text-rf-text-dim">Fee: {fee}g</span>
                  </div>
                  <button
                    class={`mt-1 px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                      playerGold.value >= fee
                        ? 'text-rf-warning bg-rf-warning/10 border-rf-warning/30 hover:bg-rf-warning/20'
                        : 'text-rf-text-dim bg-rf-surface-muted border-rf-border-muted opacity-50 cursor-not-allowed'
                    }`}
                    onClick={() => {
                      commands.auctionList(si.slotIndex, price);
                      selectedIdx.value = -1;
                      priceInput.value = '';
                    }}
                    disabled={playerGold.value < fee}
                  >
                    LIST FOR {price.toLocaleString()}g
                  </button>
                </div>
              );
            })()}
          </>
        )}

        {/* ─── MY LISTINGS TAB ─── */}
        {tab.value === 'my' && (
          <div class="rounded bg-rf-surface-inset/50 border border-rf-chrome-trim/40 p-2">
            {myListings.length === 0 ? (
              <div class="text-[11px] text-rf-text-dim italic py-4 text-center">No active listings</div>
            ) : myListings.map(l => (
              <div key={l.id} class="flex items-center gap-2 py-1 border-b border-rf-chrome-trim/20 last:border-0">
                <span class={`flex-1 text-[11px] ${rarityTextClass(l.item.rarity)}`}>{l.item.name}</span>
                <span class="text-[11px] text-rf-gold">{l.price.toLocaleString()}g</span>
                <button
                  class="px-2 py-0.5 text-[10px] text-rf-error border border-rf-error/30 rounded hover:bg-rf-error/10"
                  onClick={() => commands.auctionCancel(l.id)}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ─── NPC MERCHANT TAB ─── */}
        {tab.value === 'merchant' && (
          <>
            <div class="rounded bg-rf-surface-inset/50 border border-rf-chrome-trim/40 mb-1.5 overflow-hidden">
              <div class="max-h-[200px] overflow-y-auto">
                {NPC_SHOP.map((s, i) => (
                  <button
                    key={s.id}
                    class={`w-full flex items-center gap-2 px-2 py-1 text-left transition-colors ${
                      selectedIdx.value === i ? 'bg-rf-surface-inset-warm' : 'hover:bg-rf-surface-muted/30'
                    }`}
                    onClick={() => { selectedIdx.value = i; }}
                  >
                    <span class={`flex-1 text-[11px] ${rarityTextClass(s.item.rarity)}`}>{s.item.name}</span>
                    <span class="text-[11px] text-rf-gold">{s.price}g</span>
                  </button>
                ))}
              </div>
            </div>
            {selectedIdx.value >= 0 && selectedIdx.value < NPC_SHOP.length && (() => {
              const sel = NPC_SHOP[selectedIdx.value];
              return (
                <div class="rounded bg-rf-surface-muted/40 border border-rf-chrome-trim/40 p-2">
                  <div class="flex gap-3">
                    <div class="flex-1 space-y-0.5">
                      <div class={`text-[12px] font-bold ${rarityTextClass(sel.item.rarity)}`}>{sel.item.name}</div>
                      <div class="text-[10px] text-rf-text-dim">{sel.item.description}</div>
                      {Object.keys(getItemStats(sel.item)).length > 0 && (
                        <div class="text-[10px] text-rf-text-secondary">
                          {Object.entries(getItemStats(sel.item)).map(([k, v]) => `${k}: +${v}`).join(' · ')}
                        </div>
                      )}
                    </div>
                    <button
                      class={`self-end px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                        playerGold.value >= sel.price
                          ? 'text-rf-success bg-rf-success/10 border-rf-success/30 hover:bg-rf-success/20'
                          : 'text-rf-text-dim bg-rf-surface-muted border-rf-border-muted opacity-50 cursor-not-allowed'
                      }`}
                      onClick={() => commands.buyItem(sel.id)}
                      disabled={playerGold.value < sel.price}
                    >
                      BUY {sel.price}g
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </PanelShell>
    </div>
  );
}
