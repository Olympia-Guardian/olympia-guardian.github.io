import { useEffect, useRef, useState } from 'react'
import { KINDS, type Character, type Kind } from './api'
import type { Member } from './store'

type Ready = Member & { data: Character }

// « Quoi de neuf » : on garde un instantané des compteurs par perso, et à la
// visite suivante on affiche le diff (« Eowyn +3 montures »). Local au
// navigateur : chacun voit ce qui a changé depuis SA dernière visite.

const SNAP_KEY = 'ogs.snapshot.v1'

interface Snapshot {
  at: number
  byChar: Record<number, Partial<Record<Kind, number>> & { name?: string }>
}

export interface DigestLine {
  name: string
  joined?: boolean
  deltas: [Kind, number][]
}

export function useDigest(ready: Ready[]) {
  const [lines, setLines] = useState<DigestLine[] | null>(null)
  const captured = useRef(false)

  useEffect(() => {
    if (ready.length === 0) return

    // 1) Au premier chargement de la session : comparer à l'instantané précédent.
    if (!captured.current) {
      captured.current = true
      try {
        const raw = localStorage.getItem(SNAP_KEY)
        if (raw) {
          const snap = JSON.parse(raw) as Snapshot
          const out: DigestLine[] = []
          for (const m of ready) {
            const prev = snap.byChar?.[m.id]
            if (!prev) {
              out.push({ name: m.data.name, joined: true, deltas: [] })
              continue
            }
            const deltas: [Kind, number][] = []
            for (const k of KINDS) {
              const d = m.data[k].count - (prev[k] ?? 0)
              if (d > 0) deltas.push([k, d])
            }
            if (deltas.length > 0) out.push({ name: m.data.name, deltas })
          }
          if (out.length > 0) setLines(out)
        }
      } catch {
        // instantané illisible : on repart de zéro
      }
    }

    // 2) À chaque évolution : mettre l'instantané à jour (fusion, pour ne pas
    //    perdre les persos pas encore chargés).
    try {
      const raw = localStorage.getItem(SNAP_KEY)
      const snap: Snapshot = raw ? JSON.parse(raw) : { at: 0, byChar: {} }
      for (const m of ready) {
        snap.byChar[m.id] = {
          name: m.data.name,
          ...Object.fromEntries(KINDS.map((k) => [k, m.data[k].count])),
        }
      }
      snap.at = Date.now()
      localStorage.setItem(SNAP_KEY, JSON.stringify(snap))
    } catch {
      // pas de persistance, pas de digest la prochaine fois — sans gravité
    }
  }, [ready])

  return { lines, dismiss: () => setLines(null) }
}
