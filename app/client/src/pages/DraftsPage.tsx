import { Link } from 'react-router-dom';
import { FolderOpen, ArrowRight } from 'lucide-react';
import { useDrafts } from '@/hooks/queries';
import { formatDateTime } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';

export function DraftsPage() {
  const { data, isLoading } = useDrafts();
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FolderOpen className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">My drafts</h1>
          <p className="text-xs text-muted-foreground">
            In-progress abstractions assigned to you. Resume where you left off.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <FolderOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No drafts yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Mark a case as reportable in the triage queue to generate an AI abstraction
            draft here.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" role="list">
          {items.map((d) => {
            const pct = d.fields_total
              ? Math.round((d.fields_filled / d.fields_total) * 100)
              : 0;
            return (
              <li key={d.case_id}>
                <Link
                  to={`/cases/${d.case_id}`}
                  className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-card-foreground">
                        {d.patient_name}
                      </p>
                      <p className="tabular text-2xs text-muted-foreground">{d.case_id}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {d.primary_diagnosis_desc}
                  </p>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-2xs text-muted-foreground">
                      <span>
                        {d.fields_filled}/{d.fields_total} fields
                      </span>
                      <span className="tabular font-semibold text-foreground">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-2xs text-muted-foreground">
                    Saved {formatDateTime(d.last_saved_at)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="pt-1">
          <Link
            to="/"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back to queue
          </Link>
        </div>
      )}
    </div>
  );
}
