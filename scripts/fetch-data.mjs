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

// Icônes et emplacements des pièces de tenues (cache committé, rempli par
// resolve-piece-icons.mjs via la feuille Item de XIVAPI).
let PIECE_ICONS = {}
try {
  PIECE_ICONS = JSON.parse(
    await readFile(new URL('./piece-icons.json', import.meta.url), 'utf8'),
  )
} catch {
  console.warn('piece-icons.json absent, pièces de tenues sans icône')
}

// Emplacements d'équipement des entrées de l'armoire (cache committé, rempli
// par resolve-armoire-slots.mjs) : sépare armures/accessoires/armes/outils.
let ARMOIRE_SLOTS = {}
try {
  ARMOIRE_SLOTS = JSON.parse(
    await readFile(new URL('./armoire-slots.json', import.meta.url), 'utf8'),
  )
} catch {
  console.warn('armoire-slots.json absent, armoire sans emplacements')
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

/** Écriture protégée d'un catalogue. Une réponse tronquée de FFXIV Collect
 *  passe tous les contrôles habituels (elle est valide, seulement incomplète)
 *  puis s'installe 24 h dans le cache de chaque visiteur : on refuse d'écrire
 *  moins de 90 % de ce qui existait, et on vérifie les champs de base. */
/** Nombre d'entrées par collection, publié à part dans totals.json : le worker
 *  n'a besoin que de ce total pour 13 des 16 catalogues, et les télécharger en
 *  entier pour lire un `.length` lui coûtait 6,3 Mo à chaque démarrage. */
const TOTALS = {}

// Objets HORS TOTAL : ce que personne n'a jamais pu obtenir en jouant. Ils
// restent dans les collections mais sortent des compteurs, des deux côtés — les
// retirer du total sans les retirer du nombre possédé donnerait des 148/143.
//
// Deux cas, et deux seulement :
//
//  - la BOUTIQUE en ligne, parce que personne ne doit avoir à payer pour
//    atteindre 100 % ;
//  - la VERSION 1.0, partie avec le serveur qui l'hébergeait.
//
// Tout le reste compte, y compris les événements terminés et le JcJ : ce
// contenu a été obtenable en jouant. Ne pas y avoir été n'est pas une raison de
// baisser la barre.
const HORS_TOTAL = {}

// Jalons de l'histoire principale, releves au passage des succes.
const MSQ = []

/** Boutique SEULEMENT. Un objet gagné à un événement puis revendu en boutique
 *  garde une source de jeu : on pouvait l'avoir sans payer, donc il compte.
 *  Ils sont 484 dans ce cas, et `some` les écartait tous — y compris du
 *  compteur de ceux qui les avaient bel et bien gagnés.
 *  Le test sur la longueur est indispensable : `every` répond vrai sur un
 *  tableau vide, et 3 954 objets n'ont aucune source. */
const boutiqueSeulement = (it) =>
  it.sources.length > 0 && it.sources.every((s) => s.type === 'Premium')

/** Contenu de la version 1.0 : 261 succès, et rien d'autre au catalogue. */
const vientDeLaV1 = (it) => String(it.patch ?? '').startsWith('1.')

const horsTotal = (it) => boutiqueSeulement(it) || vientDeLaV1(it)

async function writeCatalog(kind, items) {
  const dest = new URL(`${kind}.json`, OUT)
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${kind} : catalogue vide, écriture refusée`)
  }
  const absents = ['id', 'name', 'icon'].filter((k) => items[0][k] === undefined)
  if (absents.length > 0) {
    throw new Error(`${kind} : champs absents sur la première entrée (${absents.join(', ')})`)
  }
  let avant = 0
  try {
    avant = JSON.parse(await readFile(dest, 'utf8')).length
  } catch {
    // premier passage : rien à comparer
  }
  if (avant > 0 && items.length < avant * 0.9) {
    throw new Error(`${kind} : ${items.length} entrées contre ${avant} avant, écriture refusée`)
  }
  await writeFile(dest, JSON.stringify(items))
  const exclus = items.filter(horsTotal).map((it) => it.id)
  if (exclus.length > 0) HORS_TOTAL[kind] = exclus
  TOTALS[kind] = items.length - exclus.length
  console.log(
    `${kind}: ${items.length}${avant ? ` (avant ${avant})` : ''}` +
      (exclus.length ? `, dont ${exclus.length} hors total (boutique seule ou 1.0)` : ''),
  )
}

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
      // Identifiant de l'objet marchand : c'est la clé d'entrée d'Universalis
      // pour connaître les prix. Absent des collections non échangeables.
      ...(r.item_id ? { itemId: r.item_id } : {}),
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
      // Tenues : les pièces qui composent l'ensemble, avec leur id d'objet —
      // la possession se suit pièce par pièce.
      ...(r.items?.length
        ? {
            pieces: r.items.map((p, i) => ({
              id: p.id,
              name: fr?.items?.[i]?.name ?? p.name,
              nameEn: p.name,
            })),
          }
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
let outfitsItems = null

for (const [kind, path] of Object.entries(KIND_PATHS)) {
  const [en, fr] = await Promise.all([
    getJson(`${API}/${path}?limit=${PAGE_LIMIT}`),
    getJson(`${API}/${path}?limit=${PAGE_LIMIT}&language=fr`),
  ])
  const items = mergeDb(en, fr)
  if (kind === 'spells') refineSpellSources(items)
  if (kind === 'achievements') achievementsItems = items
  if (kind === 'outfits') outfitsItems = items
  // Armoire : chaque entrée reçoit son emplacement d'équipement.
  if (kind === 'armoires') {
    for (const it of items) {
      const slot = ARMOIRE_SLOTS[it.id]
      if (slot !== undefined) it.slot = slot
    }
  }
  // Tenues : chaque pièce reçoit son icône et son emplacement (tête, torse…)
  if (kind === 'outfits') {
    for (const it of items) {
      for (const pc of it.pieces ?? []) {
        const info = PIECE_ICONS[pc.id]
        if (info) {
          pc.icon = info.icon
          pc.slot = info.slot
        }
      }
    }
  }
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
    // Garland Tools met une majuscule à chaque mot : le francais n'en met pas
    // sur les particules au milieu d'un nom. Sept noms concernes, corrigés
    // nommement plutôt qu'à la règle (aucun risque d'abîmer un nom propre).
    const NPC_FIXES = {
      "Numismate De L'expédition": "Numismate de l'Expédition",
      'Préposé Aux Lots': 'Préposé aux lots',
      'Préposée Aux Lots': 'Préposée aux lots',
      'Dure À Cuire': 'Dure à cuire',
      'Fournisseuse De La Confédération': 'Fournisseuse de la Confédération',
      'Quartier-maître Du Maelstrom': 'Quartier-maître du Maelstrom',
      'Système De Synthèse': 'Système de synthèse',
    }
    const fixNpcCase = (s) => {
      const i = s.text.indexOf(' - ')
      const npc = i === -1 ? s.text : s.text.slice(0, i)
      const fixed = NPC_FIXES[npc]
      if (!fixed) return s
      return { ...s, text: i === -1 ? fixed : fixed + s.text.slice(i) }
    }
    const refineType = (s) => {
      for (const [re, type] of CURRENCY_TYPE) {
        if (re.test(s.textEn)) return { ...s, type }
      }
      return s
    }
    // Portraits nommés d'après leur contenu : ni FFXIV Collect ni Garland ne
    // leur donnent de source, mais le nom court la porte. « (standard) » est
    // le portrait par défaut d'une classe ou d'un job, « (fatal) » un raid
    // ultime, et « Front : Maelstrom » une grande compagnie aux Fronts (le
    // camp JcJ, pas l'intendant à sceaux).
    const JOBS = new Set([
      'Gladiator', 'Marauder', 'Conjurer', 'Pugilist', 'Lancer', 'Rogue', 'Archer',
      'Thaumaturge', 'Arcanist', 'Paladin', 'Warrior', 'Dark Knight', 'Gunbreaker',
      'White Mage', 'Scholar', 'Astrologian', 'Sage', 'Monk', 'Dragoon', 'Ninja',
      'Samurai', 'Reaper', 'Bard', 'Machinist', 'Dancer', 'Black Mage', 'Summoner',
      'Red Mage', 'Blue Mage', 'Viper', 'Pictomancer', 'Carpenter', 'Blacksmith',
      'Armorer', 'Goldsmith', 'Leatherworker', 'Weaver', 'Alchemist', 'Culinarian',
      'Miner', 'Botanist', 'Fisher',
    ])
    // Cartes et camps JcJ, par mode de jeu.
    const PVP_MAPS = {
      'Fields of Glory': 'Fronts', 'Onsal Hakair': 'Fronts', 'Seal Rock': 'Fronts',
      'Borderland Ruins (Secure)': 'Fronts', 'The Maelstrom': 'Fronts',
      'The Order of the Twin Adder': 'Fronts', 'The Immortal Flames': 'Fronts',
      'Hidden Gorge': 'Ailes rivales',
      'Volcanic Heart': 'Conflit crystallin', 'Clockwork Castletown': 'Conflit crystallin',
      'Bayside Battleground': 'Conflit crystallin', 'Red Sands': 'Conflit crystallin',
    }
    const PVP_MODE_EN = {
      Fronts: 'Frontline', 'Ailes rivales': 'Rival Wings',
      'Conflit crystallin': 'Crystalline Conflict',
    }
    const ULTIMATES = new Set([
      'Unending Coil of Bahamut', "Weapon's Refrain", 'Epic of Alexander',
      "Dragonsong's Reprise", 'Omega Protocol', 'Futures Rewritten',
    ])
    // Séries de quêtes : le portrait récompense la ligne entière, pas un
    // contenu instancié précis (pas de carte de planning fantôme).
    const QUESTLINES = new Set(['Four Lords', 'Dreaming Ways'])
    const EVENTS = new Set(['Ten Year Anniversary', 'Yo-kai Watch'])
    // Les derniers cas, vérifiés un par un (le nom seul ne suffisait pas) :
    // deux paliers de série JcJ, un concours de Fan Festival, une quête de
    // job, et les deux jeux exclusifs de l'application mobile Companion.
    const ONE_OFFS = {
      'Archeia Harmonias': {
        type: 'PvP',
        text: 'Série JcJ 11 - niveau 10',
        textEn: 'PvP Series 11 - level 10',
      },
      'Worqor Chirteh': {
        type: 'PvP',
        text: 'Série JcJ 10 - niveau 20',
        textEn: 'PvP Series 10 - level 20',
      },
      'Special Accolades': {
        type: 'Event',
        text: 'Fan Festival 2026 - lauréats des concours Art et Vidéo',
        textEn: 'Fan Festival 2026 - Art and Video contest winners',
      },
      'Sheet Music': {
        type: 'Quest',
        text: 'Progression des quêtes de Barde',
        textEn: 'Bard job quest progression',
      },
      'Companion 1': {
        type: 'Other',
        text: 'Application mobile FFXIV Companion',
        textEn: 'FFXIV Companion mobile app',
      },
      'Companion 2': {
        type: 'Premium',
        text: 'Application mobile FFXIV Companion (abonnement premium)',
        textEn: 'FFXIV Companion mobile app (premium subscription)',
      },
    }
    const nameSource = (it) => {
      if (JOBS.has(it.nameEn.replace(/ \(Simple\)$/, ''))) {
        return {
          type: 'Quest',
          text: 'Débloquer la classe ou le job',
          textEn: 'Unlock the class or job',
        }
      }
      const mode = PVP_MAPS[it.nameEn]
      if (mode) {
        return {
          type: 'PvP',
          text: `${mode} : ${it.name.replace(/^Front\s*:\s*/, '')}`,
          textEn: `${PVP_MODE_EN[mode]}: ${it.nameEn}`,
        }
      }
      if (ULTIMATES.has(it.nameEn)) return { type: 'Raid', text: it.name, textEn: it.nameEn }
      if (QUESTLINES.has(it.nameEn)) return { type: 'Quest', text: it.name, textEn: it.nameEn }
      if (EVENTS.has(it.nameEn)) return { type: 'Event', text: it.name, textEn: it.nameEn }
      return ONE_OFFS[it.nameEn] ?? null
    }
    let n = 0
    for (const it of items) {
      const sources = (FRAME_SOURCES[it.id] ?? []).map(refineType).map(fixNpcCase)
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
      if (sources.length === 0) {
        const byName = nameSource(it)
        if (byName) sources.push(byName)
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
    // Une réponse vide marquerait TOUT le catalogue « plus obtenable » : on la
    // refuse, comme une proportion invraisemblable (le filtre a changé de nom
    // ou de sens chez Collect).
    if (!Array.isArray(ok.results) || ok.results.length === 0) {
      throw new Error('réponse vide')
    }
    const avecSource = items.filter((it) => it.sources.length > 0)
    const okIds = new Set(ok.results.map((r) => r.id))
    const perdus = avecSource.filter((it) => !okIds.has(it.id))
    if (perdus.length > avecSource.length * 0.5) {
      throw new Error(`${perdus.length}/${avecSource.length} marqués inobtenables`)
    }
    for (const it of perdus) it.unobtainable = true
    if (perdus.length) console.log(`${kind}: ${perdus.length} inobtenable(s)`)
  } catch (e) {
    console.warn(`${kind}: filtre limited ignoré, ${e.message}`)
  }
  if (kind === 'achievements') {
    for (const it of items) {
      if (it.groupEn === 'Main Scenario' && it.patch) MSQ.push({ id: it.id, patch: it.patch })
    }
  }
  await writeCatalog(kind, items)

  // Une même pièce existe parfois dans les deux collections : cochée dans
  // l'armoire, elle l'est aussi dans la tenue, et l'inverse. L'appariement se
  // fait sur le nom anglais ET l'icône (le nom seul laisse passer des
  // homonymes de couleurs différentes), et il n'est posé que s'il est exact.
  // L'armoire passe après les tenues, d'où la réécriture du fichier.
  if (kind === 'armoires' && outfitsItems) {
    const cle = (nomEn, icone) =>
      `${(nomEn ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, "'").trim().toLowerCase()}|${icone ?? ''}`
    const parCle = new Map()
    for (const a of items) {
      const m = String(a.icon).match(/(\d{6})_hr1/)
      const k = cle(a.nameEn, m ? m[1] : '')
      if (!parCle.has(k)) parCle.set(k, a.id)
    }
    let apparies = 0
    let tenuesCompletes = 0
    for (const o of outfitsItems) {
      const pieces = o.pieces ?? []
      if (pieces.length === 0) continue
      let tout = true
      for (const pc of pieces) {
        const id = parCle.get(cle(pc.nameEn, pc.icon))
        if (id === undefined) tout = false
        else {
          pc.armoireId = id
          apparies++
        }
      }
      if (tout) tenuesCompletes++
    }
    await writeCatalog('outfits', outfitsItems)
    console.log(
      `armoire <-> tenues : ${apparies} pièces appariées, ${tenuesCompletes} tenues entièrement présentes dans l'armoire`,
    )
  }
}

