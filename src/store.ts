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
// État partagé : le roster porte un horodatage (t) pour la fusion « le plus
// récent gagne » (LWW) via le salon de synchro. Toutes les possessions
// viennent de FFXIV Collect (source de vérité unique) : rien d'autre à
// synchroniser.
// ---------------------------------------------------------------------------

export interface RosterState {
  ids: number[]
  t: number
}

export interface RoomDoc {
  v: 1
  roster: RosterState
}

export function mergeRosterLWW(a: RosterState, b: RosterState | undefined | null): RosterState {
  if (!b) return a
  return b.t > a.t ? b : a
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

export function readHashRoomId(): string | null {
  const match = location.hash.match(/r=([\w-]+)/)
  return match ? match[1] : null
}

function readHashIds(): number[] {
  const match = location.hash.match(/g=([\d.]+)/)
  if (!match) return []
  return match[1]
    .split('.')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
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

const ROSTER_KEY = 'ogs.roster.v2'

function readStoredRoster(): RosterState {
  try {
    const raw = localStorage.getItem(ROSTER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.ids)) {
        return { ids: parsed.ids.filter((n: unknown) => Number.isInteger(n)), t: parsed.t ?? 1 }
      }
    }
    // migration depuis l'ancien format (simple tableau)
    const old = localStorage.getItem('ogs.roster.v1')
    if (old) {
      const ids = JSON.parse(old)
      if (Array.isArray(ids)) return { ids: ids.filter((n) => Number.isInteger(n)), t: 1 }
    }
  } catch {
    // état vierge
  }
  return { ids: [], t: 0 }
}

function initialRoster(): RosterState {
  const stored = readStoredRoster()
  const fromHash = readHashIds()
  const added = fromHash.filter((id) => !stored.ids.includes(id))
  if (added.length > 0) {
    return { ids: [...stored.ids, ...added], t: Date.now() }
  }
  return stored
}

export function useRoster(hasRoom: boolean) {
  const [roster, setRoster] = useState<RosterState>(initialRoster)
  const [members, setMembers] = useState<Member[]>(() =>
    initialRoster().ids.map((id) => ({ id, status: 'loading' as const })),
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

  useEffect(() => {
    for (const m of members) {
      if (m.status === 'loading') void load(m.id, false)
    }
  }, [members, load])

  // Persistance locale + hash (g= seulement hors salon : dans un salon, le
  // roster voyage par la synchro et le lien reste court).
  const rosterKey = `${roster.ids.join('.')}|${roster.t}|${hasRoom}`
  useEffect(() => {
    try {
      localStorage.setItem(ROSTER_KEY, JSON.stringify(roster))
    } catch {
      // tant pis pour la persistance
    }
    setHashParam('g', !hasRoom && roster.ids.length > 0 ? roster.ids.join('.') : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey])

  const applyIds = useCallback((ids: number[]) => {
    setMembers((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]))
      return ids.map((id) => byId.get(id) ?? { id, status: 'loading' as const })
    })
  }, [])

  const add = useCallback((id: number) => {
    setRoster((prev) =>
      prev.ids.includes(id) ? prev : { ids: [...prev.ids, id], t: Date.now() },
    )
    setMembers((prev) =>
      prev.some((m) => m.id === id) ? prev : [...prev, { id, status: 'loading' as const }],
    )
  }, [])

  const remove = useCallback((id: number) => {
    setRoster((prev) =>
      prev.ids.includes(id)
        ? { ids: prev.ids.filter((x) => x !== id), t: Date.now() }
        : prev,
    )
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const refresh = useCallback(
    (id: number) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'loading' as const } : m)),
      )
      void load(id, true)
    },
    [load],
  )

  /** Adoption d'un roster distant plus récent (synchro de salon). */
  const applyRemoteRoster = useCallback(
    (remote: RosterState) => {
      setRoster(remote)
      applyIds(remote.ids)
    },
    [applyIds],
  )

  return { members, roster, add, remove, refresh, applyRemoteRoster }
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
