import { ShieldAlert, ShieldCheck, TriangleAlert, ChevronRight } from 'lucide-react';
import type { EditsResult } from '@/types/api';

interface Props {
  edits: EditsResult;
  onJump: (itemId: number) => void;
}

export function EditsPanel({ edits, onJump }: Props) {
  const { errors, warnings } = edits;
  const clean = errors.length === 0 && warnings.length === 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {errors.length > 0 ? (
          <ShieldAlert className="h-4 w-4 text-danger" aria-hidden="true" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
        )}
        <h2 className="text-sm font-semibold text-card-foreground">NAACCR edits</h2>
        <span className="ml-auto flex items-center gap-1.5 text-2xs">
          {errors.length > 0 && (
            <span className="rounded-full bg-danger-soft px-1.5 py-0.5 font-semibold text-danger">
              {errors.length} error{errors.length === 1 ? '' : 's'}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="rounded-full bg-warning-soft px-1.5 py-0.5 font-semibold text-warning">
              {warnings.length} warning{warnings.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto scrollbar-thin p-2">
        {clean ? (
          <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
            All edits pass. Ready to finish.
          </p>
        ) : (
          <ul className="space-y-1" role="list">
            {errors.map((e, i) => (
              <li key={`e-${e.naaccr_item_id}-${i}`}>
                <button
                  type="button"
                  onClick={() => onJump(e.naaccr_item_id)}
                  className="flex w-full items-start gap-2 rounded-md border border-danger/30 bg-danger-soft/60 px-2.5 py-2 text-left transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-2xs leading-snug text-foreground">
                    {e.message}
                  </span>
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
            {warnings.map((w, i) => (
              <li key={`w-${w.naaccr_item_id}-${i}`}>
                <button
                  type="button"
                  onClick={() => onJump(w.naaccr_item_id)}
                  className="flex w-full items-start gap-2 rounded-md border border-warning/30 bg-warning-soft/50 px-2.5 py-2 text-left transition-colors hover:bg-warning-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-2xs leading-snug text-foreground">
                    {w.message}
                  </span>
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
