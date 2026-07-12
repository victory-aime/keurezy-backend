import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IntegrationProviderType } from '../../../../prisma/generated/enums';

interface StatePayload {
  userId: string;
  provider: IntegrationProviderType;
}

@Injectable()
export class OAuthStateService {
  constructor(private jwt: JwtService) {}

  sign(payload: StatePayload): string {
    return this.jwt.sign(payload, {
      secret: process.env.OAUTH_STATE_SECRET,
      expiresIn: '5m',
    });
  }

  verify(state: string): StatePayload {
    try {
      return this.jwt.verify(state, { secret: process.env.OAUTH_STATE_SECRET });
    } catch {
      throw new BadRequestException('State OAuth invalide ou expiré');
    }
  }
}
