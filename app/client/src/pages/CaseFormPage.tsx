import * as React from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Wand2,
  Sparkles,
  Save,
  User,
} from 'lucide-react';
import type { CaseForm } from '@/types/api';
import {
  useCase,
  useFillUnknown,
  useFinish,
  usePatchField,
} from '@/hooks/queries';
import { useUiStore } from '@/store/uiStore';
import { FormSection } from '@/components/form/FormSection';
import { EditsPanel } from '@/components/form/EditsPanel';
import { fieldDomId } from '@/components/form/FieldRow';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { formatClock, formatDate, ageFromDob } from '@/lib/format';

const ALL = '__all__';

function useFormMeta(form: CaseForm | undefined) {
  return React.useMemo(() => {
    if (!form) {
      return { total: 0, filled: 0, labelById: new Map<number, string>(), sectionByItem: new Map<number, string>() };
    }
    let total = 0;
    let filled = 0;
    const labelById = new Map<number, string>();
    const sectionByItem = new Map<number, string>();
    for (const s of form.sections) {
      for (const f of s.fields) {
        total++;
        if (f.value !== null && f.value !== '') filled++;
        labelById.set(f.naaccr_item_id, f.label);
        sectionByItem.set(f.naaccr_item_id, s.section);
      }
    }
    return { total, filled, labelById, sectionByItem };
  }, [form]);
}

export function CaseFormPage() {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const { data: form, isLoading, isError, error } = useCase(caseId);

  const patch = usePatchField(caseId);
  const fill = useFillUnknown(caseId);
  const finish = useFinish(caseId);
  const pushToast = useUiStore((s) => s.pushToast);
  const setAllSections = useUiStore((s) => s.setAllSections);

  const [savingId, setSavingId] = React.useState<number | null>(null);
  const [fillTarget, setFillTarget] = React.useState<string | null>(null);

  const { total, filled, labelById, sectionByItem } = useFormMeta(form);

  const errorsById = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const e of form?.edits.errors ?? []) {
      if (!m.has(e.naaccr_item_id)) m.set(e.naaccr_item_id, e.message);
    }
    return m;
  }, [form]);

  const onSave = (itemId: number, value: string | null) => {
    setSavingId(itemId);
    patch.mutate(
      { itemId, value },
      {
        onSuccess: () =>
          pushToast({
            variant: 'success',
            title: `Saved at ${formatClock(new Date().toISOString())}`,
            description: `${labelById.get(itemId) ?? `Item ${itemId}`} updated.`,
          }),
        onError: (e) =>
          pushToast({
            variant: 'error',
            title: 'Save failed',
            description: e instanceof Error ? e.message : 'Please retry.',
          }),
        onSettled: () => setSavingId(null),
      },
    );
  };

  const onFillUnknown = (section: string | null) => {
    setFillTarget(section ?? ALL);
    fill.mutate(
      { section },
      {
        onSuccess: (res) =>
          pushToast({
            variant: res.updated > 0 ? 'success' : 'info',
            title:
              res.updated > 0
                ? `Filled ${res.updated} field${res.updated === 1 ? '' : 's'} with unknown codes`
                : 'Nothing to fill',
            description: section ? `Section: ${section}` : 'Whole form',
          }),
        onSettled: () => setFillTarget(null),
      },
    );
  };

  const jumpToField = (itemId: number) => {
    const section = sectionByItem.get(itemId);
    if (section) setAllSections([section], true);
    window.setTimeout(() => {
      const el = document.getElementById(fieldDomId(itemId));
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        (el as HTMLElement).focus({ preventScroll: true });
      }
    }, 60);
  };

  const onFinish = () => {
    finish.mutate(undefined, {
      onSuccess: (result) => {
        if (result.finalized) {
          pushToast({
            variant: 'success',
            title: 'Case finalized',
            description: `${caseId} signed off and moved to the registry of record.`,
          });
          navigate('/');
        } else {
          const { missing_required, edit_errors } = result.blocking;
          pushToast({
            variant: 'error',
            title: 'Cannot finish yet',
            description: `${missing_required.length} required field(s) missing, ${edit_errors.length} edit error(s).`,
          });
          const first = missing_required[0] ?? edit_errors[0];
          if (first) jumpToField(first);
        }
      },
    });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !form) {
    return (
      <div className="mx-auto max-w-2xl p-5">
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm text-danger">
          Could not load case {caseId}: {error instanceof Error ? error.message : 'not found'}.
        </div>
        <Link to="/" className="mt-3 inline-block text-sm text-primary hover:underline">
          ← Back to queue
        </Link>
      </div>
    );
  }

  const errorCount = form.edits.errors.length;
  const canFinish = errorCount === 0 && !finish.isPending;
  const age = ageFromDob(form.date_of_birth);
  const pct = total ? Math.round((filled / total) * 100) : 0;

  return (
    <div className="flex flex-col">
      {/* Sticky action header */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <Link
            to="/"
            className="flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Queue
          </Link>

          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-foreground">
                {form.patient_name}
              </h1>
              <p className="tabular truncate text-2xs text-muted-foreground">
                {form.case_id} · {form.patient_mrn} · {form.sex}
                {age !== null ? ` · ${age}y` : ''} · DOB {formatDate(form.date_of_birth)}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Save indicator */}
            <span className="hidden items-center gap-1.5 text-2xs text-muted-foreground sm:flex">
              {patch.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  Saved {formatClock(form.last_saved_at)}
                </>
              )}
            </span>

            <Tooltip
              content={
                <span className="block">
                  Sets empty <b>required</b> fields to the official NAACCR “unknown” code
                  (e.g. 9 / 99 / 999 / C809 / 99999999) so the abstract can pass edits.
                  Deterministic — it does not guess values.{' '}
                  <b>Scope: the whole form.</b>
                </span>
              }
            >
              <Button
                variant="outline"
                size="sm"
                data-testid="fill-unknowns-all"
                onClick={() => onFillUnknown(null)}
                disabled={fill.isPending}
              >
                {fill.isPending && fillTarget === ALL ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-4 w-4" aria-hidden="true" />
                )}
                Fill all unknowns
              </Button>
            </Tooltip>

            <Button
              variant="success"
              size="sm"
              data-testid="finish-button"
              onClick={onFinish}
              disabled={!canFinish}
              aria-disabled={!canFinish}
              title={
                canFinish
                  ? 'Sign off and finalize this case'
                  : `Resolve ${errorCount} edit error(s) before finishing`
              }
            >
              {finish.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              Finish
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-5 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          {/* AI abstraction banner */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="font-medium">AI-abstracted NAACCR draft</span>
              {form.abstraction_run_id && (
                <span className="tabular text-2xs text-muted-foreground">
                  {form.abstraction_run_id}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="tabular text-2xs text-muted-foreground">
                {filled}/{total} fields ({pct}%)
              </span>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} aria-hidden="true" />
              </div>
            </div>
          </div>

          {form.sections.map((s) => (
            <FormSection
              key={s.section}
              section={s}
              errorsById={errorsById}
              savingId={savingId}
              fillPending={fill.isPending && fillTarget === s.section}
              onSave={onSave}
              onFillUnknown={onFillUnknown}
            />
          ))}
        </div>

        {/* Right rail */}
        <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:w-80 lg:self-start">
          <EditsPanel edits={form.edits} onJump={jumpToField} />
          <p className="mt-2 px-1 text-2xs leading-relaxed text-muted-foreground">
            The registrar is authoritative. AI values are suggestions with confidence
            and source provenance; edits and the Finish gate are enforced server-side.
          </p>
        </aside>
      </div>
    </div>
  );
}
