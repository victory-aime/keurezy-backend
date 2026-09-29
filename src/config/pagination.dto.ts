import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Taille maximale d'une page : borne la charge d'une requête de liste. */
export const MAX_PAGE_SIZE = 100;

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
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limitPerPage: number;
}
