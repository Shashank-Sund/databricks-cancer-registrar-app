-- ============================================================================
-- Lakebase (Postgres 17) data model  — CONFIRMED / LOCKED
-- ============================================================================
-- 6 tables total:
--   SYNCED (read-only, Delta->Lakebase):  flagged_cases, naaccr_dictionary
--   NATIVE (app-owned):                    case_decisions, draft_case,
--                                          working_draft, finalized_forms
--   CDF-enabled (Postgres->Delta):         case_decisions, finalized_forms
--
-- Design rules:
--   * Enforced FKs ONLY between native tables. References to synced tables
--     (flagged_cases, naaccr_dictionary) are plain indexed columns, never
--     enforced FKs (the sync pipeline owns those tables' lifecycle).
--   * Case state is DERIVED from table membership (no status column to drift):
--       no decision row               -> Queue
--       latest decision not_reportable-> dropped
--       reportable + draft_case row   -> My Drafts (in progress)
--       finalized_forms row           -> Done
--   * working_draft is field-level (efficient granular auto-save, scales to 300+).
--     finalized_forms is a JSONB snapshot per case (immutable signed record,
--     clean 1-row-per-finalize CDF trigger).
-- ============================================================================

-- ---- NATIVE TABLES ---------------------------------------------------------

-- Append-only triage decisions. Durable audit record; the app ALSO fires the
-- Jobs API on 'reportable' for immediate abstraction (CDF here = audit/analytics).
CREATE TABLE case_decisions (
    decision_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    case_id       TEXT        NOT NULL,           -- logical ref -> flagged_cases.case_id
    decision      TEXT        NOT NULL CHECK (decision IN ('reportable','not_reportable')),
    registrar_id  TEXT        NOT NULL,           -- authenticated user (who decided)
    decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes         TEXT
);
CREATE INDEX ix_decisions_case ON case_decisions (case_id, decided_at DESC);
ALTER TABLE case_decisions REPLICA IDENTITY FULL;      -- required for Lakebase CDF

-- Draft header: one per in-progress case, owned by a registrar.
CREATE TABLE draft_case (
    case_id            TEXT        PRIMARY KEY,   -- logical ref to the case
    assigned_to        TEXT        NOT NULL,      -- registrar email; powers "My Drafts"
    draft_status       TEXT        NOT NULL DEFAULT 'in_progress'
                                   CHECK (draft_status IN ('in_progress','ready_to_finish')),
    abstraction_run_id TEXT,                      -- Jobs run that generated the draft
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_saved_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_draft_owner ON draft_case (assigned_to, draft_status);

-- Field-level working values: 300+ fields, one row each (granular auto-save).
CREATE TABLE working_draft (
    case_id         TEXT        NOT NULL REFERENCES draft_case(case_id) ON DELETE CASCADE,
    naaccr_item_id  INTEGER     NOT NULL,         -- logical ref -> naaccr_dictionary.naaccr_item_id
    value           TEXT,                         -- coded value (NULL = not yet filled)
    confidence      NUMERIC(4,3),                 -- AI confidence 0.000-1.000; NULL if human-entered
    source_ref      JSONB,                        -- provenance {doc_id, section, quote}
    field_status    TEXT        NOT NULL DEFAULT 'ai_suggested'
                                CHECK (field_status IN ('ai_suggested','edited','confirmed','unknown','blank')),
    updated_by      TEXT,                         -- user email; NULL if AI-written
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (case_id, naaccr_item_id)
);

-- Immutable signed-off form: one row per finalized case.
CREATE TABLE finalized_forms (
    case_id            TEXT        PRIMARY KEY,
    registrar_id       TEXT        NOT NULL,       -- signed off by
    finalized_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    edits_passed       BOOLEAN     NOT NULL,       -- all NAACCR edits passed at finish
    form_version       INTEGER     NOT NULL DEFAULT 1,
    abstraction_run_id TEXT,
    form_data          JSONB       NOT NULL        -- [{naaccr_item_id,name,value,confidence,source_ref,status,entered_by}, ...]
);
CREATE INDEX ix_finalized_at ON finalized_forms (finalized_at);
ALTER TABLE finalized_forms REPLICA IDENTITY FULL;     -- required for Lakebase CDF

-- ---- SYNCED TABLES (created by the Delta->Lakebase sync, shown for reference) ----
-- flagged_cases      <- gold.gold_flagged             PK case_id            (continuous)
--   add PG indexes after sync: (reportability_score DESC), (flagged_at)
-- naaccr_dictionary  <- gold.gold_naaccr_dictionary   PK naaccr_item_id     (triggered)
-- See contracts/gold_schemas.sql for source column definitions.

-- ---- FINISH TRANSACTION (single ACID move; implemented in app/server) ----------
--   BEGIN;
--     INSERT INTO finalized_forms (case_id, registrar_id, edits_passed, abstraction_run_id, form_data)
--       SELECT :case_id, :registrar_id, :edits_passed, dc.abstraction_run_id,
--              jsonb_agg(jsonb_build_object('naaccr_item_id', wd.naaccr_item_id, 'value', wd.value,
--                        'confidence', wd.confidence, 'source_ref', wd.source_ref,
--                        'status', wd.field_status, 'entered_by', wd.updated_by))
--       FROM working_draft wd JOIN draft_case dc USING (case_id)
--       WHERE wd.case_id = :case_id GROUP BY dc.abstraction_run_id;
--     DELETE FROM draft_case WHERE case_id = :case_id;   -- cascades working_draft
--   COMMIT;
