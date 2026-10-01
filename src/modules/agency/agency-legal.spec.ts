import {
  changesIdentity,
  legalMissing,
  normalizeIdentifier,
  type AgencyLegal,
} from './agency-legal';

const complete: AgencyLegal = {
  companyName: 'Keur Immo SARL',
  legalForm: 'SARL',
  ninea: '00123452G3',
  rccm: 'SN-DKR-2020-B-12345',
  billingAddress: 'Rue 10, Dakar',
  billingEmail: 'compta@keur.sn',
};

describe('agency legal info', () => {
  it('liste les champs manquants (vides ou blancs)', () => {
    expect(legalMissing(complete)).toEqual([]);
    expect(legalMissing({ ...complete, ninea: null, rccm: '  ' })).toEqual(['ninea', 'rccm']);
  });

  it('normalise NINEA et RCCM : majuscules, sans espaces', () => {
    expect(normalizeIdentifier(' 0012345 2g3 ')).toBe('00123452G3');
  });

  it("une modification d'identité est détectée, pas celle de l'adresse ou de l'écriture", () => {
    expect(changesIdentity(complete, { ninea: '0099999 1A1' })).toBe(true);
    expect(changesIdentity(complete, { companyName: 'Autre SARL' })).toBe(true);
    expect(changesIdentity(complete, { ninea: '0012345 2g3' })).toBe(false);
    expect(changesIdentity(complete, { billingAddress: 'Ailleurs', billingEmail: 'x@y.sn' })).toBe(
      false,
    );
  });
});
