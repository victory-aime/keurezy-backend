// modules/chat/dto/chat.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { MessageStatus } from '../../../prisma/generated/enums';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}

export class CreateConversationDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  recipientId?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  leadId?: string;
}

export class GetMessagesDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsOptional()
  @IsString()
  cursor?: string; // messageId — pagination par curseur

  @IsOptional()
  limit?: number;
}

export class ToggleReactionDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8) // un emoji
  emoji: string;
}

// ─── Payloads Socket émis vers le front ──────────────────────────────────────

export interface MessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  metadata: Record<string, string[]> | null;
  status?: MessageStatus;
  createdAt: Date;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}
