import type {
  CaseForm,
  DraftsResponse,
  EditsResult,
  FillUnknownResponse,
  FinishResult,
  LookupResponse,
  Me,
  PatchFieldResponse,
  QueueQuery,
  QueueResponse,
  TriageBody,
  TriageResponse,
} from '@/types/api';

/**
 * The API seam. Both the in-memory mock and the real HTTP client implement
 * this exact interface, so the UI/hooks never know which is in use.
 * Every method maps 1:1 to an endpoint in contracts/api_contract.md.
 */
export interface ApiClient {
  /** GET /api/me */
  getMe(): Promise<Me>;

  /** GET /api/queue */
  getQueue(query: QueueQuery): Promise<QueueResponse>;

  /** POST /api/queue/{case_id}/triage */
  triage(caseId: string, body: TriageBody): Promise<TriageResponse>;

  /** GET /api/drafts */
  getDrafts(): Promise<DraftsResponse>;

  /** GET /api/cases/{case_id} */
  getCase(caseId: string): Promise<CaseForm>;

  /** PATCH /api/cases/{case_id}/fields/{naaccr_item_id} */
  patchField(
    caseId: string,
    itemId: number,
    value: string | null,
  ): Promise<PatchFieldResponse>;

  /** POST /api/cases/{case_id}/fill-unknown */
  fillUnknown(
    caseId: string,
    section: string | null,
  ): Promise<FillUnknownResponse>;

  /** GET /api/cases/{case_id}/edits */
  getEdits(caseId: string): Promise<EditsResult>;

  /** POST /api/cases/{case_id}/finish */
  finish(caseId: string): Promise<FinishResult>;

  /** GET /api/lookup?system=&q= — searchable authoritative code table */
  lookup(system: string, q: string): Promise<LookupResponse>;
}
