import { ArgumentMetadata, BadRequestException, Type } from '@nestjs/common';
import { createValidationPipe } from './validation-pipe';
import { BuildingFilterDto } from '../modules/building/building.dto';
import { PropertyFilterDto, propertyDto } from '../modules/property/property.dto';
import { AssignAgentDto, CreateVisitDto, UpdateVisitDto } from '../modules/visits/visits.dto';
import { FilterAnnonceDto } from '../modules/annonce/annonce.dto';
import { CreateInvitationDto } from '../modules/invitations/invitation.dto';
import { CreatePlanInput, UpdatePlanInput } from '../modules/packs/pack.dto';
import { updateAgencyDto } from '../modules/agency/agency.dto';
import { AssignLeadDto, CreateLeadDto, UpdateLeadStatusDto } from '../modules/leads/leads.dto';
import { CreateConversationDto } from '../modules/chat/chat.dto';
import {
  CreateUserDto,
  ForgotPasswordDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from '../modules/auth/auth.dto';
import { RegisterPushNotificationTokenDto } from '../modules/notifications/notifications.dto';
import { UpdateUserDto } from '../modules/users/dto/update-user.dto';
import { UpdateUserStatusDto } from '../modules/users/dto/update-user-status.dto';
import { UpdateAgencyStatusDto } from '../modules/agency/dto/update-agency-status.dto';

/**
 * Garde-fou de la whitelist globale : chaque DTO reçoit un payload identique à celui
 * envoyé par les clients (web / mobile). Aucun champ utile ne doit être supprimé,
 * et les champs non déclarés (userId, role...) doivent l'être.
 */
const pipe = createValidationPipe();

const run = (metatype: Type, value: unknown, type: ArgumentMetadata['type'] = 'body') =>
  pipe.transform(value, { type, metatype }) as Promise<Record<string, unknown>>;

const uuid = '3f1c2a4e-9b7d-4c2e-8f6a-1d2b3c4d5e6f';

describe('Whitelist globale — les DTO conservent les champs envoyés par les clients', () => {
  const cases: [string, Type, Record<string, unknown>, ArgumentMetadata['type']?][] = [
    [
      'PropertyFilterDto (query)',
      PropertyFilterDto,
      {
        agencyId: uuid,
        initialPage: '1',
        limitPerPage: '10',
        title: 'F3',
        status: 'AVAILABLE',
        type: 'APARTMENT',
      },
      'query',
    ],
    [
      'BuildingFilterDto (query)',
      BuildingFilterDto,
      {
        agencyId: uuid,
        initialPage: '2',
        limitPerPage: '5',
        name: 'Résidence',
        city: 'Dakar',
        district: 'Almadies',
        status: 'AVAILABLE',
      },
      'query',
    ],
    [
      'propertyDto',
      propertyDto,
      {
        agencyId: uuid,
        batimentId: null,
        title: 'Appartement F3',
        documents: ['https://res.cloudinary.com/x.pdf'],
        type: 'APARTMENT',
        features: ['KITCHEN'],
        bathrooms: 2,
        price: 150000,
        caution: 300000,
        area: 85.5,
        rooms: 3,
        propertyNumber: 'A3',
        city: 'Dakar',
        address: 'Rue 10',
        district: 'Almadies',
        propertyOwner: 'M. Diallo',
        status: 'AVAILABLE',
      },
    ],
    [
      'CreateVisitDto',
      CreateVisitDto,
      {
        scheduledAt: '2026-10-01',
        startTime: '2026-10-01T10:00:00.000Z',
        endTime: '2026-10-01T11:00:00.000Z',
        propertyId: uuid,
        leadId: uuid,
        agentId: uuid,
        title: 'Visite',
        notes: 'RAS',
        status: 'PLANNED',
      },
    ],
    [
      'UpdateVisitDto',
      UpdateVisitDto,
      {
        status: 'CONFIRMED',
        scheduledAt: '2026-10-01',
        startTime: '2026-10-01T10:00:00.000Z',
        endTime: '2026-10-01T11:00:00.000Z',
        visitId: uuid,
        agentId: uuid,
        title: 'Visite',
        notes: 'RAS',
      },
    ],
    ['AssignAgentDto', AssignAgentDto, { agentId: uuid }],
    [
      'FilterAnnonceDto',
      FilterAnnonceDto,
      {
        initialPage: 1,
        limitPerPage: 10,
        city: 'Dakar',
        district: 'Almadies',
        type: 'APARTMENT',
        minPrice: 1000,
        maxPrice: 900000,
        rooms: 2,
        features: ['KITCHEN'],
      },
    ],
    [
      'CreateInvitationDto',
      CreateInvitationDto,
      {
        agencyId: uuid,
        payload: {
          name: 'Amadou',
          email: 'agent@example.com',
          role: 'AGENT',
          temporaryPassword: 'Xy7!pQ2@mN9#',
          permissions: [{ permissionId: uuid, granted: true }],
        },
      },
    ],
    [
      'CreatePlanInput',
      CreatePlanInput,
      {
        name: 'BASIC_SUB',
        commissionRate: 5.5,
        isActive: true,
        pricing: [{ billingCycle: 'MONTHLY', price: 5000, discountPercentage: 0 }],
        features: [{ featureId: uuid, enabled: true, limit: 10 }],
      },
    ],
    [
      'UpdatePlanInput',
      UpdatePlanInput,
      {
        pricing: [{ billingCycle: 'YEARLY', price: 50000, discountPercentage: 10 }],
        isActive: false,
        features: [{ featureId: uuid, enabled: false, limit: null }],
      },
    ],
    [
      'updateAgencyDto (multipart)',
      updateAgencyDto,
      {
        agencyId: uuid,
        name: 'Agence',
        description: 'Desc',
        address: 'Rue 1',
        phone: '+221770000000',
      },
    ],
    ['CreateLeadDto', CreateLeadDto, { propertyId: uuid, message: 'Intéressé' }],
    [
      'UpdateLeadStatusDto',
      UpdateLeadStatusDto,
      { leadId: uuid, agencyId: uuid, status: 'CONTACTED' },
    ],
    ['AssignLeadDto', AssignLeadDto, { leadId: uuid, agencyId: uuid, staffId: uuid }],
    ['CreateConversationDto', CreateConversationDto, { leadId: uuid }],
    [
      'CreateUserDto',
      CreateUserDto,
      { name: 'Mamadou', email: 'm@example.com', password: 'motdepasse1234' },
    ],
    ['ForgotPasswordDto', ForgotPasswordDto, { email: 'm@example.com' }],
    ['ResendVerificationDto', ResendVerificationDto, { email: 'm@example.com' }],
    ['ResetPasswordDto', ResetPasswordDto, { token: 'tok', newPassword: 'motdepasse1234' }],
    [
      'RegisterPushNotificationTokenDto',
      RegisterPushNotificationTokenDto,
      { token: 'fcm-token-0123456789', deviceKey: 'a'.repeat(64) },
    ],
    [
      'UpdateUserDto',
      UpdateUserDto,
      { name: 'Moi', email: 'm@example.com', theme_color: '#673ab6', theme_mode: 'dark' },
    ],
    ['UpdateUserStatusDto', UpdateUserStatusDto, { status: 'BANNED' }],
    ['UpdateAgencyStatusDto', UpdateAgencyStatusDto, { status: 'OPEN' }],
  ];

  // DTO déclarant userId/adminId : conservés par la whitelist puis écrasés par le contrôleur (session)
  const serverFilled = new Set<Type>([
    PropertyFilterDto,
    BuildingFilterDto,
    propertyDto,
    CreateInvitationDto,
  ]);

  it.each(cases)('%s', async (_name, metatype, payload, type = 'body') => {
    const result = await run(
      metatype,
      { ...payload, userId: 'spoofed', role: 'SUPER_ADMIN' },
      type,
    );
    const definedKeys = Object.keys(result).filter(
      (key) => result[key] !== undefined && !(serverFilled.has(metatype) && key === 'userId'),
    );

    expect(definedKeys.sort()).toEqual(Object.keys(payload).sort());
    expect(result).not.toHaveProperty('role');
    if (!serverFilled.has(metatype)) expect(result).not.toHaveProperty('userId');
  });

  it('convertit les nombres reçus en query string', async () => {
    const result = await run(PropertyFilterDto, { initialPage: '3', limitPerPage: '20' }, 'query');
    expect(result).toMatchObject({ initialPage: 3, limitPerPage: 20 });
  });

  it('conserve les objets imbriqués (invitation, plans)', async () => {
    const invitation = await run(CreateInvitationDto, {
      agencyId: uuid,
      payload: {
        name: 'A',
        email: 'a@example.com',
        role: 'AGENT',
        temporaryPassword: 'x',
        permissions: [{ permissionId: uuid, granted: true, injected: 1 }],
      },
    });
    expect(invitation.payload).toMatchObject({
      permissions: [{ permissionId: uuid, granted: true }],
    });
    expect((invitation.payload as { permissions: object[] }).permissions[0]).not.toHaveProperty(
      'injected',
    );
  });

  it('rejette une valeur hors enum au lieu de la laisser atteindre Prisma', async () => {
    await expect(
      run(PropertyFilterDto, { status: 'NOT_A_STATUS' }, 'query'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
