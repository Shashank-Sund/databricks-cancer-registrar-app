-- ============================================================================
-- Silver — Lakeflow SDP (Spark Declarative Pipelines), MATERIALIZED VIEWS
-- ============================================================================
-- Bronze here is batch synthetic data, so MATERIALIZED VIEWS (full recompute) are
-- the correct primitive: note assembly needs GROUP BY per report, and case_context
-- needs multi-way joins + pre-aggregated labs/meds. (The earlier version used
-- windowed STRING_AGG on STREAMING TABLEs, which returns one row PER LINE and fans
-- out on join — the cause of the repeated-line degeneration. Do not reintroduce it.)
--
-- Pipeline configuration provides ${catalog} and ${bronze_schema}. The pipeline's
-- target catalog/schema is the SILVER schema, so these MVs are created there.
-- This logic is identical to what was validated on the demo data (200 clean cases).
-- ============================================================================

-- ---- Assembled notes: ONE ROW PER REPORT, lines ordered by line_id ----------

CREATE OR REFRESH MATERIALIZED VIEW silver_pathology_assembled AS
SELECT pathology_id, patient_id, encounter_id, MAX(report_date) AS report_date,
       concat_ws('\n', transform(array_sort(collect_list(struct(line_id, report_section, text_line))),
                                  x -> concat(x.report_section, ': ', x.text_line))) AS assembled_text
FROM ${catalog}.${bronze_schema}.pathology_report_text
WHERE status = 'Final'
GROUP BY pathology_id, patient_id, encounter_id;

CREATE OR REFRESH MATERIALIZED VIEW silver_clinical_assembled AS
SELECT note_id, patient_id, encounter_id, MAX(note_type) AS note_type,
       concat_ws('\n', transform(array_sort(collect_list(struct(line_id, text_line))), x -> x.text_line)) AS assembled_text
FROM ${catalog}.${bronze_schema}.clinical_note
WHERE status = 'Signed'
GROUP BY note_id, patient_id, encounter_id;

CREATE OR REFRESH MATERIALIZED VIEW silver_operative_assembled AS
SELECT operative_note_id, patient_id, encounter_id, MAX(procedure_desc) AS procedure_desc,
       concat_ws('\n', transform(array_sort(collect_list(struct(line_id, section, text_line))),
                                  x -> concat(x.section, ': ', x.text_line))) AS assembled_text
FROM ${catalog}.${bronze_schema}.operative_note
WHERE status = 'Final'
GROUP BY operative_note_id, patient_id, encounter_id;

CREATE OR REFRESH MATERIALIZED VIEW silver_radiology_assembled AS
SELECT radiology_id, patient_id, encounter_id, MAX(exam_type) AS exam_type,
       concat_ws('\n', transform(array_sort(collect_list(struct(line_id, section, text_line))),
                                  x -> concat(x.section, ': ', x.text_line))) AS assembled_text
FROM ${catalog}.${bronze_schema}.radiology_report_text
WHERE status = 'Final'
GROUP BY radiology_id, patient_id, encounter_id;

CREATE OR REFRESH MATERIALIZED VIEW silver_discharge_assembled AS
SELECT discharge_id, patient_id, encounter_id,
       concat_ws('\n', transform(array_sort(collect_list(struct(line_id, section, text_line))),
                                  x -> concat(x.section, ': ', x.text_line))) AS assembled_text
FROM ${catalog}.${bronze_schema}.discharge_summary
WHERE status = 'Final'
GROUP BY discharge_id, patient_id, encounter_id;

-- ---- Pre-aggregated labs / meds: ONE ROW PER PATIENT (prevents join fan-out) --

CREATE OR REFRESH MATERIALIZED VIEW silver_labs_agg AS
SELECT patient_id, collect_list(struct(test_name, result_value, result_unit, result_date)) AS lab_results
FROM (SELECT *, row_number() OVER (PARTITION BY patient_id, test_name ORDER BY result_date DESC) AS rn
      FROM ${catalog}.${bronze_schema}.lab_result WHERE status = 'Final')
WHERE rn = 1
GROUP BY patient_id;

CREATE OR REFRESH MATERIALIZED VIEW silver_meds_agg AS
SELECT patient_id, collect_list(struct(medication_name, medication_type, start_date, end_date, status)) AS medications
FROM ${catalog}.${bronze_schema}.medication_order
WHERE medication_type IN ('Chemotherapy', 'Hormone Therapy', 'Targeted Therapy')
GROUP BY patient_id;

-- ---- CORE: case_context — ONE ROW PER CASE (all candidates for the classifier) --
-- Includes reportable AND non-reportable/uncertain cases; the classifier scores each.

CREATE OR REFRESH MATERIALIZED VIEW silver_case_context AS
SELECT
    concat(d.patient_id, '_', d.diagnosis_code, '_', d.diagnosis_date) AS case_id,
    d.patient_id, d.encounter_id,
    p.first_name, p.last_name, p.date_of_birth,
    (year(d.diagnosis_date) - year(p.date_of_birth)) AS age_at_diagnosis,
    p.sex, p.race, p.ethnicity,
    d.diagnosis_code, d.diagnosis_desc, d.diagnosis_date, d.behavior,
    e.encounter_date, e.encounter_type, e.facility_name, e.department,
    pa.assembled_text AS pathology_text,
    cl.assembled_text AS clinical_text,
    op.assembled_text AS operative_text,
    ra.assembled_text AS radiology_text,
    ds.assembled_text AS discharge_text,
    lb.lab_results, md.medications,
    current_timestamp() AS case_created_at
FROM ${catalog}.${bronze_schema}.diagnosis d
JOIN ${catalog}.${bronze_schema}.patient   p ON d.patient_id  = p.patient_id
JOIN ${catalog}.${bronze_schema}.encounter e ON d.encounter_id = e.encounter_id
LEFT JOIN silver_pathology_assembled pa ON d.patient_id = pa.patient_id AND d.encounter_id = pa.encounter_id
LEFT JOIN silver_clinical_assembled  cl ON d.patient_id = cl.patient_id AND d.encounter_id = cl.encounter_id
LEFT JOIN silver_operative_assembled op ON d.patient_id = op.patient_id AND d.encounter_id = op.encounter_id
LEFT JOIN silver_radiology_assembled ra ON d.patient_id = ra.patient_id AND d.encounter_id = ra.encounter_id
LEFT JOIN silver_discharge_assembled ds ON d.patient_id = ds.patient_id AND d.encounter_id = ds.encounter_id
LEFT JOIN silver_labs_agg lb ON d.patient_id = lb.patient_id
LEFT JOIN silver_meds_agg md ON d.patient_id = md.patient_id
WHERE d.status = 'Active';
