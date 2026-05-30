import { AnnonceStatus, PropertyFeature, PropertyType } from '../../../prisma/generated/enums';

export class CreateAnnonceDto {
  title: string;
  propertyId: string;
  description: string;
  galleryImages: string[];
  agencyId?: string;
  userId?: string;
  status?: AnnonceStatus;
}

export class UpdateAnnonceDto extends CreateAnnonceDto {
  id: string;
}

export class FilterAnnonceDto {
  initialPage: number;
  limitPerPage: number;
  city?: string;
  district?: string;
  type?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  rooms?: number;
  features?: PropertyFeature[];
}
