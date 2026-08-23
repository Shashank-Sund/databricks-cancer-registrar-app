# Concepts: cancer registry domain and design decisions

## The domain

A hospital **cancer registry** is a mandated system that identifies, abstracts, and
reports every reportable cancer case the facility diagnoses or treats. The people who do
this are **Certified Tumor Registrars (CTRs)** / **Oncology Data Specialists (ODS)**.
Their work has two expensive phases:

1. **Casefinding / reportability.** Decide which cases are reportable to the registry.
   Reportable generally means a primary malignant or in-situ tumor. Benign lesions and
   most cutaneous basal/squamous skin cancers are not reportable; some lesions are
   uncertain and need review. This demo scopes it to breast: invasive ductal/lobular
   carcinoma and DCIS are reportable; fibroadenoma and fibrocystic change are not.
2. **Abstraction.** For each reportable case, code a large structured record following the
   **NAACCR** standard: demographics, tumor identification (site, histology, behavior,
   grade, laterality), stage/extent, site-specific data items (for breast: ER, PR, HER2,
   Ki-67, Oncotype), first-course treatment, and follow-up. Codes come from **ICD-O-3**
   (site + histology), **AJCC 8th** (stage), and the **SEER SSDI** manual (site-specific
   items). A full abstract is hundreds of items; this demo ships the 202 authentic NAACCR
   v25 items relevant to a breast abstract.

Both phases are today largely manual chart review. That is the burden this reference
implementation targets: use models to *propose* the reportability call and the coded
fields (each with a confidence and a source quote), and keep the registrar authoritative.

## Design decisions

- **Lakebase for the interactive OLTP state.** The queue triage, drafts, per-field edits,
  auto-save, and finalized forms are transactional, low-latency, per-user operations.
  Those belong in an operational database, not the lakehouse. Interactive requests hit
  Lakebase only and stay sub-10ms; the lakehouse is touched only at stage boundaries.

- **Delta -> Lakebase synced tables** give the app read-only, in-Postgres copies of the
  flagged queue and the dictionary. (In this build the app actually reads reference data
  from Delta through the SQL warehouse; the synced tables are provisioned as a showcase of
  the reverse-ETL pattern and are optional.)

- **Lakebase CDF -> Delta** streams the registrar's decisions and finalized forms back to
  the lakehouse, so audit and analytics live in Unity Catalog alongside everything else.

- **Foundation models + engineered prompts, no custom training.** Both models are called
  through Databricks serving with section-scoped, structured-output prompts:
  - **Classifier** (reportability): `ai_query` batch over the per-case context, writing a
    label + score to `gold_flagged`. A batch-capable endpoint is required.
  - **Abstraction**: a per-request call per NAACCR section, returning each field as
    `{value, confidence, source}` so the UI can show provenance and the registrar can
    verify against the quoted chart text. A deterministic edits engine validates coded
    values and cross-field rules.

- **Authentic, re-sourceable dictionary.** The field dictionary is derived from the
  official NAACCR v25 data dictionary, not hand-authored, so item numbers, names, code
  systems, and unknown codes are correct and can be regenerated when NAACCR updates.

- **Human gates by construction.** Nothing is finalized without a registrar. The reportable
  triage is an explicit yes/no; the finish action is blocked until every required field is
  valid and the edits pass. "Fill unknown" only stamps authentic NAACCR unknown codes into
  empty required fields, so the app never fabricates a clinical value.

- **Portable and serverless.** No cloud-specific instance types, no hardcoded workspace
  values. Catalog, schemas, endpoints, and the app name are bundle variables; the Lakebase
  host resolves at runtime from the endpoint name, so the same artifact runs on AWS and
  Azure.
