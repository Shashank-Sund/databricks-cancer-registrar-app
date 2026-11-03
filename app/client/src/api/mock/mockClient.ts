/**
 * In-memory mock of the entire REST contract (contracts/api_contract.md).
 *
 * Holds session state so the whole app runs standalone with no backend:
 *   - triage(reportable) creates a draft + generates a working form, removes
 *     the case from the queue, and returns an abstraction run id;
 *   - triage(not_reportable) drops the case from the queue;
 *   - patchField / fillUnknown / finish mutate the working draft and re-run edits.
 * A small artificial latency makes loading and saving states visible.
 */
import type { ApiClient } from '../types';
import type {
  CaseField,
  CaseForm,
  DraftItem,
  DraftsResponse,
  EditsResult,
  FillUnknownResponse,
  FinishResult,
  FormSection,
  Me,
  PatchFieldResponse,
  QueueItem,
  QueueQuery,
  QueueResponse,
  TriageBody,
  TriageResponse,
} from '@/types/api';
import { DICTIONARY, FIELDS_TOTAL, SECTIONS_ORDER } from './dictionary';
import { QUEUE_SEED, PRESEEDED_DRAFT_IDS } from './cases';
import { finishBlocking, runEdits, type WorkingValue } from './editsEngine';
import { IS_STATIC_DEMO } from '@/lib/demo';

const CURRENT_USER: Me = {
  // The public demo uses a reserved example domain (RFC 2606).
  email: IS_STATIC_DEMO ? 'registrar@example.org' : 'registrar@demo-health.org',
  display_name: 'Dana Reyes, CTR',
};

const dictById = new Map(DICTIONARY.map((d) => [d.naaccr_item_id, d]));

interface DraftRecord {
  case_id: string;
  assigned_to: string;
  draft_status: 'in_progress' | 'ready_to_finish';
  abstraction_run_id: string | null;
  created_at: string;
  last_saved_at: string;
}

interface MockState {
  caseMeta: Map<string, QueueItem>;
  queueVisible: Set<string>;
  notReportable: Set<string>;
  drafts: Map<string, DraftRecord>;
  working: Map<string, Map<number, WorkingValue>>;
  finalized: Set<string>;
  decisionSeq: number;
  runSeq: number;
}

// ---- helpers -------------------------------------------------------------
const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function nameParts(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function primarySiteFromCode(code: string): string {
  if (code.toUpperCase().startsWith('C50.')) return code.toUpperCase().slice(0, 5);
  return 'C50.9';
}

function lateralityFromDesc(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('right')) return '1';
  if (d.includes('left')) return '2';
  return '9';
}

function histologyFromCodes(codes: string[]): string {
  const valid = new Set(
    (dictById.get(522)?.valid_values ?? []).map((v) => v.code),
  );
  const found = codes.find((c) => valid.has(c));
  return found ?? '8500/3';
}

/** Build the AI-generated working draft for a case from the dictionary + meta. */
function buildInitialValues(meta: QueueItem): Map<number, WorkingValue> {
  const { first, last } = nameParts(meta.patient_name);
  const inSitu = meta.primary_diagnosis_desc.toLowerCase().includes('in situ');

  const overrides: Record<number, string | null> = {
    2230: last,
    2240: first,
    20: meta.patient_mrn,
    240: meta.date_of_birth,
    220: meta.sex === 'F' ? '2' : meta.sex === 'M' ? '1' : '9',
    390: meta.diagnosis_date,
    400: primarySiteFromCode(meta.primary_diagnosis_code),
    410: lateralityFromDesc(meta.primary_diagnosis_desc),
    522: histologyFromCodes(meta.key_codes),
    523: inSitu ? '2' : '3',
    3170: addDays(meta.diagnosis_date, 21),
    1750: addDays(meta.diagnosis_date, 92),
  };

  const map = new Map<number, WorkingValue>();
  for (const d of DICTIONARY) {
    const override = Object.prototype.hasOwnProperty.call(
      overrides,
      d.naaccr_item_id,
    )
      ? overrides[d.naaccr_item_id]
      : undefined;
    const value =
      override !== undefined
        ? override
        : d.demo.value === 'PLACEHOLDER'
          ? null
          : d.demo.value;
    map.set(d.naaccr_item_id, {
      value,
      confidence: value === null ? null : d.demo.confidence,
      field_status: value === null ? 'blank' : d.demo.status,
      source_ref: value === null ? null : (d.demo.source ?? null),
      updated_by: null,
      updated_at: nowIso(),
    });
  }
  return map;
}

