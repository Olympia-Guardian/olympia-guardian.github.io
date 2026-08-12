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
// Base d'objets (montures, mascottes, cartes Triple Triad, accessoires)
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
// État partagé : roster et coches manuelles portent un horodatage (t) pour la
// fusion « le plus récent gagne » (LWW) via le salon de synchro. Sans salon,
// l'état voyage encodé dans le lien (#g= roster, #o= coches).
// ---------------------------------------------------------------------------

export interface RosterState {
  ids: number[]
  t: number
}

interface OvEntry {
  ids: number[]
  t: number
}

/** charId → kind → coches manuelles (uniquement cartes / accessoires). */
export type Overrides = Record<number, Partial<Record<Kind, OvEntry>>>

export const MANUAL_KINDS: Kind[] = ['cards', 'fashions', 'orchestrions', 'spells']

export interface RoomDoc {
  v: 1
  roster: RosterState
  overrides: Overrides
}

export function mergeRosterLWW(a: RosterState, b: RosterState | undefined | null): RosterState {
  if (!b) return a
  return b.t > a.t ? b : a
}

export function mergeOverridesLWW(
  a: Overrides,
  b: Overrides | undefined | null,
): Overrides {
  if (!b) return a
  const out: Overrides = {}
  const charIds = new Set([...Object.keys(a), ...Object.keys(b)].map(Number))
  for (const charId of charIds) {
    for (const kind of MANUAL_KINDS) {
      const ea = a[charId]?.[kind]
      const eb = b[charId]?.[kind]
      const winner = !ea ? eb : !eb ? ea : eb.t > ea.t ? eb : ea
      if (winner && (winner.ids.length > 0 || winner.t > 0)) {
        ;(out[charId] ??= {})[kind] = winner
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Hash de l'URL
// ---------------------------------------------------------------------------

/** Met à jour un paramètre du hash sans toucher aux autres (g, o, r). */
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

  const add = useCallback(
    (id: number) => {
      setRoster((prev) =>
        prev.ids.includes(id) ? prev : { ids: [...prev.ids, id], t: Date.now() },
      )
      setMembers((prev) =>
        prev.some((m) => m.id === id) ? prev : [...prev, { id, status: 'loading' as const }],
      )
    },
    [],
  )

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

/** Par membre et par type de collection : Set des IDs possédés (synchro + coches manuelles). */
export function useOwnedSets(
  ready: (Member & { data: Character })[],
  overrides: Overrides = {},
) {
  return useMemo(() => {
    const map = new Map<number, Record<Kind, Set<number>>>()
    for (const m of ready) {
      map.set(
        m.id,
        Object.fromEntries(
          KINDS.map((k) => {
            const set = new Set(m.data[k].ids)
            for (const id of overrides[m.id]?.[k]?.ids ?? []) set.add(id)
            return [k, set]
          }),
        ) as Record<Kind, Set<number>>,
      )
    }
    return map
  }, [ready, overrides])
}

// ---------------------------------------------------------------------------
// Coches manuelles (cartes Triple Triad, accessoires de mode)
// ---------------------------------------------------------------------------

const OVERRIDES_KEY = 'ogs.overrides.v2'
const KIND_CODES: [Kind, string][] = [
  ['cards', 'c'],
  ['fashions', 'f'],
  ['orchestrions', 'o'],
  ['spells', 's'],
]

function toB64url(bytes: ArrayLike<number>): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeBitmap(ids: number[]): string {
  const max = Math.max(...ids)
  const bytes = new Uint8Array(Math.ceil(max / 8))
  for (const id of ids) bytes[(id - 1) >> 3] |= 1 << ((id - 1) & 7)
  return toB64url(bytes)
}

function decodeBitmap(s: string): number[] {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const ids: number[] = []
  for (let i = 0; i < bin.length; i++) {
    const byte = bin.charCodeAt(i)
    for (let bit = 0; bit < 8; bit++) if (byte & (1 << bit)) ids.push(i * 8 + bit + 1)
  }
  return ids
}

function pushVarint(n: number, out: number[]): void {
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80)
    n >>= 7
  }
  out.push(n)
}

/** Encodage par plages (écart varint + longueur varint), préfixé « ! ». */
function encodeRanges(ids: number[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => a - b)
  const bytes: number[] = []
  let pos = 1
  for (let i = 0; i < sorted.length; ) {
    const start = sorted[i]
    let end = start
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i]
    i++
    pushVarint(start - pos, bytes)
    pushVarint(end - start + 1, bytes)
    pos = end + 1
  }
  return '!' + toB64url(bytes)
}

function decodeRanges(s: string): number[] {
  const bin = atob(s.slice(1).replace(/-/g, '+').replace(/_/g, '/'))
  const ids: number[] = []
  let pos = 1
  let i = 0
  const readVarint = () => {
    let n = 0
    let shift = 0
    while (i < bin.length) {
      const b = bin.charCodeAt(i++)
      n |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7
    }
    return n
  }
  while (i < bin.length) {
    pos += readVarint()
    const len = readVarint()
    for (let k = 0; k < len; k++) ids.push(pos + k)
    pos += len
  }
  return ids
}

/** Choisit l'encodage le plus court ; décode les deux formats (liens existants inclus). */
function encodeIds(ids: number[]): string {
  const ranges = encodeRanges(ids)
  const bitmap = encodeBitmap(ids)
  return ranges.length <= bitmap.length ? ranges : bitmap
}

function decodeIds(s: string): number[] {
  try {
    return s.startsWith('!') ? decodeRanges(s) : decodeBitmap(s)
  } catch {
    return []
  }
}

function serializeOverrides(overrides: Overrides, rosterIds: number[]): string {
  const parts: string[] = []
  for (const charId of rosterIds) {
    for (const [kind, code] of KIND_CODES) {
      const entry = overrides[charId]?.[kind]
      if (entry && entry.ids.length > 0) parts.push(`${charId}.${code}.${encodeIds(entry.ids)}`)
    }
  }
  return parts.join('~')
}

function parseHashOverrides(): Overrides {
  const match = location.hash.match(/o=([^&]+)/)
  if (!match) return {}
  const out: Overrides = {}
  for (const part of match[1].split('~')) {
    const [rawId, code, payload] = part.split('.')
    const charId = Number(rawId)
    const kind = KIND_CODES.find(([, c]) => c === code)?.[0]
    if (!Number.isInteger(charId) || !kind || !payload) continue
    const ids = decodeIds(payload)
    if (ids.length > 0) (out[charId] ??= {})[kind] = { ids, t: 1 }
  }
  return out
}

function readStoredOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY)
    if (raw) return JSON.parse(raw) as Overrides
    // migration depuis v1 (tableaux d'ids sans horodatage)
    const old = localStorage.getItem('ogs.overrides.v1')
    if (old) {
      const parsed = JSON.parse(old) as Record<string, Partial<Record<Kind, number[]>>>
      const out: Overrides = {}
      for (const [charId, kinds] of Object.entries(parsed)) {
        for (const [kind, ids] of Object.entries(kinds) as [Kind, number[]][]) {
          if (ids.length > 0) (out[Number(charId)] ??= {})[kind] = { ids, t: 1 }
        }
      }
      return out
    }
  } catch {
    // état vierge
  }
  return {}
}

