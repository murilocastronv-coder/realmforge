import { signal, type ReadonlySignal } from '@preact/signals';

type FocusOwner = string; // e.g. 'chat', 'inventory-search', 'login-username'

/**
 * InputGate — Centralized focus and input management between Phaser and HTML UI.
 * 
 * When an HTML element claims focus (e.g., chat input), Phaser keyboard input
 * is suppressed. When mouse is over a UI panel, game clicks are blocked.
 * 
 * Usage:
 *   InputGate.claimFocus('chat')     → typing goes to chat, not game
 *   InputGate.releaseFocus('chat')   → keyboard returns to game
 *   InputGate.claimPointer('inventory') → clicks on panel don't move player
 *   InputGate.releasePointer('inventory')
 */
class InputGateManager {
  // Active focus owners (keyboard)
  private _focusOwners = signal<Set<FocusOwner>>(new Set());
  // Active pointer owners (mouse)
  private _pointerOwners = signal<Set<FocusOwner>>(new Set());

  // Phaser keyboard manager reference
  private _phaserKeyboard: { enabled: boolean } | null = null;

  /** True when any HTML element has keyboard focus */
  get hasFocus(): boolean {
    return this._focusOwners.value.size > 0;
  }

  /** True when pointer is over an interactive UI element */
  get hasPointer(): boolean {
    return this._pointerOwners.value.size > 0;
  }

  /** Reactive signal — true when game should receive keyboard input */
  get gameKeyboardActive(): ReadonlySignal<boolean> {
    // We return a computed-like check
    return {
      value: this._focusOwners.value.size === 0,
      peek: () => this._focusOwners.peek().size === 0,
      subscribe: (fn: (val: boolean) => void) => {
        return this._focusOwners.subscribe((owners) => fn(owners.size === 0));
      },
      brand: Symbol.for('preact-signals'),
      toJSON: () => this._focusOwners.value.size === 0,
    } as unknown as ReadonlySignal<boolean>;
  }

  /**
   * Register Phaser's keyboard manager so we can enable/disable it.
   */
  setPhaserKeyboard(keyboard: { enabled: boolean }): void {
    this._phaserKeyboard = keyboard;
  }

  /**
   * Claim keyboard focus for a UI element.
   * Disables Phaser keyboard while any HTML element has focus.
   */
  claimFocus(owner: FocusOwner): void {
    const next = new Set(this._focusOwners.value);
    next.add(owner);
    this._focusOwners.value = next;
    this.syncPhaserKeyboard();
  }

  /**
   * Release keyboard focus for a UI element.
   * Re-enables Phaser keyboard when no HTML elements have focus.
   */
  releaseFocus(owner: FocusOwner): void {
    const next = new Set(this._focusOwners.value);
    next.delete(owner);
    this._focusOwners.value = next;
    this.syncPhaserKeyboard();
  }

  /**
   * Claim pointer (mouse) for a UI element.
   * Game should not process clicks while pointer is over UI.
   */
  claimPointer(owner: FocusOwner): void {
    const next = new Set(this._pointerOwners.value);
    next.add(owner);
    this._pointerOwners.value = next;
  }

  /**
   * Release pointer for a UI element.
   */
  releasePointer(owner: FocusOwner): void {
    const next = new Set(this._pointerOwners.value);
    next.delete(owner);
    this._pointerOwners.value = next;
  }

  /**
   * Check if game should process a click event.
   * Returns false if pointer is over any UI element.
   */
  shouldGameProcessClick(): boolean {
    return this._pointerOwners.value.size === 0;
  }

  /**
   * Check if game should process keyboard input.
   * Returns false if any HTML element has focus.
   */
  shouldGameProcessKey(): boolean {
    return this._focusOwners.value.size === 0;
  }

  private syncPhaserKeyboard(): void {
    if (this._phaserKeyboard) {
      this._phaserKeyboard.enabled = this._focusOwners.value.size === 0;
    }
  }

  /** Reset all claims */
  reset(): void {
    this._focusOwners.value = new Set();
    this._pointerOwners.value = new Set();
    this.syncPhaserKeyboard();
  }
}

export const InputGate = new InputGateManager();
