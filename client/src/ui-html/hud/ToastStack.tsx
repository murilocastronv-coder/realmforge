import { signal, computed } from '@preact/signals';

/* ── Toast types ── */
export type ToastType = 'info' | 'success' | 'warning' | 'danger';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  icon: string;
  exiting: boolean;
}

/* ── State ── */
const toasts = signal<Toast[]>([]);
let nextId = 0;

const TOAST_DURATION = 3500;
const EXIT_DURATION = 250;
const MAX_TOASTS = 5;

/* ── Public API ── */
export function showToast(message: string, type: ToastType = 'info', icon?: string) {
  const id = nextId++;
  const defaultIcons: Record<ToastType, string> = {
    info: 'ℹ️', success: '✅', warning: '⚠️', danger: '❌',
  };
  const toast: Toast = { id, message, type, icon: icon ?? defaultIcons[type], exiting: false };

  toasts.value = [...toasts.value, toast].slice(-MAX_TOASTS);

  // Auto-dismiss
  setTimeout(() => dismissToast(id), TOAST_DURATION);
}

function dismissToast(id: number) {
  // Mark exiting for CSS animation
  toasts.value = toasts.value.map(t => t.id === id ? { ...t, exiting: true } : t);
  // Remove after exit animation
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, EXIT_DURATION);
}

/* ── Color maps ── */
const borderColors: Record<ToastType, string> = {
  info: 'border-rf-accent',
  success: 'border-rf-success',
  warning: 'border-rf-warning',
  danger: 'border-rf-danger',
};

const textColors: Record<ToastType, string> = {
  info: 'text-rf-accent',
  success: 'text-rf-success',
  warning: 'text-rf-warning',
  danger: 'text-rf-danger',
};

const glowColors: Record<ToastType, string> = {
  info: 'shadow-[0_0_8px_rgba(115,182,255,0.15)]',
  success: 'shadow-[0_0_8px_rgba(89,209,140,0.15)]',
  warning: 'shadow-[0_0_8px_rgba(241,174,85,0.15)]',
  danger: 'shadow-[0_0_8px_rgba(233,107,99,0.15)]',
};

/* ── Component ── */
export function ToastStack() {
  const list = computed(() => toasts.value);

  if (list.value.length === 0) return null;

  return (
    <div data-interactive class="fixed top-16 right-4 flex flex-col gap-1.5 z-50 w-64">
      {list.value.map(toast => (
        <div
          key={toast.id}
          class={`flex items-center gap-2 px-3 py-2 rounded border-l-2 ${borderColors[toast.type]} bg-rf-surface/95 backdrop-blur-sm ${glowColors[toast.type]} ${toast.exiting ? 'animate-toast-out' : 'animate-toast-in'}`}
          onClick={() => dismissToast(toast.id)}
        >
          <span class="text-sm flex-shrink-0">{toast.icon}</span>
          <span class={`text-[11px] leading-tight ${textColors[toast.type]}`}>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
