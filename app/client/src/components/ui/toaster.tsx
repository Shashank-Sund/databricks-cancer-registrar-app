import * as React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useUiStore, type Toast } from '@/store/uiStore';
import { cn } from '@/lib/utils';

const ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const ACCENT = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
} as const;

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  const Icon = ICON[toast.variant];

  React.useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), 3200);
    return () => clearTimeout(t);
  }, [toast.id, dismiss]);

  return (
    <div
      className="pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] animate-slide-in-right items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-lg"
      role="status"
      data-testid="toast"
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ACCENT[toast.variant])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-card-foreground">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}
