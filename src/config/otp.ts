/**
 * Durées des codes OTP (vérification d'email, mot de passe oublié) et du lien de
 * réinitialisation web, configurables par environnement. Valeurs en secondes.
 */
const readSeconds = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const OTP_SETTINGS = {
  /** Validité d'un code ou d'un lien de réinitialisation (défaut : 3 minutes) */
  expiresIn: readSeconds('OTP_EXPIRES_IN_SECONDS', 180),
  /** Délai minimal entre deux envois de code (défaut : 2 minutes) */
  resendCooldown: readSeconds('OTP_RESEND_COOLDOWN_SECONDS', 120),
};
