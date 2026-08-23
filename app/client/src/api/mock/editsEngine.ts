/**
 * Deterministic NAACCR edits engine (mock).
 *
 * Mirrors the back-end contract: required-field checks + representative
 * inter-field consistency rules. Errors block Finish; warnings do not.
 * The full GenEDITS metafile plugs in here on the real backend with no UI change.
 */
import type { EditIssue, EditsResult } from '@/types/api';
import { DICTIONARY } from './dictionary';

export interface WorkingValue {
  value: string | null;
  confidence: number | null;
  field_status: string;
  source_ref: unknown;
  updated_by: string | null;
  updated_at: string;
}

const byId = new Map(DICTIONARY.map((d) => [d.naaccr_item_id, d]));

function isEmpty(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === '';
}

const get = (m: Map<number, WorkingValue>, id: number) =>
  m.get(id)?.value ?? null;

/** Required + inter-field rule set. Returns {errors, warnings}. */
export function runEdits(values: Map<number, WorkingValue>): EditsResult {
  const errors: EditIssue[] = [];
  const warnings: EditIssue[] = [];

  // Required-field checks (a valid unknown code counts as filled).
  for (const d of DICTIONARY) {
    if (d.required && isEmpty(get(values, d.naaccr_item_id))) {
      errors.push({
        naaccr_item_id: d.naaccr_item_id,
        message: `${d.label} is required.`,
      });
    }
  }

  // Inter-field: regional nodes positive coded but examined blank (contract example).
  const nodesPos = get(values, 820);
  const nodesExam = get(values, 830);
  if (!isEmpty(nodesPos) && isEmpty(nodesExam)) {
    errors.push({
      naaccr_item_id: 820,
      message:
        'Regional Nodes Positive is coded but Regional Nodes Examined is blank; the examined count is required when nodes are positive.',
    });
  }

  // Warning: tumor size summary blank.
  if (isEmpty(get(values, 880))) {
    warnings.push({
      naaccr_item_id: 880,
      message:
        'Tumor Size Summary is blank; confirm against the pathology synoptic (non-blocking).',
    });
  }

  // Warning: dead without cause of death.
  if (get(values, 1760) === '0' && isEmpty(get(values, 1910))) {
    warnings.push({
      naaccr_item_id: 1910,
      message: 'Vital Status is Dead but Cause of Death is blank.',
    });
  }

  // Warning: triple-negative profile with hormone therapy coded.
  const trisNeg =
    get(values, 3827) === '0' &&
    get(values, 3828) === '0' &&
    get(values, 3855) === '0';
  if (trisNeg && get(values, 1400) === '01') {
    warnings.push({
      naaccr_item_id: 1400,
      message:
        'ER, PR and HER2 are all negative but hormone therapy is coded; verify against the treatment plan.',
    });
  }

  return { errors, warnings };
}

/** Split blocking payload for the Finish precondition (contract 409 shape). */
export function finishBlocking(values: Map<number, WorkingValue>) {
  const missing_required: number[] = [];
  for (const d of DICTIONARY) {
    if (d.required && isEmpty(get(values, d.naaccr_item_id))) {
      missing_required.push(d.naaccr_item_id);
    }
  }
  const { errors } = runEdits(values);
  const edit_errors = errors
    .map((e) => e.naaccr_item_id)
    .filter((id) => !missing_required.includes(id));
  return { missing_required, edit_errors };
}

export function labelFor(id: number): string {
  return byId.get(id)?.label ?? `Item ${id}`;
}
