// Build-time flags. Vite inlines VITE_* variables; set them in admin-client/.env.

export type ApiMode = 'mock' | 'live';

const env = import.meta.env;

export const config = {
  appId: 'admin',
  // 'mock' runs entirely in the browser against example data. 'live' talks to server/.
  apiMode: (env.VITE_API_MODE === 'live' ? 'live' : 'mock') as ApiMode,
  apiUrl: (env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api',
  // In live mode, modules the server does not serve yet can stay on the mock,
  // e.g. VITE_MOCK_MODULES=alerts. Ignored in mock mode.
  mockModules: new Set(
    String(env.VITE_MOCK_MODULES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
};

/** True when this module's data comes from the in-browser mock (example data), not server/. */
export function isMocked(module: 'auth' | 'claims' | 'facilities' | 'alerts'): boolean {
  return config.apiMode === 'mock' || config.mockModules.has(module);
}
