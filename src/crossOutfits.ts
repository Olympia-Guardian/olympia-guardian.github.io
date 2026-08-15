import type { Character, Item } from './api'
import type { Lang } from './i18n'
import type { Db } from './store'

// Tenues et armoire décrivent parfois les mêmes pièces : 468 tenues sur 1086
// existent aussi dans l'armoire, pièce pour pièce (appariement fait à la
// construction des catalogues, sur le nom anglais ET l'icône). Cocher d'un
// côté sans l'autre laisse une des deux listes fausse.
//
// On ne coche jamais d'office : ce module se contente de lister ce qui est
// reportable, et la cloche le propose. Le report reste un geste du joueur.

export interface CrossSuggestion {
  /** Identité stable : sert de clé de rendu et de mémoire des refus. */
  key: string
  charId: number
  charName: string
  outfitName: string
  /** Collection à compléter. */
  target: 'armoires' | 'outfits'
  ids: number[]
}

/** Au-delà, la cloche deviendrait illisible : le reste réapparaîtra au fur et
 *  à mesure que le joueur traite les premières. */
const MAX_SUGGESTIONS = 12

function localName(it: Item, lang: Lang): string {
  return lang === 'fr' ? it.name : it.nameEn
}

export function crossSuggestions(
  db: Db | null,
  chars: { id: number; name: string; data: Character }[],
  lang: Lang,
  ignored: Set<string>,
): CrossSuggestion[] {
  if (!db) return []
  const liees = db.outfits.filter(
    (o) => (o.pieces?.length ?? 0) > 0 && o.pieces!.every((p) => p.armoireId !== undefined),
  )
  if (liees.length === 0) return []

  const out: CrossSuggestion[] = []
  for (const c of chars) {
    const tenues = new Set(c.data.outfits.ids)
    const pieces = new Set(c.data.outfitPieceIds)
    const armoire = new Set(c.data.armoires.ids)
    for (const o of liees) {
      if (out.length >= MAX_SUGGESTIONS) return out
      const possedee = tenues.has(o.id) || o.pieces!.every((p) => pieces.has(p.id))
      const armoireIds = o.pieces!.map((p) => p.armoireId!)
      const touteArmoire = armoireIds.every((a) => armoire.has(a))

      if (possedee && !touteArmoire) {
        const key = `arm:${c.id}:${o.id}`
        if (ignored.has(key)) continue
        out.push({
          key,
          charId: c.id,
          charName: c.name,
          outfitName: localName(o, lang),
          target: 'armoires',
          ids: armoireIds.filter((a) => !armoire.has(a)),
        })
      } else if (!possedee && touteArmoire) {
        const key = `ten:${c.id}:${o.id}`
        if (ignored.has(key)) continue
        out.push({
          key,
          charId: c.id,
          charName: c.name,
          outfitName: localName(o, lang),
          target: 'outfits',
          ids: [o.id],
        })
      }
    }
  }
  return out
}
