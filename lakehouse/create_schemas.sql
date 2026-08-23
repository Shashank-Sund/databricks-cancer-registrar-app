-- Create the medallion schemas in the target catalog (idempotent).
-- Run via run_sql.py with catalog / bronze_schema / silver_schema / gold_schema vars.
CREATE SCHEMA IF NOT EXISTS ${catalog}.${bronze_schema};
CREATE SCHEMA IF NOT EXISTS ${catalog}.${silver_schema};
CREATE SCHEMA IF NOT EXISTS ${catalog}.${gold_schema};
