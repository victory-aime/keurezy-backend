jest.mock('../firebase/firebase.service', () => ({ FirebaseService: jest.fn() }));
jest.mock('../preferences/preferences.service', () => ({ PreferencesService: jest.fn() }));
jest.mock('./expo-push.service', () => ({
  ExpoPushService: Object.assign(jest.fn(), {
    isExpoToken: (token: string) => token.startsWith('ExponentPushToken['),
  }),
}));

import { PushNotificationService } from './push-notification.service';
import { HttpError } from '../../config/http.error';
import { NotificationType, PushPlatform } from '../../../prisma/generated/enums';
import { resolveNotificationPreferences } from '../preferences/notification-preferences';

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
  }
  return null;
};

const setup = () => {
  const prisma = {
    deviceToken: { findMany: jest.fn(), deleteMany: jest.fn(), upsert: jest.fn() },
    notificationDelivery: { groupBy: jest.fn().mockResolvedValue([]) },
    conversationParticipant: { groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const send = jest.fn();
  const firebase = { getMessaging: () => ({ send }) };
  const expoPush = { send: jest.fn() };
  const preferences = {
    getNotificationPreferences: jest.fn((ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, resolveNotificationPreferences(undefined)]))),
    ),
  };
  const service = new PushNotificationService(
    prisma as never,
    firebase as never,
    expoPush as never,
    preferences as never,
  );
  return { prisma, send, expoPush, preferences, service };
};

const payload = {
  type: NotificationType.MESSAGE,
  title: 'Agence Mermoz',
  body: 'Le bien est disponible',
  notificationId: 'msg-1',
  data: { conversationId: 'conv-1' },
};

describe('PushNotificationService', () => {
  it('envoie par FCM aux navigateurs et par Expo aux téléphones', async () => {
    const { service, prisma, send, expoPush } = setup();
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: 'fcm-web', userId: 'user-1', platform: PushPlatform.WEB },
      { token: 'ExponentPushToken[abc]', userId: 'user-1', platform: PushPlatform.MOBILE_EXPO },
    ]);

    await service.sendToUsers(['user-1'], payload);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ token: 'fcm-web' }));
    expect(expoPush.send).toHaveBeenCalledWith([
      expect.objectContaining({
        token: 'ExponentPushToken[abc]',
        title: 'Agence Mermoz',
        body: 'Le bien est disponible',
        type: NotificationType.MESSAGE,
        data: { conversationId: 'conv-1', notificationId: 'msg-1' },
      }),
    ]);
  });

  it('calcule la pastille : notifications et messages non lus', async () => {
    const { service, prisma, expoPush } = setup();
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[abc]', userId: 'user-1', platform: PushPlatform.MOBILE_EXPO },
    ]);
    prisma.notificationDelivery.groupBy.mockResolvedValue([
      { userId: 'user-1', _count: { _all: 2 } },
    ]);
    prisma.conversationParticipant.groupBy.mockResolvedValue([
      { userId: 'user-1', _sum: { unreadCount: 3 } },
    ]);

    await service.sendToUsers(['user-1'], payload);

    expect(expoPush.send).toHaveBeenCalledWith([expect.objectContaining({ badge: 5 })]);
  });

  it("n'interroge rien sans destinataire ni appareil", async () => {
    const { service, prisma, expoPush } = setup();
    await service.sendToUsers([], payload);
    expect(prisma.deviceToken.findMany).not.toHaveBeenCalled();

    prisma.deviceToken.findMany.mockResolvedValue([]);
    await service.sendToUsers(['user-1'], payload);
    expect(expoPush.send).not.toHaveBeenCalled();
  });

  it('refuse un jeton mobile qui n’est pas un jeton Expo', async () => {
    const { service, prisma } = setup();
    const code = await errorCode(
      service.registerDeviceToken('user-1', {
        token: 'not-an-expo-token',
        deviceKey: 'a'.repeat(64),
        platform: PushPlatform.MOBILE_EXPO,
      }),
    );
    expect(code).toBe('INVALID_PUSH_TOKEN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('réattribue un jeton déjà connu au compte connecté (changement de compte)', async () => {
    const { service, prisma } = setup();
    await service.registerDeviceToken('user-2', {
      token: 'ExponentPushToken[abc]',
      deviceKey: 'b'.repeat(64),
      platform: PushPlatform.MOBILE_EXPO,
    });

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: {
        token: 'ExponentPushToken[abc]',
        NOT: { userId: 'user-2', deviceKey: 'b'.repeat(64) },
      },
    });
    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ platform: PushPlatform.MOBILE_EXPO }) as unknown,
      }),
    );
  });

  it('respecte les préférences : catégorie désactivée → pas de push, son choisi', async () => {
    const { service, prisma, expoPush, preferences } = setup();
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[b]', userId: 'user-2', platform: PushPlatform.MOBILE_EXPO },
    ]);
    preferences.getNotificationPreferences.mockResolvedValue(
      new Map([
        ['user-1', resolveNotificationPreferences({ categories: { MESSAGE: { push: false } } })],
        ['user-2', resolveNotificationPreferences({ sound: 'SOFT' })],
      ]),
    );

    await service.sendToUsers(['user-1', 'user-2'], payload);

    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ['user-2'] } } }),
    );
    expect(expoPush.send).toHaveBeenCalledWith([expect.objectContaining({ sound: 'SOFT' })]);
  });
});
