import { addBillingCycle, quoteChange, QuoteCurrent } from './subscription-quote';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Standard mensuel à 10 000 XOF, période du 1er au 31 oct. (30 jours). */
const standardMonthly: QuoteCurrent = {
  running: true,
  plan: { id: 'standard', monthlyPrice: 10_000 },
  billingCycle: 'MONTHLY',
  price: 10_000,
  currentPeriodStart: day('2026-10-01'),
  currentPeriodEnd: day('2026-10-31'),
  scheduled: null,
};

const premium = { id: 'premium', monthlyPrice: 20_000 };
const basic = { id: 'basic', monthlyPrice: 5_000 };

describe('quoteChange', () => {
  it('upgrade sur le même cycle : différence au prorata, échéance inchangée', () => {
    const quote = quoteChange(
      standardMonthly,
      { plan: premium, billingCycle: 'MONTHLY', price: 20_000 },
      day('2026-10-21'),
    );
    expect(quote).toEqual({
      kind: 'UPGRADE',
      amount: 3_334, // 10 000 × 10/30 = 3 333,33 → arrondi supérieur
      effectiveAt: day('2026-10-21'),
      newPeriodEnd: day('2026-10-31'),
    });
  });

  it('upgrade le dernier jour : quelques francs, jamais zéro tant que la période court', () => {
    const now = new Date('2026-10-30T23:00:00Z');
    const quote = quoteChange(
      standardMonthly,
      { plan: premium, billingCycle: 'MONTHLY', price: 20_000 },
      now,
    );
    expect(quote.kind).toBe('UPGRADE');
    expect(quote.amount).toBe(14); // 10 000 × 1 h / 720 h = 13,9
  });

  it('mensuel vers annuel : nouvelle période au paiement, crédit du temps restant', () => {
    const now = day('2026-10-16');
    const quote = quoteChange(
      standardMonthly,
      { plan: standardMonthly.plan, billingCycle: 'YEARLY', price: 100_000 },
      now,
    );
    expect(quote).toEqual({
      kind: 'UPGRADE',
      amount: 95_000, // 100 000 − 10 000 × 15/30
      effectiveAt: now,
      newPeriodEnd: day('2027-10-16'),
    });
  });

  it("downgrade : rien à payer, effet à l'échéance", () => {
    const quote = quoteChange(
      standardMonthly,
      { plan: basic, billingCycle: 'MONTHLY', price: 5_000 },
      day('2026-10-10'),
    );
    expect(quote).toEqual({
      kind: 'DOWNGRADE',
      amount: 0,
      effectiveAt: day('2026-10-31'),
      newPeriodEnd: day('2026-11-30'),
    });
  });

  it('un plan supérieur sur un cycle plus court reste un downgrade (cycle raccourci)', () => {
    const yearly = {
      ...standardMonthly,
      billingCycle: 'YEARLY' as const,
      currentPeriodEnd: day('2027-10-01'),
    };
    const quote = quoteChange(
      yearly,
      { plan: premium, billingCycle: 'MONTHLY', price: 20_000 },
      day('2026-10-10'),
    );
    expect(quote.kind).toBe('DOWNGRADE');
  });

  it("renouvellement payé avant l'échéance : la période suit l'ancienne échéance", () => {
    const quote = quoteChange(
      standardMonthly,
      { plan: standardMonthly.plan, billingCycle: 'MONTHLY', price: 10_000 },
      day('2026-10-25'),
    );
    expect(quote).toEqual({
      kind: 'RENEWAL',
      amount: 10_000,
      effectiveAt: day('2026-10-31'),
      newPeriodEnd: day('2026-11-30'),
    });
  });

  it('tarif du catalogue modifié : le renouvellement est facturé au nouveau tarif', () => {
    // Période en cours payée 10 000 (snapshot) ; le catalogue passe à 12 000
    const quote = quoteChange(
      standardMonthly,
      { plan: standardMonthly.plan, billingCycle: 'MONTHLY', price: 12_000 },
      day('2026-10-25'),
    );
    expect(quote).toMatchObject({
      kind: 'RENEWAL',
      amount: 12_000,
      effectiveAt: day('2026-10-31'),
    });
  });

  it('renouvellement avec un downgrade programmé : prix et cycle du plan programmé', () => {
    const current = {
      ...standardMonthly,
      scheduled: { plan: basic, billingCycle: 'MONTHLY' as const, price: 5_000 },
    };
    const quote = quoteChange(
      current,
      { plan: standardMonthly.plan, billingCycle: 'MONTHLY', price: 10_000 },
      day('2026-10-25'),
    );
    expect(quote).toMatchObject({
      kind: 'RENEWAL',
      amount: 5_000,
      newPeriodEnd: day('2026-11-30'),
    });
  });

  it('sans période en cours (expirée) : réactivation plein tarif à partir du paiement', () => {
    const expired = { ...standardMonthly, running: false };
    const now = day('2026-11-05');
    const quote = quoteChange(expired, { plan: basic, billingCycle: 'YEARLY', price: 50_000 }, now);
    expect(quote).toEqual({
      kind: 'REACTIVATION',
      amount: 50_000,
      effectiveAt: now,
      newPeriodEnd: day('2027-11-05'),
    });
  });
});

describe('addBillingCycle', () => {
  it('ajoute un mois ou un an', () => {
    expect(addBillingCycle(day('2026-10-31'), 'MONTHLY')).toEqual(day('2026-11-30')); // fin de mois conservée
    expect(addBillingCycle(day('2026-10-16'), 'YEARLY')).toEqual(day('2027-10-16'));
  });
});
