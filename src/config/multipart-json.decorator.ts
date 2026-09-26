import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  PipeTransform,
  Type,
} from '@nestjs/common';
import { createValidationPipe } from './validation-pipe';

/** Parse un champ JSON puis le valide comme un body classique (whitelist comprise). */
class ParseJsonDtoPipe implements PipeTransform<unknown, Promise<unknown>> {
  private readonly validationPipe = createValidationPipe();

  constructor(private readonly metatype: Type) {}

  async transform(value: unknown): Promise<unknown> {
    let parsed: unknown;
    try {
      parsed = typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      throw new BadRequestException('Le champ data doit contenir un JSON valide');
    }
    return this.validationPipe.transform(parsed, { type: 'body', metatype: this.metatype });
  }
}

const MultipartField = createParamDecorator(
  (field: string, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ body?: Record<string, unknown> }>().body?.[field],
);

/**
 * Champ JSON d'un formulaire multipart (ex. `data` accompagné de fichiers),
 * soumis aux mêmes règles de validation que les autres routes.
 */
export const MultipartJson = (field: string, metatype: Type) =>
  MultipartField(field, new ParseJsonDtoPipe(metatype));
