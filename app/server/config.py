"""Central configuration for the cancer-registry FastAPI backend.

Everything is config-driven via environment variables. Deployment-specific
values (catalog, warehouse id, job id, Lakebase endpoint, Postgres host) carry
NO baked-in defaults: they are injected at deploy time by the Databricks Asset
Bundle app resource (see resources/app.yml -> config.env), so a fresh workspace
on either AWS or Azure bakes in nothing. Only portable defaults (schema naming
conventions, the standard Lakebase database/port) remain.

No secrets are stored here; credentials come from the Databricks Apps service
principal (auto-injected) or, for local dev, the local CLI profile.
"""
from __future__ import annotations

import os


def _env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return v if v not in (None, "") else default


def _int_env(name: str, default: int | None) -> int | None:
    v = os.environ.get(name)
    if v in (None, ""):
        return default
    try:
        return int(v)
    except ValueError:
        return default


# ---- Unity Catalog / SQL warehouse (reference reads) ---------------------
# CATALOG and WAREHOUSE_ID are workspace-specific: no default, injected by the
# bundle (REGISTRY_CATALOG, DATABRICKS_WAREHOUSE_ID). GOLD/SILVER schema keep the
# portable medallion naming convention (matches the databricks.yml var defaults);
# the bundle still overrides them via REGISTRY_GOLD_SCHEMA / REGISTRY_SILVER_SCHEMA.
CATALOG = _env("REGISTRY_CATALOG", "")
GOLD_SCHEMA = _env("REGISTRY_GOLD_SCHEMA", "cancer_gold")
SILVER_SCHEMA = _env("REGISTRY_SILVER_SCHEMA", "cancer_silver")
WAREHOUSE_ID = _env("DATABRICKS_WAREHOUSE_ID", "")

FLAGGED_TABLE = f"{CATALOG}.{GOLD_SCHEMA}.gold_flagged"
DICTIONARY_TABLE = f"{CATALOG}.{GOLD_SCHEMA}.gold_naaccr_dictionary"
AI_DRAFT_TABLE = f"{CATALOG}.{GOLD_SCHEMA}.gold_form_ai_draft"
# Authoritative 200-case set (patient names + full context). Used as the source
# of truth for resolving case metadata (patient_name, diagnosis, demographics)
# so a case_id missing from the flagged queue still resolves cleanly.
CASE_CONTEXT_TABLE = f"{CATALOG}.{SILVER_SCHEMA}.silver_case_context"
# Authoritative reference code tables (FIPS county, ICD-O-3, occupation/industry)
# for the searchable coded-field pickers.
LOOKUP_TABLE = f"{CATALOG}.{GOLD_SCHEMA}.gold_code_lookup"

# ---- Abstraction Lakeflow Job -------------------------------------------
# Deployment-specific: injected by the bundle as ABSTRACTION_JOB_ID (resolved
# from ${resources.jobs.abstraction.id}). None when unset -> triage still records
# the decision; the abstraction trigger is simply skipped (see service.py).
ABSTRACTION_JOB_ID = _int_env("ABSTRACTION_JOB_ID", None)

# ---- Lakebase (OLTP, app-owned native tables) ---------------------------
# LAKEBASE_ENDPOINT is the full autoscaling endpoint resource path
# (projects/<project>/branches/<branch>/endpoints/<endpoint>); injected by the
# bundle from ${var.lakebase_endpoint}. No default -> nothing demo-specific baked
# in. The Postgres host is NOT hardcoded: it is resolved at runtime from this
# endpoint name via the SDK (see dbx.resolve_pg_host), which is what lets the same
# build run unchanged on AWS and Azure (different host domains).
LAKEBASE_ENDPOINT = _env("LAKEBASE_ENDPOINT", "")
# PGHOST is an OPTIONAL override only. Leave empty to auto-resolve from
# LAKEBASE_ENDPOINT; set it to pin a specific host (e.g. a read replica or a
# private-link hostname) and bypass resolution.
PGHOST = _env("PGHOST", "")
PGPORT = _env("PGPORT", "5432")
PGDATABASE = _env("PGDATABASE", "databricks_postgres")
# Optional overrides. Normally left empty: the app derives the Postgres role from
# the current identity (service principal / CLI user) and mints a short-lived
# Lakebase credential at runtime (see store.LakebaseStore._username/_password).
PGUSER = os.environ.get("PGUSER") or ""
PGPASSWORD = os.environ.get("PGPASSWORD") or ""
# Schema that holds the four native tables. Locally (running as the table owner)
# this is 'public'; when deployed as the app service principal, set this to an
# app-owned schema (e.g. cancer_registry_app) that the SP can CREATE and own.
LAKEBASE_SCHEMA = _env("LAKEBASE_SCHEMA", "public")

# ---- Auth / identity -----------------------------------------------------
# Fallback registrar used only when no Apps OAuth headers and no CLI identity
# are available (pure local smoke tests).
FALLBACK_REGISTRAR = _env("FALLBACK_REGISTRAR", "registrar@demo-health.org")

# Optional CLI profile for local development (ignored in the deployed app).
DATABRICKS_PROFILE = os.environ.get("DATABRICKS_CONFIG_PROFILE") or os.environ.get(
    "DATABRICKS_PROFILE"
)


def qualified(table: str) -> str:
    """Schema-qualify a native Lakebase table name."""
    return f'"{LAKEBASE_SCHEMA}".{table}'
