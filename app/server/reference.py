"""Reference data read from Unity Catalog gold Delta tables via the warehouse.

- NAACCR dictionary  -> the field set (307 items, 7 sections, valid codes, ...)
- gold_flagged       -> the triage queue candidates
- gold_form_ai_draft -> AI-extracted field values used to seed a working draft

The dictionary is static reference data, so it is loaded once and cached.
"""
from __future__ import annotations

import json
import threading
from typing import Any

import config
from dbx import wh_query
from labels import humanize

# Canonical section order from contracts/naaccr_field_model.md.
SECTION_ORDER = [
    "Demographics",
    "Tumor Identification",
    "Stage/Extent",
    "Site-Specific Data Items",
    "First-Course Treatment",
    "Follow-up/Outcomes",
    "Administrative",
]

# Maps a dictionary code_system to a searchable code-lookup system key. Fields
# whose code_system is in this map (and that have no valid_values dropdown) get a
# typeahead picker backed by the authoritative gold_code_lookup table.
CODE_SYSTEM_LOOKUP = {
    "FIPS County (Census/ANSI)": "fips_county",
    "ICD-O-3 Topography": "icdo3_site",
    "ICD-O-3 Morphology": "icdo3_histology",
    "Census Occupation (NIOCCS)": "occupation",
    "Census Industry (NIOCCS)": "industry",
}


def _as_bool(v: Any) -> bool:
    return str(v).strip().lower() in ("true", "t", "1", "yes")


def _as_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _as_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _parse_json(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, (list, dict)):
        return v
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return None


# ---- Dictionary ----------------------------------------------------------
_dictionary_cache: list[dict[str, Any]] | None = None
_dict_lock = threading.Lock()


def load_dictionary() -> list[dict[str, Any]]:
    """Return the full NAACCR dictionary (cached), ordered by section then id."""
    global _dictionary_cache
    if _dictionary_cache is not None:
        return _dictionary_cache
    with _dict_lock:
        if _dictionary_cache is not None:
            return _dictionary_cache
        rows = wh_query(
            f"""
            SELECT naaccr_item_id, item_name, section, data_type, length,
                   required, valid_values, unknown_code, description,
                   code_system, coding_instructions, reference_url, source, version
            FROM {config.DICTIONARY_TABLE}
            """
        )
        items: list[dict[str, Any]] = []
        for r in rows:
            code_system = r.get("code_system")
            valid_values = _parse_json(r["valid_values"])
            # A field is a searchable picker only when it has no dropdown values
            # and its code system has an authoritative lookup table.
            lookup = None if valid_values else CODE_SYSTEM_LOOKUP.get(code_system or "")
            items.append(
                {
                    "naaccr_item_id": _as_int(r["naaccr_item_id"]),
                    "item_name": r["item_name"],
                    "label": humanize(r["item_name"]),
                    "section": r["section"],
                    "data_type": r["data_type"],
                    "length": _as_int(r["length"]),
                    "required": _as_bool(r["required"]),
                    "valid_values": valid_values,
                    "unknown_code": r["unknown_code"],
                    "description": r["description"],
                    "code_system": code_system,
                    "coding_instructions": r.get("coding_instructions"),
                    "reference_url": r.get("reference_url"),
                    "source": r.get("source"),
                    "version": r.get("version"),
                    "lookup": lookup,
                }
            )
        order = {s: i for i, s in enumerate(SECTION_ORDER)}
        items.sort(
            key=lambda d: (order.get(d["section"], 999), d["naaccr_item_id"] or 0)
        )
        _dictionary_cache = items
        return items


def dictionary_by_id() -> dict[int, dict[str, Any]]:
    return {d["naaccr_item_id"]: d for d in load_dictionary()}


def required_item_ids() -> list[int]:
    return [d["naaccr_item_id"] for d in load_dictionary() if d["required"]]


def fields_total() -> int:
    return len(load_dictionary())


# ---- Flagged cases (queue candidates) ------------------------------------
# gold_flagged is static reference data (synced from the classifier's gold
# output), so load it once and cache it. This keeps queue pagination snappy —
# every page navigation filters/paginates in memory instead of round-tripping
# the warehouse (which made paging feel laggy and show stale rows). The live
# per-request work (exclusion sets) stays in Lakebase.
_flagged_cache: list[dict[str, Any]] | None = None
_flagged_lock = threading.Lock()


