import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

/**
 * Prev/next pagination driven by the server's page / page_size / total, so the
 * whole queue is reachable (not just the first page of top-scored cases).
 */
export function QueuePagination({ page, pageSize, total, onPage }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), pages);
  const first = total === 0 ? 0 : (clamped - 1) * pageSize + 1;
  const last = Math.min(clamped * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground" data-testid="queue-page-indicator">
        Page <span className="tabular font-semibold text-foreground">{clamped}</span> of{' '}
        <span className="tabular font-semibold text-foreground">{pages}</span>
        <span className="mx-1.5 text-border">·</span>
        showing{' '}
        <span className="tabular font-semibold text-foreground">
          {first}–{last}
        </span>{' '}
        of <span className="tabular font-semibold text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          data-testid="queue-prev-page"
          disabled={clamped <= 1}
          onClick={() => onPage(clamped - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden="true" />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="queue-next-page"
          disabled={clamped >= pages}
          onClick={() => onPage(clamped + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
