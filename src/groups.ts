// ---------------------------------------------------------------------------
// Groupes — le modèle unique de l'app.
//
// Deux natures :
//  - privé : une liste de persos assemblée pour soi. Vit dans le navigateur
//    (id « loc-… ») tant qu'on n'est pas connecté, monte dans le compte
//    (id « grp-… », shared=0) dès la connexion — et suit alors partout.
//  - synchronisé : en base, partagé par lien d'invitation (#j=grp-…). Le
//    créateur gère tout ; un membre connecté rejoint avec son perso vérifié
//    et peut se retirer ; quiconque a le lien regarde.
//
// Un groupe privé devient synchronisé au premier clic sur « Inviter ».
// Anciens formats (r=salon, g=ids en dur, registre ogs.groups.v1) : convertis
// en groupes à la volée au premier chargement.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiAddMember,
  apiCreateGroup,
  apiDeleteGroup,
  apiGetGroup,
  apiJoinGroup,
  apiListGroups,
  apiPatchGroup,
  apiQuitGroup,
  apiRemoveMember,
  type ApiGroup,
} from './groupsApi'
import { WORKER_API } from './api'
import { readHashParam, setHashParam } from './store'

export interface Group {
  id: string // « loc-… » (navigateur) ou « grp-… » (compte)
  name: string
  shared: boolean
  mine: 'owner' | 'member' | 'guest'
  members: number[]
}

const LOCAL_KEY = 'ogs.localgroups.v1'
const FOLLOWED_KEY = 'ogs.followed.v1'
const ACTIVE_KEY = 'ogs.activegroup.v1'
// Anciens formats
const LEGACY_GROUPS_KEY = 'ogs.groups.v1'
const LEGACY_ROSTER_KEY = 'ogs.roster.v2'

const POLL_MS = 90_000

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // pas de persistance, tant pis
  }
}

type LocalGroup = { id: string; name: string; members: number[] }

function readLocalGroups(): LocalGroup[] {
  return readJson<LocalGroup[]>(LOCAL_KEY, []).filter(
    (g) => g && typeof g.id === 'string' && typeof g.name === 'string' && Array.isArray(g.members),
  )
}

function localToGroup(g: LocalGroup): Group {
  return { id: g.id, name: g.name, shared: false, mine: 'owner', members: g.members }
}

function apiToGroup(g: ApiGroup): Group {
  return { id: g.id, name: g.name, shared: g.shared, mine: g.mine, members: g.members }
}

function newLocalId(): string {
  return 'loc-' + crypto.randomUUID()
}

// ------------------------------------------------------ migration des legacy

type LegacySaved = { name: string; hash: string }

/** Migration synchrone : registre g=…, roster courant → groupes privés. Les
 *  salons r=… demandent un fetch : on renvoie la liste à convertir en asynchrone. */
