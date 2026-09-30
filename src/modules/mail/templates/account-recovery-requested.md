# Récupération de compte demandée

- **Variable d'environnement** : `RESEND_TEMPLATE_ACCOUNT_RECOVERY_REQUESTED_ID` (**à créer**)
- **Objet** : `Demande de récupération de votre compte`
- **Envoyé quand** : un utilisateur qui a perdu sa 2FA (téléphone et codes de secours) a confirmé son identité (mot de passe et code). La 2FA sera désactivée après 72 h, sauf annulation.

## Variables
| Variable | Contenu |
|---|---|
| `USERNAME` | Nom du titulaire |
| `EXECUTE_AT` | Date et heure de désactivation, ex. « 03/10/2026 14:30 » |
| `CANCEL_LINK` | Lien d'annulation (usage unique) |
| `SUBJECT` | Objet |
| `APP_NAME` | Nom de l'application |

## Texte

**Demande de récupération de votre compte**

Bonjour {{{USERNAME}}},

Une demande de désactivation de la double authentification a été faite sur votre compte {{{APP_NAME}}}, après confirmation de votre mot de passe et d'un code envoyé à cette adresse.

Sans action de votre part, la double authentification sera **désactivée le {{{EXECUTE_AT}}}**. Vous pourrez alors vous connecter avec votre seul mot de passe, puis la réactiver depuis Sécurité.

**Ce n'est pas vous ?** Annulez tout de suite la demande et changez votre mot de passe : quelqu'un le connaît.

**[Ce n'est pas moi : annuler la demande]** → `{{{CANCEL_LINK}}}`

Une connexion réussie à votre compte d'ici là annule aussi la demande.

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
