// Applique les schémas D1 manquants, dans l'ordre, et s'en souvient.
//
// Quatorze fichiers schema-*.sql s'appliquaient de tête, un par un, avec la
// règle « le schéma avant le worker » retenue de mémoire. Ça a failli casser
// une fois : raid_bis attendait sur le disque pendant que le worker qui le
// lisait partait en production. Un déploiement solide ne repose pas sur la
// mémoire de qui déploie.
//
// Une table `migrations` dans la base note ce qui est passé. Ce script compare,
// applique ce qui manque dans l'ordre d'arrivée des fichiers, et enregistre.
// Les fichiers déjà appliqués à la main s'enregistrent sans s'exécuter avec
// --baseline (un ALTER TABLE rejoué échoue, lui).
//
//   node scripts/migrate.mjs                 état local, applique ce qui manque
//   node scripts/migrate.mjs --remote        pareil, base de production
//   node scripts/migrate.mjs --baseline      marque tout comme applique (1re fois)
//   node scripts/migrate.mjs --dry           liste sans rien toucher

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// L'ordre d'ARRIVÉE des fichiers, pas l'ordre alphabétique : une base neuve se
// construit en rejouant l'histoire, et schema-base doit passer avant tout. Un
// nouveau schéma s'ajoute EN FIN de liste, jamais au milieu.
const ORDRE = [
  'schema-base.sql',
  'schema-groups.sql',
  'schema-groups-v2.sql',
  'schema-chars-v2.sql',
  'schema-contacts.sql',
  'schema-suggestions.sql',
  'schema-index.sql',
  'schema-reports.sql',
  'schema-metrics.sql',
  'schema-removals.sql',
  'schema-alias.sql',
  'schema-raid.sql',
  'schema-raid-bis.sql',
  'schema-flags.sql',
]

const remote = process.argv.includes('--remote')
const baseline = process.argv.includes('--baseline')
const dry = process.argv.includes('--dry')

// Les deux versions de wrangler du dépôt : la plus récente casse le mode
// distant, l'ancienne le mode local (voir package.json).
const WRANGLER = remote ? 'wrangler@4.121.0' : 'wrangler@4.122.0'
const CIBLE = remote ? '--remote' : '--local'

function d1(args) {
  // shell: true est obligatoire pour npx sous Windows, mais il resplit les
  // arguments sur les espaces : une commande SQL doit donc porter ses propres
  // guillemets. Aucun de nos ordres ne contient de guillemet double.
  const cites = args.map((a) => (a.includes(' ') ? `"${a}"` : a))
  return execFileSync(
    'npx',
    [WRANGLER, 'd1', 'execute', 'ogs-rooms', CIBLE, '--json', ...cites],
    { encoding: 'utf8', cwd: new URL('../worker/', import.meta.url), shell: true },
  )
}

function resultats(brut) {
  const j = JSON.parse(brut)
  return (Array.isArray(j) ? j[0] : j)?.results ?? []
}

// -- ce qui est déjà passé ---------------------------------------------------

d1(['--command', 'CREATE TABLE IF NOT EXISTS migrations (nom TEXT PRIMARY KEY, applique INTEGER NOT NULL)'])
const faites = new Set(resultats(d1(['--command', 'SELECT nom FROM migrations'])).map((r) => r.nom))

const manquantes = ORDRE.filter((n) => !faites.has(n))
const inconnues = [...faites].filter((n) => !ORDRE.includes(n))
if (inconnues.length > 0) {
  // Une migration enregistrée que le script ne connaît pas : quelqu'un a
  // contourné la liste. On le dit, on ne devine pas.
  console.warn(`attention : enregistrées mais hors liste : ${inconnues.join(', ')}`)
}

console.log(`${remote ? 'PRODUCTION' : 'local'} : ${faites.size} appliquée(s), ${manquantes.length} manquante(s)`)
if (manquantes.length === 0) process.exit(0)

if (dry) {
  for (const n of manquantes) console.log(`  à appliquer : ${n}`)
  process.exit(0)
}

// -- application -------------------------------------------------------------

for (const nom of manquantes) {
  if (!existsSync(new URL(`../worker/${nom}`, import.meta.url))) {
    throw new Error(`${nom} est dans la liste mais absent du disque`)
  }
  if (!baseline) {
    d1(['--file', nom])
  }
  d1(['--command', `INSERT INTO migrations (nom, applique) VALUES ('${nom}', ${Date.now()})`])
  console.log(`  ${baseline ? 'enregistrée (baseline)' : 'appliquée'} : ${nom}`)
}
console.log('terminé')
