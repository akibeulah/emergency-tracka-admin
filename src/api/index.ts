import { config } from '../config';
import type { ApiClient, ApiModule } from './client';
import { createLiveApi } from './live';
import { createMockApi } from './mock/mockApi';
import { sessionStore } from './session';

function build(): ApiClient {
  if (config.apiMode === 'mock') return createMockApi(sessionStore);
  const live = createLiveApi(sessionStore);
  if (config.mockModules.size === 0) return live;
  // Live, with the modules the server does not serve yet answered by the mock.
  const mock = createMockApi(sessionStore);
  const mixed = { ...live };
  for (const m of config.mockModules) {
    if (m in mock && m !== 'demo') (mixed as Record<ApiModule, unknown>)[m as ApiModule] = mock[m as ApiModule];
  }
  // A mocked module brings the mock's capabilities with it; its pages label the data as examples.
  mixed.capabilities = {
    decidedClaims: live.capabilities.decidedClaims || config.mockModules.has('claims'),
    suspendedInDirectory: live.capabilities.suspendedInDirectory || config.mockModules.has('facilities'),
    alertStatus: live.capabilities.alertStatus || config.mockModules.has('alerts'),
  };
  return mixed;
}

export const api: ApiClient = build();
