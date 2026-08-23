"""One-time: export the synthetic demo dataset to Parquet in a UC Volume, then zip
it for download into the repo's sample_data/. Shipping this lets users load a working
demo dataset without regenerating synthetic data (bronze) or re-running the pipeline
(silver/gold). Uses pure Spark parquet writes so schema (including nested columns like
source_ref / valid_values) round-trips exactly.
"""
import os
import shutil
import zipfile

from pyspark.sql import SparkSession

spark = SparkSession.builder.getOrCreate()

CAT = "serverless_stable_omnigent_catalog"
VOL = f"/Volumes/{CAT}/cancer_gold/exports"
OUT = f"{VOL}/sample_data"

TABLES = {
    # Bronze (Clarity-style synthetic source) -> lets users skip synthetic generation
    "bronze/patient": f"{CAT}.cancer_bronze.patient",
    "bronze/encounter": f"{CAT}.cancer_bronze.encounter",
    "bronze/diagnosis": f"{CAT}.cancer_bronze.diagnosis",
    "bronze/clinical_note": f"{CAT}.cancer_bronze.clinical_note",
    "bronze/pathology_report_text": f"{CAT}.cancer_bronze.pathology_report_text",
    "bronze/radiology_report_text": f"{CAT}.cancer_bronze.radiology_report_text",
    "bronze/operative_note": f"{CAT}.cancer_bronze.operative_note",
    "bronze/discharge_summary": f"{CAT}.cancer_bronze.discharge_summary",
    "bronze/lab_result": f"{CAT}.cancer_bronze.lab_result",
    "bronze/medication_order": f"{CAT}.cancer_bronze.medication_order",
    # Silver + Gold outputs -> lets users skip the pipeline + LLM and run the app instantly
    "silver/silver_case_context": f"{CAT}.cancer_silver.silver_case_context",
    "gold/gold_flagged": f"{CAT}.cancer_gold.gold_flagged",
    "gold/gold_naaccr_dictionary": f"{CAT}.cancer_gold.gold_naaccr_dictionary",
    "gold/gold_form_ai_draft": f"{CAT}.cancer_gold.gold_form_ai_draft",
    "gold/gold_code_lookup": f"{CAT}.cancer_gold.gold_code_lookup",
}

manifest = {}
for rel, fqtn in TABLES.items():
    df = spark.read.table(fqtn)
    n = df.count()
    df.coalesce(1).write.mode("overwrite").parquet(f"{OUT}/{rel}")
    manifest[rel] = n
    print(f"exported {rel}: {n} rows")

# Zip the whole sample_data tree (Volumes are FUSE-mounted, so copy locally then zip).
local_root = "/tmp/sample_data_export"
if os.path.exists(local_root):
    shutil.rmtree(local_root)
shutil.copytree(OUT, local_root)
zip_local = "/tmp/sample_data.zip"
with zipfile.ZipFile(zip_local, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(local_root):
        for f in files:
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, local_root))
shutil.copyfile(zip_local, f"{VOL}/sample_data.zip")

print("MANIFEST:", manifest)
print("TOTAL_ROWS:", sum(manifest.values()))
print("ZIP:", f"{VOL}/sample_data.zip")
print("DONE")
