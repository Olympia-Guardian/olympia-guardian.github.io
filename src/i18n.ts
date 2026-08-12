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
    fr: "Ajoutez les persos du groupe (ID Lodestone à gauche) et l'appli croise vos collections de montures, mascottes, cartes Triple Triad et accessoires de mode via FFXIV Collect : elle vous dit quel contenu farmer ensemble pour que chaque run profite au plus de monde.",
    en: 'Add your group\'s characters (Lodestone ID on the left) and the app cross-references your mount, minion, Triple Triad card and fashion accessory collections via FFXIV Collect: it tells you what content to farm together so every run benefits as many players as possible.',
  },
  heroHint: {
    fr: 'Astuce : une fois le groupe constitué, « ⚡ Activer la synchro » puis partagez le lien une seule fois — roster et coches se synchronisent ensuite tout seuls.',
    en: 'Tip: once the group is set up, hit "⚡ Enable sync" and share the link once — the roster and checks then sync on their own.',
  },
  footer: {
    fr: 'mets à jour ton perso là-bas si tes derniers loots n\'apparaissent pas',
    en: 'update your character there if your latest loot is missing',
  },
  dataBy: { fr: 'Données', en: 'Data by' },

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
  playerNote: { fr: 'Cartes/accessoires : à cocher sur ffxivcollect.com', en: 'Cards/accessories: check them on ffxivcollect.com' },
  playerNoteTitle: {
    fr: "Le Lodestone n'expose pas les cartes, accessoires, orchestrion et magie bleue : coche-les sur ton profil ffxivcollect.com (connexion Discord) pour qu'ils comptent ici.",
    en: 'The Lodestone does not expose cards, accessories, orchestrion or blue magic: check them on your ffxivcollect.com profile (Discord login) so they count here.',
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
    fr: "Le Lodestone n'expose pas cette collection : chacun la coche sur son profil FFXIV Collect (connexion Discord), et elle apparaît ici à la synchro suivante →",
    en: 'The Lodestone does not expose this collection: check it on your FFXIV Collect profile (Discord login) and it shows up here on the next sync →',
  },
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
    fr: 'Objets nécessaires par étape d\'après les guides ffxiv-eorzea.com (armes zodiacales, animas, Eurêka, résistance, Manderville, fantômes). Progression synchronisée depuis FFXIV Collect — coche tes reliques sur ton profil là-bas.',
    en: 'Required items per step based on the ffxiv-eorzea.com guides (Zodiac, Anima, Eureka, Resistance, Manderville, Phantom weapons). Progress syncs from FFXIV Collect — check your relics on your profile there.',
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
    short: { fr: 'Access.', en: 'Fashion' },
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
