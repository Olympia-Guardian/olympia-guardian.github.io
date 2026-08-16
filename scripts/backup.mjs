// Sauvegarde de la base de production.
//
// Ce que contient D1 n'est pas récupérable : les montures et mascottes se
// re-scrapent depuis le Lodestone, mais les onze collections cochées à la main
// par les joueurs sont perdues définitivement si la base disparaît.
//
// Pourquoi un script local et non une action planifiée : le dépôt est PUBLIC,
// et sur un dépôt public les artefacts d'action sont téléchargeables par tout
// le monde. Y déposer un export contenant comptes, sessions et identifiants
// Discord serait une fuite. Le jour où le dépôt passera en privé, ce script
// pourra être appelé par un cron sans rien changer.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const DOSSIER = 'backups'
// On garde un mois : au-delà, une donnée effacée par erreur a de toute façon
// été remplacée partout ailleurs.
const GARDER = 30

mkdirSync(DOSSIER, { recursive: true })
const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const sortie = join(DOSSIER, `ogs-${horodatage}.sql`)

// L'export échoue parfois pour rien : l'API de Cloudflare renvoie une erreur
// d'authentification passagère, et la même commande relancée aussitôt réussit.
// Sans reprise, un hoquet de dix secondes coûtait la sauvegarde de la journée.
const ESSAIS = 3
const ATTENTE_MS = 20_000

const dodo = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

console.log('export de la base de production…')
for (let essai = 1; ; essai++) {
  try {
    execFileSync(
      'npx',
      [
        'wrangler@4.121.0',
        'd1',
        'export',
        'ogs-rooms',
        '--remote',
        '--config',
        'worker/wrangler.toml',
        '--output',
        sortie,
      ],
      { stdio: 'inherit', shell: true },
    )
    break
  } catch (e) {
    if (essai >= ESSAIS) throw e
    console.warn(`tentative ${essai}/${ESSAIS} échouée, nouvelle tentative dans 20 s`)
    dodo(ATTENTE_MS)
  }
}

const taille = statSync(sortie).size
if (taille < 1024) {
  throw new Error(`export suspect : ${taille} octets, sauvegarde probablement vide`)
}
console.log(`écrit : ${sortie} (${(taille / 1024).toFixed(0)} Ko)`)

// Rotation : on ne laisse pas le dossier grossir indéfiniment.
const anciens = readdirSync(DOSSIER)
  .filter((f) => f.startsWith('ogs-') && f.endsWith('.sql'))
  .sort()
  .reverse()
for (const f of anciens.slice(GARDER)) {
  unlinkSync(join(DOSSIER, f))
  console.log(`retiré : ${f}`)
}
console.log(`${Math.min(anciens.length, GARDER)} sauvegarde(s) conservée(s)`)
