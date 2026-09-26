import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/** Pagination des listes d'une agence. L'identité de l'appelant vient de la session, jamais d'ici. */
export class PaginationDto {
  @IsOptional()
  @IsString()
  agencyId: string;

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
