"""Business logic implementing contracts/api_contract.md.

Combines reference reads (SQL warehouse), OLTP state (Lakebase/memory store),
the abstraction Jobs trigger, and the deterministic edits engine into the exact
response shapes the React client expects.
"""
from __future__ import annotations

from typing import Any

import config
import reference
from edits import finish_blocking, run_edits
from store import get_store


# ---- identity ------------------------------------------------------------
def registrar_from_headers(headers) -> tuple[str, str]:
    """Derive (email, display_name) from Databricks Apps OAuth headers.

    Falls back to the CLI identity locally, then to a demo default. The client
    never supplies identity; registrar_id is always server-derived.
    """
    email = (
        headers.get("x-forwarded-email")
        or headers.get("x-forwarded-preferred-username")
        or ""
    ).strip()
    if not email:
        try:
            from dbx import get_ws

            email = get_ws().current_user.me().user_name or ""
        except Exception:
            email = ""
    if not email:
        email = config.FALLBACK_REGISTRAR
    # Friendly display name derived from the email local part. The Apps proxy
    # forwards an opaque user id (not a human name), so we do not use it here.
    local = email.split("@")[0]
    display = " ".join(p.capitalize() for p in local.replace(".", " ").replace("_", " ").split())
    if not display:
        display = email
    return email, display


def me(headers) -> dict[str, str]:
    email, display = registrar_from_headers(headers)
    return {"email": email, "display_name": display}


