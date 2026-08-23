import * as React from 'react';
import { ClipboardCheck, Inbox } from 'lucide-react';
import type { QueueQuery, TriageDecision } from '@/types/api';
import { useQueue, useTriage } from '@/hooks/queries';
import { useUiStore } from '@/store/uiStore';
import { QueueFilters } from '@/components/queue/QueueFilters';
import { QueueTable } from '@/components/queue/QueueTable';
import { QueuePagination } from '@/components/queue/QueuePagination';
import { Skeleton } from '@/components/ui/skeleton';

const DEFAULT_QUERY: QueueQuery = {
  label: '',
  min_score: 0,
  sort: 'score_desc',
  page: 1,
  page_size: 50,
};

export function QueuePage() {
  const [query, setQuery] = React.useState<QueueQuery>(DEFAULT_QUERY);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const { data, isLoading, isError, error } = useQueue(query);
  const triage = useTriage();
  const pushToast = useUiStore((s) => s.pushToast);

  // Filter/sort changes reset to page 1; paging keeps the current filters.
  const patch = (p: Partial<QueueQuery>) =>
    setQuery((q) => ({ ...q, ...p, page: 1 }));

  const setPage = (page: number) => setQuery((q) => ({ ...q, page }));

  const toggleSort = () =>
    setQuery((q) => ({
      ...q,
      sort: q.sort === 'score_desc' ? 'score_asc' : 'score_desc',
    }));

  const onTriage = (caseId: string, decision: TriageDecision) => {
    setPendingId(caseId);
    triage.mutate(
      { caseId, body: { decision } },
      {
        onSuccess: (res) => {
          if (decision === 'reportable') {
            pushToast({
              variant: 'success',
              title: 'Case marked reportable',
              description: `AI abstraction queued (${res.abstraction_run_id}). Open it under My Drafts.`,
            });
          } else {
            pushToast({
              variant: 'info',
              title: 'Case marked not reportable',
              description: `${caseId} removed from the triage queue.`,
            });
          }
        },
        onError: (e) => {
          pushToast({
            variant: 'error',
            title: 'Triage failed',
            description: e instanceof Error ? e.message : 'Please try again.',
          });
        },
        onSettled: () => setPendingId(null),
      },
    );
  };

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Triage queue</h1>
          <p className="text-xs text-muted-foreground">
            AI-flagged cases pending a reportability decision. You are authoritative.
          </p>
        </div>
      </div>

      <QueueFilters
        query={query}
        onChange={patch}
        onReset={() => setQuery(DEFAULT_QUERY)}
        total={data?.total ?? 0}
      />

      {isLoading ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm text-danger"
        >
          Failed to load the queue: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Queue is clear</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            No flagged cases match the current filters. Reset the filters or check back
            after the next classifier run.
          </p>
        </div>
      ) : (
        <QueueTable
          items={items}
          sort={query.sort}
          onSortToggle={toggleSort}
          onTriage={onTriage}
          pendingId={pendingId}
        />
      )}

      {!isLoading && !isError && (data?.total ?? 0) > 0 && (
        <QueuePagination
          page={query.page ?? 1}
          pageSize={query.page_size ?? 50}
          total={data?.total ?? 0}
          onPage={setPage}
        />
      )}
    </div>
  );
}
