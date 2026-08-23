-- Reportability classifier -> gold_flagged (served to the triage queue via Lakebase sync).
-- Batch inference with ai_query. ${classifier_endpoint} is a bundle variable.
-- IMPORTANT: use a batch-inference-capable endpoint. Claude endpoints in some workspaces
-- do NOT support ai_query batch; default is databricks-meta-llama-3-3-70b-instruct.
-- gold_flagged keeps Delta CDF enabled because it is the source of a Lakebase synced table.

CREATE OR REPLACE TABLE ${catalog}.${gold_schema}.gold_flagged
TBLPROPERTIES (delta.enableChangeDataFeed = true) AS
WITH scored AS (
  SELECT case_id, patient_id, first_name, last_name, date_of_birth, sex,
         diagnosis_code, diagnosis_desc, diagnosis_date, facility_name,
    ai_query('${classifier_endpoint}',
      CONCAT(
        'You are a certified cancer registry reportability classifier for a US hospital cancer registry. ',
        'Using the diagnosis and pathology report, decide whether this case is reportable to the hospital cancer registry. ',
        'Reportable = a primary BREAST cancer that is malignant or in situ (invasive ductal/lobular carcinoma, DCIS). ',
        'Not reportable = benign breast lesions (fibroadenoma, fibrocystic changes) and cutaneous basal/squamous skin cancers of breast skin. ',
        'Atypical/uncertain lesions (atypical ductal hyperplasia) = uncertain, flag for registrar review. ',
        'Respond with ONLY a compact minified JSON object, no other text, no markdown: ',
        '{"reportability_label":"likely_reportable|uncertain|not_reportable","reportability_score":<0.0-1.0 probability reportable>,"rationale":"<one sentence>","key_codes":["<codes or terms>"]}. ',
        'DIAGNOSIS: ', diagnosis_code, ' - ', diagnosis_desc, '\nPATHOLOGY REPORT:\n', pathology_text
      )
    ) AS response
  FROM ${catalog}.${silver_schema}.silver_case_context
),
parsed AS (
  SELECT *, from_json(response,
    'struct<reportability_label:string,reportability_score:double,rationale:string,key_codes:array<string>>') AS r
  FROM scored
)
SELECT case_id,
  replace(patient_id,'PAT','MRN') AS patient_mrn,
  concat(first_name,' ',last_name) AS patient_name,
  date_of_birth, sex,
  diagnosis_code AS primary_diagnosis_code,
  diagnosis_desc AS primary_diagnosis_desc,
  diagnosis_date,
  CAST(r.reportability_score AS DECIMAL(4,3)) AS reportability_score,
  r.reportability_label,
  r.rationale AS classifier_rationale,
  to_json(r.key_codes) AS key_codes,
  facility_name AS source_facility,
  current_timestamp() AS flagged_at
FROM parsed;
