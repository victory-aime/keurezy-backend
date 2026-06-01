import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { BillingCycle, Plan } from '../../../prisma/generated/enums';

export class createAgencyOwnerDto {
  @IsString()
  @ApiProperty({ example: 'NANA Beauty Salon', description: "Nom de l'agence" })
  name: string;

  @IsEmail()
  @ApiProperty({ example: 'contact@nana.sn', description: "Email de contact de l'agence" })
  email: string;

  @IsString()
  @ApiProperty({ example: '123 Avenue Habib Bourguiba', description: "Adresse de l'agence" })
  address: string;

  @IsString()
  @ApiProperty({ example: '+221 77 000 00 00', description: "Numéro de téléphone de l'agence" })
  phone: string;

  @IsString()
  @ApiProperty({
    example: 'Agence spécialisée en location résidentielle',
    description: "Description de l'agence",
  })
  description: string;

  @ApiProperty({ description: "Accepter les conditions d'utilisation", example: true })
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  acceptTerms: boolean;

  @IsOptional()
  @IsString({ each: true })
  @ApiPropertyOptional({
    description:
      'URLs des documents injectées après upload — ne pas envoyer manuellement dans le body',
    example: ['https://res.cloudinary.com/example/cni.pdf'],
    type: [String],
  })
  documents?: string[] | File[] | any;

  @IsObject()
  @ApiProperty({
    description: "Plan choisi à l'onboarding",
    example: { planId: 'uuid-du-plan', billingCycle: 'MONTHLY' },
  })
  plan: {
    planId: string;
    billingCycle: BillingCycle;
  };

  @IsEmail()
  @ApiProperty({ example: 'owner@example.com', description: 'Email du compte propriétaire' })
  userEmail: string;

  @IsString()
  @ApiProperty({ example: 'mamadou.diallo', description: "Nom d'utilisateur du propriétaire" })
  username: string;

  @IsString()
  @MinLength(12)
  @ApiProperty({
    example: 'motdepasse123456',
    description: 'Mot de passe du propriétaire (min. 12 caractères)',
    minLength: 12,
  })
  password: string;
}

export class updateAgencyDto extends createAgencyOwnerDto {
  @IsUUID()
  @ApiProperty({
    example: 'uuid-de-l-agence',
    description: "Identifiant de l'agence à mettre à jour",
  })
  agencyId: string;

  @IsUUID()
  @ApiProperty({
    example: 'uuid-du-user',
    description: "Identifiant de l'utilisateur effectuant la mise à jour",
  })
  userId: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/example/logo.png',
    description: 'URL du logo injectée après upload — ne pas envoyer manuellement dans le body',
  })
  agencyLogo?: string;
}
