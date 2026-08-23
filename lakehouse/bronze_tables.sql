-- ============================================================================
-- Bronze Delta tables — Clarity-mirroring patterns
-- Multi-row notes preserved with LINE_ID ordering
-- ============================================================================

USE CATALOG ${catalog};
USE SCHEMA ${bronze_schema};

-- Patient Demographics (one row per patient)
CREATE TABLE IF NOT EXISTS patient (
    patient_id           STRING NOT NULL,              -- Epic patient ID (MRN-like)
    mrn                  STRING NOT NULL,              -- Medical Record Number
    first_name           STRING,
    last_name            STRING,
    date_of_birth        DATE,
    sex                  STRING,                       -- M, F, Other
    race                 STRING,                       -- coded value
    ethnicity            STRING,                       -- coded value
    active_status        STRING,                       -- Active, Inactive, Deceased
    deceased_date        TIMESTAMP,
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Encounter (one row per visit/admission)
CREATE TABLE IF NOT EXISTS encounter (
    encounter_id         STRING NOT NULL,              -- Epic visit ID
    patient_id           STRING NOT NULL,              -- FK patient
    encounter_date       DATE NOT NULL,
    encounter_time       TIMESTAMP,
    discharge_date       DATE,
    encounter_type       STRING,                       -- Office Visit, Inpatient, ED, etc.
    facility_name        STRING,
    department           STRING,                       -- Oncology, Pathology, etc.
    primary_provider     STRING,                       -- Provider name
    admission_source     STRING,
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Diagnosis (ICD-10 codes, one row per diagnosis per encounter)
CREATE TABLE IF NOT EXISTS diagnosis (
    diagnosis_id         STRING NOT NULL,              -- unique key
    encounter_id         STRING NOT NULL,              -- FK encounter
    patient_id           STRING NOT NULL,              -- denormalized FK
    diagnosis_code       STRING NOT NULL,              -- ICD-10 code (e.g., C50.x)
    diagnosis_desc       STRING,
    diagnosis_date       DATE,
    diagnosis_sequence   INT,                          -- primary=1, secondary>1
    behavior             STRING,                       -- ICD-10 behavior (e.g., /3=malignant, /2=in-situ)
    status               STRING,                       -- Active, Inactive, Ruled Out
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Pathology Reports (multi-row by LINE_ID for each note, preserving narrative)
CREATE TABLE IF NOT EXISTS pathology_report_text (
    pathology_id         STRING NOT NULL,              -- unique report ID
    patient_id           STRING NOT NULL,              -- denormalized FK
    encounter_id         STRING,                       -- FK encounter
    line_id              INT NOT NULL,                 -- line order (1, 2, 3...) for assembly
    report_section       STRING,                       -- Clinical History, Gross Exam, Microscopic, Impression, etc.
    text_line            STRING,                       -- text content for this line
    specimen_number      STRING,                       -- if applicable
    accession_number     STRING,
    provider_name        STRING,                       -- pathologist
    report_date          DATE,
    signed_date          TIMESTAMP,                    -- when finalized/signed
    status               STRING,                       -- Draft, Preliminary, Final
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Clinical Notes (multi-row by LINE_ID)
CREATE TABLE IF NOT EXISTS clinical_note (
    note_id              STRING NOT NULL,              -- unique note ID
    patient_id           STRING NOT NULL,              -- denormalized FK
    encounter_id         STRING NOT NULL,              -- FK encounter
    line_id              INT NOT NULL,                 -- line order for assembly
    note_type            STRING,                       -- Progress Note, Consultation, etc.
    text_line            STRING,
    provider_name        STRING,
    note_date            DATE,
    signed_date          TIMESTAMP,
    status               STRING,                       -- Draft, Unsigned, Signed
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Operative Notes (multi-row by LINE_ID)
CREATE TABLE IF NOT EXISTS operative_note (
    operative_note_id    STRING NOT NULL,              -- unique ID
    patient_id           STRING NOT NULL,              -- denormalized FK
    encounter_id         STRING NOT NULL,              -- FK encounter
    line_id              INT NOT NULL,                 -- line order
    procedure_code       STRING,                       -- CPT code (surgical procedure)
    procedure_desc       STRING,
    section              STRING,                       -- Indications, Procedure, Findings, etc.
    text_line            STRING,
    surgeon_name         STRING,
    operative_date       DATE,
    signed_date          TIMESTAMP,
    status               STRING,                       -- Draft, Final
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Medication Orders (chemo, targeted therapy, etc.)
CREATE TABLE IF NOT EXISTS medication_order (
    order_id             STRING NOT NULL,              -- unique order ID
    patient_id           STRING NOT NULL,              -- denormalized FK
    encounter_id         STRING,                       -- FK encounter
    medication_code      STRING,                       -- RxNorm/NDC code
    medication_name      STRING,                       -- e.g., Doxorubicin, Tamoxifen
    medication_type      STRING,                       -- Chemotherapy, Hormone Therapy, etc.
    dose                 STRING,                       -- with units
    frequency            STRING,
    route                STRING,                       -- IV, PO, IM, etc.
    start_date           DATE,
    end_date             DATE,
    status               STRING,                       -- Ordered, Active, Completed, Discontinued
    order_date           TIMESTAMP,
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Radiology Reports (multi-row by LINE_ID for text)
CREATE TABLE IF NOT EXISTS radiology_report_text (
    radiology_id         STRING NOT NULL,              -- unique report ID
    patient_id           STRING NOT NULL,              -- denormalized FK
    encounter_id         STRING,                       -- FK encounter
    line_id              INT NOT NULL,                 -- line order
    exam_type            STRING,                       -- Mammography, Ultrasound, MRI, etc.
    anatomy              STRING,                       -- Bilateral Breast, Right Breast, etc.
    section              STRING,                       -- Indications, Findings, Impression, etc.
    text_line            STRING,
    radiologist_name     STRING,
    exam_date            DATE,
    signed_date          TIMESTAMP,
    status               STRING,                       -- Draft, Preliminary, Final
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Lab Results (one row per result per encounter; ER/PR/HER2 for breast cancer)
CREATE TABLE IF NOT EXISTS lab_result (
    lab_id               STRING NOT NULL,              -- unique lab result ID
    patient_id           STRING NOT NULL,              -- denormalized FK
    encounter_id         STRING NOT NULL,              -- FK encounter
    test_code            STRING NOT NULL,              -- LOINC code
    test_name            STRING,                       -- Estrogen Receptor, Progesterone Receptor, HER2, CBC, etc.
    result_value         STRING,                       -- numeric or coded (e.g., Positive, Negative, Score:1+)
    result_unit          STRING,
    reference_range      STRING,
    result_date          DATE,
    specimen_type        STRING,                       -- Blood, Tissue, etc.
    status               STRING,                       -- Preliminary, Final, Corrected
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;

-- Discharge Summary (multi-row by LINE_ID for text)
CREATE TABLE IF NOT EXISTS discharge_summary (
    discharge_id         STRING NOT NULL,              -- unique ID
    patient_id           STRING NOT NULL,              -- denormalized FK
    encounter_id         STRING NOT NULL,              -- FK encounter
    line_id              INT NOT NULL,                 -- line order
    section              STRING,                       -- Summary, Hospital Course, Diagnosis, Discharge Meds, Follow-up, etc.
    text_line            STRING,
    discharge_date       DATE,
    signed_date          TIMESTAMP,
    status               STRING,                       -- Draft, Final
    created_at           TIMESTAMP,
    updated_at           TIMESTAMP
)
USING DELTA;
