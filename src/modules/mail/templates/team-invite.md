# Invitation d'équipe

- **Variable d'environnement** : `RESEND_TEMPLATE_TEAM_INVITE_ID` (déjà configurée)
- **Objet** : `Invitation Email` (défini dans `resend.service.ts`)
- **État** : texte à **mettre à jour**. Le mot de passe temporaire n'existe plus : l'invité choisit le sien après avoir saisi un code reçu par e-mail.

## Variables
| Variable | Contenu |
|---|---|
| `USERNAME` | Nom de la **personne invitée** (et non de l'administrateur) |
| `AGENCY_NAME` | Nom de l'agence qui invite |
| `USER_EMAIL` | Adresse invitée |
| `REDIRECT_LINK` | Lien vers la page d'invitation (aperçu, puis code) |
| `EXPIRE_TIME` | Durée de validité, ex. « 7 jours » |
| `SUBJECT` | Objet |

À supprimer du modèle : `USER_PASSWORD` (n'est plus envoyée).

## Texte

**Vous êtes invité à rejoindre {{{AGENCY_NAME}}}**

Bonjour {{{USERNAME}}},

L'agence **{{{AGENCY_NAME}}}** vous invite à rejoindre son équipe en tant que collaborateur.

Cette invitation est liée à l'adresse : 📧 {{{USER_EMAIL}}}

Cliquez sur le bouton ci-dessous pour voir l'invitation. Nous vous enverrons un code de confirmation à cette adresse, puis vous choisirez votre mot de passe.

**[Voir l'invitation]** → `{{{REDIRECT_LINK}}}`

Cette invitation expire dans {{{EXPIRE_TIME}}}. Passé ce délai, demandez une nouvelle invitation à votre agence.

Si vous n'attendiez pas cette invitation, ignorez simplement cet e-mail : aucun compte ne sera créé sans votre confirmation.

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
