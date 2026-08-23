"""
NAACCR Abstraction Agent — generates structured NAACCR fields for reportable cancer cases.

Reads case context from silver_case_context, calls Claude Opus 5 section-by-section with
NAACCR field definitions, parses structured JSON output, validates coded values,
and writes field-level rows to gold_form_ai_draft with confidence/source provenance.

Parameterization:
  python run_abstraction.py [case_id_1 case_id_2 ...]

If no case IDs provided, defaults to 5 'likely_reportable' cases for demo.

Usage (serverless job):
  databricks jobs create --json '{
    "name": "cancer-abstraction",
    "spark_python_task": {
      "python_file": "/Workspace/Users/<you>/cancer_registry_demo/ml/abstraction/run_abstraction.py",
      "parameters": ["case_id_1", "case_id_2", ...]
    },
    "environments": [{"environment_key":"default_env","spec":{"client":"2","dependencies":["databricks-sdk"]}}]
  }'
"""

import sys
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
import logging
import requests

# Databricks SDK and Spark imports
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import ChatMessage, ChatMessageRole
from pyspark.sql import SparkSession, DataFrame
from pyspark.sql.functions import col, struct, lit, current_timestamp
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType, IntegerType

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ============================================================================
# Configuration. These are DEFAULTS only; main() overrides them from bundle-passed
# args (catalog=... gold_schema=... abstraction_endpoint=...) or env vars, so the
# same script is portable across workspaces/clouds.
# ============================================================================

CATALOG = "cancer_registry_demo"
BRONZE_SCHEMA = "cancer_bronze"
SILVER_SCHEMA = "cancer_silver"
GOLD_SCHEMA = "cancer_gold"

ABSTRACTION_ENDPOINT = "databricks-claude-opus-5"
CLAUDE_MAX_TOKENS = 4096

# NAACCR sections (in order for abstraction batching)
SECTIONS = [
    "Demographics",
    "Tumor Identification",
    "Stage/Extent",
    "Site-Specific Data Items",
    "First-Course Treatment",
    "Follow-up/Outcomes",
    "Administrative",
]

# ============================================================================
# Utilities
# ============================================================================

def load_abstraction_prompt() -> str:
    """Load the base abstraction prompt template."""
    # In a real setup, this would read from ml/prompts/abstraction_prompt.md
    # For now, we return the inline template
    return """You are a Certified Tumor Registrar and medical record abstraction expert. Your task is to extract
and code NAACCR data elements from a cancer case's full clinical context.

CRITICAL RULES:
1. Return ONLY a valid JSON array of extracted fields — no other text, no markdown.
2. For each NAACCR item in the section below:
   - If the item has valid_values, the value MUST be one of those codes (never invent codes).
   - If the item does NOT have valid_values, the value may be numeric/date/text as specified.
   - If the item is required and data cannot be found, use the item's unknown_code and set field_status to "unknown".
   - If the item is optional and not documented, OMIT the field from the output (do NOT include value:null).
3. confidence (0.0-1.0): Set based on evidence strength.
   - 0.9-1.0: Explicit in medical record, unambiguous.
   - 0.7-0.9: Reasonable inference from documented terms.
   - 0.5-0.7: Indirect evidence requiring clinical judgment.
   - <0.5: Uncertain or contradictory — prefer unknown_code if required.
4. source_span: Must be a verbatim quote from the case context, or null if using unknown_code.
   Keep quotes short (<100 characters) but complete enough to verify the value.
5. field_status: Always "ai_suggested" for first abstraction, or "unknown" if using unknown_code.

## Format of each field in the output array
{
  "naaccr_item_id": <int>,
  "value": "<string or code>",
  "confidence": <float 0.0-1.0>,
  "source_span": "<verbatim quote or null>",
  "field_status": "ai_suggested" | "unknown"
}

## CASE CONTEXT

**Demographics:**
- Patient Name: {patient_name}
- MRN: {patient_mrn}
- Date of Birth: {date_of_birth}
- Age at Diagnosis: {age_at_diagnosis}
- Sex: {sex}
- Race: {race}
- Ethnicity: {ethnicity}

**Diagnosis:**
- Code: {diagnosis_code}
- Description: {diagnosis_desc}
- Date: {diagnosis_date}
- Behavior: {behavior}

**Encounter:**
- Type: {encounter_type}
- Facility: {facility_name}
- Department: {department}

**Clinical Documents:**

Pathology Report:
{pathology_text}

Clinical Notes:
{clinical_text}

Operative Report:
{operative_text}

Radiology Report:
{radiology_text}

Discharge Summary:
{discharge_text}

**Lab Results (JSON):**
{lab_results_json}

**Medications (JSON):**
{medications_json}

## NAACCR Dictionary — {section_name}

The following items must be extracted. Treat this as the definitive list for this section.
Only include fields that are in this list; do NOT invent fields.

{dictionary_items_json}

## OUTPUT
Return ONLY the JSON array (no markdown, no extra text). Each field MUST match the structure above."""


