# Audit de sécurité : `destructive-action-impact` (backend)

Date : 2026-09-29. Méthode : skill `security-and-hardening`.

- **Accès aux ressources d'une autre agence (IDOR).** `property/impact` et `land/impact` chargent la ressource, puis contrôlent l'agence propriétaire (`agencyAccessControl`) avant tout comptage. Une ressource d'une autre agence renvoie 403, et une ressource inexistante 404. ✅
- **Permissions.** Les deux routes sont protégées par le guard global : `view_properties` et `manage_land`. ✅
- **Fuite d'information.** La réponse ne contient que des comptages, plus le nom des bâtiments de la même agence. Aucune donnée personnelle (clients, messages). ✅
- **Intégrité.** Les deux routes sont en lecture seule. La suppression s'appuie sur le même calcul (`canDelete`) : l'interface et le backend ne peuvent pas diverger. Une visite liée bloque désormais la suppression avec `PROPERTY_IN_USE`, au lieu d'une erreur de clé étrangère. ✅
- **Charge.** Au plus 8 requêtes `count` indexées, lancées en parallèle, par appel. Aucune liste non bornée. ✅

**Verdict** : rien à signaler.

## Ajout : `building/impact` et suppression d'un bâtiment
- La route est protégée par `manage_batiment`. L'agence propriétaire du bâtiment est contrôlée avant tout comptage. ✅
- **Intégrité des données.** Avant, supprimer un bâtiment supprimait ses biens, leurs annonces et leurs discussions en cascade. S'il y avait des réservations, l'erreur n'était pas gérée (500). La suppression est désormais refusée tant qu'un bien a un historique. ✅
