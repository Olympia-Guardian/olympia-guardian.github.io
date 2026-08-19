import { lsGet, lsKeys, lsRemove, lsSet } from './storage'
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
  | 'achievements'

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
  'achievements',
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
  achievements: { path: 'achievements' },
}

/** Collections que le Lodestone n'expose pas : elles se cochent à la main dans
 *  « Mon Journal » (le worker n'en scrape que les montures et les mascottes).
 *  Référence unique — le worker en garde une copie, à garder synchronisée. */
export const HIDDEN_KINDS: Kind[] = KINDS.filter((k) => k !== 'mounts' && k !== 'minions')

/** Collections proposées dans le Planning : ce qui se farme réellement en jeu.
 *  Les portraits (kits d'encadrement), tenues et armoire en sont exclus — ce
 *  sont des listes de complétion, pas du contenu à organiser en groupe. */
export const PLANNING_KINDS: Kind[] = KINDS.filter(
  (k) => k !== 'frames' && k !== 'outfits' && k !== 'armoires' && k !== 'achievements',
)

/** Les extensions, la plus récente d'abord. `major` est le numéro majeur des
 *  patchs qui en relèvent : 7.1 et 7.55 sont Dawntrail. A Realm Reborn couvre
 *  aussi le 1.x d'avant la refonte, qui ne laisse presque rien à collectionner.
 *  Source unique des noms : le planning filtre par patch, les reliques par leur
 *  champ `expansion`, mais tout le monde écrit « Shadowbringers » pareil. */
export const EXPANSIONS: { major: number; fr: string; en: string }[] = [
  { major: 7, fr: 'Dawntrail', en: 'Dawntrail' },
  { major: 6, fr: 'Endwalker', en: 'Endwalker' },
  { major: 5, fr: 'Shadowbringers', en: 'Shadowbringers' },
  { major: 4, fr: 'Stormblood', en: 'Stormblood' },
  { major: 3, fr: 'Heavensward', en: 'Heavensward' },
  { major: 2, fr: 'A Realm Reborn', en: 'A Realm Reborn' },
]

/** Extension d'un objet, lue sur son patch. Null quand le patch manque ou ne
 *  ressemble à rien : on ne devine pas, on laisse l'objet hors des filtres. */
export function expansionDe(patch: string | undefined): number | null {
  if (!patch) return null
  const v = parseFloat(patch)
  if (!Number.isFinite(v) || v < 1) return null
  return Math.max(2, Math.floor(v))
}

/** Ce qu'on sait d'un personnage SANS compte : le Lodestone, et rien d'autre.
 *  Les douze autres collections ne se remplissent qu'en les cochant dans « Mon
 *  Journal », ce qui demande un compte — les afficher à zéro ne renseigne
 *  personne et laisse croire que le perso ne possède rien. */
export const LODESTONE_KINDS: Kind[] = ['mounts', 'minions']

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
  { key: 'achievements', kinds: ['achievements'] },
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
  /** Objet marchand correspondant : clé d'entrée d'Universalis pour les prix. */
  itemId?: number
  /** Plus aucune voie d'obtention active (drapeau « limited » FFXIV Collect). */
  unobtainable?: boolean
  /** Collection d'origine dans les vues fusionnées (onglet « Mode »). */
  kindOf?: Kind
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
  /** Succès : points, type (Bataille, Quêtes…) et récompense (titre ou objet). */
  points?: number
  achType?: string
  achTypeEn?: string
  reward?: string
  rewardEn?: string
  rewardType?: string
  /** Armoire : emplacement d'équipement (1/2/13 mains, 3-8 armure, 9-12
   *  accessoire) pour séparer les familles dans la grille. */
  slot?: number
  /** Tenues : pièces qui composent l'ensemble, suivies individuellement.
   *  icon = planche d'icône du jeu ; slot = emplacement (3 tête, 4 torse,
   *  5 mains, 7 jambes, 8 pieds…) pour l'alignement en colonnes. */
  pieces?: {
    id: number
    name: string
    nameEn: string
    icon?: string
    slot?: number
    /** Même pièce dans l'armoire, quand elle y existe : cocher l'un propose
     *  de cocher l'autre. Absent pour les pièces sans équivalent. */
    armoireId?: number
  }[]
  /** type = enum anglais stable de l'API (la logique de catégories s'appuie dessus) ; text = français. */
  sources: Source[]
}