def get_spark() -> SparkSession:
    """Get or create Spark session (for serverless)."""
    return SparkSession.builder.appName("NAACCRAbstraction").getOrCreate()


def get_case_ids_spark(spark: SparkSession, limit: int = 5) -> List[str]:
    """Get case IDs for 'likely_reportable' cases using Spark."""
    try:
        query = f"""
        SELECT DISTINCT c.case_id
        FROM {CATALOG}.{SILVER_SCHEMA}.silver_case_context c
        INNER JOIN {CATALOG}.{GOLD_SCHEMA}.gold_flagged f
            ON c.case_id = f.case_id
        WHERE f.reportability_label = 'likely_reportable'
        LIMIT {limit}
        """
        df = spark.sql(query)
        case_ids = [row[0] for row in df.collect()]
        logger.info(f"Found {len(case_ids)} 'likely_reportable' cases")
        return case_ids
    except Exception as e:
        logger.error(f"Failed to get case IDs: {e}")
        return []


def load_naaccr_dictionary_spark(spark: SparkSession) -> Dict[str, List[Dict[str, Any]]]:
    """Load complete NAACCR dictionary grouped by section."""
    try:
        query = f"""
        SELECT
            naaccr_item_id, item_name, section, data_type, length, required,
            valid_values, unknown_code, description
        FROM {CATALOG}.{GOLD_SCHEMA}.gold_naaccr_dictionary
        ORDER BY section, naaccr_item_id
        """
        df = spark.sql(query)
        rows = df.collect()

        # Group by section
        by_section = {}
        for row in rows:
            section = row.section
            if section not in by_section:
                by_section[section] = []

            item = {
                "naaccr_item_id": row.naaccr_item_id,
                "item_name": row.item_name,
                "section": row.section,
                "data_type": row.data_type,
                "length": row.length,
                "required": row.required,
                "valid_values": row.valid_values,  # JSON string
                "unknown_code": row.unknown_code,
                "description": row.description,
            }
            by_section[section].append(item)

        logger.info(f"Loaded NAACCR dictionary: {len(rows)} items, {len(by_section)} sections")
        return by_section
    except Exception as e:
        logger.error(f"Failed to load NAACCR dictionary: {e}")
        return {}


def format_dictionary_for_prompt(dict_items: List[Dict[str, Any]]) -> str:
    """Format dictionary items as JSON for the prompt."""
    return json.dumps(dict_items, indent=2)


def call_claude_abstraction(
    prompt_text: str,
    w: WorkspaceClient,
) -> Optional[str]:
    """Call Claude Opus 5 serving endpoint for NAACCR extraction.

    NOTE: In serverless environment, ai_query batch inference is NOT supported.
    This uses a per-request serving endpoint call via OpenAI-compatible API.
    """
    try:
        # Native SDK serving query — no openai/httpx dependency (only databricks-sdk).
        response = w.serving_endpoints.query(
            name=ABSTRACTION_ENDPOINT,
            messages=[ChatMessage(role=ChatMessageRole.USER, content=prompt_text)],
            max_tokens=CLAUDE_MAX_TOKENS,
        )  # note: claude-opus-5 rejects the temperature parameter
        return response.choices[0].message.content

    except Exception as e:
        logger.error(f"Claude API call failed: {e}")
        return None


