import { Link } from 'react-router-dom';
import {
  BookOpen,
  Sparkles,
  ClipboardList,
  Wand2,
  FolderOpen,
  FileText,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  ListChecks,
  Flag,
  Info,
  Search,
} from 'lucide-react';
import * as React from 'react';
import { ScoreBadge } from '@/components/domain/ScoreBadge';
import { ConfidenceBadge } from '@/components/domain/ConfidenceBadge';
import { Badge } from '@/components/ui/badge';

function Step({
  n,
  Icon,
  title,
  children,
}: {
  n: number;
  Icon: typeof ClipboardList;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {n}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-card-foreground">{title}</h2>
          </div>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground/90">
            {children}
          </div>
        </div>
      </div>
    </li>
  );
}

function SubItem({
  Icon,
  children,
}: {
  Icon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export function GettingStartedPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Getting started</h1>
          <p className="text-xs text-muted-foreground">
            How this tool works, start to finish. New here? Read this once and you're set.
          </p>
        </div>
      </div>

      {/* What this is */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-card-foreground">What this is</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          This is a cancer-registry review tool. When a patient's records suggest a cancer
          that might need to be reported to the registry, an AI takes the{' '}
          <em>first pass</em> — it flags the case, and later fills in a long standardized
          cancer form for you. Your job is to check its work.{' '}
          <strong className="font-semibold text-foreground">
            The AI only suggests; you make every decision.
          </strong>
        </p>
      </section>

      {/* Walkthrough */}
      <ol className="space-y-4" role="list">
        <Step n={1} Icon={ClipboardList} title="Start in the Triage Queue">
          <p>
            The <strong className="font-medium text-foreground">Queue</strong> is your
            to-do list: cases the AI has flagged as maybe reportable. Each row shows a
            reportability score and a label:
          </p>
          <ul className="flex flex-col gap-2 pt-0.5" role="list">
            <li className="flex flex-wrap items-center gap-2">
              <ScoreBadge label="likely_reportable" score={0.95} />
              <span className="text-xs text-muted-foreground">
                the AI thinks this is a reportable cancer.
              </span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <ScoreBadge label="uncertain" score={0.6} />
              <span className="text-xs text-muted-foreground">
                the AI isn't sure — it needs your eyes.
              </span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <ScoreBadge label="not_reportable" score={0.05} />
              <span className="text-xs text-muted-foreground">
                the AI thinks it doesn't need reporting.
              </span>
            </li>
          </ul>
          <p>
            Expand a row to read the AI's reasoning, then decide:{' '}
            <Badge variant="success">Reportable</Badge> or{' '}
            <Badge variant="outline">Not reportable</Badge>. Rows are sorted
            highest-score-first across several pages — use the pager at the bottom and the{' '}
            <strong className="font-medium text-foreground">Min score</strong> slider to
            reach every case.
          </p>
        </Step>

        <Step n={2} Icon={Wand2} title="Click “Reportable” and the AI drafts the form">
          <p>
            When you mark a case <Badge variant="success">Reportable</Badge>, the AI reads
            the full record and drafts the{' '}
            <strong className="font-medium text-foreground">NAACCR abstract</strong> — the
            standardized cancer form (300+ items). That takes a moment, and the case then
            moves into <strong className="font-medium text-foreground">My Drafts</strong>.
            Marking a case <Badge variant="outline">Not reportable</Badge> simply removes it
            from the queue.
          </p>
        </Step>

        <Step n={3} Icon={FolderOpen} title="Pick up where you left off in My Drafts">
          <p>
            <strong className="font-medium text-foreground">My Drafts</strong> (in the left
            sidebar) holds every case you've started but not finished, with a progress bar
            for how many fields are filled. Click one to resume — your edits save
            automatically as you go.
          </p>
        </Step>

        <Step n={4} Icon={FileText} title="Review and complete the Case form">
          <p>
            Opening a draft shows the abstraction form, grouped into collapsible{' '}
            <strong className="font-medium text-foreground">sections</strong> (Demographics,
            Tumor Identification, and so on). Here's how to read it:
          </p>
          <ul className="flex flex-col gap-2 pt-0.5" role="list">
            <SubItem Icon={CheckCircle2}>
              AI-filled fields show a confidence badge like{' '}
              <ConfidenceBadge confidence={0.95} status="ai_suggested" /> and a short quote
              of the exact record text the AI used — hover it to see the full source.
            </SubItem>
            <SubItem Icon={CircleDashed}>
              <ConfidenceBadge confidence={null} status="blank" /> means the AI didn't find
              this one in the record — type it in yourself.
            </SubItem>
            <SubItem Icon={HelpCircle}>
              Some fields are dropdowns (pick from a list); others are coded fields. Not sure
              what a field means? Hover the little{' '}
              <Info className="inline h-3.5 w-3.5 align-text-bottom text-muted-foreground" aria-label="info" />{' '}
              icon by its name — it explains what the field is, its official code system
              (e.g. ICD-O-3, FIPS), how to code it, and links to the authoritative reference.
            </SubItem>
            <SubItem Icon={Search}>
              For coded fields with no dropdown (county, ICD-O-3 site/histology,
              occupation/industry), type a name or code into the search box and pick the
              official code from the list — the codes come from authoritative reference tables
              (US Census FIPS, ICD-O-3.2, Census/NIOCCS).
            </SubItem>
            <SubItem Icon={Wand2}>
              <strong className="font-medium text-foreground">Fill unknowns</strong> is a
              deterministic shortcut (not AI): it stamps the official NAACCR “unknown” code
              (e.g. 9 / 99 / 999 / C809 / 99999999) into empty <em>required</em> fields so the
              abstract can pass edits. It never guesses or invents a value. Two scopes: the{' '}
              <strong className="font-medium text-foreground">Fill all unknowns</strong> button
              by Finish covers the whole form; each section has its own{' '}
              <strong className="font-medium text-foreground">Fill unknowns in section</strong>.
            </SubItem>
            <SubItem Icon={ListChecks}>
              The <strong className="font-medium text-foreground">edits panel</strong> on the
              right lists anything still to fix — missing required fields or values that don't
              add up.
            </SubItem>
            <SubItem Icon={Flag}>
              The <strong className="font-medium text-foreground">Finish</strong> button turns
              on only when every required field is valid and there are no errors. Clicking it
              locks in the final record.
            </SubItem>
          </ul>
        </Step>
      </ol>

      {/* Authoritative note */}
      <section className="rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">You're always in charge</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          The AI is here to save you time, not to replace your judgment. Every value it
          suggests comes with its confidence and the source text behind it, so you can
          trust-but-verify. Nothing is reported until <em>you</em> review it and click
          Finish, and the required-field and consistency checks are enforced before anything
          is finalized. When the AI and the record disagree, you decide.
        </p>
      </section>

      {/* CTA */}
      <div className="pt-1">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Go to the triage queue
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
