"""Derive human-readable field labels from NAACCR item names.

The gold dictionary stores the NAACCR XML id (camelCase, e.g. ``primarySite``,
``histologicTypeIcdO3``) but no display label. The API contract exposes a
``label`` per field, so we derive a Title-Cased label from the item name.
"""
from __future__ import annotations

import re

# Words that should render fully upper-cased when they appear as tokens.
_ACRONYMS = {
    "id": "ID",
    "icd": "ICD",
    "o3": "O3",
    "ajcc": "AJCC",
    "tnm": "TNM",
    "her2": "HER2",
    "er": "ER",
    "pr": "PR",
    "ssdi": "SSDI",
    "naaccr": "NAACCR",
    "mrn": "MRN",
    "dx": "Dx",
    "csf": "CSF",
    "cs": "CS",
}


def _split_camel(name: str) -> list[str]:
    # Insert boundaries between camelCase transitions and around digit runs.
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)
    spaced = re.sub(r"(?<=[A-Za-z])(?=[0-9])", " ", spaced)
    spaced = spaced.replace("_", " ").replace("-", " ")
    return [t for t in spaced.split() if t]


def humanize(item_name: str | None) -> str:
    if not item_name:
        return ""
    tokens = _split_camel(item_name)
    out: list[str] = []
    for tok in tokens:
        low = tok.lower()
        if low in _ACRONYMS:
            out.append(_ACRONYMS[low])
        elif tok.isupper():
            out.append(tok)
        else:
            out.append(tok[:1].upper() + tok[1:])
    return " ".join(out) or item_name
