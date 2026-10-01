# Rappel de renouvellement d'abonnement

- **Variable d'environnement** : `RESEND_TEMPLATE_SUBSCRIPTION_RENEWAL_REMINDER_ID` (**à créer**)
- **Objet** : `Votre abonnement se termine dans {{{DAYS_LEFT}}}`, envoyé par le backend
- **Envoyé quand** : 7, 3 puis 1 jour avant l'échéance d'un abonnement actif, non résilié et pas encore renouvelé. Un seul envoi par palier. Le paiement est manuel (Wave, Orange Money) : sans ce rappel, l'agence expire sans prévenir. Une notification in-app part en même temps.

## Variables
| Variable | Contenu |
|---|---|
| `USERNAME` | Nom de l'owner |
| `AGENCY_NAME` | Nom de l'agence |
| `PLAN_NAME` | Plan en cours |
| `END_DATE` | Échéance, ex. « 31/10/2026 » |
| `DAYS_LEFT` | « 7 jours », « 3 jours » ou « 1 jour » |
| `RENEW_LINK` | Page « Mon abonnement » du tableau de bord |
| `SUBJECT` | Objet |
| `APP_NAME` | Nom de l'application |

## Texte

**Votre abonnement se termine dans {{{DAYS_LEFT}}}**

Bonjour {{{USERNAME}}},

L'abonnement **{{{PLAN_NAME}}}** de **{{{AGENCY_NAME}}}** se termine le **{{{END_DATE}}}**.

Le renouvellement se fait en quelques secondes par Wave ou Orange Money. Payé avant l'échéance, il démarre à la fin de la période en cours : vous ne perdez aucun jour.

Sans renouvellement, vos annonces seront masquées et le tableau de bord passera en lecture seule à cette date. Les réservations confirmées restent honorées.

**[Renouveler mon abonnement]** → `{{{RENEW_LINK}}}`

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
