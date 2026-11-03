import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke test for the public demo build (`npm run build:demo`).
// Without BASE_URL, Playwright serves dist-demo locally with `vite preview`.
// Set BASE_URL to test a deployed copy, for example the CloudFront URL.
// PW_CHANNEL=chrome uses the installed Google Chrome instead of the bundled
// browser (useful where Playwright cannot download its own build).
const PORT = 4183;
const baseURL = process.env.BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1280, height: 800 },
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx vite preview --outDir dist-demo --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
      },
});
