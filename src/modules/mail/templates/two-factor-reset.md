# Double authentification réinitialisée par l'agence

- **Variable d'environnement** : `RESEND_TEMPLATE_TWO_FACTOR_RESET_ID` (**à créer**)
- **Objet** : `Votre double authentification a été réinitialisée`
- **Envoyé quand** : le propriétaire de l'agence réinitialise la 2FA d'un membre qui a perdu son téléphone et ses codes. Les sessions du membre sont fermées.

## Variables
| Variable | Contenu |
|---|---|
| `USERNAME` | Nom du membre |
| `AGENCY_NAME` | Nom de l'agence |
| `LOGIN_LINK` | Lien vers la page de connexion |
| `SUBJECT` | Objet |
| `APP_NAME` | Nom de l'application |

## Texte

**Votre double authentification a été réinitialisée**

Bonjour {{{USERNAME}}},

Le propriétaire de l'agence **{{{AGENCY_NAME}}}** a réinitialisé la double authentification de votre compte, et vos sessions ont été fermées.

Connectez-vous avec votre mot de passe, puis **réactivez la double authentification** depuis Sécurité, en scannant un nouveau QR code et en gardant vos nouveaux codes de secours.

**[Se connecter]** → `{{{LOGIN_LINK}}}`

Vous n'avez rien demandé ? Contactez le propriétaire de votre agence.

© 2026 {{{APP_NAME}}} · Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
