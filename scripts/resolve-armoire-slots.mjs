// Emplacement d'équipement des entrées de l'armoire : Collect ne le donne pas
// et la planche d'icônes ne suffit pas (la 048 mélange bracelets et robes).
// Deux passes : correspondance d'icône avec piece-icons.json (déjà résolu via
// la feuille Item), puis recherche XIVAPI par nom anglais pour le reste.
// Résultat committé dans scripts/armoire-slots.json ({id Collect: slot}) ;
// fetch-data.mjs l'attache, jamais d'appel XIVAPI en CI.
// Valeurs : 1/2/13 mains (armes ou outils), 3 tête, 4 torse, 5 mains, 7 jambes,
// 8 pieds, 9 oreilles, 10 cou, 11 poignets, 12 doigts.

import { readFile, writeFile } from 'node:fs/promises'

const CACHE = new URL('./armoire-slots.json', import.meta.url)
const ARMOIRES = new URL('../public/data/armoires.json', import.meta.url)
const PIECES = new URL('./piece-icons.json', import.meta.url)

const armoires = JSON.parse(await readFile(ARMOIRES, 'utf8'))
const pieces = JSON.parse(await readFile(PIECES, 'utf8'))
let cache = {}
try {
  cache = JSON.parse(await readFile(CACHE, 'utf8'))
} catch {
  // premier passage
}

const iconSlot = new Map()
for (const v of Object.values(pieces)) if (!iconSlot.has(v.icon)) iconSlot.set(v.icon, v.slot)

const norm = (s) => s.toLowerCase().replace(/[’']/g, '')
async function searchSlot(nameEn) {
  const q = encodeURIComponent(`Name~"${nameEn.replace(/"/g, '')}"`)
  const res = await fetch(
    `https://v2.xivapi.com/api/search?sheets=Item&query=${q}&fields=Name,EquipSlotCategory&limit=6`,
  )
  if (!res.ok) return null
  const j = await res.json()
  const hit = (j.results ?? []).find((r) => norm(r.fields.Name) === norm(nameEn))
  return hit?.fields?.EquipSlotCategory?.value ?? null
}

let viaIcon = 0
const missing = []
for (const it of armoires) {
  if (it.id in cache) continue
  const m = String(it.icon).match(/(\d{6})_hr1/)
  const slot = m ? iconSlot.get(m[1]) : undefined
  if (slot !== undefined) {
    cache[it.id] = slot
    viaIcon++
  } else missing.push(it)
}
console.log(`entrées : ${armoires.length}, via icônes : ${viaIcon}, à chercher : ${missing.length}`)

let n = 0
for (const it of missing) {
  const slot = await searchSlot(it.nameEn)
  if (slot !== null) cache[it.id] = slot
  n++
  if (n % 50 === 0) console.log(`  … ${n}/${missing.length}`)
  await new Promise((r) => setTimeout(r, 130))
}

await writeFile(CACHE, JSON.stringify(cache, null, 1))
const unresolved = armoires.filter((it) => !(it.id in cache))
console.log(`cache : ${Object.keys(cache).length} emplacements, non résolus : ${unresolved.length}`)
for (const it of unresolved.slice(0, 15)) console.log('  ?', it.nameEn)
