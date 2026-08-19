# Lire les succès sur le Lodestone — ce qui est établi

Chantier commencé le 19 août 2026, **arrêté avant d'être fini** et retiré du
dépôt : le worker en production ne lit pas les succès. Ce document garde les
mesures, pour ne pas les refaire.

## Ce qui est prouvé

**Le Lodestone publie les succès**, page par catégorie :
`/lodestone/character/<id>/achievement/kind/<k>/`

**Les catégories utiles sont 1, 2, 3, 4, 5, 8, 11 et 12.** Les autres numéros
répondent mais ne contiennent rien. À revérifier si Square Enix en ajoute une.

**Chaque entrée est un `<div class="entry" data-achieved="0|1">`** suivi d'un lien
`/achievement/detail/<id>/`. La page liste TOUT le catalogue de la catégorie ;
seul `data-achieved="1"` marque ce que le joueur possède.

**Les identifiants du Lodestone sont exactement les nôtres.** Vérifié sur les
1728 succès d'un personnage réel : 1728 reconnus, zéro inconnu. Nos catalogues
viennent de FFXIV Collect, qui les tient de la même source. Aucune table de
correspondance n'est nécessaire.

**Un profil fermé renvoie HTTP 403**, avec « You do not have permission to view
this page. » C'est un signal franc, à ne pas confondre avec une panne.

## Ce qui a coûté du temps

**Le volume.** Les huit pages pèsent 2,5 Mo. Mesure des temps depuis une
connexion domestique : **12 s pour la première page** (à froid), moins de 2 s
pour les sept autres. Le délai de 8 s prévu pour les pages de montures les tuait
systématiquement — et l'erreur était avalée par un `catch` muet.

**Le mauvais découpage.** Les entrées sont des `div`, pas des `li` ; chercher
`<li class="entry"` renvoie zéro sans rien signaler.

## Comment il faut le construire

**En arrière-plan, pas dans la requête.** C'est ainsi que fait FFXIV Collect :
leur scraping tourne dans une file Sidekiq (`XivauthCharactersSyncJob`,
`sidekiq_options(queue: :character)`), jamais pendant qu'un utilisateur attend.

Chez nous l'équivalent existe déjà : `ctx.waitUntil()` pour continuer après avoir
répondu, et le canal temps réel (`notify` → `LiveHub`) qui pousse un événement
`char` — la fiche se rafraîchirait seule à l'écran. Les montures et mascottes
restent lues dans la requête, elles sont légères ; seuls les succès partent en
arrière-plan.

**L'inconnue à lever en production** : le plan gratuit limite le temps
processeur par invocation, et analyser 2,5 Mo de HTML n'est pas gratuit.
`wrangler dev` n'applique pas cette limite, donc les essais locaux ne disent
rien. Si ça coince, balayer le texte plutôt que le découper, ou étaler les huit
pages sur plusieurs réveils.

## Le reste à faire

- Colonne `public_achievements` sur `characters` (le fichier de schéma a été
  retiré, à réécrire).
- Écriture protégée : ne jamais remplacer une liste pleine par une liste vide,
  comme pour les montures.
- Les succès deviennent **non modifiables** quand ils viennent du Lodestone,
  comme les montures et les mascottes.
- Profil fermé : à la place de la liste, un message invitant à ouvrir ses succès
  sur le Lodestone.
- Onglet des succès en premier dans Mon Journal, avec l'icône du Lodestone —
  seulement une fois la lecture réelle en place, sinon l'icône ment.

## Attention

La base D1 **locale** a servi aux essais : elle contient une colonne
`public_achievements` et 1728 succès de source `lodestone` pour le personnage
8264743. La base de production, elle, n'a pas été touchée.
