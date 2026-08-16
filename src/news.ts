import { KINDS, type Character, type Item, type Kind } from './api'
import type { Lang } from './i18n'
import type { Db } from './store'

// « Notes de patch » côté collections : ce que chaque mise à jour a ajouté aux
// quatorze listes. Rien de neuf à télécharger pour le savoir — chaque objet des
// catalogues porte déjà son numéro de patch, et deux passes sur la base déjà
// chargée suffisent. Un fichier calculé la nuit aurait fait un aller-retour de
// plus par visiteur et aurait pu se désynchroniser des catalogues qu'il décrit.
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
  items: Item[]
  /** Combien manquent encore à au moins un des persos suivis. null = pas d'info. */
  missing: number | null
  /** Les identifiants concernés, pour marquer les objets un par un. */
  missingIds: Set<number>
}

export interface News {
  /** Libellé du patch tel que le jeu le nomme (« 7.55 »). */
  patch: string
  lines: NewsLine[]
  total: number
  missing: number | null
}

/** Les patchs qui ont apporté quelque chose, du plus récent au plus ancien.
 *  Le libellé est un décimal (7.5 < 7.55) et les vieux « 3.55a » se comparent
 *  très bien une fois leur suffixe ignoré. */
export function patchList(db: Db | null): string[] {
  if (!db) return []
  const compte = new Map<string, number>()
  for (const k of KINDS) {
    for (const it of db[k]) {
      if (!it.patch) continue
      compte.set(it.patch, (compte.get(it.patch) ?? 0) + 1)
    }
  }
  return [...compte.entries()]
    .filter(([, n]) => n >= MIN_OBJETS)
    .map(([p]) => p)
    .sort((a, b) => parseFloat(b) - parseFloat(a))
}

/** Ce qu'un patch a apporté, et ce qu'il en manque aux persos suivis.
 *  Sans `patch`, c'est le dernier connu. */
export function patchNews(
  db: Db | null,
  chars: { data: Character }[],
  patch?: string,
): News | null {
  if (!db) return null
  const cible = patch ?? patchList(db)[0]
  if (!cible) return null

  const lines: NewsLine[] = []
  let total = 0
  let manquants: number | null = null
  for (const k of KINDS) {
    const items = db[k].filter((it) => it.patch === cible)
    if (items.length === 0) continue
    total += items.length

    // « À trouver » : sur les persos dont la collection nous est connue. Un
    // perso non synchronisé afficherait tout comme manquant, ce qui serait faux.
    const suivis = chars.filter((c) => c.data[k]?.isPublic)
    const missingIds = new Set<number>()
    let miss: number | null = null
    if (suivis.length > 0) {
      const possede = suivis.map((c) => new Set(c.data[k].ids))
      for (const it of items) {
        if (boutique(it.sources)) continue
        if (possede.some((set) => !set.has(it.id))) missingIds.add(it.id)
      }
      miss = missingIds.size
      manquants = (manquants ?? 0) + miss
    }
    lines.push({ kind: k, items, missing: miss, missingIds })
  }
  if (lines.length === 0) return null

  // Ce qu'il reste à chercher d'abord : c'est la seule ligne qui appelle un geste.
  lines.sort((a, b) => (b.missing ?? 0) - (a.missing ?? 0) || b.items.length - a.items.length)
  return { patch: cible, lines, total, missing: manquants }
}

/** Notes officielles de la mise à jour, sur le Lodestone. Square Enix ne donne
 *  pas d'adresse par patch qu'on puisse deviner (chaque note est un billet à
 *  identifiant opaque) : on ouvre donc leurs archives, dans la langue du site,
 *  où le patch cherché est le premier de la liste. */
export function patchNotesUrl(lang: Lang): string {
  const site = lang === 'fr' ? 'fr' : 'na'
  return `https://${site}.finalfantasyxiv.com/lodestone/special/patchnote_log/`
}
