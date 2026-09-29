# Spec : `destructive-action-impact` (backend)

## Objectif
**Règle produit** : toute suppression ou fermeture affiche d'abord son impact réel, c'est-à-dire ce qui est lié à l'élément, avec les quantités et les conséquences précises. Le backend fournit ces données par un endpoint `impact`, en lecture seule, pour chaque ressource concernée. **Le même calcul décide si la suppression est permise**, pour qu'il n'y ait qu'une seule règle.

## Contrat

| Route | Permission | Réponse |
|---|---|---|
| `GET property/impact?id` | `view_properties` | `PropertyImpact` |
| `GET land/impact?id` | `manage_land` | `LandImpact` |

```ts
interface PropertyImpact {
  annonces: { total: number; online: number };        // online : status ACTIVE
  bookings: { total: number; upcoming: number; pending: number };
  // upcoming : CONFIRMED dont la date de fin n'est pas passée ; pending : PENDING
  conversations: number;
  visits: { total: number; upcoming: number };         // upcoming : PLANNED ou CONFIRMED à venir
  canDelete: boolean; // aucune réservation, discussion ni visite
}
interface LandImpact {
  batiments: { id: string; name: string }[];
  villas: number;
  canDelete: boolean; // aucun bâtiment ni villa
}
```

- **Erreurs** : `PROPERTY_NOT_FOUND` ou `LAND_NOT_FOUND` (404), et 403 si la ressource appartient à une autre agence (contrôle sur l'agence de la ressource).
- **`property/delete`** et **`land/delete-land`** s'appuient sur ce même calcul : ils refusent quand `canDelete` vaut `false`. Les codes d'erreur existants sont conservés : `PROPERTY_HAS_BOOKINGS`, `PROPERTY_IN_USE`, `LAND_HAS_BUILDINGS`.

## Tests
- Le calcul d'impact : comptages et `canDelete`, avec Prisma mocké.
- La suppression refusée dès qu'il y a une visite. Avant, c'était la base qui bloquait, avec un code générique.
