# REST API contract (the FE/BE seam) — LOCKED

FastAPI backend (`app/server/`) implements these. React frontend (`app/client/`) builds
against a mock of these first, then integrates. All endpoints run in the authenticated
user's context (Databricks Apps OAuth); `registrar_id` is derived server-side from the
authenticated user, never sent by the client. All bodies are JSON.

## Auth / user context
`GET /api/me` → `{ "email": "user@org.com", "display_name": "..." }`
(server-derived from Apps OAuth; used by the client for display only.)

## Queue (triage)
`GET /api/queue?label=&min_score=&sort=score_desc&page=1&page_size=50`
→ reads `flagged_cases` MINUS cases with a latest `not_reportable` decision and MINUS cases already in a draft/finalized state.
```json
{ "items": [ {
    "case_id": "C-0001", "patient_mrn": "MRN0001", "patient_name": "Jane Doe",
    "date_of_birth": "1968-04-11", "sex": "F",
    "primary_diagnosis_code": "C50.912", "primary_diagnosis_desc": "Malignant neoplasm of right breast",
    "diagnosis_date": "2026-06-02",
    "reportability_score": 0.94, "reportability_label": "likely_reportable",
    "classifier_rationale": "Invasive ductal carcinoma on path; C50 site...",
    "key_codes": ["C50.912","8500/3"], "flagged_at": "2026-06-03T14:12:00Z"
  } ], "page": 1, "page_size": 50, "total": 137 }
```

`POST /api/queue/{case_id}/triage`  body `{ "decision": "reportable" | "not_reportable", "notes": "" }`
→ inserts `case_decisions`. If `reportable`, triggers the abstraction Jobs run with `case_id` and returns its run id.
→ `{ "decision_id": 123, "decision": "reportable", "abstraction_run_id": "run-456" | null }`

## Drafts (left pane)
`GET /api/drafts` → the authenticated registrar's in-progress drafts (from `draft_case`).
```json
{ "items": [ { "case_id":"C-0001", "patient_name":"Jane Doe", "primary_diagnosis_desc":"...",
               "draft_status":"in_progress", "last_saved_at":"2026-06-04T09:30:00Z",
               "fields_total": 312, "fields_filled": 208 } ] }
```

## Case form (review / edit)
`GET /api/cases/{case_id}` → the full working form, fields joined to `naaccr_dictionary`, grouped by section.
```json
{ "case_id":"C-0001", "patient_name":"Jane Doe", "draft_status":"in_progress",
  "last_saved_at":"...", "abstraction_run_id":"run-456",
  "sections": [ {
     "section":"Tumor Identification",
     "fields": [ {
        "naaccr_item_id":400, "item_name":"primarySite", "label":"Primary Site",
        "data_type":"coded", "required":true,
        "value":"C50.9", "confidence":0.92, "field_status":"ai_suggested",
        "source_ref":{"doc_id":"path-77","section":"microscopic","quote":"...right breast..."},
        "valid_values":[{"code":"C50.9","label":"Breast, NOS"}], "unknown_code":null
     } ] } ],
  "edits": { "errors": [], "warnings": [] } }
```

`PATCH /api/cases/{case_id}/fields/{naaccr_item_id}`  body `{ "value": "C50.9" }`
→ upserts one `working_draft` row (sets `field_status='edited'`, `updated_by`, `updated_at`), touches `draft_case.last_saved_at`. This is the auto-save call (debounced client-side).
→ `{ "ok": true, "field_status":"edited", "edits": { "errors":[], "warnings":[] } }`

`POST /api/cases/{case_id}/fill-unknown`  body `{ "section": "Tumor Identification" | null }`
→ sets empty required fields in the section (or whole form if null) to their valid unknown code, `field_status='unknown'`.
→ `{ "updated": 12 }`

`GET /api/cases/{case_id}/edits` → run the NAACCR edits engine against current draft.
→ `{ "errors": [ {"naaccr_item_id":820,"message":"Regional nodes positive requires..."} ], "warnings": [] }`

`POST /api/cases/{case_id}/finish`
→ preconditions checked server-side: all `required` fields have a valid value AND edits have no errors. On success performs the ACID move to `finalized_forms` and deletes the draft.
→ 200 `{ "finalized": true, "finalized_at":"..." }`  |  409 `{ "finalized": false, "blocking": { "missing_required":[400], "edit_errors":[820] } }`

## Notes
- Cursor/offset pagination on `/api/queue`.
- All list endpoints filter to the authenticated registrar where ownership applies (`/api/drafts`).
- Server never trusts a client-supplied identity; `registrar_id` = authenticated user.
