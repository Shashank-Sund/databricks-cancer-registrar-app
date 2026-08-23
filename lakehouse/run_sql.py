"""Serverless-friendly SQL runner. Reads a .sql file, substitutes ${key} tokens from
key=value args, and executes each statement via spark.sql. Lets us create schemas and
Bronze/Gold tables (and run the ai_query classifier) with no SQL warehouse or classic
cluster, driven entirely by Databricks Asset Bundle variables.

Usage (spark_python_task parameters):
  run_sql.py sql_file=create_schemas.sql catalog=<c> bronze_schema=<b> silver_schema=<s> gold_schema=<g>

sql_file is resolved relative to this script's directory when not absolute, so it works
wherever the bundle syncs the repo.
"""
import os
import sys

from pyspark.sql import SparkSession

args = dict(a.split("=", 1) for a in sys.argv[1:] if "=" in a)
if "sql_file" not in args:
    raise SystemExit("run_sql.py requires sql_file=<path>")
sql_file = args.pop("sql_file")
if not os.path.isabs(sql_file):
    sql_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), sql_file)

spark = SparkSession.builder.getOrCreate()

with open(sql_file) as f:
    sql = f.read()
for k, v in args.items():
    sql = sql.replace("${" + k + "}", v)

# Split into statements at semicolons that terminate a line. Robust for our DDL files
# (one CREATE per statement) and single-statement CTAS files; ignores comment-only chunks.
statements, buf = [], []
for line in sql.splitlines():
    buf.append(line)
    if line.rstrip().endswith(";"):
        stmt = "\n".join(buf).strip().rstrip(";").strip()
        body = [ln for ln in stmt.splitlines() if ln.strip() and not ln.strip().startswith("--")]
        if body:
            statements.append(stmt)
        buf = []
tail = "\n".join(buf).strip().rstrip(";").strip()
if tail and any(ln.strip() and not ln.strip().startswith("--") for ln in tail.splitlines()):
    statements.append(tail)

print(f"Running {len(statements)} statement(s) from {sql_file}")
for i, stmt in enumerate(statements, 1):
    preview = " ".join(stmt.split())[:90]
    print(f"[{i}/{len(statements)}] {preview} ...")
    spark.sql(stmt)
print("DONE")
