# Spec : `agency-booking-permission`

## Objectif
Aujourd'hui, les routes agence des réservations sont ouvertes à tout membre actif, faute de permission seedée. Décision validée : **les réservations passent sous permission pour le staff**. L'owner garde tous les droits.

### Critères d'acceptation
1. Nouvelle feature `manage_bookings`, dans la catégorie `BOOKINGS`, non commerciale. Elle porte deux permissions :
   - `view_bookings` : voir la liste et le détail des réservations de l'agence ;
   - `manage_bookings` : confirmer, refuser, annuler.
2. Cette feature est incluse dans tous les plans actifs (Basic, Standard, Premium). Elle suit le modèle de `manage_conversations`, qui fait partie du service de base.
3. Chaque route porte sa permission :

   | Route | Permission |
   |---|---|
   | `bookings/agency` | `view_bookings` |
   | `bookings/confirm` | `manage_bookings` |
   | `bookings/reject` | `manage_bookings` |
   | `bookings/agency-cancel` | `manage_bookings` |

   Un staff sans la permission reçoit un 403 « Accès non autorisé ».
4. Les routes client (`create`, `my-bookings`, `cancel`) ne changent pas.

## Mise en place des données
- **Migration `10_booking_permission`** : ajoute la valeur `BOOKINGS` à l'enum `FeatureCategory`, et rien d'autre. Une nouvelle valeur d'enum Postgres ne peut pas servir dans la transaction qui la crée : les données passent donc par le seed.
- **Seed** : `pnpm db:seed:dev-feature` (ou `db:seed:uat-feature`). Il est idempotent : `upsert` des features et des permissions, et réécriture des features de chaque plan.
- **Conséquence** : les membres existants n'ont pas ces permissions. L'owner doit les leur accorder depuis « Équipe », puis « Permissions ». Jusque-là, un membre ne voit plus les réservations.

## Tests
Aucune logique nouvelle : le `PermissionGuard` global est déjà testé (lot 1). La vérification porte sur :
- le seed, qui s'exécute ;
- une route appelée par un staff avec la permission (200), puis sans elle (403) ;
- l'owner, qui garde l'accès.

## Limites
- **Toujours** : les données passent par le seed, pas par un script SQL.
- **Jamais** : accorder automatiquement la permission aux membres existants. C'est l'owner qui décide.
