# OGS Collect

**🌐 App en ligne : https://vincent-leostic.github.io/ogs-collect/**

Appli web pour compléter vos collections FFXIV **en groupe** : elle croise les
collections de tout le monde — montures, mascottes, cartes Triple Triad,
accessoires de mode, rouleaux d'orchestrion, sorts de magie bleue — via l'API
publique [FFXIV Collect](https://ffxivcollect.com) et vous dit **quel contenu
farmer ensemble pour que chaque run profite au plus de joueurs possible**.

⚠ Cartes et accessoires ne sont pas lisibles sur le Lodestone (montures et
mascottes, elles, sont synchronisées automatiquement). Deux façons de les
compter : les cocher sur son profil ffxivcollect.com, **ou cliquer les cases
directement dans les onglets Cartes / Access. de l'appli** — ces coches
manuelles sont encodées dans le lien du groupe (paramètre `o=`, bitmap base64)
et fusionnées par union quand quelqu'un ouvre le lien. Impossible en revanche
d'écrire vers FFXIV Collect / Lalachievements : leurs API publiques sont en
lecture seule.

## Lancer

```bash
npm install
npm run dev     # → http://localhost:5173
```

Aucun serveur ni compte : tout tourne dans le navigateur, les données du groupe
restent en localStorage et se partagent par lien.

Interface bilingue **FR/EN** (sélecteur en haut à droite, détection automatique
du navigateur) — noms d'objets, sources et descriptions localisés des deux
côtés (les deux langues sont déjà dans la base fusionnée).

## Utilisation

1. Chaque joueur ajoute son perso avec son **ID Lodestone** (les chiffres dans
   l'URL de sa fiche : `…/lodestone/character/12345678/`). Une URL Lodestone ou
   FFXIV Collect collée telle quelle marche aussi. Les persos inconnus de
   FFXIV Collect sont importés automatiquement à la première requête.
2. **Planning** : le contenu est regroupé par source (défi, raid, donjon… ; les
   récompenses à monnaie comme le Carnet fabuleux font une carte par catégorie)
   et trié par impact — « 32 à looter » = nombre total d'objets que le groupe
   peut y récupérer. Filtres : instances / solo / tout, montures ou mascottes,
   **solo vs groupe**, « manque à ≥ N joueurs », recherche.

   Le badge « Groupe requis / conseillé / Solo ok » est une heuristique (l'API
   ne fournit pas l'info) : raid chaotique, Tour fourchue, Delubrum sauvage,
   arsenal de Baldesion et le contenu haut niveau de l'extension courante (7.x)
   → groupe ; chasses et cartes au trésor → groupe conseillé ; le reste (vieux
   contenu désynchronisable inclus) → solo. À ajuster dans `sources.ts`
   (`sourceGroupNeed`, `CURRENT_EXPANSION`) à chaque nouvelle extension.
3. **Montures / Mascottes** : matrice objet × joueur (✓ possédé, ✗ manquant),
   tri « manque au plus de monde », badge **HV** si achetable en hôtel des
   ventes.
4. **⚡ Activer la synchro** (recommandé) : crée un « salon » partagé — le lien
   devient court et stable (`#r=…`), à partager **une seule fois**. Ensuite le
   roster ET les coches manuelles se synchronisent tout seuls pour tout le
   groupe (à l'ouverture, au retour sur l'onglet, toutes les 90 s). Ajouts,
   retraits et décochages se propagent (fusion « le plus récent gagne »).
   Fonctionne pareil à 4 ou à 25 joueurs.

   Stockage : un document JSON anonyme sur textdb.dev, adressé par un UUID que
   l'app choisit (l'UUID du lien est le secret du groupe). Chaque navigateur
   garde une copie locale complète : si le service purge le document, le premier
   membre qui ouvre l'app le re-crée à l'identique au même ID — le lien ne meurt
   jamais. Pour changer de backend un jour (Cloudflare Worker…), une seule
   constante à modifier : `ROOM_API` dans `src/room.ts`.

   Sans synchro, l'ancien mode reste : roster encodé dans l'URL (`#g=…`),
   coches dans `#o=…`, fusion par union à l'ouverture d'un lien.

Si les derniers loots d'un perso n'apparaissent pas : mettre à jour le perso sur
ffxivcollect.com puis cliquer ↻ sur sa carte (cache local de 6 h).

## Déployer

```bash
npm run build   # → dist/, statique, hébergeable n'importe où (GitHub Pages…)
```

## Notes techniques

- Vite + React + TypeScript, zéro dépendance runtime hors React.
- La base d'objets est chargée **en anglais ET en français** puis fusionnée :
  avec `language=fr`, l'API traduit aussi les *types* de sources (« Occult
  Crescent » → « L'île de Lunule »), or la logique de catégories s'appuie sur
  l'enum anglais stable. Noms affichés en FR, recherche sur FR + EN.
- Caches localStorage : base d'objets 24 h (`ogs.db.*.v2`), persos 6 h
  (`ogs.char.*.v1`), roster (`ogs.roster.v1`).
