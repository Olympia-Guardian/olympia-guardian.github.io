// Suggestions reçues : quelqu'un d'un de mes groupes online propose un objet
// pour un de mes persos vérifiés. La cloche de la barre du haut porte le
// compte ; accepter coche réellement l'objet.

import { useCallback, useEffect, useRef, useState } from 'react'
import { invalidateCharacter } from './api'
import { apiListSuggestions, apiResolveSuggestions, type ApiSuggestion } from './groupsApi'

const POLL_MS = 90_000

export function useSuggestions(token: string | null) {
  const [list, setList] = useState<ApiSuggestion[]>([])
  const tokenRef = useRef(token)
  tokenRef.current = token

  const refresh = useCallback(async () => {
    const tok = tokenRef.current
    if (!tok) {
      setList([])
      return
    }
    try {
      setList((await apiListSuggestions(tok)).suggestions)
    } catch {
      // hors-ligne : on garde l'état courant
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [token, refresh])

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  /** Accepte (coche l'objet) ou refuse un lot de suggestions. */
  const resolve = useCallback(
    async (ids: number[], accept: boolean) => {
      if (!tokenRef.current || ids.length === 0) return
      const affected = new Set(list.filter((s) => ids.includes(s.id)).map((s) => s.charId))
      await apiResolveSuggestions(tokenRef.current, ids, accept)
      // Les fiches concernées changent (compteurs) : on invalide leur cache.
      for (const charId of affected) invalidateCharacter(charId)
      await refresh()
    },
    [list, refresh],
  )

  return { list, count: list.length, refresh, resolve }
}
