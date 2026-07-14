import { Injectable } from '@nestjs/common';
import { ListedFileResult, UploadResult } from '../interfaces/cloud-provider-strategy.interface';
import { TokenSet } from '../interfaces/token-set.interface';
import { IntegrationProviderType } from 'prisma/generated/enums';

@Injectable()
export class DropboxStrategy {
  readonly key = IntegrationProviderType.DROPBOX;

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      // client_id: process.env.DROPBOX_CLIENT_ID,
      // redirect_uri: process.env.DROPBOX_REDIRECT_URI,
      // response_type: 'code',
      // token_access_type: 'offline',
      // scope: 'files.content.write files.content.read', // scope fichiers uniquement
      // state,
    });
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    // POST https://api.dropboxapi.com/oauth2/token avec code + client_id/secret
    throw new Error('À implémenter');
  }

  async refreshTokens(tokens: TokenSet): Promise<TokenSet> {
    throw new Error('À implémenter');
  }

  async uploadFile(tokens: TokenSet, file: Express.Multer.File): Promise<UploadResult> {
    throw new Error('À implémenter');
  }

  async listFiles(tokens: TokenSet): Promise<ListedFileResult[]> {
    throw new Error('À implémenter');
  }
}
