# NAACCR field model — CONTRACT

## Data-driven, not hand-coded
The 300+ field set is loaded from the NAACCR data dictionary into
`${catalog}.gold.gold_naaccr_dictionary` (schema in `gold_schemas.sql`) and synced to
Lakebase `naaccr_dictionary`. The app and the abstraction model both treat the dictionary
as the source of the field set, sections, valid code sets, required flags, and unknown codes.
Swapping the dictionary version is a data change, not a code change (customer-reusable).

## Field identity
- `naaccr_item_id` (INT) — NAACCR item number, the stable key everywhere (working_draft PK part, API path param).
- `item_name` (TEXT) — NAACCR XML id (e.g. `primarySite`, `histologicTypeIcdO3`, `grade`).

## Sections (form grouping, ordered)
Demographics · Tumor Identification · Stage/Extent · Site-Specific Data Items (SSDIs) ·
First-Course Treatment · Follow-up/Outcomes · Administrative. `section` on the dictionary
row drives the collapsible groups in the UI.

## Per-field value model (working_draft rows and API field objects)
| attribute | meaning |
|---|---|
| `value` | coded value (string); NULL = not yet filled |
| `confidence` | 0.000–1.000 AI confidence; NULL if human-entered |
| `source_ref` | `{doc_id, section, quote}` provenance the UI shows next to the field |
| `field_status` | `ai_suggested` → `edited` → `confirmed`; or `unknown` (valid unknown code); `blank` |
| `updated_by` | user email; NULL if AI-written |

## `field_status` lifecycle
- Abstraction agent writes `ai_suggested` (+ confidence + source_ref).
- Registrar edit → `edited` (confidence cleared, updated_by set).
- Registrar explicit accept → `confirmed`.
- "Fill unknown" → `unknown` with the dictionary `unknown_code`.
- Never filled and not required → may remain `blank`.

## "Unknown" is a valid answer, not a blank
Many NAACCR items have a valid unknown code (e.g. `9`, `99`, `999`). The Finish gate treats
a required field with a valid unknown code as satisfied. The Finish gate blocks only on
required fields that are still empty (`value IS NULL`) or on edit-rule ERRORS.

## Edits engine (deterministic, separate from the LLM)
Representative required-field + inter-field consistency checks (structured to plug in the
full NAACCR GenEDITS metafile later). Returns `{errors[], warnings[]}`. Errors block Finish;
warnings do not. The LLM proposes values; the edits engine validates them.

## Draft vs finalized
- `working_draft`: field-level rows (one per `naaccr_item_id`), granular auto-save.
- `finalized_forms.form_data`: JSONB snapshot assembled from working_draft at Finish
  (`[{naaccr_item_id,name,value,confidence,source_ref,status,entered_by}, ...]`), immutable.
