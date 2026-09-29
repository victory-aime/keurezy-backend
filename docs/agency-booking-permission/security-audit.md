# Audit de sécurité : `agency-booking-permission`

Date : 2026-09-29. Méthode : skill `security-and-hardening`.

- **Élévation de privilège.** Les routes agence des réservations passent désormais par le `PermissionGuard` global :
  - `view_bookings` pour la liste ;
  - `manage_bookings` pour confirmer, refuser et annuler.

  `agencyAccessControl` vérifie toujours l'appartenance à l'agence propriétaire de la réservation (pas d'IDOR). ✅
- **Moindre privilège.** Les membres existants ne reçoivent pas la permission automatiquement : c'est l'owner qui l'accorde. ✅
- **Fuite d'information.** Un refus renvoie le 403 générique, sans nom de permission. ✅
- **Données.** La migration ne fait qu'ajouter une valeur d'enum, sans aucune suppression. Les données passent par un seed idempotent. ✅
- **Dépendances.** Aucun ajout. Déjà constaté : `better-auth` 1.6.11 est touché par un avis de gravité haute (prise de contrôle de compte par pré-création, corrigée en ≥ 1.6.22). La mise à jour est planifiée à la fin des modules 1 à 7.

**Verdict** : rien à signaler dans le périmètre.
