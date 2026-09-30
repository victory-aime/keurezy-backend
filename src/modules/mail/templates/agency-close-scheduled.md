# Fermeture d'agence programmée

- **Variable d'environnement** : `RESEND_TEMPLATE_AGENCY_CLOSE_SCHEDULED_ID` (**à créer**)
- **Objet** : `Fermeture de {{{AGENCY_NAME}}} programmée`, envoyé par le backend
- **Envoyé quand** : l'owner programme la fermeture de son agence (« Supprimer mon compte » ou « Fermer l'agence »). La fermeture a lieu 15 jours plus tard, annulable d'ici là. L'e-mail laisse une trace hors de l'application, même si la demande ne vient pas de l'owner.

## Variables
| Variable | Contenu |
|---|---|
| `USERNAME` | Nom de l'owner |
| `AGENCY_NAME` | Nom de l'agence |
| `CLOSE_DATE` | Date de fermeture, ex. « 15/10/2026 » |
| `CANCEL_LINK` | Page Sécurité du tableau de bord, où la fermeture s'annule |
| `SUBJECT` | Objet |
| `APP_NAME` | Nom de l'application |

## Texte

**Fermeture de {{{AGENCY_NAME}}} programmée**

Bonjour {{{USERNAME}}},

La fermeture de votre agence **{{{AGENCY_NAME}}}** est programmée pour le **{{{CLOSE_DATE}}}**.

Rien ne change d'ici là : votre agence, vos annonces et votre équipe fonctionnent normalement. À cette date, l'accès au tableau de bord, celui de votre équipe et votre abonnement prendront fin. L'historique de l'agence sera conservé pour vos obligations comptables.

Vous pouvez annuler la fermeture à tout moment avant cette date :

**[Annuler la fermeture]** → `{{{CANCEL_LINK}}}`

Vous n'êtes pas à l'origine de cette demande ? Annulez-la et changez votre mot de passe.

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
