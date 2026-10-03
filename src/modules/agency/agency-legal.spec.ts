import {
  changesIdentity,
  legalMissing,
  normalizeIdentifier,
  proofFileType,
  type AgencyLegal,
  type AgencyLegalProofs,
} from './agency-legal';

const complete: AgencyLegal = {
  companyName: 'Keur Immo SARL',
  legalForm: 'SARL',
  ninea: '00123452G3',
  rccm: 'SN-DKR-2020-B-12345',
  billingAddress: 'Rue 10, Dakar',
  billingEmail: 'compta@keur.sn',
};

const proofs: AgencyLegalProofs = {
  legalFormProofUrl: 'https://res.cloudinary.com/x/raw/upload/statuts.pdf',
  nineaProofUrl: 'https://res.cloudinary.com/x/image/upload/ninea.png',
  rccmProofUrl: 'https://res.cloudinary.com/x/raw/upload/rccm.pdf',
};

describe('agency legal info', () => {
  it('liste les champs manquants (vides ou blancs)', () => {
    expect(legalMissing({ ...complete, ...proofs })).toEqual([]);
    expect(legalMissing({ ...complete, ...proofs, ninea: null, rccm: '  ' })).toEqual([
      'ninea',
      'rccm',
    ]);
  });

  it('une pièce justificative manquante bloque la vérification', () => {
    expect(legalMissing({ ...complete, ...proofs, nineaProofUrl: null })).toEqual([
      'nineaProofUrl',
    ]);
  });

  it('reconnaît PNG, JPEG et PDF à leur signature, pas à leur nom', () => {
    expect(proofFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('png');
    expect(proofFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(proofFileType(Buffer.from('%PDF-1.7\n'))).toBe('pdf');
    expect(proofFileType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(proofFileType(Buffer.from([0x25, 0x50]))).toBeNull();
    expect(proofFileType(undefined)).toBeNull();
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
