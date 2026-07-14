import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { Readable } from 'stream';
import {
  CloudProviderStrategy,
  ListedFileResult,
  UploadResult,
} from '../interfaces/cloud-provider-strategy.interface';
import { TokenSet } from '../interfaces/token-set.interface';
import { IntegrationProviderType } from '../../../../prisma/generated/enums';

@Injectable()
export class GoogleDriveStrategy implements CloudProviderStrategy {
  readonly key = IntegrationProviderType.GOOGLE_DRIVE;

  private createClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_DRIVE_REDIRECT_URI, // http://localhost:4000/api/v1/integrations/google/drive/callback
    );
  }

  getAuthUrl(state: string): string {
    const client = this.createClient();
    return client.generateAuthUrl({
      access_type: 'offline', // requis pour obtenir un refresh_token
      prompt: 'consent', // force le renvoi du refresh_token à chaque connexion
      scope: ['https://www.googleapis.com/auth/drive.file'], // fichiers uniquement, pas tout le Drive
      state,
    });
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    const client = this.createClient();
    const { tokens } = await client.getToken(code);
    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiryDate: tokens.expiry_date!,
      scope: tokens.scope!,
    };
  }

  async refreshTokens(tokens: TokenSet): Promise<TokenSet> {
    const client = this.createClient();
    client.setCredentials({ refresh_token: tokens.refreshToken });
    const { credentials } = await client.refreshAccessToken();
    return {
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token ?? tokens.refreshToken,
      expiryDate: credentials.expiry_date!,
      scope: credentials.scope,
    };
  }

  async uploadFile(tokens: TokenSet, file: Express.Multer.File): Promise<UploadResult> {
    const client = this.createClient();
    client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });

    const drive = google.drive({ version: 'v3', auth: client });
    const res = await drive.files.create({
      requestBody: { name: file.originalname },
      media: { mimeType: file.mimetype, body: Readable.from(file.buffer) },
      fields: 'id, name, webViewLink',
    });

    return {
      fileId: res.data.id!,
      name: res.data.name!,
      webViewLink: res.data.webViewLink!,
    };
  }

  async listFiles(tokens: TokenSet): Promise<ListedFileResult[]> {
    const auth = this.createClient();
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: 'trashed = false',
      fields: 'files(id, name, webViewLink, mimeType, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      spaces: 'drive',
    });

    return (res.data.files ?? []).map((f) => ({
      fileId: f.id!,
      name: f.name!,
      webViewLink: f.webViewLink!,
      mimeType: f.mimeType ?? undefined,
      size: f.size ?? undefined,
      modifiedTime: f.modifiedTime ?? undefined,
    }));
  }

  async listTrashedFiles(tokens: TokenSet): Promise<ListedFileResult[]> {
    const auth = this.createClient();
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: 'trashed = true',
      fields: 'files(id, name, webViewLink, mimeType, size, modifiedTime, trashed)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      spaces: 'drive',
    });

    return (res.data.files ?? []).map((f) => ({
      fileId: f.id!,
      name: f.name!,
      webViewLink: f.webViewLink!,
      mimeType: f.mimeType ?? undefined,
      size: f.size ?? undefined,
      modifiedTime: f.modifiedTime ?? undefined,
    }));
  }

  async trashFile(tokens: TokenSet, fileId: string) {
    const auth = this.createClient();
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });
    const drive = google.drive({ version: 'v3', auth });

    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
    });

    return {
      message: 'Fichier ajouter dans la corbeille',
    };
  }

  async deleteFilePermanently(tokens: TokenSet, fileId: string) {
    const auth = this.createClient();
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });
    const drive = google.drive({ version: 'v3', auth });

    await drive.files.delete({ fileId });

    return {
      message: 'Fichier supprimé définitivement',
    };
  }
}
