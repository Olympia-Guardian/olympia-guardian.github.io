// La cloche : suggestions reçues, demandes d'ami et invitations directes de
// groupe — le tout servi par UN appel /inbox, poll 90 s + synchro au retour
// sur l'onglet. Accepter une suggestion coche réellement l'objet.
//
// Suggestions envoyées : tant que le destinataire n'a pas tranché, l'objet
// apparaît « coché » de MON côté dans les collections (un refus le décoche).

import { useCallback, useEffect, useRef, useState } from 'react'
import { invalidateCharacter } from './api'
import { etatLive } from './live'
import {
  apiInbox,
  apiResolveSuggestions,
  apiRespondContact,
  apiRespondGroupInvite,
  type ApiFriendRequest,
  type ApiGroupInvite,
  type ApiSuggestion,
} from './groupsApi'

const POLL_MS = 90_000
/** Quand le direct est CONNECTÉ, le poll n'est qu'un filet : dix minutes
 *  suffisent. À 90 s en permanence, quatre-vingts pour cent des requêtes du
 *  worker étaient des sondages qui ne rapportaient rien — le WebSocket avait
 *  déjà tout dit. 90 s ne reste la cadence que socket mort. */
const POLL_DIRECT_MS = 600_000

/** Clé d'une suggestion dans les vues : perso:collection:objet. */
export function suggKey(charId: number, kind: string, itemId: number): string {
  return `${charId}:${kind}:${itemId}`
}

export function useInbox(token: string | null) {
  const [list, setList] = useState<ApiSuggestion[]>([])
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [friendRequests, setFriendRequests] = useState<ApiFriendRequest[]>([])
  const [groupInvites, setGroupInvites] = useState<ApiGroupInvite[]>([])
  // Vrai après la première réponse serveur : avant, `sent` est vide par défaut
  // et ne doit pas être pris pour « plus aucune suggestion en attente ».
  const [sentLoaded, setSentLoaded] = useState(false)
  const tokenRef = useRef(token)
  tokenRef.current = token

  // L'heure de la dernière lecture, par n'importe quel chemin : le poll, le
  // retour d'onglet, ou l'événement du direct qui appelle refresh().
  const derniereLecture = useRef(0)

  const refresh = useCallback(async () => {
    const tok = tokenRef.current
    if (!tok) {
      setList([])
      setSent(new Set())
      setFriendRequests([])
      setGroupInvites([])
      setSentLoaded(false)
      return
    }
    try {
      const box = await apiInbox(tok)
      derniereLecture.current = Date.now()
      setList(box.suggestions)
      setSent(new Set(box.sent.map((s) => suggKey(s.charId, s.kind, s.itemId))))
      setFriendRequests(box.friendRequests)
      setGroupInvites(box.groupInvites)
      setSentLoaded(true)
    } catch {
      // hors-ligne : on garde l'état courant
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [token, refresh])

  useEffect(() => {
    const timer = setInterval(() => {
      // Onglet caché : le retour sur l'onglet resynchronise déjà.
      if (document.hidden) return
      if (etatLive.connecte && Date.now() - derniereLecture.current < POLL_DIRECT_MS) return
      void refresh()
    }, POLL_MS)
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

  /** Accepte ou refuse une demande d'ami. */
  const respondFriend = useCallback(
    async (userId: string, accept: boolean) => {
      if (!tokenRef.current) return
      await apiRespondContact(tokenRef.current, userId, accept)
      await refresh()
    },
    [refresh],
  )

  /** Accepte (avec le perso choisi) ou décline une invitation de groupe. */
  const respondInvite = useCallback(
    async (groupId: string, accept: boolean, charId?: number) => {
      if (!tokenRef.current) return
      await apiRespondGroupInvite(tokenRef.current, groupId, accept, charId)
      await refresh()
    },
    [refresh],
  )

  return {
    list,
    sent,
    sentLoaded,
    friendRequests,
    groupInvites,
    count: list.length + friendRequests.length + groupInvites.length,
    markSent,
    refresh,
    resolve,
    respondFriend,
    respondInvite,
  }
}

/** Ancien nom conservé : la cloche a grandi mais l'App n'a pas à le savoir. */
export const useSuggestions = useInbox
