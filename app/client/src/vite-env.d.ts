/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_API_TARGET?: string;
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_BRAND_SUBTITLE?: string;
  readonly VITE_BRAND_PRODUCT?: string;
  /** Static demo build only (.env.demo). */
  readonly VITE_DEMO_BANNER?: string;
  readonly VITE_REPO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
