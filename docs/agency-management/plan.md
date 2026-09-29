# Plan d'implémentation : lot 2 (fonctionnalités agence)

Spécification : [`SPEC.md`](../SPEC.md). Tâches : [`tasks/todo.md`](todo.md).

## Décisions d'architecture
- **Retrait des leads en deux temps (expand/contract).** Le web appelle encore les routes des leads.
  - **M1a (expand)** : migration `8_visit_client`, qui ajoute `Visit.clientId` et le remplit à partir du lead. Les visites passent sur `clientId`, et `leadId` devient nullable.
  - **M1b (contract)** : après l'adaptation du web, migration `9_remove_leads`, qui supprime `lead`, `Visit.leadId`, `Tenant.leadId` et `LeadStatus`. Le module et le seed disparaissent en même temps. C'est un déploiement séparé.
- **Pas de nouveau module.** Chaque route va dans son module existant, avec `HttpError`, `agencyAccessControl` et `@RequirePermission`.
- **Disponibilité des biens.** Elle est calculée à partir des réservations actives : l'annulation par l'agence ne fait que changer le statut, exactement comme l'annulation côté client.
- **Revenus.** Le calcul est une agrégation en mémoire sur les réservations d'une année et d'une seule agence.
  ```ts
  // ponytail: agrégation en mémoire, groupBy SQL par mois si le volume grossit
  ```

## Risques
| Risque | Impact | Mitigation |
|---|---|---|
| Backfill de `Visit.clientId` sur une visite dont le lead n'a pas de client | Moyen | `Lead.clientId` est obligatoire : chaque visite a donc un client. La colonne reste nullable jusqu'au M1b. |
| Retrait d'un membre qui porte des visites ou des tickets | Moyen | On les désassigne (`agentId = null`, `assignedToId = null`) dans la même transaction. |
| Web cassé entre M1a et l'adaptation web | Moyen | M1a garde les routes des leads et accepte encore `leadId`, dont on déduit alors le client. |

## Ordre
M1a → M2 → M3 → *checkpoint* → M4 → M5 → M6 → *checkpoint* → (lot web) → M1b.
