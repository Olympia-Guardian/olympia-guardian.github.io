// La ronde de nuit FFXIV Collect, exécutée par GitHub Actions.
//
// Elle tourne ICI et non dans le worker, et ce n'est pas un choix d'esthétique :
// la protection anti-bot de FFXIV Collect bloque les requêtes venant des
// Workers Cloudflare (403 de défi, vérifié depuis leur réseau). Les runners
// GitHub, eux, passent — le rafraîchissement des catalogues le prouve chaque
// nuit depuis des semaines.
//
// Le worker fournit la liste des personnages et fusionne ce qu'on lui apporte,
// derrière un secret partagé (SYNC_TOKEN, posé des deux côtés). La fusion
// n'efface jamais rien : une coche faite dans Codex survit à tout.
//
// Un échec sur UN personnage n'arrête pas la ronde, et une panne complète de
// Collect ne fait pas échouer le workflow : demain est un autre passage.

const WORKER = process.env.WORKER_API || 'https://ogs-room.olympia-guardian.workers.dev'
const COLLECT = 'https://ffxivcollect.com/api'
const TOKEN = process.env.SYNC_TOKEN

if (!TOKEN) {
  console.error('SYNC_TOKEN absent : rien à faire')
  process.exit(1)
}

const KINDS = [
  'cards', 'fashions', 'facewear', 'hairstyles', 'outfits', 'armoires',
  'bardings', 'emotes', 'frames', 'orchestrions', 'spells', 'achievements',
]

async function json(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

/** Ce que Collect sait d'un perso, au format de nos collections. Null si leur
 *  base ne le connaît pas : ce n'est pas une erreur, juste une fiche absente. */
async function lireCollect(id) {
  let d
  try {
    d = await json(`${COLLECT}/characters/${id}?ids=true`)
  } catch {
    return null
  }
  const doc = {}
  for (const kind of KINDS) {
    const ids = d?.[kind]?.ids
    if (Array.isArray(ids)) doc[kind] = ids.filter((n) => Number.isInteger(n) && n > 0)
  }
  const relics = [
    ...new Set(
      ['weapons', 'ultimate', 'armor', 'tools'].flatMap((g) =>
        Array.isArray(d?.relics?.[g]?.ids) ? d.relics[g].ids : [],
      ),
    ),
  ]
  if (relics.length > 0) doc.relics = relics
  return Object.keys(doc).length > 0 ? doc : null
}

const entetes = { 'X-Sync-Token': TOKEN }
const { ids } = await json(`${WORKER}/sync/targets`, { headers: entetes })
console.log(`${ids.length} personnage(s) à relire`)

let ok = 0
let absents = 0
let ajouts = 0
for (const id of ids) {
  let doc
  try {
    doc = await lireCollect(id)
  } catch {
    doc = null
  }
  if (!doc) {
    absents++
    continue
  }
  try {
    const r = await json(`${WORKER}/sync/collect/${id}`, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify(doc),
    })
    ok++
    ajouts += r.added ?? 0
  } catch (e) {
    console.error(`  ${id} : fusion refusée (${e.message})`)
  }
  // Un souffle entre deux lectures : leur API n'a rien demandé, on ne la
  // martèle pas pour gagner dix secondes sur une ronde de nuit.
  await new Promise((r) => setTimeout(r, 500))
}

console.log(`ronde : ${ok} synchronisé(s), ${absents} inconnu(s) de Collect, ${ajouts} entrée(s) ajoutée(s)`)