def _load_all_flagged() -> list[dict[str, Any]]:
    global _flagged_cache
    if _flagged_cache is not None:
        return _flagged_cache
    with _flagged_lock:
        if _flagged_cache is not None:
            return _flagged_cache
        rows = wh_query(
            f"""
            SELECT case_id, patient_mrn, patient_name, CAST(date_of_birth AS STRING) date_of_birth,
                   sex, primary_diagnosis_code, primary_diagnosis_desc,
                   CAST(diagnosis_date AS STRING) diagnosis_date,
                   reportability_score, reportability_label, classifier_rationale,
                   key_codes, CAST(flagged_at AS STRING) flagged_at
            FROM {config.FLAGGED_TABLE}
            """
        )
        for r in rows:
            r["reportability_score"] = _as_float(r["reportability_score"])
            r["key_codes"] = _parse_json(r["key_codes"]) or []
        _flagged_cache = rows
        return rows


def get_flagged(label: str | None = None, min_score: float | None = None) -> list[dict[str, Any]]:
    rows = _load_all_flagged()
    out = rows
    if label:
        out = [r for r in out if r["reportability_label"] == label]
    if min_score is not None:
        out = [r for r in out if (r["reportability_score"] or 0.0) >= min_score]
    return list(out)


# ---- Authoritative case context (silver, the 200-case set) ---------------
# gold_flagged is only the *triage queue* (a subset). silver_case_context is the
# authoritative set of real cases with patient names + full context. Resolving
# case metadata from here (rather than only gold_flagged) means a draft whose
# case_id is a real case still shows a proper patient name, and a case_id that is
# genuinely not a real case resolves to None -> a clean 404 / empty state.
_context_cache: dict[str, dict[str, Any]] | None = None
_context_lock = threading.Lock()


def _load_case_context() -> dict[str, dict[str, Any]]:
    global _context_cache
    if _context_cache is not None:
        return _context_cache
    with _context_lock:
        if _context_cache is not None:
            return _context_cache
        rows = wh_query(
            f"""
            SELECT case_id, patient_id,
                   first_name, last_name,
                   CAST(date_of_birth AS STRING) date_of_birth, sex,
                   diagnosis_code, diagnosis_desc,
                   CAST(diagnosis_date AS STRING) diagnosis_date
            FROM {config.CASE_CONTEXT_TABLE}
            """
        )
        out: dict[str, dict[str, Any]] = {}
        for r in rows:
            name = " ".join(
                p for p in [(r.get("first_name") or "").strip(), (r.get("last_name") or "").strip()] if p
            ).strip()
            out[r["case_id"]] = {
                "case_id": r["case_id"],
                "patient_mrn": r.get("patient_id"),
                "patient_name": name or None,
                "date_of_birth": r.get("date_of_birth"),
                "sex": r.get("sex"),
                "primary_diagnosis_code": r.get("diagnosis_code"),
                "primary_diagnosis_desc": r.get("diagnosis_desc"),
                "diagnosis_date": r.get("diagnosis_date"),
            }
        _context_cache = out
        return out


def get_case_meta(case_id: str) -> dict[str, Any] | None:
    """Resolve case metadata, preferring the richer flagged-queue row (has MRN,
    reportability, key codes) and falling back to the authoritative silver
    context. Returns None only when the case_id is not a real case anywhere,
    which the API surfaces as a clean 404 / graceful empty state."""
    for r in _load_all_flagged():
        if r["case_id"] == case_id:
            return r
    return _load_case_context().get(case_id)


# ---- AI-extracted draft (seed source) ------------------------------------
def get_ai_draft(case_id: str) -> list[dict[str, Any]]:
    rows = wh_query(
        f"""
        SELECT naaccr_item_id, item_name, value, confidence, source_ref,
               field_status, abstraction_run_id
        FROM {config.AI_DRAFT_TABLE}
        WHERE case_id = :case_id
        """,
        {"case_id": case_id},
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "naaccr_item_id": _as_int(r["naaccr_item_id"]),
                "item_name": r["item_name"],
                "value": r["value"],
                "confidence": _as_float(r["confidence"]),
                "source_ref": _parse_json(r["source_ref"]),
                "field_status": r["field_status"] or "ai_suggested",
                "abstraction_run_id": r["abstraction_run_id"],
            }
        )
    return out
