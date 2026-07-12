import { INTEGRATION_PROVIDER } from '_root/config/enum';

export interface IntegrationProviderService {
  provider: INTEGRATION_PROVIDER;

  getAuthorizationUrl(userId: string): Promise<string>;

  handleCallback(code: string, state: string): Promise<void>;

  disconnect(userId: string): Promise<void>;

  refreshAccessToken(userId: string): Promise<string>;
}
