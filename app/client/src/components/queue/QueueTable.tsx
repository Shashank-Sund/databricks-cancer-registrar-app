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

interface Props {
  items: QueueItem[];
  sort: QueueQuery['sort'];
  onSortToggle: () => void;
  onTriage: (caseId: string, decision: 'reportable' | 'not_reportable') => void;
  pendingId: string | null;
}

export function QueueTable({ items, sort, onSortToggle, onTriage, pendingId }: Props) {
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
        cell: ({ row }) => {
          const c = row.original;
          const pending = pendingId === c.case_id;
          return (
            <div className="flex items-center justify-end gap-2">
              {pending ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner className="h-4 w-4" />
                  Saving…
                </span>
              ) : (
                <>
                  <Button
                    variant="success"
                    size="sm"
                    data-testid={`triage-reportable-${c.case_id}`}
                    onClick={() => onTriage(c.case_id, 'reportable')}
                  >
                    <Check aria-hidden="true" />
                    Reportable
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`triage-not-reportable-${c.case_id}`}
                    onClick={() => onTriage(c.case_id, 'not_reportable')}
                  >
                    <X aria-hidden="true" />
                    Not reportable
                  </Button>
                </>
              )}
            </div>
          );
        },
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
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        Classifier rationale
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                        {row.original.classifier_rationale}
                      </p>
                      {row.original.key_codes.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                            Key codes
                          </span>
                          {row.original.key_codes.map((code) => (
                            <Badge key={code} variant="outline" className="tabular">
                              {code}
                            </Badge>
                          ))}
                        </div>
                      )}
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
