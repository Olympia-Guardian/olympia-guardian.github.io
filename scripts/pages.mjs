// Une page HTML par chemin de l'application.
//
// GitHub Pages ne route rien : sans fichier, /journal répond 404 au premier
// chargement comme au rechargement. On copie donc index.html dans un dossier
// par section. Chacune répond alors 200, se met en favori et s'indexe.
//
// La liste DOIT rester d'accord avec CHEMINS dans src/routes.ts. Un chemin
// ajouté là et oublié ici marche pendant la navigation (history.replaceState
// ne demande rien au serveur) et casse au rechargement : la panne se voit
// tard, et seulement chez celui qui rafraîchit.
//
// 404.html est le filet : une adresse inconnue sert quand même l'application,
// qui retombe sur le planning au lieu d'afficher la page d'erreur de GitHub.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'

const CHEMINS = [
  'collections',
  'progress',
  'journal',
  'groups',
  'market',
  'patch-notes',
  'guide',
  'account',
  'login',
  'admin',
]

const source = join(DIST, 'index.html')
readFileSync(source) // échoue franchement si le build n'a pas eu lieu

for (const chemin of CHEMINS) {
  mkdirSync(join(DIST, chemin), { recursive: true })
  copyFileSync(source, join(DIST, chemin, 'index.html'))
}
copyFileSync(source, join(DIST, '404.html'))

console.log(`pages : ${CHEMINS.length} chemins + 404.html`)
