// Récupère les bases FFXIV Collect (EN+FR fusionnées, même format que src/api.ts)
// et les écrit dans public/data/ — servies ensuite par notre propre hébergement
// pour ne solliciter FFXIV Collect qu'une fois par jour au lieu d'une fois par
// utilisateur. Lancé par .github/workflows/data.yml (cron quotidien).

import { mkdir, readFile, writeFile } from 'node:fs/promises'

// Jobs de chaque relique arme (cache committé, rempli par resolve-relic-jobs.mjs).
let RELIC_JOBS = {}
try {
  RELIC_JOBS = JSON.parse(await readFile(new URL('./relic-jobs.json', import.meta.url), 'utf8'))
} catch {
  console.warn('relic-jobs.json absent — reliques sans champ jobs')
}

const API = 'https://ffxivcollect.com/api'
const OUT = new URL('../public/data/', import.meta.url)

const KIND_PATHS = {
  mounts: 'mounts',
  minions: 'minions',
  cards: 'triad/cards',
  fashions: 'fashions',
  orchestrions: 'orchestrions',
  spells: 'spells',
  facewear: 'facewear',
  hairstyles: 'hairstyles',
  emotes: 'emotes',
  bardings: 'bardings',
  frames: 'frames',
  outfits: 'outfits',
  armoires: 'armoires',
}

// L'armoire compte ~3500 entrées : la limite par défaut ne suffit plus.
const PAGE_LIMIT = 6000

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

/** Fusion EN (types stables) + FR (noms/textes) — identique à src/api.ts. */
function mergeDb(jsonEn, jsonFr) {
  const frById = new Map(jsonFr.results.map((r) => [r.id, r]))
  return jsonEn.results.map((r) => {
    const fr = frById.get(r.id)
    const sourcesEn = r.sources ?? []
    const sourcesFr = fr?.sources ?? []
    return {
      id: r.id,
      name: fr?.name ?? r.name,
      nameEn: r.name,
      icon: r.icon,
      image: r.image ?? r.icon,
      description: fr?.description ?? r.description ?? '',
      descriptionEn: r.description ?? '',
      patch: r.patch,
      order: r.order ?? r.number ?? 0,
      tradeable: !!r.tradeable,
      ownedPct: r.owned ?? '',
      // Catégorie (orchestrion : Lieux, Donjons…) et numéro d'album quand présents
      ...(r.category ? { group: fr?.category?.name ?? r.category.name, groupEn: r.category.name } : {}),
      ...(r.number !== undefined ? { num: r.number } : {}),
      // Magie bleue : rang (étoiles), type (Magique/Physique) et aspect (élément).
      // Les cartes ont aussi un champ type (Society, Primal…) → on ne prend le
      // couple type/aspect que si aspect existe (propre aux sorts).
      ...(r.rank !== undefined ? { rank: r.rank } : {}),
      ...(r.aspect?.name && r.type?.name
        ? {
            spellType: fr?.type?.name ?? r.type.name,
            spellTypeEn: r.type.name,
            aspect: fr?.aspect?.name ?? r.aspect.name,
            aspectEn: r.aspect.name,
          }
        : {}),
      // Émotes : la commande de chat (/lookback) fait partie de l'identité de l'émote.
      ...(r.command ? { command: r.command } : {}),
      // Portraits : le vrai nom affiché est celui du kit d'encadrement.
      ...(r.item_name ? { itemName: fr?.item_name ?? r.item_name, itemNameEn: r.item_name } : {}),
      // Tenues : les pièces qui composent l'ensemble.
      ...(r.items?.length
        ? { pieces: r.items.map((p, i) => fr?.items?.[i]?.name ?? p.name) }
        : {}),
      sources: sourcesEn.map((s, i) => ({
        type: s.type,
        text: sourcesFr[i]?.text ?? s.text,
        textEn: s.text,
      })),
    }
  })
}

