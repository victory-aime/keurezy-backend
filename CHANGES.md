# Changements majeurs — Backend

Résumé des évolutions structurantes depuis `main`. Le détail est dans l'historique git ; ce document liste ce qu'il faut savoir pour développer et déployer.

## 1. Sécurité et validation

- **Identité issue de la session.** Les contrôleurs n'acceptent plus de `userId` venant du client. Les décorateurs `@CurrentUserId()` et `@AgencyProfileId()` lisent la session Better Auth. Toute ressource est contrôlée par rapport à son `agencyId` via `agencyAccessControl`.
- **Whitelist globale.** Le `ValidationPipe` supprime tout champ non déclaré dans un DTO. Un champ qui n'est pas décrit dans le DTO est donc ignoré : pensez à déclarer les nouveaux champs. `@MultipartJson('data', Dto)` applique la même validation aux formulaires multipart.
- **Instances uniques.** Un seul client Prisma (`PrismaService`, module global) et une seule instance Better Auth.
- **Découpage de `CommonModule`** en `PaymentsModule`, `PackModule` (plans et politiques de fonctionnalités) et `FirebaseModule`.

## 2. Base de données : migrations versionnées

Le projet utilisait `db push`. `prisma/migrations` est maintenant versionné :

| Migration                           | Contenu                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `0_init`                            | Référence du schéma existant (baseline)                                       |
| `1_cleanup_legacy_rentals`          | Suppression des anciennes tables de location, vides, idempotente              |
| `2_rental_configs_and_bookings`     | Modalités, disponibilités, réservations, contraintes `CHECK`                  |
| `3_backfill_monthly_rental_configs` | Modalité mensuelle créée pour les biens existants (prix et caution actuels)   |
| `4_bookings`                        | Type de notification `BOOKING`, durée réservée, index client                  |
| `5_chat_property_context`           | Chat client ↔ agence lié au bien, pièces jointes (à appliquer sur table vide) |
| `6_device_token_platform`           | Canal d'envoi des jetons push (`WEB` par défaut, `MOBILE_EXPO`)               |
| `7_user_preferences`                | Table `user_preference`, type de notification `LISTING`                       |

**Première mise en place sur un environnement existant** (UAT, production) :

```bash
npx prisma migrate resolve --applied 0_init   # une seule fois
npm run migrate:deploy:uat                     # ou l'équivalent production
```

Ne jamais lancer `migrate dev` sur une base partagée : il propose une réinitialisation. `prisma migrate deploy` doit faire partie de la séquence de déploiement.

Les dates de location sont des dates calendaires (`@db.Date`), échangées au format `AAAA-MM-JJ`. Un bien ou une agence qui a des réservations ne peut pas être supprimé (`Restrict`) : l'historique est conservé.

## 3. Modalités de location (`modules/rentals`)

Un bien porte une ou plusieurs modalités : `DAILY`, `NIGHTLY`, `MONTHLY`, `YEARLY`. Chacune a son prix, sa caution, ses durées minimale et maximale, et ses périodes de disponibilité.

- `RentalConfigService` : règles des modalités (au moins une active, pas de doublon, durées cohérentes, pas de périodes qui se chevauchent). Une période couvre au moins une unité : 2 jours, 1 mois ou 1 an.
- Le `price` et la `caution` du bien sont **dérivés** de la première modalité active. Ils restent exposés pour compatibilité.
- `RentalAvailabilityService` : les créneaux libres sont calculés à la lecture (périodes saisies moins les réservations **confirmées**). Les périodes ne sont jamais découpées en base.
- `RentalQuoteService` : le devis (durée, disponibilité, montant) est la source de vérité du prix.

## 4. Annonces publiques

- La liste renvoie `rentalOffers`. Le filtre `rentalType` compare les prix de la modalité demandée.
- Nouvelles routes publiques : `announces/detail`, `announces/availability` et `announces/quote`.

## 5. Réservations (`modules/bookings`)

| Route                                       | Accès                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `POST bookings/create`                      | Client connecté                                                       |
| `GET bookings/my-bookings`                  | Client                                                                |
| `PATCH bookings/cancel?id=`                 | Client (demande en attente, ou réservation confirmée avant son début) |
| `GET bookings/agency?agencyId=&status=`     | Agence                                                                |
| `PATCH bookings/confirm?id=` / `reject?id=` | Agence                                                                |

Règles :

- **Demande en attente :** elle ne bloque pas les dates, et plusieurs clients peuvent demander les mêmes dates. Un même client ne peut pas envoyer deux demandes en cours pour les mêmes dates d'un bien.
- **Confirmation :** elle se fait sous un verrou par bien. Les autres demandes en attente sur ces dates sont refusées automatiquement.
- **Notifications :** le client et l'agence sont notifiés à chaque changement de statut, avec le type `BOOKING`.
- **Évolution prévue :** ces règles changeront avec le paiement en ligne, qui bloquera probablement le créneau.

## 6. Codes OTP et mot de passe oublié (mobile)

