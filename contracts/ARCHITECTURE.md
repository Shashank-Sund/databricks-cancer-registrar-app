# Cancer Registry Lakebase Demo — Architecture (source of truth)

> This file is the single source of truth for the build. The `contracts/` directory is
> **read-only** for build agents. Do not change contracts without the coordinator's approval.

## What this is

A reference implementation for a hospital **cancer registry** workflow on Databricks:
identify reportable cancer cases faster and reduce the manual abstraction burden on
Certified Tumor Registrars / Oncology Data Specialists, with humans authoritative at
every decision. Demo focus: **breast cancer**. The NAACCR form scales to the **full
300+ item** data dictionary, sourced data-driven (not hand-coded).

Portability is a hard requirement: everything is a **Databricks Asset Bundle**, fully
config-driven (catalog/schema/endpoint/app names are bundle variables), Unity Catalog
native, serverless, and idempotent. A customer must be able to `databricks bundle deploy`
this into their own workspace.

## End-to-end flow

```
Epic Clarity (synthetic)                          [ingest/watermark OUT OF SCOPE]
  → BRONZE (Clarity-mirroring Delta tables, multi-row notes preserved)
  → Lakeflow SDP → SILVER (note assembly, standardize, filter to breast oncology,
                           dedup, join into a per-case context table)
  → CLASSIFIER (FMAPI + reportability prompt, ai_query batch)  → gold_flagged
  → [SYNC] gold_flagged → Lakebase flagged_cases (read-only)   → App QUEUE
  → registrar YES/NO triage  (HUMAN GATE #1)
        · writes case_decisions (Lakebase, native, CDF → audit)
        · on YES: app backend calls Jobs API with case_id  (immediate trigger)
  → ABSTRACTION agent job (FMAPI + section-scoped NAACCR prompts + deterministic edits)
        · reads per-case context from SILVER
        · generates 300+ NAACCR fields, each with value + confidence + source
        · writes working_draft (Lakebase, direct)  AND  gold_form_ai_draft (Delta, audit/eval)
  → App FORM REVIEW: registrar edits, fills blanks, auto-save  (HUMAN GATE #2)
  → FINISH (required fields valid + NAACCR edits pass) → ACID move to finalized_forms
  → [CDF] finalized_forms → lakehouse → reporting job
        · NAACCR edits + sample NAACCR XML generation + registry_of_record  [REPRESENTED, not a live submission]
```

## The two "CDF" concepts (do not confuse)
- **Delta CDF** (`delta.enableChangeDataFeed`) on gold Delta sources — powers Delta→Lakebase synced tables.
- **Lakebase CDF** (`wal2delta`, `REPLICA IDENTITY FULL`) on native Postgres tables — Postgres→Delta capture. Public Preview. GA fallback = Lakehouse Federation read + scheduled MERGE.

## Latency principle
Interactive work (queue, form edit, save-for-later, resume) is **Lakebase OLTP only (<10ms)** and never round-trips the lakehouse. Lakehouse hops (synced tables, CDF; ~15s floor) happen only at stage boundaries.

## AI models (both FMAPI + engineered prompts, MLflow-wrapped; no custom training)
- **Classifier** (reportability score): default endpoint `databricks-claude-sonnet-5` (config-swappable). Batch `ai_query` over silver → `gold_flagged`. MLflow-traced.
- **Abstraction** (300+ NAACCR fields): default endpoint `databricks-claude-opus-5` (config-swappable). Section-scoped extraction over the NAACCR dictionary, structured JSON per field (value/confidence/source_span/known_unknown), MLflow pyfunc/agent. A deterministic NAACCR **edits engine** validates (representative rule set, extensible to full GenEDITS).

## Auth / OBO
Databricks Apps OAuth identifies the user automatically. The app reads UC-governed PHI **on-behalf-of the user** (UC grants enforced). Per-user access to Lakebase is enforced at the **app layer** today (scoping by authenticated `registrar_id`), structured to migrate to DB-level per-user credentials/RLS when Lakebase ships it.

## Agent responsibilities (parallel build)
- **Front-end agent** — `app/client/` only (React 18 + TS + Vite + Tailwind + shadcn/ui). Builds against a MOCK of `contracts/api_contract.md`.
- **Back-end agent** — everything else: `lakehouse/`, `ml/`, `lakebase/`, `app/server/` (FastAPI), `resources/`. Implements `contracts/api_contract.md`.
- **Seam** = `contracts/api_contract.md` + `contracts/lakebase_schema.sql` + `contracts/naaccr_field_model.md` + `contracts/gold_schemas.sql`.

## Config defaults (bundle variables — see databricks.yml)
- catalog `cancer_registry_demo`; schemas `bronze`, `silver`, `gold`
- lakebase project `cancer_registry`
- classifier endpoint `databricks-claude-sonnet-5`; abstraction endpoint `databricks-claude-opus-5`
- app name `cancer-registry`
