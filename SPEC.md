# SPEC — Lot 2 : combler les fonctionnalités agence

## Objectif
Dans le dashboard, l'agence (owner et staff autorisé) doit pouvoir gérer entièrement ses biens, ses réservations, son équipe et ses visites. Elle doit aussi voir des statistiques réelles.

Le module **Leads** est retiré : le chat et les réservations couvrent désormais la prise de contact. Les visites sont rattachées directement au **client** et au **bien**.

**Décisions validées**
- Fermer un bien, c'est dépublier ses annonces.
- Supprimer un bien n'est possible que s'il n'a aucune réservation.
- Revenus : calculés à partir des réservations.
- Leads : retirés.
- Retrait d'un membre : son profil staff est supprimé et son compte désactivé.
- Visite : rattachée à un client et à un bien.

## Carte des modules (ordre de construction)

| # | Module | Dépend de | Critères d'acceptation |
|---|---|---|---|
| M1 | **Retrait des leads, visites client + bien** | – | Migration `8_remove_leads` (voir détail ci-dessous). Le module `leads`, ses routes, la feature `manage_leads` et la catégorie LEADS du seed disparaissent. `CreateVisitDto` demande `clientId` et `propertyId`. Les stats n'ont plus de compteurs de leads. Tests des visites au vert. |
| M2 | **Biens** | – | Les trois routes détaillées ci-dessous fonctionnent. |
| M3 | **Réservations** | – | Annulation par l'agence et passage automatique à « terminée » (voir détail). |
| M4 | **Équipe et invitations** | – | Retrait d'un membre et renvoi d'invitation (voir détail). |
| M5 | **Visites par période** | M1 | `GET visits/agency-visits?agencyId&from&to` filtre sur `scheduledAt`. Sans période, le comportement reste le même qu'aujourd'hui. |
| M6 | **Stats réelles** | M1, M3 | `GET property/monthly-revenue?agencyId&year` renvoie un tableau `{ month, receivedAmount, remainingAmount }` sur 12 mois. Il suit le type `IMonthlyRevenueStats` du web (voir détail). |

### M1 : migration `8_remove_leads`
1. Ajouter `Visit.clientId`.
2. Reprendre `clientId` depuis le lead de chaque visite.
3. Supprimer `Visit.leadId`, `Tenant.leadId`, la table `lead` et l'enum `LeadStatus`.

### M2 : routes des biens
- `DELETE land/delete-land?id` :
  - supprime le terrain ;
  - refus `LAND_HAS_BUILDINGS` s'il porte des bâtiments ou des villas.
- `GET property/detail?id` : renvoie le bien de l'agence, avec ses annonces.
- `POST property/close?id` :
  - passe ses annonces en `INACTIVE` ;
  - le bien reste en place.
- `DELETE property/delete?id` :
  - supprime le bien s'il n'a aucune réservation ;
  - sinon refus `PROPERTY_HAS_BOOKINGS`.
- Permissions : `manage_land`, `view_properties` et `delete_property`.

### M3 : réservations
- `PATCH bookings/agency-cancel?id` (permission : membre de l'agence) :
  - annule une réservation `CONFIRMED` qui n'a pas encore commencé, avec un motif obligatoire ;
  - notifie le client (notification, push et e-mail via l'événement `booking.status.changed`) ;
  - le créneau redevient disponible.
- Cron quotidien : `CONFIRMED` passe à `COMPLETED` quand `endDate` est dépassée.

### M4 : équipe et invitations
- `DELETE team/remove-member?agencyId&id` (réservé à l'owner) :
  - désassigne les visites et tickets du membre ;
  - supprime ses `StaffPermission` et son profil `Staff` ;
  - passe `user.status = false` et révoque ses sessions.
- `POST invite/resend-invitation?inviteId` (permission `resend_invitation`) :
  - uniquement pour une invitation `PENDING` ;
  - prolonge l'expiration de 7 jours ;
  - renvoie l'e-mail avec le même mot de passe temporaire (déchiffré).

### M6 : détail des revenus mensuels
- **Reçu** : réservations `COMPLETED`, rangées par mois de `startDate`.
- **Restant** : réservations `CONFIRMED`, rangées de la même façon.
- Les réservations annulées et refusées sont exclues.

## Commandes
- Tests : `pnpm test`
- Typecheck : `npx tsc --noEmit -p tsconfig.json`. Une seule erreur est déjà connue : `test/app.e2e-spec.ts`.
- Migrations : écrites dans `prisma/migrations/`. Tu les appliques toi-même, car la base n'est pas accessible depuis le sandbox.

## Structure et style
Chaque changement reste dans son module existant : `land`, `property`, `bookings`, `team`, `invitations`, `visits`.
- Routes déclarées dans `src/config/api.ts`.
- Erreurs levées avec `HttpError(message, status, code)`.
- Accès contrôlé par `agencyAccessControl`, puis par `@RequirePermission`.
- Aucun nouveau module et aucune nouvelle dépendance.

## Stratégie de tests
Un spec Jest par service modifié, avec Prisma mocké comme dans `team.service.spec.ts`. On teste les règles, pas la plomberie :
- refus quand le bien a des réservations ;
- annulation impossible après le début de la réservation ;
- retrait d'un membre refusé à un non-owner ;
- renvoi refusé si l'invitation n'est pas `PENDING` ;
- agrégation des revenus par mois.

## Limites
- **Toujours** :
  - une migration non destructive pour les données de visite ;
  - `CHANGES.md` mis à jour ;
  - un commit par module après ton test manuel ;
  - pas de trailer dans les commits.
- **Demander d'abord** : toute suppression de données au-delà des leads.
- **Jamais** : exposer le nom d'une permission dans une erreur, ni lancer de migration sur ta base.

## Hors périmètre (reporté)
- **Pagination des réservations** : la liste agence est bornée par agence et le web consomme un tableau. À ajouter quand le volume le justifiera.
- **Cron d'expiration des invitations** : l'expiration est déjà contrôlée à l'acceptation.
- **Adaptations du web et du package** : lot suivant. Il faudra :
  - mettre à jour le formulaire de visite (client au lieu de lead) ;
  - retirer le code des leads ;
  - brancher les nouvelles routes et les vraies stats du dashboard.
