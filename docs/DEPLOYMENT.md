# Deployment guide

This walks through deploying the cancer-registrar app into your own workspace on AWS or
Azure Databricks. Everything is serverless.

## Prerequisites

1. **Databricks CLI** (v0.230+) authenticated to your workspace:
   `databricks auth login --host https://<your-workspace>`.
2. A **serverless SQL warehouse** (the app reads reference data through it). Note its id.
3. **Serving endpoints** available in your region:
   - a batch-inference-capable model for the classifier (default
     `databricks-meta-llama-3-3-70b-instruct`), and
   - a model for the abstraction agent (default `databricks-claude-opus-5`).
   Swap the `classifier_endpoint` / `abstraction_endpoint` variables if those names differ
   in your cloud/region (see [CLOUD_NOTES.md](CLOUD_NOTES.md)).
4. Permission to create a **Lakebase (Autoscaling)** project, or an existing one.
5. Unity Catalog privileges to create the target catalog/schemas (or use an existing catalog).

## 1. Configure the bundle

Edit `databricks.yml` (or pass `--var key=value` on each command):

- `targets.dev.workspace.host` -> your workspace URL
  (AWS `https://<name>.cloud.databricks.com`, Azure `https://<name>.azuredatabricks.net`).
- `catalog` -> your Unity Catalog catalog (default `cancer_registry_demo`).
- `warehouse_id` -> your serverless SQL warehouse id (no valid default; you must set this).
- `lakebase_project`, `lakebase_endpoint`, `lakebase_app_schema` -> match the Lakebase
  project you will provision (defaults assume a project named `cancer-registry`).
- `classifier_endpoint`, `abstraction_endpoint` -> in-region serving endpoints.

Validate:

```bash
databricks bundle validate -t dev
```

## 2. Deploy the bundle (jobs + pipeline + app)

```bash
databricks bundle deploy -t dev
```

This creates the jobs (`setup`, `synthetic_data`, `classifier`, `abstraction`,
`load_sample_data`), the `silver` Lakeflow SDP pipeline, and the Databricks App
(`resources/app.yml`). The app is bound to your SQL warehouse and to the abstraction job,
and its environment variables are injected from the bundle variables. No values are baked
into the app source.

## 3. Load data

### Path A: Instant sandbox

```bash
databricks bundle run load_sample_data -t dev
```

Loads all 15 shipped tables (Bronze, `silver_case_context`, and the four gold tables) so
the queue, the form, the AI drafts, and the code lookups are all populated. No pipeline
run and no model spend.

### Path B: Full pipeline

```bash
databricks bundle run setup -t dev          # schemas, tables, dictionary, code lookup
databricks bundle run synthetic_data -t dev # ~200 synthetic patients -> Bronze
databricks bundle run silver -t dev         # Lakeflow SDP: Bronze -> Silver
databricks bundle run classifier -t dev     # ai_query -> gold_flagged
```

The abstraction job runs per case: it is triggered automatically when a registrar triages
a case as reportable. To pre-populate a few AI drafts, run it manually with no case id:
`databricks bundle run abstraction -t dev`.

## 4. Provision Lakebase (once)

Lakebase Autoscaling projects, Delta->Lakebase synced tables, and Lakebase CDF are not
bundle resources yet, so run the setup script once (as the Lakebase project owner / a
workspace admin). Order matters:

1. Deploy the bundle (step 2) and load data (step 3) so the gold sources exist.
2. Open the deployed app once so its service principal creates its schema + native tables.
3. Then run:

```bash
python setup/provision_lakebase.py \
  --create-project \                       # omit if the project already exists
  --project cancer-registry --branch production \
  --catalog <your_catalog> --gold-schema cancer_gold \
  --app-sp <app_service_principal_client_id> \   # shown on the app's page after deploy
  --app-schema cancer_registry_app
```

The script prints the resolved endpoint and host. If the endpoint path differs from the
`lakebase_endpoint` variable, update that variable and re-run `databricks bundle deploy`.

Flags: `--skip-synced` (skip the read-only showcase synced tables) and `--skip-cdf` (skip
the Postgres->Delta capture) if you want a minimal setup.

## 5. Open the app

The app URL is on its page in the workspace. Verify health:

```
GET /api/health   ->  { "store": "lakebase", "store_available": true, ... }
```

If `store` is `memory`, the app could not reach Lakebase (usually the SP grant in step 4
has not run yet, or the endpoint variable is wrong). The UI still works against the
in-memory store while you fix it.

## Rebuilding the client (optional)

The prebuilt React client is committed at `app/server/static`, so you can deploy without
Node. To rebuild after UI changes:

```bash
cd app/client && npm ci && npm run build   # writes to ../server/static
```

## Troubleshooting

- **Serverless only.** These jobs use serverless compute (no instance types). If your
  workspace lacks serverless, enable it.
- **`ai_query` fails on the classifier.** The endpoint must support batch inference.
  Claude endpoints do not in all workspaces; use a Llama or other batch-capable model.
- **Abstraction returns few fields for a case.** The model omits items with no source
  evidence; this is expected. Registrars fill the rest (fill-unknown handles required
  blanks).
- **Synced tables / CDF errors are non-fatal.** `provision_lakebase.py` logs and continues
  per phase; re-running is idempotent.
- **Everything is idempotent.** Re-run any job or the setup script safely.
