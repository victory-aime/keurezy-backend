import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class NabooSignatureGuard implements CanActivate {
  private readonly logger = new Logger(NabooSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const receivedSignature = req.headers['x-signature'] as string | undefined;

    this.logger.debug(`[Webhook] X-Signature reçue : ${receivedSignature ?? 'ABSENTE'}`);

    if (!receivedSignature) {
      this.logger.warn('[Webhook] Rejeté — en-tête X-Signature manquant');
      throw new UnauthorizedException('Signature manquante');
    }

    const rawBodyBuffer: Buffer | undefined = (req as any).rawBody;

    let bodyToSign: string;
    if (rawBodyBuffer && Buffer.isBuffer(rawBodyBuffer)) {
      bodyToSign = rawBodyBuffer.toString('utf8');
      this.logger.debug(`[Webhook] Raw body (${rawBodyBuffer.length} bytes) : ${bodyToSign}`);
    } else {
      bodyToSign = JSON.stringify(req.body);
      this.logger.warn('[Webhook] rawBody absent — fallback JSON.stringify. Vérifiez main.ts !');
    }

    const secret = this.config.get<string>('NABOOPAY_WEBHOOK_SECRET')!;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(bodyToSign, 'utf8')
      .digest('hex');

    this.logger.debug(`[Webhook] Signature attendue : ${expectedSig}`);
    this.logger.debug(`[Webhook] Signature reçue    : ${receivedSignature}`);

    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(receivedSignature, 'utf8'),
        Buffer.from(expectedSig, 'utf8'),
      );
    } catch {
      isValid = false;
    }

    if (!isValid) {
      this.logger.warn('[Webhook] ❌ Signature invalide — requête rejetée');
      throw new UnauthorizedException('Signature invalide');
    }

    this.logger.log('[Webhook] ✅ Signature vérifiée avec succès');
    return true;
  }
}
