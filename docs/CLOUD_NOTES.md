# AWS vs Azure Databricks

This app is serverless and Unity Catalog native, so the deployment is almost identical on
both clouds. This page lists the few things that differ or need checking.

## What does NOT change

- **App code and resource definitions.** The FastAPI/React app, the DABs jobs, the silver
  pipeline, and `resources/app.yml` are identical on both clouds.
- **No cloud-specific compute.** Everything runs on serverless, so there are no instance
  types, node families, or cluster settings to change.
- **Unity Catalog, DABs, and Databricks Apps** behave the same.
- **The Lakebase Postgres host.** The host domain differs by cloud, but the app resolves it
  at runtime from the endpoint name (`w.postgres.get_endpoint(...)`), so there is nothing
  to edit. `sslmode=require` works on both.

## What DOES change or needs checking

1. **Workspace host URL** (set in `databricks.yml` `targets.<t>.workspace.host`):
   - AWS: `https://<name>.cloud.databricks.com`
   - Azure: `https://<name>.azuredatabricks.net`

2. **Lakebase (Autoscaling) region availability.** Provision the project in a supported
   region:
   - AWS: `us-east-1`, `us-east-2`, `eu-central-1`, `eu-west-1`, `eu-west-2`, `ap-south-1`,
     `ap-southeast-1`, `ap-southeast-2`.
   - Azure (Beta): `eastus2`, `westeurope`, `westus`.

3. **Serving endpoint names / availability.** Foundation Model and Claude endpoint names
   and regional availability vary by cloud. Set these bundle variables to models offered in
   your region:
   - `classifier_endpoint` (must support `ai_query` batch inference; default
     `databricks-meta-llama-3-3-70b-instruct`).
   - `abstraction_endpoint` (per-request; default `databricks-claude-opus-5`).
   If a default is not available in your region, pick an available equivalent. The app
   never calls a model directly (it only triggers the abstraction job by id), so only the
   jobs care about endpoint names.

4. **`ai_query` batch model support** can vary by region; confirm your chosen
   `classifier_endpoint` supports batch inference before running the classifier job.

## Azure pre-flight checklist

- [ ] Workspace host set to the `*.azuredatabricks.net` URL in `databricks.yml`.
- [ ] Serverless enabled; a serverless SQL warehouse exists (`warehouse_id` set).
- [ ] Lakebase project created in `eastus2`, `westeurope`, or `westus`
      (`lakebase_project` / `lakebase_endpoint` set to match).
- [ ] `classifier_endpoint` set to a batch-capable model available in the region.
- [ ] `abstraction_endpoint` set to an available model in the region.
- [ ] `databricks bundle validate -t <target>` passes, then `deploy`.
