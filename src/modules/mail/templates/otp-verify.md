# Code à usage unique

- **Variable d'environnement** : `RESEND_TEMPLATE_VERIFY_EMAIL_OTP_ID` (déjà configurée)
- **État** : le modèle sert désormais à **4 usages**. Son texte doit rester générique, et l'objet précise l'usage.

| Usage | Objet envoyé |
|---|---|
| Vérification de l'adresse e-mail | Code de vérification de votre adresse email |
| Mot de passe oublié (mobile) | Code de réinitialisation de votre mot de passe |
| Acceptation d'une invitation | Code de confirmation de votre invitation |
| Récupération de compte (2FA perdue) | Code de récupération de votre compte |

## Variables
| Variable | Contenu |
|---|---|
| `SUBJECT` | Objet, qui indique l'usage (à afficher en titre) |
| `OTP` | Code à 6 chiffres |
| `EXPIRE_TIME` | Durée de validité, ex. « 3 minutes » |
| `APP_NAME` | Nom de l'application |
| `FROM_CLIENT_EMAIL` | Adresse d'expédition (facultatif) |

## Texte

**{{{SUBJECT}}}**

Bonjour,

Voici votre code :

## {{{OTP}}}

Il est valable {{{EXPIRE_TIME}}} et ne peut servir qu'une fois.

Ne le communiquez à personne : l'équipe {{{APP_NAME}}} ne vous le demandera jamais.

Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
