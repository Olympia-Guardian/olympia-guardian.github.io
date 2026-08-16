import { KINDS, type Character, type Kind } from './api'
import type { Db } from './store'

// « Quoi de neuf » côté jeu : ce que le dernier patch a ajouté aux collections.
// Rien de neuf à télécharger pour le savoir — chaque objet des catalogues porte
// déjà son numéro de patch, et deux passes sur la base déjà chargée suffisent.
// Un fichier calculé la nuit aurait fait un aller-retour de plus par visiteur
// et aurait pu se désynchroniser des catalogues qu'il prétend décrire.
//
// À ne pas confondre avec digest.tsx, qui raconte ce que TES persos ont gagné
// depuis ta dernière visite : ici c'est le jeu qui bouge, pas le joueur.

/** Un patch qui n'a que deux entrées n'est pas un patch : c'est FFXIV Collect
 *  qui a pris de l'avance sur un objet connu avant sa sortie. On attend d'en
 *  voir assez avant d'annoncer une nouveauté, sinon on annonce le vide. */
const MIN_OBJETS = 3

/** Objets de la boutique : ils comptent comme nouveautés (ils existent), mais
 *  jamais dans « à trouver ». Le reste de l'application tient la même ligne —
 *  on ne pousse personne à sortir la carte bleue pour compléter une liste. */
const boutique = (sources: { type: string }[]) => sources.some((s) => s.type === 'Premium')

export interface NewsLine {
  kind: Kind
  /** Identifiants des nouveautés : servent aussi à filtrer la collection. */
  ids: number[]
  /** Combien manquent encore à au moins un de mes persos. null = pas d'info. */
  missing: number | null
}

export interface News {
  /** Libellé du patch tel que le jeu le nomme (« 7.55 »). */
  patch: string
  lines: NewsLine[]
  total: number
  missing: number | null
}

/** Nouveautés du dernier patch, et ce qu'il en manque aux persos suivis. */
export function patchNews(db: Db | null, chars: { data: Character }[]): News | null {
  if (!db) return null

  // 1) Quel est le dernier patch ? Le libellé est un décimal (7.5 < 7.55), et
  //    les vieux « 3.55a » se comparent très bien une fois le suffixe ignoré.
  const compte = new Map<string, number>()
  for (const k of KINDS) {
    for (const it of db[k]) {
      if (!it.patch) continue
      compte.set(it.patch, (compte.get(it.patch) ?? 0) + 1)
    }
  }
  const patch = [...compte.entries()]
    .filter(([, n]) => n >= MIN_OBJETS)
    .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))[0]?.[0]
  if (!patch) return null

  // 2) Ce que ce patch a apporté, collection par collection.
  const lines: NewsLine[] = []
  let total = 0
  let manquants: number | null = null
  for (const k of KINDS) {
    const items = db[k].filter((it) => it.patch === patch)
    if (items.length === 0) continue
    total += items.length

    // « À trouver » : sur les persos dont la collection nous est connue. Un
    // perso non synchronisé afficherait tout comme manquant, ce qui serait faux.
    const suivis = chars.filter((c) => c.data[k]?.isPublic)
    let miss: number | null = null
    if (suivis.length > 0) {
      const possede = suivis.map((c) => new Set(c.data[k].ids))
      miss = items.filter(
        (it) => !boutique(it.sources) && possede.some((set) => !set.has(it.id)),
      ).length
      manquants = (manquants ?? 0) + miss
    }
    lines.push({ kind: k, ids: items.map((it) => it.id), missing: miss })
  }
  if (lines.length === 0) return null

  // Ce qu'il reste à chercher d'abord : c'est la seule ligne qui demande une action.
  lines.sort((a, b) => (b.missing ?? 0) - (a.missing ?? 0) || b.ids.length - a.ids.length)
  return { patch, lines, total, missing: manquants }
}
