import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight accessible popover: a trigger button + a floating panel.
 * - opens on click, toggles on re-click
 * - closes on Escape and on outside click
 * - wires aria-expanded / aria-controls for screen readers
 * Used for source-snippet provenance ("click/hover to expand the quote").
 */
interface PopoverProps {
  id: string;
  trigger: (args: {
    open: boolean;
    toggle: () => void;
    props: {
      'aria-expanded': boolean;
      'aria-controls': string;
      'aria-haspopup': 'dialog';
    };
  }) => React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  rootClassName?: string;
  panelClassName?: string;
  panelLabel?: string;
}

export function Popover({
  id,
  trigger,
  children,
  align = 'start',
  rootClassName,
  panelClassName,
  panelLabel,
}: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const toggle = React.useCallback(() => setOpen((o) => !o), []);
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className={cn('relative inline-block', rootClassName)}>
      {trigger({
        open,
        toggle,
        props: {
          'aria-expanded': open,
          'aria-controls': id,
          'aria-haspopup': 'dialog',
        },
      })}
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={panelLabel ?? 'Details'}
          className={cn(
            'absolute z-40 mt-2 w-80 max-w-[min(90vw,24rem)] animate-fade-in rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
