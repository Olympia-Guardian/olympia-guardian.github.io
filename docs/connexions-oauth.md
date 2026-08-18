# Mettre en place les connexions Google et XIVAuth

Le code des trois fournisseurs (Discord, Google, XIVAuth) est déjà écrit et
déployé. Il ne manque que les applications à créer chez Google et chez XIVAuth,
et leurs clés à poser. Tant que c'est fait, les deux boutons de connexion
échouent — c'est normal, ce n'est pas un bug.

Aucun secret ne doit figurer dans ce dépôt : il est public. Les secrets se
posent avec `wrangler secret put`, qui les envoie chez Cloudflare sans jamais
les écrire sur le disque.

---

## 1. Google

### 1.1 Créer le projet

1. [console.cloud.google.com](https://console.cloud.google.com)
2. **Ne pas cliquer sur « Essayer gratuitement » ni sur l'offre à 300 $.** Cet
   essai ouvre un compte de facturation avec carte bancaire, et rien ici n'en a
   besoin : créer un écran de consentement et un identifiant OAuth est gratuit
   et ne demande aucune facturation. La page d'accueil est commerciale, elle
   pousse des produits (Gemini, VM, BigQuery) qui ne nous concernent pas.
3. Sélecteur de projet, en haut à côté du logo → **Nouveau projet** →
   nom `Codex Olympia` → Créer, puis le sélectionner.

### 1.2 Écran de consentement

Adresse directe : <https://console.cloud.google.com/auth/overview>

Cette section s'appelle désormais **Google Auth Platform** ; l'ancien chemin
(menu ☰ → **APIs et services** → **Écran de consentement OAuth**) mène au même
endroit. Selon l'ancienneté du compte, on voit l'un ou l'autre nom.

| Champ | Valeur |
|---|---|
| Type d'utilisateur | **Externe** |
| Nom de l'application | `Codex Olympia` |
| E-mail d'assistance | le tien |
| Domaine autorisé | `olympia-guardian.github.io` |
| E-mail développeur | le tien |

**Le piège** : à la création, l'application reste en mode **Test**, et dans ce
mode **seuls les comptes inscrits explicitement comme testeurs peuvent se
connecter**. Il faut cliquer sur **Publier l'application**.

L'application ne demande que `openid profile`, deux portées non sensibles :
Google ne réclame donc aucune procédure de vérification, la publication est
immédiate.

### 1.3 Créer l'identifiant

**Identifiants → Créer des identifiants → ID client OAuth**

| Champ | Valeur |
|---|---|
| Type | **Application Web** |
| Nom | `ogs-room` |
| URI de redirection autorisé | `https://ogs-room.olympia-guardian.workers.dev/auth/google/callback` |

L'URI doit être **exactement** celle-ci, à la lettre près : Google refuse toute
redirection non déclarée, et c'est justement ce qui protège la session.

### 1.4 Poser les clés

Google affiche un **ID client** et un **secret client**.

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET --config worker/wrangler.toml
```

L'ID client, lui, est public : il va dans `worker/wrangler.toml`, section
`[vars]`, sous le nom `GOOGLE_CLIENT_ID`.

---

## 2. XIVAuth

XIVAuth est un service tiers d'authentification pour FFXIV. Son intérêt dépasse
la simple connexion : son point `/characters` ne renvoie que des personnages
**déjà attestés chez eux**, donc s'y connecter lie et vérifie les personnages
d'office, sans avoir à recopier un code sur le profil Lodestone.

### 2.1 Créer l'application

1. [xivauth.net](https://xivauth.net), se connecter.
2. Section développeur / applications OAuth, créer une application.

| Champ | Valeur |
|---|---|
| Nom | `Codex Olympia` |
| Redirection | `https://ogs-room.olympia-guardian.workers.dev/auth/xivauth/callback` |
| Portées | `user` **et** `character:all` |

`character:all` est la portée qui donne la liste des personnages attestés. Sans
elle, la connexion fonctionne mais le raccourci de vérification ne sert à rien.

### 2.2 Poser les clés

```bash
npx wrangler secret put XIVAUTH_CLIENT_SECRET --config worker/wrangler.toml
```

L'ID client va dans `[vars]` sous le nom `XIVAUTH_CLIENT_ID`.

---

## 3. Déployer et vérifier

```bash
npx wrangler@4.121.0 deploy --config worker/wrangler.toml
```

Puis, dans l'application :

- [ ] Le bouton **G** ouvre l'écran Google et ramène connecté.
- [ ] Le bouton **XIVAuth** ramène connecté **et** les personnages attestés
      apparaissent déjà liés et vérifiés dans Mon Journal, sans code à recopier.
- [ ] Se connecter avec Discord donne bien le compte historique, inchangé.

---

## Ce qu'il faut savoir sur le modèle de comptes

**Un compte par fournisseur.** Se connecter avec Google puis avec Discord crée
deux comptes distincts, avec chacun ses personnages et ses groupes.

C'est délibéré. Les rapprocher automatiquement supposerait de traiter l'adresse
e-mail comme une identité commune, ce qui est exactement la faille par laquelle
on s'approprie le compte d'autrui : il suffit d'ouvrir un compte chez un
fournisseur avec l'adresse de sa victime. Le rapprochement se fera un jour
depuis la page de compte, en étant déjà connecté aux deux — la seule preuve qui
vaille.

**Règle de sécurité côté personnages.** Un personnage déjà revendiqué et vérifié
par un autre compte n'est jamais repris par une attestation XIVAuth. Sans cette
règle, une attestation venue d'un autre service pourrait voler une liaison
établie ici.

---

## Rappel des autres commandes d'exploitation

```bash
npm run backup     # sauvegarde de la base de production (aussi planifiee a 21 h)
npm run build      # verification des types + compilation
npx wrangler@4.121.0 deploy --config worker/wrangler.toml   # deploiement du worker
```

Le front se deploie tout seul a chaque poussee sur `main`.
