"""One-time Lakebase (Autoscaling) provisioning for the cancer registrar app.

Lakebase Autoscaling projects, Delta->Lakebase synced tables, and Lakebase CDF
(Postgres->Delta) are not Databricks Asset Bundle resources yet, so this single
idempotent script handles them. Everything else in this repo deploys with
`databricks bundle deploy`.

RUN ORDER (important):
  1. `databricks bundle deploy`   (creates jobs, the silver pipeline, and the App)
  2. Load data (either the load_sample_data job or the full pipeline) so the gold
     source tables exist for the synced tables.
  3. Open the deployed App once. On first request the app service principal creates
     its own schema + 4 native tables and sets REPLICA IDENTITY FULL on them.
  4. Run THIS script (as the Lakebase project owner / a workspace admin), passing the
     app service principal's client id (visible on the App's page after deploy).

Phases (each idempotent, controlled by flags):
  --create-project   ensure the Lakebase Autoscaling project exists
  (default)          grant the app SP CONNECT/CREATE, create synced tables, create CDF
  --skip-synced      skip Delta->Lakebase synced tables (they are a showcase; the app
                     reads reference data from Delta, not from these)
  --skip-cdf         skip the Lakebase CDF (Postgres->Delta) config

Usage:
  python setup/provision_lakebase.py \
      --project cancer_registry --branch production \
      --catalog <cat> --gold-schema cancer_gold \
      --app-sp <app_service_principal_client_id> --app-schema cancer_registry_app \
      [--create-project] [--skip-synced] [--skip-cdf]

Deps when run as a serverless job: databricks-sdk>=0.81.0, psycopg[binary].
"""
from __future__ import annotations

import argparse
import sys
import time

from databricks.sdk import WorkspaceClient


def resolve_host(w: WorkspaceClient, endpoint_name: str) -> str:
    """Resolve the Postgres host from the endpoint (works on any cloud/region)."""
    ep = w.postgres.get_endpoint(name=endpoint_name)
    hosts = getattr(ep.status, "hosts", None) if ep.status else None
    if isinstance(hosts, (list, tuple)) and hosts:
        h = hosts[0]
        return getattr(h, "host", None) or str(h)
    return getattr(hosts, "host", None) or str(hosts)


def resolve_endpoint(w: WorkspaceClient, project: str, branch: str) -> str:
    """Return the endpoint resource name for the branch. A freshly created project may
    not name its default endpoint 'primary', so discover it; fall back to the
    conventional path if listing is unavailable."""
    fallback = f"projects/{project}/branches/{branch}/endpoints/primary"
    try:
        eps = list(w.postgres.list_endpoints(parent=f"projects/{project}/branches/{branch}"))
        for e in eps:
            name = getattr(e, "name", None)
            if name:
                return name
    except Exception as ex:
        print(f"list_endpoints note: {type(ex).__name__}: {str(ex)[:100]}")
    return fallback


def ensure_project(w: WorkspaceClient, project: str) -> None:
    from databricks.sdk.service.postgres import Project, ProjectSpec

    try:
        w.postgres.get_project(name=f"projects/{project}")
        print(f"project exists: {project}")
        return
    except Exception:
        pass
    print(f"creating Lakebase project: {project}")
    op = w.postgres.create_project(
        project=Project(spec=ProjectSpec(display_name=project, pg_version="17")),
        project_id=project,
    )
    op.wait()
    print("project created")


def grant_uc_access(w, warehouse_id, catalog, gold_schema, silver_schema, sp):
    """Grant the app service principal the Unity Catalog privileges it needs to READ
    reference/PHI data through the SQL warehouse (USE CATALOG + USE SCHEMA + SELECT on
    the gold and silver schemas). Without this the app's warehouse queries fail and the
    queue returns a 500. Run as SQL through the warehouse (reliable across SDK versions)."""
    if not warehouse_id:
        print("no --warehouse-id given; SKIPPING UC grants (grant them manually, see docs/DEPLOYMENT.md)")
        return
    stmts = [
        f"GRANT USE CATALOG ON CATALOG {catalog} TO `{sp}`",
        f"GRANT USE SCHEMA, SELECT ON SCHEMA {catalog}.{gold_schema} TO `{sp}`",
        f"GRANT USE SCHEMA, SELECT ON SCHEMA {catalog}.{silver_schema} TO `{sp}`",
    ]
    for s in stmts:
        try:
            w.statement_execution.execute_statement(warehouse_id=warehouse_id, statement=s, wait_timeout="30s")
            print("OK:", s)
        except Exception as e:
            print(f"UC grant note ({s[:46]}...): {type(e).__name__}: {str(e)[:100]}")