def parse_claude_response(response_text: str) -> List[Dict[str, Any]]:
    """Parse Claude's JSON response into field objects."""
    try:
        # Claude may return markdown-wrapped JSON; extract it
        if response_text.startswith("```json"):
            response_text = response_text[7:]  # Remove ```json
        if response_text.startswith("```"):
            response_text = response_text[3:]  # Remove ```
        if response_text.endswith("```"):
            response_text = response_text[:-3]  # Remove trailing ```

        response_text = response_text.strip()
        fields = json.loads(response_text)

        if not isinstance(fields, list):
            fields = [fields]

        return fields
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Claude response: {e}\nResponse: {response_text[:500]}")
        return []


def validate_coded_value(
    field: Dict[str, Any], valid_values: Optional[str]
) -> Tuple[bool, Optional[str]]:
    """Validate a coded value against valid_values.

    Returns (is_valid, error_message).
    """
    if not valid_values:
        return True, None  # No validation for non-coded items

    try:
        valid_list = json.loads(valid_values)
        valid_codes = {v["code"] for v in valid_list}

        if field["value"] not in valid_codes:
            return False, f"Invalid code '{field['value']}' not in {valid_codes}"

        return True, None
    except Exception as e:
        return False, str(e)


def write_abstraction_results(
    spark: SparkSession,
    case_id: str,
    fields: List[Dict[str, Any]],
    abstraction_run_id: str,
    dict_lookup: Dict[int, Dict[str, Any]],
) -> int:
    """Write abstraction results to gold_form_ai_draft table.

    Returns count of rows written.
    """
    rows_to_insert = []

    for field in fields:
        naaccr_item_id = field.get("naaccr_item_id")

        # Look up dictionary entry
        dict_entry = dict_lookup.get(naaccr_item_id, {})
        item_name = dict_entry.get("item_name", "")
        valid_values = dict_entry.get("valid_values")

        # Validate coded values
        if field.get("field_status") != "unknown":
            is_valid, error_msg = validate_coded_value(field, valid_values)
            if not is_valid:
                logger.warning(
                    f"Case {case_id}, Item {naaccr_item_id}: {error_msg}"
                )
                # Continue anyway; let human review catch it

        # Build source_ref JSON
        source_ref = None
        if field.get("source_span"):
            source_ref = json.dumps({
                "doc_id": "embedded",
                "section": "clinical_context",
                "quote": field["source_span"][:200] if field["source_span"] else None
            })

        # Build row
        row = {
            "case_id": case_id,
            "naaccr_item_id": int(naaccr_item_id) if naaccr_item_id else None,
            "item_name": item_name,
            "value": field.get("value"),
            "confidence": float(field.get("confidence", 0.5)) if field.get("confidence") else None,
            "source_ref": source_ref,
            "field_status": field.get("field_status", "ai_suggested"),
            "abstraction_run_id": abstraction_run_id,
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }

        rows_to_insert.append(row)

    if not rows_to_insert:
        logger.warning(f"No fields to insert for case {case_id}")
        return 0

    try:
        logger.info(f"Writing {len(rows_to_insert)} fields for case {case_id}")

        # Convert to DataFrame, cast to the target table schema, and append.
        df = spark.createDataFrame(rows_to_insert)
        df = (df
              .withColumn("naaccr_item_id", col("naaccr_item_id").cast("int"))
              .withColumn("confidence", col("confidence").cast("decimal(4,3)"))
              .withColumn("generated_at", col("generated_at").cast("timestamp")))
        df.select("case_id", "naaccr_item_id", "item_name", "value", "confidence",
                  "source_ref", "field_status", "abstraction_run_id", "generated_at") \
          .write.format("delta").mode("append").saveAsTable(
            f"{CATALOG}.{GOLD_SCHEMA}.gold_form_ai_draft"
        )

        logger.info(f"Successfully wrote {len(rows_to_insert)} rows for case {case_id}")
        return len(rows_to_insert)
    except Exception as e:
        logger.error(f"Failed to write abstraction results: {e}")
        return 0


