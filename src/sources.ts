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

/** Un objet est « farmable » s'il a au moins une source hors event/boutique. */
export function itemStillObtainable(item: Item): boolean {
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