def grant_app_sp(w, endpoint, host, dbname, sp):
    import psycopg

    cred = w.postgres.generate_database_credential(endpoint=endpoint)
    user = w.current_user.me().user_name
    with psycopg.connect(
        f"host={host} dbname={dbname} user={user} password={cred.token} sslmode=require",
        autocommit=True,
    ) as conn, conn.cursor() as cur:
        # databricks_auth provides databricks_create_role. A freshly created Autoscaling
        # project ships only plpgsql, so install it first (needs CREATEROLE, not superuser).
        # This is what makes headless SP provisioning work on a brand-new project.
        try:
            cur.execute("CREATE EXTENSION IF NOT EXISTS databricks_auth")
            print("ensured extension: databricks_auth")
        except Exception as e:
            print(f"databricks_auth note: {type(e).__name__}: {str(e)[:120]}")
        try:
            cur.execute("SELECT databricks_create_role(%s, 'SERVICE_PRINCIPAL')", (sp,))
            print("created SP role")
        except Exception as e:
            print(f"SP role note: {type(e).__name__}: {str(e)[:120]}")
        for stmt in (
            f'GRANT CONNECT ON DATABASE {dbname} TO "{sp}"',
            f'GRANT CREATE ON DATABASE {dbname} TO "{sp}"',
        ):
            try:
                cur.execute(stmt)
                print("OK:", stmt)
            except Exception as e:
                print(f"ERR {stmt[:60]}: {type(e).__name__}: {str(e)[:120]}")


def create_synced_tables(w, catalog, gold_schema, branch, project):
    from databricks.sdk.service.postgres import (
        SyncedTable, SyncedTableSyncedTableSpec as STSpec,
        SyncedTableSyncedTableSpecSyncedTableSchedulingPolicy as Sched, NewPipelineSpec,
    )

    branch_path = f"projects/{project}/branches/{branch}"
    targets = [
        (f"{catalog}.{gold_schema}.gold_flagged", f"{catalog}.{gold_schema}.flagged_cases", ["case_id"]),
        (f"{catalog}.{gold_schema}.gold_naaccr_dictionary", f"{catalog}.{gold_schema}.naaccr_dictionary", ["naaccr_item_id"]),
    ]
    for src, tid, pk in targets:
        try:
            st = SyncedTable(spec=STSpec(
                source_table_full_name=src, primary_key_columns=pk,
                scheduling_policy=Sched.SNAPSHOT, branch=branch_path,
                postgres_database="databricks_postgres", create_database_objects_if_missing=True,
                new_pipeline_spec=NewPipelineSpec(storage_catalog=catalog, storage_schema=gold_schema),
            ))
            w.postgres.create_synced_table(synced_table=st, synced_table_id=tid).wait()
            print(f"synced table ready: {tid}")
        except Exception as e:
            print(f"synced table {tid} note: {type(e).__name__}: {str(e)[:140]}")


def create_cdf(w, catalog, gold_schema, branch, project, app_schema):
    from databricks.sdk.service.postgres import CdfConfig

    # API resource name uses a hyphen (databricks-postgres); physical db is databricks_postgres.
    parent = f"projects/{project}/branches/{branch}/databases/databricks-postgres"
    configs = [("cancer_cdf", "public"), ("cancer_app_cdf", app_schema)]
    for cfg_id, pg_schema in configs:
        try:
            w.postgres.create_cdf_config(
                parent=parent,
                cdf_config=CdfConfig(catalog=catalog, schema=gold_schema, postgres_schema=pg_schema),
                cdf_config_id=cfg_id,
            ).wait()
            print(f"CDF config ready: {cfg_id} ({pg_schema})")
        except Exception as e:
            print(f"CDF {cfg_id} note: {type(e).__name__}: {str(e)[:140]}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--project", default="cancer_registry")
    p.add_argument("--branch", default="production")
    p.add_argument("--catalog", required=True)
    p.add_argument("--gold-schema", default="cancer_gold")
    p.add_argument("--silver-schema", default="cancer_silver")
    p.add_argument("--warehouse-id", default=None, help="SQL warehouse id (for the app SP's UC grants)")
    p.add_argument("--app-sp", default=None, help="App service principal client id (for grants)")
    p.add_argument("--app-schema", default="cancer_registry_app")
    p.add_argument("--dbname", default="databricks_postgres")
    p.add_argument("--create-project", action="store_true")
    p.add_argument("--skip-synced", action="store_true")
    p.add_argument("--skip-cdf", action="store_true")
    args = p.parse_args()

    w = WorkspaceClient()
    if args.create_project:
        ensure_project(w, args.project)

    endpoint = resolve_endpoint(w, args.project, args.branch)
    host = resolve_host(w, endpoint)
    print(f"endpoint={endpoint}\nhost={host}")
    print(">>> Set the bundle variable lakebase_endpoint to the value above if it differs.")

    if args.app_sp:
        grant_uc_access(w, args.warehouse_id, args.catalog, args.gold_schema, args.silver_schema, args.app_sp)
        grant_app_sp(w, endpoint, host, args.dbname, args.app_sp)
    else:
        print("no --app-sp given; skipping SP grants (run again with it after the app is deployed)")

    if not args.skip_synced:
        create_synced_tables(w, args.catalog, args.gold_schema, args.branch, args.project)
    if not args.skip_cdf:
        create_cdf(w, args.catalog, args.gold_schema, args.branch, args.project, args.app_schema)
    print("DONE")


if __name__ == "__main__":
    main()
