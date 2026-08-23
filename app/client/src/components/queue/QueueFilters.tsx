import { Filter } from 'lucide-react';
import type { QueueQuery, ReportabilityLabel } from '@/types/api';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/tooltip';

const LABEL_OPTIONS: { value: ReportabilityLabel | ''; label: string }[] = [
  { value: '', label: 'All labels' },
  { value: 'likely_reportable', label: 'Likely reportable' },
  { value: 'uncertain', label: 'Uncertain' },
  { value: 'not_reportable', label: 'Not reportable' },
];

interface Props {
  query: QueueQuery;
  onChange: (patch: Partial<QueueQuery>) => void;
  onReset: () => void;
  total: number;
}

export function QueueFilters({ query, onChange, onReset, total }: Props) {
  const minScore = query.min_score ?? 0;
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Filter className="h-4 w-4" aria-hidden="true" />
        Filters
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-label" className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Reportability label
        </label>
        <Select
          id="filter-label"
          data-testid="filter-label"
          className="h-8 w-48 text-xs"
          value={query.label ?? ''}
          onChange={(e) =>
            onChange({ label: e.target.value as ReportabilityLabel | '' })
          }
        >
          {LABEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-score" className="flex items-center gap-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Min score:{' '}
          <span className="tabular font-semibold text-foreground">
            {Math.round(minScore * 100)}%
          </span>
          <InfoTooltip
            size={12}
            label="About the minimum score filter"
            content="Filter cases by the AI reportability score (0–100%). Only cases at or above this score are shown."
          />
        </label>
        <input
          id="filter-score"
          data-testid="filter-min-score"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={minScore}
          onChange={(e) => onChange({ min_score: Number(e.target.value) })}
          className="h-8 w-48 cursor-pointer accent-[hsl(var(--primary))]"
          aria-valuetext={`${Math.round(minScore * 100)} percent minimum`}
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          <span className="tabular font-semibold text-foreground">{total}</span> case
          {total === 1 ? '' : 's'} in queue
        </span>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
