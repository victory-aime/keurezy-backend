import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationsRegistry } from './integrations-registry.service';
import { EncryptionService } from './encryption.service';
import { OAuthStateService } from './oauth-state.service';
import { TokenSet } from '../interfaces/token-set.interface';
import { PrismaService } from '_root/database/prisma.service';
import { IntegrationProviderType } from '../../../../prisma/generated/enums';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly registry: IntegrationsRegistry,
    private readonly encryption: EncryptionService,
    private readonly stateService: OAuthStateService,
    private readonly prisma: PrismaService,
  ) {}

  /** Étape 1 : génère l'URL de consentement, appelée via fetch authentifié */
  getConnectUrl(userId: string, provider: IntegrationProviderType): string {
    const strategy = this.registry.get(provider);
    const state = this.stateService.sign({ userId, provider });
    return strategy.getAuthUrl(state);
  }

  /** Étape 2 : callback providers → échange le code, stocke les tokens, redirige vers le front */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ userId: string; frontRedirectUrl: string }> {
    const { userId, provider } = this.stateService.verify(state);
    const strategy = this.registry.get(provider);
    const tokens = await strategy.exchangeCode(code);

    await this.saveTokens(userId, provider, tokens);

    return {
      userId,
      frontRedirectUrl: `${process.env.FRONTEND_INTEGRATIONS_URL}?connected=${provider}`,
    };
  }

  private async saveTokens(userId: string, provider: IntegrationProviderType, tokens: TokenSet) {
    const existing = await this.prisma.integrationProvider.findUnique({
      where: { provider_userId: { provider: provider, userId } },
    });

    const data = {
      userId,
      provider,
      accessToken: this.encryption.encrypt(tokens.accessToken!),
      refreshToken: tokens.refreshToken
        ? this.encryption.encrypt(tokens.refreshToken)
        : existing?.refreshToken, // Google ne renvoie pas toujours un nouveau refresh_token
      expiryDate: tokens.expiryDate,
      scope: tokens.scope,
    };

    if (existing) {
      await this.prisma.integrationProvider.update({
        where: { provider_userId: { provider: provider, userId } },
        data: data,
      });
    } else {
      await this.prisma.integrationProvider.create({
        data: data,
      });
    }
  }

  async getStatus(
    userId: string,
    provider: IntegrationProviderType,
  ): Promise<{ connected: boolean }> {
    const integration = await this.prisma.integrationProvider.findUnique({
      where: { provider_userId: { provider: provider, userId } },
    });
    return { connected: !!integration };
  }

  async disconnect(userId: string, provider: IntegrationProviderType): Promise<void> {
    await this.prisma.integrationProvider.delete({
      where: { provider_userId: { provider: provider, userId } },
    });
  }

  private async getValidTokens(
    userId: string,
    provider: IntegrationProviderType,
  ): Promise<TokenSet> {
    const integ = await this.prisma.integrationProvider.findUnique({
      where: { provider_userId: { provider: provider, userId } },
    });
    if (!integ) throw new NotFoundException(`${provider} non connecté pour cet utilisateur`);

    let tokens: TokenSet = {
      accessToken: this.encryption.decrypt(integ.accessToken),
      refreshToken: integ.refreshToken ? this.encryption.decrypt(integ.refreshToken) : null,
      expiryDate: integ.expiryDate?.toNumber() ?? 0,
      scope: integ.scope!,
    };

    const isExpired = tokens.expiryDate && Date.now() >= tokens.expiryDate - 60_000; // marge 1min
    if (isExpired && tokens.refreshToken) {
      const strategy = this.registry.get(provider);
      tokens = await strategy.refreshTokens(tokens);
      await this.saveTokens(userId, provider, tokens);
    }

    return tokens;
  }

  async uploadFile(userId: string, provider: IntegrationProviderType, file: Express.Multer.File) {
    const strategy = this.registry.get(provider);
    const tokens = await this.getValidTokens(userId, provider);
    return strategy.uploadFile(tokens, file);
  }

  async listFiles(userId: string, provider: IntegrationProviderType) {
    const strategy = this.registry.get(provider);
    const tokens = await this.getValidTokens(userId, provider);
    return strategy.listFiles(tokens);
  }

  async listTrashedFiles(userId: string, provider: IntegrationProviderType) {
    const strategy = this.registry.get(provider);
    const tokens = await this.getValidTokens(userId, provider);
    return strategy.listTrashedFiles(tokens);
  }

  async trashFile(userId: string, provider: IntegrationProviderType, fileId: string) {
    const strategy = this.registry.get(provider);
    const tokens = await this.getValidTokens(userId, provider);
    return strategy.trashFile(tokens, fileId);
  }

  async deleteFilePermanently(userId: string, provider: IntegrationProviderType, fileId: string) {
    const strategy = this.registry.get(provider);
    const tokens = await this.getValidTokens(userId, provider);
    return strategy.deleteFilePermanently(tokens, fileId);
  }
}
