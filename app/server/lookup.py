"""Searchable authoritative code lookups (FIPS county, ICD-O-3, occupation,
industry) backed by the gold_code_lookup Delta table. Cached per system.
Config-driven table name; each row carries source + version so results are
self-describing and refreshable.
"""
from __future__ import annotations

import threading
from typing import Any

import config
from dbx import wh_query

_cache: dict[str, list[dict[str, Any]]] = {}
_lock = threading.Lock()


def _load(system: str) -> list[dict[str, Any]]:
    if system in _cache:
        return _cache[system]
    with _lock:
        if system in _cache:
            return _cache[system]
        try:
            rows = wh_query(
                f"SELECT code, label, extra, source, version FROM {config.LOOKUP_TABLE} "
                f"WHERE system = :sys ORDER BY code",
                {"sys": system},
            )
        except Exception:
            rows = []
        _cache[system] = rows
        return rows


def search(system: str, q: str, limit: int = 25) -> dict[str, Any]:
    rows = _load(system)
    source = rows[0]["source"] if rows else None
    version = rows[0]["version"] if rows else None
    ql = (q or "").strip().lower()
    if ql:
        starts = [r for r in rows if (r["code"] or "").lower().startswith(ql)]
        contains = [
            r
            for r in rows
            if ql in (r["label"] or "").lower() or ql in (r["code"] or "").lower()
        ]
        seen: set[str] = set()
        ordered: list[dict[str, Any]] = []
        for r in starts + contains:
            key = r["code"]
            if key not in seen:
                seen.add(key)
                ordered.append(r)
        matched = ordered
    else:
        matched = rows
    items = [
        {"code": r["code"], "label": r["label"], "extra": r["extra"]}
        for r in matched[:limit]
    ]
    return {
        "system": system,
        "items": items,
        "total": len(matched),
        "source": source,
        "version": version,
    }


def label_for(system: str, code: str) -> str | None:
    for r in _load(system):
        if r["code"] == code:
            return r["label"]
    return None
