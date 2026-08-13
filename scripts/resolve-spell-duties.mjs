// Résout le type de contenu (Donjon/Défi/Raid) des sources de sorts de magie
// bleue via la feuille ContentFinderCondition de XIVAPI, et l'écrit dans
// scripts/spell-duties.json (cache committé, clé = partie « lieu » du texte
// FFXIV Collect). À relancer à la main quand un patch ajoute des sorts.
// fetch-data.mjs lit ce cache pour retyper les sources — jamais d'appel
// XIVAPI en CI.
//
// Pourquoi : FFXIV Collect type presque toutes les sources de sorts « Other »
// (texte « Monstre / Contenu ») — le planning les ignorait donc entièrement,
// alors que la plupart des sorts se gagnent en donjon/défi/raid, idéalement
// à 4 mages bleus pour un apprentissage garanti.

import { readFile, writeFile } from 'node:fs/promises'

const CACHE = new URL('./spell-duties.json', import.meta.url)
const SPELLS = new URL('../public/data/spells.json', import.meta.url)

// Textes Collect qui ne collent pas tels quels aux noms de la CFC.
const ALIASES = {
  'The Binding Coil of Bahamut T1': 'the Binding Coil of Bahamut - Turn 1',
  'The Whorleater': 'the Whorleater (Hard)',
  'Thok Ast Thok': 'Thok ast Thok (Hard)',
}

const CONTENT_TYPES = { Dungeons: 'Dungeon', Trials: 'Trial', Raids: 'Raid' }

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-') // Tam–Tara : demi-cadratin dans les données du jeu
    .replace(/\s+/g, ' ')
    .trim()

// Feuille CFC complète (≈ 1800 lignes), paginée par curseur.
async function fetchCfc() {
  const byName = new Map()
  let after = 0
  for (;;) {
    const j = await fetch(
      `https://v2.xivapi.com/api/sheet/ContentFinderCondition?fields=Name,ContentType.Name&limit=500&after=${after}`,
    ).then((r) => r.json())
    const rows = j.rows ?? []
    if (rows.length === 0) break
    for (const row of rows) {
      const name = row.fields?.Name
      const type = CONTENT_TYPES[row.fields?.ContentType?.fields?.Name]
      if (name && type && !byName.has(norm(name))) byName.set(norm(name), { name, type })
    }
    after = rows[rows.length - 1].row_id
    await new Promise((s) => setTimeout(s, 100))
  }
  return byName
}

function lookup(byName, place) {
  const candidates = [place, ALIASES[place]].filter(Boolean)
  // Annotation de guide (« leave one head alive »…) : retirée sauf difficulté.
  const paren = place.match(/^(.*?) \(([^)]*)\)$/)
  if (paren && !/hard|extreme|savage|unreal/i.test(paren[2])) candidates.push(paren[1])
  for (const c of candidates) {
    for (const key of [norm(c), norm(`the ${c}`), norm(c).replace(/^the /, '')]) {
      const hit = byName.get(key)
      if (hit) return hit
    }
  }
  return null
}

const spells = JSON.parse(await readFile(SPELLS, 'utf8'))
const places = new Set()
for (const sp of spells) {
  for (const src of sp.sources) {
    if (src.type !== 'Other') continue
    const m = src.textEn.match(/^(.*?) \/ (.+)$/)
    if (!m) continue
    const place = m[2].trim()
    if (/masked carnivale/i.test(place)) continue // solo, reste « Other »
    if (/\(\s*\d+\s*[.,]?\s*\d*\s*,/.test(place)) continue // coordonnées : zone ouverte
    places.add(place)
  }
}

const byName = await fetchCfc()
console.log(`CFC : ${byName.size} contenus — lieux à résoudre : ${places.size}`)

const cache = {}
const misses = []
for (const place of [...places].sort()) {
  const hit = lookup(byName, place)
  if (hit) {
    // « the » minuscule des données du jeu : remis en majuscule pour l'affichage
    cache[place] = { type: hit.type, name: hit.name.replace(/^the /, 'The ') }
  } else {
    misses.push(place)
  }
}

await writeFile(CACHE, JSON.stringify(cache, null, 1))
console.log(`cache : ${Object.keys(cache).length} entrées`)
if (misses.length) console.log('non résolus (restent « Other ») :\n  ' + misses.join('\n  '))
