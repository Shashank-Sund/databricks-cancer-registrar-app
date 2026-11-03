import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
} from '@tanstack/react-table';
import {
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import type { QueueItem, QueueQuery } from '@/types/api';
import { ScoreBadge, ScoreMeter } from '@/components/domain/ScoreBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InfoTooltip } from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/skeleton';
import { formatDate, ageFromDob } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface Props {
  items: QueueItem[];
  sort: QueueQuery['sort'];
  onSortToggle: () => void;
  onTriage: (caseId: string, decision: 'reportable' | 'not_reportable') => void;
  pendingId: string | null;
}

// Below the md breakpoint the queue renders as stacked cards so every triage
// button stays on screen; md and up keep the table.
export function QueueTable(props: Props) {
  const wide = useMediaQuery('(min-width: 768px)');
  return wide ? <QueueGrid {...props} /> : <QueueCards {...props} />;
}

function Rationale({ item }: { item: QueueItem }) {
  return (
    <>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        Classifier rationale
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
        {item.classifier_rationale}
      </p>
      {item.key_codes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
            Key codes
          </span>
          {item.key_codes.map((code) => (
            <Badge key={code} variant="outline" className="tabular">
              {code}
            </Badge>
          ))}
        </div>
      )}
    </>
  );
}

function TriageButtons({
  item,
  pending,
  onTriage,
  className,
}: {
  item: QueueItem;
  pending: boolean;
  onTriage: Props['onTriage'];
  className?: string;
}) {
  if (pending) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Saving…
        </span>
      </div>
    );
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="success"
        size="sm"
        className="flex-1 md:flex-initial"
        data-testid={`triage-reportable-${item.case_id}`}
        onClick={() => onTriage(item.case_id, 'reportable')}
      >
        <Check aria-hidden="true" />
        Reportable
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1 md:flex-initial"
        data-testid={`triage-not-reportable-${item.case_id}`}
        onClick={() => onTriage(item.case_id, 'not_reportable')}
      >
        <X aria-hidden="true" />
        Not reportable
      </Button>
    </div>
  );
}

