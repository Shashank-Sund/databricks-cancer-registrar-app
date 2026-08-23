import * as React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Pencil,
  HelpCircle,
  CircleDashed,
} from 'lucide-react';
import type { FieldStatus } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';

/**
 * Confidence / field-status badge. Color AND icon encode the state (never color
 * alone, per WCAG 1.4.1). Every state carries an accessible tooltip (hover +
 * keyboard focus). Bands: >0.8 high, 0.5-0.8 medium, <0.5 low. The blank state
 * reads "Needs entry" (the AI extracted no value) and is visually distinct.
 */
export function ConfidenceBadge({
  confidence,
  status,
}: {
  confidence: number | null;
  status: FieldStatus;
}) {
  let node: React.ReactNode;
  let tip: string;
  let testid: string | undefined;

  if (status === 'edited') {
    node = (
      <Badge variant="info">
        <Pencil aria-hidden="true" />
        Edited
      </Badge>
    );
    tip = 'You edited this value; the AI confidence was cleared.';
  } else if (status === 'confirmed') {
    node = (
      <Badge variant="success">
        <CheckCircle2 aria-hidden="true" />
        Confirmed
      </Badge>
    );
    tip = "You confirmed the AI's value.";
  } else if (status === 'unknown') {
    node = (
      <Badge variant="default">
        <HelpCircle aria-hidden="true" />
        Unknown
      </Badge>
    );
    tip = "Set to a valid NAACCR 'unknown' code.";
  } else if (status === 'blank' || confidence === null) {
    node = (
      <Badge variant="outline" className="border-dashed text-muted-foreground">
        <CircleDashed aria-hidden="true" />
        Needs entry
      </Badge>
    );
    tip = "The AI didn't find this in the record — enter it manually.";
    testid = 'needs-entry';
  } else {
    const pct = Math.round(confidence * 100);
    if (confidence > 0.8) {
      node = (
        <Badge variant="success">
          <CheckCircle2 aria-hidden="true" />
          High {pct}%
        </Badge>
      );
    } else if (confidence >= 0.5) {
      node = (
        <Badge variant="warning">
          <AlertTriangle aria-hidden="true" />
          Med {pct}%
        </Badge>
      );
    } else {
      node = (
        <Badge variant="danger">
          <AlertCircle aria-hidden="true" />
          Low {pct}%
        </Badge>
      );
    }
    tip = `AI's confidence in this extracted value: ${pct}% (High > 80%, Med 50–80%, Low < 50%).`;
  }

  return (
    <Tooltip content={tip}>
      <span
        tabIndex={0}
        data-testid={testid}
        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {node}
      </span>
    </Tooltip>
  );
}
