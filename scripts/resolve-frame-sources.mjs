// Construit les voies d'obtention des kits d'encadrement (portraits), que
// FFXIV Collect ne fournit pas : l'id d'objet vient de XIVAPI, l'acquisition
// (PNJ, monnaies, hauts faits, quêtes) de Garland Tools, en anglais et en
// français. Résultat committé dans scripts/frame-sources.json ; fetch-data.mjs
// l'attache aux portraits, jamais d'appel réseau en CI. À relancer à la main
// quand un patch ajoute des kits : seuls les manquants sont interrogés.

import { readFile, writeFile } from 'node:fs/promises'

const CACHE = new URL('./frame-sources.json', import.meta.url)
const FRAMES = new URL('../public/data/frames.json', import.meta.url)

const frames = JSON.parse(await readFile(FRAMES, 'utf8'))
let cache = {}
try {
  cache = JSON.parse(await readFile(CACHE, 'utf8'))
} catch {
  // premier passage
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.json()
}

/** Id de l'objet : recherche XIVAPI sur un extrait sans apostrophe, puis
 *  correspondance exacte (insensible à la casse et aux apostrophes). */
const norm = (s) => s.toLowerCase().replace(/[’']/g, '')
async function findItemId(nameEn) {
  const probe = nameEn.replace(/'s Framer's Kit$/i, '').replace(/ Framer's Kit$/i, '')
  // Les apostrophes font partie des noms (Vana'diel) : seuls les guillemets sautent.
  const q = encodeURIComponent(`Name~"${probe.replace(/"/g, '')} Framer"`)
  const j = await getJson(
    `https://v2.xivapi.com/api/search?sheets=Item&query=${q}&fields=Name&limit=6`,
  )
  const hit = (j.results ?? []).find((r) => norm(r.fields.Name) === norm(nameEn))
  return hit?.row_id ?? null
}

/** Monnaie -> type de source dans la taxonomie FFXIV Collect. */
function currencyType(nameEn) {
  if (/MGP/i.test(nameEn)) return 'Gold Saucer'
  if (/seafarer|islander/i.test(nameEn)) return 'Island Sanctuary'
  if (/skybuilders/i.test(nameEn)) return 'Skybuilders'
  if (/bicolor/i.test(nameEn)) return 'Purchase'
  return 'Purchase'
}

/** Fiche Garland -> nos sources {type, text, textEn}. */
function buildSources(en, fr) {
  const pEn = new Map((en.partials ?? []).map((p) => [`${p.type}:${p.id}`, p.obj]))
  const pFr = new Map((fr?.partials ?? []).map((p) => [`${p.type}:${p.id}`, p.obj]))
  const nameOf = (map, type, id) => map.get(`${type}:${id}`)?.n ?? null
  const it = en.item
  const sources = []

  for (const achId of it.achievements ?? []) {
    const nEn = nameOf(pEn, 'achievement', String(achId))
    const nFr = nameOf(pFr, 'achievement', String(achId)) ?? nEn
    if (nEn) sources.push({ type: 'Achievement', text: nFr, textEn: nEn })
  }
  for (const qId of it.quests ?? []) {
    const nEn = nameOf(pEn, 'quest', String(qId))
    const nFr = nameOf(pFr, 'quest', String(qId)) ?? nEn
    if (nEn) sources.push({ type: 'Quest', text: nFr, textEn: nEn })
  }
  if ((it.vendors ?? []).length > 0 && it.price) {
    const npcEn = nameOf(pEn, 'npc', String(it.vendors[0]))
    const npcFr = nameOf(pFr, 'npc', String(it.vendors[0])) ?? npcEn
    sources.push({
      type: 'Purchase',
      text: `${npcFr ?? 'PNJ'} - ${it.price.toLocaleString('fr-FR')} gils`,
      textEn: `${npcEn ?? 'NPC'} - ${it.price.toLocaleString('en-US')} gil`,
    })
  }
  for (const shop of it.tradeShops ?? []) {
    const npcId = shop.npcs?.[0]
    const npcEn = npcId ? nameOf(pEn, 'npc', String(npcId)) : null
    const npcFr = npcId ? (nameOf(pFr, 'npc', String(npcId)) ?? npcEn) : null
    const cur = shop.listings?.[0]?.currency?.[0]
    if (!cur) continue
    const curEn = nameOf(pEn, 'item', String(cur.id)) ?? '?'
    const curFr = nameOf(pFr, 'item', String(cur.id)) ?? curEn
    const amount = Number(cur.amount ?? 0)
    sources.push({
      type: currencyType(curEn),
      text: `${npcFr ? npcFr + ' - ' : ''}${amount.toLocaleString('fr-FR')} ${curFr}`,
      textEn: `${npcEn ? npcEn + ' - ' : ''}${amount.toLocaleString('en-US')} ${curEn}`,
    })
  }
  return sources
}

// --retry : re-tente aussi les entrées restées vides (échec réseau, apostrophes…)
const RETRY = process.argv.includes('--retry')
const missing = frames.filter((f) => !(f.id in cache) || (RETRY && cache[f.id].length === 0))
console.log(`portraits : ${frames.length}, à résoudre : ${missing.length}`)

let done = 0
for (const f of missing) {
  const label = f.itemNameEn ?? f.nameEn
  try {
    const itemId = await findItemId(label)
    if (!itemId) {
      console.log('  objet introuvable :', label)
      cache[f.id] = []
    } else {
      await sleep(80)
      const en = await getJson(`https://garlandtools.org/db/doc/item/en/3/${itemId}.json`)
      await sleep(80)
      let fr = null
      try {
        fr = await getJson(`https://garlandtools.org/db/doc/item/fr/3/${itemId}.json`)
      } catch {
        // fiche FR absente : les textes EN serviront
      }
      const sources = buildSources(en, fr)
      cache[f.id] = sources
      if (sources.length === 0) console.log('  sans acquisition connue :', label)
    }
  } catch (e) {
    console.log('  erreur :', label, e.message)
  }
  done++
  if (done % 25 === 0) {
    console.log(`  … ${done}/${missing.length}`)
    await writeFile(CACHE, JSON.stringify(cache, null, 1))
  }
  await sleep(80)
}

await writeFile(CACHE, JSON.stringify(cache, null, 1))
const filled = Object.values(cache).filter((s) => s.length > 0).length
console.log(`cache : ${Object.keys(cache).length} entrées, ${filled} avec sources`)