- **Codes OTP** (vérification d'email et mot de passe oublié) : **6 chiffres, valables 3 minutes**, avec au plus un renvoi toutes les 2 minutes. Le lien de réinitialisation du web est lui aussi valable 3 minutes.
- **Nouvelles routes** pour le parcours mobile de réinitialisation :

  | Route                      | Rôle                                                                                    |
  | -------------------------- | --------------------------------------------------------------------------------------- |
  | `auth/forgot-password-otp` | Envoie le code. La réponse est identique que le compte existe ou non.                   |
  | `auth/verify-reset-otp`    | Vérifie le code sans le consommer.                                                      |
  | `auth/reset-password-otp`  | Enregistre le nouveau mot de passe ; toutes les sessions de l'utilisateur sont fermées. |

- **Web** : le parcours par lien (`forgot-password` et `reset-password`) est inchangé.
- **Messages d'erreur** : les refus de Better Auth sont traduits en français, et un email inconnu reçoit la même réponse qu'un code incorrect.
- **Inscription** : le profil client est créé avant l'envoi du code. La vérification est validée par `VerifyOtpDto`, et le délai avant renvoi est corrigé.

## 7. Chat client ↔ agence (`modules/chat`)

L'ancien chat (conversations LEAD / DIRECT) est remplacé : une conversation relie **un client, une agence et un bien**, avec la dernière réservation concernée en contexte (`bookingId`).

- **Unicité** : `@@unique([clientId, agencyId, propertyId])`. Contacter l'agence depuis l'annonce ou depuis une réservation ouvre la même conversation ; deux ouvertures simultanées sont départagées par la contrainte.
- **Accès** (`ChatAccessService`, source unique) : le client de la conversation, l'owner de l'agence, et le staff actif ayant `view_conversations` (lecture) ou `reply_conversations` (réponse). Feature `manage_conversations`, catégorie `MESSAGING`, incluse dans tous les plans actifs (`db:seed:*-feature`).
- **Pièces jointes** : 3 fichiers maximum, 2 Mo chacun, PDF / JPG / PNG ; ou une note vocale seule (m4a / aac, 2 minutes). Type MIME en liste blanche **et** signature binaire vérifiée. Stockage Cloudinary privé (`authenticated`), servi par URL signée valable 1 h.
- **Routes** :

  | Route                              | Rôle                                                          |
  | ---------------------------------- | ------------------------------------------------------------- |
  | `POST chat/conversations/property` | Client : conversation du bien (récupérée ou créée)            |
  | `POST chat/conversations/booking`  | Client ou agence : même conversation, réservation en contexte |
  | `GET chat/conversations`           | Liste paginée ; `agencyId` pour la vue agence ; `unreadTotal` |
  | `GET chat/conversations/detail`    | Agence, client, bien, réservation                             |
  | `GET chat/conversations/messages`  | Messages paginés, pièces jointes signées                      |
  | `POST chat/conversations/messages` | Multipart `data` + `files` (pièces jointes, note vocale)      |
  | `PATCH chat/conversations/read`    | Marquer comme lu sans socket                                  |

- **WebSocket** (`/chat`) : participation vérifiée sur `conversation:join`, frappe relayée aux seuls sockets de la conversation, payloads validés, accusé `{ ok, message | error }` sur `message:send`, présence diffusée aux seuls interlocuteurs. Authentification par le cookie de session, ou par le jeton de session transmis à la connexion (`auth.token`) quand le frontend et l'API sont sur des domaines différents.
- **Notifications** : le chat publie `chat.message.created` sur le bus interne (`modules/events`). `ChatNotificationListener` (module notifications) envoie le push FCM aux destinataires hors ligne avec `type: MESSAGE` et `conversationId`. Le push mobile (Expo) se branchera sur cet écouteur.
- **Répondre vaut lecture** : envoyer un message remet à zéro le compteur de l'expéditeur et envoie les accusés de lecture à son interlocuteur.
- **Leads** : l'assignation d'un lead ne touche plus au chat.

## 8. Équipe : permissions d'un membre

- `PATCH team/update-permissions?agencyId=` (`UpdateStaffPermissionsDto` : `staffId`, `permissionIds`) remplace les permissions d'un membre.
- **Owner uniquement** (`OWNER_ONLY`), membre de la même agence (`STAFF_NOT_FOUND`), et permissions limitées aux features du plan actif (`PERMISSIONS_NOT_ASSIGNABLE`, via `PermissionsService.getAssignablePermissionIds`).
- Les permissions sont relues à chaque requête : elles s'appliquent à la session suivante du membre (rechargement de page).

## 9. Notifications push mobiles (Expo Push)

- **Jetons** : `DeviceToken.platform` (`WEB` ou `MOBILE_EXPO`). `push-notification/register-token` accepte `platform` ; un jeton mobile doit être un jeton Expo (`INVALID_PUSH_TOKEN`). Un jeton déjà connu est réattribué au compte connecté (changement de compte sur le même téléphone).
- **Envoi** : `PushNotificationService` répartit les appareils : FCM pour le web, `ExpoPushService` (`expo-server-sdk`) pour le mobile, en un seul lot. Les jetons refusés (`DeviceNotRegistered`) sont supprimés à l'envoi et lors de la vérification des accusés (toutes les 10 minutes).
- **Contenu mobile** : titre et texte en clair (contenu du message affiché), `data.type` et les identifiants utiles à la navigation (`conversationId`, `bookingId`), pastille = notifications + messages non lus, canaux Android `messages`, `bookings` et `default`.
- **Configuration** : `EXPO_ACCESS_TOKEN` (facultatif, recommandé) active la sécurité renforcée des envois côté Expo. Les identifiants FCM (Android) et APNs (iOS) sont gérés par EAS.
- **Dépendances** : le backend utilise **pnpm** (`pnpm add …`) ; npm échoue sur son arbre de dépendances.

## 10. Préférences utilisateur (notifications)

- **Table `user_preference`** (une ligne par utilisateur, créée à la première modification). Le thème reste sur `User`. Les préférences de notification sont un JSON validé et complété par `resolveNotificationPreferences` (valeurs par défaut, règles).
- **Catégories** : Messages, Réservations, Visites, Paiements, Nouvelles annonces, Compte et sécurité (toujours actif). Canal push pour toutes, e-mail pour les réservations uniquement. « Nouvelles annonces » est désactivée par défaut et filtrée par types de bien (vide = tous).
- **Son** : `DEFAULT`, `SOFT`, `CHIME` ou `NONE`. Push mobile : fichier `soft.wav` / `chime.wav` sur iOS, canal Android `<canal>_<son>` (ex. `messages_soft`), silencieux pour `NONE`. `inAppSound` pour le son dans l'application.
- **Routes** : `GET preferences/me` (préférences et options proposées : libellés, canaux, sons, types de bien) et `PATCH preferences/notifications` (mise à jour partielle).
- **Envoi** : `PushNotificationService` ne pousse que vers les destinataires qui acceptent la catégorie (web et mobile) ; la notification reste dans le centre de notifications.
- **E-mail de réservation** : confirmation ou refus (y compris refus automatique), via l'événement `booking.status.changed` et `BookingEmailListener`. Modèle Resend `BOOKING_STATUS` (variables `SUBJECT`, `USERNAME`, `STATUS_LABEL`, `PROPERTY_TITLE`, `PERIOD`, `MESSAGE`, `APP_NAME`), identifiant dans `RESEND_TEMPLATE_BOOKING_STATUS_ID` ; sans lui, l'e-mail est ignoré.
- **Nouvelles annonces** : à la mise en ligne d'une annonce (création en ligne ou passage en ligne), l'événement `annonce.published` déclenche la notification `LISTING` des clients abonnés, par lots de 500, avec `annonceId`.

## 11. Accès agence : permissions, statut et quotas

- **Permissions staff appliquées** : `PermissionGuard` est global (après `AuthGuard`) ; `@RequirePermission` protège les routes agence. L'owner passe toujours ; un staff doit avoir la permission accordée (sinon 403).
  - Leads : `view_leads` (liste, détail), `update_lead`, `assign_lead`, `delete_lead`.
  - Visites : `schedule_visit`, `view_visits`, `update_visit` (modification, affectation), `cancel_visit`.
  - Annonces : `publish_property` (création, modification), `view_properties` (liste), `unpublish_property` (suppression).
  - Terrains : `manage_land` ; bâtiments : `manage_batiment` ; propriétés : `update_property`, `view_properties` (taux d'occupation).
  - Équipe et invitations : `view_users` (listes), `send_invitation`, `cancel_invitation`.
  - Non concernés : réservations (aucune permission seedée), routes `agency/*` (infos, stats, abonnement), statut et permissions des membres (déjà réservés à l'owner).
- **Garde** : refus avec le message générique « Accès non autorisé » (la permission requise n'est pas exposée) ; une session sans liste de permissions renvoie 403 au lieu d'une erreur 500.
- **Agence fermée** : `agencyAccessControl` et `isAgencyMember` refusent une agence `CLOSE` (`AGENCY_CLOSED`). `PENDING` reste autorisé (statut avant validation par l'admin).
- **Abonnement inactif** : les créations soumises au plan sont refusées (`SUBSCRIPTION_INACTIVE`). L'expiration (`currentPeriodEnd`) sera appliquée avec le renouvellement.
- **Quotas** : propriétés, terrains et bâtiments sont comptés ensemble contre la limite de biens (`countPropertyAssets`) ; les invitations en attente non expirées comptent dans les places utilisateurs (`countUserSeats`).
- **Visites** : la notification « Nouvelle visite » part vers l'owner et l'agent assigné (hors auteur) ; elle n'était jamais envoyée. Le cron de fin de visite notifie le compte de l'agent (et non son identifiant Staff).

## 12. Visites rattachées au client (retrait des leads, étape 1)

- **Migration `8_visit_client`** (à appliquer) : ajoute `Visit.clientId` (index, suppression en cascade avec le client), rempli depuis le lead de chaque visite existante ; `Visit.leadId` devient facultatif. Retour arrière décrit en commentaire dans la migration.
- **Planifier une visite** : `clientId` (client ayant réservé ou écrit à l'agence, sinon `CLIENT_NOT_LINKED`) et `propertyId`. `leadId` reste accepté jusqu'au retrait des leads : le client en est déduit. Sans l'un ni l'autre : `VISIT_CLIENT_REQUIRED`.
- **Nouvelle route** `GET visits/agency-clients?agencyId` (`schedule_visit`) : clients proposés dans le formulaire de visite.
- **Réponses** : les visites exposent `client` (nom, e-mail), `property` et `agent` ; `lead` reste présent dans la liste agence pour le web actuel. Notifications, « mes visites » et cron de fin de visite passent par le client.
- **Étape suivante** : une fois le web adapté, une migration supprimera les leads (table, module, feature `manage_leads`).

## 13. Biens : suppression, détail et fermeture

- `DELETE land/delete-land?id` (`manage_land`) : supprime un terrain de l'agence ; refus `LAND_HAS_BUILDINGS` s'il porte des bâtiments ou des villas (ils partiraient en cascade).
- `GET property/detail?id` (`view_properties`) : le bien avec ses annonces, modalités et disponibilités.
- `POST property/close?id` (`update_property`) : les annonces en ligne du bien passent `INACTIVE` ; le bien et son historique restent.
- `DELETE property/delete?id` (`delete_property`) : uniquement un bien sans historique. Refus `PROPERTY_HAS_BOOKINGS` (réservations) ou `PROPERTY_IN_USE` (discussions, qui seraient supprimées en cascade ; visites ou leads, bloqués par la base). Dans ces cas, fermer le bien.

## 14. Réservations : annulation par l'agence et fin de séjour

- `PATCH bookings/agency-cancel?id` avec `{ reason }` : l'agence annule une réservation confirmée qui n'a pas commencé (`BOOKING_NOT_CANCELLABLE` sinon). Les dates redeviennent disponibles ; le client reçoit une notification et l'e-mail « Votre réservation est annulée » (événement `booking.status.changed` avec `CANCELLED`).
- **Cron quotidien (1 h)** : les réservations confirmées dont la date de fin est passée deviennent `COMPLETED`.
- **E-mail** : `sendBookingStatus` reçoit le statut (`CONFIRMED`, `REJECTED`, `CANCELLED`) au lieu d'un booléen ; libellés « confirmée », « refusée », « annulée ».

## 15. Équipe : retrait d'un membre et renvoi d'invitation

- `DELETE team/remove-member?agencyId&id` (owner uniquement) : dans une transaction, les visites, tickets et leads du membre sont désassignés (conservés), son profil staff et ses permissions supprimés, son compte passé `INACTIVE` et ses sessions fermées.
- `POST invite/resend-invitation?inviteId` (`resend_invitation`) : renvoie une invitation en attente avec le même mot de passe temporaire et 7 jours de validité en plus ; refus `INVITATION_NOT_PENDING` sinon (acceptée, annulée ou expirée).

## 16. Visites par période

- `GET visits/agency-visits?agencyId&from&to` : filtre facultatif sur `scheduledAt` (dates ISO validées). Période inclusive : une date seule en fin de période couvre toute la journée. Sans période, toutes les visites comme avant.

## 17. Revenus mensuels réels

- `GET property/monthly-revenue?agencyId&year` (`view_properties`) : 12 lignes `{ month: 'AAAA-MM', receivedAmount, remainingAmount }` pour l'année (par défaut l'année en cours), rangées par mois de début des réservations. Reçu : réservations terminées ; restant : réservations confirmées. Annulées et refusées exclues. Remplace la version factice commentée.

## 18. Réinvitation d'un ancien membre et nouveau mot de passe au renvoi

- **Adresse invitable** : inconnue, ou compte désactivé sans profil (ancien membre retiré). Refus `USER_NOT_INVITABLE` pour un compte actif (client, owner, membre) ou désactivé mais encore rattaché à une équipe (à réactiver via `team/change-status`). Refus `INVITATION_ALREADY_PENDING` si une invitation attend déjà (la renvoyer). Les anciennes invitations clôturées de l'adresse sont purgées (e-mail unique).
- **Acceptation** : un ancien membre retiré retrouve son compte (réactivé, mot de passe remplacé par le mot de passe temporaire, nouveau profil staff et permissions de l'invitation) ; sinon le compte est créé comme avant.
- **Renvoi** : un nouveau mot de passe temporaire est généré côté serveur (`generateTemporaryPassword`), chiffré et envoyé ; l'ancien n'est plus valable.

## 19. Retrait des leads (étape 2)

- **Migration `9_remove_leads`** (à appliquer, **destructive**) : supprime la feature `manage_leads` et ses permissions (plans, membres, invitations en attente), puis `visit.leadId`, `tenant.leadId`, la table `lead` et l'enum `LeadStatus`.
- **Code** : module `leads` et routes `leads/*` retirés ; `manage_leads` retiré du seed ; plus de compteurs de leads dans `agency/stats` ni dans le détail admin d'une agence. Les valeurs d'enum historiques (`NotificationType.LEAD`, `FeatureCategory.LEADS`, `ReportType.LEADS`) restent pour les données existantes.
- **Visites** : `clientId` est désormais obligatoire (`leadId` n'est plus accepté) ; la liste agence n'expose plus `lead`.
- **Web à adapter** : le formulaire de visite doit envoyer `clientId` (liste : `visits/agency-clients`) et la liste lire `client` / `property` au lieu de `lead`.

## 20. Permission des réservations (staff)

- **Feature `manage_bookings`** (catégorie `BOOKINGS`, incluse dans tous les plans) : `view_bookings` (liste) et `manage_bookings` (confirmer, refuser, annuler). L'owner garde tous les droits ; les membres existants doivent se voir accorder ces permissions par l'owner.
- **Migration `10_booking_permission`** (à appliquer) : ajoute la valeur `BOOKINGS` à `FeatureCategory`. Puis lancer le seed des features (`pnpm db:seed:dev-feature` ou `db:seed:uat-feature`) pour créer la feature, ses permissions et l'ajouter aux plans.

## 21. Taille de page plafonnée

- `MAX_PAGE_SIZE = 100` (`config/pagination.dto.ts`) : `limitPerPage` est validé entre 1 et 100 sur les listes paginées (terrains, bâtiments, propriétés via `PaginationDto`, annonces publiques via le filtre des annonces) ; au-delà, 400. Les listes admin (utilisateurs, paiements) bornent la valeur reçue à 100. Évite qu'une seule requête charge toute une table.

## 22. Impact des suppressions et fermetures

- `GET property/impact?id` (`view_properties`) : annonces (totales, en ligne), réservations (totales, à venir, en attente), discussions, visites (totales, à venir) et `canDelete`.
- `GET land/impact?id` (`manage_land`) : bâtiments (id, nom), nombre de villas et `canDelete`.
- `property/delete` et `land/delete-land` utilisent ce même calcul : une visite liée bloque désormais la suppression (`PROPERTY_IN_USE`). Le web affiche cet impact avant de confirmer.

## 23. Impact d'une suppression de bâtiment

- `GET building/impact?id` (`manage_batiment`) : biens du bâtiment (supprimés avec lui) et leur historique cumulé (annonces, réservations, discussions, visites), avec `canDelete`.
- `building/delete` refuse (`BUILDING_IN_USE`) quand un de ses biens a un historique, au lieu d'une erreur 500 ; calcul partagé avec les biens (`computeImpact`).

## 24. Impact du retrait d'un membre

- `GET team/member-impact?agencyId&id` (owner) : nom, e-mail, visites assignées (dont à venir), tickets assignés et nombre de permissions, affichés avant `team/remove-member`.

## 25. Activation de la 2FA vérifiée

- `twoFactor` n'a plus `skipVerificationOnEnable` : `two-factor/enable` renvoie le QR code et les codes de secours, mais la 2FA ne s'active qu'au premier code valide (`two-factor/verify-totp`). Un QR code mal scanné ne peut plus bloquer le compte.
- La connexion par code de secours (`two-factor/verify-backup-code`, Better Auth) est désormais proposée par le web.
- **Migration `10_two_factor_lockout`** (additive) : colonnes `twofactor.failedVerificationCount` (défaut 0) et `lockedUntil`, exigées par Better Auth 1.6.33 pour verrouiller la 2FA après trop de codes faux. Sans elle, l'activation de la 2FA échoue (`Unknown argument failedVerificationCount`) depuis la montée en 1.6.33 : à appliquer avant tout déploiement de cette version.

## 26. Renvoi du lien de vérification sans énumération

- `auth/send-verification` répond « Si ce compte existe, un email a été envoyé. » pour un compte inconnu, déjà vérifié ou à vérifier (auparavant un 400 « Email déjà vérifié » et un message de succès distinct révélaient les inscrits). Seul un compte non vérifié déclenche l'envoi.

## 27. Limitation de débit non contournable

- **Faille corrigée** : le throttler comptait par `req.ips[0]`, l'entrée de `X-Forwarded-For` écrite par le client. Changer cet en-tête à chaque requête donnait un nouveau compteur. L'IP cliente est désormais résolue une seule fois (`config/throttle.ts`, `resolveClientIp`) par un middleware de `main.ts`, qui écrase `x-keurezy-resolved-ip`, lu par le throttler et par Better Auth.
- Limites par utilisateur connecté, sinon par IP : `burst` à 20 requêtes/s et `sustained` à 300/min, sur toutes les routes Nest. `@Throttle(SENSITIVE_THROTTLE)` à 5/min sur les routes publiques d'authentification (inscription, mot de passe oublié, OTP, vérification d'e-mail, réinitialisation) et sur `accept-invitation`. Réponse 429 en français.
- Better Auth (`/api/auth/*`, hors du throttler Nest) : `ipAddressHeaders` sur l'IP résolue, et 5 essais par minute sur `two-factor/verify-totp`, `verify-backup-code`, `enable` et `disable`, en plus des règles par défaut.
- **Variables d'environnement** (backend et web) :
  - `INTERNAL_PROXY_SECRET` : secret partagé avec le proxy Next, **identique des deux côtés** (`openssl rand -hex 32`). Sans lui, les visiteurs web anonymes partagent le compteur de l'IP du serveur Next.
  - `TRUST_PROXY_HOPS` (par défaut 1) : nombre de proxys de confiance devant le service.
  - `LOG_CLIENT_IP=true` : journalise temporairement la chaîne `X-Forwarded-For` et l'IP retenue, pour calibrer `TRUST_PROXY_HOPS` en UAT. À retirer ensuite.
- Hors code : une attaque DDoS volumétrique se traite en bordure (protection du fournisseur, WAF Cloudflare). Compteurs en mémoire : prévoir Redis au-delà d'une instance.

## 28. Actions destructrices : intégrité et impact de la fermeture d'agence

- `visits/cancel` notifie désormais le **compte** de l'agent (`agent.userId`). Il recevait un identifiant Staff et n'était jamais notifié.
- `team/change-status` : désactiver un membre ferme aussi ses sessions (déconnexion immédiate, comme un retrait).
- **Fermeture d'agence différée (15 jours)** : `POST agency/close` **programme** la fermeture (`Agency.closeScheduledAt`, migration additive `11_agency_close_schedule`) au lieu de fermer tout de suite. `POST agency/cancel-close` l'annule. Un cron quotidien (2 h) exécute les fermetures échues : agence CLOSE, owner rétrogradé, membres désactivés (`Staff.isActive`, `User.status`), toutes les sessions fermées, abonnement arrêté. Le délai se règle par `AGENCY_CLOSE_DELAY_DAYS`.
- `GET unsecured/property` exclut les biens des agences fermées (CLOSE). Les agences en attente (PENDING) restent visibles, comme avant.
- `GET agency/close-impact?agencyId` (owner, `OWNER_ONLY` sinon) : membres actifs, biens (total et en ligne), réservations confirmées à venir et en attente, abonnement (plan, fin de période). Affiché avant la fermeture.

## 29. Connexion refusée aux comptes désactivés

- Hook Better Auth `databaseHooks.session.create.before` : aucune session n'est créée pour un compte dont `User.status` n'est pas `ACTIVE` (membre désactivé ou retiré, agence fermée, compte banni). Erreur 403 `ACCOUNT_DISABLED`. Couvre mot de passe, passkey, 2FA et mobile. Auparavant, un membre désactivé pouvait se reconnecter et naviguer, et seules les routes métier lui refusaient l'accès.

## 30. Acceptation d'invitation : aperçu, code et mot de passe choisi

- `GET unsecured/invite/preview?token` : aperçu **en lecture seule** (agence, qui invite, rôle, permissions, e-mail masqué, expiration). L'ouverture du lien ne consomme plus l'invitation. Auparavant, l'acceptation partait au chargement de la page : un double appel (StrictMode) ou un scanner de liens (Outlook, Gmail) la consommait avant l'invité.
- `POST unsecured/invite/send-code { token }` : code à 6 chiffres, envoyé à l'adresse invitée (modèle OTP, objet « Code de confirmation de votre invitation »). Il est stocké **haché** dans `verification` (`invitation-<id>`) : validité `OTP_SETTINGS`, délai de renvoi, 5 essais.
- `POST unsecured/invite/accept-invitation { token, code, password }` (**nouveau contrat**, web livré en même temps) : l'invité choisit son mot de passe. En une transaction : compte créé avec `emailVerified = true` (plus d'e-mail de vérification) ou ancien membre réactivé (même `userId`), Staff, permissions encore dans le plan, invitation ACCEPTED. La réponse ne contient que l'e-mail, **jamais de mot de passe** (auparavant renvoyé en clair).
- **Plus de mot de passe temporaire** : ni généré (il l'était côté navigateur), ni stocké, ni envoyé par e-mail. `Invitation.temporaryPassword` n'est plus écrit (expand). La migration de contraction est la `15_drop_invitation_temp_password` (section 45).
- Modèle Resend de l'invitation : la variable `USER_PASSWORD` n'est plus envoyée ; le texte du modèle est à mettre à jour (action manuelle).

## 31. Récupération de compte (2FA perdue) et prévention

- **Migration `12_account_recovery`** (additive, appliquée en dev) : table `account_recovery_request` (`status` PENDING, CANCELLED ou COMPLETED, `executeAt`, empreinte du jeton d'annulation).
- **Récupération en libre-service** (`POST unsecured/auth/two-factor-recovery/request`, `confirm`, `cancel`) : mot de passe vérifié côté serveur, puis code envoyé à l'e-mail du compte (haché, 5 essais, délai de renvoi), puis désactivation de la 2FA programmée dans **72 h**. Annulation par le lien de l'e-mail (jeton haché, usage unique) ou par **toute connexion réussie** (hook `session.create.after`). Un cron horaire exécute les demandes échues : 2FA supprimée, sessions fermées, e-mail de confirmation.
- **`POST team/reset-two-factor`** (owner uniquement) : réinitialise la 2FA d'un membre (configuration supprimée, sessions fermées) et le prévient par e-mail. La liste de l'équipe expose `twoFactorEnabled`.
- **`GET users/backup-codes/remaining`** : nombre de codes de secours restants (jamais les codes).
- **E-mail à l'owner quand la fermeture de son agence est programmée.**
- Codes à usage unique mutualisés (`config/one-time-code.ts`) entre l'invitation et la récupération.
- `ResendService.sendTemplateEmail` ignore un modèle non configuré (avertissement), sans interrompre l'action.
- **Modèles Resend** (texte et variables) dans `src/modules/mail/templates/*.md`, avec l'inventaire dans `README.md`. Variables d'environnement à renseigner : `RESEND_TEMPLATE_ACCOUNT_RECOVERY_REQUESTED_ID`, `RESEND_TEMPLATE_ACCOUNT_RECOVERY_COMPLETED_ID`, `RESEND_TEMPLATE_TWO_FACTOR_RESET_ID`, `RESEND_TEMPLATE_AGENCY_CLOSE_SCHEDULED_ID`, `RESEND_TEMPLATE_BOOKING_STATUS_ID`.

## 32. Codes à usage unique robustes, modèles HTML Resend

- **Consommation atomique des codes** (`consumeOneTimeCode`) : deux vérifications simultanées du même code (double envoi du formulaire) provoquaient une erreur 500 (`verification.delete` sans enregistrement). Désormais, une seule consomme le code, et l'autre reçoit `*_CODE_EXPIRED`.
- **2FA** : verrouillage du compte après 5 codes faux consécutifs, pendant 15 min (`accountLockout`), aligné sur les 5 essais par connexion de Better Auth et en plus de la limite par IP.
- **Modèles Resend en HTML** prêts à coller, dans `src/modules/mail/templates/*.html` (10 modèles, variables vérifiées contre le code). L'invitation envoie aussi `APP_NAME`.
- **Suppression** de `otp.hbs`, de `CompileTemplateService` (inutilisé), de `invoice.pdf` (inutilisé) et de la dépendance `handlebars`. Tous les e-mails passent par Resend.

## 33. État de la vérification 2FA lu en base

- Nouvelle route Better Auth `GET /api/auth/two-factor/status` (plugin `two-factor-status.plugin.ts`), accessible seulement avec le cookie signé du défi 2FA : fin du verrouillage (`TwoFactor.lockedUntil`), essais restants et recours (`self` pour un membre, `support` pour l'owner). Limitée à 30 requêtes par minute.
- Le web affiche le décompte réel quel que soit l'appareil ou la page d'où revient l'utilisateur. À la fin du défi, il affiche « compte bloqué » avec la récupération (membre) ou le support (owner), et ferme la session en silence.
- Le seuil de verrouillage est partagé (`TWO_FACTOR_MAX_FAILED_ATTEMPTS`).

## 34. Abonnements : fondations de facturation

- **Migration `13_subscription_billing`** (additive, appliquée en dev) :
  - `payment_transaction.agencyId` (FK, index `agencyId, createdAt`) et `kind` (`ONBOARDING`, `RENEWAL`, `UPGRADE`, `REACTIVATION`). Les transactions d'onboarding existantes sont rattachées à leur agence via `metadata.agencyEmail`.
  - `subscription.scheduledPlanId`, `scheduledBillingCycle`, `scheduledKeep` (downgrade programmé et éléments gardés actifs), `lastRenewalReminder`.
  - `isActive` (défaut `true`) sur `property`, `terrains` et `batiment` : bien désactivé par un downgrade.
- **`GET agency/subscription?agencyId`** (propriétaire uniquement, `OWNER_ONLY` sinon) : souscription (plan, statut, cycle, prix numérique, période, résiliation), consommation par quota (`used`, `limit`, `remaining`, `percentage`, `state` : `OK`, `NEAR_LIMIT` dès 80 %, `REACHED`, `UNLIMITED`) et fonctionnalités commerciales (`included`). Un abonnement inactif est renvoyé sans erreur ; sans souscription, `subscription` vaut `null`. `subscription-info` est inchangé.
- La consommation réutilise les compteurs qui bloquent la création (`countPropertyAssets`, `countUserSeats`, et `countAnnonces`, extrait d'`annonce.service.ts`) : une jauge ne peut pas contredire un refus.
- La migration de contraction de l’invitation (section 30) prendra le numéro `15` (le `14` sert au checkout, section 39).
- Spec : `keurezy-front/docs/subscription-ui/`.

## 35. Abonnement expiré : tableau de bord en lecture seule

- **`ActiveSubscriptionGuard`** (guard global) : quand l'abonnement de l'agence est `INACTIVE`, toute écriture (`POST`, `PUT`, `PATCH`, `DELETE`) d'un owner ou d'un membre du staff est refusée (`403 SUBSCRIPTION_INACTIVE`). Refus par défaut : **une nouvelle route d'écriture est bloquée tant qu'elle ne porte pas `@AllowWhenInactive()`**. Clients mobiles, super admin et routes anonymes non concernés ; agence sans souscription non bloquée.
- Routes autorisées pendant l'expiration : messages et lecture des discussions ; refus et annulation (agence) des réservations ; annulation des visites ; désactivation, retrait et réinitialisation 2FA d'un membre ; annulation d'une invitation ; profil, préférences, notifications, jetons push ; fermeture d'agence et son annulation ; déconnexion des intégrations.
- **Annonces masquées à l'expiration** : `publicAnnonceWhere` (annonce `ACTIVE` et abonnement de l'agence `ACTIVE`) filtre toutes les lectures publiques : liste, détail, créneaux, devis, création de réservation et ouverture de discussion. Le statut des annonces n'est pas modifié : elles réapparaissent dès que l'abonnement redevient actif.
- **Job d'expiration horaire** (`SubscriptionService.runExpiryJob`) : un abonnement `ACTIVE` **résilié** dont `currentPeriodEnd` est passé devient `INACTIVE`. Les périodes simplement non renouvelées n'expirent qu'avec `SUBSCRIPTION_EXPIRY_ENABLED=true`, à activer une fois le renouvellement en ligne livré (module checkout) : en dev, 8 abonnements actifs sur 14 ont déjà une période échue et seraient bloqués immédiatement.
- **Résiliation (propriétaire)** : `POST agency/subscription/cancel?agencyId` (fin de période, `canceledAt`), `POST agency/subscription/resume?agencyId` (annule la résiliation, sans paiement), idempotents et autorisés même abonnement expiré. `409 SUBSCRIPTION_EXPIRED` si l'abonnement est déjà `INACTIVE` (la réactivation passe alors par un paiement), `404 SUBSCRIPTION_NOT_FOUND` sans souscription. `GET agency/subscription/cancel-impact?agencyId` : fin de période, annonces en ligne, membres actifs, réservations confirmées à venir.
- **`GET agency/subscription-info`** renvoie aussi `status` (ajout, rien de retiré) : le web affiche à toute l'équipe le bandeau « lecture seule » quand l'abonnement est `INACTIVE`.

## 36. Quotas du plan : seuls les éléments actifs comptent

- `publish_properties` compte les **annonces en ligne** (`ACTIVE`), `manage_users` les **membres actifs** et les invitations en attente, `manage_properties` les **biens actifs** (`isActive`). Désactiver un élément libère sa place.
- Le quota est contrôlé au **passage à l'état actif** : création d'une annonce en ligne (un brouillon ne consomme plus rien), passage d'une annonce en `ACTIVE` (`updateAnnonce`), réactivation d'un membre (`team/change-status`, `403 USERS_CAPACITY_REACHED`). La désactivation n'est jamais bloquée.
- `PlanFeaturePolicyService.counters` et `hasRoomFor(agencyId, feature)` : une seule source pour les jauges de la page abonnement et les contrôles.

## 37. Biens désactivés

- Un bien, terrain ou bâtiment `isActive = false` (désactivé par un downgrade) est **en lecture seule** : modification refusée (`409 ASSET_INACTIVE`), comme la création ou la modification d'une annonce sur ce bien.
- Il est **masqué au public** : `publicAnnonceWhere` exige `property.isActive`, et la liste publique des biens (`GET unsecured/property`) exclut aussi les biens désactivés et les agences à l'abonnement expiré (oubli de la section 35).
- **`POST agency/subscription/assets/activate?agencyId`** `{ type: 'PROPERTY' | 'LAND' | 'BUILDING', id }` (propriétaire) : réactive le bien dans la limite `manage_properties` (`403 PROPERTY_CAPACITY_REACHED` au-delà), idempotent, `404 ASSET_NOT_FOUND` pour un bien d'une autre agence. Bloqué pendant l'expiration (lecture seule).

## 38. Devis de changement d'abonnement

- **`GET agency/subscription/quote?agencyId&planId&billingCycle`** (propriétaire) : `{ kind, amount, currency, effectiveAt, newPeriodEnd, excess }`.
  - `kind` : `REACTIVATION` (pas de période en cours : plein tarif, période à partir du paiement), `RENEWAL` (même plan et cycle : à la suite de l'échéance, au prix du downgrade programmé s'il y en a un), `UPGRADE` (plan plus cher ou cycle plus long, jamais plus court : prorata sur le même cycle avec échéance inchangée, ou nouvelle période moins le crédit restant), `DOWNGRADE` (gratuit, à l'échéance).
  - Montants arrondis à l'unité XOF supérieure. Un mois ajouté à un 31 reste en fin de mois (`addBillingCycle`).
  - `excess` (downgrade et réactivation) : par fonctionnalité limitée dépassée, la limite visée, l'usage actif et les éléments actifs (biens, annonces en ligne, membres et invitations en attente) parmi lesquels l'owner choisit ce qui reste actif. Une fonctionnalité absente du plan visé a une limite de 0.
  - Plan inactif ou à la commission : `404 PLAN_NOT_FOUND` ; cycle non proposé : `400 BILLING_CYCLE_UNAVAILABLE`.
- Calcul dans la fonction pure `quoteChange` (`packs/subscription-quote.ts`), réutilisée par le checkout.

## 39. Checkout d'abonnement

- **Migration `14_subscription_checkout`** (additive, appliquée en dev) : `payment_transaction.idempotencyKey` (unique) et `subscription.scheduledAt` (date d'effet d'un downgrade). La contraction de l'invitation passe en `15`.
- **`POST agency/subscription/checkout`** `{ agencyId, planId, billingCycle, keep? }` (propriétaire, autorisé pendant l'expiration), en-tête **`Idempotency-Key` obligatoire** (16 à 100 caractères `A-Z a-z 0-9 - _`) : recalcule le devis, crée la transaction NabooPay au montant du devis (`kind`, `agencyId`, `metadata` = plan, cycle, choix), renvoie `{ checkoutUrl, orderId }`. Retour NabooPay vers `/dashboard/subscription?payment=success|error`.
  - Même clé → même checkout, sans nouvel appel NabooPay ; même clé pour une autre demande ou une autre agence → `422 IDEMPOTENCY_KEY_REUSED` ; requêtes simultanées départagées par la contrainte unique.
  - `400 DOWNGRADE_NOT_PAYABLE` (un downgrade se programme), `400 IDEMPOTENCY_KEY_REQUIRED`.
  - Réactivation sur un plan plus petit : `keep` obligatoire pour chaque fonctionnalité en surplus (`422 SELECTION_REQUIRED`, `SELECTION_INVALID`, `SELECTION_EXCEEDS_LIMIT`).
- **`GET agency/subscription/payment?agencyId&orderId`** (propriétaire) : `{ status }` d'un paiement d'abonnement de l'agence (`404 PAYMENT_NOT_FOUND` pour une autre agence ou un onboarding). Si NabooPay dit « payé » avant le webhook, émet `subscription.payment.confirmed` ; annulé ou échoué : statut local mis à jour. N'expose ni `metadata` ni mot de passe, contrairement à `common/polling`.
- `PaymentsModule` exporte `NabooService`.

## 40. Confirmation des paiements d'abonnement

- Le webhook NabooPay (et le rattrapage de `agency/subscription/payment`) émettent `subscription.payment.confirmed { orderId, paidAt, paidAmount }` pour toute transaction autre que `ONBOARDING`, après avoir relu son statut chez NabooPay. L'onboarding est inchangé.
- **`SubscriptionBillingService`** applique le paiement **une seule fois** : clé d'idempotence `naboo_order_id`, réclamation atomique (`updateMany where status = PENDING`, compte = 1) **dans la même transaction** que l'application. Webhook et polling simultanés : le second ne fait rien. Échec : tout revient en attente, le prochain webhook ou polling réessaie.
- Montant réglé (relu chez NabooPay) inférieur au montant figé : rien n'est appliqué, transaction `FAILED`, erreur journalisée pour vérification.
- Effets :
  - sans période en cours : nouvelle période à partir du paiement (plan et cycle payés) ; réactivation sur un plan plus petit : éléments hors choix désactivés ;
  - renouvellement : période suivante à partir de l’échéance (`currentPeriodStart` = ancienne échéance) au tarif actuel du plan, sur le cycle du downgrade programmé s’il y en a un (le downgrade garde sa date d’effet et pose son prix) ;
  - upgrade : plan et prix immédiats, échéance inchangée sur le même cycle, nouvelle période sur un cycle plus long ; le downgrade programmé est annulé ;
  - toujours : résiliation programmée annulée, rappels réarmés (`lastRenewalReminder = null`).
- Désactivation (`deactivateExcess`, réutilisée par le downgrade) : biens non gardés `isActive = false` et leurs annonces retirées ; annonces non gardées `INACTIVE` ; membres non gardés désactivés et déconnectés ; invitations non gardées annulées. Rien n'est supprimé.

## 41. Downgrade programmé

- **`POST agency/subscription/schedule-change`** `{ agencyId, planId, billingCycle, keep }` (propriétaire) : programme le downgrade pour l'échéance (`scheduledAt` = échéance au moment du choix) avec les éléments gardés actifs. Remplace un downgrade déjà programmé. `400 NOT_A_DOWNGRADE` (un upgrade ou un renouvellement se paie) ; `422 SELECTION_REQUIRED`, `SELECTION_INVALID` (élément d'une autre agence ou inactif), `SELECTION_EXCEEDS_LIMIT`.
- **`DELETE agency/subscription/scheduled-change?agencyId`** (propriétaire, idempotent) : annule le downgrade programmé.
- **Job horaire** : applique d'abord les downgrades échus (`applyScheduledChanges` : plan, cycle et prix programmés, puis désactivation de ce qui n'a pas été gardé, en une transaction par agence, idempotent ; une agence en échec est retentée sans bloquer les autres), puis l'expiration.
- `GET agency/subscription` renvoie aussi `subscription.scheduledChange` (`{ plan, billingCycle, effectiveAt, keep }` ou `null`), pour le bandeau « Passage au plan … le … ».

## 42. Rappels de renouvellement

- **Job quotidien (9 h)** `sendRenewalReminders` : abonnements `ACTIVE`, non résiliés, dont l'échéance tombe sous 7 jours. Palier J-7, J-3 ou J-1, **un seul envoi par palier** : `lastRenewalReminder` est réclamé avant l'émission (job relancé ou plusieurs instances : pas de doublon). Un paiement remet le compteur à zéro.
- Événement `subscription.renewal.due { agencyId, daysLeft, periodEnd }` → `SubscriptionReminderListener` (`notifications/`) : notification in-app `PAYMENT` à l'owner et e-mail Resend avec un lien vers `/dashboard/subscription`. Message de facturation : envoyé quelles que soient les préférences de notification.
- **Nouveau modèle Resend à créer** : `RESEND_TEMPLATE_SUBSCRIPTION_RENEWAL_REMINDER_ID` (`mail/templates/subscription-renewal-reminder.html` et `.md`). Tant qu'il n'est pas configuré, l'e-mail est ignoré (la notification in-app part quand même).
- Correctif : le checkout rattachait la transaction à l'identifiant du profil Owner au lieu de son `User.id` (`P2003 payment_transaction_userId_fkey`). `assertOwner` renvoie désormais le `User.id` de l'owner.

## 43. Délai de grâce avant l'activation de l'expiration

- Script `pnpm subscription:grace:dev` (ou `:uat`), **aperçu par défaut**, `-- --apply` pour écrire : les abonnements `ACTIVE`, non résiliés, dont l'échéance est passée **ou absente** reçoivent une échéance à J+7 (et leurs rappels sont réarmés). Idempotent.
- **Procédure** pour un environnement : 1) lancer le script avec `--apply` ; 2) activer `SUBSCRIPTION_EXPIRY_ENABLED=true` ; 3) redémarrer. Les agences reçoivent les rappels J-7, J-3, J-1 et peuvent renouveler en ligne avant d'expirer.
- Dev au 01/10/2026 : 13 abonnements concernés (8 échus, 5 sans échéance). Non appliqué.

## 44. Historique de facturation

- **`GET agency/subscription/payments?agencyId&initialPage&limitPerPage`** (propriétaire, page de 10 par défaut, 50 au plus) : `{ content, totalItems, totalPages, currentPage, totalDataPerPage }`, du plus récent au plus ancien. Chaque paiement : `id`, `kind`, `plan`, `amount`, `currency`, `status`, `periodStart`, `periodEnd`, `paidAt`, `createdAt`. **Aucun champ de `metadata` brut**.
- Un onboarding n'apparaît que **payé** ; `initiateAgencyPayment` refuse désormais l'e-mail d'une agence existante (`400`), avant tout appel NabooPay. Les deux ferment le cas d'un onboarding lancé par un tiers avec l'e-mail d'une agence.
- La période couverte est enregistrée sur la transaction à l'application du paiement ; pour les onboardings antérieurs, elle est déduite de la date de paiement et du cycle choisi.

## 45. Contraction : suppression de `Invitation.temporaryPassword`

- **Migration `15_drop_invitation_temp_password`** (appliquée en dev) : la colonne est supprimée. Le code ne l'écrivait plus qu'à `null` (acceptation et annulation d'une invitation) ; ces écritures sont retirées.
- **Ordre de déploiement** : déployer le code d'abord, puis appliquer la migration (`migrate:deploy:uat`). Dans l'autre sens, l'ancien code échouerait à l'acceptation et à l'annulation d'une invitation pendant le déploiement.

## 46. Limites du plan pour toute l'équipe

- **`GET agency/subscription/limits?agencyId`** (owner **et** staff de l'agence) : `{ plan: { id, name }, usage, hasPaymentHistory }`. `usage` vient des mêmes compteurs que la page abonnement et l'enforcement. Aucun prix ni montant n'est renvoyé.
- `hasPaymentHistory` : l'agence a un paiement payé autre que l'inscription. Le web s'en sert pour n'afficher l'aperçu du plan supérieur qu'aux agences sans historique.
- Sert au pop-up « limite atteinte » des boutons « Ajouter » (biens, annonces, invitations). Le backend reste la barrière : les créations au-delà de la limite sont toujours refusées.

## 47. Plan Gratuit

- **Migration `16_free_plan`** (appliquée en dev) : valeur `FREE_SUB` ajoutée à l'enum `Plan`. Le plan est créé par le seed (`db:seed:dev-feature`, `db:seed:uat-feature`) : prix 0 sur les deux cycles, 2 biens, 2 annonces en ligne, 0 collaborateur, messagerie et réservations, sans support premium.
- Un abonnement Gratuit n'a **ni cycle ni échéance** (`currentPeriodEnd` nul) : ni rappel, ni expiration. Sa résiliation est refusée (`409 FREE_PLAN_NO_PERIOD`).
- **Passer au Gratuit** : un downgrade programmé à l'échéance, avec le choix des éléments gardés. Une agence **expirée** y passe tout de suite, sans paiement (`POST agency/subscription/schedule-change`, devis de réactivation à 0).
- **Quitter le Gratuit** : un paiement plein tarif, avec une nouvelle période à partir du paiement (devis de type `REACTIVATION`).

## 48. Contraction : fin du modèle à la commission

- **Script `pnpm subscription:commission-to-free:dev`** (ou `:uat`), aperçu par défaut, `-- --apply` pour écrire : chaque agence sur un plan commission passe au **Gratuit** ; ce qui dépasse ses limites est désactivé (jamais supprimé), les éléments **les plus anciens** restent actifs. Les plans commission sont ensuite supprimés. Dev au 01/10/2026 : 4 agences passées au Gratuit (aucun élément désactivé), 3 plans supprimés.
- **Migration `17_drop_commission`** (appliquée en dev) : retire `pricingType` et `commissionRate` (abonnement et plan), `planCategory`, les enums `PricingType` et `PlanCategory`, et les valeurs `*_COMMISSION` de `Plan`. Elle **échoue** tant qu'un plan commission existe.
- Onboarding : le plan Gratuit crée l'agence directement, sans paiement ni documents (l'ancien parcours commission) ; tout autre plan passe par NabooPay, qui refuse désormais un montant nul. Plan inconnu : repli sur le Gratuit.
- `CreatePlanDto` n'accepte plus `commissionRate` ; `GET packs` renvoie tous les plans actifs.
- Le script de délai de grâce (section 43) ignore le plan Gratuit.
- **Ordre en UAT** : déployer le code, migrations 15 et 16, seed des plans, script `commission-to-free` avec `--apply` (aussitôt après le déploiement : le nouveau code ne lit plus les valeurs commission), puis migration 17.

## 49. Fin de période : bascule au plan Gratuit

- Une agence dont la période se termine sans renouvellement (résiliée ; aussi non payée si `SUBSCRIPTION_EXPIRY_ENABLED=true`) **passe au plan Gratuit** au lieu de devenir inactive. Ce qui dépasse ses limites est désactivé, jamais supprimé ; les éléments **les plus anciens** restent actifs (les annonces gardées sont prises parmi les biens gardés). Les boutons « Ajouter » affichent ensuite le blocage habituel.
- Les abonnements déjà `INACTIVE` passent aussi au Gratuit au prochain passage du job horaire.
- Même bascule pour le script `commission-to-free` (logique partagée : `SubscriptionBillingService.moveToFree`).
- `GET agency/subscription/cancel-impact` renvoie en plus `freePlanExcess` : `{ feature, used, limit }[]`, ce qui sera désactivé à l'échéance.

## 50. Rattrapage des paiements d'abonnement

- Job toutes les 15 min : les paiements d'abonnement (hors inscription) en attente depuis plus de 5 min sont relus chez NabooPay. Payé : la confirmation est émise (application unique, clé `orderId`) ; annulé ou échoué : statut local mis à jour. Couvre un webhook perdu quand l'owner n'est pas revenu sur la page.
- Au-delà de 48 h, un paiement **toujours en attente chez NabooPay** passe `CANCELLED` (abandonné). Il est relu avant : un paiement réglé n'est jamais annulé. NabooPay indisponible : rien n'est annulé, retenté au passage suivant.
- 100 paiements au plus par passage.
- Dev au 02/10/2026 : les 2 paiements en attente (une inscription, une réactivation) ont été passés `CANCELLED` à la main.

## 51. Avis d'abonnement par e-mail

- **Un modèle Resend générique** `RESEND_TEMPLATE_SUBSCRIPTION_NOTICE_ID` (`mail/templates/subscription-notice.html` et `.md`, **à créer**) pour tous les avis d'abonnement ; le texte de chaque cas est rédigé par le backend (`notifications/subscription-lifecycle.listener.ts`). Il remplace le rappel `RESEND_TEMPLATE_SUBSCRIPTION_RENEWAL_REMINDER_ID`, qui n'est plus lu (son texte annonçait l'ancienne expiration en lecture seule).
- Avis envoyés à l'owner, par e-mail et notification in-app :
  - **rappel d'échéance** (J-7, J-3, J-1) : renouvellement, sinon passage au Gratuit ; variantes pour un downgrade programmé (payant, ou vers le Gratuit : « 0 F CFA à payer ») ;
  - **paiement confirmé** : montant, plan, période couverte ;
  - **passage au plan Gratuit** : fin de période sans renouvellement, ou downgrade programmé vers le Gratuit ;
  - **downgrade appliqué** vers un plan payant (période renouvelée ; sinon c'est l'avis de passage au Gratuit qui part).
- Nouveaux événements : `subscription.payment.applied`, `subscription.moved.to.free`, `subscription.downgrade.applied`.
- Les variables de ce modèle sont **échappées** (Resend insère `{{{…}}}` sans échappement ; le nom d'agence vient de l'utilisateur). Les noms de plan sont affichés en français (Gratuit, Débutant, Standard, Entreprise).
- `.env` et `.env.uat` : `RESEND_TEMPLATE_SUBSCRIPTION_NOTICE_ID` ajoutée (vide) ; `.env.uat` : `SUBSCRIPTION_EXPIRY_ENABLED=false` jusqu'à la procédure de mise en service.

## 52. Changement de tarif

- Un nouveau tarif du catalogue ne touche jamais la période en cours (prix payé figé sur l'abonnement) : il s'applique au **prochain renouvellement** (devis `RENEWAL` au tarif du catalogue, testé).
- `GET agency/subscription` renvoie `subscription.nextRenewalPrice` : prix du prochain renouvellement au tarif actuel (plan et cycle programmés s'il y en a ; null pour le Gratuit). Le web l'annonce quand il diffère du prix payé.

## 53. Questionnaire de départ (facultatif)

- **Migration `18_exit_feedback`** (appliquée en dev, additive) : table `exit_feedback` (agence, contexte `SUBSCRIPTION_CANCEL` | `AGENCY_CLOSE`, raison, commentaire de 1 000 caractères au plus, date) et enums `ExitFeedbackContext`, `ExitFeedbackReason` (`TOO_EXPENSIVE`, `MISSING_FEATURES`, `LOW_USAGE`, `SWITCHING_TOOL`, `TECHNICAL_ISSUE`, `BUSINESS_CLOSING`, `OTHER`).
- `POST agency/subscription/cancel` et `POST agency/close` acceptent un corps facultatif `{ reason?, comment? }` (validé, liste blanche). Un corps vide reste accepté : les clients actuels ne changent pas.
- Enregistré une seule fois, au passage en résiliation ou à la programmation de la fermeture, et seulement s'il est rempli. Un échec d'enregistrement ne bloque jamais l'action (journalisé).
- Lecture : aucune route (pas de back-office) ; requête SQL sur `exit_feedback` en attendant.

## 54. Procédure de mise en service en UAT (clôture du module abonnement)

À suivre dans l'ordre, sections 45 à 53. Chaque script est en aperçu par défaut : lire l'aperçu, puis relancer avec `-- --apply`.

1. **Avant** : dans Resend, créer le modèle `subscription-notice.html` (section 51) et renseigner `RESEND_TEMPLATE_SUBSCRIPTION_NOTICE_ID` dans l'environnement UAT. Vérifier `SUBSCRIPTION_EXPIRY_ENABLED=false`.
2. **Déployer le code** (backend puis web).
3. **Migrations 15 et 16** : `pnpm migrate:deploy:uat`. S'il reste des plans commission, la 17 s'arrête sur son garde-fou (rien n'est modifié, l'erreur est levée avant tout changement) et Prisma la marque en échec. La débloquer avant de continuer :
   `npx dotenv -e .env.uat -- npx prisma migrate resolve --rolled-back 17_drop_commission`
4. **Seed des plans** : `pnpm db:seed:uat-feature` (crée le plan Gratuit, met à jour les autres).
5. **Agences commission → Gratuit** : `pnpm subscription:commission-to-free:uat`, puis `-- --apply`. À faire aussitôt après le déploiement : le nouveau code ne lit plus les plans commission.
6. **Migrations 17 et 18** : `pnpm migrate:deploy:uat`.
7. **Délai de grâce** : `pnpm subscription:grace:uat`, puis `-- --apply` (échéance à J+7 pour les abonnements payants échus ou sans échéance ; le Gratuit est exclu).
8. **Flag** : `SUBSCRIPTION_EXPIRY_ENABLED=true`, puis redémarrer. Les rappels J-7, J-3, J-1 partent ; une agence non renouvelée passe au Gratuit à son échéance.

Contrôles : catalogue à 4 plans ; aucune agence `INACTIVE` après le premier passage du job horaire (elles passent au Gratuit) ; un e-mail d'avis reçu en test.

## 55. Correctifs de l'audit de clôture

- **E-mails** : toutes les variables texte des modèles Resend sont désormais échappées à l'envoi (`escapeTemplateVariables`, dans `sendTemplateEmail`), sauf les liens `*_LINK` construits par le backend. Resend insère `{{{…}}}` sans échappement : un nom d'agence ou un titre de bien contenant du HTML ne peut plus injecter de lien ou de mise en forme dans un e-mail.
- **Inscriptions au Gratuit** :
  - `POST agency/create` limitée à **3 créations par heure et par IP** (`SIGNUP_THROTTLE`) ;
  - les annonces et biens d'une agence ne sont **visibles du public** que si l'e-mail du propriétaire est vérifié (`publicAgencyWhere`, partagé par les annonces et la liste publique des biens). Le tableau de bord reste utilisable ; le bandeau « e-mail non vérifié » l'explique. Les deux parcours d'inscription envoient déjà l'e-mail de vérification, et il peut être renvoyé.
  - Dev au 02/10/2026 : 2 agences ont un propriétaire non vérifié (naboo, final) ; leurs annonces sont masquées jusqu'à vérification.
- Dev : Mobelite a un prix payé simulé de 8 000 F CFA (catalogue Standard mensuel à 10 000) pour montrer la note « Nouveau tarif ». Remettre `subscription.price` à 10 000 pour annuler.

## 56. Informations légales de l'agence et statut « vérifié »

- **Migration `19_agency_legal_info`** (appliquée en dev, additive) : colonnes nullables `companyName`, `legalForm` (énumération `LegalForm` : SARL, SUARL, SA, SAS, SASU, GIE, INDIVIDUAL, OTHER), `ninea`, `rccm`, `billingAddress`, `billingEmail` sur `agency`. **Toutes les agences vérifiées repassent non vérifiées** (aucune n'a encore d'informations légales). En dev, Mobelite a été remise vérifiée pour les tests.
- **`PATCH secured/agency/legal?agencyId`** (owner uniquement, `403 OWNER_ONLY` pour le staff) : seuls les champs envoyés changent ; NINEA et RCCM sont mis en majuscules, sans espaces, et leur format est contrôlé. Changer la raison sociale, le NINEA ou le RCCM d'une agence vérifiée **retire la vérification**. Réponse : `{ legal, legalMissing, isVerified }`.
- `GET secured/agency` (owner et staff) renvoie en plus `legalMissing`.
- **`PATCH admin/agency/status`** (SUPER_ADMIN) : `isVerified` suit la complétude des informations légales. Une agence incomplète peut être ouverte, mais reste non vérifiée ; la réponse liste ce qui manque.
- Les informations légales ne sont jamais publiques : les réponses publiques ne renvoient que le badge `isVerified` (testé).

## 57. Reçus de paiement : numérotation (R1)

- **Migration `20_payment_receipts`** (appliquée en dev, additive) : `payment_transaction.receiptNumber` (unique) et `receiptAgency` (JSON : l'agence telle qu'au jour du paiement), séquence `receipt_number_seq`. Les paiements déjà payés reçoivent un numéro dans l'ordre de paiement, avec les informations actuelles de l'agence (dev : `KRZ-2026-000001`).
- Numéro **continu** `KRZ-{année}-{rang sur 6 chiffres}`, tiré de la séquence (pas de doublon en concurrence), attribué **une seule fois** dans la transaction qui passe le paiement en payé : application d'un paiement d'abonnement et webhook d'inscription (`payments/receipts/issue-receipt.ts`).
- **Correctif** : le webhook d'inscription ne rattachait pas le paiement à l'agence créée (`agencyId` vide) ; il n'apparaissait donc pas dans l'historique de facturation. Il est maintenant rattaché.

## 58. Reçus de paiement : PDF et téléchargement (R2)

- Nouvelle dépendance **`pdfkit`** (0.17, avec `@types/pdfkit`) : reçu A4 standard (`payments/receipts/receipt-pdf.ts`), polices standard du PDF, sans fichier stocké. Le PDF est régénéré à la demande à partir des données figées au paiement (numéro, montant, plan, période, agence).
- Contenu : émetteur Keurezy (variables `KEUREZY_LEGAL_NAME`, `KEUREZY_NINEA`, `KEUREZY_RCCM`, `KEUREZY_ADDRESS`, `KEUREZY_BILLING_EMAIL`, ajoutées vides dans `.env` et `.env.uat` ; « à compléter » tant qu'elles sont vides), agence (raison sociale, forme juridique, adresse, NINEA, RCCM, e-mail de facturation), ligne d'abonnement et période, total réglé, référence NabooPay, mention « Reçu de paiement, non soumis à la TVA ».
- **`GET secured/agency/subscription/payments/receipt?agencyId&paymentId`** (owner) → `application/pdf`, `recu-KRZ-AAAA-NNNNNN.pdf`. `404 RECEIPT_NOT_FOUND` : autre agence, paiement non payé ou sans reçu.
- `GET …/subscription/payments` : chaque paiement a en plus `receiptNumber`.
- Le calcul de la période d'un paiement est partagé par l'historique et le reçu (`paymentPeriod`) ; les libellés de plans sont partagés par les e-mails et les reçus (`config/plan-labels.ts`).

## 59. Reçus de paiement : pièce jointe de l'e-mail (R3)

- L'avis « paiement confirmé » porte le reçu PDF en pièce jointe (`recu-KRZ-…pdf`). Si le reçu ne peut pas être généré, l'e-mail part sans pièce jointe (journalisé) et renvoie vers l'historique de facturation.
- `sendTemplateEmail` accepte des pièces jointes (Resend les accepte avec un modèle) ; l'événement `subscription.payment.applied` porte l'`orderId`.

## 60. Facturation client, I1 : données, variables et rendu (T1, T2)

- **Migration `21_invoice_templates`** (appliquée en dev, additive) : sur `agency`, coordonnées bancaires (`bankName`, `bankAccount`, `mobileMoneyNumber`), `vatRate` (0 par défaut), `invoicePrefix` (`FAC`), `defaultInvoiceTemplateId` ; table `invoice_template` (agence nullable pour les modèles par défaut, `defaultKey`, nom, configuration JSON).
- `PATCH agency/legal` accepte les coordonnées bancaires (facultatives, sans effet sur la vérification).
- Module `invoicing` (fonctions pures, testées) :
  - configuration structurée d'un modèle (`InvoiceTemplateConfigDto` : mise en page, couleurs, police, logo, colonnes, blocs, textes) et **3 modèles par défaut** (Classique, Moderne, Minimal), définis une seule fois dans le code ;
  - catalogue des variables `{{groupe.cle}}` (agence, client, facture, réservation, bien), refus des variables inconnues ou mal formées, remplacement en texte brut ;
  - **montant en lettres** en français (« quatre cent quarante-deux mille cinq cents francs CFA ») ;
  - `renderInvoicePdf(config, data)` : un seul moteur pour l'aperçu et les factures ; totaux HT, TVA, TTC ; « TVA non applicable » à 0 % ; mention « ANNULÉE » ; logo passé en mémoire (aucun appel réseau au rendu).

## 61. Facturation client, I1 : routes des modèles (T3)

- Nouveau module `invoicing` (`InvoicingModule`). Au démarrage, les 3 modèles communs sont créés ou mis à jour depuis leur définition dans le code (dev : Classique, Moderne, Minimal).
- Routes (`secured/invoicing/…`, paramètre `agencyId`) :
  - `GET templates` (owner et staff) : modèles communs et de l'agence, et réglages `{ vatRate, invoicePrefix, defaultTemplateId }` (Classique si aucun modèle par défaut, ou s'il a été supprimé) ;
  - `GET templates/variables` : catalogue des variables ;
  - `POST templates`, `PATCH templates?id`, `DELETE templates?id` (owner) : modifier un modèle commun **crée une copie** pour l'agence ; un modèle commun ne se supprime pas (`409 DEFAULT_TEMPLATE_LOCKED`) ; un modèle d'une autre agence est introuvable ; variable inconnue : `422 UNKNOWN_VARIABLES` ;
  - `PATCH settings` (owner) : TVA (0 à 100 %), préfixe (1 à 8 lettres ou chiffres), modèle par défaut ;
  - `POST templates/preview` : PDF d'aperçu d'une configuration, même non enregistrée, avec les vraies informations de l'agence et des données d'exemple.
- Logo de l'agence sur la facture : téléchargé seulement en HTTPS depuis Cloudinary (pas d'URL arbitraire), PNG ou JPEG, 2 Mo et 5 s au plus ; sinon la facture s'imprime sans logo.

## 62. Pièces justificatives des informations légales

- Migration `26_agency_legal_proofs` (additive) : colonnes `legalFormProofUrl`, `nineaProofUrl`, `rccmProofUrl` sur `agency`. Les agences vérifiées repassent non vérifiées (aucune n'a encore de pièce).
- `legalMissing` compte les pièces manquantes : sans statuts, attestation NINEA et extrait RCCM, une agence ne peut pas être vérifiée.
- Routes (owner uniquement, `OWNER_ONLY` sinon) :
  - `POST secured/agency/legal/proof?agencyId&kind=LEGAL_FORM|NINEA|RCCM`, multipart `file` : PNG, JPEG ou PDF de 5 Mo au plus. Le contenu est contrôlé par sa signature binaire (`422 INVALID_LEGAL_PROOF`). La pièce précédente est remplacée puis supprimée de Cloudinary.
  - `DELETE secured/agency/legal/proof?agencyId&kind=…` : retire la pièce.
  - Réponse `{ legal, legalMissing, isVerified }`. Remplacer ou retirer une pièce d'une agence vérifiée retire la vérification.
- `UploadsService.deleteByUrl` supprime une image ou un PDF d'après son URL Cloudinary ; un échec est journalisé, jamais bloquant.
