# Lot 2 : tâches

Vérification commune à chaque tâche :
- `pnpm test` ;
- `npx tsc --noEmit -p tsconfig.json`, en ignorant l'erreur déjà connue dans `test/app.e2e-spec.ts` ;
- `CHANGES.md` à jour ;
- un commit après ton test manuel.

## Task 1 (M1a) : visites rattachées au client (expand)
- [x] Migration `8_visit_client` :
  - ajoute `Visit.clientId` (nullable, FK vers `Client`, index) ;
  - le remplit depuis `lead.clientId` ;
  - rend `leadId` nullable.
- [x] `CreateVisitDto` : `clientId` (ou `leadId`, toléré jusqu'au M1b, dont on déduit le client) et `propertyId`. Le client doit avoir une réservation ou une discussion avec l'agence.
- [x] Les notifications et le cron utilisent `visit.client`.
- [x] Ajout : `GET visits/agency-clients`, qui liste les clients à proposer dans le formulaire web (remplace la liste des leads).
- **Test** : `visits.service.spec.ts`. Création avec un client : le client est notifié. Un client sans lien avec l'agence est refusé.
- **Fichiers** : `schema.prisma`, migration, `visits.dto.ts`, `visits.service.ts`, `visite-job.service.ts`. **Taille** : M.

## Task 2 (M2) : biens
- [x] `DELETE land/delete-land?id` (`manage_land`) : refus `LAND_HAS_BUILDINGS` si le terrain porte des bâtiments.
- [x] `GET property/detail?id` (`view_properties`), `POST property/close?id` (`update_property`) et `DELETE property/delete?id` (`delete_property`, refus `PROPERTY_HAS_BOOKINGS`).
- **Test** : suppression refusée avec des réservations ; fermeture qui dépublie les annonces.
- **Fichiers** : `api.ts`, `land.controller/service`, `property.controller/service`. **Taille** : M.

## Task 3 (M3) : réservations
- [x] `PATCH bookings/agency-cancel?id` avec un motif : seulement une réservation `CONFIRMED` pas encore commencée. Émet l'événement `booking.status.changed` et notifie le client.
- [x] Cron quotidien : `CONFIRMED` → `COMPLETED` quand `endDate` est passée.
- **Test** : annulation refusée une fois la réservation commencée ; le cron ne touche que les réservations confirmées terminées.
- **Fichiers** : `api.ts`, `bookings.controller/service/dto`, e-mail (libellé « annulée »). **Taille** : M.

### Checkpoint A : Tasks 1 à 3
- [x] Tests et typecheck au vert.
- [x] Ton test manuel, puis les commits.

## Task 4 (M4) : équipe et invitations
- [x] `DELETE team/remove-member?agencyId&id`, réservé à l'owner, dans une transaction :
  - désassigne ses visites et tickets (et ses leads jusqu'au M1b) ;
  - supprime ses `StaffPermission` et son profil `Staff` ;
  - passe `user.status = false` ;
  - supprime ses sessions.
- [x] `POST invite/resend-invitation?inviteId` (`resend_invitation`) : uniquement si l'invitation est `PENDING`. Elle gagne 7 jours de validité et l'e-mail est renvoyé avec le mot de passe déchiffré.
- **Test** : retrait refusé à un non-owner ; renvoi refusé si l'invitation n'est pas en attente.
- **Taille** : M.

## Task 5 (M5) : visites par période
- [x] Paramètres optionnels `from` et `to` sur `agency-visits`, filtrés sur `scheduledAt`.
- **Taille** : XS.

## Task 6 (M6) : revenus mensuels
- [x] `GET property/monthly-revenue?agencyId&year` (`view_properties`) : 12 lignes `{ month, receivedAmount, remainingAmount }`.
  - « Reçu » : réservations `COMPLETED` ; « restant » : réservations `CONFIRMED`.
  - Réservations rangées par mois de début.
- [ ] Les compteurs de leads sont retirés de `agency/stats` au M1b.
- **Test** : agrégation par mois ; les réservations annulées sont exclues.
- **Taille** : S.

### Checkpoint B : Tasks 4 à 6
- [x] Tests et typecheck au vert, ton test manuel, les commits.

## Task 7 (M1b, après le lot web) : suppression des leads (contract)
- [ ] Migration `9_remove_leads`, module `leads`, feature `manage_leads` du seed, compteurs des stats.