// ---- state bootstrap -----------------------------------------------------
function createState(): MockState {
  const caseMeta = new Map(QUEUE_SEED.map((c) => [c.case_id, c]));
  const queueVisible = new Set(QUEUE_SEED.map((c) => c.case_id));
  const drafts = new Map<string, DraftRecord>();
  const working = new Map<string, Map<number, WorkingValue>>();
  let runSeq = 400;

  for (const id of PRESEEDED_DRAFT_IDS) {
    const meta = caseMeta.get(id);
    if (!meta) continue;
    queueVisible.delete(id);
    working.set(id, buildInitialValues(meta));
    drafts.set(id, {
      case_id: id,
      assigned_to: CURRENT_USER.email,
      draft_status: 'in_progress',
      abstraction_run_id: `run-${runSeq++}`,
      created_at: nowIso(),
      last_saved_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    });
  }

  return {
    caseMeta,
    queueVisible,
    notReportable: new Set(),
    drafts,
    working,
    finalized: new Set(),
    decisionSeq: 100,
    runSeq,
  };
}

// Single session-scoped instance.
const state: MockState = createState();

function countFilled(values: Map<number, WorkingValue>): number {
  let n = 0;
  for (const v of values.values()) if (v.value !== null && v.value !== '') n++;
  return n;
}

function toEdits(values: Map<number, WorkingValue>): EditsResult {
  return runEdits(values);
}

function assembleForm(caseId: string): CaseForm {
  const meta = state.caseMeta.get(caseId);
  const values = state.working.get(caseId);
  const draft = state.drafts.get(caseId);
  if (!meta || !values || !draft) {
    throw new Error(`Case ${caseId} not found`);
  }

  const sections: FormSection[] = SECTIONS_ORDER.map((section) => {
    const fields: CaseField[] = DICTIONARY.filter(
      (d) => d.section === section,
    ).map((d) => {
      const wv = values.get(d.naaccr_item_id)!;
      return {
        naaccr_item_id: d.naaccr_item_id,
        item_name: d.item_name,
        label: d.label,
        data_type: d.data_type,
        required: d.required,
        value: wv.value,
        confidence: wv.confidence,
        field_status: wv.field_status as CaseField['field_status'],
        source_ref:
          wv.source_ref === null ? null : (wv.source_ref as CaseField['source_ref']),
        valid_values: d.valid_values,
        unknown_code: d.unknown_code,
        description: d.description,
      };
    });
    return { section, fields };
  }).filter((s) => s.fields.length > 0);

  // Public demo build only: expose the demo lookup field (see dictionary.ts).
  if (IS_STATIC_DEMO) {
    for (const s of sections) {
      for (const f of s.fields) {
        const lookup = dictById.get(f.naaccr_item_id)?.lookup;
        if (lookup) f.lookup = lookup;
      }
    }
  }

  return {
    case_id: caseId,
    patient_name: meta.patient_name,
    patient_mrn: meta.patient_mrn,
    date_of_birth: meta.date_of_birth,
    sex: meta.sex,
    primary_diagnosis_desc: meta.primary_diagnosis_desc,
    draft_status: draft.draft_status,
    last_saved_at: draft.last_saved_at,
    abstraction_run_id: draft.abstraction_run_id,
    sections,
    edits: toEdits(values),
  };
}

