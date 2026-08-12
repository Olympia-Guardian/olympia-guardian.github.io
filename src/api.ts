// Client de l'API publique FFXIV Collect (https://ffxivcollect.com)
// CORS ouvert → tout tourne dans le navigateur, aucun serveur nécessaire.

const API = 'https://ffxivcollect.com/api'

export type Kind = 'mounts' | 'minions' | 'cards' | 'fashions' | 'orchestrions' | 'spells'

export const KINDS: Kind[] = ['mounts', 'minions', 'cards', 'fashions', 'orchestrions', 'spells']

export const KIND_INFO: Record<Kind, { path: string }> = {
  mounts: { path: 'mounts' },
  minions: { path: 'minions' },
  cards: { path: 'triad/cards' },
  fashions: { path: 'fashions' },
  orchestrions: { path: 'orchestrions' },
  spells: { path: 'spells' },
}

export interface Source {
  type: string
  /** Texte français (affichage). */
  text: string
  /** Texte anglais (stable, sert aux heuristiques solo/groupe). */
  textEn: string
}

export interface Item {
  id: number
  /** Nom français (affichage). */
  name: string
  /** Nom anglais (recherche, les habitués des outils communautaires les connaissent). */
  nameEn: string
  icon: string
  /** Grande image (fiche objet). */
  image: string
  description: string
  descriptionEn: string
  patch: string
  order: number
  tradeable: boolean
  ownedPct: string
  /** type = enum anglais stable de l'API (la logique de catégories s'appuie dessus) ; text = français. */
  sources: Source[]
}

export interface CharCollection {
  count: number
  total: number
  isPublic: boolean
  ids: number[]
}

export interface Character {
  id: number
  name: string
  server: string
  dataCenter: string
  avatar: string
  portrait: string
  lastParsed: string
  mounts: CharCollection
  minions: CharCollection
  cards: CharCollection
  fashions: CharCollection
  orchestrions: CharCollection
  spells: CharCollection
  /** IDs de reliques possédées, toutes catégories confondues (armes, ultimate, armures, outils). */
  relicIds: number[]
}

const DB_TTL = 24 * 3600 * 1000 // la base d'objets bouge à chaque patch, pas plus
// Court : quelqu'un qui vient de cocher son profil FFXIV Collect doit voir le
// résultat au prochain chargement sans chercher le bouton ↻.
const CHAR_TTL = 1 * 3600 * 1000

interface Cached<T> {
  at: number
  data: T
}

function readCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached<T>
    if (Date.now() - parsed.at > ttl) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data } satisfies Cached<T>))
  } catch {
    // localStorage plein ou indisponible : on continue sans cache
  }
}

