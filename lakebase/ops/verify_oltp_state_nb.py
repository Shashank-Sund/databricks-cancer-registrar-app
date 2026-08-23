# Databricks notebook source
# MAGIC %pip install "psycopg[binary]>=3.1.0" "databricks-sdk>=0.81.0"

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# Read-only verification of the app's Lakebase OLTP state after clearing stale
# drafts. Returns JSON via dbutils.notebook.exit. Reconstructs how many drafts
# existed before the clear from the preserved case_decisions / finalized_forms.
import json
from databricks.sdk import WorkspaceClient
import psycopg

ENDPOINT = "projects/cancer-registry/branches/production/endpoints/primary"
HOST = "<lakebase-host>"
DBNAME = "databricks_postgres"
SCHEMA = "cancer_registry_app"
SP = "<service-principal-id>"
TABLES = ["case_decisions", "draft_case", "working_draft", "finalized_forms"]

w = WorkspaceClient()
try:
    token = w.postgres.generate_database_credential(endpoint=ENDPOINT).token
except Exception:
    import uuid
    token = w.database.generate_database_credential(
        request_id=str(uuid.uuid4()), instance_names=[ENDPOINT.split("/")[1]]
    ).token
user = w.current_user.me().user_name
conn = psycopg.connect(
    f"host={HOST} dbname={DBNAME} user={user} password={token} sslmode=require",
    autocommit=True, connect_timeout=20,
)
cur = conn.cursor()

ev = {}
cur.execute("SELECT current_user")
ev["connected_as"] = cur.fetchone()[0]
cur.execute("SELECT tablename, tableowner FROM pg_tables WHERE schemaname=%s ORDER BY tablename", (SCHEMA,))
ev["table_owners"] = cur.fetchall()

try:
    cur.execute(f'SELECT count(*) FROM "{SCHEMA}".working_draft')
    cur.fetchone()
    ev["access_mode"] = "direct"
except psycopg.errors.InsufficientPrivilege:
    cur.execute(f'SET ROLE "{SP}"')
    ev["access_mode"] = "set_role_sp"

counts = {}
for t in TABLES:
    cur.execute(f'SELECT count(*) FROM "{SCHEMA}".{t}')
    counts[t] = cur.fetchone()[0]
ev["current_counts"] = counts

# Reconstruct drafts-that-existed-before-clear from preserved decisions/finalized.
cur.execute(f'SELECT count(*) FROM "{SCHEMA}".case_decisions')
ev["case_decisions_total"] = cur.fetchone()[0]
cur.execute(
    f'''SELECT decision, count(*) FROM (
          SELECT case_id, decision,
                 row_number() OVER (PARTITION BY case_id ORDER BY decided_at DESC, decision_id DESC) rn
          FROM "{SCHEMA}".case_decisions
        ) t WHERE rn=1 GROUP BY decision ORDER BY decision'''
)
ev["latest_decision_breakdown"] = cur.fetchall()
cur.execute(
    f'''SELECT count(*) FROM (
          SELECT case_id, decision,
                 row_number() OVER (PARTITION BY case_id ORDER BY decided_at DESC, decision_id DESC) rn
          FROM "{SCHEMA}".case_decisions
        ) t WHERE rn=1 AND decision='reportable' '''
)
ev["distinct_reportable_cases"] = cur.fetchone()[0]
# drafts that would have existed = reportable-latest cases not yet finalized
cur.execute(
    f'''SELECT count(*) FROM (
          SELECT case_id, decision,
                 row_number() OVER (PARTITION BY case_id ORDER BY decided_at DESC, decision_id DESC) rn
          FROM "{SCHEMA}".case_decisions
        ) t
        WHERE rn=1 AND decision='reportable'
          AND case_id NOT IN (SELECT case_id FROM "{SCHEMA}".finalized_forms)'''
)
ev["reconstructed_active_drafts_before_clear"] = cur.fetchone()[0]

conn.close()
dbutils.notebook.exit(json.dumps(ev, default=str))
