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
and its environment variables are injected from the bundle variables via the app's
`config` block. There is deliberately no `app.yaml` in `app/server` (a source `app.yaml`
would override and blank that config).

`bundle deploy` only registers the app; it does not start it. Start (and deploy the code
to) the app compute:

```bash
databricks bundle run registrar_app -t dev
```

First start takes a couple of minutes. Note the app's **service principal client id** from
its page in the workspace (App resources / details): you need it in step 4.

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
workspace admin). It grants the app service principal its Unity Catalog privileges
(USE CATALOG + USE SCHEMA + SELECT, run as SQL through the warehouse) and its Lakebase
CONNECT/CREATE, so the app can read the gold tables and create its own OLTP schema.

Run it as the provided serverless job, passing the app SP id (from the app page) as a
run parameter:

```bash
databricks bundle run provision_lakebase -t dev --params app_sp=<app_service_principal_client_id>
```

This is fully headless and idempotent. It reads the project/catalog/schema from your
bundle variables and, on a brand-new Autoscaling project, even installs the
`databricks_auth` extension so the SP role can be created without any Apps UI step. It
grants the app SP its Unity Catalog privileges (SELECT via the warehouse) and Lakebase
CONNECT/CREATE, then creates the Delta->Lakebase synced tables and the Lakebase CDF.
Running as a job means it works from anywhere (no local Postgres network needed) and
retries once past the Lakebase cold-start blip.

Because the app cached the in-memory store on first boot (before it had Lakebase access),
restart it once after this so it re-attempts Lakebase and creates its schema + tables.
Re-run the app deployment (more reliable than `apps stop`/`apps start`):

```bash
databricks bundle run registrar_app -t dev
```

The app-write audit CDF (`cancer_app_cdf`) can only be created once the app has made its
schema, so run `provision_lakebase` once more after this to finish it (optional; the app
works without it).

The job prints the resolved endpoint and host. If the endpoint path differs from the
`lakebase_endpoint` variable, update that variable and re-run `databricks bundle deploy`.
To run it directly instead of as a job (from a machine that can reach the Lakebase port),
`setup/provision_lakebase.py` takes the same options as flags (`--app-sp`, `--warehouse-id`,
`--skip-synced`, `--skip-cdf`).

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

- **`bundle deploy` fails with `error downloading Terraform: ... openpgp: key expired`.**
  The CLI downloads Terraform and verifies a HashiCorp GPG signature that can be expired in
  some environments. Install Terraform locally and point the CLI at it:
  `DATABRICKS_TF_EXEC_PATH=$(which terraform) DATABRICKS_TF_VERSION=$(terraform version | head -1 | sed 's/Terraform v//') databricks bundle deploy -t dev`.
- **App shows "currently unavailable" right after `bundle deploy`.** `bundle deploy` only
  registers the app and uploads its source; its compute stays stopped. Start and deploy it
  with `databricks bundle run registrar_app -t dev` (see step 5). First start takes a couple
  of minutes.
- **Queue shows "Failed to load ... Internal S... is not valid JSON".** The app's request
  to the SQL warehouse 500'd, almost always because the app service principal lacks UC
  `SELECT` on your catalog/schemas. Run step 4's `provision_lakebase.py` with
  `--warehouse-id` and `--app-sp`, or grant it directly:
  `GRANT USE CATALOG ON CATALOG <cat> TO \`<app_sp>\``, then `GRANT USE SCHEMA, SELECT ON
  SCHEMA <cat>.<gold_schema> TO \`<app_sp>\`` (and the silver schema).
- **App store stays `memory` after provisioning.** Confirm you ran
  `bundle run provision_lakebase --params app_sp=<id>` AND then re-ran
  `bundle run registrar_app` to restart the app. The app caches its store on first boot,
  so it must restart once after the SP is granted. `/api/health` should then show
  `"store":"lakebase"`. (The
  provision job installs the `databricks_auth` extension on a brand-new Autoscaling project
  automatically, so no Apps UI database-binding step is required.)
- **"MANAGED table already exists" when running the silver pipeline.** You loaded the
  sample data AND then tried the full pipeline; the two paths write the same tables. Pick
  ONE. To switch, drop the `cancer_bronze` / `cancer_silver` / `cancer_gold` schemas (or
  deploy into a fresh catalog) and re-run.
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
