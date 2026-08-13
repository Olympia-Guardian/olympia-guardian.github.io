import type { Item } from './api'
import { translate, type Lang } from './i18n'

// Libellés français des types de sources renvoyés par FFXIV Collect.
export const TYPE_LABELS: Record<string, string> = {
  Trial: 'Défi',
  Raid: 'Raid',
  'Chaotic Raid': 'Raid chaotique',
  Dungeon: 'Donjon',
  'V&C Dungeon': 'Donjon variant/critérié',
  'Deep Dungeon': 'Donjon sans fond',
  'Occult Crescent': 'Croissant occulte',
  Bozja: 'Bozja',
  Eureka: 'Eurêka',
  Hunts: 'Chasses',
  FATE: 'ALÉA',
  'Treasure Hunt': 'Chasse aux trésors',
  Tribal: 'Tribus',
  Quest: 'Quête',
  Achievement: 'Haut fait',
  'Wondrous Tails': 'Carnet fabuleux',
  'Gold Saucer': 'Gold Saucer',
  PvP: 'JcJ',
  'Island Sanctuary': 'Îlot paradisiaque',
  'Cosmic Exploration': 'Exploration cosmique',
  Skybuilders: "Restauration d'Ishgard",
  Crafting: 'Artisanat',
  Gathering: 'Récolte',
  Voyages: 'Expéditions',
  Venture: 'Missions de servant',
  Purchase: 'Achat',
  Premium: 'Boutique en ligne',
  Event: 'Événement passé',
  NPC: 'Duel de PNJ',
  Other: 'Autre',
}

// En anglais, les types bruts de l'API sont déjà de bons libellés ; quelques
// retouches seulement.
const TYPE_LABELS_EN: Record<string, string> = {
  Premium: 'Online Store',
  Event: 'Past Event',
  NPC: 'NPC Duel',
  Venture: 'Retainer Ventures',
  Skybuilders: 'Ishgardian Restoration',
  Tribal: 'Tribal Quests',
}

export function typeLabel(type: string, lang: Lang = 'fr'): string {
  if (lang === 'fr') return TYPE_LABELS[type] ?? type
  return TYPE_LABELS_EN[type] ?? type
}

// Contenu instancié qu'on peut farmer ensemble : le cœur du planning de groupe.
export const INSTANCE_TYPES = new Set([
  'Trial',
  'Raid',
  'Chaotic Raid',
  'Dungeon',
  'V&C Dungeon',
  'Deep Dungeon',
  'Occult Crescent',
  'Bozja',
  'Eureka',
  'Hunts',
  'FATE',
  'Treasure Hunt',
])

// Types où le texte de la source identifie un contenu précis à lancer (un défi,
// un raid, une carte au trésor…) → une carte de planning par contenu. Pour le
// reste (monnaies, boutiques, zones d'aventure), le texte n'est qu'une variante
// d'achat : une seule carte par catégorie, sinon les mêmes objets se répètent.
export const PER_DUTY_TYPES = new Set([
  'Trial',
  'Raid',
  'Chaotic Raid',
  'Dungeon',
  'V&C Dungeon',
  'Deep Dungeon',
  'FATE',
  'Treasure Hunt',
])

/** Source « échange » déguisée en contenu : « PNJ - Lieu - 99 monnaie ». L'API
 *  type ces achats comme le défi/raid dont vient la monnaie ; on les rabat en
 *  détail sur la carte du vrai contenu au lieu d'en faire une carte à part. */
export function isExchangeText(textEn: string): boolean {
  const parts = textEn.split(' - ')
  return parts.length >= 3 && /^\d/.test(parts[parts.length - 1].trim())
}

// Plus obtenable normalement : événements passés et boutique en ligne.
export const UNAVAILABLE_TYPES = new Set(['Event', 'Premium'])

export type Scope = 'instances' | 'longterm' | 'all'

