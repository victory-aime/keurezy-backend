import { renderReceiptPdf } from './receipt-pdf';

/**
 * Texte d'un PDF non compressé : chaque bloc `[<hex> crénage <hex>] TJ` de pdfkit (police
 * standard, codage WinAnsi) est recollé puis décodé.
 */
const pdfText = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/\[([^\]]*)\] TJ/g)]
    .map(([, run]) =>
      [...run.matchAll(/<([0-9a-f]*)>/gi)]
        .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
        .join(''),
    )
    .join('\n');

describe('renderReceiptPdf', () => {
  const data = {
    number: 'KRZ-2026-000042',
    paidAt: new Date('2026-10-02T10:00:00Z'),
    amount: 10_000,
    plan: 'STANDARD_SUB',
    billingCycle: 'MONTHLY' as const,
    periodStart: new Date('2026-10-02T00:00:00Z'),
    periodEnd: new Date('2026-11-02T00:00:00Z'),
    orderId: 'ORDER-123',
    agency: {
      name: 'Keur Immo',
      companyName: 'Keur Immo SARL',
      legalForm: 'SARL',
      ninea: '00123452G3',
      rccm: 'SN-DKR-2020-B-12345',
      address: 'Rue 10, Dakar',
      email: 'compta@keur.sn',
    },
  };

  it('produit un PDF avec le numéro, le montant, la période et les deux parties', async () => {
    process.env.KEUREZY_LEGAL_NAME = 'Keurezy SAS';
    const pdf = await renderReceiptPdf(data, { compress: false });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(pdf);
    for (const expected of [
      'KRZ-2026-000042',
      '10 000 F CFA',
      'Du 02/10/2026 au 02/11/2026',
      'Keur Immo SARL',
      'NINEA : 00123452G3',
      'Keurezy SAS',
      'Abonnement Standard (mensuel)',
      'ORDER-123',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('informations de Keurezy absentes : « à compléter », jamais vide', async () => {
    delete process.env.KEUREZY_NINEA;
    const text = pdfText(await renderReceiptPdf(data, { compress: false }));
    expect(text).toContain('NINEA : à compléter');
  });
});
