/**
 * Config-driven branding. Nothing here is a workspace URL, token, or ID.
 * Override at build time via Vite env vars (VITE_BRAND_NAME, VITE_BRAND_SUBTITLE)
 * so a customer can rebrand without touching component code.
 */
export const branding = {
  name: import.meta.env.VITE_BRAND_NAME || 'Cancer Registry',
  subtitle: import.meta.env.VITE_BRAND_SUBTITLE || 'Reportability & Abstraction',
  product: import.meta.env.VITE_BRAND_PRODUCT || 'Registrar Review',
};
