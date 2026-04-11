import { signal, useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

// ─── Loading State ───────────────────────────────────────────

export const isLoading = signal(true);
export const loadingProgress = signal(0);
export const loadingMessage = signal('Connecting to realm...');

const LOADING_TIPS = [
  "💡 Press I to open your inventory",
  "💡 Use the mouse wheel to zoom in and out",
  "💡 Press Q to open the quest log",
  "💡 Type /help in chat for available commands",
  "💡 Hold Shift and click to auto-attack enemies",
  "💡 Visit NPCs for quests and dialogue",
  "💡 Equipment with higher rarity has better stats",
  "💡 Press ESC to close all open panels",
  "💡 Use keys 1-6 to activate skills",
  "💡 Deposit items in the bank for safe storage",
  "💡 Different biomes have different enemy types",
  "💡 Craft items at crafting stations near NPCs",
  "💡 Your stats are preserved while playing",
  "💡 Check the minimap for nearby enemies",
  "💡 Rare items have colored borders",
];

export function setLoadingProgress(progress: number, message?: string): void {
  loadingProgress.value = Math.min(progress, 100);
  if (message) loadingMessage.value = message;
  if (progress >= 100) {
    setTimeout(() => { isLoading.value = false; }, 500);
  }
}

// ─── Loading Screen Component ───────────────────────────────

export function LoadingScreen() {
  const loading = useComputed(() => isLoading.value);
  const progress = useComputed(() => loadingProgress.value);
  const message = useComputed(() => loadingMessage.value);
  const tipRef = useRef(LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);

  // Cycle tips every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      tipRef.current = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  if (!loading.value) return null;

  return (
    <div
      data-interactive
      class="fixed inset-0 z-[100] bg-gradient-to-b from-[#0a0f16] via-[#111827] to-[#0a0f16] flex flex-col items-center justify-center"
    >
      {/* Stars background */}
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            class="absolute rounded-full bg-white"
            style={{
              width: `${1 + Math.random() * 2}px`,
              height: `${1 + Math.random() * 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.2 + Math.random() * 0.5,
              animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* Logo */}
      <div class="text-center mb-8 relative">
        <div class="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-yellow-400 to-amber-600 tracking-wider">
          ⚔️ RealmForge
        </div>
        <div class="text-xs text-rf-muted mt-2 tracking-[0.3em] uppercase">The Infinite Realm</div>
      </div>

      {/* Progress bar */}
      <div class="w-[320px] max-w-[80vw] relative">
        <div class="h-2 bg-rf-surface-inset/50 rounded-full overflow-hidden border border-rf-border/20">
          <div
            class="h-full bg-gradient-to-r from-rf-accent to-amber-400 rounded-full transition-all duration-500 relative"
            style={{ width: `${progress.value}%` }}
          >
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>
        <div class="flex justify-between mt-1.5 text-[10px] text-rf-muted">
          <span>{message.value}</span>
          <span class="font-mono">{Math.round(progress.value)}%</span>
        </div>
      </div>

      {/* Loading tip */}
      <div class="mt-12 text-center">
        <div class="text-xs text-rf-muted/60 max-w-[300px]">{tipRef.current}</div>
      </div>
    </div>
  );
}
