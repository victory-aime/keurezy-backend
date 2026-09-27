# Changements majeurs — Backend

Résumé des évolutions structurantes depuis `main`. Le détail est dans l'historique git ; ce document liste ce qu'il faut savoir pour développer et déployer.

## 1. Sécurité et validation

- **Identité issue de la session.** Les contrôleurs n'acceptent plus de `userId` venant du client. Les décorateurs `@CurrentUserId()` et `@AgencyProfileId()` lisent la session Better Auth. Toute ressource est contrôlée par rapport à son `agencyId` via `agencyAccessControl`.
- **Whitelist globale.** Le `ValidationPipe` supprime tout champ non déclaré dans un DTO. Un champ qui n'est pas décrit dans le DTO est donc ignoré : pensez à déclarer les nouveaux champs. `@MultipartJson('data', Dto)` applique la même validation aux formulaires multipart.
- **Instances uniques.** Un seul client Prisma (`PrismaService`, module global) et une seule instance Better Auth.
- **Découpage de `CommonModule`** en `PaymentsModule`, `PackModule` (plans et politiques de fonctionnalités) et `FirebaseModule`.

## 2. Base de données : migrations versionnées

Le projet utilisait `db push`. `prisma/migrations` est maintenant versionné :

| Migration                           | Contenu                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `0_init`                            | Référence du schéma existant (baseline)                                     |
| `1_cleanup_legacy_rentals`          | Suppression des anciennes tables de location, vides, idempotente            |
| `2_rental_configs_and_bookings`     | Modalités, disponibilités, réservations, contraintes `CHECK`                |
| `3_backfill_monthly_rental_configs` | Modalité mensuelle créée pour les biens existants (prix et caution actuels) |
| `4_bookings`                        | Type de notification `BOOKING`, durée réservée, index client                |

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
