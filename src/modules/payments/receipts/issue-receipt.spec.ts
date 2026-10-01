import { formatReceiptNumber, issueReceipt } from './issue-receipt';

describe('reçus : numérotation', () => {
  it('format KRZ-année-rang sur 6 chiffres', () => {
    expect(formatReceiptNumber(42n, new Date('2026-10-02T10:00:00Z'))).toBe('KRZ-2026-000042');
  });

  it("tire le numéro de la séquence et fige l'agence (facturation, sinon coordonnées)", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ rank: 7n }]),
      agency: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          name: 'Keur Immo',
          address: 'Rue 1, Dakar',
          email: 'contact@keur.sn',
          companyName: 'Keur Immo SARL',
          legalForm: 'SARL',
          ninea: '00123452G3',
          rccm: null,
          billingAddress: null,
          billingEmail: 'compta@keur.sn',
        }),
      },
      paymentTransaction: { update: jest.fn() },
    };
    const paidAt = new Date('2026-10-02T10:00:00Z');
    await expect(issueReceipt(tx as never, 'o1', 'A', paidAt)).resolves.toBe('KRZ-2026-000007');
    expect(tx.paymentTransaction.update).toHaveBeenCalledWith({
      where: { naboo_order_id: 'o1' },
      data: {
        receiptNumber: 'KRZ-2026-000007',
        receiptAgency: {
          name: 'Keur Immo',
          companyName: 'Keur Immo SARL',
          legalForm: 'SARL',
          ninea: '00123452G3',
          rccm: null,
          address: 'Rue 1, Dakar',
          email: 'compta@keur.sn',
        },
      },
    });
  });
});
