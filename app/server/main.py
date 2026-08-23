"""FastAPI entrypoint for the cancer-registry Databricks App.

Serves the built React client (static SPA) and the REST API under /api that
implements contracts/api_contract.md. Run with:
    uvicorn main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config
import service
import lookup
from store import get_store

app = FastAPI(title="Cancer Registry API", docs_url="/api/docs", openapi_url="/api/openapi.json")
api = APIRouter(prefix="/api")


# ---- request bodies ------------------------------------------------------
class TriageBody(BaseModel):
    decision: str
    notes: Optional[str] = None


class PatchFieldBody(BaseModel):
    value: Optional[str] = None


class FillUnknownBody(BaseModel):
    section: Optional[str] = None


# ---- endpoints -----------------------------------------------------------
@api.get("/health")
def health() -> dict[str, Any]:
    store = get_store()
    return {
        "status": "ok",
        "store": store.kind,
        "store_available": getattr(store, "available", None),
        "store_note": getattr(store, "last_error", None),
        "catalog": config.CATALOG,
        "gold_schema": config.GOLD_SCHEMA,
        "warehouse_id": config.WAREHOUSE_ID,
        "lakebase_schema": config.LAKEBASE_SCHEMA,
        "abstraction_job_id": config.ABSTRACTION_JOB_ID,
    }


@api.get("/me")
def get_me(request: Request) -> dict[str, str]:
    return service.me(request.headers)


@api.get("/queue")
def get_queue(
    request: Request,
    label: Optional[str] = None,
    min_score: Optional[float] = None,
    sort: str = "score_desc",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    return service.queue(label, min_score, sort, page, page_size)


@api.post("/queue/{case_id}/triage")
def post_triage(case_id: str, body: TriageBody, request: Request) -> dict[str, Any]:
    email, _ = service.registrar_from_headers(request.headers)
    return service.triage(case_id, body.decision, body.notes, email)


@api.get("/drafts")
def get_drafts(request: Request) -> dict[str, Any]:
    email, _ = service.registrar_from_headers(request.headers)
    return service.drafts(email)


@api.get("/cases/{case_id}")
def get_case(case_id: str, request: Request):
    email, _ = service.registrar_from_headers(request.headers)
    form = service.get_case(case_id, email)
    if form is None:
        return JSONResponse({"detail": f"case {case_id} not found"}, status_code=404)
    return form


@api.patch("/cases/{case_id}/fields/{item_id}")
def patch_field(case_id: str, item_id: int, body: PatchFieldBody, request: Request) -> dict[str, Any]:
    email, _ = service.registrar_from_headers(request.headers)
    return service.patch_field(case_id, item_id, body.value, email)


@api.post("/cases/{case_id}/fill-unknown")
def fill_unknown(case_id: str, body: FillUnknownBody, request: Request) -> dict[str, Any]:
    email, _ = service.registrar_from_headers(request.headers)
    return service.fill_unknown(case_id, body.section, email)


@api.get("/cases/{case_id}/edits")
def get_edits(case_id: str) -> dict[str, Any]:
    return service.get_edits(case_id)


@api.get("/lookup")
def code_lookup(system: str, q: str = "", limit: int = 25) -> dict[str, Any]:
    """Search an authoritative reference code table (fips_county, icdo3_site,
    icdo3_histology, occupation, industry). Returns matches + source/version."""
    return lookup.search(system, q, limit)


@api.post("/cases/{case_id}/finish")
def finish(case_id: str, request: Request):
    email, _ = service.registrar_from_headers(request.headers)
    status, body = service.finish(case_id, email)
    return JSONResponse(body, status_code=status)


app.include_router(api)


# ---- static SPA ----------------------------------------------------------
_STATIC_DIR = Path(__file__).parent / "static"
_ASSETS_DIR = _STATIC_DIR / "assets"
if _ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="assets")


@app.get("/")
def index():
    idx = _STATIC_DIR / "index.html"
    if idx.is_file():
        return FileResponse(str(idx))
    return JSONResponse({"detail": "client not built"}, status_code=404)


@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    # API routes are handled above; anything else falls back to the SPA shell.
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "not found"}, status_code=404)
    candidate = _STATIC_DIR / full_path
    if candidate.is_file():
        return FileResponse(str(candidate))
    idx = _STATIC_DIR / "index.html"
    if idx.is_file():
        return FileResponse(str(idx))
    return JSONResponse({"detail": "client not built"}, status_code=404)
