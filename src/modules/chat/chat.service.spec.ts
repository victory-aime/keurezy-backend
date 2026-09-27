jest.mock('../cloudinary/cloudinary.service', () => ({ CloudinaryService: jest.fn() }));

import { ChatService } from './chat.service';
import { HttpError } from '../../config/http.error';
import { Prisma } from '../../../prisma/generated/client';
import { MessageStatus, MessageType, Role } from '../../../prisma/generated/enums';

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
  }
  return null;
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = () =>
  ({
    mimetype: 'image/png',
    buffer: PNG,
    size: PNG.length,
    originalname: 'photo.png',
  }) as Express.Multer.File;

const setup = () => {
  const prisma = {
    agency: { findUnique: jest.fn().mockResolvedValue({ name: 'Agence Mermoz' }) },
    client: {
      findUnique: jest.fn().mockResolvedValue({ id: 'client-1' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ userId: 'user-client' }),
    },
    annonce: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ property: { id: 'property-1', agencyId: 'agency-A' } }),
    },
    booking: { findUnique: jest.fn() },
    conversation: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'conv-1', bookingId: null }),
      update: jest.fn().mockResolvedValue({ bookingId: null }),
    },
    conversationParticipant: { createMany: jest.fn(), updateMany: jest.fn() },
    message: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    messageReceipt: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const access = {
    assertAgencyAccess: jest.fn().mockResolvedValue(Role.OWNER),
    assertConversationAccess: jest.fn().mockResolvedValue({
      side: 'CLIENT',
      role: Role.USER,
      conversation: {
        id: 'conv-1',
        clientId: 'client-1',
        agencyId: 'agency-A',
        propertyId: 'property-1',
      },
    }),
    getAgencyReaderIds: jest.fn().mockResolvedValue([
      { userId: 'user-owner', role: Role.OWNER },
      { userId: 'user-staff', role: Role.AGENT },
    ]),
  };
  const cloudinary = {
    uploadPrivateFile: jest.fn(),
    deletePrivateFile: jest.fn(),
    getSignedUrl: jest.fn().mockReturnValue('https://signed'),
  };
  const service = new ChatService(prisma as never, access as never, cloudinary as never);
  jest
    .spyOn(service, 'getConversationDetail')
    .mockImplementation((_user, id) => Promise.resolve({ id } as never));
  return { prisma, access, cloudinary, service };
};

const messageRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'user-client',
  sender: { id: 'user-client', name: 'Awa' },
  content: 'Bonjour',
  type: MessageType.TEXT,
  attachments: [],
  createdAt: new Date(),
  ...overrides,
});

describe('ChatService — ouverture des conversations', () => {
  it('crée la conversation depuis un bien non réservé', async () => {
    const { service, prisma } = setup();

    const result = await service.openPropertyConversation('user-client', 'annonce-1');

    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          clientId: 'client-1',
          agencyId: 'agency-A',
          propertyId: 'property-1',
          bookingId: null,
        },
      }),
    );
    expect(prisma.conversationParticipant.createMany).toHaveBeenCalled();
    expect(result).toEqual({ id: 'conv-1' });
  });

  it("retrouve la conversation existante sans en créer d'autre (historique conservé)", async () => {
    const { service, prisma } = setup();
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-existing', bookingId: null });

    const result = await service.openPropertyConversation('user-client', 'annonce-1');

    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'conv-existing' });
  });

  it('ne crée pas de doublon lors de deux ouvertures simultanées', async () => {
    const { service, prisma } = setup();
    prisma.conversation.create.mockRejectedValue(uniqueViolation());
    prisma.conversation.findUniqueOrThrow.mockResolvedValue({ id: 'conv-winner', bookingId: null });

    const result = await service.openPropertyConversation('user-client', 'annonce-1');

    expect(result).toEqual({ id: 'conv-winner' });
  });

  it('refuse un compte non client', async () => {
    const { service, prisma } = setup();
    prisma.client.findUnique.mockResolvedValue(null);
    expect(await errorCode(service.openPropertyConversation('user-agent', 'annonce-1'))).toBe(
      'CLIENT_NOT_FOUND',
    );
  });

  it('rattache la réservation à la conversation du bien', async () => {
    const { service, prisma, access } = setup();
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      agencyId: 'agency-A',
      propertyId: 'property-1',
      clientId: 'client-1',
      client: { userId: 'user-client' },
    });
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', bookingId: null });

    await service.openBookingConversation('user-client', 'booking-1');

    expect(access.assertAgencyAccess).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { bookingId: 'booking-1' },
    });
  });

  it("vérifie l'accès agence quand ce n'est pas le client de la réservation", async () => {
    const { service, prisma, access } = setup();
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      agencyId: 'agency-A',
      propertyId: 'property-1',
      clientId: 'client-1',
      client: { userId: 'user-client' },
    });
    access.assertAgencyAccess.mockRejectedValue(
      new HttpError('Accès refusé', 403, 'CHAT_ACCESS_DENIED'),
    );

    expect(await errorCode(service.openBookingConversation('user-intrus', 'booking-1'))).toBe(
      'CHAT_ACCESS_DENIED',
    );
    expect(access.assertAgencyAccess).toHaveBeenCalledWith('agency-A', 'user-intrus', 'read');
  });
});

