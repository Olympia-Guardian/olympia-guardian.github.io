// Récupère les bases FFXIV Collect (EN+FR fusionnées, même format que src/api.ts)
// et les écrit dans public/data/ — servies ensuite par notre propre hébergement
// pour ne solliciter FFXIV Collect qu'une fois par jour au lieu d'une fois par
// utilisateur. Lancé par .github/workflows/data.yml (cron quotidien).

import { mkdir, writeFile } from 'node:fs/promises'

const API = 'https://ffxivcollect.com/api'
const OUT = new URL('../public/data/', import.meta.url)

const KIND_PATHS = {
  mounts: 'mounts',
  minions: 'minions',
  cards: 'triad/cards',
  fashions: 'fashions',
  orchestrions: 'orchestrions',
  spells: 'spells',
}

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
    }
  })
  return { series: [...seriesMap.values()], relics }
}

await mkdir(OUT, { recursive: true })

for (const [kind, path] of Object.entries(KIND_PATHS)) {
  const [en, fr] = await Promise.all([
    getJson(`${API}/${path}?limit=1000`),
    getJson(`${API}/${path}?limit=1000&language=fr`),
  ])
  const items = mergeDb(en, fr)
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
