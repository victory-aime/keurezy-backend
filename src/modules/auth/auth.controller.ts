import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  CreateUserDto,
  ForgotPasswordDto,
  LoginDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from './auth.dto';
import { API_URL } from '_root/config/api';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller()
@AllowAnonymous()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─────────────────────────────────────────
  // POST v1/unsecured/auth/login
  // Connexion — retourne le token JWT
  // ─────────────────────────────────────────
  @Post(API_URL.AUTH.LOGIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion utilisateur — retourne le token JWT' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Connexion réussie, token retourné' })
  @ApiBadRequestResponse({ description: 'Email ou mot de passe incorrect' })
  async loginUser(@Body() body: LoginDto) {
    return this.authService.loginUser(body);
  }

  // ─────────────────────────────────────────
  // POST v1/unsecured/auth/register
  // Inscription
  // ─────────────────────────────────────────
  @Post(API_URL.AUTH.REGISTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Créer un compte utilisateur' })
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ description: 'Compte créé avec succès' })
  @ApiBadRequestResponse({ description: 'Email déjà utilisé ou données invalides' })
  async registerUser(@Body() body: CreateUserDto) {
    return this.authService.registerUser(body);
  }

  // ─────────────────────────────────────────
  // POST v1/unsecured/auth/forgot-password
  // ─────────────────────────────────────────
  @Post(API_URL.AUTH.FORGOT_PASSWORD)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demande de réinitialisation de mot de passe' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: 'Email de réinitialisation envoyé' })
  @ApiBadRequestResponse({ description: 'Aucun compte associé à cet email' })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  // ─────────────────────────────────────────
  // POST v1/unsecured/auth/send-email-verification
  // ─────────────────────────────────────────
  @Post(API_URL.AUTH.SEND_VERIFICATION)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Renvoyer l'email de vérification" })
  @ApiBody({ type: ResendVerificationDto })
  @ApiOkResponse({ description: 'Email de vérification renvoyé avec succès' })
  @ApiBadRequestResponse({ description: 'Email introuvable ou déjà vérifié' })
  async sendVerificationEmail(@Body() body: ResendVerificationDto) {
    return this.authService.sendVerificationEmail(body);
  }

  @Post(API_URL.AUTH.RESEND_VERIFICATION_OTP)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Renvoyer l'email OTP de vérification" })
  async resendVerificationOtpEmail(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerificationOtpEmail(body);
  }

  @Post(API_URL.AUTH.VERIFY_OTP)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verifier l'email OTP" })
  async verifyOtpEmail(@Body() body: ResendVerificationDto & { otp: string }) {
    return this.authService.verifyMobileEmail(body);
  }

  // ─────────────────────────────────────────
  // POST v1/unsecured/auth/reset-password
  // ─────────────────────────────────────────
  @Post(API_URL.AUTH.RESET_PASSWORD)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: 'Mot de passe réinitialisé avec succès' })
  @ApiBadRequestResponse({ description: 'Token invalide ou expiré' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  // ─────────────────────────────────────────
  // POST v1/unsecured/auth/verified-email
  // ─────────────────────────────────────────
  @Post(API_URL.AUTH.CHECK_EMAIL)
  @ApiOperation({ summary: 'Vérifier si un email existe' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
      },
      required: ['email'],
    },
  })
  @ApiOkResponse({ description: 'Retourne un boolean' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async checkUserEmail(@Body() data: { email: string }) {
    return this.authService.checkUserEmail(data?.email);
  }
}
