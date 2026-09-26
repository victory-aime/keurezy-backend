import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenExpiredError } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { AppUnauthorizedExceptionService } from '../config/services';
import { TOKEN_EXCEPTION } from '../config/enum';

@Injectable()
export class GoogleAuthGuard implements CanActivate {
  private client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  async verifyIdToken(idToken: string) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      return ticket.getPayload();
    } catch (err) {
      console.log('error', err);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new AppUnauthorizedExceptionService('Token manquant ou invalide', {
        code: TOKEN_EXCEPTION.NO_TOKEN,
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) return false;

    try {
      request.user = await this.verifyIdToken(token);
      return true;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new AppUnauthorizedExceptionService('Token expiré', {
          code: TOKEN_EXCEPTION.TOKEN_EXPIRED,
        });
      }
      throw new AppUnauthorizedExceptionService('Token invalide ou signature incorrecte', {
        code: TOKEN_EXCEPTION.TOKEN_INVALID,
      });
    }
  }
}
