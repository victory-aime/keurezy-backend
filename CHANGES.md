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
