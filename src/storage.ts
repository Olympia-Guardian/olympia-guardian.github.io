// Accès au stockage local qui ne fait jamais tomber l'application.
//
// En navigation privée, avec les données de site bloquées, ou quand le quota
// est atteint, `localStorage` EXISTE mais lève à la première lecture comme à
// l'écriture. Un seul accès non protégé suffisait à donner une page blanche,
// sans message, sur ces navigateurs. Toutes les préférences passent donc par
// ici : l'app perd sa mémoire entre deux visites, mais elle fonctionne.

export function lsGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // stockage plein, refusé ou indisponible : on continue sans mémoriser
  }
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // rien à retirer si le stockage ne répond pas
  }
}

/** Clés présentes, ou liste vide si le stockage est inaccessible. */
export function lsKeys(): string[] {
  try {
    return Object.keys(localStorage)
  } catch {
    return []
  }
}