def abstract_case(
    spark: SparkSession,
    w: WorkspaceClient,
    case_id: str,
    case_row: Dict[str, Any],
    abstraction_run_id: str,
    dict_by_section: Dict[str, List[Dict[str, Any]]],
) -> int:
    """Orchestrate abstraction for a single case across all sections.

    Returns total fields written.
    """
    total_fields = 0
    base_prompt = load_abstraction_prompt()

    # Build case context dict for prompt templating
    case_context = {
        "patient_name": f"{case_row.get('first_name', '')} {case_row.get('last_name', '')}",
        "patient_mrn": case_row.get("patient_id", ""),
        "date_of_birth": str(case_row.get("date_of_birth", "")),
        "age_at_diagnosis": str(case_row.get("age_at_diagnosis", "")),
        "sex": case_row.get("sex", ""),
        "race": case_row.get("race", ""),
        "ethnicity": case_row.get("ethnicity", ""),
        "diagnosis_code": case_row.get("diagnosis_code", ""),
        "diagnosis_desc": case_row.get("diagnosis_desc", ""),
        "diagnosis_date": str(case_row.get("diagnosis_date", "")),
        "behavior": case_row.get("behavior", ""),
        "encounter_type": case_row.get("encounter_type", ""),
        "facility_name": case_row.get("facility_name", ""),
        "department": case_row.get("department", ""),
        "pathology_text": case_row.get("pathology_text", "")[:2000] if case_row.get("pathology_text") else "",
        "clinical_text": case_row.get("clinical_text", "")[:2000] if case_row.get("clinical_text") else "",
        "operative_text": case_row.get("operative_text", "")[:2000] if case_row.get("operative_text") else "",
        "radiology_text": case_row.get("radiology_text", "")[:2000] if case_row.get("radiology_text") else "",
        "discharge_text": case_row.get("discharge_text", "")[:2000] if case_row.get("discharge_text") else "",
        "lab_results_json": json.dumps(case_row.get("lab_results", []), default=str),
        "medications_json": json.dumps(case_row.get("medications", []), default=str),
    }

    # Process each section
    for section in SECTIONS:
        if section not in dict_by_section:
            logger.warning(f"No dictionary items for section {section}")
            continue

        dict_items = dict_by_section[section]
        logger.info(f"Abstracting section '{section}' ({len(dict_items)} items) for case {case_id}")

        # Build dictionary lookup for validation
        dict_lookup = {item["naaccr_item_id"]: item for item in dict_items}

        # Format dictionary for prompt
        dict_json = format_dictionary_for_prompt(dict_items)

        # Build section-specific prompt via safe replacement. The template contains
        # literal JSON braces (field-format examples), so str.format() cannot be used.
        replacements = dict(case_context)
        replacements["section_name"] = section
        replacements["dictionary_items_json"] = dict_json
        section_prompt = base_prompt
        for _k, _v in replacements.items():
            section_prompt = section_prompt.replace("{" + _k + "}", str(_v))

        # Call Claude
        logger.info(f"Calling Claude for section {section}")
        response = call_claude_abstraction(section_prompt, w)

        if not response:
            logger.error(f"No response from Claude for section {section}")
            continue

        # Parse response
        fields = parse_claude_response(response)
        logger.info(f"Parsed {len(fields)} fields from section {section}")

        # Write results
        written = write_abstraction_results(
            spark, case_id, fields, abstraction_run_id, dict_lookup
        )
        total_fields += written

    return total_fields


