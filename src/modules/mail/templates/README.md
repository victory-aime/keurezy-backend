# Modèles d'e-mails Resend

Les e-mails transactionnels passent par des **modèles hébergés chez Resend**. Le backend n'envoie que l'identifiant du modèle et ses variables (`resend.service.ts`, `EMAIL_TEMPLATE_RUNTIME_ID`). Chaque fichier `.md` de ce dossier donne l'objet, les variables et le texte à saisir dans Resend.

- Dans Resend, une variable s'écrit `{{{NOM}}}` (triple accolade). Les noms sont **sensibles à la casse**.
- Après la création d'un modèle, renseigne son identifiant dans la variable d'environnement indiquée, sur **tous** les environnements (local, UAT, production).
- Un modèle non configuré n'interrompt pas l'action : l'e-mail est ignoré, avec un avertissement dans les logs.

## Inventaire (au 02/10/2026)

Chaque modèle a un fichier **`.html` prêt à coller** dans Resend (éditeur HTML) : même gabarit pour tous, avec des styles en ligne pour la compatibilité avec les clients mail. Quand il existe, le `.md` associé détaille l'objet et les variables.

| Modèle | Variable d'environnement | État | HTML | Détail |
|---|---|---|---|---|
| Invitation d'équipe | `RESEND_TEMPLATE_TEAM_INVITE_ID` | Configuré : **remplacer par le nouveau HTML** (plus de mot de passe) | [team-invite.html](team-invite.html) | [team-invite.md](team-invite.md) |
| Code à usage unique (4 usages) | `RESEND_TEMPLATE_VERIFY_EMAIL_OTP_ID` | Configuré : **remplacer** (texte générique) | [otp-verify.html](otp-verify.html) | [otp-verify.md](otp-verify.md) |
| Vérification d'e-mail (lien) | `RESEND_TEMPLATE_EMAIL_VERIFY_ID` | Configuré (HTML fourni pour harmoniser) | [email-verify.html](email-verify.html) | — |
| Réinitialisation du mot de passe (lien) | `RESEND_TEMPLATE_RESET_PASSWORD_ID` | Configuré (HTML fourni pour harmoniser) | [reset-password.html](reset-password.html) | — |
| Changement d'e-mail (lien) | `RESEND_TEMPLATE_UPDATE_EMAIL_ID` | Configuré (HTML fourni pour harmoniser) | [update-email.html](update-email.html) | — |
| Statut de réservation | `RESEND_TEMPLATE_BOOKING_STATUS_ID` | **À créer** (les e-mails de réservation sont ignorés d'ici là) | [booking-status.html](booking-status.html) | [booking-status.md](booking-status.md) |
| Récupération demandée | `RESEND_TEMPLATE_ACCOUNT_RECOVERY_REQUESTED_ID` | **À créer**, indispensable avant la production | [account-recovery-requested.html](account-recovery-requested.html) | [account-recovery-requested.md](account-recovery-requested.md) |
| Récupération effectuée | `RESEND_TEMPLATE_ACCOUNT_RECOVERY_COMPLETED_ID` | **À créer** | [account-recovery-completed.html](account-recovery-completed.html) | [account-recovery-completed.md](account-recovery-completed.md) |
| 2FA réinitialisée par l'owner | `RESEND_TEMPLATE_TWO_FACTOR_RESET_ID` | **À créer** | [two-factor-reset.html](two-factor-reset.html) | [two-factor-reset.md](two-factor-reset.md) |
| Fermeture d'agence programmée | `RESEND_TEMPLATE_AGENCY_CLOSE_SCHEDULED_ID` | **À créer** | [agency-close-scheduled.html](agency-close-scheduled.html) | [agency-close-scheduled.md](agency-close-scheduled.md) |
| Avis d'abonnement (rappel d'échéance, paiement confirmé, passage au Gratuit, downgrade) | `RESEND_TEMPLATE_SUBSCRIPTION_NOTICE_ID` | **À créer** ; remplace l'ancien rappel `RESEND_TEMPLATE_SUBSCRIPTION_RENEWAL_REMINDER_ID`, plus lu (la notification in-app part quand même) | [subscription-notice.html](subscription-notice.html) | [subscription-notice.md](subscription-notice.md) |
| Facture envoyée au client (PDF joint) | `RESEND_TEMPLATE_INVOICE_SENT_ID` | **À créer** ; sans lui, l'envoi d'une facture est refusé | [invoice-sent.html](invoice-sent.html) | [invoice-sent.md](invoice-sent.md) |
| `OTP`, `WELCOME` | `RESEND_TEMPLATE_OTP_ID`, `RESEND_TEMPLATE_WELCOME_ID` | Déclarés mais **jamais envoyés** : rien à créer | — | — |

Plus aucun gabarit n'est compilé côté serveur : `otp.hbs`, son compilateur et la dépendance `handlebars` ont été supprimés. Tous les e-mails passent par Resend.

## Variables communes
- `APP_NAME` : nom de l'application (`APP_NAME` de l'environnement).
- `SUBJECT` : objet de l'e-mail, également envoyé comme variable pour les modèles qui l'affichent en titre.
