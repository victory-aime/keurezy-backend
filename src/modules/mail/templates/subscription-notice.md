# Avis d'abonnement (modèle générique)

- **Variable d'environnement** : `RESEND_TEMPLATE_SUBSCRIPTION_NOTICE_ID` (**à créer**). Remplace `RESEND_TEMPLATE_SUBSCRIPTION_RENEWAL_REMINDER_ID`, qui n'est plus lue (son texte annonçait l'ancienne expiration en lecture seule).
- **Objet** : `{{{SUBJECT}}}`, rédigé par le backend.
- **Un seul modèle pour tous les avis d'abonnement** : le backend (`subscription-lifecycle.listener.ts`) rédige le texte de chaque cas. Changer un texte ne demande donc pas de toucher à Resend. Une notification in-app part en même temps.

## Envoyé quand
| Cas | Quand |
|---|---|
| Rappel d'échéance | 7, 3 puis 1 jour avant l'échéance (abonnement actif, non résilié). Texte selon le cas : renouvellement simple, downgrade programmé vers un plan payant, ou passage programmé au Gratuit (« rien à payer »). |
| Paiement confirmé | Paiement d'abonnement appliqué : montant, plan, période couverte. Sans reçu PDF (futur module facturation). |
| Passage au plan Gratuit | Fin de période sans renouvellement, ou downgrade programmé vers le Gratuit appliqué. |
| Downgrade appliqué | Downgrade programmé vers un plan payant appliqué, la période étant renouvelée. |

## Variables
| Variable | Contenu |
|---|---|
| `SUBJECT` | Objet, ex. « Votre abonnement se termine dans 3 jours » |
| `PREHEADER` | Texte d'aperçu de la boîte de réception |
| `HEADLINE` | Titre de l'e-mail |
| `USERNAME` | Nom de l'owner |
| `HIGHLIGHT` | Encadré, l'information principale, ex. « 10 000 F CFA pour le plan Standard, du 31/10/2026 au 30/11/2026. » |
| `BODY` | Paragraphe d'explication |
| `CTA_LABEL` | Texte du bouton, ex. « Renouveler mon abonnement » |
| `CTA_LINK` | Lien du bouton (page Abonnement du tableau de bord) |
| `APP_NAME` | Nom de l'application |

Toutes les valeurs sont **échappées par le backend** : le nom d'agence vient de l'utilisateur et Resend insère `{{{…}}}` sans échappement.

## Texte (gabarit)

**{{{HEADLINE}}}**

Bonjour {{{USERNAME}}},

> {{{HIGHLIGHT}}}

{{{BODY}}}

**[{{{CTA_LABEL}}}]** → `{{{CTA_LINK}}}`

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