export function sourceInScope(type: string, scope: Scope, includeUnavailable: boolean): boolean {
  if (!includeUnavailable && UNAVAILABLE_TYPES.has(type)) return false
  if (scope === 'all') return true
  if (scope === 'instances') return INSTANCE_TYPES.has(type)
  return !INSTANCE_TYPES.has(type) && !UNAVAILABLE_TYPES.has(type)
}

/** Un objet est « farmable » s'il est encore obtenable (drapeau « limited »
 *  de FFXIV Collect, cuit dans nos données) et qu'il a au moins une source
 *  hors event/boutique. */
export function itemStillObtainable(item: Item): boolean {
  if (item.unobtainable) return false
  if (item.sources.length === 0) return true
  return item.sources.some((s) => !UNAVAILABLE_TYPES.has(s.type))
}

// ---------------------------------------------------------------------------
// Solo ou groupe ? L'API ne le dit pas : heuristique basée sur les règles du
// jeu. Le vieux contenu instancié se solote en désynchronisé ; ce qui exige
// vraiment un groupe est surtout le contenu de l'extension courante et les
// quelques contenus à gros effectif (raid chaotique, Tour fourchue, Delubrum
// sauvage, arsenal de Baldesion…).
// ---------------------------------------------------------------------------

export type GroupNeed = 'solo' | 'advised' | 'group'

const NEED_ORDER: Record<GroupNeed, number> = { solo: 0, advised: 1, group: 2 }

export function maxNeed(needs: GroupNeed[]): GroupNeed {
  return needs.reduce((a, b) => (NEED_ORDER[b] > NEED_ORDER[a] ? b : a), 'solo')
}

export function minNeed(needs: GroupNeed[]): GroupNeed {
  return needs.reduce((a, b) => (NEED_ORDER[b] < NEED_ORDER[a] ? b : a), 'group')
}

export function needLabel(need: GroupNeed, lang: Lang = 'fr'): string {
  const key = need === 'solo' ? 'needSolo' : need === 'advised' ? 'needAdvised' : 'needGroup'
  return translate(lang, key)
}

/** Extension courante : son contenu à haut niveau ne se solote pas encore. */
const CURRENT_EXPANSION = 7

export function sourceGroupNeed(type: string, textEn: string, patch: string): GroupNeed {
  const v = parseFloat(patch) || 0
  const t = textEn.toLowerCase()
  switch (type) {
    case 'Chaotic Raid':
      return 'group' // 24 joueurs, contenu difficile
    case 'Occult Crescent':
      return t.includes('forked tower') ? 'group' : 'solo' // Tour fourchue : 48 joueurs
    case 'Bozja':
      if (t.includes('savage')) return 'group' // Delubrum sauvage : 24/48
      if (t.includes('delubrum')) return 'advised'
      return 'solo'
    case 'Eureka':
      return t.includes('baldesion') ? 'group' : 'solo' // l'Arsenal se fait à 56
    case 'Trial':
      return v >= CURRENT_EXPANSION ? 'group' : 'solo'
    case 'Raid':
      if (t.includes('savage')) {
        if (v >= CURRENT_EXPANSION) return 'group'
        return v >= CURRENT_EXPANSION - 1 ? 'advised' : 'solo'
      }
      return v >= CURRENT_EXPANSION ? 'group' : 'solo'
    case 'Dungeon':
      // Donjons de l'extension courante : faisables avec les PNJ, mieux en groupe
      return v >= CURRENT_EXPANSION ? 'advised' : 'solo'
    case 'V&C Dungeon':
      return t.includes('criterion') || t.includes('savage') ? 'group' : 'solo'
    case 'Treasure Hunt':
      return 'advised' // les portails sont taillés pour un groupe
    case 'Hunts':
      return 'advised' // rangs S / trains de chasse
    default:
      return 'solo'
  }
}

