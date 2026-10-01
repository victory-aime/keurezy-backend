import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { LegalForm } from '../../../../prisma/generated/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const identifier = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value;

/** Informations légales de l'agence (owner) : seuls les champs envoyés sont modifiés. */
export class UpdateAgencyLegalDto {
  @ApiPropertyOptional({ example: 'Keur Immo SARL', description: 'Raison sociale' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 150)
  companyName?: string;

  @ApiPropertyOptional({ enum: LegalForm, description: 'Forme juridique' })
  @IsOptional()
  @IsEnum(LegalForm)
  legalForm?: LegalForm;

  @ApiPropertyOptional({ example: '0012345 2G3', description: 'NINEA (espaces ignorés)' })
  @IsOptional()
  @Transform(identifier)
  @Matches(/^[0-9A-Z]{7,14}$/, { message: 'NINEA invalide : 7 à 14 chiffres ou lettres' })
  ninea?: string;

  @ApiPropertyOptional({ example: 'SN-DKR-2020-B-12345', description: 'RCCM' })
  @IsOptional()
  @Transform(identifier)
  @Matches(/^[0-9A-Z][0-9A-Z./-]{5,39}$/, { message: 'RCCM invalide (ex. SN-DKR-2020-B-12345)' })
  rccm?: string;

  @ApiPropertyOptional({ example: 'Rue 10, Dakar', description: 'Adresse de facturation' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(5, 255)
  billingAddress?: string;

  @ApiPropertyOptional({ example: 'compta@keur.sn', description: 'E-mail de facturation' })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  billingEmail?: string;

  // Coordonnées bancaires (facultatives, imprimées par le bloc « coordonnées bancaires »)

  @ApiPropertyOptional({ example: 'CBAO', description: 'Banque' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  bankName?: string;

  @ApiPropertyOptional({ example: 'SN012 01001 012345678901 85', description: 'RIB ou IBAN' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^[0-9A-Za-z ]{10,40}$/, {
    message: 'RIB ou IBAN invalide (10 à 40 chiffres ou lettres)',
  })
  bankAccount?: string;

  @ApiPropertyOptional({ example: '+221 77 000 00 00', description: 'Numéro Wave ou Orange Money' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 ]{8,20}$/, { message: 'Numéro Wave ou Orange Money invalide' })
  mobileMoneyNumber?: string;
}
