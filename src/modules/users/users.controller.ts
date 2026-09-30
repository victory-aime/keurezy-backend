import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { API_URL } from '../../config/api';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_TAGS } from '../../config/enum';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { MiddlewareGuard } from '../../guard/middleware.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUserId } from '../../guard/current-user.decorator';
import { AllowWhenInactive } from '../../guard/active-subscription.guard';

@ApiBearerAuth()
@ApiTags(SWAGGER_TAGS.USER_MANAGEMENT)
@UseGuards(AuthGuard, MiddlewareGuard)
@Controller()
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get('v1/secure/users/theme')
  async userTheme() {
    return {
      primaryColor: '#fo2b4e',
    };
  }

  @Get(API_URL.USER.INFO)
  @ApiOperation({ summary: 'Récupérer les informations d’un utilisateur' })
  @ApiOkResponse({ description: 'Informations utilisateur récupérées.' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable.' })
  async getUserInfo(@CurrentUserId() userId: string) {
    return this.userService.userInfo(userId);
  }

  @Get(API_URL.USER.BACKUP_CODES_REMAINING)
  @ApiOperation({
    summary: 'Nombre de codes de secours 2FA encore utilisables (jamais les codes eux-mêmes)',
  })
  @ApiOkResponse({ description: '{ remaining } ; 0 si la 2FA est inactive' })
  async backupCodesRemaining(@CurrentUserId() userId: string) {
    return this.userService.backupCodesRemaining(userId);
  }

  @AllowAnonymous()
  @Post(API_URL.USER.CHECK_EMAIL)
  @ApiOperation({ summary: 'Verifier un email' })
  @ApiOkResponse({
    description: 'return un boolean',
  })
  @ApiBadRequestResponse({
    description: 'Une erreur est survenue réessayer plus tard',
  })
  async checkUserEmail(@Body() data: { email: string }) {
    return this.userService.checkUserEmail(data?.email);
  }

  @AllowWhenInactive()
  @Patch(API_URL.USER.UPDATE)
  async updateUserInfo(@CurrentUserId() userId: string, @Body() data: UpdateUserDto) {
    return this.userService.updateUser(userId, data);
  }
  @Get(API_URL.USER.PASSKEY_SESSION)
  async getPasskeyAndSessions(@CurrentUserId() userId: string) {
    return this.userService.userPassKeyAndSessionsList(userId);
  }
}
