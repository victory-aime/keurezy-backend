/**
 * Impact d'une fermeture ou d'une suppression de bien (`GET property/impact`) : ce qui est lié
 * au bien, pour que l'agence sache ce que son action entraîne avant de la confirmer.
 */
export interface PropertyImpact {
  /** `online` : annonces actuellement en ligne (status ACTIVE) */
  annonces: { total: number; online: number };
  /** `upcoming` : confirmées dont le séjour n'est pas terminé ; `pending` : en attente */
  bookings: { total: number; upcoming: number; pending: number };
  conversations: number;
  /** `upcoming` : planifiées ou confirmées à venir */
  visits: { total: number; upcoming: number };
  /** Vrai seulement sans réservation, discussion ni visite */
  canDelete: boolean;
}

/** Impact d'une suppression de terrain (`GET land/impact`). */
export interface LandImpact {
  batiments: { id: string; name: string }[];
  villas: number;
  /** Vrai seulement sans bâtiment ni villa (ils seraient supprimés en cascade) */
  canDelete: boolean;
}
