import * as React from 'react';
import { Loader2, Search } from 'lucide-react';
import type { CaseField, LookupItem } from '@/types/api';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

/**
 * Searchable typeahead for coded fields backed by an authoritative reference
 * table (FIPS county, ICD-O-3, occupation/industry). The registrar searches by
 * name or code and selects the official code. Accessible combobox: keyboard
 * arrows/enter/escape, aria-expanded/controls, source+version shown in the panel.
 */
export function CodeLookupInput({
  field,
  onSave,
  controlAria,
  controlRing,
}: {
  field: CaseField;
  onSave: (value: string | null) => void;
  controlAria: Record<string, unknown>;
  controlRing: string;
}) {
  const system = field.lookup as string;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<LookupItem[]>([]);
  const [meta, setMeta] = React.useState<{ source: string | null; version: string | null }>({
    source: null,
    version: null,
  });
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [selLabel, setSelLabel] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listId = `lookup-list-${field.naaccr_item_id}`;

  // Resolve a label for the current code so we can show "037 — Los Angeles County".
  React.useEffect(() => {
    let cancelled = false;
    if (field.value) {
      api
        .lookup(system, field.value)
        .then((r) => {
          if (cancelled) return;
          const m = r.items.find((i) => i.code === field.value);
          setSelLabel(m ? m.label : null);
        })
        .catch(() => {});
    } else {
      setSelLabel(null);
    }
    return () => {
      cancelled = true;
    };
  }, [field.value, system]);

  // Debounced search while the panel is open.
  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .lookup(system, query)
        .then((r) => {
          setResults(r.items);
          setMeta({ source: r.source, version: r.version });
          setActive(-1);
        })
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(t);
  }, [open, query, system]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (item: LookupItem) => {
    onSave(item.code);
    setSelLabel(item.label);
    setOpen(false);
    setQuery('');
  };

  const display = open
    ? query
    : field.value
      ? `${field.value}${selLabel ? ` — ${selLabel}` : ''}`
      : '';

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          {...controlAria}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={display}
          placeholder="Search code or name…"
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              if (open && active >= 0 && results[active]) {
                e.preventDefault();
                choose(results[active]);
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className={cn(
            'h-8 w-full rounded-md border bg-background pl-7 pr-2.5 text-sm text-foreground shadow-none transition-colors',
            'border-transparent hover:border-input focus:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            field.value === null && 'text-muted-foreground',
            controlRing,
          )}
        />
      </div>
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg"
        >
          {loading && (
            <div className="flex items-center gap-1.5 px-2.5 py-2 text-2xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-2.5 py-2 text-2xs text-muted-foreground">No matches</div>
          )}
          {!loading &&
            results.map((it, i) => (
              <button
                key={`${it.code}-${it.extra ?? ''}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(it);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted',
                  i === active && 'bg-muted',
                )}
              >
                <span className="tabular shrink-0 font-semibold text-foreground">{it.code}</span>
                <span className="min-w-0 flex-1 truncate text-foreground/90">{it.label}</span>
                {it.extra && (
                  <span className="shrink-0 text-2xs text-muted-foreground">{it.extra}</span>
                )}
              </button>
            ))}
          {meta.source && (
            <div className="border-t border-border px-2.5 py-1 text-2xs text-muted-foreground">
              Source: {meta.source}
              {meta.version ? ` · ${meta.version}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