def main():
    """Main entry point."""
    logger.info("Starting NAACCR abstraction agent")

    # Parse args: key=value tokens are config (bundle-injected, static on the job);
    # bare tokens are case_ids (the app passes one case_id per triggered run via a
    # job parameter). Config precedence: arg > env var > module default above.
    import os
    global CATALOG, BRONZE_SCHEMA, SILVER_SCHEMA, GOLD_SCHEMA, ABSTRACTION_ENDPOINT
    cfg = dict(a.split("=", 1) for a in sys.argv[1:] if "=" in a)
    CATALOG = cfg.get("catalog", os.environ.get("REGISTRY_CATALOG", CATALOG))
    BRONZE_SCHEMA = cfg.get("bronze_schema", os.environ.get("REGISTRY_BRONZE_SCHEMA", BRONZE_SCHEMA))
    SILVER_SCHEMA = cfg.get("silver_schema", os.environ.get("REGISTRY_SILVER_SCHEMA", SILVER_SCHEMA))
    GOLD_SCHEMA = cfg.get("gold_schema", os.environ.get("REGISTRY_GOLD_SCHEMA", GOLD_SCHEMA))
    ABSTRACTION_ENDPOINT = cfg.get(
        "abstraction_endpoint", os.environ.get("ABSTRACTION_ENDPOINT", ABSTRACTION_ENDPOINT)
    )
    logger.info(f"Config: catalog={CATALOG} gold={GOLD_SCHEMA} silver={SILVER_SCHEMA} endpoint={ABSTRACTION_ENDPOINT}")
    case_ids_arg = [c for tok in sys.argv[1:] if "=" not in tok for c in tok.split()]

    # Initialize Spark
    spark = get_spark()
    logger.info(f"Spark session started")

    # Initialize workspace client
    try:
        w = WorkspaceClient()  # ambient auth inside the serverless job (no profile file exists)
        logger.info(f"Connected to workspace: {w.config.host}")
    except Exception as e:
        logger.error(f"Failed to connect to workspace: {e}")
        sys.exit(1)

    # If no case IDs provided, get default 5 'likely_reportable' cases
    if not case_ids_arg:
        logger.info("No case IDs provided; loading 5 'likely_reportable' cases for demo")
        case_ids = get_case_ids_spark(spark, limit=5)
        if not case_ids:
            logger.error("No 'likely_reportable' cases found in gold_flagged")
            sys.exit(1)
    else:
        case_ids = case_ids_arg
        logger.info(f"Processing {len(case_ids)} specified cases")

    logger.info(f"Will process {len(case_ids)} cases: {case_ids[:5]}")

    # Load NAACCR dictionary once for all cases
    logger.info("Loading NAACCR dictionary")
    dict_by_section = load_naaccr_dictionary_spark(spark)
    if not dict_by_section:
        logger.error("Failed to load NAACCR dictionary")
        sys.exit(1)

    # Generate abstraction run ID
    abstraction_run_id = str(uuid.uuid4())
    logger.info(f"Abstraction run ID: {abstraction_run_id}")

    # Delete existing rows for these cases (idempotent)
    try:
        case_ids_str = ",".join([f"'{cid}'" for cid in case_ids])
        spark.sql(f"""
            DELETE FROM {CATALOG}.{GOLD_SCHEMA}.gold_form_ai_draft
            WHERE case_id IN ({case_ids_str})
        """)
        logger.info(f"Cleared existing abstraction for {len(case_ids)} cases")
    except Exception as e:
        logger.warning(f"Could not clear existing abstraction: {e}")

    # Process each case
    total_fields = 0
    for idx, case_id in enumerate(case_ids, 1):
        logger.info(f"[{idx}/{len(case_ids)}] Processing case: {case_id}")

        try:
            # Load case context from silver_case_context
            query = f"""
            SELECT
                patient_id, first_name, last_name, date_of_birth, age_at_diagnosis,
                sex, race, ethnicity, diagnosis_code, diagnosis_desc, diagnosis_date,
                behavior, encounter_type, facility_name, department,
                pathology_text, clinical_text, operative_text, radiology_text, discharge_text,
                lab_results, medications
            FROM {CATALOG}.{SILVER_SCHEMA}.silver_case_context
            WHERE case_id = '{case_id}'
            LIMIT 1
            """

            result = spark.sql(query).collect()
            if not result:
                logger.warning(f"Case {case_id} not found in silver_case_context")
                continue

            case_row = result[0].asDict(recursive=True)  # nested lab/med structs -> dicts
            logger.info(f"Case {case_id}: Found clinical context")

            fields_written = abstract_case(
                spark, w, case_id, case_row, abstraction_run_id, dict_by_section
            )
            total_fields += fields_written
            logger.info(f"Case {case_id}: {fields_written} fields written")

        except Exception as e:
            logger.error(f"Error processing case {case_id}: {e}", exc_info=True)
            continue

    logger.info(f"=========================================")
    logger.info(f"Abstraction complete.")
    logger.info(f"  Run ID: {abstraction_run_id}")
    logger.info(f"  Cases: {len(case_ids)}")
    logger.info(f"  Total fields: {total_fields}")
    logger.info(f"=========================================")


if __name__ == "__main__":
    main()
