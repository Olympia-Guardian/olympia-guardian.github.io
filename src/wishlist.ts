import { useCallback, useState } from 'react'
import type { Kind } from './api'
import { lsGet, lsSet } from './storage'

// Liste de souhaits : « celui-là, je le veux ». Elle ne dit pas ce que tu as,
// elle dit ce que tu vises — le planning et Mon Marché s'en servent pour
// remonter en tête ce qui compte pour toi.
//
// Stockée sur l'appareil, comme le perso mis en avant ou les absents du soir :
// c'est une préférence de confort, pas une donnée de collection. La garder au
// serveur coûterait une écriture D1 à chaque coche — le quota le plus serré du
// plan gratuit — pour une liste qui vit très bien dans le navigateur.

const CLE = 'ogs.wishlist.v1'

export type Wishes = Partial<Record<Kind, number[]>>

function lire(): Wishes {
  try {
    const brut = JSON.parse(lsGet(CLE) ?? '{}') as Wishes
    return brut && typeof brut === 'object' ? brut : {}
  } catch {
    return {}
  }
}

export function useWishlist() {
  const [wishes, setWishes] = useState<Wishes>(lire)

  const has = useCallback(
    (kind: Kind, id: number) => (wishes[kind] ?? []).includes(id),
    [wishes],
  )

  const toggle = useCallback((kind: Kind, id: number) => {
    setWishes((prev) => {
      const liste = prev[kind] ?? []
      const next: Wishes = {
        ...prev,
        [kind]: liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id],
      }
      if (next[kind]!.length === 0) delete next[kind]
      lsSet(CLE, JSON.stringify(next))
      return next
    })
  }, [])

  const count = Object.values(wishes).reduce((n, l) => n + l.length, 0)

  return { wishes, has, toggle, count }
}
