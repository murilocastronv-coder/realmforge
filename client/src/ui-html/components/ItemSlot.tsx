import type { GameItem } from '../../types/gameData';
import { rarityBorderClass, rarityTextClass, rarityName } from '../lib/rarity';
import { getItemIcon, rarityGlowClass } from '../lib/itemIcons';

interface ItemSlotProps {
  item: GameItem | null;
  size?: number;
  label?: string;
  onClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  onMouseMove?: (e: MouseEvent) => void;
  onMouseLeave?: () => void;
}

/**
 * ItemSlot — reusable grid slot for inventory, bank, equipment.
 * Shows item with emoji icon, rarity border, truncated name, quantity badge.
 */
export function ItemSlot({ item, size = 40, label, onClick, onContextMenu, onMouseMove, onMouseLeave }: ItemSlotProps) {
  const borderColor = item ? rarityBorderClass(item.rarity) : 'border-rf-border-muted';
  const textColor = item ? rarityTextClass(item.rarity) : 'text-rf-text-dim';
  const glow = item ? rarityGlowClass(item.rarity) : '';

  const handleContextMenu = (e: MouseEvent) => {
    if (onContextMenu && item) {
      e.preventDefault();
      onContextMenu(e);
    }
  };

  return (
    <button
      class={`relative flex flex-col items-center justify-center border rounded bg-rf-surface-inset/60 hover:bg-rf-surface-inset hover:scale-110 hover:shadow-md hover:shadow-rf-shadow/40 transition-all duration-150 cursor-pointer item-shimmer ${borderColor} ${glow} ${item ? 'border-2' : 'border'}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onMouseMove={onMouseMove as any}
      onMouseLeave={onMouseLeave}
      title={item ? `${item.name} (${rarityName(item.rarity)})` : label ?? 'Empty'}
    >
      {item ? (
        <>
          <span class="text-[16px] leading-none mt-0.5" role="img">
            {getItemIcon(item)}
          </span>
          <span class={`text-[7px] font-bold leading-none text-center truncate w-full px-0.5 ${textColor}`}>
            {item.name.split(' ').pop()?.substring(0, 7) ?? item.name.substring(0, 7)}
          </span>
          {item.quantity > 1 && (
            <span class="absolute bottom-0 right-0.5 text-[8px] font-bold text-rf-gold">
              x{item.quantity}
            </span>
          )}
        </>
      ) : (
        label && <span class="text-[8px] text-rf-text-dim/50">{label}</span>
      )}
    </button>
  );
}
