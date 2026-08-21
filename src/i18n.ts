import { lsGet, lsSet } from './storage'
import { createContext, useContext } from 'react'
import type { Kind } from './api'

// ---------------------------------------------------------------------------
// Internationalisation FR / EN. Les noms d'objets et textes de sources
// existent déjà dans les deux langues (fusion EN+FR de la base) ; ce module
// couvre les chaînes de l'interface. Interpolation : t('clé', { n: 3 }).
// ---------------------------------------------------------------------------

export type Lang = 'fr' | 'en'

const LANG_KEY = 'ogs.lang.v1'

export function detectLang(): Lang {
  try {
    const stored = lsGet(LANG_KEY)
    if (stored === 'fr' || stored === 'en') return stored
  } catch {
    // pas de préférence enregistrée
  }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function persistLang(lang: Lang): void {
  try {
    lsSet(LANG_KEY, lang)
  } catch {
    // tant pis
  }
}

const STR = {
  // Barre du haut
  planning: { fr: 'Planning', en: 'Planner' },
  focusTitle: {
    fr: 'Voir tout le groupe, ou juste un perso (choix mémorisé sur ce navigateur)',
    en: 'View the whole group, or a single character (remembered on this browser)',
  },
  enableSync: { fr: '⚡ Activer la synchro', en: '⚡ Enable sync' },
  enableSyncTitle: {
    fr: 'Crée un salon partagé : le lien devient court et stable, et le roster comme les coches se synchronisent tout seuls pour tout le groupe, plus besoin de repartager le lien.',
    en: 'Creates a shared room: the link becomes short and stable, and the roster and manual checks sync automatically for everyone, no need to re-share the link.',
  },
  syncOn: { fr: 'Synchro auto', en: 'Auto sync' },
  syncKo: { fr: 'Synchro KO', en: 'Sync down' },
  syncOkTitle: {
    fr: 'Roster et coches synchronisés automatiquement pour tout le groupe via le lien.',
    en: 'Roster and manual checks sync automatically for the whole group through the link.',
  },
  syncErrTitle: {
    fr: 'Impossible de joindre le salon, réessai automatique. Les données restent enregistrées en local.',
    en: 'Cannot reach the room, retrying automatically. Your data is still saved locally.',
  },
  lastSync: { fr: 'Dernière synchro : {time}', en: 'Last sync: {time}' },
  syncOffTitle: {
    fr: 'Désactiver la synchro sur ce navigateur (les données restent en local)',
    en: 'Disable sync on this browser (data stays local)',
  },
  syncOffConfirm: {
    fr: 'Désactiver la synchro automatique ?\n\nTu quitteras le salon du groupe sur ce navigateur (ton roster reste en local). Tu pourras le rejoindre à nouveau en rouvrant le lien du groupe.',
    en: 'Disable auto sync?\n\nThis browser will leave the group room (your roster stays local). You can rejoin anytime by opening the group link again.',
  },
  copyLink: { fr: 'Copier le lien du groupe', en: 'Copy group link' },
  copyLinkSolo: { fr: 'Copier le lien', en: 'Copy link' },
  soloChar: { fr: 'Mon perso', en: 'My character' },
  soloOwned: { fr: '✓ Possédé', en: '✓ Owned' },
  soloMissing: { fr: '✗ Manquant', en: '✗ Missing' },
  copied: { fr: 'Lien copié ✓', en: 'Link copied ✓' },
  copyPrompt: { fr: 'Copie ce lien :', en: 'Copy this link:' },

  // Digest
  digestSince: { fr: '📥 Depuis ta dernière visite :', en: '📥 Since your last visit:' },
  digestJoined: { fr: 'a rejoint le groupe', en: 'joined the group' },
  dismiss: { fr: 'Fermer', en: 'Dismiss' },

  // États généraux
  dbError: {
    fr: 'Impossible de charger la base FFXIV Collect : {error}. Recharge la page pour réessayer.',
    en: 'Could not load the FFXIV Collect database: {error}. Reload the page to retry.',
  },
  dbLoading: { fr: 'Chargement de la base des collections…', en: 'Loading the collections database…' },
  allAbsent: {
    fr: 'Tout le monde est marqué absent ce soir 😅, réactive quelqu\'un dans le roster.',
    en: 'Everyone is marked away tonight 😅, bring someone back in the roster.',
  },
  heroTitle: { fr: 'Complétez vos collections ensemble', en: 'Complete your collections together' },
  heroBody: {
    fr: "Suis un personnage par son ID Lodestone : ses montures et ses mascottes arrivent toutes seules, et le planning te dit quoi farmer ensemble. Avec un compte, tes quatorze collections s'ajoutent (cartes, mode, émotes, orchestrion, magie bleue, succès, reliques…) et le groupe se partage vraiment.",
    en: 'Track a character by Lodestone ID: their mounts and minions come in on their own, and the planner tells you what to farm together. With an account, all fourteen collections join in (cards, fashion, emotes, orchestrion, blue magic, achievements, relics…) and the group becomes truly shared.',
  },
  heroLogin: { fr: 'Se connecter', en: 'Sign in' },
  heroFollow: { fr: 'Suivre un personnage', en: 'Track a character' },
  heroHint: {
    fr: 'Sans compte, seules les montures et les mascottes sont lisibles : elles viennent du Lodestone. Le reste se coche dans « Mon Journal », qui demande un compte.',
    en: 'Without an account, only mounts and minions are readable: they come from the Lodestone. The rest is ticked in “My Journal”, which needs an account.',
  },
  footer: {
    fr: 'catalogues rafraîchis chaque nuit',
    en: 'catalogues refreshed nightly',
  },
  reportLink: { fr: 'signaler un problème', en: 'report a problem' },
  adminPinIntro: {
    fr: "Cette page demande un code en plus de ton compte. Il n'est gardé que le temps de cet onglet.",
    en: 'This page needs a code on top of your account. It is only kept for this tab.',
  },
  adminPinField: { fr: 'Code', en: 'Code' },
  adminTabOverview: { fr: "Vue d'ensemble", en: 'Overview' },
  adminTabReports: { fr: 'Signalements', en: 'Reports' },
  adminTabHealth: { fr: 'Santé', en: 'Health' },
  adminTabAdoption: { fr: 'Adoption', en: 'Adoption' },
  adminTabCosts: { fr: 'Coûts', en: 'Costs' },
  adminCostsNote: {
    fr: "Où la base grossit, et donc ce qui consommera le quota en premier. La consommation exacte du jour n'est pas accessible depuis le worker : elle se lit sur le tableau de bord Cloudflare. La compter ici coûterait une écriture par requête, soit exactement le quota qu'on cherche à ménager.",
    en: 'Where the database grows, and therefore what will eat the quota first. Exact daily usage is not reachable from the worker: read it on the Cloudflare dashboard. Counting it here would cost one write per request, the very quota we are trying to spare.',
  },
  adminCostsTotal: { fr: '{n} lignes en base', en: '{n} rows in the database' },
  adminAdoActive7: { fr: 'Actifs cette semaine', en: 'Active this week' },
  adminAdoActive7Hint: {
    fr: '{n} sur 30 jours. On compte les actifs, pas les inscrits : un total qui ne fait que monter ne fait jamais agir.',
    en: '{n} over 30 days. Active users, not signups: a number that only goes up never prompts a decision.',
  },
  adminAdoRetention: { fr: 'Reviennent', en: 'Come back' },
  adminAdoRetentionHint: {
    fr: "Part des comptes de plus d'une semaine revenus dans les 30 derniers jours. Le seul chiffre qui dit si l'appli sert vraiment.",
    en: 'Share of accounts older than a week that returned in the last 30 days. The only figure that tells you the app is actually useful.',
  },
  adminAdoChars: { fr: 'Personnages vérifiés', en: 'Verified characters' },
  adminAdoCharsHint: {
    fr: '{n} ont coché quelque chose à la main ces 30 derniers jours.',
    en: '{n} ticked something by hand in the last 30 days.',
  },
  adminAdoGroups: { fr: 'Groupes vivants', en: 'Live groups' },
  adminAdoGroupsHint: {
    fr: 'Ayant bougé ces 30 derniers jours, sur le total créé.',
    en: 'Changed in the last 30 days, out of all created.',
  },
  adminHealthFresh: { fr: 'Âge des catalogues', en: 'Catalogue age' },
  adminHealthFreshHint: {
    fr: 'Au-delà de 72 h, le rafraîchissement nocturne est en panne.',
    en: 'Past 72 h, the nightly refresh is broken.',
  },
  adminHealthLodestone: { fr: "Échecs de lecture du Lodestone", en: 'Lodestone read failures' },
  adminHealthLodestoneHint: {
    fr: '{ok} réussies, {ko} échouées sur 14 jours. Une hausse annonce un blocage ou un changement de leur HTML.',
    en: '{ok} succeeded, {ko} failed over 14 days. A rise signals a block or a change in their HTML.',
  },
  adminHealthErrors: { fr: 'Erreurs du serveur', en: 'Server errors' },
  adminHealthErrorsHint: {
    fr: 'Sur 14 jours. Le détail est dans les journaux Cloudflare.',
    en: 'Over 14 days. Details are in the Cloudflare logs.',
  },
  adminHealthThrottle: { fr: 'Requêtes freinées', en: 'Throttled requests' },
  adminHealthThrottleHint: {
    fr: "Sur 14 jours. Quelques-unes sont saines ; une explosion signale un abus ou un réglage trop serré.",
    en: 'Over 14 days. A few are healthy; a spike means abuse or a setting that is too tight.',
  },
  adminTabAccounts: { fr: 'Comptes', en: 'Accounts' },
  adminTabGroups: { fr: 'Groupes', en: 'Groups' },
  adminTabUsage: { fr: 'Usage', en: 'Usage' },
  adminUsageHint: {
    fr: 'Sur quatorze jours. Anonyme : un compteur par jour, jamais qui.',
    en: 'Over fourteen days. Anonymous: one counter per day, never who.',
  },
  adminUsageScreens: { fr: 'Écrans ouverts', en: 'Screens opened' },
  adminUsageScreensHint: {
    fr: 'Annoncés par le navigateur. Un bloqueur de publicité coupe ce signal : ces visites manquent ici, jamais dans les routes.',
    en: 'Announced by the browser. An ad blocker cuts this signal: those visits are missing here, never from the routes.',
  },
  adminUsageRoutes: { fr: 'Routes appelées', en: 'API routes called' },
  adminTabFlags: { fr: 'Interrupteurs', en: 'Switches' },
  adminFlagOn: { fr: 'Allumé', en: 'On' },
  adminFlagOff: { fr: 'Éteint', en: 'Off' },
  adminFlagMarket: {
    fr: 'Éteint, l’onglet disparaît pour tout le monde. Rien n’est perdu : la page interroge Universalis en direct.',
    en: 'Off, the tab disappears for everyone. Nothing is lost: the page queries Universalis live.',
  },
  adminFlagRaid: {
    fr: 'Éteint, on ne peut plus créer de groupe de raid. Ceux qui existent continuent de fonctionner.',
    en: 'Off, no new raid group can be created. Existing ones keep working.',
  },
  adminFlagSuggestionsTitle: { fr: 'Suggestions entre joueurs', en: 'Player suggestions' },
  adminFlagSuggestions: {
    fr: 'Éteint, le bouton « suggérer » disparaît et le worker refuse les envois.',
    en: 'Off, the “suggest” button disappears and the worker refuses new ones.',
  },
  adminTabIcons: { fr: 'Icônes', en: 'Icons' },
  adminIconsNote: {
    fr: 'Les icônes du jeu, servies par XIVAPI. Clique pour copier le numéro : c’est lui qui s’écrit dans TAB_ICONS. Les feuilles donnent un nom ; le parcours par numéro sert pour tout le reste, où le jeu n’en donne aucun.',
    en: 'The game icons, served by XIVAPI. Click to copy the number: that is what goes into TAB_ICONS. Sheets carry names; browsing by number covers everything else, where the game gives none.',
  },
  adminIconsByNumber: { fr: 'Parcourir par numéro', en: 'Browse by number' },
  adminIconsSearch: { fr: 'Chercher un nom ou un numéro…', en: 'Search a name or number…' },
  adminIconsCopy: { fr: 'Copier le numéro', en: 'Copy the number' },
  adminIconsMore: {
    fr: '{n} autres icônes correspondent. Affine la recherche pour les voir.',
    en: '{n} more icons match. Narrow the search to see them.',
  },
  adminIconsCopied: { fr: 'Numéro {id} copié.', en: 'Number {id} copied.' },
  adminIconsError: {
    fr: 'XIVAPI n’a pas répondu. Le parcours par numéro fonctionne quand même, il ne demande rien à personne.',
    en: 'XIVAPI did not answer. Browsing by number still works, it asks no one.',
  },
  adminNoReport: { fr: 'Aucun signalement pour le moment.', en: 'No reports yet.' },
  adminMarkDone: { fr: 'Marquer traité', en: 'Mark handled' },
  adminReopen: { fr: 'Rouvrir', en: 'Reopen' },
  adminPinUnlock: { fr: 'Déverrouiller', en: 'Unlock' },
  reportTitle: { fr: 'Signaler un problème', en: 'Report a problem' },
  reportIntro: {
    fr: "Décris ce qui ne va pas, le plus simplement possible. L'écran où tu te trouves et ton personnage sont joints automatiquement, pas besoin de les préciser.",
    en: 'Describe what went wrong, as plainly as possible. The screen you are on and your character are attached automatically, no need to mention them.',
  },
  reportPlaceholder: {
    fr: "Exemple : le bouton Synchroniser ne fait rien depuis ce matin.",
    en: 'Example: the Sync button does nothing since this morning.',
  },
  reportSend: { fr: 'Envoyer', en: 'Send' },
  reportSending: { fr: 'Envoi…', en: 'Sending…' },
  reportThanks: {
    fr: "C'est envoyé, merci. Chaque signalement est lu.",
    en: 'Sent, thank you. Every report gets read.',
  },
  reportQuota: {
    fr: "Tu as déjà envoyé plusieurs signalements aujourd'hui. Reviens demain, ou ajoute le reste à un message existant.",
    en: 'You have already sent several reports today. Come back tomorrow, or add the rest to an existing message.',
  },
  reportError: {
    fr: "L'envoi a échoué. Réessaie dans un instant.",
    en: 'Sending failed. Try again in a moment.',
  },
  footerStats: {
    fr: '{kinds} collections suivies, {items} objets répertoriés',
    en: '{kinds} collections tracked, {items} items catalogued',
  },
  feedback: { fr: 'un souci, une idée ?', en: 'issues & ideas' },
  support: {
    fr: "Tu veux soutenir l'application ? Achète-nous un café ! ☕",
    en: 'Want to support the app? Buy us a coffee! ☕',
  },

  // Comptes & Mon Journal
  myPage: { fr: 'Mon Journal', en: 'My Journal' },
  loginDiscord: { fr: 'Se connecter avec Discord', en: 'Sign in with Discord' },
  loginShort: { fr: 'Connexion', en: 'Sign in' },
  loginIntro: {
    fr: 'Connecte-toi pour lier un ou plusieurs personnages et renseigner directement tes collections : cartes, mode, tenues, émotes, orchestrion, magie bleue, reliques…',
    en: 'Sign in to link one or more characters and fill in your collections directly: cards, fashion, outfits, emotes, orchestrion, blue magic, relics…',
  },
  logout: { fr: 'Se déconnecter', en: 'Sign out' },
  backToTop: { fr: 'Remonter en haut', en: 'Back to top' },
  crossTitle: { fr: 'Tenues et armoire', en: 'Outfits and armoire' },
  shopExcluded: {
    fr: "Le 100 % s'atteint en jouant : les objets de la boutique se cochent toujours, mais sortent des totaux. Entre parenthèses, les chiffres boutique comprise.",
    en: '100% is reachable by playing: store items can still be ticked, but are left out of the totals. In brackets, the figures including store items.',
  },
  market: { fr: 'Mon Marché', en: 'My Market' },
  marketNeedChar: {
    fr: 'Lie et vérifie un personnage dans Mon Journal : le marché a besoin de savoir ce qui te manque et sur quel centre de données tu joues.',
    en: 'Link and verify a character in My Journal: the market needs to know what you are missing and which data centre you play on.',
  },
  marketChar: { fr: 'Personnage', en: 'Character' },
  marketBought: {
    fr: "Je l'ai acheté : ajouter à ma collection",
    en: 'Bought it: add to my collection',
  },
  marketBudget: { fr: 'Budget en gils', en: 'Budget in gil' },
  marketMaxPrice: { fr: 'Prix maximum par objet', en: 'Max price per item' },
  marketNoCap: { fr: 'sans limite', en: 'no limit' },
  marketAll: { fr: 'Tout sélectionner', en: 'Select all' },
  marketScopeDc: { fr: 'Mon centre : {dc}', en: 'My data centre: {dc}' },
  marketScopeRegion: { fr: 'Toute la région : {region}', en: 'Whole region: {region}' },
  marketScopeRegionHint: {
    fr: "Ouvre l'autre centre de données de ta région. Le voyage y est possible mais plus lourd qu'entre mondes voisins, et tes servants restent chez toi.",
    en: 'Opens the other data centre in your region. Travel is possible but heavier than between neighbouring worlds, and your retainers stay home.',
  },
  marketNone: { fr: 'Tout désélectionner', en: 'Clear all' },
  marketSummaryNoBudget: {
    fr: '{n} objets pour {total} gils, répartis sur {worlds} monde(s).',
    en: '{n} items for {total} gil, across {worlds} world(s).',
  },
  marketNothingCap: {
    fr: 'Ton plafond est de {max} gils par objet.',
    en: 'Your cap is {max} gil per item.',
  },
  marketSearch: { fr: 'Chercher parmi {n} objets manquants', en: 'Search across {n} missing items' },
  marketSearching: { fr: 'Recherche des prix… {fait}/{total}', en: 'Fetching prices… {fait}/{total}' },
  marketMostItems: { fr: "Le plus d'objets", en: 'Most items' },
  marketFewestTrips: { fr: 'Le moins de voyages', en: 'Fewest trips' },
  marketSummary: {
    fr: 'Pour {total} gils, {n} objets répartis sur {worlds} monde(s). Il te resterait {reste} gils.',
    en: 'For {total} gil, {n} items across {worlds} world(s). You would have {reste} gil left.',
  },
  marketNothingFound: { fr: 'Rien de trouvé pour ces filtres.', en: 'Nothing found for these filters.' },
  marketReset: { fr: 'Réinitialiser les filtres', en: 'Reset the filters' },
  marketSearchName: { fr: 'Chercher un objet par son nom…', en: 'Search an item by name…' },
  marketPieces: { fr: 'Pièces de tenue', en: 'Outfit pieces' },
  marketBudgetLegend: { fr: 'Combien dépenser', en: 'How much to spend' },
  marketKindsLegend: { fr: 'Dans quelles collections', en: 'In which collections' },
  marketWorldLine: { fr: '{n} objets · {total} gils', en: '{n} items · {total} gil' },
  marketFromCheapest: {
    fr: 'Ce sont les offres les moins chères trouvées sur Universalis, {ou}. Les prix bougent : vérifie en jeu avant d’acheter.',
    en: 'These are the cheapest listings found on Universalis, {ou}. Prices move: check in game before buying.',
  },
  marketFromTrips: {
    fr: 'Les offres sont regroupées pour limiter les voyages, {ou} : ce ne sont donc pas toujours les moins chères. « Le plus d’objets » les prend au prix le plus bas.',
    en: 'Listings are grouped to cut down on travel, {ou}: so they are not always the cheapest. “Most items” picks the lowest price instead.',
  },
  marketOnDc: { fr: 'sur ton centre {dc}', en: 'on your {dc} data centre' },
  marketOnRegion: { fr: 'sur toute la région {region}', en: 'across the whole {region} region' },
  marketNothing: {
    fr: 'Ton budget est de {budget} gils.',
    en: 'Your budget is {budget} gil.',
  },
  marketInfos: { fr: 'Ce que fait le marché', en: 'What the market is doing' },
  marketInfosOpen: { fr: 'Voir ce que fait le marché', en: 'See what the market is doing' },
  marketVsAverage: {
    fr: 'Les dernières ventes tournaient autour de {moyenne} gils.',
    en: 'Recent sales were around {moyenne} gil.',
  },
  marketLastSale: {
    fr: 'Dernière vente : {prix} gils, {quand}.',
    en: 'Last sale: {prix} gil, {quand}.',
  },
  marketFalling: { fr: 'Elle est sous la moyenne : le prix redescend.', en: 'Below average: prices are coming down.' },
  marketRising: { fr: 'Elle est au-dessus de la moyenne : le prix monte.', en: 'Above average: prices are going up.' },
  marketPace: { fr: 'Il s’en vend environ {n} par jour.', en: 'About {n} sell per day.' },
  marketPaceSlow: {
    fr: 'Il s’en vend un tous les {n} jours : la moyenne repose sur peu de ventes.',
    en: 'One sells every {n} days: the average rests on few sales.',
  },
  marketNoPrice: {
    fr: "Aucune offre en vente pour ces objets sur ton centre de données en ce moment.",
    en: 'No listings for these items on your data centre right now.',
  },
  marketError: {
    fr: "Impossible de joindre Universalis. Réessaie dans un instant.",
    en: 'Cannot reach Universalis. Try again in a moment.',
  },
  errTimeout: {
    fr: "Le serveur met trop de temps à répondre. L'action n'a pas été enregistrée, réessaie dans un instant.",
    en: 'The server is taking too long. The action was not saved, try again in a moment.',
  },
  errOffline: {
    fr: "Serveur injoignable. L'action n'a pas été enregistrée, vérifie ta connexion.",
    en: 'Cannot reach the server. The action was not saved, check your connection.',
  },
  errAction: {
    fr: "L'action a échoué : {error}",
    en: 'The action failed: {error}',
  },
  dataStale: {
    fr: 'Les catalogues datent de {n} jours : le rafraîchissement automatique semble en panne, les nouveautés du dernier patch peuvent manquer.',
    en: 'Catalogues are {n} days old: the nightly refresh looks broken, items from the latest patch may be missing.',
  },
  crossToArmoire: {
    fr: "Tenue possédée : ses {n} pièces manquent dans l'armoire, on les coche ?",
    en: 'Outfit owned: its {n} pieces are missing from the armoire, tick them?',
  },
  crossToOutfit: {
    fr: "Toutes ses pièces sont dans l'armoire, on valide la tenue ?",
    en: 'Every piece is in the armoire, mark the outfit as owned?',
  },
  crossYes: { fr: 'Oui, cocher', en: 'Yes, tick them' },
  crossNo: { fr: 'Non merci', en: 'No thanks' },
  bindTitle: { fr: 'Lier mon personnage', en: 'Link my character' },
  bindIntro: {
    fr: 'Choisis ton perso dans le groupe ou colle son ID Lodestone. Une vérification par le Lodestone prouve qu\'il est à toi.',
    en: 'Pick your character from the group or paste its Lodestone ID. A Lodestone check proves it\'s yours.',
  },
  bindStart: { fr: 'Lier', en: 'Link' },
  bindStep1: { fr: '1. Copie ce code :', en: '1. Copy this code:' },
  bindStep2: {
    fr: '2. Colle-le dans la présentation de ton perso sur le Lodestone (Profil → Modifier la présentation), enregistre, puis clique Vérifier. Tu pourras le retirer ensuite.',
    en: '2. Paste it into your character profile bio on the Lodestone (Profile → Edit), save, then click Verify. You can remove it afterwards.',
  },
  bindProfileLink: { fr: 'Ouvrir mes réglages Lodestone ↗', en: 'Open my Lodestone settings ↗' },
  bindVerify: { fr: 'Vérifier', en: 'Verify' },
  bindVerified: { fr: '✓ Personnage vérifié ! C\'est ton perso.', en: '✓ Character verified! It\'s yours.' },
  bindVerifiedChip: { fr: 'Vérifié', en: 'Verified' },
  bindCodeMissing: {
    fr: 'Code introuvable dans ta présentation Lodestone, vérifie qu\'elle est bien enregistrée et publique, puis réessaie.',
    en: 'Code not found in your Lodestone bio, make sure it\'s saved and public, then retry.',
  },
  bindConflict: {
    fr: 'Ce personnage est déjà lié à un autre compte.',
    en: 'This character is already linked to another account.',
  },
  bindError: { fr: 'Erreur, réessaie dans un instant.', en: 'Error, retry in a moment.' },
  saveError: { fr: 'Sauvegarde impossible, réessaie.', en: 'Could not save, retry.' },
  saved: { fr: '✓ Enregistré', en: '✓ Saved' },
  albumPage: { fr: 'Page {n}', en: 'Page {n}' },
  collections: { fr: 'Collections', en: 'Collections' },
  bindAdd: { fr: 'Ajouter un personnage', en: 'Add a character' },
  unbindChar: { fr: 'Délier', en: 'Unlink' },
  unbindConfirm: {
    fr: 'Délier {name} de ton compte ? Ses collections restent enregistrées : tu les retrouveras si tu le relies plus tard.',
    en: 'Unlink {name} from your account? Its collections stay saved, you get them back if you link it again later.',
  },
  // Rôles d'armure (libellés officiels des pièces : « de protecteur »…)
  roleFending: { fr: 'Protecteur', en: 'Fending' },
  roleMaiming: { fr: 'Abatteur', en: 'Maiming' },
  roleStriking: { fr: 'Agresseur', en: 'Striking' },
  roleScouting: { fr: 'Rôdeur', en: 'Scouting' },
  roleAiming: { fr: 'Tireur', en: 'Aiming' },
  roleCasting: { fr: 'Incantateur', en: 'Casting' },
  roleHealing: { fr: 'Soigneur', en: 'Healing' },
  relicReqWeapon: { fr: 'total pour une arme :', en: 'total for one weapon:' },
  relicReqPiece: { fr: 'total pour une pièce :', en: 'total for one piece:' },
  relicShapeFights: { fr: '{steps} combats', en: '{steps} fights' },
  relicShapeGaro: { fr: '{sets} sets × 5 pièces', en: '{sets} sets × 5 pieces' },
  relicReqOneWeapon: { fr: '1 arme', en: '1 weapon' },
  relicReqOnePiece: { fr: '1 pièce', en: '1 piece' },
  relicReqLeft: { fr: 'Restant', en: 'Remaining' },
  relicAddAll: { fr: 'Tout ajouter', en: 'Add all' },
  relicRemoveAll: { fr: 'Tout retirer', en: 'Remove all' },
  relicCheck: { fr: 'clique pour marquer comme obtenue', en: 'click to mark as obtained' },
  relicUncheck: { fr: 'clique pour retirer', en: 'click to remove' },
  relicEditNote: {
    fr: 'Clique sur une relique pour la marquer comme obtenue : les matériaux restants se recalculent aussitôt.',
    en: 'Click a relic to mark it obtained, remaining materials update instantly.',
  },
  spellNo: { fr: 'N° {n}', en: 'No. {n}' },
  spellAspect: { fr: 'Aspect', en: 'Aspect' },
  spellDamage: { fr: 'Dégâts', en: 'Damage' },
  modeQuick: { fr: 'Ajout rapide', en: 'Quick add' },
  modeQuickTitle: {
    fr: 'Un clic sur une icône coche/décoche directement',
    en: 'One click on an icon checks/unchecks directly',
  },
  modeInspect: { fr: 'Un par un', en: 'One by one' },
  modeInspectTitle: {
    fr: "Un clic ouvre la fiche de l'objet à droite, tu l'ajoutes depuis là",
    en: 'A click opens the item panel on the right; add it from there',
  },
  panelAdd: { fr: '✓ Ajouter à ma collection', en: '✓ Add to my collection' },
  panelRemove: { fr: '✗ Retirer de ma collection', en: '✗ Remove from my collection' },
  panelOwned: { fr: 'Possédé ✓', en: 'Owned ✓' },
  panelMissing: { fr: 'Manquant', en: 'Missing' },
  myPageAutoNote: {
    fr: 'Montures et mascottes se synchronisent toutes seules depuis le Lodestone (lecture seule). Les autres onglets se cochent à la main, clique sur les icônes.',
    en: 'Mounts and minions sync on their own from the Lodestone (read-only). The other tabs are checked by hand, click the icons.',
  },
  myPageReadOnly: {
    fr: 'Synchronisé automatiquement depuis le Lodestone, lecture seule',
    en: 'Synced automatically from the Lodestone, read-only',
  },

  // Multi-groupes
  groupUnsaved: { fr: 'Groupe actuel', en: 'Current group' },
  groupSave: { fr: '💾 Enregistrer ce groupe…', en: '💾 Save this group…' },
  groupForget: { fr: '🗑 Oublier ce groupe', en: '🗑 Forget this group' },
  groupNamePrompt: { fr: 'Nom du groupe :', en: 'Group name:' },
  groupNone: { fr: 'Aucun groupe', en: 'No group' },
  groupNew: { fr: '➕ Nouveau groupe…', en: '➕ New group…' },
  groupRename: { fr: '✏️ Renommer…', en: '✏️ Rename…' },
  groupDelete: { fr: '🗑 Supprimer le groupe', en: '🗑 Delete group' },
  groupLeave: { fr: '👋 Quitter le groupe', en: '👋 Leave group' },
  groupDeleteConfirm: {
    fr: 'Supprimer définitivement le groupe « {name} » ?',
    en: 'Permanently delete the group “{name}”?',
  },
  groupLeaveConfirm: {
    fr: 'Retirer « {name} » de ta liste de groupes ?',
    en: 'Remove “{name}” from your group list?',
  },
  groupDefaultName: { fr: 'Mon groupe', en: 'My group' },
  butinTab: { fr: 'Butin', en: 'Loot' },
  butinKills: { fr: '{n} kill(s) à faire', en: '{n} clear(s) to go' },
  butinFloor: { fr: 'Étage {n}', en: 'Floor {n}' },
  butinDone: { fr: 'Plus rien à y prendre', en: 'Nothing left to take' },
  butinDeplier: { fr: 'Voir le détail des pièces', en: 'Show which pieces' },
  butinPlier: { fr: 'Masquer le détail', en: 'Hide the detail' },
  // Le BiS importé, et ce qu'on en déduit
  bisImporter: { fr: 'Importer mon BiS', en: 'Import my BiS' },
  bisRemplacer: { fr: 'Remplacer', en: 'Replace' },
  bisAnnuler: { fr: 'Annuler', en: 'Cancel' },
  bisEnCours: { fr: 'Lecture…', en: 'Reading…' },
  bisAide: {
    fr: 'Colle ton lien Etro ou XIVGear. Rien d’autre à saisir : le palier dit quelles pièces tombent en savage et lesquelles s’achètent en mémoquartz.',
    en: 'Paste your Etro or XIVGear link. Nothing else to fill in: the tier tells which pieces drop in savage and which are bought with tomestones.',
  },
  bisChoisirSet: {
    fr: 'Cette feuille porte {n} sets. Lequel joues-tu ?',
    en: 'That sheet holds {n} sets. Which one do you play?',
  },
  bisAucun: {
    fr: 'Pas de BiS importé pour ce palier.',
    en: 'No BiS imported for this tier.',
  },
  bisReste: { fr: 'Reste {n} pièce(s) du raid', en: '{n} piece(s) left from the raid' },
  bisRien: { fr: 'Rien à attendre du raid', en: 'Nothing left to expect from the raid' },
  bisAilleurs: { fr: 'Ailleurs', en: 'Elsewhere' },
  bisVideSlot: { fr: 'Case vide', en: 'Empty slot' },
  bisObtenue: { fr: 'Obtenue', en: 'Obtained' },
  // Le mémoquartz a deux marches : on l’achète, puis on la termine avec un
  // composant qui, lui, tombe en savage.
  bisAAcheter: { fr: 'À acheter', en: 'To buy' },
  bisAAmeliorer: { fr: 'À améliorer', en: 'To upgrade' },
  bisComplet: { fr: 'Améliorée', en: 'Upgraded' },
  bisClicPrendre: { fr: 'Clique : je l’ai obtenue', en: 'Click: I got it' },
  bisClicRendre: { fr: 'Clique : pas encore obtenue', en: 'Click: not yet' },
  bisClicAcheter: { fr: 'Clique : je l’ai achetée', en: 'Click: I bought it' },
  bisClicAmeliorer: { fr: 'Clique : je l’ai améliorée', en: 'Click: I upgraded it' },
  bisClicDefaire: { fr: 'Clique : repartir de zéro', en: 'Click: start over' },
  compoTitre: {
    fr: 'Composants encore nécessaires au groupe',
    en: 'Upgrade components the group still needs',
  },
  bisPasLeDroit: {
    fr: 'Seul le joueur (ou le chef du groupe) coche ici.',
    en: 'Only the player (or the group leader) ticks here.',
  },
  bisLienInvalide: {
    fr: 'Ce lien ne ressemble pas à un set Etro.',
    en: 'That link does not look like an Etro set.',
  },
  bisXivgearForme: {
    fr: 'Ce lien XIVGear n’a pas une forme que je sais lire.',
    en: 'That XIVGear link is not in a shape I can read.',
  },
  bisIntrouvable: { fr: 'Ce set n’existe pas chez Etro.', en: 'Etro has no such set.' },
  bisInjoignable: {
    fr: 'Etro n’a pas répondu. Réessaie dans un instant.',
    en: 'Etro did not answer. Try again in a moment.',
  },
  bisVide: {
    fr: 'Ce set n’a aucune pièce équipée.',
    en: 'That set has no equipped piece.',
  },
  bisEchecEcriture: {
    fr: 'L’import n’a pas pu être enregistré.',
    en: 'The import could not be saved.',
  },
  butinNoTier: {
    fr: 'Ce groupe n’a pas de palier. Recrée-le en choisissant lequel vous faites.',
    en: 'This group has no tier. Create it again and pick the one you are running.',
  },
  groupFollows: { fr: 'Ce groupe suit', en: 'This group follows' },
  followCollections: { fr: 'Les collections', en: 'Collections' },
  followCollectionsDesc: {
    fr: 'Montures, mascottes, cartes… avec le planning et l’avancement du groupe.',
    en: 'Mounts, minions, cards… with the group planner and progress.',
  },
  followRaid: { fr: 'L’équipement de raid', en: 'Raid gear' },
  followRaidDesc: {
    fr: 'Un palier savage : qui a besoin de quelle pièce. Pas de planning ni de collections.',
    en: 'One savage tier: who needs which piece. No planner, no collections.',
  },
  raidTier: { fr: 'Palier', en: 'Tier' },
  raidCarryOver: { fr: 'Reprendre des membres de « {nom} »', en: 'Carry over members from “{nom}”' },
  createGroupTitle: { fr: 'Nouveau groupe', en: 'New group' },
  createGroupName: { fr: 'Nom du groupe', en: 'Group name' },
  createGroupNamePh: { fr: 'Statique du mardi…', en: 'Tuesday static…' },
  createGroupChar: { fr: 'Créer avec le personnage', en: 'Create with character' },
  createGroupNoChar: {
    fr: 'Aucun personnage vérifié : le groupe sera créé vide, ajoute des persos ensuite.',
    en: 'No verified character: the group will start empty, add characters afterwards.',
  },
  createGroupGo: { fr: 'Créer le groupe', en: 'Create group' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  createGroupType: { fr: 'Type de groupe', en: 'Group type' },
  typeOffline: { fr: 'Hors ligne', en: 'Offline' },
  typeOfflineDesc: {
    fr: 'Liste libre : ajoute qui tu veux par ID Lodestone, juste pour suivre leur progression.',
    en: 'Free list: add anyone by Lodestone ID, just to follow their progress.',
  },
  typeOnline: { fr: 'En ligne', en: 'Online' },
  typeOnlineDesc: {
    fr: 'Adhésion par lien d’invitation, validée par toi, aucun ajout manuel possible.',
    en: 'Join by invite link, approved by you, no manual adds.',
  },
  typeOnlineNeedLogin: {
    fr: 'Connexion Discord requise pour créer un groupe en ligne.',
    en: 'Discord sign-in required to create an online group.',
  },
  createGroupNoFounder: { fr: 'sans personnage', en: 'no character' },
  groupsTab: { fr: 'Groupes & Contacts', en: 'Groups & Contacts' },
  /** Sans compte, les contacts n'existent pas : le bouton ne promet que les groupes. */
  groupsTabAlone: { fr: 'Groupes', en: 'Groups' },
  guideAloneNote: {
    fr: 'Sans compte, seules les montures et les mascottes apparaissent ici : elles se lisent sur le Lodestone. Les douze autres collections se cochent dans « Mon Journal », qui demande un compte.',
    en: 'Without an account, only mounts and minions show up here: they are read from the Lodestone. The other twelve collections are ticked in “My Journal”, which needs an account.',
  },
  groupsManage: { fr: '⚙️ Gérer les groupes…', en: '⚙️ Manage groups…' },
  groupsPageTitle: { fr: 'Groupes & Contacts', en: 'Groups & Contacts' },
  groupsSection: { fr: 'Groupes', en: 'Groups' },
  contactsSection: { fr: 'Contacts', en: 'Contacts' },
  contactGuestPage: {
    fr: 'Connecte-toi avec Discord pour gérer tes contacts.',
    en: 'Log in with Discord to manage your contacts.',
  },
  groupsEmpty: {
    fr: 'Aucun groupe pour l’instant, crée ton premier groupe pour commencer.',
    en: 'No group yet, create your first group to get started.',
  },
  groupOwnerChip: { fr: 'Créateur', en: 'Owner' },
  groupMemberChip: { fr: 'Membre', en: 'Member' },
  groupGuestChip: { fr: 'Invité', en: 'Guest' },
  groupActive: { fr: '✓ Groupe actif', en: '✓ Active group' },
  groupUse: { fr: 'Utiliser', en: 'Use' },
  groupRenameShort: { fr: 'Renommer', en: 'Rename' },
  groupDeleteShort: { fr: 'Supprimer', en: 'Delete' },
  groupLeaveShort: { fr: 'Quitter', en: 'Leave' },
  groupNoMembers: { fr: 'Aucun membre pour l’instant.', en: 'No members yet.' },
  inviteLinkLabel: { fr: 'Lien d’invitation', en: 'Invite link' },
  copyShort: { fr: 'Copier', en: 'Copy' },
  pendingSentTitle: { fr: 'Demandes envoyées', en: 'Requests sent' },
  syncForce: { fr: 'Synchroniser', en: 'Sync' },
  syncForceTitle: {
    fr: 'Re-scraper la fiche Lodestone maintenant (une fois par jour maximum)',
    en: 'Re-scrape the Lodestone profile now (once per day at most)',
  },
  syncForceCooldown: {
    fr: 'Lecture déjà faite à l’instant, possible à nouveau dans {h} min',
    en: 'Just read, available again in {h} min',
  },
  syncForceDone: { fr: 'Fiche Lodestone actualisée ✓', en: 'Lodestone profile refreshed ✓' },
  syncForceAlready: {
    fr: 'Synchro déjà utilisée aujourd’hui, données du cache.',
    en: 'Sync already used today, cached data.',
  },
  factRace: { fr: 'Race / Clan', en: 'Race / Clan' },
  factNameday: { fr: 'Anniversaire', en: 'Nameday' },
  factGuardian: { fr: 'Divinité gardienne', en: 'Guardian' },
  factCity: { fr: 'Cité de départ', en: 'City-state' },
  factGC: { fr: 'Grande compagnie', en: 'Grand Company' },
  factRank: { fr: 'Grade dans la grande compagnie', en: 'Grand company rank' },
  factFC: { fr: 'Compagnie libre', en: 'Free Company' },
  jobLevel: { fr: 'niveau {n}', en: 'level {n}' },
  jobLocked: { fr: 'non débloqué', en: 'not unlocked' },
  viewOnLodestone: { fr: 'Voir sur le Lodestone', en: 'View on the Lodestone' },
  bellTitle: { fr: 'Suggestions reçues', en: 'Received suggestions' },
  suggestionsTitle: { fr: 'Suggestions ({n})', en: 'Suggestions ({n})' },
  suggestionsEmpty: { fr: 'Aucune suggestion en attente.', en: 'No pending suggestions.' },
  acceptAll: { fr: 'Tout accepter', en: 'Accept all' },
  refuseAll: { fr: 'Tout refuser', en: 'Refuse all' },
  suggestedBy: { fr: 'proposé par {name}', en: 'suggested by {name}' },
  suggestCell: { fr: 'Proposer {what} à {who}', en: 'Suggest {what} to {who}' },
  pendingCell: {
    fr: 'Proposé à {who}, coché de ton côté tant que ce n’est pas refusé',
    en: 'Suggested to {who}, checked on your side until refused',
  },
  addOwnCell: { fr: 'Cocher {what} dans mon journal', en: 'Check {what} in my journal' },
  addedCell: { fr: 'Ajouté au journal ✓', en: 'Added to the journal ✓' },
  suggTemp: {
    fr: 'temporaire, confirmé à la prochaine synchro Lodestone',
    en: 'temporary, confirmed at the next Lodestone sync',
  },
  collectOffer: {
    fr: 'On dirait que tu tiens déjà tes collections sur FFXIV Collect ({n} entrées cochées là-bas). Veux-tu tout importer ici ? Rien ne sera retiré, seulement ajouté.',
    en: 'Looks like you already track your collections on FFXIV Collect ({n} entries checked there). Import everything here? Nothing will be removed, only added.',
  },
  collectSynced: {
    fr: 'Perso vérifié ✓, {n} entrées importées depuis FFXIV Collect.',
    en: 'Character verified ✓, {n} entries imported from FFXIV Collect.',
  },
  collectNothingNew: {
    fr: 'Perso vérifié ✓, tes collections étaient déjà à jour.',
    en: 'Character verified ✓, your collections were already up to date.',
  },
  armoireWeapons: { fr: 'Armes', en: 'Weapons' },
  armoireTools: { fr: 'Outils', en: 'Tools' },
  armoireArmor: { fr: 'Armures', en: 'Armor' },
  armoireAcc: { fr: 'Accessoires', en: 'Accessories' },
  invite: { fr: 'Inviter', en: 'Invite' },
  inviteTitle: {
    fr: "Copier le lien d'invitation du groupe",
    en: 'Copy the group invite link',
  },
  inviteNeedLogin: {
    fr: 'Pour inviter, connecte-toi avec Discord : le groupe montera dans ton compte et deviendra partageable. Se connecter maintenant ?',
    en: 'To invite, sign in with Discord: the group will move to your account and become shareable. Sign in now?',
  },
  joinWith: { fr: '✋ Demander avec {name}', en: '✋ Request with {name}' },
  joinLogin: { fr: 'Se connecter avec Discord', en: 'Sign in with Discord' },
  inviteAsk: {
    fr: 'Rejoindre le groupe « {name} » ? Le créateur validera ta demande.',
    en: 'Join the group “{name}”? The creator will review your request.',
  },
  invitePending: {
    fr: 'Demande en attente d’acceptation, « {name} ». Tu verras le groupe dès que le créateur accepte.',
    en: 'Request pending approval, “{name}”. You will see the group once the creator accepts.',
  },
  inviteAlreadyMember: {
    fr: 'Tu es déjà membre du groupe « {name} ».',
    en: 'You are already a member of “{name}”.',
  },
  inviteGuest: {
    fr: 'Invitation au groupe « {name} », connecte-toi avec Discord pour demander à le rejoindre.',
    en: 'Invitation to “{name}”, sign in with Discord to request to join.',
  },
  inviteNeedChar: {
    fr: 'Invitation au groupe « {name} », vérifie d’abord un personnage dans « Mon Journal » pour pouvoir demander.',
    en: 'Invitation to “{name}”, verify a character in “My Journal” first to request to join.',
  },
  inviteInvalid: {
    fr: 'Ce lien d’invitation n’est plus valide (périmé ou révoqué). Demande un nouveau lien au créateur du groupe.',
    en: 'This invite link is no longer valid (expired or revoked). Ask the group creator for a new link.',
  },
  pendingEntry: { fr: '{name} (en attente)', en: '{name} (pending)' },
  requestsTitle: { fr: 'Demandes d’adhésion ({n})', en: 'Join requests ({n})' },
  requestApprove: { fr: 'Accepter', en: 'Approve' },
  requestReject: { fr: 'Refuser', en: 'Reject' },
  requestBanTitle: {
    fr: 'Bannir : refuse et bloque définitivement ce compte',
    en: 'Ban: reject and permanently block this account',
  },
  requestBanConfirm: {
    fr: 'Bannir « {name} » ? Son compte ne pourra plus jamais demander à rejoindre ce groupe.',
    en: 'Ban “{name}”? Their account will never be able to request to join this group again.',
  },
  rotateLink: { fr: '♻️ Régénérer le lien…', en: '♻️ Regenerate link…' },
  rotateConfirm: {
    fr: 'Régénérer le lien d’invitation ? L’ancien lien cessera immédiatement de fonctionner (le nouveau sera copié).',
    en: 'Regenerate the invite link? The old link will stop working immediately (the new one will be copied).',
  },
  groupsTitle: {
    fr: 'Tes groupes enregistrés sur ce navigateur, bascule de l\'un à l\'autre',
    en: 'Groups saved on this browser, switch between them',
  },

  // Roster
  team: { fr: 'Équipe', en: 'Team' },
  shown: { fr: '{n} affiché', en: '{n} shown' },
  shownPlural: { fr: '{n} affichés', en: '{n} shown' },
  showAll: { fr: 'Tout voir', en: 'Show all' },
  showAllTitle: { fr: 'Réafficher tout le groupe', en: 'Show the whole group again' },
  collapseRoster: { fr: 'Réduire le roster', en: 'Collapse roster' },
  expandRoster: { fr: 'Développer le roster', en: 'Expand roster' },
  seeOn: {
    fr: 'Affiché : clique pour le retirer des vues, sans le retirer du groupe',
    en: 'Shown: click to leave them out of the views, without leaving the group',
  },
  seeOff: {
    fr: 'Masqué : clique pour le réafficher',
    en: 'Hidden: click to show them again',
  },
  seeHidden: { fr: '(masqué)', en: '(hidden)' },
  loading: { fr: 'Chargement…', en: 'Loading…' },
  retry: { fr: 'Réessayer', en: 'Retry' },
  removeMember: { fr: 'Retirer du groupe', en: 'Remove from group' },
  memberAlias: { fr: 'Surnommer', en: 'Set nickname' },
  memberAliasPrompt: {
    fr: 'Comment appelle-t-on {name} dans ce groupe ? (vide : son nom du Lodestone)',
    en: 'What is {name} called in this group? (empty: their Lodestone name)',
  },
  memberAliasOf: { fr: 'Alias de {name}', en: 'Nickname of {name}' },
  remove: { fr: 'Retirer', en: 'Remove' },
  refreshMember: { fr: 'Actualiser depuis FFXIV Collect', en: 'Refresh from FFXIV Collect' },
  loadError: { fr: 'Erreur de chargement', en: 'Failed to load' },
  addChar: { fr: 'Ajouter un perso', en: 'Add a character' },
  addPlaceholder: { fr: 'ID ou URL Lodestone', en: 'Lodestone ID or URL' },
  add: { fr: 'Ajouter', en: 'Add' },
  addError: {
    fr: 'Colle un ID Lodestone (chiffres) ou une URL Lodestone / FFXIV Collect.',
    en: 'Paste a Lodestone ID (digits) or a Lodestone / FFXIV Collect URL.',
  },
  addHintPre: { fr: "L'ID est dans l'URL de ta fiche", en: 'The ID is in your profile URL on the' },
  syncedAgo: { fr: 'Fiche FFXIV Collect, synchronisé {when}', en: 'FFXIV Collect profile, synced {when}' },
  today: { fr: "aujourd'hui", en: 'today' },
  yesterday: { fr: 'hier', en: 'yesterday' },
  daysAgo: { fr: 'il y a {n} j', en: '{n} d ago' },
  playerNote: { fr: 'Collections à renseigner dans « Mon Journal »', en: 'Collections to fill in from “My Journal”' },
  /** Sans compte, « Mon Journal » ne s'ouvre pas : la note dirait d'aller
   *  quelque part d'inaccessible. */
  playerNoteAlone: { fr: 'Connecte-toi pour renseigner les autres collections', en: 'Sign in to fill in the other collections' },
  playerNoteTitle: {
    fr: "Le Lodestone n'expose que les montures et les mascottes. Les onze autres collections (cartes, mode, tenues, armoire, bardes, émotes, portraits, orchestrion, magie bleue) se cochent directement dans « Mon Journal », après avoir lié son personnage.",
    en: 'The Lodestone only exposes mounts and minions. The other eleven collections (cards, fashion, outfits, armoire, bardings, emotes, portraits, orchestrion, blue magic) are checked directly in “My Journal”, once your character is linked.',
  },
  privateCollection: { fr: '⚠ Collection privée', en: '⚠ Private collection' },
  privateTitle: {
    fr: 'Active « Public » dans les réglages de ton profil FFXIV Collect',
    en: 'Enable "Public" in your FFXIV Collect profile settings',
  },

  // Planning
  scopeInstances: { fr: 'Instances (à faire ensemble)', en: 'Instanced (run together)' },
  scopeLongterm: { fr: 'Solo / long terme', en: 'Solo / long-term' },
  scopeAll: { fr: 'Tout', en: 'Everything' },
  allCollections: { fr: 'Toutes les collections', en: 'All collections' },
  allExpansions: { fr: 'Toutes les extensions', en: 'All expansions' },
  compoAll: { fr: 'Solo + groupe', en: 'Solo + group' },
  compoGroup: { fr: 'Nécessite un groupe', en: 'Needs a group' },
  compoSolo: { fr: 'Faisable en solo', en: 'Soloable' },
  compoTitle: {
    fr: 'Solo = solotable (souvent en désynchronisé) ; Groupe = un groupe est requis ou fortement conseillé',
    en: 'Solo = soloable (often unsynced); Group = a group is required or strongly advised',
  },
  minMissing1: { fr: 'Manque à ≥ {n} joueur', en: 'Missing for ≥ {n} player' },
  minMissingN: { fr: 'Manque à ≥ {n} joueurs', en: 'Missing for ≥ {n} players' },
  includeUnavailable: { fr: 'Inclure les inobtenables (event, boutique…)', en: 'Include unobtainable (events, store…)' },
  unobtainableChip: { fr: 'Inobtenable', en: 'Unobtainable' },
  unobtainableTitle: {
    fr: "Plus aucune voie d'obtention active en jeu actuellement",
    en: 'No longer obtainable in game at the moment',
  },
  searchPlanning: { fr: 'Rechercher un contenu ou un objet…', en: 'Search content or items…' },
  tileRuns: { fr: 'contenus à farmer', en: 'content to farm' },
  tileMounts: { fr: 'montures à récupérer', en: 'mounts to get' },
  tileMinions: { fr: 'mascottes à récupérer', en: 'minions to get' },
  tileCards: { fr: 'cartes TT à récupérer', en: 'TT cards to get' },
  tileFashions: { fr: 'accessoires à récupérer', en: 'accessories to get' },
  tileOrchestrions: { fr: 'rouleaux à récupérer', en: 'rolls to get' },
  tileSpells: { fr: 'sorts à apprendre', en: 'spells to learn' },
  tileAchievements: { fr: 'succès à décrocher', en: 'achievements to earn' },
  achPoints: { fr: '{n} points de succès', en: '{n} achievement points' },
  achReward: { fr: 'Récompense', en: 'Reward' },
  achPointsChip: { fr: '{a} / {b} pts', en: '{a} / {b} pts' },
  allCategories: { fr: 'Toutes les catégories', en: 'All categories' },
  collectNone: {
    fr: 'Aucune fiche FFXIV Collect trouvée pour ce perso.',
    en: 'No FFXIV Collect profile found for this character.',
  },
  // Contacts (amis / blacklist) et cloche multi-sections
  bellPanelTitle: { fr: 'Notifications ({n})', en: 'Notifications ({n})' },
  groupInvitesTitle: { fr: 'Invitations de groupe', en: 'Group invitations' },
  groupInviteBy: { fr: 'invité par {name}', en: 'invited by {name}' },
  friendRequestsTitle: { fr: 'Demandes de contact', en: 'Contact requests' },
  friendRequestWants: { fr: 'souhaite t’ajouter en contact', en: 'wants to add you as a contact' },
  suggestionsSection: { fr: 'Suggestions d’objets', en: 'Item suggestions' },
  // Notes de patch (page « Nouveautés »)
  newsTab: { fr: 'Notes de patch', en: 'Patch notes' },
  newsTitle: { fr: 'Nouveautés du patch {patch}', en: 'New in patch {patch}' },
  newsPatchLabel: { fr: 'Mise à jour', en: 'Update' },
  newsPatchOption: { fr: 'Patch {patch}', en: 'Patch {patch}' },
  newsOfficial: { fr: 'Notes officielles', en: 'Official notes' },
  newsOfficialTitle: {
    fr: 'Archives des notes de mise à jour sur le Lodestone (nouvel onglet)',
    en: 'Patch note archive on the Lodestone (new tab)',
  },
  newsCount1: { fr: '1 nouveauté', en: '1 new item' },
  newsCountN: { fr: '{n} nouveautés', en: '{n} new items' },
  newsMissing: { fr: '{n} à trouver', en: '{n} to find' },
  newsAllOwned: { fr: 'tout est coché', en: 'all ticked' },
  newsSeeIn: { fr: 'Voir dans la collection', en: 'Open in the collection' },
  newsMore: { fr: '+ {n} autres dans la collection', en: '+{n} more in the collection' },
  // Page de connexion
  loginPageTitle: { fr: 'Se connecter', en: 'Sign in' },
  loginPageLead: {
    fr: 'Un compte sert à lier tes personnages, cocher tes collections et rejoindre des groupes. Choisis la porte qui te convient : elles mènent toutes au même endroit.',
    en: 'An account lets you link your characters, tick your collections and join groups. Pick whichever door suits you: they all lead to the same place.',
  },
  loginPageLeadXiv: {
    fr: 'Une exception : XIVAuth t’épargne la vérification de personnage.',
    en: 'One exception: XIVAuth saves you the character verification step.',
  },
  loginBest: { fr: 'Le plus rapide', en: 'Fastest' },
  loginWith_xivauth: { fr: 'XIVAuth', en: 'XIVAuth' },
  loginWhy_xivauth: {
    fr: 'Le service d’authentification du monde FFXIV. Tes personnages déjà attestés chez eux arrivent liés et vérifiés, sans avoir à recopier un code sur ton profil Lodestone.',
    en: 'The FFXIV world’s own authentication service. Characters already attested there arrive linked and verified, with no code to copy onto your Lodestone profile.',
  },
  loginWith_discord: { fr: 'Discord', en: 'Discord' },
  loginWhy_discord: {
    fr: 'La porte historique, celle que la plupart des joueurs ont déjà. La vérification de personnage se fait ensuite en collant un code sur ton profil Lodestone.',
    en: 'The original door, the one most players already have. Character verification then happens by pasting a code onto your Lodestone profile.',
  },
  loginWith_google: { fr: 'Google', en: 'Google' },
  loginWhy_google: {
    fr: 'Pour qui n’a pas Discord. Même parcours ensuite : vérification par code sur le Lodestone.',
    en: 'For those without Discord. Same path afterwards: verification by code on the Lodestone.',
  },
  loginPrivacyTitle: { fr: 'Ce qu’on garde de toi', en: 'What we keep about you' },
  loginPrivacyBody: {
    fr: 'Ton identifiant chez le fournisseur choisi, ton nom affiché et ton avatar. Ensuite, seulement ce que tu construis ici : tes personnages liés, tes collections cochées, tes groupes et tes contacts. Ni mot de passe, ni adresse postale, ni suivi publicitaire.',
    en: 'Your id at the provider you pick, your display name and your avatar. Then only what you build here: your linked characters, your ticked collections, your groups and your contacts. No password, no address, no advertising tracking.',
  },
  loginPrivacyDelete: {
    fr: 'Tout est téléchargeable et effaçable à tout moment depuis Mon compte, sans avoir à le demander à qui que ce soit.',
    en: 'Everything is downloadable and erasable at any time from My account, without asking anyone.',
  },
  loginGuest: {
    fr: 'Sans compte, tu peux déjà explorer : suis des personnages par leur identifiant Lodestone dans un groupe hors ligne.',
    en: 'You can already explore without an account: track characters by Lodestone id in an offline group.',
  },
  loginGoogle: {
    fr: 'Se connecter avec Google (compte distinct de Discord)',
    en: 'Sign in with Google (separate account from Discord)',
  },
  loginXivauth: {
    fr: 'Se connecter avec XIVAuth : tes personnages déjà attestés chez eux sont liés et vérifiés d’office, sans code à recopier sur le Lodestone',
    en: 'Sign in with XIVAuth: characters already attested there are linked and verified straight away, no code to copy onto the Lodestone',
  },
  charSheetFailed: { fr: 'Fiche illisible', en: 'Sheet unavailable' },
  charSheetRetry: { fr: 'Relire les fiches', en: 'Reload the sheets' },
  charSheetRetryHint: {
    fr: 'La lecture sur le Lodestone a echoue ou pris trop de temps. Relancer.',
    en: 'Reading from the Lodestone failed or took too long. Try again.',
  },
  syncLast: { fr: 'Lodestone lu {quand}', en: 'Lodestone read {quand}' },
  syncNow: { fr: 'à l’instant', en: 'just now' },
  syncMin: { fr: 'il y a {n} min', en: '{n} min ago' },
  syncHours: { fr: 'il y a {n} h', en: '{n} h ago' },
  syncDays: { fr: 'il y a {n} j', en: '{n} d ago' },
  syncRunning: { fr: 'Synchronisation…', en: 'Syncing…' },
  charMore: { fr: 'Autres actions', en: 'More actions' },
  // Page de compte
  accountTitle: { fr: 'Mon compte', en: 'My account' },
  accountIdentity: { fr: 'Identité et connexion', en: 'Identity and sign-in' },
  accountLang: { fr: 'Langue de l’application', en: 'Application language' },
  accountChars: { fr: 'Mes personnages', en: 'My characters' },
  accountCharsHint: {
    fr: '{n} personnage(s) vérifié(s). La liaison, la vérification et le déliement se font dans Mon Journal.',
    en: '{n} verified character(s). Linking, verifying and unlinking happen in My Journal.',
  },
  accountCharsManage: { fr: 'Gérer mes personnages', en: 'Manage my characters' },
  accountData: { fr: 'Mes données', en: 'My data' },
  accountDataWhat: {
    fr: 'Nous gardons ton compte Discord (identifiant, nom, avatar), tes personnages liés, tes collections cochées à la main, tes groupes et tes contacts. Rien d’autre.',
    en: 'We keep your Discord account (id, name, avatar), your linked characters, your hand-ticked collections, your groups and your contacts. Nothing else.',
  },
  accountExport: { fr: 'Tout télécharger', en: 'Download everything' },
  accountImport: {
    fr: 'Importer un fichier FFXIV Collect',
    en: 'Import an FFXIV Collect file',
  },
  accountImportHint: {
    fr: 'FFXIV Collect permet d’exporter tes collections dans un fichier. Dépose-le ici : les identifiants sont les mêmes que les nôtres, tout se retrouve d’un coup, y compris ce que le Lodestone ne publie pas.',
    en: 'FFXIV Collect can export your collections to a file. Drop it here: the ids match ours, so everything comes across at once, including what the Lodestone does not publish.',
  },
  accountImportPick: { fr: 'Choisir le fichier', en: 'Choose the file' },
  accountImportFound: { fr: '{n} objets reconnus', en: '{n} items recognised' },
  accountImportUnknown: { fr: '{n} ignorés (inconnus de nos catalogues)', en: '{n} skipped (unknown to our catalogues)' },
  accountImportAddOnly: {
    fr: 'L’import ajoute seulement : rien de ce qui est déjà coché ne sera retiré.',
    en: 'The import only adds: nothing already ticked will be removed.',
  },
  accountImportDo: { fr: 'Verser dans mon journal', en: 'Add to my journal' },
  accountImportDone: { fr: 'Import terminé.', en: 'Import complete.' },
  accountError: { fr: 'Échec : fichier illisible ou serveur injoignable.', en: 'Failed: unreadable file or unreachable server.' },
  accountDelete: { fr: 'Supprimer mon compte', en: 'Delete my account' },
  accountDeleteWhat: {
    fr: 'Efface ton compte, tes liaisons de personnages, tes groupes, tes contacts et tes collections cochées à la main. Les fiches de personnage restent : elles ne contiennent que du public relu sur le Lodestone. Pense à télécharger tes données avant.',
    en: 'Erases your account, your character links, your groups, your contacts and your hand-ticked collections. Character sheets remain: they only hold public data read from the Lodestone. Download your data first.',
  },
  accountDeleteConfirm: {
    fr: 'C’est définitif et rien ne pourra être restauré. On y va ?',
    en: 'This is permanent and nothing can be restored. Go ahead?',
  },
  accountDeleteYes: { fr: 'Oui, tout supprimer', en: 'Yes, delete everything' },
  charPartial: {
    fr: 'Notre serveur n’a pas répondu : les collections cochées à la main ne sont pas affichées. Rien n’est perdu, elles sont en sécurité côté serveur.',
    en: 'Our server did not answer: hand-ticked collections are not shown. Nothing is lost, they are safe on the server.',
  },
  charPartialRetry: { fr: 'Réessayer', en: 'Retry' },
  // Courbes de l'administration
  chartNotEnough: {
    fr: 'Pas encore assez de mesures pour une courbe.',
    en: 'Not enough measurements for a curve yet.',
  },
  chartNumbers: { fr: 'Voir les chiffres', en: 'Show the numbers' },
  chartMax: { fr: 'max {n}', en: 'max {n}' },
  chartAria: {
    fr: '{titre} : {n} au total sur {jours} jours',
    en: '{titre}: {n} in total over {jours} days',
  },
  chartScrapes: { fr: 'Lectures du Lodestone', en: 'Lodestone reads' },
  chartScrapesHint: {
    fr: 'Volume quotidien des fiches lues. Une chute brutale trahit une panne, une montée un emballement.',
    en: 'Daily volume of profiles read. A sudden drop means an outage, a spike means a runaway.',
  },
  chartFailHint: {
    fr: 'Lectures échouées par jour. Une marche qui monte annonce un blocage ou un changement de leur HTML.',
    en: 'Failed reads per day. A rising step signals a block or a change in their HTML.',
  },
  newsTodo: { fr: 'À trouver', en: 'To find' },
  newsOwned: { fr: 'Tu l’as déjà', en: 'You already have it' },
  newsShop: { fr: 'Boutique', en: 'Store' },
  newsCard: {
    fr: 'Le patch {patch} a apporté {n} nouveautés aux collections.',
    en: 'Patch {patch} added {n} items to the collections.',
  },
  newsCardSee: { fr: 'Voir', en: 'See' },
  newsCardHide: { fr: 'Masquer', en: 'Hide' },
  newsFilter: {
    fr: 'Nouveautés du patch {patch} seulement.',
    en: 'Patch {patch} additions only.',
  },
  newsFilterClear: { fr: 'Tout revoir', en: 'Show everything' },
  contactsTitle: { fr: 'Contacts', en: 'Contacts' },
  contactLinkTitle: { fr: 'Mon lien de contact', en: 'My contact link' },
  contactCopy: { fr: 'Copier', en: 'Copy' },
  contactRotateTitle: {
    fr: 'Régénérer le lien (l’ancien cessera de fonctionner)',
    en: 'Regenerate the link (the old one stops working)',
  },
  contactRotateConfirm: {
    fr: 'Régénérer ton lien de contact ? L’ancien lien ne fonctionnera plus.',
    en: 'Regenerate your contact link? The old link will stop working.',
  },
  contactFriendsTitle: { fr: 'Amis ({n})', en: 'Friends ({n})' },
  contactFriendsEmpty: {
    fr: 'Aucun contact pour l’instant, partage ton lien, ou ajoute un co-membre depuis un groupe online.',
    en: 'No contacts yet, share your link, or add a co-member from an online group.',
  },
  contactNoChars: { fr: 'aucun perso vérifié', en: 'no verified character' },
  contactInvite: { fr: 'Inviter dans…', en: 'Invite to…' },
  contactInvited: { fr: 'Envoyée ✓', en: 'Sent ✓' },
  contactRemove: { fr: 'Retirer', en: 'Remove' },
  contactRemoveConfirm: {
    fr: 'Retirer {name} de tes contacts ?',
    en: 'Remove {name} from your contacts?',
  },
  contactBlock: { fr: 'Bloquer', en: 'Block' },
  contactBlockConfirm: {
    fr: 'Bloquer {name} ? Il ne pourra plus rien t’envoyer (demandes, suggestions, entrées de groupe) et ne saura pas qu’il est bloqué.',
    en: 'Block {name}? They won’t be able to send you anything (requests, suggestions, group joins) and won’t know they are blocked.',
  },
  contactUnblock: { fr: 'Débloquer', en: 'Unblock' },
  contactPendingInTitle: { fr: 'Demandes reçues ({n})', en: 'Received requests ({n})' },
  contactPendingOutTitle: { fr: 'Demandes envoyées ({n})', en: 'Sent requests ({n})' },
  contactCancel: { fr: 'Annuler', en: 'Cancel' },
  contactBlockedTitle: { fr: 'Comptes bloqués ({n})', en: 'Blocked accounts ({n})' },
  groupAccounts: { fr: 'Comptes :', en: 'Accounts:' },
  contactAddFromGroup: { fr: 'Ajouter {name} en contact', en: 'Add {name} as a contact' },
  contactAlreadyChip: { fr: 'Déjà en contact', en: 'Already a contact' },
  contactPendingChip: { fr: 'Demande envoyée', en: 'Request sent' },
  contactAlready: { fr: 'Tu es déjà en contact avec {name}.', en: 'You are already contacts with {name}.' },
  contactPending: { fr: 'Demande de contact envoyée à {name}.', en: 'Contact request sent to {name}.' },
  contactPendingIn: {
    fr: '{name} t’a déjà envoyé une demande de contact :',
    en: '{name} has already sent you a contact request:',
  },
  contactGuest: {
    fr: 'Connecte-toi avec Discord pour ajouter {name} à tes contacts.',
    en: 'Log in with Discord to add {name} as a contact.',
  },
  contactAsk: { fr: 'Ajouter {name} à tes contacts ?', en: 'Add {name} as a contact?' },
  contactSend: { fr: 'Demander', en: 'Send request' },
  // Assistant de liaison de personnage
  onboardStep1: { fr: 'Connexion Discord', en: 'Discord login' },
  onboardStep2: { fr: 'Trouve ton personnage', en: 'Find your character' },
  onboardStep3: { fr: 'Prouve que c’est toi', en: 'Prove it’s you' },
  searchCharIntro: {
    fr: 'Tape le nom de ton personnage (le serveur affine si le nom est courant) et clique-le dans les résultats.',
    en: 'Type your character’s name (add the server if the name is common) and click it in the results.',
  },
  searchCharName: { fr: 'Nom du personnage…', en: 'Character name…' },
  searchCharServer: { fr: 'Serveur (optionnel)', en: 'Server (optional)' },
  searchCharGo: { fr: 'Chercher', en: 'Search' },
  searchCharNone: {
    fr: 'Aucun personnage trouvé, vérifie l’orthographe, ou précise le serveur.',
    en: 'No character found, check the spelling, or specify the server.',
  },
  searchCharError: {
    fr: 'Le Lodestone n’a pas répondu, réessaie dans un instant.',
    en: 'The Lodestone did not answer, try again in a moment.',
  },
  searchCharFallback: {
    fr: 'J’ai déjà l’ID ou l’URL Lodestone',
    en: 'I already have the Lodestone ID or URL',
  },
  verifyStepCopy: { fr: '1. Copie ce code :', en: '1. Copy this code:' },
  verifyStepOpen: {
    fr: '2. Ouvre l’édition de ton profil sur le Lodestone (connecte-toi avec ton compte Square Enix) :',
    en: '2. Open your profile editor on the Lodestone (log in with your Square Enix account):',
  },
  verifyStepPaste: {
    fr: '3. Colle le code dans le champ « Présentation », enregistre, puis reviens ici cliquer sur Vérifier. Tu pourras retirer le code juste après.',
    en: '3. Paste the code into the “Character Profile” field, save, then come back here and click Verify. You can remove the code right after.',
  },
  // Aide active + Guide
  helpWindowTitle: { fr: 'Aide active', en: 'Active Help' },
  helpGotIt: { fr: 'Compris !', en: 'Got it!' },
  guideTitle: { fr: 'Guide', en: 'Guide' },
  guideIntro: {
    fr: 'Tout ce qu’il faut savoir pour prendre en main Codex Olympia. Ces sujets apparaissent aussi en « Aide active » à la première visite de chaque écran.',
    en: 'Everything you need to get started with Codex Olympia. These topics also appear as “Active Help” the first time you visit each screen.',
  },
  pasTitre: { fr: 'Premiers pas', en: 'First steps' },
  pasCompte: { fr: '{n} sur {total}', en: '{n} of {total}' },
  pasAller: { fr: 'Y aller', en: 'Take me there' },
  pasFini: {
    fr: 'Tout est en place. Les sujets ci-dessous répondent au reste, à relire quand tu veux.',
    en: 'Everything is in place. The topics below cover the rest, whenever you need them.',
  },
  pasLoginTitle: { fr: 'Se connecter', en: 'Sign in' },
  pasLoginBody: {
    fr: 'Par Discord, Google ou XIVAuth. Sans compte, on ne voit que les montures et les mascottes, et rien ne se garde d’un appareil à l’autre.',
    en: 'With Discord, Google or XIVAuth. Without an account you only see mounts and minions, and nothing carries from one device to another.',
  },
  pasCharTitle: { fr: 'Relier son personnage', en: 'Link your character' },
  pasCharBody: {
    fr: 'Colle l’adresse de ta fiche Lodestone, puis recopie le code donné dans ton profil en jeu. C’est ce qui prouve que le perso est le tien, et qui te laisse cocher tes collections.',
    en: 'Paste your Lodestone page address, then copy the code it gives you into your in-game profile. That is what proves the character is yours, and what lets you tick your collections.',
  },
  pasGroupTitle: { fr: 'Créer ou rejoindre un groupe', en: 'Create or join a group' },
  pasGroupBody: {
    fr: 'Seul, l’application ne sert qu’à se compter. À plusieurs, elle dit qui a quoi, qui manque quoi, et ce qui se farme ensemble.',
    en: 'On your own, the app only counts you. With others, it says who has what, who is missing what, and what is worth farming together.',
  },
  pasRaidTitle: { fr: 'Suivre son équipement de raid', en: 'Track your raid gear' },
  pasRaidBody: {
    fr: 'Crée un groupe qui suit un palier savage, colle ton BiS Etro ou XIVGear, et le compte des soirées se fait tout seul.',
    en: 'Create a group that follows a savage tier, paste your Etro or XIVGear BiS, and the clear count works itself out.',
  },
  planSucces: { fr: 'Succès à décrocher ensemble', en: 'Achievements to earn together' },
  planSuccesHint: {
    fr: '{n} succès de raid, de défi ou de donjon. Personne ne compte les kills : on coche quand on l’a.',
    en: '{n} raid, trial and dungeon achievements. Nobody counts clears: tick it when you have it.',
  },
  collectRefresh: { fr: 'Récupérer mes succès', en: 'Fetch my achievements' },
  collectRefreshTitle: {
    fr: 'Relit ta fiche FFXIV Collect et fusionne ce qui manque ici. Rien n’est jamais retiré, et ça se refait tout seul chaque nuit.',
    en: 'Reads your FFXIV Collect page and merges what is missing here. Nothing is ever removed, and it runs again on its own every night.',
  },
  collectRunning: { fr: 'Lecture…', en: 'Reading…' },
  collectUnavailable: {
    fr: 'FFXIV Collect ne connaît pas ce personnage, ou n’a pas répondu.',
    en: 'FFXIV Collect does not know this character, or did not answer.',
  },
  relicCompact: { fr: 'Icônes seules', en: 'Icons only' },
  relicCompactTitle: {
    fr: 'Replie les paliers, les matériaux et les totaux : il ne reste que la grille des reliques. Cliquer fait toujours la même chose.',
    en: 'Folds away tiers, materials and totals: only the relic grid remains. Clicking still does the same thing.',
  },
  adminTabChangelog: { fr: 'Journal des modifs', en: 'Changelog' },
  changelogCompte: { fr: '{n} entrées, du plus récent au plus ancien', en: '{n} entries, newest first' },
  changelogVide: {
    fr: 'Aucune entrée. Le fichier se génère au build depuis l’historique git.',
    en: 'No entries. The file is generated at build time from the git history.',
  },
  guideResetHelp: { fr: 'Revoir les aides actives', en: 'Replay active help' },
  guideResetDone: {
    fr: 'Elles réapparaîtront sur chaque écran ✓',
    en: 'They will reappear on each screen ✓',
  },
  helpLinkTitle: { fr: 'Lier son personnage', en: 'Linking your character' },
  helpLinkBody: {
    fr: 'Connecte-toi avec Discord, puis dans Mon Journal cherche ton personnage par son nom et clique-le. Pour prouver qu’il est à toi, colle le code fourni dans la « Présentation » de ton profil Lodestone et clique Vérifier. Si tu tiens déjà tes collections sur FFXIV Collect, l’appli te proposera de tout importer d’un coup.',
    en: 'Log in with Discord, then in My Journal search your character by name and click it. To prove it’s yours, paste the provided code into your Lodestone profile’s “Character Profile” field and click Verify. If you already track your collections on FFXIV Collect, the app will offer to import everything at once.',
  },
  helpPlanningTitle: { fr: 'Planning', en: 'Planning' },
  helpPlanningBody: {
    fr: 'Le Planning répond à « on farme quoi ce soir ? » : une carte par contenu (donjon, défi, raid…) listant ce qui manque encore, classées par nombre d’objets à looter. Filtre par extension, par collection, par composition (solo / groupe conseillé) ou par périmètre, et clique un objet pour sa fiche.',
    en: 'Planning answers “what do we farm tonight?”: one card per duty (dungeon, trial, raid…) listing what is still missing, sorted by loot impact. Filter by expansion, collection, party need (solo / group advised) or scope, and click any item for its details.',
  },
  helpCollectionsTitle: { fr: 'Collections', en: 'Collections' },
  helpCollectionsBody: {
    fr: 'La matrice croise les objets et les membres du groupe actif. Une croix rouge se clique : sur TON perso elle coche l’objet direct au journal, sur celui d’un autre elle lui propose l’objet (il accepte ou refuse depuis sa cloche, en attendant, c’est coché de ton côté). Montures et mascottes suivent le Lodestone. Clique le nom d’un objet pour ouvrir sa fiche, dans le panneau de droite : provenance, qui l’a déjà dans le groupe, et le lien vers FFXIV Collect.',
    en: 'The matrix crosses items with the active group’s members. A red cross is clickable: on YOUR character it checks the item straight into your journal, on someone else’s it suggests the item to them (they accept or refuse from their bell, meanwhile it shows as checked on your side). Mounts and minions follow the Lodestone. Click an item name to open its sheet in the right-hand panel: where it comes from, who already has it in the group, and the link to FFXIV Collect.',
  },
  helpRelicsTitle: { fr: 'Avancement', en: 'Progress' },
  helpRelicsBody: {
    fr: 'La course du groupe. En haut, le podium des trois plus avancés, toutes collections confondues. En dessous, une section par collection : une barre par joueur, l’avatar planté à la pointe de sa progression, les meneurs en premier. Le détail des paliers de reliques et des matériaux se trouve dans « Mon Journal ».',
    en: 'The group race. At the top, the podium of the three most complete, all collections combined. Below, one section per collection: one bar per player, their avatar planted at the tip of their progress, leaders first. Relic tiers and materials live in “My Journal”.',
  },
  helpMypageTitle: { fr: 'Mon Journal', en: 'My Journal' },
  helpMypageBody: {
    fr: 'Ta fiche : portrait, jobs, progression par collection. Montures et mascottes se synchronisent toutes seules depuis le Lodestone (bouton Synchroniser : une fois par jour) ; le reste se coche à la main ou s’importe depuis FFXIV Collect avec le bouton Collect. Clique une icône pour cocher, ou passe en mode « Un par un » pour inspecter.',
    en: 'Your sheet: portrait, jobs, per-collection progress. Mounts and minions sync themselves from the Lodestone (Sync button: once a day); everything else is checked by hand or imported from FFXIV Collect with the Collect button. Click an icon to check it, or switch to “One by one” to inspect.',
  },
  helpGroupsTitle: { fr: 'Groupes & Contacts', en: 'Groups & Contacts' },
  helpGroupsBody: {
    fr: 'Un groupe suit soit les collections, soit l’équipement d’un palier savage. Deux types au choix : hors ligne (tu suis qui tu veux par ID Lodestone) et en ligne (chacun rejoint via un lien d’invitation, validé par le créateur). Les contacts sont tes amis : partage ton lien de contact, vois leurs persos, invite-les direct dans tes groupes, et bloque en silence si besoin.',
    en: 'A group follows either collections or the gear of one savage tier. Two kinds to pick from: offline (track anyone by Lodestone ID) and online (people join via an invite link, approved by the owner). Contacts are your friends: share your contact link, see their characters, invite them straight into your groups, and block silently if needed.',
  },
  helpButinTitle: { fr: 'Équipement de raid', en: 'Raid gear' },
  helpButinBody: {
    fr: 'Chacun colle son BiS depuis Etro ou XIVGear, et tout s’en déduit : ce qui tombe en savage, ce qui s’achète en mémoquartz. En haut, le nombre de soirées qu’il reste à faire sur chaque étage, et le détail de qui attend quoi. En dessous, une carte par joueur, rangée comme la fenêtre d’équipement du jeu. Cliquer une pièce dit « je l’ai obtenue » ; une pièce de mémoquartz monte deux marches, achetée puis améliorée. Les composants d’amélioration se comptent à part : ils tombent en savage eux aussi, mais au hasard des étages.',
    en: 'Everyone pastes their BiS from Etro or XIVGear, and the rest follows: what drops in savage, what is bought with tomestones. At the top, how many clears each floor still needs, and who is waiting for what. Below, one card per player, laid out like the game’s equipment window. Clicking a piece says “I got it”; a tomestone piece takes two steps, bought then upgraded. Upgrade components are counted separately: they drop in savage too, but on no fixed floor.',
  },
  helpMarketTitle: { fr: 'Mon Marché', en: 'My Market' },
  helpMarketBody: {
    fr: 'Ce qui te manque et qui s’achète à l’hôtel des ventes. Les prix viennent d’Universalis : la proposition la moins chère trouvée, tous serveurs de la région confondus, comparée au prix moyen constaté pour dire si ça monte ou si ça descend. Filtre par collection, par prix maximum, ou cherche un objet par son nom.',
    en: 'What you are missing and can simply buy. Prices come from Universalis: the cheapest listing found across the region’s servers, compared to the going average so you can tell whether it is climbing or falling. Filter by collection, by maximum price, or search an item by name.',
  },
  /** Hors compte : ni contacts, ni groupe en ligne. Decrire les deux ferait
   *  chercher des boutons qui n'existent pas a l'ecran. */
  helpGroupsAloneBody: {
    fr: 'Un groupe hors ligne vit dans ton navigateur : tu y suis qui tu veux par son ID Lodestone, sans rien demander à personne. Avec un compte, les groupes en ligne s’ouvrent : chacun rejoint par un lien d’invitation que tu valides, et tes contacts te permettent d’inviter tes amis en deux clics.',
    en: 'An offline group lives in your browser: track anyone by Lodestone ID, no permission needed. With an account, online groups open up: people join through an invite link you approve, and contacts let you invite friends in two clicks.',
  },
  helpBellTitle: { fr: 'Notifications', en: 'Notifications' },
  helpBellBody: {
    fr: 'La cloche sonne en direct : suggestions d’objets (accepter = l’objet est coché ; pour une monture ou mascotte c’est temporaire, la prochaine synchro Lodestone confirme), demandes de contact et invitations de groupe. Tout se traite en un clic, unitairement ou en masse.',
    en: 'The bell rings live: item suggestions (accepting checks the item; for a mount or minion it’s temporary, the next Lodestone sync confirms), contact requests and group invitations. Everything resolves in one click, one by one or in bulk.',
  },
  // Tableau de bord super-admin
  adminTitle: { fr: 'Administration', en: 'Administration' },
  adminError: { fr: 'Espace admin indisponible.', en: 'Admin space unavailable.' },
  adminReload: { fr: 'Recharger', en: 'Reload' },
  adminPurge: { fr: 'Purger les sessions expirées', en: 'Purge expired sessions' },
  adminPurgeTitle: {
    fr: 'Supprime les jetons de session expirés de la base',
    en: 'Deletes expired session tokens from the database',
  },
  adminTileUsers: { fr: 'comptes', en: 'accounts' },
  adminTileChars: { fr: 'persos vérifiés / suivis', en: 'verified / tracked characters' },
  adminTileGroups: { fr: 'groupes online / total', en: 'online / total groups' },
  adminTileSessions: { fr: 'sessions actives', en: 'active sessions' },
  adminTileSuggestions: { fr: 'suggestions en attente', en: 'pending suggestions' },
  adminTileFriends: { fr: 'amitiés', en: 'friendships' },
  adminTilePending: { fr: 'demandes en attente', en: 'pending requests' },
  adminTileBlocks: { fr: 'blocages', en: 'blocks' },
  adminUsers: { fr: 'Comptes ({n})', en: 'Accounts ({n})' },
  adminChars: { fr: 'Personnages ({n})', en: 'Characters ({n})' },
  adminGroups: { fr: 'Groupes ({n})', en: 'Groups ({n})' },
  adminColName: { fr: 'Nom', en: 'Name' },
  adminColCreated: { fr: 'Créé', en: 'Created' },
  adminColChars: { fr: 'Persos', en: 'Chars' },
  adminColGroups: { fr: 'Groupes', en: 'Groups' },
  adminColLastSeen: { fr: 'Vu', en: 'Seen' },
  adminColServer: { fr: 'Serveur', en: 'Server' },
  adminColOwner: { fr: 'Compte', en: 'Account' },
  adminColUpdated: { fr: 'MAJ', en: 'Updated' },
  adminColType: { fr: 'Type', en: 'Type' },
  adminColMembers: { fr: 'Membres', en: 'Members' },
  adminFollowed: { fr: 'suivi', en: 'tracked' },
  adminSources: {
    fr: 'Collections, lodestone : {lodestone} · manuel : {user} · seed : {seed} · vides : {empty}',
    en: 'Collections, lodestone: {lodestone} · manual: {user} · seed: {seed} · empty: {empty}',
  },
  adminCharRefreshTitle: {
    fr: 'Marquer la fiche périmée (re-scrape au prochain affichage) et rendre la synchro forcée',
    en: 'Mark the sheet stale (re-scrape on next view) and reset the forced sync',
  },
  adminUserDeleteConfirm: {
    fr: 'Supprimer le compte « {name} » ? Ses groupes, liaisons, contacts et sessions seront purgés. Irréversible.',
    en: 'Delete the account “{name}”? Their groups, bindings, contacts and sessions will be purged. Irreversible.',
  },
  adminGroupDeleteConfirm: {
    fr: 'Supprimer le groupe « {name} » pour tout le monde ? Irréversible.',
    en: 'Delete the group “{name}” for everyone? Irreversible.',
  },
  adminColFriends: { fr: 'Amis', en: 'Friends' },
  adminColSuggSent: { fr: 'Sugg.', en: 'Sugg.' },
  adminColChecked: { fr: 'Cochés', en: 'Checked' },
  adminActivity: { fr: 'Activité récente', en: 'Recent activity' },
  adminVolumes: {
    fr: 'Volumes, collections : {collections} lignes · sessions : {tokens} · rooms héritées : {rooms}',
    en: 'Volumes, collections: {collections} rows · sessions: {tokens} · legacy rooms: {rooms}',
  },
  adminPending: { fr: 'En attente', en: 'Pending' },
  adminPendingRequest: {
    fr: '{user} demande à rejoindre « {group} »',
    en: '{user} asked to join “{group}”',
  },
  adminPendingSuggestion: {
    fr: '{from} a proposé un objet ({kind}) à {char}',
    en: '{from} suggested an item ({kind}) to {char}',
  },
  tileFacewear: { fr: 'lunettes à récupérer', en: 'facewear to get' },
  tileHairstyles: { fr: 'coiffures à récupérer', en: 'hairstyles to get' },
  tileOutfits: { fr: 'tenues à récupérer', en: 'outfits to get' },
  tileArmoires: { fr: "pièces d'armoire à récupérer", en: 'armoire pieces to get' },
  tileBardings: { fr: 'bardes à récupérer', en: 'bardings to get' },
  tileEmotes: { fr: 'émotes à récupérer', en: 'emotes to get' },
  tileFrames: { fr: 'portraits à récupérer', en: 'portraits to get' },
  planningEmpty: { fr: 'Rien à farmer avec ces filtres, collection complète ? 🎉', en: 'Nothing to farm with these filters, collection complete? 🎉' },
  toLoot: { fr: '{n} à looter', en: '{n} to loot' },
  toLootTitle: {
    fr: "Nombre total d'objets que le groupe peut y récupérer",
    en: 'Total number of items the group can get there',
  },
  missingFor: { fr: 'manque à {a}/{b}', en: 'missing for {a}/{b}' },
  showMoreItems: { fr: 'Afficher les {n} autres objets', en: 'Show the {n} other items' },
  showMore: { fr: 'Afficher plus ({n} restants)', en: 'Show more ({n} left)' },
  hvTitle: { fr: 'Achetable en hôtel des ventes', en: 'Buyable on the market board' },

  // Matrice
  searchIn: { fr: 'Rechercher · {what}…', en: 'Search · {what}…' },
  allSources: { fr: 'Toutes les sources', en: 'All sources' },
  sortMissing: { fr: 'Manque au plus de monde', en: 'Most missing first' },
  sortRecent: { fr: "Plus récents d'abord", en: 'Newest first' },
  sortGame: { fr: 'Ordre du jeu', en: 'Game order' },
  onlyMissing: { fr: 'Seulement les manquants', en: 'Missing only' },
  matrixNotice: {
    fr: "Le Lodestone n'expose pas cette collection : chacun la coche dans « Mon Journal », après avoir lié son personnage.",
    en: 'The Lodestone does not expose this collection: everyone checks it in “My Journal”, once their character is linked.',
  },
  openOnCollect: { fr: 'ouvrir « {what} » sur FFXIV Collect ↗', en: 'open "{what}" on FFXIV Collect ↗' },
  itemsCount1: { fr: '{n} objet', en: '{n} item' },
  itemsCountN: { fr: '{n} objets', en: '{n} items' },
  missingCol: { fr: 'Manque à', en: 'Missing' },
  owns: { fr: '{who} possède {what}', en: '{who} owns {what}' },
  ownsNot: { fr: '{who} ne possède pas {what}', en: '{who} does not own {what}' },
  matrixEmpty: { fr: 'Aucun objet ne correspond à ces filtres.', en: 'No item matches these filters.' },

  // Fiche objet
  close: { fr: 'Fermer (Échap)', en: 'Close (Esc)' },
  patch: { fr: 'Patch {n}', en: 'Patch {n}' },
  ownedPctTitle: {
    fr: 'Part des collectionneurs FFXIV Collect qui le possèdent',
    en: 'Share of FFXIV Collect collectors who own it',
  },
  ofPlayers: { fr: '{pct} des joueurs', en: '{pct} of players' },
  obtention: { fr: 'Obtention', en: 'How to get it' },
  unknownSource: { fr: 'Source inconnue.', en: 'Unknown source.' },
  inGroup: { fr: 'Dans le groupe', en: 'In the group' },
  ownedBy: { fr: 'Possédé · {n}', en: 'Owned · {n}' },
  missingBy: { fr: 'Manquant · {n}', en: 'Missing · {n}' },
  itemDetails: { fr: "Fiche de l'objet", en: 'Item details' },

  // Solo / groupe
  needSolo: { fr: 'Solo ok', en: 'Solo ok' },
  needAdvised: { fr: 'Groupe conseillé', en: 'Group advised' },
  needGroup: { fr: 'Groupe requis', en: 'Group required' },

  // Reliques
  relicsTab: { fr: 'Reliques', en: 'Relics' },
  fashionFamily: { fr: 'Mode', en: 'Fashion' },
  relicGlobal: { fr: 'Avancement global, toutes les reliques', en: 'Overall progress, all relics' },
  pickKindTitle: { fr: 'Choisis une collection', en: 'Pick a collection' },
  pickKindJournal: {
    fr: 'Les onglets ci-dessus ouvrent chacun une collection. Celle que tu ouvres se retrouve dans l’adresse : mets-la en favori pour y revenir directement.',
    en: 'Each tab above opens one collection. The one you open shows in the address: bookmark it to come straight back.',
  },
  pickKindCollections: {
    fr: 'Les onglets ci-dessus ouvrent chacun une collection, croisée avec ton groupe. Celle que tu ouvres se retrouve dans l’adresse : la page se met en favori et se partage telle quelle.',
    en: 'Each tab above opens one collection, crossed with your group. The one you open shows in the address: bookmark or share the page as it is.',
  },
  groupProgressTab: { fr: 'Avancement', en: 'Progress' },
  groupProgress: { fr: 'Avancement du groupe', en: 'Group progress' },
  progressCollections: { fr: 'Par collection', en: 'By collection' },
  progressRelics: { fr: 'Reliques', en: 'Relics' },
  relicShapeN: { fr: '{steps} étapes × {jobs} jobs', en: '{steps} steps × {jobs} jobs' },
  relicShape1: { fr: '{jobs} jobs', en: '{jobs} jobs' },
  // Armures : l'unité est la pièce d'équipement, et une étape est un palier
  // d'amélioration (base, +1, +2…), pas un emplacement.
  relicShapeNArmor: { fr: '{steps} paliers × {jobs} pièces', en: '{steps} tiers × {jobs} pieces' },
  relicShape1Armor: { fr: '{jobs} pièces', en: '{jobs} pieces' },
  relicTier: { fr: 'Palier {n}', en: 'Tier {n}' },
  relicRemaining: { fr: 'Reste :', en: 'To farm:' },
  relicDone: { fr: 'Terminé ✓', en: 'Done ✓' },
  relCatWeapons: { fr: 'Armes', en: 'Weapons' },
  relCatUltimate: { fr: 'Armes ultimes', en: 'Ultimate weapons' },
  relCatTools: { fr: 'Outils', en: 'Tools' },
  relCatArmor: { fr: 'Armures', en: 'Armor' },
  relCatGaro: { fr: 'GARO', en: 'GARO' },
  relicOnce: { fr: '1re arme :', en: 'First weapon:' },
  relicFromOnce: { fr: '1re arme', en: 'first weapon' },
  relicStep: { fr: 'Étape {n}', en: 'Step {n}' },
  relicPerWeapon: { fr: 'par arme :', en: 'per weapon:' },
  relicPerTool: { fr: 'par outil :', en: 'per tool:' },
  relicPerPiece: { fr: 'par pièce :', en: 'per piece:' },
  relicGuide: { fr: 'Guide ↗', en: 'Guide ↗' },
  relicStepTotal: { fr: 'reste ×{n} :', en: 'left ×{n}:' },
  relicGrandTotal: { fr: '💰 LE GROS TOTAL de tout ce qui reste', en: '💰 The BIG total of everything left' },
  relicMatCurrency: { fr: '💰 Monnaies', en: '💰 Currencies' },
  relicMatItems: { fr: '📦 Objets', en: '📦 Items' },
  relicMatDrops: { fr: '🎲 Drops & divers', en: '🎲 Drops & misc' },
  relicTotals: { fr: 'Total des objets restants par joueur', en: 'Total remaining items per player' },
  relicCostNote: {
    fr: "Objets nécessaires par étape d'après les guides ffxiv-eorzea.com et le wiki consolegameswiki, avec les noms d'objets officiels du jeu.",
    en: 'Required items per step based on the ffxiv-eorzea.com guides and the consolegameswiki wiki, using official in-game item names.',
  },
  relicsLoading: { fr: 'Chargement des reliques…', en: 'Loading relics…' },
} as const

export type StrKey = keyof typeof STR

export function translate(lang: Lang, key: StrKey, vars?: Record<string, string | number>): string {
  let s: string = STR[key][lang]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  }
  return s
}

// Libellés des collections
const KIND_LABELS: Record<Kind, Record<'label' | 'one' | 'short', Record<Lang, string>>> = {
  mounts: {
    label: { fr: 'Montures', en: 'Mounts' },
    one: { fr: 'Monture', en: 'Mount' },
    short: { fr: 'Montures', en: 'Mounts' },
  },
  minions: {
    label: { fr: 'Mascottes', en: 'Minions' },
    one: { fr: 'Mascotte', en: 'Minion' },
    short: { fr: 'Mascottes', en: 'Minions' },
  },
  cards: {
    label: { fr: 'Cartes Triple Triad', en: 'Triple Triad Cards' },
    one: { fr: 'Carte', en: 'Card' },
    short: { fr: 'Triple Triad', en: 'Triple Triad' },
  },
  fashions: {
    label: { fr: 'Accessoires de mode', en: 'Fashion Accessories' },
    one: { fr: 'Accessoire', en: 'Accessory' },
    short: { fr: 'Accessoires', en: 'Accessories' },
  },
  facewear: {
    label: { fr: 'Lunettes', en: 'Facewear' },
    one: { fr: 'Paire de lunettes', en: 'Facewear' },
    short: { fr: 'Lunettes', en: 'Facewear' },
  },
  hairstyles: {
    label: { fr: 'Coiffures', en: 'Hairstyles' },
    one: { fr: 'Coiffure', en: 'Hairstyle' },
    short: { fr: 'Coiffures', en: 'Hairstyles' },
  },
  outfits: {
    label: { fr: 'Tenues', en: 'Outfits' },
    one: { fr: 'Tenue', en: 'Outfit' },
    short: { fr: 'Tenues', en: 'Outfits' },
  },
  armoires: {
    label: { fr: 'Armoire', en: 'Armoire' },
    one: { fr: 'Pièce', en: 'Piece' },
    short: { fr: 'Armoire', en: 'Armoire' },
  },
  bardings: {
    label: { fr: 'Bardes de chocobo', en: 'Chocobo Bardings' },
    one: { fr: 'Barde', en: 'Barding' },
    short: { fr: 'Bardes', en: 'Bardings' },
  },
  emotes: {
    label: { fr: 'Émotes', en: 'Emotes' },
    one: { fr: 'Émote', en: 'Emote' },
    short: { fr: 'Émotes', en: 'Emotes' },
  },
  frames: {
    label: { fr: 'Portraits', en: 'Portraits' },
    one: { fr: "Kit d'encadrement", en: "Framer's Kit" },
    short: { fr: 'Portraits', en: 'Portraits' },
  },
  orchestrions: {
    label: { fr: 'Orchestrion', en: 'Orchestrion' },
    one: { fr: 'Rouleau', en: 'Roll' },
    short: { fr: 'Orchestrion', en: 'Orchestrion' },
  },
  spells: {
    label: { fr: 'Magie bleue', en: 'Blue Magic' },
    one: { fr: 'Sort', en: 'Spell' },
    short: { fr: 'Magie bleue', en: 'Blue Magic' },
  },
  achievements: {
    label: { fr: 'Succès', en: 'Achievements' },
    one: { fr: 'Succès', en: 'Achievement' },
    short: { fr: 'Succès', en: 'Achievements' },
  },
}

export function kindLabel(lang: Lang, kind: Kind, form: 'label' | 'one' | 'short' = 'label'): string {
  return KIND_LABELS[kind][form][lang]
}

/** Nom localisé d'un objet (les deux langues sont déjà dans la base fusionnée). */
export function localName(item: { name: string; nameEn: string }, lang: Lang): string {
  return lang === 'fr' ? item.name : item.nameEn
}

/** Texte localisé d'une source. */
export function localSource(s: { text: string; textEn: string }, lang: Lang): string {
  return lang === 'fr' ? s.text : s.textEn
}

// Contexte React
export interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: StrKey, vars?: Record<string, string | number>) => string
}

export const LangContext = createContext<I18n>({
  lang: 'fr',
  setLang: () => {},
  t: (key, vars) => translate('fr', key, vars),
})

export function useI18n(): I18n {
  return useContext(LangContext)
}