export async function fetchDb(kind: Kind, force = false): Promise<Item[]> {
  // v2 : l'API localise AUSSI les types de sources avec language=fr, ce qui
  // cassait les catégories → on fusionne EN (types stables) + FR (noms).
  // v3 : ajout de sources[].textEn pour les heuristiques solo/groupe.
  // v4 : image + description pour la fiche objet.
  const cacheKey = `ogs.db.${kind}.v4`
  if (!force) {
    const cached = readCache<Item[]>(cacheKey, DB_TTL)
    if (cached) return cached
  }
  // Nos fichiers statiques d'abord (rafraîchis chaque nuit par GitHub Actions) :
  // FFXIV Collect n'est sollicité en direct qu'en secours.
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${kind}.json`)
    if (res.ok) {
      const items = (await res.json()) as Item[]
      if (Array.isArray(items) && items.length > 0) {
        writeCache(cacheKey, items)
        return items
      }
    }
  } catch {
    // secours API en direct
  }
  const path = KIND_INFO[kind].path
  const [resEn, resFr] = await Promise.all([
    fetch(`${API}/${path}?limit=1000`),
    fetch(`${API}/${path}?limit=1000&language=fr`),
  ])
  if (!resEn.ok || !resFr.ok) {
    throw new Error(`FFXIV Collect a répondu ${resEn.status}/${resFr.status} pour la liste des ${kind}`)
  }
  const [jsonEn, jsonFr] = await Promise.all([resEn.json(), resFr.json()])
  const frById = new Map<number, any>((jsonFr.results as any[]).map((r) => [r.id, r]))
  const items: Item[] = (jsonEn.results as any[]).map((r) => {
    const fr = frById.get(r.id)
    const sourcesEn = (r.sources ?? []) as any[]
    const sourcesFr = (fr?.sources ?? []) as any[]
    return {
      id: r.id,
      name: fr?.name ?? r.name,
      nameEn: r.name,
      icon: r.icon,
      image: r.image ?? r.icon,
      description: fr?.description ?? r.description ?? '',
      descriptionEn: r.description ?? '',
      patch: r.patch,
      order: r.order ?? 0,
      tradeable: !!r.tradeable,
      ownedPct: r.owned ?? '',
      sources: sourcesEn.map((s, i) => ({
        type: s.type,
        text: sourcesFr[i]?.text ?? s.text,
        textEn: s.text,
      })),
    }
  })
  writeCache(cacheKey, items)
  return items
}

/** Worker OGS : personnages lus directement sur le Lodestone, stockés en D1. */
export const WORKER_API = 'https://ogs-room.olympia-guardian.workers.dev'

function mapCharacter(r: any): Character {
  const col = (c: any): CharCollection => ({
    count: c?.count ?? 0,
    total: c?.total ?? 0,
    isPublic: c?.public !== false,
    ids: (c?.ids ?? []) as number[],
  })
  return {
    id: r.id,
    name: r.name,
    server: r.server,
    dataCenter: r.data_center,
    avatar: r.avatar,
    portrait: r.portrait,
    lastParsed: r.last_parsed,
    mounts: col(r.mounts),
    minions: col(r.minions),
    cards: col(r.cards),
    fashions: col(r.fashions),
    orchestrions: col(r.orchestrions),
    spells: col(r.spells),
    relicIds:
      (r.relicIds as number[] | undefined) ??
      [
        ...new Set<number>(
          (['weapons', 'ultimate', 'armor', 'tools'] as const).flatMap(
            (g) => (r.relics?.[g]?.ids ?? []) as number[],
          ),
        ),
      ],
  }
}

/** Amorçage des collections invisibles du Lodestone : le WAF de FFXIV Collect
 *  bloque notre worker, c'est donc le navigateur qui fait le pont, une seule
 *  fois par perso. Ensuite ces données vivent chez nous (D1). */
async function seedFromCollect(lodestoneId: number): Promise<void> {
  const res = await fetch(`${API}/characters/${lodestoneId}?ids=true`)
  if (!res.ok) return
  const d = await res.json()
  const seed = {
    cards: d.cards?.ids ?? [],
    fashions: d.fashions?.ids ?? [],
    orchestrions: d.orchestrions?.ids ?? [],
    spells: d.spells?.ids ?? [],
    relics: [
      ...new Set<number>(
        (['weapons', 'ultimate', 'armor', 'tools'] as const).flatMap(
          (g) => (d.relics?.[g]?.ids ?? []) as number[],
        ),
      ),
    ],
  }
  await fetch(`${WORKER_API}/character/${lodestoneId}/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(seed),
  })
}

