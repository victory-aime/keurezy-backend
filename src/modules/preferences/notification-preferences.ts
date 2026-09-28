import { NotificationType, PropertyType } from '../../../prisma/generated/enums';

/** Catégories réglables par l'utilisateur (regroupent les types de notification). */
export const NOTIFICATION_CATEGORIES = [
  'MESSAGE',
  'BOOKING',
  'VISIT',
  'PAYMENT',
  'LISTING',
  'ACCOUNT',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CHANNELS = ['push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Sons proposés. Android associe le son au canal : un canal par son (`<canal>_<son>`). */
export const NOTIFICATION_SOUNDS = ['DEFAULT', 'SOFT', 'CHIME', 'NONE'] as const;
export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number];

export interface CategoryPreference {
  push: boolean;
  email: boolean;
}

export interface NotificationPreferences {
  categories: Record<NotificationCategory, CategoryPreference>;
  /** Nouvelles annonces : types de bien suivis (vide = tous) */
  listingPropertyTypes: PropertyType[];
  /** Son des notifications push */
  sound: NotificationSound;
  /** Son d'un nouveau message quand l'application est ouverte */
  inAppSound: boolean;
}

/** Catégorie et canaux disponibles, présentés par les applications. */
export const CATEGORY_DEFINITIONS: Record<
  NotificationCategory,
  { label: string; description: string; channels: NotificationChannel[]; locked?: boolean }
> = {
  MESSAGE: {
    label: 'Messages',
    description: 'Nouveaux messages des agences ou des clients',
    channels: ['push'],
  },
  BOOKING: {
    label: 'Réservations',
    description: 'Confirmation, refus ou annulation d’une réservation',
    channels: ['push', 'email'],
  },
  VISIT: {
    label: 'Visites',
    description: 'Planification et rappels de visite',
    channels: ['push'],
  },
  PAYMENT: {
    label: 'Paiements',
    description: 'Reçus et échéances',
    channels: ['push'],
  },
  LISTING: {
    label: 'Nouvelles annonces',
    description: 'Annonces publiées pour les types de bien que vous suivez',
    channels: ['push'],
  },
  ACCOUNT: {
    label: 'Compte et sécurité',
    description: 'Connexion, mot de passe : toujours activé',
    channels: ['push'],
    locked: true,
  },
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  categories: {
    MESSAGE: { push: true, email: false },
    BOOKING: { push: true, email: true },
    VISIT: { push: true, email: false },
    PAYMENT: { push: true, email: false },
    // Opt-in : pas de sollicitation sans demande explicite
    LISTING: { push: false, email: false },
    ACCOUNT: { push: true, email: false },
  },
  listingPropertyTypes: [],
  sound: 'DEFAULT',
  inAppSound: true,
};

/**
 * Catégorie d'un type de notification. `null` : non réglable, toujours envoyé
 * (ex. prospects côté agence, support).
 */
export function categoryOf(type: NotificationType): NotificationCategory | null {
  switch (type) {
    case NotificationType.MESSAGE:
      return 'MESSAGE';
    case NotificationType.BOOKING:
      return 'BOOKING';
    case NotificationType.VISIT:
      return 'VISIT';
    case NotificationType.PAYMENT:
      return 'PAYMENT';
    case NotificationType.LISTING:
      return 'LISTING';
    case NotificationType.SYSTEM:
      return 'ACCOUNT';
    default:
      return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Préférences complètes à partir de la valeur enregistrée (partielle, ou d'une ancienne version) :
 * valeurs par défaut pour ce qui manque, règles appliquées (compte toujours actif,
 * e-mail uniquement là où il est proposé).
 */
export function resolveNotificationPreferences(stored: unknown): NotificationPreferences {
  const source = isRecord(stored) ? stored : {};
  const storedCategories = isRecord(source.categories) ? source.categories : {};

  const categories = {} as Record<NotificationCategory, CategoryPreference>;
  for (const category of NOTIFICATION_CATEGORIES) {
    const saved = isRecord(storedCategories[category]) ? storedCategories[category] : {};
    const defaults = DEFAULT_NOTIFICATION_PREFERENCES.categories[category];
    const definition = CATEGORY_DEFINITIONS[category];
    categories[category] = {
      push: definition.locked ? true : typeof saved.push === 'boolean' ? saved.push : defaults.push,
      email:
        definition.channels.includes('email') && typeof saved.email === 'boolean'
          ? saved.email
          : definition.channels.includes('email')
            ? defaults.email
            : false,
    };
  }

  const propertyTypes = Object.values(PropertyType) as string[];
  return {
    categories,
    listingPropertyTypes: Array.isArray(source.listingPropertyTypes)
      ? (source.listingPropertyTypes.filter((type) =>
          propertyTypes.includes(type as string),
        ) as PropertyType[])
      : DEFAULT_NOTIFICATION_PREFERENCES.listingPropertyTypes,
    sound: NOTIFICATION_SOUNDS.includes(source.sound as NotificationSound)
      ? (source.sound as NotificationSound)
      : DEFAULT_NOTIFICATION_PREFERENCES.sound,
    inAppSound:
      typeof source.inAppSound === 'boolean'
        ? source.inAppSound
        : DEFAULT_NOTIFICATION_PREFERENCES.inAppSound,
  };
}

/** L'utilisateur accepte-t-il ce type de notification sur ce canal ? */
export function allowsNotification(
  preferences: NotificationPreferences,
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  const category = categoryOf(type);
  if (!category) return channel === 'push';
  return preferences.categories[category][channel];
}
