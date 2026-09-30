# Statut de réservation

- **Variable d'environnement** : `RESEND_TEMPLATE_BOOKING_STATUS_ID` (**à créer** : elle est absente, donc les e-mails de réservation sont actuellement ignorés)
- **Objet** : `Votre réservation est {{{STATUS_LABEL}}}`, envoyé par le backend
- **Envoyé quand** : l'agence confirme, refuse ou annule une réservation.

## Variables
| Variable | Contenu |
|---|---|
| `USERNAME` | Nom du client |
| `STATUS_LABEL` | « confirmée », « refusée » ou « annulée » |
| `PROPERTY_TITLE` | Titre du bien |
| `PERIOD` | Ex. « du 05/10/2026 au 12/10/2026 » |
| `MESSAGE` | Motif du refus ou de l'annulation (peut être vide) |
| `SUBJECT` | Objet |
| `APP_NAME` | Nom de l'application |

## Texte

**Votre réservation est {{{STATUS_LABEL}}}**

Bonjour {{{USERNAME}}},

Votre réservation pour **{{{PROPERTY_TITLE}}}**, {{{PERIOD}}}, est **{{{STATUS_LABEL}}}**.

{{{MESSAGE}}}

Retrouvez le détail de vos réservations dans l'application {{{APP_NAME}}}.

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
