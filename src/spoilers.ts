import { useEffect, useState } from 'react'
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
  if (!connu) return null
  // Aucun jalon possédé alors que les succès sont connus : le joueur débute.
  return max ?? 0
}

/** Un objet révèle-t-il quelque chose que ce joueur n'a pas encore vu ?
 *  Uniquement les récompenses de quête : le reste ne raconte rien. */
export function estRevelation(item: Item, avancement: number | null): boolean {
  if (avancement === null) return false
  if (!item.patch) return false
  if (!item.sources.some((s) => s.type === 'Quest')) return false
  return parseFloat(item.patch) > avancement
}

/** Préférence « je m'en fous d'être spoilé », gardée sur l'appareil. */
export function useRevelerTout() {
  const [tout, setTout] = useState<boolean>(() => lsGet(CLE_REVELER) === '1')
  const basculer = (v: boolean) => {
    setTout(v)
    lsSet(CLE_REVELER, v ? '1' : '0')
  }
  return { tout, basculer }
}
