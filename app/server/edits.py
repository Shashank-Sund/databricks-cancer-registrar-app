"""Deterministic NAACCR edits engine (server side).

Mirrors the front-end mock contract exactly: required-field presence checks
plus a representative set of inter-field consistency rules. Errors block Finish;
warnings do not. The full NAACCR GenEDITS metafile plugs in here later with no
API change. The LLM proposes values; this engine validates them.

``values`` is a mapping of naaccr_item_id -> {"value": str|None, ...}.
"""
from __future__ import annotations

from typing import Any

from reference import load_dictionary


def _is_empty(v: Any) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


def _get(values: dict[int, dict[str, Any]], item_id: int) -> Any:
    row = values.get(item_id)
    return row.get("value") if row else None


def run_edits(values: dict[int, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    # Required-field checks (a valid unknown code counts as filled).
    for d in load_dictionary():
        if d["required"] and _is_empty(_get(values, d["naaccr_item_id"])):
            errors.append(
                {
                    "naaccr_item_id": d["naaccr_item_id"],
                    "message": f"{d['label']} is required.",
                }
            )

    # Inter-field: regional nodes positive coded but examined blank.
    nodes_pos = _get(values, 820)
    nodes_exam = _get(values, 830)
    if not _is_empty(nodes_pos) and _is_empty(nodes_exam):
        errors.append(
            {
                "naaccr_item_id": 820,
                "message": (
                    "Regional Nodes Positive is coded but Regional Nodes Examined is "
                    "blank; the examined count is required when nodes are positive."
                ),
            }
        )

    # Warning: tumor size summary blank.
    if _is_empty(_get(values, 880)):
        warnings.append(
            {
                "naaccr_item_id": 880,
                "message": (
                    "Tumor Size Summary is blank; confirm against the pathology "
                    "synoptic (non-blocking)."
                ),
            }
        )

    # Warning: dead without cause of death.
    if _get(values, 1760) == "0" and _is_empty(_get(values, 1910)):
        warnings.append(
            {
                "naaccr_item_id": 1910,
                "message": "Vital Status is Dead but Cause of Death is blank.",
            }
        )

    # Warning: triple-negative profile with hormone therapy coded.
    tri_neg = (
        _get(values, 3827) == "0"
        and _get(values, 3828) == "0"
        and _get(values, 3855) == "0"
    )
    if tri_neg and _get(values, 1400) == "01":
        warnings.append(
            {
                "naaccr_item_id": 1400,
                "message": (
                    "ER, PR and HER2 are all negative but hormone therapy is coded; "
                    "verify against the treatment plan."
                ),
            }
        )

    return {"errors": errors, "warnings": warnings}


def finish_blocking(values: dict[int, dict[str, Any]]) -> dict[str, list[int]]:
    """Split blocking payload for the Finish precondition (contract 409 shape)."""
    missing_required: list[int] = []
    for d in load_dictionary():
        if d["required"] and _is_empty(_get(values, d["naaccr_item_id"])):
            missing_required.append(d["naaccr_item_id"])
    errors = run_edits(values)["errors"]
    edit_errors = [
        e["naaccr_item_id"]
        for e in errors
        if e["naaccr_item_id"] not in missing_required
    ]
    return {"missing_required": missing_required, "edit_errors": edit_errors}
