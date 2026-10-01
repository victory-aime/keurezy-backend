import { LegalForm } from '../../../prisma/generated/enums';

/** Informations légales d'une agence (factures, vérification). Jamais publiques. */
export interface AgencyLegal {
  companyName: string | null;
  legalForm: LegalForm | null;
  ninea: string | null;
  rccm: string | null;
  billingAddress: string | null;
  billingEmail: string | null;
}

export const LEGAL_FIELDS = [
  'companyName',
  'legalForm',
  'ninea',
  'rccm',
  'billingAddress',
  'billingEmail',
] as const satisfies readonly (keyof AgencyLegal)[];

/** Champs d'identité : les modifier retire la vérification (à refaire par le SUPER_ADMIN). */
export const IDENTITY_FIELDS = ['companyName', 'ninea', 'rccm'] as const;

/** Champs encore vides : la vérification n'est possible que si la liste est vide. */
export function legalMissing(agency: AgencyLegal): (keyof AgencyLegal)[] {
  return LEGAL_FIELDS.filter((field) => !agency[field]?.toString().trim());
}

/** Identifiants comparables : majuscules, sans espaces (« 0012345 2g3 » → « 00123452G3 »). */
export const normalizeIdentifier = (value: string) => value.replace(/\s+/g, '').toUpperCase();

/** Une modification d'identité ? (comparaison après normalisation) */
export function changesIdentity(current: AgencyLegal, next: Partial<AgencyLegal>): boolean {
  return IDENTITY_FIELDS.some((field) => {
    const value = next[field];
    if (value === undefined) return false;
    const norm = (v: string | null) => (v ? normalizeIdentifier(v) : '');
    return field === 'companyName'
      ? (value ?? '').trim() !== (current.companyName ?? '').trim()
      : norm(value) !== norm(current[field]);
  });
}
