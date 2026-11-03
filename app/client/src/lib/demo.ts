/**
 * Build-time flags for the public, backend-less demo (`npm run build:demo`, which
 * loads .env.demo). In the default Databricks build these env vars are unset,
 * so the flags fold to constants and the demo-only code is removed entirely.
 */
export const IS_STATIC_DEMO = import.meta.env.VITE_DEMO_BANNER === 'true';

export const DEMO_REPO_URL = import.meta.env.VITE_REPO_URL || '';
