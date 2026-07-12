import { TokenSet } from './token-set.interface';

export interface UploadResult {
  fileId: string;
  name: string;
  webViewLink?: string;
}

export interface ListedFileResult {
  fileId: string;
  name: string;
  webViewLink: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
}

export interface CloudProviderStrategy {
  readonly key: string; // ex: 'google-drive'

  /** Construit l'URL de consentement OAuth */
  getAuthUrl(state: string): string;

  /** Échange le code renvoyé par le providers contre des tokens */
  exchangeCode(code: string): Promise<TokenSet>;

  /** Rafraîchit un access token expiré */
  refreshTokens(tokens: TokenSet): Promise<TokenSet>;

  /** Upload un fichier avec les tokens de l'utilisateur */
  uploadFile(tokens: TokenSet, file: Express.Multer.File): Promise<UploadResult>;

  /** Liste les fichiers avec les tokens de l'utilisateur */
  listFiles(tokens: TokenSet): Promise<ListedFileResult[]>;

  /** Liste des fichiers ajoutés dans la corbeille */
  listTrashedFiles(tokens: TokenSet): Promise<ListedFileResult[]>;

  /** Ajoute des fichiers dans la corbeille */
  trashFile(tokens: TokenSet, fileId: string): Promise<{ message: string }>;

  /** Supprime des fichiers de manière permanente */
  deleteFilePermanently(tokens: TokenSet, fileId: string): Promise<{ message: string }>;
}
