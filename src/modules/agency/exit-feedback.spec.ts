import { recordExitFeedback } from './exit-feedback';

describe('recordExitFeedback', () => {
  const prisma = { exitFeedback: { create: jest.fn() } };

  beforeEach(() => jest.clearAllMocks());

  it('enregistre la raison et le commentaire nettoyé', async () => {
    await recordExitFeedback(prisma as never, 'A', 'SUBSCRIPTION_CANCEL', {
      reason: 'TOO_EXPENSIVE',
      comment: '  Trop cher pour nous  ',
    });
    expect(prisma.exitFeedback.create).toHaveBeenCalledWith({
      data: {
        agencyId: 'A',
        context: 'SUBSCRIPTION_CANCEL',
        reason: 'TOO_EXPENSIVE',
        comment: 'Trop cher pour nous',
      },
    });
  });

  it("questionnaire passé (vide ou absent) : rien n'est enregistré", async () => {
    await recordExitFeedback(prisma as never, 'A', 'AGENCY_CLOSE', undefined);
    await recordExitFeedback(prisma as never, 'A', 'AGENCY_CLOSE', { comment: '   ' });
    expect(prisma.exitFeedback.create).not.toHaveBeenCalled();
  });
});
