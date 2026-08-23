-- ============================================================================
-- Gold Delta schemas (Unity Catalog)  — CONTRACT
-- Catalog/schema are bundle variables; shown here as ${catalog}.gold.*
-- Tables feeding a Lakebase synced table have Delta CDF enabled.
-- ============================================================================

-- Classifier output; SOURCE for the Lakebase `flagged_cases` synced table.
CREATE TABLE IF NOT EXISTS ${catalog}.gold.gold_flagged (
    case_id                 STRING  NOT NULL,      -- sync primary key
    patient_mrn             STRING,
    patient_name            STRING,
    date_of_birth           DATE,
    sex                     STRING,
    primary_diagnosis_code  STRING,                -- ICD-10 (breast = C50.x)
    primary_diagnosis_desc  STRING,
    diagnosis_date          DATE,
    reportability_score     DECIMAL(4,3),          -- 0.000-1.000
    reportability_label     STRING,                -- likely_reportable | uncertain | not_reportable
    classifier_rationale    STRING,
    key_codes               STRING,                -- JSON array (maps to JSONB in Lakebase)
    source_facility         STRING,
    flagged_at              TIMESTAMP
) TBLPROPERTIES (delta.enableChangeDataFeed = true);

-- NAACCR data dictionary (data-driven field set); SOURCE for `naaccr_dictionary` synced table.
CREATE TABLE IF NOT EXISTS ${catalog}.gold.gold_naaccr_dictionary (
    naaccr_item_id  INT     NOT NULL,              -- sync primary key (NAACCR item number)
    item_name       STRING,                        -- NAACCR XML id, e.g. 'primarySite'
    section         STRING,                        -- form section (Demographics, Tumor ID, Stage, Treatment, Follow-up, ...)
    data_type       STRING,                        -- coded | numeric | date | text
    length          INT,
    required        BOOLEAN,
    valid_values    STRING,                        -- JSON: [{code, label}] for coded items (maps to JSONB)
    unknown_code    STRING,                        -- valid "unknown" code (e.g. '9','99','999')
    description     STRING
) TBLPROPERTIES (delta.enableChangeDataFeed = true);

-- Abstraction agent output (AI original, for audit + AI-vs-human eval). NOT synced.
CREATE TABLE IF NOT EXISTS ${catalog}.gold.gold_form_ai_draft (
    case_id             STRING NOT NULL,
    naaccr_item_id      INT    NOT NULL,
    item_name           STRING,
    value               STRING,
    confidence          DECIMAL(4,3),
    source_ref          STRING,                    -- JSON {doc_id, section, quote}
    field_status        STRING,
    abstraction_run_id  STRING,
    generated_at        TIMESTAMP
);

-- Registry of record: built from lb_finalized_forms_history (Lakebase CDF). One row per finalized case.
CREATE TABLE IF NOT EXISTS ${catalog}.gold.registry_of_record (
    case_id             STRING NOT NULL,
    registrar_id        STRING,
    finalized_at        TIMESTAMP,
    edits_passed        BOOLEAN,
    form_version        INT,
    form_data           STRING,                    -- JSON full NAACCR field set
    naaccr_xml          STRING                     -- generated sample NAACCR XML (represented reporting step)
);
