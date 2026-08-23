"""Wait for the refreshed naaccr_dictionary synced table to reach ONLINE, then verify
it holds the authentic 202-item set via real Postgres query output (not a status string).
"""
import time
import psycopg
from databricks.sdk import WorkspaceClient

CAT = "serverless_stable_omnigent_catalog"
RESOURCE = f"synced_tables/{CAT}.cancer_gold.naaccr_dictionary"
ENDPOINT = "projects/cancer-registry/branches/production/endpoints/primary"
HOST = "<lakebase-host>"
w = WorkspaceClient()

# 1) poll synced-table state until the initial snapshot has landed (ONLINE, no pending)
for i in range(48):  # up to ~240s
    st = w.postgres.get_synced_table(name=RESOURCE)
    state = str(getattr(getattr(st, "status", None), "detailed_state", None))
    print(f"[{i*5}s] state={state}")
    if "ONLINE" in state:
        break
    time.sleep(5)

# 2) real query proof against Lakebase Postgres
cred = w.postgres.generate_database_credential(endpoint=ENDPOINT)
user = w.current_user.me().user_name
with psycopg.connect(
    f"host={HOST} dbname=databricks_postgres user={user} password={cred.token} sslmode=require"
) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT schemaname, tablename FROM pg_tables WHERE tablename ILIKE '%naaccr%' ORDER BY 1,2")
        tbls = cur.fetchall()
        print("naaccr tables in Lakebase:", tbls)
        for sch, tbl in tbls:
            cur.execute(f'SELECT COUNT(*) FROM "{sch}"."{tbl}"')
            cnt = cur.fetchone()[0]
            cur.execute(
                f'SELECT COUNT(*) FROM "{sch}"."{tbl}" WHERE naaccr_item_id IN (400,522,523,440,3827,3855)'
            )
            auth = cur.fetchone()[0]
            cur.execute(
                f'SELECT naaccr_item_id, item_name FROM "{sch}"."{tbl}" WHERE naaccr_item_id IN (400,3827,3855) ORDER BY naaccr_item_id'
            )
            sample = cur.fetchall()
            print(f"  {sch}.{tbl}: total_rows={cnt} | authentic_key_items(of 6)={auth} | sample={sample}")
print("DONE")
