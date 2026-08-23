"""Diagnose how to provision an app SP role on a Lakebase Autoscaling project.
Usage (job): diagnose_lakebase_roles.py <endpoint> <sp_client_id> [dbname]"""
import sys
import psycopg
from databricks.sdk import WorkspaceClient

ENDPOINT = sys.argv[1] if len(sys.argv) > 1 else "projects/<project>/branches/production/endpoints/primary"
SP = sys.argv[2] if len(sys.argv) > 2 else "<service-principal-id>"
DBNAME = sys.argv[3] if len(sys.argv) > 3 else "databricks_postgres"

w = WorkspaceClient()
ep = w.postgres.get_endpoint(name=ENDPOINT)
hosts = ep.status.hosts
host = getattr(hosts, "host", None) or (hosts[0].host if isinstance(hosts, (list, tuple)) else str(hosts))
cred = w.postgres.generate_database_credential(endpoint=ENDPOINT)
user = w.current_user.me().user_name
print("host:", host, "| connect user:", user)

with psycopg.connect(
    f"host={host} dbname={DBNAME} user={user} password={cred.token} sslmode=require", autocommit=True
) as c, c.cursor() as cur:
    cur.execute("SELECT current_database(), current_user")
    print("db/current_user:", cur.fetchone())
    cur.execute("SELECT proname, pronargs FROM pg_proc WHERE proname ILIKE '%role%' ORDER BY proname")
    print("role-related functions:", cur.fetchall())
    cur.execute("SELECT extname FROM pg_extension ORDER BY 1")
    print("extensions:", [r[0] for r in cur.fetchall()])
    cur.execute("SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY 1")
    print("existing roles:", [r[0] for r in cur.fetchall()])
    # Attempt the documented helper
    try:
        cur.execute("SELECT databricks_create_role(%s, 'SERVICE_PRINCIPAL')", (SP,))
        print("databricks_create_role: OK")
    except Exception as e:
        print("databricks_create_role ERR:", repr(e)[:220])
    # Re-check whether the SP role now exists
    cur.execute("SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = %s", (SP,))
    print("SP role after attempt:", cur.fetchall())
print("DONE")
