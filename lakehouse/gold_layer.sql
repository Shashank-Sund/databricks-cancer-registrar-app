-- ============================================================================
-- Gold Layer — Classifier Output & NAACCR Dictionary
-- ============================================================================

USE CATALOG ${catalog};
USE SCHEMA ${gold_schema};

-- ============================================================================
-- Gold Table: gold_flagged
-- Classifier output (reportability score + label) — syncs to Lakebase
-- Initially empty (populated by Phase 2 classifier job); schema created here
-- ============================================================================

CREATE TABLE IF NOT EXISTS gold_flagged (
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
    key_codes               STRING,                -- JSON array
    source_facility         STRING,
    flagged_at              TIMESTAMP
)
USING DELTA
TBLPROPERTIES (delta.enableChangeDataFeed = true);

-- ============================================================================
-- Gold Table: gold_naaccr_dictionary
-- Data-driven NAACCR field model (300+ items) — syncs to Lakebase
-- Loaded via Python loader in ml/naaccr/
-- ============================================================================

CREATE TABLE IF NOT EXISTS gold_naaccr_dictionary (
    naaccr_item_id  INT     NOT NULL,              -- sync primary key (NAACCR item number)
    item_name       STRING,                        -- NAACCR XML id, e.g. 'primarySite'
    section         STRING,                        -- form section (Demographics, Tumor ID, Stage, Treatment, Follow-up, ...)
    data_type       STRING,                        -- coded | numeric | date | text
    length          INT,
    required        BOOLEAN,
    valid_values    STRING,                        -- JSON: [{code, label}] for coded items
    unknown_code    STRING,                        -- valid "unknown" code (e.g. '9','99','999')
    description     STRING
)
USING DELTA
TBLPROPERTIES (delta.enableChangeDataFeed = true);

-- ============================================================================
-- Gold Table: gold_form_ai_draft (NOT SYNCED)
-- Abstraction agent output — one row per field per case
-- Used for audit and AI-vs-human evaluation
-- ============================================================================

CREATE TABLE IF NOT EXISTS gold_form_ai_draft (
    case_id             STRING NOT NULL,
    naaccr_item_id      INT    NOT NULL,
    item_name           STRING,
    value               STRING,
    confidence          DECIMAL(4,3),
    source_ref          STRING,                    -- JSON {doc_id, section, quote}
    field_status        STRING,
    abstraction_run_id  STRING,
    generated_at        TIMESTAMP
)
USING DELTA;

-- ============================================================================
-- Gold Table: registry_of_record (NOT SYNCED)
-- Built from Lakebase finalized_forms (via CDF trigger in Phase 3)
-- One row per finalized case; immutable audit record
-- ============================================================================

CREATE TABLE IF NOT EXISTS registry_of_record (
    case_id             STRING NOT NULL,
    registrar_id        STRING,
    finalized_at        TIMESTAMP,
    edits_passed        BOOLEAN,
    form_version        INT,
    form_data           STRING,                    -- JSON full NAACCR field set
    naaccr_xml          STRING                     -- generated sample NAACCR XML
)
USING DELTA;
