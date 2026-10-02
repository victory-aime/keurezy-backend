# Facture envoyée au client

- **Variable d'environnement** : `RESEND_TEMPLATE_INVOICE_SENT_ID` (**à créer**). Sans elle, l'envoi d'une facture est refusé (`EMAIL_NOT_CONFIGURED`) : le bouton affiche une erreur au lieu d'un faux « envoyé ».
- **Objet** : `{{{SUBJECT}}}`, ex. « Facture FAC-2026-0001 de Mobelite ».
- **Envoyé quand** : une agence envoie (ou renvoie) une facture émise ou payée depuis le tableau de bord. Le PDF figé est joint ; `Reply-To` est l'e-mail de l'agence, le client lui répond directement.

## Variables
| Variable | Contenu |
|---|---|
| `SUBJECT` | Objet |
| `PREHEADER` | Texte d'aperçu, ex. « 125 000 F CFA, à régler avant le 17/10/2026 » |
| `AGENCY_NAME` | Nom de l'agence (figé sur la facture) |
| `CLIENT_NAME` | Nom du client de la facture |
| `INVOICE_NUMBER` | Numéro, ex. `FAC-2026-0001` |
| `AMOUNT` | Total TTC, ex. « 125 000 F CFA » |
| `DUE_DATE` | Échéance, ex. « 17/10/2026 » |
| `MESSAGE` | Message libre de l'agence, vide si aucun (retours à la ligne conservés par `white-space:pre-line`) |
| `AGENCY_CONTACT` | E-mail et téléphone de l'agence, ex. « contact@agence.sn · +221 77 000 00 00 » |
| `APP_NAME` | Nom de l'application |

Toutes les valeurs sont **échappées par le backend** : elles viennent de l'agence.

## Texte (gabarit)

**Facture {{{INVOICE_NUMBER}}}**

Bonjour {{{CLIENT_NAME}}},

Veuillez trouver ci-joint la facture {{{INVOICE_NUMBER}}} de {{{AGENCY_NAME}}}.

> Montant : {{{AMOUNT}}} — à régler avant le {{{DUE_DATE}}}

{{{MESSAGE}}}

Pour toute question, répondez directement à cet e-mail ou contactez {{{AGENCY_NAME}}} : {{{AGENCY_CONTACT}}}

Facture envoyée par {{{AGENCY_NAME}}} avec {{{APP_NAME}}}.