export async function fetchCharacter(lodestoneId: number, force = false): Promise<Character> {
  // v5 : les personnages viennent de notre worker (Lodestone en direct)
  const cacheKey = `ogs.char.${lodestoneId}.v5`
  if (!force) {
    const cached = readCache<Character>(cacheKey, CHAR_TTL)
    if (cached) return cached
  }

  try {
    const url = `${WORKER_API}/character/${lodestoneId}${force ? '?force=1' : ''}`
    let res = await fetch(url)
    if (res.status === 404) {
      throw Object.assign(new Error("Personnage introuvable — vérifie l'ID Lodestone."), {
        notFound: true,
      })
    }
    if (!res.ok) throw new Error(`worker ${res.status}`)
    let r = await res.json()
    if (r.needsSeed) {
      try {
        await seedFromCollect(lodestoneId)
        const res2 = await fetch(`${WORKER_API}/character/${lodestoneId}`)
        if (res2.ok) r = await res2.json()
      } catch {
        // pas d'amorçage possible : données Lodestone uniquement pour l'instant
      }
    }
    const char = mapCharacter(r)
    writeCache(cacheKey, char)
    return char
  } catch (e) {
    if ((e as any)?.notFound) throw e
    // Secours : FFXIV Collect en direct si le worker est injoignable.
    const res = await fetch(`${API}/characters/${lodestoneId}?ids=true`)
    if (res.status === 404) {
      throw new Error("Personnage introuvable — vérifie l'ID Lodestone.")
    }
    if (!res.ok) throw new Error(`FFXIV Collect a répondu ${res.status}`)
    const char = mapCharacter(await res.json())
    writeCache(cacheKey, char)
    return char
  }
}

// ---------------------------------------------------------------------------
// Reliques : chaque ÉTAPE de chaque job est une entrée distincte, regroupée en
// séries (« Phantom Weapons »…). L'étape se déduit de l'ordre : les entrées
// sont triées étape par étape (stepIndex = ceil(order / jobs)).
// ---------------------------------------------------------------------------

export interface Relic {
  id: number
  name: string
  nameEn: string
  icon: string
  order: number
  /** Clé de série = nom anglais stable. */
  series: string
}

export interface RelicSeriesInfo {
  key: string
  /** Nom localisé (français). */
  name: string
  category: string
  jobs: number
  order: number
  expansion: number
  total: number
}

export interface RelicDb {
  series: RelicSeriesInfo[]
  relics: Relic[]
}

export async function fetchRelicDb(force = false): Promise<RelicDb> {
  const cacheKey = 'ogs.db.relics.v1'
  if (!force) {
    const cached = readCache<RelicDb>(cacheKey, DB_TTL)
    if (cached) return cached
  }
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/relics.json`)
    if (res.ok) {
      const db = (await res.json()) as RelicDb
      if (db?.relics?.length > 0) {
        writeCache(cacheKey, db)
        return db
      }
    }
  } catch {
    // secours API en direct
  }
  const [resEn, resFr] = await Promise.all([
    fetch(`${API}/relics?limit=3000`),
    fetch(`${API}/relics?limit=3000&language=fr`),
  ])
  if (!resEn.ok || !resFr.ok) {
    throw new Error(`FFXIV Collect a répondu ${resEn.status}/${resFr.status} pour les reliques`)
  }
  const [jsonEn, jsonFr] = await Promise.all([resEn.json(), resFr.json()])
  const frById = new Map<number, any>((jsonFr.results as any[]).map((r) => [r.id, r]))
  const seriesMap = new Map<string, RelicSeriesInfo>()
  const relics: Relic[] = (jsonEn.results as any[]).map((r) => {
    const fr = frById.get(r.id)
    const key = r.type.name as string
    if (!seriesMap.has(key)) {
      seriesMap.set(key, {
        key,
        name: fr?.type?.name ?? key,
        category: r.type.category,
        jobs: r.type.jobs,
        order: r.type.order ?? 0,
        expansion: r.type.expansion ?? 0,
        total: 0,
      })
    }
    seriesMap.get(key)!.total++
    return {
      id: r.id,
      name: fr?.name ?? r.name,
      nameEn: r.name,
      icon: r.icon,
      order: r.order ?? 0,
      series: key,
    }
  })
  const db: RelicDb = { series: [...seriesMap.values()], relics }
  writeCache(cacheKey, db)
  return db
}

/** Accepte un ID brut, une URL Lodestone ou une URL FFXIV Collect. */
export function parseLodestoneId(input: string): number | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const urlMatch = trimmed.match(/(?:lodestone\/character|characters)\/(\d+)/)
  if (urlMatch) return Number(urlMatch[1])
  return null
}
