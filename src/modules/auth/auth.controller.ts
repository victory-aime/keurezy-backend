import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  CreateUserDto,
  ForgotPasswordDto,
  LoginDto,
  ResendVerificationDto,
  ResetPasswordDto,
  ResetPasswordOtpDto,
  VerifyOtpDto,
} from './auth.dto';
import { API_URL } from '../../config/api';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SENSITIVE_THROTTLE } from '../../config/throttle';

@ApiTags('Auth')
@Controller()
@AllowAnonymous()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post(API_URL.AUTH.REGISTER)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Créer un compte utilisateur' })
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ description: 'Compte créé avec succès' })
  @ApiBadRequestResponse({ description: 'Email déjà utilisé ou données invalides' })
  async registerUser(@Body() body: CreateUserDto) {
    return this.authService.registerUser(body);
  }

  @Post(API_URL.AUTH.FORGOT_PASSWORD)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demande de réinitialisation de mot de passe' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: 'Email de réinitialisation envoyé' })
  @ApiBadRequestResponse({ description: 'Aucun compte associé à cet email' })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  // ─── Mot de passe oublié par code OTP (mobile) ─────────────────

  @Post(API_URL.AUTH.FORGOT_PASSWORD_OTP)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Envoyer un code de réinitialisation (mobile)',
    description:
      'Réponse identique que le compte existe ou non. Un code déjà envoyé il y a moins de 2 minutes n’est pas renvoyé.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: 'Si le compte existe, un code à 6 chiffres a été envoyé' })
  async forgotPasswordOtp(@Body() body: ForgotPasswordDto) {
    return this.authService.requestPasswordResetOtp(body.email);
  }

  @Post(API_URL.AUTH.VERIFY_RESET_OTP)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier un code de réinitialisation sans le consommer (mobile)' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiOkResponse({ description: 'Code valide' })
  @ApiBadRequestResponse({ description: 'Code incorrect, expiré ou trop de tentatives' })
  async verifyResetOtp(@Body() body: VerifyOtpDto) {
    return this.authService.verifyPasswordResetOtp(body);
  }

  @Post(API_URL.AUTH.RESET_PASSWORD_OTP)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Définir un nouveau mot de passe avec le code (mobile)',
    description: 'Toutes les sessions de l’utilisateur sont fermées après le changement.',
  })
  @ApiBody({ type: ResetPasswordOtpDto })
  @ApiOkResponse({ description: 'Mot de passe réinitialisé' })
  @ApiBadRequestResponse({ description: 'Code incorrect, expiré ou trop de tentatives' })
  async resetPasswordOtp(@Body() body: ResetPasswordOtpDto) {
    return this.authService.resetPasswordWithOtp(body);
  }

  @Post(API_URL.AUTH.SEND_VERIFICATION)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Renvoyer l'email de vérification" })
  @ApiBody({ type: ResendVerificationDto })
  @ApiOkResponse({ description: 'Email de vérification renvoyé avec succès' })
  async sendVerificationEmail(@Body() body: ResendVerificationDto) {
    return this.authService.sendVerificationEmail(body);
  }

  @Post(API_URL.AUTH.RESEND_VERIFICATION_OTP)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Renvoyer l'email OTP de vérification" })
  async resendVerificationOtpEmail(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerificationOtpEmail(body);
  }

  @Post(API_URL.AUTH.VERIFY_OTP)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verifier l'email OTP" })
  async verifyOtpEmail(@Body() body: VerifyOtpDto) {
    return this.authService.verifyMobileEmail(body);
  }

  @Post(API_URL.AUTH.RESET_PASSWORD)
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: 'Mot de passe réinitialisé avec succès' })
  @ApiBadRequestResponse({ description: 'Token invalide ou expiré' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

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
