/** Noms affichés des plans (mêmes libellés que le web), pour les e-mails et les reçus. */
export const PLAN_LABELS: Record<string, string> = {
  FREE_SUB: 'Gratuit',
  BASIC_SUB: 'Débutant',
  STANDARD_SUB: 'Standard',
  PREMIUM_SUB: 'Entreprise',
};

export const planLabel = (name: string | undefined) => (name ? (PLAN_LABELS[name] ?? name) : '');
