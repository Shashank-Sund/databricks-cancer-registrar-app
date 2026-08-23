import * as React from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Lightweight accessible tooltip.
 * - Shows on hover AND keyboard focus (focus/blur are captured so any focusable
 *   child triggers it), hides on Escape / mouseleave / blur.
 * - Renders the panel in a portal with fixed positioning, so it is never
 *   clipped by an ancestor's `overflow-hidden` (e.g. the queue table).
 * - Links trigger -> panel via aria-describedby for screen readers.
 *
 * Pass a focusable element as `children` (a button, or a span with tabIndex=0).
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const reactId = React.useId();
  const id = `tt-${reactId.replace(/:/g, '')}`;

  const show = React.useCallback(() => {
    const el = wrapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ top: r.top, left: r.left + r.width / 2 });
    }
    setOpen(true);
  }, []);
  const hide = React.useCallback(() => setOpen(false), []);

  return (
    <span
      ref={wrapRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
    >
      {React.cloneElement(children, {
        'aria-describedby': open ? id : undefined,
      })}
      {open &&
        pos &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            style={{
              position: 'fixed',
              top: pos.top - 8,
              left: pos.left,
              transform: 'translate(-50%, -100%)',
            }}
            className="pointer-events-none z-[60] block w-max max-w-xs animate-fade-in whitespace-normal rounded-md border border-border bg-popover px-2.5 py-1.5 text-2xs leading-snug text-popover-foreground shadow-lg"
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

/** Convenience: a small "i" info icon that reveals `content` on hover/focus. */
export function InfoTooltip({
  content,
  label = 'More information',
  size = 14,
  className,
}: {
  content: React.ReactNode;
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <Tooltip content={content} className={className}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info aria-hidden="true" style={{ height: size, width: size }} />
      </button>
    </Tooltip>
  );
}
