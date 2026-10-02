import { amountInWords, numberToFrenchWords } from './amount-in-words';
import { invoiceTotals, renderInvoicePdf } from './invoice-pdf';
import { DEFAULT_INVOICE_TEMPLATES, InvoiceSignatureStyle } from './invoice-template.config';
import { fillVariables, unknownVariables } from './invoice-variables';
import { sampleInvoice } from './sample-invoice';

/** Texte d'un PDF non compressé (blocs `[<hex> … ] TJ` de pdfkit recollés). */
const pdfText = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/\[([^\]]*)\] TJ/g)]
    .map(([, run]) =>
      [...run.matchAll(/<([0-9a-f]*)>/gi)]
        .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
        .join(''),
    )
    .join('\n')
    // Retours à la ligne du tableau : on compare le texte comme une seule ligne
    .replace(/\n/g, ' ');

describe('montant en lettres', () => {
  it.each([
    [0, 'zéro'],
    [21, 'vingt et un'],
    [71, 'soixante et onze'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [99, 'quatre-vingt-dix-neuf'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [1000, 'mille'],
    [80_000, 'quatre-vingt mille'],
    [200_000, 'deux cent mille'],
    [375_000, 'trois cent soixante-quinze mille'],
    [1_000_000, 'un million'],
    [2_500_000, 'deux millions cinq cent mille'],
  ])('%i → %s', (n, words) => expect(numberToFrenchWords(n)).toBe(words));

  it('ajoute la devise', () => {
    expect(amountInWords(10_000)).toBe('dix mille francs CFA');
    expect(amountInWords(1)).toBe('un franc CFA');
  });
});

describe('variables des modèles', () => {
  it('refuse les variables inconnues et les accolades mal formées', () => {
    expect(unknownVariables('Bonjour {{client.nom}}, {{ facture.echeance }}')).toEqual([]);
    expect(unknownVariables('{{client.mot_de_passe}} {{x.y}}')).toEqual([
      'client.mot_de_passe',
      'x.y',
    ]);
    expect(unknownVariables('{{client.nom')).toEqual(['{{…}}']);
  });

  it('remplace par la valeur, sans interpréter le contenu', () => {
    expect(fillVariables('À {{client.nom}}', { 'client.nom': '<b>Awa</b>' })).toBe('À <b>Awa</b>');
    expect(fillVariables('{{bien.ville}}', {})).toBe('');
  });

  it('les modèles par défaut ne contiennent que des variables connues', () => {
    for (const { config } of DEFAULT_INVOICE_TEMPLATES) {
      for (const text of Object.values(config.texts)) expect(unknownVariables(text)).toEqual([]);
    }
  });
});

describe('renderInvoicePdf', () => {
  const agency = {
    name: 'Keur Immo',
    companyName: 'Keur Immo SARL',
    ninea: '00123452G3',
    rccm: 'SN-DKR-2020-B-12345',
    address: 'Rue 10, Dakar',
    phone: '+221 33 800 00 00',
    email: 'compta@keur.sn',
    bankName: 'CBAO',
    bankAccount: 'SN012 01001 012345678901 85',
    mobileMoneyNumber: '+221 77 000 00 00',
  };

  it('totaux HT, TVA et TTC arrondis au franc', () => {
    expect(invoiceTotals(sampleInvoice(agency, 18).lines, 18)).toEqual({
      ht: 375_000,
      vat: 67_500,
      ttc: 442_500,
    });
  });

  it.each(DEFAULT_INVOICE_TEMPLATES.map((t) => [t.name, t.config] as const))(
    'modèle %s : numéro, client, lignes, totaux, en lettres',
    async (_, config) => {
      const text = pdfText(
        await renderInvoicePdf(config, sampleInvoice(agency, 18), { compress: false }),
      );
      for (const expected of [
        'FAC-2026-0001',
        'Aminata Diop',
        'Loyer - Appartement F3 Almadies',
        '442 500 F CFA',
        'quatre cent quarante-deux mille cinq cents francs CFA',
      ]) {
        expect(text).toContain(expected);
      }
    },
  );

  it('sans TVA : « TVA non applicable » ; facture annulée : mention ANNULÉE', async () => {
    const config = DEFAULT_INVOICE_TEMPLATES[0].config;
    const text = pdfText(
      await renderInvoicePdf(
        config,
        { ...sampleInvoice(agency, 0), cancelled: true },
        { compress: false },
      ),
    );
    expect(text).toContain('TVA non applicable.');
    expect(text).toContain('ANNULÉE');
  });

  it('cachet généré : raison sociale, NINEA et RCCM dans la zone de signature', async () => {
    const config = {
      ...DEFAULT_INVOICE_TEMPLATES[0].config,
      blocks: { legal: false, bank: false, signature: true },
      signatureStyle: InvoiceSignatureStyle.GENERATED,
      texts: { ...DEFAULT_INVOICE_TEMPLATES[0].config.texts, footer: '' },
    };
    const text = pdfText(
      await renderInvoicePdf(config, sampleInvoice(agency, 18), { compress: false }),
    );
    expect(text).toContain('KEUR IMMO SARL');
    expect(text).toContain('NINEA 00123452G3 RCCM SN-DKR-2020-B-12345');
  });

  it('cachet scanné illisible : la facture reste générée', async () => {
    const config = {
      ...DEFAULT_INVOICE_TEMPLATES[0].config,
      blocks: { legal: true, bank: true, signature: true },
      signatureStyle: InvoiceSignatureStyle.IMAGE,
    };
    const pdf = await renderInvoicePdf(config, {
      ...sampleInvoice({ ...agency, stamp: Buffer.from('pas une image') }, 18),
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