export interface CharCollection {
  count: number
  total: number
  /** Les mêmes, objets de boutique compris : affichés entre parenthèses. */
  countAll: number
  totalAll: number
  isPublic: boolean
  ids: number[]
}

/** Niveau d'une classe/job, scrappé de la page Class/Job du Lodestone. */
export interface CharJob {
  role: string
  name: string
  level: number
  icon: string
}

/** Profil étendu du Lodestone (fiche « Mon Journal »). */
export interface CharProfile {
  race: string | null
  nameday: string | null
  guardian: string | null
  city: string | null
  grandCompany: string | null
  /** Grande compagnie et rang en français (page FR du Lodestone). */
  grandCompanyFr?: string | null
  /** Icône de la grande compagnie (Lodestone). */
  gcIcon?: string | null
  freeCompany: string | null
  /** Blason de la compagnie libre : calques à superposer. */
  fcCrest?: string[]
  title: string | null
  /** Titre en français. */
  titleFr?: string | null
  activeLevel: number | null
  jobs: CharJob[]
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
  /** Pièces de tenues possédées (un ensemble complet devient possédé tout seul). */
  outfitPieceIds: number[]
  /** Emplacements de raid obtenus, par identifiant de `raid.json`. Ce qui vient
   *  du raid et ce qui vient d'ailleurs ne se stocke pas : le BiS importé le
   *  dit déjà, emplacement par emplacement. */
  raidFait: number[]
  /** Emplacements dont la pièce de mémoquartz est AMÉLIORÉE. Deuxième marche :
   *  une pièce de tomes s'achète, puis se termine avec un composant du raid. */
  raidAmeliore: number[]
  /** Profil Lodestone étendu (absent tant que la fiche n'a pas été re-scrapée). */
  profile: CharProfile | null
  /** Prochaine synchro forcée possible (epoch ms) — bouton du journal. */
  nextForceAt: number
  /** Fiche de secours FFXIV Collect, servie quand notre serveur n'a pas répondu :
   *  elle ignore tout des collections cochées à la main. Jamais mise en cache,
   *  et signalée à l'écran — sans ça, elle se lit comme une collection perdue. */
  partial?: boolean
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
    const raw = lsGet(key)
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
const DB_V = 'v15' // catalogues par collection (v15 : itemId pour les prix du marché)
const RAID_V = 'v4'
const RELIC_V = 'v2' // base des reliques (v2 : paliers d'armure fusionnés)
// La FORME d'une fiche change à chaque nouvelle collection : bumper ici,
// sinon les fiches en cache (sans le nouveau bloc) font planter les vues.
// v12 : purge obligatoire — les fiches de secours FFXIV Collect ont pu être
// mises en cache par la version précédente, avec zéro barde, zéro tenue, zéro
// pièce d'armoire et zéro portrait. Changer la version les jette toutes.
const CHAR_V = 'v12'

/** Purge les caches des versions précédentes : ils ne servent plus et
 *  encombrent un localStorage déjà juste. */
function purgeStaleCaches(): void {
  try {
    for (const key of lsKeys()) {
      const db = key.match(/^ogs\.db\.(.+)\.(v\d+)$/)
      if (db) {
        if (db[2] !== (db[1] === 'relics' ? RELIC_V : DB_V)) lsRemove(key)
        continue
      }
      const char = key.match(/^ogs\.char\.\d+\.(v\d+)$/)
      if (char && char[1] !== CHAR_V) lsRemove(key)
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
    lsSet(key, payload)
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
    const res = await fetch(`${import.meta.env.BASE_URL}data/${kind}.json`, {
      signal: AbortSignal.timeout(30000),
    })
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
// lsSet('ogs.apibase.v1', 'http://127.0.0.1:8788')
/** Lecture d'une préférence locale qui ne fait jamais tomber l'app : en
 *  navigation privée ou avec les données de site bloquées, `localStorage`
 *  existe mais lève à la première lecture. Comme cette valeur est calculée au
 *  chargement du module, une exception ici donnait une page blanche. */
function localPref(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? lsGet(key) : null
  } catch {
    return null
  }
}

/** En-tête de session, s'il y en a une. La fiche d'un personnage ne livre ses
 *  collections saisies à la main qu'à un visiteur connecté : sans cet en-tête,
 *  le joueur recevait la vue publique de ses propres personnages, montures et
 *  mascottes seulement. */
function sessionHeaders(): HeadersInit {
  const t = localPref('ogs.session.v1')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export const WORKER_API =
  localPref('ogs.apibase.v1') ||
  // `npm run dev:local` : front branché sur le worker local (.env.localworker)
  (import.meta.env.VITE_WORKER_API as string | undefined) ||
  'https://ogs-room.olympia-guardian.workers.dev'

function mapCharacter(r: any): Character {
  const col = (c: any): CharCollection => ({
    count: c?.count ?? 0,
    total: c?.total ?? 0,
    countAll: c?.count_all ?? c?.count ?? 0,
    totalAll: c?.total_all ?? c?.total ?? 0,
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
    profile: r.profile ?? null,
    nextForceAt: r.next_force_at ?? 0,
    outfitPieceIds: (r.outfit_piece_ids as number[] | undefined) ?? [],
    raidFait: (r.raid_fait as number[] | undefined) ?? [],
    raidAmeliore: (r.raid_ameliore as number[] | undefined) ?? [],
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
/** Fiche FFXIV Collect d'un perso : document par collection + nombre total
 *  d'entrées cochées là-bas. null si la fiche n'existe pas. */
export async function fetchCollectDoc(
  lodestoneId: number,
): Promise<{ doc: Record<string, number[]>; total: number } | null> {
  const res = await fetch(`${API}/characters/${lodestoneId}?ids=true`)
  if (!res.ok) return null
  const d = await res.json()
  // Les clés de l'API personnage portent exactement le nom de nos kinds.
  const doc = {
    ...Object.fromEntries(HIDDEN_KINDS.map((k) => [k, (d[k]?.ids ?? []) as number[]])),
    relics: [
      ...new Set<number>(
        (['weapons', 'ultimate', 'armor', 'tools'] as const).flatMap(
          (g) => (d.relics?.[g]?.ids ?? []) as number[],
        ),
      ),
    ],
  }
  const total = Object.values(doc).reduce((sum, ids) => sum + ids.length, 0)
  return { doc, total }
}

async function seedFromCollect(lodestoneId: number): Promise<void> {
  const found = await fetchCollectDoc(lodestoneId)
  if (!found) return
  await fetch(`${WORKER_API}/character/${lodestoneId}/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(found.doc),
  })
}

/** Import FFXIV Collect (fusion, ne retire jamais rien) — propriétaire
 *  vérifié uniquement. Renvoie le nombre d'entrées ajoutées. */
export async function pushCollectSync(
  lodestoneId: number,
  doc: Record<string, number[]>,
  token: string,
): Promise<number> {
  const res = await fetch(`${WORKER_API}/character/${lodestoneId}/collect-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(doc),
  })
  if (!res.ok) throw new Error(`collect-sync ${res.status}`)
  const j = await res.json()
  invalidateCharacter(lodestoneId)
  return j.added ?? 0
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
    // 15 s tombait pile dans le pire cas légitime du serveur : jusqu'à 3 s
    // d'attente du jeton Lodestone, 8 s de lecture, plus D1 et un démarrage à
    // froid. Le navigateur abandonnait donc une requête qui allait aboutir —
    // les compteurs du worker ne montrent d'ailleurs ni erreur ni refus.
    let res = await fetch(url, { headers: sessionHeaders(), signal: AbortSignal.timeout(25000) })
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
        const res2 = await fetch(`${WORKER_API}/character/${lodestoneId}`, {
          headers: sessionHeaders(),
        })
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

    // Le worker n'a pas répondu (délai dépassé, coupure, erreur). Il est LA
    // source des onze collections cochées à la main : FFXIV Collect n'en sait
    // rien et renverrait zéro barde, zéro tenue, zéro pièce d'armoire, zéro
    // portrait et une partie seulement des rouleaux. Servir ça pour une panne
    // de trois secondes se lit comme une collection effacée.
    //
    // Donc, dans l'ordre : une fiche en cache même périmée d'abord — une vérité
    // un peu vieille vaut mieux qu'un faux zéro ; le secours seulement si on
    // n'a rien du tout, jamais mis en cache, et marqué comme incomplet pour que
    // l'écran le dise au lieu de laisser croire à une perte.
    const perime = readCache<Character>(cacheKey, Infinity)
    if (perime) return perime

    const res = await fetch(`${API}/characters/${lodestoneId}?ids=true`)
    if (res.status === 404) {
      throw new Error("Personnage introuvable — vérifie l'ID Lodestone.")
    }
    if (!res.ok) throw new Error(`FFXIV Collect a répondu ${res.status}`)
    return { ...mapCharacter(await res.json()), partial: true }
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

// ---------------------------------------------------------------------------
// Équipement de raid
// ---------------------------------------------------------------------------

/** Icône d'un objet à partir de son numéro. Le catalogue des pièces n'en
 *  stocke que le nombre : mille adresses complètes pesaient 80 Ko pour une
 *  information qui se recalcule d'une ligne. */
export function iconeObjet(id: number): string {
  const n = String(id).padStart(6, '0')
  const dossier = n.slice(0, 3) + '000'
  const chemin = `ui/icon/${dossier}/${n}_hr1.tex`
  return `https://v2.xivapi.com/api/asset?format=webp&path=${encodeURIComponent(chemin)}`
}

/** Un emplacement qui tombe dans un palier. C'est le COFFRE qui se distribue le
 *  soir du raid, pas la variante par job : onze emplacements suffisent à suivre
 *  un joueur, là où le palier compte 88 objets. */
export interface RaidEmplacement {
  cle: string
  /** Étage qui le lâche, de 1 à 4. */
  etage: number
  /** Notre identifiant, unique tous paliers confondus. Celui du coffre ne
   *  conviendrait pas : les deux anneaux le partagent. */
  id: number
  /** Identifiant du coffre dans les données du jeu (icône, nom). */
  coffre: number
  fr: string
  en: string
  objetFr: string
  objetEn: string
  icon: string
}

/** Une pièce d'équipement du palier. C'est cette table qui range un BiS collé :
 *  un identifiant d'objet y donne son emplacement et sa provenance, donc ce
 *  qu'on attend du raid, sans une question au joueur. */
export interface RaidPiece {
  id: number
  /** Clé d'emplacement au sens du jeu : weapon, head, ring… Les deux bagues ne
   *  s'y distinguent pas, c'est le BiS qui dit laquelle est laquelle. */
  emplacement: string
  provenance: 'savage' | 'tome'
  fr: string
  en: string
  /** Numéro d'icône, à passer à `iconeObjet`. */
  icone: number
}

/** Un composant d'amélioration : ce que coûte une pièce de mémoquartz en plus
 *  des tomes. Il tombe en savage, mais au hasard des étages : c'est pourquoi il
 *  se compte à part et jamais en soirées. */
export interface RaidMateriau {
  /** Ce qu'il sert à faire : `armure`, `accessoire`, `arme` améliorent la pièce
   *  achetée ; `achat` sert à acheter l'arme, avant même de l'améliorer. */
  cle: 'armure' | 'accessoire' | 'arme' | 'achat'
  id: number
  fr: string
  en: string
  icone: number
}

export interface RaidPalier {
  cle: string
  fr: string
  en: string
  ilvl: number
  emplacements: RaidEmplacement[]
  pieces: RaidPiece[]
  materiaux: RaidMateriau[]
}

export interface RaidDb {
  paliers: RaidPalier[]
}

export async function fetchRaidDb(): Promise<RaidDb> {
  const cacheKey = `ogs.db.raid.${RAID_V}`
  const cached = readCache<RaidDb>(cacheKey, DB_TTL)
  if (cached) return cached
  const res = await fetch(`${import.meta.env.BASE_URL}data/raid.json`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`raid ${res.status}`)
  const db = (await res.json()) as RaidDb
  if (!db?.paliers?.length) throw new Error('raid: catalogue vide')
  writeCache(cacheKey, db)
  return db
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
    lsRemove(`ogs.char.${lodestoneId}.${CHAR_V}`)
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
