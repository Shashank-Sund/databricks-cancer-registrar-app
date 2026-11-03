import { ExternalLink, Info } from 'lucide-react';
import { DEMO_REPO_URL } from '@/lib/demo';

/**
 * Thin, in-flow notice shown only in the public demo build. It sits
 * above the app shell (not fixed or overlaid), so it never covers controls.
 */
export function DemoBanner() {
  return (
    <div
      role="region"
      aria-label="Demo notice"
      data-testid="demo-banner"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning-soft px-4 py-1.5 text-xs text-foreground"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Demo with synthetic data. No backend; changes reset on reload.</span>
      </span>
      {DEMO_REPO_URL && (
        <a
          href={DEMO_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View source
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
