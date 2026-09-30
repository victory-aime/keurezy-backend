# Spec : `api-rate-limiting`

> Demande du 30/09 : protéger le backend contre les abus (brute force, inondation de requêtes). Le web y participe par le transfert de l'IP cliente via le proxy Next.

## Constats
1. **Limite contournable** : `trust proxy: true` combiné à `req.ips[0]` retient l'adresse **la plus à gauche** de `X-Forwarded-For`, qui est **fournie par le client**. En changeant cet en-tête à chaque requête, un attaquant obtient un nouveau compteur et contourne toute limite, sur la connexion comme ailleurs.
2. **Une seule limite globale** (100 requêtes par 10 s) : rien de plus strict sur les routes publiques sensibles (mot de passe oublié, renvoi de vérification, codes OTP, acceptation d'invitation).
3. **Web derrière le rewrite Next** : pour le backend, toutes les requêtes anonymes du web viennent de l'IP du serveur Next. Une limite par IP y bloquerait **tous** les visiteurs à la fois.
4. **Better Auth** (connexion, 2FA) a son propre limiteur. Celui-ci lit aussi `X-Forwarded-For`, avec le même risque d'usurpation.

## Solution
- **Une IP cliente résolue une seule fois**, par un middleware Express placé avant toute route :
  - Si la requête vient du proxy Next, elle porte le secret partagé `INTERNAL_PROXY_SECRET`, vérifié en temps constant. On prend alors l'IP transmise dans `x-keurezy-client-ip`.
  - Sinon (mobile, appel direct), on prend `req.ip` avec `trust proxy` = `TRUST_PROXY_HOPS`, par défaut 1. Il s'agit du nombre de proxys de confiance devant le backend, compté depuis la droite, donc non falsifiable.
  - Le résultat est écrit dans `x-keurezy-resolved-ip`, en écrasant toute valeur envoyée par le client. Le throttler Nest et Better Auth lisent cet en-tête.
- **Trois limites** :

  | Limite | Portée | Valeur par défaut |
  |---|---|---|
  | `burst` | toutes les routes, par utilisateur connecté ou par IP | 20 requêtes/s |
  | `sustained` | toutes les routes, par utilisateur connecté ou par IP | 300 requêtes/min |
  | `sensitive` | routes publiques d'authentification et d'invitation | 5 requêtes/min |

  - Better Auth : `ipAddressHeaders = ['x-keurezy-resolved-ip']`, avec des règles strictes sur la vérification 2FA (5 par minute), en plus des règles par défaut sur la connexion.
- **Réponse 429** avec un message en français.
- **Web** : `proxy.ts` ajoute `x-keurezy-client-ip` et le secret sur `/api/v1/*`, et écrase toute valeur envoyée par le navigateur.
- **Calibrage** : `LOG_CLIENT_IP=true` journalise temporairement la chaîne `X-Forwarded-For` et l'IP retenue, pour régler `TRUST_PROXY_HOPS` en UAT. À désactiver ensuite, car une IP est une donnée personnelle.

## Limites
- **Attaque DDoS volumétrique** : aucune application ne l'absorbe. Elle se traite **en bordure**, par la protection DDoS du fournisseur (Render s'appuie sur Cloudflare) ou par un WAF Cloudflare devant les deux services. C'est une recommandation d'infrastructure, hors code.
- **Compteurs en mémoire** : ils sont justes avec une seule instance. Au-delà, il faudra un stockage partagé (Redis, `@nest-lab/throttler-storage-redis`) et `secondaryStorage` pour Better Auth.

## Critères d'acceptation
1. Changer `X-Forwarded-For` ne donne plus de nouveau compteur, pour un appel direct comme pour un appel via le web.
2. Au-delà de la limite, une route sensible répond 429 ; les autres routes restent disponibles.
3. Deux visiteurs anonymes du web ont des compteurs distincts (à condition que `INTERNAL_PROXY_SECRET` soit configuré).
4. Tests Jest de `resolveClientIp` : secret valide ; secret invalide ou absent ; en-tête du client écrasé.

## Tâches
- [x] T1 `config/throttle.ts` : limites et `resolveClientIp`, avec leurs tests.
- [x] T2 `main.ts` : `trust proxy` = hops ; middleware qui résout l'IP et écrase l'en-tête ; `LOG_CLIENT_IP`.
- [x] T3 `app.module.ts` : throttlers `burst` et `sustained`, et le message du 429. Le guard lit l'IP résolue. `@Throttle` `sensitive` sur les routes publiques d'authentification et d'invitation.
- [x] T4 `lib/auth.ts` : IP résolue et règles sur la vérification 2FA.
- [x] T5 web `proxy.ts` : transmission de l'IP cliente et du secret.
- [x] T6 variables d'environnement documentées dans `CHANGES.md` (pas de `.env.example` dans les repos).
