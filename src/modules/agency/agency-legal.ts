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

/** Pièce justificative attendue par information légale (statuts, attestation NINEA, extrait RCCM). */
export const LEGAL_PROOFS = {
  LEGAL_FORM: 'legalFormProofUrl',
  NINEA: 'nineaProofUrl',
  RCCM: 'rccmProofUrl',
} as const;

export type LegalProofKind = keyof typeof LEGAL_PROOFS;
/** Valeurs acceptées pour `kind` (validation de la requête). */
export const LEGAL_PROOF_KINDS = Object.fromEntries(
  Object.keys(LEGAL_PROOFS).map((kind) => [kind, kind]),
) as { [K in LegalProofKind]: K };
export type LegalProofField = (typeof LEGAL_PROOFS)[LegalProofKind];
export type AgencyLegalProofs = Record<LegalProofField, string | null>;

const PROOF_FIELDS = Object.values(LEGAL_PROOFS);

/** Champs d'identité : les modifier retire la vérification (à refaire par le SUPER_ADMIN). */
export const IDENTITY_FIELDS = ['companyName', 'ninea', 'rccm'] as const;

/**
 * Champs et pièces encore manquants : la vérification n'est possible que si la liste est vide.
 */
export function legalMissing(
  agency: AgencyLegal & AgencyLegalProofs,
): (keyof AgencyLegal | LegalProofField)[] {
  return [...LEGAL_FIELDS, ...PROOF_FIELDS].filter((field) => !agency[field]?.toString().trim());
}

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/**
 * Type réel d'une pièce justificative, lu dans sa signature binaire (le type annoncé par le
 * navigateur ne prouve rien). `null` : ni PNG, ni JPEG, ni PDF.
 */
export function proofFileType(buffer: Buffer | undefined): 'png' | 'jpeg' | 'pdf' | null {
  const starts = (bytes: number[]) =>
    !!buffer && buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);
  if (starts(PNG)) return 'png';
  if (starts(JPEG)) return 'jpeg';
  if (starts(PDF)) return 'pdf';
  return null;
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
