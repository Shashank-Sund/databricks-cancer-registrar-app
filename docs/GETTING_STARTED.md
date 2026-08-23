# Getting started (step by step)

This walks you through getting the app fully running in your own Databricks workspace,
from zero. It works on AWS and Azure. Everything is serverless. Do the steps in order.

Every command has been run and verified on a live workspace.

---

## 0. What you need first

1. The **Databricks CLI** installed and logged in to your workspace:
   ```
   databricks auth login --host https://YOUR-WORKSPACE-URL
   ```
   (AWS URLs end in `.cloud.databricks.com`, Azure URLs end in `.azuredatabricks.net`.)
2. A **serverless SQL warehouse**. Copy its **ID** (Databricks -> SQL Warehouses -> your
   warehouse -> the ID shown in the page/URL).
3. Permission to create a Unity Catalog catalog (or the name of one you can use) and a
   Lakebase project.

---

## 1. Point the bundle at your workspace

Open `databricks.yml` and set three things (or pass each with `--var` on every command):

- `targets.dev.workspace.host` -> your workspace URL.
- variable `catalog` -> your catalog name.
- variable `warehouse_id` -> the SQL warehouse ID from step 0.

---

## 2. Deploy everything (jobs + pipeline + app)

```
databricks bundle deploy -t dev
```

If you get a Terraform error `openpgp: key expired`, install Terraform once
(`brew install terraform`) and re-run with:

```
DATABRICKS_TF_EXEC_PATH=$(which terraform) DATABRICKS_TF_VERSION=$(terraform version | head -1 | sed 's/Terraform v//') databricks bundle deploy -t dev
```

This creates the 5 jobs, the silver pipeline, and the app. It does NOT start the app yet.

---

## 3. Start the app and copy its ID

```
databricks bundle run registrar_app -t dev
```

Then open the app's page (Databricks -> Compute -> Apps -> **cancer-registrar-app**) and
copy the **Service principal client id** shown there. You need it in step 5. (First start
takes a couple of minutes. The app will say "unavailable" until steps 5 and 6 are done.)

---

## 4. Load data - PICK ONE path

**Path A - Sample data (fastest, no AI cost).** Loads a ready-made 200-patient dataset:
```
databricks bundle run load_sample_data -t dev
```

**Path B - Full pipeline (generate + classify with AI).** Run these in order:
```
databricks bundle run setup -t dev
databricks bundle run synthetic_data -t dev
databricks bundle run silver -t dev
databricks bundle run classifier -t dev
```

> Use ONE path, not both. They write the same tables, so mixing them causes a
> "MANAGED table already exists" error. To switch later, drop the `cancer_bronze` /
> `cancer_silver` / `cancer_gold` schemas (or deploy into a fresh catalog) and start over.

---

## 5. Give the app its own Lakebase database

Run this once, pasting the Service principal client id from step 3:

```
databricks bundle run provision_lakebase -t dev --params app_sp=PASTE_SP_CLIENT_ID
```

This creates the app's Lakebase project, turns on the auth extension, grants the app
access (Unity Catalog + Postgres), and sets up the synced tables and change capture. It is
safe to re-run. If it reports a transient "Python process exited unexpectedly", it retries
automatically and succeeds - it is idempotent, so you can also just run it again.

---

## 6. Restart the app so it builds its tables

```
databricks bundle run registrar_app -t dev
```

Re-running this redeploys and restarts the app in one step (more reliable than
`apps stop`/`apps start`, which can leave it in a failed state). A fresh app process
then creates its 4 Postgres tables (`case_decisions`, `draft_case`, `working_draft`,
`finalized_forms`) automatically on first open, now that it has Lakebase access.

Optional: the app-write **audit CDF** (Postgres -> Delta capture of decisions/finalized
forms) can only be set up after those tables exist. Once the app has been opened once,
re-run step 5 to finish it: `databricks bundle run provision_lakebase -t dev --params
app_sp=<id>`. Everything else (the app, the queue, drafts) works without this.

---

## 7. Open the app

Open the app URL from its page. To confirm it is healthy, its `/api/health` endpoint
should show `"store":"lakebase"`. You should see the case queue populated.

---

## What is automated vs. what you do by hand

| Automated by the bundle | You do by hand |
|---|---|
| The 5 jobs, the silver pipeline, and the app (`bundle deploy`) | Set host + catalog + warehouse (step 1) |
| Creating the Lakebase project, extension, grants, synced tables, CDF (the `provision_lakebase` job) | Pick a data path and run it (step 4) |
| The app creating its own 4 Postgres tables (on first open) | Paste the app SP id once (step 5) |
| | Restart the app once (step 6) |

## If the app's Postgres tables ever do not appear

They are created automatically in step 7 once step 5 has run. If you ever need to create
them by hand, the exact DDL is in `contracts/lakebase_schema.sql` - run it against the
Lakebase database (schema = your `lakebase_app_schema`) with any Postgres client.

## Notes

- Serverless only.
- AWS vs Azure differences (host URL, Lakebase region, model endpoint names):
  see [CLOUD_NOTES.md](CLOUD_NOTES.md).
- Deeper reference and troubleshooting: see [DEPLOYMENT.md](DEPLOYMENT.md).
