// Résout la catégorie de classe (jobs) de chaque relique arme/ultimate/GARO
// via XIVAPI, et l'écrit dans scripts/relic-jobs.json (cache committé, clé =
// nom anglais). À relancer à la main quand un patch ajoute des reliques :
// seuls les noms absents du cache sont interrogés. fetch-data.mjs lit ce
// cache pour attacher `jobs` aux reliques — jamais d'appel XIVAPI en CI.

import { readFile, writeFile } from 'node:fs/promises'

const CACHE = new URL('./relic-jobs.json', import.meta.url)
const RELICS = new URL('../public/data/relics.json', import.meta.url)

const db = JSON.parse(await readFile(RELICS, 'utf8'))
let cache = {}
try {
  cache = JSON.parse(await readFile(CACHE, 'utf8'))
} catch {
  // premier passage : cache vide
}

const wanted = db.relics
  .filter((r) => {
    const s = db.series.find((x) => x.key === r.series)
    return s && s.category !== 'armor' && s.category !== 'tools'
  })
  // GARO : armes seulement (les pièces d'armure sont triées par set)
  .filter((r) => !/^The \w+ of /.test(r.nameEn))
  .map((r) => r.nameEn)

const missing = [...new Set(wanted)].filter((n) => !cache[n])
console.log(`reliques concernées : ${new Set(wanted).size} — à résoudre : ${missing.length}`)

let done = 0
for (const name of missing) {
  try {
    const q = encodeURIComponent(`Name~"${name.replace(/"/g, '')}"`)
    const j = await fetch(
      `https://v2.xivapi.com/api/search?sheets=Item&query=${q}&fields=Name,ClassJobCategory.Name&limit=3`,
    ).then((r) => r.json())
    const rows = j.results ?? []
    const r = rows.find((x) => x.fields.Name.toLowerCase() === name.toLowerCase()) ?? rows[0]
    const cat = r?.fields?.ClassJobCategory?.fields?.Name
    if (cat) cache[name] = cat
    else console.log('  introuvable :', name)
  } catch (e) {
    console.log('  erreur :', name, e.message)
  }
  done++
  if (done % 100 === 0) {
    console.log(`  … ${done}/${missing.length}`)
    await writeFile(CACHE, JSON.stringify(cache, null, 1))
  }
  await new Promise((s) => setTimeout(s, 60))
}

await writeFile(CACHE, JSON.stringify(cache, null, 1))
console.log(`cache : ${Object.keys(cache).length} entrées`)
