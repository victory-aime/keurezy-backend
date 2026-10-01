import { HttpStatus } from '@nestjs/common';
import { HttpError } from '../../config/http.error';

/** Biens soumis à la limite `manage_properties`, désactivables par un downgrade. */
export const ASSET_TYPES = ['PROPERTY', 'LAND', 'BUILDING'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Un bien désactivé (hors quota) est en lecture seule : on le réactive d'abord, dans la limite
 * du plan, avant de le modifier ou d'y publier une annonce.
 */
export function assertAssetActive(asset: { isActive: boolean }): void {
  if (!asset.isActive) {
    throw new HttpError(
      'Ce bien est désactivé : réactivez-le avant de le modifier.',
      HttpStatus.CONFLICT,
      'ASSET_INACTIVE',
    );
  }
}
