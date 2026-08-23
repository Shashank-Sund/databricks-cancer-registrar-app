/**
 * Swappable API client selector.
 *
 * The app builds against the MOCK by default so it runs standalone. To integrate
 * with the real FastAPI backend, set VITE_USE_MOCK=false (or provide a runtime
 * window flag). Nothing else in the app references a specific implementation.
 */
import type { ApiClient } from './types';
import { mockClient } from './mock/mockClient';
import { httpClient } from './httpClient';

function resolveUseMock(): boolean {
  // Runtime override (e.g. injected by the server) wins.
  const runtime = (globalThis as { __USE_MOCK__?: boolean }).__USE_MOCK__;
  if (typeof runtime === 'boolean') return runtime;

  const env = import.meta.env.VITE_USE_MOCK;
  // Default: mock ON unless explicitly disabled.
  return env === undefined ? true : env !== 'false';
}

export const USE_MOCK = resolveUseMock();

export const api: ApiClient = USE_MOCK ? mockClient : httpClient;
