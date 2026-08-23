"""Databricks client helpers: a cached WorkspaceClient and SQL-warehouse reads.

Reference/PHI data (flagged cases, the NAACCR dictionary, AI-extracted drafts)
lives in Unity Catalog Delta tables and is read through the SQL warehouse using
the Statement Execution API (no extra driver dependency, works with the app
service principal or a local CLI profile).
"""
from __future__ import annotations

import threading
from typing import Any

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementParameterListItem

import config

_ws: WorkspaceClient | None = None
_ws_lock = threading.Lock()

_pg_host: str | None = None
_pg_host_lock = threading.Lock()


def get_ws() -> WorkspaceClient:
    global _ws
    if _ws is None:
        with _ws_lock:
            if _ws is None:
                if config.DATABRICKS_PROFILE:
                    _ws = WorkspaceClient(profile=config.DATABRICKS_PROFILE)
                else:
                    _ws = WorkspaceClient()
    return _ws


def _extract_host(hosts: Any) -> str | None:
    """Pull the read-write host out of an endpoint's ``status.hosts``.

    Defensive across SDK/API shapes: ``hosts`` may be an ``EndpointHosts`` object
    (``.host`` / ``.read_only_host``), a list of such objects (or strings), or a
    plain host string. The read-write ``host`` is preferred.
    """
    if hosts is None:
        return None
    host = getattr(hosts, "host", None)
    if host:
        return host
    if isinstance(hosts, (list, tuple)) and hosts:
        first = hosts[0]
        return getattr(first, "host", None) or (first if isinstance(first, str) else None)
    if isinstance(hosts, str):
        return hosts
    return None


def resolve_pg_host() -> str:
    """Resolve the Lakebase Postgres host at runtime and cache it.

    Priority:
      1. ``config.PGHOST`` if set (explicit override).
      2. Resolved from ``config.LAKEBASE_ENDPOINT`` via
         ``w.postgres.get_endpoint(name=...).status.hosts``.

    Resolving from the endpoint name (rather than hardcoding a host) is what makes
    the app portable: the same bundle deploys to AWS or Azure and discovers the
    correct host domain from the workspace at runtime, with zero edits. Cached
    after the first successful resolution.
    """
    global _pg_host
    if config.PGHOST:
        return config.PGHOST
    if _pg_host:
        return _pg_host
    with _pg_host_lock:
        if _pg_host:
            return _pg_host
        if not config.LAKEBASE_ENDPOINT:
            raise RuntimeError(
                "cannot resolve Postgres host: no PGHOST override and "
                "LAKEBASE_ENDPOINT is not set"
            )
        endpoint = get_ws().postgres.get_endpoint(name=config.LAKEBASE_ENDPOINT)
        hosts = endpoint.status.hosts if endpoint.status else None
        host = _extract_host(hosts)
        if not host:
            raise RuntimeError(
                f"could not resolve a Postgres host for endpoint "
                f"{config.LAKEBASE_ENDPOINT}"
            )
        _pg_host = host
        return host


def _to_params(params: dict[str, Any] | None) -> list[StatementParameterListItem] | None:
    if not params:
        return None
    out: list[StatementParameterListItem] = []
    for k, v in params.items():
        out.append(StatementParameterListItem(name=k, value=None if v is None else str(v)))
    return out


def wh_query(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Run a read query on the SQL warehouse and return a list of row dicts.

    Uses named parameters (``:name``) safely via the Statement Execution API.
    """
    w = get_ws()
    resp = w.statement_execution.execute_statement(
        warehouse_id=config.WAREHOUSE_ID,
        statement=sql,
        parameters=_to_params(params),
        wait_timeout="50s",
    )
    # Poll if the statement is still running past the initial wait window.
    import time

    state = resp.status.state.value if resp.status and resp.status.state else "SUCCEEDED"
    statement_id = resp.statement_id
    waited = 0.0
    while state in ("PENDING", "RUNNING") and waited < 120:
        time.sleep(1.0)
        waited += 1.0
        resp = w.statement_execution.get_statement(statement_id)
        state = resp.status.state.value if resp.status and resp.status.state else "SUCCEEDED"

    if state != "SUCCEEDED":
        msg = ""
        if resp.status and resp.status.error:
            msg = resp.status.error.message or ""
        raise RuntimeError(f"warehouse query failed ({state}): {msg}")

    cols = [c.name for c in resp.manifest.schema.columns] if resp.manifest else []
    rows: list[dict[str, Any]] = []
    result = resp.result
    data = result.data_array if result else None
    if data:
        for r in data:
            rows.append({cols[i]: r[i] for i in range(len(cols))})
    return rows
