import type { ComponentChildren } from 'preact';
import { InputGate } from '../../services/InputGate';

interface PanelShellProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  width?: string;
  className?: string;
}

/**
 * PanelShell — reusable game panel with header, close button, and body.
 * Manages InputGate pointer claims on hover.
 * Opens with a slide-in + fade animation.
 */
export function PanelShell({ title, onClose, children, width = 'w-80', className = '' }: PanelShellProps) {
  const panelId = `panel-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div
      data-interactive
      data-panel-shell
      data-panel-title={title}
      class={`${width} flex flex-col rounded border border-rf-border-muted bg-rf-surface/95 shadow-lg shadow-rf-shadow/50 backdrop-blur-sm animate-panel-in ${className}`}
      onMouseEnter={() => InputGate.claimPointer(panelId)}
      onMouseLeave={() => InputGate.releasePointer(panelId)}
    >
      {/* Header */}
      <div class="flex items-center justify-between px-3 py-1.5 bg-rf-chrome-header rounded-t border-b border-rf-chrome-trim">
        <span class="text-[11px] font-bold tracking-wider text-rf-gold uppercase">{title}</span>
        <button
          class="rf-panel-close text-rf-text-dim hover:text-rf-danger transition-colors text-sm leading-none px-1" aria-label="Fechar painel"
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div class="flex-1 p-2 overflow-auto">
        {children}
      </div>
    </div>
  );
}
