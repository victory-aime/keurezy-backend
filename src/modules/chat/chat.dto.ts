import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AttachmentKind, MessageStatus, MessageType } from '../../../prisma/generated/enums';
import { CHAT_LIMITS } from './chat-files';

// ─── Requêtes HTTP ──────────────────────────────────────────────────────────

export class OpenPropertyConversationDto {
  @ApiProperty({ description: 'Annonce consultée par le client' })
  @IsUUID()
  annonceId: string;
}

export class OpenBookingConversationDto {
  @ApiProperty({ description: 'Réservation concernée' })
  @IsUUID()
  bookingId: string;
}

export class ConversationIdDto {
  @ApiProperty()
  @IsUUID()
  conversationId: string;
}

export class ConversationsQueryDto {
  @ApiPropertyOptional({ description: 'Vue agence : conversations de cette agence' })
  @IsOptional()
  @IsUUID()
  agencyId?: string;

  @ApiPropertyOptional({ description: 'Curseur : id de la dernière conversation reçue' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ description: 'Nom du client, de l’agence ou titre du bien' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class GetMessagesDto {
  @ApiProperty()
  @IsUUID()
  conversationId: string;

  @ApiPropertyOptional({ description: 'Curseur : id du plus ancien message reçu' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Envoi par socket (texte) ou partie `data` de l'envoi multipart (avec fichiers). */
export class SendMessageDto {
  @ApiProperty()
  @IsUUID()
  conversationId: string;

  @ApiPropertyOptional({ maxLength: CHAT_LIMITS.MAX_TEXT_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(CHAT_LIMITS.MAX_TEXT_LENGTH)
  content?: string;

  @ApiPropertyOptional({ description: 'Identifiant temporaire côté client (envoi optimiste)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tempId?: string;

  @ApiPropertyOptional({ description: 'Durée de la note vocale (ms)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CHAT_LIMITS.MAX_VOICE_MS)
  durationMs?: number;
}

export class TypingDto {
  @IsUUID()
  conversationId: string;
}

// ─── Payloads émis vers les clients ─────────────────────────────────────────

export interface AttachmentPayload {
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  fileName: string;
  fileSize: number;
  durationMs: number | null;
  url: string;
}

export interface MessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  sender: { id: string; name: string } | null;
  content: string;
  type: MessageType;
  attachments: AttachmentPayload[];
  status?: MessageStatus;
  createdAt: Date;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

/** Accusé retourné à l'émetteur d'un `message:send`. */
export type SendMessageAck =
  | { ok: true; message: MessagePayload }
  | { ok: false; error: string; errorCode?: string };
