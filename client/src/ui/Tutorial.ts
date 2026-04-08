import Phaser from 'phaser';

interface TutorialStep {
  title: string;
  text: string;
  waitForKey?: string;
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
 * All elements are added directly to the scene (NOT in a Container)
 * to avoid Phaser's scrollFactor container hit-testing bug.
 */
export class TutorialOverlay {
  private scene: Phaser.Scene;
  private elements: Phaser.GameObjects.GameObject[] = [];
  private backdrop!: Phaser.GameObjects.Rectangle;
  private panel!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private stepText!: Phaser.GameObjects.Text;
  private nextBtn!: Phaser.GameObjects.Text;
  private skipBtn!: Phaser.GameObjects.Text;
  private waitHint!: Phaser.GameObjects.Text;
  private currentStep = 0;
  private active = false;
  private keyListener?: (event: KeyboardEvent) => void;
  private onComplete?: () => void;
  private playerId: string;

  constructor(scene: Phaser.Scene, playerId: string) {
    this.scene = scene;
    this.playerId = playerId;
    const W = 1280;
    const H = 720;
    const DEPTH = 8000;

    // Helper: add element, set scrollFactor(0), track for bulk show/hide
    const add = <T extends Phaser.GameObjects.GameObject & { setScrollFactor(x: number): T; setDepth(d: number): T; setVisible(v: boolean): T }>(obj: T, depth = DEPTH): T => {
      obj.setScrollFactor(0).setDepth(depth).setVisible(false);
      this.elements.push(obj);
      return obj;
    };

    // Dark backdrop — blocks clicks passing through to the game world
    this.backdrop = add(scene.add.rectangle(W / 2, H / 2, W + 200, H + 200, 0x000000, 0.55));
    this.backdrop.setInteractive();

    // Panel
    const pw = 420;
    const ph = 200;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2 - 20;

    this.panel = add(scene.add.rectangle(px, py, pw, ph, 0x111828, 0.95), DEPTH + 1);
    this.panel.setOrigin(0, 0);
    this.panel.setStrokeStyle(2, 0x4488ff);

    // Title
    this.titleText = add(scene.add.text(px + pw / 2, py + 16, '', {
      fontSize: '16px', color: '#f0c040', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0), DEPTH + 2);

    // Body
    this.bodyText = add(scene.add.text(px + pw / 2, py + 52, '', {
      fontSize: '12px', color: '#ccddee', lineSpacing: 6,
      align: 'center',
    }).setOrigin(0.5, 0), DEPTH + 2);

    // Step counter
    this.stepText = add(scene.add.text(px + 12, py + ph - 26, '', {
      fontSize: '9px', color: '#556677',
    }), DEPTH + 2);

    // Wait hint
    this.waitHint = add(scene.add.text(px + pw / 2, py + ph - 50, '', {
      fontSize: '11px', color: '#88aacc', fontStyle: 'italic',
    }).setOrigin(0.5, 0), DEPTH + 2);

    // Next button — depth higher than backdrop so it wins hit test
    this.nextBtn = add(scene.add.text(px + pw - 80, py + ph - 30, 'Next ▶', {
      fontSize: '13px', color: '#44ff88', fontStyle: 'bold',
      backgroundColor: '#223344', padding: { x: 8, y: 4 },
    }), DEPTH + 3);
    this.nextBtn.setInteractive({ useHandCursor: true });
    this.nextBtn.on('pointerdown', () => this.advance());
    this.nextBtn.on('pointerover', () => this.nextBtn.setColor('#88ffbb'));
    this.nextBtn.on('pointerout', () => this.nextBtn.setColor('#44ff88'));

    // Skip button
    this.skipBtn = add(scene.add.text(px + pw - 80, py + 8, 'Skip ✕', {
      fontSize: '10px', color: '#888888',
      backgroundColor: '#1a1a2e', padding: { x: 6, y: 3 },
    }), DEPTH + 3);
    this.skipBtn.setInteractive({ useHandCursor: true });
    this.skipBtn.on('pointerdown', () => this.finish());
    this.skipBtn.on('pointerover', () => this.skipBtn.setColor('#cccccc'));
    this.skipBtn.on('pointerout', () => this.skipBtn.setColor('#888888'));
  }

  startIfNew(): void {
    const key = STORAGE_KEY_PREFIX + this.playerId;
    if (localStorage.getItem(key) === 'true') return;
    this.start();
  }

  start(): void {
    this.currentStep = 0;
    this.active = true;
    this.setAllVisible(true);
    this.showStep();
  }

  setOnComplete(handler: () => void): void {
    this.onComplete = handler;
  }

  isActive(): boolean {
    return this.active;
  }

  private setAllVisible(visible: boolean): void {
    for (const el of this.elements) {
      (el as any).setVisible(visible);
    }
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
    this.setAllVisible(false);
    this.clearKeyListener();
    localStorage.setItem(STORAGE_KEY_PREFIX + this.playerId, 'true');
    if (this.onComplete) this.onComplete();
  }

  private listenForKey(key: string): void {
    this.clearKeyListener();
    this.keyListener = (e: KeyboardEvent) => {
      if (e.key.toUpperCase() === key.toUpperCase()) {
        this.clearKeyListener();
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
    for (const el of this.elements) el.destroy();
    this.elements.length = 0;
  }
}
