// Le journal des modifications, tiré de l'historique git.
//
// Les messages de commit de ce dépôt racontent déjà chaque changement : quoi,
// pourquoi, et ce qui a failli mal tourner. Les recopier dans un fichier tenu à
// la main, c'est la double saisie assurée et le journal qui ment au premier
// oubli. On les publie donc tels quels, en JSON, au moment du build.
//
// Le fichier N'EST PAS committé (.gitignore) : committé, chaque commit le
// rendrait obsolète et le commit qui le rafraîchit le rendrait obsolète à son
// tour. Généré au build, il est toujours juste. En CI, le checkout doit donc
// ramener l'historique entier (fetch-depth: 0 dans deploy.yml).
//
// Les commits « Data : ... » (le cron nocturne) sont écartés : trois lignes par
// jour qui disent toutes la même chose ne sont pas un journal.

import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

const OUT = new URL('../public/data/changelog.json', import.meta.url)

// \x1f sépare les champs, \x1e les commits : aucun des deux ne peut apparaître
// dans un message.
const brut = execFileSync(
  'git',
  ['log', '--pretty=format:%h%x1f%aI%x1f%B%x1e', '--no-merges'],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
)

const entrees = []
for (const bloc of brut.split('\x1e')) {
  const [hash, date, message] = bloc.split('\x1f')
  if (!hash?.trim() || !message) continue
  const texte = message.trim()
  if (/^Data\s*:/.test(texte)) continue

  // La première phrase fait le titre, le reste le récit. Les messages de ce
  // dépôt sont des paragraphes, pas des sujets de 50 caractères : couper au
  // premier point rend un titre lisible sans rien perdre, le récit reprend
  // le message entier.
  const point = texte.indexOf('. ')
  const premierRetour = texte.indexOf('\n')
  let fin = texte.length
  if (point >= 0) fin = Math.min(fin, point + 1)
  if (premierRetour >= 0) fin = Math.min(fin, premierRetour)
  const titre = texte.slice(0, fin).trim()
  const recit = texte.slice(fin).trim()

  entrees.push({
    hash: hash.trim(),
    date: date?.slice(0, 10) ?? '',
    titre,
    ...(recit ? { recit } : {}),
  })
}

await writeFile(OUT, JSON.stringify({ entrees }))
console.log(`changelog : ${entrees.length} entrées`)
