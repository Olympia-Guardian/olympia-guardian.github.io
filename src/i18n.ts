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
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === 'fr' || stored === 'en') return stored
  } catch {
    // pas de préférence enregistrée
  }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    // tant pis
  }
}

const STR = {
  // Barre du haut
  planning: { fr: 'Planning', en: 'Planner' },
  wholeGroup: { fr: '👥 Tout le groupe', en: '👥 Whole group' },
  justMe: { fr: '👤 Juste {name}', en: '👤 Just {name}' },
  focusTitle: {
    fr: 'Voir tout le groupe, ou juste un perso (choix mémorisé sur ce navigateur)',
    en: 'View the whole group, or a single character (remembered on this browser)',
  },
  enableSync: { fr: '⚡ Activer la synchro', en: '⚡ Enable sync' },
  enableSyncTitle: {
    fr: 'Crée un salon partagé : le lien devient court et stable, et le roster comme les coches se synchronisent tout seuls pour tout le groupe — plus besoin de repartager le lien.',
    en: 'Creates a shared room: the link becomes short and stable, and the roster and manual checks sync automatically for everyone — no need to re-share the link.',
  },
  syncOn: { fr: 'Synchro auto', en: 'Auto sync' },
  syncKo: { fr: 'Synchro KO', en: 'Sync down' },
  syncOkTitle: {
    fr: 'Roster et coches synchronisés automatiquement pour tout le groupe via le lien.',
    en: 'Roster and manual checks sync automatically for the whole group through the link.',
  },
  syncErrTitle: {
    fr: 'Impossible de joindre le salon — réessai automatique. Les données restent enregistrées en local.',
    en: 'Cannot reach the room — retrying automatically. Your data is still saved locally.',
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
    fr: 'Tout le monde est marqué absent ce soir 😅 — réactive quelqu\'un dans le roster.',
    en: 'Everyone is marked away tonight 😅 — bring someone back in the roster.',
  },
  heroTitle: { fr: 'Complétez vos collections ensemble', en: 'Complete your collections together' },
  heroBody: {
    fr: "Ajoutez les persos du groupe (ID Lodestone à gauche) et l'appli croise vos treize collections — montures, mascottes, cartes, mode, tenues, émotes, orchestrion, magie bleue, reliques… : elle vous dit quel contenu farmer ensemble pour que chaque run profite au plus de monde.",
    en: 'Add your group\'s characters (Lodestone ID on the left) and the app cross-references your thirteen collections — mounts, minions, cards, fashion, outfits, emotes, orchestrion, blue magic, relics…: it tells you what content to farm together so every run benefits as many players as possible.',
  },
  heroHint: {
    fr: 'Astuce : une fois le groupe constitué, « ⚡ Activer la synchro » puis partagez le lien une seule fois — roster et coches se synchronisent ensuite tout seuls.',
    en: 'Tip: once the group is set up, hit "⚡ Enable sync" and share the link once — the roster and checks then sync on their own.',
  },
  footer: {
    fr: 'catalogues rafraîchis chaque nuit',
    en: 'catalogues refreshed nightly',
  },
  dataBy: { fr: 'Catalogues', en: 'Catalogues by' },
  feedback: { fr: 'un souci, une idée ?', en: 'issues & ideas' },

  // Comptes & Mon Journal
  myPage: { fr: 'Mon Journal', en: 'My Journal' },
  loginDiscord: { fr: 'Se connecter avec Discord', en: 'Sign in with Discord' },
  loginShort: { fr: 'Connexion', en: 'Sign in' },
  loginIntro: {
    fr: 'Connecte-toi pour lier un ou plusieurs personnages et renseigner directement tes collections — cartes, mode, tenues, émotes, orchestrion, magie bleue, reliques…',
    en: 'Sign in to link one or more characters and fill in your collections directly — cards, fashion, outfits, emotes, orchestrion, blue magic, relics…',
  },
  logout: { fr: 'Se déconnecter', en: 'Sign out' },
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
    fr: 'Code introuvable dans ta présentation Lodestone — vérifie qu\'elle est bien enregistrée et publique, puis réessaie.',
    en: 'Code not found in your Lodestone bio — make sure it\'s saved and public, then retry.',
  },
  bindConflict: {
    fr: 'Ce personnage est déjà lié à un autre compte.',
    en: 'This character is already linked to another account.',
  },
  bindError: { fr: 'Erreur — réessaie dans un instant.', en: 'Error — retry in a moment.' },
  saveError: { fr: 'Sauvegarde impossible — réessaie.', en: 'Could not save — retry.' },
  saved: { fr: '✓ Enregistré', en: '✓ Saved' },
  albumPage: { fr: 'Page {n}', en: 'Page {n}' },
  collections: { fr: 'Collections', en: 'Collections' },
  bindAdd: { fr: 'Ajouter un personnage', en: 'Add a character' },
  unbindChar: { fr: 'Délier', en: 'Unlink' },
  unbindConfirm: {
    fr: 'Délier {name} de ton compte ? Ses collections restent enregistrées : tu les retrouveras si tu le relies plus tard.',
    en: 'Unlink {name} from your account? Its collections stay saved — you get them back if you link it again later.',
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
  relicReqOneWeapon: { fr: '1 arme', en: '1 weapon' },
  relicReqOnePiece: { fr: '1 pièce', en: '1 piece' },
  relicReqLeft: { fr: 'Restant', en: 'Remaining' },
  relicAddAll: { fr: 'Tout ajouter', en: 'Add all' },
  relicRemoveAll: { fr: 'Tout retirer', en: 'Remove all' },
  relicCheck: { fr: 'clique pour marquer comme obtenue', en: 'click to mark as obtained' },
  relicUncheck: { fr: 'clique pour retirer', en: 'click to remove' },
  relicEditNote: {
    fr: 'Clique sur une relique pour la marquer comme obtenue : les matériaux restants se recalculent aussitôt.',
    en: 'Click a relic to mark it obtained — remaining materials update instantly.',
  },
  relicSummaryNote: {
    fr: "Déplie un joueur pour voir son avancement par extension et par série. Le détail des paliers et des matériaux se trouve dans « Mon Journal ».",
    en: 'Expand a player to see progress per expansion and series. Step-by-step costs and materials live in “My Journal”.',
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
    fr: 'Montures et mascottes se synchronisent toutes seules depuis le Lodestone (lecture seule). Les autres onglets se cochent à la main — clique sur les icônes.',
    en: 'Mounts and minions sync on their own from the Lodestone (read-only). The other tabs are checked by hand — click the icons.',
  },
  myPageReadOnly: {
    fr: 'Synchronisé automatiquement depuis le Lodestone — lecture seule',
    en: 'Synced automatically from the Lodestone — read-only',
  },

  // Multi-groupes
  groupUnsaved: { fr: 'Groupe actuel', en: 'Current group' },
  groupSave: { fr: '💾 Enregistrer ce groupe…', en: '💾 Save this group…' },
  groupForget: { fr: '🗑 Oublier ce groupe', en: '🗑 Forget this group' },
  groupNamePrompt: { fr: 'Nom du groupe :', en: 'Group name:' },
  groupsTitle: {
    fr: 'Tes groupes enregistrés sur ce navigateur — bascule de l\'un à l\'autre',
    en: 'Groups saved on this browser — switch between them',
  },

  // Roster
  team: { fr: 'Équipe', en: 'Team' },
  present: { fr: '{n} présent', en: '{n} here' },
  presents: { fr: '{n} présents', en: '{n} here' },
  allHere: { fr: 'Tous là', en: 'All here' },
  allHereTitle: { fr: 'Remettre tout le monde présent', en: 'Mark everyone as present' },
  collapseRoster: { fr: 'Réduire le roster', en: 'Collapse roster' },
  expandRoster: { fr: 'Développer le roster', en: 'Expand roster' },
  presentTitle: {
    fr: 'Présent ce soir — clique pour le marquer absent (les vues l\'ignorent)',
    en: 'Here tonight — click to mark as away (views will ignore them)',
  },
  absentTitle: {
    fr: 'Absent ce soir — clique pour le remettre dans le groupe',
    en: 'Away tonight — click to bring them back',
  },
  awayTonight: { fr: '(absent ce soir)', en: '(away tonight)' },
  loading: { fr: 'Chargement…', en: 'Loading…' },
  retry: { fr: 'Réessayer', en: 'Retry' },
  removeMember: { fr: 'Retirer du groupe', en: 'Remove from group' },
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
  syncedAgo: { fr: 'Fiche FFXIV Collect — synchronisé {when}', en: 'FFXIV Collect profile — synced {when}' },
  today: { fr: "aujourd'hui", en: 'today' },
  yesterday: { fr: 'hier', en: 'yesterday' },
  daysAgo: { fr: 'il y a {n} j', en: '{n} d ago' },
  playerNote: { fr: 'Collections à renseigner dans « Mon Journal »', en: 'Collections to fill in from “My Journal”' },
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
  compoAll: { fr: 'Solo + groupe', en: 'Solo + group' },
  compoGroup: { fr: 'Nécessite un groupe', en: 'Needs a group' },
  compoSolo: { fr: 'Faisable en solo', en: 'Soloable' },
  compoTitle: {
    fr: 'Solo = solotable (souvent en désynchronisé) ; Groupe = un groupe est requis ou fortement conseillé',
    en: 'Solo = soloable (often unsynced); Group = a group is required or strongly advised',
  },
  minMissing1: { fr: 'Manque à ≥ {n} joueur', en: 'Missing for ≥ {n} player' },
  minMissingN: { fr: 'Manque à ≥ {n} joueurs', en: 'Missing for ≥ {n} players' },
  includeUnavailable: { fr: 'Inclure event / boutique', en: 'Include event / store' },
  searchPlanning: { fr: 'Rechercher un contenu ou un objet…', en: 'Search content or items…' },
  tileRuns: { fr: 'contenus à farmer', en: 'content to farm' },
  tileMounts: { fr: 'montures à récupérer', en: 'mounts to get' },
  tileMinions: { fr: 'mascottes à récupérer', en: 'minions to get' },
  tileCards: { fr: 'cartes TT à récupérer', en: 'TT cards to get' },
  tileFashions: { fr: 'accessoires à récupérer', en: 'accessories to get' },
  tileOrchestrions: { fr: 'rouleaux à récupérer', en: 'rolls to get' },
  tileSpells: { fr: 'sorts à apprendre', en: 'spells to learn' },
  tileFacewear: { fr: 'lunettes à récupérer', en: 'facewear to get' },
  tileHairstyles: { fr: 'coiffures à récupérer', en: 'hairstyles to get' },
  tileOutfits: { fr: 'tenues à récupérer', en: 'outfits to get' },
  tileArmoires: { fr: "pièces d'armoire à récupérer", en: 'armoire pieces to get' },
  tileBardings: { fr: 'bardes à récupérer', en: 'bardings to get' },
  tileEmotes: { fr: 'émotes à récupérer', en: 'emotes to get' },
  tileFrames: { fr: 'portraits à récupérer', en: 'portraits to get' },
  planningEmpty: { fr: 'Rien à farmer avec ces filtres — collection complète ? 🎉', en: 'Nothing to farm with these filters — collection complete? 🎉' },
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
  seeOnCollect: { fr: 'Voir sur FFXIV Collect ↗', en: 'View on FFXIV Collect ↗' },
  itemDetails: { fr: "Fiche de l'objet", en: 'Item details' },

  // Solo / groupe
  needSolo: { fr: 'Solo ok', en: 'Solo ok' },
  needAdvised: { fr: 'Groupe conseillé', en: 'Group advised' },
  needGroup: { fr: 'Groupe requis', en: 'Group required' },

  // Reliques
  relicsTab: { fr: 'Reliques', en: 'Relics' },
  relicGlobal: { fr: 'Avancement global — toutes les reliques', en: 'Overall progress — all relics' },
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
    short: { fr: 'Cartes', en: 'Cards' },
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
