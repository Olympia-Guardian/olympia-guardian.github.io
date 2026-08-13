import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KINDS,
  fetchCharacter,
  fetchDb,
  fetchRelicDb,
  type Character,
  type Item,
  type Kind,
  type RelicDb,
} from './api'

// ---------------------------------------------------------------------------
// Base d'objets (montures, mascottes, cartes Triple Triad, accessoires,
// orchestrion, magie bleue)
// ---------------------------------------------------------------------------

export type Db = Record<Kind, Item[]>

export function useDb() {
  const [db, setDb] = useState<Db | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(KINDS.map((k) => fetchDb(k)))
      .then((lists) => {
        if (!cancelled) {
          setDb(Object.fromEntries(KINDS.map((k, i) => [k, lists[i]])) as Db)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { db, error }
}

/** Base des reliques (chargée en parallèle, la vue Reliques attend son arrivée). */
export function useRelicDb() {
  const [relicDb, setRelicDb] = useState<RelicDb | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchRelicDb()
      .then((db) => {
        if (!cancelled) setRelicDb(db)
      })
      .catch(() => {
        // la vue affichera l'état de chargement ; un rechargement réessaie
      })
    return () => {
      cancelled = true
    }
  }, [])
  return relicDb
}

// ---------------------------------------------------------------------------
// Hash de l'URL
// ---------------------------------------------------------------------------

/** Met à jour un paramètre du hash sans toucher aux autres (g, r). */
export function setHashParam(key: string, value: string | null): void {
  const map = new Map<string, string>()
  for (const part of location.hash.replace(/^#/, '').split('&')) {
    const i = part.indexOf('=')
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1))
  }
  if (value) map.set(key, value)
  else map.delete(key)
  const s = [...map.entries()].map(([k, v]) => `${k}=${v}`).join('&')
  history.replaceState(null, '', location.pathname + location.search + (s ? '#' + s : ''))
}

/** Valeur d'un paramètre du hash (#r=…&tab=…). */
export function readHashParam(key: string): string | null {
  const m = location.hash.match(new RegExp(`(?:^#|[#&])${key}=([^&]*)`))
  return m ? m[1] : null
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface Member {
  id: number
  status: 'loading' | 'ok' | 'error'
  error?: string
  data?: Character
}

/** Fiches des membres d'une liste d'ids (le groupe actif) : chargement,
 *  rafraîchissement — la composition de la liste vit dans useGroups. */
export function useMembers(ids: number[]) {
  const [members, setMembers] = useState<Member[]>(() =>
    ids.map((id) => ({ id, status: 'loading' as const })),
  )
  const inFlight = useRef(new Set<number>())

  const load = useCallback(async (id: number, force: boolean) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    try {
      const data = await fetchCharacter(id, force)
      setMembers((prev) => prev.map((m) => (m.id === id ? { id, status: 'ok', data } : m)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { id, status: 'error', error: msg } : m)),
      )
    } finally {
      inFlight.current.delete(id)
    }
  }, [])

  // La liste suit le groupe : on garde les fiches déjà chargées.
  const key = ids.join('.')
  useEffect(() => {
    setMembers((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]))
      return ids.map((id) => byId.get(id) ?? { id, status: 'loading' as const })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    for (const m of members) {
      if (m.status === 'loading') void load(m.id, false)
    }
  }, [members, load])

  const refresh = useCallback(
    (id: number) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'loading' as const } : m)),
      )
      void load(id, true)
    },
    [load],
  )

  // Rechargement doux : ne force PAS de scrape Lodestone côté worker (sinon il
  // écraserait les validations temporaires montures/mascottes et grillerait la
  // synchro quotidienne). Invalider le cache front au préalable si besoin.
  const reload = useCallback(
    (id: number) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'loading' as const } : m)),
      )
      void load(id, false)
    },
    [load],
  )

  return { members, refresh, reload }
}

// ---------------------------------------------------------------------------
// Sélecteurs
// ---------------------------------------------------------------------------

/** Membres chargés avec succès. */
export function useReadyMembers(members: Member[]): (Member & { data: Character })[] {
  return useMemo(
    () => members.filter((m): m is Member & { data: Character } => m.status === 'ok' && !!m.data),
    [members],
  )
}

/** Par membre et par type de collection : Set des IDs possédés (FFXIV Collect). */
export function useOwnedSets(ready: (Member & { data: Character })[]) {
  return useMemo(() => {
    const map = new Map<number, Record<Kind, Set<number>>>()
    for (const m of ready) {
      map.set(
        m.id,
        Object.fromEntries(KINDS.map((k) => [k, new Set(m.data[k].ids)])) as Record<
          Kind,
          Set<number>
        >,
      )
    }
    return map
  }, [ready])
}
