import { IsEnum, IsArray, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { MessageType } from '../../../../prisma/generated/enums';
import { ConversationType } from '../../../../prisma/generated/enums';

export class SendMessageDto {
  @IsUUID()
  conversationId: string;

  @IsString()
  content: string;

  @IsEnum(MessageType)
  @IsOptional()
  type: MessageType = MessageType.TEXT;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown> | any; // { url, filename, mimeType, size }
}

export class ReadReceiptDto {
  @IsUUID()
  conversationId: string;
}

export class CreateConversationDto {
  @IsEnum(ConversationType)
  type: ConversationType;

  @IsArray()
  @IsUUID('4', { each: true })
  participantIds: string[]; // IDs des autres participants (sans soi-même)

  @IsOptional()
  @IsString()
  title?: string;
}
