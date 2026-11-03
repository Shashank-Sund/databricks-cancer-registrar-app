import * as React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { CaseField } from '@/types/api';
import { ConfidenceBadge } from '@/components/domain/ConfidenceBadge';
import { SourceSnippet } from './SourceSnippet';
import { CodeLookupInput } from './CodeLookupInput';
import { Select } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/tooltip';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  field: CaseField;
  errorMessage?: string;
  saving?: boolean;
  onSave: (value: string | null) => void;
}

function fieldDomId(itemId: number) {
  return `field-${itemId}`;
}
export function fieldErrorDomId(itemId: number) {
  return `field-err-${itemId}`;
}
export { fieldDomId };

export const FieldRow = React.memo(function FieldRow({
  field,
  errorMessage,
  saving,
  onSave,
}: Props) {
  const id = fieldDomId(field.naaccr_item_id);
  const errId = fieldErrorDomId(field.naaccr_item_id);
  const hasError = !!errorMessage;

  const isCoded =
    field.data_type === 'coded' && !!field.valid_values && field.valid_values.length > 0;
  // Coded field with no dropdown but an authoritative searchable code table.
  const isLookup = !!field.lookup && !isCoded;

  // Local draft for free-text/numeric/date inline editing.
  const [draft, setDraft] = React.useState(field.value ?? '');
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setDraft(field.value ?? '');
  }, [field.value, focused]);

  const commit = () => {
    const next = draft.trim() === '' ? null : draft;
    if (next !== field.value) onSave(next);
  };

  const controlAria = {
    id,
    'data-testid': `field-input-${field.naaccr_item_id}`,
    'aria-required': field.required || undefined,
    'aria-invalid': hasError || undefined,
    'aria-describedby': hasError ? errId : undefined,
  };

  const controlRing = hasError
    ? 'border-danger ring-1 ring-danger/40 focus-visible:ring-danger'
    : '';

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1">
          <label
            htmlFor={id}
            className="flex min-w-0 items-baseline gap-1 text-xs font-medium text-foreground"
          >
            <span className="truncate">{field.label}</span>
            {field.required && (
              <>
                <span aria-hidden="true" className="shrink-0 text-danger">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </>
            )}
          </label>
          {field.description && (
            <InfoTooltip
              size={12}
              label={`About ${field.label}`}
              content={
                <span className="block space-y-1">
                  <span className="block font-semibold text-popover-foreground">
                    {field.label}
                  </span>
                  <span className="block">{field.description}</span>
                  {field.coding_instructions && (
                    <span className="block">
                      <span className="font-medium text-popover-foreground">How to code: </span>
                      {field.coding_instructions}
                    </span>
                  )}
                  {field.code_system && (
                    <span className="block text-muted-foreground">
                      Code system: {field.code_system}
                      {field.version ? ` (${field.version})` : ''}
                    </span>
                  )}
                </span>
              }
            />
          )}
        </div>
        <span className="tabular shrink-0 text-2xs text-muted-foreground" title={field.item_name}>
          #{field.naaccr_item_id}
        </span>
      </div>

      {isCoded ? (
        <Select
          {...controlAria}
          className={cn('h-8 text-sm', controlRing)}
          value={field.value ?? ''}
          onChange={(e) => onSave(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">— Select —</option>
          {field.value &&
            !field.valid_values!.some((v) => v.code === field.value) && (
              <option value={field.value}>{field.value} (current)</option>
            )}
          {field.valid_values!.map((v) => (
            <option key={v.code} value={v.code}>
              {v.code} — {v.label}
            </option>
          ))}
        </Select>
      ) : isLookup ? (
        <CodeLookupInput field={field} onSave={onSave} controlAria={controlAria} controlRing={controlRing} />
      ) : (
        <input
          {...controlAria}
          type={field.data_type === 'date' ? 'date' : 'text'}
          inputMode={field.data_type === 'numeric' ? 'numeric' : undefined}
          value={draft}
          placeholder="—"
          onFocus={() => setFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              setDraft(field.value ?? '');
              setFocused(false);
              e.currentTarget.blur();
            }
          }}
          className={cn(
            'h-8 w-full rounded-md border bg-background px-2.5 text-sm text-foreground shadow-none transition-colors',
            'border-transparent hover:border-input focus:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            field.value === null && 'text-muted-foreground',
            controlRing,
          )}
        />
      )}

      {/* Non-dropdown fields have no valid_values list, so surface the NAACCR
          description as visible helper text (a code is expected for coded items). */}
      {!isCoded && field.description && (
        <p
          className="line-clamp-2 text-2xs leading-snug text-muted-foreground"
          title={field.description}
        >
          {field.data_type === 'coded' ? 'Code expected. ' : ''}
          {field.description}
        </p>
      )}

      {/* Per-field reference metadata: code system + version + authoritative link. */}
      {field.code_system && (
        <p className="flex items-center gap-1.5 text-2xs leading-snug text-muted-foreground">
          <span className="min-w-0 truncate">
            {field.code_system}
            {field.version ? ` · ${field.version}` : ''}
          </span>
          {field.reference_url && (
            <a
              href={field.reference_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-0.5 rounded text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Reference
              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            </a>
          )}
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="shrink-0">
          <ConfidenceBadge confidence={field.confidence} status={field.field_status} />
        </div>
        {saving && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          {(field.source_ref || field.field_status !== 'blank') && (
            <SourceSnippet source={field.source_ref} itemId={field.naaccr_item_id} />
          )}
        </div>
      </div>

      {hasError && (
        <p id={errId} role="alert" className="flex items-start gap-1 text-2xs text-danger">
          <AlertCircle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </p>
      )}
    </div>
  );
});
