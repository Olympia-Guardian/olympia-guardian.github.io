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

// Voies d'obtention des kits d'encadrement (cache committé, rempli par
// resolve-frame-sources.mjs via XIVAPI + Garland Tools) : Collect n'en a pas.
let FRAME_SOURCES = {}
try {
  FRAME_SOURCES = JSON.parse(
    await readFile(new URL('./frame-sources.json', import.meta.url), 'utf8'),
  )
} catch {
  console.warn("frame-sources.json absent, portraits sans voie d'obtention")
}

// Types de contenu des sources de sorts de magie bleue (cache committé, rempli
// par resolve-spell-duties.mjs) : FFXIV Collect les type toutes « Other ».
let SPELL_DUTIES = {}
try {
  SPELL_DUTIES = JSON.parse(
    await readFile(new URL('./spell-duties.json', import.meta.url), 'utf8'),
  )
} catch {
  console.warn('spell-duties.json absent — sorts sans retypage donjon/défi/raid')
}

/** Sorts : « Monstre / Contenu » typé Other → Donjon/Défi/Raid via le cache,
 *  le texte devient le contenu seul, comme les autres collections (les cartes
 *  du planning fusionnent alors). Zones ouvertes (coordonnées), Carnaval
 *  masqué et totems Whalaqee restent « Other ». */
function refineSpellSources(items) {
  let n = 0
  for (const it of items) {
    it.sources = it.sources.map((s) => {
      if (s.type !== 'Other') return s
      const m = s.textEn.match(/^(.*?) \/ (.+)$/)
      if (!m) return s
      const place = m[2].trim()
      const duty = SPELL_DUTIES[place]
      if (!duty) return s
      let fr = s.text.includes(' / ') ? s.text.slice(s.text.indexOf(' / ') + 3).trim() : s.text
      // Annotation de guide retirée du nom EN (« leave one head alive ») :
      // retirée aussi du FR — mais jamais une mention de difficulté.
      if (place.includes('(') && !duty.name.includes('(')) {
        fr = fr.replace(/ \((?!brutal|extrême|sadique|irréel)[^)]*\)$/i, '')
      }
      n++
      return { type: duty.type, text: fr, textEn: duty.name }
    })
  }
  if (n) console.log(`spells: ${n} sources retypées donjon/défi/raid`)
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
  outfits: 'outfits',
  armoires: 'armoires',
  achievements: 'achievements',
  // En dernier : la voie « récompense de haut fait » se déduit des succès.
  frames: 'frames',
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
      // Succès : points, type (Bataille, Quêtes…) et récompense (titre ou objet).
      ...(r.points !== undefined ? { points: r.points } : {}),
      ...(r.points !== undefined && r.type?.name
        ? { achType: fr?.type?.name ?? r.type.name, achTypeEn: r.type.name }
        : {}),
      ...(r.reward && (r.reward.title?.name || r.reward.item?.name || r.reward.name)
        ? {
            reward:
              fr?.reward?.title?.name ?? fr?.reward?.item?.name ?? fr?.reward?.name ??
              r.reward.title?.name ?? r.reward.item?.name ?? r.reward.name,
            rewardEn: r.reward.title?.name ?? r.reward.item?.name ?? r.reward.name,
            rewardType: r.reward.type,
          }
        : {}),
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

let achievementsItems = null

