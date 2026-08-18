import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Character, Item } from './api'
import { lsGet, lsSet } from './storage'

// Protection anti-révélation. Un nouveau joueur qui parcourt les montures
// tombe sur Argos, dont la source est le nom de la quête finale d'Endwalker :
// l'application lui raconte l'histoire avant qu'il l'ait vécue.
//
// Le repère existe dans les données du jeu : les succès de catégorie « Main
// Scenario » marquent l'achèvement de la trame à chaque patch, de 2.0 à
// aujourd'hui. Le plus avancé que possède le joueur EST son avancement — ce
// n'est pas une estimation.

export interface Jalon {
  id: number
  patch: string
}

const CLE_REVELER = 'ogs.spoilers.v1'
const CLE_MODE = 'ogs.spoilermode.v1'
const CLE_SIMU = 'ogs.spoilersimu.v1'

/** Jalons d'histoire, publiés à part du gros catalogue des succès pour être
 *  disponibles dès le premier rendu : masquer trois secondes trop tard ne
 *  masque rien. */
export function useStory(): Jalon[] {
  const [jalons, setJalons] = useState<Jalon[]>([])
  useEffect(() => {
    let annule = false
    fetch(`${import.meta.env.BASE_URL}data/story.json`, { signal: AbortSignal.timeout(15000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!annule && Array.isArray(j)) setJalons(j)
      })
      .catch(() => {
        // sans jalons, on ne masque rien : mieux vaut montrer que se tromper
      })
    return () => {
      annule = true
    }
  }, [])
  return jalons
}

/** Où en est le joueur dans l'histoire, en numéro de patch. null quand on ne
 *  sait pas — et ne pas savoir n'autorise pas à masquer au hasard. */
export function avancementMsq(chars: { data: Character }[], jalons: Jalon[]): number | null {
  if (jalons.length === 0 || chars.length === 0) return null
  const parId = new Map(jalons.map((j) => [j.id, parseFloat(j.patch)]))
  let max: number | null = null
  let connu = false
  for (const c of chars) {
    const col = c.data.achievements
    // Collection vide ou non renseignée : on n'en déduit rien du tout.
    if (!col?.isPublic || col.ids.length === 0) continue
    connu = true
    for (const id of col.ids) {
      const p = parId.get(id)
      if (p !== undefined && (max === null || p > max)) max = p
    }
  }
  if (connu) return max ?? 0

  // Sans succès — un perso de niveau 20 n'en a aucun, et c'est justement celui
  // qu'il faut protéger — on se rabat sur le niveau, que le jeu impose comme
  // porte d'entrée de chaque extension. On retient le niveau du métier le plus
  // haut : un vétéran qui monte un métier neuf reste un vétéran.
  const niveau = Math.max(0, ...chars.map((c) => plusHautNiveau(c.data)))
  return niveau > 0 ? avancementParNiveau(niveau) : null
}

function plusHautNiveau(c: Character): number {
  const jobs = c.profile?.jobs ?? []
  return Math.max(c.profile?.activeLevel ?? 0, ...jobs.map((j) => j.level ?? 0))
}

/** Borne BASSE de ce que le joueur a forcément vu, pas haute : on protège au
 *  plus large tant qu'on n'a pas ses succès. Chaque palier est le niveau
 *  maximal d'une extension, atteint en en terminant la trame. */
function avancementParNiveau(niveau: number): number {
  if (niveau >= 100) return 7.0
  if (niveau >= 90) return 6.0
  if (niveau >= 80) return 5.0
  if (niveau >= 70) return 4.0
  if (niveau >= 60) return 3.0
  if (niveau >= 50) return 2.0
  return 0
}

/** Trois niveaux, parce qu'un seul ne pouvait pas convenir. Tout masquer
 *  au-delà de l'avancement cacherait 100 % du catalogue a un debutant, et un
 *  traqueur de collection qui ne montre aucune collection ne sert a rien. */
export type ModeSpoiler = 'aucun' | 'histoire' | 'decouverte'

/** Ce qu'il faut cacher d'un objet donne. */
export type Masque = 'rien' | 'source' | 'tout'

/** En mode decouverte, le nom d'un succes EST sa provenance — « Tueur de
 *  l'Arcadion » annonce le contenu a lui seul. Ceux-la se masquent en entier. */
const NOM_REVELATEUR = new Set(['achievements'])