{
  const [en, fr] = await Promise.all([
    getJson(`${API}/relics?limit=3000`),
    getJson(`${API}/relics?limit=3000&language=fr`),
  ])
  const db = mergeRelics(en, fr)
  if (db.relics.length === 0) throw new Error('relics : catalogue vide, écriture refusée')
  await writeFile(new URL('relics.json', OUT), JSON.stringify(db))
  TOTALS.relics = db.relics.length
  console.log(`relics: ${db.relics.length} (${db.series.length} séries)`)
}

// Jalons de l'histoire principale : les succes qui marquent l'achevement de la
// trame a chaque patch. Publies a part parce qu'ils servent AVANT que le gros
// catalogue des succes (3946 entrees, seconde vague) soit arrive — sans quoi
// les objets d'histoire s'afficheraient en clair pendant plusieurs secondes,
// ce qui est exactement ce qu'on cherche a eviter.
if (MSQ.length > 0) {
  MSQ.sort((a, b) => parseFloat(a.patch) - parseFloat(b.patch))
  await writeFile(new URL('story.json', OUT), JSON.stringify(MSQ))
  console.log(`story: ${MSQ.length} jalons d'histoire, de ${MSQ[0].patch} a ${MSQ[MSQ.length - 1].patch}`)
}

// Le fichier s'appelait « premium » tant qu'il ne portait que la boutique. Il
// porte aussi la 1.0 : le nom devait suivre, sinon on cherche un jour pourquoi
// des succès traînent dans un fichier de boutique.
await writeFile(new URL('horstotal.json', OUT), JSON.stringify(HORS_TOTAL))
await writeFile(new URL('totals.json', OUT), JSON.stringify(TOTALS))
console.log(
  `hors total: ${Object.values(HORS_TOTAL).reduce((n, l) => n + l.length, 0)} objets ; ` +
    `totals: ${Object.keys(TOTALS).length} collections`,
)

await writeFile(
  new URL('meta.json', OUT),
  JSON.stringify({ updatedAt: new Date().toISOString(), source: 'https://ffxivcollect.com' }),
)
console.log('OK')