function migrateLegacySync(): { rooms: { name: string; roomId: string }[] } {
  const rooms: { name: string; roomId: string }[] = []
  const legacy = readJson<LegacySaved[]>(LEGACY_GROUPS_KEY, [])
  const locals = readLocalGroups()
  const roster = readJson<{ ids?: number[] }>(LEGACY_ROSTER_KEY, {})
  const rosterIds = (roster.ids ?? []).filter((n) => Number.isInteger(n) && n > 0)
  const hashRoom = (location.hash.match(/[#&]r=(ogs-[\w-]{10,80})/) ?? [])[1]
  const hashIds = ((location.hash.match(/[#&]g=([\d.]+)/) ?? [])[1] ?? '')
    .split('.')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)

  if (legacy.length === 0 && rosterIds.length === 0 && !hashRoom && hashIds.length === 0)
    return { rooms }

  for (const g of legacy) {
    const staticIds = g.hash.match(/^g=([\d.]+)$/)
    const room = g.hash.match(/^r=(ogs-[\w-]{10,80})$/)
    if (staticIds) {
      const ids = staticIds[1]
        .split('.')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
      locals.push({ id: newLocalId(), name: g.name, members: ids })
    } else if (room) {
      rooms.push({ name: g.name, roomId: room[1] })
    }
  }

  // Le roster actif (hors registre) devient « Mon groupe » — sauf s'il vient
  // d'un salon, auquel cas la conversion asynchrone du salon s'en charge.
  // Un vieux lien #g=id1.id2 reçu en marque-page compte comme roster.
  const ids = [...new Set([...rosterIds, ...hashIds])]
  if (hashRoom && !rooms.some((r) => r.roomId === hashRoom)) {
    rooms.push({ name: 'Mon groupe', roomId: hashRoom })
  } else if (!hashRoom && ids.length > 0) {
    if (!locals.some((l) => l.members.join('.') === ids.join('.'))) {
      locals.push({ id: newLocalId(), name: 'Mon groupe', members: ids })
    }
  }

  writeJson(LOCAL_KEY, locals)
  try {
    localStorage.removeItem(LEGACY_GROUPS_KEY)
    localStorage.removeItem(LEGACY_ROSTER_KEY)
  } catch {
    // au pire ils seront re-migrés (idempotent grâce au test de doublon)
  }
  return { rooms }
}

/** Conversion asynchrone d'un ancien salon : on lit son roster une dernière
 *  fois et il devient un groupe privé local (montera au compte à la connexion). */
async function convertLegacyRoom(name: string, roomId: string): Promise<LocalGroup | null> {
  try {
    const res = await fetch(`${WORKER_API}/room/${roomId}`, { cache: 'no-store' })
    if (!res.ok) return null
    const doc = await res.json()
    const ids = (doc?.roster?.ids ?? []).filter((n: unknown) => Number.isInteger(n))
    return { id: newLocalId(), name, members: ids }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------- le hook

// Garde-fous StrictMode/multi-rendus : ces opérations ne tournent qu'une fois.
let migrationDone = false
let pendingRooms: { name: string; roomId: string }[] = []
let roomConversionStarted = false
let uploadStarted: string | null = null

function ensureMigrated(): void {
  if (migrationDone) return
  migrationDone = true
  pendingRooms = migrateLegacySync().rooms
}

export function useGroups(token: string | null, verifiedCharIds: number[]) {
  const [locals, setLocals] = useState<LocalGroup[]>(() => {
    ensureMigrated()
    return readLocalGroups()
  })
  const [server, setServer] = useState<ApiGroup[]>([])
  const [followed, setFollowed] = useState<ApiGroup[]>([])
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_KEY),
  )
  // Invitation en cours (#j=…) : bandeau « rejoindre avec son perso »
  const [invite, setInvite] = useState<ApiGroup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const persistLocals = useCallback((next: LocalGroup[]) => {
    setLocals(next)
    writeJson(LOCAL_KEY, next)
  }, [])

  const setActive = useCallback((id: string | null) => {
    setActiveId(id)
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id)
      else localStorage.removeItem(ACTIVE_KEY)
    } catch {
      // tant pis
    }
    // Changer de groupe remet la vue « groupe entier » et la présence à zéro.
    try {
      localStorage.removeItem('ogs.absent.v1')
      localStorage.removeItem('ogs.focus.v1')
    } catch {
      // idem
    }
  }, [])

  const refreshServer = useCallback(async () => {
    const tok = tokenRef.current
    if (!tok) return
    try {
      const { groups } = await apiListGroups(tok)
      setServer(groups)
    } catch {
      // hors-ligne / jeton périmé : on garde l'état courant
    }
  }, [])

  // Conversion des anciens salons (une fois par session)
  useEffect(() => {
    if (roomConversionStarted) return
    roomConversionStarted = true
    const rooms = pendingRooms
    if (rooms.length === 0) return
    void (async () => {
      const converted: LocalGroup[] = []
      for (const r of rooms) {
        const g = await convertLegacyRoom(r.name, r.roomId)
        if (g) converted.push(g)
      }
      if (converted.length > 0) {
        const next = [...readLocalGroups(), ...converted]
        persistLocals(next)
        setHashParam('r', null)
        setHashParam('g', null)
        if (!localStorage.getItem(ACTIVE_KEY)) setActive(converted[0].id)
      }
    })()
  }, [persistLocals, setActive])

  // Connexion : les groupes privés locaux montent dans le compte, les groupes
  // suivis en invité sont rattachés, puis la liste serveur fait foi.
  useEffect(() => {
    if (!token) {
      setServer([])
      return
    }
    void (async () => {
      if (uploadStarted !== token) {
        uploadStarted = token
        const toUpload = readLocalGroups()
        for (const g of toUpload) {
          try {
            const created = await apiCreateGroup(token, g.name, g.members)
            const rest = readLocalGroups().filter((x) => x.id !== g.id)
            writeJson(LOCAL_KEY, rest)
            setLocals(rest)
            if (localStorage.getItem(ACTIVE_KEY) === g.id) setActive(created.id)
          } catch {
            // on garde la copie locale, retentée à la prochaine connexion
            uploadStarted = null
          }
        }
        const followedIds = readJson<string[]>(FOLLOWED_KEY, [])
        for (const id of followedIds) {
          try {
            await apiJoinGroup(token, id)
          } catch {
            // groupe disparu : on l'oublie
          }
        }
        writeJson(FOLLOWED_KEY, [])
        setFollowed([])
      }
      await refreshServer()
    })()
  }, [token, refreshServer, setActive])

  // Invitation #j=… : le groupe s'ajoute à la liste, on bascule dessus.
  useEffect(() => {
    const id = readHashParam('j')
    if (!id || !/^grp-[\w-]{10,80}$/.test(id)) return
    setHashParam('j', null)
    void (async () => {
      try {
        const g = await apiGetGroup(id, tokenRef.current)
        if (tokenRef.current) {
          await apiJoinGroup(tokenRef.current, id)
          await refreshServer()
        } else {
          const ids = readJson<string[]>(FOLLOWED_KEY, [])
          if (!ids.includes(id)) writeJson(FOLLOWED_KEY, [...ids, id])
          setFollowed((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, g]))
        }
        setActive(id)
        setInvite(g)
      } catch {
        setError('invite')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Groupes suivis en invité (sans compte) : lecture au chargement.
  useEffect(() => {
    if (token) return
    const ids = readJson<string[]>(FOLLOWED_KEY, [])
    if (ids.length === 0) return
    void (async () => {
      const found: ApiGroup[] = []
      const alive: string[] = []
      for (const id of ids) {
        try {
          found.push(await apiGetGroup(id, null))
          alive.push(id)
        } catch {
          // groupe supprimé
        }
      }
      writeJson(FOLLOWED_KEY, alive)
      setFollowed(found)
    })()
  }, [token])

  // Rafraîchissement périodique : la liste du compte, ou le groupe suivi actif.
  useEffect(() => {
    const timer = setInterval(() => {
      if (tokenRef.current) void refreshServer()
      else {
        const ids = readJson<string[]>(FOLLOWED_KEY, [])
        for (const id of ids) {
          void apiGetGroup(id, null)
            .then((g) => setFollowed((prev) => prev.map((x) => (x.id === g.id ? g : x))))
            .catch(() => undefined)
        }
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refreshServer])

  // ---------------------------------------------------------------- lecture

  const groups: Group[] = [
    ...server.map(apiToGroup),
    ...followed.filter((f) => !server.some((s) => s.id === f.id)).map(apiToGroup),
    ...locals.map(localToGroup),
  ]
  const active = groups.find((g) => g.id === activeId) ?? groups[0] ?? null

  // --------------------------------------------------------------- écritures

  /** Crée un groupe privé (compte si connecté, navigateur sinon). */
  const create = useCallback(
    async (name: string, members: number[] = []): Promise<string> => {
      if (tokenRef.current) {
        const g = await apiCreateGroup(tokenRef.current, name, members)
        setServer((prev) => [...prev, g])
        setActive(g.id)
        return g.id
      }
      const g: LocalGroup = { id: newLocalId(), name, members }
      persistLocals([...readLocalGroups(), g])
      setActive(g.id)
      return g.id
    },
    [persistLocals, setActive],
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      if (id.startsWith('loc-')) {
        persistLocals(readLocalGroups().map((g) => (g.id === id ? { ...g, name } : g)))
      } else if (tokenRef.current) {
        const g = await apiPatchGroup(tokenRef.current, id, { name })
        setServer((prev) => prev.map((x) => (x.id === id ? g : x)))
      }
    },
    [persistLocals],
  )

  /** Supprime (créateur) ou quitte (membre/invité) un groupe. */
  const drop = useCallback(
    async (id: string) => {
      if (id.startsWith('loc-')) {
        persistLocals(readLocalGroups().filter((g) => g.id !== id))
      } else if (tokenRef.current) {
        const g = server.find((x) => x.id === id)
        if (g?.mine === 'owner') await apiDeleteGroup(tokenRef.current, id)
        else await apiQuitGroup(tokenRef.current, id)
        setServer((prev) => prev.filter((x) => x.id !== id))
      } else {
        writeJson(
          FOLLOWED_KEY,
          readJson<string[]>(FOLLOWED_KEY, []).filter((x) => x !== id),
        )
        setFollowed((prev) => prev.filter((x) => x.id !== id))
      }
      if (localStorage.getItem(ACTIVE_KEY) === id) setActive(null)
    },
    [persistLocals, server, setActive],
  )

  const addMember = useCallback(
    async (id: string, charId: number) => {
      if (id.startsWith('loc-')) {
        persistLocals(
          readLocalGroups().map((g) =>
            g.id === id && !g.members.includes(charId)
              ? { ...g, members: [...g.members, charId] }
              : g,
          ),
        )
      } else if (tokenRef.current) {
        const g = await apiAddMember(tokenRef.current, id, charId)
        setServer((prev) => prev.map((x) => (x.id === id ? g : x)))
      }
    },
    [persistLocals],
  )

  const removeMember = useCallback(
    async (id: string, charId: number) => {
      if (id.startsWith('loc-')) {
        persistLocals(
          readLocalGroups().map((g) =>
            g.id === id ? { ...g, members: g.members.filter((m) => m !== charId) } : g,
          ),
        )
      } else if (tokenRef.current) {
        const g = await apiRemoveMember(tokenRef.current, id, charId)
        setServer((prev) => prev.map((x) => (x.id === id ? g : x)))
      }
    },
    [persistLocals],
  )

  /** « Inviter » : convertit si besoin (privé → synchronisé) et rend le lien.
   *  Nécessite d'être connecté — l'appelant gère le cas contraire. */
  const share = useCallback(
    async (id: string): Promise<string> => {
      const tok = tokenRef.current
      if (!tok) throw new Error('login required')
      let gid = id
      if (id.startsWith('loc-')) {
        const local = readLocalGroups().find((g) => g.id === id)
        if (!local) throw new Error('no such group')
        const created = await apiCreateGroup(tok, local.name, local.members, true)
        persistLocals(readLocalGroups().filter((g) => g.id !== id))
        setServer((prev) => [...prev, created])
        gid = created.id
        setActive(gid)
      } else {
        const g = await apiPatchGroup(tok, id, { shared: true })
        setServer((prev) => prev.map((x) => (x.id === id ? g : x)))
      }
      return `${location.origin}${location.pathname}#j=${gid}`
    },
    [persistLocals, setActive],
  )

  /** Rejoindre le groupe actif avec un de ses persos vérifiés. */
  const joinWithChar = useCallback(
    async (id: string, charId: number) => {
      if (!tokenRef.current) throw new Error('login required')
      const g = await apiJoinGroup(tokenRef.current, id, charId)
      setServer((prev) => (prev.some((x) => x.id === id) ? prev.map((x) => (x.id === id ? g : x)) : [...prev, g]))
      setInvite(null)
    },
    [],
  )

  /** Persos vérifiés de l'utilisateur absents du groupe actif (pour le bandeau). */
  const joinableChars = active?.shared
    ? verifiedCharIds.filter((c) => !active.members.includes(c))
    : []

  return {
    groups,
    active,
    activeId: active?.id ?? null,
    invite,
    dismissInvite: () => setInvite(null),
    error,
    setActive,
    create,
    rename,
    drop,
    addMember,
    removeMember,
    share,
    joinWithChar,
    joinableChars,
    refreshServer,
  }
}