/** Import initial : union des ids, horodatage le plus récent (liens hérités). */
function importUnion(a: Overrides, b: Overrides): Overrides {
  const out: Overrides = {}
  const charIds = new Set([...Object.keys(a), ...Object.keys(b)].map(Number))
  for (const charId of charIds) {
    for (const kind of MANUAL_KINDS) {
      const ea = a[charId]?.[kind]
      const eb = b[charId]?.[kind]
      if (!ea && !eb) continue
      const ids = [...new Set([...(ea?.ids ?? []), ...(eb?.ids ?? [])])]
      if (ids.length > 0) {
        ;(out[charId] ??= {})[kind] = { ids, t: Math.max(ea?.t ?? 0, eb?.t ?? 0) }
      }
    }
  }
  return out
}

export function useOverrides(rosterIds: number[], hasRoom: boolean) {
  const [overrides, setOverrides] = useState<Overrides>(() =>
    importUnion(readStoredOverrides(), parseHashOverrides()),
  )

  const rosterKey = rosterIds.join('.')
  useEffect(() => {
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides))
    } catch {
      // sans persistance, les coches restent valables pour la session
    }
    setHashParam('o', !hasRoom ? serializeOverrides(overrides, rosterIds) || null : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, rosterKey, hasRoom])

  const toggle = useCallback((charId: number, kind: Kind, itemId: number) => {
    setOverrides((prev) => {
      const current = prev[charId]?.[kind]?.ids ?? []
      const ids = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
      return { ...prev, [charId]: { ...prev[charId], [kind]: { ids, t: Date.now() } } }
    })
  }, [])

  /** Supprime les coches devenues inutiles (l'objet est maintenant synchronisé). */
  const prune = useCallback((ready: (Member & { data: Character })[]) => {
    setOverrides((prev) => {
      let changed = false
      const out: Overrides = { ...prev }
      for (const m of ready) {
        const kinds = out[m.id]
        if (!kinds) continue
        for (const kind of MANUAL_KINDS) {
          const entry = kinds[kind]
          if (!entry) continue
          const synced = new Set(m.data[kind].ids)
          const kept = entry.ids.filter((id) => !synced.has(id))
          if (kept.length !== entry.ids.length) {
            changed = true
            out[m.id] = { ...out[m.id], [kind]: { ids: kept, t: Date.now() } }
          }
        }
      }
      return changed ? out : prev
    })
  }, [])

  /** Adoption du résultat d'une fusion LWW avec le salon. */
  const applyRemoteOverrides = useCallback((merged: Overrides) => {
    setOverrides(merged)
  }, [])

  return { overrides, toggle, prune, applyRemoteOverrides }
}
