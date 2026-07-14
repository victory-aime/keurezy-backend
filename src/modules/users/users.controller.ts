import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { API_URL } from '../../config/api';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_TAGS } from '../../config/enum';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { MiddlewareGuard } from '../../guard/middleware.guard';
import { User } from '../../../prisma/generated/client';

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
  @ApiQuery({
    name: 'userId',
    required: true,
    example: 'ckx123abc',
    description: 'Identifiant unique de l’utilisateur',
  })
  @ApiOkResponse({ description: 'Informations utilisateur récupérées.' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable.' })
  async getUserInfo(@Query('userId') userId: string) {
    return this.userService.userInfo(userId);
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

  @Patch(API_URL.USER.UPDATE)
  async updateUserInfo(@Body() data: User) {
    return this.userService.updateUser(data);
  }
  @Get(API_URL.USER.PASSKEY_SESSION)
  async getPasskeyAndSessions(@Query('userId') userId: string) {
    return this.userService.userPassKeyAndSessionsList(userId);
  }
}
