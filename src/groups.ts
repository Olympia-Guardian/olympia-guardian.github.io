// Multi-groupes : un navigateur peut être membre de plusieurs groupes (sa
// statique, ses amis…). On mémorise des « groupes enregistrés » (nom + hash
// d'URL), et changer de groupe = réinitialiser le roster local puis recharger
// sur le hash cible — l'état complet se reconstruit proprement.

export interface SavedGroup {
  name: string
  hash: string // "r=ogs-…" (salon) ou "g=id1.id2" (roster en dur)
}

const GROUPS_KEY = 'ogs.groups.v1'
const ROSTER_KEY = 'ogs.roster.v2'

export function loadGroups(): SavedGroup[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]')
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (g) => g && typeof g.name === 'string' && typeof g.hash === 'string',
      )
    }
  } catch {
    // registre vierge
  }
  return []
}

export function saveGroups(groups: SavedGroup[]): void {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
  } catch {
    // tant pis
  }
}

/** Signature du groupe actuellement chargé (null si rien à enregistrer). */
export function currentGroupHash(roomId: string | null, ids: number[]): string | null {
  if (roomId) return `r=${roomId}`
  if (ids.length > 0) return `g=${ids.join('.')}`
  return null
}

/** Bascule vers un autre groupe : reset du roster local (sinon les groupes
 *  fusionneraient à l'union, et un vieux roster écraserait le salon en LWW),
 *  puis rechargement sur le hash cible. */
export function switchToGroup(hash: string): void {
  const m = hash.match(/^g=([\d.]+)$/)
  const ids = m
    ? m[1]
        .split('.')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
    : []
  try {
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify({ ids, t: ids.length > 0 ? Date.now() : 0 }),
    )
    localStorage.removeItem('ogs.absent.v1')
    localStorage.removeItem('ogs.focus.v1')
  } catch {
    // au pire, l'union fera son œuvre
  }
  location.hash = '#' + hash
  location.reload()
}
