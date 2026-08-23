/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_API_TARGET?: string;
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_BRAND_SUBTITLE?: string;
  readonly VITE_BRAND_PRODUCT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
