# Récupération de compte effectuée

- **Variable d'environnement** : `RESEND_TEMPLATE_ACCOUNT_RECOVERY_COMPLETED_ID` (**à créer**)
- **Objet** : `Double authentification désactivée sur votre compte`
- **Envoyé quand** : le délai de 72 h est écoulé sans annulation. La 2FA est désactivée et toutes les sessions sont fermées.

## Variables
| Variable | Contenu |
|---|---|
| `USERNAME` | Nom du titulaire |
| `LOGIN_LINK` | Lien vers la page de connexion |
| `SUBJECT` | Objet |
| `APP_NAME` | Nom de l'application |

## Texte

**Double authentification désactivée**

Bonjour {{{USERNAME}}},

Comme demandé il y a 72 heures, la double authentification de votre compte {{{APP_NAME}}} est désactivée, et toutes vos sessions ont été fermées.

Connectez-vous avec votre mot de passe, puis **réactivez la double authentification** depuis Sécurité. Pensez à télécharger vos nouveaux codes de secours et à ajouter une passkey de secours.

**[Se connecter]** → `{{{LOGIN_LINK}}}`

Vous n'êtes pas à l'origine de cette demande ? Changez immédiatement votre mot de passe et contactez-nous.

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