for (const [kind, path] of Object.entries(KIND_PATHS)) {
  const [en, fr] = await Promise.all([
    getJson(`${API}/${path}?limit=${PAGE_LIMIT}`),
    getJson(`${API}/${path}?limit=${PAGE_LIMIT}&language=fr`),
  ])
  const items = mergeDb(en, fr)
  if (kind === 'spells') refineSpellSources(items)
  if (kind === 'achievements') achievementsItems = items
  // Portraits : voies d'obtention maison (Garland) + récompenses de hauts
  // faits déduites de notre propre catalogue de succès + saisons JcJ déduites
  // du nom (« Gold Conflict 19 » = rang Or de la saison 19 du Conflit).
  if (kind === 'frames') {
    const byReward = new Map()
    for (const a of achievementsItems ?? []) {
      if (a.rewardType === 'Item' && a.rewardEn) byReward.set(a.rewardEn.toLowerCase(), a)
    }
    const CC_RANKS = {
      Bronze: 'Bronze', Silver: 'Argent', Gold: 'Or', Platinum: 'Platine',
      Diamond: 'Diamant', Crystal: 'Cristal', Omega: 'Oméga', Ultima: 'Ultima',
      Rising: 'Croissant', Endless: 'Éternel', Final: 'Ultime',
    }
    // La monnaie trahit la vraie catégorie : cristaux-trophées = série JcJ,
    // certificats de Jonathas = hauts faits, monnaies tribales = tribus,
    // gemmes bicolores = ALÉAS, tessons = donjons sans fond, etc.
    const CURRENCY_TYPE = [
      [/trophy crystal/i, 'PvP'],
      [/achievement certificate/i, 'Achievement'],
      [/khloe|faux leaf/i, 'Wondrous Tails'],
      [/bicolor gemstone/i, 'FATE'],
      [/allied seal/i, 'Hunts'],
      [/cosmocredit/i, 'Cosmic Exploration'],
      // « illumed » = éthéromélangeur du Sanctuaire des pèlerins (donjon sans
      // fond de Dawntrail), pas le Croissant occulte.
      [/potsherd|orthos|illumed/i, 'Deep Dungeon'],
      [/sil'dihn|shishu|aloalo|corvosi/i, 'V&C Dungeon'],
      [/\bMG[FC]\b/, 'Gold Saucer'],
      [
        /goldleaf|amalj'ok|psashp|oaknot|cobaltpiece|whitebone|black copper|kupo nut|sango|dreamstaff|koban|compliment|frogment|pana|pelplume|nanook|omnitoken|fae fancy|yok huy/i,
        'Tribal',
      ],
    ]
    const refineType = (s) => {
      for (const [re, type] of CURRENCY_TYPE) {
        if (re.test(s.textEn)) return { ...s, type }
      }
      return s
    }
    let n = 0
    for (const it of items) {
      const sources = (FRAME_SOURCES[it.id] ?? []).map(refineType)
      const ach = byReward.get((it.itemNameEn ?? '').toLowerCase())
      if (ach && !sources.some((s) => s.type === 'Achievement')) {
        sources.push({ type: 'Achievement', text: ach.name, textEn: ach.nameEn })
      }
      const cc = it.nameEn.match(/^(\w+) Conflict (\d+)$/)
      if (sources.length === 0 && cc && CC_RANKS[cc[1]]) {
        sources.push({
          type: 'PvP',
          text: `Conflit crystallin classé - saison ${cc[2]} (rang ${CC_RANKS[cc[1]]})`,
          textEn: `Ranked Crystalline Conflict - Season ${cc[2]} (${cc[1]} tier)`,
        })
      }
      if (sources.length > 0) {
        it.sources = sources
        n++
      }
    }
    // Les saisons JcJ passées ne se gagnent plus : seule la plus récente
    // reste obtenable.
    const seasons = items
      .map((it) => it.nameEn.match(/ Conflict (\d+)$/))
      .filter(Boolean)
      .map((m) => Number(m[1]))
    const currentSeason = Math.max(0, ...seasons)
    let past = 0
    for (const it of items) {
      const m = it.nameEn.match(/ Conflict (\d+)$/)
      if (m && Number(m[1]) < currentSeason) {
        it.unobtainable = true
        past++
      }
    }
    console.log(`frames: ${n} portraits avec voie d'obtention, ${past} saisons JcJ passées`)
  }
  // Succès « Legacy » (ère 1.0) : plus obtenables depuis 2012.
  if (kind === 'achievements') {
    for (const it of items) if (it.achTypeEn === 'Legacy') it.unobtainable = true
  }
  // Inobtenable aujourd'hui : toutes les sources sont « limited » chez
  // FFXIV Collect. L'API n'expose pas le drapeau, mais son filtre ransack
  // marche : ce qui ne ressort pas avec sources_limited_eq=false n'a plus
  // aucune voie d'obtention active (ex. monture Goobbue, chocobo Legacy).
  // Exception : les portraits portent NOS sources, que Collect ignore — le
  // drapeau vient de nos règles (saisons JcJ passées) posées plus haut.
  if (kind !== 'frames') try {
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
