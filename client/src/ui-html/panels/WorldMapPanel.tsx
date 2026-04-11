import { signal, useComputed, useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { PanelShell } from '../components/PanelShell';
import { playerCoords } from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';

// ─── World Map Panel ─────────────────────────────────────────

const BIOME_COLORS: Record<string, string> = {
  plains: '#4a7c4a',
  forest: '#2d5a2d',
  desert: '#c4a35a',
  snow: '#d4e5f7',
  swamp: '#3a5a3a',
  mountains: '#7a7a7a',
  volcanic: '#8b3a2a',
  ocean: '#2a4a8b',
  default: '#3a4a5a',
};

const POINTS_OF_INTEREST = [
  // Towns (from server world.rs)
  { name: 'Starfall Haven', x: 0, y: 0, icon: '🏰', type: 'town' },
  { name: 'Ironforge Outpost', x: 80, y: 80, icon: '🏭', type: 'town' },
  { name: 'Frostwind Village', x: -85, y: 70, icon: '❄️', type: 'town' },
  { name: 'Shadowmere', x: -75, y: -80, icon: '🌑', type: 'town' },
  { name: 'Dusthaven', x: 90, y: -75, icon: '🏜️', type: 'town' },
  { name: 'Northwatch Keep', x: 0, y: 120, icon: '🛡️', type: 'town' },
  { name: 'Voidgate Citadel', x: 0, y: -130, icon: '🌀', type: 'town' },
  { name: 'Sunspire', x: 130, y: 0, icon: '☀️', type: 'town' },
  { name: 'Grimhollow', x: -130, y: 0, icon: '💀', type: 'town' },
  // NPCs (Starfall Haven)
  { name: 'Blacksmith', x: 3, y: -2, icon: '⚒️', type: 'npc' },
  { name: 'Market', x: 0, y: -7, icon: '🛒', type: 'npc' },
  { name: 'Bank', x: -4, y: -3, icon: '🏦', type: 'npc' },
  // Zones
  { name: 'Enchanted Forest', x: 15, y: 15, icon: '🌲', type: 'zone' },
  { name: 'Scorching Desert', x: -20, y: 10, icon: '🌵', type: 'zone' },
  { name: 'Crystal Peaks', x: 10, y: -25, icon: '⛰️', type: 'zone' },
  { name: 'Murky Swamp', x: -15, y: -20, icon: '🌿', type: 'zone' },
  { name: 'Dragon\'s Lair', x: 60, y: 60, icon: '🐉', type: 'zone' },
  { name: 'Infernal Wastes', x: -50, y: -60, icon: '🔥', type: 'zone' },
  { name: 'Frozen Tundra', x: -70, y: 50, icon: '🧊', type: 'zone' },
  // Dungeons
  { name: 'Goblin Warren', x: 60, y: 60, icon: '⚔️', type: 'dungeon' },
  { name: 'Frozen Crypt', x: -65, y: 55, icon: '🪦', type: 'dungeon' },
  { name: 'Shadow Dungeon', x: -55, y: -70, icon: '👁️', type: 'dungeon' },
  { name: 'Stone Mines', x: 75, y: -60, icon: '⛏️', type: 'dungeon' },
  { name: 'Void Rift', x: 0, y: -100, icon: '🌀', type: 'dungeon' },
  { name: 'Necropolis', x: -90, y: -40, icon: '💀', type: 'dungeon' },
  { name: 'Infernal Pit', x: 40, y: -85, icon: '🔥', type: 'dungeon' },
  { name: 'Crystal Caverns', x: -30, y: 90, icon: '💎', type: 'dungeon' },
  { name: 'Abyssal Depths', x: 100, y: -90, icon: '🌊', type: 'dungeon' },
];

interface WorldMapPanelProps {
  onClose: () => void;
}

export function WorldMapPanel({ onClose }: WorldMapPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapZoom = useSignal(2); // px per tile
  const mapOffsetX = useSignal(0);
  const mapOffsetY = useSignal(0);
  const coords = useComputed(() => playerCoords.value);
  const hoveredPoi = useSignal<string | null>(null);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const zoom = mapZoom.value;
    const cx = coords.value.x;
    const cy = coords.value.y;
    const ox = mapOffsetX.value;
    const oy = mapOffsetY.value;

    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.fillStyle = '#1a2332';
    ctx.fillRect(0, 0, width, height);

    // Grid
    const gridSize = zoom;
    ctx.strokeStyle = 'rgba(82,106,137,0.1)';
    ctx.lineWidth = 0.5;
    const startX = (width / 2 + ox - cx * zoom) % gridSize;
    const startY = (height / 2 + oy - cy * zoom) % gridSize;
    for (let x = startX; x < width; x += gridSize * 5) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = startY; y < height; y += gridSize * 5) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Points of interest
    for (const poi of POINTS_OF_INTEREST) {
      const px = width / 2 + (poi.x - cx) * zoom + ox;
      const py = height / 2 + (poi.y - cy) * zoom + oy;

      if (px < -20 || px > width + 20 || py < -20 || py > height + 20) continue;

      ctx.font = '14px serif';
      ctx.textAlign = 'center';
      ctx.fillText(poi.icon, px, py + 5);

      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = poi.type === 'town' ? '#f0c35b' : poi.type === 'dungeon' ? '#ff6b6b' : '#9dacbf';
      ctx.textAlign = 'center';
      ctx.fillText(poi.name, px, py + 18);
    }

    // Player dot
    const playerScreenX = width / 2 + ox;
    const playerScreenY = height / 2 + oy;
    ctx.beginPath();
    ctx.arc(playerScreenX, playerScreenY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#59d18c';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Player direction indicator
    ctx.font = '10px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('▲', playerScreenX, playerScreenY - 8);

    // Compass
    ctx.font = 'bold 10px "JetBrains Mono"';
    ctx.fillStyle = '#9dacbf';
    ctx.fillText('N', width / 2, 14);
    ctx.fillText('S', width / 2, height - 6);
    ctx.fillText('W', 10, height / 2 + 4);
    ctx.fillText('E', width - 10, height / 2 + 4);

    // Coords display
    ctx.font = '9px "JetBrains Mono"';
    ctx.fillStyle = '#6d8095';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(cx)}, ${Math.round(cy)}`, width - 8, height - 8);

  }, [coords.value, mapZoom.value, mapOffsetX.value, mapOffsetY.value]);

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    mapZoom.value = Math.max(0.5, Math.min(8, mapZoom.value + (e.deltaY > 0 ? -0.3 : 0.3)));
  };

  return (
    <PanelShell title="🗺️ World Map" onClose={onClose} width="w-[480px] max-w-[calc(100vw-2rem)]">
      <div class="relative">
        <canvas
          ref={canvasRef}
          width={440}
          height={320}
          class="rounded-lg border border-rf-border/20 cursor-grab active:cursor-grabbing"
          onWheel={handleWheel as any}
        />

        {/* Zoom controls */}
        <div class="absolute top-2 right-2 flex flex-col gap-1">
          <button
            type="button"
            class="w-6 h-6 text-xs bg-rf-surface/80 border border-rf-border/30 rounded hover:bg-rf-accent/20 text-rf-text"
            onClick={() => { mapZoom.value = Math.min(8, mapZoom.value + 0.5); }}
          >+</button>
          <button
            type="button"
            class="w-6 h-6 text-xs bg-rf-surface/80 border border-rf-border/30 rounded hover:bg-rf-accent/20 text-rf-text"
            onClick={() => { mapZoom.value = Math.max(0.5, mapZoom.value - 0.5); }}
          >−</button>
          <button
            type="button"
            class="w-6 h-6 text-[8px] bg-rf-surface/80 border border-rf-border/30 rounded hover:bg-rf-accent/20 text-rf-text"
            onClick={() => { mapOffsetX.value = 0; mapOffsetY.value = 0; mapZoom.value = 2; }}
            title="Reset view"
          >⟳</button>
        </div>

        {/* Legend */}
        <div class="mt-2 flex gap-3 text-[9px] text-rf-muted justify-center">
          <span>🟢 You</span>
          <span>🏰 Town</span>
          <span>⚒️ NPC</span>
          <span>🌲 Zone</span>
        </div>
      </div>
    </PanelShell>
  );
}