function mergeRelics(jsonEn, jsonFr) {
  const frById = new Map(jsonFr.results.map((r) => [r.id, r]))
  const seriesMap = new Map()
  const relics = jsonEn.results.map((r) => {
    const fr = frById.get(r.id)
    const key = r.type.name
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
    seriesMap.get(key).total++
    return {
      id: r.id,
      name: fr?.name ?? r.name,
      nameEn: r.name,
      icon: r.icon,
      order: r.order ?? 0,
      series: key,
      // Catégorie de classe (« GLA PLD ») : sert au tri tank > heal > DPS.
      ...(RELIC_JOBS[r.name] ? { jobs: RELIC_JOBS[r.name] } : {}),
    }
  })
  return concatSeries(mergeUpgradeTiers([...seriesMap.values()], relics))
}

/** Rang d'amélioration d'une série : « X » → 0, « X augmentée » → 1, « X +N » → N.
 *  FFXIV Collect en fait des séries distinctes alors que ce sont les paliers
 *  d'une même armure : on les recolle pour retrouver le modèle des armes. */
// Paliers que le nom seul ne révèle pas : l'armure Anemos est le 4e palier
// de l'armure de classe d'Eurêka, et les trois armures de Bozja forment la
// progression unique des armures de la Résistance (Bozja → Bozja améliorée →
// Verdict des Juges → Verdict amélioré → Gunnhildr).
const SPECIAL_TIERS = {
  'Eureka Anemos Armor': { base: 'Eureka Job Armor', tier: 3 },
  "Law's Order": { base: 'Bozjan Armor', tier: 2 },
  "Augmented Law's Order": { base: 'Bozjan Armor', tier: 3 },
  "Blade's Armor": { base: 'Bozjan Armor', tier: 4 },
}

// Séries fusionnées qui méritent un nom à elles, et séries reclassées :
// les armes de rêve (donjons aux trésors) et magnifiées (donjons annexes)
// ne sont pas des sagas de reliques — elles rejoignent la section des
// donjons spéciaux, à la suite des donjons sans fond.
const SERIES_RENAME = {
  'Bozjan Armor': { key: 'Resistance Armor', name: 'Armures de la Résistance', order: 0 },
  'Figmental Weapons': { expansion: 0, order: 3 },
  'Exquisite Weapons': { expansion: 0, order: 4 },
}

// Séries concaténées : les sept ultimates deviennent une série unique dont
// chaque « étape » est un combat (tailles inégales → stepSizes).
const SERIES_CONCAT = [
  {
    key: 'Ultimates',
    name: 'Ultimates',
    category: 'ultimate',
    order: 5,
    expansion: 0,
    members: [
      'The Unending Coil of Bahamut',
      "The Weapon's Refrain",
      'The Epic of Alexander',
      "Dragonsong's Reprise",
      'The Omega Protocol',
      'Futures Rewritten',
      'Dancing Mad',
    ],
  },
]

function concatSeries({ series, relics }) {
  for (const spec of SERIES_CONCAT) {
    const members = spec.members
      .map((k) => series.find((x) => x.key === k))
      .filter(Boolean)
    if (members.length === 0) continue
    const stepSizes = members.map((x) => x.total)
    const total = stepSizes.reduce((a, b) => a + b, 0)
    const offsets = new Map()
    let off = 0
    for (const x of members) {
      offsets.set(x.key, off)
      off += x.total
    }
    relics = relics.map((r) =>
      offsets.has(r.series)
        ? { ...r, series: spec.key, order: offsets.get(r.series) + r.order }
        : r,
    )
    series = series.filter((x) => !offsets.has(x.key))
    series.push({
      key: spec.key,
      name: spec.name,
      category: spec.category,
      jobs: total,
      order: spec.order,
      expansion: spec.expansion,
      total,
      stepSizes,
    })
  }
  return { series, relics }
}

function upgradeTier(key) {
  if (SPECIAL_TIERS[key]) return SPECIAL_TIERS[key]
  const plus = key.match(/^(.*?) \+(\d+)$/)
  if (plus) return { base: plus[1], tier: Number(plus[2]) }
  const augmented = key.match(/^Augmented (.+)$/)
  if (augmented) return { base: augmented[1], tier: 1 }
  return null
}

/** Recolle les paliers : une série par armure, un palier par niveau. Les pièces
 *  sont renumérotées pour que « étape » = palier (et non emplacement). */
