import type { InvoiceRenderData } from './invoice-pdf';

/**
 * Facture d'exemple pour l'aperçu d'un modèle : informations réelles de l'agence (pour un
 * aperçu fidèle), client, réservation et lignes fictifs.
 */
export function sampleInvoice(
  agency: InvoiceRenderData['agency'],
  vatRate: number,
): InvoiceRenderData {
  const issuedAt = new Date();
  return {
    number: 'FAC-2026-0001',
    issuedAt,
    dueAt: new Date(issuedAt.getTime() + 15 * 86_400_000),
    vatRate,
    agency,
    client: {
      name: 'Aminata Diop',
      email: 'aminata.diop@exemple.sn',
      phone: '+221 77 123 45 67',
      address: 'Sicap Liberté 6, Dakar',
    },
    booking: {
      reference: 'RES-8F2A',
      period: 'Du 01/11/2026 au 30/11/2026',
      duration: '1 mois',
      rentalType: 'Location mensuelle',
      deposit: 150_000,
    },
    property: { title: 'Appartement F3 Almadies', address: 'Route des Almadies', city: 'Dakar' },
    lines: [
      {
        description: 'Loyer - Appartement F3 Almadies',
        period: 'Du 01/11/2026 au 30/11/2026',
        quantity: 1,
        unitPrice: 350_000,
      },
      { description: 'Frais de dossier', period: null, quantity: 1, unitPrice: 25_000 },
    ],
  };
}
