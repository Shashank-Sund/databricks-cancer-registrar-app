import { Quote, FileSearch } from 'lucide-react';
import type { SourceRef } from '@/types/api';
import { Popover } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';

/**
 * Provenance for an AI-suggested value: a truncated quote inline, click to
 * expand the full source span (document id + section + quote). A hover/focus
 * tooltip explains what the indicator is; the no-source case is explained too.
 */
export function SourceSnippet({
  source,
  itemId,
}: {
  source: SourceRef | null;
  itemId: number;
}) {
  if (!source) {
    return (
      <Tooltip content="No AI source — the AI did not extract this value from the record. Enter or verify it manually.">
        <span
          tabIndex={0}
          className="rounded text-2xs italic text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          No source
        </span>
      </Tooltip>
    );
  }

  const truncated =
    source.quote.length > 44 ? `${source.quote.slice(0, 44)}…` : source.quote;

  return (
    <Popover
      id={`source-${itemId}`}
      panelLabel="Source provenance"
      rootClassName="block min-w-0 w-full"
      align="end"
      trigger={({ toggle, props }) => (
        <Tooltip
          className="block w-full min-w-0"
          content="The exact text the AI pulled this value from — click to view the full source."
        >
          <button
            type="button"
            onClick={toggle}
            className="group flex w-full min-w-0 items-center gap-1 rounded text-left text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...props}
          >
            <Quote className="h-3 w-3 shrink-0 text-muted-foreground/70 group-hover:text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate italic">{truncated}</span>
          </button>
        </Tooltip>
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-popover-foreground">
          <FileSearch className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Source provenance
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
          <dt className="text-muted-foreground">Document</dt>
          <dd className="tabular font-medium text-popover-foreground">{source.doc_id}</dd>
          <dt className="text-muted-foreground">Section</dt>
          <dd className="font-medium text-popover-foreground">{source.section}</dd>
        </dl>
        <blockquote className="border-l-2 border-primary/40 bg-muted/50 px-2.5 py-1.5 text-xs italic leading-relaxed text-foreground/90">
          “{source.quote}”
        </blockquote>
      </div>
    </Popover>
  );
}
