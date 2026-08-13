// Client de l'API publique FFXIV Collect (https://ffxivcollect.com)
// CORS ouvert → tout tourne dans le navigateur, aucun serveur nécessaire.

const API = 'https://ffxivcollect.com/api'

export type Kind =
  | 'mounts'
  | 'minions'
  | 'cards'
  | 'fashions'
  | 'facewear'
  | 'hairstyles'
  | 'outfits'
  | 'armoires'
  | 'bardings'
  | 'emotes'
  | 'frames'
  | 'orchestrions'
  | 'spells'

export const KINDS: Kind[] = [
  'mounts',
  'minions',
  'cards',
  'fashions',
  'facewear',
  'hairstyles',
  'outfits',
  'armoires',
  'bardings',
  'emotes',
  'frames',
  'orchestrions',
  'spells',
]

export const KIND_INFO: Record<Kind, { path: string }> = {
  mounts: { path: 'mounts' },
  minions: { path: 'minions' },
  cards: { path: 'triad/cards' },
  fashions: { path: 'fashions' },
  facewear: { path: 'facewear' },
  hairstyles: { path: 'hairstyles' },
  outfits: { path: 'outfits' },
  armoires: { path: 'armoires' },
  bardings: { path: 'bardings' },
  emotes: { path: 'emotes' },
  frames: { path: 'frames' },
  orchestrions: { path: 'orchestrions' },
  spells: { path: 'spells' },
}

/** Collections que le Lodestone n'expose pas : elles se cochent à la main dans
 *  « Mon Journal » (le worker n'en scrape que les montures et les mascottes).
 *  Référence unique — le worker en garde une copie, à garder synchronisée. */
export const HIDDEN_KINDS: Kind[] = KINDS.filter((k) => k !== 'mounts' && k !== 'minions')

/** Collections proposées dans le Planning : ce qui se farme réellement en jeu.
 *  Les portraits (kits d'encadrement), tenues et armoire en sont exclus — ce
 *  sont des listes de complétion, pas du contenu à organiser en groupe. */
export const PLANNING_KINDS: Kind[] = KINDS.filter(
  (k) => k !== 'frames' && k !== 'outfits' && k !== 'armoires',
)

/** Familles d'onglets : les petites collections cousines partagent un onglet.
 *  `merged` : la famille s'affiche comme UNE catégorie (liste groupée par
 *  sous-collection) au lieu d'un onglet par collection. */
export const KIND_FAMILIES: { key: string; kinds: Kind[]; merged?: boolean }[] = [
  { key: 'mounts', kinds: ['mounts'] },
  { key: 'minions', kinds: ['minions'] },
  { key: 'orchestrions', kinds: ['orchestrions'] },
  { key: 'cards', kinds: ['cards'] },
  { key: 'fashion', kinds: ['fashions', 'facewear', 'hairstyles'], merged: true },
  { key: 'bardings', kinds: ['bardings'] },
  { key: 'emotes', kinds: ['emotes'] },
  { key: 'frames', kinds: ['frames'] },
  { key: 'attire', kinds: ['outfits', 'armoires'] },
  { key: 'spells', kinds: ['spells'] },
]

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
  /** Plus aucune voie d'obtention active (drapeau « limited » FFXIV Collect). */
  unobtainable?: boolean
  ownedPct: string
  /** Catégorie d'album (orchestrion : « Lieux », « Donjons »…). */
  group?: string
  groupEn?: string
  /** Numéro d'album (rouleaux, cartes). */
  num?: number | string
  /** Magie bleue : rang en étoiles (1-5), type (Magique/Physique) et aspect (élément ou type de dégâts). */
  rank?: number
  spellType?: string
  spellTypeEn?: string
  aspect?: string
  aspectEn?: string
  /** Émotes : la commande de chat (/lookback). */
  command?: string
  /** Portraits : nom du kit d'encadrement (le « name » n'est qu'un libellé court). */
  itemName?: string
  itemNameEn?: string
  /** Tenues : pièces qui composent l'ensemble. */
  pieces?: string[]
  /** type = enum anglais stable de l'API (la logique de catégories s'appuie dessus) ; text = français. */
  sources: Source[]
}

export interface CharCollection {
  count: number
  total: number
  isPublic: boolean
  ids: number[]
}

