import { ArgumentMetadata, BadRequestException, Type } from '@nestjs/common';
import { createValidationPipe } from './validation-pipe';
import {
  BuildingFilterDto,
  CreateBuildingDto,
  UpdateBuildingDto,
} from '../modules/building/building.dto';
import { CreateLandDto, LandFilterDto, UpdateLandDto } from '../modules/land/land.dto';
import { PropertyFilterDto, PropertyDto } from '../modules/property/property.dto';
import { AssignAgentDto, CreateVisitDto, UpdateVisitDto } from '../modules/visits/visits.dto';
import {
  AnnonceAvailabilityDto,
  AnnonceQuoteDto,
  CreateAnnonceDto,
  FilterAnnonceDto,
  UpdateAnnonceDto,
} from '../modules/annonce/annonce.dto';
import {
  AgencyBookingsQueryDto,
  CancelBookingDto,
  CreateBookingDto,
  RejectBookingDto,
} from '../modules/bookings/bookings.dto';
import { CreateInvitationDto } from '../modules/invitations/invitation.dto';
import { CreatePlanDto, UpdatePlanDto } from '../modules/packs/pack.dto';
import { CreateAgencyOwnerDto, UpdateAgencyDto } from '../modules/agency/agency.dto';
import { MultipartJson } from './multipart-json.decorator';
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

// Payloads identiques à ceux des formulaires du front (LandForm, BuildingForm)
const landPayload = {
  title: 'Terrain Almadies',
  purchasePrice: 15000000,
  area: 500.5,
  city: 'Dakar',
  paymentType: 'CASH',
  district: 'Almadies',
  address: 'Route de Ngor',
  landOwner: null,
  status: 'AVAILABLE',
  agencyId: uuid,
};