function mergeUpgradeTiers(series, relics) {
  const byKey = new Map(series.map((s) => [s.key, s]))
  // base → paliers, dans l'ordre croissant
  const families = new Map()
  for (const s of series) {
    const up = upgradeTier(s.key)
    if (!up || !byKey.has(up.base)) continue
    const base = byKey.get(up.base)
    if (base.category !== s.category) continue
    if (!families.has(up.base)) families.set(up.base, [])
    families.get(up.base).push({ tier: up.tier, series: s })
  }
  for (const list of families.values()) list.sort((a, b) => a.tier - b.tier)

  const tierOf = new Map() // clé de série → index de palier (0 = base)
  const baseOf = new Map() // clé de série → clé de base
  for (const [baseKey, list] of families) {
    baseOf.set(baseKey, baseKey)
    tierOf.set(baseKey, 0)
    list.forEach((entry, i) => {
      baseOf.set(entry.series.key, baseKey)
      tierOf.set(entry.series.key, i + 1)
    })
  }

  const outRelics = relics.map((r) => {
    const baseKey = baseOf.get(r.series)
    if (!baseKey) return r
    const size = byKey.get(baseKey).total
    return { ...r, series: baseKey, order: tierOf.get(r.series) * size + r.order }
  })

  const outSeries = series
    .filter((s) => !baseOf.has(s.key) || baseOf.get(s.key) === s.key)
    .map((s) => {
      const list = families.get(s.key)
      const renamed = SERIES_RENAME[s.key] ? { ...s, ...SERIES_RENAME[s.key] } : s
      // Pour une armure, un « job » du modèle = une pièce, et une étape = un
      // palier : sans palier, la série tient donc en une seule étape.
      if (renamed.category !== 'armor') return renamed
      const tiers = 1 + (list?.length ?? 0)
      return { ...renamed, jobs: renamed.total, total: renamed.total * tiers }
    })

  // Les reliques suivent le renommage de leur série (seules les entrées qui
  // changent de clé sont concernées — un simple reclassement n'en a pas).
  for (const r of outRelics) {
    if (SERIES_RENAME[r.series]?.key) r.series = SERIES_RENAME[r.series].key
  }

  return { series: outSeries, relics: outRelics }
}

await mkdir(OUT, { recursive: true })

for (const [kind, path] of Object.entries(KIND_PATHS)) {
  const [en, fr] = await Promise.all([
    getJson(`${API}/${path}?limit=${PAGE_LIMIT}`),
    getJson(`${API}/${path}?limit=${PAGE_LIMIT}&language=fr`),
  ])
  const items = mergeDb(en, fr)
  // Inobtenable aujourd'hui : toutes les sources sont « limited » chez
  // FFXIV Collect. L'API n'expose pas le drapeau, mais son filtre ransack
  // marche : ce qui ne ressort pas avec sources_limited_eq=false n'a plus
  // aucune voie d'obtention active (ex. monture Goobbue, chocobo Legacy).
  try {
    const ok = await getJson(`${API}/${path}?limit=${PAGE_LIMIT}&sources_limited_eq=false`)
    const okIds = new Set(ok.results.map((r) => r.id))
    let n = 0
    for (const it of items) {
      if (it.sources.length > 0 && !okIds.has(it.id)) {
        it.unobtainable = true
        n++
      }
    }
    if (n) console.log(`${kind}: ${n} inobtenable(s)`)
  } catch (e) {
    console.warn(`${kind}: filtre limited indisponible — ${e.message}`)
  }
  await writeFile(new URL(`${kind}.json`, OUT), JSON.stringify(items))
  console.log(`${kind}: ${items.length}`)
}

{
  const [en, fr] = await Promise.all([
    getJson(`${API}/relics?limit=3000`),
    getJson(`${API}/relics?limit=3000&language=fr`),
  ])
  const db = mergeRelics(en, fr)
  await writeFile(new URL('relics.json', OUT), JSON.stringify(db))
  console.log(`relics: ${db.relics.length} (${db.series.length} séries)`)
}

await writeFile(
  new URL('meta.json', OUT),
  JSON.stringify({ updatedAt: new Date().toISOString(), source: 'https://ffxivcollect.com' }),
)
console.log('OK')
