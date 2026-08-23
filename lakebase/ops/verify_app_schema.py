"""List the app-owned tables + row counts in a Lakebase project, to confirm the app
created its OLTP schema there. Usage (job): verify_app_schema.py <endpoint> <schema>"""
import sys
import psycopg
from databricks.sdk import WorkspaceClient

ENDPOINT = sys.argv[1]
SCHEMA = sys.argv[2] if len(sys.argv) > 2 else "cancer_registry_app"
w = WorkspaceClient()
ep = w.postgres.get_endpoint(name=ENDPOINT)
hosts = ep.status.hosts
host = getattr(hosts, "host", None) or (hosts[0].host if isinstance(hosts, (list, tuple)) else str(hosts))
cred = w.postgres.generate_database_credential(endpoint=ENDPOINT)
user = w.current_user.me().user_name
print("endpoint:", ENDPOINT, "| host:", host)
with psycopg.connect(
    f"host={host} dbname=databricks_postgres user={user} password={cred.token} sslmode=require"
) as c, c.cursor() as cur:
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname=%s ORDER BY 1", (SCHEMA,))
    tbls = [r[0] for r in cur.fetchall()]
    print(f"tables in schema {SCHEMA}: {tbls}")
    for t in tbls:
        cur.execute(f'SELECT COUNT(*) FROM "{SCHEMA}"."{t}"')
        print(f"  {t}: {cur.fetchone()[0]} rows")
print("DONE")
