/**
 * TypeScript mirror of contracts/api_contract.md (the FE/BE seam).
 * These types are the single source of truth for both the mock client and the
 * real HTTP client, so swapping implementations is transparent to the UI.
 */

// ---- Auth / user context -------------------------------------------------
export interface Me {
  email: string;
  display_name: string;
}

// ---- Queue ---------------------------------------------------------------
export type ReportabilityLabel =
  | 'likely_reportable'
  | 'uncertain'
  | 'not_reportable';

export interface QueueItem {
  case_id: string;
  patient_mrn: string;
  patient_name: string;
  date_of_birth: string; // ISO date
  sex: string;
  primary_diagnosis_code: string;
  primary_diagnosis_desc: string;
  diagnosis_date: string; // ISO date
  reportability_score: number; // 0.000 - 1.000
  reportability_label: ReportabilityLabel;
  classifier_rationale: string;
  key_codes: string[];
  flagged_at: string; // ISO datetime
}

export interface QueueResponse {
  items: QueueItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface QueueQuery {
  label?: ReportabilityLabel | '';
  min_score?: number;
  sort?: 'score_desc' | 'score_asc' | 'date_desc' | 'date_asc';
  page?: number;
  page_size?: number;
}

export type TriageDecision = 'reportable' | 'not_reportable';

export interface TriageBody {
  decision: TriageDecision;
  notes?: string;
}

export interface TriageResponse {
  decision_id: number;
  decision: TriageDecision;
  abstraction_run_id: string | null;
}

// ---- Drafts --------------------------------------------------------------
export type DraftStatus = 'in_progress' | 'ready_to_finish';

export interface DraftItem {
  case_id: string;
  patient_name: string;
  primary_diagnosis_desc: string;
  draft_status: DraftStatus;
  last_saved_at: string; // ISO datetime
  fields_total: number;
  fields_filled: number;
}

export interface DraftsResponse {
  items: DraftItem[];
}

// ---- Case form -----------------------------------------------------------
export type FieldDataType = 'coded' | 'numeric' | 'date' | 'text';

export type FieldStatus =
  | 'ai_suggested'
  | 'edited'
  | 'confirmed'
  | 'unknown'
  | 'blank';

export interface SourceRef {
  doc_id: string;
  section: string;
  quote: string;
}

export interface ValidValue {
  code: string;
  label: string;
}

export interface CaseField {
  naaccr_item_id: number;
  item_name: string;
  label: string;
  data_type: FieldDataType;
  required: boolean;
  value: string | null;
  confidence: number | null; // null if human-entered
  field_status: FieldStatus;
  source_ref: SourceRef | null;
  valid_values: ValidValue[] | null;
  unknown_code: string | null;
  description?: string;
  // Per-field reference metadata (grounded on official code systems).
  code_system?: string | null;
  coding_instructions?: string | null;
  reference_url?: string | null;
  source?: string | null;
  version?: string | null;
  // Non-null when this coded field has a searchable authoritative code lookup
  // (e.g. 'fips_county', 'icdo3_site', 'icdo3_histology', 'occupation', 'industry').
  lookup?: string | null;
}

// ---- Code lookups (searchable authoritative reference tables) ------------
export interface LookupItem {
  code: string;
  label: string;
  extra?: string | null;
}

export interface LookupResponse {
  system: string;
  items: LookupItem[];
  total: number;
  source: string | null;
  version: string | null;
}

export interface FormSection {
  section: string;
  fields: CaseField[];
}

export interface EditIssue {
  naaccr_item_id: number;
  message: string;
}

export interface EditsResult {
  errors: EditIssue[];
  warnings: EditIssue[];
}

export interface CaseForm {
  case_id: string;
  patient_name: string;
  patient_mrn?: string;
  date_of_birth?: string;
  sex?: string;
  primary_diagnosis_desc?: string;
  draft_status: DraftStatus;
  last_saved_at: string;
  abstraction_run_id: string | null;
  sections: FormSection[];
  edits: EditsResult;
}

export interface PatchFieldBody {
  value: string | null;
}

export interface PatchFieldResponse {
  ok: boolean;
  field_status: FieldStatus;
  edits: EditsResult;
}

export interface FillUnknownBody {
  section: string | null;
}

export interface FillUnknownResponse {
  updated: number;
}

export interface FinishSuccess {
  finalized: true;
  finalized_at: string;
}

export interface FinishBlocked {
  finalized: false;
  blocking: {
    missing_required: number[];
    edit_errors: number[];
  };
}

export type FinishResult = FinishSuccess | FinishBlocked;
