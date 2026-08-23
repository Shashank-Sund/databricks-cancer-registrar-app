"""OLTP store for app-owned state (triage decisions, drafts, working fields,
finalized forms).

Primary implementation is Lakebase (Postgres) via psycopg. If Lakebase is not
reachable / the identity is not yet provisioned, the app degrades gracefully to
an in-memory store so the UI stays fully functional for a demo. Which store is
active is reported by ``/api/health``.

All four native tables mirror contracts/lakebase_schema.sql exactly and are
created idempotently in the configured schema (owned by the connecting role).
"""
from __future__ import annotations

import threading
import time
from typing import Any

import config

# ---------------------------------------------------------------------------
# DDL — mirrors contracts/lakebase_schema.sql, schema-qualified & idempotent.
# ---------------------------------------------------------------------------
def _ddl(schema: str) -> list[str]:
    s = f'"{schema}"'
    return [
        f'CREATE SCHEMA IF NOT EXISTS {s}',
        f"""CREATE TABLE IF NOT EXISTS {s}.case_decisions (
            decision_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            case_id      TEXT        NOT NULL,
            decision     TEXT        NOT NULL CHECK (decision IN ('reportable','not_reportable')),
            registrar_id TEXT        NOT NULL,
            decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            notes        TEXT
        )""",
        f"CREATE INDEX IF NOT EXISTS ix_decisions_case ON {s}.case_decisions (case_id, decided_at DESC)",
        f"ALTER TABLE {s}.case_decisions REPLICA IDENTITY FULL",
        f"""CREATE TABLE IF NOT EXISTS {s}.draft_case (
            case_id            TEXT        PRIMARY KEY,
            assigned_to        TEXT        NOT NULL,
            draft_status       TEXT        NOT NULL DEFAULT 'in_progress'
                                           CHECK (draft_status IN ('in_progress','ready_to_finish')),
            abstraction_run_id TEXT,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_saved_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        f"CREATE INDEX IF NOT EXISTS ix_draft_owner ON {s}.draft_case (assigned_to, draft_status)",
        f"""CREATE TABLE IF NOT EXISTS {s}.working_draft (
            case_id        TEXT        NOT NULL REFERENCES {s}.draft_case(case_id) ON DELETE CASCADE,
            naaccr_item_id INTEGER     NOT NULL,
            value          TEXT,
            confidence     NUMERIC(4,3),
            source_ref     JSONB,
            field_status   TEXT        NOT NULL DEFAULT 'ai_suggested'
                                       CHECK (field_status IN ('ai_suggested','edited','confirmed','unknown','blank')),
            updated_by     TEXT,
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (case_id, naaccr_item_id)
        )""",
        # REPLICA IDENTITY FULL so Lakebase CDF captures UPDATE/DELETE
        # before-images (not just inserts). The app SP owns these tables here,
        # so it can set this; idempotent on each boot.
        f"ALTER TABLE {s}.working_draft REPLICA IDENTITY FULL",
        f"""CREATE TABLE IF NOT EXISTS {s}.finalized_forms (
            case_id            TEXT        PRIMARY KEY,
            registrar_id       TEXT        NOT NULL,
            finalized_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            edits_passed       BOOLEAN     NOT NULL,
            form_version       INTEGER     NOT NULL DEFAULT 1,
            abstraction_run_id TEXT,
            form_data          JSONB       NOT NULL
        )""",
        f"CREATE INDEX IF NOT EXISTS ix_finalized_at ON {s}.finalized_forms (finalized_at)",
        f"ALTER TABLE {s}.finalized_forms REPLICA IDENTITY FULL",
    ]


# ===========================================================================
# Lakebase (Postgres) store
# ===========================================================================
class LakebaseStore:
    kind = "lakebase"

    def __init__(self) -> None:
        self._pw: str | None = None
        self._pw_exp: float = 0.0
        self._user: str | None = None
        self._lock = threading.Lock()
        self.available = False
        self.last_error: str | None = None

    # ---- credential / connection ----
    def _password(self) -> str:
        if config.PGPASSWORD:
            return config.PGPASSWORD
        now = time.time()
        if self._pw and now < self._pw_exp:
            return self._pw
        from dbx import get_ws

        w = get_ws()
        token = None
        try:
            cred = w.postgres.generate_database_credential(endpoint=config.LAKEBASE_ENDPOINT)
            token = getattr(cred, "token", None)
        except Exception:
            # Fallback to the provisioned-tier SDK surface if present.
            import uuid

            cred = w.database.generate_database_credential(
                request_id=str(uuid.uuid4()),
                instance_names=[config.LAKEBASE_ENDPOINT.split("/")[1]],
            )
            token = getattr(cred, "token", None)
        if not token:
            raise RuntimeError("could not obtain a Lakebase database credential")
        self._pw = token
        self._pw_exp = now + 45 * 60  # refresh comfortably before the ~1h expiry
        return token

    def _username(self) -> str:
        if config.PGUSER:
            return config.PGUSER
        if self._user:
            return self._user
        from dbx import get_ws

        self._user = get_ws().current_user.me().user_name
        return self._user

    def _connect(self, autocommit: bool = True):
        import psycopg

        from dbx import resolve_pg_host

        # Host is resolved from the Lakebase endpoint name at runtime (portable
        # across AWS/Azure); PGHOST env acts only as an optional override.
        host = resolve_pg_host()
        conninfo = (
            f"host={host} port={config.PGPORT} dbname={config.PGDATABASE} "
            f"user={self._username()} password={self._password()} sslmode=require"
        )
        conn = psycopg.connect(conninfo, autocommit=autocommit, connect_timeout=15)
        # Ensure unqualified names resolve to our schema, then public.
        with conn.cursor() as cur:
            cur.execute(f'SET search_path TO "{config.LAKEBASE_SCHEMA}", public')
        return conn

    # ---- lifecycle ----
    def init(self) -> None:
        try:
            conn = self._connect(autocommit=True)
            try:
                with conn.cursor() as cur:
                    for stmt in _ddl(config.LAKEBASE_SCHEMA):
                        cur.execute(stmt)
                self.available = True
                self.last_error = None
            finally:
                conn.close()
        except Exception as e:  # pragma: no cover - environment dependent
            self.available = False
            self.last_error = f"{type(e).__name__}: {e}"

    def ping(self) -> bool:
        try:
            conn = self._connect()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            finally:
                conn.close()
            self.available = True
            return True
        except Exception as e:
            self.available = False
            self.last_error = f"{type(e).__name__}: {e}"
            return False

    # ---- queries ----
    def get_exclusion_sets(self) -> dict[str, set[str]]:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT case_id FROM draft_case")
                drafted = {r[0] for r in cur.fetchall()}
                cur.execute("SELECT case_id FROM finalized_forms")
                finalized = {r[0] for r in cur.fetchall()}
                cur.execute(
                    """
                    SELECT case_id FROM (
                        SELECT case_id, decision,
                               ROW_NUMBER() OVER (PARTITION BY case_id
                                   ORDER BY decided_at DESC, decision_id DESC) rn
                        FROM case_decisions
                    ) t WHERE rn = 1 AND decision = 'not_reportable'
                    """
                )
                not_reportable = {r[0] for r in cur.fetchall()}
            return {
                "drafted": drafted,
                "finalized": finalized,
                "not_reportable": not_reportable,
            }
        finally:
            conn.close()

    def insert_decision(self, case_id: str, decision: str, registrar: str, notes: str | None) -> int:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO case_decisions (case_id, decision, registrar_id, notes) "
                    "VALUES (%s,%s,%s,%s) RETURNING decision_id",
                    (case_id, decision, registrar, notes),
                )
                return int(cur.fetchone()[0])
        finally:
            conn.close()

    def upsert_draft(self, case_id: str, registrar: str, run_id: str | None) -> None:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO draft_case (case_id, assigned_to, abstraction_run_id)
                    VALUES (%s,%s,%s)
                    ON CONFLICT (case_id) DO UPDATE
                      SET abstraction_run_id = COALESCE(EXCLUDED.abstraction_run_id,
                                                        draft_case.abstraction_run_id),
                          last_saved_at = now()
                    """,
                    (case_id, registrar, run_id),
                )
        finally:
            conn.close()

    def get_draft(self, case_id: str) -> dict[str, Any] | None:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT case_id, assigned_to, draft_status, abstraction_run_id, "
                    "CAST(last_saved_at AS TEXT), CAST(created_at AS TEXT) "
                    "FROM draft_case WHERE case_id = %s",
                    (case_id,),
                )
                r = cur.fetchone()
                if not r:
                    return None
                return {
                    "case_id": r[0],
                    "assigned_to": r[1],
                    "draft_status": r[2],
                    "abstraction_run_id": r[3],
                    "last_saved_at": r[4],
                    "created_at": r[5],
                }
        finally:
            conn.close()

    def list_drafts(self, registrar: str) -> list[dict[str, Any]]:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT d.case_id, d.draft_status, CAST(d.last_saved_at AS TEXT),
                           COALESCE(SUM(CASE WHEN w.value IS NOT NULL AND w.value <> ''
                                             THEN 1 ELSE 0 END), 0) AS filled
                    FROM draft_case d
                    LEFT JOIN working_draft w ON w.case_id = d.case_id
                    WHERE d.assigned_to = %s
                    GROUP BY d.case_id, d.draft_status, d.last_saved_at
                    ORDER BY d.last_saved_at DESC
                    """,
                    (registrar,),
                )
                out = []
                for r in cur.fetchall():
                    out.append(
                        {
                            "case_id": r[0],
                            "draft_status": r[1],
                            "last_saved_at": r[2],
                            "fields_filled": int(r[3]),
                        }
                    )
                return out
        finally:
            conn.close()

    def has_working(self, case_id: str) -> bool:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM working_draft WHERE case_id = %s LIMIT 1", (case_id,))
                return cur.fetchone() is not None
        finally:
            conn.close()

    def seed_working_draft(self, case_id: str, rows: list[dict[str, Any]]) -> int:
        from psycopg.types.json import Json

        conn = self._connect()
        try:
            n = 0
            with conn.cursor() as cur:
                for r in rows:
                    cur.execute(
                        """
                        INSERT INTO working_draft
                            (case_id, naaccr_item_id, value, confidence, source_ref,
                             field_status, updated_by)
                        VALUES (%s,%s,%s,%s,%s,%s,NULL)
                        ON CONFLICT (case_id, naaccr_item_id) DO NOTHING
                        """,
                        (
                            case_id,
                            r["naaccr_item_id"],
                            r.get("value"),
                            r.get("confidence"),
                            Json(r["source_ref"]) if r.get("source_ref") is not None else None,
                            r.get("field_status", "ai_suggested"),
                        ),
                    )
                    n += cur.rowcount
            return n
        finally:
            conn.close()

    def get_working_values(self, case_id: str) -> dict[int, dict[str, Any]]:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT naaccr_item_id, value, confidence, source_ref, field_status, updated_by "
                    "FROM working_draft WHERE case_id = %s",
                    (case_id,),
                )
                out: dict[int, dict[str, Any]] = {}
                for r in cur.fetchall():
                    out[int(r[0])] = {
                        "value": r[1],
                        "confidence": float(r[2]) if r[2] is not None else None,
                        "source_ref": r[3],
                        "field_status": r[4],
                        "updated_by": r[5],
                    }
                return out
        finally:
            conn.close()

    def upsert_field(
        self, case_id: str, item_id: int, value: str | None, field_status: str, updated_by: str
    ) -> None:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO working_draft
                        (case_id, naaccr_item_id, value, confidence, field_status, updated_by, updated_at)
                    VALUES (%s,%s,%s,NULL,%s,%s, now())
                    ON CONFLICT (case_id, naaccr_item_id) DO UPDATE
                      SET value = EXCLUDED.value, confidence = NULL,
                          field_status = EXCLUDED.field_status,
                          updated_by = EXCLUDED.updated_by, updated_at = now()
                    """,
                    (case_id, item_id, value, field_status, updated_by),
                )
                cur.execute("UPDATE draft_case SET last_saved_at = now() WHERE case_id = %s", (case_id,))
        finally:
            conn.close()

    def bulk_set_unknown(self, case_id: str, items: list[tuple[int, str]], updated_by: str) -> int:
        conn = self._connect()
        try:
            n = 0
            with conn.cursor() as cur:
                for item_id, code in items:
                    cur.execute(
                        """
                        INSERT INTO working_draft
                            (case_id, naaccr_item_id, value, confidence, field_status, updated_by, updated_at)
                        VALUES (%s,%s,%s,NULL,'unknown',%s, now())
                        ON CONFLICT (case_id, naaccr_item_id) DO UPDATE
                          SET value = EXCLUDED.value, confidence = NULL,
                              field_status = 'unknown', updated_by = EXCLUDED.updated_by,
                              updated_at = now()
                          WHERE working_draft.value IS NULL OR working_draft.value = ''
                        """,
                        (case_id, item_id, code, updated_by),
                    )
                    n += cur.rowcount
                if n:
                    cur.execute("UPDATE draft_case SET last_saved_at = now() WHERE case_id = %s", (case_id,))
            return n
        finally:
            conn.close()

    def finish(
        self,
        case_id: str,
        registrar: str,
        edits_passed: bool,
        run_id: str | None,
        form_data: list[dict[str, Any]],
    ) -> str:
        from psycopg.types.json import Json

        conn = self._connect(autocommit=False)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO finalized_forms
                        (case_id, registrar_id, edits_passed, abstraction_run_id, form_data)
                    VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT (case_id) DO UPDATE
                      SET registrar_id = EXCLUDED.registrar_id,
                          edits_passed = EXCLUDED.edits_passed,
                          abstraction_run_id = EXCLUDED.abstraction_run_id,
                          form_data = EXCLUDED.form_data,
                          finalized_at = now()
                    RETURNING CAST(finalized_at AS TEXT)
                    """,
                    (case_id, registrar, edits_passed, run_id, Json(form_data)),
                )
                finalized_at = cur.fetchone()[0]
                cur.execute("DELETE FROM draft_case WHERE case_id = %s", (case_id,))
            conn.commit()
            return finalized_at
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


# ===========================================================================
# In-memory fallback store (used only when Lakebase is unreachable)
# ===========================================================================
class MemoryStore:
    kind = "memory"

    def __init__(self) -> None:
        self.available = True
        self.last_error = None
        self._decisions: list[dict[str, Any]] = []
        self._seq = 100
        self._drafts: dict[str, dict[str, Any]] = {}
        self._working: dict[str, dict[int, dict[str, Any]]] = {}
        self._finalized: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def init(self) -> None:
        self.available = True

    def ping(self) -> bool:
        return True

    def _now(self) -> str:
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).isoformat()

    def get_exclusion_sets(self) -> dict[str, set[str]]:
        drafted = set(self._drafts.keys())
        finalized = set(self._finalized.keys())
        latest: dict[str, str] = {}
        for d in self._decisions:
            latest[d["case_id"]] = d["decision"]
        not_reportable = {c for c, dec in latest.items() if dec == "not_reportable"}
        return {"drafted": drafted, "finalized": finalized, "not_reportable": not_reportable}

    def insert_decision(self, case_id, decision, registrar, notes) -> int:
        with self._lock:
            self._seq += 1
            self._decisions.append(
                {
                    "decision_id": self._seq,
                    "case_id": case_id,
                    "decision": decision,
                    "registrar_id": registrar,
                    "notes": notes,
                    "decided_at": self._now(),
                }
            )
            return self._seq

    def upsert_draft(self, case_id, registrar, run_id) -> None:
        d = self._drafts.get(case_id)
        if d:
            if run_id:
                d["abstraction_run_id"] = run_id
            d["last_saved_at"] = self._now()
        else:
            self._drafts[case_id] = {
                "case_id": case_id,
                "assigned_to": registrar,
                "draft_status": "in_progress",
                "abstraction_run_id": run_id,
                "created_at": self._now(),
                "last_saved_at": self._now(),
            }

    def get_draft(self, case_id):
        return self._drafts.get(case_id)

    def list_drafts(self, registrar):
        out = []
        for d in self._drafts.values():
            if d["assigned_to"] != registrar:
                continue
            wv = self._working.get(d["case_id"], {})
            filled = sum(1 for v in wv.values() if v.get("value") not in (None, ""))
            out.append(
                {
                    "case_id": d["case_id"],
                    "draft_status": d["draft_status"],
                    "last_saved_at": d["last_saved_at"],
                    "fields_filled": filled,
                }
            )
        out.sort(key=lambda x: x["last_saved_at"], reverse=True)
        return out

    def has_working(self, case_id):
        return bool(self._working.get(case_id))

    def seed_working_draft(self, case_id, rows):
        wv = self._working.setdefault(case_id, {})
        n = 0
        for r in rows:
            iid = r["naaccr_item_id"]
            if iid in wv:
                continue
            wv[iid] = {
                "value": r.get("value"),
                "confidence": r.get("confidence"),
                "source_ref": r.get("source_ref"),
                "field_status": r.get("field_status", "ai_suggested"),
                "updated_by": None,
            }
            n += 1
        return n

    def get_working_values(self, case_id):
        return dict(self._working.get(case_id, {}))

    def upsert_field(self, case_id, item_id, value, field_status, updated_by):
        wv = self._working.setdefault(case_id, {})
        wv[item_id] = {
            "value": value,
            "confidence": None,
            "source_ref": wv.get(item_id, {}).get("source_ref"),
            "field_status": field_status,
            "updated_by": updated_by,
        }
        if case_id in self._drafts:
            self._drafts[case_id]["last_saved_at"] = self._now()

    def bulk_set_unknown(self, case_id, items, updated_by):
        wv = self._working.setdefault(case_id, {})
        n = 0
        for item_id, code in items:
            cur = wv.get(item_id)
            if cur is None or cur.get("value") in (None, ""):
                wv[item_id] = {
                    "value": code,
                    "confidence": None,
                    "source_ref": cur.get("source_ref") if cur else None,
                    "field_status": "unknown",
                    "updated_by": updated_by,
                }
                n += 1
        if n and case_id in self._drafts:
            self._drafts[case_id]["last_saved_at"] = self._now()
        return n

    def finish(self, case_id, registrar, edits_passed, run_id, form_data):
        ts = self._now()
        self._finalized[case_id] = {
            "case_id": case_id,
            "registrar_id": registrar,
            "edits_passed": edits_passed,
            "abstraction_run_id": run_id,
            "form_data": form_data,
            "finalized_at": ts,
        }
        self._drafts.pop(case_id, None)
        self._working.pop(case_id, None)
        return ts


# ===========================================================================
# Store selection
# ===========================================================================
_store: Any | None = None
_store_lock = threading.Lock()


def get_store():
    global _store
    if _store is not None:
        return _store
    with _store_lock:
        if _store is not None:
            return _store
        lb = LakebaseStore()
        lb.init()
        if lb.available:
            _store = lb
        else:
            mem = MemoryStore()
            mem.init()
            mem.last_error = f"lakebase unavailable ({lb.last_error}); using in-memory store"
            _store = mem
        return _store
