import { publicAnnonceWhere } from './public-annonce';

describe('publicAnnonceWhere', () => {
  it("n'expose que les annonces actives d'un bien actif, d'une agence à l'abonnement actif", () => {
    expect(publicAnnonceWhere()).toEqual({
      AND: [
        {
          status: 'ACTIVE',
          property: {
            isActive: true,
            agency: { subscriptions: { some: { status: 'ACTIVE' } } },
          },
        },
        {},
      ],
    });
  });

  it('combine le filtre public avec les critères de recherche sans les écraser', () => {
    const where = publicAnnonceWhere({ property: { city: 'Dakar' } });
    expect(where.AND).toContainEqual({ property: { city: 'Dakar' } });
    expect(where.AND).toHaveLength(2);
  });
});
