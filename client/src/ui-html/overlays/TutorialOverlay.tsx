import { useSignal } from '@preact/signals';
import { useEffect, useCallback } from 'preact/hooks';
import { showTutorial, tutorialStep, playerId } from '../../store/GameStore';

interface TutorialStepDef {
  title: string;
  text: string;
  waitForKey?: string;
}

const STEPS: TutorialStepDef[] = [
  {
    title: '🏰 Welcome to RealmForge!',
    text: 'Click anywhere on the ground to move your character.\nExplore the world around the town!',
  },
  {
    title: '🛡️ Town Safe Zone',
    text: 'You spawn in TOWN — a safe zone where enemies\ncannot attack you. Explore freely here!',
  },
  {
    title: '🎒 Inventory',
    text: 'Press I to open your Inventory.\nYou start with a weapon and some items.',
    waitForKey: 'I',
  },
  {
    title: '⚔️ Equipment',
    text: 'Press E to open Equipment. Click an item\nin your inventory to equip it!',
    waitForKey: 'E',
  },
  {
    title: '👹 Combat',
    text: 'Walk outside town to find enemies.\nClick an enemy to attack — your character\nauto-attacks if you stay in range.',
  },
  {
    title: '📦 More Features',
    text: 'B = Bank (safe storage, items never lost on death)\nC = Crafting  |  M = Market status (offline)\nENTER = Chat  |  ESC = Close panels\nShift+Click a player to PvP!',
  },
];

const STORAGE_KEY_PREFIX = 'realmforge_tutorial_done_';

/**
 * TutorialOverlay — step-by-step new player guide.
 * Replaces Phaser Tutorial.ts (254 LOC).
 */
export function TutorialOverlay() {
  const step = tutorialStep.value;
  const currentStep = STEPS[step];
  const waitingForKey = useSignal(false);

  const advance = useCallback(() => {
    const next = tutorialStep.value + 1;
    if (next >= STEPS.length) {
      finish();
    } else {
      tutorialStep.value = next;
    }
  }, []);

  const finish = useCallback(() => {
    showTutorial.value = false;
    tutorialStep.value = 0;
    const pid = playerId.value;
    if (pid) {
      localStorage.setItem(STORAGE_KEY_PREFIX + pid, 'true');
    }
  }, []);

  // Key listener for steps that require a specific key press
  useEffect(() => {
    const stepDef = STEPS[tutorialStep.value];
    if (!stepDef?.waitForKey) {
      waitingForKey.value = false;
      return;
    }

    waitingForKey.value = true;
    const targetKey = stepDef.waitForKey.toUpperCase();

    const handler = (e: KeyboardEvent) => {
      if (e.key.toUpperCase() === targetKey) {
        waitingForKey.value = false;
        setTimeout(() => advance(), 300);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tutorialStep.value]);

  if (!showTutorial.value || !currentStep) return null;

  const isLastStep = step === STEPS.length - 1;

  return (
    <div data-interactive class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60">
      <div class="w-[440px] max-w-[calc(100vw-2rem)] rounded-lg border border-rf-border-muted bg-rf-surface/95 shadow-2xl shadow-rf-shadow/60 backdrop-blur-sm">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-2 bg-rf-chrome-header rounded-t-lg border-b border-rf-chrome-trim">
          <span class="text-sm font-bold text-rf-gold">{currentStep.title}</span>
          <button
            class="text-[10px] text-rf-text-dim hover:text-rf-danger border border-rf-border-muted rounded px-2 py-0.5 transition-colors"
            onClick={finish}
          >
            SKIP
          </button>
        </div>

        {/* Body */}
        <div class="px-6 py-5 min-h-[100px] flex flex-col items-center justify-center text-center">
          <p class="text-[14px] text-rf-text-secondary leading-relaxed whitespace-pre-line">
            {currentStep.text}
          </p>

          {currentStep.waitForKey && waitingForKey.value && (
            <p class="mt-4 text-[12px] text-rf-accent italic animate-pulse">
              Press {currentStep.waitForKey} to continue...
            </p>
          )}
        </div>

        {/* Footer */}
        <div class="flex items-center justify-between px-4 py-2 border-t border-rf-chrome-trim bg-rf-chrome-header/50 rounded-b-lg">
          <span class="text-[11px] text-rf-text-dim">
            Step {step + 1} / {STEPS.length}
          </span>

          {!currentStep.waitForKey && (
            <button
              class="px-4 py-1 text-[12px] font-bold text-rf-success bg-rf-success/10 border border-rf-success/30 rounded hover:bg-rf-success/20 transition-colors"
              onClick={advance}
            >
              {isLastStep ? 'START ▶' : 'NEXT ▶'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
