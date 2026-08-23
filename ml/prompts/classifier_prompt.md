# Reportability Classifier Prompt (casefinding gate)

Purpose: given a candidate case's diagnosis + assembled pathology report, score whether it
is **reportable to a hospital cancer registry**. Output feeds `gold_flagged`, which is
served to the registrar triage queue. A human makes the final yes/no; this only prioritizes.

Runtime: `ai_query(<classifier_endpoint>, <prompt>)` batch inference over `silver_case_context`.
Model is config-driven (`classifier_endpoint` bundle variable). NOTE: in the demo workspace the
Claude endpoints do NOT support `ai_query` batch inference, so the default is a batch-capable
foundation model (`databricks-meta-llama-3-3-70b-instruct`). Swap freely per workspace.

## Prompt template

```
You are a certified cancer registry reportability classifier for a US hospital cancer registry.
Using the diagnosis and pathology report, decide whether this case is reportable to the hospital cancer registry.
Reportable = a primary BREAST cancer that is malignant or in situ (invasive ductal/lobular carcinoma, DCIS).
Not reportable = benign breast lesions (fibroadenoma, fibrocystic changes) and cutaneous basal/squamous skin cancers of breast skin.
Atypical/uncertain lesions (atypical ductal hyperplasia) = uncertain, flag for registrar review.
Respond with ONLY a compact minified JSON object, no other text, no markdown:
{"reportability_label":"likely_reportable|uncertain|not_reportable","reportability_score":<0.0-1.0 probability reportable>,"rationale":"<one sentence>","key_codes":["<codes or terms>"]}
DIAGNOSIS: {diagnosis_code} - {diagnosis_desc}
PATHOLOGY REPORT:
{pathology_text}
```

## Output schema (parsed via from_json)
`struct<reportability_label:string, reportability_score:double, rationale:string, key_codes:array<string>>`

## Validated behavior (200-case synthetic breast cohort)
- /3 breast malignant → likely_reportable (82/82)
- /2 in-situ DCIS → likely_reportable (26/26)
- /1 ADH → uncertain (35/35)
- /0 benign → not_reportable (49/49)
- C44 cutaneous BCC (malignant but skin) → not_reportable (8/8)  ← key nuance: malignant != reportable

## Tuning notes for customers
- Add state-specific reportable-by-agreement terms and site rules to the "Reportable/Not reportable" lines.
- Keep `temperature` low; the JSON contract + `from_json` parse is the reliability mechanism.
- The registrar triage gate is authoritative; this score only orders the queue.
