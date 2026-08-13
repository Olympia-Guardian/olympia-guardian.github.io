// Suggestions reçues : quelqu'un d'un de mes groupes online propose un objet
// pour un de mes persos vérifiés. La cloche de la barre du haut porte le
// compte ; accepter coche réellement l'objet.
//
// Suggestions envoyées : tant que le destinataire n'a pas tranché, l'objet
// apparaît « coché » de MON côté dans les collections (un refus le décoche).

import { useCallback, useEffect, useRef, useState } from 'react'
import { invalidateCharacter } from './api'
import {
  apiListSentSuggestions,
  apiListSuggestions,
  apiResolveSuggestions,
  type ApiSuggestion,
} from './groupsApi'

const POLL_MS = 90_000

/** Clé d'une suggestion dans les vues : perso:collection:objet. */
export function suggKey(charId: number, kind: string, itemId: number): string {
  return `${charId}:${kind}:${itemId}`
}

export function useSuggestions(token: string | null) {
  const [list, setList] = useState<ApiSuggestion[]>([])
  const [sent, setSent] = useState<Set<string>>(new Set())
  // Vrai après la première réponse serveur : avant, `sent` est vide par défaut
  // et ne doit pas être pris pour « plus aucune suggestion en attente ».
  const [sentLoaded, setSentLoaded] = useState(false)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const refresh = useCallback(async () => {
    const tok = tokenRef.current
    if (!tok) {
      setList([])
      setSent(new Set())
      setSentLoaded(false)
      return
    }
    try {
      const [mine, out] = await Promise.all([
        apiListSuggestions(tok),
        apiListSentSuggestions(tok),
      ])
      setList(mine.suggestions)
      setSent(new Set(out.sent.map((s) => suggKey(s.charId, s.kind, s.itemId))))
      setSentLoaded(true)
    } catch {
      // hors-ligne : on garde l'état courant
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [token, refresh])

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS)
    // Retour sur l'onglet : synchro immédiate plutôt qu'attendre le poll.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  /** Marquage optimiste d'une suggestion tout juste envoyée (ou son annulation). */
  const markSent = useCallback((charId: number, kind: string, itemId: number, on: boolean) => {
    setSent((prev) => {
      const next = new Set(prev)
      if (on) next.add(suggKey(charId, kind, itemId))
      else next.delete(suggKey(charId, kind, itemId))
      return next
    })
  }, [])

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

  return { list, count: list.length, sent, sentLoaded, markSent, refresh, resolve }
}
