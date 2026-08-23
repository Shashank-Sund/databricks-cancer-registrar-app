# Cancer Registrar App (Databricks reference implementation)

A deployable reference implementation of a hospital **cancer registry** workflow on
Databricks: surface reportable cancer cases faster and cut the manual NAACCR abstraction
burden on Certified Tumor Registrars / Oncology Data Specialists, with a **human
authoritative at every decision**. The demo focuses on **breast cancer** and the
**202 authentic NAACCR v25** breast-abstract data items. All data shipped here is
**synthetic** (no PHI).

Everything is config-driven (catalog, schemas, endpoints, and app name are Databricks
Asset Bundle variables), Unity Catalog native, and **serverless**, so it runs on both
**AWS and Azure Databricks** with only a handful of documented differences (see
[docs/CLOUD_NOTES.md](docs/CLOUD_NOTES.md)).

---

## Architecture (end to end)

```
Epic Clarity (synthetic)                              [ingest is OUT OF SCOPE]
  -> BRONZE            Clarity-style Delta tables (patients, encounters, notes, labs, path/rad/op reports)
  -> SILVER            Lakeflow SDP materialized views assemble multi-line notes and join
                       into one per-case context row (silver_case_context)
  -> CLASSIFIER        ai_query batch over silver, Llama-3.3-70B, reportability score  -> gold_flagged
  -> [Delta -> Lakebase synced tables]  gold_flagged, dictionary become read-only Postgres tables
  -> APP QUEUE         registrar reviews flagged cases
  -> YES / NO TRIAGE   (HUMAN GATE 1)  writes case_decisions (Lakebase, native)
        on YES: the app triggers the abstraction job for that case
  -> ABSTRACTION       Claude Opus, section-scoped NAACCR prompts, per-request (not batch)
                       reads the per-case context, emits each field with value + confidence + source
                       -> gold_form_ai_draft (Delta)   and seeds the Lakebase working_draft
  -> FORM REVIEW       registrar edits, fill-unknown, auto-save   (HUMAN GATE 2)
  -> FINISH            allowed only when required fields are valid and NAACCR edits pass
                       -> finalized_forms (Lakebase, native)
  -> [Lakebase CDF]    case_decisions / finalized_forms stream back to Delta for audit + analytics
```

Two layers cooperate:

- **Lakehouse (Delta + Unity Catalog):** Bronze / Silver / Gold, the classifier, and the
  abstraction agent. Batch, governed, cheap to recompute.
- **Lakebase (managed Postgres, OLTP):** the interactive app state (triage decisions,
  drafts, working fields, finalized forms). Interactive work is Lakebase-only and never
  round-trips the lakehouse, so it stays sub-10ms; lakehouse hops happen only at stage
  boundaries.

### Two "CDF" concepts (do not confuse them)

- **Delta CDF** (`delta.enableChangeDataFeed`) on the gold Delta sources. Powers the
  **Delta -> Lakebase** synced tables (read-only copies of the queue and dictionary).
- **Lakebase CDF** (`wal2delta`, `REPLICA IDENTITY FULL`) on the native Postgres tables.
  Captures **Postgres -> Delta** so triage decisions and finalized forms land back in the
  lakehouse for audit. This is Public Preview.

---

## Quickstart

