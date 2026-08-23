/**
 * Real HTTP client. Implements the same ApiClient interface as the mock, so the
 * app switches between them by config only (see client.ts). Talks to the FastAPI
 * backend that implements contracts/api_contract.md. All requests are same-origin
 * relative to /api and rely on Databricks Apps OAuth cookies (no tokens in code).
 */
import type { ApiClient } from './types';
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

const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  // The Finish endpoint returns 409 with a structured blocking payload that the
  // caller must handle, so surface the parsed body rather than throwing there.
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok && res.status !== 409) {
    const message =
      (body && (body.detail || body.message)) ||
      `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return body as T;
}

function qs(query: QueueQuery): string {
  const p = new URLSearchParams();
  if (query.label) p.set('label', query.label);
  if (typeof query.min_score === 'number') p.set('min_score', String(query.min_score));
  if (query.sort) p.set('sort', query.sort);
  if (query.page) p.set('page', String(query.page));
  if (query.page_size) p.set('page_size', String(query.page_size));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const httpClient: ApiClient = {
  getMe: () => req<Me>('/me'),
  getQueue: (query) => req<QueueResponse>(`/queue${qs(query)}`),
  triage: (caseId, body: TriageBody) =>
    req<TriageResponse>(`/queue/${encodeURIComponent(caseId)}/triage`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDrafts: () => req<DraftsResponse>('/drafts'),
  getCase: (caseId) => req<CaseForm>(`/cases/${encodeURIComponent(caseId)}`),
  patchField: (caseId, itemId, value) =>
    req<PatchFieldResponse>(
      `/cases/${encodeURIComponent(caseId)}/fields/${itemId}`,
      { method: 'PATCH', body: JSON.stringify({ value }) },
    ),
  fillUnknown: (caseId, section) =>
    req<FillUnknownResponse>(
      `/cases/${encodeURIComponent(caseId)}/fill-unknown`,
      { method: 'POST', body: JSON.stringify({ section }) },
    ),
  getEdits: (caseId) =>
    req<EditsResult>(`/cases/${encodeURIComponent(caseId)}/edits`),
  finish: (caseId) =>
    req<FinishResult>(`/cases/${encodeURIComponent(caseId)}/finish`, {
      method: 'POST',
    }),
  lookup: (system, q) =>
    req<LookupResponse>(
      `/lookup?system=${encodeURIComponent(system)}&q=${encodeURIComponent(q)}`,
    ),
};
