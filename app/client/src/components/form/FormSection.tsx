import { ChevronDown, Wand2, Loader2 } from 'lucide-react';
import type { FormSection as FormSectionType } from '@/types/api';
import { useUiStore } from '@/store/uiStore';
import { FieldRow } from './FieldRow';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  section: FormSectionType;
  errorsById: Map<number, string>;
  savingId: number | null;
  fillPending: boolean;
  onSave: (itemId: number, value: string | null) => void;
  onFillUnknown: (section: string) => void;
}

export function FormSection({
  section,
  errorsById,
  savingId,
  fillPending,
  onSave,
  onFillUnknown,
}: Props) {
  const expanded = useUiStore((s) => s.isSectionExpanded(section.section));
  const toggle = useUiStore((s) => s.toggleSection);

  const total = section.fields.length;
  const filled = section.fields.filter((f) => f.value !== null && f.value !== '').length;
  const errorCount = section.fields.filter((f) => errorsById.has(f.naaccr_item_id)).length;
  const fillable = section.fields.some(
    (f) => f.required && f.unknown_code && (f.value === null || f.value === ''),
  );

  const regionId = `section-${section.section.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <section className="rounded-lg border border-border bg-card">
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-t-lg bg-muted/30 px-3 py-2',
          expanded ? 'border-b border-border' : 'rounded-b-lg',
        )}
      >
        <button
          type="button"
          data-testid={`toggle-${regionId}`}
          onClick={() => toggle(section.section)}
          aria-expanded={expanded}
          aria-controls={regionId}
          className="flex min-w-[12rem] flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              !expanded && '-rotate-90',
            )}
            aria-hidden="true"
          />
          <h2 className="min-w-0 text-sm font-semibold text-card-foreground sm:truncate">
            {section.section}
          </h2>
          <span className="tabular whitespace-nowrap text-2xs text-muted-foreground">
            {total} field{total === 1 ? '' : 's'}, {filled} filled
          </span>
          {errorCount > 0 && (
            <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-2xs font-semibold text-danger">
              {errorCount} error{errorCount === 1 ? '' : 's'}
            </span>
          )}
        </button>

        <Tooltip
          content={
            <span className="block">
              Sets empty <b>required</b> fields to the official NAACCR “unknown” code
              (e.g. 9 / 99 / 999 / C809 / 99999999) so the abstract can pass edits.
              Deterministic — it does not guess values.{' '}
              <b>Scope: this section only.</b>
              {!fillable && ' (No empty required fields to fill here.)'}
            </span>
          }
        >
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs"
            data-testid={`fill-unknown-${regionId}`}
            disabled={!fillable || fillPending}
            onClick={() => onFillUnknown(section.section)}
          >
            {fillPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Fill unknowns in section
          </Button>
        </Tooltip>
      </div>

      {expanded && (
        <div id={regionId} className="grid grid-cols-1 gap-x-5 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {section.fields.map((f) => (
            <FieldRow
              key={f.naaccr_item_id}
              field={f}
              errorMessage={errorsById.get(f.naaccr_item_id)}
              saving={savingId === f.naaccr_item_id}
              onSave={(value) => onSave(f.naaccr_item_id, value)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
