// ---------------------------------------------------------------------------
// Groupes — le modèle unique de l'app.
//
// Deux natures :
//  - privé : une liste de persos assemblée pour soi. Vit dans le navigateur
//    (id « loc-… ») tant qu'on n'est pas connecté, monte dans le compte
//    (id « grp-… », shared=0) dès la connexion — et suit alors partout.
//  - synchronisé : en base, partagé par un lien d'invitation (#j=inv-…) dont
//    le code est distinct de l'identité du groupe et révocable. L'adhésion se
//    fait SUR VALIDATION : le clic crée une demande, le créateur approuve,
//    refuse, ou bannit. Avant validation, l'invité ne voit que le nom du
//    groupe et « demande en attente ».
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
  apiGetInvite,
  apiHandleRequest,
  apiListGroups,
  apiPatchGroup,
  apiQuitGroup,
  apiRemoveMember,
  apiRequestJoin,
  apiRotateInvite,
  type ApiGroup,
  type ApiGroupRequest,
  type InviteStatus,
} from './groupsApi'
import { WORKER_API } from './api'
import { readHashParam, setHashParam } from './store'

export interface Group {
  id: string // « loc-… » (navigateur) ou « grp-… » (compte)
  name: string
  shared: boolean
  mine: 'owner' | 'member' | 'guest'
  members: number[]
  /** Code du lien d'invitation — propriétaire uniquement. */
  inviteCode?: string
  /** Demandes d'adhésion en attente — propriétaire uniquement. */
  requests?: ApiGroupRequest[]
}

export interface PendingInvite {
  code: string
  name: string
}

/** Invitation ouverte via #j=… : nom du groupe + statut du visiteur. */
export interface OpenInvite {
  code: string
  name: string
  status: InviteStatus
}

const LOCAL_KEY = 'ogs.localgroups.v1'
const PENDING_KEY = 'ogs.pendinginvites.v1'
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

function readPending(): PendingInvite[] {
  return readJson<PendingInvite[]>(PENDING_KEY, []).filter(
    (p) => p && typeof p.code === 'string' && typeof p.name === 'string',
  )
}

function localToGroup(g: LocalGroup): Group {
  return { id: g.id, name: g.name, shared: false, mine: 'owner', members: g.members }
}

function apiToGroup(g: ApiGroup): Group {
  return {
    id: g.id,
    name: g.name,
    shared: g.shared,
    mine: g.mine,
    members: g.members,
    inviteCode: g.inviteCode,
    requests: g.requests,
  }
}

function newLocalId(): string {
  return 'loc-' + crypto.randomUUID()
}

function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}#j=${code}`
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

export type GroupsController = ReturnType<typeof useGroups>

