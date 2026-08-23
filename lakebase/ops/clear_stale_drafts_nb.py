# Databricks notebook source
# MAGIC %pip install "psycopg[binary]>=3.1.0" "databricks-sdk>=0.81.0"

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# Clear stale app OLTP drafts after the NAACCR dictionary rebuild.
# working_draft/draft_case were seeded against the OLD (fabricated) item IDs.
# Deleting them makes the app re-seed each draft from gold_form_ai_draft
# (authentic item numbers) on next case open. case_decisions / finalized_forms
# are left untouched. Runs as the current Databricks identity, connecting to
# Lakebase exactly like the app SP does (generate_database_credential + psycopg).
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
    cred = w.postgres.generate_database_credential(endpoint=ENDPOINT)
    token = cred.token
except Exception as e:
    import uuid
    print("postgres.generate_database_credential unavailable, falling back to database API:", repr(e))
    cred = w.database.generate_database_credential(
        request_id=str(uuid.uuid4()), instance_names=[ENDPOINT.split("/")[1]]
    )
    token = cred.token
user = w.current_user.me().user_name
conn = psycopg.connect(
    f"host={HOST} dbname={DBNAME} user={user} password={token} sslmode=require",
    autocommit=True,
    connect_timeout=20,
)
cur = conn.cursor()
cur.execute("SELECT current_user")
print("connected_as:", cur.fetchone()[0])

cur.execute(
    "SELECT tablename, tableowner FROM pg_tables WHERE schemaname=%s ORDER BY tablename",
    (SCHEMA,),
)
print("table_owners:", cur.fetchall())


def counts():
    out = {}
    for t in TABLES:
        cur.execute(f'SELECT count(*) FROM "{SCHEMA}".{t}')
        out[t] = cur.fetchone()[0]
    return out


# Ensure we can delete SP-owned rows; become the SP role if our role lacks rights.
access = "direct"
try:
    cur.execute(f'SELECT count(*) FROM "{SCHEMA}".working_draft')
    cur.fetchone()
except psycopg.errors.InsufficientPrivilege:
    cur.execute(f'SET ROLE "{SP}"')
    access = "set_role_sp"
print("access_mode:", access)

print("BEFORE:", counts())
cur.execute(
    f'SELECT count(DISTINCT naaccr_item_id), min(naaccr_item_id), max(naaccr_item_id) '
    f'FROM "{SCHEMA}".working_draft'
)
print("working_draft distinct/min/max item_id:", cur.fetchone())
cur.execute(f'SELECT case_id FROM "{SCHEMA}".draft_case ORDER BY case_id')
print("draft_case case_ids:", [r[0] for r in cur.fetchall()])
cur.execute(f'SELECT DISTINCT naaccr_item_id FROM "{SCHEMA}".working_draft ORDER BY naaccr_item_id')
print("working_draft distinct item_ids:", [r[0] for r in cur.fetchall()])

cur.execute(f'DELETE FROM "{SCHEMA}".working_draft')
print("deleted working_draft rows:", cur.rowcount)
cur.execute(f'DELETE FROM "{SCHEMA}".draft_case')
print("deleted draft_case rows:", cur.rowcount)

print("AFTER:", counts())
conn.close()
print("DONE")
