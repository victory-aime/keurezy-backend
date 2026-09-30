import {
  checkInvitationCode,
  encodeStoredCode,
  generateInvitationCode,
  maskEmail,
} from './invitation-code';

describe('invitation-code', () => {
  it('génère un code à 6 chiffres', () => {
    for (let i = 0; i < 20; i++) expect(generateInvitationCode()).toMatch(/^\d{6}$/);
  });

  it('ne stocke que l’empreinte, et reconnaît le bon code', () => {
    const stored = encodeStoredCode('482913', 2);
    expect(stored).not.toContain('482913');
    expect(checkInvitationCode(stored, '482913')).toEqual({ valid: true, attempts: 2 });
    expect(checkInvitationCode(stored, '000000')).toEqual({ valid: false, attempts: 2 });
  });

  it('masque l’adresse e-mail', () => {
    expect(maskEmail('victory@gmail.com')).toBe('v*****y@gmail.com');
    expect(maskEmail('ab@x.sn')).toBe('a@x.sn');
  });
});