Prerequisites: the [Databricks CLI](https://docs.databricks.com/en/dev-tools/cli/index.html)
with a profile for your workspace, a **serverless SQL warehouse**, and the serving
endpoints in your region (see [docs/CLOUD_NOTES.md](docs/CLOUD_NOTES.md)). Set your
workspace host and variables in `databricks.yml` (or pass `--var`). Full detail is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Path A: Instant sandbox (no generation, no pipeline, no LLM spend)

Loads the shipped sample dataset so you can click through the whole app immediately.

```bash
databricks bundle deploy -t dev
databricks bundle run load_sample_data -t dev          # loads 15 tables from sample_data/
python setup/provision_lakebase.py --catalog <your_catalog> --app-sp <app_sp_id>
# open the app (URL printed on its page in the workspace)
```

### Path B: Full pipeline (regenerate everything)

```bash
databricks bundle deploy -t dev
databricks bundle run setup -t dev                     # schemas + tables + dictionary + code lookup
databricks bundle run synthetic_data -t dev            # ~200 synthetic patients -> Bronze
databricks bundle run silver -t dev                    # Lakeflow SDP: Bronze -> Silver
databricks bundle run classifier -t dev                # ai_query -> gold_flagged
python setup/provision_lakebase.py --catalog <your_catalog> --app-sp <app_sp_id>
# open the app; triaging a case YES triggers the abstraction job live
```

---

## What is automated vs. manual

| Step | How |
|---|---|
| Jobs (setup, synthetic_data, classifier, abstraction, load_sample_data) | `databricks bundle deploy` |
| Silver Lakeflow SDP pipeline | `databricks bundle deploy` |
| The Databricks App (React + FastAPI) | `databricks bundle deploy` (resources/app.yml) |
| Set your workspace host + bundle variables | **Manual** (edit `databricks.yml` or `--var`) |
| Lakebase project, Delta->Lakebase synced tables, Lakebase CDF | **Manual, once**: `setup/provision_lakebase.py` (not a bundle resource yet) |
| Grant the app service principal Lakebase access | **Manual**: same script, `--app-sp <id>` (id shows on the app page after deploy) |
| Load data / run the pipeline | **Manual**: run the jobs above for your chosen path |

The app creates its own Postgres schema and 4 native tables on first request (as its
service principal), so you do not create those by hand.

---

## Repository layout

| Path | What it holds |
|---|---|
| `contracts/` | Source-of-truth architecture, API contract, Lakebase + gold schemas, NAACCR field model |
| `lakehouse/` | Bronze + Gold DDL, `create_schemas.sql`, `silver_pipeline.sql` (SDP), `run_sql.py` (serverless SQL runner), `generate_synthetic_data.py` |
| `ml/naaccr/` | `load_authentic_dictionary.py` (202 items, embedded) + `resource_official_dictionary.py` (re-source from NAACCR v25 XML) |
| `ml/classifier/` | `run_classifier.sql` (ai_query reportability) |
| `ml/abstraction/` | `run_abstraction.py` (Claude NAACCR abstraction) |
| `ml/prompts/` | Engineered classifier + abstraction prompts |
| `lakebase/ops/` | Operational utilities (refresh a synced table, clear/verify OLTP state, export sample data) |
| `setup/` | `provision_lakebase.py` (project + synced tables + CDF + SP grant) |
| `app/client/` | React 18 + TypeScript + Vite + Tailwind + shadcn/ui frontend |
| `app/server/` | FastAPI backend (serves the built client + the `/api`); prebuilt `static/` is committed |
| `resources/` | DABs resources: the jobs, the silver pipeline, and the app |
| `sample_data/` | Shipped Parquet: 10 Bronze tables + `silver_case_context` + 4 gold tables |
| `docs/` | Deployment guide, concepts primer, cloud notes |

### Sample data (shipped)

| Table | Rows | Table | Rows |
|---|---|---|---|
| bronze.patient | 200 | bronze.discharge_summary | 260 |
| bronze.encounter | 200 | bronze.lab_result | 924 |
| bronze.diagnosis | 200 | bronze.medication_order | 220 |
| bronze.clinical_note | 740 | silver.silver_case_context | 200 |
| bronze.pathology_report_text | 1098 | gold.gold_flagged | 200 |
| bronze.radiology_report_text | 664 | gold.gold_naaccr_dictionary | 202 |
| bronze.operative_note | 785 | gold.gold_form_ai_draft | 43 |
| | | gold.gold_code_lookup | 3286 |

---

## Key concepts and notes

- **Human in the loop.** The AI proposes; a registrar decides. Gate 1 is the reportable
  yes/no triage; gate 2 is the finish gate, which requires every required field to be
  valid and the NAACCR edits to pass before a form can be finalized.
- **Governance / OBO.** Databricks Apps OAuth identifies the signed-in user; the app reads
  Unity-Catalog-governed data on behalf of that user. Per-user Lakebase scoping is enforced
  at the app layer today, structured to move to DB-level per-user credentials when Lakebase
  ships them.
- **Authentic, re-sourceable dictionary.** The 202 NAACCR items are sourced from the
  official NAACCR v25 data dictionary (`naaccr-dictionary-250.xml`), not hand-coded. See
  `ml/naaccr/` to re-source when NAACCR publishes a new version.
- **Fill-unknown is grounded.** It stamps the authentic NAACCR *unknown* code into empty
  required fields; it never invents clinical values. A deterministic edits engine validates.
- **Graceful degradation.** If Lakebase is unreachable, the app falls back to an in-memory
  store so the UI still works. Check `GET /api/health` to see which store is active.
- **Cost.** Everything is serverless. Path A (sample data) incurs no model spend. Path B
  runs the classifier once and calls the abstraction model per triaged case.

See [docs/CONCEPTS.md](docs/CONCEPTS.md) for the registrar-domain primer and the design
rationale, and [docs/CLOUD_NOTES.md](docs/CLOUD_NOTES.md) for AWS vs Azure.