// ---- ApiClient implementation -------------------------------------------
export const mockClient: ApiClient = {
  async getMe() {
    await delay(80);
    return CURRENT_USER;
  },

  async getQueue(query: QueueQuery): Promise<QueueResponse> {
    await delay();
    let items = [...state.queueVisible]
      .filter((id) => !state.finalized.has(id) && !state.notReportable.has(id))
      .map((id) => state.caseMeta.get(id)!)
      .filter(Boolean);

    if (query.label) {
      items = items.filter((c) => c.reportability_label === query.label);
    }
    if (typeof query.min_score === 'number') {
      items = items.filter((c) => c.reportability_score >= query.min_score!);
    }

    const sort = query.sort ?? 'score_desc';
    items.sort((a, b) => {
      switch (sort) {
        case 'score_asc':
          return a.reportability_score - b.reportability_score;
        case 'date_desc':
          return b.diagnosis_date.localeCompare(a.diagnosis_date);
        case 'date_asc':
          return a.diagnosis_date.localeCompare(b.diagnosis_date);
        case 'score_desc':
        default:
          return b.reportability_score - a.reportability_score;
      }
    });

    const total = items.length;
    const page = query.page ?? 1;
    const page_size = query.page_size ?? 50;
    const start = (page - 1) * page_size;
    return {
      items: items.slice(start, start + page_size),
      page,
      page_size,
      total,
    };
  },

  async triage(caseId: string, body: TriageBody): Promise<TriageResponse> {
    await delay(240);
    const meta = state.caseMeta.get(caseId);
    if (!meta) throw new Error(`Case ${caseId} not found`);
    const decision_id = state.decisionSeq++;
    state.queueVisible.delete(caseId);

    if (body.decision === 'not_reportable') {
      state.notReportable.add(caseId);
      return { decision_id, decision: 'not_reportable', abstraction_run_id: null };
    }

    // reportable -> create draft + generate the abstraction working form
    const abstraction_run_id = `run-${state.runSeq++}`;
    if (!state.working.has(caseId)) {
      state.working.set(caseId, buildInitialValues(meta));
    }
    state.drafts.set(caseId, {
      case_id: caseId,
      assigned_to: CURRENT_USER.email,
      draft_status: 'in_progress',
      abstraction_run_id,
      created_at: nowIso(),
      last_saved_at: nowIso(),
    });
    return { decision_id, decision: 'reportable', abstraction_run_id };
  },

  async getDrafts(): Promise<DraftsResponse> {
    await delay(120);
    const items: DraftItem[] = [...state.drafts.values()]
      .filter((d) => d.assigned_to === CURRENT_USER.email)
      .filter((d) => !state.finalized.has(d.case_id))
      .sort((a, b) => b.last_saved_at.localeCompare(a.last_saved_at))
      .map((d) => {
        const meta = state.caseMeta.get(d.case_id)!;
        const values = state.working.get(d.case_id)!;
        return {
          case_id: d.case_id,
          patient_name: meta.patient_name,
          primary_diagnosis_desc: meta.primary_diagnosis_desc,
          draft_status: d.draft_status,
          last_saved_at: d.last_saved_at,
          fields_total: FIELDS_TOTAL,
          fields_filled: countFilled(values),
        };
      });
    return { items };
  },

  async getCase(caseId: string): Promise<CaseForm> {
    await delay();
    return assembleForm(caseId);
  },

  async patchField(
    caseId: string,
    itemId: number,
    value: string | null,
  ): Promise<PatchFieldResponse> {
    await delay(160);
    const values = state.working.get(caseId);
    const draft = state.drafts.get(caseId);
    if (!values || !draft) throw new Error(`Draft ${caseId} not found`);

    const clean = value === null || value.trim() === '' ? null : value;
    const field_status = clean === null ? 'blank' : 'edited';
    const prev = values.get(itemId);
    values.set(itemId, {
      value: clean,
      confidence: null, // human-entered clears AI confidence
      field_status,
      source_ref: prev?.source_ref ?? null,
      updated_by: CURRENT_USER.email,
      updated_at: nowIso(),
    });
    draft.last_saved_at = nowIso();

    return { ok: true, field_status, edits: toEdits(values) };
  },

  async fillUnknown(
    caseId: string,
    section: string | null,
  ): Promise<FillUnknownResponse> {
    await delay(200);
    const values = state.working.get(caseId);
    const draft = state.drafts.get(caseId);
    if (!values || !draft) throw new Error(`Draft ${caseId} not found`);

    let updated = 0;
    for (const d of DICTIONARY) {
      if (section && d.section !== section) continue;
      if (!d.required) continue;
      if (!d.unknown_code) continue;
      const wv = values.get(d.naaccr_item_id);
      if (wv && (wv.value === null || wv.value === '')) {
        values.set(d.naaccr_item_id, {
          value: d.unknown_code,
          confidence: null,
          field_status: 'unknown',
          source_ref: null,
          updated_by: CURRENT_USER.email,
          updated_at: nowIso(),
        });
        updated++;
      }
    }
    if (updated > 0) draft.last_saved_at = nowIso();
    return { updated };
  },

  async getEdits(caseId: string): Promise<EditsResult> {
    await delay(120);
    const values = state.working.get(caseId);
    if (!values) throw new Error(`Draft ${caseId} not found`);
    return toEdits(values);
  },

  async finish(caseId: string): Promise<FinishResult> {
    await delay(300);
    const values = state.working.get(caseId);
    if (!values) throw new Error(`Draft ${caseId} not found`);

    const { missing_required, edit_errors } = finishBlocking(values);
    if (missing_required.length > 0 || edit_errors.length > 0) {
      return { finalized: false, blocking: { missing_required, edit_errors } };
    }

    // ACID move: finalize + drop draft.
    state.finalized.add(caseId);
    state.drafts.delete(caseId);
    return { finalized: true, finalized_at: nowIso() };
  },

  async lookup(system: string, q: string) {
    await delay(120);
    const data: Record<string, { code: string; label: string; extra?: string }[]> = {
      fips_county: [
        { code: '037', label: 'Los Angeles County', extra: 'CA' },
        { code: '073', label: 'San Diego County', extra: 'CA' },
        { code: '075', label: 'San Francisco County', extra: 'CA' },
        { code: '085', label: 'Santa Clara County', extra: 'CA' },
        { code: '059', label: 'Orange County', extra: 'CA' },
      ],
      icdo3_site: [
        { code: 'C50.4', label: 'Upper-outer quadrant of breast' },
        { code: 'C50.9', label: 'Breast, NOS' },
      ],
      icdo3_histology: [
        { code: '8500/3', label: 'Infiltrating duct carcinoma, NOS' },
        { code: '8520/3', label: 'Lobular carcinoma, NOS' },
      ],
      occupation: [{ code: '3255', label: 'Registered nurses' }],
      industry: [{ code: '8190', label: 'Hospitals' }],
    };
    const all = data[system] ?? [];
    const ql = q.trim().toLowerCase();
    const items = ql
      ? all.filter(
          (r) => r.code.toLowerCase().includes(ql) || r.label.toLowerCase().includes(ql),
        )
      : all;
    return {
      system,
      items,
      total: items.length,
      source: 'Mock reference data',
      version: 'demo',
    };
  },
};
