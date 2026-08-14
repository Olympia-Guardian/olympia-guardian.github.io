// Clone la base D1 de PROD vers la base locale de `wrangler dev --local`.
// Lecture seule côté prod (export) — aucune écriture remote, aucun risque.
//
// Usage : npm run dev:pull   (puis npm run dev:worker + npm run dev:local)
//
// Après le pull, la base locale contient TOUT : comptes, sessions, persos,
// groupes, contacts… Ta session du navigateur (jeton prod) marche donc telle
// quelle sur le worker local — connecté, admin, avec les vraies données.
//
// La remise à zéro passe par un DROP de toutes les tables (et non la
// suppression du dossier d'état) : ça fonctionne même si `dev:worker`
// tourne — sur Windows, le dossier serait verrouillé (EBUSY).

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WORKER = fileURLToPath(new URL('../worker/', import.meta.url))
const run = (cmd) => execSync(cmd, { cwd: WORKER, stdio: 'inherit' })
const capture = (cmd) => execSync(cmd, { cwd: WORKER }).toString()

console.log('1/3 — export de la base de prod (lecture seule)…')
run('npx wrangler@4.121.0 d1 export ogs-rooms --remote --output=.dev-dump.sql')

console.log('2/3 — remise à zéro de la base locale (DROP des tables)…')
const out = capture(
  'npx wrangler@4.122.0 d1 execute ogs-rooms --local --json --command "SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\' AND name NOT LIKE \'_cf%\'"',
)
const tables = JSON.parse(out.slice(out.indexOf('[')))
  .flatMap((r) => r.results)
  .map((r) => r.name)
if (tables.length > 0) {
  const drops = tables.map((n) => `DROP TABLE IF EXISTS ${n};`).join(' ')
  run(`npx wrangler@4.122.0 d1 execute ogs-rooms --local --command "${drops}"`)
}

console.log('3/3 — import dans la base locale…')
run('npx wrangler@4.122.0 d1 execute ogs-rooms --local --file=.dev-dump.sql')

console.log('\nOK — lance `npm run dev:worker` puis `npm run dev:local`.')
