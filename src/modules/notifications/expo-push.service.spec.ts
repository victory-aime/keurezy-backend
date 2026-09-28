const expoClient = {
  chunkPushNotifications: jest.fn((messages: unknown[]) => [messages]),
  sendPushNotificationsAsync: jest.fn(),
  chunkPushNotificationReceiptIds: jest.fn((ids: string[]) => [ids]),
  getPushNotificationReceiptsAsync: jest.fn(),
};

jest.mock('expo-server-sdk', () => {
  const Expo = Object.assign(
    jest.fn(() => expoClient),
    { isExpoPushToken: (token: string) => token.startsWith('ExponentPushToken[') },
  );
  return { __esModule: true, default: Expo, Expo };
});

import { ExpoPushService } from './expo-push.service';
import { NotificationType } from '../../../prisma/generated/enums';

const setup = () => {
  const prisma = { deviceToken: { deleteMany: jest.fn() } };
  const config = { get: jest.fn() };
  return { prisma, service: new ExpoPushService(prisma as never, config as never) };
};

const message = (token: string) => ({
  token,
  title: 'Agence Mermoz',
  body: 'Bonjour',
  type: NotificationType.MESSAGE,
  data: { conversationId: 'conv-1' },
  badge: 2,
});

describe('ExpoPushService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('envoie sur le canal Android des messages, avec la pastille', async () => {
    const { service } = setup();
    expoClient.sendPushNotificationsAsync.mockResolvedValue([{ status: 'ok', id: 'r-1' }]);

    await service.send([message('ExponentPushToken[a]'), message('invalid')]);

    expect(expoClient.sendPushNotificationsAsync).toHaveBeenCalledWith([
      expect.objectContaining({
        to: 'ExponentPushToken[a]',
        channelId: 'messages',
        priority: 'high',
        badge: 2,
        data: { conversationId: 'conv-1', type: NotificationType.MESSAGE },
      }),
    ]);
  });

  it('supprime un jeton refusé dès l’envoi', async () => {
    const { service, prisma } = setup();
    expoClient.sendPushNotificationsAsync.mockResolvedValue([
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ]);

    await service.send([message('ExponentPushToken[dead]')]);

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['ExponentPushToken[dead]'] } },
    });
  });

  it('supprime un jeton signalé par un accusé différé', async () => {
    const { service, prisma } = setup();
    expoClient.sendPushNotificationsAsync.mockResolvedValue([{ status: 'ok', id: 'r-1' }]);
    await service.send([message('ExponentPushToken[later]')]);

    expoClient.getPushNotificationReceiptsAsync.mockResolvedValue({
      'r-1': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    });
    await service.checkReceipts();

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['ExponentPushToken[later]'] } },
    });
  });

  it('applique le son choisi : fichier embarqué, canal Android dédié, ou silence', async () => {
    const { service } = setup();
    expoClient.sendPushNotificationsAsync.mockResolvedValue([
      { status: 'ok', id: 'r-1' },
      { status: 'ok', id: 'r-2' },
    ]);

    await service.send([
      { ...message('ExponentPushToken[soft]'), sound: 'SOFT' },
      { ...message('ExponentPushToken[mute]'), sound: 'NONE' },
    ]);

    expect(expoClient.sendPushNotificationsAsync).toHaveBeenCalledWith([
      expect.objectContaining({ sound: 'soft.wav', channelId: 'messages_soft' }),
      expect.objectContaining({ sound: null, channelId: 'messages_none' }),
    ]);
  });
});
