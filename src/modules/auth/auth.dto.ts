import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Mamadou Diallo', description: "Nom complet de l'utilisateur" })
  @IsString()
  name: string;

  @ApiProperty({ example: 'user@example.com', description: 'Adresse email du compte' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'motdepasse123456',
    description: 'Mot de passe (min. 12 caractères)',
    minLength: 12,
  })
  @IsString()
  @MinLength(12)
  password: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email du compte à vérifier' })
  @IsEmail()
  email: string;
}

export class VerifyOtpDto extends ResendVerificationDto {
  @ApiProperty({ example: '482913', description: 'Code à 6 chiffres reçu par email' })
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres' })
  otp: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email associé au compte' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    example: 'token-de-reset-recu-par-email',
    description: 'Token de réinitialisation reçu par email',
  })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'nouveaumotdepasse123',
    description: 'Nouveau mot de passe (min. 12 caractères)',
    minLength: 12,
  })
  @IsString()
  @MinLength(12)
  newPassword: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'Adresse email du compte' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'motdepasse123',
    description: 'Mot de passe (min. 8 caractères)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;
}

export class ResetPasswordOtpDto extends VerifyOtpDto {
  @ApiProperty({
    example: 'NouveauMotDePasse2026',
    description: 'Nouveau mot de passe (min. 12 caractères)',
    minLength: 12,
  })
  @IsString()
  @MinLength(12)
  newPassword: string;
}

/** Récupération de compte (2FA perdue), étape 1 : identifiants du compte. */
export class TwoFactorRecoveryRequestDto {
  @ApiProperty({ example: 'user@example.com', description: 'Adresse e-mail du compte' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MotDePasse2026', description: 'Mot de passe du compte' })
  @IsString()
  @MinLength(1)
  password: string;
}

/** Étape 2 : mêmes identifiants et code reçu par e-mail. */
export class TwoFactorRecoveryConfirmDto extends TwoFactorRecoveryRequestDto {
  @ApiProperty({ example: '482913', description: 'Code à 6 chiffres reçu par e-mail' })
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres' })
  code: string;
}

/** Lien « Ce n'est pas moi » de l'e-mail de récupération. */
export class TwoFactorRecoveryCancelDto {
  @ApiProperty({ description: "Jeton d'annulation reçu par e-mail" })
  @IsString()
  token: string;
}
