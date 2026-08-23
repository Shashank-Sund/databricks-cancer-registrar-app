"""Refresh the Lakebase naaccr_dictionary synced table so it reflects the rebuilt
AUTHENTIC gold_naaccr_dictionary (202 NAACCR v25 items) instead of the old fabricated set.

A SNAPSHOT synced table does not re-snapshot on a bare create-or-update (it just
re-attaches to the existing table). To force a fresh snapshot we DELETE it (using the
full resource name, which is prefixed 'synced_tables/...'), confirm it is gone, then
recreate -> a one-time snapshot from the current (authentic) Delta source. Nothing reads
this table (the app reads the dictionary from Delta), so this has zero blast radius.
"""
import time
import traceback
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.postgres import (
    SyncedTable, SyncedTableSyncedTableSpec as STSpec,
    SyncedTableSyncedTableSpecSyncedTableSchedulingPolicy as Sched, NewPipelineSpec,
)

CAT = "cancer_registry_demo"  # set to your catalog
BRANCH = "projects/cancer-registry/branches/production"
tid = f"{CAT}.cancer_gold.naaccr_dictionary"       # synced_table_id (create arg, no prefix)
resource = f"synced_tables/{tid}"                   # full resource name (get/delete arg)
src = f"{CAT}.cancer_gold.gold_naaccr_dictionary"   # authentic source
w = WorkspaceClient()

# 0) inspect current
try:
    st = w.postgres.get_synced_table(name=resource)
    print("CURRENT state:", getattr(getattr(st, "status", None), "detailed_state", None))
except Exception as e:
    print("get err (ok if not found):", repr(e))

# 1) delete existing (full resource name) + wait
try:
    res = w.postgres.delete_synced_table(name=resource)
    try:
        res.wait()
    except Exception:
        pass
    print("DELETE issued")
except Exception as e:
    print("delete err (ok if not found):", repr(e))

# 2) confirm it is actually gone before recreating (poll up to ~90s)
gone = False
for i in range(30):
    try:
        w.postgres.get_synced_table(name=resource)
        time.sleep(3)
    except Exception:
        gone = True
        print(f"confirmed deleted after ~{i*3}s")
        break
if not gone:
    print("WARNING: synced table still present after poll; will still attempt recreate")

# 3) recreate -> fresh SNAPSHOT from the authentic source, block until snapshot done
st = SyncedTable(spec=STSpec(
    source_table_full_name=src,
    primary_key_columns=["naaccr_item_id"],
    scheduling_policy=Sched.SNAPSHOT,
    branch=BRANCH,
    postgres_database="databricks_postgres",
    create_database_objects_if_missing=True,
    new_pipeline_spec=NewPipelineSpec(storage_catalog=CAT, storage_schema="cancer_gold"),
))
try:
    op = w.postgres.create_synced_table(synced_table=st, synced_table_id=tid)
    r = op.wait()
    print("RECREATED:", getattr(r, "name", ""),
          "| state:", getattr(getattr(r, "status", None), "detailed_state", None))
except Exception as e:
    print("create err:", repr(e))
    traceback.print_exc()

print("DONE")
