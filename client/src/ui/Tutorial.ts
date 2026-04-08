import Phaser from 'phaser';

interface TutorialStep {
  title: string;
  text: string;
  /** Optional: wait for this key press before allowing "Next" */
  waitForKey?: string;
  /** Optional: highlight a screen area {x, y, w, h} in scroll-factor-0 coords */
  highlight?: { x: number; y: number; w: number; h: number };
}

const STEPS: TutorialStep[] = [
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
    text: 'B = Bank (safe storage, items never lost on death)\nC = Crafting  |  M = Marketplace\nENTER = Chat  |  ESC = Close panels\nShift+Click a player to PvP!',
  },
];

const STORAGE_KEY_PREFIX = 'realmforge_tutorial_done_';

/**
 * TutorialOverlay — step-by-step new player guide.
 * Shows once per player (stored in localStorage keyed by playerId).
 * Can be re-triggered with /tutorial chat command.
 */
export class TutorialOverlay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private backdrop: Phaser.GameObjects.Rectangle;
  private panel: Phaser.GameObjects.Rectangle;
  private titleText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private stepText: Phaser.GameObjects.Text;
  private nextBtn: Phaser.GameObjects.Text;
  private skipBtn: Phaser.GameObjects.Text;
  private waitHint: Phaser.GameObjects.Text;
  private currentStep = 0;
  private active = false;
  private keyListener?: (event: KeyboardEvent) => void;
  private onComplete?: () => void;
  private playerId: string;

  constructor(scene: Phaser.Scene, playerId: string) {
    this.scene = scene;
    this.playerId = playerId;
    const width = 1280;  // GAME_WIDTH
    const height = 720;  // GAME_HEIGHT

    this.container = scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(8000);
    this.container.setVisible(false);

    // Dark backdrop
    this.backdrop = scene.add.rectangle(width / 2, height / 2, width + 100, height + 100, 0x000000, 0.55);
    this.container.add(this.backdrop);

    // Panel
    const pw = 420;
    const ph = 200;
    const px = width / 2 - pw / 2;
    const py = height / 2 - ph / 2 - 20;

    this.panel = scene.add.rectangle(px, py, pw, ph, 0x111828, 0.95);
    this.panel.setOrigin(0, 0);
    this.panel.setStrokeStyle(2, 0x4488ff);
    this.container.add(this.panel);

    // Title
    this.titleText = scene.add.text(px + pw / 2, py + 16, '', {
      fontSize: '16px', color: '#f0c040', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.container.add(this.titleText);

    // Body
    this.bodyText = scene.add.text(px + pw / 2, py + 52, '', {
      fontSize: '12px', color: '#ccddeee', lineSpacing: 6,
      align: 'center',
    }).setOrigin(0.5, 0);
    this.container.add(this.bodyText);

    // Step counter
    this.stepText = scene.add.text(px + 12, py + ph - 26, '', {
      fontSize: '9px', color: '#556677',
    });
    this.container.add(this.stepText);

    // Wait hint (e.g., "Press I to continue...")
    this.waitHint = scene.add.text(px + pw / 2, py + ph - 50, '', {
      fontSize: '11px', color: '#88aacc', fontStyle: 'italic',
    }).setOrigin(0.5, 0);
    this.container.add(this.waitHint);

    // Next button
    this.nextBtn = scene.add.text(px + pw - 80, py + ph - 30, 'Next ▶', {
      fontSize: '13px', color: '#44ff88', fontStyle: 'bold',
    }).setInteractive({ useHandCursor: true });
    this.nextBtn.on('pointerdown', () => this.advance());
    this.nextBtn.on('pointerover', () => this.nextBtn.setColor('#88ffbb'));
    this.nextBtn.on('pointerout', () => this.nextBtn.setColor('#44ff88'));
    this.container.add(this.nextBtn);

    // Skip button
    this.skipBtn = scene.add.text(px + pw - 80, py + 8, 'Skip ✕', {
      fontSize: '10px', color: '#888888',
    }).setInteractive({ useHandCursor: true });
    this.skipBtn.on('pointerdown', () => this.finish());
    this.skipBtn.on('pointerover', () => this.skipBtn.setColor('#cccccc'));
    this.skipBtn.on('pointerout', () => this.skipBtn.setColor('#888888'));
    this.container.add(this.skipBtn);
  }

  /** Start the tutorial if not already completed for this player */
  startIfNew(): void {
    const key = STORAGE_KEY_PREFIX + this.playerId;
    if (localStorage.getItem(key) === 'true') return;
    this.start();
  }

  /** Force-start the tutorial (e.g., from /tutorial command) */
  start(): void {
    this.currentStep = 0;
    this.active = true;
    this.container.setVisible(true);
    this.showStep();
  }

  setOnComplete(handler: () => void): void {
    this.onComplete = handler;
  }

  isActive(): boolean {
    return this.active;
  }

  private showStep(): void {
    const step = STEPS[this.currentStep];
    this.titleText.setText(step.title);
    this.bodyText.setText(step.text);
    this.stepText.setText(`Step ${this.currentStep + 1} / ${STEPS.length}`);

    if (step.waitForKey) {
      this.nextBtn.setVisible(false);
      this.waitHint.setText(`Press ${step.waitForKey} to continue...`);
      this.waitHint.setVisible(true);
      this.listenForKey(step.waitForKey);
    } else {
      this.nextBtn.setVisible(true);
      this.waitHint.setVisible(false);
      this.clearKeyListener();
      // Last step shows "Finish" instead of "Next"
      if (this.currentStep === STEPS.length - 1) {
        this.nextBtn.setText('Start Playing! ▶');
      } else {
        this.nextBtn.setText('Next ▶');
      }
    }
  }

  private advance(): void {
    this.currentStep++;
    if (this.currentStep >= STEPS.length) {
      this.finish();
    } else {
      this.showStep();
    }
  }

  private finish(): void {
    this.active = false;
    this.container.setVisible(false);
    this.clearKeyListener();
    localStorage.setItem(STORAGE_KEY_PREFIX + this.playerId, 'true');
    if (this.onComplete) this.onComplete();
  }

  private listenForKey(key: string): void {
    this.clearKeyListener();
    this.keyListener = (e: KeyboardEvent) => {
      if (e.key.toUpperCase() === key.toUpperCase()) {
        this.clearKeyListener();
        // Small delay so the panel opens, then advance
        this.scene.time.delayedCall(300, () => this.advance());
      }
    };
    window.addEventListener('keydown', this.keyListener);
  }

  private clearKeyListener(): void {
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = undefined;
    }
  }

  destroy(): void {
    this.clearKeyListener();
    this.container.destroy();
  }
}
