"""Test: can we enable databricks_auth (which provides databricks_create_role) on a fresh
Lakebase Autoscaling project, so an app SP can be provisioned headlessly?
Usage (job): enable_lakebase_auth.py <endpoint> <sp_client_id> [dbname]"""
import sys
import psycopg
from databricks.sdk import WorkspaceClient

ENDPOINT = sys.argv[1]
SP = sys.argv[2]
DBNAME = sys.argv[3] if len(sys.argv) > 3 else "databricks_postgres"

w = WorkspaceClient()
ep = w.postgres.get_endpoint(name=ENDPOINT)
hosts = ep.status.hosts
host = getattr(hosts, "host", None) or (hosts[0].host if isinstance(hosts, (list, tuple)) else str(hosts))
cred = w.postgres.generate_database_credential(endpoint=ENDPOINT)
user = w.current_user.me().user_name
print("host:", host, "| user:", user)

with psycopg.connect(
    f"host={host} dbname={DBNAME} user={user} password={cred.token} sslmode=require", autocommit=True
) as c, c.cursor() as cur:
    cur.execute("SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname=%s", (user,))
    print("my privileges (super, createrole):", cur.fetchone())
    cur.execute("SELECT name FROM pg_available_extensions WHERE name ILIKE ANY(ARRAY['%databricks%','neon','wal2delta']) ORDER BY 1")
    print("available databricks/neon extensions:", [r[0] for r in cur.fetchall()])
    for ext in ("databricks_auth", "wal2delta"):
        try:
            cur.execute(f"CREATE EXTENSION IF NOT EXISTS {ext}")
            print(f"CREATE EXTENSION {ext}: OK")
        except Exception as e:
            print(f"CREATE EXTENSION {ext} ERR:", repr(e)[:160])
    cur.execute("SELECT proname FROM pg_proc WHERE proname='databricks_create_role'")
    print("databricks_create_role present now?", cur.fetchall())
    try:
        cur.execute("SELECT databricks_create_role(%s, 'SERVICE_PRINCIPAL')", (SP,))
        print("databricks_create_role: OK")
    except Exception as e:
        print("databricks_create_role:", repr(e)[:160])
    for stmt in (f'GRANT CONNECT ON DATABASE {DBNAME} TO "{SP}"', f'GRANT CREATE ON DATABASE {DBNAME} TO "{SP}"'):
        try:
            cur.execute(stmt)
            print("OK:", stmt)
        except Exception as e:
            print("ERR:", stmt[:45], repr(e)[:110])
    cur.execute("SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname=%s", (SP,))
    print("SP role now:", cur.fetchall())
print("DONE")