export function masqueDe(
  item: Item,
  kind: string,
  avancement: number | null,
  mode: ModeSpoiler,
): Masque {
  if (mode === 'aucun' || avancement === null || !item.patch) return 'rien'
  if (parseFloat(item.patch) <= avancement) return 'rien'
  // Recompense de quete : c'est l'histoire elle-meme, on masque tout.
  if (item.sources.some((s) => s.type === 'Quest')) return 'tout'
  if (mode === 'histoire') return 'rien'
  return NOM_REVELATEUR.has(kind) ? 'tout' : 'source'
}

/** Niveau de masquage choisi, garde sur l'appareil. « Histoire » par defaut :
 *  c'est le seul qui protege du vrai spoiler sans vider l'ecran. */
export function useModeSpoiler() {
  const [mode, setMode] = useState<ModeSpoiler>(() => {
    const v = lsGet(CLE_MODE)
    if (v === 'aucun' || v === 'histoire' || v === 'decouverte') return v
    // Ancienne preference booleenne « je m'en fous d'etre spoile ».
    return lsGet(CLE_REVELER) === '1' ? 'aucun' : 'histoire'
  })
  const choisir = (m: ModeSpoiler) => {
    setMode(m)
    lsSet(CLE_MODE, m)
  }

  // Apercu : se mettre a la place d'un joueur arrete a tel patch, pour voir ce
  // qu'il verrait. Garde le temps de l'onglet seulement — c'est un essai, pas
  // une preference, et le retrouver dans trois jours serait deroutant.
  const [simule, setSimule] = useState<number | null>(() => {
    try {
      const v = sessionStorage.getItem(CLE_SIMU)
      return v ? Number(v) : null
    } catch {
      return null
    }
  })
  const simuler = (v: number | null) => {
    setSimule(v)
    try {
      if (v === null) sessionStorage.removeItem(CLE_SIMU)
      else sessionStorage.setItem(CLE_SIMU, String(v))
    } catch {
      // pas de persistance : l'apercu vivra le temps de la page
    }
  }
  return { mode, choisir, simule, simuler }
}

// Contexte : le journal rend les objets dans cinq composants differents, et
// faire descendre deux valeurs a travers tous aurait alourdi chaque signature
// pour rien. Chacun demande son masque la ou il affiche.
export const SpoilerCtx = createContext<{ msq: number | null; mode: ModeSpoiler }>({
  msq: null,
  mode: 'histoire',
})

/** Masque a appliquer a cet objet, selon le reglage courant. */
export function useMasque(item: Item, kind: string): Masque {
  const { msq, mode } = useContext(SpoilerCtx)
  return masqueDe(item, kind, msq, mode)
}

/** Le masque d'un objet quelconque, utilisable dans une boucle — un hook ne
 *  peut pas etre appele par element, mais la fonction qu'il rend, si. */
export function useMasqueur() {
  const { msq, mode } = useContext(SpoilerCtx)
  return useCallback((item: Item, kind: string) => masqueDe(item, kind, msq, mode), [msq, mode])
}

/** Avancement d'UN personnage, pour le planning. Deux bornes selon l'usage :
 *  pour masquer, on suppose qu'il a vu le moins possible (on protege au large) ;
 *  pour planifier, qu'il a debloque le plus possible (on ne lui retire pas du
 *  contenu qu'il peut faire). La meme valeur ne peut pas servir aux deux.
 */
export function accesDe(c: Character, jalons: Jalon[]): number {
  const parId = new Map(jalons.map((j) => [j.id, parseFloat(j.patch)]))
  const col = c.achievements
  if (col?.isPublic && col.ids.length > 0) {
    let max = 0
    for (const id of col.ids) {
      const p = parId.get(id)
      if (p !== undefined && p > max) max = p
    }
    // Les succes disent ou il en est ; la suite de l'extension en cours lui
    // reste ouverte, donc on arrondit a la fin de celle-ci.
    if (max > 0) return Math.floor(max) + 0.99
  }
  const jobs = c.profile?.jobs ?? []
  const niveau = Math.max(c.profile?.activeLevel ?? 0, ...jobs.map((j) => j.level ?? 0), 0)
  if (niveau >= 100) return Infinity
  if (niveau >= 90) return 7.99
  if (niveau >= 80) return 6.99
  if (niveau >= 70) return 5.99
  if (niveau >= 60) return 4.99
  if (niveau >= 50) return 3.99
  if (niveau > 0) return 2.99
  // Niveau inconnu : on ne retire rien, un planning ampute vaut moins qu'un
  // planning trop large.
  return Infinity
}