# ---- queue ---------------------------------------------------------------
def queue(
    label: str | None,
    min_score: float | None,
    sort: str,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    items = reference.get_flagged(label=label or None, min_score=min_score)
    excl = get_store().get_exclusion_sets()
    blocked = excl["drafted"] | excl["finalized"] | excl["not_reportable"]
    items = [c for c in items if c["case_id"] not in blocked]

    def sort_key(c):
        return c["reportability_score"] if c["reportability_score"] is not None else -1

    if sort == "score_asc":
        items.sort(key=sort_key)
    elif sort == "date_desc":
        items.sort(key=lambda c: c["diagnosis_date"] or "", reverse=True)
    elif sort == "date_asc":
        items.sort(key=lambda c: c["diagnosis_date"] or "")
    else:  # score_desc default
        items.sort(key=sort_key, reverse=True)

    total = len(items)
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


# ---- triage --------------------------------------------------------------
def _trigger_abstraction(case_id: str) -> str | None:
    if not config.ABSTRACTION_JOB_ID:
        return None
    try:
        from dbx import get_ws

        # Pass the case id as a JOB parameter (not python_params) so the job's
        # static config params (catalog/schema/endpoint, injected by the bundle)
        # are preserved for this run.
        run = get_ws().jobs.run_now(
            job_id=config.ABSTRACTION_JOB_ID, job_parameters={"case_ids": case_id}
        )
        run_id = getattr(run, "run_id", None)
        return str(run_id) if run_id is not None else None
    except Exception:
        return None


def triage(case_id: str, decision: str, notes: str | None, registrar: str) -> dict[str, Any]:
    store = get_store()
    decision_id = store.insert_decision(case_id, decision, registrar, notes)
    if decision == "not_reportable":
        return {"decision_id": decision_id, "decision": decision, "abstraction_run_id": None}

    # reportable -> trigger abstraction, create the draft, seed AI values.
    run_id = _trigger_abstraction(case_id)
    seed_rows = reference.get_ai_draft(case_id)
    if run_id is None and seed_rows:
        run_id = seed_rows[0].get("abstraction_run_id")
    store.upsert_draft(case_id, registrar, run_id)
    if not store.has_working(case_id):
        store.seed_working_draft(case_id, seed_rows)
    return {"decision_id": decision_id, "decision": decision, "abstraction_run_id": run_id}


# ---- drafts --------------------------------------------------------------
def drafts(registrar: str) -> dict[str, Any]:
    store = get_store()
    rows = store.list_drafts(registrar)
    total = reference.fields_total()
    items = []
    for d in rows:
        # Resolve metadata from the authoritative case set (flagged queue, then
        # silver context). A draft whose case_id is not a real case anywhere is
        # orphaned test data: skip it so the UI never shows a raw case_id as a
        # patient name or links to a case that cannot load.
        meta = reference.get_case_meta(d["case_id"])
        if meta is None:
            continue
        items.append(
            {
                "case_id": d["case_id"],
                "patient_name": meta.get("patient_name") or "Unknown patient",
                "primary_diagnosis_desc": meta.get("primary_diagnosis_desc") or "",
                "draft_status": d["draft_status"],
                "last_saved_at": d["last_saved_at"],
                "fields_total": total,
                "fields_filled": d["fields_filled"],
            }
        )
    return {"items": items}


# ---- case form -----------------------------------------------------------
def _ensure_draft_and_seed(case_id: str, registrar: str) -> dict[str, Any]:
    store = get_store()
    draft = store.get_draft(case_id)
    if draft is None:
        seed_rows = reference.get_ai_draft(case_id)
        run_id = seed_rows[0].get("abstraction_run_id") if seed_rows else None
        store.upsert_draft(case_id, registrar, run_id)
        store.seed_working_draft(case_id, seed_rows)
        draft = store.get_draft(case_id)
    elif not store.has_working(case_id):
        store.seed_working_draft(case_id, reference.get_ai_draft(case_id))
    return draft


def get_case(case_id: str, registrar: str) -> dict[str, Any] | None:
    meta = reference.get_case_meta(case_id)
    if meta is None:
        return None
    draft = _ensure_draft_and_seed(case_id, registrar)
    values = get_store().get_working_values(case_id)

    sections: list[dict[str, Any]] = []
    current_section = None
    for d in reference.load_dictionary():
        if d["section"] != current_section:
            current_section = d["section"]
            sections.append({"section": current_section, "fields": []})
        wv = values.get(d["naaccr_item_id"])
        if wv:
            value = wv.get("value")
            confidence = wv.get("confidence")
            field_status = wv.get("field_status") or ("blank" if value in (None, "") else "ai_suggested")
            source_ref = wv.get("source_ref")
        else:
            value, confidence, field_status, source_ref = None, None, "blank", None
        sections[-1]["fields"].append(
            {
                "naaccr_item_id": d["naaccr_item_id"],
                "item_name": d["item_name"],
                "label": d["label"],
                "data_type": d["data_type"],
                "required": d["required"],
                "value": value,
                "confidence": confidence,
                "field_status": field_status,
                "source_ref": source_ref,
                "valid_values": d["valid_values"],
                "unknown_code": d["unknown_code"],
                "description": d["description"],
                "code_system": d.get("code_system"),
                "coding_instructions": d.get("coding_instructions"),
                "reference_url": d.get("reference_url"),
                "source": d.get("source"),
                "version": d.get("version"),
                "lookup": d.get("lookup"),
            }
        )

    return {
        "case_id": case_id,
        "patient_name": meta.get("patient_name"),
        "patient_mrn": meta.get("patient_mrn"),
        "date_of_birth": meta.get("date_of_birth"),
        "sex": meta.get("sex"),
        "primary_diagnosis_desc": meta.get("primary_diagnosis_desc"),
        "draft_status": draft["draft_status"],
        "last_saved_at": draft["last_saved_at"],
        "abstraction_run_id": draft.get("abstraction_run_id"),
        "sections": sections,
        "edits": run_edits(values),
    }


def patch_field(case_id: str, item_id: int, value: str | None, registrar: str) -> dict[str, Any]:
    store = get_store()
    _ensure_draft_and_seed(case_id, registrar)
    clean = value if (value is not None and value.strip() != "") else None
    field_status = "blank" if clean is None else "edited"
    store.upsert_field(case_id, item_id, clean, field_status, registrar)
    values = store.get_working_values(case_id)
    return {"ok": True, "field_status": field_status, "edits": run_edits(values)}


def fill_unknown(case_id: str, section: str | None, registrar: str) -> dict[str, Any]:
    store = get_store()
    _ensure_draft_and_seed(case_id, registrar)
    values = store.get_working_values(case_id)
    targets: list[tuple[int, str]] = []
    for d in reference.load_dictionary():
        if section and d["section"] != section:
            continue
        if not d["required"] or not d["unknown_code"]:
            continue
        cur = values.get(d["naaccr_item_id"])
        if cur is None or cur.get("value") in (None, ""):
            targets.append((d["naaccr_item_id"], d["unknown_code"]))
    updated = store.bulk_set_unknown(case_id, targets, registrar) if targets else 0
    return {"updated": updated}


def get_edits(case_id: str) -> dict[str, Any]:
    values = get_store().get_working_values(case_id)
    return run_edits(values)


def finish(case_id: str, registrar: str) -> tuple[int, dict[str, Any]]:
    store = get_store()
    values = store.get_working_values(case_id)
    blocking = finish_blocking(values)
    if blocking["missing_required"] or blocking["edit_errors"]:
        return 409, {"finalized": False, "blocking": blocking}

    dict_by_id = reference.dictionary_by_id()
    form_data = []
    for item_id, wv in values.items():
        d = dict_by_id.get(item_id, {})
        form_data.append(
            {
                "naaccr_item_id": item_id,
                "name": d.get("item_name"),
                "value": wv.get("value"),
                "confidence": wv.get("confidence"),
                "source_ref": wv.get("source_ref"),
                "status": wv.get("field_status"),
                "entered_by": wv.get("updated_by"),
            }
        )
    draft = store.get_draft(case_id)
    run_id = draft.get("abstraction_run_id") if draft else None
    finalized_at = store.finish(case_id, registrar, True, run_id, form_data)
    return 200, {"finalized": True, "finalized_at": finalized_at}