/** Une entrée par kind : le type suit automatiquement l'ajout d'une collection. */
export type Character = { [K in Kind]: CharCollection } & {
  id: number
  name: string
  server: string
  dataCenter: string
  avatar: string
  portrait: string
  lastParsed: string
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

// localStorage plafonne autour de 5 Mo : au-delà, on laisse le cache HTTP faire
// le travail (nos catalogues sont servis en statique depuis notre domaine).
const CACHE_MAX_CHARS = 300_000

// Versions de cache. Les bumper suffit à forcer un retéléchargement chez tout
// le monde : indispensable quand la FORME des données change (sinon un vieux
// cache de 24 h continue d'alimenter l'appli avec l'ancienne structure).
const DB_V = 'v7' // catalogues par collection
const RELIC_V = 'v2' // base des reliques (v2 : paliers d'armure fusionnés)
const CHAR_V = 'v6' // fiches de personnage

/** Purge les caches des versions précédentes : ils ne servent plus et
 *  encombrent un localStorage déjà juste. */
function purgeStaleCaches(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      const db = key.match(/^ogs\.db\.(.+)\.(v\d+)$/)
      if (db) {
        if (db[2] !== (db[1] === 'relics' ? RELIC_V : DB_V)) localStorage.removeItem(key)
        continue
      }
      const char = key.match(/^ogs\.char\.\d+\.(v\d+)$/)
      if (char && char[1] !== CHAR_V) localStorage.removeItem(key)
    }
  } catch {
    // localStorage indisponible : rien à purger
  }
}

purgeStaleCaches()

function writeCache<T>(key: string, data: T): void {
  try {
    const payload = JSON.stringify({ at: Date.now(), data } satisfies Cached<T>)
    if (payload.length > CACHE_MAX_CHARS) return
    localStorage.setItem(key, payload)
  } catch {
    // localStorage plein ou indisponible : on continue sans cache
  }
}

export async function fetchDb(kind: Kind, force = false): Promise<Item[]> {
  // v2 : l'API localise AUSSI les types de sources avec language=fr, ce qui
  // cassait les catégories → on fusionne EN (types stables) + FR (noms).
  // v3 : ajout de sources[].textEn pour les heuristiques solo/groupe.
  // v4 : image + description pour la fiche objet.
  // v5 : group/groupEn (catégorie orchestrion) + num (numéro d'album des cartes).
  // v6 : rank/spellType/aspect (magie bleue).
  const cacheKey = `ogs.db.${kind}.${DB_V}`
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
    fetch(`${API}/${path}?limit=6000`),
    fetch(`${API}/${path}?limit=6000&language=fr`),
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
      // Mêmes champs que les catalogues statiques (scripts/fetch-data.mjs)
      ...(r.category ? { group: fr?.category?.name ?? r.category.name, groupEn: r.category.name } : {}),
      ...(r.number !== undefined ? { num: r.number } : {}),
      ...(r.rank !== undefined ? { rank: r.rank } : {}),
      ...(r.aspect?.name && r.type?.name
        ? {
            spellType: fr?.type?.name ?? r.type.name,
            spellTypeEn: r.type.name,
            aspect: fr?.aspect?.name ?? r.aspect.name,
            aspectEn: r.aspect.name,
          }
        : {}),
    }
  })
  writeCache(cacheKey, items)
  return items
}

/** Worker OGS : personnages lus directement sur le Lodestone, stockés en D1. */
// Surcharge locale possible (tests E2E sur un worker `wrangler dev`) :
// localStorage.setItem('ogs.apibase.v1', 'http://127.0.0.1:8788')
export const WORKER_API =
  (typeof localStorage !== 'undefined' && localStorage.getItem('ogs.apibase.v1')) ||
  'https://ogs-room.olympia-guardian.workers.dev'

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
    ...(Object.fromEntries(KINDS.map((k) => [k, col(r[k])])) as { [K in Kind]: CharCollection }),
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
  // Les clés de l'API personnage portent exactement le nom de nos kinds.
  const seed = {
    ...Object.fromEntries(HIDDEN_KINDS.map((k) => [k, d[k]?.ids ?? []])),
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
  const cacheKey = `ogs.char.${lodestoneId}.${CHAR_V}`
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
  /** Catégorie de classe (« GLA PLD ») — tri tank > heal > DPS des armes. */
  jobs?: string
}

export interface RelicSeriesInfo {
  key: string
  /** Étapes de tailles inégales (Ultimates) : nombre d'armes par combat. */
  stepSizes?: number[]
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
  const cacheKey = `ogs.db.relics.${RELIC_V}`
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

/** Invalide le cache local d'un perso (après édition dans « Mon Journal »). */
export function invalidateCharacter(lodestoneId: number): void {
  try {
    localStorage.removeItem(`ogs.char.${lodestoneId}.${CHAR_V}`)
  } catch {
    // rien
  }
}

/** Accepte un ID brut, une URL Lodestone ou une URL FFXIV Collect. */
export function parseLodestoneId(input: string): number | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const urlMatch = trimmed.match(/(?:lodestone\/character|characters)\/(\d+)/)
  if (urlMatch) return Number(urlMatch[1])
  return null
}
