import { NavLink } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useDrafts } from '@/hooks/queries';
import { formatClock } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/** Live "My Drafts" list in the sidebar — resume in-progress work. */
export function DraftsNavList() {
  const { data, isLoading } = useDrafts();

  if (isLoading) {
    return (
      <div className="space-y-2 px-2" aria-hidden="true">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        No drafts in progress. Triage a case as reportable to start one.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5 px-2" role="list">
      {items.map((d) => {
        const pct = d.fields_total
          ? Math.round((d.fields_filled / d.fields_total) * 100)
          : 0;
        return (
          <li key={d.case_id}>
            <NavLink
              to={`/cases/${d.case_id}`}
              className={({ isActive }) =>
                cn(
                  'group block rounded-md px-2.5 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground/80 hover:bg-muted',
                )
              }
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate font-medium">{d.patient_name}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 pl-5">
                <span className="truncate text-2xs text-muted-foreground">
                  {d.case_id} · saved {formatClock(d.last_saved_at)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-0">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="tabular text-2xs text-muted-foreground">
                  {d.fields_filled}/{d.fields_total}
                </span>
              </div>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}
