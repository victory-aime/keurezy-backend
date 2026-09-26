import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Champs modifiables par l'utilisateur sur son propre profil.
 * Les champs sensibles (role, status, emailVerified, twoFactorEnabled...) ne sont jamais acceptés.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Mamadou Diallo', description: "Nom de l'utilisateur" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    example: 'owner@example.com',
    description: "Email saisi — non modifiable ici (le changement d'email passe par Better Auth)",
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '#673ab6', description: 'Couleur du thème' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  theme_color?: string;

  @ApiPropertyOptional({ example: 'system', description: 'Mode du thème (light, dark, system)' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  theme_mode?: string;
}
