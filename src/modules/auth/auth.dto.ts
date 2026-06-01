import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

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

  @ApiProperty({
    example: 'https://monapp.com/verified',
    description: 'URL de redirection après vérification',
  })
  @IsString()
  callbackURL: string;
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
