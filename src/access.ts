import { useEffect, useState } from 'react'
import type { Character } from './api'

// Jusqu'où un personnage peut aller dans le contenu du jeu. Sert au planning :
// proposer à quelqu'un arrêté au patch 4.2 d'aller farmer Hadès n'est pas une
// révélation, c'est un conseil faux — il ne peut pas y entrer.
//
// Le repère vient des données du jeu : les succès de catégorie « Main Scenario »
// marquent l'achèvement de la trame à chaque patch, de 2.0 à aujourd'hui. À
// défaut, le niveau des métiers borne l'extension atteinte.

export interface Jalon {
  id: number
  patch: string
}

/** Jalons d'histoire, publiés à part du catalogue des succès (3946 entrées,
 *  seconde vague) pour être disponibles dès le premier rendu du planning. */
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
        // sans jalons, on ne retire rien : un planning amputé vaudrait moins
        // qu'un planning trop large
      })
    return () => {
      annule = true
    }
  }, [])
  return jalons
}

/** Patch maximal que ce personnage peut atteindre. Borne LARGE volontairement :
 *  retirer du planning un contenu qu'il pourrait faire coûte plus cher que d'y
 *  laisser un objet de trop. Infinity quand on ne sait pas. */
export function accesDe(c: Character, jalons: Jalon[]): number {
  const parId = new Map(jalons.map((j) => [j.id, parseFloat(j.patch)]))
  const col = c.achievements
  if (col?.isPublic && col.ids.length > 0) {
    let max = 0
    for (const id of col.ids) {
      const p = parId.get(id)
      if (p !== undefined && p > max) max = p
    }
    // Les succès disent où il en est ; la suite de l'extension en cours lui
    // reste ouverte, donc on arrondit à la fin de celle-ci.
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
  return Infinity
}