describe('ChatService — envoi de messages', () => {
  it('refuse un message vide', async () => {
    const { service } = setup();
    expect(
      await errorCode(
        service.sendMessage('user-client', { conversationId: 'conv-1', content: '  ' }),
      ),
    ).toBe('CHAT_EMPTY_MESSAGE');
  });

  it('refuse 4 pièces jointes avant tout upload', async () => {
    const { service, cloudinary } = setup();
    const files = [png(), png(), png(), png()];
    expect(
      await errorCode(service.sendMessage('user-client', { conversationId: 'conv-1' }, files)),
    ).toBe('CHAT_TOO_MANY_FILES');
    expect(cloudinary.uploadPrivateFile).not.toHaveBeenCalled();
  });

  it("vérifie le droit d'écrire avant l'envoi", async () => {
    const { service, access } = setup();
    access.assertConversationAccess.mockRejectedValue(
      new HttpError('Accès refusé', 403, 'CHAT_ACCESS_DENIED'),
    );
    expect(
      await errorCode(
        service.sendMessage('user-staff', { conversationId: 'conv-1', content: 'Hi' }),
      ),
    ).toBe('CHAT_ACCESS_DENIED');
    expect(access.assertConversationAccess).toHaveBeenCalledWith('conv-1', 'user-staff', 'reply');
  });

  it("diffuse un message texte du client à tous les membres habilités de l'agence", async () => {
    const { service, prisma } = setup();
    prisma.message.create.mockResolvedValue(messageRecord());

    const sent = await service.sendMessage('user-client', {
      conversationId: 'conv-1',
      content: 'Bonjour',
    });

    expect(sent.recipientIds).toEqual(['user-owner', 'user-staff']);
    expect(prisma.messageReceipt.createMany).toHaveBeenCalledWith({
      data: [
        { messageId: 'msg-1', userId: 'user-owner' },
        { messageId: 'msg-1', userId: 'user-staff' },
      ],
      skipDuplicates: true,
    });
    expect(sent.message.status).toBe(MessageStatus.SENT);
  });

  it('envoie une image en fichier privé et renvoie une URL signée', async () => {
    const { service, prisma, cloudinary } = setup();
    cloudinary.uploadPrivateFile.mockResolvedValue({ public_id: 'chat/conv-1/abc' });
    prisma.message.create.mockResolvedValue(
      messageRecord({
        type: MessageType.IMAGE,
        content: '',
        attachments: [
          {
            id: 'att-1',
            kind: 'IMAGE',
            mimeType: 'image/png',
            fileName: 'photo.png',
            fileSize: PNG.length,
            storageKey: 'chat/conv-1/abc',
            resourceType: 'image',
            durationMs: null,
          },
        ],
      }),
    );

    const sent = await service.sendMessage('user-client', { conversationId: 'conv-1' }, [png()]);

    expect(cloudinary.uploadPrivateFile).toHaveBeenCalledWith(
      PNG,
      expect.any(String),
      'chat/conv-1',
      'image',
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: MessageType.IMAGE }) as unknown,
      }),
    );
    expect(sent.message.attachments[0].url).toBe('https://signed');
  });

  it("supprime les fichiers envoyés si l'enregistrement échoue", async () => {
    const { service, prisma, cloudinary } = setup();
    cloudinary.uploadPrivateFile.mockResolvedValue({ public_id: 'chat/conv-1/abc' });
    prisma.message.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.sendMessage('user-client', { conversationId: 'conv-1' }, [png()]),
    ).rejects.toThrow('db down');
    expect(cloudinary.deletePrivateFile).toHaveBeenCalledWith('chat/conv-1/abc', 'image');
  });
});

describe('ChatService — statuts et non-lus', () => {
  it("un message du client est lu dès qu'un membre de l'agence l'a lu", async () => {
    const { service, prisma } = setup();
    prisma.message.findUniqueOrThrow.mockResolvedValue({
      id: 'msg-1',
      senderId: 'user-client',
      conversationId: 'conv-1',
    });
    prisma.conversation.findUnique.mockResolvedValue({ client: { userId: 'user-client' } });
    prisma.messageReceipt.findMany.mockResolvedValue([
      { messageId: 'msg-1', userId: 'user-owner', status: MessageStatus.DELIVERED },
      { messageId: 'msg-1', userId: 'user-staff', status: MessageStatus.READ },
    ]);

    expect(await service.getConsolidatedStatus('msg-1')).toBe(MessageStatus.READ);
  });

  it("un message de l'agence n'est lu que par le client (pas par un collègue)", async () => {
    const { service, prisma } = setup();
    prisma.message.findUniqueOrThrow.mockResolvedValue({
      id: 'msg-2',
      senderId: 'user-owner',
      conversationId: 'conv-1',
    });
    prisma.conversation.findUnique.mockResolvedValue({ client: { userId: 'user-client' } });
    prisma.messageReceipt.findMany.mockResolvedValue([
      { messageId: 'msg-2', userId: 'user-client', status: MessageStatus.DELIVERED },
      { messageId: 'msg-2', userId: 'user-staff', status: MessageStatus.READ },
    ]);

    expect(await service.getConsolidatedStatus('msg-2')).toBe(MessageStatus.DELIVERED);
  });

  it('incrémente le compteur des seuls destinataires concernés', async () => {
    const { service, prisma } = setup();
    await service.incrementUnreadCount('conv-1', ['user-owner']);
    expect(prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', userId: { in: ['user-owner'] } },
      data: { unreadCount: { increment: 1 } },
    });

    prisma.conversationParticipant.updateMany.mockClear();
    await service.incrementUnreadCount('conv-1', []);
    expect(prisma.conversationParticipant.updateMany).not.toHaveBeenCalled();
  });
});
