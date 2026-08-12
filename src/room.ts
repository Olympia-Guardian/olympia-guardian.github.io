import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { mergeRosterLWW, setHashParam, type RoomDoc, type RosterState } from './store'

// ---------------------------------------------------------------------------
// Salon de synchro : un document JSON stocké par notre worker Cloudflare
// (worker/index.js, D1), adressé par un ID que l'app choisit. Il ne transporte
// que le roster (les possessions viennent toutes de FFXIV Collect).
//  - POST crée ou écrase le salon → recréable à l'identique par n'importe quel
//    membre : le lien du groupe ne meurt jamais ;
//  - POST en text/plain = « simple request » CORS, pas de preflight ;
//  - l'ID (un UUID) fait office de secret du groupe.
// Les salons historiques hébergés sur textdb.dev sont migrés au premier accès.
// ---------------------------------------------------------------------------

const ROOM_API = 'https://ogs-room.olympia-guardian.workers.dev/room/'
const LEGACY_API = 'https://textdb.dev/api/data/'
const POLL_MS = 90_000
const PUSH_DEBOUNCE_MS = 1_500

export function newRoomId(): string {
  return 'ogs-' + crypto.randomUUID()
}

function parseDoc(text: string): RoomDoc | null {
  try {
    const doc = JSON.parse(text)
    if (doc && doc.v === 1 && doc.roster) return doc as RoomDoc
    return null
  } catch {
    return null
  }
}

async function fetchRoom(roomId: string): Promise<RoomDoc | null> {
  const res = await fetch(ROOM_API + roomId, { cache: 'no-store' })
  if (res.status === 404) {
    // Salon inconnu du worker : peut-être un ancien salon textdb → migration
    // transparente (le doc retourné sera poussé vers le worker par sync()).
    try {
      const legacy = await fetch(LEGACY_API + roomId, { cache: 'no-store' })
      if (legacy.ok) {
        const doc = parseDoc(await legacy.text())
        if (doc) return doc
      }
    } catch {
      // pas d'ancien salon
    }
    return null
  }
  if (!res.ok) throw new Error(`salon injoignable (${res.status})`)
  return parseDoc(await res.text())
}

async function pushRoom(roomId: string, doc: RoomDoc): Promise<void> {
  const res = await fetch(ROOM_API + roomId, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(doc),
  })
  if (!res.ok) throw new Error(`écriture du salon refusée (${res.status})`)
}

export type RoomStatus = 'off' | 'sync' | 'ok' | 'error'

export interface LocalState {
  roster: RosterState
}

export function useRoom(
  roomId: string | null,
  setRoomId: (id: string | null) => void,
  stateRef: MutableRefObject<LocalState>,
  applyRoster: (r: RosterState) => void,
) {
  const [status, setStatus] = useState<RoomStatus>(roomId ? 'sync' : 'off')
  const [lastSync, setLastSync] = useState<number | null>(null)
  const syncing = useRef(false)

  // Le hash reflète le salon ; g= est retiré par le hook roster (hasRoom).
  useEffect(() => {
    setHashParam('r', roomId)
    if (!roomId) setStatus('off')
  }, [roomId])

  const sync = useCallback(async () => {
    const id = roomId
    if (!id || syncing.current) return
    syncing.current = true
    setStatus('sync')
    try {
      const remote = await fetchRoom(id)
      const local = stateRef.current
      const mergedRoster = mergeRosterLWW(local.roster, remote?.roster)
      if (JSON.stringify(mergedRoster) !== JSON.stringify(local.roster)) {
        applyRoster(mergedRoster)
      }
      const doc: RoomDoc = { v: 1, roster: mergedRoster }
      const remoteStr = remote ? JSON.stringify({ v: 1, roster: remote.roster }) : ''
      if (JSON.stringify(doc) !== remoteStr) {
        await pushRoom(id, doc)
      }
      setStatus('ok')
      setLastSync(Date.now())
    } catch {
      setStatus('error')
    } finally {
      syncing.current = false
    }
  }, [roomId, stateRef, applyRoster])

  // Synchro : à l'ouverture, au retour sur l'onglet, et à intervalle régulier.
  useEffect(() => {
    if (!roomId) return
    void sync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void sync()
    }, POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [roomId, sync])

  /** À appeler quand l'état local change : pousse (avec fusion) après un court délai. */
  const schedulePush = useCallback(() => {
    if (!roomId) return
    const handle = setTimeout(() => void sync(), PUSH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [roomId, sync])

  const enable = useCallback(() => {
    setRoomId(newRoomId())
  }, [setRoomId])

  const disable = useCallback(() => {
    setRoomId(null)
  }, [setRoomId])

  return { status, lastSync, enable, disable, schedulePush }
}
