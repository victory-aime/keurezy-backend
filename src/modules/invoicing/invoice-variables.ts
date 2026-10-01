/** Variables insérables dans les textes d'un modèle, par groupe (catalogue unique, exposé au web). */
export const INVOICE_VARIABLES = {
  agence: {
    nom: "Nom de l'agence",
    raison_sociale: 'Raison sociale',
    ninea: 'NINEA',
    rccm: 'RCCM',
    adresse: 'Adresse de facturation',
    telephone: 'Téléphone',
    email: 'E-mail de facturation',
  },
  client: {
    nom: 'Nom du client',
    email: 'E-mail du client',
    telephone: 'Téléphone du client',
    adresse: 'Adresse du client',
  },
  facture: {
    numero: 'Numéro de la facture',
    date: "Date d'émission",
    echeance: "Date d'échéance",
    total_ht: 'Total hors taxes',
    tva: 'Montant de la TVA',
    total_ttc: 'Total TTC',
    montant_lettres: 'Total en lettres',
  },
  reservation: {
    reference: 'Référence de la réservation',
    periode: 'Période réservée',
    duree: 'Durée',
    type: 'Type de location',
    caution: 'Caution',
  },
  bien: {
    titre: 'Titre du bien',
    adresse: 'Adresse du bien',
    ville: 'Ville du bien',
  },
} as const;

export type InvoiceVariableValues = Record<string, string>;

const TOKEN = /\{\{\s*([a-z_]+)\.([a-z_]+)\s*\}\}/g;
const isKnown = (group: string, key: string) =>
  key in ((INVOICE_VARIABLES as Record<string, Record<string, string>>)[group] ?? {});

/** Variables d'un texte absentes du catalogue (un texte valide renvoie une liste vide). */
export function unknownVariables(text: string): string[] {
  const unknown = new Set<string>();
  for (const [, group, key] of text.matchAll(TOKEN)) {
    if (!isKnown(group, key)) unknown.add(`${group}.${key}`);
  }
  // Accolades ouvertes mais pas au format attendu : refusées aussi
  if (text.replace(TOKEN, '').includes('{{')) unknown.add('{{…}}');
  return [...unknown];
}

/** Remplace chaque variable par sa valeur (vide si absente). Le résultat reste du texte brut. */
export const fillVariables = (text: string, values: InvoiceVariableValues) =>
  text.replace(TOKEN, (_, group: string, key: string) => values[`${group}.${key}`] ?? '');
