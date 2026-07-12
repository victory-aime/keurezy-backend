export interface TokenSet {
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number; // timestamp ms
  scope?: string;
}
