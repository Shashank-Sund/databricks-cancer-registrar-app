"""Load the shipped sample dataset (Parquet) into Delta tables in the target catalog.

This lets you run the full app with ZERO synthetic generation, pipeline runs, or LLM
spend (the "instant sandbox" path), and also supplies reference data (NAACCR dictionary,
code lookup) for the full-pipeline path.

Usage (spark_python_task parameters):
  load_sample_data.py catalog=<c> bronze_schema=<b> silver_schema=<s> gold_schema=<g> [tables=all|t1,t2,...]

Serverless Spark cannot read workspace 'file:' paths, so each Parquet is copied to a
staging UC Volume (created if missing) and read from there, preserving exact types.
"""
import os
import shutil
import sys

from pyspark.sql import SparkSession

args = dict(a.split("=", 1) for a in sys.argv[1:] if "=" in a)
CAT = args.get("catalog", "cancer_registry_demo")
BRONZE = args.get("bronze_schema", "cancer_bronze")
SILVER = args.get("silver_schema", "cancer_silver")
GOLD = args.get("gold_schema", "cancer_gold")
WANT = args.get("tables", "all")
want = None if WANT == "all" else {t.strip() for t in WANT.split(",") if t.strip()}

spark = SparkSession.builder.getOrCreate()
try:
    _self = __file__
except NameError:  # a serverless spark_python_task runs the file via exec(); no __file__
    _self = sys.argv[0]
BASE = os.path.dirname(os.path.abspath(_self))  # sample_data/

# (layer_dir, target_schema, table)
PLAN = (
    [("bronze", BRONZE, t) for t in (
        "patient", "encounter", "diagnosis", "clinical_note", "pathology_report_text",
        "radiology_report_text", "operative_note", "discharge_summary", "lab_result", "medication_order")]
    + [("silver", SILVER, "silver_case_context")]
    + [("gold", GOLD, t) for t in (
        "gold_flagged", "gold_naaccr_dictionary", "gold_form_ai_draft", "gold_code_lookup")]
)
plan = [p for p in PLAN if want is None or p[2] in want]

for sch in {p[1] for p in plan}:
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CAT}.{sch}")

# Staging volume (Spark reads Volumes fine; workspace 'file:' paths it cannot).
spark.sql(f"CREATE VOLUME IF NOT EXISTS {CAT}.{GOLD}.sample_import")
stage = f"/Volumes/{CAT}/{GOLD}/sample_import"

loaded = set()
for layer, sch, t in plan:
    src = os.path.join(BASE, layer, f"{t}.parquet")
    dst = os.path.join(stage, f"{t}.parquet")
    shutil.copy(src, dst)
    df = spark.read.parquet(dst)
    (df.write.format("delta").mode("overwrite").option("overwriteSchema", "true")
       .saveAsTable(f"{CAT}.{sch}.{t}"))
    loaded.add(t)
    print(f"loaded {CAT}.{sch}.{t}: {df.count()} rows")

# Enable Delta CDF on the gold sources that back the Delta->Lakebase synced tables.
for t in ("gold_naaccr_dictionary", "gold_flagged"):
    if t in loaded:
        spark.sql(f"ALTER TABLE {CAT}.{GOLD}.{t} SET TBLPROPERTIES (delta.enableChangeDataFeed=true)")
print("DONE")
