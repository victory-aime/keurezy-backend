import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class IPaginationDto {
  @IsOptional()
  @IsString()
  agencyId: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  // Renseigné côté serveur depuis la session (toute valeur envoyée par le client est écrasée).
  @IsOptional()
  @IsString()
  userId: string;

  // Les query strings arrivent en chaîne : conversion explicite en nombre
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  initialPage: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limitPerPage: number;
}