// ---------------------------------------------------------------------------
// Icône de prérequis d'une source : monnaie officielle reconnue dans le texte
// (la quantité est déjà dans le texte affiché), sinon icône du type de contenu
// (planches du Duty Finder). Les regex tolèrent les deux apostrophes et
// testent FR + EN à la fois (le texte anglais est le plus stable).
// ---------------------------------------------------------------------------

const XIV_ICON = (id: string) =>
  `https://v2.xivapi.com/api/asset?format=webp&path=${encodeURIComponent(`ui/icon/${id.slice(0, 3)}000/${id}_hr1.tex`)}`

const CURRENCY_ICONS: [RegExp, string][] = [
  [/\b(MGP|PGS)\b/, '065025'],
  [/bicolor gemstone|gemmes? bicolores?/i, '065071'],
  [/wolf mark|marques? de loup/i, '065014'],
  [/trophy crystal|crista(l|ux)-trophées?/i, '065090'],
  [/faux (leaf|leaves)|folioles? irréelles?/i, '065078'],
  [/allied seal|insignes? alliés?/i, '065024'],
  [/centurio seal|insignes? de centurio/i, '065034'],
  [/sacks? of nuts|insignes? de chasse/i, '065068'],
  [/(company|storm|serpent|flame) seal|sceaux? de (compagnie|la Tempête|du Serpent|de la Flamme)/i, '065004'],
  [/achievement certificate|jetons? de hauts? faits/i, '065059'],
  [/bozjan cluster|crista(l|ux) bozjiens?/i, '065082'],
  [/poetics|poétiques?/i, '065023'],
  [/skybuilders.? scrip|assignats? d'Azurée/i, '065073'],
  [/seafarer.?s cowrie|assignats? insulaires? azur/i, '065096'],
  [/islander.?s cowrie|assignats? insulaires? émeraude/i, '065097'],
  [/purple crafters.? scrip|assignats? mauves? d'artisan/i, '065088'],
  [/purple gatherers.? scrip|assignats? mauves? de récolteur/i, '065087'],
  [/orange crafters.? scrip|assignats? oranges? d'artisan/i, '065110'],
  [/orange gatherers.? scrip|assignats? oranges? de récolteur/i, '065109'],
  [/khloe.?s gold certificate|certificats? de mérite d'or/i, '026191'],
  [/khloe.?s silver certificate|certificats? de mérite d'argent/i, '026190'],
  [/khloe.?s bronze certificate|certificats? de mérite de bronze/i, '026186'],
  [/sanguinite|gemmes? mystiques? de la Force/i, '021467'],
  [/talismans? de la Magie/i, '065141'],
  [/gemmes? des pèlerins/i, '021282'],
  [/devises? du Gold Saucer/i, '065140'],
  [/\bgils?\b/i, '065002'],
]

// Icônes des types de contenu (feuille ContentType du jeu).
const TYPE_ICONS: Record<string, string> = {
  Dungeon: '061801',
  Trial: '061804',
  Raid: '061802',
  'Chaotic Raid': '061850',
  PvP: '061806',
  FATE: '061809',
  'Treasure Hunt': '061808',
  'Deep Dungeon': '061824',
  Eureka: '061833',
  Bozja: '061838',
  'Occult Crescent': '061851',
  'V&C Dungeon': '061846',
  'Gold Saucer': '061820',
  'Island Sanctuary': '061847',
  'Wondrous Tails': '061825',
  Venture: '061818',
  Hunts: '061819',
  Voyages: '061812',
  Crafting: '061816',
  Gathering: '061815',
  Skybuilders: '061816',
  Tribal: '061814',
  Quest: '071221',
  Achievement: '061810',
}

/** Icône du prérequis d'une source, ou null (le TypeChip suffit alors). */
export function sourceIcon(s: { type: string; text: string; textEn: string }): string | null {
  const hay = `${s.text} ${s.textEn}`
  for (const [re, id] of CURRENCY_ICONS) if (re.test(hay)) return XIV_ICON(id)
  const t = TYPE_ICONS[s.type]
  return t ? XIV_ICON(t) : null
}