export function useGroups(token: string | null, verifiedCharIds: number[]) {
  const [locals, setLocals] = useState<LocalGroup[]>(() => {
    ensureMigrated()
    return readLocalGroups()
  })
  const [server, setServer] = useState<ApiGroup[]>([])
  // Demandes d'adhésion envoyées, en attente de validation par les créateurs.
  const [pending, setPending] = useState<PendingInvite[]>(readPending)
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_KEY),
  )
  // Invitation ouverte (#j=…) : pilote le bandeau (demander / en attente / membre).
  const [invite, setInvite] = useState<OpenInvite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const persistLocals = useCallback((next: LocalGroup[]) => {
    setLocals(next)
    writeJson(LOCAL_KEY, next)
  }, [])

  const persistPending = useCallback((next: PendingInvite[]) => {
    setPending(next)
    writeJson(PENDING_KEY, next)
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

  /** Re-vérifie mes demandes en attente ; une acceptation fait apparaître le
   *  groupe, un code mort (rotation, suppression) nettoie l'entrée. */
  const checkPending = useCallback(async () => {
    const list = readPending()
    if (list.length === 0) return
    const keep: PendingInvite[] = []
    let joined = false
    for (const p of list) {
      try {
        const inv = await apiGetInvite(p.code, tokenRef.current)
        if (inv.status === 'member') joined = true
        else keep.push({ code: p.code, name: inv.name })
      } catch {
        // lien mort : on oublie la demande
      }
    }
    if (keep.length !== list.length || joined) persistPending(keep)
    if (joined) await refreshServer()
  }, [persistPending, refreshServer])

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

  // Connexion : les groupes privés locaux montent dans le compte, puis la
  // liste serveur fait foi.
  useEffect(() => {
    if (!token) {
      setServer([])
      return
    }
    void (async () => {
      if (uploadStarted !== token) {
        uploadStarted = token
        const toUpload = readLocalGroups()
        if (toUpload.length > 0) {
          // Idempotence : un vieux navigateur/onglet peut refabriquer le même
          // groupe local à chaque chargement — s'il existe déjà au compte
          // (même nom, mêmes membres), on jette la copie locale sans re-créer.
          let existing: ApiGroup[] = []
          try {
            existing = (await apiListGroups(token)).groups
          } catch {
            uploadStarted = null
            return
          }
          const sig = (name: string, members: number[]) =>
            `${name}|${[...members].sort((a, b) => a - b).join('.')}`
          for (const g of toUpload) {
            const dup = existing.find((x) => sig(x.name, x.members) === sig(g.name, g.members))
            try {
              const target = dup ?? (await apiCreateGroup(token, g.name, g.members))
              if (!dup) existing.push(target as ApiGroup)
              const rest = readLocalGroups().filter((x) => x.id !== g.id)
              writeJson(LOCAL_KEY, rest)
              setLocals(rest)
              if (localStorage.getItem(ACTIVE_KEY) === g.id) setActive(target.id)
            } catch {
              // on garde la copie locale, retentée à la prochaine connexion
              uploadStarted = null
            }
          }
        }
      }
      await refreshServer()
      await checkPending()
    })()
  }, [token, refreshServer, checkPending, setActive])

  // Invitation #j=… : on affiche le bandeau selon le statut du visiteur.
  useEffect(() => {
    const code = readHashParam('j')
    if (!code) return
    setHashParam('j', null)
    if (!/^([a-z0-9]{10,20}|inv-[\w-]{10,80})$/.test(code) || code.startsWith('grp-')) {
      // ancien format (#j=grp-…) ou lien corrompu
      setError('invite')
      return
    }
    void (async () => {
      try {
        const inv = await apiGetInvite(code, tokenRef.current)
        setInvite({ code, name: inv.name, status: inv.status })
        if (inv.status === 'pending') {
          const list = readPending()
          if (!list.some((p) => p.code === code))
            persistPending([...list, { code, name: inv.name }])
        }
        if (inv.status === 'member') void refreshServer()
      } catch {
        setError('invite')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sans compte : vérifier quand même les demandes en attente au chargement
  // (elles ont pu être acceptées depuis un autre appareil… ou expirer).
  useEffect(() => {
    if (!token) void checkPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rafraîchissement périodique : liste du compte + demandes en attente.
  useEffect(() => {
    const timer = setInterval(() => {
      if (tokenRef.current) void refreshServer()
      void checkPending()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refreshServer, checkPending])

  // ---------------------------------------------------------------- lecture

  const groups: Group[] = [...server.map(apiToGroup), ...locals.map(localToGroup)]
  const active = groups.find((g) => g.id === activeId) ?? groups[0] ?? null

  // --------------------------------------------------------------- écritures

  /** Crée un groupe. Offline (défaut) : compte si connecté, navigateur sinon.
   *  Online (shared) : en base avec code d'invitation — connexion requise. */
  const create = useCallback(
    async (name: string, members: number[] = [], online = false): Promise<string> => {
      if (online && !tokenRef.current) throw new Error('login required')
      if (tokenRef.current) {
        const g = await apiCreateGroup(tokenRef.current, name, members, online)
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

  /** Supprime (créateur) ou quitte (membre) un groupe. */
  const drop = useCallback(
    async (id: string) => {
      if (id.startsWith('loc-')) {
        persistLocals(readLocalGroups().filter((g) => g.id !== id))
      } else if (tokenRef.current) {
        const g = server.find((x) => x.id === id)
        if (g?.mine === 'owner') await apiDeleteGroup(tokenRef.current, id)
        else await apiQuitGroup(tokenRef.current, id)
        setServer((prev) => prev.filter((x) => x.id !== id))
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
        setServer((prev) => prev.map((x) => (x.id === id ? { ...x, ...g } : x)))
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
        setServer((prev) => prev.map((x) => (x.id === id ? { ...x, ...g } : x)))
      }
    },
    [persistLocals],
  )

  /** « Inviter » : rend le lien d'invitation d'un groupe online. Le type se
   *  choisit à la création — un groupe offline ne se partage pas. */
  const share = useCallback(
    async (id: string): Promise<string> => {
      const existing = server.find((x) => x.id === id)
      if (!existing?.shared || !existing.inviteCode) throw new Error('offline group')
      return inviteLink(existing.inviteCode)
    },
    [server],
  )

  /** Régénère le code d'invitation — l'ancien lien meurt immédiatement. */
  const rotateInvite = useCallback(
    async (id: string): Promise<string> => {
      if (!tokenRef.current) throw new Error('login required')
      const { inviteCode } = await apiRotateInvite(tokenRef.current, id)
      setServer((prev) => prev.map((x) => (x.id === id ? { ...x, inviteCode } : x)))
      return inviteLink(inviteCode)
    },
    [],
  )

  /** Demande d'adhésion (bandeau d'invitation) avec un perso vérifié. */
  const requestJoin = useCallback(
    async (code: string, charId: number) => {
      if (!tokenRef.current) throw new Error('login required')
      const res = await apiRequestJoin(tokenRef.current, code, charId)
      if (res.status === 'member') {
        // Déjà validé (ou re-demande d'un membre) : le groupe est accessible.
        persistPending(readPending().filter((p) => p.code !== code))
        setInvite((prev) => (prev && prev.code === code ? { ...prev, status: 'member' } : prev))
        await refreshServer()
      } else {
        setInvite((prev) => (prev && prev.code === code ? { ...prev, status: 'pending' } : prev))
        const list = readPending()
        const name = invite?.name ?? ''
        if (!list.some((p) => p.code === code)) persistPending([...list, { code, name }])
      }
    },
    [invite, persistPending, refreshServer],
  )

  /** Traitement d'une demande par le créateur. */
  const handleRequest = useCallback(
    async (groupId: string, userId: string, action: 'approve' | 'reject' | 'ban') => {
      if (!tokenRef.current) return
      await apiHandleRequest(tokenRef.current, groupId, userId, action)
      await refreshServer()
    },
    [refreshServer],
  )

  return {
    groups,
    active,
    activeId: active?.id ?? null,
    pending,
    invite,
    dismissInvite: () => setInvite(null),
    error,
    dismissError: () => setError(null),
    setActive,
    create,
    rename,
    drop,
    addMember,
    removeMember,
    share,
    rotateInvite,
    requestJoin,
    handleRequest,
    verifiedCharIds,
    refreshServer,
  }
}