const buildingPayload = {
  name: 'Résidence',
  description: 'R+5',
  city: 'Dakar',
  district: 'Almadies',
  address: 'Rue 12',
  buildingOwner: 'M. Diallo',
  status: 'AVAILABLE',
  floors: 5,
  agencyId: uuid,
  landId: null,
};

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
      'PropertyDto',
      PropertyDto,
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
        rentalConfigs: [
          {
            rentalType: 'MONTHLY',
            price: 150000,
            deposit: 300000,
            minDuration: 1,
            maxDuration: 12,
            isActive: true,
            availabilities: [{ startDate: '2026-08-01', endDate: '2026-08-30' }],
          },
        ],
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
        rentalType: 'NIGHTLY',
      },
    ],
    [
      'AnnonceAvailabilityDto',
      AnnonceAvailabilityDto,
      { id: uuid, rentalType: 'MONTHLY', from: '2026-10-01', to: '2027-09-30' },
      'query',
    ],
    [
      'CreateBookingDto',
      CreateBookingDto,
      {
        annonceId: uuid,
        rentalType: 'MONTHLY',
        startDate: '2026-10-01',
        duration: 3,
        notes: 'Arrivée le matin',
      },
    ],
    ['RejectBookingDto', RejectBookingDto, { reason: 'Travaux prévus' }],
    ['CancelBookingDto', CancelBookingDto, { reason: 'Changement de programme' }],
    [
      'AgencyBookingsQueryDto',
      AgencyBookingsQueryDto,
      { agencyId: uuid, status: 'PENDING' },
      'query',
    ],
    [
      'AnnonceQuoteDto',
      AnnonceQuoteDto,
      { annonceId: uuid, rentalType: 'NIGHTLY', startDate: '2026-10-05', duration: 3 },
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
      'CreatePlanDto',
      CreatePlanDto,
      {
        name: 'BASIC_SUB',
        commissionRate: 5.5,
        isActive: true,
        pricing: [{ billingCycle: 'MONTHLY', price: 5000, discountPercentage: 0 }],
        features: [{ featureId: uuid, enabled: true, limit: 10 }],
      },
    ],
    [
      'UpdatePlanDto',
      UpdatePlanDto,
      {
        pricing: [{ billingCycle: 'YEARLY', price: 50000, discountPercentage: 10 }],
        isActive: false,
        features: [{ featureId: uuid, enabled: false, limit: null }],
      },
    ],
    [
      'UpdateAgencyDto (multipart)',
      UpdateAgencyDto,
      {
        agencyId: uuid,
        name: 'Agence',
        description: 'Desc',
        address: 'Rue 1',
        phone: '+221770000000',
      },
    ],
    ['CreateLeadDto', CreateLeadDto, { propertyId: uuid, message: 'Intéressé' }],
    ['UpdateLeadStatusDto', UpdateLeadStatusDto, { leadId: uuid, status: 'CONTACTED' }],
    ['AssignLeadDto', AssignLeadDto, { leadId: uuid, staffId: uuid }],
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
    [
      'LandFilterDto (query)',
      LandFilterDto,
      {
        agencyId: uuid,
        initialPage: '1',
        limitPerPage: '10',
        title: 'Terrain',
        status: 'AVAILABLE',
        city: 'Dakar',
      },
      'query',
    ],
    // Champs JSON des formulaires multipart (validés via @MultipartJson)
    ['CreateLandDto (multipart)', CreateLandDto, landPayload],
    ['UpdateLandDto (multipart)', UpdateLandDto, { ...landPayload, id: uuid }],
    ['CreateBuildingDto (multipart)', CreateBuildingDto, buildingPayload],
    ['UpdateBuildingDto (multipart)', UpdateBuildingDto, { ...buildingPayload, id: uuid }],
    [
      'CreateAnnonceDto (multipart)',
      CreateAnnonceDto,
      {
        title: 'F3 Almadies',
        description: 'Lumineux',
        status: 'ACTIVE',
        propertyId: uuid,
        agencyId: uuid,
      },
    ],
    [
      'UpdateAnnonceDto (multipart)',
      UpdateAnnonceDto,
      {
        id: uuid,
        title: 'F3',
        description: 'Lumineux',
        status: 'INACTIVE',
        propertyId: uuid,
        agencyId: uuid,
      },
    ],
    [
      'CreateAgencyOwnerDto (multipart, onboarding)',
      CreateAgencyOwnerDto,
      {
        name: 'Agence Dakar',
        username: 'Mamadou',
        userEmail: 'owner@example.com',
        password: 'MotDePasse1234',
        email: 'contact@agence.sn',
        address: 'Rue 10, Dakar',
        phone: '+221770000000',
        description: 'Agence spécialisée en location résidentielle',
        acceptTerms: true,
        plan: { planId: uuid, billingCycle: 'MONTHLY' },
      },
    ],
  ];

  it.each(cases)('%s', async (_name, metatype, payload, type = 'body') => {
    const result = await run(
      metatype,
      { ...payload, userId: 'spoofed', ownerId: 'spoofed', role: 'SUPER_ADMIN' },
      type,
    );
    // Aucun champ envoyé par le client ne doit disparaître
    const lostKeys = Object.keys(payload).filter(
      (key) => payload[key] !== undefined && result[key] === undefined,
    );

    expect(lostKeys).toEqual([]);
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('ownerId');
    expect(result).not.toHaveProperty('role');
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

  it("conserve acceptTerms=true envoyé en booléen dans le JSON d'onboarding", async () => {
    const result = await run(CreateAgencyOwnerDto, {
      name: 'Agence',
      username: 'M',
      userEmail: 'o@example.com',
      password: 'MotDePasse1234',
      email: 'c@example.com',
      address: 'Rue',
      phone: '+221770000000',
      description: 'Description',
      acceptTerms: true,
      plan: { planId: uuid },
    });
    expect(result.acceptTerms).toBe(true);
  });
});

describe('@MultipartJson', () => {
  // Récupère le pipe attaché par le décorateur sur un paramètre
  const pipeOf = (metatype: Type) => {
    class Probe {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handler(@MultipartJson('data', metatype) _data: unknown) {}
    }
    const args = Reflect.getMetadata('__routeArguments__', Probe, 'handler') as Record<
      string,
      { pipes: { transform: (v: unknown) => Promise<Record<string, unknown>> }[] }
    >;
    return Object.values(args)[0].pipes[0];
  };

  it('parse et valide le JSON en supprimant les champs non déclarés', async () => {
    const result = await pipeOf(CreateLandDto).transform(
      JSON.stringify({ ...landPayload, userId: 'spoofed', id: 'forced-id' }),
    );
    expect(result).toMatchObject({ title: 'Terrain Almadies', area: 500.5 });
    expect(result).not.toHaveProperty('userId');
    expect(result.id).toBeUndefined();
  });

  it('rejette un JSON invalide ou un payload non conforme', async () => {
    await expect(pipeOf(CreateLandDto).transform('{oops')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      pipeOf(CreateLandDto).transform(JSON.stringify({ ...landPayload, status: 'NOPE' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