function QueueCards({ items, sort, onSortToggle, onTriage, pendingId }: Props) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          data-testid="queue-sort-score"
          onClick={onSortToggle}
          aria-label={`Sort by reportability score, currently ${
            sort === 'score_asc' ? 'ascending' : 'descending'
          }`}
        >
          <ArrowUpDown aria-hidden="true" />
          Reportability
        </Button>
      </div>
      <ul className="space-y-3" role="list" aria-label="Triage queue">
        {items.map((c) => {
          const age = ageFromDob(c.date_of_birth);
          const isOpen = !!open[c.case_id];
          return (
            <li
              key={c.case_id}
              data-testid={`queue-card-${c.case_id}`}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  data-testid={`queue-expand-${c.case_id}`}
                  onClick={() => setOpen((o) => ({ ...o, [c.case_id]: !o[c.case_id] }))}
                  className="-ml-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen
                      ? `Hide rationale for ${c.patient_name}`
                      : `Show rationale for ${c.patient_name}`
                  }
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{c.patient_name}</p>
                  <p className="tabular truncate text-2xs text-muted-foreground">
                    {c.case_id} · {c.patient_mrn} · {c.sex}
                    {age !== null ? ` · ${age}y` : ''}
                  </p>
                  <p className="mt-1.5 text-sm text-foreground">{c.primary_diagnosis_desc}</p>
                  <p className="tabular text-2xs text-muted-foreground">
                    {c.primary_diagnosis_code} · Dx {formatDate(c.diagnosis_date)}
                  </p>
                  <div className="mt-2 space-y-1.5" data-testid="queue-label">
                    <ScoreBadge label={c.reportability_label} score={c.reportability_score} />
                    <ScoreMeter label={c.reportability_label} score={c.reportability_score} />
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                  <Rationale item={c} />
                </div>
              )}
              <TriageButtons
                item={c}
                pending={pendingId === c.case_id}
                onTriage={onTriage}
                className="mt-3"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QueueGrid({ items, sort, onSortToggle, onTriage, pendingId }: Props) {
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const columns = React.useMemo<ColumnDef<QueueItem>[]>(
    () => [
      {
        id: 'expander',
        header: () => <span className="sr-only">Expand</span>,
        cell: ({ row }) => (
          <button
            type="button"
            data-testid={`queue-expand-${row.original.case_id}`}
            onClick={() => row.toggleExpanded()}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={row.getIsExpanded()}
            aria-label={
              row.getIsExpanded()
                ? `Hide rationale for ${row.original.patient_name}`
                : `Show rationale for ${row.original.patient_name}`
            }
          >
            {row.getIsExpanded() ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ),
      },
      {
        id: 'patient',
        header: 'Patient',
        cell: ({ row }) => {
          const c = row.original;
          const age = ageFromDob(c.date_of_birth);
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{c.patient_name}</p>
              <p className="tabular truncate text-2xs text-muted-foreground">
                {c.case_id} · {c.patient_mrn} · {c.sex}
                {age !== null ? ` · ${age}y` : ''}
              </p>
            </div>
          );
        },
      },
      {
        id: 'diagnosis',
        header: 'Primary diagnosis',
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground" title={c.primary_diagnosis_desc}>
                {c.primary_diagnosis_desc}
              </p>
              <p className="tabular text-2xs text-muted-foreground">
                {c.primary_diagnosis_code}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: 'diagnosis_date',
        header: 'Dx date',
        cell: ({ getValue }) => (
          <span className="tabular whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(getValue<string>())}
          </span>
        ),
      },
      {
        accessorKey: 'reportability_score',
        header: () => (
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              data-testid="queue-sort-score"
              onClick={onSortToggle}
              className="inline-flex items-center gap-1 rounded font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Sort by reportability score, currently ${
                sort === 'score_asc' ? 'ascending' : 'descending'
              }`}
            >
              Reportability
              <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <InfoTooltip
              size={12}
              label="What the reportability labels mean"
              content={
                <span className="block space-y-1 normal-case">
                  <span className="block font-semibold text-popover-foreground">
                    AI reportability suggestion — you are authoritative.
                  </span>
                  <span className="block">
                    <b>Likely reportable:</b> AI thinks this is a reportable cancer.
                  </span>
                  <span className="block">
                    <b>Uncertain:</b> AI can't tell; needs your review.
                  </span>
                  <span className="block">
                    <b>Not reportable:</b> AI thinks this is not reportable.
                  </span>
                </span>
              }
            />
          </span>
        ),
        cell: ({ row }) => (
          <div className="space-y-1.5">
            <ScoreBadge label={row.original.reportability_label} score={row.original.reportability_score} />
            <ScoreMeter label={row.original.reportability_label} score={row.original.reportability_score} />
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Triage decision</span>,
        cell: ({ row }) => (
          <TriageButtons
            item={row.original}
            pending={pendingId === row.original.case_id}
            onTriage={onTriage}
            className="justify-end"
          />
        ),
      },
    ],
    [onSortToggle, onTriage, pendingId, sort],
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getRowId: (row) => row.case_id,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <div className="w-full overflow-hidden rounded-lg border border-border">
      <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-11" />
          <col className="w-[20%]" />
          <col />
          <col className="w-24" />
          <col className="w-48" />
          <col className="w-[264px]" />
        </colgroup>
        <thead className="border-b border-border bg-muted/50">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <React.Fragment key={row.id}>
              <tr
                className={cn(
                  'border-b border-border transition-colors hover:bg-muted/40',
                  row.getIsExpanded() && 'bg-muted/30',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              {row.getIsExpanded() && (
                <tr className="border-b border-border bg-muted/20">
                  <td colSpan={row.getVisibleCells().length} className="px-3 pb-4 pt-1">
                    <div className="ml-8 max-w-3xl rounded-md border border-border bg-card p-3">
                      <Rationale item={row.original} />
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
