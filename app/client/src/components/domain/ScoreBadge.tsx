import { CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import type { ReportabilityLabel } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const LABELS: Record<
  ReportabilityLabel,
  { text: string; variant: 'success' | 'warning' | 'danger'; Icon: typeof CheckCircle2 }
> = {
  likely_reportable: { text: 'Likely reportable', variant: 'success', Icon: CheckCircle2 },
  uncertain: { text: 'Uncertain', variant: 'warning', Icon: AlertTriangle },
  not_reportable: { text: 'Not reportable', variant: 'danger', Icon: MinusCircle },
};

export function ScoreBadge({
  label,
  score,
  className,
}: {
  label: ReportabilityLabel;
  score: number;
  className?: string;
}) {
  const cfg = LABELS[label] ?? LABELS.uncertain;
  const pct = Math.round(score * 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Badge variant={cfg.variant}>
        <cfg.Icon aria-hidden="true" />
        {cfg.text}
      </Badge>
      <span
        className="tabular text-xs font-semibold text-muted-foreground"
        aria-label={`Reportability score ${pct} percent`}
      >
        {pct}%
      </span>
    </div>
  );
}

/** Thin horizontal score meter, useful in the queue rows. */
export function ScoreMeter({ score, label }: { score: number; label: ReportabilityLabel }) {
  const pct = Math.round(score * 100);
  const color =
    label === 'likely_reportable'
      ? 'bg-success'
      : label === 'uncertain'
        ? 'bg-warning'
        : 'bg-danger';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
