// Icônes des pièces de tenues : FFXIV Collect ne donne que l'id et le nom de
// chaque pièce, l'icône vient de la feuille Item de XIVAPI (par lots de 100).
// Résultat committé dans scripts/piece-icons.json ; fetch-data.mjs l'attache,
// jamais d'appel XIVAPI en CI. À relancer quand un patch ajoute des tenues.

import { readFile, writeFile } from 'node:fs/promises'

const CACHE = new URL('./piece-icons.json', import.meta.url)
const OUTFITS = new URL('../public/data/outfits.json', import.meta.url)

const outfits = JSON.parse(await readFile(OUTFITS, 'utf8'))
let cache = {}
try {
  cache = JSON.parse(await readFile(CACHE, 'utf8'))
} catch {
  // premier passage
}

const wanted = [...new Set(outfits.flatMap((o) => (o.pieces ?? []).map((p) => p.id)))]
const missing = wanted.filter((id) => !(id in cache))
console.log(`pièces : ${wanted.length}, à résoudre : ${missing.length}`)

for (let i = 0; i < missing.length; i += 100) {
  const batch = missing.slice(i, i + 100)
  const res = await fetch(
    `https://v2.xivapi.com/api/sheet/Item?rows=${batch.join(',')}&fields=Icon,EquipSlotCategory`,
  )
  if (!res.ok) {
    console.log('  lot en erreur HTTP', res.status, '- on continue')
    continue
  }
  const j = await res.json()
  for (const row of j.rows ?? []) {
    const iconId = row.fields?.Icon?.id
    // catégorie d'emplacement (3 tête, 4 torse, 5 mains, 7 jambes, 8 pieds…)
    const slot = row.fields?.EquipSlotCategory?.value ?? 0
    if (iconId) cache[row.row_id] = { icon: String(iconId).padStart(6, '0'), slot }
  }
  console.log(`  … ${Math.min(i + 100, missing.length)}/${missing.length}`)
  await new Promise((r) => setTimeout(r, 120))
}

await writeFile(CACHE, JSON.stringify(cache, null, 1))
console.log(`cache : ${Object.keys(cache).length} icônes`)
